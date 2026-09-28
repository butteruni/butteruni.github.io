---
title: "Peanut 渲染器 GPU 内存架构设计"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-28T20:56:00+08:00"
permalink: 2026/09/27/renderer-memory-architecture/
categories:
  - 图形学
tags:
  - astra
  - 技术文档
  - 渲染架构
---

> 由 astra 生成 · 首次发布于 2026-09-27 18:44 · 最近整理于 2026-09-28 20:56（北京时间）

状态：Implementation-ready design
日期：2026-08-27
适用范围：DX12 渲染器、PathTrace、RenderPrimitive、后续 DDGI/XPBD

2026-09-19 更新：本文件保留 arena 设计与历史迁移计划；当前 Mesh 拆流、共享 LOD 池和
变形输出的实现状态补充于 §3.2、§3.5。最新数据流契约见
[Mesh 渲染数据流](/2026/09/27/mesh-render-data-flow/)，历史 `CreateCommittedResource` 数量不代表当前统计。

## 1. 目标

当前渲染器大量直接调用 `ID3D12Device::CreateCommittedResource`。这种方式简单，
但每个资源都对应独立的 D3D12 allocation，场景复杂度提高后会增加驱动对象数量、
分配延迟和显存碎片，也无法为 DDGI 探针体、XPBD 粒子池与 RenderGraph transient
资源提供统一的预算和诊断。

<!-- more -->

本设计的目标是：

1. 为生命周期一致的 DEFAULT heap buffer 提供引擎自有的 placed-resource arena。
2. 保持场景加载、追加和回滚的事务语义；分配失败不得破坏当前可渲染场景。
3. 让显存使用可观测：区分 requested bytes、heap bytes、alignment waste、专用大页和
   committed fallback。
4. 为 DDGI/XPBD 建立可复用的分配入口，但不提前实现通用 free-list 或纹理 aliasing。
5. 不把 D3D12 类型泄漏到 `EditorRenderOps`；内存管理只存在于具体 DX12 渲染器层。

## 2. 非目标

- 不恢复已经删除的 MiniEngine `BuddyAllocator`。
- Phase 1 不引入 D3D12 Memory Allocator（D3D12MA）依赖。
- Phase 1 不迁移 UPLOAD/READBACK heap；这些资源仍使用 committed allocation。
- 不把 RenderGraph transient texture aliasing 混入场景 buffer arena。
- 不尝试跨模型、跨帧或跨场景复用同一 arena allocation。
- 不改变 descriptor allocator、resource state tracker 或渲染输出。

## 3. 当前证据

截至 2026-08-27，`src/Renderer` 与 `src/Graphic` 中共有 68 个
`CreateCommittedResource` 调用点。主要集中在：

| 模块 | 调用点数量 | 主要生命周期 |
|---|---:|---|
| `D3D12Renderer.cpp` | 30 | 全局、每帧、GPU-driven、默认纹理 |
| `ResourceManager.cpp` | 8 | 模型 VB/IB、纹理及上传缓冲 |
| `SkyboxPass.cpp` | 8 | 环境贴图和上传资源 |
| `PathTracePass.cpp` | 3 | BVH buffer 与常量缓冲 |
| `D3D12Renderer_Scene.cpp` | 4 | 实例数据和 identity visible-id |
| 其他 render pass | 15 | pass-owned RT、UAV、readback |

最重要的生命周期组如下：

### 3.1 PathTrace BVH

`PathTracePass::UploadSceneBvh` 同时重建四个 DEFAULT buffer：

- triangles；
- UV；
- BVH nodes；
- materials。

四个资源总是一起创建、一起替换、一起销毁，且在命令提交后只读。这是 bump arena
的理想首个迁移对象。四个上传缓冲只存在到 copy 完成，Phase 1 保持 committed。

