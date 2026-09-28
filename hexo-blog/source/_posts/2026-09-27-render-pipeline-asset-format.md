---
title: "通用自定义 Render Pipeline Asset"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-28T20:56:00+08:00"
permalink: 2026/09/27/render-pipeline-asset-format/
categories:
  - 图形学
tags:
  - astra
  - 技术文档
  - 渲染架构
---

> 由 astra 生成 · 首次发布于 2026-09-27 18:44 · 最近整理于 2026-09-28 20:56（北京时间）

状态：schema v1 / compiler + runtime registry + D3D12 backend 已实现

日期：2026-09-12

## 1. 定位

`RenderPipelineAsset` 是 Peanut 的通用自定义管线输入，不属于 Captured Character、MMD、
原神或绝区零中的任何一种实现。角色复刻 manifest、普通 PBR 配置和用户自定义效果都只是
该资产的不同生产者或使用者。

数据流：

<!-- more -->

```text
*.pipeline.json
  ├─ shader stages
  ├─ reflected binding policy
  ├─ material requirements
  ├─ graphics PSO state（graphics program）
  └─ RenderGraph reads/writes/attachments
             │
             ▼
     RenderPipeline::Compiler
             │
             ▼
  *.pnsh v5 CompiledPipelineArtifact
             │
             ▼
  RenderPipeline::Registry generation
```

编辑器/cook 阶段解析名称并反射；逐帧路径只消费已编译的 root layout、binding plan、PSO
contract 和资源语义索引。Capture adapter 可以把 RDC manifest 转成同一 `ProgramAsset`，
但禁止把 capture resource ID、角色名或固定数量写进通用类型。

## 2. 最小示例

```json
{
  "version": 1,
  "pipelineId": "sample.fullscreen",
  "adapterAbiVersion": 1,
  "artifactRoot": "cache",
  "programs": [
    {
      "name": "composite",
      "type": "graphics",
      "stages": [
        {
          "stage": "pixel",
          "path": "CompositePS.hlsl",
          "entry": "main",
          "target": "ps_5_0"
        }
      ],
      "rootLayout": {
        "maxDwordCost": 64,
        "ranges": [
          {
            "stage": "pixel",
            "kind": "shaderResource",
            "firstRegister": 0,
            "minimumDescriptorCount": 1,
            "maximumDescriptorCount": 1,
            "mode": "descriptorTable"
          }
        ],
        "staticSamplers": []
      },
      "bindings": [
        {
          "stage": "pixel",
          "kind": "shaderResource",
          "register": 0,
          "source": "graph.inputHdr"
        }
      ],
      "resources": [
        {
          "semantic": "scene.inputHdr",
          "source": "graph.inputHdr",
          "format": "r16g16b16a16Float"
        }
      ],
      "pipelineState": {
        "topology": "triangle",
        "raster": {
          "fill": "solid", "cull": "none", "multisampleEnable": false
        },
        "renderTargets": [
          {
            "semantic": "scene.finalHdr",
            "format": "r16g16b16a16Float",
            "load": "load",
            "store": "store"
          }
        ]
      }
    }
  ]
}
```

相对 shader 路径、显式 `artifactRoot` 均相对于 pipeline JSON。省略 `artifactRoot` 时使用
pipeline JSON 同目录下的 `ShaderCache/<pipelineId>`。Program 名必须唯一且不能包含路径
分隔符。

根部可声明可复用的 `bindingLayouts[]`（`id + rootLayout + bindings`）和
`graphicsStates[]`（`id + pipelineState`，可带公共 resources），以及
`materialBindings[]`（`id + constantBuffers/textures`）。program 分别通过
`bindingLayout`、`graphicsState` 引用；引用 binding layout 时禁止同时内联 root/bindings，
引用 graphics state 时禁止同时内联 pipelineState，但仍可追加 program 自己的 resources 与
materialRequirements。`material.bindingLayout` 引用具名材质绑定时禁止同时内联
constantBuffers/textures，模板会根据声明自动生成对应 material requirement。模板只在
loader/preprocessor 展开，后续 compiler、artifact 与 runtime 看到的仍是完整静态 contract，
不存在运行时继承或字符串模板查找。

## 3. Program 字段

### 3.1 Shader 与 root layout

