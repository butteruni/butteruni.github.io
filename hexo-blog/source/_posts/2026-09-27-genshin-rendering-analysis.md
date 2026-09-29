---
title: "原神渲染实现分析：雪城资源、木偶材质与时序重建"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-29T11:10:00+08:00"
permalink: 2026/09/27/genshin-rendering-analysis/
categories:
  - 图形学
tags:
  - astra
  - 渲染分析
  - 原神
mathjax: true
---

> 由 astra 生成

这份雪城画面把积雪覆盖、静态阴影恢复、角色环境反馈与最终画面重建连接在一起。积雪在材质阶段就确定区域，木偶的脸和眼睛有专用计算，场景照明完成后再整理运动数据；抗锯齿处理的是已经经过颜色映射的画面。

本文从实际资源与绘制结果开始，逐项展开六路材质输出、雪层与高度缓存、阴影解压、角色材质、环境取样和历史状态。配图均来自这一份截帧，资源规格与公式对应本次执行路径。

<!-- more -->

<link rel="stylesheet" href="/css/rendering-articles.css">

<div class="rendering-article">

<span id="frame"></span>

## 样本与渲染结构概况

![雪城最终画面：木偶位于阶梯、覆雪栏杆与建筑前](/scene-capture-comparison/muou/e25393_rt0.png)

主视图与最终输出均为 3440×1440，使用 D3D11。整帧记录中有 1840 次绘制和 141 次计算分派，包含几何、阴影、全屏处理、效果与界面；这些数量不等于可见物体数量，也没有隔离各部分耗时。

本篇按资源、材质与整帧流程展开。最重要的连接有三处：

- 雪材质既写表面颜色，也写入供历史处理读取的控制状态。
- 角色先使用已有环境反馈，再由后面的场景取样更新结果。
- 一张表面方向纹理在照明结束后被复用为运动，使用者必须遵守前后阶段边界。

这些连接决定了颜色如何出现，也决定了哪些中间结果不能过早覆盖。

<span id="resources"></span>

## 代表模型与材质资源

### 几何统计的对象是一次具体绘制

重新读取代表绘制的拓扑，确认它们使用三角形列表。下面将索引数除以三，得到本次提交的三角形数。

| 已定位的材质路径 | 索引数 | 本次三角形数 |
|---|---:|---:|
| 覆雪场景物件 | 2310 | 770 |
| 木偶脸部 | 10620 | 3540 |
| 木偶裙装路径 | 18813 | 6271 |
| 木偶眼睛 | 1608 | 536 |
| 身体／袜子代表路径 | 29298 | 9766 |

这些是对应绘制的几何规模，不是整个人物模型的唯一总面数。角色会分别进入可见材质、阴影和运动阶段，同一几何可能被再次处理；不能把全帧提交简单相加当作模型资源量。

![木偶脸部绘制的线框覆盖预览](/images/rendering-analysis/genshin/face-wireframe.png)

黄色线框由回放工具叠加到实际绘制上，用于定位这次脸部几何。它是检查网格范围的辅助显示，最终游戏画面不含这些线条。

### 覆雪物件的两套表面输入

| 输入用途 | 尺寸与存储 | 参与的计算 |
|---|---|---|
| 物件基础颜色 | 256×256，BC1 sRGB | 原表面的配色 |
| 物件基础法线 | 256×256，BC7 | 原表面的细节方向 |
| 物件材质控制 | 256×256，BC3 | 原表面的响应与混合控制 |
| 覆盖层颜色／遮罩 | 512×512，BC3 sRGB | 雪层相关的颜色调制 |
| 覆盖层法线 | 1024×1024，BC7 | 雪层方向细节 |
| 世界雪法线 | 512×512，BC7 | 额外的雪面方向输入 |
| 闪光遮罩 | 512×512，BC7 | 雪面细碎亮点的控制 |

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/genshin/prop-base-colour.png"><img src="/images/rendering-analysis/genshin/prop-base-colour.png" alt="物件基础颜色" loading="lazy"></a><figcaption>物件基础颜色</figcaption></figure>
<figure><a href="/images/rendering-analysis/genshin/prop-normal.png"><img src="/images/rendering-analysis/genshin/prop-normal.png" alt="物件基础法线" loading="lazy"></a><figcaption>物件基础法线</figcaption></figure>
<figure><a href="/images/rendering-analysis/genshin/prop-material-control.png"><img src="/images/rendering-analysis/genshin/prop-material-control.png" alt="物件材质控制" loading="lazy"></a><figcaption>物件材质控制</figcaption></figure>
</div>

三张纹理来自同一个覆雪物件材质。门窗与装饰图案在颜色里可辨认；法线保存方向变化，控制纹理保存数值分区，不应按其红绿外观直接命名物理参数。

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/genshin/snow-detail-normal.png"><img src="/images/rendering-analysis/genshin/snow-detail-normal.png" alt="覆盖层的细节法线" loading="lazy"></a><figcaption>覆盖层的细节法线</figcaption></figure>
<figure><a href="/images/rendering-analysis/genshin/snow-glitter-mask.png"><img src="/images/rendering-analysis/genshin/snow-glitter-mask.png" alt="雪闪光遮罩" loading="lazy"></a><figcaption>雪闪光遮罩</figcaption></figure>
</div>