当前 BVH 的几何输入由 RenderData semantic reader 预解码为紧凑位置、UV 与索引缓存，
再展开节点和实例；不会将共享 VB 字节按 `Vertex` 强转。节点与材质仍来自 Mesh。
这改变 CPU 构建输入，不改变上述四个 DEFAULT buffer 的所有权边界。

### 3.2 RenderPrimitive 稳定资源

`ResourceManager::LoadModelResources` 创建模型 VB/IB。它们与模型 entry 同寿命，
不会因实例增删而变化，适合独立 `geometryArena`。

2026-09-19 起，arena 按 `MeshRenderData::Lod::buffers` 的资源表分配，不再使用
`2 * submesh` 推算 VB/IB。`D3D12MeshLod` 保存非拥有的资源引用，section 可以共享
buffer 并选择各自范围；布局与绘制契约见 [Mesh 渲染数据流](/2026/09/27/mesh-render-data-flow/)。

标准资产当前默认构建四路共享 LOD 顶点池和一个共享索引池：

| 池 | 每顶点普通记录 | section 常量策略 |
|---|---:|---|
| Position | 12 字节，Float3 | 保留所有记录，不使用 stride 0 |
| Surface | 60 字节，Normal/Tangent/四组 UV | 整组逐字节相同时存单记录、stride 0 |
| Color | 16 字节，Float4 | 整组逐字节相同时存单记录、stride 0 |
| Skin | 32 字节，UInt32x4 indices + Float4 weights | 整组逐字节相同时存单记录、stride 0 |
| Indices | 每索引 2 或 4 字节 | 各 section 按最大索引选 UInt16/UInt32，池内按元素宽度对齐 |

每个 section 的 VBV/IBV 指向各池中的独立字节范围，常量压缩不改变顶点数和源编号。
资源数量固定为每 LOD 五个，减少多 section 的资源对象和 placement 对齐开销；单 section
模型的资源数可能增加，实际 heap 节省应以 `requested_bytes`、`heap_bytes` 和 waste 衡量。
无常量组时顶点总 payload 仍为每顶点 120 字节，不能把拆流本身等同于十倍静态显存缩减。
这些池只在同一 LOD 内共享，尚不构成跨 RenderPrimitive 的通用 geometry cache。

已有 character/capture profile 显式选择 `VertexLayout::Interleaved`，保留每 section 一对
120-byte VB 与 UInt32 IB，以兼容固定 shader 输入；截帧逆向继续暂停。normal/tangent/UV
的量化压缩、自动 LOD 选择和 streaming 未在本轮实现。

### 3.3 RenderPrimitive 可重建资源

`CreateInstanceResources` / `CreateGpuDrivenResources` 创建：

- instance data；
- identity/culled visible instance ids；
- visible counts；
- indirect args；
- submesh metadata；
- node world；
- bone matrices。

这些资源会在 `RebuildInstanceResources` 中整体替换，因此必须放入独立
`instanceArena`，不能和 VB/IB 共用一个 arena。否则一次 instance.duplicate/delete
会迫使稳定几何资源一起重建。

### 3.4 RenderGraph 资源

SSAO、SSGI、Bloom、Outline、PathTrace accumulation 等纹理存在跨 pass 读写和潜在
aliasing。它们应使用后续的 transient texture allocator，不能进入本设计的
buffer-only arena。

### 3.5 变形输出与 CPU 几何缓存

静态 `geometryArena` 始终只读。CPU morph 使用独立 `cpuMorphArena`，GPU morph 使用
entry 独立的 UAV 输出；两条路径都由 `SelectMeshBatch` 按当前 morph 版本选择输出 view。
拆流资产只输出/上传 12-byte float3 position 并覆盖 slot 0，另外三路流和 IB 继续引用静态池；
旧 Interleaved 资产仍使用 120-byte 输出。CPU upload 按 frame slot 分片并等待对应 fence，
GPU 输出依靠队列执行顺序和资源状态转换串联 dispatch 与 draw。

