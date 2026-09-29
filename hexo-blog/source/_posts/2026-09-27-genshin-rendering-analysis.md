---
title: "原神渲染实现分析：雪城资源、木偶材质与时序重建"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-29T17:34:37+08:00"
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

以雪城与木偶这份截帧为例，先统计人物、地表、岩石、建筑和植被的几何与贴图，再从整帧流程展开积雪、阴影、环境、专用角色材质和抗锯齿。配图区分实际材质输入、绘制范围和阶段输出，读者无需持有截帧文件。

<!-- more -->

<link rel="stylesheet" href="/css/rendering-articles.css">

<div class="rendering-article">

<span id="frame"></span>

## 美术资源与渲染概况

![雪城最终画面：木偶位于阶梯、覆雪栏杆与建筑前](/scene-capture-comparison/muou/e25393_rt0.png)

### 美术资源概况

- **人物资源按部件和材质区域拆分。** 木偶使用身体、发束、脸部、裙装和眼睛等绘制；资产名称与解剖部位并不完全一一对应，正文以实际范围核对。
- **地表与岩石采用多层输入。** 地形以混合权重组合雪与石面，岩石同时读取大尺度方向和不同表面层。
- **建筑共享图集并接入雪层。** 通用立面、窗体、装饰物和简化的远处建筑使用不同资源组合。
- **植物以实例和图集复用。** 面片承载叶片与草簇轮廓，实例数、每实例几何量和最终像素覆盖分别决定不同工作量。

### 渲染分析概况

| 环节 | 本帧的组织方式 |
|---|---|
| 材质 | 六路表面输出承载颜色、方向、类别及附加控制，雪层在此形成覆盖 |
| 阴影与环境 | 静态压缩深度与动态深度汇合，屏幕／空间环境输入再进入照明 |
| 角色 | 脸部 SDF、表情图集、眼内视差与分区衣料共同形成专用外观 |
| 环境反馈 | 角色先消费已有取样结果，后面的场景取样更新颜色与阴影状态 |
| 运动与抗锯齿 | 法线目标结束使用后改写为运动；显示转换后再进行边缘与历史重建 |

### 样本条件

本帧主视图与输出均为 3440×1440，接口为 D3D11。它展示木偶位于雪城阶梯和建筑前的状态。文中数值描述这一视角下的实际资源与提交，尚未测量不同画质档位、硬件或观察距离下的变化。

下文的阶段图帮助读者在没有截帧文件的情况下定位变化。贴图表保存实际尺寸，预览按版面缩小；算法图则解释本帧已确认的数据流，不能当作游戏输出图。

<span id="resources"></span>

## 美术资源详细统计

### 渲染提交统计

下表按执行顺序合并连续阶段区间。每行包括区间内的相邻准备或合成工作，不将整段计数当作某一个效果的独占开销。绘制包含主视图、阴影、全屏处理及界面；计算分派单列。

| 连续阶段区间 | 绘制次数 | 计算分派 | 提交三角形数 |
|---|---:|---:|---:|
| 形变、环境与早期深度准备 | 209 | 61 | 347,292 |
| 主视图材质与贴花 | 492 | 0 | 1,200,598 |
| 深度层级、遮蔽、阴影与环境反馈 | 819 | 53 | 1,764,995 |
| 延迟照明、天空与雾 | 46 | 24 | 14,982 |
| 透明与效果 | 52 | 0 | 28,509 |
| 相机与几何运动 | 78 | 0 | 391,221 |
| 运动模糊、泛光与显示转换 | 19 | 3 | 28 |
| 边缘、历史、最终输出与界面 | 125 | 0 | 7,065 |
| **全帧合计** | **1,840** | **141** | **3,754,690** |

三角形按实际拓扑与实例数计入：三角形列表的一次提交量为“索引数 ÷ 3 × 实例数”。同一几何进入不同视图或阶段会重复计数；点形式的几何准备计入绘制次数，但不计作三角形。本帧另有 5 次以六控制点 Patch 为输入的绘制；它们计入绘制次数，但不能按索引数除以三推断细分后的三角形。表中三角形总量只统计三角形拓扑的输入提交。这里没有 GPU 时间数据，不能用调用或面数直接评价耗时。

下面改按资源对象拆开说明。每个部件的数字只对应已定位的代表提交，避免把整帧重复工作误当作唯一模型规模。

### 木偶人物资源

#### 几何拆分需要同时看材质与屏幕范围

角色采用多次几何提交建立身体、发束、脸、裙装和眼睛。下表来自主材质阶段的代表绘制，拓扑均为三角形列表、实例数均为 1。

| 代表路径 | 本次索引数 | 三角形数 | 屏幕覆盖说明 |
|---|---:|---:|---|
| 身体／袜子材质的一组几何 | 123369 | 41123 | 主要覆盖躯干、手臂与服装部件 |
| 名为 Hair 的材质 | 86766 | 28922 | 实际同时覆盖头部发束和腿部 |
| 脸部 | 10620 | 3540 | 面部独立范围 |
| 第一组裙装 | 18813 | 6271 | 胸前装饰及裙装部分 |
| 第二组裙装 | 29298 | 9766 | 另一组下身／裙装几何 |
| 眼睛 | 1608 | 536 | 眼部独立范围 |

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/genshin/body-geometry.png"><img src="/images/rendering-analysis/genshin/body-geometry.png" alt="身体材质这一组提交的范围。" loading="lazy" width="640" height="1206"></a><figcaption>身体材质这一组提交的范围。</figcaption></figure>
<figure><a href="/images/rendering-analysis/genshin/hair-geometry.png"><img src="/images/rendering-analysis/genshin/hair-geometry.png" alt="名为 Hair 的路径同时画入发束与腿部。" loading="lazy" width="640" height="1206"></a><figcaption>名为 Hair 的路径同时画入发束与腿部。</figcaption></figure>
<figure><a href="/images/rendering-analysis/genshin/dress-geometry.png"><img src="/images/rendering-analysis/genshin/dress-geometry.png" alt="第一组裙装的覆盖。" loading="lazy" width="640" height="1206"></a><figcaption>第一组裙装的覆盖。</figcaption></figure>
<figure><a href="/images/rendering-analysis/genshin/dress-secondary-geometry.png"><img src="/images/rendering-analysis/genshin/dress-secondary-geometry.png" alt="另一组裙装的覆盖。" loading="lazy" width="640" height="1206"></a><figcaption>另一组裙装的覆盖。</figcaption></figure>
</div>

黄色线框定位当前提交；底图是对应时刻的材质结果，还没有完成最终照明。这里不能按程序名字直接把整组几何命名为纯头发或纯袜子。尤其是 9766 个三角形的提交，其实际程序与覆盖属于第二组裙装，不能代表完整身体。

各组可能在阴影和运动阶段再次绘制。上表用于比较这些主材质提交的规模，不将它们与其他阶段的重复提交相加来推断独立人物资源量。

#### 角色贴图按部件与材质区域组织

| 资源组 | 尺寸、格式与用途 | 代表预览 |
|---|---|---|
| 头发路径底色 | 1024×1024，BC7 sRGB；同一图集包含发束和腿部衣料 | <a href="/images/rendering-analysis/genshin/hair-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/genshin/hair-colour.png" alt="本行资源的实际贴图预览" loading="lazy" width="768" height="768"></a> |
| 同组法线 | 1024×1024，BC7；方向与附加数据按当前程序解码 | <a href="/images/rendering-analysis/genshin/hair-normal.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/genshin/hair-normal.png" alt="本行资源的实际贴图预览" loading="lazy" width="768" height="768"></a> |
| 同组控制图 | 1024×1024，BC7；材质分区及受光控制 | <a href="/images/rendering-analysis/genshin/hair-control.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/genshin/hair-control.png" alt="本行资源的实际贴图预览" loading="lazy" width="768" height="768"></a> |
| 第一组身体／裙装 | 底色、法线、控制均为 1024×1024 | <a href="/images/rendering-analysis/genshin/cloth-base-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/genshin/cloth-base-colour.png" alt="本行资源的实际贴图预览" loading="lazy" width="768" height="768"></a> |
| 第一组身体控制 alpha | 与上行同一控制图，区间值选择参数组 | <a href="/images/rendering-analysis/genshin/cloth-control-a.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/genshin/cloth-control-a.png" alt="本行资源的实际贴图预览" loading="lazy" width="512" height="512"></a> |

