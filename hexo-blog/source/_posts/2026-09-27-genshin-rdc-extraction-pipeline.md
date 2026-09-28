---
title: "截帧提取管线(RenderDoc → 引擎资产)"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-28T20:56:00+08:00"
permalink: 2026/09/27/genshin-rdc-extraction-pipeline/
categories:
  - 图形学
tags:
  - astra
  - 技术文档
  - 渲染架构
---

> 由 astra 生成 · 首次发布于 2026-09-27 18:44 · 最近整理于 2026-09-28 20:56（北京时间）

> 2026-09-05 更新。记录从 RenderDoc 截帧(.rdc)提取原神角色**网格 + UV +
> 贴图 + 常量**并接入引擎的完整流程。当前产物为
> `Assets/model/gi_marionette_official/`（官方 7.0 解包网格/贴图 + 截帧
> shader 状态）。接新角色时按此流程走,只换截帧和资产名。

## 0. 为什么从截帧拿

MMD/aplaybox 转换资产的 UV0 是按部件分贴图的布局,与游戏 UV 图集**不兼容**;
官方 ILM/diffuse-alpha 掩码/脸 SDF/法线全部对不上,渲染侧只能打补丁
(ilm.g 钉值、alpha-0 副本、SDF 重生成——见 AGENTS.md gi 条目)。截帧里的
顶点缓冲是游戏原始数据:游戏 UV(含脸部 UV1 面盘)、顶点色 AO、正确的
逐部件贴图绑定,拿到后所有补丁关闭(`gi_gameuv=1`)。

<!-- more -->

## 1. 工具

- **qrenderdoc 无头 python**:`"/c/Program Files/RenderDoc/qrenderdoc.exe" --python <script>`
  嵌入式 py36,**无 numpy/PIL**,二进制用 struct/array。
  现成脚本(tmp/):`rd_light_dump.py`(cb/纹理转储)、`rd_light_dis.py`
  (shader 反汇编)、`rd_postvs.py`(VS 输出)、`rd_final.py`(最终帧/RT 快照)、
  `extract_mesh.py`(VB/IB 提取)。
- API 坑(全部踩过,直接照抄):
  - 常量块/纹理/RT 取资源 id:`getattr(c,'resourceId',None) or getattr(c.descriptor,'resourceId',None) or getattr(c.descriptor,'resource',None)`(不同对象字段名不一致)
  - 纹理存 PNG:`rd.TextureSave()` + `destType=rd.FileType.PNG` + `mip=0` + `slice.sliceIndex=0` → `controller.SaveTexture(sd, path)`(BC7 直接解码)
  - 反汇编:`controller.DisassembleShader(rd.ResourceId.Null(), st.GetShaderReflection(stage), '')` 返回**整段字符串**(不是行列表)
  - cb 转储:`st.GetConstantBlocks(stage)` → `controller.GetBufferData(rid,0,0)` → struct 解 float4,按 `[idx] x y z w` 写文本
  - 脚本末尾 `import os; os._exit(0)` 防挂死;日志写文件(print 会丢)
- **本地 python**:`tmp/venv/Scripts/python.exe`(numpy+PIL,无 scipy)

## 2. 定位角色 draw

让用户(或 RenderDoc UI)给出角色 draw 的 eid 列表。桑多涅实机帧
(muou_light.rdc):eid 10381-10774 是角色。按 **(VB,IB) 对去重**——同一网格
会出现多次(阴影 depth pass、描边 pass、透视变体 pass):

| 唯一网格 | 索引数 | VB 布局 | 部件 |
|---|---|---|---|
| 大网格共享 VB(71913 stride 48 / 71651 stride 16,IB 71916 u32 按 indexOffset 分段) | 123369 | VB0: POSITION f32x3@0, NORMAL f32x3@16(+28B 杂项);VB1: COLOR rgba8unorm@0, UV0/UV1 f16x2@4/8, UV2 f16x2@12 | body |
| 同上 | 86766 | 同 | hair |
| 同上 | 33903 / 18813 / 29298 | 同 | body01 部件×3 |
| 同上 | 19842 | 同 | 发饰(出现 4 次=4 个 pass) |
| 独立 VB(71639 s40 / 57166 s28,IB 57167 u16) | 10620 | VB0: POS@0,NORM@12;VB1: COLOR@0,**UV0 f32x2@4,UV1 f32x2@12(面盘),UV2@20** | upper_face / Face_Eye |
| 独立(76966 s40 / 57161 s12) | 3882 | VB1 只有 UV0 | lower_face / Face |
| 独立(73746 s24 / 59815 s12) | 1608 | VB0 POS@0+NORM@12;VB1 COLOR@0+UV0 f32@4 | pupil(瞳孔) |
| 独立(71637 s24 / 59800 s12) | 144 | 同 | brow |
| 36 索引平片 | 36 | 退化件,跳过 | — |

