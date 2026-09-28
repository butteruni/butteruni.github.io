---
title: "Endfield Luoxi capture pipeline map"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-28T20:56:00+08:00"
permalink: 2026/09/27/endfield-luoxi-rdc-pipeline-map/
categories:
  - 图形学
tags:
  - astra
  - 技术文档
  - 渲染架构
---

> 由 astra 生成 · 首次发布于 2026-09-27 18:44 · 最近整理于 2026-09-28 20:56（北京时间）

This map records observed resource flow. Names marked **inferred** still need a
shader-level replacement comparison before becoming final semantic names.

| Events | Stage | Evidence and current interpretation |
|---:|---|---|
| 217–235 | environment lookup setup | Builds 256×64, 32×32, and 128×128 R11 lookup textures. |
| 240–258 | GPU scene preparation | Six compute programs update scene, skinning, and lighting buffers before geometry. |
| 266–272 | local lookup/mask | Produces a 256×256 R16G16 texture. |
| 287–343 | character shadow A | Four validated semantic identities replay the character into a 4096×2048 D16 atlas; depth and Post-VS are exact. |
| 367–432 | character shadow B | The shared opaque/alpha identities and a pass-local atlas-tile program render a 6144×4096 D16 atlas; depth and Post-VS are exact. |
| 453–512 | character BasePass | Five MRTs plus D32S8. Event 512 is the front-culled hair outline/shell draw. |
| 518–524 | non-character geometry | Final opaque/decal draws into the same GBuffer. |
| 542–565 | depth/packed-buffer copies | Extracts full-resolution R32 depth and copies one packed GBuffer. |
| 570–601 | depth hierarchy and tiled data | Builds an R32 depth pyramid and R8G8 tiled auxiliary data. |
| 609–620 | half-resolution lighting auxiliary | Produces 1720×720 depth and RGBA16F lighting data. |
| 629–660 | AO and screen masks **inferred** | Quarter-resolution R8 evaluation/filter and full-resolution R8G8 composition. |
| 669–677 | deferred scene lighting | Three validated, pass-local semantic variants consume the GBuffer, clustered-light lists, shadow atlas, reflection probes, and fog volumes into HDR scene color. |
| 688–751 | character lighting | Re-renders character geometry into HDR scene color and packed flags using GBuffer, both shadow atlases, probes, ramps, and material textures. |
| 757–801 | transparent/secondary character lighting | Re-renders selected submeshes with transparent/secondary material programs. |
| 810–828 | depth and scene-color transition | Copies depth and moves HDR scene color to resource 28287. |
| 834–876 | forward accents and character extras | Adds small meshes, eye/hair passes, and final character highlights. |
| 881–921 | depth of field | Eleven validated semantic compute passes convert depth to signed CoC, perform temporal prefiltering, dilate/smooth CoC, build two complex separable bokeh layers, filter coverage, and composite full-resolution HDR. |
| 929 | scene copy | Validated semantic copy writes reconstructed HDR and packed motion; two MRTs, D32S8, and Post-VS are exact. |
| 935–939 | VFX overlays | Three validated uses of one semantic 900-index program add texture-driven scene effects; both MRTs, D32S8, and Post-VS are exact at every event. |
| 948–966 | temporal resolve | Three validated semantic passes prepare depth/motion/class data, create a quarter-resolution rejection mask, and resolve current/history color into RGBA16F. |
| 971 | Bloom prefilter/downsample | Validated semantic compute shader 29300; 3440×1440 → 1720×720. |
| 975–1003 | Bloom downsample | Validated shared semantic compute shader 29302 builds 860×360 through 7×3. |
| 1007–1035 | Bloom upsample | Validated shared semantic compute shader 29304 combines adjacent pyramid levels back to 1720×720. |
| 1039–1047 | secondary glare chain | Validated semantic prefilter plus capture-exact semantic downsample build 860×360, 430×180, and 215×90 R11 textures from scene color and a 1024×32 LUT. |
| 1055 | Tonemap/UberPost | Validated semantic shader 29308 combines antialiasing, scene color, Bloom, vignette, LUT, sRGB conversion, and dithering into R8G8B8A8. |
| 1061 | character backdrop overlay | Validated semantic overlay adds the pale character silhouette; color, D24S8, and Post-VS are exact. |
| 1070 | final scene blit | Validated semantic blit writes swapchain resource 459; color, D24S8, and Post-VS are exact. |
| 1076–1504 | UI | Draws the character menu and HUD after scene presentation. |

<!-- more -->

## BasePass programs