头发路径的底色图能直接看到发束和浅色腿部衣料共享图集，与上面的几何范围一致。同一材质将这些区域放进一次提交，共享纹理输入，再由 UV 和区域控制决定各处的外观。

第一组身体与裙装使用同一批底色、法线和控制输入，但通过不同程序处理覆盖区域。另一组裙装使用第二套 1K 图集。它们还共享金属响应、细节和渐变资源；某张细节图的资产名来自其他角色，当前确实被这套材质读取，不能凭名字把它排除。

| 共享输入 | 本次规格 | 具体用途 |
|---|---|---|
| 衣料细节 | 256×256，RGBA8 | 为部分区域提供更细的法线变化 |
| 金属响应 | 256×256，BC7 sRGB | 参与视角和高光响应 |
| 高光渐变 | 256×2，RGBA8 sRGB | 窄条查表输入 |
| 身体阴影渐变 | 256×20，RGBA8 sRGB | 多行保存不同明暗颜色设计 |
| 头发阴影渐变 | 256×20，RGBA8 sRGB | 对应头发材质的渐变 |

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/genshin/cloth-control-r.png"><img src="/images/rendering-analysis/genshin/cloth-control-r.png" alt="同一身体控制图的 R。" loading="lazy" width="512" height="512"></a><figcaption>同一身体控制图的 R。</figcaption></figure>
<figure><a href="/images/rendering-analysis/genshin/cloth-control-g.png"><img src="/images/rendering-analysis/genshin/cloth-control-g.png" alt="同一身体控制图的 G。" loading="lazy" width="512" height="512"></a><figcaption>同一身体控制图的 G。</figcaption></figure>
<figure><a href="/images/rendering-analysis/genshin/cloth-control-b.png"><img src="/images/rendering-analysis/genshin/cloth-control-b.png" alt="同一身体控制图的 B。" loading="lazy" width="512" height="512"></a><figcaption>同一身体控制图的 B。</figcaption></figure>
<figure><a href="/images/rendering-analysis/genshin/cloth-control-a.png"><img src="/images/rendering-analysis/genshin/cloth-control-a.png" alt="同一身体控制图的 alpha。" loading="lazy" width="512" height="512"></a><figcaption>同一身体控制图的 alpha。</figcaption></figure>
</div>

这些都是同一 UV 空间的真实通道。alpha 中分段的灰度配合 0.2、0.4、0.6、0.8 等阈值选择多组材质参数，因此同一网格上的不同区域可以有不同阴影色、细节法线和高光。RGB 的分区外观不能单独代替采样公式；后文继续展开已确认的控制计算。

#### 脸、表情与眼睛

脸部使用 1024×1024 底色、1024×1024 SDF、512×512 阴影控制和 1024×1024 表情图集。SDF 存的是光向对应的明暗阈值，不是最终阴影颜色；表情图集则按材质参数选格并变换局部 UV。

眼睛另外绑定多张 128 或 256 边长的瞳孔图、512×512 的 Matcap，以及 256×8 的多行渐变。这里的 Matcap 通过视角方向查询，渐变提供不同混合曲线，瞳孔图负责内部层次。它们不是“同一个眼睛底图”的重复备份。

这些资源的图示放在后面的脸部、表情和眼睛算法旁：读者可以先看到实际通道，再跟随光向、UV 或视线一步步得到对应结果。

#### 有效顶点输入

第一组裙装绘制中，位置与法线来自两个 12 字节浮点向量，分别位于同一流的不同偏移；顶点颜色用 4 字节归一化 RGBA，纹理坐标用双通道半精度保存。当前程序确实读取位置、法线、颜色和多组 UV；绑定布局中的切线槽位没有被这条程序使用。

这与后文用屏幕空间导数构造细节法线方向的实现相呼应：不能看到输入布局里存在 TANGENT 名称，就假设像素计算直接依赖一条有效的模型切线。两组 UV 还共享同一存储偏移，语义数量同样不能代替实际资源数量。

### 地表资源

#### 分块地形与材质混合

代表地形调用单实例为 512 个三角形，一次实例化绘制提交 23 个实例，合计 11776 个三角形。材质读取地形法线、混合权重，以及雪面和石面的多组颜色／法线。

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/genshin/terrain-geometry.png"><img src="/images/rendering-analysis/genshin/terrain-geometry.png" alt="这一组地形实例在画面中的几何范围；场景仍处于材质建立阶段。" loading="lazy" width="1280" height="536"></a><figcaption>这一组地形实例在画面中的几何范围；场景仍处于材质建立阶段。</figcaption></figure>
<figure><a href="/images/rendering-analysis/genshin/terrain-splat.png"><img src="/images/rendering-analysis/genshin/terrain-splat.png" alt="1024×1024 地表混合权重纹理，各通道保存不同分布。" loading="lazy" width="768" height="768"></a><figcaption>1024×1024 地表混合权重纹理，各通道保存不同分布。</figcaption></figure>
<figure><a href="/images/rendering-analysis/genshin/terrain-stone.png"><img src="/images/rendering-analysis/genshin/terrain-stone.png" alt="1024×1024 的一张石面颜色输入。" loading="lazy" width="768" height="768"></a><figcaption>1024×1024 的一张石面颜色输入。</figcaption></figure>
</div>

| 地形输入 | 本次规格 | 为什么需要它 |
|---|---|---|
| 地形总体法线 | 512×512，RGBA8 | 描述地形较大尺度的朝向 |
| 混合权重 | 1024×1024，BC3 | 指定不同地表材料在区域内的分布 |
| 平整雪面颜色／遮罩 | 512×512，BC3 sRGB | 雪面的一组颜色和控制输入 |
| 风吹雪与石面颜色 | 多张 1024×1024，BC3 sRGB | 提供不同地貌的表面细节 |
| 对应材质法线 | 主要为 1024×1024，BC7 | 细节朝向与总体地形方向组合 |
| 世界雪法线、闪光与尘雪控制 | 512×512 | 跨地形与其他雪材质共用的细节输入 |

地形顶点程序实际使用平面位置、额外坐标参数和实例索引；它的输入不像角色那样提供一整套有效的普通网格法线与切线。较大尺度方向可以来自纹理，材质又叠加小尺度法线，因此“模型细分”和“表面看起来有细节”需要分别判断。

权重图是材质混合输入，不是最终颜色。当前截图中的雪地冷暖、建筑遮挡与局部高亮还要经过照明、雾和后处理，不能从权重图的彩色直接推断雪面外观。

### 岩石与场景道具

#### 岩石同时使用大尺度法线和多组表面层

岩石代表提交包含 2994 个三角形、10 个实例，共提交 29940 个三角形。其输入包括 2048×2048 大尺度法线，以及多组 2K 石面颜色／法线，另有共享的雪细节与环境输入。

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/genshin/rock-geometry.png"><img src="/images/rendering-analysis/genshin/rock-geometry.png" alt="岩石实例的实际范围，分布在街道两侧和背景。" loading="lazy" width="1280" height="536"></a><figcaption>岩石实例的实际范围，分布在街道两侧和背景。</figcaption></figure>
<figure><a href="/images/rendering-analysis/genshin/rock-colour.png"><img src="/images/rendering-analysis/genshin/rock-colour.png" alt="一组 2K 石面颜色。" loading="lazy" width="768" height="768"></a><figcaption>一组 2K 石面颜色。</figcaption></figure>
<figure><a href="/images/rendering-analysis/genshin/rock-large-normal.png"><img src="/images/rendering-analysis/genshin/rock-large-normal.png" alt="同次绘制读取的大尺度岩石法线。" loading="lazy" width="768" height="768"></a><figcaption>同次绘制读取的大尺度岩石法线。</figcaption></figure>
</div>

多层输入允许在同一个岩石轮廓上组织基础石质、局部表面变化和雪层，而不是为每一种积雪量制作完全独立的模型。这里可以确认资源组合与混合材质路径；每张控制图所有通道的对应关系仍需逐分支确认。

#### 中央装饰物的雪层有独立资源