共享的 `MmdAssetMorphGpu::arena` 保留 headers、deltas 和 canonical 120-byte 基础顶点，
供同一 MMD 资产的不同布局 entry 使用。因此显存统计需要同时计入静态渲染池、共享 morph
基础资源和实例输出，不能只计 12-byte position。GPU 输出目前仍是单个 committed DEFAULT
UAV，未迁移到静态 geometry arena；CPU 输出按源 submesh 分配 placed buffers，按需创建。
previous-frame position 与 tangent/normal 变形资源尚未实现。

CPU occlusion 在 PrepareScene 时从 RenderData 解码并压紧被引用的顶点，再建立 SDOC 输入；
PT 构建阶段同样先解码，避免每实例重复解析 semantic 和 buffer 范围。CPU picking 仍读取
Mesh。上述 CPU 缓存及 RenderData CPU payload 不属于 DEFAULT heap 的 requested bytes。

布局对应的 PSO 缓存由 runtime program generation 持有，不放在 geometry arena 中。
热重载先构建 staging generation，并预热上一代已使用的布局变体；失败保留整个旧代，
成功后沿已有 GPU 退休时序释放旧 shader、root signature 和 PSO。共享 VB 池不改变这条
独立的 pipeline 生命周期。

## 4. 方案选择

| 方案 | 优点 | 风险 | 决策 |
|---|---|---|---|
| 继续 committed | 最少代码 | 驱动 allocation 数量持续增长，无统一预算 | 拒绝 |
| 恢复旧 BuddyAllocator | 已有历史实现 | 与当前资源所有权、回滚和 RenderGraph 不匹配 | 拒绝 |
| 直接引入 D3D12MA | 成熟、功能完整 | 新依赖较重；首迁移只需要同生命周期 batch arena | 暂缓 |
| 引擎自有 placed-resource arena | 边界小、行为透明、易于事务 swap | 后续 free-list/aliasing 仍需独立设计 | 采用 |

D3D12MA 的重新评估触发条件：

- 需要跨 entry 回收任意大小的长期 allocation；
- dedicated heap 数量仍超过预算；
- DDGI/XPBD 需要频繁 resize 且整 arena rebuild 成本不可接受；
- 需要 residency priority、budget pressure 或 defragmentation 支持。

## 5. 核心设计

### 5.1 模块位置

新增模块建议：

```text
src/Renderer/GpuMemory/
  PlacedResourceArena.h
  PlacedResourceArena.cpp
  GpuMemoryStats.h
```

模块属于具体 DX12 渲染器，不进入 `EditorRenderOps`。

### 5.2 Arena 类型

Phase 1 只实现 `DefaultBufferArena`：

- heap type：`D3D12_HEAP_TYPE_DEFAULT`；
- heap flags：`D3D12_HEAP_FLAG_ALLOW_ONLY_BUFFERS`；
- allocation policy：一次 batch 构建、线性排列、整体销毁；
- resource type：buffer；
- resource state：由 request 指定，通常从 `COMMON` 开始；
- page count：一个 arena 默认一个 shared heap；单请求超过普通 page 阈值时，每个超大请求创建一个 dedicated placed heap；
- free policy：无单项 free，`Reset()` 整体回收。

Phase 1 不需要 free-list，因为迁移对象都具有共同生命周期。不要在首版加入 buddy、
slab、best-fit 或跨 arena page 合并。

### 5.3 建议 API

```cpp
struct PlacedBufferRequest
{
    UINT64              byteSize;
    D3D12_RESOURCE_FLAGS flags;
    D3D12_RESOURCE_STATES initialState;
    const wchar_t*      debugName;
};

struct PlacedBufferAllocation
{
    UINT64 offset;
    UINT64 size;
    UINT64 alignment;
    Microsoft::WRL::ComPtr<ID3D12Resource> resource;
};

class DefaultBufferArena
{
  public:
    void Build(ID3D12Device* device,
               std::span<const PlacedBufferRequest> requests,
               const wchar_t* heapName);
    void Reset();

    ID3D12Resource* Get(size_t index) const;
    const GpuMemoryStats& GetStats() const;

  private:
    Microsoft::WRL::ComPtr<ID3D12Heap> m_heap;
    std::vector<PlacedBufferAllocation> m_allocations;
    GpuMemoryStats m_stats;
};
```