| Event | Indices | VS / PS | Primary textures | Role |
|---:|---:|---|---|---|
| 453 | 1,356 | 34706 / 34707 | face atlas 54644 | facial part |
| 458 | 840 | 34706 / 34707 | eye atlas 54626 | eyes |
| 464 | 2,766 | 34718 / 34719 | color 54508, normal 54576 | body group A |
| 468 | 59,679 | 34718 / 34719 | color 54508, normal 54576 | body group B |
| 472 | 14,958 | 34718 / 34719 | color 54508, normal 54576 | body group C |
| 477 | 10,590 | 34709 / 34710 | face atlas 54644 | face/skin |
| 482 | 23,220 | 34725 / 34726 | color 54499, normal 54618 | skin group |
| 487 | 46,845 | 34718 / 34719 | color 54603, normal 54532 | red outfit A |
| 491 | 14,280 | 34718 / 34719 | color 54603, normal 54532 | red outfit B |
| 496 | 888 | 34718 / 34719 | color 54603, normal 54532 | red outfit C |
| 501 | 41,307 | 34727 / 34728 | color 54433, mask 54440 | hair group A |
| 506 | 18,471 | 53112 / 53113 | color 54456, normal 54465, mask 54250 | hair group B |
| 512 | 41,307 | 34768 / 34769 | vertex mask 54266 | front-culled outline/shell |

Repeated resource IDs are not accidental shader sharing. Programs remain
event-local; original SPIR-V hash equality is the only accepted basis for
sharing semantic source.

## Character shadow programs

| Events | VS / PS | Semantic program | Role | Validation |
|---:|---:|---|---|---|
| 287–333, 381–427 opaque draws | 6094 / 6095 and byte-identical aliases | `LuoxiCharacterShadowOpaque` | skinned opaque depth | events 287 and 381: D16 + Post-VS exact |
| 343 | 6096 / 6097 | `LuoxiCharacterShadowDitheredCutout` | stochastic alpha-tested depth | D16 + 26,752 Post-VS bytes exact |
| 338, 432 | 27734 / 27735 | `LuoxiCharacterShadowAlphaCutout` | threshold alpha-tested depth | events 338 and 432: D16 + 161,696 Post-VS bytes exact |
| 367, 374 | 28472 / 28473 | `LuoxiShadowAtlasTile` | full-screen shadow-atlas tile initialization | event 367: D16 + 48 Post-VS bytes exact |

The opaque aliases are shared only where both original stage hashes are
identical. The two alpha variants keep separate semantic sources because their
pixel programs implement different coverage tests and have different original
SPIR-V hashes.

## Deferred lighting programs

| Event | VS / PS | Semantic program | GBuffer interpretation | Validation |
|---:|---:|---|---|---|
| 669 | 46535 / 46536 | `LuoxiDeferredPrimaryLighting` | metallic, roughness, base color, material response index | HDR + D32S8 + Post-VS exact |
| 673 | 46540 / 46541 | `LuoxiDeferredPackedMaterialLighting` | three packed material words, layered diffuse/specular parameters | HDR + D32S8 + Post-VS exact |
| 677 | 46545 / 46546 | `LuoxiDeferredDualLayoutLighting` | material bit 7 selects extended or table-driven layout | HDR + D32S8 + Post-VS exact |

The three original vertex modules have the same SHA-256, but each semantic VS
is retained beside its event-specific PS. The pixel programs have distinct
hashes and distinct constant layouts. They must not be shared with one another
or with any other game's deferred pass.

## Character lighting programs

