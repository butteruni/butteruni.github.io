---
title: "蓝色星原略略卡 RDC Pipeline Map"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-28T20:56:00+08:00"
permalink: 2026/09/27/azur-promilia-rdc-pipeline-map/
categories:
  - 图形学
tags:
  - astra
  - 技术文档
  - 渲染架构
---

> 由 astra 生成 · 首次发布于 2026-09-27 18:44 · 最近整理于 2026-09-28 20:56（北京时间）

## 范围和隔离规则

- Capture: `蓝色星原PC三测.rdc`，D3D11，frame 6639。
- 每个捕获事件拥有独立 program、DXBC、反汇编、CB 快照、资源绑定和固定状态；Azur program 使用 `azur.promilia.luoluo.*` 命名空间。
- Remielle、Genshin、普通 PBR 的 shader 只作为引擎能力参考，不参与本 profile 的 shader 或 pass 实现。
- 几何和纹理由当前 RDC 直接导出；游戏目录不再是本复现的资产依赖。
- 已导出 84 个事件：5 个阴影、18 个角色、61 个后处理；共 167 个原始 shader stage 和 269 个逐事件 CB 快照。

## 帧内数据流

角色阶段向 3440×1440 GBuffer 写入：`814` R11G11B10 HDR、`722` R8G8B8A8、`726` R10G10B10A2、`730` R8G8B8A8、`658` R10G10B10A2 motion，以及 `740` D32S8 depth。随后依次执行深度复制/降采样、屏幕阴影、角色阴影体、GTAO 与 capsule AO、延迟方向光、Depth Rim、雾、TAA、景深、Para、LUT 构建、Bloom、UberPost 和 Light Shaft。event 3506 把最终 scene color 复制到 UI 目标。

## 阴影阶段

| Event | 独立 program | Shader / SHA-256 | CB 快照（字节） | SRV/UAV 槽位→资源 | 输出 | 固定状态 |
|---:|---|---|---|---|---|---|
| 282 | `azur.promilia.luoluo.shadow.e282.cloth-shadow-depth` | VERTEX 63052 `4673ca364f45`<br>PIXEL 63054 `74fd1d428a9a` | ve:b0=43200,b1=112 | - | D 63133:R16_TYPELESS | Back, GreaterEqual, DW=1, S=0, B=0 |
| 285 | `azur.promilia.luoluo.shadow.e285.cloth-tail-shadow-depth` | VERTEX 63052 `4673ca364f45`<br>PIXEL 63054 `74fd1d428a9a` | ve:b0=43200,b1=112 | - | D 63133:R16_TYPELESS | Back, GreaterEqual, DW=1, S=0, B=0 |
| 289 | `azur.promilia.luoluo.shadow.e289.cloth-transparent-shadow-depth` | VERTEX 63052 `4673ca364f45`<br>PIXEL 63054 `74fd1d428a9a` | ve:b0=43200,b1=112 | - | D 63133:R16_TYPELESS | NoCull, GreaterEqual, DW=1, S=0, B=0 |
| 302 | `azur.promilia.luoluo.shadow.e302.hair-shadow-depth` | VERTEX 60253 `4673ca364f45`<br>PIXEL 63692 `6b6dcd49cf09` | ve:b0=43200,b1=112<br>pi:b0=864 | pi SRV 0:308 | D 63133:R16_TYPELESS | Back, GreaterEqual, DW=1, S=0, B=0 |
| 311 | `azur.promilia.luoluo.shadow.e311.face-shadow-depth` | VERTEX 60274 `4673ca364f45`<br>PIXEL 63717 `3e14ac7c22bf` | ve:b0=43200,b1=112<br>pi:b0=592 | pi SRV 0:308 | D 63133:R16_TYPELESS | NoCull, GreaterEqual, DW=1, S=0, B=0 |

<!-- more -->

## 角色阶段

