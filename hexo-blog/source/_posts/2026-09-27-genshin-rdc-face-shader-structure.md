---
title: "原神真实脸部 shader 结构分析(从截帧提取)"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-28T20:56:00+08:00"
permalink: 2026/09/27/genshin-rdc-face-shader-structure/
categories:
  - 图形学
tags:
  - astra
  - 技术文档
  - 渲染架构
---

> 由 astra 生成 · 首次发布于 2026-09-27 18:44 · 最近整理于 2026-09-28 20:56（北京时间）

来源以大世界帧 `muou_light.rdc` 为准，并以
`muou_all_resource.rdc` 补充资源身份；通过 qrenderdoc 无头 python 提取。
关键 draw：10416 下半脸、10433 上半脸、10523 眉毛、10567 瞳孔。

<!-- more -->

## face PS 资源与输入(cb0=322 float4 / cb1=8 float4)
- t0=区域图(s3,sample_b 带 LOD bias)、t1=脸 diffuse/ILM(s2,UV0/UV1 双通道)、t2=表情图集(s1,旋转网格+镜像平铺)、t3=alpha 遮罩(s0,可翻转)、t4=脸部 SDF(s0)
- VS 输入:v0 pos / v1 normal / v3 UV0 / v4 UV1 / v5 UV2 / v6 UV3 / v7 顶点色
- VS 输出:o0 clip、o1=顶点色、o2=UV0、o3=UV1、o4=UV2/3、o5=disc 投影位置、o6=viewDir(+w=-viewZ)、o7=worldNormal(+w=1)、o8=worldPos(+w=hideFlag)、o9=切空间基、o10=worldNormal 副本、o11=lightDir(+w=bentNdot 0.4975+0.5)、o12=UV0+UV1(cb0[218] 变换)

### Face_Eye VS 可见性路径

- 10433 `face_vs` asm 17–23 在 `cb0[185].y=1`、`cb0[186].w=0` 时，将
  `UV2.x > 0.05` 的顶点位置折叠为零；本帧共 589/2520 个顶点命中。
- 用输入 VB 直接拟合 post-VS clip position 最大误差为 `0.215`；先应用上述
  可见性规则后降至约 `2.34e-7`，说明它是眼区深度正确的必要步骤，不是 morph。
- cb0[197..207] 的 toon-perspective 分支在本帧关闭；Face_Eye 官方 bind 顶点
  不需要烘焙 `Eye_WUp` / `Eye_Lowereyelid`。

## 关键算法(行号=disasm 行)
1. **脸部圆盘裁剪(0-21)**:cb0[268].x 启用时,clipPos.xy/w × 视口(cb1[7])×0.25 → frac×4 → 4x4 网格索引 → cb0[17..20] 4x4 矩阵按格取值,`cb0[268].x*17 - z < -0.01` 则 discard。
2. **材质区号剔除(22-34)**:cb0[24].w 启用时按 v3.x(UV1.x 取整)与 cb0[25].x 判定剔除。
3. **albedo alpha 分区派发(36-52)**:`alpha>=0.8`(cb0[244].x 启用)→区2;`>=0.4 && <0.6`(cb0[249].w)→区3;`>=0.2 && <0.4`(cb0[255].w)→区4;`>=0.6`(cb0[261].w)→区5;否则区1。**区号决定 244..267 的参数组(颜色/高光/阴影色)**。
4. **弯折法线(53-69)**:N' = normalize(L + offset),offset=cb0282或 cb0[286]/287;L 由 cb0[30].y 选"cb1[5] 光源位置"或 VS 传入方向。
5. **lightmap(70-83)**:UV 选择 cb0[185].y>=0 → UV0;mode(cb0[220].x)==3 → lerp(ilm, cb0[234], ilm.a×cb0[233].w);==1 → ilm.a < cb0[220].y discard。
6. **t3 alpha 遮罩(84-99)**:cb0[24].y 启用时采样 t3,`<0.5` discard;cb0[25].w 翻转;通过后 r0.y=21/4(材质 ID,输出 o3.x×0.003922)。
7. **SDF 双段带(113-283,核心)**:cb0[314..321] 参数。v9 切空间基参与;t4 采样带镜像 UV(按法线 y 符号翻转)+ 旋转;公式含 smoothstep 主带 + `exp(1.442695×k×Δ)` 双曲衰减副带;cb0[315].x/y = 带内暗/亮级(lerp);cb0[317].z / cb0[319].z 门控两段;cb0[314].w/318.w/320.w 为衰减系数;cb0[316].x/y 钳制;累计到 r5.z。
8. **终结者/高光因子(284-334)**:r0.z = 类 fresnel(`(x-0.5)^2*2+0.5` 整形,×v1.x 顶点色,clamp 0.05..0.95);cb0[227] 阈值;区号选 cb0[230..267] 参数;`log((d/thr)+0.01)×k` 指数化 → 高光系数。
9. **阴影色链(335-434)**:r10 = 区号选"亮/暗色对"(cb0[228]/[229]、[246]/[247]、[252]/[253]、[258]/[259]、[264]/[265],按 cb0[280].w lerp、cb0[228].w 开关);与 r0.z(高光)、r6.w、r7.z(阴影因子)、r4.w(SDF 带)多层 movc/lerp 组合成最终 diffuse;**`r9 = albedo×区缩放` 为主体**;spec 由 cb0[279].x 缩放 + 区高光色(cb0[238]/[245]/[251]/[257]/[263],×cb0[237].z)。
10. **表情图集(435-530)**:cb0[185].w/186.w 门控;t2 采样 UV 按 cb1[0].y 旋转角 sincos 旋转 + 网格镜像(ftou/udiv,8x8)+ 双线性权重;两层(cb0[185..196])混合;cb0[196].w 强度;最后与主色按 t2.a 混合。大世界中性帧 `cb0[186].w=0`，DXBC `if_z` 跳过整段。
11. **平面裁剪 discard(543-547)**:`dot(worldPos - cb0[310], cb0[311]) < 0` discard(头后部/口腔隐藏)。
12. **rim(531-542)**:`pow(1-NdotV+1e-4, cb0[309].x) × max(cb0[307], cb0[308]) × cb0[309].y` 加亮。
13. **HDR 归一(548-554)**:max 通道>1 时除以 max。
14. **解析阴影平面(555-577)**:cb0[297].y!=1 时,循环 cb0[297].x 次(≤8,索引 289..296):`smoothstep(dp4_sat(cb0[289+i], worldPos.xyzw))`,按 cb0[297].y 混合 → r1.w。这是该 shader 变体可用的角色自阴影输入,不是 shadow map；但本次 10433 大世界 draw 的门控/计数使该分支没有提供有效平面,不能把“存在这段代码”误判为“当前帧实际产生了动态自阴影”。
15. **亮度去饱和(601-611)**:luma = dot(rgb, (0.039682, 0.458022, 0.006097));`rgb = lerp(rgb, luma, cb0[38].x)` 后 `(rgb-0.5)×(cb0[38].w+1)+0.5`。
16. **输出**:o0.xyz=归一化插值方向×0.5+0.5、o0.w=0.333;o1=最终色;o2;o3.x=材质ID/255;o4.x;o5.x=(cb0[271].x&15)/255。

