---
title: "场景与整帧处理：逐事件绑定附录"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-29T00:58:00+08:00"
permalink: 2026/09/27/scene-capture-comparison-scene-binding-details/
categories:
  - 图形学
tags:
  - astra
  - 渲染分析
  - 渲染证据
---

> 由 astra 生成

单游戏详细分析：[绝区零](/2026/09/27/zzz-scene/)、[原神](/2026/09/27/genshin-scene/)、[终末地](/2026/09/27/endfield-scene/)。横向对比与证据总导航见 [总索引](/2026/09/27/scene-capture-comparison-binding-details/)。

<!-- more -->

按用途阅读请先看 [语义与证据对照](/2026/09/27/scene-capture-comparison-resource-semantics/)。本页的编号、寄存器和槽位仅用于回放定位；正文已使用法线、运动矢量、光照颜色、阴影与历史图等实际名称。

本附录保留场景光照、反射、体积、AO 和整帧后处理的原始回放绑定。资源编号只在所属截帧内有效；TYPELESS 是资源格式，具体 view、mip/slice、sampler、常量偏移见各 `details.json`。

主报告：[场景实现对比](/2026/09/27/scene-comparison/)。角色事件独立列于 [角色绑定附录](/2026/09/27/scene-capture-comparison-character-binding-details/)。木偶主六 MRT 的 e10774 属于角色材质，其细节也移入角色附录。

## 蕾米

完整事件表：[events.tsv](/scene-capture-comparison/leimi/events.tsv)；机器可读绑定：[details.json](/scene-capture-comparison/leimi/details.json)。

### e4519

ID3D11DeviceContext::DrawIndexed()；indices=6，instances=0，dispatch=[0, 0, 0]。

| 附件 | ResourceId | 底层尺寸与格式 |
|---|---|---|
| RT0 | ResourceId::11600 | 1024 × 428 × 1，array=1，mips=8，R8G8B8A8_TYPELESS |
| Depth | ResourceId::0 | — |

Viewport：`{'enabled': True, 'height': 428.0, 'maxDepth': 1.0, 'minDepth': 0.0, 'width': 1024.0, 'x': 0.0, 'y': 0.0}`；depth state：`{'depthBounds': False, 'depthEnable': True, 'depthFunction': 1, 'depthWrites': False, 'maxDepthBounds': 0.0, 'minDepthBounds': 0.0}`；stencil=False，front ref=0，mask=255。

#### VS · Hidden/Universal Render Pipeline/UberPost

[反汇编](/scene-capture-comparison/leimi/shaders/ResourceId_6608.vs.txt), SHA-256 `4a3bd3e30f4d5af331321b620079eb506cadc6b0da9aa7efe1dc9e1b36db38e8`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| cbuffer0 | 0 / 0 | 1696 | ResourceId::284 / 0 | [bin](/scene-capture-comparison/leimi/e4519_vs_s0_b0.bin) |
| cbuffer1 | 0 / 1 | 64 | ResourceId::302 / 0 | [bin](/scene-capture-comparison/leimi/e4519_vs_s0_b1.bin) |

#### PS · Hidden/Universal Render Pipeline/UberPost

[反汇编](/scene-capture-comparison/leimi/shaders/ResourceId_6609.ps.txt), SHA-256 `b4b8fcb3f396068b18bda0afaa1fa31b099a4c4cf56f94b20687c251933c1e7a`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|
| reads | 0 / 0 | texture0 | ResourceId::20281 · TempBuffer 253 1024x428 | 1024 × 428 × 1，array=1，mips=8，R16G16B16A16_TYPELESS |
| reads | 0 / 1 | texture1 | ResourceId::5947 · Thin01 | 512 × 512 × 1，array=1，mips=1，A8_UNORM |
| reads | 0 / 2 | texture2 | ResourceId::80 · UnityDefault2D | 16 × 16 × 1，array=1，mips=1，R8G8B8A8_SRGB |
| reads | 0 / 3 | texture3 | ResourceId::20820 · TempBuffer 329 1716x720 | 1716 × 720 × 1，array=1，mips=1，R11G11B10_FLOAT |
| reads | 0 / 4 | texture4 | ResourceId::54 · UnityBlack | 4 × 4 × 1，array=1，mips=1，R8G8B8A8_SRGB |

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| cbuffer0 | 0 / 0 | 2224 | ResourceId::284 / 0 | [bin](/scene-capture-comparison/leimi/e4519_ps_s0_b0.bin) |
| cbuffer1 | 0 / 1 | 480 | ResourceId::9493 / 0 | [bin](/scene-capture-comparison/leimi/e4519_ps_s0_b1.bin) |

### e9475

ID3D11DeviceContext::DrawIndexedInstanced()；indices=36，instances=3，dispatch=[0, 0, 0]。

| 附件 | ResourceId | 底层尺寸与格式 |
|---|---|---|
| RT0 | ResourceId::20788 | 3432 × 1440 × 1，array=1，mips=1，R16G16B16A16_TYPELESS |
| RT1 | ResourceId::20538 | 3432 × 1440 × 1，array=1，mips=1，R8G8B8A8_TYPELESS |
| RT2 | ResourceId::20546 | 3432 × 1440 × 1，array=1，mips=1，R10G10B10A2_TYPELESS |
| RT3 | ResourceId::20542 | 3432 × 1440 × 1，array=1，mips=1，R10G10B10A2_TYPELESS |
| Depth | ResourceId::20367 | 3432 × 1440 × 1，array=1，mips=1，D32S8_TYPELESS |

Viewport：`{'enabled': True, 'height': 1440.0, 'maxDepth': 1.0, 'minDepth': 0.0, 'width': 3432.0, 'x': 0.0, 'y': 0.0}`；depth state：`{'depthBounds': False, 'depthEnable': True, 'depthFunction': 2, 'depthWrites': False, 'maxDepthBounds': 0.0, 'minDepthBounds': 0.0}`；stencil=True，front ref=0，mask=130。

#### VS · miHoYo/Scene/Decal

[反汇编](/scene-capture-comparison/leimi/shaders/ResourceId_13927.vs.txt), SHA-256 `1f889f60ff02bd5accca2433d4b0ed8a95824ad25e39156efe3381746c346675`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| cbuffer0 | 0 / 0 | 1696 | ResourceId::389 / 0 | [bin](/scene-capture-comparison/leimi/e9475_vs_s0_b0.bin) |
| cbuffer1 | 0 / 1 | 16 | ResourceId::39 / 0 | [bin](/scene-capture-comparison/leimi/e9475_vs_s0_b1.bin) |
| cbuffer2 | 0 / 2 | 192 | ResourceId::2827 / 0 | [bin](/scene-capture-comparison/leimi/e9475_vs_s0_b2.bin) |

#### PS · miHoYo/Scene/Decal

[反汇编](/scene-capture-comparison/leimi/shaders/ResourceId_13935.ps.txt), SHA-256 `33ebc785f17e1a72e3a974ecfacb8b15e81bcaa32d5f0211d9c41a5aedfdc523`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|
| reads | 0 / 0 | texture0 | ResourceId::7167 · wetness_noise | 512 × 512 × 1，array=1，mips=10，BC1_SRGB |
| reads | 0 / 1 | texture1 | ResourceId::10040 · HeightMap_EnvVolume_MainCityStreet | 509 × 512 × 1，array=1，mips=1，R16_UNORM |
| reads | 0 / 2 | texture2 | ResourceId::1262 · 2D Texture 1262 | 4 × 4 × 1，array=1，mips=1，R8G8B8A8_SRGB |
| reads | 0 / 3 | texture3 | ResourceId::20550 · TempBuffer 267 3432x1440 | 3432 × 1440 × 1，array=1，mips=1，D32S8_TYPELESS |
| reads | 0 / 4 | texture4 | ResourceId::16241 · StreamTex:FortuneHIA_Decal_Slogan_01_01_D | 2048 × 1024 × 1，array=1，mips=12，BC3_SRGB |
| reads | 0 / 5 | texture5 | ResourceId::10930 · StreamTex:FortuneHIA_Decal_Slogan_01_01_N | 32 × 16 × 1，array=1，mips=6，BC7_UNORM |

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| cbuffer0 | 0 / 0 | 2224 | ResourceId::389 / 0 | [bin](/scene-capture-comparison/leimi/e9475_ps_s0_b0.bin) |
| cbuffer1 | 0 / 1 | 16 | ResourceId::39 / 0 | [bin](/scene-capture-comparison/leimi/e9475_ps_s0_b1.bin) |
| cbuffer2 | 0 / 2 | 256 | ResourceId::2827 / 0 | [bin](/scene-capture-comparison/leimi/e9475_ps_s0_b2.bin) |
| cbuffer3 | 0 / 3 | 16 | ResourceId::391 / 0 | [bin](/scene-capture-comparison/leimi/e9475_ps_s0_b3.bin) |
| cbuffer4 | 0 / 4 | 160 | ResourceId::14180 / 0 | [bin](/scene-capture-comparison/leimi/e9475_ps_s0_b4.bin) |

### e9622

ID3D11DeviceContext::Dispatch()；indices=0，instances=0，dispatch=[54, 23, 1]。

#### CS · lightlistbuild-clustered.TileLightListGen_NoDepthRT

[反汇编](/scene-capture-comparison/leimi/shaders/ResourceId_6080.cs.txt), SHA-256 `e834ba88226faed5e1be66e5d2d2e26a6013c03aec1fa18109e95c0332445bed`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|
| reads | 0 / 0 | structuredbuffer0 | ResourceId::9622 · Buffer-16-12256 | 12256 bytes buffer |
| reads | 0 / 1 | structuredbuffer1 | ResourceId::9619 · Buffer-16-59748 | 59748 bytes buffer |
| writes | 0 / 0 | uav0 | ResourceId::9684 · ClusteredLighting_VoxelLightLists | 10174464 bytes buffer |
| writes | 0 / 1 | uav1 | ResourceId::9681 · ClusteredLighting_VoxelOffset | 635904 bytes buffer |
| writes | 0 / 2 | uav2 | ResourceId::9625 · Buffer-16-4 | 4 bytes buffer |

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| cbuffer0 | 0 / 0 | 208 | ResourceId::6086 / 0 | [bin](/scene-capture-comparison/leimi/e9622_cs_s0_b0.bin) |

### e9650

ID3D11DeviceContext::Dispatch()；indices=0，instances=0，dispatch=[256, 1, 1]。

#### CS · lightlistbuild-worldgrid.CullLights

[反汇编](/scene-capture-comparison/leimi/shaders/ResourceId_6070.cs.txt), SHA-256 `bb6c0b6a5085a043b7eebd8a6de0b3d29b12a07bfd96381f034d97a0902d7a38`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|
| reads | 0 / 0 | structuredbuffer0 | ResourceId::9613 · Buffer-16-92160 | 92160 bytes buffer |
| reads | 0 / 1 | structuredbuffer1 | ResourceId::9631 · Buffer-16-36 | 36 bytes buffer |
| writes | 0 / 0 | uav0 | ResourceId::9690 · Buffer-16-65536 | 65536 bytes buffer |
| writes | 0 / 1 | uav1 | ResourceId::9693 · Buffer-16-262144 | 262144 bytes buffer |
| writes | 0 / 2 | uav2 | ResourceId::9628 · Buffer-16-4 | 4 bytes buffer |

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| cbuffer0 | 0 / 0 | 32 | ResourceId::6073 / 0 | [bin](/scene-capture-comparison/leimi/e9650_cs_s0_b0.bin) |

### e10094

ID3D11DeviceContext::Draw()；indices=3，instances=0，dispatch=[0, 0, 0]。

| 附件 | ResourceId | 底层尺寸与格式 |
|---|---|---|
| RT0 | ResourceId::20602 | 1716 × 720 × 1，array=1，mips=1，R32G32B32A32_TYPELESS |
| Depth | ResourceId::0 | — |

Viewport：`{'enabled': True, 'height': 720.0, 'maxDepth': 1.0, 'minDepth': 0.0, 'width': 1716.0, 'x': 0.0, 'y': 0.0}`；depth state：`{'depthBounds': False, 'depthEnable': True, 'depthFunction': 1, 'depthWrites': False, 'maxDepthBounds': 0.0, 'minDepthBounds': 0.0}`；stencil=False，front ref=0，mask=255。

#### VS · Hidden/Amplify Occlusion/OcclusionPostProcessing

[反汇编](/scene-capture-comparison/leimi/shaders/ResourceId_6704.vs.txt), SHA-256 `35a3b583c62b36ac255dbabcb68ea3aac23c4e1eb5f251b39085023209ea1774`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|

#### PS · Hidden/Amplify Occlusion/OcclusionPostProcessing

[反汇编](/scene-capture-comparison/leimi/shaders/ResourceId_6705.ps.txt), SHA-256 `b10cc0d1777ba4ad5af295f5f1249b68eab0d2ed54a18016255352db8f95743c`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|
| reads | 0 / 0 | texture0 | ResourceId::20554 · TempBuffer 268 1716x720 | 1716 × 720 × 1，array=1，mips=2，R16G16_TYPELESS |
| reads | 0 / 1 | texture1 | ResourceId::20561 · TempBuffer 269 1716x720 | 1716 × 720 × 1，array=1，mips=1，R32_TYPELESS |

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| cbuffer0 | 0 / 0 | 2832 | ResourceId::311 / 0 | [bin](/scene-capture-comparison/leimi/e10094_ps_s0_b0.bin) |

### e10136

ID3D11DeviceContext::Draw()；indices=3，instances=0，dispatch=[0, 0, 0]。

| 附件 | ResourceId | 底层尺寸与格式 |
|---|---|---|
| RT0 | ResourceId::20610 | 3432 × 1440 × 1，array=1，mips=1，R8_TYPELESS |
| Depth | ResourceId::0 | — |

Viewport：`{'enabled': True, 'height': 1440.0, 'maxDepth': 1.0, 'minDepth': 0.0, 'width': 3432.0, 'x': 0.0, 'y': 0.0}`；depth state：`{'depthBounds': False, 'depthEnable': True, 'depthFunction': 1, 'depthWrites': False, 'maxDepthBounds': 0.0, 'minDepthBounds': 0.0}`；stencil=False，front ref=0，mask=255。

#### VS · Hidden/Amplify Occlusion/OcclusionPostProcessing

[反汇编](/scene-capture-comparison/leimi/shaders/ResourceId_6710.vs.txt), SHA-256 `35a3b583c62b36ac255dbabcb68ea3aac23c4e1eb5f251b39085023209ea1774`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|

#### PS · Hidden/Amplify Occlusion/OcclusionPostProcessing

[反汇编](/scene-capture-comparison/leimi/shaders/ResourceId_6711.ps.txt), SHA-256 `0ee6610bdcbed9b81c382e84026f2b38549cd6f60d2c8b59620982e6c8ae2368`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|
| reads | 0 / 0 | texture0 | ResourceId::20550 · TempBuffer 267 3432x1440 | 3432 × 1440 × 1，array=1，mips=1，D32S8_TYPELESS |
| reads | 0 / 1 | texture1 | ResourceId::20561 · TempBuffer 269 1716x720 | 1716 × 720 × 1，array=1，mips=1，R32_TYPELESS |
| reads | 0 / 2 | texture2 | ResourceId::20542 · TempBuffer 265 3432x1440 | 3432 × 1440 × 1，array=1，mips=1，R10G10B10A2_TYPELESS |
| reads | 0 / 3 | texture3 | ResourceId::3546 · _GTAO1 | 1716 × 720 × 1，array=1，mips=1，R8_TYPELESS |

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| cbuffer0 | 0 / 0 | 1008 | ResourceId::311 / 0 | [bin](/scene-capture-comparison/leimi/e10136_ps_s0_b0.bin) |

### e10570

ID3D11DeviceContext::Draw()；indices=3，instances=0，dispatch=[0, 0, 0]。

