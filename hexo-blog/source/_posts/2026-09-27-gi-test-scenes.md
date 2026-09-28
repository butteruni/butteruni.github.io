---
title: "GI 测试场景与对比协议"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-28T20:56:00+08:00"
permalink: 2026/09/27/gi-test-scenes/
categories:
  - 图形学
tags:
  - astra
  - 技术文档
  - 渲染架构
---

> 由 astra 生成 · 首次发布于 2026-09-27 18:44 · 最近整理于 2026-09-28 20:56（北京时间）

> 用途:为 SSGI(及后续 GI 方案)提供可复现的验证场景,以 GroundTruth 路径追踪
> (`render.pathtrace`)为基准。每个场景固定:模型、相机、光照、三态截图流程。

## 关键前提:IBL 会掩盖 GI

PBR pass 的 ambient = IBL(diffuse+specular)+ SSGI 注入。默认 `render.ibl.intensity=1`
时天空盒 IBL 淹没一切间接光差异——**Cornell 盒子里 SSGI 开/关肉眼无差别**就是
这个原因(2026-08-01 实测)。做 GI 对比必须先把 IBL 压到 0:

<!-- more -->

```
render.setting.set -name render.ibl.intensity -value 0   # SSGI 注入不吃此缩放
```

SSGI 注入项(`ssgiTexture`)不乘 IBL 强度,所以 IBL=0 后 PBR ambient 只剩 SSGI,
对比信号最强。PT 的 skybox 环境采样同样乘 `render.ibl.intensity`(2026-08-04 起,
与光栅同源)。

## 环境光:NV 样例的事实(2026-08-04 查证)

NV 两代样例都**不用环境贴图**,天空是均匀色:
- 1.x TestHarness(`RTXGI-DDGI/samples/test-harness/config/sponza.ini`):
  `skyColor=1 1 1, skyIntensity=0.1`(微弱白色天空);太阳 travel dir (0,-1,0.3)
  power 3.14;曝光 fstops=1.0;RTAO 开(rayLength 0.25)
- v2 Pathtracer(`NVIDIA-RTX/RTXGI` Samples/Pathtracer):`skyColor=(0.5,0.75,1)`,
  `skyIntensity=8`(较强的蓝色天空)

我们侧对应:`render.sky.uniform=true` 时 SkyboxPass 用均匀 cubemap 替代贴图
天空(色值×强度存 1/2.2 次幂,消费端统一 pow 2.2 解码),`render.sky.color_r/g/b`
+ `render.sky.intensity` 可调,运行时切换自动重跑 IBL 卷积并重置 PT 累积。
config.ini 默认 = 1.x sponza.ini 的值。

## 场景清单

### A. `model/CornellBox/CornellBox-Original.obj` — 经典色彩溢出

- 相机:`camera.orbit_distance.set -value 1.6`(轨道 target 即模型中心,视角正对盒口)
- 看点:红/绿墙向白色背墙、方块的色彩溢出;PT 下背墙呈粉色系
- 注意:盒子内壁间距 ~2,正好顶着 `render.ssgi.max_distance` 默认值的边界,
  SSGI 在此场景先天偏弱;是"SSGI 覆盖不到"的回归用例

### B. `model/gi_test/gi_test.obj` — 受控弹射/间接阴影(程序生成)

- 由 `Assets/model/gi_test/gen_gi_test.py` 生成(6×3×6 无顶房间,红/绿侧墙,
  地面红小方块、白方块、y=1.5 悬浮白板)
- 相机:`camera.orbit_distance.set -value 4.5`
- 看点:红方块→地面的短距离溢出(SSGI 最佳工况,距离 ≪ max_distance=2)、
  悬浮板下方的间接阴影、侧墙→背墙溢出
- 纯 diffuse 材质(Ks=0),单位≈米

### C. `model/sponza/sponza.obj` — 复杂场景

- 相机:`camera.orbit_distance.set -value 5`(中庭,红/绿帷幕 + 柱廊)
- 看点:帷幕色彩溢上石柱/墙面、柱体背光面的反弹填充、拱下间接阴影
- PT 全场景可跑(BVH ~40 万三角形),提速后累积 10s 出可用参考图

### D. `model/ddgi_cornell/cornell_box.gltf` — NVIDIA DDGI 基准(RTGI-Assets)

- 来源:NVIDIA RTXGI-Assets 仓库的 CornellBox(glTF),相机取自其
  `Cornell.scene.json`((0,1,4) fov 40°,实测 (0,1,2.6) 取景更满)
