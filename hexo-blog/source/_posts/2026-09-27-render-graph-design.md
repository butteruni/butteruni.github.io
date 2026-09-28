---
title: "Render Graph 设计稿(Phase 1 / v1)"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-28T20:56:00+08:00"
permalink: 2026/09/27/render-graph-design/
categories:
  - 图形学
tags:
  - astra
  - 技术文档
  - 渲染架构
---

> 由 astra 生成 · 首次发布于 2026-09-27 18:44 · 最近整理于 2026-09-28 20:56（北京时间）

> 本文描述当前单队列 RenderGraph。RG2-0 至 RG2-4 已生成资源版本、依赖审计、typed
> texture/buffer handle 与稳定拓扑，并由拓扑驱动执行；compiled barrier target 与 lifetime
> 也已落地；aliasing 与 multi-queue 的条件式长期路线见
> `Docs/render-graph-v2-design.md`；v2 不在本文上
> 原地扩写，避免把当前约束和未来编译模型混为一谈。

> 2026-08-04 起稿。目标:新增渲染效果 = 新建自包含 pass 模块,**不碰
> D3D12Renderer.cpp**。本文档覆盖:现状盘点、资源生命周期、屏障推导、
> 与现有 FrameGraph 的迁移映射、实施步骤。

<!-- more -->

## 当前资源驻留约定（2026-09-27）

`CompileForExecution()` 按选定执行图的 `ResourceLifetimes` 分配 graph-owned 纹理。
未使用的纹理不分配，停用的纹理释放；`persistent` 仅允许活跃期间跨帧保留内容，
不意味着停用后常驻。图外使用的 sceneHDR、sceneColor、depth、gnormal 显式标记
`RGTextureDesc::externallyUsed`，不依赖虚构的 Pass 来维持分配。

驻留切换先通过 `Initialize()` 注入的 GPU-idle 回调完成同步，再释放资源并改写描述符；
未提供回调时拒绝改变已发布的驻留状态。`BuildFrameGraph()` 位于本帧命令记录与
`BeginFrameDescriptors()` 之前，防止帧描述符副本保留旧资源。所有 owned 纹理均保留
稳定 SRV 槽，预留 UAV 同样保槽；未分配或释放后写入合法 null view，重新启用复用原槽。

`AllocationRevision()` 在实际创建/释放时变化，renderer 据此重置 temporal histories；
不变的执行图复用编译结果和历史内容，不逐帧等待 GPU。`RecreateSizedResources()` 仅释放
宽或高依赖主分辨率的纹理，保留固定尺寸资源；下采样尺寸最低为 1，后续 compile 只重建
仍活跃的纹理。当前仍使用独立 committed allocations，尚未实现 texture pooling/aliasing。

`PeanutGpuResourceValidationTests` 以 WARP 和真实 shader 访问覆盖 null SRV/UAV、
启停切换、同步次数、跨帧历史内容、resize、描述符稳定性及 inactive committed bytes 为零。

## 1. 迁移起点（2026-08 历史记录）

### 1.1 现有"FrameGraph"实际是什么

`src/Renderer/FrameGraph.h`:一个**有序 pass 列表**。`reads`/`writes`
注解(`FrameGraphResource` 枚举)目前**没有任何消费者**——不参与屏障、
不参与分配,纯文档。执行路径:`BuildFrameGraph()`(D3D12Renderer.cpp:3265)
按固定顺序 AddPass → `PopulateCommandList()`(2723)线性遍历执行。

### 1.2 资源是怎么到 pass 手里的(痛点清单)

以 SSGI 为例,接一个新纹理要动 5 处:

1. `CreateSceneColorResources()`(4150):手工建纹理 + RTV heap 槽位
   (`NumDescriptors=9`,索引 0-8 写死)
2. `CreateSceneColorSRV()`(4338):手工建持久 SRV(索引在 LoadAssets 里
   `m_persistentDescriptors.Allocate()` 出来,1682-1691)
3. `SSGIPass::SetTargets/SetSrvIndices` 签名扩参
4. 两处调用点(758 resize 路径 / 3119 初始化路径)同步改
5. resize 清理列表(714-718)手工 Reset

### 1.3 已有基础设施(要复用,不重造)