雪层并不是把上一组底图整体调白。它有自己的方向细节与亮点输入，再由覆盖因子分别组合颜色、法线和材质控制。

### 角色资源按部位拆开

| 部位 | 当前使用的代表资源 |
|---|---|
| 脸部 | 1024×1024 脸部底色、1024×1024 SDF、512×512 阴影控制、1024×1024 表情图集 |
| 裙装 | 1024×1024 底色、基础法线与控制图；256×256 细节图；256×20 阴影渐变 |
| 眼睛 | 多张 128 或 256 边长的瞳孔颜色；512×512 Matcap；256×8 的打包渐变 |
| 环境反馈 | 70×1 浮点结果，由颜色取样区与阴影取样区共同组织 |

表中的纹理职责通过实际采样和消费规则确定。部分细节资产的名称来自其他角色，但当前确实由木偶裙装使用；资产名字不能替代这次绘制中的用途。

<span id="pipeline"></span>

## 从准备阶段到最终输出

| 阶段 | 主要工作 | 输出交给谁 |
|---|---|---|
| 场景准备 | 风场、局部交互、表面高度候选和角色几何准备 | 后续材质与几何 |
| 深度与主材质 | 建立可见表面，写入颜色、法线和分类 | 阴影解析、环境处理和延迟照明 |
| 遮挡与环境 | 构造分级深度、遮蔽与反射候选，准备阴影 | 表面受光计算 |
| 角色环境取样 | 从材质颜色与阴影取得样本，汇总反馈 | 之后的角色环境使用 |
| 照明与合成 | 按类别求值，加入雾、透明与效果 | 当前 HDR 颜色 |
| 运动写入 | 比较相机与几何的前后位置 | 运动模糊及历史重投影 |
| 显示处理 | 运动模糊、泛光、最终颜色映射 | 当前显示域颜色 |
| 边缘与历史 | 当前帧边缘混合、颜色重建和状态更新 | 最终输出与下次历史 |

角色环境取样虽然位于流程中较后的位置，前面的角色材质已经读取了其已有结果。这是跨次使用的反馈关系，而不是把表格理解成“当前角色先等本帧取样全部完成”。

<span id="gbuffer"></span>

## 六路表面输出怎样承载不同材质

主材质写出六路颜色类目标，另有深度与模板。它们共同组成供后续着色读取的表面描述，通常称为 G-buffer。

| 数据职责 | 格式 | 具体含义与使用者 |
|---|---|---|
| 表面方向 | RGB10A2 | 当前保存法线，供照明与遮蔽读取；后面复用为运动 |
| 材质颜色 | RGBA8 sRGB | 场景色与经过部位材质处理的角色颜色；环境取样也读取 |
| 辅助着色／材质参数 | RGBA8 sRGB | 不同部位输出不同的颜色和控制量 |
| 材质类别与历史控制 | R8 | 低位选择照明类别，高两位参与历史状态 |
| 附加材质标量 | R8 | 与其他控制量共同决定表面响应 |
| 扩展标记 | R8 | 保存材质与效果的分支状态，后面还会更新 |
| 深度与模板 | D32S8 | 可见性、位置重建以及身体和眼睛等绘制分类 |

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/genshin/surface-colour.png"><img src="/images/rendering-analysis/genshin/surface-colour.png" alt="材质颜色：保留表面与角色的颜色分区" loading="lazy"></a><figcaption>材质颜色：保留表面与角色的颜色分区</figcaption></figure>
<figure><a href="/images/rendering-analysis/genshin/surface-normal.png"><img src="/images/rendering-analysis/genshin/surface-normal.png" alt="同一场景的法线编码" loading="lazy"></a><figcaption>同一场景的法线编码</figcaption></figure>
</div>

两张图对应相同场景。法线图的彩色来自方向编码；建筑立面、台阶与角色曲面因朝向不同而呈现不同颜色。它们都还不是最终照明结果。

方向的读取采用 $\operatorname{normalize}(2C-1)$。材质颜色的 alpha 可能是附加控制，不能统一当作透明度；另一个单通道材质量也没有被证明在全图始终等于粗糙度或 AO。

模板中的身体与眼睛分类，与 R8 类别图是两套不同接口。前者可在绘制前筛选像素，后者作为可采样数值进入程序。把二者直接当成相同类别值，会误解后续分支。

贴花阶段还能修改颜色与法线，同时保留某些扩展标记。表面输入不仅要看最初由谁写入，也要看照明读取之前是否经过局部修改。

<span id="snow-material"></span>

## 雪层：覆盖分区、方向细节与历史控制

<div class="rendering-figures">
<figure><a href="/scene-capture-comparison/figures/replay/genshin-snow-material.png"><img src="/scene-capture-comparison/figures/replay/genshin-snow-material.png" alt="光照前：雪覆盖已经进入材质颜色" loading="lazy"></a><figcaption>光照前：雪覆盖已经进入材质颜色</figcaption></figure>
<figure><a href="/scene-capture-comparison/figures/replay/genshin-snow-final.png"><img src="/scene-capture-comparison/figures/replay/genshin-snow-final.png" alt="最终画面：覆盖再接受环境与遮挡" loading="lazy"></a><figcaption>最终画面：覆盖再接受环境与遮挡</figcaption></figure>
</div>

