---
title: "终末地渲染实现分析：竹林光照、角色着色与 HDR 后处理"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-29T11:10:00+08:00"
permalink: 2026/09/27/endfield-rendering-analysis/
categories:
  - 图形学
tags:
  - astra
  - 渲染分析
  - 终末地
mathjax: true
---

> 由 astra 生成

竹林这帧通过多套空间和屏幕数据共同形成颜色：三层方向光照提供环境输入，屏幕遮蔽刻画局部接触，反射读取旧的 HDR 画面，体积雾保存沿视线累积的散射与透射。场景照明之后，角色还会在几何阶段继续完成着色。

本文从实际资源与阶段图出发，展开光照体积布局、遮蔽搜索与过滤、雾积分、角色材质、历史验证以及多尺度泛光。配图、尺寸与参数均对应当前竹林截帧，不沿用其他角色展示场景的结论。

<!-- more -->

<link rel="stylesheet" href="/css/rendering-articles.css">

<div class="rendering-article">

<span id="frame"></span>

## 竹林画面与整帧组织

![竹林最终画面：岩壁、石阶、人物与左侧金色效果](/scene-capture-comparison/endfield/e6531_rt0.png)

本帧主视图与输出为 3440×1440，图形接口为 Vulkan。整帧记录有 1326 次绘制和 65 次计算分派，包含阴影、场景、角色、效果与界面；这些计数用于理解工作组成，不能直接当作耗时。

从最终画面可以定位三类不同现象：石阶接缝的局部暗部、朝向不同表面的环境受光、远近表面经过空气后的颜色差异。下面分别跟踪它们的输入，再说明角色与整帧处理如何使用这些结果。

<span id="resources"></span>

## 资源与代表绘制概况

### 主视图之外还准备了哪些数据

| 数据 | 本次布局 | 保存内容 |
|---|---|---|
| 场景材质颜色 | 全分辨率，RGBA8 sRGB | 供照明读取的表面色 |
| 表面法线 | 全分辨率，RGB10A2 | 两个分量编码三维朝向 |
| 材质控制 | 全分辨率，RGB10A2 | 当前尚未全部命名的表面参数 |
| 运动与分类 | 全分辨率，RGB10A2 | 压缩位移及后续验证状态 |
| HDR 照明颜色 | 全分辨率，R11G11B10F | 场景与后续几何逐步加入的颜色 |
| 阴影图集代表输入 | 6144×4096，16 位深度 | 光源方向的遮挡 |
| AO 原始与过滤结果 | 主要在 1720×720 工作 | 局部环境遮蔽系数 |
| 累积雾体积 | 313×180×128，RGBA16F | 沿视线的散射 RGB 与透射率 |
| 环境光幅度 | 三组 128×64×128 浮点体积 | 红绿蓝各通道的基础强度 |
| 环境方向系数 | 三组 128×192×128 归一化体积 | 红绿蓝分别对应的方向项 |

法线、运动、材质控制可以采用相同位宽，但存储用途不同。RGB10A2 中最后一个分量只有两位，只能表示四档；后面的角色分类将展示这对判断阈值的影响。

### 代表角色绘制与材质输入

重新检查的一次后续角色几何提交使用三角形列表，10590 个索引对应 3530 个三角形。这是该部件的一次绘制，不能当作整个角色或该阶段所有角色的总面数。

这条程序除场景输入外，还读取若干 256、512、1024 边长的颜色与控制纹理，以及窄条渐变。以下来自它实际绑定的两个颜色输入：

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/endfield/material-colour-a.png"><img src="/images/rendering-analysis/endfield/material-colour-a.png" alt="代表路径的区域颜色输入" loading="lazy"></a><figcaption>代表路径的区域颜色输入</figcaption></figure>
<figure><a href="/images/rendering-analysis/endfield/material-colour-b.png"><img src="/images/rendering-analysis/endfield/material-colour-b.png" alt="同一路径的脸部图案输入" loading="lazy"></a><figcaption>同一路径的脸部图案输入</figcaption></figure>
</div>

第二张可辨认展开的面部图案，第一张主要由大片区域颜色组成。具体通道如何参与当前分支仍要结合采样与公式，不能仅凭外观把所有输入统一命名为底色或粗糙度。

这份捕获的部分材质资源没有可用业务名称。本文按已确认的计算职责解释，不以其他场景或其他角色的命名填补空缺。

<span id="pipeline"></span>

## 阶段顺序：颜色与运动都有多位写入者