| 附件 | ResourceId | 底层尺寸与格式 |
|---|---|---|
| RT0 | ResourceId::20363 | 3432 × 1440 × 1，array=1，mips=1，R11G11B10_FLOAT |
| Depth | ResourceId::20367 | 3432 × 1440 × 1，array=1，mips=1，D32S8_TYPELESS |

Viewport：`{'enabled': True, 'height': 1440.0, 'maxDepth': 1.0, 'minDepth': 0.0, 'width': 3432.0, 'x': 0.0, 'y': 0.0}`；depth state：`{'depthBounds': False, 'depthEnable': True, 'depthFunction': 1, 'depthWrites': False, 'maxDepthBounds': 0.0, 'minDepthBounds': 0.0}`；stencil=True，front ref=0，mask=255。

#### VS · Hidden/Universal Render Pipeline/DeferredShading

[反汇编](/scene-capture-comparison/leimi/shaders/ResourceId_6598.vs.txt), SHA-256 `35a3b583c62b36ac255dbabcb68ea3aac23c4e1eb5f251b39085023209ea1774`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|

#### PS · Hidden/Universal Render Pipeline/DeferredShading

[反汇编](/scene-capture-comparison/leimi/shaders/ResourceId_6730.ps.txt), SHA-256 `5d411ed3820aa8d74169b84b057c9164f64fba4ca868fa7fecd42d254233b80e`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|
| reads | 0 / 0 | texture0 | ResourceId::9671 · InternalLut_Scene_1024x32_ARGBHalf | 1024 × 32 × 1，array=1，mips=1，R16G16B16A16_TYPELESS |
| reads | 0 / 1 | texture1 | ResourceId::20622 · TempBuffer 284 3432x1440 | 3432 × 1440 × 1，array=1，mips=1，R11G11B10_FLOAT |

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| cbuffer0 | 0 / 0 | 3168 | ResourceId::300 / 0 | [bin](/scene-capture-comparison/leimi/e10570_ps_s0_b0.bin) |

### e11966

ID3D11DeviceContext::Draw()；indices=3，instances=0，dispatch=[0, 0, 0]。

| 附件 | ResourceId | 底层尺寸与格式 |
|---|---|---|
| RT0 | ResourceId::20347 | 3432 × 1440 × 1，array=1，mips=1，R11G11B10_FLOAT |
| RT1 | ResourceId::20355 | 3432 × 1440 × 1，array=1，mips=1，R8_TYPELESS |
| Depth | ResourceId::0 | — |

Viewport：`{'enabled': True, 'height': 1440.0, 'maxDepth': 1.0, 'minDepth': 0.0, 'width': 3432.0, 'x': 0.0, 'y': 0.0}`；depth state：`{'depthBounds': False, 'depthEnable': True, 'depthFunction': 1, 'depthWrites': False, 'maxDepthBounds': 0.0, 'minDepthBounds': 0.0}`；stencil=False，front ref=0，mask=255。

#### VS · Hidden/TemporalAntialiasing

[反汇编](/scene-capture-comparison/leimi/shaders/ResourceId_6765.vs.txt), SHA-256 `35a3b583c62b36ac255dbabcb68ea3aac23c4e1eb5f251b39085023209ea1774`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|

#### PS · Hidden/TemporalAntialiasing

[反汇编](/scene-capture-comparison/leimi/shaders/ResourceId_6766.ps.txt), SHA-256 `fd82f3dc428adc0ae215be7e9f6d4fa9fb7ec7da385397af3ea473f130090350`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|
| reads | 0 / 0 | texture0 | ResourceId::20550 · TempBuffer 267 3432x1440 | 3432 × 1440 × 1，array=1，mips=1，D32S8_TYPELESS |
| reads | 0 / 1 | texture1 | ResourceId::20626 · TempBuffer 285 3432x1440 | 3432 × 1440 × 1，array=1，mips=1，R10G10B10A2_TYPELESS |
| reads | 0 / 2 | texture2 | ResourceId::20363 · TempBuffer 258 3432x1440 | 3432 × 1440 × 1，array=1，mips=1，R11G11B10_FLOAT |
| reads | 0 / 3 | texture3 | ResourceId::20351 · _TAART1 | 3432 × 1440 × 1，array=1，mips=1，R11G11B10_FLOAT |
| reads | 0 / 4 | texture4 | ResourceId::20359 · _TAAIDRT1_3432x1440_R8 | 3432 × 1440 × 1，array=1，mips=1，R8_TYPELESS |

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| cbuffer0 | 0 / 0 | 2688 | ResourceId::320 / 0 | [bin](/scene-capture-comparison/leimi/e11966_ps_s0_b0.bin) |

### e12209

ID3D11DeviceContext::DrawIndexed()；indices=6，instances=0，dispatch=[0, 0, 0]。

| 附件 | ResourceId | 底层尺寸与格式 |
|---|---|---|
| RT0 | ResourceId::7803 | 3440 × 1440 × 1，array=1，mips=1，R8G8B8A8_TYPELESS |
| Depth | ResourceId::7807 | 3440 × 1440 × 1，array=1，mips=1，D32S8_TYPELESS |

Viewport：`{'enabled': True, 'height': 1440.0, 'maxDepth': 1.0, 'minDepth': 0.0, 'width': 3440.0, 'x': 0.0, 'y': 0.0}`；depth state：`{'depthBounds': False, 'depthEnable': True, 'depthFunction': 1, 'depthWrites': False, 'maxDepthBounds': 0.0, 'minDepthBounds': 0.0}`；stencil=False，front ref=0，mask=255。

#### VS · Hidden/Universal Render Pipeline/UberPost

[反汇编](/scene-capture-comparison/leimi/shaders/ResourceId_6789.vs.txt), SHA-256 `4a3bd3e30f4d5af331321b620079eb506cadc6b0da9aa7efe1dc9e1b36db38e8`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| cbuffer0 | 0 / 0 | 1696 | ResourceId::284 / 0 | [bin](/scene-capture-comparison/leimi/e12209_vs_s0_b0.bin) |
| cbuffer1 | 0 / 1 | 64 | ResourceId::302 / 0 | [bin](/scene-capture-comparison/leimi/e12209_vs_s0_b1.bin) |

#### PS · Hidden/Universal Render Pipeline/UberPost

[反汇编](/scene-capture-comparison/leimi/shaders/ResourceId_6790.ps.txt), SHA-256 `ac42af4c8b82a7cbe1178cda80968f997bc50afb709f1005140eaf8bbf5ff22d`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|
| reads | 0 / 0 | texture0 | ResourceId::20800 · TempBuffer 324 3432x1440 | 3432 × 1440 × 1，array=1，mips=1，R11G11B10_FLOAT |
| reads | 0 / 1 | texture1 | ResourceId::5947 · Thin01 | 512 × 512 × 1，array=1，mips=1，A8_UNORM |
| reads | 0 / 2 | texture2 | ResourceId::9663 · InternalLut_General_1024x32_ARGBHalf | 1024 × 32 × 1，array=1，mips=1，R16G16B16A16_TYPELESS |
| reads | 0 / 3 | texture3 | ResourceId::80 · UnityDefault2D | 16 × 16 × 1，array=1，mips=1，R8G8B8A8_SRGB |
| reads | 0 / 4 | texture4 | ResourceId::20820 · TempBuffer 329 1716x720 | 1716 × 720 × 1，array=1，mips=1，R11G11B10_FLOAT |
| reads | 0 / 5 | texture5 | ResourceId::54 · UnityBlack | 4 × 4 × 1，array=1，mips=1，R8G8B8A8_SRGB |

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| cbuffer0 | 0 / 0 | 2224 | ResourceId::284 / 0 | [bin](/scene-capture-comparison/leimi/e12209_ps_s0_b0.bin) |
| cbuffer1 | 0 / 1 | 480 | ResourceId::9493 / 0 | [bin](/scene-capture-comparison/leimi/e12209_ps_s0_b1.bin) |

## 木偶

完整事件表：[events.tsv](/scene-capture-comparison/muou/events.tsv)；机器可读绑定：[details.json](/scene-capture-comparison/muou/details.json)。

### e10890

ID3D11DeviceContext::DrawIndexed()；indices=36，instances=0，dispatch=[0, 0, 0]。

| 附件 | ResourceId | 底层尺寸与格式 |
|---|---|---|
| RT0 | ResourceId::64533 | 3440 × 1440 × 1，array=1，mips=1，R10G10B10A2_TYPELESS |
| RT1 | ResourceId::64537 | 3440 × 1440 × 1，array=1，mips=1，R8G8B8A8_TYPELESS |
| RT2 | ResourceId::64541 | 3440 × 1440 × 1，array=1，mips=1，R8G8B8A8_TYPELESS |
| RT3 | ResourceId::64545 | 3440 × 1440 × 1，array=1，mips=1，R8_TYPELESS |
| RT4 | ResourceId::64553 | 3440 × 1440 × 1，array=1，mips=1，R8_TYPELESS |
| Depth | ResourceId::61073 | 3440 × 1440 × 1，array=1，mips=1，D32S8_TYPELESS |

Viewport：`{'enabled': True, 'height': 1440.0, 'maxDepth': 1.0, 'minDepth': 0.0, 'width': 3440.0, 'x': 0.0, 'y': 0.0}`；depth state：`{'depthBounds': False, 'depthEnable': True, 'depthFunction': 3, 'depthWrites': False, 'maxDepthBounds': 0.0, 'minDepthBounds': 0.0}`；stencil=True，front ref=1，mask=1。

#### VS · miHoYo/Uber/Decal/Decal_Uber_Snow

[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_45634.vs.txt), SHA-256 `133ac9365dc4b3b7530dc24cdcd881e658ef69f5b6c2ad9eb091b7cccf2b231c`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| cbuffer0 | 0 / 0 | 3040 | ResourceId::37375 / 0 | [bin](/scene-capture-comparison/muou/e10890_vs_s0_b0.bin) |
| cbuffer1 | 0 / 1 | 112 | ResourceId::24508 / 0 | [bin](/scene-capture-comparison/muou/e10890_vs_s0_b1.bin) |
| cbuffer2 | 0 / 2 | 64 | ResourceId::230 / 0 | [bin](/scene-capture-comparison/muou/e10890_vs_s0_b2.bin) |
| cbuffer3 | 0 / 3 | 336 | ResourceId::231 / 0 | [bin](/scene-capture-comparison/muou/e10890_vs_s0_b3.bin) |

#### PS · miHoYo/Uber/Decal/Decal_Uber_Snow

[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_70418.ps.txt), SHA-256 `fd8f260a11bc6be781434026273285dd1373dc3b6cd5e01b45f7119f7f00256c`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|
| reads | 0 / 0 | texture0 | ResourceId::64875 · TempBuffer 146 3440x1440 | 3440 × 1440 × 1，array=1，mips=1，D32S8_TYPELESS |
| reads | 0 / 1 | texture1 | ResourceId::61034 · Stages_Snow_NoStream_Normal | 512 × 512 × 1，array=1，mips=1，BC7_UNORM |
| reads | 0 / 2 | texture2 | ResourceId::54081 · Stages_Snow_Glitter_Mask | 512 × 512 × 1，array=1，mips=10，BC7_UNORM |
| reads | 0 / 3 | texture3 | ResourceId::64879 · TempBuffer 147 1720x720 | 1720 × 720 × 1，array=1，mips=1，R10G10B10A2_TYPELESS |
| reads | 0 / 4 | texture4 | ResourceId::76220 · Area_Zd_Decal_Common_Snow_01_Diffuse | 512 × 512 × 1，array=1，mips=10，BC3_SRGB |
| reads | 0 / 5 | texture5 | ResourceId::76185 · Area_Zd_Decal_Common_Frost_Snow_01_Normal | 1024 × 1024 × 1，array=1，mips=11，BC7_UNORM |
| reads | 0 / 6 | texture6 | ResourceId::41 · UnityWhite | 4 × 4 × 1，array=1，mips=1，R8G8B8A8_SRGB |

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| cbuffer0 | 0 / 0 | 3808 | ResourceId::37375 / 0 | [bin](/scene-capture-comparison/muou/e10890_ps_s0_b0.bin) |
| cbuffer1 | 0 / 1 | 144 | ResourceId::24508 / 0 | [bin](/scene-capture-comparison/muou/e10890_ps_s0_b1.bin) |
| cbuffer2 | 0 / 2 | 352 | ResourceId::25056 / 0 | [bin](/scene-capture-comparison/muou/e10890_ps_s0_b2.bin) |
| cbuffer3 | 0 / 3 | 128 | ResourceId::230 / 0 | [bin](/scene-capture-comparison/muou/e10890_ps_s0_b3.bin) |

### e11287

ID3D11DeviceContext::Draw()；indices=3，instances=0，dispatch=[0, 0, 0]。

| 附件 | ResourceId | 底层尺寸与格式 |
|---|---|---|
| RT0 | ResourceId::64997 | 1720 × 720 × 1，array=1，mips=1，R8_TYPELESS |
| Depth | ResourceId::0 | — |

Viewport：`{'enabled': True, 'height': 720.0, 'maxDepth': 1.0, 'minDepth': 0.0, 'width': 1720.0, 'x': 0.0, 'y': 0.0}`；depth state：`{'depthBounds': False, 'depthEnable': True, 'depthFunction': 1, 'depthWrites': False, 'maxDepthBounds': 0.0, 'minDepthBounds': 0.0}`；stencil=False，front ref=0，mask=255。

#### VS · Hidden/Internal-SSAO

[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_24926.vs.txt), SHA-256 `74218140ca6ecef8884006d7049a60beec08bba1bc2d3d49c02d324b78433da4`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| cbuffer0 | 0 / 0 | 112 | ResourceId::24508 / 0 | [bin](/scene-capture-comparison/muou/e11287_vs_s0_b0.bin) |
| cbuffer1 | 0 / 1 | 64 | ResourceId::230 / 0 | [bin](/scene-capture-comparison/muou/e11287_vs_s0_b1.bin) |
| cbuffer2 | 0 / 2 | 336 | ResourceId::231 / 0 | [bin](/scene-capture-comparison/muou/e11287_vs_s0_b2.bin) |

#### PS · Hidden/Internal-SSAO

[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_24928.ps.txt), SHA-256 `07adf6ac9eba0bf4a8e0c6a02361b64498298d950e22d5cabf4ba84447ef901c`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|
| reads | 0 / 0 | texture0 | ResourceId::64886 · TempBuffer 148 1720x720 | 1720 × 720 × 1，array=1，mips=1，R32_TYPELESS |
| reads | 0 / 1 | texture1 | ResourceId::64879 · TempBuffer 147 1720x720 | 1720 × 720 × 1，array=1，mips=1，R10G10B10A2_TYPELESS |
| reads | 0 / 2 | texture2 | ResourceId::171 · PointOnSphere | 4 × 4 × 1，array=1，mips=1，R8G8B8A8_UNORM |

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| cbuffer0 | 0 / 0 | 144 | ResourceId::24927 / 0 | [bin](/scene-capture-comparison/muou/e11287_ps_s0_b0.bin) |
| cbuffer1 | 0 / 1 | 112 | ResourceId::24508 / 0 | [bin](/scene-capture-comparison/muou/e11287_ps_s0_b1.bin) |

### e20451

ID3D11DeviceContext::Dispatch()；indices=0，instances=0，dispatch=[80, 34, 1]。

#### CS · ComputeShader-20780