| Event | 独立 program | Shader / SHA-256 | CB 快照（字节） | SRV/UAV 槽位→资源 | 输出 | 固定状态 |
|---:|---|---|---|---|---|---|
| 1592 | `azur.promilia.luoluo.character.e1592.eyes-gbuffer` | VERTEX 64000 `ce7100e50911`<br>PIXEL 64009 `5110f731be9a` | ve:b0=45584,b1=832,b2=512<br>pi:b0=45520,b1=832,b2=512 | pi SRV 0:63679, 1:63681, 2:63680, 3:310, 4:310, 5:308 | 814:R11G11B10_FLOAT<br>722:R8G8B8A8_TYPELESS<br>726:R10G10B10A2_TYPELESS<br>730:R8G8B8A8_TYPELESS<br>658:R10G10B10A2_TYPELESS<br>D 740:D32S8_TYPELESS | Back, GreaterEqual, DW=1, S=1, B=0 |
| 1621 | `azur.promilia.luoluo.character.e1621.weapon-gbuffer` | VERTEX 77241 `5a6908eac485`<br>PIXEL 77339 `75461a42ca7f` | ve:b0=45584,b1=832,b2=864<br>pi:b0=45520,b1=832,b2=752,b3=864 | pi SRV 0:646, 1:61284, 2:61282, 3:61286, 4:60091, 5:60100, 6:308, 7:308 | 814:R11G11B10_FLOAT<br>722:R8G8B8A8_TYPELESS<br>726:R10G10B10A2_TYPELESS<br>730:R8G8B8A8_TYPELESS<br>658:R10G10B10A2_TYPELESS<br>D 740:D32S8_TYPELESS | Back, GreaterEqual, DW=1, S=1, B=0 |
| 1636 | `azur.promilia.luoluo.character.e1636.weapon-secondary` | VERTEX 77112 `29f792af2b5c`<br>PIXEL 77113 `aac9b09a4ae7` | ve:b0=45712,b1=832,b2=864<br>pi:b0=45664,b1=832,b2=528 | pi SRV 0:61284 | 814:R11G11B10_FLOAT<br>722:R8G8B8A8_TYPELESS<br>726:R10G10B10A2_TYPELESS<br>730:R8G8B8A8_TYPELESS<br>658:R10G10B10A2_TYPELESS<br>D 740:D32S8_TYPELESS | Front, GreaterEqual, DW=1, S=1, B=0 |
| 1659 | `azur.promilia.luoluo.character.e1659.hair-gbuffer` | VERTEX 64018 `040e1ae05a95`<br>PIXEL 81538 `7e4bf5427a7f` | ve:b0=45584,b1=832,b2=1088<br>pi:b0=45520,b1=832,b2=912 | pi SRV 0:63668, 1:60250, 2:60257, 3:308, 4:308 | 814:R11G11B10_FLOAT<br>722:R8G8B8A8_TYPELESS<br>726:R10G10B10A2_TYPELESS<br>730:R8G8B8A8_TYPELESS<br>658:R10G10B10A2_TYPELESS<br>D 740:D32S8_TYPELESS | Back, GreaterEqual, DW=1, S=1, B=0 |
| 1671 | `azur.promilia.luoluo.character.e1671.hair-secondary` | VERTEX 64026 `6a571256a7e6`<br>PIXEL 81539 `8a1339a2df94` | ve:b0=45712,b1=832,b2=1088<br>pi:b0=45616,b1=832,b2=864 | pi SRV 0:63668, 1:60250, 2:308, 3:308 | 814:R11G11B10_FLOAT<br>722:R8G8B8A8_TYPELESS<br>726:R10G10B10A2_TYPELESS<br>730:R8G8B8A8_TYPELESS<br>658:R10G10B10A2_TYPELESS<br>D 740:D32S8_TYPELESS | Front, GreaterEqual, DW=1, S=1, B=0 |
| 1696 | `azur.promilia.luoluo.character.e1696.cloth-transparent-gbuffer` | VERTEX 64001 `9eefb01b816f`<br>PIXEL 82321 `846793b4cdef` | ve:b0=45616,b1=832,b2=1088<br>pi:b0=45552,b1=832,b2=1280 | pi SRV 0:63597, 1:63591, 2:63583, 3:60091, 4:61763, 5:60100, 6:308 | 814:R11G11B10_FLOAT<br>722:R8G8B8A8_TYPELESS<br>726:R10G10B10A2_TYPELESS<br>730:R8G8B8A8_TYPELESS<br>658:R10G10B10A2_TYPELESS<br>D 740:D32S8_TYPELESS | NoCull, GreaterEqual, DW=1, S=1, B=0 |
| 1714 | `azur.promilia.luoluo.character.e1714.cloth-transparent-secondary` | VERTEX 64002 `47643f2091a2`<br>PIXEL 81897 `6e173bf1b448` | ve:b0=45744,b1=832,b2=1088<br>pi:b0=45744,b1=832,b2=1280 | pi SRV 0:63597, 1:63591, 2:63583, 3:60100, 4:308 | 814:R11G11B10_FLOAT<br>722:R8G8B8A8_TYPELESS<br>726:R10G10B10A2_TYPELESS<br>730:R8G8B8A8_TYPELESS<br>658:R10G10B10A2_TYPELESS<br>D 740:D32S8_TYPELESS | Front, GreaterEqual, DW=1, S=1, B=0 |
| 1732 | `azur.promilia.luoluo.character.e1732.cloth-tail-gbuffer` | VERTEX 64001 `9eefb01b816f`<br>PIXEL 82321 `846793b4cdef` | ve:b0=45616,b1=832,b2=1088<br>pi:b0=45552,b1=832,b2=1280 | pi SRV 0:63604, 1:63595, 2:63586, 3:60091, 4:310, 5:60100, 6:308 | 814:R11G11B10_FLOAT<br>722:R8G8B8A8_TYPELESS<br>726:R10G10B10A2_TYPELESS<br>730:R8G8B8A8_TYPELESS<br>658:R10G10B10A2_TYPELESS<br>D 740:D32S8_TYPELESS | Back, GreaterEqual, DW=1, S=1, B=0 |
| 1747 | `azur.promilia.luoluo.character.e1747.cloth-tail-secondary` | VERTEX 64002 `47643f2091a2`<br>PIXEL 81897 `6e173bf1b448` | ve:b0=45744,b1=832,b2=1088<br>pi:b0=45744,b1=832,b2=1280 | pi SRV 0:63604, 1:63595, 2:63586, 3:60100, 4:308 | 814:R11G11B10_FLOAT<br>722:R8G8B8A8_TYPELESS<br>726:R10G10B10A2_TYPELESS<br>730:R8G8B8A8_TYPELESS<br>658:R10G10B10A2_TYPELESS<br>D 740:D32S8_TYPELESS | Front, GreaterEqual, DW=1, S=1, B=0 |
| 1765 | `azur.promilia.luoluo.character.e1765.cloth-gbuffer` | VERTEX 64001 `9eefb01b816f`<br>PIXEL 82321 `846793b4cdef` | ve:b0=45616,b1=832,b2=1088<br>pi:b0=45552,b1=832,b2=1280 | pi SRV 0:63599, 1:63593, 2:63589, 3:60091, 4:310, 5:60100, 6:308 | 814:R11G11B10_FLOAT<br>722:R8G8B8A8_TYPELESS<br>726:R10G10B10A2_TYPELESS<br>730:R8G8B8A8_TYPELESS<br>658:R10G10B10A2_TYPELESS<br>D 740:D32S8_TYPELESS | Back, GreaterEqual, DW=1, S=1, B=0 |
| 1778 | `azur.promilia.luoluo.character.e1778.cloth-secondary` | VERTEX 64002 `47643f2091a2`<br>PIXEL 81897 `6e173bf1b448` | ve:b0=45744,b1=832,b2=1088<br>pi:b0=45744,b1=832,b2=1280 | pi SRV 0:63599, 1:63593, 2:63589, 3:60100, 4:308 | 814:R11G11B10_FLOAT<br>722:R8G8B8A8_TYPELESS<br>726:R10G10B10A2_TYPELESS<br>730:R8G8B8A8_TYPELESS<br>658:R10G10B10A2_TYPELESS<br>D 740:D32S8_TYPELESS | Front, GreaterEqual, DW=1, S=1, B=0 |
| 1805 | `azur.promilia.luoluo.character.e1805.face-gbuffer` | VERTEX 64020 `ce81adae3518`<br>PIXEL 76073 `2b51892e506f` | ve:b0=45616,b1=832,b2=816<br>pi:b0=45552,b1=832,b2=832 | ve SRV 0:60618<br>pi SRV 0:60615, 1:60618, 2:60270, 3:308, 4:60627, 5:308, 6:308 | 814:R11G11B10_FLOAT<br>722:R8G8B8A8_TYPELESS<br>726:R10G10B10A2_TYPELESS<br>730:R8G8B8A8_TYPELESS<br>658:R10G10B10A2_TYPELESS<br>D 740:D32S8_TYPELESS | Back, GreaterEqual, DW=1, S=1, B=0 |
| 1820 | `azur.promilia.luoluo.character.e1820.face-sdf-secondary` | VERTEX 64027 `36546a49ef02`<br>PIXEL 64029 `b7a6198c3d87` | ve:b0=45744,b1=832,b2=848<br>pi:b0=45664,b1=832,b2=592 | ve SRV 0:60618<br>pi SRV 0:60618, 1:308 | 814:R11G11B10_FLOAT<br>722:R8G8B8A8_TYPELESS<br>726:R10G10B10A2_TYPELESS<br>730:R8G8B8A8_TYPELESS<br>658:R10G10B10A2_TYPELESS<br>D 740:D32S8_TYPELESS | Front, GreaterEqual, DW=1, S=1, B=0 |
| 1836 | `azur.promilia.luoluo.character.e1836.eyebrow-gbuffer` | VERTEX 64003 `4515ec71b7d4`<br>PIXEL 64012 `236fcb0d81c5` | ve:b0=45584,b1=832,b2=272<br>pi:b0=45520,b1=832,b2=240 | pi SRV 0:60284, 1:308, 2:308 | 814:R11G11B10_FLOAT<br>722:R8G8B8A8_TYPELESS<br>726:R10G10B10A2_TYPELESS<br>730:R8G8B8A8_TYPELESS<br>658:R10G10B10A2_TYPELESS<br>D 740:D32S8_TYPELESS | Back, GreaterEqual, DW=1, S=1, B=0 |
| 1861 | `azur.promilia.luoluo.character.e1861.face-lighting-redraw` | VERTEX 64005 `1d16c719fed2`<br>PIXEL 64014 `524d5a78a986` | ve:b0=45504,b1=160,b2=816<br>pi:b0=45456,b1=752,b2=832 | pi SRV 0:646, 1:60615, 2:60618, 3:60270, 4:60627, 5:308 | 814:R11G11B10_FLOAT<br>722:R8G8B8A8_TYPELESS<br>726:R10G10B10A2_TYPELESS<br>730:R8G8B8A8_TYPELESS<br>658:R10G10B10A2_TYPELESS<br>D 740:D32S8_TYPELESS | Back, Greater, DW=0, S=1, B=8 |
| 1879 | `azur.promilia.luoluo.character.e1879.eyebrow-redraw` | VERTEX 64004 `c461d0bcc796`<br>PIXEL 64013 `0ad0a9649c9f` | ve:b0=45472,b1=160,b2=272<br>pi:b0=45392,b1=240 | pi SRV 0:60284, 1:308 | 814:R11G11B10_FLOAT<br>722:R8G8B8A8_TYPELESS<br>726:R10G10B10A2_TYPELESS<br>730:R8G8B8A8_TYPELESS<br>658:R10G10B10A2_TYPELESS<br>D 740:D32S8_TYPELESS | Back, GreaterEqual, DW=0, S=1, B=8 |
| 1896 | `azur.promilia.luoluo.character.e1896.hair-depth-composite` | VERTEX 64007 `76a177ad4cec`<br>PIXEL 64016 `b560bb982b0b` | ve:b0=45504,b1=160,b2=1088<br>pi:b0=192,b1=784 | pi SRV 0:734 | 814:R11G11B10_FLOAT<br>722:R8G8B8A8_TYPELESS<br>726:R10G10B10A2_TYPELESS<br>730:R8G8B8A8_TYPELESS<br>658:R10G10B10A2_TYPELESS<br>D 740:D32S8_TYPELESS | Back, GreaterEqual, DW=0, S=1, B=0 |
| 1921 | `azur.promilia.luoluo.character.e1921.face-final-redraw` | VERTEX 64006 `8496a93839b8`<br>PIXEL 64015 `56bbed6abb2b` | ve:b0=45504,b1=160,b2=816<br>pi:b0=45456,b1=48,b2=832,b3=752 | ve SRV 0:60618<br>pi SRV 0:60615, 1:60618, 2:60270, 3:60627, 4:308, 5:646 | 814:R11G11B10_FLOAT<br>722:R8G8B8A8_TYPELESS<br>726:R10G10B10A2_TYPELESS<br>730:R8G8B8A8_TYPELESS<br>658:R10G10B10A2_TYPELESS<br>D 740:D32S8_TYPELESS | Back, Equal, DW=0, S=1, B=0 |

