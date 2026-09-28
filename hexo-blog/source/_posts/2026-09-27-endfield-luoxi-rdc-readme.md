---
title: "Arknights: Endfield Luoxi RDC reverse engineering"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-28T10:32:00+08:00"
permalink: 2026/09/27/endfield-luoxi-rdc-readme/
categories:
  - 图形学
tags:
  - astra
  - 渲染分析
  - 终末地
---

> 由 astra 生成 · 首次发布于 2026-09-27 18:44 · 最近整理于 2026-09-28 10:32（北京时间）

## Capture identity

- Capture: `D:\Capture\终末地洛熙.rdc`
- Game: `E:\Hypergryph Launcher\games\Arknights Endfield`
- Engine/API: Unity IL2CPP, Vulkan
- RenderDoc: 1.45
- Frame: 2201
- Reference extent: 3440 × 1440
- Actions: 358 total, 246 draws, 47 dispatches
- Character shown by the capture UI: 洛茜. The capture file uses the spelling `洛熙`.

<!-- more -->

This profile is isolated from ZZZ, Genshin, and Azur Promilia. Its future
runtime identity is `endfield.luoxi`; no shader or pass identity from another
capture may be reused. Shared renderer infrastructure is allowed, but every
captured program, binding contract, fixed-function state, and semantic shader
belongs to the Endfield profile.

## Completed extraction baseline

The first extraction pass has produced:

- all 293 graphics/compute pass contracts;
- 172 unique original SPIR-V modules: 73 vertex, 73 fragment, and 26 compute;
- RenderDoc SPIR-V disassembly and SPIRV-Cross HLSL for every module;
- 13 character BasePass draw contracts, including event-local constant
  snapshots and all referenced buffers/textures;
- 15 character textures with lossless DDS mip chains and PNG previews;
- 52 key frame snapshots covering the two shadow passes, five-target
  BasePass, lighting, depth of field, temporal resolve, Bloom, Tonemap, final
  blit, and UI boundary;
- a CPU replay of the captured skinning path and a 13-submesh posed glTF
  validation asset, including a degenerate preview-only holder for the
  event-512 outline section;
- four semantic shadow identities covering both character shadow atlases,
  with byte-exact D16 and Post-VS replacement evidence;
- `capture-geometry.pnmesh`, which preserves the original multi-stream
  vertex/index arena ranges for the 13 BasePass draws, all 33 event-local
  geometry-lighting draws, three scene-transition VFX draws, and event 1061's final-composite
  backdrop;
- an adapter manifest with event-local descriptor spaces, fixed state,
  stencil reference/masks, and five-MRT contracts.
- semantic, exact-replacement Bloom prefilter/downsample/upsample shaders and
  the final Tonemap/UberPost pixel shader;
- three pass-local, semantic deferred-lighting resolves for events 669, 673,
  and 677, including the clustered-light, shadow, reflection-probe, and fog
  paths;
- 24 semantic character, transparent, and forward programs spanning events
  688–876, with exact MRT, D32S8, and Post-VS replacement evidence;
- compute replacement validation that compares every active UAV output, in
  addition to color, depth/stencil, and Post-VS data.

The posed asset is located at
`Assets/model/endfield_luoxi/luoxi_capture.gltf`. Its adjacent profile now
drives 13 event-local BasePass programs through the unified `RenderPrimitive`
frame-submission data flow. Root/node transforms, visibility,
camera history, and
directional-light state remain live editor data; only the shader ABI, material
textures, captured pose rows, and pass-local constants come from extraction.

## Character geometry and BasePass

The character is stored in Unity GPU arenas rather than one interleaved mesh.
Most draws bind resource 41629 multiple times with different offsets and
strides. These bindings describe independent vertex streams in a single
16 MiB allocation:

- position and packed normal;
- UV and packed tangent/previous-position data;
- skin weights and joint indices;
- a zero-stride fallback attribute;
- the index range for one submesh.

Resource 249 is the current/previous bone-row buffer. The vertex shader reads
three float4 rows per bone and blends one, two, or four influences according to
the entity record flags. The posed preview applies those exact rules, then the
captured entity object matrix. Its world-space bounds are approximately
`0.91 × 1.59 × 0.80 m`, which confirms the stream mapping and skinning result.

This is the character **ColorPass 5** boundary: render-pass begin 445/end 525,
character events 453–512. Events 518/524 in the same render pass are not
character BasePass sections. The exported action list does not retain the
viewer-generated ColorPass label; the five attachments and event range identify it.

