---
title: "材质、Shader 与渲染管线解耦开发计划"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-28T20:56:00+08:00"
permalink: 2026/09/27/material-pipeline-decoupling-development-plan/
categories:
  - 图形学
tags:
  - astra
  - 技术文档
  - 渲染架构
---

> 由 astra 生成 · 首次发布于 2026-09-27 18:44 · 最近整理于 2026-09-28 20:56（北京时间）

状态：近期实施目标

日期：2026-09-11

UE 对照基线：Unreal Engine 5.7.4，commit `260bb2e1c`

关联文档：

<!-- more -->

- `Docs/material-system-design.md`：材质资产、编辑与兼容迁移；
- `Docs/shader-pipeline-architecture.md`：shader、PSO 与事务式 reload 长期约束；
- `Docs/render-graph-v2-design.md`：pass DAG、资源声明和语义输出；
- `Docs/render-pipeline-asset-format.md`：通用自定义 pipeline JSON、编译与 artifact contract；
- `Docs/shader-pipeline-inventory.md`：MP0 program/root/PSO/参数来源和 hash 基线；
- `Docs/zzz-remielle-rdc/pipeline-map.md`：第一个完整迁移与无损回归样本。

## 0. 实施状态快照

截至 2026-09-13：

| 阶段 | 状态 | 已落地 | 尚未完成 |
|---|---|---|---|
| MP0 | 已完成 | `shader-pipeline-inventory.md` 已枚举 PBR/Shadow/Outline/常规 post/29 个 Captured 主程序/3 个角色后续程序的 shader hash、root 参数来源、PSO/MRT 和版本策略；Remielle 参考 PNG 与八个中间目标 hash 已锁定 | compute/utility pass 在进入通用 pipeline asset 时按需追加，不阻塞材质解耦 |
| MP1 | 已完成 | `ShaderInterface` 已通过 D3D12 DXBC reflection 记录资源、CB 布局、签名、SM 5.1 register space 和稳定精确 hash；文件 shader 与 MME 生成 shader 均通过 `ShaderLoader` staging 同时生成 bytecode、依赖 fingerprint 与 interface，renderer 内已无直接 `D3DCompile` 旁路；声明/反射类型冲突在 artifact 恢复与重编译两条路径都会拒绝 | DXIL reflection 随未来 DXC/SM6 迁移实现；当前生产 shader 全部是 FXC DXBC，此项不阻塞 MP4 |
| MP2 | 进行中 | `PipelineLayoutCompiler` 已做 stage merge、冲突/容量/DWORD 校验、跨 stage 共享根参数和名称无关兼容键；通用 `RenderPipelineAsset` JSON/Compiler 已将 graphics/compute shader、PSO、material requirements、RenderGraph 读写、root layout、shader binding 与 material binding plan 确定性写入 `.pnsh` v5；v5 将 canonical/alias/import property 的有序解析编译进 binding write，runtime 不再需要 importer 对象；CPU/GPU registry 已提供整组事务式 generation、稳定 handle、graphics/compute root+PSO 创建、frame-slot retire bin、`FrameScheduler` slot-reuse 接线与无 HLSL 的 `TrustArtifact` 恢复；`D3D12RenderGraphBindingPlanCompiler` 可从 artifact 自动声明实际 pass 访问，并把 graph semantic 编译成 reset-generation 校验的 typed resource handle；`D3D12PipelinePassExecutor` 已实际提交 graphics draw/compute dispatch，消费 typed attachment、load/store、binding/provider 与 descriptor heap 要求；独立 `PeanutPipelineCook` 会 cook 后重新执行严格 runtime-only 验证，CI fixture 已用严格模式启动编辑器；draw packet 已把主程序、layered follow-up 和 outline 预解析为同 generation 的稳定 handle route，PBR draw loop 不再做 program 字符串查询；资产级 execution DAG 已支持显式/资源依赖、稳定拓扑、完整 cycle diagnostic，并由 D3D12 execution plan 按序提交 graphics/compute | Captured 主 draw 与 post 已迁入通用资产、executor 和 DAG；RenderGraph SSA resource version 与多 writer 链留在 RG2；Captured 继续作为通用迁移验收样例 |
| MP3 | 已完成 | Captured Character 主 pass 已删除手写 `RootFamily` 和固定 5/5/2/11 类型布局；29 个主程序由 adapter 生成通用 `ProgramAsset`，normal resolve 与两个 post program 由独立资产声明；全部通过 registry/executor 生成 root signature、PSO 和无字符串逐帧查询的 binding plan；profile reload 以主/Post 同 generation 两阶段提交；`render.resource.hash` 已锁定八个主/post/final 中间目标 | 无；后续 profile 扩展进入 MP4/MP5，不再向专用 pass 增加固定绑定 |
| MP4 | 已完成 | 已引入完全不含 DirectX/D3D12/shader 类型的 `MaterialData`、`MaterialSchema` 与 `MaterialSchemaRegistry`；属性和纹理使用稳定语义 ID，schema 提供 domain/feature/type/default/alias/editor metadata/required/fallback 验证和确定性 hash；pipeline JSON 支持 cook-time schema 继承、具名 material binding template 与外部 style-constant catalog，runtime/artifact 只看到展平结果；PBR 公共 b4 与风格 b6 都由同一 reflected `MaterialBindingInstance` 写入 frame slice；实例按材质 revision、binding plan 和内容 hash 缓存，测试覆盖旧 b4/b6 字节保真、同 ID/revision 不同内容不碰撞、运行时编辑刷新；生产 `materialDebug` program 已验证与 forward program 接受同一个 `MaterialData` | 无；后续移除 legacy `Material` 字段属于 MP5，不回退 MP4 ABI |
| MP5 | 已完成 | Mesh/scene 只持有持久 `MaterialData`；Assimp 与 pre-v4 scene 的旧 `Material` 是函数内 DTO，转换后立即丢弃；编辑器、v6 序列化、PBR/Forward/Shadow/BVH 直接读写语义属性；GPU texture object 只存于 `RenderPrimitive::materialGpuResources`；`MaterialPresetRegistry` 只提供 authoring preset、domain/features 与外部 catalog 参数视图，不拥有 shader/PSO/root/draw topology；pipeline selection、fixed state 与 draw routing 均由 pipeline asset generation 拥有 | 风格化透明排序属于后续场景调度，不再阻塞材质单真源 |

