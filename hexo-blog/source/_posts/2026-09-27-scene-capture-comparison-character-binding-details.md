---
title: "角色：事件与绑定附录"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-28T20:56:00+08:00"
permalink: 2026/09/27/scene-capture-comparison-character-binding-details/
categories:
  - 图形学
tags:
  - astra
  - 技术文档
  - 渲染架构
---

> 由 astra 生成 · 首次发布于 2026-09-27 18:44 · 最近整理于 2026-09-28 20:56（北京时间）

单游戏详细分析：[绝区零](/2026/09/27/zzz-character/)、[原神](/2026/09/27/genshin-character/)、[终末地](/2026/09/27/endfield-character/)。横向对比与证据总导航见 [总索引](/2026/09/27/scene-capture-comparison-binding-details/)。

按用途阅读请先看 [语义与证据对照](/2026/09/27/scene-capture-comparison-resource-semantics/)。注意木偶第一材质附件先保存法线，运动阶段再改写为运动矢量；同一 ResourceId 不能在所有事件中使用同一种解释。

<!-- more -->

主报告：[角色实现对比](/2026/09/27/character-comparison/)；公共消费者见 [场景绑定附录](/2026/09/27/scene-capture-comparison-scene-binding-details/)。

第一部分从实际回放的 `inventory.json` 抽取角色与辅助候选事件，列出实际执行阶段的 shader、资源集合和管线状态。资源集合不表示寄存器序号、采样次数或每像素实际访问；反汇编保留可继续核查的依据。CS 事件不列残留 graphics 状态。第二部分保留已有详细导出的 descriptor/常量绑定。

终末地事件是角色接入的辅助候选，尚未逐 draw 确认角色、场景和效果归属；这里单列不构成归属认定。

## 1. 角色与辅助候选事件

### 蕾米

来源：inventory.json。

#### 蕾米 e19

Dispatch groups=[1, 1, 1]，threads/group=[64, 1, 1]。

CS：CSCrowdAnimatorUber.CSCrowdAnimatorUberMain，ResourceId::9723，[反汇编](/scene-capture-comparison/leimi/shaders/ResourceId_9723.cs.txt)。

| 阶段 / 访问 | ResourceId / 名称 | 底层资源描述 |
|---|---|---|
| CS / reads | ResourceId::13718 · Buffer-16-51200 | 51200 bytes，BufferCategory.ReadWrite |
| CS / writes | ResourceId::13709 · Buffer-16-25600 | 25600 bytes，BufferCategory.ReadWrite |

#### 蕾米 e94

Dispatch groups=[5, 1, 1]，threads/group=[64, 1, 1]。

CS：Internal-BlendShape.main，ResourceId::1474，[反汇编](/scene-capture-comparison/leimi/shaders/ResourceId_1474.cs.txt)。

| 阶段 / 访问 | ResourceId / 名称 | 底层资源描述 |
|---|---|---|
| CS / reads | ResourceId::14981 · BlendShapeVertexBuffer | 395360 bytes，BufferCategory.ReadWrite |
| CS / writes | ResourceId::20342 · RenderBufferManagerTempBuffer | 91760 bytes，BufferCategory.ReadWrite |

#### 蕾米 e5245

Dispatch groups=[189, 1, 1]，threads/group=[64, 1, 1]。

CS：LoopSubdivision.AllInOne，ResourceId::500，[反汇编](/scene-capture-comparison/leimi/shaders/ResourceId_500.cs.txt)。

| 阶段 / 访问 | ResourceId / 名称 | 底层资源描述 |
|---|---|---|
| CS / reads | ResourceId::21244 · Remielle_Wings | 216160 bytes，BufferCategory.ReadWrite\|Vertex |
| CS / reads | ResourceId::21724 · Buffer-16385-216160 | 216160 bytes，BufferCategory.Vertex |
| CS / reads | ResourceId::21257 · Buffer-16-48192 | 48192 bytes，BufferCategory.ReadWrite |
| CS / reads | ResourceId::21272 · Buffer-16-13872 | 13872 bytes，BufferCategory.ReadWrite |
| CS / reads | ResourceId::21260 · Buffer-16-13872 | 13872 bytes，BufferCategory.ReadWrite |
| CS / reads | ResourceId::21263 · Buffer-16-72184 | 72184 bytes，BufferCategory.ReadWrite |
| CS / reads | ResourceId::21278 · Buffer-16-27744 | 27744 bytes，BufferCategory.ReadWrite |
| CS / writes | ResourceId::21732 · Buffer-16385-837696 | 837696 bytes，BufferCategory.ReadWrite\|Vertex |
| CS / writes | ResourceId::21514 · Buffer-16-55488 | 55488 bytes，BufferCategory.ReadWrite |
| CS / writes | ResourceId::21532 · Buffer-16-13872 | 13872 bytes，BufferCategory.ReadWrite |

#### 蕾米 e5609

ID3D11DeviceContext::DrawIndexed()；indices=120，instances=0。非实例化 draw 的 instances=0 是导出值，不表示没有执行。

| 附件 | ResourceId | 底层资源描述 | 颜色写掩码 |
|---|---|---|---|
| Depth | ResourceId::20491 | 2048×2048×1，array=1，mips=1，R16_TYPELESS | — |

Depth：enable=True，compare=GreaterEqual，write=True。

Stencil：关闭。

VS：miHoYo/Character/NapAvatarStandardFace，ResourceId::13207，[反汇编](/scene-capture-comparison/leimi/shaders/ResourceId_13207.vs.txt)。

PS：miHoYo/Character/NapAvatarStandardFace，ResourceId::13208，[反汇编](/scene-capture-comparison/leimi/shaders/ResourceId_13208.ps.txt)。

| 阶段 / 访问 | ResourceId / 名称 | 底层资源描述 |
|---|---|---|

#### 蕾米 e7678

DrawIndexedInstancedIndirect(<7458, 1>)；indices=7458，instances=1。非实例化 draw 的 instances=0 是导出值，不表示没有执行。

| 附件 | ResourceId | 底层资源描述 | 颜色写掩码 |
|---|---|---|---|
| RT0 | ResourceId::20788 | 3432×1440×1，array=1，mips=1，R16G16B16A16_TYPELESS | 15 |
| RT1 | ResourceId::20538 | 3432×1440×1，array=1，mips=1，R8G8B8A8_TYPELESS | 15 |
| RT2 | ResourceId::20546 | 3432×1440×1，array=1，mips=1，R10G10B10A2_TYPELESS | 15 |
| RT3 | ResourceId::20542 | 3432×1440×1，array=1，mips=1，R10G10B10A2_TYPELESS | 15 |
| Depth | ResourceId::20367 | 3432×1440×1，array=1，mips=1，D32S8_TYPELESS | — |

Depth：enable=True，compare=GreaterEqual，write=True。

| Stencil 面 | Compare / mask | Ref / writeMask | Fail / depthFail / pass |
|---|---|---|---|
| front | AlwaysTrue / 128 | 128 / 255 | Keep / Keep / Replace |
| back | AlwaysTrue / 128 | 128 / 255 | Keep / Keep / Replace |

| 目标 | Blend enabled | RGB source / destination / op | Alpha source / destination / op |
|---|---|---|---|
| RT0 | False | One / Zero / Add | One / Zero / Add |
| RT1 | False | One / Zero / Add | One / Zero / Add |
| RT2 | False | One / Zero / Add | One / Zero / Add |
| RT3 | False | One / Zero / Add | One / Zero / Add |

