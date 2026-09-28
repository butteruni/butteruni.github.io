---
title: "Remielle Character Rendering Reconstruction"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-28T20:56:00+08:00"
permalink: 2026/09/27/zzz-remielle-rdc-pipeline-map/
categories:
  - 图形学
tags:
  - astra
  - 技术文档
  - 渲染架构
---

> 由 astra 生成 · 首次发布于 2026-09-27 18:44 · 最近整理于 2026-09-28 20:56（北京时间）

Capture: `leimi_all_resource.rdc`

Game: `《绝区零》游戏安装目录`

<!-- more -->

API/frame: D3D11, frame 5469, 3432×1440 internal render size.

## Stage 1: draw-call map

All target draws were selected from bound resources whose names contain `Remielle`, rather than inferred from index counts alone.

| Effect | Events | Mesh/texture evidence | Shader family |
|---|---:|---|---|
| Per-object shadow caster | 5609–5642 | `Remielle_Eyebrow`, `Remielle_Face`, two Hair ranges, two Body ranges, Wings; writes `TempBuffer 261` depth | face/standard shadow-caster variants |
| Hair opaque | 7367 | `Remielle_Hair_*` | `NapAvatarStandard` |
| Body map 2 | 7393 | `Remielle_PasSeul_Body_Map2_*` | `NapAvatarStandard` |
| Body map 1 | 7414 | `Remielle_PasSeul_Body_Map1_*` | `NapAvatarStandard` |
| Wings | 7441 | `Remielle_Wings_*`, including `_T` | `NapAvatarStandard` |
| Face submeshes | 7678, 7697, 7713 | `Remielle_Face_D`, `Female_Face_Lightmap_02`; 7458/2694/120 indices | `NapAvatarStandardFace` |
| Hair-shadow geometry | 7742 | `Remielle_Hair_*`, HairShadow index range | `NapAvatarStandard` variant |
| Inverted-hull outline | 8039–8336 | repeated Remielle meshes, front-face culling | face/standard outline variants |
| Face stencil redraw | 8391, 8410, 8426 | same face submeshes, stencil compare `Equal` against bit `0x04` | `NapAvatarStandardFace` |
| Eye | 9349 | face mesh plus `Eye_E`, `Remielle_Face_D`, face lightmap | `NapAvatarStandardEye` |
| Hair depth/color/outline | 9372, 9402, 9423 | HairShadow range, depth-only then alpha blend then front-cull outline | three `NapAvatarStandard` variants |
| Transparent body map 1 | 11709, 11733, 11759 | Map1 textures; depth/stencil, color, outline | `NapAvatarStandardTransparent` |
| Transparent body map 2 | 11789, 11813, 11838 | Map2 textures; depth/stencil, color, outline | `NapAvatarStandardTransparent` |

## Stage 2: shared pipeline contract

- Opaque character shading writes four MRTs: `R16G16B16A16`, `R8G8B8A8`, and two `R10G10B10A2` targets, plus reversed-Z `D32S8` depth/stencil.
- The opaque pass uses `GreaterEqual` depth with writes enabled. Primary hair/face/wings use back-face culling; both body maps are two-sided.
- Opaque character draws replace stencil with reference `128`. Face redraw and outline variants use explicit masked stencil tests; these passes are part of the character contract, not optional post-processing.
- The main standard PS variants consume the shadow cache, per-entity structured data, overlay texture, D/N/M/A material textures, an optional per-character texture array, and the 2048² scene shadow target.
- Shadowing is split into two resources. Scene geometry writes the four-slice
  `ShadowCacheBufferFor_MainCamera`; events 5609–5642 write avatar-only depth
  into `TempBuffer 261`, which is later consumed by `PerObjectShadowResolve`.
  Replacement A/B at events 7367/7393/7678 proved that disabling the per-object
  samples changes zero bytes for Remielle's Hair/Body/Face in this frame, while
  disabling the environment-cache samples changes 5,396/48,021/14,080 bytes.
  Remielle therefore receives the environment cache but does not receive its
  own per-object map with the captured zero thresholds.
- Hair and transparent body materials use explicit depth/stencil prepasses, blended color passes, and front-culled outline passes. Reproducing only the visible color shader is insufficient.
- Vertex inputs contain skinned position/normal/tangent streams plus static color and multiple UV channels. The captured front-face convention is counter-clockwise and depth is reversed-Z. The exported fixture mirrors display space, so the DX12 adapter validates front-face classification at each draw boundary instead of assuming one converted winding for both the material and expanded-outline vertex paths.