- `type`：`graphics`（默认）或 `compute`；compute program 必须且只能包含一个 compute
  stage，并且不能声明 graphics `pipelineState`；
- `stages[]`：`vertex/hull/domain/geometry/pixel/compute`、路径、入口、target 和可选
  `compileFlags`；捕获型 stage 可声明 `"precompiled": true`，此时 `path` 指向原始
  DXBC，loader 不调用 FXC，但仍执行 shader reflection、binding/layout 校验、依赖哈希和
  artifact runtime verify；
- `rootLayout.ranges[]`：stage、resource kind、register space/range、binding mode、
  grouping 和 root-constant DWORD 数；
- `rootLayout.staticSamplers[]`：静态 sampler 的 filter/address/comparison/LOD；
- `bindings[]`：把反射后的物理 register 映射到稳定 source ID；optional binding 必须明确
  `fallback`。

反射接口中每一个非静态 sampler binding 都必须有声明；声明的类型、register、space 或
stage 不匹配会使整个 program staging 失败。

### 3.2 Material requirements

`materialRequirements[]` 不保存数值，只描述 pipeline 对材质数据的需求：

```json
{
  "source": "material.baseColor",
  "kind": "texture",
  "type": "Texture2D<float4>",
  "requirement": "optional",
  "fallback": "builtin.whiteTexture"
}
```

`kind` 为 `constantData` 或 `texture`。它必须与同 source 的已编译 CBV/SRV binding、
required/optional 状态和 fallback 完全一致，不能用文字 metadata 掩盖 shader ABI 冲突。

资产根部的 `materialSchemas[]` 定义与 shader 无关的 property/texture schema。schema 可用
`extends` 继承同一文件内的另一个 schema；父项不要求先声明，循环、未知父项会拒绝，子项可
覆盖同 ID property/texture，并叠加 feature 条件。继承只发生在 loader 阶段。

property 还可声明 `aliases[]`、`legacyProperty` 和 `editorVisible`。alias 与 canonical ID 在
一个展平 schema 中必须全局唯一；`legacyProperty` 只用于旧 `Material` 单向适配，不进入
shader ABI；`editorVisible` 供编辑器生成参数面板。三项都会进入 `MaterialSchema` v2 hash，
因此 metadata 变化会确定性失效旧 binding artifact。

`.pnsh` v5 会把 property 的解析优先级固化为 canonical ID、排序后的 aliases、最后是
import-only ID。实例打包只查 `MaterialData` 与编译结果；import-only ID 仅用于旧文件的一次性
转换，不代表 scene/runtime 可以保留第二份 legacy 材质状态。

program 的 `material` 字段只负责把 schema 语义连接到 shader 接口。小型 program 可内联：

```json
{
  "material": {
    "schema": "surface.custom",
    "constantBuffers": [
      {
        "source": "material.constants",
        "members": [
          { "property": "tint", "member": "Tint" }
        ]
      }
    ],
    "textures": [
      { "source": "material.albedo", "texture": "albedo" }
    ]
  }
}
```

多 program 共用相同 ABI 时，应把上述声明提取为根部模板：

```json
{
  "materialBindings": [
    {
      "id": "surface.common",
      "constantBuffers": [
        {
          "source": "material.constants",
          "type": "MaterialConstants",
          "members": [
            { "property": "base.tint", "member": "Tint" }
          ]
        }
      ]
    }
  ],
  "programs": [
    {
      "material": {
        "schema": "surface.custom",
        "bindingLayout": "surface.common"
      }
    }
  ]
}
```

Staging 会验证 property 类型与 reflected member 类型/offset/size、跨 stage cbuffer 布局、
texture SRV 和 required/fallback，然后把精确 copy/source-index 计划写入 `.pnsh`。运行时不再
读取 member 名。

大型逐风格常量表可放在 pipeline 相邻的外部 catalog，并由 program 显式引用：

```json
{
  "styleConstantCatalog": "pbr.style-constants.json",
  "programs": [
    {
      "name": "toon",
      "material": {
        "schema": "forward.toon",
        "bindingLayout": "forward.constants",
        "styleConstants": "toon"
      }
    }
  ]
}
```