- `ResourceStateTracker`:逐资源(含逐 subresource)状态跟踪,`Transition`
  幂等——屏障推导的执行器直接用它。子资源数量包含 format plane：depth/stencil
  分别跟踪；Texture3D 的 depth slices 不当作 array slices。`PeanutGpuResourceValidationTests`
  用真实 D3D12/WARP + GPU 验证覆盖双平面 clear、混合 plane 状态、3D mip 和纹理数组。
- `PersistentDescriptorAllocator` / `FrameDescriptorHeap`(transient 每帧)
- `RenderPassContext`:pass 的上下文注入通道(保留,瘦身)
- 设置注册表:bool/float 一行式,pass 开关经 `ShouldExecute()`

### 1.4 资源清单(全部要纳入 graph 管理)

| 资源 | 格式 | 尺寸 | 生命周期 | 生产者 → 消费者 |
|---|---|---|---|---|
| sceneHDR | R16G16B16A16F | 全屏 | 持久 | 几何 → SSGI/PT/FXAA |
| sceneColor(LDR) | R8G8B8A8 | 全屏 | 持久 | FXAA → 截图/预览 |
| depth | D32 | 全屏 | 持久 | 几何 → SSAO/SSGI/HiZ |
| gnormal | R16G16B16A16F | 全屏 | 持久 | 几何(MRT)→ SSAO/SSGI |
| ssao raw/blur | R8 | 全屏 | 持久 | SSAO → 几何 PS |
| ssgi raw / blur / hist×2 | R16G16B16A16F | 半屏 | raw transient；**跨帧**(blur/hist) | SSGI → 几何 PS |
| shadow map | D32/R32 | 2048² | 持久 | Shadow → 几何 PS |
| HiZ pyramid | R32F×mips | 全屏 | 持久 | HiZ → 剔除 CS |
| PT accum | R32G32B32A32F | 全屏 | **跨帧** | PT 自反馈 |
| backbuffer | R8G8B8A8 | 全屏 | 导入(swapchain) | FXAA → Present |
| skybox cubemap | UNORM/FLOAT | 小 | 导入(SkyboxPass 自持) | Skybox/IBL/PT |
| IBL 三件套 | FLOAT | 小 | 一次性生成 | IBLPass → PBR |

不在 graph 内:per-entry 几何/实例/节点 buffer(GPU-driven 套)、材质纹理、
光照 CB——pass 内部自持,与 graph 无关。

## 2. 核心设计

### 2.1 执行模型：稳定拓扑、单队列

`PassFrameCatalog` 给出偏好顺序，`CompileForExecution()` 根据资源依赖和显式
`Before`/`After` 选择稳定拓扑。独立节点保留偏好顺序；选定顺序同时用于命令记录、
resource version、barrier plan 和 lifetime。仅选中 Pass 的访问参与按需资源分配。

### 2.2 资源三类

- Imported：`ImportTexture`/`ImportBuffer` 提供回调，graph 不拥有分配；例如 backbuffer、
  skybox、shadow map、HiZ 与 PT accumulation。
- Transient：`CreateTexture` 且 `persistent=false`，只在活跃图使用期间驻留；例如 SSAO、Bloom。
- Persistent：`CreateTexture` 且 `persistent=true`，允许读取跨帧 version 0；例如 SSGI history。
  持续活跃时保留内容，停用后释放，重新启用必须重置历史有效性。

句柄与描述:

```cpp
struct RGTextureHandle { uint32_t index; uint64_t generation; };
struct RGBufferHandle  { uint32_t index; uint64_t generation; };

struct RGTextureDesc
{
    uint32_t width = 0, height = 0;
    uint32_t scaleDivisor = 1;
    DXGI_FORMAT format;
    bool renderTarget, unorderedAccess, depthStencil;
    bool persistent = false;
    bool externallyUsed = false;
    // Zero dimensions follow the main resolution; omitted fields define views and clear values.
};
```

### 2.3 Pass 声明(新效果的全部接线)

```cpp
const FrameGraphResources& resources = context.graphResources;
graph.AddPass("SSGI")
    .Reads(resources.depth, RGAccess::ReadSRV_PS)
    .Reads(resources.gnormal, RGAccess::ReadSRV_PS)
    .Reads(resources.sceneHdr, RGAccess::ReadSRV_PS)
    .Writes(resources.ssgiRaw, RGAccess::WriteRT)
    .Writes(resources.ssgiHistory[0], RGAccess::WriteRT);
```