[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_508.cs.txt), SHA-256 `219f1d3048be035ef07e5d431d680aabc1fb8e5c1b0577e1ac2ad395631699d1`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|
| reads | 0 / 0 | structuredbuffer0 | ResourceId::61464 · Buffer-4-32768 | 32768 bytes buffer |
| reads | 0 / 1 | structuredbuffer1 | ResourceId::61473 · Buffer-4-65536 | 65536 bytes buffer |
| reads | 0 / 2 | structuredbuffer2 | ResourceId::24749 · Buffer-4-65536 | 65536 bytes buffer |
| reads | 0 / 3 | texture3 | ResourceId::64952 · TempBuffer 151 1024x512 | 1024 × 512 × 1，array=1，mips=11，R32_TYPELESS |
| reads | 0 / 4 | texture4 | ResourceId::64898 · TempBuffer 150 2048x1024 | 2048 × 1024 × 1，array=1，mips=12，R16_TYPELESS |
| reads | 0 / 5 | texture5 | ResourceId::52 · ClusterDeferredFarPlanes | 16 × 1 × 1，array=1，mips=1，R32_FLOAT |
| writes | 0 / 0 | uav0 | ResourceId::61935 · Buffer-4-16711680 | 16711680 bytes buffer |
| writes | 0 / 1 | uav1 | ResourceId::65056 · TempBuffer 157 80x34 | 80 × 34 × 32，array=1，mips=1，R32_TYPELESS |
| writes | 0 / 2 | uav2 | ResourceId::65125 · TempBuffer 158 80x34 | 80 × 34 × 16，array=1，mips=1，R32_TYPELESS |

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| cbuffer0 | 0 / 0 | 144 | ResourceId::512 / 0 | [bin](/scene-capture-comparison/muou/e20451_cs_s0_b0.bin) |
| cbuffer1 | 0 / 1 | 256 | ResourceId::513 / 0 | [bin](/scene-capture-comparison/muou/e20451_cs_s0_b1.bin) |

### e20861

ID3D11DeviceContext::Dispatch()；indices=0，instances=0，dispatch=[48, 8, 8]。

#### CS · ComputeShader-4656

[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_594.cs.txt), SHA-256 `2575da6b3d0037bb7485a665bf4efe8c251c124fbbddeb727ff38d1720ce8b6c`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|
| reads | 0 / 0 | structuredbuffer0 | ResourceId::70577 · Buffer-4-288 | 288 bytes buffer |
| reads | 0 / 1 | texture1 | ResourceId::70592 · TempBuffer 228 192x32 | 192 × 32 × 32，array=1，mips=1，R32_TYPELESS |
| writes | 0 / 0 | uav0 | ResourceId::70487 · TempBuffer 227 192x32 | 192 × 32 × 32，array=1，mips=1，R32_TYPELESS |
| writes | 0 / 1 | uav1 | ResourceId::70661 · Buffer-4-28 | 28 bytes buffer |
| writes | 0 / 2 | uav2 | ResourceId::70664 · Buffer-4-262144 | 262144 bytes buffer |
| writes | 0 / 3 | uav3 | ResourceId::70565 · Buffer-4-16 | 16 bytes buffer |
| writes | 0 / 4 | uav4 | ResourceId::70667 · Buffer-4-131072 | 131072 bytes buffer |

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| cbuffer0 | 0 / 0 | 3504 | ResourceId::653 / 0 | [bin](/scene-capture-comparison/muou/e20861_cs_s0_b0.bin) |

### e21291

ID3D11DeviceContext::Dispatch()；indices=0，instances=0，dispatch=[108, 45, 1]。

#### CS · ComputeShader-92044

[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_406.cs.txt), SHA-256 `fc4b1cf9bc770842dbcdc753bb01296d6e7e8d8737d61d91eb1be4d833a65418`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|
| reads | 0 / 0 | texture0 | ResourceId::72165 · TempBuffer 245 1720x720 | 1720 × 720 × 1，array=1，mips=1，R16_TYPELESS |
| reads | 0 / 1 | texture1 | ResourceId::70783 · TempBuffer 231 1720x720 | 1720 × 720 × 1，array=1，mips=1，R10G10B10A2_TYPELESS |
| reads | 0 / 2 | structuredbuffer2 | ResourceId::70577 · Buffer-4-288 | 288 bytes buffer |
| reads | 0 / 3 | structuredbuffer3 | ResourceId::70562 · Buffer-4-131072 | 131072 bytes buffer |
| reads | 0 / 4 | structuredbuffer4 | ResourceId::70556 · Buffer-4-1835008 | 1835008 bytes buffer |
| reads | 0 / 5 | texture5 | ResourceId::72170 · TempBuffer 246 860x360 | 860 × 360 × 1，array=1，mips=1，R8G8B8A8_TYPELESS |
| reads | 0 / 6 | texture6 | ResourceId::64545 · TempBuffer 141 3440x1440 | 3440 × 1440 × 1，array=1，mips=1，R8_TYPELESS |
| reads | 0 / 7 | texture7 | ResourceId::65162 · TempBuffer 159 860x360 | 860 × 360 × 1，array=1，mips=1，R8_TYPELESS |
| reads | 0 / 8 | texture8 | ResourceId::70778 · TempBuffer 230 1720x720 | 1720 × 720 × 1，array=1，mips=1，R16_TYPELESS |
| writes | 0 / 0 | uav0 | ResourceId::70487 · TempBuffer 227 192x32 | 192 × 32 × 32，array=1，mips=1，R32_TYPELESS |
| writes | 0 / 1 | uav1 | ResourceId::70803 · TempBuffer 235 860x360 | 860 × 360 × 1，array=1，mips=1，R11G11B10_FLOAT |
| writes | 0 / 2 | uav2 | ResourceId::65167 · TempBuffer 160 860x360 | 860 × 360 × 1，array=1，mips=1，R8_TYPELESS |

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| cbuffer0 | 0 / 0 | 880 | ResourceId::434 / 0 | [bin](/scene-capture-comparison/muou/e21291_cs_s0_b0.bin) |

### e21453

ID3D11DeviceContext::Draw()；indices=3，instances=0，dispatch=[0, 0, 0]。

| 附件 | ResourceId | 底层尺寸与格式 |
|---|---|---|
| RT0 | ResourceId::61069 | 3440 × 1440 × 1，array=1，mips=1，R11G11B10_FLOAT |
| Depth | ResourceId::61073 | 3440 × 1440 × 1，array=1，mips=1，D32S8_TYPELESS |

Viewport：`{'enabled': True, 'height': 1440.0, 'maxDepth': 1.0, 'minDepth': 0.0, 'width': 3440.0, 'x': 0.0, 'y': 0.0}`；depth state：`{'depthBounds': False, 'depthEnable': True, 'depthFunction': 5, 'depthWrites': False, 'maxDepthBounds': 0.0, 'minDepthBounds': 0.0}`；stencil=True，front ref=128，mask=220。

#### VS · Hidden/DeferredReflections

[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_25115.vs.txt), SHA-256 `728c34a6a2eb3d3529f90cab82627f5b616c767f04a457660a12d2dd7274f9e9`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| cbuffer0 | 0 / 0 | 128 | ResourceId::24508 / 0 | [bin](/scene-capture-comparison/muou/e21453_vs_s0_b0.bin) |
| cbuffer1 | 0 / 1 | 64 | ResourceId::230 / 0 | [bin](/scene-capture-comparison/muou/e21453_vs_s0_b1.bin) |
| cbuffer2 | 0 / 2 | 336 | ResourceId::231 / 0 | [bin](/scene-capture-comparison/muou/e21453_vs_s0_b2.bin) |

#### PS · Hidden/Internal-DeferredShading

[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_40718.ps.txt), SHA-256 `1bea6ec4dd79ef3aaedaf562b3d8c75e0fb4f38f74bf0e32ced733ff269200d4`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|
| reads | 0 / 0 | texture0 | ResourceId::64875 · TempBuffer 146 3440x1440 | 3440 × 1440 × 1，array=1，mips=1，D32S8_TYPELESS |
| reads | 0 / 1 | texture1 | ResourceId::64992 · TempBuffer 153 3440x1440 | 3440 × 1440 × 1，array=1，mips=1，R8G8_TYPELESS |
| reads | 0 / 2 | texture2 | ResourceId::61402 · Auto_Exposure_1 | 1 × 1 × 1，array=1，mips=1，R32G32B32A32_TYPELESS |
| reads | 0 / 3 | texture3 | ResourceId::184 · EnvBRDF | 16 × 16 × 1，array=1，mips=1，R16G16B16A16_FLOAT |
| reads | 0 / 4 | texture4 | ResourceId::64533 · TempBuffer 138 3440x1440 | 3440 × 1440 × 1，array=1，mips=1，R10G10B10A2_TYPELESS |
| reads | 0 / 5 | texture5 | ResourceId::64537 · TempBuffer 139 3440x1440 | 3440 × 1440 × 1，array=1，mips=1，R8G8B8A8_TYPELESS |
| reads | 0 / 6 | texture6 | ResourceId::64541 · TempBuffer 140 3440x1440 | 3440 × 1440 × 1，array=1，mips=1，R8G8B8A8_TYPELESS |
| reads | 0 / 7 | texture7 | ResourceId::64545 · TempBuffer 141 3440x1440 | 3440 × 1440 × 1，array=1，mips=1，R8_TYPELESS |
| reads | 0 / 8 | texture8 | ResourceId::64553 · TempBuffer 143 3440x1440 | 3440 × 1440 × 1，array=1，mips=1，R8_TYPELESS |
| reads | 0 / 9 | texture9 | ResourceId::65192 · TempBuffer 164 3440x1440 | 3440 × 1440 × 1，array=1，mips=1，R11G11B10_FLOAT |
| reads | 0 / 10 | texture10 | ResourceId::65167 · TempBuffer 160 860x360 | 860 × 360 × 1，array=1，mips=1，R8_TYPELESS |
| reads | 0 / 11 | texture11 | ResourceId::65196 · TempBuffer 165 3440x1440 | 3440 × 1440 × 1，array=1，mips=1，R11G11B10_FLOAT |
| reads | 0 / 12 | structuredbuffer12 | ResourceId::61467 · Buffer-4-65536 | 65536 bytes buffer |
| reads | 0 / 13 | structuredbuffer13 | ResourceId::61470 · Buffer-4-81920 | 81920 bytes buffer |
| reads | 0 / 14 | structuredbuffer14 | ResourceId::61476 · Buffer-4-81920 | 81920 bytes buffer |
| reads | 0 / 15 | structuredbuffer15 | ResourceId::61479 · Buffer-4-114688 | 114688 bytes buffer |
| reads | 0 / 16 | structuredbuffer16 | ResourceId::24749 · Buffer-4-65536 | 65536 bytes buffer |
| reads | 0 / 17 | texture17 | ResourceId::61536 · LocalLight attenuation texture array | 1024 × 1 × 1，array=32，mips=1，R16_TYPELESS |
| reads | 0 / 18 | texture18 | ResourceId::61616 · PointLight projection texture array | 256 × 256 × 1，array=24，mips=1，R8G8B8A8_TYPELESS |
| reads | 0 / 19 | texture19 | ResourceId::61605 · SpotLight projection texture array | 1024 × 1024 × 1，array=3，mips=1，R8G8B8A8_TYPELESS |
| reads | 0 / 20 | texture20 | ResourceId::61629 · SpotLight ShadowMap texture | 2048 × 2048 × 1，array=4，mips=1，R16_TYPELESS |
| reads | 0 / 21 | texture21 | ResourceId::61641 · PointLight ShadowMap texture | 6144 × 1024 × 1，array=4，mips=1，R16_TYPELESS |
| reads | 0 / 22 | structuredbuffer22 | ResourceId::61935 · Buffer-4-16711680 | 16711680 bytes buffer |
| reads | 0 / 23 | texture23 | ResourceId::65125 · TempBuffer 158 80x34 | 80 × 34 × 16，array=1，mips=1，R32_TYPELESS |
| reads | 0 / 24 | texture24 | ResourceId::54674 · Eff_CloudShadow_ClearSky02 | 256 × 256 × 1，array=1，mips=1，BC7_SRGB |
| reads | 0 / 25 | texture25 | ResourceId::41 · UnityWhite | 4 × 4 × 1，array=1，mips=1，R8G8B8A8_SRGB |
| reads | 0 / 26 | texture26 | ResourceId::64997 · TempBuffer 154 1720x720 | 1720 × 720 × 1，array=1，mips=1，R8_TYPELESS |
| reads | 0 / 27 | texture27 | ResourceId::41 · UnityWhite | 4 × 4 × 1，array=1，mips=1，R8G8B8A8_SRGB |
| reads | 0 / 28 | texture28 | ResourceId::65052 · TempBuffer 156 1720x720 | 1720 × 720 × 1，array=1，mips=1，R16_TYPELESS |
| reads | 0 / 29 | texture29 | ResourceId::65048 · TempBuffer 155 1720x720 | 1720 × 720 × 1，array=1，mips=1，R8_TYPELESS |

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| cbuffer0 | 0 / 0 | 3184 | ResourceId::25137 / 0 | [bin](/scene-capture-comparison/muou/e21453_ps_s0_b0.bin) |
| cbuffer1 | 0 / 1 | 176 | ResourceId::24508 / 0 | [bin](/scene-capture-comparison/muou/e21453_ps_s0_b1.bin) |
| cbuffer2 | 0 / 2 | 288 | ResourceId::25056 / 0 | [bin](/scene-capture-comparison/muou/e21453_ps_s0_b2.bin) |
| cbuffer3 | 0 / 3 | 16 | ResourceId::228 / 0 | [bin](/scene-capture-comparison/muou/e21453_ps_s0_b3.bin) |
| cbuffer4 | 0 / 4 | 768 | ResourceId::229 / 0 | [bin](/scene-capture-comparison/muou/e21453_ps_s0_b4.bin) |

### e21621

ID3D11DeviceContext::Draw()；indices=3，instances=0，dispatch=[0, 0, 0]。

| 附件 | ResourceId | 底层尺寸与格式 |
|---|---|---|
| RT0 | ResourceId::61069 | 3440 × 1440 × 1，array=1，mips=1，R11G11B10_FLOAT |
| RT1 | ResourceId::65271 | 3440 × 1440 × 1，array=1，mips=1，R32_TYPELESS |
| Depth | ResourceId::61073 | 3440 × 1440 × 1，array=1，mips=1，D32S8_TYPELESS |

Viewport：`{'enabled': True, 'height': 1440.0, 'maxDepth': 1.0, 'minDepth': 0.0, 'width': 3440.0, 'x': 0.0, 'y': 0.0}`；depth state：`{'depthBounds': False, 'depthEnable': True, 'depthFunction': 5, 'depthWrites': False, 'maxDepthBounds': 0.0, 'minDepthBounds': 0.0}`；stencil=True，front ref=152，mask=156。

#### VS · Hidden/DeferredReflections

[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_25115.vs.txt), SHA-256 `728c34a6a2eb3d3529f90cab82627f5b616c767f04a457660a12d2dd7274f9e9`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| cbuffer0 | 0 / 0 | 128 | ResourceId::24508 / 0 | [bin](/scene-capture-comparison/muou/e21621_vs_s0_b0.bin) |
| cbuffer1 | 0 / 1 | 64 | ResourceId::230 / 0 | [bin](/scene-capture-comparison/muou/e21621_vs_s0_b1.bin) |
| cbuffer2 | 0 / 2 | 336 | ResourceId::231 / 0 | [bin](/scene-capture-comparison/muou/e21621_vs_s0_b2.bin) |

#### PS · Hidden/Internal-DeferredShading