观察栏杆顶面、阶梯和上方覆雪区域。第一张已有覆盖分区；第二张的蓝灰色与阴影还来自后续照明。这是阶段对照，不是积雪开关实验。

### 两层材质分别计算，再组合输出

基础表面与覆盖表面分别处理 UV 缩放偏移、颜色调制、法线强度和材质参数。随后各类数据按覆盖控制组合。因此雪覆盖不仅改变颜色，也会改变表面方向和受光响应。

当前覆盖方向为世界向上。几何法线为 $N_g$，第二层世界法线为 $N_s$，顶点颜色的蓝色分量为 $b$，参考方向为：

$$
N_r=\operatorname{lerp}(N_g,N_s,0.499)
$$
$$
t=\operatorname{saturate}(N_r\cdot(0,1,0)+b-0.75)
$$
$$
w_{\text{direction}}=b\,t^2(3-2t)
$$

当前另一个遮罩分支又乘一次 $b$，所以已确认的混合因子中包含 $b^2t^2(3-2t)$。顶点控制既影响过渡阈值，也影响最终许可量。

这解释了为何朝向相近的表面仍能拥有不同覆盖。作者可以在顶点上绘制控制值；细节法线又参与参考朝向，使覆盖边界不只跟随低精度几何轮廓。

### 细碎亮点为什么要受屏幕导数约束

程序额外采样世界雪法线与闪光遮罩。输入位置在相邻像素间变化越快，细节采样就越容易对微小视角变化敏感。当前路径用形如：

$$
k_{\text{detail}}=\max(1-24D,0)
$$

的项削弱细微偏移，$D$ 为已计算的屏幕导数总量。它还根据条件调整纹理层级偏置，并可增加一次视角偏移后的采样。

颜色边缘项采用 $(1-\operatorname{saturate}(V\cdot N))^3$ 类型的关系，视线越掠过表面，相关项越强。上述控制共同决定雪细节的响应，不能只用“给白色表面加高光”概括。

### 雪材质同时给抗锯齿留下状态

雪相关状态被放入类别字节的高两位，普通材质类别保留在低位。后面的历史程序正好读取这两个高位，选择颜色约束与状态更新。

因此，雪的设计并未止于当前颜色。材质阶段还告诉后面的历史处理：当前表面应该怎样保留或限制旧结果。这是一条从具体雪材质延伸到整帧显示的直接联系。

<span id="height-cache"></span>

## 高度层缓存：选择可以写入的表面候选

这一帧还执行了表面高度更新。它通过光栅覆盖调用像素计算，但不向当前可见颜色写入，而是更新 2048×2048 的精细高度缓存和 256×256 的粗网格标记。

### 进入缓存前的过滤

归一化法线的竖直分量必须大于约 0.642788，也就是表面与向上方向的夹角小于约 50°。程序还检查换算后的深度变化率，排除不适合当前高度层的陡斜或不连续区域。

像素坐标加上当前环形偏移后，以 2048 为周期寻址。缓存能够围绕局部区域移动使用，不必始终以固定世界原点解释同一个像素。

### 粗网格先判断高度分布是否连续

每个 8×8 精细区域对应一个粗格。归一化高度区间被分成 32 层，由位集合表示哪些层被表面占据。加入当前候选后，程序只继续接受集中在最低两个相邻层附近的情况。

这样做是在高度更新前限制多层重叠：若一个区域里存在彼此远离的表面，不能轻易把它们当成同一连续高度层。

### 精细更新以高度优先竞争

高度被量化到约 65532 的整数范围，再与旧值比较。允许厚度由当前高度范围与厚度系数换算，本次对应阈值为：

$$
\left\lceil\frac{65532\times1.2}{32}\right\rceil=2458
$$

程序把新高度放在高位、高度差放在低位，对组合整数取原子最大值。高位的高度优先决定谁能赢得竞争；只有真正更新成功的像素才标记粗网格发生变化。

已确认的是高度候选的选择、组织和更新。它与可见双层雪材质同处这个雪城流程，但全部下游连接尚未还原，因而不能把它直接命名为完整足迹或动态压雪系统。

<span id="shadows"></span>

## 阴影：把压缩静态深度恢复到统一查询流程

![本帧场景阴影图集的深度预览](/images/rendering-analysis/genshin/shadow-atlas.png)

图集中可以看到多个不同覆盖范围的深度区域。灰度表示从相应光源视角记录的深度，不是主相机看到的光照颜色。角色环境阴影取样和场景着色都会读取这些遮挡信息。

### 静态和动态深度在使用前汇合

动态角色与场景几何从光源方向绘制深度；部分静态阴影则从压缩记录解码，直接写入供后续比较的深度目标。到了照明阶段，消费者使用已经恢复的深度，不必在每个像素里重新解析压缩树。

阴影图集给子区块预留边界。例如分配尺寸为 256、512、1024 的格子，实际可绘制范围分别为 252、508、1020，起点内缩两个像素。边界留白为相邻区域的过滤提供隔离空间。

### 先定位分块，再下降到深度载荷

