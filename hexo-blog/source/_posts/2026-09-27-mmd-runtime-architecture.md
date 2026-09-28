---
title: "MMD Runtime 长期架构"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-28T20:56:00+08:00"
permalink: 2026/09/27/mmd-runtime-architecture/
categories:
  - 图形学
tags:
  - astra
  - 技术文档
  - 渲染架构
---

> 由 astra 生成 · 首次发布于 2026-09-27 18:44 · 最近整理于 2026-09-28 20:56（北京时间）

状态：Long-term design

日期：2026-08-29
适用范围：`src/Resource`、`src/Physics`、`src/Renderer/*Animation*` 与 MMD 编辑功能

## 1. 目标

将现有可工作的 PMX/VMD 垂直切片收敛成可复用、可多实例、可确定性回放的运行时。
本设计不替换 DX12 渲染器，也不引入 ECS；它只明确资产、实例、模拟和 GPU 提交之间
的所有权。

长期目标：

<!-- more -->

- 同一 PMX 资产可创建多个角色实例，各自播放不同 VMD、表情和物理状态；
- 编辑器、CLI 离线渲染和实时播放共享同一求值顺序与时钟；
- CPU runtime 不含 D3D12 类型，只向 renderer 输出稳定的 deformation 输入；
- PMX extras 只解析一次，坐标系转换、错误和兼容性集中处理；
- 后续骨骼、UV、材质、flip、impulse morph 有明确扩展位置。

## 2. 当前边界与问题

当前 `RenderPrimitive` 同时持有 mesh、pose、morph 权重、播放状态、clip、physics world、
GPU buffer 和 dirty cache。`MorphLibrary::ApplyToMesh` 直接修改 mesh 顶点，意味着
CPU mesh 既是不可变资产又是实例求值结果。该结构适合单角色验证，但会阻碍资产共享、
多角色和 GPU deformation。

PMX 补充数据目前按 morph、IK、physics 分入口读取。长期应统一为一次 parse，避免
多次扫描、重复 skip 逻辑和坐标镜像分散。

## 3. 目标数据模型

### 3.1 不可变资产

```cpp
struct MmdAsset
{
    std::shared_ptr<const MeshAsset> mesh;
    SkeletonAsset                   skeleton;
    MorphSet                        morphs;
    PhysicsDefinition              physics;
    PmxMaterialHints               materialHints;
    MmdCoordinateConvention         coordinates;
};

struct AnimationClipAsset
{
    BoneTracks   bones;
    MorphTracks  morphs;
    CameraTracks camera;
    IkEnableTracks ik;
};
```

资产发布后不可修改。编辑 VMD 时使用 `EditableClipDocument`，保存或应用后生成新的
`AnimationClipAsset`。运行时不得通过共享 clip 指针直接修改其他实例可见的数据。

### 3.2 可变实例

```cpp
struct MmdInstance
{
    MmdAssetHandle          asset;
    AnimationPlayer         player;
    PoseState               pose;
    MorphWeightState        morphWeights;
    PhysicsInstance         physics;
    DeformationDirtyState   dirty;
};
```

实例只保存会随时间变化的状态。模型世界变换、选择状态和编辑器元数据属于 scene/editor，
不塞入 `MmdAsset`。

### 3.3 帧输出

CPU runtime 每帧输出不含 D3D12 类型的 `MmdFrameOutput`：

- final bone palette 或 model-space globals；
- morph weights 及变化版本；
- material override 参数；
- deformation bounds；
- 本帧是否需要重新提交 deformation。

renderer 只消费该输出并决定 upload、dispatch 与 draw，不反向修改 runtime 数据。

## 4. PMX/VMD 导入边界

### 4.1 PMX extras 一次解析

目标入口（已落地）：

```cpp
bool ParsePmxExtras(std::istream&, const PmxParseOptions&, PmxParsedExtras& out);
bool AssemblePmxExtras(const PmxParsedExtras&, Mesh&, PmxExtras& out);
bool LoadPmxExtras(const std::string& path, Mesh&, PmxExtras& out);  // parse + assemble
```

一次遍历产生 morph、IK、physics、display frame、材质提示和尚未支持 section 的元数据
（`PmxImportReport`）。装配阶段再将 PMX 顶点/骨骼索引映射到 Assimp 生成的 mesh/skeleton。

约束：

- unsigned vertex index 与 nullable resource index 保持不同类型；
- Z mirror 只在解析边界做一次，并由 `MmdCoordinateConvention` 记录；
- 未支持记录必须能安全跳过并计入导入报告；
- 任一 section 截断时整个 extras 解析失败，不提交半套数据。

### 4.2 VMD 资产与编辑文档

`AnimationClipAsset` 用于播放；`EditableClipDocument` 用于 key 增删、undo/redo 和保存。
两者共享序列化器和采样数据结构，但生命周期不同。保存必须继续保持 IK-enable 与
Bezier 字节保真语义。

## 5. 求值顺序与确定性

固定求值顺序：

1. `SimulationClock` 产生 animation frame 与固定 physics steps；
2. 采样 VMD bone/morph/camera/IK-enable；
3. 应用 bone morph 与 FK；
4. 求解 append/inherit 与 CCD IK；
5. 按固定步长执行 physics；
6. 应用 physics 写回并重建子骨骼 globals；
7. 生成 palette、morph/material weights 和 bounds；
8. 发布 `MmdFrameOutput`。

