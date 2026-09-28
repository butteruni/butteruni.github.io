---
title: "Peanut 渲染器架构开发计划"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-28T20:56:00+08:00"
permalink: 2026/09/27/renderer-architecture-development-plan/
categories:
  - 图形学
tags:
  - astra
  - 技术文档
  - 渲染架构
---

> 由 astra 生成 · 首次发布于 2026-09-27 18:44 · 最近整理于 2026-09-28 20:56（北京时间）

状态：Implementation roadmap
日期：2026-09-27
适用范围：`src/Renderer`、`src/Resource` 中的 GPU 资源接线，以及相关 CLI 观测面

## 1. 文档目的

本文定义渲染器技术债的目标边界、实施顺序和验收门槛。它不是新的渲染特性清单，
也不要求一次性重写 `D3D12Renderer`。每个阶段都必须保持当前 DX12-only 产品形态，
能够独立提交、回滚和通过 CLI + 截图闭环验证。

配套文档：

<!-- more -->

- 屏幕资源与 barrier：`Docs/render-graph-design.md`；
- RenderGraph v2 拓扑/版本化路线：`Docs/render-graph-v2-design.md`；
- GPU buffer 分配：`Docs/renderer-memory-architecture.md`；
- Mesh 渲染数据流与 UE 参考：`Docs/mesh-render-data-flow.md`；
- 统一角色场景数据与自定义 Pass 边界：`Docs/character-render-data-flow.md`；
- CPU/GPU 性能预算：`Docs/gpu-performance-budget.md`；
- 材质/风格管线：`Docs/material-system-design.md`；
- shader/pipeline 生命周期：`Docs/shader-pipeline-architecture.md`；
- 材质、shader、pipeline 解耦近期计划：
  `Docs/material-pipeline-decoupling-development-plan.md`；
- MMD runtime 与 GPU deformation：`Docs/mmd-runtime-architecture.md`、
  `Docs/gpu-deformation-architecture.md`；
- 编辑器命令、快照和 serializer 边界：`Docs/editor-command-architecture.md`；
- 长期技术决策：`Docs/adr/README.md`；
- 产品 feature 顺序：`Docs/roadmap.md`。

## 2. 已成立的架构约束

以下边界已经落地，后续开发不得倒退：

1. 引擎只支持 DX12，不恢复通用 `Renderer` 基类。
2. `Application`、生产 GUI、render pass 直接依赖 `D3D12Renderer`。
3. 编辑器命令与测试 fake 只通过不含 D3D12 类型的 `EditorRenderOps` 交互。
4. RenderGraph 管理屏幕尺寸纹理、访问声明、描述符与资源状态；模型几何、实例、
   材质和动画 buffer 不进入 RenderGraph。Owned texture 由活跃执行图决定驻留，
   图外消费者显式标记 `externallyUsed`；`persistent` 不代表停用后继续分配。
5. 实例编辑已经事务化；全场景替换仍须补齐 staging/swap（见 R3），不能把现有预检和
   局部回滚等同于新资源完整可用前保留旧场景。
6. shader reload 必须是全批次事务：任一风格编译失败时保留全部旧 PSO。
7. 巨型类继续按领域分 TU；尚未抽成组件的成员函数必须放到既定文件：
   `_Scene.cpp` 管场景生命周期，`_Animation.cpp` 管动画，主文件只保留设备、帧循环、
   帧图和剔除。

## 3. 当前架构评审

### 3.1 已解决问题

| 边界 | 当前状态 | 结论 |
|---|---|---|
| 编辑器/渲染器接口 | `EditorRenderOps` 不含 D3D12 类型 | 保留，不再扩成生产渲染抽象 |
| 生产渲染类型 | 直接使用 `D3D12Renderer*` | 与 DX12-only 决策一致 |
| 屏幕纹理所有权 | RenderGraph 已管理 SSAO/SSGI/Bloom/PT 等资源 | 不回迁到 renderer 成员 |
| 屏幕纹理驻留 | 按编译后的活跃 lifetime 分配，停用时释放普通纹理和历史纹理；图外目标显式保留 | 先消除 inactive allocation，再评估 aliasing |
| 描述符与驻留切换 | 释放或替换已发布 view 前等待 GPU idle；inactive SRV/UAV 为稳定槽内的 null view；先构图再发布帧描述符 | 不允许旧帧引用已释放资源或新帧复制旧 view |
| 帧 pass 清单 | `PassFrameCatalog` 已统一 graph 声明、context 和执行顺序 | 保留单目录，不恢复并行清单 |
| 资源状态 | graph 声明经 `ResourceStateTracker` 执行 | pass 不新增裸 barrier 旁路 |
| 场景失败路径 | load/add 已具备预检、清理和回滚 | 后续分配器必须保持该语义 |
| 材质风格 | Scene/mesh 只持有 `MaterialData`；公共 b4 与风格 b6 由同一 reflected `MaterialBindingInstance` 打包；GPU texture object 位于 renderer cache；preset、shader ABI 与 pipeline generation 分层；stencil/附加 draw/outline 来自 program `drawRouting` | MP5 已收口，不恢复旧材质通道 |