当前迁移保持行为不变：雷米埃尔场景在同一运行中的初次加载与 `shader.reload` 后逐像素
一致。当前结果与锁定参考图仅有 207/2,073,600 个跨进程稀疏栅格边缘像素不同，重复截图
为零差异。`sceneHDR`、三个主 Pass 辅助 MRT、两个 primary-lighting 输出、post HDR 与最终
`sceneColor` 的去 row-padding 原始 GPU 字节 hash 在 reload 前后全部一致，具体值记录在
`Docs/zzz-remielle-rdc/pipeline-map.md`。运行时 draw loop 不执行反射或字符串 root-index
查询；artifact 缺失或依赖失效时，反射和计划生成只发生在编辑器 shader staging。

## 1. 决策

材质、shader 和渲染管线属于三个不同表达层，禁止再由一个 `StyleDesc` 同时描述三者：

```text
MaterialAsset                 ShaderInterface
材质语义数据                  编译后物理 ABI
     │                              │
     └────── BindingPlanCompiler ───┘
                     │
                     ▼
             CompiledBindingPlan
                     │
                     ▼
RenderPipelineAsset ─── CompiledPipelineArtifact
Pass DAG / PSO / 输出       运行时不可变布局
```

- **MaterialAsset** 表达表面拥有什么数据和性质；
- **ShaderInterface** 表达一个 shader 实际要求的寄存器、常量布局和输入输出；
- **RenderPipelineAsset** 表达数据经过哪些 pass、以何种状态生成哪些语义输出；
- **CompiledBindingPlan** 是三者之间预处理得到的连接结果，不是 Material 或 Shader
  自身的一部分。

运行时反射是加载/热重载阶段的能力，不是逐帧行为。正式运行时只消费已经校验和序列化的
artifact；编辑器在 artifact 缺失或过期时可以运行同一套预处理器，生成 staging generation，
验证成功后再事务式替换。

## 2. Unreal Engine 对照结论

本节只提取与 Peanut 当前问题直接相关的机制，不复制 UE 的材质图、全局静态 shader type
注册和大规模 permutation 系统。

### 2.1 材质资产与渲染时表示分层

UE 的材质参数以 `FMaterialParameterInfo` 表达名称、作用域和层索引；
`FMaterialRenderProxy` 提供 scalar/vector/texture 查询，并缓存已经求值的 material uniform
buffer。GPU uniform buffer 布局来自已编译的 shader map，布局变化时显式重建缓存，而不是
把每个 shader register 写回材质资产。

源码证据：