- `action.numIndices/indexOffset/vertexOffset` 是 RenderDoc 解析好的 indirect
  参数,直接读。
- **VB 里是逐 draw 的骨骼锚点局部坐标**,不是绑定姿态全身坐标!local→world
  矩阵在该 draw 的 VS 常量块里(10-float4 的小 cb:行 0-3 = 矩阵,行 4-6 =
  法线旋转;大网格在 cb2,个别 draw 在 cb0——按"唯一 10-float4 文件"识别)。
  组装时逐 draw 应用。

## 3. 组装 glTF(tmp/build_gltf.py)

1. 解析 VB/IB → 每 draw 一个 primitive;属性 POSITION/NORMAL/TANGENT/
   COLOR_0(rgba8 normalized,**r=AO**)/TEXCOORD_0..2(f16→f32)。
2. 直接截帧几何的坐标系:Unity(LH)→ glTF(RH)= **X 取反 + 三角形绕序翻转**(normal/
   tangent 同步);再绕 Y 旋转使面朝 +Z(用脸 primitive 平均法线 xz 分量算
   角度,桑多涅 = 27.04°);平移:脚底 y=0、xz 居中。游戏单位=米,不用缩放。
3. 材质命名(引擎自动接线按子串匹配):upper_face/lower_face/brow/pupil/hair/body/
   body01。albedo 配对用**像素级比对**(提取的逐 draw PS t2 PNG vs 官方包
   `*_Tex_*_Diffuse.png`,MSE=0 命中),不要相信猜的。
4. 把官方数据图拷进资产目录(引擎按文件名自动接线):FaceSDF(用
   **官方原版**,备份在 gi_marionette/FaceSDF_official_reference.png)、
   Body/Body01/Hair_Lightmap、Body/Hair_Shadow_Ramp、Body/Hair_Normalmap、
   Body_Detail、Face_Region、Face_EnvProbe、Face_Mask、Face_Diffuse、
   Pupil 全套。
5. 当前官方 Mesh JSON 路径由 `tmp/build_full_official.py` 直接保留源坐标和经
   法线验证的源绕序；Face / Face_Eye / Brow / Pupil 不做部件级翻转或双面特例。
   截帧四个关键 draw 均为 Back Cull；D3D11 `frontCCW=true` 与 Peanut 变换后的
   `frontCCW=false` 是坐标/投影奇偶性的对应关系，不应按 style 或部件改绕序。
6. Pupil 变换回公共头部空间只有约 `0.155 mm` 误差，保持官方原始位置。
   Face_Eye 也保持 bind 顶点、不烘焙眼睑 morph；运行时面部 VS 按大世界
   10433 的规则折叠 `UV2.x > 0.05` 的 589 个可见性标记顶点。

## 4. 引擎接线(已实现,接新角色时只需确认)

- `WireGenshinTextures`(AssimpModelLoader.cpp):目录含
  `Avatar_Girl_Tex_FaceSDF` 或 `*_Tex_Body_Lightmap` → 全部材质 gi=1;
  diffuse 路径含官方命名(`_tex_` + `_diffuse`,大小写不敏感)→
  **giGameUv=1**(关闭 MMD 替代:ilm.g 钉值 / 脸 lightmap UV0 路径);
  脸分支 lightmap 槽 = 官方 Face_Diffuse(shader 走 UV1 面盘);
  pupil → `gieye=1`(眼部专用 shader);lower_face/brow → `gilash=1`
  (截帧 Base_Uber PS 75685)。
- 头发/10381 Stockings → `giBody`；10491 Dress → `giDress`；10503
  Dress01 → `giDress01`。Dress01 使用 Body01 的 ILM/normal/diffuse，三类均复用
  Body shadow ramp 与 specular ramp；Dress 两个变体还把 `Avatar_Tex_MetalMap`
  接到捕获 t4 对应的辅助纹理槽。

## 5. shader 与截帧的关系