实现时 arena 应拥有 placed resources 和 heap。成员销毁顺序必须保证 resources 先于
heap 释放；`Reset()` 也必须先清空 resources，再释放 heap。

### 5.4 布局算法

对每个 request 创建 `CD3DX12_RESOURCE_DESC::Buffer(byteSize, flags)`，然后调用：

```cpp
device->GetResourceAllocationInfo(0, 1, &resourceDesc);
```

布局规则：

```text
offset[0] = 0
offset[i] = AlignUp(offset[i-1] + size[i-1], alignment[i])
heapSize  = AlignUp(offset[last] + size[last], heapAlignment)
```

必须使用设备返回的 `SizeInBytes` 和 `Alignment`，不能假设所有 buffer 永远是 64 KiB。
`heapAlignment` 取默认 resource placement alignment 与所有 request 返回 alignment 的
最大值；创建 heap 时 `D3D12_HEAP_DESC::Alignment` 保持 0，让运行时选择合法值。
`SizeInBytes == UINT64_MAX` 视为布局失败。所有加法与 AlignUp 必须检查 `UINT64`
overflow。

heap 创建完成后，按计算出的 offset 调用 `CreatePlacedResource`。任一 resource 创建失败
时销毁 staging arena 并抛出；调用者的 live arena 不变。

### 5.5 Heap Tier

初始化时查询 `D3D12_FEATURE_D3D12_OPTIONS::ResourceHeapTier`，写入日志与 memory stats。

Phase 1 无论 Tier 1/2 都使用 `ALLOW_ONLY_BUFFERS`，从而保持相同行为。Tier 2 不自动
切换为混合 heap。纹理 arena 必须在单独设计通过后才能利用 Tier 2。

### 5.6 事务替换

任何 arena rebuild 都使用 staging + swap：

```text
live arena/resources
        |
        | Build staging arena
        v
record copy commands -> submit -> WaitForGpuIdle
        |
        | success
        v
untrack old resources -> swap staging/live -> destroy old arena
```

失败路径：

1. staging build 失败：销毁 staging，live 不变；
2. command recording 失败：关闭/丢弃命令列表，销毁 staging，live 不变；
3. submit/wait 失败：报告 device error，不尝试用半上传资源替换 live；
4. descriptor 写入只在所有 resources 创建成功后进行；
5. `ResourceStateTracker` 必须先移除 old resource，再释放对应 ComPtr/heap。

禁止在 arena 内静默退回 committed resource。这样会掩盖预算错误并让 telemetry 失真。
超过普通 page 阈值的资源使用 dedicated placed heap，仍走同一统计路径。

## 6. 分阶段迁移

### Phase 0：观测基线

新增 `GpuMemoryStats`，至少包含：

```text
heap_count
placed_resource_count
requested_bytes
allocation_bytes
heap_bytes
alignment_waste_bytes
dedicated_heap_count
committed_default_buffer_count
```

同时通过 `IDXGIAdapter3::QueryVideoMemoryInfo` 采集：

```text
local_budget_bytes
local_current_usage_bytes
local_available_for_reservation_bytes
```

建议 CLI：`render.memory.get`。Stats 面板读取同一快照，不自行查询 DXGI。

### Phase 1：PathTrace BVH arena

修改范围：

- `PathTracePass.h/.cpp`；
- 新增 `GpuMemory/PlacedResourceArena.*`；
- 新增布局单测。

迁移四个 DEFAULT BVH buffer。常量缓冲和四个上传缓冲保持 committed。

验收：