## Unique captured shader set

The mapped draws contain 20 unique shader binaries: 8 vertex and 12 pixel shaders. SHA-256 prefixes used by the working extraction are recorded in `tmp/zzz_leimi/character_pipeline.log`; semantic sources are accepted only after replacement replay reports zero changed bytes for every active color and depth/stencil target.

## Stage 3: lossless semantic reconstruction status

Each completed row has been compiled from the semantic HLSL source, substituted into the original draw, and replayed from the capture. "Exact" means every byte of every active color target and the depth/stencil target matched the unmodified replay.

| Semantic source | Captured shader | Validation event | Result |
|---|---|---:|---|
| `HairDepthVertexShader.hlsl` | VS `60c2c5e85f22...` | 9372 | Exact |
| `HairDepthPixelShader.hlsl` | PS `2e294f9b83d9...` | 9372 | Exact |
| `StandardVertexShader.hlsl` | VS `01bab6897692...` | 7367 | Exact |
| `FaceVertexShader.hlsl` | VS `b61b7c273b62...` | 7678 | Exact |
| `EyeVertexShader.hlsl` | VS `2627a271f903...` | 9349 | Exact |
| `TransparentVertexShader.hlsl` | VS `d7169850ebdd...` | 11709 | Exact |
| `StandardOutlineVertexShader.hlsl` | VS `97348470ed40...` | 8063 | Exact |
| `FaceOutlineVertexShader.hlsl` | VS `1ccfdb4ab91c...` | 8039 | Exact |
| `TransparentOutlineVertexShader.hlsl` | VS `625779dc6b80...` | 11759 | Post-VS exact; RT replay-unstable |
| `StandardOutlinePixelShader.hlsl` | PS `8bae9d3281fa...` | 8063 | Exact |
| `FaceOutlinePixelShader.hlsl` | PS `ac41f5febfa9...` | 8039 | Exact |
| `TransparentOutlinePixelShader.hlsl` | PS `e74abf9ecda1...` | 11759 | Exact on stable replay |
| `HairPixelShader.hlsl` | PS `b1bd46654cbf...` | 7367 | Exact |
| `BodyPixelShader.hlsl` | PS `624eed0d3dc4...` | 7393 | Exact |
| `WingsPixelShader.hlsl` | PS `1591567b9ae2...` | 7441 | Exact |
| `FacePixelShader.hlsl` | PS `67b79e857d1d...` | 7678 | Exact |
| `HairShadowPixelShader.hlsl` | PS `366f22b14828...` | 7742 | Exact |
| `EyePixelShader.hlsl` | PS `27856211fb8b...` | 9349 | Exact |
| `TransparentDepthPixelShader.hlsl` | PS `d3ead8cbe1ea...` | 11709 | Exact |
| `TransparentColorPixelShader.hlsl` | PS `9ebdd76c1d80...` | 11733 | Exact |

All 20 unique shaders now have semantic sources. Nineteen pass the strict whole-target test. The transparent outline VS produces an exact 501,384-byte Post-VS stream (104-byte stride), but its RT0 cannot pass a repeatable zero-difference test because the original draw is not replay-stable: five unmodified replays differed from one another by 35–66 bytes, while replacement replays varied by 15–57 bytes at the same sparse overlap edges. This exception is recorded as capture behavior rather than reported as an exact render-target result.