反汇编与常量 dump 是事实依据，运行时 shader 则逐步改写为具名语义代码。
`GenshinCharacterLighting.hlsli` 当前承载 FaceSDF、ILM authored occlusion 与
toon terminator，身体 shader 另以具名结构实现 shadow-ramp 采样；尚未迁移的
复杂眼部/高光/rim 分支仍保留寄存器名和 asm 行号，直到有逐阶段 RT 对照证明
等价。注意:

身体运行时路径当前的语义边界如下：

- `GiClassifyBodyRegion`：从 ILM.a 与区域门控得到 region 1–5；
- `GiDecodeBodyTangentNormal` / `GiBuildBodyTangentFrame`：解码 RG normal，
  从位置与 UV 导数重建 TBN；
- `GiEvaluateBodyDetailNormal`：重编译 DXBC 并在 RDC 回放替换后确认 10381 与
  10491/10503 都按 A/RG 解释 detail map。官方 `Body_Detail` 与截帧 t3 SHA-256
  一致，因此 Dress 路径已启用 detail normal；
- `GiEvaluateIlmTerminator` / `GiSampleBodyShadowRamp`：组合 ILM.g、顶点 AO、
  half-Lambert，并采样对应区域的昼夜 ramp；
- `GiEvaluateBodyRegionLighting` / `GiEvaluateBodySpecularBands`：选择区域参数，
  生成 ramp diffuse、阈值 specular 与双带高光。

这些函数的输入输出与常量均使用材质语义命名；原始 `Bxxx` 行号只作为注册表
兼容别名保留。2026-09-05 固定场景同进程热重载 A/B 中，排除独立的
眼睛时间动画区域后，身体与头发输出逐像素完全一致。

Dress 不能用 `giBody` 加少量参数覆盖代替：10491/10503 的 VS/PS cb0 从 185
附近起比 10381 多一行，且 PS 明确接收 `SV_IsFrontFace`。运行时
Dress 语义运行时复用已经验证的分区/ramp/spec 计算，但单独恢复：

- 背面按捕获常量选择 TEXCOORD1，并翻转几何法线；正面使用 TEXCOORD0；
- Dress 专用常量布局（而非把 Dxxx 当 Bxxx 读），包括 region-5 gate、rim、
  detail-mask 与 sparkle 参数；
- 10491/10503 各自的 sparkle shape/color，以及 shader 内原本写死的相机 XY
  距离倍率 2/3。其余指令完全相同，故共用一份语义 shader、两个 style 默认块。

- **菜单帧和大世界帧是不同 shader 变体**(脸部 SDF 带结构都不同:菜单
  tanh/smoothstep,实机 sigmoid + cb0[320..322] 子带)。以实机帧为准。
- cb0282/cb0270= 角色关键光方向。大世界 10416 与 10433 的
  face primary/fallback 向量和 post-VS `o9` 完全相同；`gi` 参数块必须取
  10433，不能混入菜单/旧 shader 变体的常量。Body、Dress、Hair、Eye 的捕获
  primary/fallback key light 虽有不同水平角，但 `Y` 都是 `0.573578`：运行时先把
  UE 风格传播方向 `D` 转为指向光源的 `L=-D`，再只用 `L.xz` 更新方位角并恢复
  捕获固定仰角后馈入 `lightDirBent`。不能把编辑器 Pitch 直接带进角色
  half-Lambert/ramp；点光源仍使用完整三维方向。
- 截帧的脸 SDF 基向量 `o9` 使用完整四分量公式：先把 world-space 光投影到
  当前 instance/node 的 model-space down/forward/side 轴，再分别归一化 yz 与 xy。
  `o9.xy` 驱动主 SDF，`o9.zw` 驱动可选 detail band；不能用固定 zw 或只保留
  right/forward 的二分量近似。捕获常量 `faceSdfControls.y=-1` 是该帧已经决定的
  SDF 半边，接入实时方向光后必须重新按 `o9.y` 选边，否则左右旋转不会响应。
  捕获几何已烘焙 mirror-X，因此截帧的 `+X` face-side 轴在模型空间中是 `-X`；
  仍不能把截帧 actor 的世界旋转固化进运行时矩阵。`D=+X/-X` 双角色 A/B 必须让
  FaceSDF 的亮侧与普通表面和 ZZZ 角色保持一致。
- 脸 SDF 始终采 VS `o12.xy`（UV0）；Face_Diffuse/lightmap 才由
  `cb0[185].y` 选择 `o12.zw`（UV1）。两次 SDF 采样混用 UV0/UV1 会形成
  单侧块状脸影。