| 阶段 | 主要处理 | 后续依赖 |
|---|---|---|
| 阴影与雾准备 | 建立光源可见性，更新局部介质并沿深度累积 | 场景和角色着色查询 |
| 深度与主材质 | 建立表面可见性、颜色、法线、参数和分类 | 屏幕环境处理与照明 |
| 辅助几何准备 | 分离辅助法线、深度与标记，形成反馈 | 后续顶点和辅助合成 |
| 屏幕环境 | AO 搜索、历史与过滤，反射颜色重建 | 场景受光 |
| 全屏与角色几何着色 | 分类照明后继续加入角色颜色 | 当前 HDR 与运动 |
| 辅助、透明和效果 | 合成晚出现的颜色，继续更新运动与类别 | 完整当前输入 |
| 历史验证 | 比较前后深度、运动和分类 | HDR 颜色融合 |
| 泛光与输出 | 亮部提取、下降过滤、上升重建 | 显示画面 |

旧 HDR 颜色有不止一个使用者：反射重建先读，整帧时序稍后也读。在两者结束之前覆盖旧颜色，会改变另一条路径看到的内容。

<span id="gbuffer"></span>

## G-buffer：材质先存在，照明颜色随后建立

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/endfield/surface-colour.png"><img src="/images/rendering-analysis/endfield/surface-colour.png" alt="主材质后的表面颜色" loading="lazy"></a><figcaption>主材质后的表面颜色</figcaption></figure>
<figure><a href="/images/rendering-analysis/endfield/surface-normal.png"><img src="/images/rendering-analysis/endfield/surface-normal.png" alt="相同表面的法线编码" loading="lazy"></a><figcaption>相同表面的法线编码</figcaption></figure>
<figure><a href="/images/rendering-analysis/endfield/unlit-hdr.png"><img src="/images/rendering-analysis/endfield/unlit-hdr.png" alt="尚未完成照明的 HDR 目标" loading="lazy"></a><figcaption>尚未完成照明的 HDR 目标</figcaption></figure>
</div>

表面色已经能识别植被、石阶和角色，法线保存方向；此时 HDR 目标大体接近黑色。这组图说明表面信息与受光颜色处在不同数据中。

### 八面体编码怎样保存方向

三维单位方向只有两个独立自由度，可以用两个分量保存。这里的法线采用八面体编码：先按方向分量的绝对值总和投影，再把下半部分折叠到二维区域。

图中两个通道的颜色不能直接当作世界横纵分量。AO 读取时先恢复三维单位方向，再变换到观察空间，与深度一起计算邻域几何关系。

表面颜色按 sRGB 储存，方向与控制则按数值编码。解释这些输入时，色彩转换、方向解码和分类读取需要分别处理。

### 分类照明怎样加入已有颜色

全屏照明按模板类别筛选表面，再执行对应分支。已确认的合成为：

$$
C_{\text{new}}=C_{\text{lighting}}+
\alpha_{\text{output}}C_{\text{old}}
$$

这里 alpha 控制已有贡献的保留程度，不应自动解释为常规透明物体的覆盖率。类别、输出数值与混合设置共同决定最终贡献。

一轮全屏照明结束后，某些角色区域仍未完成颜色。后面的几何着色直接读取环境光与雾，把专用材质接入当前 HDR。

<span id="shadows"></span>

## 阴影既服务表面，也服务空气

场景阴影按光源视图组织到图集中。主照明利用它判断物体是否收到光，雾的局部体积更新也读取它，控制空间中的散射光是否被遮挡。

同一遮挡关系因此影响两件事：石面受到多少直接光，以及相机前方空气里能积累多少光。只在最终表面颜色上乘阴影，无法替代雾生成时的阴影查询。

辅助几何也有独立深度，但其生产者和消费者与主阴影不同。不能因为一张图只保存深度，就把它归为光源阴影。

目前确认的是图集查询和多处消费。区块如何长期分配、哪些光源分帧更新，仍需跨帧材料。

<span id="environment-volume"></span>

## 三层环境光：位置查询与一阶方向重建

### 同样的网格数，覆盖不同的世界范围

每层有 128×64×128 个空间位置，步长分别为 0.5、2 和 8：

| 层次 | 每格步长 | 完整覆盖尺寸 |
|---|---:|---|
| 近层 | 0.5 | 64×32×64 世界单位 |
| 中层 | 2 | 256×128×256 世界单位 |
| 远层 | 8 | 1024×512×1024 世界单位 |

世界单位没有换算为米。覆盖中心还受参考位置与偏移控制，这不是三个永远固定在原点的盒子。

