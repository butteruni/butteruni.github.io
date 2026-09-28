---
title: "三个游戏的角色渲染比较：脸部、眼睛与场景融合"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-29T01:40:00+08:00"
permalink: 2026/09/27/character-comparison/
categories:
  - 图形学
tags:
  - astra
  - 渲染分析

mathjax: true
---

> 由 astra 生成

角色渲染同时面对几种任务：形状要随动画变化，脸部明暗要符合设计，眼睛要有层次，整个人又要与场景光照和空气感协调。把它们统称为一种“卡通着色”会掩盖重要差别。

本文比较绝区零的蕾米、原神的木偶，以及终末地竹林中已分析到的角色路径。每部分直接解释机制与配图含义，无需持有截帧文件或先读单游戏文章。

<!-- more -->

<link rel="stylesheet" href="/css/rendering-articles.css">

<div class="rendering-article">

## 先看角色颜色怎样进入整幅画面

| 样本 | 当前材料中最清楚的特点 | 阅读时应注意 |
|---|---|---|
| 蕾米 | 形态与翼部准备、脸部遮挡、独立眼睛混合 | 不同部位可能直接写入已着色颜色 |
| 木偶 | 脸部阈值分区、眼内视差、衣料参数分区与环境反馈 | 专用规则会先进入材质输出，再接受后续处理 |
| 竹林角色 | 场景全屏照明之后继续完成角色几何着色 | 角色专用阶段读取公共环境光和雾 |

这些是被分析样本的特点，不是各游戏所有角色的功能清单。没有在某份材料中追到一个机制，不代表那款游戏没有它。

## 脸部明暗：几何遮挡与设计边界各有职责

### 蕾米：确认光是否被遮住，再组合脸部颜色

蕾米的脸部路径会把表面位置投影到阴影视角，并在附近做多次深度比较。比较结果表示来自该方向的光被遮住了多少。多个采样共同参与，可以让边缘变化更平滑。

程序随后将遮挡、颜色和材质控制组合。这说明脸部并非只有一张平面的明暗贴图。但当前分析也不能据此排除其他角色或其他分支中的阈值图处理。

### 木偶：让光方向驱动作者预制的边界

木偶的脸部把光转到脸部局部坐标，再将方向得到的条件与纹理阈值比较。这类纹理常称为脸部 SDF；阅读时可把它理解为“每个脸部位置应该在什么光向下转入暗部”。

它让明暗边界保持设计形状，避免完全依赖网格弧度。当前路径还包含纹理方向翻转的能力，但这一帧的参数没有启用该翻转，不能把可用分支写成已经发生的效果。

### 竹林角色：已确认材质可以调整受光方向

已追到的竹林角色路径会用材质控制构造方向，与几何法线和经过调整的光方向共同形成明暗，再读取渐变颜色。但其所有控制值与具体脸部区域之间的对应还没有确认。

因此，这里比较的是“材质可以控制方向与明暗”的机制，不能把它直接命名为一套已经完整还原的脸部算法。

| 机制 | 主要回答的问题 |
|---|---|
| 阴影深度比较 | 光源到该表面的路径是否被挡 |
| 脸部阈值图 | 当前光方向下，设计好的明暗边界应落在哪里 |
| 材质控制方向与渐变 | 表面采用什么朝向规则与色带来表现受光 |

这些机制可以协作，并非互相排斥的三选一。

## 眼睛：比较“怎样产生颜色”与“怎样加入画面”

### 蕾米的前后图说明了独立混合

