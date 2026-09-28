---
title: "Shader 与 Pipeline 接口清单"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-28T20:56:00+08:00"
permalink: 2026/09/27/shader-pipeline-inventory/
categories:
  - 图形学
tags:
  - astra
  - 技术文档
  - 渲染架构
---

> 由 astra 生成 · 首次发布于 2026-09-27 18:44 · 最近整理于 2026-09-28 20:56（北京时间）

状态：MP0 基线

基线日期：2026-09-11

基线代码：`53ff68c`

<!-- more -->

本清单覆盖材质/管线解耦近期范围内的 PBR、Shadow、屏幕 Outline、常规
post、Captured Character 主 Pass 与角色 post。路径追踪、IBL、VFX 和 HiZ
属于独立 compute/utility 管线，等对应 pass 进入 `RenderPipelineAsset` 时追加，
不阻塞 MP4 的材质语义层。

哈希约定：

- `bytecode` 是 `Peanut.ShaderBytecode.v1`，基于 Debug
  `D3DCOMPILE_DEBUG | D3DCOMPILE_SKIP_OPTIMIZATION` 的完整 DXBC；
- `interface` 是 `Peanut.ShaderInterface.v1`，包含资源、CB 成员布局、输入输出
  signature 与 shader model；
- `deps` 是 `Peanut.ShaderDependencies.v1`，覆盖主源码、传递 include、入口、target、
  编译器 identity 与 flags；
- Captured Character 的 `artifact` 表中数值来自 `.pnsh` v2 基线；schema v5 启用后会因新增
  pipeline contract 正常失效并重建。artifact 内容覆盖 stage bytecode、
  interface、dependencies、root layout 与 binding plan。

Release bytecode hash 会因 flags 改变；interface hash 应保持不变。任何表中值变化都需要判断
是预期源码/编译配置变更，还是 ABI 漂移，不能盲目刷新基线。

## 1. PBR 与材质风格程序

### 1.1 程序选择

| Program/style | VS | PS | 选择状态 |
|---|---|---|---|
| `pbr` | `PBRVertexShader.hlsl` | `PBRPixelShader.hlsl` | 默认 |
| `pbrTransparent` | `PBRVertexShader.hlsl` | `PBRPixelShader.hlsl` | transparent feature，高优先级 alpha blend |
| `materialDebug` | `PBRVertexShader.hlsl` | `PBRPixelShader.hlsl` | `debug.material`，与 forward 共用材质 schema/实例 |
| `toon` | `PBRVertexShader.hlsl` | `StylizedPixelShader.hlsl` | style |
| `gfl2` | `PBRVertexShader.hlsl` | `GFL2PixelShader.hlsl` | style |
| `stockings` | `PBRVertexShader.hlsl` | `GFL2StockingsPixelShader.hlsl` | style |
| `gfl2eye` | `PBRVertexShader.hlsl` | `GFL2EyePixelShader.hlsl` | style |
| `gi` | `GenshinFaceVertexShader.hlsl` | `GenshinFaceSemanticPixelShader.hlsl` | style |
| `giBody` | `GenshinVertexShader.hlsl` | `GenshinBodySemanticPixelShader.hlsl` | style |
| `giBodyCrystal` | `GenshinVertexShader.hlsl` | `GenshinBodyCrystalPixelShader.hlsl` | style |
| `giDress` | `GenshinVertexShader.hlsl` | `GenshinDressSemanticPixelShader.hlsl` | style |
| `giDress01` | `GenshinVertexShader.hlsl` | `GenshinDress01SemanticPixelShader.hlsl` | style |
| `giHair`, `giHairBang` | `GenshinVertexShader.hlsl` | `GenshinHairSemanticPixelShader.hlsl` | style/state variant |
| `giHairBlend` | `GenshinVertexShader.hlsl` | `GenshinHairBlendSemanticPixelShader.hlsl` | additional pass |
| `gieye` | `GenshinVertexShader.hlsl` | `GenshinEyeSemanticPixelShader.hlsl` | style |
| `gilash` | `GenshinVertexShader.hlsl` | `GenshinFaceBaseSemanticPixelShader.hlsl` | style |
| `toonOutline` | `PBRVertexShader.hlsl` | `ToonOutline_PS.hlsl` | inverted hull |
| `gfl2Outline` | `PBRVertexShader.hlsl` | `GFL2Outline_PS.hlsl` | inverted hull |