这条装饰物绘制为 770 个三角形，底色、法线和控制均为 256×256；它还读取 512×512 雪颜色／遮罩及 1024×1024 雪法线。底色中的金色几何纹样对应装饰物图集，不能把它当作普通门窗贴图。

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/genshin/prop-base-colour.png"><img src="/images/rendering-analysis/genshin/prop-base-colour.png" alt="中央装饰物的底色。" loading="lazy" width="512" height="512"></a><figcaption>中央装饰物的底色。</figcaption></figure>
<figure><a href="/images/rendering-analysis/genshin/prop-normal.png"><img src="/images/rendering-analysis/genshin/prop-normal.png" alt="同一物件的方向输入。" loading="lazy" width="512" height="512"></a><figcaption>同一物件的方向输入。</figcaption></figure>
<figure><a href="/images/rendering-analysis/genshin/prop-material-control.png"><img src="/images/rendering-analysis/genshin/prop-material-control.png" alt="同一物件的材质控制。" loading="lazy" width="512" height="512"></a><figcaption>同一物件的材质控制。</figcaption></figure>
</div>

后文雪层公式来自这条实际绘制。阶梯与栏杆的前后图则用于展示整幅场景在材质和最终显示之间的变化。二者分别说明具体算法和整体外观，不把一张广角截图当成所有表面都执行相同公式的证据。

### 建筑资源

#### 通用建筑图集与窗体资源分开

| 代表绘制 | 每实例三角形 | 实例数 | 本次提交量 |
|---|---:|---:|---:|
| 一组通用建筑 | 2506 | 4 | 10024 |
| 一组窗体 | 592 | 2 | 1184 |
| 一组远处建筑部件 | 338 | 1 | 338 |

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/genshin/architecture-geometry.png"><img src="/images/rendering-analysis/genshin/architecture-geometry.png" alt="通用建筑这一组实例的屏幕范围。" loading="lazy" width="1280" height="536"></a><figcaption>通用建筑这一组实例的屏幕范围。</figcaption></figure>
<figure><a href="/images/rendering-analysis/genshin/architecture-colour.png"><img src="/images/rendering-analysis/genshin/architecture-colour.png" alt="2048×2048 的通用建筑底色图集。" loading="lazy" width="768" height="768"></a><figcaption>2048×2048 的通用建筑底色图集。</figcaption></figure>
<figure><a href="/images/rendering-analysis/genshin/window-colour.png"><img src="/images/rendering-analysis/genshin/window-colour.png" alt="另一组 2048×2048 窗体颜色输入。" loading="lazy" width="768" height="768"></a><figcaption>另一组 2048×2048 窗体颜色输入。</figcaption></figure>
</div>

通用建筑和窗体各自配有 2K 法线、1K 材质控制。通用建筑材质还读取雪层颜色与方向数据，因此积雪并非只属于地形系统：建筑表面也在自己的材质求值中接入覆盖层。

底色图集由立面纹样、边框和连续条带组成，多个实例复用同一组图案。实例数量说明这次重复提交了多少份几何；它不能说明纹理在整个城市场景中的复用总次数，也不等同于独立建筑数量。

#### 简化的远处建筑输入

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/genshin/distant-building-atlas.png"><img src="/images/rendering-analysis/genshin/distant-building-atlas.png" alt="远处建筑提交读取的 2048×2048 颜色图集，多个表面拼在一起。" loading="lazy" width="768" height="768"></a><figcaption>远处建筑提交读取的 2048×2048 颜色图集，多个表面拼在一起。</figcaption></figure>
</div>

这条 338 个三角形的提交只绑定一张颜色图作为像素纹理输入，比上面的通用建筑路径简化。图集整合了砖石、墙面、窗体与饰边；本次资源与调用可以支持“存在简化绘制路径”，但单帧无法给出各级模型的切换距离或所有 LOD 档位。

### 植被资源

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/genshin/vegetation-geometry.png"><img src="/images/rendering-analysis/genshin/vegetation-geometry.png" alt="一组植物几何的提交范围；线框显示承载纹理的面片范围。" loading="lazy" width="1280" height="536"></a><figcaption>一组植物几何的提交范围；线框显示承载纹理的面片范围。</figcaption></figure>
<figure><a href="/images/rendering-analysis/genshin/grass-packed.png"><img src="/images/rendering-analysis/genshin/grass-packed.png" alt="1024×1024 的植物打包纹理，包含叶片、草茎和小簇形状。" loading="lazy" width="768" height="768"></a><figcaption>1024×1024 的植物打包纹理，包含叶片、草茎和小簇形状。</figcaption></figure>
</div>

该提交的单实例几何为 1312 个三角形，一次绘制包含 23 个实例，合计 30176 个三角形。实际输入为 BC3 格式的植物打包图、默认颜色与共享雪闪光控制。程序名字含树木路径，但这份资源可见的是草叶及小型植物图案，不应将它描述为一棵完整树的模型。

线框会显示承载纹理的矩形或长条面片，最终轮廓还由材质决定；因此线框中的大块范围不等于最终每个像素都会显示植物颜色。本次调用还采用与普通实体材质不同的深度状态，复用先前建立的可见性。

### 天空与环境资源

天空阶段在主体延迟照明之后接入。代表天空调用读取 256×256 的单通道噪声、16×1 的颜色表和 1024×2 的渐变表。小尺寸颜色表负责参数化颜色，并非整片天空的照片；噪声提供空间变化，方向与深度等输入决定这些值如何应用到画面。

雪城的环境部分还包含分级深度、遮蔽、反射、体积数据和角色环境反馈。角色反馈本次为 70×5 取样、70×1 汇总，列区间承担不同任务。它的逐项布局与更新规则在渲染分析中解释；不能把条带图当作一张可直接贴到人物身上的环境纹理。


## 渲染分析

<span id="pipeline"></span>

### 整帧流程

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

#### 沿同一视角观察颜色的建立

<div class="rendering-figures rendering-stages">
<figure><a href="/images/rendering-analysis/genshin/stage-material.png"><img src="/images/rendering-analysis/genshin/stage-material.png" alt="主材质颜色：雪覆盖和角色分区已经存在。" loading="lazy" width="1200" height="502"></a><figcaption>主材质颜色：雪覆盖和角色分区已经存在。</figcaption></figure>
<figure><a href="/images/rendering-analysis/genshin/stage-lighting.png"><img src="/images/rendering-analysis/genshin/stage-lighting.png" alt="主体延迟照明完成；天空与后续效果仍未全部接入。" loading="lazy" width="1200" height="502"></a><figcaption>主体延迟照明完成；天空与后续效果仍未全部接入。</figcaption></figure>
<figure><a href="/images/rendering-analysis/genshin/stage-fog.png"><img src="/images/rendering-analysis/genshin/stage-fog.png" alt="天空和雾之后：远景与空气贡献进入 HDR。" loading="lazy" width="1200" height="502"></a><figcaption>天空和雾之后：远景与空气贡献进入 HDR。</figcaption></figure>
<figure><a href="/images/rendering-analysis/genshin/stage-transparent.png"><img src="/images/rendering-analysis/genshin/stage-transparent.png" alt="透明与效果之后的当前颜色。" loading="lazy" width="1200" height="502"></a><figcaption>透明与效果之后的当前颜色。</figcaption></figure>
<figure><a href="/images/rendering-analysis/genshin/stage-tonemap.png"><img src="/images/rendering-analysis/genshin/stage-tonemap.png" alt="显示转换后，继续交给边缘与历史处理。" loading="lazy" width="1200" height="502"></a><figcaption>显示转换后，继续交给边缘与历史处理。</figcaption></figure>
<figure><a href="/scene-capture-comparison/muou/e25393_rt0.png"><img src="/scene-capture-comparison/muou/e25393_rt0.png" alt="最终输出：历史重建及界面合成完成。" loading="lazy" width="3440" height="1440"></a><figcaption>最终输出：历史重建及界面合成完成。</figcaption></figure>
</div>

材质图按 sRGB 表面颜色解释，各中间 HDR 阶段采用一致的 0 到 1 预览范围；显示转换与最终图已进入另一颜色阶段。这里展示执行进展，不是逐项关闭效果的差分实验。

<span id="gbuffer"></span>

### 六路表面输出怎样承载不同材质

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
<figure><a href="/images/rendering-analysis/genshin/surface-colour.png"><img src="/images/rendering-analysis/genshin/surface-colour.png" alt="材质颜色：保留表面与角色的颜色分区" loading="lazy" width="1000" height="419"></a><figcaption>材质颜色：保留表面与角色的颜色分区</figcaption></figure>
<figure><a href="/images/rendering-analysis/genshin/surface-normal.png"><img src="/images/rendering-analysis/genshin/surface-normal.png" alt="同一场景的法线编码" loading="lazy" width="1000" height="419"></a><figcaption>同一场景的法线编码</figcaption></figure>
</div>