采样坐标包含周期寻址：

$$
uvw=\operatorname{fract}\left((P\,s+0.5)
\left(\frac1{128},\frac1{64},\frac1{128}\right)\right)
$$

$P$ 是经过相应参考变换的位置，$s$ 为本层位置乘数。循环坐标与层边界权重共同决定当前位置读取什么数据。

### 边界同时检查水平与竖直范围

当前近层的水平、竖直淡出起点约为 29 和 13，过渡宽度为 2；中层为 116、52 和 8；远层为 464、208 和 32。

近层淡出量为 $f_0$，中层淡出量为 $f_1$，相邻层权重可整理为：

$$
w_0=1-f_0,\qquad w_1=f_0(1-f_1)
$$

其余影响继续交给更远层。边界判断使用水平最大距离与竖直距离，不能用简单球形距离完整替代。

### 幅度与三段系数组成方向光照

每层由两张体积配合：一张保存 HDR 基础幅度，另一张沿高度分成三段，分别保存红、绿、蓝的方向系数，所以后者高度恰好是前者的三倍。

![近层方向系数体积的一张深度切片](/images/rendering-analysis/endfield/environment-directions.png)

这张图是系数编码，三个高度区域对应三种颜色的方向信息，不是三张场景照片。对每种颜色，幅度 $A$ 与系数采样 $c$ 解码为：

$$
B=A(4c-2),\qquad L(N)=\max(A+B\cdot N,0)
$$

$B$ 是带正负号的方向项，$N$ 为着色方向。相同位置的表面可以因朝向不同得到不同照明；只采一个 RGB 后直接乘底色，会丢掉这部分信息。

各段的纵向坐标还限制在半纹素边界内，防止线性过滤跨入另一颜色的系数区。层间混合后继续加入低频环境项，并由按亮度加权的方向信息求一个环境主方向，供材质控制。

本帧读取的是已存在体积，没有观察到完整生产过程。已确认布局、解码、过渡与消费，不能据此判断它们全部离线生成还是持续动态更新。

<span id="ao"></span>

## 环境遮蔽：方向搜索、历史稳定与保边过滤

<div class="rendering-figures">
<figure><a href="/scene-capture-comparison/figures/replay/endfield-ao-ground.png"><img src="/scene-capture-comparison/figures/replay/endfield-ao-ground.png" alt="石阶接缝附近的遮蔽系数" loading="lazy"></a><figcaption>石阶接缝附近的遮蔽系数</figcaption></figure>
<figure><a href="/scene-capture-comparison/figures/replay/endfield-ground-final.png"><img src="/scene-capture-comparison/figures/replay/endfield-ground-final.png" alt="对应区域的最终地面" loading="lazy"></a><figcaption>对应区域的最终地面</figcaption></figure>
</div>

深色带帮助定位遮蔽作用区域。最终暗部还包含材质与直接阴影，因此两图不能作亮度差来量化 AO 的独立贡献。

AO 近似描述附近几何对环境方向的遮挡。当前路径从可见深度搜索局部地平线，再稳定和过滤结果。

### 三个方向、三个距离与正负两侧

每像素构造三个方向，方向间隔约为 $\pi/3$。每方向向正、负两侧各取三个距离，形成 18 个核心深度查询。

距离含有扰动与幂函数分布。采样半径变大时，根据其对数选择较粗深度层级；不是所有查询都读取完整分辨率。

深度恢复为观察空间位置后，程序计算相对投影法线的上下遮挡边界，再组合成当前遮蔽。这些运算支持地平线式屏幕遮蔽的解释，但不能单独确认某个实现库版本。

### 同时生成相邻表面的连续程度

邻域深度差形成边界判断，包含：

$$
e=\operatorname{clamp}\left(1.25-\frac{\Delta z}{0.011z},0,1\right)
$$

结果按四个方向量化打包。深度不连续处限制跨边界混合，避免将前景遮蔽带到后方表面。

遮蔽图表示“暗多少”，边界图表示“过滤能否跨过去”。两份数据承担不同任务。

### 历史保存遮蔽、深度和权重

| 历史分量 | 写入内容 |
|---|---|
| 第一分量 | 稳定后的遮蔽 |
| 第二分量 | 缩放截断后的深度标量 |
| 第三分量 | 本次采用的历史权重 |
| 第四分量 | 当前为零的占位 |

深度标量是 $\min(0.01z,1)$。比较在这个表示中进行，差值不能直接解释成米。

当前遮蔽 $a$、旧遮蔽 $a_h$ 与 UV 运动 $v$ 进入：