代表解压路径以 32×32 像素为块查询元数据。块内像素的坐标位决定四叉树象限，节点告诉程序继续下降还是已经到达叶子。

节点描述为紧凑位字段，多个节点共用一个整数；当前程序最多进行四次实际象限寻址。叶子再取得对应的深度记录，选择具体解码方式。

这使平缓区域可以早些结束查找，复杂区域进一步细分。分块元数据描述的是逻辑阴影区域，最终落在大图集哪里，则由解压矩形的位置和视口决定。

### 两种深度记录对应不同局部形态

| 记录类型 | 恢复方式 | 为什么这样组织 |
|---|---|---|
| 平面 | 恢复两个斜率与一个截距，再在像素中心求值 | 局部近似平面可以用少量系数描述 |
| 2×2 量化深度 | 根据像素奇偶选分量，与共享尺度组合 | 保存小范围里不能由一个平面充分描述的变化 |

平面模式可以写成：

$$
z=a_xx+a_yy+c
$$

这里的坐标与截距要按当前块原点调整。量化模式则按两个坐标的奇偶选择相应字段；各字段的有效位数并不完全相同。

压缩数据因此是深度的另一种存储，而不是一张可直接作为阴影亮度使用的灰图。解压后才进入比较采样、屏幕解析和过滤。两个屏幕阴影通道的全部独立职责目前尚未完整确认。

<span id="environment"></span>

## 间接光、反射与体积雾的接入位置

场景建立三维索引与结构数据，再结合屏幕法线、深度和颜色生成较低分辨率的间接／反射候选。这些结果经过不同尺度的整理，由后续照明消费。

索引数据负责“找到什么”，候选颜色负责“取得什么光照值”，二者不是同一种体积。当前可以确认它们进入照明的关系，完整追踪、候选分量拆分与未命中处理仍不完整，不能仅凭三维数据就指定一套全局光照产品名称。

屏幕遮蔽也有半分辨率结果、计算过滤和空间遮蔽相关处理。它与直接阴影分别提供环境与光源方向的遮挡输入，最终暗部由多项共同形成。

体积雾使用 160×68×128 的空间网格。局部更新读取灯光、阴影、噪声与已有体积，后续再处理历史与累积，并合成到主 HDR 颜色。阴影可以影响空间里空气收到的光，因此不是只按表面距离盖一层固定颜色。这里保留已确认的数据关系，不补入尚未展开的散射相函数。


<span id="face"></span>

## 木偶脸部：从局部光方向到 SDF 明暗边界

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/genshin/face-base-colour.png"><img src="/images/rendering-analysis/genshin/face-base-colour.png" alt="脸部基础颜色" loading="lazy"></a><figcaption>脸部基础颜色</figcaption></figure>
<figure><a href="/images/rendering-analysis/genshin/face-sdf-red.png"><img src="/images/rendering-analysis/genshin/face-sdf-red.png" alt="脸部 SDF 的红色通道" loading="lazy"></a><figcaption>脸部 SDF 的红色通道</figcaption></figure>
<figure><a href="/images/rendering-analysis/genshin/face-sdf-alpha.png"><img src="/images/rendering-analysis/genshin/face-sdf-alpha.png" alt="同一 SDF 的 alpha 通道" loading="lazy"></a><figcaption>同一 SDF 的 alpha 通道</figcaption></figure>
</div>

基础颜色负责面部图案；后两张以灰度显示数值阈值。它们并不是当前帧脸上的实际阴影，而是供不同光方向查询的控制数据。

### 先把光转到脸自己的坐标里

角色转头后，世界中的同一光方向相对脸部会改变。顶点处理先把光方向投影到模型局部轴，再分别在两个二维平面中归一化，得到传给像素阶段的方向项。

归一化分母保留 0.0001 的下限，避免光几乎垂直于某个平面时除以接近零的长度。这里的局部方向负责让明暗条件跟随脸部姿态，而不是直接用屏幕左右判断光从哪里来。

### 红色与 alpha 接成两个阈值区间

读取 SDF 后，采样阈值 $s$ 为：

$$
s=
\begin{cases}
(a+1)/2,&a>0.0001\\
r/2,&a\le0.0001
\end{cases}
$$

红色分量负责较低的半区，alpha 分量可以进入较高的半区。图中的灰度不是“当前有多亮”，而是这个位置在何种方向条件下转入另一侧。

方向项 $l$ 则形成比较阈值：

$$
q=\operatorname{clamp}(0.5-0.5l+\delta,q_{\min},q_{\max})
$$

当前 $\delta=0$，上下限为 0.03 与 0.97。阈值没有被允许直接冲到两个极端，有助于保留可控制的分区范围。

### 阈值差怎样变成明暗权重

程序按边界陡度 $k$ 放大差值，再进行连续的 S 形转换：

$$
d=(s-q)k,\qquad e=2^{-49.828922|d|}
$$
$$
w_{\text{lit}}=
\begin{cases}
1/(1+e),&d\ge0\\
e/(1+e),&d<0
\end{cases}
$$

本次边界陡度为 100，暗端与亮端分别是 0 和 1。这个变换在差值跨过零时由暗侧迅速进入亮侧，边界形状主要由阈值纹理设计，而不是完全由网格弧度决定。