`zzz*` style 名仅是资产序列化和 routing tag，不进入 PBR PSO；其程序全部由
Captured Character profile 选择。

### 1.2 唯一 stage 哈希

| Stage | bytecode | interface | deps |
|---|---|---|---|
| `PBRVertexShader.VSMain` | `f4a6707a88d80361b5c99d03dc36f6cc` | `ab2f17977b7d7d11771d3e665e0871b5` | `238c5d1007e23155ebfd03d2578c1074` |
| `GenshinVertexShader.VSMain` | `56f665f6e24ee05ca6804d73babb3808` | `42deb613f383d32ed10506114ea4688b` | `cfb9c90846e3a548ced53647e9ec25c2` |
| `GenshinFaceVertexShader.VSMain` | `be46e854c59a24fce58dd9ac728f4efe` | `42deb613f383d32ed10506114ea4688b` | `571ca590ea64dc2ea129bf46b86c7440` |
| `PBRPixelShader.PSMain` | `ceba53d8366b42384dae3da2f4af31c7` | `95f22db615b7b68a3286f7283c928bf8` | `0ee5309fa5fde88111dca36e048197ad` |
| `StylizedPixelShader.PSMain` | `1a39956bd41f5cfef30a099515611c7a` | `7b93f487df667f95e0a1567c26afbd05` | `88e99829f74b47caefea0c9cfa98da8f` |
| `GFL2PixelShader.PSMain` | `12ffa375c4ba072e2511d4a0355064f9` | `5296d8dd5ea7d6990e29c150118d61db` | `3e595eac0a7da7675aba4a9cb4cb2152` |
| `GFL2StockingsPixelShader.PSMain` | `de5bae1cc3d0580a6810d36b9a6bc0d5` | `395db6ebb6f3d436c03332781282a2e3` | `42d21b6eac4ee011b1a5e570673cabfa` |
| `GFL2EyePixelShader.PSMain` | `3bcdc26e9cd0cb823f678139eb5ccbff` | `e7ac7be59c2696d50f3dd0d87e9c30ad` | `efa2c2641f3ba92087aebaf90692e8d8` |
| `GenshinFaceSemanticPixelShader.PSMain` | `7883a281fee6217a6a1214a18b4288ec` | `7c4a76fc73b7129d0814d3d3510ec779` | `5eb81f7d561fc51cecdfcd8c8c96e249` |
| `GenshinBodySemanticPixelShader.PSMain` | `4d465173ceedb4147490e49e193793e5` | `833ebb917ebc4b7dee415f99915425cd` | `e8a1d74e6bd1b7848b5ce4ddeaddd665` |
| `GenshinBodyCrystalPixelShader.PSMain` | `eef9ae0a5e9d1449533b82a8f05c5465` | `c45a613e4fb69c791220ea20a98e84e5` | `0c52eb0994f6e5a93bc800d0d10e2e2b` |
| `GenshinDressSemanticPixelShader.PSMain` | `1998ee94f19b3e108793d2490e8c3db6` | `8c5b4c75a137c5b2f56d3060681f3eb1` | `9e6947bb104a0118f484a8d7fb98aaa9` |
| `GenshinDress01SemanticPixelShader.PSMain` | `cb42e860988833ecd62d1339eae0cff2` | `8c5b4c75a137c5b2f56d3060681f3eb1` | `8ca0ef527828f379371ee6538cb56f86` |
| `GenshinHairSemanticPixelShader.PSMain` | `72481a98fc0e0cc25cd678157788d426` | `8c5b4c75a137c5b2f56d3060681f3eb1` | `1ade55b98a2d5e53e68e311f01c4a944` |
| `GenshinHairBlendSemanticPixelShader.PSMain` | `90c30f81121be31dd02d9366af971d43` | `cbbaa6cabe9b8bcc305e917740d7d3f9` | `61a76477c2b272a53f3365144b5a94d5` |
| `GenshinEyeSemanticPixelShader.PSMain` | `fb96cc088716ec644028597daccab500` | `03290d86d0b2a9601e3d4693cea36c2f` | `716dd9c22602e3dfc89b718c5bdc6d27` |
| `GenshinFaceBaseSemanticPixelShader.PSMain` | `eddd053196d8ea22ce9ff382d2bf2aa0` | `48b03e2d240ebd2e366710113780970e` | `983f3f21bb6798fd63976da32930ecd0` |
| `ToonOutline_PS.PSMain` | `ca0103ab97f923916ca7f409ec53b742` | `e61603dec32bc5c012c170f5238e3b2d` | `b7b5fcf83c71b09e8ecfc37653a688e8` |
| `GFL2Outline_PS.PSMain` | `8c4dc055f1ff6dd21ed1e043836a6881` | `7e101d12c7391538b44791bef0fb6f84` | `e7775b44d9e489a9c7805f038685848d` |