[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_65019.ps.txt), SHA-256 `2830a06b72e33a0deb49ffd2b3672904918a5445073c32d45a4b83653d835356`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|
| reads | 0 / 0 | texture0 | ResourceId::64875 · TempBuffer 146 3440x1440 | 3440 × 1440 × 1，array=1，mips=1，D32S8_TYPELESS |
| reads | 0 / 1 | texture1 | ResourceId::64992 · TempBuffer 153 3440x1440 | 3440 × 1440 × 1，array=1，mips=1，R8G8_TYPELESS |
| reads | 0 / 2 | texture2 | ResourceId::64533 · TempBuffer 138 3440x1440 | 3440 × 1440 × 1，array=1，mips=1，R10G10B10A2_TYPELESS |
| reads | 0 / 3 | texture3 | ResourceId::64537 · TempBuffer 139 3440x1440 | 3440 × 1440 × 1，array=1，mips=1，R8G8B8A8_TYPELESS |
| reads | 0 / 4 | texture4 | ResourceId::64541 · TempBuffer 140 3440x1440 | 3440 × 1440 × 1，array=1，mips=1，R8G8B8A8_TYPELESS |
| reads | 0 / 5 | texture5 | ResourceId::64553 · TempBuffer 143 3440x1440 | 3440 × 1440 × 1，array=1，mips=1，R8_TYPELESS |
| reads | 0 / 6 | texture6 | ResourceId::64549 · TempBuffer 142 3440x1440 | 3440 × 1440 × 1，array=1，mips=1，R8_TYPELESS |
| reads | 0 / 7 | texture7 | ResourceId::65196 · TempBuffer 165 3440x1440 | 3440 × 1440 × 1，array=1，mips=1，R11G11B10_FLOAT |
| reads | 0 / 8 | structuredbuffer8 | ResourceId::61467 · Buffer-4-65536 | 65536 bytes buffer |
| reads | 0 / 9 | structuredbuffer9 | ResourceId::61470 · Buffer-4-81920 | 81920 bytes buffer |
| reads | 0 / 10 | structuredbuffer10 | ResourceId::61476 · Buffer-4-81920 | 81920 bytes buffer |
| reads | 0 / 11 | structuredbuffer11 | ResourceId::61479 · Buffer-4-114688 | 114688 bytes buffer |
| reads | 0 / 12 | structuredbuffer12 | ResourceId::24749 · Buffer-4-65536 | 65536 bytes buffer |
| reads | 0 / 13 | texture13 | ResourceId::61536 · LocalLight attenuation texture array | 1024 × 1 × 1，array=32，mips=1，R16_TYPELESS |
| reads | 0 / 14 | texture14 | ResourceId::61616 · PointLight projection texture array | 256 × 256 × 1，array=24，mips=1，R8G8B8A8_TYPELESS |
| reads | 0 / 15 | texture15 | ResourceId::61605 · SpotLight projection texture array | 1024 × 1024 × 1，array=3，mips=1，R8G8B8A8_TYPELESS |
| reads | 0 / 16 | texture16 | ResourceId::61629 · SpotLight ShadowMap texture | 2048 × 2048 × 1，array=4，mips=1，R16_TYPELESS |
| reads | 0 / 17 | texture17 | ResourceId::61641 · PointLight ShadowMap texture | 6144 × 1024 × 1，array=4，mips=1，R16_TYPELESS |
| reads | 0 / 18 | structuredbuffer18 | ResourceId::61935 · Buffer-4-16711680 | 16711680 bytes buffer |
| reads | 0 / 19 | texture19 | ResourceId::65125 · TempBuffer 158 80x34 | 80 × 34 × 16，array=1，mips=1，R32_TYPELESS |
| reads | 0 / 20 | texture20 | ResourceId::54674 · Eff_CloudShadow_ClearSky02 | 256 × 256 × 1，array=1，mips=1，BC7_SRGB |
| reads | 0 / 21 | texture21 | ResourceId::41 · UnityWhite | 4 × 4 × 1，array=1，mips=1，R8G8B8A8_SRGB |
| reads | 0 / 22 | texture22 | ResourceId::41 · UnityWhite | 4 × 4 × 1，array=1，mips=1，R8G8B8A8_SRGB |
| reads | 0 / 23 | texture23 | ResourceId::65052 · TempBuffer 156 1720x720 | 1720 × 720 × 1，array=1，mips=1，R16_TYPELESS |
| reads | 0 / 24 | texture24 | ResourceId::65048 · TempBuffer 155 1720x720 | 1720 × 720 × 1，array=1，mips=1，R8_TYPELESS |

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| cbuffer0 | 0 / 0 | 3888 | ResourceId::25142 / 0 | [bin](/scene-capture-comparison/muou/e21621_ps_s0_b0.bin) |
| cbuffer1 | 0 / 1 | 176 | ResourceId::24508 / 0 | [bin](/scene-capture-comparison/muou/e21621_ps_s0_b1.bin) |
| cbuffer2 | 0 / 2 | 288 | ResourceId::25056 / 0 | [bin](/scene-capture-comparison/muou/e21621_ps_s0_b2.bin) |
| cbuffer3 | 0 / 3 | 16 | ResourceId::228 / 0 | [bin](/scene-capture-comparison/muou/e21621_ps_s0_b3.bin) |
| cbuffer4 | 0 / 4 | 768 | ResourceId::229 / 0 | [bin](/scene-capture-comparison/muou/e21621_ps_s0_b4.bin) |
| cbuffer5 | 0 / 5 | 480 | ResourceId::37451 / 0 | [bin](/scene-capture-comparison/muou/e21621_ps_s0_b5.bin) |

### e22288

DispatchIndirect(<21760, 1, 1>)；indices=0，instances=0，dispatch=[21760, 1, 1]。

#### CS · ComputeShader-18704

[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_908.cs.txt), SHA-256 `04204bf393c09cd142e8e88d1863bd4f88aa014308230386b0204a0a6b8e3c4e`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|
| reads | 0 / 0 | structuredbuffer0 | ResourceId::61467 · Buffer-4-65536 | 65536 bytes buffer |
| reads | 0 / 1 | structuredbuffer1 | ResourceId::61470 · Buffer-4-81920 | 81920 bytes buffer |
| reads | 0 / 2 | structuredbuffer2 | ResourceId::61476 · Buffer-4-81920 | 81920 bytes buffer |
| reads | 0 / 3 | structuredbuffer3 | ResourceId::61479 · Buffer-4-114688 | 114688 bytes buffer |
| reads | 0 / 4 | structuredbuffer4 | ResourceId::24749 · Buffer-4-65536 | 65536 bytes buffer |
| reads | 0 / 5 | texture5 | ResourceId::61536 · LocalLight attenuation texture array | 1024 × 1 × 1，array=32，mips=1，R16_TYPELESS |
| reads | 0 / 6 | texture6 | ResourceId::61616 · PointLight projection texture array | 256 × 256 × 1，array=24，mips=1，R8G8B8A8_TYPELESS |
| reads | 0 / 7 | texture7 | ResourceId::61605 · SpotLight projection texture array | 1024 × 1024 × 1，array=3，mips=1，R8G8B8A8_TYPELESS |
| reads | 0 / 8 | texture8 | ResourceId::65015 · TempBuffer 145 4096x2048 | 4096 × 2048 × 1，array=1，mips=1，R16_TYPELESS |
| reads | 0 / 9 | texture9 | ResourceId::112 · FogMap Texture | 384 × 384 × 1，array=1，mips=1，BC7_UNORM |
| reads | 0 / 10 | texture10 | ResourceId::178 · BlueNoise | 64 × 64 × 1，array=1，mips=1，BC7_UNORM |
| reads | 0 / 11 | texture11 | ResourceId::70811 · TempBuffer 236 160x68 | 160 × 68 × 128，array=1，mips=1，R16G16B16A16_TYPELESS |
| reads | 0 / 12 | texture12 | ResourceId::71333 · TempBuffer 238 160x68 | 160 × 68 × 128，array=1，mips=1，R11G11B10_FLOAT |
| reads | 0 / 13 | texture13 | ResourceId::71072 · TempBuffer 237 160x68 | 160 × 68 × 128，array=1，mips=1，R11G11B10_FLOAT |
| reads | 0 / 14 | structuredbuffer14 | ResourceId::61935 · Buffer-4-16711680 | 16711680 bytes buffer |
| reads | 0 / 15 | texture15 | ResourceId::65056 · TempBuffer 157 80x34 | 80 × 34 × 32，array=1，mips=1，R32_TYPELESS |
| reads | 0 / 16 | texture16 | ResourceId::192 · Stages_3DNoise_32 | 32 × 32 × 32，array=1，mips=1，R8G8B8A8_UNORM |
| reads | 0 / 17 | structuredbuffer17 | ResourceId::66603 · Buffer-4-4096 | 4096 bytes buffer |
| reads | 0 / 18 | structuredbuffer18 | ResourceId::66612 · Buffer-4-522240 | 522240 bytes buffer |
| writes | 0 / 0 | uav0 | ResourceId::66627 · TempBuffer 178 160x68 | 160 × 68 × 128，array=1，mips=1，R16G16B16A16_TYPELESS |
| writes | 0 / 1 | uav1 | ResourceId::67149 · TempBuffer 180 160x68 | 160 × 68 × 128，array=1，mips=1，R11G11B10_FLOAT |
| writes | 0 / 2 | uav2 | ResourceId::66888 · TempBuffer 179 160x68 | 160 × 68 × 128，array=1，mips=1，R11G11B10_FLOAT |
| writes | 0 / 3 | uav3 | ResourceId::66615 · Buffer-4-2785280 | 2785280 bytes buffer |
| writes | 0 / 4 | uav4 | ResourceId::66606 · Buffer-4-16 | 16 bytes buffer |

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| cbuffer0 | 0 / 0 | 240 | ResourceId::920 / 0 | [bin](/scene-capture-comparison/muou/e22288_cs_s0_b0.bin) |
| cbuffer1 | 0 / 1 | 112 | ResourceId::922 / 0 | [bin](/scene-capture-comparison/muou/e22288_cs_s0_b1.bin) |
| cbuffer2 | 0 / 2 | 16 | ResourceId::923 / 0 | [bin](/scene-capture-comparison/muou/e22288_cs_s0_b2.bin) |
| cbuffer3 | 0 / 3 | 912 | ResourceId::924 / 0 | [bin](/scene-capture-comparison/muou/e22288_cs_s0_b3.bin) |
| cbuffer4 | 0 / 4 | 304 | ResourceId::921 / 0 | [bin](/scene-capture-comparison/muou/e22288_cs_s0_b4.bin) |

### e25302

ID3D11DeviceContext::DrawIndexed()；indices=3，instances=0，dispatch=[0, 0, 0]。

| 附件 | ResourceId | 底层尺寸与格式 |
|---|---|---|
| RT0 | ResourceId::67582 | 3440 × 1440 × 1，array=1，mips=1，R8G8B8A8_TYPELESS |
| Depth | ResourceId::0 | — |

Viewport：`{'enabled': True, 'height': 1440.0, 'maxDepth': 1.0, 'minDepth': 0.0, 'width': 3440.0, 'x': 0.0, 'y': 0.0}`；depth state：`{'depthBounds': False, 'depthEnable': True, 'depthFunction': 1, 'depthWrites': False, 'maxDepthBounds': 0.0, 'minDepthBounds': 0.0}`；stencil=False，front ref=0，mask=255。

#### VS · Hidden/PostProcessing/Copy

[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_26243.vs.txt), SHA-256 `ecfa31b3849f7e9c137ca62045bc919ffa73ccc2124d9d36524485cd3bac7db3`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|

#### PS · Hidden/PostProcessing/Uber

[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_43472.ps.txt), SHA-256 `e24fe325efeb06f9c594c16269a2894ea60a69f5a4c2e68232929c2a5ff70c51`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|
| reads | 0 / 0 | texture0 | ResourceId::61069 · InnerTarget of MainCamera(Clone) | 3440 × 1440 × 1，array=1，mips=1，R11G11B10_FLOAT |
| reads | 0 / 1 | texture1 | ResourceId::67586 · Half Color Buffer | 1720 × 720 × 1，array=1，mips=1，R11G11B10_FLOAT |
| reads | 0 / 2 | texture2 | ResourceId::67590 · Half Alpha Buffer | 1720 × 720 × 1，array=1，mips=1，R8_TYPELESS |
| reads | 0 / 3 | texture3 | ResourceId::67614 · _MHYBloomTex | 860 × 360 × 1，array=1，mips=1，R11G11B10_FLOAT |
| reads | 0 / 4 | texture4 | ResourceId::67618 · UnderWaterScreenParaRT | 860 × 360 × 1，array=1，mips=1，R8_TYPELESS |
| reads | 0 / 5 | texture5 | ResourceId::47 · UnityBlack3D | 1 × 1 × 1，array=1，mips=1，R8G8B8A8_UNORM |
| reads | 0 / 6 | texture6 | ResourceId::43 · UnityBlack | 4 × 4 × 1，array=1，mips=1，R8G8B8A8_SRGB |
| reads | 0 / 7 | texture7 | ResourceId::61402 · Auto_Exposure_1 | 1 × 1 × 1，array=1，mips=1，R32G32B32A32_TYPELESS |

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| cbuffer0 | 0 / 0 | 1696 | ResourceId::35225 / 0 | [bin](/scene-capture-comparison/muou/e25302_ps_s0_b0.bin) |

### e25325

ID3D11DeviceContext::DrawIndexed()；indices=3，instances=0，dispatch=[0, 0, 0]。

| 附件 | ResourceId | 底层尺寸与格式 |
|---|---|---|
| RT0 | ResourceId::67622 | 3440 × 1440 × 1，array=1，mips=1，R8G8_TYPELESS |
| Depth | ResourceId::61073 | 3440 × 1440 × 1，array=1，mips=1，D32S8_TYPELESS |

Viewport：`{'enabled': True, 'height': 1440.0, 'maxDepth': 1.0, 'minDepth': 0.0, 'width': 3440.0, 'x': 0.0, 'y': 0.0}`；depth state：`{'depthBounds': False, 'depthEnable': True, 'depthFunction': 1, 'depthWrites': False, 'maxDepthBounds': 0.0, 'minDepthBounds': 0.0}`；stencil=True，front ref=1，mask=255。

#### VS · Hidden/PostProcessing/FSR2.0

[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_26297.vs.txt), SHA-256 `ff2a1c2358cfd1ae61d06ac2bc18c52547b4d1dd016ac28336730513f9397e57`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| cbuffer0 | 0 / 0 | 432 | ResourceId::25133 / 0 | [bin](/scene-capture-comparison/muou/e25325_vs_s0_b0.bin) |

#### PS · Hidden/PostProcessing/FSR2.0

[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_26298.ps.txt), SHA-256 `b028d01fc9690f257999678fb9180a0212f52014df8679c2388aa057eadcd1db`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|
| reads | 0 / 0 | texture0 | ResourceId::67582 · Context Medium Buffer 1 | 3440 × 1440 × 1，array=1，mips=1，R8G8B8A8_TYPELESS |
| reads | 0 / 1 | texture1 | ResourceId::64545 · TempBuffer 141 3440x1440 | 3440 × 1440 × 1，array=1，mips=1，R8_TYPELESS |

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|

### e25339

ID3D11DeviceContext::DrawIndexed()；indices=3，instances=0，dispatch=[0, 0, 0]。

| 附件 | ResourceId | 底层尺寸与格式 |
|---|---|---|
| RT0 | ResourceId::67626 | 3440 × 1440 × 1，array=1，mips=1，R8G8B8A8_TYPELESS |
| Depth | ResourceId::61073 | 3440 × 1440 × 1，array=1，mips=1，D32S8_TYPELESS |

Viewport：`{'enabled': True, 'height': 1440.0, 'maxDepth': 1.0, 'minDepth': 0.0, 'width': 3440.0, 'x': 0.0, 'y': 0.0}`；depth state：`{'depthBounds': False, 'depthEnable': True, 'depthFunction': 1, 'depthWrites': False, 'maxDepthBounds': 0.0, 'minDepthBounds': 0.0}`；stencil=True，front ref=1，mask=255。

#### VS · Hidden/PostProcessing/FSR2.0