## 引擎实现状态（2026-09-14）

- `GenshinFaceVertexShader` 已复现 UV2 Face_Eye 可见性折叠；共享
  `GenshinVertexShader` 继续输出截帧使用的 UV0/UV1/UV2、切空间基、
  lightDir+bentNdot、disc 投影、world position/normal；
  `GenshinFaceSemanticPixelShader` 直接运行 10433 已验证语义核心，包括 alpha
  分区、双段 SDF、解析阴影、expression atlas 与输出链。
- 运行时不再把截帧角色世界旋转烘进固定 SDF 矩阵。方向光先投影到当前
  instance/node 的 model-space down/forward/side 轴；资产的 mirror-X 使截帧
  `+X` side 对应模型 `-X`。随后按捕获 VS 原公式生成 `o9.xyzw`；主 SDF 使用
  xy、detail band 使用 zw。实时光照按 `o9.y` 重新选择
  SDF 半边，捕获时已经写成 `-1` 的单帧选择值不再锁死左右响应。
- FaceSDF、ILM authored occlusion、toon terminator、身体 ramp、眼睛和衣服
  全路径均使用具名语义代码。反汇编和逐寄存器推导继续留在本目录作为证据，
  不再作为运行时代码的可维护接口。
- 10491/10503 衣服已拆为 `giDress/giDress01`，不再错误套用 10381
  Stockings_New 常量布局。Dress 语义运行时恢复 `SV_IsFrontFace`
  双面 UV/法线、Dress 的 A/RG detail-map 合同，以及两套独立 sparkle 参数。
- face/lightmap/lash 的 SRGB view 语义已在 shader 内显式恢复；RGB 解码，
  alpha 与 SDF/遮罩保持数据域。FaceSDF 两次采样统一使用原始 PS 的 UV0。
- `pbr.style-constants.json` 以语义名承载各角色 pass 的紧凑参数块，并接受旧
  capture-row 名作为兼容别名；方向光、相机和时间在运行时由引擎注入。Face 与
  Face_Eye 分别来自 10416/10433，但两者的关键光和 `o9` 在大世界帧完全一致；
  `gi` 默认值以 10433 PS cb0 为准，不能再混用菜单变体常量。
- 当前角色 forward shader 不采 Peanut SSAO，也不采引擎 shadow map。可见的
  “AO”来自 ILM.g 经 signed-square 重映射后与 vertexColor.r 相乘，再与
  half-Lambert 合成终结者；本帧解析阴影平面无有效输入。因此缺少动态遮挡/自阴影
  是待实现的输入合同，不能通过调暗 ILM 或叠加场景 deferred AO 冒充。
- `Avatar_Tex_Eye_BlendShape_Diffuse` 已按截帧 t2 绑定；中性帧严格按
  `cb0[186].w=0` 跳过图集，避免错误叠加闭眼/wink 瓦片。
- 10416/10433/10523/10567 均为 Back Cull、reverse-Z GreaterEqual、深度写入，
  无 polygon/depth bias。Peanut 保持统一 Back Cull；源资产不做 Face/Face_Eye
  特殊翻转，也不再使用 Pupil 深度补偿。
