---
title: "材质系统设计稿"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-28T20:56:00+08:00"
permalink: 2026/09/27/material-system-design/
categories:
  - 图形学
tags:
  - astra
  - 技术文档
  - 渲染架构
---

> 由 astra 生成 · 首次发布于 2026-09-27 18:44 · 最近整理于 2026-09-28 20:56（北京时间）

> ShaderKey、PipelineDesc、root-layout reflection、事务式 PSO generation 和条件式
> PipelineCache 的长期设计见 `Docs/shader-pipeline-architecture.md`。本文继续只负责
> 材质风格、参数、贴图槽和 StyleRegistry 语义。

> 2026-09-11：`StyleRegistry` 不再是目标架构中的材质与 pipeline 共同入口。材质语义、
> shader 物理 ABI、预处理后的静态 binding plan 和迁移阶段，以
> `Docs/material-pipeline-decoupling-development-plan.md` 为准；本文以下内容作为现状与
> legacy 迁移依据保留。

<!-- more -->

> 2026-09-12：`Resource/MaterialData` 与 `MaterialSchema` 已落地。核心类型不包含
> DirectX/D3D12/shader/PSO；属性和纹理按排序后的稳定语义 ID 保存，修改产生 revision，
> schema 负责 domain、feature、类型、默认值和 required/fallback 校验。旧 `Material` 仅通过
> `LegacyMaterialAdapter` 单向转换，GPU `TextureResource` 不进入新数据层。后续静态 binding
> plan 与 runtime cache 以 `Docs/material-pipeline-decoupling-development-plan.md` 为准。

> 同日进展：`Graphic/Pipeline/MaterialBindingPlan` 已在 staging 阶段把显式 property/member 声明与
> `ShaderInterface`、`CompiledBindingPlan` 和 pipeline material requirement 交叉校验，产出
> cbuffer 精确 offset/size 与 texture source index。实例缓存键为
> `(MaterialRevision, CompiledMaterialBindingPlanHash)`；计划已进入 `.pnsh` v5，逐 draw 不查
> 属性名或反射 shader。

> legacy import 不再接收目标 schema：adapter 一次性生成 canonical `MaterialData`（包括
> style constant 所需的 float4 语义值），schema alias/import ID 由 `.pnsh` v5 静态计划解析。
> scene/runtime 的最终所有权只能是一份 `MaterialData`；旧 `Material` 不能作为缓存真源。

> 2026-09-12 当前实现：`Assets/pipeline/pbr.pipeline.json` 已拥有 PBR、Toon、GFL2、
> Genshin、分层头发和 outline 的 shader、root layout 与全部 fixed state；PBR 主程序由
> `MaterialData` domain/features 选择。stencil reference、附加 draw 和 outline follow-up
> 也由 program `drawRouting` 预处理；阴影参与与专用管线排除使用 material feature。
> 生产 Renderer 不再调用 `StyleRegistry`；`Resource/MaterialPresetRegistry` 只提供
> authoring preset、domain/features 与外部参数 catalog 的编辑器视图。Mesh/scene 只保存
> `MaterialData`，GPU 纹理对象只保存在 renderer 的 `RenderPrimitive` cache；旧 `Material` 只在
> Assimp 和 pre-v4 scene parser 内作为 DTO，转换后立即丢弃。通用贴图语义位于
> `Resource/MaterialTextureSlots`，旧 DTO 字段访问隔离在
> `LegacyMaterialTextureSlots`。

> 同日后续：PBR 公共 b4 已不再由 renderer 手写字段拷贝。`pbr.pipeline.json` 的
> `forward.parameters` schema 和 `forward.constants` binding template 在 cook/staging 时
> 展平并按 reflection 生成 byte-copy plan；运行时缓存 `MaterialBindingInstance`，材质编辑通过
> monotonic revision 失效。b6 风格参数的默认值、alias、editor metadata 与 reflected
> member/array element 已迁入 `Assets/pipeline/pbr.style-constants.json`；pipeline loader 在
> staging 时将被 program 显式引用的 block 展平到同一 schema/copy plan。b4 与 b6 共用一个
> `MaterialBindingInstance`，legacy slice 只剩 GPU 传输布局含义，不再拥有参数定义。