## 后处理阶段

| Event | 独立 program | Shader / SHA-256 | CB 快照（字节） | SRV/UAV 槽位→资源 | 输出 | 固定状态 |
|---:|---|---|---|---|---|---|
| 1935 | `azur.promilia.luoluo.post.e1935.copy-character-depth` | VERTEX 771 `736ca4129d51`<br>PIXEL 772 `121f19fed36d` | - | pi SRV 0:740 | D 734:D32S8_TYPELESS | NoCull, AlwaysTrue, DW=1, S=0, B=0 |
| 1945 | `azur.promilia.luoluo.post.e1945.downsample-depth-normal` | VERTEX 787 `736ca4129d51`<br>PIXEL 788 `d65620c56009` | - | pi SRV 0:740, 1:726 | 783:R10G10B10A2_TYPELESS<br>D 777:D32S8_TYPELESS | NoCull, AlwaysTrue, DW=1, S=0, B=0 |
| 1963 | `azur.promilia.luoluo.post.e1963.camera-motion-vectors` | VERTEX 789 `d30f5b3fa646`<br>PIXEL 790 `95bbb280dbd8` | pi:b0=43376 | pi SRV 0:734 | 658:R10G10B10A2_TYPELESS<br>D 740:D32S8_TYPELESS | NoCull, AlwaysTrue, DW=0, S=1, B=0 |
| 1976 | `azur.promilia.luoluo.post.e1976.raytraced-screen-shadow` | COMPUTE 57329 `3175266c6fe3` | co:b0=43408 | co SRV 0:734, 1:726<br>co UAV 0:57324 | 658:R10G10B10A2_TYPELESS<br>D 740:D32S8_TYPELESS | NoCull, AlwaysTrue, DW=0, S=1, B=0 |
| 2009 | `azur.promilia.luoluo.post.e2009.screen-shadow-resolve` | VERTEX 57111 `b57fb326bb66`<br>PIXEL 57119 `05ccb5eef838` | pi:b0=43920,b1=752 | pi SRV 0:57324, 1:646, 2:734, 3:722, 4:57589, 5:332, 6:678, 7:682, 8:684, 9:5134, 10:5132 | 792:R8G8_TYPELESS | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 2025 | `azur.promilia.luoluo.post.e2025.character-shadow-volume` | VERTEX 64008 `71e5e5c9c070`<br>PIXEL 64017 `5af8e4b7431e` | ve:b0=1088,b1=64 | - | 792:R8G8_TYPELESS<br>D 740:D32S8_TYPELESS | NoCull, GreaterEqual, DW=0, S=1, B=0 |
| 2043 | `azur.promilia.luoluo.post.e2043.character-shadow-capture` | VERTEX 64021 `71e5e5c9c070`<br>PIXEL 64025 `b9dba718a01a` | ve:b0=1088,b1=64<br>pi:b0=43360,b1=64,b2=80 | pi SRV 0:734, 1:63133 | 792:R8G8_TYPELESS<br>D 740:D32S8_TYPELESS | Front, LessEqual, DW=0, S=1, B=8 |
| 2060 | `azur.promilia.luoluo.post.e2060.gtao-evaluate` | VERTEX 914 `736ca4129d51`<br>PIXEL 915 `5b66da30a813` | pi:b0=43456 | pi SRV 0:777, 1:783 | 796:R8_TYPELESS | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 2078 | `azur.promilia.luoluo.post.e2078.gtao-filter-a` | VERTEX 806 `736ca4129d51`<br>PIXEL 807 `cc6d8d338048` | pi:b0=43360 | pi SRV 0:796, 1:777, 2:783 | 802:R8_TYPELESS | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 2089 | `azur.promilia.luoluo.post.e2089.gtao-filter-b` | VERTEX 806 `736ca4129d51`<br>PIXEL 807 `cc6d8d338048` | pi:b0=43360 | pi SRV 0:802, 1:777, 2:783 | 796:R8_TYPELESS | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 2107 | `azur.promilia.luoluo.post.e2107.gtao-upsample` | VERTEX 808 `736ca4129d51`<br>PIXEL 809 `c61ab7862bac` | pi:b0=43520 | pi SRV 0:734, 1:722, 2:796, 3:650 | 654:R8G8_TYPELESS | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 2125 | `azur.promilia.luoluo.post.e2125.capsule-ao` | VERTEX 810 `039062fcc707`<br>PIXEL 811 `00a7feae4b81` | pi:b0=43376 | pi SRV 0:726, 1:777, 2:654, 3:76681 | 796:R8_TYPELESS | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 2139 | `azur.promilia.luoluo.post.e2139.ao-composite` | VERTEX 812 `736ca4129d51`<br>PIXEL 813 `dfcacbf132a6` | pi:b0=43376 | pi SRV 0:734, 1:796, 2:777, 3:783, 4:726 | 792:R8G8_TYPELESS | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 2170 | `azur.promilia.luoluo.post.e2170.deferred-directional-primary` | VERTEX 57124 `97e6e1971175`<br>PIXEL 83059 `e287a337f084` | pi:b0=44256,b1=752 | pi SRV 0:792, 1:764, 2:734, 3:722, 4:726, 5:730, 6:13158, 7:13158, 8:342, 9:342, 10:342, 11:342, 12:13158, 13:326 | 814:R11G11B10_FLOAT<br>D 740:D32S8_TYPELESS | NoCull, NotEqual, DW=0, S=1, B=8 |
| 2186 | `azur.promilia.luoluo.post.e2186.deferred-directional-secondary` | VERTEX 57137 `97e6e1971175`<br>PIXEL 83061 `eb122968ca0a` | pi:b0=43824,b1=752 | pi SRV 0:792, 1:764, 2:734, 3:722, 4:726, 5:730 | 814:R11G11B10_FLOAT<br>D 740:D32S8_TYPELESS | NoCull, NotEqual, DW=0, S=1, B=8 |
| 2211 | `azur.promilia.luoluo.post.e2211.depth-rim-source-copy` | VERTEX 563 `22b5e3649275`<br>PIXEL 565 `a3e0427aec54` | ve:b0=48,b1=64,b2=336<br>pi:b0=64 | pi SRV 0:814 | 714:R11G11B10_FLOAT | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 2230 | `azur.promilia.luoluo.post.e2230.depth-rim` | VERTEX 819 `736ca4129d51`<br>PIXEL 820 `76d86dd78129` | pi:b0=43648 | pi SRV 0:734, 1:726, 2:714 | 814:R11G11B10_FLOAT<br>D 740:D32S8_TYPELESS | NoCull, AlwaysTrue, DW=0, S=1, B=8 |
| 2240 | `azur.promilia.luoluo.post.e2240.fog` | VERTEX 16537 `98b9f7db6bf8`<br>PIXEL 16538 `6e9d01e62ca2` | ve:b0=160<br>pi:b0=43600 | pi SRV 0:734 | 814:R11G11B10_FLOAT<br>D 740:D32S8_TYPELESS | NoCull, AlwaysTrue, DW=0, S=0, B=8 |
| 2273 | `azur.promilia.luoluo.post.e2273.copy-transparent-depth` | VERTEX 771 `736ca4129d51`<br>PIXEL 772 `121f19fed36d` | - | pi SRV 0:740 | D 734:D32S8_TYPELESS | NoCull, AlwaysTrue, DW=1, S=0, B=0 |
| 2294 | `azur.promilia.luoluo.post.e2294.transparent-source-copy` | VERTEX 563 `22b5e3649275`<br>PIXEL 565 `a3e0427aec54` | ve:b0=48,b1=64,b2=336<br>pi:b0=64 | pi SRV 0:814 | 718:R11G11B10_FLOAT | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 2522 | `azur.promilia.luoluo.post.e2522.taa-source-copy-a` | VERTEX 563 `22b5e3649275`<br>PIXEL 565 `a3e0427aec54` | ve:b0=48,b1=64,b2=336<br>pi:b0=64 | pi SRV 0:814 | 718:R11G11B10_FLOAT | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 2540 | `azur.promilia.luoluo.post.e2540.taa-source-copy-b` | VERTEX 563 `22b5e3649275`<br>PIXEL 565 `a3e0427aec54` | ve:b0=48,b1=64,b2=336<br>pi:b0=64 | pi SRV 0:814 | 718:R11G11B10_FLOAT | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 2562 | `azur.promilia.luoluo.post.e2562.mobile-taa` | VERTEX 83067 `f0d8a0defe98`<br>PIXEL 83070 `bf73837e1d30` | ve:b0=1088,b1=64<br>pi:b0=43408 | pi SRV 0:740, 1:658, 2:718, 3:662, 4:670 | 830:R11G11B10_FLOAT | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 2579 | `azur.promilia.luoluo.post.e2579.dof-coc` | VERTEX 83071 `4b45b73624a2`<br>PIXEL 83074 `3937bee1074e` | ve:b0=1088,b1=64<br>pi:b0=43456 | pi SRV 0:740, 1:830 | 83091:R16G16B16A16_TYPELESS | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 2593 | `azur.promilia.luoluo.post.e2593.dof-prefilter` | VERTEX 83078 `4b45b73624a2`<br>PIXEL 83079 `077c727e4bd5` | ve:b0=1088,b1=64 | pi SRV 0:83091 | 83095:R16G16B16A16_TYPELESS | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 2605 | `azur.promilia.luoluo.post.e2605.dof-downsample` | VERTEX 83078 `4b45b73624a2`<br>PIXEL 83079 `077c727e4bd5` | ve:b0=1088,b1=64 | pi SRV 0:83095 | 83103:R16G16B16A16_TYPELESS | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 2619 | `azur.promilia.luoluo.post.e2619.dof-filter-a` | VERTEX 83082 `4b45b73624a2`<br>PIXEL 83083 `7bd200696238` | ve:b0=1088,b1=64<br>pi:b0=43728 | pi SRV 0:83103 | 83107:R16G16B16A16_TYPELESS | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 2634 | `azur.promilia.luoluo.post.e2634.dof-filter-b` | VERTEX 83084 `4b45b73624a2`<br>PIXEL 83085 `2eda0e58a169` | ve:b0=1088,b1=64<br>pi:b0=43728 | pi SRV 0:83107 | 83103:R16G16B16A16_TYPELESS | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 2648 | `azur.promilia.luoluo.post.e2648.dof-resolve` | VERTEX 83086 `4b45b73624a2`<br>PIXEL 83088 `077c727e4bd5` | ve:b0=1088,b1=64 | pi SRV 0:83103 | 83095:R16G16B16A16_TYPELESS | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 2665 | `azur.promilia.luoluo.post.e2665.dof-composite` | VERTEX 83111 `4b45b73624a2`<br>PIXEL 83112 `4cd3c142dfaa` | ve:b0=1088,b1=64<br>pi:b0=43456 | pi SRV 0:740, 1:718, 2:83095 | 814:R11G11B10_FLOAT | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 2687 | `azur.promilia.luoluo.post.e2687.taa` | VERTEX 828 `d30f5b3fa646`<br>PIXEL 829 `500d9f4fe0de` | pi:b0=43504 | pi SRV 0:734, 1:662, 2:722, 3:658, 4:814 | 666:R11G11B10_FLOAT | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 2708 | `azur.promilia.luoluo.post.e2708.taa-resolve-copy` | VERTEX 563 `22b5e3649275`<br>PIXEL 565 `a3e0427aec54` | ve:b0=48,b1=64,b2=336<br>pi:b0=64 | pi SRV 0:666 | 814:R11G11B10_FLOAT | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 2733 | `azur.promilia.luoluo.post.e2733.para` | VERTEX 834 `4b45b73624a2`<br>PIXEL 835 `bdf7e3edd8bc` | ve:b0=1088,b1=64<br>pi:b0=1872 | pi SRV 0:814 | 830:R11G11B10_FLOAT | Back, AlwaysTrue, DW=1, S=0, B=0 |
| 2758 | `azur.promilia.luoluo.post.e2758.lut-builder` | VERTEX 841 `4b45b73624a2`<br>PIXEL 842 `331e186927e6` | ve:b0=1088,b1=64<br>pi:b0=2144 | pi SRV 0:83044, 1:691, 2:694, 3:697, 4:700, 5:703, 6:709, 7:706 | 837:R8G8B8A8_TYPELESS | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 2778 | `azur.promilia.luoluo.post.e2778.bloom-prefilter` | VERTEX 16553 `4b45b73624a2`<br>PIXEL 16554 `e698b548c494` | ve:b0=1088,b1=64<br>pi:b0=1936 | pi SRV 0:830, 1:822 | 16549:R11G11B10_FLOAT | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 2794 | `azur.promilia.luoluo.post.e2794.bloom-downsample-1` | VERTEX 16563 `4b45b73624a2`<br>PIXEL 16564 `21c35ddf3ca1` | ve:b0=1088,b1=64<br>pi:b0=1904 | pi SRV 0:16549 | 16555:R11G11B10_FLOAT | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 2810 | `azur.promilia.luoluo.post.e2810.bloom-downsample-2` | VERTEX 16565 `4b45b73624a2`<br>PIXEL 16566 `446a704520aa` | ve:b0=1088,b1=64<br>pi:b0=1904 | pi SRV 0:16555 | 16559:R11G11B10_FLOAT | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 2824 | `azur.promilia.luoluo.post.e2824.bloom-downsample-3` | VERTEX 16563 `4b45b73624a2`<br>PIXEL 16564 `21c35ddf3ca1` | ve:b0=1088,b1=64<br>pi:b0=1904 | pi SRV 0:16559 | 16567:R11G11B10_FLOAT | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 2840 | `azur.promilia.luoluo.post.e2840.bloom-downsample-4` | VERTEX 16565 `4b45b73624a2`<br>PIXEL 16566 `446a704520aa` | ve:b0=1088,b1=64<br>pi:b0=1904 | pi SRV 0:16567 | 16571:R11G11B10_FLOAT | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 2854 | `azur.promilia.luoluo.post.e2854.bloom-downsample-5` | VERTEX 16563 `4b45b73624a2`<br>PIXEL 16564 `21c35ddf3ca1` | ve:b0=1088,b1=64<br>pi:b0=1904 | pi SRV 0:16571 | 16575:R11G11B10_FLOAT | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 2870 | `azur.promilia.luoluo.post.e2870.bloom-downsample-6` | VERTEX 16565 `4b45b73624a2`<br>PIXEL 16566 `446a704520aa` | ve:b0=1088,b1=64<br>pi:b0=1904 | pi SRV 0:16575 | 16579:R11G11B10_FLOAT | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 2884 | `azur.promilia.luoluo.post.e2884.bloom-downsample-7` | VERTEX 16563 `4b45b73624a2`<br>PIXEL 16564 `21c35ddf3ca1` | ve:b0=1088,b1=64<br>pi:b0=1904 | pi SRV 0:16579 | 16583:R11G11B10_FLOAT | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 2900 | `azur.promilia.luoluo.post.e2900.bloom-downsample-8` | VERTEX 16565 `4b45b73624a2`<br>PIXEL 16566 `446a704520aa` | ve:b0=1088,b1=64<br>pi:b0=1904 | pi SRV 0:16583 | 16587:R11G11B10_FLOAT | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 2914 | `azur.promilia.luoluo.post.e2914.bloom-downsample-9` | VERTEX 16563 `4b45b73624a2`<br>PIXEL 16564 `21c35ddf3ca1` | ve:b0=1088,b1=64<br>pi:b0=1904 | pi SRV 0:16587 | 16591:R11G11B10_FLOAT | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 2930 | `azur.promilia.luoluo.post.e2930.bloom-downsample-10` | VERTEX 16565 `4b45b73624a2`<br>PIXEL 16566 `446a704520aa` | ve:b0=1088,b1=64<br>pi:b0=1904 | pi SRV 0:16591 | 16595:R11G11B10_FLOAT | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 2944 | `azur.promilia.luoluo.post.e2944.bloom-downsample-11` | VERTEX 16563 `4b45b73624a2`<br>PIXEL 16564 `21c35ddf3ca1` | ve:b0=1088,b1=64<br>pi:b0=1904 | pi SRV 0:16595 | 16599:R11G11B10_FLOAT | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 2960 | `azur.promilia.luoluo.post.e2960.bloom-downsample-12` | VERTEX 16565 `4b45b73624a2`<br>PIXEL 16566 `446a704520aa` | ve:b0=1088,b1=64<br>pi:b0=1904 | pi SRV 0:16599 | 16603:R11G11B10_FLOAT | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 2977 | `azur.promilia.luoluo.post.e2977.bloom-upsample-1` | VERTEX 16607 `4b45b73624a2`<br>PIXEL 16608 `a26441f071b1` | ve:b0=1088,b1=64<br>pi:b0=1936 | pi SRV 0:16595, 1:16603 | 16591:R11G11B10_FLOAT | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 2992 | `azur.promilia.luoluo.post.e2992.bloom-upsample-2` | VERTEX 16607 `4b45b73624a2`<br>PIXEL 16608 `a26441f071b1` | ve:b0=1088,b1=64<br>pi:b0=1936 | pi SRV 0:16587, 1:16591 | 16583:R11G11B10_FLOAT | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 3007 | `azur.promilia.luoluo.post.e3007.bloom-upsample-3` | VERTEX 16607 `4b45b73624a2`<br>PIXEL 16608 `a26441f071b1` | ve:b0=1088,b1=64<br>pi:b0=1936 | pi SRV 0:16579, 1:16583 | 16575:R11G11B10_FLOAT | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 3022 | `azur.promilia.luoluo.post.e3022.bloom-upsample-4` | VERTEX 16607 `4b45b73624a2`<br>PIXEL 16608 `a26441f071b1` | ve:b0=1088,b1=64<br>pi:b0=1936 | pi SRV 0:16571, 1:16575 | 16567:R11G11B10_FLOAT | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 3037 | `azur.promilia.luoluo.post.e3037.bloom-upsample-5` | VERTEX 16607 `4b45b73624a2`<br>PIXEL 16608 `a26441f071b1` | ve:b0=1088,b1=64<br>pi:b0=1936 | pi SRV 0:16559, 1:16567 | 16555:R11G11B10_FLOAT | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 3052 | `azur.promilia.luoluo.post.e3052.bloom-final` | VERTEX 16607 `4b45b73624a2`<br>PIXEL 16608 `a26441f071b1` | ve:b0=1088,b1=64<br>pi:b0=1936 | pi SRV 0:16549, 1:16555 | 16545:R11G11B10_FLOAT | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 3070 | `azur.promilia.luoluo.post.e3070.uber-post` | VERTEX 843 `7bf7bb8e19d1`<br>PIXEL 844 `d96a0bdf3478` | ve:b0=1232,b1=64<br>pi:b0=2288 | pi SRV 0:830, 1:16545, 2:837 | 814:R11G11B10_FLOAT | NoCull, AlwaysTrue, DW=0, S=1, B=0 |
| 3088 | `azur.promilia.luoluo.post.e3088.light-shaft-mask` | VERTEX 16613 `261e9848f095`<br>PIXEL 16614 `d647407fdfb2` | ve:b0=43424,b1=64<br>pi:b0=43520 | pi SRV 0:734, 1:814 | 16609:R11G11B10_FLOAT | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 3104 | `azur.promilia.luoluo.post.e3104.light-shaft-filter-a` | VERTEX 16619 `44c7c2b9162b`<br>PIXEL 16620 `cf57bd3b21e7` | ve:b0=43520,b1=64 | pi SRV 0:16609 | 16615:R11G11B10_FLOAT | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 3119 | `azur.promilia.luoluo.post.e3119.light-shaft-filter-b` | VERTEX 16619 `44c7c2b9162b`<br>PIXEL 16620 `cf57bd3b21e7` | ve:b0=43520,b1=64 | pi SRV 0:16615 | 16609:R11G11B10_FLOAT | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 3134 | `azur.promilia.luoluo.post.e3134.light-shaft-filter-c` | VERTEX 16619 `44c7c2b9162b`<br>PIXEL 16620 `cf57bd3b21e7` | ve:b0=43520,b1=64 | pi SRV 0:16609 | 16615:R11G11B10_FLOAT | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 3149 | `azur.promilia.luoluo.post.e3149.light-shaft-filter-d` | VERTEX 16619 `44c7c2b9162b`<br>PIXEL 16620 `cf57bd3b21e7` | ve:b0=43520,b1=64 | pi SRV 0:16615 | 16609:R11G11B10_FLOAT | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 3164 | `azur.promilia.luoluo.post.e3164.light-shaft-composite` | VERTEX 16621 `261e9848f095`<br>PIXEL 16622 `ea3d36134464` | ve:b0=43424,b1=64<br>pi:b0=43488 | pi SRV 0:814, 1:16609 | 830:R11G11B10_FLOAT | NoCull, AlwaysTrue, DW=0, S=0, B=0 |
| 3506 | `azur.promilia.luoluo.post.e3506.final-scene-blit` | VERTEX 896 `4b45b73624a2`<br>PIXEL 897 `77fbed27579b` | ve:b0=1088,b1=64<br>pi:b0=1840 | pi SRV 0:830 | 886:R16G16B16A16_TYPELESS | NoCull, AlwaysTrue, DW=0, S=0, B=0 |

