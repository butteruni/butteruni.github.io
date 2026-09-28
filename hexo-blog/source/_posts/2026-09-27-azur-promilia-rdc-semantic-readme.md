---
title: "Azur Promilia RDC shader replacement status"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-28T20:56:00+08:00"
permalink: 2026/09/27/azur-promilia-rdc-semantic-readme/
categories:
  - 图形学
tags:
  - astra
  - 技术文档
  - 渲染架构
---

> 由 astra 生成 · 首次发布于 2026-09-27 18:44 · 最近整理于 2026-09-28 20:56（北京时间）

An HLSL source is accepted only after RenderDoc compiles it, replaces the
original shader at the captured event, replays the draw or dispatch, and
reports zero differing bytes for every active render target, depth/stencil
target, and UAV.

The complete runtime post-process matrix covers all 61 captured events and
passes **61/61**. Every source used by the runtime has semantic constant-buffer,
resource, intermediate, and output names; the generator rejects decompiler
register names (`cbN`, `rN`, and `vN`) and the decompiler comparison macro.
The final plan and report are:

<!-- more -->

- `captures/azur-promilia-latest-rdc/validation/runtime-all-semantic-plan-final.json`
- `captures/azur-promilia-latest-rdc/validation/runtime-all-semantic-report-final.json`

Each captured event remains isolated under
`Assets/model/azur_promilia_luoluo/capture/post-programs/<event>` with its
contract, original DXBC and disassembly, constants, resources, samplers, and
fixed state. Runtime nodes share a shader implementation only when the capture
binds the same shader identity. Shared Bloom downsample, upsample, and light
shaft filter implementations still retain separate event constants, bindings,
targets, and graph resources.

Some runtime shaders expose both `PSMain` and `PSCaptureValidation`. `PSMain`
adapts Peanut's D3D12 graph orientation and vertex interface; the validation
entry calls the same semantic algorithm with the D3D11 capture interface. The
matrix uses the validation entry where that interface adaptation is necessary.
Event 1976 is validated as compute, and event 2758 preserves the captured
`/O1 /T ps_4_0 /Gis` compilation contract.

Key repaired semantics include the camera and temporal motion-sign branches,
screen-shadow UAV dispatch, GTAO explicit-level sampling, the 28-byte capsule
AO record, full deferred-lighting and fog instruction flow, and the LUT builder
compiler mode. Event 2687 was rewritten line-for-line with semantic names and
restores the decompiler's lost `float2(1, 1)` branch result.

The runtime graph executes 66 nodes: the 61 captured events plus isolated
orientation, stencil, and cross-API quantization boundaries. The event 2666
boundary reloads the captured event-2665 R11G11B10 output before TAA. It is
required because the already replacement-exact D3D11 shader differs at 25
packed bytes when compiled and executed through D3D12. The boundary is a
dedicated shader and resource contract; it is not mixed with another pass.

The full Bloom pyramid executes each captured downsample and upsample event.
The four light-shaft filter nodes use the captured vertex-generated radial step
and one shared six-sample pixel shader identity. A graph descriptor allocation
check reserves all 88 owned SRV slots; this prevents the last three light-shaft
resources from aliasing the persistent skybox, BRDF, and irradiance slots.

The final event-3506 output in
`captures/azur-promilia-latest-rdc/peanut-final-exact_frame6122.rdc` is
byte-identical to the vertically normalized captured resource 886. The exported
comparison is
`captures/azur-promilia-latest-rdc/validation/peanut-final-exact-post/e3506-characterPostHDR.dds`.

Use `Invoke-RdcShaderReplacementValidation.ps1` for one candidate or
`Invoke-RdcShaderReplacementMatrixValidation.ps1` for a matrix.