### 3.2 仍需处理的问题

#### A. `D3D12Renderer` 是组合根，也是大部分子系统的实现体

按 TU 拆分以及 `FrameScheduler`、`PrimitiveStore`、`CharacterProfileRuntime` 的抽取
已缩小职责范围。组合根仍承担设备、场景 GPU 资源准备、剔除、pass 编排和诊断接线；
完整 GPU proxy 管理与全场景替换事务仍属于 R3。

决策：`D3D12Renderer` 继续作为唯一组合根和生产入口，但逐步把“拥有明确状态与
不变量”的领域抽成具体组件。不要为了缩短文件而创建无状态转发类。

#### B. pass 帧目录已收敛，但构造与 graph 资源声明仍集中

Bloom 曾因初始化、`SetContext` 和执行顺序三份清单不同步而静默不执行。该问题现已
由 `PassFrameCatalog` 修复：graph 声明、context 注入与执行顺序都从同一目录派生。
当前剩余接线是 `InitializeRenderPasses` 中的 `make_shared`、`BuildPassCatalog` 的目录
entry，以及 renderer 中集中声明的 graph texture；注册结束后由 `FrameGraphResources` 一次
解析 typed handle，pass 内不再按资源名查找。IBL 仍是目录外的一次性 helper。

决策：现有目录已经满足正确性要求，不为了“自注册”引入静态初始化或反射。等下一
个真实 pass 加入时，再以小型 factory/helper 合并“构造 + 目录 entry”；graph texture
继续由 RenderGraph 的集中声明表拥有。目录提供显式偏好顺序，由稳定拓扑选择执行顺序。

#### C. GPU allocation 已具备批次所有权，后续优化按预算决定

PathTrace BVH、RenderPrimitive geometry/instance buffer 已使用 `DefaultBufferArena`，
`render.memory.get` 已提供 arena、descriptor 与 DXGI 预算统计。分配及 staging/swap
约束见 `Docs/renderer-memory-architecture.md`，当前 Mesh 布局见 `mesh-render-data-flow.md`。
这些不再作为未实施任务；屏幕纹理 aliasing 仍需独立收益证据。

#### D. frame lifecycle 已独立，保持所有权边界

`FrameScheduler` 已持有命令队列、交换链、backbuffer、每 slot allocator/命令列表、
fence、Present 和 resize；renderer 保留 readback 解读、Tracy context 与帧常量缓冲。
此拆分不再作为待办，后续 scene/pass 工作不得重新接管 frame-in-flight 状态。

#### E. pipeline 与 shader 所有权仍按 pass 分散

通用 pipeline asset、reflection/layout/binding artifact、D3D12 runtime registry 和
fence-safe generation 已落地；Shadow 与 PBR 风格族已删除手写 root/PSO 路径。代码按
`Graphic/Pipeline`（ABI 编译）、`Resource/Pipeline`（资产/cook/选择）与
`Renderer/Pipeline`（D3D12 runtime）分层。Character Render Profile 作为资产路由输入，
但 29 个主材质 draw 已由 adapter 生成普通 pipeline asset，并通过通用 executor 运行；normal
resolve、primary lighting 与 LUT composite 也由独立 pipeline asset/DAG 描述。专用 pass 不再
拥有 shader 编译、input layout、root signature、PSO 或 fixed-state 的并行实现。

决策：MP4-MP5、独立 cook/runtime-only 流程、通用 single-program executor 与资产级
execution DAG 已完成；自定义角色的主 draw 与 utility/post 节点均已迁移。下一步按真实
消费者/telemetry 推进全局 pipeline cache，不为缩短 pass 提前抽象。