程序也有按光的侧别翻转横向 UV 的逻辑；当前主分支被材质控制强制为不翻转。不能因为存在自动翻转代码，就把这一帧写成已经执行了翻转。

### 次级控制与最终颜色

当前另一个 SDF 分支使用其余分量，通过局部 UV 选择、缩放、偏移和周期映射形成额外控制。它不是把同一个阈值公式原样再执行一次。

最终脸部还结合阴影颜色、不同区域的高光参数与视角边缘项。因此上式得到的是明暗权重，不是完整脸部颜色。基础贴图、主分区、局部控制和后续照明一起解释了最终面部，而单张 SDF 灰图只展示其中一种输入。

<span id="expressions"></span>

## 表情图集与有序消隐

![木偶脸部路径实际使用的表情图集](/images/rendering-analysis/genshin/expression-atlas.png)

图集中可见分散的眼部、嘴部与脸部图案。空白区域与小图块由 UV 选择，不能把整张纹理直接覆盖到脸上。

### 图集选择前仍有局部变换

程序通过表情索引与列数得到行列，行方向另有反序处理。在进入对应单元前，还可以：

- 以纹理中心为基准平移、缩放或镜像。
- 根据左右区域选择不同局部参数。
- 用正弦和余弦构造二维旋转，角度可带时间变化。
- 限制局部 UV，再映射到图集单元。

可选的第二层表情样本按自身 alpha 与第一层混合，最终再以覆盖率进入脸部颜色。表情颜色如何接受阴影也由方向条件控制。因此恢复骨骼与形态变形之后，仍可能需要材质图集才能得到完整表情。

### 消隐保留不透明深度行为

脸部程序还具有 4×4 有序抖动消隐。它根据屏幕像素位置从固定顺序表取阈值：

~~~text
 1  13   4  16
 9   5  12   8
 3  15   2  14
11   7  10   6
~~~

当有效消隐量低于相应开启阈值时，程序根据消隐量与格内阈值的关系决定保留或丢弃像素。比例变化通过空间覆盖实现，仍遵循不透明材质的深度逻辑，而不是把整个人物颜色统一做透明混合。

这是一条可用分支，实际是否丢弃由当前材质和像素输入决定。它与图集换表情属于不同任务。

<span id="eyes"></span>

## 眼睛：解析内部深度、多层颜色与 Matcap

<div class="rendering-figures">
<figure><a href="/scene-capture-comparison/figures/replay/genshin-eye-before.png"><img src="/scene-capture-comparison/figures/replay/genshin-eye-before.png" alt="眼睛材质写入之前" loading="lazy"></a><figcaption>眼睛材质写入之前</figcaption></figure>
<figure><a href="/scene-capture-comparison/figures/replay/genshin-eye-after.png"><img src="/scene-capture-comparison/figures/replay/genshin-eye-after.png" alt="写入之后：虹膜与眼内亮部" loading="lazy"></a><figcaption>写入之后：虹膜与眼内亮部</figcaption></figure>
<figure><a href="/scene-capture-comparison/figures/replay/genshin-face-final.png"><img src="/scene-capture-comparison/figures/replay/genshin-face-final.png" alt="最终脸部外观" loading="lazy"></a><figcaption>最终脸部外观</figcaption></figure>
</div>

前两张取同一材质颜色目标的相邻阶段。此时头发等后续部件尚未全部完成，额头与最终图的差异不属于眼睛程序本身。

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/genshin/pupil-colour.png"><img src="/images/rendering-analysis/genshin/pupil-colour.png" alt="一层瞳孔颜色" loading="lazy"></a><figcaption>一层瞳孔颜色</figcaption></figure>
<figure><a href="/images/rendering-analysis/genshin/pupil-matcap.png"><img src="/images/rendering-analysis/genshin/pupil-matcap.png" alt="视图法线查询的 Matcap 外观" loading="lazy"></a><figcaption>视图法线查询的 Matcap 外观</figcaption></figure>
<figure><a href="/images/rendering-analysis/genshin/pupil-highlight.png"><img src="/images/rendering-analysis/genshin/pupil-highlight.png" alt="眼内亮点的独立输入" loading="lazy"></a><figcaption>眼内亮点的独立输入</figcaption></figure>
</div>

它们是实际被眼睛路径读取的不同纹理。瞳孔图提供内部颜色，Matcap 提供随视图方向变化的外观，亮点又有自己的控制；最终眼睛不是直接显示其中任意一张。

### 视差来自沿视线的内部落点搜索

眼睛程序以表面法线、相机方向和材质参考轴构造局部坐标系。根据观察角度，搜索步数为：

$$
n=\left\lceil16-12|N\cdot V|\right\rceil
$$

正视时约为 4 步，接近掠射角时最多约为 16 步。斜视路径跨过更大的内部范围，因此分配更多步骤。

搜索在局部 UV 平面沿视线推进。每一步由当前位置到瞳孔中心的半径，计算解析定义的内部深度，找到穿越点后再用前后两步插值细化。当前瞳孔中心为 $(0.5,0.5)$，半径参数为 0.5，视差幅度参数约为 0.3，径向轮廓指数为 2。