### 1.3 PBR root 参数来源

当前 root signature 由 `pbr.pipeline.json` 的 binding layout 与 shader reflection 编译生成，
兼容布局共 34 个 root parameter、4 个 static sampler、37 DWORD；运行时不再手写 root index。

| Root | Shader binding | 语义来源 |
|---:|---|---|
| 0 | `b0` all | frame camera |
| 1 | `b1` all | scene lighting |
| 2 | `b2` all | environment shadow sampling constants |
| 3 | `t0` PS | environment shadow map |
| 4 | `b4` PS | reflected `material.constants` (`MaterialBindingInstance`) |
| 5 | `t5` PS | sky cubemap |
| 6–9 | `t1..t4` PS | legacy diffuse/ambient/specular/normal textures |
| 10–13 | `t6..t9` PS | albedo/metallic/roughness/AO textures |
| 14–16 | `t10..t12` PS | irradiance/prefiltered environment/BRDF LUT |
| 17 | `t13` VS | object instance buffer |
| 18 | `t14` VS | visible instance IDs |
| 19 | `b5`, 4 root constants, all | draw/node/highlight/outline mode |
| 20 | `t15` PS | SSAO result or white fallback |
| 21 | `t16` VS | node-world matrices |
| 22 | `t17` PS | SSGI result or black fallback |
| 23–29 | `t18..t24` PS | face SDF/lightmap/ramps/detail/probe/mask material textures |
| 30 | `b6` PS | catalog/schema 驱动的 `material.styleConstants` |
| 31 | `t25` VS | bone palette or identity fallback |
| 32 | `t26` PS | character per-object shadow map |
| 33 | `b7` PS | character shadow transform/sampling constants |

Static samplers are `s0` comparison clamp、`s1` linear clamp、`s2` linear wrap 和
`s3` linear clamp。所有 34 个参数都有确定来源；当前不存在 unknown source。

PSO 公共部分：triangle、10 项 vertex input、`sceneHDR` 与 `gnormal` 两个
`R16G16B16A16_FLOAT` MRT、`D32_FLOAT_S8X24_UINT` depth/stencil、reverse-Z
`GREATER_EQUAL`。每个 program 的 VS/PS、cull、depth-write、blend、MRT write mask 和
stencil 都来自 pipeline asset，dynamic stencil reference/附加 draw/outline 来自
program `drawRouting`；旧材质兼容表不再被 Renderer 消费。

## 2. Shadow 与屏幕 Outline