The five BasePass attachments are:

| Target | Resource | Format | Working semantic |
|---|---:|---|---|
| RT0 | 28345 | R11G11B10_FLOAT | scene/emissive contribution |
| RT1 | 28296 | R10G10B10A2_UNORM | encoded motion vector |
| RT2 | 28293 | R10G10B10A2_UNORM | entity/material flags |
| RT3 | 28284 | R10G10B10A2_UNORM | octahedral encoded normal |
| RT4 | 28290 | R8G8B8A8_SRGB | base color/material mask |
| DSV | 28259 | D32S8 | reversed-Z depth and stencil |

Events 453–506 use `GreaterEqual` depth and write stencil. Event 512 reuses
the event-501 hair geometry with front-face culling and a vertex-stage mask
texture; it is a dedicated outline/shell draw rather than another opaque
submesh.

The preview can be loaded after building the editor:

```text
scene.load -path model/endfield_luoxi/luoxi_capture.gltf
editor.screenshot -path D:\Capture\endfield-luoxi-preview.png
```

## Semantic replacement rules

The SPIRV-Cross files are evidence, not shippable semantic shaders. Each
Endfield shader replacement must:

1. retain its event-local program identity unless two events have the same
   original SPIR-V SHA-256;
2. preserve descriptor set and binding numbers while translating them to DX12
   register spaces;
3. name vertex streams, constant domains, texture roles, interpolants, and
   outputs by meaning;
4. preserve operation order for packed normal decoding, skinning, material
   evaluation, stencil writes, temporal reconstruction, and color conversion;
5. pass a replacement comparison against the original RenderDoc event before
   it is marked complete.

The current extraction shows three Vulkan descriptor spaces in the BasePass.
Peanut now allocates dynamic constants by `(stage, register space, register)`,
so `b0, space1` and `b0, space2` no longer alias. Raw `ByteAddressBuffer`
resources and the captured `R16G16B16A16_UNORM`, `R8G8B8A8_SNORM`, and
`R8G8B8A8_UINT` vertex formats are also supported by the lossless mesh path.

All seven unique BasePass VS/PS identities now have operation-preserving,
fully semantic HLSL replacements under `Assets/shader/endfield`. Replacement
replays cover events 453, 458, 464, 477, 482, 501, 506, and 512. Every checked
stage produces zero differing bytes in all five MRT attachments and D32S8;
every vertex replacement also produces zero differing Post-VS bytes.

The initial SPIRV-Cross round trip exposed a real interface problem: DXC
compressed sparse Vulkan locations when only the generated `TEXCOORD`
semantics were retained. The semantic sources now add explicit
`[[vk::location]]` attributes only when `ENDFIELD_CAPTURE_VALIDATION` is
defined. Their normal DX12 form uses the captured mesh's `POSITION`, `NORMAL`,
`COLOR`, `TANGENT`, `TEXCOORD`, `BLENDWEIGHT`, and `BLENDINDICES` interface.
Changing those DX12 semantic labels leaves stripped validation SPIR-V
identical for all seven vertex identities. The same sources compile with FXC
for `vs_5_1`/`ps_5_1`, which preserves register spaces for the runtime adapter.

The semantic replacements now also back the runtime BasePass. The custom pass
removes the capture world translation, applies the live object transform, and
packs current/previous object and camera matrices into the original ABI. The
capture-validation branch retains Vulkan clip and texture conventions; the
DX12 runtime branch performs only the required API coordinate conversion.

## Runtime integration status

The active Endfield graph is isolated from the ZZZ and Azur graphs:

| Stage | Runtime status |
|---|---|
| events 453–512 BasePass | all 13 event-local semantic programs active |
| normal resolve | Endfield octahedral decode active |
| events 688–876 geometry lighting | all 33 event-local semantic programs active |
| events 881–921 DOF | all 11 semantic compute stages active |
| event 929 scene copy and events 935–939 VFX | captured copy plus all three semantic geometry programs active |
| events 948–966 temporal resolve | all three semantic stages active |
| events 971–1035 Bloom | exact prefilter, 8-level downsample, and 8-level upsample pyramid active |
| events 1039–1047 secondary glare | semantic prefilter and two-level downsample chain active |
| event 1055 Tonemap/UberPost | captured constants and 1024×32 LUT active; semantic VS/PS replacement exact |
| event 1061 character backdrop | semantic geometry pass active with live camera, root transform, depth rejection, and captured premultiplied blend |
| event 1070 final blit | captured final presentation program active |
| deferred events 669–677 | all three semantic programs active with combined read-only DSV/SRV depth state |