- `Engine/Source/Runtime/Engine/Public/Materials/MaterialParameters.h`；
- `Engine/Source/Runtime/Engine/Public/Materials/MaterialRenderProxy.h`；
- `Engine/Source/Runtime/Engine/Private/Materials/MaterialRenderProxy.cpp`；
- `Engine/Source/Runtime/Engine/Public/MaterialShared.h` 中的 `FUniformExpressionSet`。

Peanut 对应关系：

```text
UE Material / Material Instance     → Peanut MaterialData
UE Material Render Proxy            → Peanut MaterialBindingInstance
UE Uniform Expression Cache         → Peanut material CBV/descriptor cache
UE Uniform Expression Set           → Peanut CompiledBindingPlan
```

不照搬 `FMaterialShaderMap` 的 per-material shader permutation 模型。Peanut 当前材质不是可编译
材质图；同一份 MaterialData 应能进入多个 pipeline，而不是拥有某一个具体 shader map。

### 2.2 编译反射转成紧凑静态绑定

UE 的 D3D shader compiler 使用 `ID3D12ShaderReflection` 提取参数映射，产生
`FShaderParameterMap`。shader 类型构造时再把名称映射与 C++ parameter-struct metadata
编译成 `FShaderParameterBindings`，其中只保留 buffer/base index、byte offset 和 byte size。
运行时提交不再按名称执行反射。

源码证据：

- `Engine/Source/Developer/Windows/ShaderFormatD3D/Private/D3DShaderCompilerDXC.cpp`；
- `Engine/Source/Runtime/RenderCore/Public/ShaderCore.h`；
- `Engine/Source/Runtime/RenderCore/Public/Shader.h`；
- `Engine/Source/Runtime/RenderCore/Private/ShaderParameterStruct.cpp`。

编译器还可以从最终 bytecode 剥离 reflection 数据；运行时 shader code 只携带紧凑的
`FShaderCodePackedResourceCounts` 等 optional metadata。这印证 Peanut 应把 runtime reflection
定义为 editor/cook staging 能力，而不是 shipping frame-loop 能力。

### 2.3 Root Signature 使用量化兼容键归并

UE D3D12 后端不按 shader 名或材质名选择 Root Signature。它从各 shader stage 的 packed
CBV/SRV/UAV/Sampler 数量生成 `FD3D12QuantizedBoundShaderState`，根据硬件 binding tier
对 table size 取整或扩展，以提高不同 shader 之间的 Root Signature 复用率；
`FD3D12RootSignatureManager` 再按这个量化键缓存 Root Signature。构建配置也允许所有通用
graphics shader 使用少量 static root signature。

源码证据：

- `Engine/Source/Runtime/RenderCore/Public/ShaderCore.h` 中的
  `FShaderCodePackedResourceCounts`；
- `Engine/Source/Runtime/D3D12RHI/Private/D3D12Util.h/.cpp` 中的
  `FD3D12QuantizedBoundShaderState`；
- `Engine/Source/Runtime/D3D12RHI/Private/D3D12RootSignature.h/.cpp`；
- `Engine/Source/Runtime/D3D12RHI/Private/D3D12Shaders.cpp`。

因此 Peanut 必须区分两个 hash：

- `ShaderInterfaceHash`：精确记录名称、类型、register、space、offset 和 stage，用于接口
  校验、Binding Plan 与 artifact 失效；
- `RootLayoutCompatibilityKey`：记录能否共享同一个物理 root layout 的量化范围和 policy，
  用于自动归并 Root Family。

不能直接把完整 `ShaderInterfaceHash` 当作 Root Family key，否则语义名称不同但物理布局
兼容的 shader 会产生无意义的 Root Signature 分裂。

### 2.4 Pass 决定 shader 与 PSO，材质提供约束和数值

UE 的 `FMeshPassProcessor` 把 mesh batch 转换为 draw command。Base/Depth/Distortion 等
processor 根据 pass、material properties、vertex factory 和 permutation 选择 shader，随后
组合 blend/depth/raster state；`FMaterialRenderProxy` 负责给选中的 shader 提供材质数值。
材质的 blend mode、two-sided、shading model 是渲染意图和选择条件，不是 shader 文件路径。

源码证据：

- `Engine/Source/Runtime/Renderer/Public/MeshPassProcessor.h`；
- `Engine/Source/Runtime/Renderer/Public/MeshMaterialShader.h`；
- `Engine/Source/Runtime/Renderer/Private/BasePassRendering.h/.cpp`；
- `Engine/Source/Runtime/Engine/Public/MaterialShared.h`。