catalog 自身使用 `version + blocks[]`；每个 block 声明稳定 `id`、`source`、reflected cbuffer
`type`、`expectedBytes`，以及 `parameters[]` 中的 `id/default/member`、可选 `element`、
`aliases`。`element` 用于显式绑定 float4 cbuffer 数组，
不能依赖参数排列顺序猜测 16-byte stride。loader 会在编译任何 program 前，把所有被引用
block 预展开进最终 `MaterialSchema`，再生成 reflected copy plan；多个 program 共用 schema
时，声明必须完全一致，否则整组 staging 失败。预展开的参数默认向编辑器可见；冻结的 legacy
bridge 只负责把旧 `Material` 字段投影成相同 property ID。运行时和 `StyleRegistry` 兼容视图
都只消费这个 catalog，不保留第二份 C++ 默认值表。

### 3.3 RenderGraph contract

- `resources[]` 声明普通图资源，`semantic` 是管线语义，`source` 是 binding plan source
  ID，`access` 为 `read`（默认）、`write` 或 `readWrite`；write/readWrite 必须绑定 UAV；
- `pipelineState.renderTargets[]` 同时声明 MRT 顺序、格式、load/store 和 blend；
- `pipelineState.depthStencil` 可声明 depth/stencil 状态及 attachment semantic；
- attachment 的格式和 slot 必须与 PSO contract 一致；read 必须能解析到实际 SRV/UAV
  binding。

这一区分很重要：`scene.inputHdr` 表达 RenderGraph 语义，`graph.inputHdr` 表达参数 provider
来源，二者在预处理阶段连接，逐帧不做字符串匹配。

Compute 与 graphics 使用同一个 root/binding/material/RenderGraph contract。差别只在执行类型：
compute 不携带 MRT、深度模板或光栅状态，输出通过 UAV resource contract 声明。

### 3.4 Fixed PSO state

Graphics program 的当前 schema 覆盖：

- vertex input semantic/format/slot/offset/classification；
- topology 与 strip-cut；
- fill/cull/winding、depth bias、depth clip、conservative raster；
- per-MRT blend/logic/write mask；
- depth/stencil 及 front/back face operation；
- RTV/DSV format、sample mask/count/quality、node mask 与 PSO flags。

继承具名 graphics state 后，program 可用 `renderTargetWriteMasks` 按 MRT slot 覆写写掩码，
也可继续用 `blend` 覆写各 target 的混合语义。`builtin.pbr` 的通用 PBR
`pbrTransparent` 因此只向 scene color 写入 alpha blend 结果、关闭第二个 MRT 写入并关闭
depth write；它是运行时 material selection 的普通 program，不是 pass 内特判。风格化材质
不会被这个通用 PBR variant 抢占；其透明变体仍应由对应风格 program 声明。当前通用 executor
尚未提供透明物体排序，资产作者不能把这个 baseline 当作完整 order-independent transparency。

常用 format 名包括 `r8Unorm`、`r8g8Unorm`、`r8g8b8a8Unorm`、`r8g8b8a8UnormSrgb`、
`r10g10b10a2Unorm`、`r11g11b10Float`、`r16g16b16a16Float`、
`r32Float/r32g32Float/r32g32b32Float/r32g32b32a32Float`、
`r32g32b32a32Uint`、`d32Float` 和 `d32FloatS8x24Uint`。

### 3.5 Program selection

可参与 mesh pass 选择的 material program 声明 `selection.pass` 和可选整数 `priority`：

```json
"selection": {
  "pass": "surface.main",
  "priority": 10
}
```

材质匹配条件不在 selection 中重复维护，而是直接来自 program 引用的 `MaterialSchema`：
domain、requiredFeatures 与 forbiddenFeatures。`PipelineSelector` 在 generation staging 时
拒绝同 pass、同优先级、同 specificity 且匹配集合相交的规则；draw packet 编译时按
priority、schema specificity 选择 program，并保存稳定 generation handle。没有 selection
的 utility/post program 仍按 program name 显式解析。
歧义检查只在 generation staging 执行；已发布 snapshot 的 `Select` 只扫描预验证规则，
不在每次选择时重跑成对重叠检查。

selection 保留在 pipeline JSON/compiled asset 层，不写回 MaterialData，也不让材质引用
shader 名称。JSON 已作为 shader artifact dependency；规则修改会触发 editor/cook 重建，
runtime-only 仍读取 pipeline profile 后配合 `.pnsh` 创建 generation。