两张图对应相同场景。法线图的彩色来自方向编码；建筑立面、台阶与角色曲面因朝向不同而呈现不同颜色。它们都还不是最终照明结果。

方向的读取采用 $\operatorname{normalize}(2C-1)$。材质颜色的 alpha 可能是附加控制，不能统一当作透明度；另一个单通道材质量也没有被证明在全图始终等于粗糙度或 AO。

模板中的身体与眼睛分类，与 R8 类别图是两套不同接口。前者可在绘制前筛选像素，后者作为可采样数值进入程序。把二者直接当成相同类别值，会误解后续分支。

贴花阶段还能修改颜色与法线，同时保留某些扩展标记。表面输入不仅要看最初由谁写入，也要看照明读取之前是否经过局部修改。

<span id="snow-material"></span>

### 雪层：覆盖分区、方向细节与历史控制

<div class="rendering-figures">
<figure><a href="/scene-capture-comparison/figures/replay/genshin-snow-material.png"><img src="/scene-capture-comparison/figures/replay/genshin-snow-material.png" alt="光照前：雪覆盖已经进入材质颜色" loading="lazy" width="640" height="402"></a><figcaption>光照前：雪覆盖已经进入材质颜色</figcaption></figure>
<figure><a href="/scene-capture-comparison/figures/replay/genshin-snow-final.png"><img src="/scene-capture-comparison/figures/replay/genshin-snow-final.png" alt="最终画面：覆盖再接受环境与遮挡" loading="lazy" width="640" height="402"></a><figcaption>最终画面：覆盖再接受环境与遮挡</figcaption></figure>
</div>

观察栏杆顶面、阶梯和上方覆雪区域。第一张已有覆盖分区；第二张的蓝灰色与阴影还来自后续照明。这是阶段对照，不是积雪开关实验。

#### 两层材质分别计算，再组合输出

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

#### 细碎亮点为什么要受屏幕导数约束

程序额外采样世界雪法线与闪光遮罩。输入位置在相邻像素间变化越快，细节采样就越容易对微小视角变化敏感。当前路径用形如：

$$
k_{\text{detail}}=\max(1-24D,0)
$$

的项削弱细微偏移，$D$ 为已计算的屏幕导数总量。它还根据条件调整纹理层级偏置，并可增加一次视角偏移后的采样。

颜色边缘项采用 $(1-\operatorname{saturate}(V\cdot N))^3$ 类型的关系，视线越掠过表面，相关项越强。上述控制共同决定雪细节的响应，不能只用“给白色表面加高光”概括。

#### 雪材质同时给抗锯齿留下状态

雪相关状态被放入类别字节的高两位，普通材质类别保留在低位。后面的历史程序正好读取这两个高位，选择颜色约束与状态更新。

因此，雪的设计并未止于当前颜色。材质阶段还告诉后面的历史处理：当前表面应该怎样保留或限制旧结果。这是一条从具体雪材质延伸到整帧显示的直接联系。

<span id="height-cache"></span>

### 高度层缓存：选择可以写入的表面候选

这一帧还执行了表面高度更新。它通过光栅覆盖调用像素计算，但不向当前可见颜色写入，而是更新 2048×2048 的精细高度缓存和 256×256 的粗网格标记。

#### 进入缓存前的过滤

归一化法线的竖直分量必须大于约 0.642788，也就是表面与向上方向的夹角小于约 50°。程序还检查换算后的深度变化率，排除不适合当前高度层的陡斜或不连续区域。

像素坐标加上当前环形偏移后，以 2048 为周期寻址。缓存能够围绕局部区域移动使用，不必始终以固定世界原点解释同一个像素。

#### 粗网格先判断高度分布是否连续

每个 8×8 精细区域对应一个粗格。归一化高度区间被分成 32 层，由位集合表示哪些层被表面占据。加入当前候选后，程序只继续接受集中在最低两个相邻层附近的情况。

这样做是在高度更新前限制多层重叠：若一个区域里存在彼此远离的表面，不能轻易把它们当成同一连续高度层。

#### 精细更新以高度优先竞争

高度被量化到约 65532 的整数范围，再与旧值比较。允许厚度由当前高度范围与厚度系数换算，本次对应阈值为：

$$
\left\lceil\frac{65532\times1.2}{32}\right\rceil=2458
$$

程序把新高度放在高位、高度差放在低位，对组合整数取原子最大值。高位的高度优先决定谁能赢得竞争；只有真正更新成功的像素才标记粗网格发生变化。

已确认的是高度候选的选择、组织和更新。它与可见双层雪材质同处这个雪城流程，但全部下游连接尚未还原，因而不能把它直接命名为完整足迹或动态压雪系统。

<span id="shadows"></span>

### 阴影：把压缩静态深度恢复到统一查询流程

![本帧场景阴影图集的深度预览](/images/rendering-analysis/genshin/shadow-atlas.png)

图集中可以看到多个不同覆盖范围的深度区域。灰度表示从相应光源视角记录的深度，不是主相机看到的光照颜色。角色环境阴影取样和场景着色都会读取这些遮挡信息。

#### 静态和动态深度在使用前汇合

动态角色与场景几何从光源方向绘制深度；部分静态阴影则从压缩记录解码，直接写入供后续比较的深度目标。到了照明阶段，消费者使用已经恢复的深度，不必在每个像素里重新解析压缩树。

阴影图集给子区块预留边界。例如分配尺寸为 256、512、1024 的格子，实际可绘制范围分别为 252、508、1020，起点内缩两个像素。边界留白为相邻区域的过滤提供隔离空间。

#### 先定位分块，再下降到深度载荷

代表解压路径以 32×32 像素为块查询元数据。块内像素的坐标位决定四叉树象限，节点告诉程序继续下降还是已经到达叶子。

节点描述为紧凑位字段，多个节点共用一个整数；当前程序最多进行四次实际象限寻址。叶子再取得对应的深度记录，选择具体解码方式。

这使平缓区域可以早些结束查找，复杂区域进一步细分。分块元数据描述的是逻辑阴影区域，最终落在大图集哪里，则由解压矩形的位置和视口决定。

#### 两种深度记录对应不同局部形态

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

#### 块坐标、树内路径和叶子载荷是三种地址

<figure class="rendering-diagram"><a href="/images/rendering-analysis/genshin/shadow-decode.svg" target="_blank" rel="noopener"><img src="/images/rendering-analysis/genshin/shadow-decode.svg" alt="原神压缩阴影的查找和解码示意：32 像素块、四叉树路径、平面或四点深度" loading="lazy" width="1000" height="1030"></a><figcaption>算法示意 · 点击查看大图</figcaption></figure>

*算法示意，依据实际解压程序重绘。图中树的分支形状用于解释查询过程，不是该图集全部节点的可视化。*

一个输出像素先用整数坐标除以 32，查找所属块的元数据。剩余的块内坐标用于树内查询。每下降一层，分别取横纵坐标的一个二进制位，组合为象限：

$$
q=b_x+2b_y,\qquad q\in\{0,1,2,3\}
$$

当前寻址依次使用块内坐标从较高到较低的四个位，因此可以从 32×32 区域逐级进入 16×16、8×8、4×4、2×2 子区域；中途遇到叶子则结束。最后剩余的最低一位，恰好可用于 2×2 载荷中的像素选择。查树与读四点数据因此衔接起来，而不是两段互不相关的位运算。

节点本身采用 10 位描述，一个 32 位整数中存三个节点，剩余两位不属于这三个描述。设要查询的节点序号为 $j$，则其存储字和字内位置由：

$$
\text{word}=\left\lfloor j/3\right\rfloor,\qquad
\text{lane}=j\bmod3
$$

确定，再从偏移 $10\,\text{lane}$ 处取出 10 位。节点标志决定是否继续下降，后续字段则给出子节点或载荷的相对位置。这是地址解码；还没有得到可用于阴影比较的深度。

#### 平面系数并不是三个普通浮点数

平面载荷从一个 32 位整数中拆出模式位、两个 10 位字段和一个 11 位字段。程序把两个 10 位字段移到半精度浮点编码的高位，补足低位后转为浮点数；11 位字段采用另一种补位方式恢复截距相关量。