Peanut 的 `PipelineSelector + DrawPacketCompiler` 应承担类似职责：根据 pipeline profile、pass、
material domain/features 和 geometry features 产生不可变 draw packet。MaterialData 不直接
选择 VS/PS 或 PSO。

### 2.5 Cooked shader 与 PSO 生命周期

UE 使用 `FMaterialShaderMapId` 将 material static parameters、shader/pipeline/vertex-factory
依赖和 include hash 纳入确定性标识；cooked runtime 通过 `FShaderCodeLibrary` 加载 shader
library，D3D12 PSO disk cache 保存并恢复量化 root-layout key 和 PSO 描述。

Peanut 不需要复制完整 DDC，但 artifact identity 至少必须覆盖：shader 源和传递 include、
compiler/flags、pipeline state、material schema、binding policy 与 adapter ABI。编辑器可以
现编译，runtime 应优先读取 cooked artifact。

### 2.6 采用与不采用

| UE 机制 | Peanut 决策 |
|---|---|
| Material asset 与 render proxy 分层 | 采用，建立 MaterialData/MaterialBindingInstance |
| 参数反射后编译成 offset binding | 采用，形成 CompiledBindingPlan |
| 精确接口与量化 root-layout key 分离 | 采用 |
| Root Signature manager 按兼容键共享 | 采用 |
| Mesh pass processor 生成 draw command | 简化采用，形成 PipelineSelector/DrawPacketCompiler |
| Cook/editor 编译，runtime 加载 shader library | 简化采用，形成 pipeline artifact/cache |
| 每材质 ShaderMap 和海量 permutation | 不采用 |
| C++ 静态宏注册全部 shader type | 不采用，pipeline profile 保持数据驱动 |
| 通用 root signature 覆盖所有 shader | 暂不采用；先无损迁移 Captured Character |

## 3. 当前问题

### 3.1 Material 混合了语义数据与 GPU 实现

`Resource/Material.h` 当前同时保存：

- PBR、toon、GFL2、GI 等互斥风格字段；
- `style` shader 选择；
- 逻辑贴图路径；
- D3D12 `TextureResource` 和 descriptor index；
- 每个贴图的 `has*` 镜像标志。

结果是增加 shader 参数、贴图槽或角色管线时必须修改通用资源结构。

### 3.2 StyleRegistry 同时拥有四类职责

`StyleRegistry` 当前混合：

1. 材质 schema 与默认值；
2. shader 路径和变体选择；
3. raster/depth/stencil/blend 状态；
4. PSO 编译、缓存和 reload。

`MaterialTexSlotDecl` 还通过 pointer-to-member 直接连接 `Material` 的路径、标志和 GPU
资源字段，使逻辑材质 schema 无法独立演进。

### 3.3 捕获角色资源路由仍是专用 ABI adapter

`CustomCharacterPass` 迁移前固定 5 个 VS CBV、5 个 PS CBV、2 个 VS SRV、11 个 PS SRV、
23 个 root parameter 和三种手写 `RootFamily`。这些数量与 root index 已由 profile policy、
shader 反射和 staging plan 动态产生，不再位于 pass 类型定义中。

adapter 将 manifest 的 shader、fixed state、MRT/depth-stencil 和物理资源声明预处理为普通
`ProgramAsset`。每个 stage/kind/register 物理绑定使用唯一 source ID，避免同一个 D3D11
resource ID 在不同 draw 或 stage 被覆盖；resource ID 只留在 adapter draw metadata 中，不进入
通用 schema。draw loop 填充动态 CBV/SRV source 后交给通用 executor 构建 binding packet；
字符串、反射、root index 推导以及专用 PSO/绑定循环均不进入逐帧路径。

## 4. 参数域

CBV 只是传输机制，不等于材质参数。每个参数必须有明确所有者和更新频率：

| 参数域 | 所有者 | 示例 | 典型更新频率 |
|---|---|---|---|
| Frame/View | renderer | 相机、时间、屏幕尺寸 | 每帧 |
| Scene | scene/lighting | 主光、环境、雾 | 场景或设置变化 |
| Material | material instance | 颜色、粗糙度、ILM 参数 | 材质变化 |
| Object | draw instance | 世界矩阵、骨骼 palette | 每对象/每帧 |
| Pass | render pass | 阴影矩阵、临时目标尺寸 | 每 pass |
| CapturedABI | compatibility adapter | 尚未抽象的捕获常量快照 | profile 决定 |

长期 register-space 约定：

```text
space0 = Frame / View / Scene
space1 = Material
space2 = Object / Instance
space3 = Pass / RenderGraph transient
space4 = Captured ABI compatibility
```

