---
title: "MMD 基建设计(Phase 2 垂直切片)"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-28T10:32:00+08:00"
permalink: 2026/09/27/mmd-infrastructure-design/
categories:
  - 图形学
tags:
  - astra
  - 渲染分析

---

> 由 astra 生成 · 首次发布于 2026-09-27 18:44 · 最近整理于 2026-09-28 10:32（北京时间）

> 2026-08-17 起稿。目标:在现有 Render Graph / StyleRegistry 上,做出
> **可播放的 PMX+VMD → toon 渲染 → 序列帧/视频**最小闭环。渲染效果平台
> 已具备扩展性;本切片补的是**资产 + 动画**层,与 pass/shader 插件解耦。

<!-- more -->

## 1. 现状与缺口

| 层 | 已有 | 缺口 |
|---|---|---|
| 网格 | `Vertex` 无 bone indices/weights;Assimp glTF/FBX/OBJ | 蒙皮顶点格式;PMX 专用属性(边缘缩放、球面变形等可后置) |
| 节点树 | `MeshNode` 父子局部矩阵(编辑器用) | **骨骼层级 ≠ 网格节点树**;需独立 `Skeleton` |
| 动画 | 无 | VMD 骨骼/morph/相机轨;采样器;IK |
| 变形 | 无 | PMX morph(顶点/骨骼/材质/UV/组) |
| 材质 | toon / outline / StyleRegistry 已落地 | PMX 材质→toon 自动接线(边缘色、toon 图) |
| 输出 | `editor.screenshot` | 离线逐帧 dump + ffmpeg |

说明:仓库内 `external/assimp/.../MMD/` 有 PMX/PMD/VMD **解析代码**,但
路线图原写「assimp 不支持」偏过时——应用层从未接线。**决策见 §3.1**。

## 2. 验收切片(Dogfood)

1. 加载标准 PMX(公开测试模,如初音系/自用授权模)
2. 播放一段 VMD(站立 Idle 或短舞),CCD IK 腿/足正确
3. toon + 几何描边渲染;CLI:`scene.load` → 定时 `editor.screenshot` 或批量帧
4. 可选:ffmpeg 合成 mp4

本期范围外(至今):实时麦克风口型、多角色舞台编辑器。
注:物理布料(Bullet 刚体/关节)与 morph 权重关键帧此后已落地;当前
实现范围快照见 §8。

## 3. 模块拆分

```
Assets/model/.../*.pmx + *.vmd
        │
        ▼
┌───────────────────┐
│  PmxLoader        │  → Mesh + Skeleton + MorphSet + PmxMaterialHints
│  VmdLoader        │  → AnimationClip (bone/morph/camera tracks)
└─────────┬─────────┘
          ▼
┌───────────────────┐
│  AnimationSystem  │  时钟 + 采样 + IK 求解 → Pose (bone matrices + morph weights)
└─────────┬─────────┘
          ▼
┌───────────────────┐
│  Skinning         │  GPU: bone matrix buffer + skinned VS (或 compute 预蒙皮)
│  MorphApply       │  CPU 首版 / 后期 GPU
└─────────┬─────────┘
          ▼
既有 PBRPass / StyleRegistry(toon) / Outline
```

### 3.1 PMX 加载策略

**推荐路径 A(快)**:启用 Assimp MMD importer → `AssimpModelLoader` 读出
mesh/bones/weights;再写薄层 `PmxExtras` 读 Assimp 丢弃的 PMX 字段
(toon 图路径、边缘参数、IK 链定义若未进 aiScene)。

**路径 B(稳)**:自写 PMX 二进制解析(格式公开),输出引擎原生结构。
可控性高,但工期更长;可把 Assimp `MMDPmxParser` 当参考而非依赖。

VMD:Assimp 侧有 `MMDVmdParser.h`;建议**独立 `VmdLoader`**(VMD 与模型
解耦绑定靠骨骼名),不绑在 `aiScene` 上。

### 3.2 Skeleton / Pose(硬前置)

```cpp
struct Bone
{
    std::string name;
    int         parent = -1;
    XMFLOAT4X4  restLocal;   // bind / 模型空间 rest
    // PMX: deformable / IK 标记等
};

struct Skeleton
{
    std::vector<Bone> bones;
    // name → index
};

struct Pose
{
    // size == bones: model-space skinning matrices (bone * inverseBind)
    std::vector<XMFLOAT4X4> skinMatrices;
    std::unordered_map<std::string, float> morphWeights;
};
```

- 与现有 `MeshNode` **并存**:MeshNode 继续服务静态层级编辑;Skeleton 专供
  蒙皮。VMD 驱动的是 Bone,不是 MeshNode(除非后续做「骨骼→节点」同步可视化)。
