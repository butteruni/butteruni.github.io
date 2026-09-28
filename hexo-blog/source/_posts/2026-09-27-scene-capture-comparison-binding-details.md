---
title: "三个截帧的绑定证据索引"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-28T10:32:00+08:00"
permalink: 2026/09/27/scene-capture-comparison-binding-details/
categories:
  - 图形学
tags:
  - astra
  - 渲染分析
  - 渲染证据
---

> 由 astra 生成 · 首次发布于 2026-09-27 18:44 · 最近整理于 2026-09-28 10:32（北京时间）

正文按“六份单游戏分析 + 一份场景对比 + 一份角色对比”组织。先阅读各游戏自身的数据流和计算规则，再阅读横向差异；原始回放数据共用一份，ResourceId 与 EID 只用于证据定位。

<!-- more -->

理解每张图的实际意义请先读 [资源语义与证据对照](/2026/09/27/scene-capture-comparison-resource-semantics/)：解释法线图、运动矢量图、材质颜色图、阴影图、历史有效性遮罩等如何生成和使用，并注明资源在不同阶段复用时的语义变化。下列绑定附录保留机器定位编号，不代替语义说明。

| 游戏 | 独立场景分析 | 独立角色分析 |
|---|---|---|
| 绝区零（蕾米大厅） | [场景实现](/2026/09/27/zzz-scene/) | [角色实现](/2026/09/27/zzz-character/) |
| 原神（木偶雪城） | [场景实现](/2026/09/27/genshin-scene/) | [角色实现](/2026/09/27/genshin-character/) |
| 终末地（竹林场景） | [场景实现](/2026/09/27/endfield-scene/) | [角色实现](/2026/09/27/endfield-character/) |

横向比较：[场景实现对比](/2026/09/27/scene-comparison/)、[角色实现对比](/2026/09/27/character-comparison/)。原始状态：[场景绑定附录](/2026/09/27/scene-capture-comparison-scene-binding-details/)、[角色绑定附录](/2026/09/27/scene-capture-comparison-character-binding-details/)。

原附录中的蕾米 e9986（CapsuleAO）和木偶 e10774（角色六 MRT）迁入角色附录；其余精细绑定迁入场景附录。角色附录另外列出 23 个实际回放事件的资源与状态，包含这两个事件的概要。终末地匿名辅助事件保留用途待确认的标注。

公共来源：[输入指纹](/scene-capture-comparison/capture-hashes.json)、[整帧统计](/scene-capture-comparison/summary.json)、蕾米清单、木偶清单、终末地清单。

新增算法细节的常量和 descriptor 记录：[蕾米](/scene-capture-comparison/leimi/implementation-details/details.json)、[木偶](/scene-capture-comparison/muou/implementation-details/details.json)、[终末地](/scene-capture-comparison/endfield/implementation-details/details.json)。这些补充记录与原始附录共同使用，正文已给出公式、通道语义与本帧参数；无需仅凭编号猜测资源用途。

场景材质的补充记录：[蕾米光照贴图与湿润材质](/scene-capture-comparison/leimi/scene-material-details/details.json)、[木偶雪高度缓存、雪材质和烘焙阴影解压](/scene-capture-comparison/muou/scene-material-details/details.json)。

输入文件、原始统计和阶段编号集中在 [回放定位索引](/2026/09/27/scene-capture-comparison-capture-index/)，不再作为正文的比较维度。复现工具为 清单提取器 与 细节和图像导出器；各目录的原始清单保留资源描述和状态，反汇编与常量文件供重新核对公式。

实际效果的局部对照及其显示/来源约定见 [效果图说明](/2026/09/27/rendering-figure-notes/)。