迁移期允许旧 shader 继续使用原 register/space。sidecar binding metadata 将旧寄存器映射到
上述参数域，不能为追求新约定而改变已经通过 RDC 无损替换的 shader 运算或绑定。

## 5. 目标类型

### 5.1 MaterialData

Material 保存稳定的语义 ID，不保存 shader register、root index 或 PSO：

```cpp
enum class MaterialDomain
{
    Surface,
    Face,
    Eye,
    Hair,
    Transparent,
};

struct MaterialData
{
    MaterialId id;
    MaterialDomain domain;
    FeatureMask features;
    PropertyValueMap properties;
    TextureAssetMap textures;
};
```

`two_sided`、`alpha_test`、`transparent` 可以作为材质表现意图；具体 cull、blend、depth
组合由 pipeline program 决定。GPU texture resource 和 descriptor 属于资源/绑定缓存，不能
继续内嵌在 MaterialData。

渲染侧建立 `MaterialBindingInstance`，CPU 编译缓存按材质 revision 与 pipeline generation
失效；GPU 上传缓存额外包含 binding plan hash 和已编译内容 hash，避免同 ID/revision 的临时
材质实例错误复用。shader reload 导致 layout/signature 变化时重建该缓存；普通材质数值变化
重编译对应实例，`DrawPacket` 在生成 bindings 前核对 revision。

### 5.2 ShaderInterface

编译和反射阶段产生统一接口：

```cpp
struct ShaderInterface
{
    ShaderStage stage;
    std::vector<ResourceBinding> resources;
    std::vector<ConstantBufferLayout> constantBuffers;
    std::vector<InputSemantic> inputs;
    std::vector<OutputSemantic> outputs;
    ShaderInterfaceHash hash;
};
```

至少反射：

- CBV/SRV/UAV/Sampler 的 register、space、count 和 stage visibility；
- constant buffer 成员的名称、类型、offset、size 和数组长度；
- VS 输入 semantic；
- PS 输出 semantic 与 MRT 数量；
- bytecode、编译器版本、defines 和传递 include 的内容哈希。

DXBC 使用 `D3DReflect`；DXIL 使用 `IDxcContainerReflection`/
`ID3D12ShaderReflection`。二者输出相同的引擎侧 `ShaderInterface`。

### 5.3 CompiledRootLayout

预处理器合并同一 program 的各 shader stage，并根据明确策略生成 root layout：

```cpp
struct CompiledRootLayout
{
    RootLayoutSignature signature;
    std::vector<CompiledRootParameter> parameters;
    std::vector<CompiledDescriptorRange> ranges;
    SerializedRootSignature serializedRootSignature;
};
```

精确 `ShaderInterfaceHash` 必须包含：

```text
name + value/resource type + register + space + count + visibility + member layout
```

Root Signature 归并使用独立的 `RootLayoutCompatibilityKey`：

```text
binding policy
+ quantized register ranges per resource kind/space/stage
+ IA/root-constant/bindless flags
+ hardware binding tier policy
```

在约定寄存器连续的通用 layout 中，range 可以由每阶段的最大 CBV/SRV/UAV/Sampler 数量
表达；捕获 shader 若存在稀疏 register 或特殊 root descriptor，key 必须保留 range topology，
不能只看总数。兼容键相同的 program 自动共享同一个 family。`RootFamily` 是编译结果 ID，
而不是 `Standard/Graded/HairDepth` 这样的手写业务枚举。预处理器还必须检查 register 冲突、
root-signature DWORD 预算和不支持的无界数组。

第一阶段保持当前 root descriptor/table 策略以确保输出不变；生成策略稳定后才能考虑合并
descriptor table。反射不会擅自改变资源绑定方式。

### 5.4 CompiledBindingPlan

Binding Plan 把 shader 物理接口连接到语义数据源：

```cpp
struct CompiledBindingPlan
{
    RootLayoutSignature rootLayout;
    std::vector<ConstantCopyOp> constantCopies;
    std::vector<DescriptorWriteOp> descriptorWrites;
    std::vector<RequiredBinding> requiredBindings;
};
```

每条操作使用预解析的索引和 offset。渲染循环不允许：

- shader reflection；
- 按参数名查字符串 map；
- 根据资源数量临时创建 root signature；
- 根据 `Material::style` 进入 shader/PSO if-else 链。

缺少 required binding 必须使 pipeline staging 失败；optional texture 必须在描述中明确
fallback，禁止静默绑定任意白图。

### 5.5 RenderPipelineAsset