- 逆绑定矩阵:加载时从 rest pose 算好,存 `Skeleton` 或并行数组。

### 3.3 顶点格式扩展

当前 `Vertex` 无蒙皮通道。两种做法:

1. **附加流**(推荐):`SkinVertex { uint8 indices[4]; float weights[4]; }`
   与位置 VB 分离,非蒙皮网格零开销;VS 双流输入。
2. **扩 `Vertex`**:破坏全部 input layout / 偏移;成本高。

首版 4 骨/顶点足够覆盖绝大多数 PMX。

### 3.4 GPU 蒙皮

- `cbuffer BoneMatrices : register(b?)` 或结构化缓冲 `StructuredBuffer<float4x4>`
  (骨数常 > 256,优先 SRV 结构化缓冲)。
- 新 VS:`SkinnedPBRVertexShader.hlsl`(或 `PBRVertexShader` 加 `#ifdef SKINNED`),
  StyleRegistry `vsPath` 已支持按风格选 VS——蒙皮应是**网格级**能力,
  建议在 PBRPass 按 `mesh->HasSkinning()` 选 VS,而不是材质风格。
- GPU-driven 路径:蒙皮后世界 AABB 会变——首版可对蒙皮模型**禁用 Hi-Z /
  收紧为每帧更新 instance bounds**,或 CPU 用 pose 更新 bounding sphere。

### 3.5 VMD 采样与 IK

顺序(对齐常见 MMD 运行时):

1. 应用 VMD 骨骼关键帧(插值:贝塞尔或线性;VMD 带插值参数)
2. 应用 VMD morph 权重
3. **CCD IK**(腿/足/指等 PMX IK 链)— VMD 只写 IK 目标相关骨时依赖此步
4. 物理(本期不做)
5. 写出 `Pose.skinMatrices`

相机轨:已落地 `camera.animation.*`(load/seek/play)。采样与看向公式对齐
开源 **saba** `MMDLookAtCamera`/`VMDCameraAnimation`(MIT):`R=Ry*R_(0,0,-1)(z)*Rx`,
兴趣点+本地眼点。资产见 `Assets/mmd/`(wavefile 来自 three.js 样例;orbit/push_in
自建;Gene/Uka 对话动作仍在各自 `motion/`)。

### 3.5.1 坐标系:Assimp Z 镜像约定(踩过的坑,勿回退)

**Assimp MMD importer 在导入末尾无条件跑 `MakeLeftHandedProcess`**
(`MMDImporter.cpp::CreateDataFromImport`):全部顶点/法线 `z*=-1`,节点变换做
镜像共轭 `S·M·S`(S=diag(1,1,-1)),并翻 UV/绕序。MMD 原生是左手系,这一步
实际把场景**镜像**了——引擎里的网格、骨架 rest pose、inverseBind 都在
"Z 镜像空间"里(不对称细节左右互换,如 miku 臂上的 01 在镜像侧;渲染
本身自洽,因为绕序也翻了)。

VMD 走自有 `AnimationClip::LoadVmd`(绕开 Assimp),原始关键帧是未镜像的
原生数据,**必须施加同一镜像才能和骨架一致**,否则动作/镜头左右反
(2026-08 实踩:手/头方向反、相机拍到背面)。三个转换点全在
`src/Resource/AnimationClip.cpp`:
(VMD 二进制解析也是该文件自含的几十行,**不用** assimp `MMDVmdParser`——
上游其实现每个相机帧多读 2 字节(unknown[3] vs 实际 1 字节 perspective),
后续记录全部错位;assimp 子模块保持上游 pristine,不做任何补丁。)

1. **骨骼键**(对齐 assimp `MakeLeftHandedProcess::ProcessAnimation`):
   position `z→-z`;quaternion `x→-x, y→-y`(镜像共轭 S·R·S 的四元数形式)。
2. **相机键**:interest `z→-z`;欧拉角 `x→-x, y→-y`,z 分量不变
   (`Ry(y)·R_(0,0,-1)(z)·Rx(x)` 分解被 S 共轭后的结果)。
3. **相机放置**:与 saba 的 OpenGL RH 情形完全相同——eye 在
   `interest + R·(0,0,+|distance|)`(原生左手系才是 `-|distance|`;
   符号错了相机停在注视点正对面,拍背面)。