graph 在编译期完成按需分配/释放、稳定 RTV/SRV 槽维护与屏障计划。
Pass 的 `Execute` 里只做绑定和 draw/dispatch。
C++ lambda 或保留 RenderPass 子类均可——**迁移期保留子类**,新效果推荐
lambda(文件即模块)。

### 2.4 屏障推导

规则(编译期逐 pass 生成,执行期零判断):

- 同一资源相邻两次访问状态不同 → pass 边界插 `Transition`(经
  ResourceStateTracker,幂等兜底)
- RT/DSV 写 → 后续 SRV 读:自动插 RT→SRV
- UAV 写 → UAV 写/读:插 `UAV barrier`
- 跨帧读(hist/accum):资源在 graph 注册时带初始状态,帧末状态即下帧
  帧初状态,tracker 天然连续——无需特殊处理
- 导入资源声明进入状态(backbuffer=PRESENT→RT→PRESENT,由 graph 首尾各插一次)

GBV 纪律:所有 barrier 必须过 tracker(现有探针日志通道不变)。

### 2.5 跨帧资源与"读上帧"

SSGI 读上帧 sceneHDR、写本帧;hist ping-pong。规则:

- Persistent 资源允许在本帧 producer 之前 `Reads`，但首次分配的内容无效，
  temporal Pass 必须自行初始化或避开历史采样。
- ping-pong 由 pass 自持索引(现状如此),两张纹理都是 Persistent 注册项
- 停用和 resize 均可能释放历史纹理；`BuildFrameGraph` 检测 allocation revision
  变化后调用 `ResetTemporalHistories()`，不能依靠新资源恰好复用不同地址来判断有效性。

### 2.6 描述符分配

- **RTV/DSV**：graph 集中持有 heap，首次驻留时分配槽，重建复用原槽；
  未驻留的 owned texture 经 `GetRtv()` 返回空句柄。
- **SRV/UAV**：owned 纹理使用稳定持久槽，停用时写 null descriptor；
  每帧通过 `BeginFrameDescriptors()` 发布并复制到当前 frame heap。
  Imported 的描述符仍由资源所有者管理。
- pass 不再出现 `rawRtvIndex=5` 这类魔数

## 3. 迁移映射(现有 FrameGraph → RG)

| 现状 | 迁移后 |
|---|---|
| `BuildFrameGraph()` 手工 AddPass + SetDependencies | 同序 AddPass,读写声明替代 dependencies(`AreDependenciesReady` 由 graph 顺序保证,删除) |
| `SetTargets/SetSrvIndices`(SSAO/SSGI/FXAA/Shadow) | 删除；内置名初始化时集中解析为 `FrameGraphResources`，pass 只使用 typed handle |
| `CreateSceneColorResources/CreateSceneColorSRV` | 拆成 graph 的资源注册表(一张声明表) |
| `m_sceneRTVHeap` 手工索引 0-8 | graph RTV heap 自动分配 |
| pass 内 `TransitionResource(...)` | 删除,graph 插;pass 内禁止裸 ResourceBarrier(tracker 断言) |
| resize 手工 Reset 列表(714-718) | graph `RecreateSizedResources` 释放依赖分辨率的纹理，compile 按活跃图重建并重置历史 |
| `RenderPassContext` 大杂烩 | 瘦身:renderer 指针 + 帧绑定 + RGPassContext(资源访问器) |
| `ExecuteGpuDrivenCulling()`( PopulateCommandList 内联) | v1 保持 graph 外(graph 前的预阶段);v2 考虑做成 compute 节点 |
| IBL 一次性生成(InitializeIBL) | 保持一次性旁路(非帧内 pass),但其输出注册为 Imported 供 graph 引用 |

## 4. 实施步骤(每步可独立验证、可提交)

1. **RG 核心 + 试点**(2026-08-05 完成):`RenderGraph.{h,cpp}`(资源注册表:
   提供者回调式 Import,pass 读写声明,ApplyBarriers 经 tracker;Compile 做
   声明校验),FXAA 已迁移——SetTargets/SetSceneTexture 等手工接线删除,
   双轨运行(执行循环未动,profiler/Tracy 不变)。