当前 draw route 已在 staging/cache 边界把 layered follow-up 与 outline 名称解析为同 generation
handle，PBR 每帧不再查 program 名。多 pass execution DAG 也已由显式/资源依赖生成稳定拓扑
并按序执行；DAG 可按拓扑中的连续区间预编译到不同宿主阶段，staged generation preview 使
reload 在发布前验证所有区间。Captured 主材质 draw 的绑定 packet 也在发布前编译完成。
RG2-0 已按本帧实际执行顺序生成 resource version、writer→reader 和 writer→writer 依赖，
同时严格拒绝 transient read-before-write；RG2-1 已把生产 pass 与 Pipeline Asset executor
迁到 generation-safe 的 typed texture/buffer handle；RG2-2 已生成可解释的稳定影子拓扑并
接入 Pipeline Asset `after` 约束；RG2-3 已让 renderer 按选定拓扑记录命令，并以同序重新生成
resource version；RG2-4 已将内置 pass 迁到 generation-safe compiled pass/barrier plan，并
生成资源 lifetime。RG2-5 gate telemetry 实测 1080p 完整角色管线的保守 aliasing 收益仅
6.8125 MiB（当前显存使用约 0.995%），因此实际 aliasing 延期；RG2-6 的 30 帧 profiler gate
中 HiZ + ParticleSimulate p95 合计仅约 0.0449 ms，multi-queue 同样延期。RenderGraph v2
近期重构至此收口，不再包含专用角色 PSO 通道。

2026-09-27 已补齐资源驻留边界：compile 根据活跃 lifetime 创建和释放 owned texture，
包括停用的 persistent history。核心图外目标显式标记 `externallyUsed`；稳定 SRV/UAV 槽
以 null view 表示未驻留，重新启用复用原槽。GPU-idle 同步发生在释放与描述符改写前，
构图发生在本帧命令记录和描述符发布前。`AllocationRevision()` 变化使 renderer 重置
temporal histories；resize 仅重建分辨率相关纹理，固定尺寸资源保留。这解决了未执行
Profile 仍占屏幕纹理显存的问题，不等同于实现 aliasing 或跨 Profile 合成。

#### F. 全局配置读取扩大了测试边界

renderer 的部分设置仍由 `Config` 驱动，使单元测试难以构造确定输入，也模糊了
“本帧设置快照”与“进程配置”的区别。场景灯光已由 `scene::Scene` 实例拥有，Pass
通过帧提交中的 `LightingConstants` 读取，不再访问全局 `LightManager`。

决策：先为帧路径建立只读 `FrameRenderSettings` 快照；进程级设备选项仍在初始化时读
配置。不要在同一提交中清除全部 singleton。

### 3.3 正确性前置债务

已有 Hi-Z/IBL/Skybox 状态修复及 FXAA 输出验证仍作为基线，不重复列为待办。未关闭事项：

- 全场景替换：`LoadScene` 的旧场景释放早于新场景完全可用，仍需 R3 的完整 staging/swap；
  实例编辑事务、资源预检和局部回滚不能替代此项。
- PT 历史内容：旧记录观察到切换场景后累积辐射残留，以及隐藏最后一个可绘节点后
  零三角形路径停止写 sceneHDR。清理文档没有重新运行该复现，也没有证据关闭问题；
  后续核对 accumulation 的实际绑定与空场景输出，不能仅靠重置 frameIndex 判定已修复。
- Profile：任意不同 sidecar 的混合后处理合成、捕获深度/stencil 输入的实时化尚未完成。

设备移除、descriptor 越界和资源状态错误继续作为修改的阻断项。

## 4. 目标结构

```text
Application / EditorShell
    |
    +-- scene::Scene                  logical primitives, lights and VFX
    |
    +-- D3D12Renderer                 concrete render composition root
    |     +-- DeviceContext           device, queues, swapchain, capabilities
    |     +-- FrameScheduler          frame slots, allocators, fences, present/resize
    |     +-- RenderGraph             active screen resources, barriers, stable topology
    |     +-- RenderPrimitiveRegistry GPU proxies and transactional replacement
    |     +-- GpuMemory               placed arenas and budget telemetry
    |     +-- Pipeline ownership      pass PSO plus transactional reload coordinator
    |     `-- RendererTelemetry       profiler, culling and memory snapshots
    |
    `-- EditorController / tests
          `-- EditorRenderOps         D3D12-free editing seam