[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_26304.vs.txt), SHA-256 `47e0d4ed8d40f0a5275353c809b2c685d6d73ba4eb0397cfee1e34f135bd65e8`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| cbuffer0 | 0 / 0 | 432 | ResourceId::25133 / 0 | [bin](/scene-capture-comparison/muou/e25339_vs_s0_b0.bin) |

#### PS · Hidden/PostProcessing/FSR2.0

[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_26305.ps.txt), SHA-256 `5b7b07720b73354cf3686de18f2f98dbb01551c119c45dc5a31b44325d868ef0`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|
| reads | 0 / 0 | texture0 | ResourceId::67622 · TempBuffer 199 3440x1440 | 3440 × 1440 × 1，array=1，mips=1，R8G8_TYPELESS |
| reads | 0 / 1 | texture1 | ResourceId::24165 · AreaTex | 160 × 560 × 1，array=1，mips=1，R8G8B8A8_UNORM |
| reads | 0 / 2 | texture2 | ResourceId::24177 · SearchTex | 64 × 16 × 1，array=1，mips=1，A8_UNORM |

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| cbuffer0 | 0 / 0 | 432 | ResourceId::25133 / 0 | [bin](/scene-capture-comparison/muou/e25339_ps_s0_b0.bin) |

### e25352

ID3D11DeviceContext::DrawIndexed()；indices=3，instances=0，dispatch=[0, 0, 0]。

| 附件 | ResourceId | 底层尺寸与格式 |
|---|---|---|
| RT0 | ResourceId::67630 | 3440 × 1440 × 1，array=1，mips=1，R8G8B8A8_TYPELESS |
| Depth | ResourceId::61073 | 3440 × 1440 × 1，array=1，mips=1，D32S8_TYPELESS |

Viewport：`{'enabled': True, 'height': 1440.0, 'maxDepth': 1.0, 'minDepth': 0.0, 'width': 3440.0, 'x': 0.0, 'y': 0.0}`；depth state：`{'depthBounds': False, 'depthEnable': True, 'depthFunction': 1, 'depthWrites': False, 'maxDepthBounds': 0.0, 'minDepthBounds': 0.0}`；stencil=True，front ref=1，mask=255。

#### VS · Hidden/PostProcessing/FSR2.0

[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_26311.vs.txt), SHA-256 `ef575aa2e348beb7733c66e37bd015e5e84856cf9b620dd9ba1ae9ca2db493f9`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| cbuffer0 | 0 / 0 | 432 | ResourceId::25133 / 0 | [bin](/scene-capture-comparison/muou/e25352_vs_s0_b0.bin) |

#### PS · Hidden/PostProcessing/FSR2.0

[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_26312.ps.txt), SHA-256 `1041b3a252702f552618bc0b615220a45926f3566c4851ab8c601829413ba673`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|
| reads | 0 / 0 | texture0 | ResourceId::67582 · Context Medium Buffer 1 | 3440 × 1440 × 1，array=1，mips=1，R8G8B8A8_TYPELESS |
| reads | 0 / 1 | texture1 | ResourceId::67626 · TempBuffer 200 3440x1440 | 3440 × 1440 × 1，array=1，mips=1，R8G8B8A8_TYPELESS |
| reads | 0 / 2 | texture2 | ResourceId::67622 · TempBuffer 199 3440x1440 | 3440 × 1440 × 1，array=1，mips=1，R8G8_TYPELESS |

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| cbuffer0 | 0 / 0 | 432 | ResourceId::25133 / 0 | [bin](/scene-capture-comparison/muou/e25352_ps_s0_b0.bin) |

### e25362

ID3D11DeviceContext::DrawIndexed()；indices=3，instances=0，dispatch=[0, 0, 0]。

| 附件 | ResourceId | 底层尺寸与格式 |
|---|---|---|
| RT0 | ResourceId::67582 | 3440 × 1440 × 1，array=1，mips=1，R8G8B8A8_TYPELESS |
| Depth | ResourceId::61073 | 3440 × 1440 × 1，array=1，mips=1，D32S8_TYPELESS |

Viewport：`{'enabled': True, 'height': 1440.0, 'maxDepth': 1.0, 'minDepth': 0.0, 'width': 3440.0, 'x': 0.0, 'y': 0.0}`；depth state：`{'depthBounds': False, 'depthEnable': True, 'depthFunction': 1, 'depthWrites': False, 'maxDepthBounds': 0.0, 'minDepthBounds': 0.0}`；stencil=True，front ref=1，mask=255。

#### VS · Hidden/PostProcessing/FSR2.0

[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_26313.vs.txt), SHA-256 `ca57965167e8d44bf7206b42cab280827964f911103c0f8621619699444b136e`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|

#### PS · Hidden/PostProcessing/FSR2.0

[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_26314.ps.txt), SHA-256 `750abfbdc31f7d11e07701aac63f4f33f9b5a017afcad42132b85d38204b26bb`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|
| reads | 0 / 0 | texture0 | ResourceId::67630 · TempBuffer 201 3440x1440 | 3440 × 1440 × 1，array=1，mips=1，R8G8B8A8_TYPELESS |

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|

### e25381

ID3D11DeviceContext::DrawIndexed()；indices=3，instances=0，dispatch=[0, 0, 0]。

| 附件 | ResourceId | 底层尺寸与格式 |
|---|---|---|
| RT0 | ResourceId::61427 | 3440 × 1440 × 1，array=1，mips=1，R8G8_TYPELESS |
| RT1 | ResourceId::61437 | 3440 × 1440 × 1，array=1，mips=1，R8G8B8A8_TYPELESS |
| Depth | ResourceId::0 | — |

Viewport：`{'enabled': True, 'height': 1440.0, 'maxDepth': 1.0, 'minDepth': 0.0, 'width': 3440.0, 'x': 0.0, 'y': 0.0}`；depth state：`{'depthBounds': False, 'depthEnable': True, 'depthFunction': 1, 'depthWrites': False, 'maxDepthBounds': 0.0, 'minDepthBounds': 0.0}`；stencil=False，front ref=0，mask=255。

#### VS · Hidden/PostProcessing/FSR2.0

[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_26313.vs.txt), SHA-256 `ca57965167e8d44bf7206b42cab280827964f911103c0f8621619699444b136e`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|

#### PS · Hidden/PostProcessing/FSR2.0

[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_26316.ps.txt), SHA-256 `f8bfa576dc5289ce5885b7e3f7e08354c3fbc918e2f0c94d7afb09bc7c5a1157`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|
| reads | 0 / 0 | texture0 | ResourceId::67582 · Context Medium Buffer 1 | 3440 × 1440 × 1，array=1，mips=1，R8G8B8A8_TYPELESS |
| reads | 0 / 1 | texture1 | ResourceId::61442 · MaximumBias | 16 × 16 × 1，array=1，mips=1，R16_UNORM |
| reads | 0 / 2 | texture2 | ResourceId::64875 · TempBuffer 146 3440x1440 | 3440 × 1440 × 1，array=1，mips=1，D32S8_TYPELESS |
| reads | 0 / 3 | texture3 | ResourceId::64533 · TempBuffer 138 3440x1440 | 3440 × 1440 × 1，array=1，mips=1，R10G10B10A2_TYPELESS |
| reads | 0 / 4 | texture4 | ResourceId::64545 · TempBuffer 141 3440x1440 | 3440 × 1440 × 1，array=1，mips=1，R8_TYPELESS |
| reads | 0 / 5 | texture5 | ResourceId::61422 · HistoryStatus0 | 3440 × 1440 × 1，array=1，mips=1，R8G8_TYPELESS |
| reads | 0 / 6 | texture6 | ResourceId::61432 · HistoryColor0 | 3440 × 1440 × 1，array=1，mips=1，R8G8B8A8_TYPELESS |

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| cbuffer0 | 0 / 0 | 496 | ResourceId::26315 / 0 | [bin](/scene-capture-comparison/muou/e25381_ps_s0_b0.bin) |

### e25393

ID3D11DeviceContext::DrawIndexed()；indices=3，instances=0，dispatch=[0, 0, 0]。

| 附件 | ResourceId | 底层尺寸与格式 |
|---|---|---|
| RT0 | ResourceId::23686 | 3440 × 1440 × 1，array=1，mips=1，R8G8B8A8_SRGB |
| Depth | ResourceId::23690 | 3440 × 1440 × 1，array=1，mips=1，D32S8_TYPELESS |

Viewport：`{'enabled': True, 'height': 1440.0, 'maxDepth': 1.0, 'minDepth': 0.0, 'width': 3440.0, 'x': 0.0, 'y': 0.0}`；depth state：`{'depthBounds': False, 'depthEnable': True, 'depthFunction': 1, 'depthWrites': False, 'maxDepthBounds': 0.0, 'minDepthBounds': 0.0}`；stencil=False，front ref=0，mask=255。

#### VS · Hidden/PostProcessing/Copy

[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_26243.vs.txt), SHA-256 `ecfa31b3849f7e9c137ca62045bc919ffa73ccc2124d9d36524485cd3bac7db3`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|

#### PS · Hidden/PostProcessing/Copy

[反汇编](/scene-capture-comparison/muou/shaders/ResourceId_26244.ps.txt), SHA-256 `48d104189feca5ca676bd4596bf957a71f066809edb52192f8b50e12553f8505`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|
| reads | 0 / 0 | texture0 | ResourceId::61437 · HistoryColor1 | 3440 × 1440 × 1，array=1，mips=1，R8G8B8A8_TYPELESS |

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|

## 终末地场景

完整事件表：[events.tsv](/scene-capture-comparison/endfield/events.tsv)；机器可读绑定：[details.json](/scene-capture-comparison/endfield/details.json)。

### e2256

vkCmdDispatch()；indices=0，instances=0，dispatch=[40, 23, 128]。

#### CS · Shader Module 81825

[反汇编](/scene-capture-comparison/endfield/shaders/ResourceId_81825.cs.txt), SHA-256 `03d1b418c91546d53178846ceab091610b0d60c6b3f4ac799cd971a6d6ffab0e`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|
| reads | 0 / 1 | res22 | ResourceId::80918 · 2D Depth Attachment 80918 | 4096 × 4096 × 1，array=1，mips=1，D16 |
| reads | 0 / 2 | res23 | ResourceId::80927 · 2D Depth Attachment 80927 | 6144 × 4096 × 1，array=1，mips=1，D16 |
| reads | 0 / 3 | res24 | ResourceId::64289 · 2D Image 64289 | 1024 × 1024 × 1，array=1，mips=1，BC7_SRGB |
| reads | 0 / 4 | res25 | ResourceId::80921 · 2D Depth Attachment 80921 | 4096 × 4096 × 1，array=1，mips=1，D16 |
| reads | 0 / 5 | res27 | ResourceId::160 · 2D Image 160 | 4 × 4 × 1，array=1，mips=1，R8G8B8A8_SRGB |
| reads | 0 / 6 | res34 | ResourceId::116956 · 3D Image 116956 | 313 × 180 × 128，array=1，mips=1，R16G16B16A16_FLOAT |
| writes | 0 / 0 | res36 | ResourceId::121717 · 3D Image 121717 | 313 × 180 × 128，array=1，mips=1，R16G16B16A16_FLOAT |
| writes | 0 / 10 | ssbo14 | ResourceId::121815 · Buffer 121815 | 244592 bytes buffer |

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| uniforms5 | 1 / 0 | 1312 | ResourceId::387 / 277248 | [bin](/scene-capture-comparison/endfield/e2256_cs_s1_b0.bin) |
| uniforms7 | 1 / 1 | 3200 | ResourceId::387 / 278592 | [bin](/scene-capture-comparison/endfield/e2256_cs_s1_b1.bin) |
| uniforms17 | 1 / 2 | 48 | ResourceId::387 / 263040 | [bin](/scene-capture-comparison/endfield/e2256_cs_s1_b2.bin) |
| uniforms19 | 1 / 3 | 32864 | ResourceId::387 / 230144 | [bin](/scene-capture-comparison/endfield/e2256_cs_s1_b3.bin) |
| uniforms21 | 1 / 4 | 11440 | ResourceId::387 / 339008 | [bin](/scene-capture-comparison/endfield/e2256_cs_s1_b4.bin) |
| uniforms29 | 1 / 5 | 2560 | ResourceId::387 / 281792 | [bin](/scene-capture-comparison/endfield/e2256_cs_s1_b5.bin) |
| uniforms33 | 1 / 6 | 32 | ResourceId::387 / 263104 | [bin](/scene-capture-comparison/endfield/e2256_cs_s1_b6.bin) |
| uniforms38 | 1 / 7 | 480 | ResourceId::387 / 354112 | [bin](/scene-capture-comparison/endfield/e2256_cs_s1_b7.bin) |

### e4798

vkCmdDraw()；indices=3，instances=1，dispatch=[0, 0, 0]。

| 附件 | ResourceId | 底层尺寸与格式 |
|---|---|---|
| RT0 | ResourceId::121930 | 3440 × 1440 × 1，array=1，mips=1，R11G11B10_FLOAT |
| RT1 | ResourceId::121921 | 3440 × 1440 × 1，array=1，mips=1，R10G10B10A2_UNORM |
| RT2 | ResourceId::121918 | 3440 × 1440 × 1，array=1，mips=1，R10G10B10A2_UNORM |
| RT3 | ResourceId::121912 | 3440 × 1440 × 1，array=1，mips=1，R10G10B10A2_UNORM |
| RT4 | ResourceId::121915 | 3440 × 1440 × 1，array=1，mips=1，R8G8B8A8_SRGB |
| Depth | ResourceId::121886 | 3440 × 1440 × 1，array=1，mips=1，D32S8 |

Viewport：`{'enabled': True, 'height': 1440.0, 'maxDepth': 1.0, 'minDepth': 0.0, 'width': 3440.0, 'x': 0.0, 'y': 0.0}`；depth state：`{'depthBounds': False, 'depthEnable': True, 'depthFunction': 1, 'depthWrites': False, 'maxDepthBounds': 1.0, 'minDepthBounds': 0.0}`；stencil=True，front ref=128，mask=255。

#### VS · Shader Module 82094

[反汇编](/scene-capture-comparison/endfield/shaders/ResourceId_82094.vs.txt), SHA-256 `706041352d7ee93f2ce67b5403d91deefdf734f0e4896ddd64b7cad14ab34a33`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|

#### PS · Shader Module 82095