VS：miHoYo/Character/NapAvatarStandardFace，ResourceId::13924，[反汇编](/scene-capture-comparison/leimi/shaders/ResourceId_13924.vs.txt)。

PS：miHoYo/Character/NapAvatarStandardFace，ResourceId::13933，[反汇编](/scene-capture-comparison/leimi/shaders/ResourceId_13933.ps.txt)。

| 阶段 / 访问 | ResourceId / 名称 | 底层资源描述 |
|---|---|---|
| VS / reads | ResourceId::14012 · EntityGpuDataBuffer | 8192 bytes，BufferCategory.ReadWrite |
| PS / reads | ResourceId::20112 · ShadowCacheBufferFor_MainCamera | 2048×2048×1，array=4，mips=1，R16_TYPELESS |
| PS / reads | ResourceId::14012 · EntityGpuDataBuffer | 8192 bytes，BufferCategory.ReadWrite |
| PS / reads | ResourceId::5914 · CharacterOverlayTex | 256×256×1，array=1，mips=1，BC1_UNORM |
| PS / reads | ResourceId::21999 · StreamTex:Remielle_Face_D | 2048×2048×1，array=1，mips=12，BC7_SRGB |
| PS / reads | ResourceId::21775 · StreamTex:Female_Face_Lightmap_02 | 256×256×1，array=1，mips=9，R16G16B16A16_FLOAT |
| PS / reads | ResourceId::20491 · TempBuffer 261 2048x2048 | 2048×2048×1，array=1，mips=1，R16_TYPELESS |

#### 蕾米 e8355

ID3D11DeviceContext::DrawIndexedInstanced()；indices=11277，instances=1。非实例化 draw 的 instances=0 是导出值，不表示没有执行。

| 附件 | ResourceId | 底层资源描述 | 颜色写掩码 |
|---|---|---|---|
| RT0 | ResourceId::20788 | 3432×1440×1，array=1，mips=1，R16G16B16A16_TYPELESS | 15 |
| RT1 | ResourceId::20538 | 3432×1440×1，array=1，mips=1，R8G8B8A8_TYPELESS | 15 |
| RT2 | ResourceId::20546 | 3432×1440×1，array=1，mips=1，R10G10B10A2_TYPELESS | 15 |
| RT3 | ResourceId::20542 | 3432×1440×1，array=1，mips=1，R10G10B10A2_TYPELESS | 15 |
| Depth | ResourceId::20367 | 3432×1440×1，array=1，mips=1，D32S8_TYPELESS | — |

Depth：enable=True，compare=GreaterEqual，write=False。

| Stencil 面 | Compare / mask | Ref / writeMask | Fail / depthFail / pass |
|---|---|---|---|
| front | Equal / 128 | 132 / 4 | Keep / Keep / Replace |
| back | Equal / 128 | 132 / 4 | Keep / Keep / Replace |

| 目标 | Blend enabled | RGB source / destination / op | Alpha source / destination / op |
|---|---|---|---|
| RT0 | True | Zero / One / Add | Zero / One / Add |
| RT1 | True | Zero / One / Add | Zero / One / Add |
| RT2 | True | Zero / One / Add | Zero / One / Add |
| RT3 | True | Zero / One / Add | Zero / One / Add |

VS：miHoYo/Character/NapStencilShadowCaster，ResourceId::13928，[反汇编](/scene-capture-comparison/leimi/shaders/ResourceId_13928.vs.txt)。

PS：miHoYo/Character/NapStencilShadowCaster，ResourceId::13936，[反汇编](/scene-capture-comparison/leimi/shaders/ResourceId_13936.ps.txt)。

| 阶段 / 访问 | ResourceId / 名称 | 底层资源描述 |
|---|---|---|

#### 蕾米 e9349

DrawIndexedInstancedIndirect(<1260, 1>)；indices=1260，instances=1。非实例化 draw 的 instances=0 是导出值，不表示没有执行。

| 附件 | ResourceId | 底层资源描述 | 颜色写掩码 |
|---|---|---|---|
| RT0 | ResourceId::20788 | 3432×1440×1，array=1，mips=1，R16G16B16A16_TYPELESS | 15 |
| RT1 | ResourceId::20538 | 3432×1440×1，array=1，mips=1，R8G8B8A8_TYPELESS | 15 |
| RT2 | ResourceId::20546 | 3432×1440×1，array=1，mips=1，R10G10B10A2_TYPELESS | 15 |
| RT3 | ResourceId::20542 | 3432×1440×1，array=1，mips=1，R10G10B10A2_TYPELESS | 15 |
| Depth | ResourceId::20367 | 3432×1440×1，array=1，mips=1，D32S8_TYPELESS | — |

Depth：enable=True，compare=GreaterEqual，write=False。

Stencil：关闭。

| 目标 | Blend enabled | RGB source / destination / op | Alpha source / destination / op |
|---|---|---|---|
| RT0 | True | One / InvSrcAlpha / Add | InvDstAlpha / One / Add |
| RT1 | False | One / Zero / Add | One / Zero / Add |
| RT2 | True | Zero / One / Add | Zero / One / Add |
| RT3 | True | Zero / One / Add | Zero / One / Add |

VS：miHoYo/Character/NapAvatarStandardEye，ResourceId::13926，[反汇编](/scene-capture-comparison/leimi/shaders/ResourceId_13926.vs.txt)。

PS：miHoYo/Character/NapAvatarStandardEye，ResourceId::13934，[反汇编](/scene-capture-comparison/leimi/shaders/ResourceId_13934.ps.txt)。

| 阶段 / 访问 | ResourceId / 名称 | 底层资源描述 |
|---|---|---|
| VS / reads | ResourceId::14012 · EntityGpuDataBuffer | 8192 bytes，BufferCategory.ReadWrite |
| VS / reads | ResourceId::13119 · StreamTex:Eye_E | 16×16×1，array=1，mips=1，R8G8B8A8_UNORM |
| PS / reads | ResourceId::20112 · ShadowCacheBufferFor_MainCamera | 2048×2048×1，array=4，mips=1，R16_TYPELESS |
| PS / reads | ResourceId::14012 · EntityGpuDataBuffer | 8192 bytes，BufferCategory.ReadWrite |
| PS / reads | ResourceId::5914 · CharacterOverlayTex | 256×256×1，array=1，mips=1，BC1_UNORM |
| PS / reads | ResourceId::21999 · StreamTex:Remielle_Face_D | 2048×2048×1，array=1，mips=12，BC7_SRGB |
| PS / reads | ResourceId::21775 · StreamTex:Female_Face_Lightmap_02 | 256×256×1，array=1，mips=9，R16G16B16A16_FLOAT |
| PS / reads | ResourceId::9667 · InternalLut_Char_1024x32_ARGBHalf | 1024×32×1，array=1，mips=1，R16G16B16A16_TYPELESS |
| PS / reads | ResourceId::20491 · TempBuffer 261 2048x2048 | 2048×2048×1，array=1，mips=1，R16_TYPELESS |

#### 蕾米 e9728

ID3D11DeviceContext::DrawIndexed()；indices=36，instances=0。非实例化 draw 的 instances=0 是导出值，不表示没有执行。

| 附件 | ResourceId | 底层资源描述 | 颜色写掩码 |
|---|---|---|---|
| RT0 | ResourceId::20577 | 3432×1440×1，array=1，mips=1，R8G8B8A8_TYPELESS | 0 |
| Depth | ResourceId::20367 | 3432×1440×1，array=1，mips=1，D32S8_TYPELESS | — |

Depth：enable=True，compare=Less，write=False。