| Events | VS / PS | Semantic program | Role | Validation |
|---:|---:|---|---|---|
| 688, 692, 696, 721, 725 | 35418 / 35419 | `LuoxiBodyLighting` | skinned body and outfit lighting | event 688: two MRTs + D32S8 + 150,624 Post-VS bytes exact |
| 701 | 35425 / 35426 | `LuoxiFaceSkinLighting` | face/skin material | semantic VS and capture-exact semantic PS: two MRTs + D32S8 + 338,832 Post-VS bytes exact |
| 706 | 35430 / 35431 | `LuoxiFaceLighting` | face material variant | semantic VS + capture-exact semantic PS: two MRTs + D32S8 + 52,224 Post-VS bytes exact |
| 711 | 35433 / 35434 | `LuoxiSkinLighting` | skin material | semantic VS + capture-exact semantic PS: two MRTs + D32S8 + 784,320 Post-VS bytes exact |
| 716 | 35438 / 35439 | `LuoxiEyeLighting` | eye material | semantic VS + capture-exact semantic PS: two MRTs + D32S8 + 27,648 Post-VS bytes exact |
| 730 | 53114 / 53115 | `LuoxiBodyVariantLighting` | body material variant | semantic VS + capture-exact semantic PS: two MRTs + D32S8 + 43,056 Post-VS bytes exact |
| 735 | 53116 / 53117 | `LuoxiHairALighting` | hair A | semantic VS + capture-exact semantic PS: two MRTs + D32S8 + 1,806,400 Post-VS bytes exact |
| 740 | 53118 / 53119 | `LuoxiHairBLighting` | hair B | semantic VS + capture-exact semantic PS: two MRTs + D32S8 + 808,480 Post-VS bytes exact |
| 746 | 1853 / 1854 | `LuoxiSecondaryLayer` | secondary character layer | semantic VS/PS: two MRTs + D32S8 + 82,240 Post-VS bytes exact |
| 751 | 46551 / 46552 | `LuoxiCharacterOverlay` | six-index character overlay | semantic VS + capture-exact semantic PS: two MRTs + D32S8 + 256 Post-VS bytes exact |

The body vertex program preserves captured locations 0–6, 8, and 9 and uses
the capture asset's DX12 semantic layout. The PS keeps the second MRT as the
captured encoded-motion output; it is not the BasePass material-flags target.

## Transparent and secondary character programs

| Events | VS / PS | Semantic program | Role | Validation |
|---:|---:|---|---|---|
| 757, 761, 765 | 35492 / 35493 | `LuoxiTransparentBodyLighting` | transparent body groups | semantic VS/PS: two MRTs + D32S8 + 100,416 Post-VS bytes exact |
| 770 | 35487 / 35488 | `LuoxiTransparentFaceSkinLighting` | transparent face/skin | semantic VS + capture-exact semantic PS: two MRTs + D32S8 + 225,888 Post-VS bytes exact |
| 775 | 35495 / 35496 | `LuoxiTransparentSkinLighting` | transparent skin group | semantic VS + capture-exact semantic PS: two MRTs + D32S8 + 470,592 Post-VS bytes exact |
| 780, 784, 789 | 35499 / 35500 | `LuoxiTransparentOutfitLighting` | transparent outfit groups | semantic VS + capture-exact semantic PS: two MRTs + D32S8 + 1,302,816 Post-VS bytes exact |
| 795 | 53120 / 53121 | `LuoxiTransparentHairLighting` | transparent hair | semantic VS + capture-exact semantic PS: two MRTs + D32S8 + 1,083,840 Post-VS bytes exact |
| 801 | 46553 / 46554 | `LuoxiEnvironmentAccent` | environment-cube secondary layer | semantic VS/PS: two MRTs + D32S8 + 2,016 Post-VS bytes exact |

## Forward accent programs

| Events | VS / PS | Semantic program | Role | Validation |
|---:|---:|---|---|---|
| 834 | 35553 / 35554 | `LuoxiForwardAccentA` | texture-driven accent with screen mask | semantic VS/PS: two MRTs + D32S8 + 6,288 Post-VS bytes exact |
| 839, 842 | 35556 / 35557 | `LuoxiForwardAccentB` | texture-driven accent without screen mask | semantic VS/PS: two MRTs + D32S8 + 1,728 Post-VS bytes exact |
| 848 | 46559 / 46560 | `LuoxiForwardMeshLayer` | animated mesh layer | semantic VS/PS: two MRTs + D32S8 + 80,960 Post-VS bytes exact |
| 853 | 53122 / 53123 | `LuoxiForwardHairA` | forward hair A | semantic VS + capture-exact semantic PS: two MRTs + D32S8 + 1,806,400 Post-VS bytes exact |
| 858 | 53125 / 53126 | `LuoxiForwardHairB` | forward hair B | semantic VS + capture-exact semantic PS: two MRTs + D32S8 + 808,480 Post-VS bytes exact |
| 864 | 53127 / 53128 | `LuoxiForwardHairOverlay` | forward hair overlay | semantic VS/PS: two MRTs + D32S8 + 1,083,840 Post-VS bytes exact |
| 870 | 49072 / 49073 | `LuoxiProjectedShadow` | projected character-shadow accent | semantic VS/PS: two MRTs + D32S8 + 5,808 Post-VS bytes exact |
| 876 | 35585 / 35586 | `LuoxiForwardReflectiveAccent` | reflective character accent | semantic VS/PS: two MRTs + D32S8 + 120,384 Post-VS bytes exact |
