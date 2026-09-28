---
title: "配图怎样读：阶段变化、中间数据与显示范围"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-29T01:40:00+08:00"
permalink: 2026/09/27/rendering-figure-notes/
categories:
  - 图形学
tags:
  - astra
  - 渲染分析
  - 渲染基础
---

> 由 astra 生成

文章中的最终画面、阶段前后图和中间数据图承担不同任务。明确它们各自能证明什么，才能避免把一张好看的图片当作算法的完整证据。

本篇解释图组的阅读方法和显示约定。配图来自捕获中的实际纹理与阶段结果；没有替换程序或生成不存在的效果。

<!-- more -->

<link rel="stylesheet" href="/css/rendering-articles.css">

<div class="rendering-article">

## 三类图，三种用途

| 类型 | 适合回答什么 | 不足以单独回答什么 |
|---|---|---|
| 相邻阶段前后图 | 这一段计算向画面加入或改变了什么 | 未被隔离的子算法各贡献多少 |
| 中间数据与最终外观 | 数据集中在哪些区域，对应哪些表面 | 最终颜色中有多少来自该数据 |
| 最终局部图 | 本文讨论的是哪个部位、外观如何 | 内部使用了哪条公式、哪一组参数 |

图注会说明属于哪一种，而不只写含糊的“效果对比”。

## 相邻阶段：眼睛颜色何时加入

<div class="rendering-figures">
<figure><a href="/scene-capture-comparison/figures/replay/zzz-eye-before.png"><img src="/scene-capture-comparison/figures/replay/zzz-eye-before.png" alt="眼睛颜色合成之前" loading="lazy"></a><figcaption>眼睛颜色合成之前</figcaption></figure>
<figure><a href="/scene-capture-comparison/figures/replay/zzz-eye-after.png"><img src="/scene-capture-comparison/figures/replay/zzz-eye-after.png" alt="眼睛颜色合成之后" loading="lazy"></a><figcaption>眼睛颜色合成之后</figcaption></figure>
</div>

在相同脸部区域与显示设置下，眼白中出现紫色虹膜、瞳孔和亮点。这支持“该绘制加入了这些颜色”的结论。

这组图没有让角色转头，因此不能展示视角变化；也没有单独改变眼睛程序里的某一个参数，因此不能隔离每层高光或查找表的贡献。混合规则仍需用正文中的运算解释。

## 数据与外观：暗带不等于全部阴影

<div class="rendering-figures">
<figure><a href="/scene-capture-comparison/figures/replay/endfield-ao-ground.png"><img src="/scene-capture-comparison/figures/replay/endfield-ao-ground.png" alt="环境遮蔽系数的预览" loading="lazy"></a><figcaption>环境遮蔽系数的预览</figcaption></figure>
<figure><a href="/scene-capture-comparison/figures/replay/endfield-ground-final.png"><img src="/scene-capture-comparison/figures/replay/endfield-ground-final.png" alt="最终石阶外观" loading="lazy"></a><figcaption>最终石阶外观</figcaption></figure>
</div>

遮蔽数据在接缝附近形成深色带，最终图帮助确认它们对应的几何位置。两张图保存的量不同，不能直接按亮度作差。

环境遮蔽系数描述的是局部遮挡程度。最终石阶颜色还受表面色、直接光、阴影和其他合成影响。因此这组图不是“关闭 AO／开启 AO”，也不用于计算 AO 改善了多少对比度。

## 为什么很弱的中间结果也能看起来很亮

显示范围相当于给数值选择一把预览标尺。例如泛光中的弱扩散，如果按最终显示范围查看，可能几乎看不见；将较小范围映射到完整黑白后，就容易观察其空间分布。

| 图组 | 使用的预览范围 | 阅读重点 |
|---|---|---|
| 竹林角色 HDR 前后图 | 0 到 0.2 | 两张范围相同，可比较阶段贡献的位置 |
| 竹林 AO | 0 到 0.67 | 看系数分布，不能当成最终表面亮度 |
| 竹林亮部提取与过滤 | 两张均为 0 到 0.02 | 比较亮部扩散范围，不与最终图直接比亮度 |

这些范围只改变预览映射，没有改写原始计算结果。最终图片又经过颜色映射等处理，与 HDR 中间图不处于相同显示条件。

## 各图组应该看哪里

| 图组 | 主要观察位置 | 支持的说明 |
|---|---|---|
| 大厅材质 | 浮雕字、墙板与吧台 | 同阶段分别组织光照相关数据与表面色 |
| 蕾米眼睛 | 虹膜、瞳孔与亮点 | 独立眼睛绘制加入颜色 |
| 雪城材质 | 栏杆顶面与阶梯 | 覆盖分区在最终照明前已形成 |
| 雪城历史融合 | 小亮点与细边缘 | 本次输入输出之间的平滑变化 |
| 木偶眼睛 | 蓝色虹膜与眼内亮部 | 眼睛对材质颜色的直接写入 |
| 木偶裙装 | 裙片、褶边与金色包边 | 定位所讨论的材质区域 |
| 竹林角色 | 头发、皮肤、衣料与金属 | 后续几何着色补入人物颜色 |
| 竹林 AO | 石阶接缝 | 遮蔽数据的空间分布 |
| 竹林泛光 | 集中亮点及周围弱亮区 | 过滤让高亮信号扩散 |

## 裁剪、方向与颜色保持怎样的一致性

配对图选择相同的归一化区域、方向、通道和显示范围。局部放大只便于查看已有像素，不生成额外细节。颜色纹理按相应色彩含义预览，避免对已有显示转换重复加亮。

大厅部分中间结果与最终输出的有效宽度略有差异，因此按归一化视区选择对应区域，不能把它们当作严格逐像素误差图。

木偶眼睛的中间图尚未完成后续头发等绘制，额头与最终图不同；竹林角色的最终图也包含后续整帧处理。这些变化均不应算到配对阶段的单项贡献里。

## 单帧图片的边界

一组静态图不能展示真实拖影长度、运动中的闪烁或眼睛随视角变化的幅度。正文会解释相关规则，但不会把静态对照描述为已经完成这些动态验证。

阅读具体机制，可从[文章概要](/2026/09/27/rendering-analysis-overview/)进入；关于结论如何建立，见[分析范围与依据](/2026/09/27/scene-capture-comparison-capture-index/)。

</div>