```

依赖方向：

1. `Application` 可以依赖具体 renderer；renderer 子组件不得依赖 editor。
2. render pass 只能通过 `RenderPassContext` 的不可变帧数据和
   `RenderPassServices` 的窄能力面访问渲染功能；Pass 不持有完整 renderer，也不能调用
   scene load/edit/serialization API。新增屏幕资源优先经 RenderGraph 获取。
3. `RenderPrimitiveRegistry` 可以依赖 GPU memory、descriptor allocator 和 state tracker；
   反向依赖禁止。
4. `GpuMemory` 不知道 RenderPrimitive、PathTrace、Editor 或 CLI。
5. CLI 只读取不可变 telemetry snapshot，不直接遍历 D3D12 resource 对象。

## 5. 分阶段开发路线

### R0：正确性基线和观测面

交付：

- 清零 3.3 所列 GBV 问题；
- 增加 `render.memory.get`；
- 固化 renderer 初始化、resize、scene load/add 和 shutdown 的资源计数；
- 保存 raster、PT、FXAA on/off 的基准截图。

验收：Debug Layer + GBV 零 error；同一场景重复查询的 heap/resource 计数稳定；FXAA
开关产生可解释的像素差异，关闭后可恢复基准输出。

### R1：GPU buffer arena（已实施，保留分配契约）

严格执行 `Docs/renderer-memory-architecture.md`：

1. 先迁 PathTrace 四个共生命周期 DEFAULT buffer；
2. 再给每个 RenderPrimitive 建独立 `geometryArena` 与 `instanceArena`；
3. upload/readback 保持 committed；
4. staging 成功并完成 GPU 同步后才 swap live arena。

验收：20 轮 cube/Sponza 切换后 heap/resource 计数回到相同基线；OOM 或注入式创建
失败不改变 live scene；raster/PT 截图与迁移前一致。

### R2：`FrameScheduler`（已实施，保留生命周期契约）

建议所有权：

- frame slot 的 command allocator 和 fence value；
- command list reset/close/submit；
- backbuffer index 和 Present；
- resize 时的 GPU idle 与 swapchain buffer 重建时序；
- gated readback 的 frame slot 归属。

`Application` 仍拥有 `Update → NewFrame → Render → RenderUI → Present` 的高层顺序；
`D3D12Renderer` 的公开生命周期方法只把帧状态机操作转发给内部 scheduler。

不迁移：RenderGraph 构建、scene load、pass 初始化、材质、shader reload。

目标 API 只表达帧状态机，例如 `BeginFrame`、`SubmitScene`、`SubmitUi`、`Present`、
`Resize`、`WaitForIdle`。失败返回必须保留 HRESULT/设备移除信息，不能转成 bool。

验收：至少两个 frame slot 仍可重叠；正常帧无全 GPU drain；resize、最小化/恢复、
连续 100 帧截图请求和退出均无 hang。

### R3：收敛 RenderPrimitive GPU 所有权

2026-09-27 已完成逻辑场景边界：`scene::PrimitiveStore` 统一持有 stable model/instance
ID、revision、不可变快照和实例插入/删除事务；GPU 准备失败不发布逻辑状态。空模型
保持零实例，undo/import 按 stable model ID 与 local index 恢复。renderer 保留快照
兼容转发和 GPU 准备工作。下述完整 GPU proxy 管理组件与全场景替换事务仍未完成。

将以下状态从组合根收进一个具体的 `RenderPrimitiveSystem`，而不是新 renderer 接口：

- `RenderPrimitive` entry 集合及容量限制；
- model load/add/remove 的 GPU preflight；
- instance resources rebuild；
- descriptor checkpoint/rewind；
- state tracker 解绑与 mapped upload 清理；
- scene swap transaction。

动画采样、IK、Bullet、关键帧编辑继续留在 `_Animation.cpp` 对应领域；
`RenderPrimitiveSystem` 只消费最终 mesh/instance/bone buffer 数据，不承担编辑历史。

验收：scene.load/add 的失败矩阵不变；第 17 个模型拒绝时场景不变；instance
duplicate/delete 只重建 `instanceArena`，不重建 geometry；全局实例编号保持连续。

### R4：完成 pass 构造与目录接线（需求触发）

保留现有 `PassFrameCatalog` 作为帧参与者唯一目录。下一次增加真实 pass 时，提取一个
小型构造 helper，使一次调用完成 `make_shared`、renderer/graph 注入和 catalog entry；
不要使用静态自注册。重复 order、缺少 context、graph 声明无资源必须在初始化/compile
阶段报错，不能在 Execute 中静默 return。Tracy/profiler 标签继续从同一目录获取。

IBL 是启动/环境变化时的一次性生成 helper，不强行伪装成每帧 pass；只需把它的
context/reload 特例在代码中明确标记。

验收：新增一个真实 pass 只新增自身文件、graph texture 声明和一处构造/目录调用；
不编辑 `UpdateRenderPassContext` 或第二份执行清单；Bloom、MME、VFX、PT 的执行顺序及
profiler 标签不变。

### R5：缩小 `RenderPassContext`

按实际使用把 context 分为稳定引用和每帧快照：

- 稳定：device、descriptor allocators、state tracker、RenderGraph 访问器、具体 renderer；
- 每帧：command list、frame index、viewport/scissor、camera/light/settings snapshot。

pass 不保存指向临时 frame snapshot 的裸指针。resize 后资源句柄由 graph 重解析，
禁止缓存失效的 RTV/SRV CPU handle。

验收：context 更新点只有帧开始一处；resize 后所有 pass 使用新尺寸；关闭任意 pass
不会改变其他 pass 的 context 完整性。

### R6：pipeline/reload 协议收敛

2026-09-27 已完成全批次 reload 协议：`PipelineReloadTransaction` 协调普通 Pass、
Profile Pass、morph、style buffers 与 registry staging；全部构建完成后才发布。
`D3D12Renderer_Pipelines.cpp` 负责编排，失败回收暂存对象并保留旧一代。
实测 FXAA 编译失败时 sceneColor 指纹不变，恢复源码后 reload 成功。
公共 pipeline key/cache 与剩余 root binding 归一化继续按真实复用需求推进。

Profile 生命周期由 `CharacterProfileRuntime` 与 `D3D12Renderer_Profiles.cpp` 管理：
规范化的精确 sidecar 是身份，只构建活跃组，使用可复用 descriptor banks。
不同 sidecar 的混合场景在变更前拒绝；相同 sidecar 的多模型/实例全部参与绘制。
任意 Profile 后处理合成与捕获 depth/stencil 输入的实时化仍属后续工作。

先定义协议，再决定是否抽类型：

1. 每个 pass 提供可枚举的 pipeline key 与 shader dependencies；
2. reload 构建完整 staging pipeline set；
3. 全部成功后，在 GPU-safe 边界一次 swap；
4. 任一失败保留全部 live PSO，并输出 style/pass/shader/entry point；
5. root parameter 使用具名常量或 layout 描述，禁止继续传播裸槽位数字。

当至少两个 pass 需要相同 key/cache/invalidation 行为时，再提取
`PipelineCache`。旧风格渲染 facade 已退出 Renderer；目标所有权与反射预处理顺序见
`material-pipeline-decoupling-development-plan.md`。

验收：故意破坏任一风格 shader 时 reload 整体拒绝，旧画面继续渲染；修复后一次
reload 全量生效；同 key 不重复编译；root layout 自检覆盖所有注册风格。

### R7：设置快照与 singleton 缩边

将运行时可调项在帧开始复制到 `FrameRenderSettings`，pass 只读该快照。设备创建、
adapter、debug layer、RenderDoc/NVPerf 等启动选项保持 initialization-only。

只迁移 renderer/pass 的读路径；输入系统、日志系统和编辑器生命周期不在本阶段重构。

验收：测试可在不初始化全局 Config 的情况下构造 pass settings；一帧内所有 pass
观察到相同设置版本；CLI 改值从下一帧原子生效。

### R8：RenderGraph transient texture aliasing（条件触发）

前置项已完成（2026-09-27）：按活跃图分配，停用释放，保留稳定 null descriptor。
只有完成按需驻留后，telemetry 仍证明活跃 transient texture 是显存压力来源时才实施：

- 计算 compile 后的 first/last use；
- 仅对互不重叠的 transient texture 做 placed aliasing；
- 自动插 aliasing barrier；
- Persistent、Imported、history、PT accumulation 永不 alias；
- buffer arena 与 texture heap 保持独立。

没有数据支持时保持当前按需 committed allocation；尚未实现 texture pooling/aliasing。
驻留变化需 GPU idle，同图缓存命中不增加逐帧等待；固定尺寸纹理不随 viewport resize 重建。

## 6. 文件与所有权规则

| 变更类型 | 文件/模块 |
|---|---|
| 设备、帧循环、帧图、剔除转发 | `D3D12Renderer.cpp` |
| 场景生命周期成员函数 | `D3D12Renderer_Scene.cpp` |
| 动画、物理、morph、骨骼、相机轨 | `D3D12Renderer_Animation.cpp` |
| placed buffer arena | `src/Renderer/GpuMemory/` |
| frame-in-flight 状态 | `src/Renderer/FrameScheduler.*` |
| primitive GPU entry/transaction | `src/Renderer/RenderPrimitiveSystem.*` |
| pass 自有 PSO/draw/dispatch | 对应 `*Pass.*` |
| 屏幕纹理与 barrier 声明 | `RenderGraph.*` + 对应 pass setup |
| 编辑器命令面 | `EditorCommandRegistry.cpp` / `EditorRenderOps.h` |

新增组件必须真实拥有状态和不变量。只有转发函数的 wrapper 不算架构改进。

## 7. 测试与手动验收协议

每个实现阶段至少执行：

```bash
cmake --build Peanut/build_test --config Debug
cd Peanut/build_test/bin/Debug
./PeanutCommandTests.exe
./PeanutControllerTests.exe
./PeanutSelectionTests.exe
./PeanutConfigTests.exe
./PeanutPmxLoaderTests.exe
ctest -C Debug --output-on-failure
```

CLI 场景矩阵：

1. `scene.load` cube，追加到 16 个模型，确认第 17 个被事务式拒绝；
2. Sponza → cube → Sponza 循环 20 次，比较 `render.memory.get`；
3. raster/PT、GPU-driven on/off、SDOC fallback 各截一张；
4. resize、最小化/恢复、shader reload 失败/成功各走一次；
5. `profiler.get`、`render.gpu.stats.get`、`render.cpu.stats.get` 和 memory telemetry
   均能返回与当前模式一致的数据。

每条视觉路径都必须执行：

```bash
PeanutCli.exe -mode cli -command editor.screenshot \
  -path ./captures/<phase>-<scenario>.png -format json