Pipeline source 描述：

- pass DAG 和条件；
- shader programs；
- raster/depth/stencil/blend 状态；
- attachment 格式和 load/store 语义；
- 材质 domain/feature 到 program 的选择规则；
- `scene_hdr`、`normal`、`velocity`、`depth`、`final_hdr` 等语义输出。

材质文件不引用具体 shader。模型或场景选择 pipeline profile，pipeline 再按材质 domain 和
feature 选择 program。同一个 MaterialData 可以进入 PBR、Debug 或 Captured Pipeline。

## 6. Pipeline 预处理器

### 6.1 输入

```text
pipeline source
shader source/bytecode
fixed PSO state
material schema
binding source metadata
captured ABI aliases（仅兼容管线）
```

反射只能识别 `CameraPosition` 的类型和 offset，不能知道如何从 Peanut Camera 构造该值。
通用参数由 Frame/Scene/Material/Object/Pass provider 提供；复杂的捕获坐标变换继续由小型
`IParameterProvider`/ABI adapter 实现。adapter 以 ABI ID 注册，不能以角色名或材质名硬编码。

### 6.2 编译流程

```text
compile shader stages
        ↓
reflect and normalize interfaces
        ↓
merge stages and validate collisions
        ↓
classify parameter sources
        ↓
compile exact interface and binding plans
        ↓
quantize root-layout compatibility key
        ↓
validate vertex input / MRT / PSO contract
        ↓
group identical root-layout signatures
        ↓
serialize deterministic pipeline artifact
```

`<model>.character-profile.json` 中的 `rootFamily` 已删除。version 3 profile 只声明物理 range policy
与精确 static sampler state；编译器根据 VS/PS 反射接口生成兼容键并自动归并 family。
29 个主角色 program、normal resolve 和两个 post program 的 CBV/SRV、资源来源、fallback
约束与 root index 已由 staging 生成并序列化进 artifact。event ID 只允许定位捕获证据和
原始资源，不能决定 root layout。

### 6.3 Artifact

首版 artifact 已采用版本化二进制 `.pnsh`，使用稳定字段顺序和规范化路径。当前已经包含：

- schema version；
- source/dependency/compiler fingerprint；
- shader bytecode identity；
- reflected interfaces；
- exact interface hashes 与 compiled root layouts；
- quantized root-layout compatibility keys；
- binding source table、root operation 与 binding-plan hash；

后续 schema 仍需加入：

- PSO descriptors；
- material requirements；
- RenderGraph 输入输出契约。

codec 已保证相同输入产生相同内容哈希，并对非规范顺序、截断、版本、依赖哈希、bytecode
哈希和 adapter ABI 不匹配做确定性拒绝。缓存写入通过临时文件与原子替换提交。

### 6.4 三种执行模式

| 模式 | 行为 |
|---|---|
| Cook | 独立工具生成可随资产发布的 artifact |
| Editor load/reload | 缺失或过期时运行预处理器，成功后写缓存并 staging swap |
| Runtime | 只加载 artifact、创建 PSO 和静态绑定对象，不执行逐帧反射 |

三种模式已经有可执行边界：`PeanutPipelineCook -input <pipeline.json>` 生成 artifact 并默认
以全新 registry 做一次 `TrustArtifact` 复验；编辑器默认使用 `ValidateDependencies`；设置
`PipelineArtifactRuntimeOnly=true` 或环境变量 `PEANUT_PIPELINE_RUNTIME_ONLY=1` 后，内建
pipeline 的 artifact 缺失、损坏或不兼容会立即令加载失败，绝不回退源编译。CI 的 cook fixture
和编辑器 CLI smoke 覆盖这条发布路径。

编辑器 reload 仍遵守现有事务语义：任一 shader、layout、binding 或 PSO 构建失败，整批
staging generation 丢弃，旧 generation 继续渲染。Captured Character 主 Pass 和 Post Pass
会各自重读同一 profile，先完成所有 program、常量基线和 PSO staging；渲染器仅在二者与
其他 pass 均成功后 commit。故意令 post shader 路径失效的验收中，主 Pass staging 已成功、
Post Pass 失败，reload 被拒绝且前后截图为 0 像素差异。

## 7. 服务拆分

旧 `StyleRegistry` 的所有权已按下表拆分：