| Stencil 面 | Compare / mask | Ref / writeMask | Fail / depthFail / pass |
|---|---|---|---|
| front | Equal / 32 | 32 / 1 | Keep / Keep / IncSat |
| back | Equal / 32 | 32 / 1 | Keep / Keep / IncSat |

| 目标 | Blend enabled | RGB source / destination / op | Alpha source / destination / op |
|---|---|---|---|
| RT0 | True | InvSrcAlpha / SrcAlpha / Add | Zero / One / Add |

VS：Universal Render Pipeline/PerObjectShadowResolve，ResourceId::13946，[反汇编](/scene-capture-comparison/leimi/shaders/ResourceId_13946.vs.txt)。

PS：Universal Render Pipeline/PerObjectShadowResolve，ResourceId::13948，[反汇编](/scene-capture-comparison/leimi/shaders/ResourceId_13948.ps.txt)。

| 阶段 / 访问 | ResourceId / 名称 | 底层资源描述 |
|---|---|---|

#### 蕾米 e9986

Dispatch groups=[108, 45, 1]，threads/group=[16, 16, 1]。

CS：CapsuleAO.CapsuleAO，ResourceId::6143，[反汇编](/scene-capture-comparison/leimi/shaders/ResourceId_6143.cs.txt)。

| 阶段 / 访问 | ResourceId / 名称 | 底层资源描述 |
|---|---|---|
| CS / reads | ResourceId::20788 · TempBuffer 321 3432x1440 | 3432×1440×1，array=1，mips=1，R16G16B16A16_TYPELESS |
| CS / reads | ResourceId::20550 · TempBuffer 267 3432x1440 | 3432×1440×1，array=1，mips=1，D32S8_TYPELESS |
| CS / reads | ResourceId::20542 · TempBuffer 265 3432x1440 | 3432×1440×1，array=1，mips=1，R10G10B10A2_TYPELESS |
| CS / reads | ResourceId::14012 · EntityGpuDataBuffer | 8192 bytes，BufferCategory.ReadWrite |
| CS / writes | ResourceId::20589 · TempBuffer 276 1716x720 | 1716×720×1，array=1，mips=1，R8_TYPELESS |
| CS / writes | ResourceId::21697 · Buffer-16-112 | 112 bytes，BufferCategory.ReadWrite |
| CS / writes | ResourceId::21700 · Buffer-16-28 | 28 bytes，BufferCategory.ReadWrite |

### 木偶

来源：inventory.json。

#### 木偶 e10416

ID3D11DeviceContext::DrawIndexed()；indices=3882，instances=0。非实例化 draw 的 instances=0 是导出值，不表示没有执行。

| 附件 | ResourceId | 底层资源描述 | 颜色写掩码 |
|---|---|---|---|
| RT0 | ResourceId::64533 | 3440×1440×1，array=1，mips=1，R10G10B10A2_TYPELESS | 15 |
| RT1 | ResourceId::64537 | 3440×1440×1，array=1，mips=1，R8G8B8A8_TYPELESS | 15 |
| RT2 | ResourceId::64541 | 3440×1440×1，array=1，mips=1，R8G8B8A8_TYPELESS | 15 |
| RT3 | ResourceId::64545 | 3440×1440×1，array=1，mips=1，R8_TYPELESS | 15 |
| RT4 | ResourceId::64553 | 3440×1440×1，array=1，mips=1，R8_TYPELESS | 15 |
| RT5 | ResourceId::64549 | 3440×1440×1，array=1，mips=1，R8_TYPELESS | 15 |
| Depth | ResourceId::61073 | 3440×1440×1，array=1，mips=1，D32S8_TYPELESS | — |

Depth：enable=True，compare=GreaterEqual，write=True。

| Stencil 面 | Compare / mask | Ref / writeMask | Fail / depthFail / pass |
|---|---|---|---|
| front | AlwaysTrue / 255 | 133 / 255 | Keep / Keep / Replace |
| back | AlwaysTrue / 255 | 133 / 255 | Keep / Keep / Replace |

| 目标 | Blend enabled | RGB source / destination / op | Alpha source / destination / op |
|---|---|---|---|
| RT0 | False | One / Zero / Add | One / Zero / Add |
| RT1 | False | One / Zero / Add | One / Zero / Add |
| RT2 | False | One / Zero / Add | One / Zero / Add |
| RT3 | False | One / Zero / Add | One / Zero / Add |
| RT4 | False | One / Zero / Add | One / Zero / Add |
| RT5 | False | One / Zero / Add | One / Zero / Add |

VS：miHoYo/Character/Character_Base_Uber，ResourceId::64865，[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_64865.vs.txt)。

PS：miHoYo/Character/Character_Base_Uber，ResourceId::75685，[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_75685.ps.txt)。

| 阶段 / 访问 | ResourceId / 名称 | 底层资源描述 |
|---|---|---|
| VS / reads | ResourceId::65258 · Character Ambient Sensor Result 1 | 70×1×1，array=1，mips=1，R16G16B16A16_TYPELESS |
| PS / reads | ResourceId::75809 · Avatar_Tex_Face01_Shadow | 512×512×1，array=1，mips=10，BC7_UNORM |
| PS / reads | ResourceId::75807 · Avatar_Girl_Claymore_MarionetteNew_Tex_Face_Diffuse | 1024×1024×1，array=1，mips=11，BC7_SRGB |
| PS / reads | ResourceId::75774 · Avatar_Tex_Appear_Face_Mask | 128×128×1，array=1，mips=8，BC7_UNORM |
| PS / reads | ResourceId::59634 · Avatar_Girl_Tex_FaceSDF | 1024×1024×1，array=1，mips=1，BC7_UNORM |

#### 木偶 e10433

ID3D11DeviceContext::DrawIndexed()；indices=10620，instances=0。非实例化 draw 的 instances=0 是导出值，不表示没有执行。

| 附件 | ResourceId | 底层资源描述 | 颜色写掩码 |
|---|---|---|---|
| RT0 | ResourceId::64533 | 3440×1440×1，array=1，mips=1，R10G10B10A2_TYPELESS | 15 |
| RT1 | ResourceId::64537 | 3440×1440×1，array=1，mips=1，R8G8B8A8_TYPELESS | 15 |
| RT2 | ResourceId::64541 | 3440×1440×1，array=1，mips=1，R8G8B8A8_TYPELESS | 15 |
| RT3 | ResourceId::64545 | 3440×1440×1，array=1，mips=1，R8_TYPELESS | 15 |
| RT4 | ResourceId::64553 | 3440×1440×1，array=1，mips=1，R8_TYPELESS | 15 |
| RT5 | ResourceId::64549 | 3440×1440×1，array=1，mips=1，R8_TYPELESS | 15 |
| Depth | ResourceId::61073 | 3440×1440×1，array=1，mips=1，D32S8_TYPELESS | — |

Depth：enable=True，compare=GreaterEqual，write=True。

| Stencil 面 | Compare / mask | Ref / writeMask | Fail / depthFail / pass |
|---|---|---|---|
| front | AlwaysTrue / 255 | 133 / 255 | Keep / Keep / Replace |
| back | AlwaysTrue / 255 | 133 / 255 | Keep / Keep / Replace |

| 目标 | Blend enabled | RGB source / destination / op | Alpha source / destination / op |
|---|---|---|---|
| RT0 | False | One / Zero / Add | One / Zero / Add |
| RT1 | False | One / Zero / Add | One / Zero / Add |
| RT2 | False | One / Zero / Add | One / Zero / Add |
| RT3 | False | One / Zero / Add | One / Zero / Add |
| RT4 | False | One / Zero / Add | One / Zero / Add |
| RT5 | False | One / Zero / Add | One / Zero / Add |