The split between the early lighting pass and the final output pass is
intentional. Lighting feeds the Endfield-specific Bloom pyramid;
`EndfieldLuoxiOutputPass` then consumes its final upsample level and writes
`characterPostHDR`, which the final presentation pass copies without adding
another tonemap or FXAA curve. The runtime pyramid preserves the captured
three-program structure: one prefilter identity, one downsample identity reused
by eight event-local levels, and one upsample identity reused by eight levels.

The runtime view ABI now updates every current/previous view, projection,
inverse, world-to-clip, camera-position, depth-reconstruction, viewport, and
temporal-jitter field consumed by BasePass and geometry lighting. Event 801's
alternate `space3 b0/b1` view layout is patched through the same live camera
source. Event 1061 remains a separate Endfield-only pass while its geometry and
root transform come from the same `RenderPrimitive` and lossless RenderData as
the character. Its validation branch keeps the captured fixed depth bias; the
interactive branch scales that reversed-depth bias when the live camera changes
near-plane projection or distance. Revalidating the semantic pixel shader at
event 1061 produced zero changed bytes in the 19,814,400-byte color target and
the 24,768,000-byte depth/stencil target.

The scene-transition copy writes a dedicated pre-temporal scene target before
the three captured VFX draws. Its validation branch retains the Vulkan UV
orientation byte-for-byte; the DX12 branch samples from the top-left runtime
origin so the later captured final blit does not introduce an extra vertical
flip. The current deferred integration maps the not-yet-reconstructed upstream
screen-lighting mask (capture resource 28333) to a white fallback. This keeps
the three deferred programs live without pretending that the earlier auxiliary
mask-production boundary has already been recovered.

Event 1070 deliberately writes zero alpha. The editor viewport must therefore
use an opaque presentation SRV (RGB from the texture, alpha forced to one),
otherwise ImGui blends the entire image away. `editor.screenshot` likewise
exports opaque alpha; `render.resource.hash` continues to inspect unmodified
attachment bytes. A nonempty screenshot RGB image alone does not verify that
the desktop viewport is visible.

### CLI runtime regressions (2026-09-26)

Assimp's redundant-material optimization merged face-skin event 477 into the
eye material 453, and similarly merged several body sections. The custom pass
then selected the wrong BasePass program. Models with a character-profile
sidecar now retain material identities. CLI screenshots confirm that the red
face/open-mouth artifact and incorrect outfit/accessory materials are gone.

The PNMesh now owns 50 sections. Every lighting event preserves its own input
streams and declaration; it no longer borrows BasePass streams or substitutes
slot 0 for missing slot 3. Passes resolve PNMesh event identity and the actual
owning node separately, including visibility. Regression tests cover all 33
lighting input contracts, distinct equal-preview materials, and root-node offsets.

The view patch preserves the captured negative-determinant camera basis and
distinguishes full from camera-relative world-to-clip matrices. Vulkan winding
is converted for D3D rasterization, and live directional-light constants store
the propagation vector expected by the captured shaders.

The pale portrait is the captured event-1061 backdrop, not temporal ghosting.
CLI node-hide/show comparison isolates it. Its D3D depth lookup now converts
the projected Vulkan Y coordinate to the live top-left depth texture; the old
lookup sampled the floor at the portrait's head and caused rectangular clipping.
The capture-validation branch retains the original coordinate convention.

Latest visual evidence: `D:/Capture/endfield-luoxi-cli-verified.png`;
isolated character: `D:/Capture/endfield-luoxi-cli-backdrop-isolated.png`.
All 21 CTest tests, including the CLI smoke test, passed. These runtime fixes
do not establish pixel identity with the original frame: environment, auxiliary
lighting inputs, and final image matching still need separate verification.

The updated backdrop pixel shader was also compiled with
`ENDFIELD_CAPTURE_VALIDATION=1` and replaced through the CLI replay validator.
`captures/endfield-luoxi-rdc/validation/e1061-cli-depthuv-capture.json` records
zero differing bytes in RT0 (19,814,400 bytes) and depth/stencil (24,768,000 bytes).
The face-skin BasePass pixel shader was independently recompiled and replayed
at event 477. `validation/e477-cli-face-basepass.json` records zero differing
bytes across all five MRTs (19,814,400 bytes each) and depth/stencil (39,628,800 bytes).