> 2026-08-13 起稿。动机:GI/HSR/GFL2 复刻实验证明,渲染数学本身可以 1:1
> 还原,瓶颈全在**材质接线和调参的工程成本**——加一种风格要动 6+ 处
> C++,改一个参数要改 shader 源码 + 重启编辑器。目标:风格/贴图/参数全部
> 数据驱动,新增角色渲染风格 = 写 shader + 写材质描述,**不碰引擎 C++**。
> 本文档覆盖:现状盘点、痛点、目标形态、数据格式、分阶段实施。

## 1. 现状盘点

### 1.1 Material 结构(Resource/Material.h)

一个**扁平大杂烩 struct**:PBR 基础字段 + toon 参数 + GFL2 参数 + GI 参数
+ 眼部参数(每个风格十几个 float/color)+ 贴图路径字符串(diffuseTexture/
lightMapTexture/rampWarmTexture/faceSdfTexture/giProbeTexture/...)+ 对应的
TextureResource GPU 句柄和 has* 标志。目前约 60 个字段,每加一个风格参数
就在这里加一行。

### 1.2 材质常量缓冲(Renderer/Constantbuffer.h + Assets/shader/Common.hlsli)

`MaterialConstants`:所有风格共享的**单个扁平 cbuffer**,C++ 和 HLSL 各
维护一份手工对齐的布局。新参数追加在尾部(16 字节对齐,带 pad);贴图
存在位以 `has*Texture` float 内嵌。D3D12Renderer.cpp:1272-1330 逐字段从
Material 拷贝。每个 submesh draw 一份(cbvIndex 切片)。

### 1.3 风格选择与 PSO(Renderer/PBRPass.cpp)

- `pbr.pipeline.json` 声明 program、共享 binding layout、graphics-state template 与每程序
  override；运行时 registry 一次 staging 全部 root signature/PSO。
- `LegacyMaterialAdapter::Classify` 把旧材质投影为 domain/features；`PipelineSelector` 按
  schema specificity/priority 选择主 program，PBR pass 只缓存选择结果与具名 root 映射。
- 描边和分层头发仍由 CPU draw routing 发起额外 draw，但使用同一 pipeline generation
  中的独立 program，不再由旧材质兼容表创建 PSO。

### 1.4 贴图绑定(PBRPass.cpp 460-530)

资源层 `MaterialTextureSlots` 提供稳定语义与 legacy 字段访问；pipeline asset 把语义源
编译为 root parameter。PBR pass 不持有 register/root 数字，缺失槽仍绑定默认白图。
旧 `Material` 的具名路径、GPU resource 和 has 标志尚作为兼容存储保留。

### 1.5 资产侧自动接线(Resource/AssimpModelLoader.cpp)