主循环不是每一步都采样独立高度纹理，所以不能写成标准高度图视差映射的某个固定采样版本。它使用参数化的内部形状；最终得到的位置再用于瞳孔底色和相关图案。

### 不同层有各自的运动与混合

多层瞳孔纹理可以分别执行 UV 平移、旋转和振荡。打包渐变图中，不同纵向行保存不同混合曲线，程序固定读取若干行，再沿横向查询对应权重。

部分颜色路径还采用多项式转换：

$$
f(c)=((0.305306c+0.682171)c+0.012523)c
$$

因此不能将所有层的采样值直接按同一个线性加法相加。不同分支包含加法、乘法或叠加式组合，开关决定哪些路径实际参与。

### Matcap 的方向是怎样得到的

程序把 UV 相对中心的横向位置解释为球面局部坐标，以：

$$
z=\sqrt{\max(0,1-x^2-y^2)}
$$

恢复第三个分量，再与原法线混合。当前相关混合强度约为 0.3。这个方向转入观察空间后映射到纹理坐标，用于查询 Matcap。

这条路径可以产生随观察方向变化的眼球亮部，但它不证明亮点对应场景里某个真实反射物。前后的静态眼睛图展示写入贡献；真实视角变化幅度仍需要多视角画面。

<span id="cloth"></span>

## 裙装：控制分区、细节法线与明暗渐变

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/genshin/cloth-base-colour.png"><img src="/images/rendering-analysis/genshin/cloth-base-colour.png" alt="裙装路径的基础颜色" loading="lazy"></a><figcaption>裙装路径的基础颜色</figcaption></figure>
<figure><a href="/images/rendering-analysis/genshin/cloth-control-alpha.png"><img src="/images/rendering-analysis/genshin/cloth-control-alpha.png" alt="材质控制图的 alpha 分区" loading="lazy"></a><figcaption>材质控制图的 alpha 分区</figcaption></figure>
<figure><a href="/images/rendering-analysis/genshin/cloth-detail-normal.png"><img src="/images/rendering-analysis/genshin/cloth-detail-normal.png" alt="独立衣料细节输入" loading="lazy"></a><figcaption>独立衣料细节输入</figcaption></figure>
</div>

颜色图可识别浅色衣片与装饰。控制图的灰度块用于选择参数组；细节图又独立提供局部方向。三者职责不同，不能用底色图替代其余输入。

![裙装不同材质区域在最终画面中的位置](/scene-capture-comparison/figures/replay/genshin-cloth-final.png)

### 一个网格可以对应多组材质参数

控制图 alpha 通过 0.2、0.4、0.6、0.8 等阈值分成多个区间，再选择对应参数组。这使同一衣片网格内的区域拥有不同阴影色、高光或细节强度，而不必仅靠最终颜色区分材质。

当前基础法线、细节法线、金属响应和明暗渐变共同参与。控制图分区决定“选哪一组”，法线与光向决定“当前如何受光”，两者不能混为同一个遮罩。

### 用屏幕导数建立局部方向

裙装程序从位置和 UV 的屏幕导数建立局部切线关系。细节纹理的两个横向分量被映射到正负区间，纵向分量按平方根关系重建，再与基础法线组合。

某些细节路径受材质区域标记限制，所以不能把衣料微法线无条件施加到整个身体。这种处理允许局部织物保持自己的受光细节，同时沿用角色共用的几何与输出目标。

### 明暗不是直接把点积当亮度

光照点积先经过重映射：

$$
u_L=0.4975(N\cdot L)+0.5
$$

再与控制图和顶点数据结合，决定明暗分区与渐变查询。阴影渐变本身是实际的颜色资源：

![裙装路径使用的阴影渐变纹理](/images/rendering-analysis/genshin/cloth-shadow-ramp.png)

不同横向位置对应不同受光程度，纵向行可容纳多组规则。图中的窄色带只是输入，实际哪一行被哪种区域使用，要结合程序条件理解；并不是给最终截图沿水平方向盖一道渐变。

<span id="character-environment"></span>

## 角色环境：颜色与阴影分别取样、分别更新

角色不是直接从最终截图取一个平均色。当前路径从材质颜色和阴影数据取样，按有效性筛选，再把结果保存在小型浮点纹理中。

### 70 列里存的是不同任务

中间结果为 70×5：前 10 列保存环境颜色样本，后 60 列保存阴影样本，每列各有五个空间取样位置。汇总结果为 70×1，保持相同分区。

| 区域 | 样本怎样取得 | 怎样判断有效 |
|---|---|---|
| 环境颜色 | 把世界位置投影到主视图，读取材质色和类别 | 排除特定材质类别及无效位置 |
| 阴影 | 选择阴影覆盖层，投影到光源视角做深度比较 | 使用采样点自身的控制量 |

70 列不等于 70 个角色。它是两种任务的布局，实际如何为不同角色分配槽位还需要完整的实例关系。

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/genshin/environment-samples.png"><img src="/images/rendering-analysis/genshin/environment-samples.png" alt="五个样本逐列排列的中间结果" loading="lazy"></a><figcaption>五个样本逐列排列的中间结果</figcaption></figure>
<figure><a href="/images/rendering-analysis/genshin/environment-feedback.png"><img src="/images/rendering-analysis/genshin/environment-feedback.png" alt="压缩为一行的环境反馈" loading="lazy"></a><figcaption>压缩为一行的环境反馈</figcaption></figure>
</div>