<div class="rendering-figures">
<figure><a href="/scene-capture-comparison/figures/replay/zzz-eye-before.png"><img src="/scene-capture-comparison/figures/replay/zzz-eye-before.png" alt="蕾米：眼睛绘制之前" loading="lazy"></a><figcaption>蕾米：眼睛绘制之前</figcaption></figure>
<figure><a href="/scene-capture-comparison/figures/replay/zzz-eye-after.png"><img src="/scene-capture-comparison/figures/replay/zzz-eye-after.png" alt="蕾米：虹膜、瞳孔与亮点加入后" loading="lazy"></a><figcaption>蕾米：虹膜、瞳孔与亮点加入后</figcaption></figure>
<figure><a href="/scene-capture-comparison/figures/replay/zzz-face-final.png"><img src="/scene-capture-comparison/figures/replay/zzz-face-final.png" alt="蕾米：完成后续处理的脸部" loading="lazy"></a><figcaption>蕾米：完成后续处理的脸部</figcaption></figure>
</div>

前后图中的主要变化位于眼睛。最终外观另有抗锯齿与颜色处理，不应把它与第一张之间的全部差异都算作眼睛绘制。

这次眼睛绘制将新颜色混入已有脸部颜色，采用预乘透明度形式：

$$
C_{\text{out}}=C_{\text{eye,premult}}+(1-\alpha)C_{\text{face}}
$$

“预乘”表示眼睛颜色在写出前已经乘过透明度。后续混合若再乘一次，贡献就会被重复压低。此处透明度用于合成权重，不能简单理解为“眼球本身是透明物体”。

### 木偶的眼睛还包含内部落点计算

<div class="rendering-figures">
<figure><a href="/scene-capture-comparison/figures/replay/genshin-eye-before.png"><img src="/scene-capture-comparison/figures/replay/genshin-eye-before.png" alt="木偶：眼睛写入前的材质颜色" loading="lazy"></a><figcaption>木偶：眼睛写入前的材质颜色</figcaption></figure>
<figure><a href="/scene-capture-comparison/figures/replay/genshin-eye-after.png"><img src="/scene-capture-comparison/figures/replay/genshin-eye-after.png" alt="木偶：加入蓝色虹膜与内部亮部" loading="lazy"></a><figcaption>木偶：加入蓝色虹膜与内部亮部</figcaption></figure>
<figure><a href="/scene-capture-comparison/figures/replay/genshin-face-final.png"><img src="/scene-capture-comparison/figures/replay/genshin-face-final.png" alt="木偶：最终脸部外观" loading="lazy"></a><figcaption>木偶：最终脸部外观</figcaption></figure>
</div>

前两张来自相同材质颜色目标，能够定位眼睛写入的内容。后续头发与整帧处理造成其他差异；这组静态图不能直接展示转动视角时的视差幅度。

木偶的眼睛程序沿视线搜索解析定义的内部深度，找到落点后读取颜色层，并加入随视图法线变化的外观纹理。正面与掠射角采用不同搜索步数，让斜视时的路径得到更多计算。

这里确认了“内部位置怎样求”，而蕾米的混合规则主要说明“结果怎样合入已有颜色”。它们属于不同层次，不能仅凭其中一项就给两个眼睛方案排出复杂度高低。

竹林样本的眼睛专用路径尚未完整还原，因此不在这里补入假定的眼睛公式。

## 角色怎样接受场景的颜色与空气

### 木偶：先汇总环境，再逐步更新反馈

木偶的部分材质读取来自场景取样的环境颜色和阴影。颜色取样会筛选表面类别，再形成平均值；新反馈只占较小比例，其余保留已有结果：

$$
C_{\text{new}}=0.9C_{\text{old}}+0.1C_{\text{sample}}
$$

这减少了环境取样变化对角色颜色的突然影响。当前材质先读取已有反馈，取样更新发生在稍后，因此不能把角色当前颜色全归因于刚取得的新样本。阴影反馈还有独立的状态规则，并不沿用这条简单颜色公式。

### 竹林角色：按位置与朝向读取环境光，再合成雾