- 灯光(DDGI 演示式):天花板点光 (0,1.35,0) 强度 6 暖白 (1,0.95,0.85),
  方向光关,IBL=0,ambient 0.03;灯光在场景文件 `scenes/ddgi_cornell.json` 里
  (NVIDIA 样例的 Cornell 用天花板自发光面板,我们没有面光源,用点光近似;
  注意其天花板是实体+灯板,太阳照不进来,配方向光无意义)
- 看点:天花板点光下红墙→高盒右面、绿墙→左下角的色彩溢出

### E. `model/ddgi_livingroom/living_room.gltf` — NVIDIA DDGI 室内基准

- 来源:RTXGI-Assets LivingRoom(43MB,150 submeshes);相机取自其
  `LivingRoom.scene.json`((0.19,1.7,7.44))
- 灯光:方向光开,传播方向 D=(0.15,-0.55,-0.8),强度 0.8(窗光);无点光;
  IBL=0,ambient 0.03
  (方向光不进场景文件,import 后按此手动设置;场景文件 `scenes/ddgi_livingroom.json`)
  注:NVIDIA 样例**不用环境贴图**(1.x TestHarness 为均匀白色天空 0.1,v2 为
  均匀蓝色 (0.5,0.75,1)×8,均无环境贴图),用 `render.sky.uniform` 对齐;
  太阳传播方向按各自手性约定，转换到 Peanut 时 z 分量需翻号
- 看点:**窗光天窗场景**——direct 几乎全黑,PT 天窗多次反弹点亮全屋;
  SSGI 结构性失败(窗口亮区太小,半球采样极少命中)——屏幕空间 GI 的
  天然边界,是评估替代方案(探针/RT GI)的对照场景
- PT 累积 ~15s 出参考图

### F. `model/ddgi_sponzaplus/Sponza.gltf` — NVIDIA DDGI 复杂场景基准(**编辑器默认场景**)

- 来源:RTXGI-Assets `SponzaPlus.scene.json`(Khronos glTF Sponza,jpg/png
  贴图;样例另有 2 个 BrainStem 跳舞机器人,动画资产,未引入)。
  Bistro(2.4GB、全 DDS 贴图)超出当前加载管线,不可用
- **启动即此场景**:config `ModelPath` 指向它,sidecar
  `Sponza.gltf.scene.json` 存相机(NV 1.x sponza.ini 的 Upper Floor 机位:
  (7.46,5.07,-0.92) yaw 295 fov 68,z/yaw 按手性换算)+ 空点光数组
  (启动时经 `RestoreStartupScene` 恢复,2026-08-04 起 sidecar 携带相机)
- 灯光:config 默认即 NV 1.x sponza.ini 对齐——太阳传播方向
  D=(0,-1,-0.3)，强度 3.14，
  均匀白色天空 0.1(render.sky.uniform),IBL=1,ambient 0.03,无点光
- **SSGI 参数必须按场景尺度调**:Sponza.gltf 根节点 scale≈0.008,中庭约
  0.12 世界单位。config 默认 `max_distance=1` / `steps=48` / `rays=8`
  (米制未缩放场景再把 max_distance 调回 ~8)。步进过大时间接光几乎为零;
  另含法线偏移防自交、miss 天空填充、时域邻域钳制。
- 已验证(2026-08-16，纯净光照三态):direct 只有直射光斑;SSGI 背墙/帷幔
  被弹射点亮并有蓝/绿/红色溢出;PT 多次反弹全场填充
- 注意:中庭顶部露天;PT 环境采样与光栅 IBL 同源(均乘 `render.ibl.intensity`),
  IBL=0 时两端都无天空光,对比一致

## 光照协议(render.light.* / render.ibl.*)

光照设置已在注册表(2026-08-01 起),运行时 `render.setting.set` 即改即生效
(逐帧重放进 LightManager)。**2026-08-02 起点光源随场景文件携带**(v3/sidecar
的 `lights` 段,`scene.import`/`scene.restore` 整体替换当前点光,上限 4);
`Assets/scenes/gi_*.json` 已各配 2-3 盏彩色点光(DDGI 式多角度传输验证)。
方向光不进文件,仍用下表协议值手动设置。

统一对比光照(突出方向光直射 + 反弹,压掉环境项):

**约定(2026-09-14)**:`render.light.dir_*` / `DirectionalLightDir*` 与 UE 一致，
表示光线从光源射向场景的**传播方向 D**。着色、光追阴影射线和阴影相机统一在
消费边界转换为指向光源的 `L=-normalize(D)`；因此 `dir_y<0` 表示太阳在上方。
NV RTXGI 样例的 travel direction 只需做坐标系手性转换，不再额外取反。
ShadowPass 正交视锥的眼位为 `eye = center - D * 2r`。