- Face_Eye 的几何不是纯矩阵路径：10433 VS asm 17–23 在本帧把
  `UV2.x > 0.05` 的顶点折叠到模型原点。输入→post-VS 逐顶点验证从
  `0.215` clip 最大误差降至 `2.34e-7`；遗漏该步骤会让上半脸先写深度并
  完全遮住后画的 Pupil。
- t2 是 `Avatar_Tex_Eye_BlendShape_Diffuse` 表情图集，不是环境探针。
  中性大世界帧 `cb0[186].w=0`，原 DXBC 的 `if_z` 跳过整个图集分支；绑定
  资源但错误执行该分支会把闭眼/wink 瓦片画到脸上。
- 脸 SDF 贴图 **alpha 必须保留**(官方图 31.6% 非零):s=(a>1e-4)?(a+1)/2:r/2,
  alpha=255 会把 s 钉死在 1(永远受光)。
- 脸底色、睫毛底色和眼贴图在截帧里是 **sRGB view**，引擎按 UNORM
  加载 → 对应 shader 内显式做 sRGB→linear，alpha/遮罩/SDF 保持数据域。
  官方 PNG 垂直翻转后再解码，与截帧导出纹理的 8-bit MSE 约 0.1。
- 游戏输出 LDR sRGB 字节(o1=RGBA8_SRGB):引擎侧 `pow(saturate(c),2.2)`
  预编码 + 合成走线性 tonemap(`render.post.tonemap_aces=0`)。
- 身体/脸的当前大世界 draw 均未绑定 Peanut SSAO 或 shadow-map 等价资源；身体
  的 AO/终结者来自 ILM.g × vertexColor.r。本帧 shader 中虽有解析阴影平面代码，
  捕获常量却使有效平面输入关闭。动态自阴影必须作为后续明确资源/常量合同实现，
  不应混进 ILM 解码或场景 deferred lighting。
- 2026-09-06 衣服 A/B 继续遵守角色 forward 边界：关闭 FXAA、Bloom、SSAO、
  SSGI 后直接检查 `sceneHDR`。切回 `giBody` 会产生 Stockings_New 的错误闪光与
  错位材质响应；`giDress/giDress01` 恢复各自捕获参数后，裙摆分区、背面和金属
  饰边保持稳定。SSAO/SSGI 开关不改变角色 shader 输出。

## 6. 管线边界与分阶段图形验证（必须）

大世界截帧必须先按对象类型拆开：**场景走完整 deferred，角色走 forward**。
角色 draw 10381–10774 已在材质 PS 内完成照明并直接写 SceneColor，同时输出
若干供角色后处理识别的辅助 RT；这些辅助 RT 不是让角色进入 deferred lighting
的材质 GBuffer。

场景的 deferred lighting 位于 21390–21621。已核验的 21453、21493、21536、
21582、21621 均为全屏三角形，PS 名为 `Hidden/Internal-DeferredShading`，读取
TempBuffer 138–143 等场景 GBuffer、环境 BRDF、局部光/阴影资源，并写回
`InnerTarget of MainCamera(Clone)`。角色已在更早的 forward 阶段着色，不由这段
lighting 重新计算。

角色 forward 阶段仍同时写 6 个 MRT：

| 截帧输出 | 格式 | 已确认语义 | Peanut 当前对应 |
|---|---|---|---|
| RT0 | R10G10B10A2 | 角色后处理方向/法线，alpha 含区域标志 | `gnormal.xyz`（编码和 alpha 尚不等价） |
| RT1 | R8G8B8A8 sRGB | 角色 forward SceneColor（含 o1 alpha） | `sceneHDR` |
| RT2 | R8G8B8A8 | 角色后处理辅助着色/rim 变体 | 无 |
| RT3 | R8 | 角色材质 ID（body/hair=4，face=22，eye=21） | 无；仅 DSV stencil 近似承载类别 |
| RT4 | R8 | 角色后处理辅助遮罩 | 无 |
| RT5 | R8 | 眼部/变体 nibble（10567 为 15） | 无 |
| DSV | D32S8 | reverse-Z 深度 + 模板分层 | `depth` |

所以验证必须按生产者/消费者拆开，不能先拿最终截图调 shader：

1. **场景 deferred**：先比较 geometry 后的场景 GBuffer，再比较
   21390–21621 lighting 后的 SceneColor；两者不能混成一次最终图差分。
2. **角色 forward**：在相同角色 draw 前后分别比较 RT1/`sceneHDR`，并独立比较
   RT0、RT2–5、depth/stencil 的覆盖与 ID；后者的定位是后处理输入，不称为角色
   GBuffer lighting 输入。