`D3D12PipelineDrawPacketCompiler` 是 selection 的消费边界：它在 scene/draw-packet rebuild 时
选择 program，并同时固化 material byte-copy、typed graph resource、Frame/Scene/Object/Pass
provider callback 和 geometry identity。provider 注册仍使用 source ID，但 staging 后的计划只
保存 source index 与 callback；每帧不会重新选择 program，也不会扫描 provider 名称。材质值
在 packet 创建后被编辑时，`BuildBindings` 会在绑定前核对同一材质 ID 的 revision 并重建
`MaterialBindingInstance`；不同材质 ID 会被拒绝，program 重新选择仍属于 packet rebuild。

### 3.6 Draw routing

program 可选声明与其 shader/PSO 同 generation 的静态绘制路由：

```json
"drawRouting": {
  "stencilReference": 165,
  "additionalPrograms": ["hairBlend"],
  "outlineProgram": "toonOutline"
}
```

`stencilReference` 是 D3D12 PSO 不包含的逐 draw 动态值。`additionalPrograms` 按声明顺序
复用主 draw 的 geometry 和已绑定资源；`outlineProgram` 是由 outline 运行时开关触发的
条件 follow-up。compiler 在发布 generation 前拒绝缺失、自引用、重复或 root layout
不兼容的 follow-up；逐 draw 不再从旧材质风格名推断 stencil/附加 pass/描边族。

`dedicatedPipeline`、`castsShadow` 和 `characterShadowCaster` 是可用于 schema selection
与跨 pass 剔除的 material feature。它们表达参与意图，不指定 shader 名；旧
`Material::style` 只在 `LegacyMaterialAdapter` 边界投影成这些 feature。

### 3.7 Execution DAG

固定 utility/post program 可以组成资产级执行图：

```json
"execution": {
  "passes": [
    { "id": "normal.resolve", "program": "normalResolve" },
    {
      "id": "lighting.primary",
      "program": "primaryLighting",
      "after": ["normal.resolve"]
    }
  ]
}
```

`id` 是 RenderGraph pass identity，`program` 引用同一 pipeline asset 中的固定 program；
`after` 只描述没有资源边或需要额外约束的顺序。compiler 同时从 program 的 RenderGraph
contract 推导唯一 writer→reader 边，再用源声明顺序作为 tie-breaker 做稳定 Kahn 排序。
缺失/自引用依赖、缺失 program 和 cycle 均在 shader 编译前拒绝；cycle diagnostic 包含完整
pass 路径。当前资源模型尚无 SSA version，因此同一 execution graph 内出现多个 writer 时
确定性拒绝，不能用声明顺序猜测覆盖关系。

D3D12 generation staging 把排好序的 program 名编译成 generation-local index；
`D3D12PipelineExecutionPlan` 再为每个节点生成通用 single-program executor，并严格按 DAG
顺序消费 graphics/compute invocation。逐帧路径不解析 pass/program 名，也不能通过调换
invocation 顺序绕过拓扑。外部/imported 资源允许没有本图 writer。

## 4. 编译、加载与事务边界

`RenderPipeline::Loader` 只解析并规范化资产；`RenderPipeline::Compiler` 对所有 program：

1. 编译/恢复 shader stage，并验证统一 `ShaderInterface`；
2. 生成 root compatibility key 与 `CompiledBindingPlan`；
3. 验证 material/RenderGraph/PSO contract；
4. 写入确定性 `.pnsh` v5 artifact；
5. 只有全部 program 成功才返回一个 `CompiledAsset` generation。

某个 program 失败时可能已更新磁盘 cache，但不会产生可提交的部分 runtime generation。
热重载的 owner 必须在完整 generation 成功后一次 swap；磁盘 cache 不是运行时可见状态。

`ValidateDependencies` 用于编辑器/cook；`TrustArtifact` 用于 runtime-only 加载。后者仍
校验 schema、adapter ABI、artifact 内容和内部各层 hash，只跳过源文件存在性/内容检查；
artifact 缺失、损坏或不兼容时直接失败，禁止回退到 HLSL 编译。

独立 cook 入口为 `PeanutPipelineCook`：

```powershell
PeanutPipelineCook.exe `
  -input Assets/pipeline/shadow.pipeline.json `
  -input Assets/pipeline/pbr.pipeline.json `
  -format json