[反汇编](/scene-capture-comparison/endfield/shaders/ResourceId_82095.ps.txt), SHA-256 `90a55692ae1c285884e2ea2fa4d679a5730c48d91470847b9400d8ad5631b2c4`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|
| reads | 3 / 6 | res33 | ResourceId::65762 · 2D Image 65762 | 4224 × 2112 × 1，array=1，mips=1，BC3_SRGB |
| reads | 3 / 7 | res38 | ResourceId::121924 · 2D Color Attachment 121924 | 3440 × 1440 × 1，array=1，mips=1，R32_FLOAT |
| reads | 3 / 8 | res36 | ResourceId::65781 · 2D Array Image 65781 | 1024 × 1024 × 1，array=32，mips=11，BC7_SRGB |
| reads | 3 / 9 | res34 | ResourceId::64260 · 2D Image 64260 | 512 × 512 × 1，array=1，mips=1，R8G8B8A8_UNORM |
| reads | 3 / 10 | res32 | ResourceId::65768 · 2D Image 65768 | 4224 × 2112 × 1，array=1，mips=1，R8G8B8A8_UNORM |
| reads | 3 / 11 | res43 | ResourceId::80969 · 2D Image 80969 | 8192 × 8192 × 1，array=1，mips=1，BC3_UNORM |
| reads | 3 / 12 | res42 | ResourceId::80966 · 2D Image 80966 | 8192 × 8192 × 1，array=1，mips=1，BC5_UNORM |
| reads | 3 / 13 | res41 | ResourceId::80963 · 2D Image 80963 | 8192 × 8192 × 1，array=1，mips=1，BC5_UNORM |
| reads | 3 / 14 | res40 | ResourceId::80960 · 2D Image 80960 | 8192 × 8192 × 1，array=1，mips=1，BC3_SRGB |
| reads | 3 / 15 | res37 | ResourceId::65787 · 2D Array Image 65787 | 1024 × 1024 × 1，array=32，mips=11，BC7_UNORM |
| reads | 3 / 16 | res30 | ResourceId::65740 · 2D Image 65740 | 4224 × 2112 × 1，array=1，mips=1，BC3_UNORM |
| reads | 3 / 17 | res39 | ResourceId::80939 · 2D Color Attachment 80939 | 512 × 512 × 1，array=1，mips=9，R8G8B8A8_UNORM |
| reads | 3 / 18 | res47 | ResourceId::64272 · 2D Image 64272 | 256 × 256 × 1，array=1，mips=9，BC7_SRGB |
| reads | 3 / 19 | res48 | ResourceId::117288 · 2D Image 117288 | 256 × 256 × 1，array=1，mips=9，BC7_UNORM |
| reads | 3 / 20 | res35 | ResourceId::65777 · 2D Image 65777 | 1088 × 544 × 1，array=1，mips=1，R8G8_UNORM |
| reads | 3 / 21 | res31 | ResourceId::65773 · 2D Image 65773 | 4224 × 2112 × 1，array=1，mips=1，BC3_UNORM |
| writes | 3 / 27 | ssbo46 | ResourceId::90365 · Buffer 90365 | 1048576 bytes buffer |

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| uniforms11 | 0 / 0 | 1312 | ResourceId::387 / 277248 | [bin](/scene-capture-comparison/endfield/e4798_ps_s0_b0.bin) |
| uniforms27 | 3 / 22 | 7168 | ResourceId::65908 / 0 | [bin](/scene-capture-comparison/endfield/e4798_ps_s3_b22.bin) |
| uniforms13 | 3 / 23 | 3200 | ResourceId::387 / 278592 | [bin](/scene-capture-comparison/endfield/e4798_ps_s3_b23.bin) |
| uniforms23 | 3 / 24 | 208 | ResourceId::65905 / 0 | [bin](/scene-capture-comparison/endfield/e4798_ps_s3_b24.bin) |
| uniforms25 | 3 / 25 | 17456 | ResourceId::387 / 566400 | [bin](/scene-capture-comparison/endfield/e4798_ps_s3_b25.bin) |
| uniforms29 | 3 / 26 | 240 | ResourceId::387 / 3518336 | [bin](/scene-capture-comparison/endfield/e4798_ps_s3_b26.bin) |

### e5194

vkCmdDispatch()；indices=0，instances=0，dispatch=[215, 90, 1]。

#### CS · Shader Module 82230

[反汇编](/scene-capture-comparison/endfield/shaders/ResourceId_82230.cs.txt), SHA-256 `07c0616878b10955c1c646e34f3a721ac60f07520af2180ebbfa11301bf16c53`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|
| reads | 0 / 2 | res11 | ResourceId::121912 · 2D Color Attachment 121912 | 3440 × 1440 × 1，array=1，mips=1，R10G10B10A2_UNORM |
| reads | 0 / 3 | res12 | ResourceId::121867 · 2D Color Attachment 121867 | 1720 × 720 × 1，array=1，mips=5，R32_FLOAT |
| writes | 0 / 0 | res14 | ResourceId::121864 · 2D Color Attachment 121864 | 1720 × 720 × 1，array=1，mips=1，R8_UNORM |
| writes | 0 / 1 | res15 | ResourceId::121840 · 2D Color Attachment 121840 | 1720 × 720 × 1，array=1，mips=1，R8_UNORM |

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| uniforms5 | 1 / 0 | 1312 | ResourceId::387 / 277248 | [bin](/scene-capture-comparison/endfield/e5194_cs_s1_b0.bin) |
| uniforms10 | 1 / 1 | 80 | ResourceId::387 / 355840 | [bin](/scene-capture-comparison/endfield/e5194_cs_s1_b1.bin) |

### e5214

vkCmdDispatch()；indices=0，instances=0，dispatch=[215, 90, 1]。

#### CS · Shader Module 82968

[反汇编](/scene-capture-comparison/endfield/shaders/ResourceId_82968.cs.txt), SHA-256 `a9c0d5fdc445472d2e6d7eeb5932cbf3be49e724f6eddb5a263fd85bae442aff`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|
| reads | 0 / 5 | res18 | ResourceId::121886 · 2D Depth/Stencil Attachment 121886 | 3440 × 1440 × 1，array=1，mips=1，D32S8 |
| reads | 0 / 6 | res19 | ResourceId::121700 · 2D Color Attachment 121700 | 1720 × 720 × 1，array=1，mips=7，R32_FLOAT |
| reads | 0 / 7 | res20 | ResourceId::121912 · 2D Color Attachment 121912 | 3440 × 1440 × 1，array=1，mips=1，R10G10B10A2_UNORM |
| reads | 0 / 8 | res21 | ResourceId::121858 · 2D Color Attachment 121858 | 3440 × 1440 × 1，array=1，mips=1，R10G10B10A2_UNORM |
| reads | 0 / 9 | res23 | ResourceId::121886 · 2D Depth/Stencil Attachment 121886 | 3440 × 1440 × 1，array=1，mips=1，D32S8 |
| reads | 0 / 10 | res24 | ResourceId::80936 · 2D Depth Attachment 80936 | 512 × 512 × 1，array=1，mips=1，D32 |
| reads | 0 / 11 | res28 | ResourceId::689 · 3D Image 689 | 32 × 32 × 32，array=1，mips=6，R8_UNORM |
| reads | 0 / 12 | res29 | ResourceId::675 · 2D Image 675 | 512 × 512 × 1，array=1，mips=1，BC7_UNORM |
| reads | 0 / 13 | res30 | ResourceId::121909 · 2D Color Attachment 121909 | 3440 × 1440 × 1，array=1，mips=1，R8G8_UNORM |
| writes | 0 / 0 | res36 | ResourceId::121846 · 2D Color Attachment 121846 | 1720 × 720 × 1，array=1，mips=1，R8_UNORM |
| writes | 0 / 1 | res37 | ResourceId::121840 · 2D Color Attachment 121840 | 1720 × 720 × 1，array=1，mips=1，R8_UNORM |
| writes | 0 / 2 | res39 | ResourceId::121843 · 2D Color Attachment 121843 | 1720 × 720 × 1，array=1，mips=1，R10G10B10A2_UNORM |
| writes | 0 / 3 | ssbo32 | ResourceId::121694 · Buffer 121694 | 96 bytes buffer |
| writes | 0 / 4 | ssbo34 | ResourceId::121861 · Buffer 121861 | 154800 bytes buffer |

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| uniforms7 | 1 / 0 | 1312 | ResourceId::387 / 277248 | [bin](/scene-capture-comparison/endfield/e5214_cs_s1_b0.bin) |
| uniforms9 | 1 / 1 | 3200 | ResourceId::387 / 278592 | [bin](/scene-capture-comparison/endfield/e5214_cs_s1_b1.bin) |
| uniforms17 | 1 / 2 | 160 | ResourceId::387 / 355968 | [bin](/scene-capture-comparison/endfield/e5214_cs_s1_b2.bin) |
| uniforms26 | 1 / 3 | 80 | ResourceId::387 / 338560 | [bin](/scene-capture-comparison/endfield/e5214_cs_s1_b3.bin) |

### e5230

vkCmdDispatch()；indices=0，instances=0，dispatch=[430, 180, 1]。

#### CS · Shader Module 82994

[反汇编](/scene-capture-comparison/endfield/shaders/ResourceId_82994.cs.txt), SHA-256 `ea7e7e262fc4dd1cdde065164272e84ad41b30825ce1bf03ec8bd4d1e93a1f63`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|
| reads | 0 / 1 | res10 | ResourceId::112344 · 2D Color Attachment 112344 | 3440 × 1440 × 1，array=1，mips=1，R16G16B16A16_FLOAT |
| reads | 0 / 2 | res11 | ResourceId::121852 · 2D Color Attachment 121852 | 1720 × 720 × 1，array=1，mips=1，R16G16_UNORM |
| writes | 0 / 0 | res13 | ResourceId::121986 · 2D Color Attachment 121986 | 3440 × 1440 × 1，array=1，mips=1，R11G11B10_FLOAT |

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| uniforms5 | 1 / 0 | 3200 | ResourceId::387 / 278592 | [bin](/scene-capture-comparison/endfield/e5230_cs_s1_b0.bin) |

### e5270

vkCmdDispatch()；indices=0，instances=0，dispatch=[215, 90, 1]。

#### CS · Shader Module 83028

[反汇编](/scene-capture-comparison/endfield/shaders/ResourceId_83028.cs.txt), SHA-256 `c4a1782d5b2eeea283b4d375e385158a7f68be3b50c299c59089e8e21d300cad`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|
| reads | 0 / 1 | res12 | ResourceId::121700 · 2D Color Attachment 121700 | 1720 × 720 × 1，array=1，mips=7，R32_FLOAT |
| reads | 0 / 2 | res13 | ResourceId::121849 · 2D Color Attachment 121849 | 1720 × 720 × 1，array=1，mips=1，R16G16_UNORM |
| reads | 0 / 3 | res14 | ResourceId::121823 · 2D Color Attachment 121823 | 1720 × 720 × 1，array=1，mips=7，R11G11B10_FLOAT |
| writes | 0 / 0 | res17 | ResourceId::121726 · 2D Color Attachment 121726 | 1720 × 720 × 1，array=1，mips=1，R11G11B10_FLOAT |

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| uniforms5 | 1 / 0 | 3200 | ResourceId::387 / 278592 | [bin](/scene-capture-comparison/endfield/e5270_cs_s1_b0.bin) |
| uniforms11 | 1 / 1 | 160 | ResourceId::387 / 357120 | [bin](/scene-capture-comparison/endfield/e5270_cs_s1_b1.bin) |

### e5353

vkCmdDraw()；indices=3，instances=1，dispatch=[0, 0, 0]。

| 附件 | ResourceId | 底层尺寸与格式 |
|---|---|---|
| RT0 | ResourceId::121930 | 3440 × 1440 × 1，array=1，mips=1，R11G11B10_FLOAT |
| Depth | ResourceId::121886 | 3440 × 1440 × 1，array=1，mips=1，D32S8 |

Viewport：`{'enabled': True, 'height': 1440.0, 'maxDepth': 1.0, 'minDepth': 0.0, 'width': 3440.0, 'x': 0.0, 'y': 0.0}`；depth state：`{'depthBounds': False, 'depthEnable': True, 'depthFunction': 2, 'depthWrites': False, 'maxDepthBounds': 1.0, 'minDepthBounds': 0.0}`；stencil=True，front ref=0，mask=7。

#### VS · Shader Module 82253

[反汇编](/scene-capture-comparison/endfield/shaders/ResourceId_82253.vs.txt), SHA-256 `706041352d7ee93f2ce67b5403d91deefdf734f0e4896ddd64b7cad14ab34a33`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|

#### PS · Shader Module 82254

[反汇编](/scene-capture-comparison/endfield/shaders/ResourceId_82254.ps.txt), SHA-256 `c16e3d3f6bf1503ac86ad4beebf4e0223b3c87b57181657889a036e1ea8ecd91`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|
| reads | 3 / 6 | res70 | ResourceId::121909 · 2D Color Attachment 121909 | 3440 × 1440 × 1，array=1，mips=1，R8G8_UNORM |
| reads | 3 / 7 | res63 | ResourceId::121804 · 2D Color Attachment 121804 | 1720 × 720 × 1，array=1，mips=1，R16G16B16A16_FLOAT |
| reads | 3 / 8 | res41 | ResourceId::80936 · 2D Depth Attachment 80936 | 512 × 512 × 1，array=1，mips=1，D32 |
| reads | 3 / 9 | res46 | ResourceId::632 · 2D Image 632 | 1024 × 1024 × 1，array=1，mips=1，BC7_UNORM |
| reads | 3 / 10 | res49 | ResourceId::13677 · 2D Array Image 13677 | 64 × 64 × 1，array=15，mips=1，R8G8B8A8_UNORM |
| reads | 3 / 11 | res50 | ResourceId::13731 · 2D Array Image 13731 | 64 × 1 × 1，array=15，mips=1，R8G8B8A8_UNORM |
| reads | 3 / 12 | res38 | ResourceId::121798 · 2D Color Attachment 121798 | 3440 × 1440 × 1，array=1，mips=1，R8G8_UNORM |
| reads | 3 / 13 | res20 | ResourceId::121986 · 2D Color Attachment 121986 | 3440 × 1440 × 1，array=1，mips=1，R11G11B10_FLOAT |
| reads | 3 / 14 | res21 | ResourceId::121840 · 2D Color Attachment 121840 | 1720 × 720 × 1，array=1，mips=1，R8_UNORM |
| reads | 3 / 15 | res47 | ResourceId::675 · 2D Image 675 | 512 × 512 × 1，array=1，mips=1，BC7_UNORM |
| reads | 3 / 16 | res23 | ResourceId::80990 · 2D Color Attachment 80990 | 576 × 576 × 1，array=32，mips=10，R11G11B10_FLOAT |
| reads | 3 / 17 | res45 | ResourceId::689 · 3D Image 689 | 32 × 32 × 32，array=1，mips=6，R8_UNORM |
| reads | 3 / 18 | res37 | ResourceId::80927 · 2D Depth Attachment 80927 | 6144 × 4096 × 1，array=1，mips=1，D16 |
| reads | 3 / 19 | res48 | ResourceId::123128 · 2D Image 123128 | 32 × 32 × 1，array=1，mips=1，R16_UNORM |
| reads | 3 / 20 | res54 | ResourceId::160 · 2D Image 160 | 4 × 4 × 1，array=1，mips=1，R8G8B8A8_SRGB |
| reads | 3 / 21 | res69 | ResourceId::66147 · 3D Image 66147 | 128 × 192 × 128，array=1，mips=1，R8G8B8A8_UNORM |
| reads | 3 / 22 | res67 | ResourceId::66141 · 3D Image 66141 | 128 × 192 × 128，array=1，mips=1，R8G8B8A8_UNORM |
| reads | 3 / 23 | res65 | ResourceId::66135 · 3D Image 66135 | 128 × 192 × 128，array=1，mips=1，R8G8B8A8_UNORM |
| reads | 3 / 24 | res68 | ResourceId::66144 · 3D Image 66144 | 128 × 64 × 128，array=1，mips=1，R11G11B10_FLOAT |
| reads | 3 / 25 | res66 | ResourceId::66138 · 3D Image 66138 | 128 × 64 × 128，array=1，mips=1，R11G11B10_FLOAT |
| reads | 3 / 26 | res64 | ResourceId::66132 · 3D Image 66132 | 128 × 64 × 128，array=1，mips=1，R11G11B10_FLOAT |
| reads | 3 / 27 | res59 | ResourceId::116956 · 3D Image 116956 | 313 × 180 × 128，array=1，mips=1，R16G16B16A16_FLOAT |
| reads | 3 / 28 | res22 | ResourceId::121880 · 2D Color Attachment 121880 | 3440 × 1440 × 1，array=1，mips=1，R8_UNORM |
| reads | 3 / 29 | res74 | ResourceId::14178 · 3D Image 14178 | 64 × 64 × 64，array=1，mips=1，R8_UNORM |
| reads | 3 / 30 | res39 | ResourceId::160 · 2D Image 160 | 4 × 4 × 1，array=1，mips=1，R8G8B8A8_SRGB |
| reads | 3 / 31 | res73 | ResourceId::121915 · 2D Color Attachment 121915 | 3440 × 1440 × 1，array=1，mips=1，R8G8B8A8_SRGB |
| reads | 3 / 32 | res72 | ResourceId::121912 · 2D Color Attachment 121912 | 3440 × 1440 × 1，array=1，mips=1，R10G10B10A2_UNORM |
| reads | 3 / 33 | res71 | ResourceId::121918 · 2D Color Attachment 121918 | 3440 × 1440 × 1，array=1，mips=1，R10G10B10A2_UNORM |
| reads | 3 / 34 | res53 | ResourceId::121812 · 2D Color Attachment 121812 | 3440 × 1440 × 1，array=1，mips=1，R8G8_UNORM |
| reads | 3 / 35 | res19 | ResourceId::121792 · 2D Color Attachment 121792 | 3440 × 1440 × 1，array=1，mips=1，R32_FLOAT |
| reads | 3 / 36 | res40 | ResourceId::163 · 2D Image 163 | 4 × 4 × 1，array=1，mips=1，R8G8B8A8_SRGB |
| reads | 3 / 37 | res62 | ResourceId::62930 · 2D Image 62930 | 256 × 1 × 1，array=1，mips=1，R8G8B8A8_UNORM |
| writes | 3 / 49 | ssbo25 | ResourceId::121815 · Buffer 121815 | 244592 bytes buffer |

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| uniforms43 | 3 / 38 | 80 | ResourceId::387 / 338560 | [bin](/scene-capture-comparison/endfield/e5353_ps_s3_b38.bin) |
| uniforms7 | 3 / 39 | 1312 | ResourceId::387 / 277248 | [bin](/scene-capture-comparison/endfield/e5353_ps_s3_b39.bin) |
| uniforms52 | 3 / 40 | 480 | ResourceId::387 / 264192 | [bin](/scene-capture-comparison/endfield/e5353_ps_s3_b40.bin) |
| uniforms32 | 3 / 41 | 32864 | ResourceId::387 / 230144 | [bin](/scene-capture-comparison/endfield/e5353_ps_s3_b41.bin) |
| uniforms30 | 3 / 42 | 48 | ResourceId::387 / 263040 | [bin](/scene-capture-comparison/endfield/e5353_ps_s3_b42.bin) |
| uniforms61 | 3 / 43 | 128 | ResourceId::387 / 357312 | [bin](/scene-capture-comparison/endfield/e5353_ps_s3_b43.bin) |
| uniforms34 | 3 / 44 | 11440 | ResourceId::387 / 339008 | [bin](/scene-capture-comparison/endfield/e5353_ps_s3_b44.bin) |
| uniforms9 | 3 / 45 | 3200 | ResourceId::387 / 278592 | [bin](/scene-capture-comparison/endfield/e5353_ps_s3_b45.bin) |
| uniforms28 | 3 / 46 | 4160 | ResourceId::387 / 331904 | [bin](/scene-capture-comparison/endfield/e5353_ps_s3_b46.bin) |
| uniforms56 | 3 / 47 | 2560 | ResourceId::387 / 281792 | [bin](/scene-capture-comparison/endfield/e5353_ps_s3_b47.bin) |
| uniforms36 | 3 / 48 | 3568 | ResourceId::387 / 350528 | [bin](/scene-capture-comparison/endfield/e5353_ps_s3_b48.bin) |