VS：miHoYo/Uber/Character/Character_Uber_FacialUVExpression，ResourceId::64868，[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_64868.vs.txt)。

PS：miHoYo/Uber/Character/Character_Uber_FacialUVExpression，ResourceId::75686，[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_75686.ps.txt)。

| 阶段 / 访问 | ResourceId / 名称 | 底层资源描述 |
|---|---|---|
| VS / reads | ResourceId::65258 · Character Ambient Sensor Result 1 | 70×1×1，array=1，mips=1，R16G16B16A16_TYPELESS |
| PS / reads | ResourceId::75809 · Avatar_Tex_Face01_Shadow | 512×512×1，array=1，mips=10，BC7_UNORM |
| PS / reads | ResourceId::75807 · Avatar_Girl_Claymore_MarionetteNew_Tex_Face_Diffuse | 1024×1024×1，array=1，mips=11，BC7_SRGB |
| PS / reads | ResourceId::75811 · Avatar_Tex_Eye_BlendShape_Diffuse | 1024×1024×1，array=1，mips=11，BC7_SRGB |
| PS / reads | ResourceId::75774 · Avatar_Tex_Appear_Face_Mask | 128×128×1，array=1，mips=8，BC7_UNORM |
| PS / reads | ResourceId::59634 · Avatar_Girl_Tex_FaceSDF | 1024×1024×1，array=1，mips=1，BC7_UNORM |

#### 木偶 e10491

DrawIndexedInstancedIndirect(<18813, 1>)；indices=18813，instances=1。非实例化 draw 的 instances=0 是导出值，不表示没有执行。

| 附件 | ResourceId | 底层资源描述 | 颜色写掩码 |
|---|---|---|---|
| RT0 | ResourceId::64533 | 3440×1440×1，array=1，mips=1，R10G10B10A2_TYPELESS | 15 |
| RT1 | ResourceId::64537 | 3440×1440×1，array=1，mips=1，R8G8B8A8_TYPELESS | 15 |
| RT2 | ResourceId::64541 | 3440×1440×1，array=1，mips=1，R8G8B8A8_TYPELESS | 15 |
| RT3 | ResourceId::64545 | 3440×1440×1，array=1，mips=1，R8_TYPELESS | 15 |
| RT4 | ResourceId::64553 | 3440×1440×1，array=1，mips=1，R8_TYPELESS | 15 |
| RT5 | ResourceId::64549 | 3440×1440×1，array=1，mips=1，R8_TYPELESS | 15 |
| Depth | ResourceId::61073 | 3440×1440×1，array=1，mips=1，D32S8_TYPELESS | — |

Depth：enable=True，compare=GreaterEqual，write=True。

| Stencil 面 | Compare / mask | Ref / writeMask | Fail / depthFail / pass |
|---|---|---|---|
| front | AlwaysTrue / 255 | 133 / 255 | Keep / Keep / Replace |
| back | AlwaysTrue / 255 | 133 / 255 | Keep / Keep / Replace |

| 目标 | Blend enabled | RGB source / destination / op | Alpha source / destination / op |
|---|---|---|---|
| RT0 | False | One / Zero / Add | One / Zero / Add |
| RT1 | False | One / Zero / Add | One / Zero / Add |
| RT2 | False | One / Zero / Add | One / Zero / Add |
| RT3 | False | One / Zero / Add | One / Zero / Add |
| RT4 | False | One / Zero / Add | One / Zero / Add |
| RT5 | False | One / Zero / Add | One / Zero / Add |

VS：miHoYo/Uber/Character/Character_Uber_Marionette_NewShining_Hair_Flattened，ResourceId::64863，[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_64863.vs.txt)。

PS：miHoYo/Uber/Character/Character_Uber_Marionette_NewShining_Dress_Flattened，ResourceId::75688，[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_75688.ps.txt)。

| 阶段 / 访问 | ResourceId / 名称 | 底层资源描述 |
|---|---|---|
| VS / reads | ResourceId::65258 · Character Ambient Sensor Result 1 | 70×1×1，array=1，mips=1，R16G16B16A16_TYPELESS |
| PS / reads | ResourceId::75770 · Avatar_Girl_Claymore_MarionetteNew_Tex_Body_Lightmap | 1024×1024×1，array=1，mips=11，BC7_UNORM |
| PS / reads | ResourceId::75760 · Avatar_Girl_Claymore_MarionetteNew_Tex_Body_Normalmap | 1024×1024×1，array=1，mips=11，BC7_UNORM |
| PS / reads | ResourceId::75772 · Avatar_Girl_Claymore_MarionetteNew_Tex_Body_Diffuse | 1024×1024×1，array=1，mips=11，BC7_SRGB |
| PS / reads | ResourceId::75712 · Avatar_Girl_Pole_Escoffier_Tex_Stockings_Detailmap | 256×256×1，array=1，mips=9，R8G8B8A8_UNORM |
| PS / reads | ResourceId::74744 · Avatar_Tex_MetalMap | 256×256×1，array=1，mips=9，BC7_SRGB |
| PS / reads | ResourceId::46612 · Avatar_Tex_Specular_Ramp | 256×2×1，array=1，mips=1，R8G8B8A8_SRGB |
| PS / reads | ResourceId::59819 · Avatar_Girl_Claymore_MarionetteNew_Tex_Body_Shadow_Ramp | 256×20×1，array=1，mips=1，R8G8B8A8_SRGB |
| PS / reads | ResourceId::56 · UnityGrey | 4×4×1，array=1，mips=1，R8G8B8A8_SRGB |
| PS / reads | ResourceId::41 · UnityWhite | 4×4×1，array=1，mips=1，R8G8B8A8_SRGB |

#### 木偶 e10567

ID3D11DeviceContext::DrawIndexed()；indices=1608，instances=0。非实例化 draw 的 instances=0 是导出值，不表示没有执行。

| 附件 | ResourceId | 底层资源描述 | 颜色写掩码 |
|---|---|---|---|
| RT0 | ResourceId::64533 | 3440×1440×1，array=1，mips=1，R10G10B10A2_TYPELESS | 15 |
| RT1 | ResourceId::64537 | 3440×1440×1，array=1，mips=1，R8G8B8A8_TYPELESS | 15 |
| RT2 | ResourceId::64541 | 3440×1440×1，array=1，mips=1，R8G8B8A8_TYPELESS | 15 |
| RT3 | ResourceId::64545 | 3440×1440×1，array=1，mips=1，R8_TYPELESS | 15 |
| RT4 | ResourceId::64553 | 3440×1440×1，array=1，mips=1，R8_TYPELESS | 15 |
| RT5 | ResourceId::64549 | 3440×1440×1，array=1，mips=1，R8_TYPELESS | 15 |
| Depth | ResourceId::61073 | 3440×1440×1，array=1，mips=1，D32S8_TYPELESS | — |

Depth：enable=True，compare=GreaterEqual，write=True。

| Stencil 面 | Compare / mask | Ref / writeMask | Fail / depthFail / pass |
|---|---|---|---|
| front | AlwaysTrue / 255 | 165 / 255 | Keep / Keep / Replace |
| back | AlwaysTrue / 255 | 165 / 255 | Keep / Keep / Replace |