| Program | stage hash（bytecode / interface / deps） | Root layout | PSO/输出 |
|---|---|---|---|
| Shadow | `98f28a33f522f95ebf3d1198febb3bfa` / `69ae89931ad711723e41cd6bcb328691` / `93f2af44ba8e3556c0ae91a8a0a3b0b3` | root 0 `b0` camera；1 `b3` pass；2 `t13` instance；3 `t16` node；4 `b5` 4 draw constants；5 `t25` bones | VS-only，0 MRT，`D32_FLOAT`，depth `LESS`，cull none；同一 PSO 写 CSM array 与 character shadow |
| Screen Outline VS | `7240798db0e1a95ffabd55d5c353eb91` / `2927e201e5f2847d24bd15bc9fd7950e` / `29831b9d2c943f9d34d79da884dd9e48` | 无资源 | fullscreen triangle |
| Screen Outline PS | `ef5e3cc45238192755af9f665a1ac78c` / `6afbb7967ee5c889352f23240cd4d7aa` / `ed121459a2a460cbffc131cfa65004ba` | root 0 `t0` depth；1 `t1` gnormal；2 `b0` 4 pass constants | `R8_UNORM` outlineMask，depth off，cull none |

Shadow root 共 9 DWORD，屏幕 Outline root 共 6 DWORD；两者所有参数均可映射到
Frame/Object/Pass/RenderGraph provider。

2026-09-12 迁移状态：上表 hash/root 顺序保留为 MP0 迁移前基线。Shadow 的 shader bytecode
与 fixed PSO state 不变，root layout 已由 `Assets/pipeline/shadow.pipeline.json` 生成；`b0/b3`
与 structured-buffer `t13/t16/t25` 使用 root descriptor，`b5` 保持 4 DWORD root constants。
通用 layout compiler 因此支持同 stage/kind/space 下多个不重叠寄存器区间采用不同 binding
mode，并继续拒绝区间重叠。生产验证中 `shadowMap` 去 padding GPU hash 在初次加载和
`shader.reload` 前后均为 `d59c6f5c510b66c3ccf41151777d7134`，GBV 无新增错误。

## 3. 常规 post 程序

所有程序复用 `FullscreenTriangleVS`，其 hash 见上节。MME PS 是由 `.fx` 转译得到的
动态源码，没有单一固定 bytecode hash，但每次 load 都会生成稳定逻辑 source identity、
source hash、DXBC hash 和 `ShaderInterface` 后才允许创建 PSO。

| Pass/program | PS bytecode | interface | deps | Root 参数与输出 |
|---|---|---|---|---|
| FXAA/composite | `f2f42d289cd033856cbd4073001cae2d` | `4f8d2221dbaf3028adf9398a3353b793` | `93d561af865d817f033d85d198260231` | `t0` scene/captured post、`b0` 8 constants、`t1` bloom、`t2` outline；双 `R8G8B8A8_UNORM` 输出 |
| Bloom threshold | `dbfff67423b90d5c3f437c70d24e90e9` | `4731f8dc64a126b3dd8f0f112cb25023` | `7ce0507d71f8dd3ccd0de6186471ffb3` | `t0` input、`b0` 4 constants；`R16G16B16A16_FLOAT` |
| Bloom blur | `044b048a70f95b1a47261e0eaba207a2` | `530a81c43fb99e35932257b5732daae7` | `fe1798b9c20d95d4a9c1e5e751d78058` | 同 Bloom root；`R16G16B16A16_FLOAT` |
| SSAO raw | `445396da51d79a8235559735a51f1f55` | `09af314b01f8d192d9c7b4dd1a9ecde4` | `574058e0dbdd8365e87d612ba6f09b54` | `t0` depth、`t1` normal、`t2` noise、root CBV `b0`；`R8_UNORM` |
| SSAO blur | `35a43ae9793efab6b7ba090c71c4f4c9` | `3cc0b0c58f9614675aa39ead84aef6c2` | `59e9d82606201f36bbb846b27b6a906a` | 同 root，输入改为 raw/depth/normal；`R8_UNORM` |
| SSGI raw | `96d901b75ecfe87b09e54f04f78f94b5` | `da2da5dace628a67160b4312a3eddeb1` | `75559188f5a4f993109628b155b442a5` | `t0..t3` depth/normal/scene/noise、root CBV `b0`；单 HDR MRT |
| SSGI blur/history | `64f0da9722c0bfdb1380ab3293b66598` | `bbdcd22f03d86b43d136aeb7a750d71b` | `90421b3fa5fd95c0bf0b1ca94662d39d` | 同 root，输入改为 raw/depth/normal/history；双 HDR MRT |
| MME copy/effect | 运行时生成 | 运行时生成 | 运行时生成 | table `t0..t7`、table `b0`、`s0..s3`；单 HDR MRT |