2. **几何链迁移**(2026-08-05 完成):Skybox/PBR/Forward/Shadow 全部走 graph
   声明(sceneHDR/gnormal/depth/shadowMap/skybox 注册为 Imported,提供者回调
   供 RTV/DSV/SRV);`SetRenderTargets/SetExternalRTV/SetDescriptorHeaps` 接线
   全删;`SetRenderGraph` 提到 RenderPass 基类。附带修复:Forward pass 此前漏了
   gnormal 的 SRV→RT 回转,现由 graph 声明统一保证。验证:光栅/PT 截图一致、
   GBV 零报错、profiler 全 pass 计时在、四套测试绿。
   **2026-09-08 ZZZ 阴影扩展**:`characterShadowMap` 作为第二张 Imported
   DSV/SRV 加入同一 `ShadowPass` 节点；PBR 声明同时读取相机 CSM 与角色
   per-object 阴影，graph 在 caster 写入与角色/场景采样之间统一插 barrier。
3. **屏幕空间效果迁移**(2026-08-06 完成):RG 首次自持资源——
   `CreateTexture`(Persistent/Transient,graph RTV heap + 持久 SRV 槽,
   scaleDivisor 半分辨率,resize 经 `RecreateSizedResources` 重建保槽)。
   SSAO/SSGI 全迁(含 SSGI hist ping-pong:两张 Persistent 注册,ping-pong
   知识留 pass 内);`SetTargets/SetSrvIndices` 家族与
   `CreateSceneColorResources` 里 6 张手工纹理、sceneRTVHeap 槽 9→3、
   6 个手工 SRV 槽全部拆除;PBR/Forward 末尾双轨转态删除(消费端声明全覆盖)。
   坑:迁移时漏接 `m_ssaoNoiseSrvIndex`(UINT_MAX 描述符在 SCQV 下记录期
   崩进程)——pass 自持描述符也要列进迁移清单。RG2-0 复核时将 `ssgiBlur`
   修正为 Persistent，因为几何 pass 在 SSGI 写入前读取的是上一帧结果。
4. **HiZ + 剔除接入**(2026-08-06 完成):HiZPass 进 graph(声明 depth NonPS
   读;金字塔逐 mip subresource 转态属 pass 内管理,graph v1 不建模,资源
   "hiZ" 走 Imported);`SetResources` 瘦身为 `SetHiZInfo`(uavBase/mipCount/
   尺寸,resize 更新)。GPU-driven 剔除段保留 graph 外预阶段(v1 决策)。
5. **PT 模式**(2026-08-06 完成):PathTracePass 进 graph(声明 skybox
   NonPS 读 + sceneHDR/ptAccum UAV 写;ResourceEntry 扩 `uavIndex` 槽);
   `SetAccumTexture/SetSkyboxSrvIndex/SetSceneHdrUavIndex` 删除,Populate
   CommandList 里的 skybox 手工转态删除(声明覆盖)。验证:光栅/PT 截图
   一致、HiZ ready、GBV 零报错、四套测试绿。
6. **拆除**(2026-08-06 完成):旧 `FrameGraph.h` 删除;pass 顺序改为
   BuildFrameGraph 里显式 push_back;dependencies 机制
   (SetDependencies/AreDependenciesReady/m_dependencies,10 个 pass 的
   空壳 override)全部移除,执行循环只看 ShouldExecute。验证:截图一致、
   PT 正常、GBV 零报错、四套测试绿、profiler 全量计时在。
7. **验收效果:Bloom**(2026-08-06 完成):新 pass(BloomPass:threshold →
   可分离高斯 H/V)+ 2 张 transient 半分辨率纹理 + composite(FXAA)HDR 域
   加算。设置:`render.bloom` / `render.bloom.threshold` /
   `render.bloom.intensity`。接线成本实测:新 pass 文件 + BuildFrameGraph
   2 行声明 + pass 列表 1 行 + 注册表 3 行,零资源/描述符手术。**踩坑记录**:
   D3D12Renderer 当时的 pass 清单有三处(InitializeRenderPasses 初始化、
   UpdateRenderPassContext 的 SetContext、BuildFrameGraph 的 m_renderPasses)
   ——新 pass 漏进 SetContext 清单导致 context 为空、Execute 静默早退
   (profiler 有标签但 GPU 0ms),靠逐层可视化(bloomA 直通输出/纯色输出/
   分屏对比)定位。**2026-08-17 后续已完成**：`PassFrameCatalog` 成为 graph
   声明、SetContext、初始化和执行顺序的唯一帧目录；新增 pass 仍需一处构造和一处
   catalog entry，但不再维护第二份 context/执行清单。
   PT 模式下 bloom 停用(FXAA 端 intensity 置 0,避免叠上帧残留)。