## 产物和验证门

- `captures/azur-promilia-latest-rdc/contract/manifest.json` 是事件索引；`programs/<event>/contract.json` 是单 pass 契约。
- 每个 stage 的 `.dxbc` 保留捕获字节；`.asm` 用于语义重写；`vs_bN.bin`、`pixel_bN.bin`、`compute_bN.bin` 是该 event 的绑定快照。
- `contract/resources/manifest.json` 记录 92 个被引用纹理及其首次使用事件；DDS 保存完整格式/子资源，PNG 只用于检查。
- 原始 DXBC 通过 Pipeline Asset 的 `precompiled: true` 路径加载，仍执行反射、root-layout 编译、依赖哈希和 artifact 校验。
- HLSL 语义版本只能在 `Invoke-RdcShaderReplacementValidation.ps1` 对对应事件的所有颜色、深度/模板输出字节一致后替代 DXBC 基线。

## 最终验收状态

- BasePass 的 18 个 draw 按 VS/PS 分为 36 个替换用例，最终报告为 36/36 通过；每个用例同时比较五路 GBuffer 与 depth/stencil。
- 61 个捕获后处理事件全部使用运行时语义 HLSL 通过替换验证，最终报告为 61/61。共享实现仅用于捕获中 shader identity 相同的事件，常量、资源、固定状态和图节点仍逐事件隔离。
- 运行时图共有 66 个节点。除 61 个捕获事件外，额外节点用于坐标方向、模板位以及 D3D11/D3D12 packed-format 边界；`e2666-dof-composite-boundary` 独立恢复捕获的 event 2665 R11G11B10 输出，再进入 event 2687。
- Bloom 完整执行 event 2778–3052 的所有降采样和升采样层。Light Shaft 的四次 filter 使用捕获的 VS→PS radial-step 接口和同一捕获 shader identity。
- RenderGraph 为此 profile 保留 88 个自有 SRV 描述符，并在创建后检查实际数量；修复前最后三个 Light Shaft 资源会与 Skybox/BRDF/Irradiance 的持久槽重叠。
- 最终 RDC 为 `captures/azur-promilia-latest-rdc/peanut-final-exact_frame6122.rdc`。其中 event 3506 的 `characterPostHDR` 与原始资源 886 在垂直方向归一化后为 0 个差异字节。
- 最终替换报告：`validation/base-final-report.json` 与 `validation/runtime-all-semantic-report-final.json`；最终截图：`validation/peanut-final-exact.png`。
- 可机读的验收摘要保存在 `Docs/azur-promilia-rdc/acceptance.json`。