Bloom root 为 5 DWORD，SSAO 为 5 DWORD，SSGI 为 6 DWORD，FXAA 为 11 DWORD，
MME 为 2 DWORD。以上固定 root/PSO 描述将在 MP2 pipeline artifact 扩展中迁移，当前表即
行为保持基线。

## 4. Captured Character artifact 清单

完整 capture resource、常量、MRT、blend/depth/stencil 和 RenderGraph 映射见
`Docs/zzz-remielle-rdc/pipeline-map.md`。下表锁定每个 program 的组合 artifact hash；
`C0/C1/C2/N/P0/P1` 是由反射与 profile policy 自动得到的 root compatibility key。

| Key | Root compatibility hash | 用途 |
|---|---|---|
| C0 | `bd7bd297e6f173722df8282390bfd39c` | 主 opaque/standard family |
| C1 | `d96f090b832344d08cb33646a16fdaf5` | transparent/face-outline family |
| C2 | `e08320aad268610d78a6e49a2ace72f7` | hair depth family |
| N | `fbe546ea974fa4358905286aa8e18bba` | normal resolve |
| P0 | `6fa70635513141b86e3b64c5f36056a4` | primary lighting |
| P1 | `bc724d7ed608cc5c9afb1ad91666494f` | general LUT |

| Program | Artifact hash | Root |
|---|---|---|
| `body_map1` | `2d80843f53ad006021c603ffb7d1e8c8` | C0 |
| `body_map1_outline` | `f824fd94bc382e3e9ddf091c02493905` | C0 |
| `body_map1_transparent_color` | `0260f2f0f9988124a7b95ccd602b766a` | C1 |
| `body_map1_transparent_depth` | `d9a8995b97d7e7903f85120036fa0892` | C1 |
| `body_map1_transparent_outline` | `0980306da4a45e1841885b4c046d92f5` | C1 |
| `body_map2` | `9a52ec732dece3db7c46c0a0e85ce132` | C0 |
| `body_map2_outline` | `3354e40881be51438b4612bf9c370ea5` | C0 |
| `body_map2_transparent_color` | `612c1534131586cac55f1629d334ef7a` | C1 |
| `body_map2_transparent_depth` | `46e4f4bcb5dfb22e7ed47280ba1a99d5` | C1 |
| `body_map2_transparent_outline` | `3956b735e18bf95c33f578a91466764a` | C1 |
| `eye` | `53caf4fc6eb5ae32da73985eb25a337e` | C1 |
| `face_detail` | `229c35caf1b5d790898bfe95cb72de19` | C0 |
| `face_detail_outline` | `8c3564cfed284d5fc77fc64753fdad6c` | C1 |
| `face_main` | `150d5bbb2831a945cea73c8dc7ba25d5` | C0 |
| `face_outline` | `f049d1b5872a57495c870e0810c61fba` | C1 |
| `face_redraw_detail` | `71d16c496965770ae4e9cd712773b72b` | C0 |
| `face_redraw_main` | `d0065874afacca1f03370f0eda8be63b` | C0 |
| `face_redraw_secondary` | `0a94072621b5f9f76f86616cf831d732` | C0 |
| `face_secondary` | `2891afb23a7910a9fca017c141c0426c` | C0 |
| `face_secondary_outline` | `93234cb09fa6361aca3504e46a6d78e3` | C1 |
| `hair` | `947b021345e6032ee5260aac19254339` | C0 |
| `hair_blend` | `3c928c429baecd31b3574b59ebaa3b22` | C0 |
| `hair_blend_outline` | `ac8cd988c970d55a449915fa8d090f31` | C0 |
| `hair_depth` | `6158e87d9fb02721b1bcac8d38bfe458` | C2 |
| `hair_outline` | `7a28038c52feea1721512be6b6a0caf1` | C0 |
| `hair_shadow` | `3289dabfb8e7d0819c96c7dbf83e0797` | C0 |
| `hair_shadow_outline` | `62d75eb94b3cb3c2c935bff8459f3644` | C0 |
| `wings` | `469f74fafca759b4c229570ef4ab1ed2` | C0 |
| `wings_outline` | `bbb85610fa8d508a443ae478ccc7531b` | C0 |
| `resolve.normal` | `8cb319b8e86e11fdb6d44f35f2ae8fa2` | N |
| `post.primary-lighting` | `d07ebe523f54829b4b3042046fd6a8f8` | P0 |
| `post.general-lut` | `5b4348145efedb89549d109d0df058fc` | P1 |