### e5357

vkCmdDraw()；indices=3，instances=1，dispatch=[0, 0, 0]。

| 附件 | ResourceId | 底层尺寸与格式 |
|---|---|---|
| RT0 | ResourceId::121930 | 3440 × 1440 × 1，array=1，mips=1，R11G11B10_FLOAT |
| Depth | ResourceId::121886 | 3440 × 1440 × 1，array=1，mips=1，D32S8 |

Viewport：`{'enabled': True, 'height': 1440.0, 'maxDepth': 1.0, 'minDepth': 0.0, 'width': 3440.0, 'x': 0.0, 'y': 0.0}`；depth state：`{'depthBounds': False, 'depthEnable': True, 'depthFunction': 2, 'depthWrites': False, 'maxDepthBounds': 1.0, 'minDepthBounds': 0.0}`；stencil=True，front ref=1，mask=7。

#### VS · Shader Module 82259

[反汇编](/scene-capture-comparison/endfield/shaders/ResourceId_82259.vs.txt), SHA-256 `706041352d7ee93f2ce67b5403d91deefdf734f0e4896ddd64b7cad14ab34a33`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|

#### PS · Shader Module 82260

[反汇编](/scene-capture-comparison/endfield/shaders/ResourceId_82260.ps.txt), SHA-256 `8428f84784d808af94d4a0e62a8463933fd30a524e327313826ed03c18dfa99b`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|
| reads | 3 / 6 | res64 | ResourceId::121909 · 2D Color Attachment 121909 | 3440 × 1440 × 1，array=1，mips=1，R8G8_UNORM |
| reads | 3 / 7 | res57 | ResourceId::121804 · 2D Color Attachment 121804 | 1720 × 720 × 1，array=1，mips=1，R16G16B16A16_FLOAT |
| reads | 3 / 8 | res41 | ResourceId::80936 · 2D Depth Attachment 80936 | 512 × 512 × 1，array=1，mips=1，D32 |
| reads | 3 / 9 | res38 | ResourceId::121798 · 2D Color Attachment 121798 | 3440 × 1440 × 1，array=1，mips=1，R8G8_UNORM |
| reads | 3 / 10 | res20 | ResourceId::121986 · 2D Color Attachment 121986 | 3440 × 1440 × 1，array=1，mips=1，R11G11B10_FLOAT |
| reads | 3 / 11 | res21 | ResourceId::121840 · 2D Color Attachment 121840 | 1720 × 720 × 1，array=1，mips=1，R8_UNORM |
| reads | 3 / 12 | res23 | ResourceId::80990 · 2D Color Attachment 80990 | 576 × 576 × 1，array=32，mips=10，R11G11B10_FLOAT |
| reads | 3 / 13 | res45 | ResourceId::689 · 3D Image 689 | 32 × 32 × 32，array=1，mips=6，R8_UNORM |
| reads | 3 / 14 | res37 | ResourceId::80927 · 2D Depth Attachment 80927 | 6144 × 4096 × 1，array=1，mips=1，D16 |
| reads | 3 / 15 | res46 | ResourceId::123128 · 2D Image 123128 | 32 × 32 × 1，array=1，mips=1，R16_UNORM |
| reads | 3 / 16 | res48 | ResourceId::160 · 2D Image 160 | 4 × 4 × 1，array=1，mips=1，R8G8B8A8_SRGB |
| reads | 3 / 17 | res63 | ResourceId::66147 · 3D Image 66147 | 128 × 192 × 128，array=1，mips=1，R8G8B8A8_UNORM |
| reads | 3 / 18 | res61 | ResourceId::66141 · 3D Image 66141 | 128 × 192 × 128，array=1，mips=1，R8G8B8A8_UNORM |
| reads | 3 / 19 | res59 | ResourceId::66135 · 3D Image 66135 | 128 × 192 × 128，array=1，mips=1，R8G8B8A8_UNORM |
| reads | 3 / 20 | res62 | ResourceId::66144 · 3D Image 66144 | 128 × 64 × 128，array=1，mips=1，R11G11B10_FLOAT |
| reads | 3 / 21 | res60 | ResourceId::66138 · 3D Image 66138 | 128 × 64 × 128，array=1，mips=1，R11G11B10_FLOAT |
| reads | 3 / 22 | res58 | ResourceId::66132 · 3D Image 66132 | 128 × 64 × 128，array=1，mips=1，R11G11B10_FLOAT |
| reads | 3 / 23 | res53 | ResourceId::116956 · 3D Image 116956 | 313 × 180 × 128，array=1，mips=1，R16G16B16A16_FLOAT |
| reads | 3 / 24 | res22 | ResourceId::121880 · 2D Color Attachment 121880 | 3440 × 1440 × 1，array=1，mips=1，R8_UNORM |
| reads | 3 / 25 | res68 | ResourceId::14178 · 3D Image 14178 | 64 × 64 × 64，array=1，mips=1，R8_UNORM |
| reads | 3 / 26 | res39 | ResourceId::160 · 2D Image 160 | 4 × 4 × 1，array=1，mips=1，R8G8B8A8_SRGB |
| reads | 3 / 27 | res67 | ResourceId::121915 · 2D Color Attachment 121915 | 3440 × 1440 × 1，array=1，mips=1，R8G8B8A8_SRGB |
| reads | 3 / 28 | res66 | ResourceId::121912 · 2D Color Attachment 121912 | 3440 × 1440 × 1，array=1，mips=1，R10G10B10A2_UNORM |
| reads | 3 / 29 | res65 | ResourceId::121918 · 2D Color Attachment 121918 | 3440 × 1440 × 1，array=1，mips=1，R10G10B10A2_UNORM |
| reads | 3 / 30 | res47 | ResourceId::121812 · 2D Color Attachment 121812 | 3440 × 1440 × 1，array=1，mips=1，R8G8_UNORM |
| reads | 3 / 31 | res19 | ResourceId::121792 · 2D Color Attachment 121792 | 3440 × 1440 × 1，array=1，mips=1，R32_FLOAT |
| reads | 3 / 32 | res40 | ResourceId::163 · 2D Image 163 | 4 × 4 × 1，array=1，mips=1，R8G8B8A8_SRGB |
| reads | 3 / 33 | res56 | ResourceId::62930 · 2D Image 62930 | 256 × 1 × 1，array=1，mips=1，R8G8B8A8_UNORM |
| writes | 3 / 44 | ssbo25 | ResourceId::121815 · Buffer 121815 | 244592 bytes buffer |

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| uniforms43 | 3 / 34 | 80 | ResourceId::387 / 338560 | [bin](/scene-capture-comparison/endfield/e5357_ps_s3_b34.bin) |
| uniforms7 | 3 / 35 | 1312 | ResourceId::387 / 277248 | [bin](/scene-capture-comparison/endfield/e5357_ps_s3_b35.bin) |
| uniforms32 | 3 / 36 | 32864 | ResourceId::387 / 230144 | [bin](/scene-capture-comparison/endfield/e5357_ps_s3_b36.bin) |
| uniforms30 | 3 / 37 | 48 | ResourceId::387 / 263040 | [bin](/scene-capture-comparison/endfield/e5357_ps_s3_b37.bin) |
| uniforms55 | 3 / 38 | 128 | ResourceId::387 / 357312 | [bin](/scene-capture-comparison/endfield/e5357_ps_s3_b38.bin) |
| uniforms34 | 3 / 39 | 11440 | ResourceId::387 / 339008 | [bin](/scene-capture-comparison/endfield/e5357_ps_s3_b39.bin) |
| uniforms9 | 3 / 40 | 3200 | ResourceId::387 / 278592 | [bin](/scene-capture-comparison/endfield/e5357_ps_s3_b40.bin) |
| uniforms28 | 3 / 41 | 4160 | ResourceId::387 / 331904 | [bin](/scene-capture-comparison/endfield/e5357_ps_s3_b41.bin) |
| uniforms50 | 3 / 42 | 2560 | ResourceId::387 / 281792 | [bin](/scene-capture-comparison/endfield/e5357_ps_s3_b42.bin) |
| uniforms36 | 3 / 43 | 3568 | ResourceId::387 / 350528 | [bin](/scene-capture-comparison/endfield/e5357_ps_s3_b43.bin) |

### e5361

vkCmdDraw()；indices=3，instances=1，dispatch=[0, 0, 0]。

| 附件 | ResourceId | 底层尺寸与格式 |
|---|---|---|
| RT0 | ResourceId::121930 | 3440 × 1440 × 1，array=1，mips=1，R11G11B10_FLOAT |
| Depth | ResourceId::121886 | 3440 × 1440 × 1，array=1，mips=1，D32S8 |

Viewport：`{'enabled': True, 'height': 1440.0, 'maxDepth': 1.0, 'minDepth': 0.0, 'width': 3440.0, 'x': 0.0, 'y': 0.0}`；depth state：`{'depthBounds': False, 'depthEnable': True, 'depthFunction': 2, 'depthWrites': False, 'maxDepthBounds': 1.0, 'minDepthBounds': 0.0}`；stencil=True，front ref=2，mask=7。

#### VS · Shader Module 82265

[反汇编](/scene-capture-comparison/endfield/shaders/ResourceId_82265.vs.txt), SHA-256 `706041352d7ee93f2ce67b5403d91deefdf734f0e4896ddd64b7cad14ab34a33`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|

#### PS · Shader Module 82266