## Deferred lighting boundary

Events 669, 673, and 677 are now fully semantic and exact-replacement checked.
They share the same physical GBuffer inputs but retain independent program and
binding identities:

| Event | Original VS / PS | Semantic program | Material decode |
|---:|---:|---|---|
| 669 | 46535 / 46536 | `LuoxiDeferredPrimaryLighting` | primary metallic-roughness fields |
| 673 | 46540 / 46541 | `LuoxiDeferredPackedMaterialLighting` | packed layered-material fields |
| 677 | 46545 / 46546 | `LuoxiDeferredDualLayoutLighting` | bit 7 selects one of two GBuffer layouts |

All three read resource 28281 as reversed-Z depth, 28293 as packed
material/entity data, 28284 as encoded normal and surface data, 28290 as base
color/material data, and 28333 as the full-resolution screen lighting mask.
The semantic programs then reconstruct world position, decode the octahedral
normal, traverse resource 28270's clustered-light bit lists, sample the D16
shadow atlas, blend the reflection-probe atlas, and apply height and volumetric
fog before writing HDR resource 28345.

For every event, replacing the PS produced zero differences across all
19,814,400 bytes of the HDR target and all 39,628,800 bytes of D32S8. Replacing
the pass-local VS additionally produced zero differences across the 96-byte
Post-VS result. The original VS hashes are identical, but the semantic sources
remain separate so the pass identities cannot be conflated. All six files
compile with FXC Shader Model 5.1 and the normal DXC optimization mode is exact
for Vulkan replacement.

The first geometry lighting identity is also complete. Events 688, 692, 696,
721, and 725 all use modules 35418/35419, so they share one semantic
`LuoxiBodyLighting` program. Event 688 replacement checks both active targets:
19,814,400 bytes of HDR scene color and 19,814,400 bytes of packed motion,
plus 39,628,800 bytes of D32S8, all with zero differences. The vertex check
also compares 150,624 Post-VS bytes at a 144-byte stride with zero differences.
This program consumes the original multi-stream geometry, skin rows, material
textures, clustered-light lists, shadow data, probes, and fog constants; it is
not a screen-space approximation of the character.

Event 701's face/skin program is complete. Both MRTs and D32S8 remain exact for
the semantic VS, and all 338,832 Post-VS bytes match at a 144-byte stride.
Recompiling the PS from either semantic or untouched SPIRV-Cross HLSL changes
41,904 bytes in RT0; default DXC, `-O0`, and DXC 1.8 all reproduce that
compiler-induced difference. The accepted PS instead retains the captured
instruction stream and injects 3,136 semantic object/result names and 275
constant or entity member names. Its RT0, RT1, and D32S8 SHA-256 values are identical to
the originals, with zero differing bytes. The capture-exact module and its
fully named assembly are generated by
`Build-EndfieldLuoxiSemanticSpirv.py` under
`Assets/shader/endfield/capture-exact`.

The rest of the geometry-lighting boundary through event 876 is complete as
well. The event-local program and validation details are recorded in
`pipeline-map.md`; the completed groups are:

| Events | Programs | Exact replacement evidence |
|---:|---:|---|
| 688–751 | 10 character lighting programs | two MRTs, D32S8, and Post-VS |
| 757–801 | 6 transparent/secondary programs | two MRTs, D32S8, and Post-VS |
| 834–876 | 8 forward accent programs | two MRTs, D32S8, and Post-VS |

Events 701, 706, 711, 716, 730, 735, 740, 751, 770, 775, 780, 795, 853,
and 858 use capture-exact semantic PS modules because recompiling their HLSL
changes at least one attachment byte. The generator preserves raw numeric IDs,
adds only `OpName` and `OpMemberName`, validates the module, and requires the
remaining SPIR-V word stream to be identical to the captured module. All other
programs in this boundary recompile from semantic HLSL with zero differences.

## Validated post boundary

The following post programs are fully semantic and exact-replacement checked:

| Events | Original module | Semantic program | Validation target |
|---:|---:|---|---|
| 971 | 29300 | `LuoxiBloomPrefilterCS` | 1720×720 R11G11B10 UAV |
| 975–1003 | 29302 | `LuoxiBloomDownsampleCS` | event 975, 860×360 R11G11B10 UAV |
| 1007–1035 | 29304 | `LuoxiBloomUpsampleCS` | event 1007, 13×6 R11G11B10 UAV |
| 1039 | 1883 | `LuoxiSecondaryGlarePrefilterCS` | 860×360 R11G11B10 UAV |
| 1043–1047 | 1890 | `LuoxiSecondaryGlareDownsampleCS` | capture-exact 430×180 and 215×90 R11G11B10 UAV chain |
| 1055 | 29308 | `LuoxiTonemapUberPostPS` | 3440×1440 R8G8B8A8 plus D24S8 |

The pyramid deliberately reuses one downsample module and one upsample module.
Per-level dimensions, inverse dimensions, dispatch groups, and source/destination
resources remain event-local data. The Tonemap/UberPost replacement includes
the captured five-tap antialiasing, Bloom composite, vignette, log color
mapping, 1024×32 LUT lookup, linear-to-sRGB conversion, and output dithering.
The secondary-glare prefilter is an exact ordinary-HLSL replacement. Its
shared downsample module retains the captured SPIR-V 1.3 executable word stream
and adds semantic debug names only, so events 1043 and 1047 cannot acquire a
compiler-induced arithmetic or subgroup difference.
DOF events 881–921 and temporal resolve events 948–966 are now fully semantic
and exact-replacement validated as well. `LuoxiDofTemporalPrefilterCS` and
`LuoxiTemporalResolvePS` require `-O0`: DXC's default optimizer reassociates
their long floating-point reductions. The default build changed 9,983 bytes
in the temporal DOF color output and 34 half-float bytes in TAA, while `-O0`
preserves the captured operation order and produces zero differences. This is
a per-program compile contract, not a global shader setting.

The validated DOF chain consists of:

| Event | Semantic program | Outputs checked |
|---:|---|---|
| 881 | `LuoxiDofCircleOfConfusionCS` | full-resolution signed CoC |
| 885 | `LuoxiDofTemporalPrefilterCS` | half-resolution CoC and color |
| 889 | `LuoxiDofCocDilateCS` | quarter-resolution dilated CoC |
| 893 | `LuoxiDofCocSmoothCS` | quarter-resolution smoothed CoC |
| 897 | `LuoxiDofHorizontalKernelCS` | two complex bokeh buffers and coverage |
| 901 | `LuoxiDofVerticalKernelCS` | first half-resolution DOF layer |
| 905 / 909 | `LuoxiDofCoverageHorizontalCS` / `LuoxiDofCoverageVerticalCS` | separable coverage filter |
| 913 / 917 | `LuoxiDofLayerHorizontalCS` / `LuoxiDofLayerVerticalCS` | second complex DOF layer |
| 921 | `LuoxiDofCompositeCS` | full-resolution composited scene color |

The TAA boundary uses `LuoxiTemporalPreparePS`, `LuoxiTemporalMaskPS`, and
`LuoxiTemporalResolvePS`. It preserves neighborhood depth selection, packed
motion/class flags, history reprojection, bicubic cross sampling, neighborhood
moments and clipping, disocclusion rejection, and final history confidence.

The surrounding output boundary is exact as well. `LuoxiSceneCopy` validates
both HDR/motion MRTs, D32S8, and Post-VS at event 929. The shared
`LuoxiVfxOverlay` program was validated independently at events 935, 937, and
939 with their different bound textures and constants. After Tonemap,
`LuoxiCharacterBackdrop` and `LuoxiFinalSceneBlit` preserve the full-resolution
color target, D24S8, and Post-VS bytes at events 1061 and 1070.

## Local analysis outputs

Large capture outputs remain under `captures/endfield-luoxi-rdc` and are not
source assets. The important local entry points are:

- `analysis/frame-passes.json`: full pass contracts;
- `analysis/pass-summary.tsv`: compact dependency table;
- `analysis/shaders`: original SPIR-V and RenderDoc disassembly;
- `analysis/shaders/cross-hlsl`: mechanical HLSL decompilation;
- `analysis/snapshots`: key intermediate render targets;
- `character/manifest.json`: BasePass draw, buffer, texture, and constant data;
- `character/texture-contact-sheet.png`: extracted material overview.

The current Peanut preview after the 13-section conversion is
`captures/endfield-luoxi-rdc/peanut-preview-13-section.png`.