推论:整树 bone local 组合 `R(anim)·T(anim)·restLocal` 在镜像空间内自洽,
无需额外处理;morph 顶点偏移已实现并按同一镜像处理(delta z 取反,
见 `PmxExtrasLoader.cpp`),IK 链角度限制与物理刚体/关节同样做镜像换算。
若将来走自写 PMX parser(路径 B)回到原生不镜像空间,**需回退上述各转换点**。

### 3.6 Morph

首版:**顶点 morph CPU 合成**到动态 VB(或 staging 上传),验证表情。
后期:GPU morph + 蒙皮同 pass。

材质 morph / UV morph:延后。

### 3.7 材质接线

PMX → `Material`:
- 默认 `toon=1` + `outline_width` 从边缘缩放估
- 若有 toon 贴图 → `ramp_warm_texture` 或专用槽(可先程序化 band)
- 球面/SPA/SPH 贴图:后期;先 albedo+toon

复用现有 StyleRegistry,不新造渲染风格 unless 需要 PMX 专用 PS。

### 3.8 视频输出

```powershell
powershell -ExecutionPolicy Bypass -File tools/Render-MmdFrames.ps1 `
  -ModelPath model/mmd_gene/Gene.pmx `
  -VmdPath mmd/motion/wavefile_v2.vmd `
  -CameraVmdPath mmd/camera/orbit_y.vmd `
  -StartFrame 0 -EndFrame 300 -Fps 30 `
  -OutputDirectory captures/mmd `
  -OutputVideo captures/mmd.mp4
```

工具可启动独立隐藏编辑器,也可用 `-UseRunningEditor` 接入现有实例。每帧调用
`animation.seek` / 可选 `camera.animation.seek` / `editor.screenshot`;指定
`-OutputVideo` 时调用 PATH 中的 ffmpeg 输出 H.264 yuv420p。

## 4. 实施阶段(建议工期顺序)

| 步 | 状态 | 内容 | 验收 |
|---|---|---|---|
| M0 | 完成 | 设计定稿 + 授权清晰的 Gene PMX/VMD | 文档+归属说明 |
| M1 | 完成 | `Skeleton`/`Pose` + skin 顶点流 + PMX/PMD 骨骼权重 | 恒等 pose 一致 |
| M2 | 完成 | GPU 蒙皮 VS + bone buffer + 骨骼编辑 | 拖骨变形正确 |
| M3 | 完成 | VMD 加载/采样/编辑/回写 | FK 动作与关键帧编辑可见 |
| M4 | 完成 | CCD IK + VMD IK enable | 腿部 IK 可开关/求解 |
| M5 | 完成 | CPU morph 顶点更新 + 关键帧 | 表情关键帧可见 |
| M6 | 完成 | PMX toon 自动接线 + `Render-MmdFrames.ps1` | PNG 序列 + H.264 视频 |

并行可插:运动向量/TAA 与蒙皮无关,勿阻塞 MMD。

## 5. 与现有系统的接口契约

- **不改** StyleRegistry 插件模型;蒙皮是 Mesh/Pass 几何路径分支。
- **Render Graph**:蒙皮不新增全屏 pass;若以后 compute 预蒙皮,再注册
  `SkinPass`(DeclareFrameGraph 已具备扩展点)。
- **场景文件**:`.scene.json` 可增 `animation: { vmd, time }` 段(v5),旧文件兼容。
- **单位**:PMX 常为厘米级;沿用 `model.scale.set` / `.import.json` 烘缩放。

## 6. 风险

- **IK 数值与 MMD 官方不完全一致** → 以目视 + 对照 MMD 本家/mmdbridge 为准,
  不追求逐骨 bit-exact。
- **骨数/常量缓冲 256 上限** → 结构化缓冲规避。
- **GPU-driven + 蒙皮 AABB** → M1–M4 对蒙皮模型关 Hi-Z 或每帧更新 bounds。
- **版权** → 仓库不提交商业 PMX/VMD;只用可再分发测试资产或本地路径。

## 7. 下一步(历史记录,已全部落地)

1. ~~确认加载路径 A(Assimp MMD)~~ — 已验证:`Gene.pmx` → 224 bones + skin weights
2. ~~Skeleton + skin 顶点流 + 恒等 pose 蒙皮~~ — Vertex 含 BLENDINDICES/WEIGHT;
   GPU `boneMatrixBuffer` (t25) + `Skinning.hlsli`;身份 pose 自测截图见
   `captures/mmd_gene_bind.png`(Gene CC-BY,`Assets/model/mmd_gene/`)
3. ~~`VmdLoader` + FK 采样 → 驱动 Pose.skinMatrices~~ — `AnimationClip::LoadVmd`
   自含解析,采样含逐通道贝塞尔(§8)
4. ~~CCD IK → morph → 批截图/ffmpeg~~ — 全部落地;当前状态与边界见 §8