$$
m=\left\lVert v(1720,720)\right\rVert
$$
$$
w_h=0.97e^{-0.05m}e^{-500|d-d_h|}
$$
$$
a'_h=\operatorname{clamp}(a_h,a_{\min,3\times3},a_{\max,3\times3})
$$
$$
a_{\text{out}}=\operatorname{lerp}(a,a'_h,w_h)
$$

运动在半分辨率像素空间中计算。移动越大，旧对应关系越不可靠；深度变化越大，越可能换成另一表面。旧遮蔽还被限制到当前邻域范围，避免过时暗带跨过新边界。

超出屏幕时权重归零；功能关闭时直接输出当前遮蔽，本次路径开启。即使静止且深度一致，基础混合仍保留约 3% 当前结果。

### 边界两侧都允许，才充分混合

每方向边界量保存为四档。读取后恢复到零到一，再让中心方向值与邻居反方向值相乘：双方都认为可以跨过时，混合才充分发生。

过滤还包括对角组合权重与中心权重，最终按总权重归一化。当前中心项为 $1.2\times0.2=0.24$。

每个 8×8 工作组中，一线程处理水平相邻两个像素，形成 16×8 输出区域。随后再做一轮保边处理，最后读取中心与四个对角位置上采样。

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/endfield/ao-raw.png"><img src="/images/rendering-analysis/endfield/ao-raw.png" alt="半分辨率原始遮蔽" loading="lazy"></a><figcaption>半分辨率原始遮蔽</figcaption></figure>
<figure><a href="/images/rendering-analysis/endfield/ao-filtered.png"><img src="/images/rendering-analysis/endfield/ao-filtered.png" alt="历史与过滤后的全分辨率遮蔽" loading="lazy"></a><figcaption>历史与过滤后的全分辨率遮蔽</figcaption></figure>
</div>

两图均以 0 到 0.67 预览。原始结果包含较细碎的变化，后图经过多步稳定和过滤；两者之间不只差一次模糊。

最后五点上采样没有再次读取深度。主要深度约束已在历史和边界过滤中完成，不能把每一步都统称为深度双边过滤。

### 临时数据与历史的数据寿命不同

原始遮蔽、过滤结果和边界数据属于当前帧临时结果，其中部分存储后面会被反射改作其他用途。跨帧历史则必须保留到下一次使用。

同一纹理顺序改写说明用途复用，不等于已经确认两个不同资源共享同一底层显存分配。

<span id="reflections"></span>

## 反射：先求采样位置，再从历史画面取色

这条反射路径把“去哪里取颜色”和“取到什么颜色”分开保存。前面利用当前深度、深度金字塔、法线与控制数据生成位置相关结果，随后用半分辨率坐标读取旧 HDR。

记全分辨率像素坐标为 $p$，画面尺寸为 $S$，半分辨率坐标图的值为 $u_r$：

$$
u_h=u_r+\frac{p\bmod2}{S}
$$
$$
C_r=C_{\text{history}}(u_h)
$$

同一个半分辨率位置对应四个全分辨率像素，余数项保留四者的子像素差异。它没有为每个全分辨率像素重新执行完整追踪，而是从较粗的位置结果重建颜色。

### 极亮颜色先压缩，再参与过滤

已确认的颜色压缩为：

$$
C'_r=\frac{C_r}{1+\max(C_r)}
$$

最大分量增大时，各分量按同一个分母缩小，减少极亮样本在过滤中的支配程度。它属于中间计算域的压缩，不是最终屏幕的完整颜色映射。

后面继续建立较低分辨率的反射颜色层级，并结合深度等输入合成。颜色来源是旧画面，所以被遮住、刚显露或原先在视图之外的内容，需要依赖完整追踪与回退规则处理；这些上游细节目前尚未全部还原。

本文能确认的是坐标消费、子像素补偿、历史颜色来源和压缩关系，不能只凭一个坐标目标就把整套追踪写成已经复现。

<span id="fog"></span>

## 体积雾：局部介质与沿视线累积是两种数据

局部体积描述某一小段空气，累积体积描述相机到某个深度之间的整段空气。两者在数据流中前后相接，却不能互换。

### 每个空间位置先得到散射与消光

局部生成阶段读取空间位置、灯光、阴影与相关介质参数，输出散射源 $S$ 和消光系数 $\sigma$。它还读取已有累积体积，说明当前局部更新可以利用前次结果。

空间中的各点可以独立求值，但沿一条视线的累积不能完全独立：远处一段空气收到的贡献，要乘上近处已经消耗后剩余的透射率。

### 按深度层顺序积分

程序通过投影关系恢复每层位置，计算相邻层之间的距离 $\Delta s$。当前段的透射为：

$$
t=e^{-\sigma\Delta s}
$$

距离淡入权重由沿途距离与当前参数形成：

$$
w=\operatorname{saturate}(s_{\text{accumulated}}k_f)
$$

在有效的正消光范围内，主要累积可整理为：

$$
L_{\text{new}}=L_{\text{old}}+
T_{\text{old}}S\frac{1-t}{\sigma}w
$$
$$
T_{\text{new}}=T_{\text{old}}\operatorname{lerp}(1,t,w)
$$

$L$ 表示已经加入视线的散射，$T$ 表示还剩多少表面光能够透过。每一层都写出到该深度为止的 $(L,T)$，供表面按深度查询。

原指令的分母表达中包含 $\max(\sigma,0)$。上式用于解释正消光区间；当前材料尚未完整确认零消光情况下上游参数与保护关系，不把它作为可无条件照抄的完整数值实现。

### 同一体积里的近层与远层有什么差别

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/endfield/fog-scattering-near.png"><img src="/images/rendering-analysis/endfield/fog-scattering-near.png" alt="累积散射：较近的深度层" loading="lazy"></a><figcaption>累积散射：较近的深度层</figcaption></figure>
<figure><a href="/images/rendering-analysis/endfield/fog-scattering-far.png"><img src="/images/rendering-analysis/endfield/fog-scattering-far.png" alt="累积散射：较远的深度层" loading="lazy"></a><figcaption>累积散射：较远的深度层</figcaption></figure>
</div>

两张从同一累积体积取较近和较远切片，采用相同的 0 到 0.05 预览范围。远层出现更明显的空间分布；预览达到白色只表示超出此显示标尺，不代表实际数据在这里截断。

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/endfield/fog-transmittance-near.png"><img src="/images/rendering-analysis/endfield/fog-transmittance-near.png" alt="透射率：较近的深度层" loading="lazy"></a><figcaption>透射率：较近的深度层</figcaption></figure>
<figure><a href="/images/rendering-analysis/endfield/fog-transmittance-far.png"><img src="/images/rendering-analysis/endfield/fog-transmittance-far.png" alt="透射率：较远的深度层" loading="lazy"></a><figcaption>透射率：较远的深度层</figcaption></figure>
</div>

这里单独显示 alpha 中的透射率。较亮表示保留较多表面光，较暗表示经过更多衰减。切片来自深度层序列，不按等距离的米数解释。

这组图把“空气加进多少光”和“空气让原有光剩多少”分开显示。单独展示最终雾色，很容易遗漏第二个量。

### 场景与角色都消费累积结果

表面已经得到自身颜色后，合成为：

$$
C_{\text{out}}=T\,C_{\text{surface}}+L
$$

角色路径也读取这份累积体积，并与其他高度雾相关项组合。人物与背景因而共享同一视线上的空气条件，同时仍保留各自的材质计算。

局部更新需要先读取旧体积，积分才覆盖新结果。数据更新顺序本身就是效果正确性的条件，不能把累积体积当作每个步骤都可以随意清空的临时颜色。

<span id="character"></span>

## 后续角色着色：为何场景受光后还要绘制几何

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/endfield/scene-lit.png"><img src="/images/rendering-analysis/endfield/scene-lit.png" alt="场景全屏照明完成" loading="lazy"></a><figcaption>场景全屏照明完成</figcaption></figure>
<figure><a href="/images/rendering-analysis/endfield/scene-and-characters.png"><img src="/images/rendering-analysis/endfield/scene-and-characters.png" alt="后续几何着色完成" loading="lazy"></a><figcaption>后续几何着色完成</figcaption></figure>
</div>

全景对照使用相同 HDR 标尺。前一阶段人物区域仍有黑色轮廓，后续几何补入角色颜色；背景主要结构保持对应。

<div class="rendering-figures">
<figure><a href="/scene-capture-comparison/figures/replay/endfield-character-before.png"><img src="/scene-capture-comparison/figures/replay/endfield-character-before.png" alt="人物局部：全屏照明之后" loading="lazy"></a><figcaption>人物局部：全屏照明之后</figcaption></figure>
<figure><a href="/scene-capture-comparison/figures/replay/endfield-character-after.png"><img src="/scene-capture-comparison/figures/replay/endfield-character-after.png" alt="人物局部：几何着色之后" loading="lazy"></a><figcaption>人物局部：几何着色之后</figcaption></figure>
<figure><a href="/scene-capture-comparison/figures/replay/endfield-character-final.png"><img src="/scene-capture-comparison/figures/replay/endfield-character-final.png" alt="最终人物外观" loading="lazy"></a><figcaption>最终人物外观</figcaption></figure>
</div>

前两张统一采用 0 到 0.2 的 HDR 预览；第三张已经过后续整帧显示处理。它们证明的是阶段贡献，未单独隔离环境光、阴影或雾的增益。

### 深度相等让着色落在已有表面上

前面的深度和材质阶段已经建立人物可见性。代表后续路径使用相等深度测试，在匹配已有表面的位置输出颜色与运动。

黑色人物区域因此不意味着此前没有几何。更准确的解释是：人物的表面位置已经存在，专用颜色等到适当阶段再计算。它能够直接利用前面已经准备好的空间光照、阴影与雾。

这一阶段共有多次几何绘制，包含已确认会补入人物颜色的路径；不能因为连续的一组绘制都写同一目标，就把组内所有匿名程序都认定成同一种角色部件。

<span id="character-material"></span>

## 角色材质：反射分配与受控明暗方向

### 金属混合量同时影响两种颜色

表面基础颜色为 $C_b$，金属混合量为 $m$，介质高光缩放为 $k$：

$$
C_d=0.96C_b(1-m)
$$
$$
C_s=\operatorname{lerp}(0.04k,C_b,m)
$$

漫反射颜色 $C_d$ 随金属量增大而减少；镜面基色 $C_s$ 从介质反射基值转向基础颜色。这个成对变化支持将 $m$ 解释为金属／非金属控制，而不是一个任意亮度参数。

高光宽度相关量为：

$$
r_w=\max(r^2,0.0078)
$$

其中 $r$ 是当前程序使用的粗糙度类参数，后面还可以按条件把结果混向 0.01。它为非常窄的高光保留数值下限，又允许额外风格控制，不能只凭一张贴图通道推断全部高光外观。

以上针对已经展开的代表程序。其他变体是否使用相同通道约定，需要分别确认。

### 主光与材质方向共同决定分区

程序将主光方向压向水平面，加入较小竖直分量后归一化。局部光向决定控制纹理的横向采样是否镜像。

控制纹理的一个分量 $b$ 根据光照侧别恢复为带符号横向量：

$$
x=2b-1\quad\text{或}\quad x=1-2b
$$
$$
N_c=\operatorname{normalize}(x,0.0001,1-|x|)
$$

这个平面方向经过相应变换后，与几何法线插值，再归一化，形成着色方向。它允许作者在材质中控制受光走势，而不要求完全依赖网格曲率。

同一采样的两个分量取平均，与光向产生的阈值做平滑比较。边界参数限制在 0.001 到 0.999 内，再将得到的控制映射到渐变纹理横坐标，以固定中间行读取颜色。

由此形成的明暗同时包含几何方向、贴图设计和渐变。普通的 $\operatorname{saturate}(N\cdot L)$ 不能完整替代这条路径。

### 环境光使用的是同一套着色方向

三层环境数据解码后，每个颜色得到一个常量项和三个方向系数，与 $(N_x,N_y,N_z,1)$ 点乘，并限制为非负。

场景提供位置相关的光照系数，角色提供经过材质调整的方向，两者在这里相接。环境光不是对角色无差别乘一个固定 RGB，也不是一定等于全屏照明此前算出的颜色。

随后，当前角色颜色接受累积雾和其他空气项的合成。几何运动仍独立写入，并不因为颜色被雾衰减就一起变成“雾的运动”。

<span id="auxiliary"></span>

## 辅助几何：屏幕上的数据还能返回顶点阶段

这一帧存在一条独立反馈链：

| 步骤 | 保存或读取什么 |
|---|---|
| 分离辅助可见性 | 复制主法线与深度，保留尚未写入的辅助颜色 |
| 辅助几何栅格化 | 写入方向、分类标记和深度 |
| 辅助标量计算 | 根据这些输入生成标量及另一份深度 |
| 后续几何求值 | 顶点阶段读取法线、标量、深度与标记 |
| 辅助输出 | 写颜色与法线，并接回公共运动 |
| 后续合成 | 根据可见性和类别，叠加辅助颜色 |

它说明屏幕数据并非只能交给最后的像素效果。前面栅格化得到的表面信息，可以被后面的几何处理再次读取。

辅助颜色有独立的深度测试和分类条件，采用预乘式颜色合成，并只更新 RGB。写入范围、深度是否更新和哪些分量保留，需要与辅助程序一起理解。

当前尚未可靠确认这条路径对应的具体部位，因此本篇不将其直接命名为头发或脸部专用算法。可以确认的是反馈关系与合成接口，而不是未得到验证的业务归属。

<span id="motion"></span>

## 运动编码与分类量化

当前与旧的投影位置除以齐次分量后，得到归一化设备坐标。程序转为纹理位移：

$$
v=(p_{\text{current}}-p_{\text{previous}})(0.5,-0.5)
$$

随后用两次平方根压缩小位移：

$$
e=0.5+0.5\,\operatorname{sign}(v)\sqrt{\sqrt{|v|}}
$$

读取时执行对应的四次方：

$$
v=\operatorname{sign}(e-0.5)(2e-1)^4
$$

它使很小的屏幕运动在有限存储位宽下拥有更多表达空间。直接将编码值当作线性速度，会让重投影位置出错。

### 量化后的类别才是实际读回值

代表角色程序向附加通道写入一个 0.4 的控制量，但目标 alpha 只有两位，因此实际可存值只有 $0,1/3,2/3,1$。0.4 写入后落在 $1/3$ 档。

后面程序按接近 0.3 的区间判断相关类别，匹配的正是量化后的值。若只阅读写入常量，期待消费者精确读到 0.4，就会误解这个分支。

这也是为什么格式和通道含义必须一起说明。格式并非附带的资源列表，它直接影响算法条件。

<span id="temporal"></span>

## 整帧历史：验证、汇总、融合分成三个步骤

在角色、透明与效果完成当前颜色和运动之后，整帧处理才能比较新旧表面。它读取的不仅是旧 HDR，还有旧深度与旧运动、类别信息。

### 第一步：逐像素检查对应关系

预处理比较当前与历史的深度、运动和分类。它输出一份邻域深度，以及同时保存运动和变化标志的数据。

深度用于发现遮挡显露或表面变化，运动差用于判断前后对应是否稳定，类别变化则防止不同处理规则之间随意继承旧状态。只比较颜色相似度，不能完整替代这些判断。

### 第二步：在较低分辨率汇总变化

汇总阶段读取中心与四个对角位置，将变化标志组织成 860×360 的单通道结果，再供颜色融合使用。

![历史有效性汇总结果的单通道预览](/images/rendering-analysis/endfield/history-validity.png)

黑白区域是后续控制条件的分布，不是已经发生拖影的位置，也不是最终颜色误差图。它帮助观察历史控制如何覆盖人物、前景与背景边界。

低分辨率汇总使邻域的变化能够影响对应区域的历史使用，而不是只保留一个孤立像素的判断。

### 第三步：融合 HDR 并回写置信状态

颜色阶段读取当前 HDR、重投影后的旧颜色和前面形成的有效性信息，输出新 HDR 与置信状态。它和 AO 的历史是两套数据：一个稳定局部遮蔽，另一个稳定整幅照明颜色。

旧颜色还被反射读取，因此必须在两个消费者结束后才交换历史版本。颜色、深度、运动和分类也需要保持时间对应；只有颜色更新、其他数据停留在不同时间，会破坏验证。

本篇确认这三步的输入输出和主要验证职责，没有把未完整解码的每个控制位强行命名为某种通用置信度。

<span id="bloom"></span>

## 泛光：从软阈值到多尺度重建

泛光位于 HDR 历史融合之后。它先挑选亮部，再建立多个空间尺度，最后逐层合成。这条路径同时决定亮点周围扩散多远，以及核心细节保留多少。

<div class="rendering-figures">
<figure><a href="/scene-capture-comparison/figures/replay/endfield-bloom-source.png"><img src="/scene-capture-comparison/figures/replay/endfield-bloom-source.png" alt="高亮提取后的结果" loading="lazy"></a><figcaption>高亮提取后的结果</figcaption></figure>
<figure><a href="/scene-capture-comparison/figures/replay/endfield-bloom-filtered.png"><img src="/scene-capture-comparison/figures/replay/endfield-bloom-filtered.png" alt="多尺度过滤后的结果" loading="lazy"></a><figcaption>多尺度过滤后的结果</figcaption></figure>
<figure><a href="/scene-capture-comparison/figures/replay/endfield-bloom-final.png"><img src="/scene-capture-comparison/figures/replay/endfield-bloom-final.png" alt="最终画面中的对应亮部" loading="lazy"></a><figcaption>最终画面中的对应亮部</figcaption></figure>
</div>

前两张都用 0 到 0.02 的 HDR 标尺，便于观察弱扩散。第三张是最终外观参照，包含本体颜色与其他合成，不能据它单独反推泛光强度。

### 高亮提取有柔和过渡

有效输入颜色为 $C$，亮度选择量采用最大分量 $b=\max(C)$。本次软阈值为：

$$
t=\operatorname{clamp}(b-0.444993,0,0.890026)
$$
$$
s=0.561782t^2
$$
$$
k_b=\frac{\max(s,b-0.890006)}{\max(b,0.0001)}
$$

提取色为 $Ck_b$ 再乘全局亮度缩放。接近阈值时二次项提供平滑开启，较亮区域由另一项继续控制，避免仅用一个硬开关让亮点突然出现。

在进入提取前，程序还按数值表示筛除负值与非有限值，防止异常样本在后续层级中扩散。

### 极亮孤立样本会降低自身过滤权重

对提取色 $C_b$，亮点抑制项为：

$$
w_b=\frac1{1+C_b\cdot(0.2127,0.7152,0.0722)}
$$

预过滤把空间权重与该项相乘，累加加权颜色，再除以总权重。越极端的亮点，越不容易单独支配整个邻域。

当前预过滤共使用 13 条采样记录，包括中心、较远四角、轴向点及内侧点。已保存的程序中，内侧记录有一个偏移重复；本文按实际记录理解它，不擅自替换成常见的完全对称模板。该细节是否属于源程序设计，需要进一步材料确认。

### 下降链覆盖越来越宽的空间尺度

当前亮部从半分辨率开始，依次下降：

~~~text
1720×720 → 860×360 → 430×180 → 215×90
         → 108×45 → 54×23 → 27×11 → 13×6 → 7×3
~~~

越低分辨率的一次邻域过滤，对应原画面中越宽的范围。细层保留集中亮部，粗层形成大范围光晕。

这些不是可以生成下一层就全部丢弃的中间图：上升阶段还需要每一层原先的下降结果，才能将局部细节与较粗光晕重新组合。

### 九点可分离过滤怎样复用数据

下降过滤的一维核有九个位置：

| 与中心距离 | 每侧的近似权重 |
|---:|---:|
| 0 | 中心 0.2734 |
| 1 | 0.2188 |
| 2 | 0.1094 |
| 3 | 0.0313 |
| 4 | 0.0039 |

程序先完成一个方向，再做另一个方向，形成二维效果。其实际实现由 8×8 线程组协作：颜色分量进入组共享数组，部分数据以成对半精度形式打包；同步后完成第一轴，再将中间结果写回共享内存，供第二轴使用。

因此，两个方向并不必然对应两次独立的全图显存往返。只看滤波数学形式而忽略线程协作，会漏掉这条实现的重要部分。

### 上升重建保留每层自己的亮部

对较粗图的采样位置，程序按小数坐标构造三次 B-spline 权重。每轴四个一维权重配对为两个双线性采样位置，二维组合只需四次双线性采样。

得到较粗层重建色后，与本层保留的下降结果混合：

$$
C_{\text{level}}=
\operatorname{lerp}(C_{\text{down}},C_{\text{coarse,reconstructed}},0.41)
$$

0.41 是当前代表路径的参数，不推广为所有画质或所有变体的固定值。它具体说明了为什么不能只放大最小那张图：本层细节还在参与最终结果。

泛光之后继续进行最终颜色合成。当前还有较小尺寸的光晕或模糊支路，但不能据此把其他角色展示场景的完整景深机制移植到这份竹林分析中。

<span id="conclusion"></span>

## 数据如何共同形成这幅画面

竹林表面先保存材质与可见性；方向体积按位置和朝向提供环境光，屏幕深度搜索形成局部遮蔽，旧 HDR 为反射提供颜色，累积雾描述从表面到相机之间的空气。角色在后续几何阶段读取这些条件，再写回自己的颜色、运动与分类。

完成所有当前帧写入后，整帧历史将深度、运动和类别一起验证，再交给多尺度泛光与最终显示。AO、反射、雾和整帧颜色各自保留所需状态，不能用一张统一的“历史图”替代全部依赖。

当前已经展开上述主要消费与计算规则。仍未完整确认的是方向光照的生产算法、反射追踪及未命中处理、辅助几何的具体部位，以及全部角色材质和跨帧更新策略。上述结论限于当前样本中已经确认的计算与依赖。

</div>