加载时按**目录/文件名特征**猜风格并写字段:
`WireGenshinTextures`(目录含 FaceSDF/Body_Lightmap → GI 角色风格，按材质名分
face/hair/body/dress/dress01/pupil；Dress 两套独立 style，避免错读 Stockings
常量布局；Body01 使用独立 `giBodyCrystal`，绑定 crystal environment/pattern
资源并保持 Back Cull)、`WireHsrToonTextures`、
`WireGfl2ToonTextures`(normalmap/*_orm 签名)。GI 还有 giGameUv 检测
(diffuse 路径含官方命名 → 关 MMD 替代)和 tex_conv_a0 alpha-0 换接。

雷米埃尔验证资产不走文件名猜测：捕获输入流组装的 glTF 保留 UV0-UV3，
`materials/*.mat.json` 明确选择 `zzzHair`/`zzzBody`/`zzzWings`/`zzzFace`/
`zzzFaceMask`/`zzzEye`/`zzzHairShadow`/`zzzHairShadowLayer`/`zzzTransparent`
并绑定 D/N/M/A、face SDF、eye lookup、
overlay 与 wings shaping 纹理。透明材质的 depth/color/outline 是 StyleRegistry
附加 pass 拓扑，不由 loader 特判。

### 1.6 编辑与持久化

- CLI `material.set -name X -property P -value V`:
  EditorController.cpp 的 scalarProps 表(~470,名字→成员指针)+ 颜色/路径
  特判;properties 输出表(~711)同步维护。材质改动走撤销栈 + 逐帧常量上传。
- 场景持久化:scene json 的 `sty` 行 = **固定个数 float 的 sscanf 位置列表**
  (EditorController.cpp:1905-1930),加字段就要同时改三处(数组、格式串、
  数量),旧文件无版本兼容。

### 1.7 调参回路

改 HLSL → 杀编辑器 → 重启 → 重设 render 设置 → CLI 截图 → 读 PNG。
shader 编译错误只在 log;没有热重载。

## 2. 历史痛点与当前状态

1. **legacy 资产边界**：已收口。scene/mesh/editor/pass 只消费 `MaterialData`；旧字段只在
   importer/pre-v4 parser 的 DTO 内存在，经 `LegacyMaterialAdapter` 一次转换后丢弃。
2. **参数藏在 shader 源码里**:转录的游戏常量写成 `static const float4`,
   调任何值都要编辑 shader + 重启编辑器。同一 shader 不同角色要不同常量
   时无法表达(目前靠全局限定值)。
3. **贴图槽语义硬编码**:t18-t24 的含义由 shader 注释约定,C++ if 链逐槽
   绑;加贴图类型要动 Material/ResourceManager/绑定链三处。
4. **持久化脆弱**:sscanf 位置列表,加字段即破坏兼容。
5. **接线靠猜**:按文件名特征自动接线对官方包有效,对变体资产(改名、
   分包)就失灵;无法手工覆盖并保存(除了脆弱的 sty 行)。

## 3. 目标形态

```
Assets/model/<char>/
  model.gltf
  textures...
  materials/
    face.mat.json        # 每材质一个描述文件
    body.mat.json
    ...
```

```json
{
  "preset": "gi",                      // authoring preset，不是 shader 路径
  "params": {                           // 键值参数块,覆盖 preset/catalog 默认
    "G280": [0, 0, 0, 0.2453],
    "G314": [0, -1, 0, 100]
  },
  "textures": {                         // 命名槽 → 路径(相对资产目录)
    "faceSdf": "Avatar_Girl_Tex_FaceSDF.png",
    "lightmap": "..._Tex_Face_Diffuse.png",
    "region": "Avatar_Girl_Tex_Face_Region.png"
  },
  "inherits": "gi_face_default"          // 可选:继承另一个描述
}
```

- **材质预设**只表达 domain/features 和编辑器参数默认值；VS/PS、fixed state、pass topology
  与物理绑定均由 pipeline asset 独立表达。
- **材质描述文件**是资产的一部分:提取管线/转换脚本直接生成它;
  引擎 loader 发现 materials/ 目录就按描述建材质,**自动接线退化为
  "生成默认描述文件"**,且结果可在编辑器里改并写回。
- 参数块**逐材质**,不再挤扁平 cbuffer:shader 里声明
  `cbuffer StyleParams : register(bX) { float4 G280; ... }`,引擎按风格
  注册表的默认值 + 材质描述覆盖值填。

## 4. 关键设计

### 4.1 Pipeline asset 与 legacy facade

- `RenderPipelineAsset` 拥有 stage、root policy、binding source、material schema/selection、
  attachment 和 fixed state；`D3D12RenderPipelineRegistry` 发布 fence-safe generation。
- `pbr.style-constants.json` 是 b6 默认值、alias、editor metadata 与 shader member 映射的
  唯一来源；`MaterialSchemaRegistry`/binding plan 在 staging 时消费它。
- `pbr.pipeline.json` 的 `drawRouting` 拥有逐 draw stencil reference、additional program
  和 outline program；编译期验证 follow-up 存在且 root layout 兼容。
- `Resource/MaterialPresetRegistry` 只从同一 catalog 生成 authoring/editor 视图，
  不被 Renderer pass 调用，也不保存 shader、PSO、root layout 或 draw topology。
- 新增同 ABI program 应只改 pipeline asset 和 shader；不能把 shader 路径、PSO 或 root
  槽位重新放回 `StyleRegistry`。

### 4.2 参数块(逐材质 cbuffer)

- 每风格一个外部 catalog block；每个参数显式给出 reflected member 和可选数组 element，
  不以 JSON 顺序猜测 shader 布局。每材质一份实例（默认值 + 覆盖），上传复用现有逐
  submesh 的 material/style 两段切片机制，根表槽位不变。
- **迁移策略**:不动现有 MaterialConstants!第一阶段参数块只覆盖**新增**
  内容;现有 has*/材质浮点照旧。第二/三阶段再把存量参数迁入注册表默认
  值,扁平 cbuffer 逐步掏空。
- shader 侧:把 `static const float4 G280 = ...` 换成 cbuffer 读取。转录
  shader 的 dump 值变成注册表的默认值——**改参数不再碰 shader**。

### 4.3 贴图命名槽

- `Resource/MaterialTextureSlots` 只声明 `diffuse`、`faceSdf`、`lightmap` 等材质语义与
  legacy alias；shader register/root mapping 只存在于 pipeline asset。
- importer 已把旧具名字段一次投影成 `MaterialData::Textures()` 的稳定实例，由
  `MaterialBindingPlan`/GPU cache 绑定；`albedo` 继续显式别名到 `diffuse`。

### 4.4 热重载

- CLI `shader.reload` 对所有 pipeline asset 建立完整 staging generation；任一 shader、
  reflection、layout 或 PSO 失败都保留旧 generation。成功后按 frame-slot fence 退休旧对象。
- 编译错误:保持旧 PSO,log + 屏幕角标提示,不崩。
- 配套:`material.reload`(重读材质描述文件)。调参回路缩到:
  改 json/HLSL → 一条 CLI → 截图。

### 4.5 编辑与持久化

- `material.set -name X -property <参数名> -value ...` 直接写参数块键值;
  撤销栈照接。Inspector 从注册表 params 自动生成控件(都是 float4)。
- 场景/资产持久化改为**键值 json**(材质名 → {shader, params 覆盖,
  textures 覆盖}),废除 sscanf 位置列表;读旧格式时做一次性转换。
- `scene.export` 的材质段同样改键值;导入时未知键 warning(呼应之前
  "贴图没解析出来要打 warning"的需求——所有描述解析失败都必须响日志)。

### 4.6 loader 自动接线的归宿

保留现有 Wire* 签名检测,但输出从"写字段"改为"生成材质描述"(内存
对象,可选择落盘)。用户手改的结果永远优先于自动接线(描述文件存在
就不覆盖)。

## 5. 历史迁移阶段（均已完成并被当前 pipeline asset 架构收口）

**Phase 1:注册表 + 惰性 PSO + 参数块(历史过渡形态)**
- 当时引入 renderer 风格表承接 PBR 分支；该表现已迁至
  pipeline asset；当前 `Resource/MaterialPresetRegistry` 不拥有或选择 PSO。
- 新建逐风格参数 cbuffer 通路(根签名加一个槽);先把 **gieye 一个风格**
  的参数迁过去做样板(它最新、参数最少)。
- 验收:现有场景渲染逐像素不变;加新风格只动注册表+shader。

**Phase 2:材质描述文件 + 键值持久化**
- mat json 读写(Resource 层);loader 优先读 materials/,没有再走自动
  接线(生成内存描述)。
- scene json 材质段改键值 + 旧格式转换;材质编辑撤销照旧。
- 验收:gi_marionette_game 全量用描述文件驱动;重启编辑器改动持久。

**Phase 3:热重载 + 存量参数迁移**
- shader 文件监视 + PSO 重建;`shader.reload` CLI。
- toon/GFL2/GI 各风格的 cbuffer 字段逐个迁入注册表默认值,扁平
  MaterialConstants 缩到 PBR 通用集。
- 验收:调 GI 阴影参数不重启编辑器;Material.h 删掉一半字段。

**非目标(本期不做)**:材质图/节点编辑器、运行时风格切换动画、
GPU 驱动的 per-material 间接参数化。

## 6. 风险与注意

- **布局漂移**:C++ 参数块布局必须与注册表声明一致——用静态断言/
  启动自检(按声明重算偏移,对比 sizeof)防呆,这是旧扁平 cbuffer
  时代最大的坑。
- **PSO 重建与在途帧**:重建必须等 GPU 时间线安全点(参考现有
  纹理运行时上传的帧同步做法)。
- **转录 shader 的默认值 = 截帧 dump**:迁参数时原值进注册表,
  别手滑改数字;转移前后做一次逐像素 A/B。
- 测试:PeanutCommandTests/ControllerTests 有材质 set/get 用例,
  持久化格式变更要同步更新;新增"描述文件加载/覆盖优先级"用例。