| 目标 | Blend enabled | RGB source / destination / op | Alpha source / destination / op |
|---|---|---|---|
| RT0 | False | One / Zero / Add | One / Zero / Add |
| RT1 | False | One / Zero / Add | One / Zero / Add |
| RT2 | False | One / Zero / Add | One / Zero / Add |
| RT3 | False | One / Zero / Add | One / Zero / Add |
| RT4 | False | One / Zero / Add | One / Zero / Add |
| RT5 | False | One / Zero / Add | One / Zero / Add |

VS：miHoYo/Avatar/Character_Eye_Uber，ResourceId::72810，[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_72810.vs.txt)。

PS：miHoYo/Avatar/Character_Eye_Uber，ResourceId::75690，[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_75690.ps.txt)。

| 阶段 / 访问 | ResourceId / 名称 | 底层资源描述 |
|---|---|---|
| VS / reads | ResourceId::65258 · Character Ambient Sensor Result 1 | 70×1×1，array=1，mips=1，R16G16B16A16_TYPELESS |
| PS / reads | ResourceId::59825 · Avatar_Girl_Claymore_MarionetteNew_Tex_Pupil_Packed_Ramp | 256×8×1，array=1，mips=1，R8G8B8A8_SRGB |
| PS / reads | ResourceId::59596 · Avatar_Girl_Claymore_MarionetteNew_Tex_Pupil01_Diffuse | 256×256×1，array=1，mips=1，BC7_SRGB |
| PS / reads | ResourceId::75824 · Avatar_Girl_Claymore_MarionetteNew_Tex_Pupil_Matcap_Mask | 512×512×1，array=1，mips=10，BC7_SRGB |
| PS / reads | ResourceId::41 · UnityWhite | 4×4×1，array=1，mips=1，R8G8B8A8_SRGB |
| PS / reads | ResourceId::59822 · Avatar_Girl_Claymore_MarionetteNew_Tex_Pupil_Blend_Ramp | 256×8×1，array=1，mips=1，R8G8B8A8_SRGB |
| PS / reads | ResourceId::59586 · Avatar_Girl_Claymore_MarionetteNew_Tex_Pupil02_Diffuse | 256×256×1，array=1，mips=1，BC7_SRGB |
| PS / reads | ResourceId::59588 · Avatar_Girl_Claymore_MarionetteNew_Tex_Pupil04_Diffuse | 128×128×1，array=1，mips=1，BC7_SRGB |
| PS / reads | ResourceId::59590 · Avatar_Girl_Claymore_MarionetteNew_Tex_Pupil03_Diffuse | 256×256×1，array=1，mips=1，BC7_SRGB |
| PS / reads | ResourceId::75822 · Avatar_Girl_Claymore_MarionetteNew_Tex_EyeHighlight_Diffuse | 256×256×1，array=1，mips=9，BC7_SRGB |

#### 木偶 e10774

DrawIndexedInstancedIndirect(<29298, 1>)；indices=29298，instances=1。非实例化 draw 的 instances=0 是导出值，不表示没有执行。

| 附件 | ResourceId | 底层资源描述 | 颜色写掩码 |
|---|---|---|---|
| RT0 | ResourceId::64533 | 3440×1440×1，array=1，mips=1，R10G10B10A2_TYPELESS | 15 |
| RT1 | ResourceId::64537 | 3440×1440×1，array=1，mips=1，R8G8B8A8_TYPELESS | 15 |
| RT2 | ResourceId::64541 | 3440×1440×1，array=1，mips=1，R8G8B8A8_TYPELESS | 15 |
| RT3 | ResourceId::64545 | 3440×1440×1，array=1，mips=1，R8_TYPELESS | 15 |
| RT4 | ResourceId::64553 | 3440×1440×1，array=1，mips=1，R8_TYPELESS | 15 |
| RT5 | ResourceId::64549 | 3440×1440×1，array=1，mips=1，R8_TYPELESS | 15 |
| Depth | ResourceId::61073 | 3440×1440×1，array=1，mips=1，D32S8_TYPELESS | — |

Depth：enable=True，compare=GreaterEqual，write=True。

| Stencil 面 | Compare / mask | Ref / writeMask | Fail / depthFail / pass |
|---|---|---|---|
| front | AlwaysTrue / 255 | 133 / 255 | Keep / Keep / Replace |
| back | AlwaysTrue / 255 | 133 / 255 | Keep / Keep / Replace |

| 目标 | Blend enabled | RGB source / destination / op | Alpha source / destination / op |
|---|---|---|---|
| RT0 | False | One / Zero / Add | One / Zero / Add |
| RT1 | False | One / Zero / Add | One / Zero / Add |
| RT2 | False | One / Zero / Add | One / Zero / Add |
| RT3 | False | One / Zero / Add | One / Zero / Add |
| RT4 | False | One / Zero / Add | One / Zero / Add |
| RT5 | False | One / Zero / Add | One / Zero / Add |

VS：miHoYo/Uber/Character/Character_Uber_Marionette_NewShining_Hair_Flattened，ResourceId::64873，[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_64873.vs.txt)。

PS：miHoYo/Uber/Character/Character_Uber_Stockings_New，ResourceId::75700，[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_75700.ps.txt)。

| 阶段 / 访问 | ResourceId / 名称 | 底层资源描述 |
|---|---|---|
| PS / reads | ResourceId::75758 · Avatar_Girl_Claymore_MarionetteNew_Tex_Body01_Diffuse | 1024×1024×1，array=1，mips=11，BC7_SRGB |
| PS / reads | ResourceId::75723 · Avatar_Girl_Claymore_MarionetteNew_Tex_Body01_Lightmap | 1024×1024×1，array=1，mips=11，BC7_UNORM |
| PS / reads | ResourceId::41 · UnityWhite | 4×4×1，array=1，mips=1，R8G8B8A8_SRGB |

#### 木偶 e21340

ID3D11DeviceContext::DrawIndexed()；indices=6，instances=0。非实例化 draw 的 instances=0 是导出值，不表示没有执行。

| 附件 | ResourceId | 底层资源描述 | 颜色写掩码 |
|---|---|---|---|
| RT0 | ResourceId::65250 | 70×5×1，array=1，mips=1，R16G16B16A16_TYPELESS | 15 |
| Depth | ResourceId::0 | — | — |

Depth：enable=True，compare=AlwaysTrue，write=False。

Stencil：关闭。

| 目标 | Blend enabled | RGB source / destination / op | Alpha source / destination / op |
|---|---|---|---|
| RT0 | False | One / Zero / Add | One / Zero / Add |

VS：miHoYo/Misc/CharacterAmbientSensors，ResourceId::41081，[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_41081.vs.txt)。

PS：miHoYo/Misc/CharacterAmbientSensors，ResourceId::41082，[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_41082.ps.txt)。

| 阶段 / 访问 | ResourceId / 名称 | 底层资源描述 |
|---|---|---|
| PS / reads | ResourceId::65015 · TempBuffer 145 4096x2048 | 4096×2048×1，array=1，mips=1，R16_TYPELESS |

#### 木偶 e21355

ID3D11DeviceContext::DrawIndexed()；indices=6，instances=0。非实例化 draw 的 instances=0 是导出值，不表示没有执行。

| 附件 | ResourceId | 底层资源描述 | 颜色写掩码 |
|---|---|---|---|
| RT0 | ResourceId::65250 | 70×5×1，array=1，mips=1，R16G16B16A16_TYPELESS | 15 |
| Depth | ResourceId::0 | — | — |

Depth：enable=True，compare=AlwaysTrue，write=False。

Stencil：关闭。

| 目标 | Blend enabled | RGB source / destination / op | Alpha source / destination / op |
|---|---|---|---|
| RT0 | False | One / Zero / Add | One / Zero / Add |