这与“把整数除以 1023 得到零到一”不同：补出的编码随后被当作半精度浮点数解释，含有指数与符号的语义。位字段的数值大小不能直接当成深度。

恢复斜率 $a_x,a_y$ 和块基准值 $c_b$ 后，程序先用块原点 $u_b$ 调整截距：

$$
c=c_b-a_xu_{b,x}-a_yu_{b,y}
$$
$$
z=a_xu_x+a_yu_y+c
$$

$u$ 来自当前像素中心，即整数坐标加 0.5 后归一化。写成等价的语义形式，是 $z=c_b+a_x(u_x-u_{b,x})+a_y(u_y-u_{b,y})$。基准位置和像素中心缺一不可：若只把系数代入未归一化的屏幕整数坐标，斜率所代表的尺度会完全改变。

#### 四点载荷采用不等长量化字段

另一种模式把四个深度样本和共享尺度放入一个 32 位整数。令块内最低坐标位为 $x_0,y_0$，本次解码选择的字段起点为：

$$
b=6+6x_0+13y_0
$$

| 2×2 内的位置 | 字段偏移 | 字段位数 |
|---|---:|---:|
| 左上 $(0,0)$ | 6 | 6 |
| 右上 $(1,0)$ | 12 | 7 |
| 左下 $(0,1)$ | 19 | 6 |
| 右下 $(1,1)$ | 25 | 7 |

低位保留模式与共享尺度信息。右侧两个样本比左侧多一位，但程序同时调整重建尺度，所以不能直接比较左右整数码值。实际深度是选中整数与对应尺度组合后的结果，不是把这四段拼成 RGBA 颜色。

到这一步才输出恢复的深度，供后面的阴影查询使用。静态数据的压缩是减少存储和恢复成本的组织方式；动态角色仍需自己的几何阴影。不能由静态阴影能解压，推断角色阴影也存进同一份离线载荷。

<span id="environment"></span>

### 间接光、反射与体积雾的接入位置

场景建立三维索引与结构数据，再结合屏幕法线、深度和颜色生成较低分辨率的间接／反射候选。这些结果经过不同尺度的整理，由后续照明消费。

索引数据负责“找到什么”，候选颜色负责“取得什么光照值”，二者不是同一种体积。当前可以确认它们进入照明的关系，完整追踪、候选分量拆分与未命中处理仍不完整，不能仅凭三维数据就指定一套全局光照产品名称。

屏幕遮蔽也有半分辨率结果、计算过滤和空间遮蔽相关处理。它与直接阴影分别提供环境与光源方向的遮挡输入，最终暗部由多项共同形成。

体积雾使用 160×68×128 的空间网格。局部更新读取灯光、阴影、噪声与已有体积，后续再处理历史与累积，并合成到主 HDR 颜色。阴影可以影响空间里空气收到的光，因此不是只按表面距离盖一层固定颜色。这里保留已确认的数据关系，不补入尚未展开的散射相函数。


<span id="face"></span>

### 木偶脸部：从局部光方向到 SDF 明暗边界

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/genshin/face-base-colour.png"><img src="/images/rendering-analysis/genshin/face-base-colour.png" alt="脸部基础颜色" loading="lazy" width="768" height="768"></a><figcaption>脸部基础颜色</figcaption></figure>
<figure><a href="/images/rendering-analysis/genshin/face-sdf-red.png"><img src="/images/rendering-analysis/genshin/face-sdf-red.png" alt="脸部 SDF 的红色通道" loading="lazy" width="768" height="768"></a><figcaption>脸部 SDF 的红色通道</figcaption></figure>
<figure><a href="/images/rendering-analysis/genshin/face-sdf-alpha.png"><img src="/images/rendering-analysis/genshin/face-sdf-alpha.png" alt="同一 SDF 的 alpha 通道" loading="lazy" width="768" height="768"></a><figcaption>同一 SDF 的 alpha 通道</figcaption></figure>
</div>

基础颜色负责面部图案；后两张以灰度显示数值阈值。它们并不是当前帧脸上的实际阴影，而是供不同光方向查询的控制数据。

#### 先把光转到脸自己的坐标里

角色转头后，世界中的同一光方向相对脸部会改变。顶点处理先把光方向投影到模型局部轴，再分别在两个二维平面中归一化，得到传给像素阶段的方向项。

归一化分母保留 0.0001 的下限，避免光几乎垂直于某个平面时除以接近零的长度。这里的局部方向负责让明暗条件跟随脸部姿态，而不是直接用屏幕左右判断光从哪里来。

#### 红色与 alpha 接成两个阈值区间

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

#### 阈值差怎样变成明暗权重

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

#### 一次 SDF 查询的数值过程

<figure class="rendering-diagram"><a href="/images/rendering-analysis/genshin/face-sdf-flow.svg" target="_blank" rel="noopener"><img src="/images/rendering-analysis/genshin/face-sdf-flow.svg" alt="脸部 SDF 示意：局部光方向生成比较阈值，纹理生成表面阈值，差值决定明暗" loading="lazy" width="1000" height="1050"></a><figcaption>算法示意 · 点击查看大图</figcaption></figure>

*依据本帧脸部路径绘制。下方边界曲线是公式示意；材质控制在本次主分支禁用了横向翻转。*

可以把两个输入看成不同的问题。纹理值 $s$ 回答“脸上这个位置的边界设在哪里”，光方向给出的 $q$ 回答“本次照明推进到哪条边界”。当 $s=q$，上面的 S 形转换恰好给出 0.5；$s>q$ 进入亮侧，$s<q$ 进入暗侧。

用不代表本帧具体像素的数值走一遍：若 $r=0.6,a=0$，则 $s=0.3$；若局部方向项 $l=0.4$ 且偏移为零，则 $q=0.3$，正好落在过渡中心。光方向改变为 $l=0.6$ 后，$q=0.2$，同一个纹理位置便转向亮侧。纹理不需要随光重新绘制，改变查询阈值即可让边界在脸上移动。

alpha 非零时，程序选择 $(a+1)/2$，不是把红色和 alpha 各算一份阴影后混合。例如 $a=0.2$ 会选择 $s=0.6$；此时红色通道不再决定这个主阈值。两张灰图一起展示，才足以理解整个阈值域。

把 $s-q$ 记为 $\Delta$，亮侧权重由 10% 增加到 90% 所需的阈值宽度为：

$$
\Delta_{10\%\rightarrow90\%}
=\frac{2\log_2 9}{49.828922\,k}
$$

本次 $k=100$，宽度约为 0.00127。这个数字描述阈值域中的陡度，**不等于屏幕上 0.00127 个像素**。屏幕边缘有多宽，还取决于 SDF 在表面上的梯度、纹理过滤、投影尺寸及后续抗锯齿。因此非常陡的数值过渡仍不能直接用最终截图测成一个固定像素宽度。

#### 次级控制与最终颜色

当前另一个 SDF 分支使用其余分量，通过局部 UV 选择、缩放、偏移和周期映射形成额外控制。它不是把同一个阈值公式原样再执行一次。

最终脸部还结合阴影颜色、不同区域的高光参数与视角边缘项。因此上式得到的是明暗权重，不是完整脸部颜色。基础贴图、主分区、局部控制和后续照明一起解释了最终面部，而单张 SDF 灰图只展示其中一种输入。

<span id="expressions"></span>

### 表情图集与有序消隐

![木偶脸部路径实际使用的表情图集](/images/rendering-analysis/genshin/expression-atlas.png)

图集中可见分散的眼部、嘴部与脸部图案。空白区域与小图块由 UV 选择，不能把整张纹理直接覆盖到脸上。

#### 图集选择前仍有局部变换

程序通过表情索引与列数得到行列，行方向另有反序处理。在进入对应单元前，还可以：

- 以纹理中心为基准平移、缩放或镜像。
- 根据左右区域选择不同局部参数。
- 用正弦和余弦构造二维旋转，角度可带时间变化。
- 限制局部 UV，再映射到图集单元。

可选的第二层表情样本按自身 alpha 与第一层混合，最终再以覆盖率进入脸部颜色。表情颜色如何接受阴影也由方向条件控制。因此恢复骨骼与形态变形之后，仍可能需要材质图集才能得到完整表情。

#### 消隐保留不透明深度行为

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