| 服务 | 唯一职责 |
|---|---|
| `MaterialSchemaRegistry` | 材质属性类型、默认值、编辑器 metadata |
| `ShaderInterfaceCache` | 编译、反射、依赖和接口哈希 |
| `PipelineCompiler` | program 合并、root layout、PSO/binding artifact |
| `RenderPipelineRegistry` | 加载和选择 pipeline profile/program |
| `PipelineStateCache` | root signature、PSO 和 generation 生命周期 |
| `BindingPlanCompiler` | Material/Frame/Scene/Object/Pass 到 shader ABI 的连接 |
| `DrawPacketCompiler` | mesh/material/pass/program 合并为运行时 draw packet |
| `PipelineOutputRouter` | 发布和解析 `scene_hdr` 等语义输出 |

旧的多职责 `StyleRegistry` 已删除。`Resource/MaterialPresetRegistry` 只为编辑器提供
authoring preset、domain/features 和外部参数 catalog 视图，不被 Renderer pass 调用；
禁止形成两套可独立修改的默认值或 PSO 表。b6 默认值、shader member、数组元素、
alias 和 editor metadata 只有
`pbr.style-constants.json` 一个来源，loader 在 staging 时扩展为 `MaterialSchema` 与静态 copy
plan；preset registry 只读取同一 catalog 生成编辑器视图。`MaterialTexSlotDecl` 已删除，
贴图语义进入 `Resource/MaterialTextureSlots`。最终形态不保留 legacy 双通道：scene resource
只持有 `MaterialData`，旧 `Material` 仅可作为 importer 的函数内 DTO，经一次转换后立即丢弃；
编辑器、序列化与 Renderer 不得回写或查询旧结构。迁移期间也不允许把 `MaterialData` 实现为
旧对象的逐帧缓存。

当前代码目录按职责固定如下：

| 目录 | 内容 |
|---|---|
| `src/Graphic/Pipeline/` | 无后端 shader interface、layout/binding/material plan 与 artifact ABI |
| `src/Resource/Pipeline/` | pipeline asset、compiler、selector、CPU registry 与依赖/cache 文件 |
| `src/Renderer/Pipeline/` | D3D12 root/PSO generation、binding packet、graph/provider/draw packet adapter |

## 8. 近期实施阶段

每个阶段独立提交，除文档阶段外均要求行为不变。

### MP0：接口盘点与基线锁定

- 枚举 PBR、Shadow、Outline、Captured Character 和 post program 的完整 binding；
- 记录每个 program 的 shader hash、root signature、PSO/MRT 和参数来源；
- 固定 Remielle 当前参考截图和中间目标哈希；
- 为 pipeline artifact、interface 和 binding plan 确定版本策略。

验收：inventory 能解释当前所有 root parameter；没有 `unknown source`；Remielle 基线可重复。

### MP1：统一 ShaderInterface 反射

- 在现有 `ShaderLoader` 后增加统一 DXBC/DXIL reflection result；
- 实现稳定排序和 `ShaderInterfaceHash`；
- 输出可读诊断，不改变任何现有 root signature 或 PSO；
- reload staging 对比现有声明与反射接口。

验收：所有现有 shader 反射成功；故意制造 register/type 冲突时 reload 整体拒绝；截图不变。

当前生产 shader 均由 FXC 生成 DXBC，文件源码和 MME 生成源码已经全部进入统一反射路径；
测试会在已有 artifact 的情况下故意把真实 CBV 声明成 SRV，并确认恢复与重编译均拒绝。
DXIL 反射不以未使用的占位实现冒充完成，等项目采用 DXC/SM6 时作为对应编译器后端一起加入。

### MP2：PipelineCompiler 与静态 artifact

- 实现 stage merge、精确 interface hash 和量化 layout compatibility key；
- 以 compatibility key 自动归并 root family；
- 实现 artifact 序列化、版本和依赖 fingerprint；
- 第一版严格复现当前 root parameter 策略；
- runtime 从 artifact 创建 root signature/PSO，不重新推导布局。

验收：相同输入重复 cook 的 hash 一致；artifact 过期或损坏能确定性拒绝；热重载保持事务性。

### MP3：CustomCharacterPass 迁移

- 用 artifact 中的动态 binding 列表替换固定 5/5/2/11 数组；
- 删除手写 `RootFamily` 枚举和 `<model>.character-profile.json.rootFamily`；
- 由 `CompiledBindingPlan` 解析 capture snapshot、动态常量和特殊 SRV；
- 保留已经通过 RDC 无损替换的 shader 运算顺序、MRT、depth/stencil 和 blend 语义。

验收：pass 代码不包含 Remielle 的资源数量和 root index；三种现有布局仍自动归并为三个
signature；Remielle 主 pass、中间目标与最终图保持既有基线。