### 6.1 RDC shader replacement 门禁

Peanut 截图只用于集成后的第二层验证。语义改写进入运行时前必须先在原 RDC 中
证明等价：

1. 从 `ShaderReflection.rawBytes` 导出目标 DXBC，用 3Dmigoto
   `cmd_Decompiler -D` 得到可重编译基线；
2. 用 RenderDoc `BuildTargetShader` 编译候选 HLSL，`ReplaceResource` 替换原 PS；
3. 在同一 event 读取替换前后所有有效 MRT 的原始资源字节；任何非零差异都要先
   解释，不能用 PNG 量化结果或 Peanut 最终图“看起来接近”代替；
4. 每次只迁移一个语义块并重复替换测试；全部 MRT 通过后，最后才接 Peanut 的
   动态相机、方向光、资源布局与输出域适配。

仓库内门禁工具：

```powershell
./Peanut/tools/Invoke-RdcShaderReplacementValidation.ps1 `
  -Capture D:/Capture/muou_light.rdc `
  -EventId 10491 `
  -Stage Pixel `
  -Shader path/to/candidate.hlsl
```

脚本会替换该 event 的指定 shader stage，并逐个比较所有有效 render target；任一
`differentBytes` 非零都会以失败退出。失败报告同时记录 `maxByteDelta` 和首批
差异字节的 offset/原值/替换值，便于把误差定位到像素与通道。候选含 `#include` 时可重复传入
`-IncludePath`。VS 使用同一命令并指定 `-Stage Vertex`；VS 门禁同样比较该 draw
最终写出的全部 MRT，不能只比较 clip-space position。

已经完成门禁的完整语义源码保存在 `Docs/genshin-rdc/semantic/`。这些文件使用
具名 cbuffer 字段、阶段结构和算法函数，不保留 `r0`/`r1` 或 `cb0[n]` 式临时
寄存器流；它们是 RDC 内的等价参考实现，不直接复用 Peanut 的运行时资源布局。

2026-09-06 基线：10491、10503 的反编译 HLSL 重编译替换均为 0 differing pixels；
其中 10491 / PS 75688 与 10503 / PS 75689 已进一步完成整份像素着色器语义化。
两份捕获的 DXBC 只有 sparkle 相机 XY 距离倍率（2 与 3）不同，因此
`Dress01PixelShader.hlsl` 通过显式变体宏复用 `DressPixelShader.hlsl`，不复制
整份实现。双面 UV、ILM 分区、
normal/TBN、detail normal、toon terminator、metal、区域 ramp/specular、菲涅耳与
rim、sparkle、角色阴影平面以及六 MRT 编码均改成具名阶段；正式参考源码为
`semantic/DressPixelShader.hlsl` 与 `semantic/Dress01PixelShader.hlsl`，分别替换
后 RT0–RT5 原始字节全部为 0 differing bytes。该门禁同时纠正了三处旧推导：
detail map 实际为 A/RG，不是 R/RB；
signed-square 是 `dp2(centered.xx, abs(centered.xx))`，系数为 2；分层镜面乘的
是计算后的距离衰减，而不是相机距离平方。Peanut 的 Body、Hair 与 Dress sparkle
阶段现分别和 RDC 参考 shader 共用 `GenshinBodySparkle.hlsli`、
`GenshinHairSparkle.hlsli`、`GenshinDressSparkle.hlsli`：运行时只适配相机、时间、
贴图和输出绑定，算法不再另写近似版本。10397 与 10595 的不透明发丝 draw 均路由
到 Hair 专用变体；10609 使用独立的语义透明 pass。Peanut 的角色材质运行时现已
直接承载这些语义核心，仅在边界适配相机、时间、动态主光、贴图槽和两目标输出。

动态灯光适配不进入上述 RDC 无损语义核心。捕获语义输出保留游戏的材质分带、
FaceSDF、ramp 与高光运算顺序；DX12 输出边界再乘 Peanut 的运行时光照辐亮度：
`ambient + directional.color * directional.intensity / pi`。关闭方向光时，顶点阶段
与像素输出都一致回退到第一个点光源；没有可用灯光时仅保留材质 emissive。
`1 / pi` 与 Peanut PBR 的漫反射单位一致，也让项目默认 `3.14` 主光强度约等于
参考亮度，而不需要角色专用强度常量。