VS：miHoYo/Misc/CharacterAmbientSensors，ResourceId::41081，[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_41081.vs.txt)。

PS：miHoYo/Misc/CharacterAmbientSensors，ResourceId::41083，[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_41083.ps.txt)。

| 阶段 / 访问 | ResourceId / 名称 | 底层资源描述 |
|---|---|---|
| PS / reads | ResourceId::64545 · TempBuffer 141 3440x1440 | 3440×1440×1，array=1，mips=1，R8_TYPELESS |
| PS / reads | ResourceId::64537 · TempBuffer 139 3440x1440 | 3440×1440×1，array=1，mips=1，R8G8B8A8_TYPELESS |

#### 木偶 e21374

ID3D11DeviceContext::DrawIndexed()；indices=6，instances=0。非实例化 draw 的 instances=0 是导出值，不表示没有执行。

| 附件 | ResourceId | 底层资源描述 | 颜色写掩码 |
|---|---|---|---|
| RT0 | ResourceId::65258 | 70×1×1，array=1，mips=1，R16G16B16A16_TYPELESS | 15 |
| Depth | ResourceId::0 | — | — |

Depth：enable=True，compare=AlwaysTrue，write=False。

Stencil：关闭。

| 目标 | Blend enabled | RGB source / destination / op | Alpha source / destination / op |
|---|---|---|---|
| RT0 | False | One / Zero / Add | One / Zero / Add |

VS：miHoYo/Misc/CharacterAmbientSensors，ResourceId::41084，[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_41084.vs.txt)。

PS：miHoYo/Misc/CharacterAmbientSensors，ResourceId::41085，[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_41085.ps.txt)。

| 阶段 / 访问 | ResourceId / 名称 | 底层资源描述 |
|---|---|---|
| PS / reads | ResourceId::65254 · Character Ambient Sensor Result 0 | 70×1×1，array=1，mips=1，R16G16B16A16_TYPELESS |
| PS / reads | ResourceId::65250 · Character Ambient Sensor Immediate | 70×5×1，array=1，mips=1，R16G16B16A16_TYPELESS |

#### 木偶 e21389

ID3D11DeviceContext::DrawIndexed()；indices=6，instances=0。非实例化 draw 的 instances=0 是导出值，不表示没有执行。

| 附件 | ResourceId | 底层资源描述 | 颜色写掩码 |
|---|---|---|---|
| RT0 | ResourceId::65258 | 70×1×1，array=1，mips=1，R16G16B16A16_TYPELESS | 15 |
| Depth | ResourceId::0 | — | — |

Depth：enable=True，compare=AlwaysTrue，write=False。

Stencil：关闭。

| 目标 | Blend enabled | RGB source / destination / op | Alpha source / destination / op |
|---|---|---|---|
| RT0 | False | One / Zero / Add | One / Zero / Add |

VS：miHoYo/Misc/CharacterAmbientSensors，ResourceId::41084，[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_41084.vs.txt)。

PS：miHoYo/Misc/CharacterAmbientSensors，ResourceId::41086，[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_41086.ps.txt)。

| 阶段 / 访问 | ResourceId / 名称 | 底层资源描述 |
|---|---|---|
| PS / reads | ResourceId::65254 · Character Ambient Sensor Result 0 | 70×1×1，array=1，mips=1，R16G16B16A16_TYPELESS |
| PS / reads | ResourceId::65250 · Character Ambient Sensor Immediate | 70×5×1，array=1，mips=1，R16G16B16A16_TYPELESS |

### 终末地场景

来源：inventory.json。

#### 终末地场景 e4985

vkCmdDraw()；indices=3，instances=1。非实例化 draw 的 instances=0 是导出值，不表示没有执行。

| 附件 | ResourceId | 底层资源描述 | 颜色写掩码 |
|---|---|---|---|
| RT0 | ResourceId::121858 | 3440×1440×1，array=1，mips=1，R10G10B10A2_UNORM | 15 |
| RT1 | ResourceId::121723 | 3440×1440×1，array=1，mips=1，R8G8B8A8_UNORM | 0 |
| Depth | ResourceId::121818 | 3440×1440×1，array=1，mips=1，D32S8 | — |

Depth：enable=True，compare=AlwaysTrue，write=True。

| Stencil 面 | Compare / mask | Ref / writeMask | Fail / depthFail / pass |
|---|---|---|---|
| front | AlwaysTrue / 255 | 0 / 255 | Keep / Keep / Replace |
| back | AlwaysTrue / 255 | 0 / 255 | Keep / Keep / Replace |

| 目标 | Blend enabled | RGB source / destination / op | Alpha source / destination / op |
|---|---|---|---|
| RT0 | False | Zero / Zero / Add | Zero / Zero / Add |
| RT1 | False | Zero / Zero / Add | Zero / Zero / Add |

VS：Shader Module 82162，ResourceId::82162，[反汇编](/scene-capture-comparison/endfield/shaders/ResourceId_82162.vs.txt)。

PS：Shader Module 82163，ResourceId::82163，[反汇编](/scene-capture-comparison/endfield/shaders/ResourceId_82163.ps.txt)。

| 阶段 / 访问 | ResourceId / 名称 | 底层资源描述 |
|---|---|---|
| PS / reads | ResourceId::121886 · 2D Depth/Stencil Attachment 121886 | 3440×1440×1，array=1，mips=1，D32S8 |
| PS / reads | ResourceId::121912 · 2D Color Attachment 121912 | 3440×1440×1，array=1，mips=1，R10G10B10A2_UNORM |

#### 终末地场景 e4996

vkCmdDrawIndexed()；indices=6，instances=1。非实例化 draw 的 instances=0 是导出值，不表示没有执行。

| 附件 | ResourceId | 底层资源描述 | 颜色写掩码 |
|---|---|---|---|
| RT0 | ResourceId::121906 | 1024×1024×1，array=1，mips=1，R8G8B8A8_UNORM | 15 |
| RT1 | ResourceId::121903 | 1024×1024×1，array=1，mips=1，R10G10B10A2_UNORM | 15 |
| Depth | ResourceId::121900 | 1024×1024×1，array=1，mips=1，D32 | — |

Depth：enable=True，compare=GreaterEqual，write=True。

Stencil：关闭。

| 目标 | Blend enabled | RGB source / destination / op | Alpha source / destination / op |
|---|---|---|---|
| RT0 | False | Zero / Zero / Add | Zero / Zero / Add |
| RT1 | False | Zero / Zero / Add | Zero / Zero / Add |

VS：Shader Module 88210，ResourceId::88210，[反汇编](/scene-capture-comparison/endfield/shaders/ResourceId_88210.vs.txt)。

PS：Shader Module 88211，ResourceId::88211，[反汇编](/scene-capture-comparison/endfield/shaders/ResourceId_88211.ps.txt)。

| 阶段 / 访问 | ResourceId / 名称 | 底层资源描述 |
|---|---|---|

#### 终末地场景 e5079

vkCmdDrawIndexedIndirect(1) => <1536, 50>；indices=1536，instances=50。非实例化 draw 的 instances=0 是导出值，不表示没有执行。

| 附件 | ResourceId | 底层资源描述 | 颜色写掩码 |
|---|---|---|---|
| RT0 | ResourceId::121858 | 3440×1440×1，array=1，mips=1，R10G10B10A2_UNORM | 15 |
| RT1 | ResourceId::121723 | 3440×1440×1，array=1，mips=1，R8G8B8A8_UNORM | 15 |
| RT2 | ResourceId::121921 | 3440×1440×1，array=1，mips=1，R10G10B10A2_UNORM | 15 |
| Depth | ResourceId::121818 | 3440×1440×1，array=1，mips=1，D32S8 | — |