### 眼睛：解析内部深度、多层颜色与 Matcap

<div class="rendering-figures">
<figure><a href="/scene-capture-comparison/figures/replay/genshin-eye-before.png"><img src="/scene-capture-comparison/figures/replay/genshin-eye-before.png" alt="眼睛材质写入之前" loading="lazy" width="520" height="460"></a><figcaption>眼睛材质写入之前</figcaption></figure>
<figure><a href="/scene-capture-comparison/figures/replay/genshin-eye-after.png"><img src="/scene-capture-comparison/figures/replay/genshin-eye-after.png" alt="写入之后：虹膜与眼内亮部" loading="lazy" width="520" height="460"></a><figcaption>写入之后：虹膜与眼内亮部</figcaption></figure>
<figure><a href="/scene-capture-comparison/figures/replay/genshin-face-final.png"><img src="/scene-capture-comparison/figures/replay/genshin-face-final.png" alt="最终脸部外观" loading="lazy" width="520" height="460"></a><figcaption>最终脸部外观</figcaption></figure>
</div>

前两张取同一材质颜色目标的相邻阶段。此时头发等后续部件尚未全部完成，额头与最终图的差异不属于眼睛程序本身。

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/genshin/pupil-colour.png"><img src="/images/rendering-analysis/genshin/pupil-colour.png" alt="一层瞳孔颜色" loading="lazy" width="512" height="512"></a><figcaption>一层瞳孔颜色</figcaption></figure>
<figure><a href="/images/rendering-analysis/genshin/pupil-matcap.png"><img src="/images/rendering-analysis/genshin/pupil-matcap.png" alt="视图法线查询的 Matcap 外观" loading="lazy" width="512" height="512"></a><figcaption>视图法线查询的 Matcap 外观</figcaption></figure>
<figure><a href="/images/rendering-analysis/genshin/pupil-highlight.png"><img src="/images/rendering-analysis/genshin/pupil-highlight.png" alt="眼内亮点的独立输入" loading="lazy" width="512" height="512"></a><figcaption>眼内亮点的独立输入</figcaption></figure>
</div>

它们是实际被眼睛路径读取的不同纹理。瞳孔图提供内部颜色，Matcap 提供随视图方向变化的外观，亮点又有自己的控制；最终眼睛不是直接显示其中任意一张。

#### 视差来自沿视线的内部落点搜索

眼睛程序以表面法线、相机方向和材质参考轴构造局部坐标系。根据观察角度，搜索步数为：

$$
n=\left\lceil16-12|N\cdot V|\right\rceil
$$

正视时约为 4 步，接近掠射角时最多约为 16 步。斜视路径跨过更大的内部范围，因此分配更多步骤。

搜索在局部 UV 平面沿视线推进。每一步由当前位置到瞳孔中心的半径，计算解析定义的内部深度，找到穿越点后再用前后两步插值细化。当前瞳孔中心为 $(0.5,0.5)$，半径参数为 0.5，视差幅度参数约为 0.3，径向轮廓指数为 2。

主循环不是每一步都采样独立高度纹理，所以不能写成标准高度图视差映射的某个固定采样版本。它使用参数化的内部形状；最终得到的位置再用于瞳孔底色和相关图案。

#### 不同层有各自的运动与混合

多层瞳孔纹理可以分别执行 UV 平移、旋转和振荡。打包渐变图中，不同纵向行保存不同混合曲线，程序固定读取若干行，再沿横向查询对应权重。

部分颜色路径还采用多项式转换：

$$
f(c)=((0.305306c+0.682171)c+0.012523)c
$$

因此不能将所有层的采样值直接按同一个线性加法相加。不同分支包含加法、乘法或叠加式组合，开关决定哪些路径实际参与。

#### Matcap 的方向是怎样得到的

程序把 UV 相对中心的横向位置解释为球面局部坐标，以：

$$
z=\sqrt{\max(0,1-x^2-y^2)}
$$

恢复第三个分量，再与原法线混合。当前相关混合强度约为 0.3。这个方向转入观察空间后映射到纹理坐标，用于查询 Matcap。

这条路径可以产生随观察方向变化的眼球亮部，但它不证明亮点对应场景里某个真实反射物。前后的静态眼睛图展示写入贡献；真实视角变化幅度仍需要多视角画面。

<span id="cloth"></span>

### 裙装：控制分区、细节法线与明暗渐变

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/genshin/cloth-base-colour.png"><img src="/images/rendering-analysis/genshin/cloth-base-colour.png" alt="裙装路径的基础颜色" loading="lazy" width="768" height="768"></a><figcaption>裙装路径的基础颜色</figcaption></figure>
<figure><a href="/images/rendering-analysis/genshin/cloth-control-alpha.png"><img src="/images/rendering-analysis/genshin/cloth-control-alpha.png" alt="材质控制图的 alpha 分区" loading="lazy" width="768" height="768"></a><figcaption>材质控制图的 alpha 分区</figcaption></figure>
<figure><a href="/images/rendering-analysis/genshin/cloth-detail-normal.png"><img src="/images/rendering-analysis/genshin/cloth-detail-normal.png" alt="独立衣料细节输入" loading="lazy" width="512" height="512"></a><figcaption>独立衣料细节输入</figcaption></figure>
</div>

颜色图可识别浅色衣片与装饰。控制图的灰度块用于选择参数组；细节图又独立提供局部方向。三者职责不同，不能用底色图替代其余输入。

![裙装不同材质区域在最终画面中的位置](/scene-capture-comparison/figures/replay/genshin-cloth-final.png)

#### 一个网格可以对应多组材质参数

控制图 alpha 通过 0.2、0.4、0.6、0.8 等阈值分成多个区间，再选择对应参数组。这使同一衣片网格内的区域拥有不同阴影色、高光或细节强度，而不必仅靠最终颜色区分材质。

当前基础法线、细节法线、金属响应和明暗渐变共同参与。控制图分区决定“选哪一组”，法线与光向决定“当前如何受光”，两者不能混为同一个遮罩。

#### 用屏幕导数建立局部方向

裙装程序从位置和 UV 的屏幕导数建立局部切线关系。细节纹理的两个横向分量被映射到正负区间，纵向分量按平方根关系重建，再与基础法线组合。

某些细节路径受材质区域标记限制，所以不能把衣料微法线无条件施加到整个身体。这种处理允许局部织物保持自己的受光细节，同时沿用角色共用的几何与输出目标。

#### 明暗不是直接把点积当亮度

光照点积先经过重映射：

$$
u_L=0.4975(N\cdot L)+0.5
$$

再与控制图和顶点数据结合，决定明暗分区与渐变查询。阴影渐变本身是实际的颜色资源：

![裙装路径使用的阴影渐变纹理](/images/rendering-analysis/genshin/cloth-shadow-ramp.png)

不同横向位置对应不同受光程度，纵向行可容纳多组规则。图中的窄色带只是输入，实际哪一行被哪种区域使用，要结合程序条件理解；并不是给最终截图沿水平方向盖一道渐变。

<span id="character-environment"></span>

### 角色环境：颜色与阴影分别取样、分别更新

角色不是直接从最终截图取一个平均色。当前路径从材质颜色和阴影数据取样，按有效性筛选，再把结果保存在小型浮点纹理中。

#### 70 列里存的是不同任务

中间结果为 70×5：前 10 列保存环境颜色样本，后 60 列保存阴影样本，每列各有五个空间取样位置。汇总结果为 70×1，保持相同分区。

| 区域 | 样本怎样取得 | 怎样判断有效 |
|---|---|---|
| 环境颜色 | 把世界位置投影到主视图，读取材质色和类别 | 排除特定材质类别及无效位置 |
| 阴影 | 选择阴影覆盖层，投影到光源视角做深度比较 | 使用采样点自身的控制量 |

70 列不等于 70 个角色。它是两种任务的布局，实际如何为不同角色分配槽位还需要完整的实例关系。

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/genshin/environment-samples.png"><img src="/images/rendering-analysis/genshin/environment-samples.png" alt="五个样本逐列排列的中间结果" loading="lazy" width="980" height="70"></a><figcaption>五个样本逐列排列的中间结果</figcaption></figure>
<figure class="rendering-strip"><a href="/images/rendering-analysis/genshin/environment-feedback.png"><img src="/images/rendering-analysis/genshin/environment-feedback.png" alt="压缩为一行的环境反馈" loading="lazy" width="980" height="14"></a><figcaption>70×1 的环境反馈；仅为看清各列而纵向放大，颜色未逐列归一化。</figcaption></figure>
</div>