- 每次 `UploadSceneBvh` 只创建一个 DEFAULT buffer heap；
- 四个 placed resources 的 GPU VA、SRV 与 copy 结果正确；
- scene.load 重建前先从 state tracker 移除旧四个 resource；
- cube/Sponza 往返后 heap/resource 计数回到稳定值；
- PathTrace 输出与迁移前无可见差异。

### Phase 2：RenderPrimitive 双 arena

为每个 `RenderPrimitive` 增加：

```text
geometryArena  # VB/IB，entry lifetime
instanceArena  # instance/culling/node/bone，instance rebuild lifetime
```

迁移顺序：

1. identity visible-id 与 instance data；
2. culled ids / counts / indirect args / metadata；
3. node world / bone matrices；
4. VB/IB。

每一步独立提交和验证。不要一次迁移全部资源。

`RebuildInstanceResources` 只替换 `instanceArena`。`scene.add` 为新 entry 创建自己的两个
arena，不触碰既有 entry。`ReleaseRenderPrimitiveResources` 的固定顺序为：

```text
WaitForGpuIdle
unmap upload buffers
ResourceStateTracker::RemoveResource
reset placed resource handles
reset instanceArena / geometryArena
clear CPU views and caches
```

### Phase 3：DDGI/XPBD 专用 arena

DDGI：probe state、irradiance、distance 和 update list 分成 buffer arena 与 texture arena；
不得复用 RenderPrimitive arena。

XPBD：particle/constraint buffer 按 simulation capacity 建 arena。capacity 改变时 staging
重建并 swap，不允许在帧中原地扩容。

### Phase 4：RenderGraph transient texture aliasing

单独设计：需要 pass lifetime interval、aliasing barrier、RT/DS clear-value compatibility 和
heap tier 策略。只有完成 graph lifetime 验证后才能实现，不属于 P1-6b 首轮。

2026-09-13 gate 更新：RenderGraph 已输出 graph-declared resource lifetime，并在
`render.memory.get` 提供 transient committed/active/inactive bytes、保守 alias slot、planned
heap bytes 和 potential savings。RTX 5070 Ti、1080p 雷米埃尔完整角色管线为 79.5 MiB →
72.6875 MiB，仅节省 6.8125 MiB（当前 local usage 的 0.995%），因此 placed texture 与实际
aliasing barrier 延期；保留遥测观察未来 transient 规模变化。

## 7. 测试设计

### 7.1 纯布局单测

新增 `PeanutGpuMemoryTests`，不创建设备，测试纯函数 layout planner：

- 1/2/4 个 allocation；
- 不同 alignment；
- 0 byte request 拒绝；
- `UINT64` overflow 拒绝；
- heap size 最终对齐；
- waste 统计准确；
- staging layout 失败不修改现有 layout。

### 7.2 D3D12 集成验证

Debug Layer 开启时执行：

```text
scene.load cube
render.pathtrace = true
截图
scene.load sponza
截图
scene.load cube
截图
```

要求：

- 无 resource/heap lifetime validation error；
- 无 aliasing barrier error；
- 无 stale state tracker entry；
- `heap_count` 与 `placed_resource_count` 往返稳定；
- screenshot 非空且几何/材质可见。

### 7.3 压力验证

```text
重复 20 次 cube <-> Sponza
每次查询 render.memory.get
最终截图
```

验收指标：

- heap count 不随循环增长；
- current usage 无单调增长；
- 大于 4 MiB 的 arena，alignment waste <= 10%；
- 小 arena 的 alignment waste <= 256 KiB；
- scene.load 失败时旧场景和旧 arena 仍可渲染。

### 7.4 拆流与变形回归范围（2026-09-19）

- 构建层逐字节比较各 semantic，覆盖常量组、共享 section 范围、UInt16/UInt32 混合池
  及索引边界；序列化往返保留 buffer identity、格式、stride 和偏移。