Depth：enable=True，compare=GreaterEqual，write=True。

| Stencil 面 | Compare / mask | Ref / writeMask | Fail / depthFail / pass |
|---|---|---|---|
| front | AlwaysTrue / 255 | 3 / 255 | Keep / Keep / Replace |
| back | AlwaysTrue / 255 | 3 / 255 | Keep / Keep / Replace |

| 目标 | Blend enabled | RGB source / destination / op | Alpha source / destination / op |
|---|---|---|---|
| RT0 | False | Zero / Zero / Add | Zero / Zero / Add |
| RT1 | False | Zero / Zero / Add | Zero / Zero / Add |
| RT2 | True | SrcCol / InvSrcCol / Add | One / Zero / Add |

VS：Shader Module 88252，ResourceId::88252，[反汇编](/scene-capture-comparison/endfield/shaders/ResourceId_88252.vs.txt)。

PS：Shader Module 88253，ResourceId::88253，[反汇编](/scene-capture-comparison/endfield/shaders/ResourceId_88253.ps.txt)。

| 阶段 / 访问 | ResourceId / 名称 | 底层资源描述 |
|---|---|---|
| VS / reads | ResourceId::121903 · 2D Color Attachment 121903 | 1024×1024×1，array=1，mips=1，R10G10B10A2_UNORM |
| VS / reads | ResourceId::121894 · 2D Color Attachment 121894 | 1024×1024×1，array=1，mips=1，R16_FLOAT |
| VS / reads | ResourceId::121897 · 2D Depth Attachment 121897 | 1024×1024×1，array=1，mips=1，D32 |
| VS / reads | ResourceId::121906 · 2D Color Attachment 121906 | 1024×1024×1，array=1，mips=1，R8G8B8A8_UNORM |
| VS / writes | ResourceId::121883 · Buffer 121883 | 16384 bytes，BufferCategory.ReadWrite |
| PS / reads | ResourceId::80987 · 2D Color Attachment 80987 | 768×768×1，array=1，mips=1，R8G8B8A8_UNORM |
| PS / reads | ResourceId::64278 · 2D Image 64278 | 512×512×1，array=1，mips=10，BC7_UNORM |
| PS / reads | ResourceId::64192 · 2D Array Image 64192 | 2048×2048×1，array=2，mips=12，BC7_UNORM |
| PS / reads | ResourceId::64197 · 2D Image 64197 | 2048×2048×1，array=1，mips=1，BC7_UNORM |

#### 终末地场景 e5372

vkCmdDrawIndexed()；indices=10590，instances=1。非实例化 draw 的 instances=0 是导出值，不表示没有执行。

| 附件 | ResourceId | 底层资源描述 | 颜色写掩码 |
|---|---|---|---|
| RT0 | ResourceId::121930 | 3440×1440×1，array=1，mips=1，R11G11B10_FLOAT | 15 |
| RT1 | ResourceId::121921 | 3440×1440×1，array=1，mips=1，R10G10B10A2_UNORM | 15 |
| Depth | ResourceId::121886 | 3440×1440×1，array=1，mips=1，D32S8 | — |

Depth：enable=True，compare=Equal，write=True。

Stencil：关闭。

| 目标 | Blend enabled | RGB source / destination / op | Alpha source / destination / op |
|---|---|---|---|
| RT0 | False | Zero / Zero / Add | Zero / Zero / Add |
| RT1 | False | Zero / Zero / Add | Zero / Zero / Add |

VS：Shader Module 88366，ResourceId::88366，[反汇编](/scene-capture-comparison/endfield/shaders/ResourceId_88366.vs.txt)。

PS：Shader Module 88367，ResourceId::88367，[反汇编](/scene-capture-comparison/endfield/shaders/ResourceId_88367.ps.txt)。

| 阶段 / 访问 | ResourceId / 名称 | 底层资源描述 |
|---|---|---|
| VS / writes | ResourceId::249 · Buffer 249 | 8413184 bytes，BufferCategory.ReadWrite |
| PS / reads | ResourceId::121798 · 2D Color Attachment 121798 | 3440×1440×1，array=1，mips=1，R8G8_UNORM |
| PS / reads | ResourceId::80927 · 2D Depth Attachment 80927 | 6144×4096×1，array=1，mips=1，D16 |
| PS / reads | ResourceId::160 · 2D Image 160 | 4×4×1，array=1，mips=1，R8G8B8A8_SRGB |
| PS / reads | ResourceId::66147 · 3D Image 66147 | 128×192×128，array=1，mips=1，R8G8B8A8_UNORM |
| PS / reads | ResourceId::66141 · 3D Image 66141 | 128×192×128，array=1，mips=1，R8G8B8A8_UNORM |
| PS / reads | ResourceId::66135 · 3D Image 66135 | 128×192×128，array=1，mips=1，R8G8B8A8_UNORM |
| PS / reads | ResourceId::66144 · 3D Image 66144 | 128×64×128，array=1，mips=1，R11G11B10_FLOAT |
| PS / reads | ResourceId::66138 · 3D Image 66138 | 128×64×128，array=1，mips=1，R11G11B10_FLOAT |
| PS / reads | ResourceId::66132 · 3D Image 66132 | 128×64×128，array=1，mips=1，R11G11B10_FLOAT |
| PS / reads | ResourceId::116956 · 3D Image 116956 | 313×180×128，array=1，mips=1，R16G16B16A16_FLOAT |
| PS / reads | ResourceId::654 · 2D Image 654 | 512×512×1，array=1，mips=10，BC7_UNORM |
| PS / reads | ResourceId::651 · 2D Image 651 | 256×256×1，array=1，mips=9，BC7_UNORM |
| PS / reads | ResourceId::657 · 2D Image 657 | 256×256×1，array=1，mips=9，BC7_UNORM |
| PS / reads | ResourceId::98714 · 2D Image 98714 | 1024×32×1，array=1，mips=11，BC7_SRGB |
| PS / reads | ResourceId::118048 · 2D Image 118048 | 256×256×1，array=1，mips=9，BC7_UNORM |
| PS / reads | ResourceId::115318 · 2D Image 115318 | 1024×1024×1，array=1，mips=1，R8G8B8A8_UNORM |
| PS / reads | ResourceId::99023 · 2D Image 99023 | 512×512×1，array=1，mips=10，BC7_UNORM |
| PS / reads | ResourceId::99098 · 2D Image 99098 | 1024×1024×1，array=1，mips=11，BC7_SRGB |
| PS / reads | ResourceId::16300 · 2D Image 16300 | 256×1×1，array=1，mips=1，R8G8B8A8_UNORM |
| PS / reads | ResourceId::118556 · 2D Image 118556 | 1024×1024×1，array=1，mips=11，BC7_SRGB |
| PS / writes | ResourceId::249 · Buffer 249 | 8413184 bytes，BufferCategory.ReadWrite |
| PS / writes | ResourceId::121815 · Buffer 121815 | 244592 bytes，BufferCategory.ReadWrite |

#### 终末地场景 e5755

vkCmdDrawIndexed()；indices=36，instances=1。非实例化 draw 的 instances=0 是导出值，不表示没有执行。

| 附件 | ResourceId | 底层资源描述 | 颜色写掩码 |
|---|---|---|---|
| RT0 | ResourceId::121723 | 3440×1440×1，array=1，mips=1，R8G8B8A8_UNORM | 7 |
| Depth | ResourceId::121818 | 3440×1440×1，array=1，mips=1，D32S8 | — |