方向适配同样只发生在 DX12 边界：引擎传播方向 `D` 先转为 `L=-D`，然后保留
运行时 Yaw，并用各 shader family 的 primary/fallback 捕获向量恢复固定仰角；
Face 的预计算 half-Lambert 也在边界用该方向重建。0° 与 75° Pitch、相同 Yaw
的编辑器 A/B 已确认角色分带一致。

截帧方向向量处于 Unity capture world，不能原样当成已烘焙 glTF 的 Peanut world。
复现参考帧时须对 `L` 同样执行资产的 mirror-X + Ry(27.040434°) 变换；本帧
`(-0.784774, 0.573578, 0.234815)` 对应模型空间约
`(0.592236, 0.573578, 0.565920)`。运行时用户输入本来就在 Peanut world，不能再做
这次资产离线变换。

2026-09-13 在 `gi_marionette` 固定场景完成运行时 A/B：主光 `+X`、`-X`、红光与
无光的 SceneHDR 输出分别为 `49140ee067285f397ec117d27315214d`、
`90a31ab7f349c8024b2df9ded05f0d7d`、`2951ca39f4793644e401a1d762e2483e`、
`1bd75a7de7fb98cdac89e391c9dab3ac`。目视确认方向改变 FaceSDF/toon 分界，红光
改变完整角色辐亮度，无光得到黑色非 emissive 轮廓。角色 sparkle 受运行时间驱动，
因此这些哈希只记录本次 A/B 输出，不作为跨帧确定性门禁。

同日把门禁扩展到大世界角色区间的代表 draw：

| 部件 | event / PS | 可重编译基线 | 已通过的语义块 | Peanut 状态 |
|---|---|---|---|---|
| Body | 10381 / 75683 | RT0–RT5 零差异 | 完整 PS 75683 + VS 64860 语义源码，六 MRT 零差异 | `giBody` 已接语义运行时 |
| Hair | 10397 / 75684 | RT0–RT5 零差异 | 完整 PS 75684 + VS 64863 语义源码，六 MRT 零差异 | `giHair` / `giHairBang` 已接专用语义运行时 |
| lower_face | 10416 / 75685 | RT0–RT5 零差异 | 完整 PS 语义源码 + VS 64865，六 MRT 零差异 | `gilash` 已接 Base_Uber 语义运行时 |
| upper_face | 10433 / 75686 | RT0–RT5 零差异 | 完整 PS 语义源码 + VS 64868，六 MRT 零差异；表情图集分支本帧未激活 | `gi` 已接 expression 语义运行时 |
| Body01 / Crystal | 10466 / 75687 | RT0–RT5 零差异 | 完整 PS 75687 + VS 64817 语义源码，六 MRT 零差异 | 已接独立 `giBodyCrystal`；Cube PNG 通过二维方向投影适配 |
| Dress | 10491 / 75688 | RT0–RT5 零差异 | 完整 PS 75688 + VS 64863 语义源码，六 MRT 零差异 | `giDress` 已接专用语义运行时 |
| Dress01 | 10503 / 75689 | RT0–RT5 零差异 | 完整 PS 75689 + VS 64863 语义源码，六 MRT 零差异 | `giDress01` 已接专用语义运行时 |
| Brow | 10523 / 75685 | RT0–RT5 零差异 | 与 10416 相同的完整 PS/VS 语义源码再次验证为零差异 | `gilash` 已复用 Base_Uber 语义运行时 |
| Pupil | 10567 / 75690 | RT0–RT5 零差异 | 完整 PS 75690 + VS 72810 语义源码，六 MRT 零差异 | `gieye` 已接语义运行时 |
| Hair blend | 10609 / 75699 | RT0–RT5 零差异 | 独立常量布局、眼区模板 blend、完整六 MRT 语义源码均零差异 | `giHairBlend` 已接独立语义运行时 |
| 附加角色 pass | 10701 / 10764 / 10774，PS 75700 | 三次均 RT0–RT5 零差异 | 完整 PS 75700 + VS 64873 语义源码，三次六 MRT 均零差异 | 待接线核对 |

