---
title: "Remielle semantic shader sources"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-28T20:56:00+08:00"
permalink: 2026/09/27/zzz-remielle-rdc-semantic-readme/
categories:
  - 图形学
tags:
  - astra
  - 技术文档
  - 渲染架构
---

> 由 astra 生成 · 首次发布于 2026-09-27 18:44 · 最近整理于 2026-09-28 20:56（北京时间）

The runtime semantic HLSL reconstructions for every unique shader used by the
mapped Remielle character draws in `leimi_all_resource.rdc` live in
`Assets/shader/ZZZRemielleSemantic`. They were moved into the runtime asset tree
after replacement validation so Peanut compiles the validated sources directly.
This document records their naming and validation contract.

## Naming contract

- Texture and sampler identifiers describe the bound capture resource: base color, normal, material mask, character overlay, character LUT, environment shadow, scene shadow, and material-specific effect inputs.
- Constant buffers are separated into scene, object, environment-shadow, lighting, and material domains. Captured offsets are expressed as named `packoffset` fields. The Body shader retains one explicitly named dynamic `materialData` table because the shader selects effect records at runtime.
- Vertex-to-pixel interpolants use the meanings established by the lossless vertex reconstructions: UV sets, tangent frame plus packed world position, view/previous clip position, entity controls, and additional light.
- Opaque character outputs are named `sceneColor`, `lightingMask`, `velocityAndFlags`, and `encodedNormal`. Transparent passes name their single blended color payload directly.

## Lossless operation ordering

The eight large pixel shaders use semantic working-value names and named constant fields while preserving the captured operation order. A component-SSA decompiler produced more compact expressions, but replacing the Face shader with that output changed RT0, RT2, and RT3. Reassociation, fused operations, and boolean-mask reconstruction are observable after render-target quantization.

<!-- more -->

No source in `Assets/shader/ZZZRemielleSemantic` retains `r0`-style temporary
registers, raw `cbN[index]` accesses, or unnamed bitmask variables. `DxbcMask`
remains as a documented semantic helper because DXBC comparisons produce
all-bits-set values consumed by captured bitwise selects. Any later arithmetic
consolidation or helper extraction must independently pass the same all-target
byte comparison before replacing these sources.

## Validation gate

Each source is compiled by RenderDoc, substituted at the original event, and compared byte-for-byte against every active color target and depth/stencil target. Vertex replacements additionally compare Post-VS data where needed. Nineteen of the twenty shaders are strict whole-target matches; `TransparentOutlineVertexShader.hlsl` is Post-VS exact, while its original render-target replay is itself nondeterministic at a small number of overlap-edge bytes.