这是两份小纹理的实际显示，颜色区和阴影区共用排列。阴影区域主要保存标量，因此直接显示为 RGB 时会呈红色或暗色；它不是周围环境的全景照片。

### 颜色更新是有条件的指数平滑

有效颜色样本取均值 $C_s$，已有结果为 $C_o$，本次更新为：

$$
C_{\text{new}}=0.9C_o+0.1C_s
$$

若没有有效样本，就保留旧结果。对固定的新输入，旧差异每次保留 90%，即经过 $n$ 次更新后残留 $0.9^n$。约 7 次更新消除一半旧差异，约 22 次消除九成；这是从实际系数推导的响应，不是额外测量的秒数。

类别筛选防止特定表面主导环境取样。例如已确认排除了与某些角色路径相关的类别，而不是按“像素看起来像皮肤”进行颜色识别。

### 阴影反馈是另一种状态积分

阴影区先对有效比较结果取均值，结合控制量得到相对中间值的偏差。旧状态的一部分也以 0.5 为中心解码，响应增益随旧偏差改变：

$$
g=(1.001-|s_o|)^{10}+0.01
$$
$$
s_{\text{new}}=s_o+\Delta_{\text{shadow}}g
$$

之后，用新偏差推进主阴影状态，并将偏差重新映射回保存范围。特殊控制条件还可以直接覆盖状态。

因此，阴影反馈不能套用颜色的固定 0.1 插值。它保留了自身的响应状态，共用一张小纹理不意味着共用一套更新公式。

### 谁读取旧结果，谁生成新结果

身体、脸、裙子与眼睛的相关顶点路径先读取已有环境结果；场景里的取样汇总随后执行。当前袜子代表顶点路径未读取该反馈，也不应该强行应用相同环境项。

这样的先后顺序，使环境成为跨次使用的输入。一次捕获可以确认读写关系与公式，但不能单独证明更新频率或所有角色的槽位交换方式。

<span id="motion"></span>

## 法线结束使用后，运动覆盖同一张图

照明阶段结束后，相机与几何运动重新写入此前保存法线的纹理。运动表示同一表面在当前与旧画面之间的屏幕位移。

![运动与附加控制通道的实际显示](/images/rendering-analysis/genshin/motion-rg.png)

直接显示的紫色角色区域主要受到附加标记影响，不能把它解释成角色在高速移动。程序实际只按约定从相应分量解码二维位移。

当前解码为：

$$
q=C_{\text{motion}}-\frac{127}{255},\qquad
v=\operatorname{sign}(q)(2q)^2
$$
$$
uv_h=uv_c-v
$$

零点为 $127/255$。相机运动可以从深度恢复表面位置后投影比较，动画几何还需要其当前与旧的变形后位置。只提供相机位移，无法正确描述角色转头或衣片摆动。

这张存储空间的寿命分为两段：

~~~text
材质写法线 → 照明和遮蔽读取法线
                         ↓ 最后一次方向读取完成
相机和几何写运动 → 运动模糊、历史融合读取运动
~~~

顺序复用节省了独立存储的需求，但不能在方向消费者结束前改写，也不能在动态几何尚未写完时提前融合历史。

<span id="postprocessing"></span>

## 运动模糊、泛光和显示颜色在历史之前完成

当前观察到的运动模糊路径先整理运动相关结果，再输出较低分辨率的颜色与控制。泛光路径从场景亮部开始，经过过滤、下降尺度与组合。最终颜色阶段再将相应结果汇入显示颜色。

这些步骤的输出顺序可以确认，但本篇没有将所有运动模糊与泛光变体展开为完整公式。这些阶段的具体参数需要分别从当前执行路径确认。

这里必须保留的事实是：**当前帧的颜色处理先结束，后面才做边缘与历史重建。** 这决定了历史保存的数值范围，也决定邻域约束应该比较什么颜色。

<span id="spatial-aa"></span>

## 当前帧抗锯齿：找边缘、求权重、混合邻居

![亮度边缘检测结果：显示被选中的横纵边缘](/images/rendering-analysis/genshin/edge-detection.png)

当前帧边缘处理是一条独立链：

| 步骤 | 输入 | 输出 |
|---|---|---|
| 亮度差检查 | 后处理颜色与材质类别 | 两方向边缘 |
| 形状搜索与查表 | 边缘图、面积表、搜索表 | 邻域混合权重 |
| 当前颜色混合 | 原颜色与方向权重 | 当前帧抗锯齿颜色 |
| 回写 | 混合结果 | 后续历史重建的当前输入 |

亮度按 $(0.2126,0.7152,0.0722)$ 加权，邻域差值与 0.1 比较。程序还检查类别，因此图中不是所有可见物体都用完全相同的边缘筛选规则。

后续面积与搜索查找表把边缘形状转为混合权重，形成 SMAA 型形态学处理。这一步只利用当前帧；下一节才加入旧颜色。当前图与历史图的处理分辨率相同，这份捕获没有展示从低分辨率到高分辨率的放大。

<span id="temporal"></span>