```
render.light.dir_intensity = 3.14          # NV 1.x sponza.ini 太阳 power(≈π),颜色纯白 (1,1,1)
render.light.dir_x/y/z     = 0 / -1 / -0.3 # NV travel(0,-1,0.3) 仅 z 翻号
render.light.ambient_r/g/b = 0.0           # NV 无恒定环境项(仅 Forward/PT 用,PBR 不读)
render.sky.uniform         = true          # 均匀天空(NV 样例无环境贴图)
render.sky.color_r/g/b     = 1.0           # 1.x:白色;v2 蓝色天空则 0.5/0.75/1.0
render.sky.intensity       = 0.1           # 1.x 值;v2 为 8
render.ibl.intensity       = 1             # IBL 即天空环境光;GI 隔离对比时设 0
# 点光由场景文件提供;若需纯方向光对照,scene.import 后用
# light.delete -index N 逐盏删掉(可撤销)
```

注意:PBR pass 的 ambient 项**不读** `ambientLight`(走 IBL);`ambientLight` 只对
Forward pass 和 PT 生效。PBR 下压环境光用 `render.ibl.intensity`。

## 三态截图流程(每个场景相同)

```
# 1. Direct-only(GI 关)
render.setting.set -name render.ssgi -value false
editor.screenshot -path ./captures/<scene>_direct.png
# 2. SSGI
render.setting.set -name render.ssgi -value true
editor.screenshot -path ./captures/<scene>_ssgi.png
# 3. PT ground truth(渐进累积;2026-08-01 提速后 sponza 10s、小场景 5s 即可)
render.setting.set -name render.pathtrace -value true
# sleep N 后:
editor.screenshot -path ./captures/<scene>_pt.png
render.setting.set -name render.pathtrace -value false
```

场景 JSON(含相机与点光)经 `scene.export` 落盘在 `Assets/scenes/`:
`scene.import -path <file>` 一键复现(点光随文件替换;方向光/IBL/环境光
不在场景文件里,按上表手动设置)。

## 已记录的现象(2026-08-01,SSGI 修复后更新)

- IBL=1 时 SSGI 在 Cornell 视觉上零贡献;IBL=0 后对比有效
- **SSGI 三处数学错误已修**(见下文);修复后 Cornell 背墙出现方向正确的
  色彩溢出(左绿右红),量级 plausible(单弹射屏幕空间,弱于 PT 多次反弹
  属预期);sponza 默认光照下 on/off 无回归伪影
- 修复内容(SSGI_PS.hlsl / PBRPixelShader.hlsl):
  1. 命中判定:对称厚窗提前 1.5 步误命中 → 穿越式判定 + 4 轮二分细化
     (此前伪影的块状错色来自命中点 UV 偏移)
  2. 估计器:cosine 采样重复乘 NdotL 且多除了 π —— 掠射方向(所有墙面
     溢出方向)贡献被压没;现为 Li 直接平均,albedo 在注入端乘
  3. PBR 注入端补乘接收面 albedo
- 成本:SSGI pass 0.30ms → 1.60ms(sponza 720p,二分细化所致),可接受;
  后续可上半分辨率
- 无顶场景(场景 B)PT 会把天空盒当光源而 raster IBL=0 不会——严格对比用
  封闭的场景 A

## 2026-08-04 更新:SSGI 半分辨率 + 时域累积

- SSGI 半分辨率渲染,注入端双线性上采样;逐像素 hash + blur 时域累积
  (`blend=1/N`,N≤32);相机变动重置。大场景调 `max_distance`/`steps`(场景 F)

## 2026-08-16 更新:SSGI miss 分类 + 色彩溢出

- **问题**:原先凡未命中一律加 `skyRadiance`,侧向跑出屏幕也被当成天空,
  灰填充淹没帷幔/墙面溢色(Sponza 统计上"很亮"但溢色脏)。
- **改动**(`SSGI_PS.hlsl`):
  1. march 结果三分:命中 / 真天空(depth≈0) / 离屏(-1 无填充) / 步数耗尽(-2
     弱天空×0.45×向上权重)
  2. 命中贡献 ×1.35,firefly clamp 提到 16;步进改为 0.35t+0.65t² 兼顾近距溢色
  3. 默认 `intensity=1.75 / rays=12 / steps=64`(config);Cornell 盒内距~2,
     对比时设 `render.ssgi.max_distance=4`
- **验证**(IBL=0):Sponza 中庭左右帷幔侧出现绿/红溢色;Cornell 背墙/方块有
  可测的间接增量(弱于 PT 多次反弹属预期)