8. **Shader 热重载**(独立小步,不在迁移关键路径上)。

9. **RG2-1 typed handle**(2026-09-13 完成):资源注册显式区分 texture/buffer；
   `FrameGraphResources` 在注册结束后一次解析所有内置纹理，pass 声明与执行不再按名字查找；
   Pipeline Asset semantic 在 plan 编译边界解析并校验类别，MRT/DSV 只接受 texture，SRV/UAV
   同时支持 texture 与 buffer；generation 在 `Reset` 后使旧句柄确定性失效。执行顺序、barrier
   提交和底层资源生命周期均保持不变。

10. **RG2-2 stable topology 影子编译**(2026-09-13 完成):资源版本依赖与显式
    `Before`/`After` 合并为 topology dependency，稳定 Kahn 排序以现有实际顺序作为
    tie-break；Pipeline Asset DAG 的 `after` 会保留到 runtime 并进入 graph。未知约束和闭环
    在 compile 阶段拒绝，cycle 错误带完整路径。影子顺序只用于审计，尚不改变 pass 执行。

11. **RG2-3 topology 接管执行**(2026-09-13 完成):renderer 把 catalog 顺序作为稳定偏好交给
    `CompileForExecution`，graph 选择拓扑后以该顺序重新生成 resource version/dependency，
    `m_renderPasses` 再按同一结果排列。独立节点保持 catalog tie-break；只有资源边或显式约束
    能影响顺序。当前 barrier 仍由 pass 开始时经 tracker 应用，留待 RG2-4 编译化。

12. **RG2-4 compiled barrier/lifetime**(2026-09-13 完成):每个 compiled pass 保存目标状态
    access plan，并由 generation-safe `PassHandle` 直接选取；内置 pass 不再以名字回查声明。
    `ResourceStateTracker` 继续根据真实跨帧 before-state 发出 transition，pass 内部逐 mip/中间
    子阶段 barrier 仍留在 pass。compiler 同时输出每个 graph-declared 资源的 first/last use 与 Imported/
    Persistent 分类，为 RG2-5 aliasing 提供已验证的 lifetime 输入，但本阶段不共享物理内存。

13. **RG2-5 gate telemetry**(2026-09-13 完成，实际 aliasing 延期):`render.memory.get` 增加
    transient committed/active/inactive、alias slot、planned heap 与 potential savings。
    1080p 雷米埃尔完整管线的保守上限仅 6.8125 MiB（当前显存使用约 0.995%），不进入高风险
    placed-texture/aliasing-barrier 实现；具体证据见 v2 文档 §7.1。

14. **RG2-6 profiler gate**(2026-09-13 完成，multi-queue 延期):30 帧样本中可直接迁移的
    HiZ + ParticleSimulate GPU p95 合计约 0.0449 ms；较重的 SSAO/SSGI 是 pixel pass。
    当前不增加第二 command queue、跨队列 fence 或兼容执行双轨，证据见 v2 文档 §8.1。

15. **按需驻留**（2026-09-27 完成）：执行图驱动 owned texture 分配与停用释放，
    包含 persistent history；图外访问显式标记，描述符保槽并使用 null view。
    GPU 同步、帧描述符发布和历史失效顺序集中处理，固定尺寸资源不随 viewport resize 重建。

每步验证:4 套测试 + 默认场景截图对比(迁移前后像素一致)+ GBV 零报错
+ `profiler.get` 无回退。

## 5. 当前不做

- 自动并行记录/提交
- 多队列/async compute
- transient texture pooling/aliasing（保留 telemetry 作为启动条件）
- 可视化 graph 编辑器
- 把 per-entry 几何/实例 buffer 纳入 graph(pass 内部自持更合适)

## 6. 风险与对策

- **双轨期两套资源并存**显存翻倍:迁移期瞬时可接受(资源都小),按步骤
  收一个删一个
- **屏障漏推导致画面错**:graph 提供 `render.graph.debug_barriers` 开关,
  打印每 pass 屏障计划;PT 基准 + 截图对比兜底
- **pass 内裸 barrier 绕过 graph**:迁移完成后 `TransitionResource` 仅
  graph 内部可用(RenderPass 上的 protected 助手删除)