实时播放允许 render interpolation，但 simulation step 固定。`seek` 必须从已知快照或
确定性 reset 重放，不能依赖 seek 前的墙钟状态。CLI 离线导出和 GUI 使用同一接口。

## 6. Physics 所有权

首阶段保持每个角色独立 Bullet world，与当前行为一致。若产品需要角色间刚体碰撞，
再由 scene 级 `PhysicsSimulationSystem` 统一 world；该切换必须显式定义 collision group、
reset、seek 和销毁顺序，不能仅把多个 body 塞进共享 world。

`PhysicsDefinition` 属于 asset，Bullet body/constraint 属于 instance。运行时缓存 globals，
避免每帧为每个模型重新分配临时 vector。

## 7. 编辑器边界

- UI/CLI 通过 `EditorAnimationOps` 操作 instance 或 `EditableClipDocument`；
- undo/redo 记录领域变更，不持有 GPU resource；
- scene serialization 保存 asset 引用、instance 播放状态和 editor override；
- renderer snapshot 只供查询和预览，不是场景文件的事实源。

详细命令与快照协议见 `Docs/editor-command-architecture.md`。

### 当前时间轴与预览语义

- clip 是否存在由 `hasClip/loaded` 表示；新建且尚未保存的 clip 路径可以为空。
- 模型与相机是否联动由 editor transport 决定；GUI 同步开关生效，CLI 默认联动，
  只有相机 clip 时也可播放。时间轴编辑范围可超过最后一个关键帧。
- 删除或替换骨骼、表情、相机关键帧后重算 clip 长度，同时计入 IK-enable 记录。
- 修改表情轨或 undo 恢复时退出手动权重预览并刷新 pose；显式失效以及 IK/physics
  开关变化均使 pose cache 失效，暂停或没有 clip 时也不能跳过必要刷新。
- 表情 Key/Smooth 操作各自对应一次 undo；morph 采样数组按最大 target 下标分配，
  允许名称映射存在空洞。

PMX/VMD 的格式支持与兼容性限制统一见
[MMD 基础设施](/2026/09/27/mmd-infrastructure-design/)中的实现状态快照。

## 8. 分阶段迁移

| 阶段 | 内容 | 可见行为 |
|---|---|---|
| MR0 | 增加 runtime telemetry 与当前求值顺序测试 | 不变 |
| MR1 | 统一 `PmxExtras` 一次解析。**已完成**(2026-08-30,2026-09-04 补齐 bone morph):`ParsePmxExtras(istream, options)` 不依赖 Mesh，一次遍历产出 PMX 索引空间的 vertex/group/bone morph、IK/physics/display frame/材质提示与 `PmxImportReport`；`AssemblePmxExtras` 再映射到 Assimp 网格/骨架；bone morph 的平移与四元数在解析边界完成 Z 镜像；截断不提交半套数据；group morph 子索引按保留 target 重映射；flip/impulse 按规范跳过 | 加载结果不变，扫描次数下降 |
| MR2 | 引入 immutable `MmdAsset` 与 mutable `MmdInstance` | 单角色行为不变 |
| MR3 | 引入 `SimulationClock` 和确定性 seek/reset | CLI/GUI 同帧一致 |
| MR3 | **已完成**(2026-08-29,`src/Resource/MmdSimulationClock.h/.cpp`):实时 Advance + 1/60 累加器钳制(≤4 步);离线逐帧与 GUI 同帧;seek 清债 + Reset 语义不变 | 双 seek 同帧截图一致;离线帧与 GUI seek 帧一致;clock 单测入 PmxLoaderTests |
| MR4 | renderer 消费 `MmdFrameOutput` | `D3D12Renderer` 不再实现动画求值 |
| MR4 | **已完成**(2026-08-29,2026-09-04 补齐 bone morph,`src/Resource/MmdRuntime.h/.cpp`):EvaluatePose/EvaluateMorphs/TickPlayback 无 D3D12 依赖;renderer 只做 palette/deformedVertices 的 upload 发布；bone morph 与 vertex morph 共用 group 展开后的权重快照，平移/旋转在 FK 前进入实例 pose | PmxLoaderTests 含 90 帧物理确定性与 bone morph 的解析镜像、骨骼映射、group 权重、位移/旋转和缓存回归;CLI 编辑路径(ik/key/undo)回归通过 |
| MR5 | 多实例与 GPU deformation。**已完成**(2026-08-31):同路径 entry 共享 immutable `MmdAsset`、PMX parsed extras 与 GPU morph twin；scene replacement 保留新场景 cache，后续 `scene.add` 不重复扫描；clip 写入口采用 copy-on-write，pose/morph cache 随 clone 失效；morph 装配使用完整 32 位 submesh/local vertex 地址 | 同资产多角色独立播放；实机 load+add 日志 1 parse/2 reuse |

每阶段独立提交；MR2 前不得启动多角色编辑功能，MR4 前不得删除现有兼容转发器。

## 9. 验收

- 单角色 Gene + Wavefile 输出与迁移前截图一致；
- 同一 `MmdAsset` 两个 instance 的 clip、morph、physics 互不影响；
- 固定输入连续运行两次，指定帧 bone palette 与截图一致；
- PMX 文件只执行一次 extras parse；
- runtime 单元测试不创建 D3D12 device；
- scene unload 后 asset cache、physics instance 和 GPU deformation 资源均可独立回收。