```

随后实际读取 PNG，确认画面、尺寸和非黑帧；不能只以命令 exit code 作为通过。

## 8. 提交顺序

建议一阶段一提交，不把 feature 与架构迁移混在一起：

1. `fix(renderer): resolve validation baseline errors`
2. `feat(renderer): add GPU memory telemetry`
3. `refactor(renderer): add placed buffer arenas`
4. `refactor(renderer): extract frame scheduling`
5. `refactor(renderer): centralize render primitive GPU ownership`
6. `refactor(renderer): unify pass construction and catalog registration`
7. `refactor(renderer): snapshot per-frame render settings`

每次提交前必须保证 worktree 中用户资产、capture 和配置文件未被纳入 staging。

## 9. Definition of Done

渲染器架构债务完成的判定不是“主文件变短”，而是：

- `D3D12Renderer` 是组合根，不再直接实现 frame slot 与 primitive transaction 细节；
- `PassFrameCatalog` 继续是帧声明/context/顺序的唯一目录，新增 pass 不产生第二清单；
- PathTrace/RenderPrimitive DEFAULT buffer 使用有统计的 batch arena；
- scene load/add/rebuild 的失败不影响 live scene；
- graph 继续独占屏幕资源和 barrier 计划；
- shader reload 保持全批次事务语义；
- 正常帧无无条件 GPU drain，GBV 零 error；
- 自动测试、CLI 状态检查和 PNG 人工读取全部通过；
- 没有恢复通用 Renderer、MiniEngine allocator 或新的 service locator。

## 10. 长期路线入口

本路线图的 R0-R8 仍是当前渲染器架构债务范围。以下项目必须在对应前置完成并取得
telemetry 后单独启动，不并入当前 R0-R8 提交：

| 长期方向 | 前置 | 设计文档 |
|---|---|---|
| MMD asset/instance runtime | PMX/VMD 当前回归稳定 | `mmd-runtime-architecture.md` |
| GPU morph/deformation | runtime 输出边界 + 性能基线 | `gpu-deformation-architecture.md` |
| Editor command/snapshot | stable ID 与查询 inventory | `editor-command-architecture.md` |
| Shader pipeline system | R6 协议与 pipeline inventory | `shader-pipeline-architecture.md` |
| RenderGraph v2 | v1 正确性 + 明确启动条件 | `render-graph-v2-design.md` |

性能 Gate 统一由 `gpu-performance-budget.md` 定义；架构取舍写入 `Docs/adr/`。长期设计
不得回改本文件中已经成立的 DX12-only、事务式 scene/reload 和显式组合根约束。