Depth：enable=True，compare=Less，write=False。

| Stencil 面 | Compare / mask | Ref / writeMask | Fail / depthFail / pass |
|---|---|---|---|
| front | Equal / 1 | 1 / 255 | Keep / Keep / Keep |
| back | Equal / 1 | 1 / 255 | Keep / Keep / Keep |

| 目标 | Blend enabled | RGB source / destination / op | Alpha source / destination / op |
|---|---|---|---|
| RT0 | True | One / InvSrcAlpha / Add | One / InvSrcAlpha / Add |

VS：Shader Module 88487，ResourceId::88487，[反汇编](/scene-capture-comparison/endfield/shaders/ResourceId_88487.vs.txt)。

PS：Shader Module 88488，ResourceId::88488，[反汇编](/scene-capture-comparison/endfield/shaders/ResourceId_88488.ps.txt)。

| 阶段 / 访问 | ResourceId / 名称 | 底层资源描述 |
|---|---|---|
| PS / reads | ResourceId::121792 · 2D Color Attachment 121792 | 3440×1440×1，array=1，mips=1，R32_FLOAT |
| PS / reads | ResourceId::65216 · 2D Image 65216 | 256×256×1，array=1，mips=9，BC7_SRGB |
| PS / reads | ResourceId::63747 · 2D Image 63747 | 128×128×1，array=1，mips=8，BC7_SRGB |
| PS / reads | ResourceId::62806 · 2D Image 62806 | 1024×1024×1，array=1，mips=11，BC7_SRGB |

## 2. 精细 descriptor 与常量绑定

以下两项从原绑定附录迁移，保留已导出的常量原始文件。其他角色事件的常量 byte offset 尚未逐项导出，不把 inventory 资源列表冒充完整 descriptor 视图。

### 蕾米 e9986 精细绑定

ID3D11DeviceContext::Dispatch()；indices=0，instances=0，dispatch=[108, 45, 1]。

#### CS · CapsuleAO.CapsuleAO

[反汇编](/scene-capture-comparison/leimi/shaders/ResourceId_6143.cs.txt), SHA-256 `62462e7d2bdba342e821f63f18b0187b89e0b22dda5d629672852d6920c78fbb`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|
| reads | 0 / 0 | texture0 | ResourceId::20788 · TempBuffer 321 3432x1440 | 3432 × 1440 × 1，array=1，mips=1，R16G16B16A16_TYPELESS |
| reads | 0 / 1 | texture1 | ResourceId::20550 · TempBuffer 267 3432x1440 | 3432 × 1440 × 1，array=1，mips=1，D32S8_TYPELESS |
| reads | 0 / 2 | texture2 | ResourceId::20542 · TempBuffer 265 3432x1440 | 3432 × 1440 × 1，array=1，mips=1，R10G10B10A2_TYPELESS |
| reads | 0 / 3 | structuredbuffer3 | ResourceId::14012 · EntityGpuDataBuffer | 8192 bytes buffer |
| writes | 0 / 0 | uav0 | ResourceId::20589 · TempBuffer 276 1716x720 | 1716 × 720 × 1，array=1，mips=1，R8_TYPELESS |
| writes | 0 / 1 | uav1 | ResourceId::21697 · Buffer-16-112 | 112 bytes buffer |
| writes | 0 / 2 | uav2 | ResourceId::21700 · Buffer-16-28 | 28 bytes buffer |

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| cbuffer0 | 0 / 0 | 2704 | ResourceId::6144 / 0 | [bin](/scene-capture-comparison/leimi/e9986_cs_s0_b0.bin) |

### 木偶 e10774 精细绑定

DrawIndexedInstancedIndirect(<29298, 1>)；indices=29298，instances=1，dispatch=[0, 0, 0]。

| 附件 | ResourceId | 底层尺寸与格式 |
|---|---|---|
| RT0 | ResourceId::64533 | 3440 × 1440 × 1，array=1，mips=1，R10G10B10A2_TYPELESS |
| RT1 | ResourceId::64537 | 3440 × 1440 × 1，array=1，mips=1，R8G8B8A8_TYPELESS |
| RT2 | ResourceId::64541 | 3440 × 1440 × 1，array=1，mips=1，R8G8B8A8_TYPELESS |
| RT3 | ResourceId::64545 | 3440 × 1440 × 1，array=1，mips=1，R8_TYPELESS |
| RT4 | ResourceId::64553 | 3440 × 1440 × 1，array=1，mips=1，R8_TYPELESS |
| RT5 | ResourceId::64549 | 3440 × 1440 × 1，array=1，mips=1，R8_TYPELESS |
| Depth | ResourceId::61073 | 3440 × 1440 × 1，array=1，mips=1，D32S8_TYPELESS |

Viewport：`{'enabled': True, 'height': 1440.0, 'maxDepth': 1.0, 'minDepth': 0.0, 'width': 3440.0, 'x': 0.0, 'y': 0.0}`；depth state：`{'depthBounds': False, 'depthEnable': True, 'depthFunction': 5, 'depthWrites': True, 'maxDepthBounds': 0.0, 'minDepthBounds': 0.0}`；stencil=True，front ref=133，mask=255。

#### VS · miHoYo/Uber/Character/Character_Uber_Marionette_NewShining_Hair_Flattened

[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_64873.vs.txt), SHA-256 `619d2fd34da102c07048d703eb604ce2561df7ec2f1b629e4493b8a386ade737`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| cbuffer0 | 0 / 0 | 3904 | ResourceId::37484 / 0 | [bin](/scene-capture-comparison/muou/e10774_vs_s0_b0.bin) |
| cbuffer1 | 0 / 1 | 112 | ResourceId::24508 / 0 | [bin](/scene-capture-comparison/muou/e10774_vs_s0_b1.bin) |
| cbuffer2 | 0 / 2 | 128 | ResourceId::25056 / 0 | [bin](/scene-capture-comparison/muou/e10774_vs_s0_b2.bin) |
| cbuffer3 | 0 / 3 | 128 | ResourceId::230 / 0 | [bin](/scene-capture-comparison/muou/e10774_vs_s0_b3.bin) |
| cbuffer4 | 0 / 4 | 400 | ResourceId::231 / 0 | [bin](/scene-capture-comparison/muou/e10774_vs_s0_b4.bin) |

#### PS · miHoYo/Uber/Character/Character_Uber_Stockings_New

[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_75700.ps.txt), SHA-256 `c462dab94df77a23061e43e2dc024841a7b59eaac16da9593f426060411b06f0`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|
| reads | 0 / 0 | texture0 | ResourceId::75758 · Avatar_Girl_Claymore_MarionetteNew_Tex_Body01_Diffuse | 1024 × 1024 × 1，array=1，mips=11，BC7_SRGB |
| reads | 0 / 1 | texture1 | ResourceId::75723 · Avatar_Girl_Claymore_MarionetteNew_Tex_Body01_Lightmap | 1024 × 1024 × 1，array=1，mips=11，BC7_UNORM |
| reads | 0 / 2 | texture2 | ResourceId::41 · UnityWhite | 4 × 4 × 1，array=1，mips=1，R8G8B8A8_SRGB |

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| cbuffer0 | 0 / 0 | 4048 | ResourceId::37484 / 0 | [bin](/scene-capture-comparison/muou/e10774_ps_s0_b0.bin) |
| cbuffer1 | 0 / 1 | 128 | ResourceId::24508 / 0 | [bin](/scene-capture-comparison/muou/e10774_ps_s0_b1.bin) |