The transparent outline PS produced 38 differing RT0 bytes on its first validation replay (inside the capture's native 35–66 byte variance), then zero differences on the repeated replay. Its semantic result is therefore accepted using the strict zero-difference run while retaining the instability evidence.

The main opaque hair/body/wings/face/HairShadow/eye shaders and both transparent body shaders retain the exact captured operation order while using semantic names for working values, resources, constant fields, interpolants, render targets, and logical stages. No semantic source retains `r0`-style temporary registers, raw `cbN[index]` accesses, or unnamed bitmask variables. This avoids the arithmetic reassociation and comparison-mask errors observed with higher-level automatic decompilation while making the material, entity-lighting, shadow, LUT, motion-vector, and output stages explicit.

Stage 3 is complete.

## Stage 4: asset recovery

The installed game currently uses the `mhy1` package format. The maintained
AnimeStudio extractor was built locally with the ZZZ/Oodle path enabled, a
combined Persistent/StreamingAssets CAB map, and the Z3 container-path index.
`NapLodController` identifies runtime-loaded discrete meshes that are not stored
on prefab renderer `m_Mesh` fields. Resolving those paths recovered the current
high-detail Body 1, Hair, HairShadow, and Wings meshes. In particular,
`Remielle_Wings.mesh` resolves to block `468088060.blk` and has the same 5,404
vertices / 6,824 triangles as the captured wing input.

`Assets/model/zzz_remielle_passeul/remielle_passeul_game.gltf` is retained as an
experimental deformation-adapter input. It uses unpacked geometry only:
high-detail body, hair, HairShadow, and wings plus the unpacked neutral MainCity
face proxy. It is not the editor-facing runtime asset because the raw
high-detail face does not contain the expression color and UV2/UV3 streams
generated by ZZZ's runtime deformation path. Using it without that
preprocessing visibly corrupts the eyes and mouth.

The capture fixture is again the editor-facing runtime asset as well as the
shader and pass validation reference. It uses the exact active vertex and index
streams from the mapped capture draws. The input contract was verified
independently:

| Stream | Captured layout |
|---|---|
| Position/normal/tangent | VB0, 48-byte stride, three `float4` values |
| Hair/body/wings static data | VB1, 28- or 44-byte stride, RGBA8 color plus UV0-UV3 |
| Face/eye static data | VB1, 48-byte stride, `float4` color plus UV0-UV3 |
| Alternate skinned position | VB3, `float4` position |

The resulting `Assets/model/zzz_remielle_passeul/remielle_passeul_capture.gltf`
contains 20 primitives and 91,688 compact vertices / 128,156 triangles. Twelve
visible primitives retain 53,065 vertices / 75,710 triangles and all four UV
channels; eight color-invisible primitives retain the exact per-object caster
ranges from events 5609–5642. The twelfth visible primitive intentionally
replays the HairShadow range after the eye pass, matching the captured
cross-submesh order. Each primitive is stored under a separate node with the
object transform bound at its source event. This distinction is required:
Hair, Body, Wings, Face, and Eye do not share one object matrix in the capture.
Vertex streams remain in capture-local space so the same node matrix can be
uploaded to the semantic vertex shader. Bound textures are retained as exact
DDS resources with their source formats, mip chains, and array slices; PNG
copies remain inspection-only.

## Stage 5: Peanut integration

Peanut keeps the asset-facing names `zzzHair`, `zzzBody`, `zzzWings`,
`zzzFace`, `zzzFaceMask`, `zzzEye`, `zzzHairShadow`, `zzzHairShadowLayer`,
`zzzTransparent`, and `zzzShadowCasterOnly` as serialization and shadow-routing
tags. They no longer own generic PBR shaders, extra-pass declarations, or the
old 112-byte approximation constants.

`CustomCharacterPass` is the DX12 compatibility pipeline selected by the
asset-side `remielle_passeul_capture.gltf.character-profile.json`. It runs
after the ordinary opaque scene and owns the following capture contract:

- The generic pipeline registry compiles the same semantic sources validated in
  RDC from `Assets/shader/ZZZRemielleSemantic`. Small DX12 adapters only
  complete unused signature lanes rejected by DX12 PSO validation.
- The pass preserves four outputs: `R16G16B16A16_FLOAT` scene color,
  `R8G8B8A8_UNORM_SRGB` lighting mask, and two `R10G10B10A2_UNORM` velocity/flag and
  encoded-normal targets, plus reversed-Z `D32S8` depth/stencil.
- The version-3 profile declares material routing, semantic shader files,
  physical root-range policy, exact static-sampler sets, converted-asset
  winding, target count, and both post-process root-layout policies. Reflected
  VS/PS interfaces are merged into a
  name-independent compatibility key, so compatible programs share generated
  D3D12 root signatures without a handwritten `RootFamily`. CB/SRV bindings plus
  front/back culling, independent
  MRT blend equations, depth writes, stencil masks, comparisons, and operations
  are read from `capture/manifest.json`; event IDs are provenance/snapshot keys
  only and no longer control runtime PSO branches. All 29 source events are
  replayed in order.
- `CharacterPipelineAdapter` converts all 29 manifest draw declarations
  into the ordinary `zzz.remielle.main` pipeline asset. It preserves shader,
  input layout, raster, blend, MRT, depth/stencil, sampler and binding contracts;
  capture resource IDs remain adapter metadata rather than becoming generic
  schema fields. The main asset, normal-output resolve, and both post programs
  use the same deterministic `.pnsh` artifact path. Each artifact contains
  bytecode, reflected interfaces, normalized source/include/profile
  fingerprints, adapter ABI, compiled root layout, and the normalized semantic
  binding plan. A valid cache hit
  restores these objects without HLSL compilation or reflection; editor reload
  rebuilds stale entries and swaps pipelines only after every stage succeeds.
- Each physical stage/kind/register input has a unique source identity even when
  D3D11 reused one resource ID after rewriting its contents. Staging compiles
  those identities to binding source indices; the host only supplies dynamic
  CBV addresses and SRV descriptors before the generic executor creates the
  binding packet. The pass no longer owns shader compilation, input layout,
  root signature, PSO, fixed-state parsing, or a manual root-binding loop.
- `shader.reload` re-reads the profile and stages the main, normal-resolve, and
  post generations before either captured pass goes live. A forced missing
  primary-lighting shader rejected the post generation after main staging;
  the retained frame matched the pre-reload screenshot at every pixel. Restoring
  the profile produced a successful reload with the same zero-difference result.
- Every program loads its own reflected VS/PS constant ranges from
  `capture/programs/<event>/{vs,ps}_bN.bin`. This is necessary because material
  buffers with the same D3D11 resource ID are rewritten between Hair, Body,
  Wings, Face, outline, eye, and transparent draws.
- Runtime adaptation uses byte-compatible typed views for object, scene, eye,
  HairDepth, environment-shadow, entity-light, and entity-record constant
  domains. Every known field is named and guarded with compile-time size/offset
  assertions; draw code contains no raw `buffer + register * 16` writes.
- Exact DDS inputs retain BC1/BC6/BC7, float, typeless-depth view, mip, and array
  semantics. Static samplers reproduce linear-min/mag point-mip filtering,
  wrap/clamp modes, anisotropic material sampling where present, and the
  captured `Greater` comparison function.
- Four UV channels, vertex color, normals, tangents, and the alternate-position
  stream reach the semantic vertex programs without semantic aliases. The
  capture-local input is transformed by its own draw node, then the adapter
  patches camera/world-space fields consistently for the Peanut view.
- At the compatibility boundary, source scene color remains `sceneHDR`; the
  encoded-normal MRT is explicitly decoded into Peanut's `gnormal`. The three
  original auxiliary MRTs remain graph resources instead of being discarded.

The fixed compatibility nodes are now described by the generic
`post.pipeline.json` asset. One asset-owned execution DAG orders normal resolve,
primary lighting, and LUT composite. The normal-resolve slice remains at the end
of `CustomCharacterPass`, before SSGI and Outline consume `gnormal`; the final
two-node slice remains in `RemiellePostPass`. Both slices use the generic
executor, reflected binding/provider plans, typed graph attachments, and staged
generation preview. The character profile no longer duplicates shader paths,
root layouts, root-parameter indices, or PSO state for these nodes. The post slice replays
the semantic form of event 10165 against the four character targets and writes
`characterPrimaryLighting` plus `characterPrimaryFlags`. Character pixels then use the exact
event-12209 `InternalLut:General` DDS and its captured logarithmic 1024x32 strip
addressing. Non-character pixels keep Peanut's existing ACES/bloom path, and
FXAA consumes `characterPostHDR` without applying a second tone curve. The large
event-10165 shader retains validated temporary-register arithmetic order while
giving its resources, constants, interpolants, outputs, and logical boundary
semantic names. Runtime camera/depth/viewport updates use a typed 185-register
ABI view with `sizeof`/`offsetof` guards; the HLSL mirrors these fields through
explicit semantic `packoffset` declarations instead of `sceneGlobals[n]`.

Character shading does not sample Peanut SSAO or SSGI. The extracted
environment-shadow and character-shadow textures are immutable profile inputs.
Peanut's ambient and directional
light now cross the capture ABI at all three points used by the source pipeline:
the main/eye scene constants, the selected `EntityGpuRecord`, and event 10165's
primary-lighting resolve. Direction rotates both the face-SDF/entity-light
position and the atmosphere vector; color and intensity update the entity light,
fallback radiance, and atmosphere intensity. Fixed constant snapshots remain
available only to the offline RDC replacement-validation tools.

### Validation status and remaining limits

`render.resource.hash` reads subresource 0 after GPU idle and hashes the exact
unpadded rows together with format and dimensions. The old fixed-light hashes
are no longer a valid normal-mode gate because runtime light changes are
intentional. At 1920x1080, with white directional light at intensity `1.0`, the
following A/B proves that direction reaches both the character material output
and the primary-lighting resolve. Disabling the light produces a third distinct
result rather than retaining capture lighting:

| Directional-light state | `sceneHDR` | `characterPrimaryLighting` |
|---|---|---|
| direction `(1, 0, 0)` | `5ad682ac800f6bb978766b2ab32d2434` | `cc1e588ec42eb2ae5e8c8f78e20235a6` |
| direction `(-1, 0, 0)` | `10d5242c446201ba7aa3e17972b13151` | `9b243bb1e58d3031985ce90db00d241b` |
| disabled | `6eb4e6dd2675806632902f50c3fd8a84` | `91b7bd5acc56afa6a437f7f137397230` |

- All 29 DX12 PSOs compile transactionally through the generic registry. The
  standalone cook emits all 29 main artifacts and reloads them with
  `TrustArtifact`; the frozen-input semanticization gate remained stable before
  and after `shader.reload` when the old pass-owned pipeline path was removed.
  Runtime-light validation now uses the explicit A/B gate above. A live RenderDoc capture
  (`captures/remielle_dedicated_frame15257.rdc`) identifies the character draws
  at events 209–1049 and confirms the four distinct MRTs survive through the
  final character event.
- Per-draw matrix validation exposed and fixed the earlier shared-Hair-matrix
  asset bug. The fixture now loads 20 separate draw nodes, and Face/Body/Wings
  align in the recovered pose. Eye visibility keeps Back culling in the runtime;
  the extracted eye shell retains its independently verified asset winding.
- All four UV sets are pre-flipped in the fixture to cancel Assimp's glTF V
  conversion, and every draw receives its own ten captured VS/PS constant-buffer
  snapshots. The environment and per-object shadow DDS resources use typeless
  resources with the captured `R16_UNORM` shader views.
- Wings are verified at both DX12 draw boundaries. Matching the Post-VS streams
  by position, UV, normal, and tangent gives a one-to-one map for all 5,404
  vertices; all 6,824 imported triangles have the opposite winding from their
  source triangles. The runtime therefore classifies the converted range as CW
  for both the material and outline draws (the eye shell remains the documented
  non-reversed exception). In
  `captures/remielle_wings_exact_winding_frame1027.rdc`, DX12 events 336 and 606
  preserve the same interior samples as source events 7441 and 8117: point
  `(1900,550)` is `(0.349121,0.430176,0.511230)` and point `(1870,650)` is
  `(0.221924,0.281250,0.418457)` before and after the outline.
- Event 10165 and the General LUT are active in the normal editor path. At the
  exact 3432x1440 capture viewport, DX12 event 1264 also reproduces source event
  10165 at the two wing samples above: `(0.339844,0.417969,0.500000)` and
  `(0.210938,0.273438,0.406250)`. This validates the main, outline, and first
  lighting-resolve boundaries; it does not claim the unreconstructed tail of the
  final post chain is pixel-exact.
- The D3D11 gate remains 19 strict whole-target matches plus one documented
  replay-unstable transparent-outline VS. The DX12 pass uses those exact sources
  and captured inputs, but a strict cross-API pixel comparison still requires a
  3432×1440 captured-camera replay target; the normal editor camera is an adapted
  view and is not a valid pixel-diff baseline.
- The source global post chain still contains the event-10548 ambient/scene
  composite, volumetric-fog composition, TAA, NAP bloom, and camera motion blur.
  Those stages are not yet reconstructed. Event 10165 and the active General LUT
  path are present, but the final display image is not claimed to be pixel-exact.
- The fixture is a static captured pose and the captured-character pass currently accepts
  one active profile at a time. Skeleton/animation recovery, live CSM substitution, source
  post reconstruction, and multi-instance descriptor pooling remain separate
  follow-up stages.