VS 可重编译基线也已逐 family 验证：10381/64860（Body）、10397/64863
（Hair/Dress）、10416/64865（lower_face/Brow）、10433/64868（upper_face）、
10466/64817（Body01）、10567/72810（Pupil）、10701/64873（附加 pass）均为
RT0–RT5 零差异。64865、64868、64873 的反编译 HLSL 存在“部分输出未初始化”
编译警告，但实际 draw 的全部 MRT 原始字节仍一致；后续语义化不能删除这些
未初始化通道，除非先证明它们不被 rasterizer 或后续 pass 消费。此后全部七个
VS family 都已完成无寄存器流的语义改写并再次通过：64860、64863、64865、
64868、64817、72810、64873。64863 还分别在 Hair、Dress、Dress01 三个网格上
复验，64865 在 lower_face 与 Brow 上复验，64873 在三个附加 draw 上复验。
PS 75690 也已完成无寄存器流的语义改写：溶解抖动、虹膜视差追踪、三层动态
贴花、虹膜高光、matcap 法线重建、闪光壳层和六 MRT 打包均改为具名阶段；在
10567 替换后 RT0–RT5 原始字节全部一致。该验证还保留了原始像素输入签名中的
空洞槽位，因为 RenderDoc shader replacement 必须维持 VS→PS 寄存器链接布局。
PS 75688/75689 同样保留了完整输入签名，并完成从 LOD/alpha 裁剪到最终 MRT
打包的全路径无寄存器流改写；语义化过程逐块执行替换门禁，最终正式文件在
10491/10503 上均为六目标逐字节一致。
PS 75683 已完成 Body/Stockings 全路径语义化：五区域 shadow ramp/specular、
metal、detail-rim 回填、两层距离自适应 sparkle、角色阴影平面和 MRT 编码均为
具名阶段；正式文件 `semantic/BodyPixelShader.hlsl` 在 10381 上六目标逐字节一致。
该过程确认 Body sparkle 的最终遮罩来自 normal map B，而不是 ILM alpha。
PS 75684 已完成 Hair 全路径语义化：双面 UV、按区域重排的 normal 通道、发丝
authored occlusion/strand 缩放、两层材质分档 sparkle 以及完整输出合成均为具名
阶段；正式文件 `semantic/HairPixelShader.hlsl` 在 10397 上六目标逐字节一致。
门禁确认启用发丝控制时 authored occlusion 直接取 normal map R，并在低于 0.25
时归零，不能把该通道仅当作 ILM.g 的开关。
PS 75699 已完成 Hair eye-stencil blend 全路径语义化：资源、输入、常量、临时阶段和
MRT 均不再使用寄存器/`cb0[n]` 名；`semantic/HairBlendPixelShader.hlsl` 在 10609
替换后六目标逐字节一致。该变体的额外眼区控制与 75684 常量布局不同，运行时因此
使用独立 shader，而不是以 blend state 包装不透明 Hair shader。
PS 75687 已完成 Body01/Crystal 全路径语义化：基础 toon/metal、可配置 normal
通道、折射方向、投影细节法线、微表面高光、球体校正 cubemap 反射、程序图案、
Fresnel 染色、0–8 混合模式、角色阴影平面和六 MRT 打包均拆为具名阶段；正式文件
`semantic/BodyCrystalPixelShader.hlsl` 在 10466 上六目标逐字节一致。该参考实现证明
Body01 不是普通 Body 常量变体，Peanut 不能继续以 `giBody` 直接复用它。
Peanut 运行时现已注册 `giBodyCrystal`：复用前向角色两目标管线，以独立 PS、Back
Cull 和 66 个具名 `float4` 参数重放 10466 的有效材质阶段；MetalMap、Specular
Ramp、Body Shadow Ramp、Leather Reflectmap、Crystal Cube 与 Crystal Diffuse
均由 `ob_body01.mat.json` 显式绑定。当前解包只保留 Crystal Cube 的 256×256 PNG，
因此 cubemap lookup 在运行时转换为方向到二维纹理的投影；这项适配不影响场景的
延迟光照或角色后处理结构，但仍应在取得六面原始 cubemap 后替换为原生采样。

这里的“可重编译基线”只证明 DXBC 能无损转为可编辑 HLSL，不代表 Peanut 已经
等价。只有“已通过的语义块”可以进入运行时实现。Hair 的首次语义替换曾导致
RT1/RT2 非零，门禁据此确认：硬阴影/硬受光使用发丝修正前的 ILM，连续
terminator 使用发丝修正后的值。修正顺序后六个 MRT 才恢复零差异；因此 Hair
不能继续仅通过材质常量复用 Body shader。
3. **角色后处理**：确认具体 pass 消费了哪些 RT/material ID 后，再比较描边、
   刘海/眼部合成等结果。不能把这一阶段的误差补进角色材质 PS。
4. **最终图像**：只作为合成链回归检查；相机、分辨率、曝光、色域和后处理
   未对齐时禁止用最终像素差反推材质或资产。