这是两份小纹理的实际显示，颜色区和阴影区共用排列。阴影区域主要保存标量，因此直接显示为 RGB 时会呈红色或暗色；它不是周围环境的全景照片。

#### 颜色更新是有条件的指数平滑

有效颜色样本取均值 $C_s$，已有结果为 $C_o$，本次更新为：

$$
C_{\text{new}}=0.9C_o+0.1C_s
$$

若没有有效样本，就保留旧结果。对固定的新输入，旧差异每次保留 90%，即经过 $n$ 次更新后残留 $0.9^n$。约 7 次更新消除一半旧差异，约 22 次消除九成；这是从实际系数推导的响应，不是额外测量的秒数。

类别筛选防止特定表面主导环境取样。例如已确认排除了与某些角色路径相关的类别，而不是按“像素看起来像皮肤”进行颜色识别。

#### 阴影反馈是另一种状态积分

阴影区先对有效比较结果取均值，结合控制量得到相对中间值的偏差。旧状态的一部分也以 0.5 为中心解码，响应增益随旧偏差改变：

$$
g=(1.001-|s_o|)^{10}+0.01
$$
$$
s_{\text{new}}=s_o+\Delta_{\text{shadow}}g
$$

之后，用新偏差推进主阴影状态，并将偏差重新映射回保存范围。特殊控制条件还可以直接覆盖状态。

因此，阴影反馈不能套用颜色的固定 0.1 插值。它保留了自身的响应状态，共用一张小纹理不意味着共用一套更新公式。

#### 阴影状态的两个分量构成带记忆的更新

<figure class="rendering-diagram"><a href="/images/rendering-analysis/genshin/environment-feedback-flow.svg" target="_blank" rel="noopener"><img src="/images/rendering-analysis/genshin/environment-feedback-flow.svg" alt="角色环境反馈示意：颜色和阴影在小纹理中分区，先消费旧结果，再采样更新" loading="lazy" width="1000" height="1090"></a><figcaption>算法示意 · 点击查看大图</figcaption></figure>

*资源布局和依赖关系示意。每列对应一个任务槽，并未把槽数解释为角色数量；跨次使用的连接用虚线表示。*

设五个候选中有效性大于 0.001 的阴影样本均值为 $\bar{o}$，最后一个有效样本的控制量为 $c$。输入样本保存的是 $1-\text{阴影通过率}$，因此先前的比较通过率和这里的遮挡量方向相反。驱动量为：

$$
\delta=c(\bar{o}-0.5)
$$

已有状态的两分量记为 $(a,b)$，把第二分量还原为以零为中心的状态 $v=b-0.5$：

$$
g(v)=(1.001-|v|)^{10}+0.01,\qquad
v'=v+\delta g(v)
$$
$$
a'=\operatorname{saturate}(a+v'),\qquad
b'=\operatorname{saturate}(v'+0.5)
$$

第一分量保存主要结果，第二分量保存会继续推动结果变化的偏差。假设 $a=0.5,b=0.5,\delta=0.1$，则 $v=0$、增益约为 1.020，得到 $v'\approx0.102$，两分量都约为 0.602。这是公式算例，用来说明驱动先改变偏差，再由偏差推进主结果。

下一次若驱动量回到零，旧偏差仍可能存在，主结果会继续变化。这与颜色路径“输入不变则逐渐靠近该颜色”的一阶插值不同。没有有效阴影样本时驱动量被置零，也不能据此断言两个旧状态都原样保留：旧偏差依然参与正常状态推进。

边界限制同样影响后续响应。第二分量保存时夹到零到一，下一次恢复的 $v$ 因而在 $[-0.5,0.5]$ 内；第一分量也独立夹取。控制量大于 999 时另走强制覆盖分支，两分量直接写驱动量的饱和值，绕过上述常规更新。这个大值在此处扮演模式控制，不能解释成一个普通的阴影强度。

#### 世界采样点怎样接到可见材质

环境颜色侧先把世界采样点乘以当前视图投影，再用齐次除法和屏幕映射得到材质图坐标。取得的值来自场景材质颜色与类别，尚未包含最后的色调映射、泛光与界面。它提供的是参与角色配色的环境输入，并非周围真实入射辐亮度的完整积分。

有效样本的 alpha 在这里用于判定是否纳入统计；通过筛选后按样本个数求均值。它不是把所有样本按 alpha 做普通透明混合。颜色区与阴影区又有不同的投影来源：前者去主相机材质图，后者去选定的阴影覆盖层。即使两个区域最终挤在同一张 70×5 纹理里，坐标和数值的含义都不能互换。

#### 谁读取旧结果，谁生成新结果

身体、脸、裙子与眼睛的相关顶点路径先读取已有环境结果；场景里的取样汇总随后执行。当前袜子代表顶点路径未读取该反馈，也不应该强行应用相同环境项。

这样的先后顺序，使环境成为跨次使用的输入。一次捕获可以确认读写关系与公式，但不能单独证明更新频率或所有角色的槽位交换方式。

<span id="motion"></span>

### 法线结束使用后，运动覆盖同一张图

照明阶段结束后，相机与几何运动重新写入此前保存法线的纹理。运动表示同一表面在当前与旧画面之间的屏幕位移。

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/genshin/motion-r.png"><img src="/images/rendering-analysis/genshin/motion-r.png" alt="水平运动编码，按 0 到 1 的固定范围显示。" loading="lazy" width="1200" height="502"></a><figcaption>水平运动编码，按 0 到 1 的固定范围显示。</figcaption></figure>
<figure><a href="/images/rendering-analysis/genshin/motion-g.png"><img src="/images/rendering-analysis/genshin/motion-g.png" alt="竖直运动编码，采用相同范围。" loading="lazy" width="1200" height="502"></a><figcaption>竖直运动编码，采用相同范围。</figcaption></figure>
</div>

这两张图分别只显示实际的 R、G 运动通道，没有混入用于其他控制的蓝色。当前画面大部分值接近中性灰，表示编码靠近零位移；为了让静态区域不被误读为强运动，这里没有按各图极值自动拉伸。微小差异仍会在后续解码中参与计算。

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

### 运动模糊、泛光和显示颜色在历史之前完成

当前观察到的运动模糊路径先整理运动相关结果，再输出较低分辨率的颜色与控制。泛光路径从场景亮部开始，经过过滤、下降尺度与组合。最终颜色阶段再将相应结果汇入显示颜色。

<div class="rendering-figures rendering-stages">
<figure><a href="/images/rendering-analysis/genshin/stage-motion-blur.png"><img src="/images/rendering-analysis/genshin/stage-motion-blur.png" alt="运动模糊阶段输出的颜色预览" loading="lazy" width="1200" height="502"></a><figcaption>运动模糊阶段的颜色输出，仍位于显示转换之前。</figcaption></figure>
<figure><a href="/images/rendering-analysis/genshin/stage-tonemap.png"><img src="/images/rendering-analysis/genshin/stage-tonemap.png" alt="显示转换之后的颜色" loading="lazy" width="1200" height="502"></a><figcaption>后续亮部组合与显示转换后的颜色。</figcaption></figure>
</div>

两张图用于定位颜色处理的先后。右图还包含中间的亮部与颜色变换，不能将整体明暗差仅归因于运动模糊；模糊是否明显还取决于本帧实际位移。它们之后的边缘与历史处理接收的是已经完成显示转换的颜色。

这些步骤的输出顺序可以确认，但本篇没有将所有运动模糊与泛光变体展开为完整公式。这些阶段的具体参数需要分别从当前执行路径确认。

这里必须保留的事实是：**当前帧的颜色处理先结束，后面才做边缘与历史重建。** 这决定了历史保存的数值范围，也决定邻域约束应该比较什么颜色。

<span id="spatial-aa"></span>

### 当前帧抗锯齿：找边缘、求权重、混合邻居

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

### 时序重建：前景运动、重建核与历史状态