<div class="rendering-figures">
<figure><a href="/scene-capture-comparison/figures/replay/endfield-character-before.png"><img src="/scene-capture-comparison/figures/replay/endfield-character-before.png" alt="竹林：全屏照明后的人物区域" loading="lazy"></a><figcaption>竹林：全屏照明后的人物区域</figcaption></figure>
<figure><a href="/scene-capture-comparison/figures/replay/endfield-character-after.png"><img src="/scene-capture-comparison/figures/replay/endfield-character-after.png" alt="竹林：角色几何着色补入颜色" loading="lazy"></a><figcaption>竹林：角色几何着色补入颜色</figcaption></figure>
<figure><a href="/scene-capture-comparison/figures/replay/endfield-character-final.png"><img src="/scene-capture-comparison/figures/replay/endfield-character-final.png" alt="竹林：最终人物外观" loading="lazy"></a><figcaption>竹林：最终人物外观</figcaption></figure>
</div>

前两张采用相同 HDR 显示范围，证明后续几何阶段加入了人物颜色。这组图没有单独关闭环境光或雾，不能用于测量其中某项的独立贡献。

竹林角色读取空间中的方向光照系数，根据所在位置与表面朝向求环境光；再利用已经沿视线累积的透射率与散射光合成雾：

$$
C_{\text{out}}=T\,C_{\text{character}}+L_{\text{fog}}
$$

与木偶的取样反馈相比，这里直接展示了另一种环境输入形态。当前分析确认的是读取方式，尚未完整覆盖光照体积如何生成。

### 蕾米：已确认公共遮挡与角色专用着色衔接

蕾米的脸部、眼睛与其他部位会利用公共场景结果，同时保留部位专用的颜色和混合规则。当前材料对其完整环境输入的覆盖不如上述两条路径完整，因此比较止于已确认的读写关系，不用常见做法补齐缺失项。

## 形状变化不能从最终颜色里倒推

蕾米的几何准备里可以确认两类不同计算：

- **稀疏形态变形**：只对受影响顶点累加位置、法线和切线的变化。它负责改变几何数据，后面还要继续进行绘制。
- **翼部细分与约束**：根据边与邻接关系产生更细的形状，再施加距离等约束。

这说明角色的局部形状可以在材质着色前经过多步准备。但仅凭这一帧，没有测得运动中的形状稳定性，也不能把所有顶点变化都称为同一种物理模拟。

另外两份样本的完整变形链没有在当前文章中还原。比较表中应保留这一空缺，而不是把“未确认”写成“未使用”。

## 角色必须交给整帧处理的不只是颜色

角色移动时，它的轮廓会露出背景，也会在历史画面里换位置。如果整帧抗锯齿只有颜色，没有深度、运动和分类，就很难判断旧像素是否属于当前表面。

三份材料都需要角色与公共处理交换这些信息：

| 数据 | 对整帧处理的作用 |
|---|---|
| 深度 | 判断前后遮挡，定位可见表面 |
| 屏幕运动 | 找到旧画面中对应的位置 |
| 类别与控制标记 | 选择适当的照明或历史处理分支 |
| 法线或其他表面信息 | 供后续光照、遮蔽与辅助阶段读取 |

不同游戏对位移和标记的编码不同，原始数值不能直接横向比较。对阅读而言，关键是说明谁产生数据、谁消费数据，以及它解决什么问题。

## 比较后的结论

角色外观可以由局部明暗设计、真实遮挡、多层眼睛计算、环境反馈和跨帧数据共同构成。最有意义的比较是拆清这些任务，而不是给整个角色贴上一个算法标签。

现有材料足以解释上述具体路径，尚不足以排名整体画质或成本，也不足以完整描述三款游戏的全部角色系统。单帧中的漂亮亮部不等于已证明真实反射，静态眼睛对照不等于已测得动态视差，“没有分析到”也不等于“没有实现”。

深入阅读：[蕾米](/2026/09/27/zzz-character/) · [木偶](/2026/09/27/genshin-character/) · [竹林角色](/2026/09/27/endfield-character/)。

相关主题：[三个游戏的场景比较](/2026/09/27/scene-comparison/) · [怎样阅读角色渲染流程](/2026/09/27/scene-capture-comparison-character-binding-details/)。

</div>