## 时序重建：前景运动、重建核与历史状态

<div class="rendering-figures">
<figure><a href="/scene-capture-comparison/figures/replay/genshin-temporal-before.png"><img src="/scene-capture-comparison/figures/replay/genshin-temporal-before.png" alt="历史融合输入：细碎亮点与栏杆边缘" loading="lazy"></a><figcaption>历史融合输入：细碎亮点与栏杆边缘</figcaption></figure>
<figure><a href="/scene-capture-comparison/figures/replay/genshin-temporal-after.png"><img src="/scene-capture-comparison/figures/replay/genshin-temporal-after.png" alt="历史融合输出：相同区域的变化" loading="lazy"></a><figcaption>历史融合输出：相同区域的变化</figcaption></figure>
</div>

两张采用相同位置和显示设置。输出中部分亮点与轮廓更平滑，同时也能观察到细节变软；它展示本次空间变化，不等同于连续运动质量测试。

### 沿前景表面重投影

程序比较中心及四个偏移为 $(\pm2,\pm2)$ 像素的位置，剔除越界点，并按当前反向深度约定选较靠前的表面，再读取其运动与类别。

细轮廓附近同时存在前景和背景。采用前景运动，可以减少把背景位移用于前景边界的情况。随后按平方关系解码位移，找到旧坐标，并单独取得历史状态与颜色控制。

### 当前颜色由十六个样本重建

当前颜色不是一次双线性取样。程序显式读取 4×4 的十六个样本，滤波尺度又受状态和采样偏置上限表控制。

将样本到重建中心的尺度化偏移记为 $p$：

$$
d^2=\min(p\cdot p,4)
$$
$$
w(d)=\left[1.5625(0.4d^2-1)^2-0.5625\right]
(0.25d^2-1)^2
$$

当前重建色为加权颜色和除以有效权重和，随后限制在十六个样本逐通道的最小、最大值之间。总权重过小时采用保护分母。

这个核含有负权重区间，不是普通平均。负瓣可以改变细节锐度，也可能把重建值推到邻域范围之外，因此最后的限幅有实际作用。

### 历史颜色使用另一套重建

旧坐标通常落在像素之间。程序由小数位置构造三次权重，将采样位置合并，以五次颜色读取重建历史 RGB，并做归一化。越界时，旧颜色与状态都不再作为正常历史使用。

新旧颜色的采样核不同：当前侧利用更完整邻域重建，历史侧按重投影位置过滤。只保留一个简单的“当前与旧颜色插值”无法解释前面的取样过程。

### 类别决定何时限制历史

雪等材质保存的高位状态在这里被提取，参与分支选择。一类路径采用逐通道最大值保留规则；其他路径在状态到期后，用当前对角邻居构造颜色区间，将历史限制进去。区间还随运动与亮度差变化。

类别、历史保留状态和颜色约束共同工作。这也说明材质输出里的附加位不是只服务当下照明，它们会持续影响最终细节。

### 混合比例来自权重和与累积状态

记当前有效权重和为 $W$，已受控制的历史累积量为 $H$：

$$
w_c=\frac{W}{W+12H}
$$
$$
C_{\text{out}}=\operatorname{lerp}(C_{\text{history,limited}},
C_{\text{current}},w_c)
$$

下一次允许的累积量上限还受 UV 运动长度影响：

$$
H_{\max}=12-10\operatorname{saturate}(6000\lVert v\rVert)
$$

静止时上限为 12，较快运动时降到 2。它是累积状态的上限，不是直接把颜色乘十二或乘二。完整状态更新还包含当前覆盖控制。

### 两张历史结果分别保存什么

| 保存位置 | 含义 | 对下一次的作用 |
|---|---|---|
| 状态的第一分量 | 颜色约束的延迟／保留状态 | 决定何时使用更强的颜色限制 |
| 状态的第二分量 | 归一化历史积累量 | 参与后续混合权重 |
| 颜色的 RGB | 重建与融合结果 | 作为下次旧颜色 |
| 颜色的 alpha | 当前运动图附加标记的副本 | 比较前后控制状态 |

普通路径的保留状态当前每次递减约 $1/9$，特定高位类别会将其重新设为 1。颜色 alpha 是控制标记的继承，不是程序重新估计的连续置信度。

本次采样偏置换算到像素约为 $(0.375,0.222222)$。一帧只能给出这个取值，无法单独恢复完整抖动序列。

<span id="conclusion"></span>

## 这份雪城实现的关键连接

积雪从两套材质和顶点控制形成表面，静态阴影经解压进入统一深度查询，木偶通过专用脸部、眼睛和衣料规则产生角色颜色，再选择性读取场景环境反馈。照明结束后，法线存储转为运动，颜色映射后的画面最后进入边缘与历史重建。

这条链里三个地方会跨越局部算法：雪的分类影响时序；场景取样更新角色以后的环境输入；角色旧位置影响整帧重投影。把每个效果单独描述而不说明这些联系，会遗漏它们能够共同工作的条件。

仍需进一步确认的是空间间接光与反射的完整追踪、所有头发与特殊材质变体、环境槽位分配和跨帧更新频率。尚未展开的分支不作为已确认机制列入结论。

</div>