### MP4：材质语义层与 Binding Plan

- 引入不含 D3D12 类型的 `MaterialData`/`MaterialSchema`；
- 引入资源侧 `TextureAssetRef` 与渲染侧 texture binding cache；
- 编译 material property/texture 到 reflected shader binding 的静态计划；
- 为旧 `Material` 提供单向 legacy adapter，现有资产无需一次性迁移。

验收：同一材质不经修改即可进入 PBR 和 Debug pipeline；draw loop 无字符串属性查找；未知、
缺失和类型错误有稳定诊断。

### MP5：StyleRegistry 解体与选择权迁移

- schema/default/editor metadata 迁到 `MaterialSchemaRegistry`；
- shader/PSO/fixed state 迁到 `RenderPipelineRegistry` 和 `PipelineStateCache`；
- `PipelineSelector` 使用 model pipeline profile + material domain/features；
- 删除 `Material::style` 对 shader 的直接选择和 pointer-to-member 贴图表。
- 将 mesh/scene 的材质真源切换为 `MaterialData`，GPU 纹理对象进入 Renderer binding cache；
- 将旧场景/模型字段限制在 import adapter 内，完成迁移后删除 runtime `Material` 通道。

完成状态：上述各项已落地。scene format v6 写 `preset`，仍只读兼容 v4-v5 的 `shader`
键与 pre-v4 `sty` 数组；兼容输入不会作为第二份运行时状态保留。

验收：新增一个同 ABI ZZZ 角色只增加资产、MaterialData 和 pipeline profile；不修改
`D3D12Renderer`、FXAA 或通用材质结构。

## 9. 暂缓范围

以下内容不阻塞近期 MP0-MP5：

- 节点式材质编辑器；
- 用户脚本定义任意 render pass；
- 完全 bindless 材质；
- 自动优化/合并 descriptor table；
- 删除所有捕获 ABI adapter；
- 将所有 RenderGraph pass 立即改成纯数据描述。

先完成接口与所有权解耦，再推进通用 Pipeline DAG executor 和语义输出路由。DLSS 等后处理
只依赖语义输出，不应成为材质系统迁移的前置条件。

## 10. 测试与验收矩阵

### 单元测试

- DXBC/DXIL reflection 归一化结果；
- interface hash 不受枚举顺序影响；
- 语义名不同但兼容的接口能归并为同一 root layout；
- 物理 range/space/policy 不兼容的接口不能错误归并；
- register/space/stage collision；
- root-layout family 自动归并；
- root-signature DWORD 预算；
- artifact version、损坏和 stale dependency 拒绝；
- MaterialData 类型、默认值、required/optional binding；
- BindingPlan 序列化和执行 offset。

### 集成测试

- `shader.reload` 任一环节失败时旧 generation 保持可用；
- scene reload、resize 和多 frame-in-flight 不引用已退休 generation；
- PBR/Shadow/Outline 输出无回退；
- Captured Character 的 MRT、depth/stencil 和 blend 状态与 manifest 一致；
- Debug pipeline 能复用同一 MaterialData。

### 图形验收

- Remielle 的主角色 pass 输出先比较，再比较 post-process 输入，最后比较最终图；
- 迁移 shader binding 期间要求参考场景字节级一致；
- 若浮点/格式原因无法字节一致，必须定位到具体中间目标和像素，不接受仅凭最终截图判断；
- GBV 无新增错误。

## 11. 近期完成定义

本轮架构工作的近期目标是完成 MP0-MP3。达到以下条件后，才开始迁移 MaterialData：

1. 所有 shader program 都有可枚举的 `ShaderInterface`；
2. 5 VS CBV、5 PS CBV、2 VS SRV、11 PS SRV 不再出现在 pass 类型定义中；
3. 三种 `RootFamily` 由量化 layout compatibility key 自动得到；
4. runtime 渲染路径不执行反射、字符串绑定或 root-layout 推导；
5. reload 失败保持旧 generation；
6. Remielle 中间目标和最终输出保持迁移前基线。

MP4-MP5、独立 cook/runtime-only 流程、single-program executor 与资产级 execution DAG 已
完成。Captured adapter 的 29 个主材质 draw 已转成通用资产并由通用 executor 提交；normal
resolve、primary lighting 与 LUT composite 作为一个资产级 DAG 接入，并按原帧时序拆成两个
连续 execution slice。staged generation preview 会在发布前同时验证主 draw 与后续切片，旧
root/PSO/fixed-state/绑定通道已经删除且不再恢复。