[反汇编](/scene-capture-comparison/endfield/shaders/ResourceId_82266.ps.txt), SHA-256 `6fe3d2fce3d8e44036286e2f12ea58c3cfde52e4ebf89a2d33470955e697d1f1`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|
| reads | 3 / 6 | res70 | ResourceId::121909 · 2D Color Attachment 121909 | 3440 × 1440 × 1，array=1，mips=1，R8G8_UNORM |
| reads | 3 / 7 | res63 | ResourceId::121804 · 2D Color Attachment 121804 | 1720 × 720 × 1，array=1，mips=1，R16G16B16A16_FLOAT |
| reads | 3 / 8 | res43 | ResourceId::80936 · 2D Depth Attachment 80936 | 512 × 512 × 1，array=1，mips=1，D32 |
| reads | 3 / 9 | res49 | ResourceId::13677 · 2D Array Image 13677 | 64 × 64 × 1，array=15，mips=1，R8G8B8A8_UNORM |
| reads | 3 / 10 | res50 | ResourceId::13731 · 2D Array Image 13731 | 64 × 1 × 1，array=15，mips=1，R8G8B8A8_UNORM |
| reads | 3 / 11 | res40 | ResourceId::121798 · 2D Color Attachment 121798 | 3440 × 1440 × 1，array=1，mips=1，R8G8_UNORM |
| reads | 3 / 12 | res22 | ResourceId::121986 · 2D Color Attachment 121986 | 3440 × 1440 × 1，array=1，mips=1，R11G11B10_FLOAT |
| reads | 3 / 13 | res23 | ResourceId::121840 · 2D Color Attachment 121840 | 1720 × 720 × 1，array=1，mips=1，R8_UNORM |
| reads | 3 / 14 | res25 | ResourceId::80990 · 2D Color Attachment 80990 | 576 × 576 × 1，array=32，mips=10，R11G11B10_FLOAT |
| reads | 3 / 15 | res47 | ResourceId::689 · 3D Image 689 | 32 × 32 × 32，array=1，mips=6，R8_UNORM |
| reads | 3 / 16 | res39 | ResourceId::80927 · 2D Depth Attachment 80927 | 6144 × 4096 × 1，array=1，mips=1，D16 |
| reads | 3 / 17 | res48 | ResourceId::123128 · 2D Image 123128 | 32 × 32 × 1，array=1，mips=1，R16_UNORM |
| reads | 3 / 18 | res54 | ResourceId::160 · 2D Image 160 | 4 × 4 × 1，array=1，mips=1，R8G8B8A8_SRGB |
| reads | 3 / 19 | res69 | ResourceId::66147 · 3D Image 66147 | 128 × 192 × 128，array=1，mips=1，R8G8B8A8_UNORM |
| reads | 3 / 20 | res67 | ResourceId::66141 · 3D Image 66141 | 128 × 192 × 128，array=1，mips=1，R8G8B8A8_UNORM |
| reads | 3 / 21 | res65 | ResourceId::66135 · 3D Image 66135 | 128 × 192 × 128，array=1，mips=1，R8G8B8A8_UNORM |
| reads | 3 / 22 | res68 | ResourceId::66144 · 3D Image 66144 | 128 × 64 × 128，array=1，mips=1，R11G11B10_FLOAT |
| reads | 3 / 23 | res66 | ResourceId::66138 · 3D Image 66138 | 128 × 64 × 128，array=1，mips=1，R11G11B10_FLOAT |
| reads | 3 / 24 | res64 | ResourceId::66132 · 3D Image 66132 | 128 × 64 × 128，array=1，mips=1，R11G11B10_FLOAT |
| reads | 3 / 25 | res59 | ResourceId::116956 · 3D Image 116956 | 313 × 180 × 128，array=1，mips=1，R16G16B16A16_FLOAT |
| reads | 3 / 26 | res24 | ResourceId::121880 · 2D Color Attachment 121880 | 3440 × 1440 × 1，array=1，mips=1，R8_UNORM |
| reads | 3 / 27 | res74 | ResourceId::14178 · 3D Image 14178 | 64 × 64 × 64，array=1，mips=1，R8_UNORM |
| reads | 3 / 28 | res41 | ResourceId::160 · 2D Image 160 | 4 × 4 × 1，array=1，mips=1，R8G8B8A8_SRGB |
| reads | 3 / 29 | res73 | ResourceId::121915 · 2D Color Attachment 121915 | 3440 × 1440 × 1，array=1，mips=1，R8G8B8A8_SRGB |
| reads | 3 / 30 | res72 | ResourceId::121912 · 2D Color Attachment 121912 | 3440 × 1440 × 1，array=1，mips=1，R10G10B10A2_UNORM |
| reads | 3 / 31 | res71 | ResourceId::121918 · 2D Color Attachment 121918 | 3440 × 1440 × 1，array=1，mips=1，R10G10B10A2_UNORM |
| reads | 3 / 32 | res53 | ResourceId::121812 · 2D Color Attachment 121812 | 3440 × 1440 × 1，array=1，mips=1，R8G8_UNORM |
| reads | 3 / 33 | res21 | ResourceId::121792 · 2D Color Attachment 121792 | 3440 × 1440 × 1，array=1，mips=1，R32_FLOAT |
| reads | 3 / 34 | res42 | ResourceId::163 · 2D Image 163 | 4 × 4 × 1，array=1，mips=1，R8G8B8A8_SRGB |
| reads | 3 / 35 | res62 | ResourceId::62930 · 2D Image 62930 | 256 × 1 × 1，array=1，mips=1，R8G8B8A8_UNORM |
| writes | 3 / 48 | ssbo27 | ResourceId::121815 · Buffer 121815 | 244592 bytes buffer |

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| uniforms45 | 3 / 36 | 80 | ResourceId::387 / 338560 | [bin](/scene-capture-comparison/endfield/e5361_ps_s3_b36.bin) |
| uniforms7 | 3 / 37 | 1312 | ResourceId::387 / 277248 | [bin](/scene-capture-comparison/endfield/e5361_ps_s3_b37.bin) |
| uniforms52 | 3 / 38 | 480 | ResourceId::387 / 264192 | [bin](/scene-capture-comparison/endfield/e5361_ps_s3_b38.bin) |
| uniforms11 | 3 / 39 | 1008 | ResourceId::387 / 263168 | [bin](/scene-capture-comparison/endfield/e5361_ps_s3_b39.bin) |
| uniforms34 | 3 / 40 | 32864 | ResourceId::387 / 230144 | [bin](/scene-capture-comparison/endfield/e5361_ps_s3_b40.bin) |
| uniforms32 | 3 / 41 | 48 | ResourceId::387 / 263040 | [bin](/scene-capture-comparison/endfield/e5361_ps_s3_b41.bin) |
| uniforms61 | 3 / 42 | 128 | ResourceId::387 / 357312 | [bin](/scene-capture-comparison/endfield/e5361_ps_s3_b42.bin) |
| uniforms36 | 3 / 43 | 11440 | ResourceId::387 / 339008 | [bin](/scene-capture-comparison/endfield/e5361_ps_s3_b43.bin) |
| uniforms9 | 3 / 44 | 3200 | ResourceId::387 / 278592 | [bin](/scene-capture-comparison/endfield/e5361_ps_s3_b44.bin) |
| uniforms30 | 3 / 45 | 4160 | ResourceId::387 / 331904 | [bin](/scene-capture-comparison/endfield/e5361_ps_s3_b45.bin) |
| uniforms56 | 3 / 46 | 2560 | ResourceId::387 / 281792 | [bin](/scene-capture-comparison/endfield/e5361_ps_s3_b46.bin) |
| uniforms38 | 3 / 47 | 3568 | ResourceId::387 / 350528 | [bin](/scene-capture-comparison/endfield/e5361_ps_s3_b47.bin) |

### e6405

vkCmdDraw()；indices=3，instances=1，dispatch=[0, 0, 0]。

| 附件 | ResourceId | 底层尺寸与格式 |
|---|---|---|
| RT0 | ResourceId::121671 | 3440 × 1440 × 1，array=1，mips=1，R16_FLOAT |
| RT1 | ResourceId::121668 | 3440 × 1440 × 1，array=1，mips=1，R10G10B10A2_UNORM |
| Depth | ResourceId::0 | — |

Viewport：`{'enabled': True, 'height': 1440.0, 'maxDepth': 1.0, 'minDepth': 0.0, 'width': 3440.0, 'x': 0.0, 'y': 0.0}`；depth state：`{'depthBounds': False, 'depthEnable': True, 'depthFunction': 1, 'depthWrites': False, 'maxDepthBounds': 1.0, 'minDepthBounds': 0.0}`；stencil=False，front ref=0，mask=255。

#### VS · Shader Module 13826

[反汇编](/scene-capture-comparison/endfield/shaders/ResourceId_13826.vs.txt), SHA-256 `571a613b2c5a36298e10dd306c388225d40cf7df7cc4117b77abf8dfa9f1c054`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|

#### PS · Shader Module 13827

[反汇编](/scene-capture-comparison/endfield/shaders/ResourceId_13827.ps.txt), SHA-256 `69155077ed3b92210f904ebc250f1a3530552e3d91dceb9eac18f4421b5afb95`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|
| reads | 3 / 1 | res13 | ResourceId::121886 · 2D Depth/Stencil Attachment 121886 | 3440 × 1440 × 1，array=1，mips=1，D32S8 |
| reads | 3 / 2 | res16 | ResourceId::112347 · 2D Color Attachment 112347 | 3440 × 1440 × 1，array=1，mips=1，R10G10B10A2_UNORM |
| reads | 3 / 3 | res15 | ResourceId::112350 · 2D Color Attachment 112350 | 3440 × 1440 × 1，array=1，mips=1，R16_FLOAT |
| reads | 3 / 4 | res14 | ResourceId::121921 · 2D Color Attachment 121921 | 3440 × 1440 × 1，array=1，mips=1，R10G10B10A2_UNORM |

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| uniforms7 | 3 / 5 | 1312 | ResourceId::387 / 277248 | [bin](/scene-capture-comparison/endfield/e6405_ps_s3_b5.bin) |
| uniforms12 | 3 / 6 | 192 | ResourceId::387 / 357440 | [bin](/scene-capture-comparison/endfield/e6405_ps_s3_b6.bin) |

### e6414

vkCmdDraw()；indices=3，instances=1，dispatch=[0, 0, 0]。

| 附件 | ResourceId | 底层尺寸与格式 |
|---|---|---|
| RT0 | ResourceId::121777 | 860 × 360 × 1，array=1，mips=1，R8_UNORM |
| Depth | ResourceId::0 | — |

Viewport：`{'enabled': True, 'height': 360.0, 'maxDepth': 1.0, 'minDepth': 0.0, 'width': 860.0, 'x': 0.0, 'y': 0.0}`；depth state：`{'depthBounds': False, 'depthEnable': True, 'depthFunction': 1, 'depthWrites': False, 'maxDepthBounds': 1.0, 'minDepthBounds': 0.0}`；stencil=False，front ref=0，mask=255。

#### VS · Shader Module 13831

[反汇编](/scene-capture-comparison/endfield/shaders/ResourceId_13831.vs.txt), SHA-256 `807726b1e9ac53a24a33fb5383738f45312a197e7c133fc492259ce0f53c4e66`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|

#### PS · Shader Module 13832

[反汇编](/scene-capture-comparison/endfield/shaders/ResourceId_13832.ps.txt), SHA-256 `47705afb876dc95daba070466210f46a42554d1c79a6a33b336cd8fbfd7c8305`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|
| reads | 3 / 1 | res10 | ResourceId::121668 · 2D Color Attachment 121668 | 3440 × 1440 × 1，array=1，mips=1，R10G10B10A2_UNORM |

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| uniforms9 | 3 / 2 | 192 | ResourceId::387 / 357440 | [bin](/scene-capture-comparison/endfield/e6414_ps_s3_b2.bin) |

### e6423

vkCmdDraw()；indices=3，instances=1，dispatch=[0, 0, 0]。

| 附件 | ResourceId | 底层尺寸与格式 |
|---|---|---|
| RT0 | ResourceId::121665 | 3440 × 1440 × 1，array=1，mips=1，R16G16B16A16_FLOAT |
| Depth | ResourceId::0 | — |

Viewport：`{'enabled': True, 'height': 1440.0, 'maxDepth': 1.0, 'minDepth': 0.0, 'width': 3440.0, 'x': 0.0, 'y': 0.0}`；depth state：`{'depthBounds': False, 'depthEnable': True, 'depthFunction': 1, 'depthWrites': False, 'maxDepthBounds': 1.0, 'minDepthBounds': 0.0}`；stencil=False，front ref=0，mask=255。

#### VS · Shader Module 13835

[反汇编](/scene-capture-comparison/endfield/shaders/ResourceId_13835.vs.txt), SHA-256 `571a613b2c5a36298e10dd306c388225d40cf7df7cc4117b77abf8dfa9f1c054`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|

#### PS · Shader Module 13836

[反汇编](/scene-capture-comparison/endfield/shaders/ResourceId_13836.ps.txt), SHA-256 `87ca1138be780c6ce3474c6097367b59dfac730ab498b2fb9d1baafb7961f0fc`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|
| reads | 3 / 2 | res14 | ResourceId::121886 · 2D Depth/Stencil Attachment 121886 | 3440 × 1440 × 1，array=1，mips=1，D32S8 |
| reads | 3 / 3 | res13 | ResourceId::121780 · 2D Color Attachment 121780 | 3440 × 1440 × 1，array=1，mips=1，R11G11B10_FLOAT |
| reads | 3 / 4 | res17 | ResourceId::112344 · 2D Color Attachment 112344 | 3440 × 1440 × 1，array=1，mips=1，R16G16B16A16_FLOAT |
| reads | 3 / 5 | res16 | ResourceId::121777 · 2D Color Attachment 121777 | 860 × 360 × 1，array=1，mips=1，R8_UNORM |
| reads | 3 / 6 | res15 | ResourceId::121668 · 2D Color Attachment 121668 | 3440 × 1440 × 1，array=1，mips=1，R10G10B10A2_UNORM |

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| uniforms12 | 3 / 7 | 192 | ResourceId::387 / 357440 | [bin](/scene-capture-comparison/endfield/e6423_ps_s3_b7.bin) |
| uniforms6 | 3 / 8 | 3200 | ResourceId::387 / 278592 | [bin](/scene-capture-comparison/endfield/e6423_ps_s3_b8.bin) |

### e6512

vkCmdDraw()；indices=3，instances=1，dispatch=[0, 0, 0]。

| 附件 | ResourceId | 底层尺寸与格式 |
|---|---|---|
| RT0 | ResourceId::121723 | 3440 × 1440 × 1，array=1，mips=1，R8G8B8A8_UNORM |
| Depth | ResourceId::424 | 3440 × 1440 × 1，array=1，mips=1，D24S8 |

Viewport：`{'enabled': True, 'height': 1440.0, 'maxDepth': 1.0, 'minDepth': 0.0, 'width': 3440.0, 'x': 0.0, 'y': 0.0}`；depth state：`{'depthBounds': False, 'depthEnable': True, 'depthFunction': 1, 'depthWrites': False, 'maxDepthBounds': 1.0, 'minDepthBounds': 0.0}`；stencil=False，front ref=0，mask=255。

#### VS · Shader Module 82416

[反汇编](/scene-capture-comparison/endfield/shaders/ResourceId_82416.vs.txt), SHA-256 `2711f12bb4f75fbdb2fd75166ddf34f6c113f88c5910bc7e9621b6ec55911fbb`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| uniforms7 | 3 / 0 | 32 | ResourceId::387 / 338752 | [bin](/scene-capture-comparison/endfield/e6512_vs_s3_b0.bin) |

#### PS · Shader Module 82417

[反汇编](/scene-capture-comparison/endfield/shaders/ResourceId_82417.ps.txt), SHA-256 `72bee997fa01d8d6eacb9ae7e64accc54c736934f080cf6c1950bfacfb50c20b`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|
| reads | 3 / 2 | res11 | ResourceId::81352 · 2D Color Attachment 81352 | 1024 × 32 × 1，array=1，mips=1，R16G16B16A16_FLOAT |
| reads | 3 / 3 | res9 | ResourceId::121665 · 2D Color Attachment 121665 | 3440 × 1440 × 1，array=1，mips=1，R16G16B16A16_FLOAT |
| reads | 3 / 4 | res10 | ResourceId::121726 · 2D Color Attachment 121726 | 1720 × 720 × 1，array=1，mips=1，R11G11B10_FLOAT |

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| uniforms14 | 3 / 5 | 416 | ResourceId::387 / 3553024 | [bin](/scene-capture-comparison/endfield/e6512_ps_s3_b5.bin) |
| uniforms6 | 3 / 6 | 3200 | ResourceId::387 / 278592 | [bin](/scene-capture-comparison/endfield/e6512_ps_s3_b6.bin) |

### e6531

vkCmdDraw()；indices=3，instances=1，dispatch=[0, 0, 0]。

| 附件 | ResourceId | 底层尺寸与格式 |
|---|---|---|
| RT0 | ResourceId::460 | 3440 × 1440 × 1，array=1，mips=1，R8G8B8A8_UNORM |
| Depth | ResourceId::424 | 3440 × 1440 × 1，array=1，mips=1，D24S8 |

Viewport：`{'enabled': True, 'height': 1440.0, 'maxDepth': 1.0, 'minDepth': 0.0, 'width': 3440.0, 'x': 0.0, 'y': 0.0}`；depth state：`{'depthBounds': False, 'depthEnable': True, 'depthFunction': 1, 'depthWrites': False, 'maxDepthBounds': 1.0, 'minDepthBounds': 0.0}`；stencil=False，front ref=0，mask=255。

#### VS · Shader Module 1146

[反汇编](/scene-capture-comparison/endfield/shaders/ResourceId_1146.vs.txt), SHA-256 `12270b752d1f8dfd7f1576f0fd4233a196c95f518d38f1d3508a16ecc9a7fb9e`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| uniforms7 | 3 / 0 | 32 | ResourceId::387 / 357632 | [bin](/scene-capture-comparison/endfield/e6531_vs_s3_b0.bin) |
| uniforms9 | 3 / 1 | 52 | ResourceId::387 / 3554624 | [bin](/scene-capture-comparison/endfield/e6531_vs_s3_b1.bin) |

#### PS · Shader Module 1147

[反汇编](/scene-capture-comparison/endfield/shaders/ResourceId_1147.ps.txt), SHA-256 `733271644174ab869934ef46cc527c1b66652a530740a4b8970e60165e4fdc62`。

| 访问 | space / binding | 符号 | ResourceId / 名称 | 尺寸与格式 |
|---|---|---|---|---|
| reads | 3 / 3 | res6 | ResourceId::121723 · 2D Color Attachment 121723 | 3440 × 1440 × 1，array=1，mips=1，R8G8B8A8_UNORM |

| 常量块 | space / binding | bytes | buffer / byte offset | 原始数据 |
|---|---|---|---|---|
| uniforms9 | 3 / 1 | 52 | ResourceId::387 / 3554624 | [bin](/scene-capture-comparison/endfield/e6531_ps_s3_b1.bin) |