单元测试:`PeanutPmxLoaderTests`(加载 Gene.pmx 断言骨骼/权重/toon 接线,
另含 VMD 回写/IK-enable/贝塞尔/顶点索引宽度/IK 角度限制/嵌套组 morph/
bone morph 解析与求值回归)。

## 8. 实现状态快照(2026-09-04,对齐源码)

### 已实现能力

- PMX 加载:assimp 提供网格/骨骼/蒙皮;自写 `ParsePmxExtras` 单次扫描
  (不依赖 Mesh)补齐 morph(顶点/组/骨骼)、IK 链(含 per-link 角度限制)、物理、
  显示枠与材质提示;`AssemblePmxExtras` 再映射到引擎网格/骨架。
- VMD(`AnimationClip::LoadVmd`/`SaveVmd`):骨骼/morph/相机轨读写;逐通道
  贝塞尔插值参数逐字节保留并参与采样(左键曲线;saba 布局);IK-enable
  区段读写;light/self-shadow 区段跳过、保存时写零计数。
- CCD IK:链级 angleLimit + per-link XYZ 欧拉夹取;VMD IK-enable 记录
  控制链开关;`bone.ik.set` 运行时开关。
- morph:组 morph 递归展开(权重沿路径相乘,环检测断开);顶点 morph 走
  CPU/GPU deformation 通路;骨骼 morph 在 FK 前按有效权重应用平移与四元数
  slerp;两类消费者共享同一权重快照与版本;权重关键帧编辑与 Hermite/线性采样。
- 相机轨 `camera.animation.*`;`ApplyMmdCameraSample`/`ExtractMmdCameraSample`
  与编辑器相机互转;PMX 材质自动接线 toon;`Render-MmdFrames.ps1` 输出
  PNG 序列/H.264 视频。

### 明确不支持的 PMX/VMD 特性

- PMX morph 类型:UV/材质/flip/impulse(解析跳过,不进 MorphLibrary)。
- VMD light/self-shadow 区段内容(不解析保存;回写为零计数)。
- SDEF/QDEF 变形按普通 LBS 蒙皮处理(字段被正确跳过,不做球面/双四元数混合)。
- 显示枠(display frame)已收集进 `PmxExtras::displayFrames`,不进编辑器 UI。
- 未支持 morph/关节计入 `PmxImportReport`,不进 MorphLibrary / physics joints。
- 实时口型、多角色舞台编辑(范围外)。

### 已知兼容性限制

- 坐标系:assimp `MakeLeftHanded` Z 镜像空间(§3.5.1);各自写解析点单独做镜像。
- IK 数值与 MMD 本家不 bit-exact;per-link 夹取采用 three.js CCDIKSolver /
  saba 的 XYZ 欧拉约定,迭代中途被夹取属正常求解行为。
- VMD 保存:编辑器新建键的插值为 MMD 默认 (20,20,107,107)(控制点共线,
  恰为线性);IK-enable 的 show 字节不存、恒写 1;超过 19 字节 Shift-JIS 的
  IK 骨名回写会截断。
- VMD morph 记录本身无插值参数,采样为线性 + 自动 Hermite 平滑,与 MMD 一致。

### 验收资产

- Gene(CC-BY,`Assets/model/mmd_gene/`)+ `mmd/motion/wavefile_v2.vmd` +
  `mmd/camera/wavefile_camera.vmd`;回归入口 `PeanutPmxLoaderTests`,
  视觉回归走编辑器 CLI 截图闭环(见 `Docs/editor-cli-reference.md`)。

## 9. 长期演进

本文继续作为当前 PMX/VMD 垂直切片的实现快照，不在这里混入多实例或 GPU deformation
的未来结构。后续设计由以下文档负责：

- `Docs/mmd-runtime-architecture.md`：不可变 `MmdAsset`、可变 `MmdInstance`、一次
  PMX extras 解析、确定性 `SimulationClock` 与多角色边界；
- `Docs/gpu-deformation-architecture.md`：compute morph、实例级 deformation buffer、
  bounds、pipeline 变体和分阶段 GPU 迁移；
- `Docs/editor-command-architecture.md`：动画/morph 编辑命令、stable ID、snapshot、
  undo/redo 和 scene serialization；
- `Docs/gpu-performance-budget.md`：单角色/多角色的 CPU、GPU、上传与显存验收。

长期路线启动时仍以本文件 §3.5.1 的坐标系约定和 §8 的兼容性限制为基线；迁移不得
改变现有 Gene/Wavefile 截图、VMD 回写和 PMX fixture 语义。