```

工具默认先以 `ValidateDependencies` 生成全部 program artifact，再用新的 registry 以
`TrustArtifact` 重新加载整组资产，确保产物可被纯运行时消费。`-skip-runtime-verify` 只用于
需要拆分验证步骤的构建流水线。编辑器通过 `PipelineArtifactRuntimeOnly=true` 进入严格模式；
CI/临时进程也可用 `PEANUT_PIPELINE_RUNTIME_ONLY=1` 覆盖配置。CTest 以 fixture 保证 cook
先于严格模式的编辑器 CLI smoke 执行。

`RenderPipeline::Registry::StageFiles` 对一组 pipeline asset 做全量 staging；只有所有 asset
和 program 都恢复成功，`Commit` 才发布新的单调递增 generation。`Acquire` 返回稳定快照，
`Resolve` 产生的 `ProgramHandle` 持有该 generation，因此 reload 后旧 handle 仍然有效，
逐帧执行不需要再次按字符串查找。`TrustArtifact` 路径已有“删除 HLSL 后仍可加载”的回归测试。

`D3D12RenderPipelineCompiler` 在 generation staging 阶段把 `CompiledProgram` 转成 root
signature 与 graphics/compute PSO。它直接消费 artifact 中的 root layout、stage bytecode 和
fixed state，不执行反射或名称猜测；WARP 回归测试会实际创建两类 D3D12 PSO。调用方应缓存
返回对象到 runtime generation，禁止在逐帧/逐 draw 路径创建 PSO。

`D3D12RenderPipelineRegistry` 把 artifact staging、全部 D3D12 root/PSO 创建和发布合成一个
事务。任一 program 创建失败时不改变 live generation；提交时旧 generation 进入指定的
frame-slot retire bin。调用方只在该 slot fence 已完成后调用 `BeginFrame(slot)`，因此 reload
不需要 `WaitForGpuIdle`。运行中的 draw packet 持有 runtime handle 时也会自然延长 generation
寿命。

`D3D12MaterialBindingCache` 在同一个 frame-slot reuse 边界内更新材质常量上传和纹理描述符；
cache key 是 material ID、material revision、material binding-plan hash 与实例 content hash。
最后一项覆盖常量块字节和纹理资产/颜色空间/fallback，防止两个同名同 revision 的瞬时材质
错误共享 GPU cache。它把结果写入按
artifact source index 排列的稠密 source table。Frame/Scene/Object/Pass/RenderGraph provider
补齐同一张表后，`D3D12PipelineBindingPacketBuilder` 一次性生成 root CBV/SRV/UAV、root
constants 和 descriptor-table 操作。连续 table 会先复制到当前 frame descriptor heap，draw
执行只遍历预解析 root 操作，不进行反射、字符串查找或 register 查找。全局持久
shader-visible heap 启用 CPU-only copy-source mirror：descriptor 创建写 mirror，帧开始发布到
直接绑定堆，通用 table 也只从 mirror 复制，禁止把 shader-visible heap 用作 D3D12 descriptor
copy source。

`D3D12RenderGraphBindingPlanCompiler` 把 contract 中的 read/write/attachment 声明映射到现有
RenderGraph pass，并在 graph 构建后把 semantic 编译成 typed resource handle。handle 带
resource generation：resize 只重建底层资源而保持 handle，有 `Reset` 的 scene/graph 重建会
使旧计划确定性失效。逐帧 provider 直接通过 handle 取得 persistent SRV/UAV 索引，不再按
semantic 字符串查表。普通 SRV/UAV 资源可解析为 texture 或 buffer；color/depth attachment
必须解析为 texture，类别不匹配在 plan 编译阶段拒绝。

`D3D12PipelinePassExecutor` 是单个已编译 program 的通用执行边界。staging 时它持有稳定
generation handle，编译 RenderGraph/provider 计划和 MRT/DSV typed handle；逐帧只组装 binding
packet、应用 graph barrier、绑定 root/PSO/descriptor heap，并执行 graphics draw 或 compute
dispatch。graphics 路径按 contract 执行 attachment load/store、MRT 顺序、stencil reference；
barrier 计划同样保存 `ResourceHandle + RGAccess`，执行不依赖每帧重建的 pass-name map；
动态 viewport/scissor、geometry、dispatch group 和 clear value 由调用方提供。clear value 不属于
shader ABI，缺失时确定性拒绝，不猜测 reverse-Z 或 pass 背景色。WARP 集成测试会实际提交一条
fullscreen draw 和一条 compute dispatch，并把验证层 error/corruption 视为失败。

## 5. 当前边界与下一步

已完成：通用 JSON loader、graphics/compute program compiler、PSO/材质/RenderGraph contract v5
序列化、D3D12 fixed-state 无损 capture/apply、graphics/compute root+PSO 创建、stale contract
触发重建、CPU/GPU 事务式 registry generation、frame-slot fence retirement，以及不读取 HLSL
的 runtime-only artifact 恢复；v5 还保存已对 reflection 验证的 material byte-copy/texture
source-index plan。PBR/Toon/GFL2/Genshin/Outline/Shadow 已迁入该资产，b4/b6 都使用同一
`MaterialBindingInstance`；`materialDebug` 验证同一材质数据可被另一个 pass/schema 接受；
通用 single-program pass executor 已覆盖 graphics/compute、typed attachment、load/store、
descriptor heap 要求与实际 WARP 提交。

独立 `PeanutPipelineCook`、严格 `TrustArtifact` 失败语义和 runtime-only 编辑器入口也已完成；
clean CI 会先 cook PBR/Shadow、Remielle post 与由 profile 适配生成的 29 个主材质程序，再验证
编辑器无需读取其 HLSL 即可启动并完成 CLI smoke。
draw packet staging 还会把主 program、`additionalPrograms` 与可选 outline 一次解析为同一
generation 的稳定 handle route；PBR 已直接消费该 route，逐帧 draw loop 不再按 program 名
查找 layered/outline PSO。
资产级 execution DAG、稳定拓扑编译和多 program D3D12 execution plan 也已落地；WARP 测试
实际按 `compute → graphics` 拓扑提交并拒绝反序 invocation。Captured adapter 的 normal
resolve、primary lighting 与 LUT composite 也已迁入同一通用资产/DAG：normal resolve 作为
第一个连续切片保留在角色主 Pass 尾部，后两个节点作为第二个连续切片保留在 post 边界，因而
SSGI/Outline 读取 `gnormal` 的既有帧时序不变。两个宿主只提供 profile 纹理、动态常量与
viewport，shader/root layout/PSO/attachment/barrier 均由通用 executor 消费。

execution DAG 的 `after` 不会在 runtime generation 中丢失；通用 plan 声明 RenderGraph pass
时会同步写入显式 `After` 边。RenderGraph RG2-2 因而能用同一份资源依赖与资产顺序约束生成
稳定拓扑，而不是仅依赖资产 compiler 已排序后的数组位置；RG2-3 起宿主 renderer 使用该
拓扑作为真实命令记录顺序。

Captured adapter 的 29 个主材质 draw 也已经生成 `zzz.remielle.main` 通用资产。适配边界把
manifest 的 shader、fixed state、MRT/depth-stencil 与物理绑定声明转换成普通
`ProgramAsset`；capture resource ID 只保留在 adapter 的 draw metadata 中，不进入通用
schema。每个物理 stage/kind/register 绑定拥有唯一 source ID，宿主填充动态 CBV 和 SRV 后由
`D3D12PipelinePassExecutor` 构造 binding packet 并提交 draw。旧 pass-owned root signature、
PSO、input layout、fixed-state 解析与手写绑定循环已经删除。

staged CPU/D3D12 generation 支持只读 preview；`shader.reload` 会先针对尚未发布的 generation
编译两个 execution slice 和 29 个主 draw executor，全部成功后才原子提交 registry 与
Captured pass 状态。clean CI 同时验证生成型主资产的 29 个 artifact 与 runtime-only 恢复。

尚未完成：

- RenderGraph RG2-0 至 RG2-3 已能为实际帧顺序生成 SSA version、多 writer 依赖链、typed
  texture/buffer binding、稳定执行拓扑、compiled barrier target 与资源 lifetime；pipeline
  asset DAG 的显式 version schema 和跨资产 writer 链留到需要跨宿主编排时再引入，不用声明
  顺序猜测覆盖关系；
- 风格化透明排序仍属于后续场景 draw scheduling，不放回材质或 executor 特例。