29 个主程序、normal resolve 和两个 post program 均有完整 binding plan，staging 时缺少
任一 reflected source 都会失败；运行时不执行字符串 root-index 查询。角色主/post/final
八个中间目标的 GPU 原始字节 hash 见 pipeline map。

## 5. 版本与失效策略

| 层 | 当前版本/标识 | 何时升级或失效 |
|---|---|---|
| Captured profile | JSON `version: 3`，只接受精确版本 | profile 字段或语义改变时升级 |
| Captured adapter | `ShaderAdapterAbiVersion = 1` | provider/常量转换 ABI 不兼容时升级 |
| Shader artifact | `.pnsh` schema 5 / magic `PNSHABI4` | v5 在 compiled material binding write 中固化 canonical/alias/import ID 解析；序列化结构或 hash 语义改变时升级。文件 magic 保持容器标识，schema 字段负责拒绝旧 payload |
| Shader interface | `Peanut.ShaderInterface.v1` | 归一化字段或 ABI hash 规则改变时升级 domain |
| Binding plan | `Peanut.CompiledBindingPlan.v1` | op/source/fallback 语义改变时升级 domain |
| Root compatibility | `PeanutL1` | range/static-sampler/policy 量化规则改变时升级 domain |
| Dependencies | source/dependencies/bytecode v1 | 内容、入口、target、compiler、flags 或传递 include 改变即 stale |
| Pipeline PSO state | `Peanut.PipelineArtifactContract.v1` | fixed state/MRT/input-layout/graph contract 改变即 stale |
| Material requirements | `Peanut.PipelineArtifactContract.v1` | MP4 引入 MaterialSchema revision 后继续纳入 pipeline identity |

加载顺序是：校验 schema/adapter → 校验 artifact 内容 hash → 编辑器模式校验依赖 →
重建并比较 root layout/binding plan。任一步失败都回到 staging compile；全 generation 成功后
才 commit。独立 `PeanutPipelineCook` 已提供发布产物入口；shipping/runtime-only 使用
`TrustArtifact`，任何 artifact 错误都直接拒绝，禁止回退源编译。

## 6. MP0 结论

- 当前范围内不存在未解释的 root parameter 或 renderer 内直接 `D3DCompile` 旁路；
- Captured Character 与 Shadow 已 artifact 化；PBR、常规 post 仍只有反射后的临时 blob，
  root 与 PSO 描述仍手写；
- MP2 的下一项应扩展 artifact，先容纳 input layout、raster/depth/stencil/blend、attachment
  contract 与 material requirements，再迁 PBR/Shadow/post；
- 不应直接开始拆 `Material`：否则 PSO 和 RenderGraph 契约仍会继续泄漏回材质层。