2026-09-05 的阶段导出给出了两个直接结论：

- 10595 刘海不透明 pass 修改 RT1 约 12,864 像素；10609 透明 pass 只修改
  眼区 129 像素；10621 不写任何颜色，只更新约 2,445 个模板像素。
- 对应 Peanut 截帧中，不透明 pass 的按比例覆盖合理，但透明 pass 为 0 像素，
  像素历史显示拒绝原因为 `stencilTestFailed`。原帧 10540 会以完全相同的
  Face_Eye post-VS 几何再次通过并把相关像素模板写为 165；Peanut 尚缺这项
  上游模板建区，不能靠 alpha 或放宽 depth func 解决。
- Peanut 尚无 RT2–RT5 等价资源；在这些 RenderGraph 合同补齐以前，只能验证
  已有 normal/depth/stencil 与预 tonemap SceneColor，不能宣称角色后处理对齐。

## 7. 验证循环

```
cd Peanut/build_test/bin/Debug && ./Peanut.exe &          # 启动(先杀干净旧实例!)
./PeanutCli.exe -mode cli -command scene.load -path model/gi_marionette_official/marionette_full_official.gltf
render.setting.set -name render.post.tonemap_aces -value 0
render.setting.set -name render.light.dir_x/y/z -value …  # 菜单参考 D=-0.579,-0.574,-0.579
editor.screenshot -path ./captures/x.png                   # 读 PNG 确认
```

- shader 在启动时编译，也可用事务式 `shader.reload` 热重载；运行目录副本在
  `build_test/bin/Debug/Assets/shader/`，源码改动后要先构建同步再重载。
- **探针调试法**:在 PS 里加 early-out 把中间寄存器输出成颜色(如
  `color = float3(v9.x*0.5+0.5, …)`),比静态读寄存器流可靠;二分定位用
  屏幕左右半各输出一个值(discProj.x/discProj.z > 0 分半)。
- A/B 光照:菜单光 vs 背光 (0.2,0.3,-0.93) vs 侧光 (0.9,0.35,0.25),
  数值 diff 用 venv python + PIL。
- 阶段基准:场景按 GBuffer → 21390–21621 deferred lighting 后 SceneColor
  比较；角色按 forward RT1 → 后处理辅助 RT/DSV 比较。Peanut 侧 RT1 对
  `sceneHDR`，RT0/RT2–5/DSV 对角色后处理输入合同。最终帧
  `tmp/light_frame/frame_final.png` 仅用于整体回归，不作为定位依据。
- 坑:残留编辑器进程占命名管道(CreateNamedPipeW failed 231)→ CLI 打到
  旧实例;config.ini 会被交互和**测试套件**改写(ModelPath 等),异常时先查。

## 8. 已知遗留

- lower_face 与 brow 走截帧 Base_Uber PS 75685 端口（style 历史名仍为
  `gilash`，运行时文件为 `GenshinFaceBaseSemanticPixelShader`）：
  UV0-only 脸 shader 变体(cb0[310],无脸 320–322 子带);贴图同脸族
  (region/Face_Diffuse/Face_Mask/FaceSDF),不走 face UV1/`gi_gameuv`。
  杏仁形主要来自睑壳几何+深度合成,而非对瞳孔做 90° UV 旋转。
- Face/Face_Eye/Brow/Pupil 已按截帧统一 Back Cull；无捕获证据支持单独翻转、
  双面绘制或 Pupil 深度偏移。
- 角色专用 RT2–RT5 尚未进入 Peanut RenderGraph；进一步复刻必须先明确这些
  缓冲的后处理消费者，不能把场景 deferred lighting 或最终图差异直接补进
  角色材质 PS。
- 官方 Bang 为 11,724 索引，而截帧 hair2 为 19,842 索引；透明 pass 当前没有
  通过模板测试的眼区像素。需要先复刻 10540 的 165 模板建区，再以截帧
  hair2 的 post-VS/深度覆盖为基准解决；不能放宽 stencil/depth func 冒充
  原管线。
- 10621 的零颜色写入/模板反转状态已识别，但在 10540 模板建区与对应
  Base_Uber discard 覆盖复刻前不接入运行时，避免生成错误的全刘海模板区域。
- 10787(36 索引 8mm 平片)未收录。
- 官方资产为 bind pose；当前只复现中性大世界帧的 UV2 几何可见性与像素
  分支。表情图集驱动和动态脸部状态仍待从非中性截帧提取参数。