- GPU 回读比较直接/间接绘制，覆盖默认拆流和兼容布局的 PSO 选择。
- CPU/GPU morph 切换需验证 12-byte 输出与旧路径几何一致，其他静态流不被写回。
- shader reload 覆盖旧布局变体预热和失败后保留旧 generation。
- SDOC/PT 使用 RenderData reader 后，检查非零偏移、baseVertex 和 16-bit 索引的 CPU
  几何一致性，并按编辑器 CLI 截图闭环回归。

第一阶段在 2026-09-19 的全量构建与 21 项 CTest 已通过，记录见数据流文档；这不是本轮
新增拆流、PSO 变体与 CPU reader 集成的最终验收结果。当前条目只规定本轮验证范围。

## 8. 日志与 CLI 输出

arena build 成功只记录一条结构化摘要：

```text
arena=PathTraceBvh heaps=1 resources=4 requested=... heap=... waste=...
```

禁止每 allocation 常态打印 INFO。单项 offset 只在 Debug/verbose memory log 中输出。

建议 `render.memory.get -format json` 数据：

```json
{
  "local_budget_bytes": "...",
  "local_current_usage_bytes": "...",
  "arenas": "2",
  "heaps": "2",
  "placed_resources": "12",
  "requested_bytes": "...",
  "heap_bytes": "...",
  "alignment_waste_bytes": "...",
  "committed_default_buffers": "..."
}
```

数值统一使用 64-bit 十进制字符串，避免 JSON/CLI 消费者丢失精度。

## 9. 文件级实施清单

| 文件 | 变更 |
|---|---|
| `src/Renderer/GpuMemory/PlacedResourceArena.h/.cpp` | batch layout、heap 创建、placed resource ownership、stats |
| `src/Renderer/GpuMemory/GpuMemoryStats.h` | 统计结构与聚合 |
| `src/Renderer/PathTracePass.h/.cpp` | BVH 默认缓冲迁移、staging swap、旧资源 untrack |
| `src/Renderer/D3D12Renderer.cpp` | DXGI budget 查询、memory stats 聚合 |
| `src/Renderer/D3D12Renderer_Scene.cpp` | Phase 2 双 arena 接线，新增成员函数只放本 TU |
| `src/Renderer/RenderPrimitive.h` | `geometryArena` / `instanceArena` ownership |
| `src/Editor/EditorCommandRegistry.cpp` | 仅增加 `render.memory.get` 路由；不暴露 D3D12 类型 |
| `tests/gpu_memory_layout_test.cpp` | 纯布局回归 |
| `CMakeLists.txt` | `PeanutGpuMemoryTests` |

## 10. Definition of Done

P1-6b 只有同时满足以下条件才能标记完成：

- PathTrace BVH 和 RenderPrimitive 默认 buffer 已不再逐资源 committed allocation；
- `geometryArena` 与 `instanceArena` 生命周期分离；
- 所有 rebuild 都使用 staging + swap；
- Debug Layer/GBV 无新增错误；
- 全量 Debug build 与全部 CTest 通过；
- CLI memory stats 可证明 20 次场景往返没有 heap/resource 单调增长；
- cube、Sponza、PMX 动画各完成一次 CLI screenshot 人工验收；
- 文档中的 committed allocation 例外已逐项列出并有理由。

允许长期保持 committed 的资源：

- 小型 persistently mapped 常量缓冲；
- 短生命周期 UPLOAD/READBACK buffer；
- swapchain/backbuffer 与外部拥有资源；
- 需要独立 residency/priority 的超大资源（必须进入 telemetry 的 dedicated 分类）。

## 11. 后续决策点

完成 Phase 2 后，根据 telemetry 决定：

1. 是否引入 D3D12MA 处理任意 free 与预算压力；
2. 是否为 UPLOAD buffer 建 per-frame ring；
3. 是否把 RenderGraph transient textures 迁入 aliasing heap；
4. DDGI probe texture 是否按 volume 独立 arena；
5. XPBD resize 是否允许双 arena 跨帧切换。

这些决策必须由实际 heap 数、waste、scene.load 时间和 budget pressure 数据驱动，
不能仅凭 committed 调用点数量决定。