<div class="rendering-figures">
<figure><a href="/scene-capture-comparison/figures/replay/genshin-temporal-before.png"><img src="/scene-capture-comparison/figures/replay/genshin-temporal-before.png" alt="历史融合输入：细碎亮点与栏杆边缘" loading="lazy" width="480" height="509"></a><figcaption>历史融合输入：细碎亮点与栏杆边缘</figcaption></figure>
<figure><a href="/scene-capture-comparison/figures/replay/genshin-temporal-after.png"><img src="/scene-capture-comparison/figures/replay/genshin-temporal-after.png" alt="历史融合输出：相同区域的变化" loading="lazy" width="480" height="509"></a><figcaption>历史融合输出：相同区域的变化</figcaption></figure>
</div>

两张采用相同位置和显示设置。输出中部分亮点与轮廓更平滑，同时也能观察到细节变软；它展示本次空间变化，不等同于连续运动质量测试。

#### 沿前景表面重投影

程序比较中心及四个偏移为 $(\pm2,\pm2)$ 像素的位置，剔除越界点，并按当前反向深度约定选较靠前的表面，再读取其运动与附加标记。高位材质类别另外从当前像素位置读取。

细轮廓附近同时存在前景和背景。采用前景运动，可以减少把背景位移用于前景边界的情况。随后按平方关系解码位移，找到旧坐标，并单独取得历史状态与颜色控制。

#### 当前颜色由十六个样本重建

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

#### 历史颜色使用另一套重建

旧坐标通常落在像素之间。程序由小数位置构造三次权重，将采样位置合并，以五次颜色读取重建历史 RGB，并做归一化。越界时，旧颜色与状态都不再作为正常历史使用。

新旧颜色的采样核不同：当前侧利用更完整邻域重建，历史侧按重投影位置过滤。只保留一个简单的“当前与旧颜色插值”无法解释前面的取样过程。

#### 五次历史采样怎样近似一个二维重建核

<figure class="rendering-diagram"><a href="/images/rendering-analysis/genshin/temporal-sampling.svg" target="_blank" rel="noopener"><img src="/images/rendering-analysis/genshin/temporal-sampling.svg" alt="原神时序采样示意：当前侧十六点，历史侧五次过滤采样，状态输出另行保存" loading="lazy" width="1000" height="1120"></a><figcaption>算法示意 · 点击查看大图</figcaption></figure>

*采样足迹与数据流示意。网格点是逻辑采样位置，历史侧的中心坐标会随小数位置移动，不是固定的整数十字。*

把旧坐标换算到像素中心坐标后，取整数基点 $i$ 与小数部分 $f$。每个坐标轴分别构造两个中间权重：

$$
w_1(f)=1-2.5f^2+1.5f^3,\qquad
w_2(f)=0.5f+2f^2-1.5f^3
$$
$$
p_m=i+0.5+\frac{w_2}{w_1+w_2}
$$

$p_m$ 是合并中央两项后的过滤采样位置。另外两个位置位于 $p_l=i-0.5$ 和 $p_r=i+2.5$。沿横纵两轴分别计算，就能取得中心、左、右、上、下五个过滤样本 $H_0,H_l,H_r,H_u,H_d$。

外侧修正系数为：

$$
s_x=0.45(f_x^2-f_x),\qquad
s_y=0.45(f_y^2-f_y)
$$
$$
H_x=(1-f_x)H_l+f_xH_r,\qquad
H_y=(1-f_y)H_u+f_yH_d
$$
$$
H_{\text{rgb}}=\frac{H_0+s_xH_x+s_yH_y}{1+s_x+s_y}
$$

当小数位置在零到一之间，$s_x,s_y$ 为非正值，说明外侧项是负瓣修正，不是五个样本简单平均。在 $f_x=f_y=0.5$ 的算例中，两项均为 $-0.1125$，分母为 0.775；当两项均为零时，重建退化为中心项。归一化让输入若处处是同一颜色，输出仍保持该颜色。

这个五次方案不包含四个角上的独立读取。它保留当前程序选择的十字修正结构，不应称为完整 4×4 三次重建的逐项等价展开；当前颜色侧的十六次读取也没有被这五次替代。

此外，RGB 重建完成后，程序仍在原始旧坐标单独采样历史状态，以及颜色图中的 alpha 控制量。高阶颜色重建与离散／状态信息有不同读取方式，不能把 RGB 的负瓣滤波直接施加给全部控制字段。

#### 十六点当前核的负瓣在哪里

前面的核可用 $u=d^2$ 表示：

$$
w(u)=\bigl[1.5625(0.4u-1)^2-0.5625\bigr](0.25u-1)^2
$$

在本次限制范围 $0\leq u\leq4$ 内，它在 $u=1$ 和 $u=4$ 处为零，在 $1<u<4$ 之间为负。比如 $u=0$ 时权重为 1，$u=2$ 时约为 $-0.125$。近处正贡献和稍远处负贡献共同形成较锐的重建响应。

这也给出两种必须分开的限制：一是当前重建色夹到十六点的逐通道范围，抑制重建本身的过冲；二是后续按类别和历史状态限制旧颜色，处理旧内容与当前内容不一致。把两个限幅合并，会改变它们所约束的对象。

#### 类别决定何时限制历史

雪等材质保存的高位状态在这里被提取，参与分支选择。一类路径采用逐通道最大值保留规则；其他路径在状态到期后，用当前对角邻居构造颜色区间，将历史限制进去。区间还随运动与亮度差变化。

类别、历史保留状态和颜色约束共同工作。这也说明材质输出里的附加位不是只服务当下照明，它们会持续影响最终细节。

#### 混合比例来自权重和与累积状态

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

#### 两张历史结果分别保存什么

| 保存位置 | 含义 | 对下一次的作用 |
|---|---|---|
| 状态的第一分量 | 颜色约束的延迟／保留状态 | 决定何时使用更强的颜色限制 |
| 状态的第二分量 | 归一化历史积累量 | 参与后续混合权重 |
| 颜色的 RGB | 重建与融合结果 | 作为下次旧颜色 |
| 颜色的 alpha | 当前运动图附加标记的副本 | 比较前后控制状态 |

普通路径的保留状态当前每次递减约 $1/9$，特定高位类别会将其重新设为 1。颜色 alpha 是控制标记的继承，不是程序重新估计的连续置信度。

本次采样偏置换算到像素约为 $(0.375,0.222222)$。一帧只能给出这个取值，无法单独恢复完整抖动序列。

#### 从雪材质到历史输出的一条完整数据路径

取一个覆雪栏杆像素，其数据会依次经过以下环节：

1. 材质阶段组合原表面与雪层，写当前颜色、法线、普通类别和高位历史控制。
2. 照明使用法线和阴影计算受光；这些方向消费者结束后，同一份方向存储才允许被运动覆盖。
3. 显示处理与当前帧边缘混合生成时序输入颜色。此时 RGB 已处在当前的颜色映射之后。
4. 时序阶段在深度邻域里选前景运动，用它寻找旧坐标；高位类别则从当前输出像素自己的类别位置读取。
5. 旧坐标有效时，分别取得五点重建的历史 RGB、历史状态和单独的 alpha 控制；越界则把历史路径输入清空。
6. 当前十六点重建、类别约束和累积状态共同决定混合，最后分别写新状态和带当前控制标记的颜色。

第四步有一个容易漏掉的细节：**运动的空间来源和类别的空间来源并不总是同一个像素**。轮廓处运动可能来自偏移位置的前景，而高位类别仍属于当前像素。现有指令明确分别寻址，不能为了代码简洁把它们都改成邻域获胜点的数据。

这种组织把“用哪个表面的位移找历史”和“当前像素允许怎样保留历史”分开。它解释了为什么只传一张历史 RGB 或只有一个固定混合比例，都无法表达这帧完整的时序状态。

<span id="conclusion"></span>

### 这份雪城实现的关键连接

积雪从两套材质和顶点控制形成表面，静态阴影经解压进入统一深度查询，木偶通过专用脸部、眼睛和衣料规则产生角色颜色，再选择性读取场景环境反馈。照明结束后，法线存储转为运动，颜色映射后的画面最后进入边缘与历史重建。

这条链里三个地方会跨越局部算法：雪的分类影响时序；场景取样更新角色以后的环境输入；角色旧位置影响整帧重投影。把每个效果单独描述而不说明这些联系，会遗漏它们能够共同工作的条件。

仍需进一步确认的是空间间接光与反射的完整追踪、所有头发与特殊材质变体、环境槽位分配和跨帧更新频率。尚未展开的分支不作为已确认机制列入结论。

</div>
