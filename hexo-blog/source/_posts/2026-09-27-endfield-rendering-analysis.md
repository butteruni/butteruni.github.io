---
title: "终末地渲染实现分析：竹林光照、角色着色与 HDR 后处理"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-29T17:34:37+08:00"
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

以竹林场景这份截帧为例，先说明人物、石质表面、共享地表资源与竹叶冠层的组织，再沿整帧流程展开方向环境光、AO、反射、雾、角色着色和 HDR 后处理。真实资源与阶段对照帮助定位效果，另以算法图解释复杂的数据流。

<!-- more -->

<link rel="stylesheet" href="/css/rendering-articles.css">

<div class="rendering-article">

<span id="frame"></span>

## 美术资源与渲染概况

![竹林最终画面：岩壁、石阶、人物与左侧金色效果](/scene-capture-comparison/endfield/e6531_rt0.png)

### 美术资源概况

- **人物先建立表面，再补专用照明。** 脸与身体有各自图集，同一几何会在主材质和后续着色中承担不同工作。
- **地表同时使用局部材质与大范围共享数据。** 2K 石质图集、8K 拼块资源、地表参数、纹理数组和深度在不同路径中组合。
- **竹林同时使用细叶片与低面数冠层。** 已定位的调用从每实例 12 个三角形到 6444 个三角形不等，实例数量也明显不同。

### 渲染分析概况

| 环节 | 本帧的组织方式 |
|---|---|
| 可见性与材质 | 深度先建立，多路目标保存颜色、法线、参数、运动和类别 |
| 空间照明 | 近、中、远三层环境体积恢复位置相关、随方向变化的低阶光照 |
| 屏幕环境 | AO 做方向搜索、独立历史和保边过滤；反射从旧 HDR 取得颜色 |
| 空气与人物 | 雾先累积散射与透射，场景和后续人物着色都读取结果 |
| 整帧处理 | 深度、运动和类别验证历史，再融合 HDR、生成多尺度泛光并输出 |

### 样本条件

主视图与输出为 3440×1440，接口为 Vulkan。当前分析只对应这份竹林场景及其中人物；没有将另一角色展示场景的材质或后处理机制移入本文。

正文先用模型范围、纹理和实例统计解释资源，再沿整帧流程分析光照。阶段 HDR 对照使用相同显示范围，最终截图另作外观参照；所有辅助线框和算法示意均在图注中说明。

<span id="resources"></span>

## 美术资源详细统计

### 渲染提交统计

下表按执行顺序合并连续阶段区间。每行包括区间内的相邻准备或合成工作，不将整段计数当作某一个效果的独占开销。绘制包含主视图、阴影、全屏处理及界面；计算分派单列。

| 连续阶段区间 | 绘制次数 | 计算分派 | 提交三角形数 |
|---|---:|---:|---:|
| 初始准备、阴影与雾更新 | 393 | 10 | 1,898,139 |
| 早期深度 | 153 | 0 | 404,625 |
| 主视图材质 | 455 | 0 | 1,375,297 |
| 贴花、辅助数据、AO 与反射准备 | 59 | 35 | 72,081 |
| 场景照明 | 6 | 0 | 6 |
| 后续角色、辅助几何与透明效果 | 207 | 0 | 436,623 |
| 整帧历史处理 | 8 | 0 | 724 |
| 泛光、后续合成与界面 | 45 | 20 | 637 |
| **全帧合计** | **1,326** | **65** | **4,188,132** |

三角形按实际拓扑与实例数计入：三角形列表的一次提交量为“索引数 ÷ 3 × 实例数”。同一几何进入不同视图或阶段会重复计数；点形式的几何准备计入绘制次数，但不计作三角形。这里没有 GPU 时间数据，不能用调用或面数直接评价耗时。

下面改按资源对象拆开说明。每个部件的数字只对应已定位的代表提交，避免把整帧重复工作误当作唯一模型规模。

### 人物资源

#### 模型与着色分阶段处理

主材质阶段可以分别定位脸部、身体和另一名角色的几何。场景照明之后，人物还通过后续几何路径补入专用颜色；这时的再次提交承担着色任务，不代表多出了一套独立模型。

| 代表几何 | 索引数 | 三角形数 | 本次实例数 |
|---|---:|---:|---:|
| 中央角色脸部 | 10590 | 3530 | 1 |
| 中央角色身体的一组部件 | 59679 | 19893 | 1 |
| 左侧角色的一组身体部件 | 43773 | 14591 | 1 |
| 后续脸部着色的对应几何 | 10590 | 3530 | 1 |

最后一行在整帧中再次发生，不能与第一行相加当作面部模型面数。上表也没有覆盖每个人物的全部头发、配饰与透明部件。

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/endfield/face-geometry.png"><img src="/images/rendering-analysis/endfield/face-geometry.png" alt="主材质阶段的脸部范围；此时还未画入身体和场景。" loading="lazy" width="800" height="902"></a><figcaption>主材质阶段的脸部范围；此时还未画入身体和场景。</figcaption></figure>
<figure><a href="/images/rendering-analysis/endfield/body-geometry.png"><img src="/images/rendering-analysis/endfield/body-geometry.png" alt="中央角色的一组身体部件；黄色仅定位这一提交。" loading="lazy" width="800" height="902"></a><figcaption>中央角色的一组身体部件；黄色仅定位这一提交。</figcaption></figure>
</div>

黄色线框是工具提供的几何辅助显示，黑色区域表示当前目标尚未建立完整场景颜色。脸和身体的贴图与下列各行一一对应。

#### 脸部、身体与其他角色的图集

| 输入 | 本次规格与职责 | 贴图预览 |
|---|---|---|
| 中央角色脸部颜色 | 1024×1024，BC7 sRGB；面部图案和肤色区域 | <a href="/images/rendering-analysis/endfield/character-face-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/character-face-colour.png" alt="本行资源的实际贴图预览" loading="lazy" width="768" height="768"></a> |
| 中央角色身体颜色 | 2048×2048，BC7 sRGB；衣物和装备的展开区域 | <a href="/images/rendering-analysis/endfield/character-body-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/character-body-colour.png" alt="本行资源的实际贴图预览" loading="lazy" width="768" height="768"></a> |
| 同组身体法线 | 2048×2048，BC5；两通道方向数据 | <a href="/images/rendering-analysis/endfield/character-body-normal.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/character-body-normal.png" alt="本行资源的实际贴图预览" loading="lazy" width="768" height="768"></a> |
| 左侧角色的身体颜色 | 2048×2048，BC7 sRGB；来自另一条已定位绘制 | <a href="/images/rendering-analysis/endfield/character-secondary-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/character-secondary-colour.png" alt="本行资源的实际贴图预览" loading="lazy" width="768" height="768"></a> |

BC5 法线预览只展示实际存储的两个通道，外观偏黄绿；它不是缺少蓝色的底图。方向恢复需要结合对应程序，而不是把预览 RGB 直接用作世界法线。

后续脸部路径还读取区域颜色、控制和窄条渐变。有一张颜色输入大面积近乎常量，适合提供统一颜色参数，不能用它说明完整人物资源的绘制细节。本节展示可辨认的真实脸部和身体图集；后面的材质公式只针对已经确认的代表脸部着色路径。

#### 输入流同时包含浮点和压缩属性

中央身体绘制的输入包括 12 字节浮点位置、双通道 32 位浮点坐标、4 字节带符号归一化向量，以及四通道 16 位归一化和四通道 8 位整数属性；还存在独立的归一化颜色类输入。

这些布局显示，位置、坐标与其他方向／变形属性以不同精度组织，并非每个属性都占一个完整浮点向量。捕获没有保留全部业务语义，部分压缩数据还需在顶点程序中重建，因此这里不把所有匿名输入硬套为“普通法线、四骨骼权重”等固定结构。

人物可见几何建立后，晚些时候的着色可以用相等深度测试找到同一表面，再把空间环境光、阴影和雾的结果接入。资源拆分、可见性与后续着色是连续关系，不能只看最后一次绘制的纹理列表就推断整个人物的生产流程。

### 地表与石质场景资源

#### 石质表面图集

一条场景提交包含 11000 个三角形、1 个实例，读取 2048×2048 的颜色图和两张同尺寸数值纹理。底色中可辨认石砖、灰色表面和小块装饰区，说明这些面片共享图集布局。

| 输入 | 本次格式 | 预览与解释 |
|---|---|---|
| 石质场景颜色 | 2048×2048，BC7 sRGB | <a href="/images/rendering-analysis/endfield/scene-surface-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/scene-surface-colour.png" alt="本行资源的实际贴图预览" loading="lazy" width="768" height="768"></a> |
| 同组数值输入 | 两张 2048×2048，BC7 | 与颜色图同时被该材质读取；尚未将所有通道命名为统一的粗糙度、金属度或遮蔽 |

这类图集通过不同 UV 区域复用石质和饰面外观。最终石阶缝隙的暗部还叠加了环境遮蔽、直接光与空气效果，不能把底色里较暗的图案全部称为动态 AO。

#### 共享地表输入并不局限于一整块地形

另一条实例几何提交每实例只有 449 个三角形，但共有 129 个实例，合计提交 57921 个三角形。它同时读取大尺寸拼块图集、地表数据、纹理数组和屏幕深度。

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/endfield/terrain-geometry.png"><img src="/images/rendering-analysis/endfield/terrain-geometry.png" alt="这一实例提交在画面中的部分范围，位于人物左侧的横向表面。" loading="lazy" width="1280" height="536"></a><figcaption>这一实例提交在画面中的部分范围，位于人物左侧的横向表面。</figcaption></figure>
<figure><a href="/images/rendering-analysis/endfield/terrain-colour-atlas.png"><img src="/images/rendering-analysis/endfield/terrain-colour-atlas.png" alt="8192×8192 的颜色输入；图中下方黑色是资源内容，预览保留完整范围。" loading="lazy" width="768" height="768"></a><figcaption>8192×8192 的颜色输入；图中下方黑色是资源内容，预览保留完整范围。</figcaption></figure>
</div>

| 实际读取的数据 | 本次规格 | 已确认的信息 |
|---|---|---|
| 大尺寸颜色图集 | 8192×8192，BC3 sRGB | 多个颜色区块拼接，存在未使用或黑色区域 |
| 两张方向类图集 | 8192×8192，BC5 | 与颜色图同时参与表面求值 |
| 数值控制图集 | 8192×8192，BC3 | 提供区域数值输入 |
| 大范围地表颜色与参数 | 4224×2112，BC3 sRGB／RGBA8 等 | 与局部图集一起读取 |
| 纹理数组 | 单层 1024×1024 | 以数组方式组织的材质输入 |
| 当前屏幕深度 | 3440×1440，单通道浮点 | 材质计算的屏幕空间条件 |

颜色图被打包成区块，与大范围地表输入共同使用，可以确认这条几何复用了地表系统的数据。仅凭 8K 图集和空白区，还不能完整还原虚拟纹理页表、驻留替换或流送策略；也不能把这 129 个实例直接当成 129 个独立地形瓦片。

图集的实际尺寸与截图中物体大小不是一回事。一个画面中很小的实例也可能读取大范围共享资源；材质成本还取决于采样、覆盖和层次选择，不能只用“8K”推断本次渲染开销。

### 竹林与树冠资源

#### 高细节叶片与低面数树冠同时存在

| 已定位的一组植被 | 每实例三角形 | 实例数 | 本次提交三角形 |
|---|---:|---:|---:|
| 低面数树冠面片组 A | 18 | 256 | 4608 |
| 较细的竹叶几何 | 6444 | 13 | 83772 |
| 低面数树冠面片组 B | 12 | 658 | 7896 |

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/endfield/foliage-canopy-geometry.png"><img src="/images/rendering-analysis/endfield/foliage-canopy-geometry.png" alt="树冠面片组 A 的范围，集中在画面上方。" loading="lazy" width="1280" height="536"></a><figcaption>树冠面片组 A 的范围，集中在画面上方。</figcaption></figure>
<figure><a href="/images/rendering-analysis/endfield/foliage-leaf-geometry.png"><img src="/images/rendering-analysis/endfield/foliage-leaf-geometry.png" alt="较细竹叶几何的范围；线框明显更密。" loading="lazy" width="1280" height="536"></a><figcaption>较细竹叶几何的范围；线框明显更密。</figcaption></figure>
<figure><a href="/images/rendering-analysis/endfield/foliage-distant-geometry.png"><img src="/images/rendering-analysis/endfield/foliage-distant-geometry.png" alt="另一组树冠面片，在画面中形成横向冠层。" loading="lazy" width="1280" height="536"></a><figcaption>另一组树冠面片，在画面中形成横向冠层。</figcaption></figure>
</div>

三张线框来自各自的实际提交，底图随主材质绘制逐步补齐。低面数树冠用很少的三角形承载一簇叶冠图案，另一组竹叶则使用更多几何描述细节。本帧能确认两种资源形式同时参与画面；它们是否属于同一植被资产的不同 LOD，以及切换阈值是多少，需要其他距离或连续帧验证。

#### 贴图中的轮廓层次与几何规模相互对应

| 植被资源 | 颜色与控制尺寸 | 颜色预览 |
|---|---|---|
| 树冠组 A | 两张 512×512，颜色为 BC7 sRGB，控制为 BC7 | <a href="/images/rendering-analysis/endfield/foliage-a-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/foliage-a-colour.png" alt="本行资源的实际贴图预览" loading="lazy" width="512" height="512"></a> |
| 竹叶几何 | 两张 1024×1024，颜色为 BC7 sRGB，控制为 BC7 | <a href="/images/rendering-analysis/endfield/foliage-b-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/foliage-b-colour.png" alt="本行资源的实际贴图预览" loading="lazy" width="768" height="768"></a> |
| 树冠组 B | 两张 512×512，颜色为 BC7 sRGB，控制为 BC7 | <a href="/images/rendering-analysis/endfield/foliage-c-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/foliage-c-colour.png" alt="本行资源的实际贴图预览" loading="lazy" width="512" height="512"></a> |

树冠图直接包含较完整的枝叶簇轮廓，叶片图则把细小叶片组织到一张图集。二者承担的表示尺度不同：细模型依靠较多几何表达轮廓与摆放，低面数模型把更多轮廓细节交给图案和材质。

两组主要叶片调用采用相等深度测试并关闭深度写入，复用之前建立的可见性；另一树冠变体仍写深度。由此可见，植被也不能作为一个固定状态的统一 Pass：可见性准备、叶片材质和远处冠层分别有自己的处理规则。

一条 658 实例的调用只提交 7896 个三角形，而 13 实例的细竹叶就提交了 83772 个三角形。这个例子说明，“实例多”与“几何多”不是同一个指标。像素覆盖和被丢弃的叶片背景又属于另一类成本，单纯用三角形数量无法排序所有植被开销。

### 环境与中间资源

竹林照明同时使用屏幕数据和空间数据。下表先说明资源规模，后文再沿生产与消费关系解释算法。

| 数据 | 本次布局 | 保存内容 |
|---|---|---|
| 材质颜色 | 3440×1440，RGBA8 sRGB | 供照明读取的表面色 |
| 法线、材质控制、运动 | 分别为全分辨率 RGB10A2 | 不同数值与类别；格式相同不表示用途相同 |
| HDR 颜色 | 全分辨率，R11G11B10F | 场景与人物逐步加入的照明颜色 |
| 阴影代表输入 | 6144×4096，16 位深度 | 光源方向的遮挡 |
| AO 主要工作尺寸 | 1720×720 | 局部环境遮蔽和过滤数据 |
| 累积雾 | 313×180×128，RGBA16F | 视线散射颜色与透射率 |
| 环境光幅度 | 三组 128×64×128 浮点体积 | 不同空间层级的幅度数据 |
| 环境方向系数 | 三组 128×192×128 归一化体积 | 每层将 RGB 三组方向系数分段保存 |

环境幅度与方向系数按近、中、远层组织。这里“三组”对应三个空间层级，不是简单的红、绿、蓝三张独立体积；每次查询会一起恢复颜色及其随表面朝向变化的响应。

当前画面还有明显的竹林远景与天空亮部，但单凭它们的外观不足以确认一套独立云或水算法。后文集中解释已沿实际资源确定的阴影、环境光、遮蔽、反射与雾。


## 渲染分析

<span id="pipeline"></span>

### 整帧流程

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

#### 沿同一视角观察颜色的建立

<div class="rendering-figures rendering-stages">
<figure><a href="/images/rendering-analysis/endfield/stage-material.png"><img src="/images/rendering-analysis/endfield/stage-material.png" alt="主材质颜色：可以辨认人物、石阶与植被的表面色。" loading="lazy" width="1200" height="502"></a><figcaption>主材质颜色：可以辨认人物、石阶与植被的表面色。</figcaption></figure>
<figure><a href="/images/rendering-analysis/endfield/stage-lighting.png"><img src="/images/rendering-analysis/endfield/stage-lighting.png" alt="场景照明之后：部分人物区域仍未完成专用颜色。" loading="lazy" width="1200" height="502"></a><figcaption>场景照明之后：部分人物区域仍未完成专用颜色。</figcaption></figure>
<figure><a href="/images/rendering-analysis/endfield/stage-character.png"><img src="/images/rendering-analysis/endfield/stage-character.png" alt="后续人物几何着色之后；人物接入既有环境输入。" loading="lazy" width="1200" height="502"></a><figcaption>后续人物几何着色之后；人物接入既有环境输入。</figcaption></figure>
<figure><a href="/scene-capture-comparison/endfield/e6531_rt0.png"><img src="/scene-capture-comparison/endfield/e6531_rt0.png" alt="最终输出：透明、历史、泛光与显示处理均已完成。" loading="lazy" width="3440" height="1440"></a><figcaption>最终输出：透明、历史、泛光与显示处理均已完成。</figcaption></figure>
</div>

场景照明和人物着色两张图都以 0 到 0.2 的 HDR 范围并作显示伽马转换。材质色与最终图各有自己的颜色含义，不用它们的直接亮度差反推单项光照强度。

<span id="gbuffer"></span>

### G-buffer：材质先存在，照明颜色随后建立

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/endfield/surface-colour.png"><img src="/images/rendering-analysis/endfield/surface-colour.png" alt="主材质后的表面颜色" loading="lazy" width="1000" height="419"></a><figcaption>主材质后的表面颜色</figcaption></figure>
<figure><a href="/images/rendering-analysis/endfield/surface-normal.png"><img src="/images/rendering-analysis/endfield/surface-normal.png" alt="相同表面的法线编码" loading="lazy" width="1000" height="419"></a><figcaption>相同表面的法线编码</figcaption></figure>
<figure><a href="/images/rendering-analysis/endfield/unlit-hdr.png"><img src="/images/rendering-analysis/endfield/unlit-hdr.png" alt="尚未完成照明的 HDR 目标" loading="lazy" width="1000" height="419"></a><figcaption>尚未完成照明的 HDR 目标</figcaption></figure>
</div>

表面色已经能识别植被、石阶和角色，法线保存方向；此时 HDR 目标大体接近黑色。这组图说明表面信息与受光颜色处在不同数据中。

#### 八面体编码怎样保存方向

三维单位方向只有两个独立自由度，可以用两个分量保存。这里的法线采用八面体编码：先按方向分量的绝对值总和投影，再把下半部分折叠到二维区域。

图中两个通道的颜色不能直接当作世界横纵分量。AO 读取时先恢复三维单位方向，再变换到观察空间，与深度一起计算邻域几何关系。

表面颜色按 sRGB 储存，方向与控制则按数值编码。解释这些输入时，色彩转换、方向解码和分类读取需要分别处理。

#### 分类照明怎样加入已有颜色

全屏照明按模板类别筛选表面，再执行对应分支。已确认的合成为：

$$
C_{\text{new}}=C_{\text{lighting}}+
\alpha_{\text{output}}C_{\text{old}}
$$

这里 alpha 控制已有贡献的保留程度，不应自动解释为常规透明物体的覆盖率。类别、输出数值与混合设置共同决定最终贡献。

一轮全屏照明结束后，某些角色区域仍未完成颜色。后面的几何着色直接读取环境光与雾，把专用材质接入当前 HDR。

<span id="shadows"></span>

### 阴影既服务表面，也服务空气

场景阴影按光源视图组织到图集中。主照明利用它判断物体是否收到光，雾的局部体积更新也读取它，控制空间中的散射光是否被遮挡。

同一遮挡关系因此影响两件事：石面受到多少直接光，以及相机前方空气里能积累多少光。只在最终表面颜色上乘阴影，无法替代雾生成时的阴影查询。

辅助几何也有独立深度，但其生产者和消费者与主阴影不同。不能因为一张图只保存深度，就把它归为光源阴影。

目前确认的是图集查询和多处消费。区块如何长期分配、哪些光源分帧更新，仍需跨帧材料。

<span id="environment-volume"></span>

### 三层环境光：位置查询与一阶方向重建

#### 同样的网格数，覆盖不同的世界范围

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

#### 边界同时检查水平与竖直范围

当前近层的水平、竖直淡出起点约为 29 和 13，过渡宽度为 2；中层为 116、52 和 8；远层为 464、208 和 32。

近层淡出量为 $f_0$，中层淡出量为 $f_1$，相邻层权重可整理为：

$$
w_0=1-f_0,\qquad w_1=f_0(1-f_1)
$$

其余影响继续交给更远层。边界判断使用水平最大距离与竖直距离，不能用简单球形距离完整替代。

#### 幅度与三段系数组成方向光照

每层由两张体积配合：一张保存 HDR 基础幅度，另一张沿高度分成三段，分别保存红、绿、蓝的方向系数，所以后者高度恰好是前者的三倍。

![近层方向系数体积的一张深度切片](/images/rendering-analysis/endfield/environment-directions.png)

这张图是系数编码，三个高度区域对应三种颜色的方向信息，不是三张场景照片。对每种颜色，幅度 $A$ 与系数采样 $c$ 解码为：

$$
B=A(4c-2),\qquad L(N)=\max(A+B\cdot N,0)
$$

$B$ 是带正负号的方向项，$N$ 为着色方向。相同位置的表面可以因朝向不同得到不同照明；只采一个 RGB 后直接乘底色，会丢掉这部分信息。

各段的纵向坐标还限制在半纹素边界内，防止线性过滤跨入另一颜色的系数区。层间混合后继续加入低频环境项，并由按亮度加权的方向信息求一个环境主方向，供材质控制。

本帧读取的是已存在体积，没有观察到完整生产过程。已确认布局、解码、过渡与消费，不能据此判断它们全部离线生成还是持续动态更新。

#### 从一个着色点走完空间光照查询

<figure class="rendering-diagram"><a href="/images/rendering-analysis/endfield/directional-volume.svg" target="_blank" rel="noopener"><img src="/images/rendering-analysis/endfield/directional-volume.svg" alt="方向环境光查询示意：三层覆盖、幅度与三段系数、按表面方向求值" loading="lazy" width="1000" height="1000"></a><figcaption>算法示意 · 点击查看大图</figcaption></figure>

*数据布局示意，外框不按世界尺寸比例绘制。体积切片的实际图像见前图；这里说明它们如何组成一个方向函数。*

设着色点落在近层向中层的过渡区，并得到近层淡出 $f_0=0.25$、中层淡出 $f_1=0$。此时近层贡献为 0.75，中层为 0.25，其他部分再按远层与备用项的规则处理。这个算例显示的是连续交接，不能在碰到近层边界时直接切换纹理，否则同一个表面穿过边界便可能突变。

每层的读取可拆成以下操作：

1. 世界位置转换到该层的参考空间，再按该层网格尺度生成循环坐标。
2. 从 128×64×128 的幅度体积取得三个颜色幅度。
3. 对红、绿、蓝分别去对应的系数段读取三维方向向量。
4. 将系数从归一化存储恢复成带正负号的方向项。
5. 按覆盖权重组合相应系数与低频环境项，再结合材质着色方向求值。

三个系数段共享同一份空间布局。设段内纵坐标为 $u_y$，颜色段序号为 $j=0,1,2$，其布局关系为 $v_y=(u_y+j)/3$。实际先把段内坐标限制在半纹素边界以内，再映射到全纹理。否则在红色段的顶部做线性过滤时，可能混入下一段的绿色方向系数。这里的问题是颜色分量串读，不是普通的空间插值误差。

方向项也可以通过简单算例认识。假设某一颜色的幅度 $A=2$，解码后的 $B=(0.6,0,-0.2)$，则朝 $+x$ 的表面得到 2.6，朝 $-x$ 得到 1.4，朝 $+z$ 得到 1.8。三个面共享同一个空间位置，但环境照明不同。若 $B=0$，它才退化为与方向无关的常量。

系数提供的是低阶方向变化，无法单独表达任意尖锐的镜面反射。角色的高光、主光明暗和环境方向可以共同影响最终材质，不能把这份方向场当成整套反射模型。

<span id="ao"></span>

### 环境遮蔽：方向搜索、历史稳定与保边过滤

<div class="rendering-figures">
<figure><a href="/scene-capture-comparison/figures/replay/endfield-ao-ground.png"><img src="/scene-capture-comparison/figures/replay/endfield-ao-ground.png" alt="石阶接缝附近的遮蔽系数" loading="lazy" width="690" height="289"></a><figcaption>石阶接缝附近的遮蔽系数</figcaption></figure>
<figure><a href="/scene-capture-comparison/figures/replay/endfield-ground-final.png"><img src="/scene-capture-comparison/figures/replay/endfield-ground-final.png" alt="对应区域的最终地面" loading="lazy" width="690" height="289"></a><figcaption>对应区域的最终地面</figcaption></figure>
</div>

深色带帮助定位遮蔽作用区域。最终暗部还包含材质与直接阴影，因此两图不能作亮度差来量化 AO 的独立贡献。

AO 近似描述附近几何对环境方向的遮挡。当前路径从可见深度搜索局部地平线，再稳定和过滤结果。

#### 三个方向、三个距离与正负两侧

每像素构造三个方向，方向间隔约为 $\pi/3$。每方向向正、负两侧各取三个距离，形成 18 个核心深度查询。

距离含有扰动与幂函数分布。采样半径变大时，根据其对数选择较粗深度层级；不是所有查询都读取完整分辨率。

深度恢复为观察空间位置后，程序计算相对投影法线的上下遮挡边界，再组合成当前遮蔽。这些运算支持地平线式屏幕遮蔽的解释，但不能单独确认某个实现库版本。

#### 搜索半径先从空间尺寸转换成像素尺寸

AO 希望搜索一个有空间意义的邻域，但实际查询发生在屏幕深度上。程序先重建当前观察空间位置 $P$，再估计相邻屏幕像素在该深度对应的空间宽度 $\Delta x$。给定空间半径 $R$，像素搜索半径为：

$$
r=\min(R/\Delta x,48)
$$

所以同样的空间半径，在较近表面上可能占更多像素；超过 48 像素后则被限制。这里的上限来自本次程序，不能直接理解为世界中 48 个单位。限制半径后，程序也重新计算实际覆盖的空间距离，后面的距离衰减采用这份有效范围。

三个方向使用每像素扰动 $\xi_1$ 旋转：

$$
\theta_i=(i+\xi_1)\pi/3,\qquad i=0,1,2
$$

每方向三个距离的排列可整理为：

$$
\xi_{ij}=\operatorname{fract}\bigl[\xi_2+0.6180(i+3j)\bigr]
$$
$$
\rho_{ij}=r\left[\left(\frac{j+\xi_{ij}}3\right)^p+\frac{1.3}{r}\right],
\qquad j=0,1,2
$$

$p$ 是当前距离分布参数。偏移在查询前舍入到像素网格，并分别用于正负两侧；由未舍入偏移长度的 $\log_2$ 再减去层级偏置，限制到可用深度 mip 范围。这把较远的查询交给较粗深度，减少对高频细节的过度依赖。

扰动也不是每次临时生成一个完全独立的随机数：程序对屏幕坐标位作排列，再与一个取模 64 的时间参数组合，得到两维小数扰动。这里能确认的是空间与时间都进入采样序列，不把这段生成方式未经验证地命名为某张蓝噪声纹理。

#### 地平线搜索记录的是角度边界

<figure class="rendering-diagram"><a href="/images/rendering-analysis/endfield/ao-horizon-flow.svg" target="_blank" rel="noopener"><img src="/images/rendering-analysis/endfield/ao-horizon-flow.svg" alt="终末地 AO 示意：三条方向线的正负两侧搜索，随后分别进行时序和保边过滤" loading="lazy" width="1000" height="1110"></a><figcaption>算法示意 · 点击查看大图</figcaption></figure>

*采样与处理流程示意，点位仅说明三个方向、三个步长和正负两侧；实际位置包含扰动和距离重分布。*

对当前搜索方向，程序以视线和屏幕方向张成一个切片平面，将表面法线投影到这个平面。投影长度表示原法线与该切片的关系，投影方向则给出切片中的法线角度。

每个深度样本恢复为观察空间点 $Q$，计算从中心指向它的单位向量：

$$
D=\frac{Q-P}{\|Q-P\|},\qquad c=D\cdot V
$$

$V$ 是指向相机的视线方向。程序不是看到一次较近深度就立即把像素记为“被挡住”；它用距离衰减把这个角度候选拉回未遮挡基线，再分别更新正、负两侧最强的地平线候选。远处样本、离开有效空间半径的样本因此不会和近处遮挡拥有相同作用。

距离衰减还会单独缩放相对位移的深度分量，然后才计算长度。这使视线方向上的大深度落差可以被额外削弱，降低屏幕可见薄片被错误解释为厚实遮挡物的影响。该控制项不是再次缩放最终 AO，而是在决定哪些样本足以推进地平线时发挥作用。

#### 从两侧角度积分到最终标量

两侧候选经近似反三角函数变成边界角 $h_+,h_-$。记投影法线的有符号角度为 $\phi$，其归一化投影与视线的点积为 $c_n$，投影长度为 $\ell$，单个方向的主要贡献为：

$$
I=\frac{0.95\ell+0.05}{4}
\left[
2c_n+2(h_+-h_-)\sin\phi
-\cos(2h_-+\phi)-\cos(2h_+-\phi)
\right]
$$

这份语义整理保留两侧积分、法线角和投影长度的关系。原程序用近似反三角计算角度，并没有逐方向调用一套任意精度的解析积分；公式也不代表可以不顾浮点顺序替换原指令。

三个方向的和还包括小搜索半径时的补偿项，取平均后进行幂变换、最小值限制，再乘约 0.6667 并写入归一化目标。因而前面实际遮蔽图用 0～0.67 显示，是为了匹配这份输出的尺度，不能看到“最亮不到一”就认定所有区域都被额外遮挡了三分之一。

#### 同时生成相邻表面的连续程度

邻域深度差形成边界判断，包含：

$$
e=\operatorname{clamp}\left(1.25-\frac{\Delta z}{0.011z},0,1\right)
$$

结果按四个方向量化打包。深度不连续处限制跨边界混合，避免将前景遮蔽带到后方表面。

遮蔽图表示“暗多少”，边界图表示“过滤能否跨过去”。两份数据承担不同任务。

#### 历史保存遮蔽、深度和权重

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

#### 边界两侧都允许，才充分混合

每方向边界量保存为四档。读取后恢复到零到一，再让中心方向值与邻居反方向值相乘：双方都认为可以跨过时，混合才充分发生。

过滤还包括对角组合权重与中心权重，最终按总权重归一化。当前中心项为 $1.2\times0.2=0.24$。

每个 8×8 工作组中，一线程处理水平相邻两个像素，形成 16×8 输出区域。随后再做一轮保边处理，最后读取中心与四个对角位置上采样。

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/endfield/ao-raw.png"><img src="/images/rendering-analysis/endfield/ao-raw.png" alt="半分辨率原始遮蔽" loading="lazy" width="1000" height="419"></a><figcaption>半分辨率原始遮蔽</figcaption></figure>
<figure><a href="/images/rendering-analysis/endfield/ao-filtered.png"><img src="/images/rendering-analysis/endfield/ao-filtered.png" alt="历史与过滤后的全分辨率遮蔽" loading="lazy" width="1000" height="419"></a><figcaption>历史与过滤后的全分辨率遮蔽</figcaption></figure>
</div>

两图均以 0 到 0.67 预览。原始结果包含较细碎的变化，后图经过多步稳定和过滤；两者之间不只差一次模糊。

最后五点上采样没有再次读取深度。主要深度约束已在历史和边界过滤中完成，不能把每一步都统称为深度双边过滤。

#### 保边量的打包与双向检查

四方向连续程度先乘约 2.9 并舍入到 0～3，再各占 2 位放入同一字节。恢复时分别提取四个字段并除以三。因此它只提供四档边界许可，不是高精度深度，也不是四个方向的 AO。

对于水平相邻像素 $p,q$，一项连接权重可以写成：

$$
w_{p\leftrightarrow q}=e_{p,\rightarrow}e_{q,\leftarrow}
$$

若中心认为右侧连续程度为 1，而右邻居认为左侧为 0，乘积仍为零；若分别是 $2/3$ 和 $1/3$，权重只有 $2/9$。单看中心的边界值会放过第二个方向发现的不连续，双向条件则共同限制信息跨边界流动。

对角贡献还组合了相邻连接并带有约 0.425 的系数；加上中心项和各方向项后统一除以权重和。这个归一化很关键：同样数值的平坦区域，即使因为边界丢掉某些邻居，也应维持原有标量，而不是因邻居减少而自动变暗。

历史阶段与空间阶段的限制也各有作用。历史深度差让错误的旧表面失去权重，3×3 范围限制过时的遮蔽值，边界量则约束当前画面里邻居之间能否混合。最后五点上采样没有重做这些判定，不能把它当成具有独立几何理解能力的滤波器。

#### 临时数据与历史的数据寿命不同

原始遮蔽、过滤结果和边界数据属于当前帧临时结果，其中部分存储后面会被反射改作其他用途。跨帧历史则必须保留到下一次使用。

同一纹理顺序改写说明用途复用，不等于已经确认两个不同资源共享同一底层显存分配。

<span id="reflections"></span>

### 反射：先求采样位置，再从历史画面取色

这条反射路径把“去哪里取颜色”和“取到什么颜色”分开保存。前面利用当前深度、深度金字塔、法线与控制数据生成位置相关结果，随后用半分辨率坐标读取旧 HDR。

记全分辨率像素坐标为 $p$，画面尺寸为 $S$，半分辨率坐标图的值为 $u_r$：

$$
u_h=u_r+\frac{p\bmod2}{S}
$$
$$
C_r=C_{\text{history}}(u_h)
$$

同一个半分辨率位置对应四个全分辨率像素，余数项保留四者的子像素差异。它没有为每个全分辨率像素重新执行完整追踪，而是从较粗的位置结果重建颜色。

#### 极亮颜色先压缩，再参与过滤

已确认的颜色压缩为：

$$
C'_r=\frac{C_r}{1+\max(C_r)}
$$

最大分量增大时，各分量按同一个分母缩小，减少极亮样本在过滤中的支配程度。它属于中间计算域的压缩，不是最终屏幕的完整颜色映射。

后面继续建立较低分辨率的反射颜色层级，并结合深度等输入合成。颜色来源是旧画面，所以被遮住、刚显露或原先在视图之外的内容，需要依赖完整追踪与回退规则处理；这些上游细节目前尚未全部还原。

本文能确认的是坐标消费、子像素补偿、历史颜色来源和压缩关系，不能只凭一个坐标目标就把整套追踪写成已经复现。

<span id="fog"></span>

### 体积雾：局部介质与沿视线累积是两种数据

局部体积描述某一小段空气，累积体积描述相机到某个深度之间的整段空气。两者在数据流中前后相接，却不能互换。

#### 每个空间位置先得到散射与消光

局部生成阶段读取空间位置、灯光、阴影与相关介质参数，输出散射源 $S$ 和消光系数 $\sigma$。它还读取已有累积体积，说明当前局部更新可以利用前次结果。

空间中的各点可以独立求值，但沿一条视线的累积不能完全独立：远处一段空气收到的贡献，要乘上近处已经消耗后剩余的透射率。

#### 按深度层顺序积分

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

#### 每个线程沿一列依次积分，而不是每层单独完成

<figure class="rendering-diagram"><a href="/images/rendering-analysis/endfield/fog-integration.svg" target="_blank" rel="noopener"><img src="/images/rendering-analysis/endfield/fog-integration.svg" alt="体积雾数据流示意：局部散射与消光逐段积分，保存累积颜色和透射率" loading="lazy" width="1000" height="1050"></a><figcaption>算法示意 · 点击查看大图</figcaption></figure>

*视线积分示意。距离和数值均为公式算例；截帧中的真实近远层显示在下一组图片中。*

本次积分分派采用 8×8×1 的工作组。一个线程固定体积的横纵位置，循环处理所有深度层，在线程内部保留累积散射、累积透射、已行进距离和上一层空间位置。横纵不同列可以并行，单列中的远层则依赖近层结果。

深度层不是简单等距切片。程序先对层序号作指数映射，再经当前投影参数与逆变换恢复位置，最后计算两个实际位置的欧氏距离 $\Delta s$。因此同样“向后一层”，对应的空气长度可以不同；使用固定层长会让消光强度随深度产生错误偏差。

按当前正消光路径，循环可整理为：

~~~text
L = 0，T = 1，累计距离 = 0
逐层：
    恢复当前层空间位置，计算到上一层的距离
    读取这一段的局部散射源 S 和消光 σ
    计算段透射 t 和距离淡入 w
    L += T × S × (1 − t) / σ × w
    T *= 1 + w × (t − 1)
    保存当前累计 (L, T)，再前进到下一层
~~~

初始化的 $L=0,T=1$ 分别表示“尚未积累空气光”和“表面光还没有受到衰减”。它们不能同时清零：若把初始透射设为零，所有后续段的散射和远处表面都会被前缀乘积抹掉。

用两段相同空气举例，令 $\sigma=0.5,\Delta s=1,S=0.5,w=1$，单段透射约为 0.6065。第一段之后，$L\approx0.3935,T\approx0.6065$；第二段之后，$L\approx0.6321,T\approx0.3679$。第二段新增的散射只有约 0.2386，因为它还要穿过第一段空气。

若简单把两段散射相加，会得到约 0.7870，遗漏了近处空气对远处散射的衰减。若只保留透射，又会遗漏空气自己散射进来的光。这就是为什么累积纹理必须同时保存 RGB 和透射分量。

距离淡入 $w$ 同时用于散射增量与透射变化。$w=0$ 时，该段既不增加散射，也不减少剩余透射；$w=1$ 时使用完整段积分。它不是积分完成后随意乘到最终雾色上的透明度。

#### 同一体积里的近层与远层有什么差别

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/endfield/fog-scattering-near.png"><img src="/images/rendering-analysis/endfield/fog-scattering-near.png" alt="累积散射：较近的深度层" loading="lazy" width="626" height="360"></a><figcaption>累积散射：较近的深度层</figcaption></figure>
<figure><a href="/images/rendering-analysis/endfield/fog-scattering-far.png"><img src="/images/rendering-analysis/endfield/fog-scattering-far.png" alt="累积散射：较远的深度层" loading="lazy" width="626" height="360"></a><figcaption>累积散射：较远的深度层</figcaption></figure>
</div>

两张从同一累积体积取较近和较远切片，采用相同的 0 到 0.05 预览范围。远层出现更明显的空间分布；预览达到白色只表示超出此显示标尺，不代表实际数据在这里截断。

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/endfield/fog-transmittance-near.png"><img src="/images/rendering-analysis/endfield/fog-transmittance-near.png" alt="透射率：较近的深度层" loading="lazy" width="626" height="360"></a><figcaption>透射率：较近的深度层</figcaption></figure>
<figure><a href="/images/rendering-analysis/endfield/fog-transmittance-far.png"><img src="/images/rendering-analysis/endfield/fog-transmittance-far.png" alt="透射率：较远的深度层" loading="lazy" width="626" height="360"></a><figcaption>透射率：较远的深度层</figcaption></figure>
</div>

这里单独显示 alpha 中的透射率。较亮表示保留较多表面光，较暗表示经过更多衰减。切片来自深度层序列，不按等距离的米数解释。

这组图把“空气加进多少光”和“空气让原有光剩多少”分开显示。单独展示最终雾色，很容易遗漏第二个量。

#### 场景与角色都消费累积结果

表面已经得到自身颜色后，合成为：

$$
C_{\text{out}}=T\,C_{\text{surface}}+L
$$

角色路径也读取这份累积体积，并与其他高度雾相关项组合。人物与背景因而共享同一视线上的空气条件，同时仍保留各自的材质计算。

局部更新需要先读取旧体积，积分才覆盖新结果。数据更新顺序本身就是效果正确性的条件，不能把累积体积当作每个步骤都可以随意清空的临时颜色。

<span id="character"></span>

### 后续角色着色：为何场景受光后还要绘制几何

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/endfield/scene-lit.png"><img src="/images/rendering-analysis/endfield/scene-lit.png" alt="场景全屏照明完成" loading="lazy" width="1000" height="419"></a><figcaption>场景全屏照明完成</figcaption></figure>
<figure><a href="/images/rendering-analysis/endfield/scene-and-characters.png"><img src="/images/rendering-analysis/endfield/scene-and-characters.png" alt="后续几何着色完成" loading="lazy" width="1000" height="419"></a><figcaption>后续几何着色完成</figcaption></figure>
</div>

全景对照使用相同 HDR 标尺。前一阶段人物区域仍有黑色轮廓，后续几何补入角色颜色；背景主要结构保持对应。

<div class="rendering-figures">
<figure><a href="/scene-capture-comparison/figures/replay/endfield-character-before.png"><img src="/scene-capture-comparison/figures/replay/endfield-character-before.png" alt="人物局部：全屏照明之后" loading="lazy" width="390" height="617"></a><figcaption>人物局部：全屏照明之后</figcaption></figure>
<figure><a href="/scene-capture-comparison/figures/replay/endfield-character-after.png"><img src="/scene-capture-comparison/figures/replay/endfield-character-after.png" alt="人物局部：几何着色之后" loading="lazy" width="390" height="617"></a><figcaption>人物局部：几何着色之后</figcaption></figure>
<figure><a href="/scene-capture-comparison/figures/replay/endfield-character-final.png"><img src="/scene-capture-comparison/figures/replay/endfield-character-final.png" alt="最终人物外观" loading="lazy" width="390" height="617"></a><figcaption>最终人物外观</figcaption></figure>
</div>

前两张统一采用 0 到 0.2 的 HDR 预览；第三张已经过后续整帧显示处理。它们证明的是阶段贡献，未单独隔离环境光、阴影或雾的增益。

#### 深度相等让着色落在已有表面上

前面的深度和材质阶段已经建立人物可见性。代表后续路径使用相等深度测试，在匹配已有表面的位置输出颜色与运动。

黑色人物区域因此不意味着此前没有几何。更准确的解释是：人物的表面位置已经存在，专用颜色等到适当阶段再计算。它能够直接利用前面已经准备好的空间光照、阴影与雾。

这一阶段共有多次几何绘制，包含已确认会补入人物颜色的路径；不能因为连续的一组绘制都写同一目标，就把组内所有匿名程序都认定成同一种角色部件。

<span id="character-material"></span>

### 代表脸部材质：反射分配与受控明暗方向

下面展开与前文中央人物脸部对应的后续着色程序。它的一次提交为 3530 个三角形，结论限定于这条已追踪路径。

#### 金属混合量同时影响两种颜色

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

#### 主光与材质方向共同决定分区

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

#### 环境光使用的是同一套着色方向

三层环境数据解码后，每个颜色得到一个常量项和三个方向系数，与 $(N_x,N_y,N_z,1)$ 点乘，并限制为非负。

场景提供位置相关的光照系数，角色提供经过材质调整的方向，两者在这里相接。环境光不是对角色无差别乘一个固定 RGB，也不是一定等于全屏照明此前算出的颜色。

随后，当前角色颜色接受累积雾和其他空气项的合成。几何运动仍独立写入，并不因为颜色被雾衰减就一起变成“雾的运动”。

<span id="auxiliary"></span>

### 辅助几何：屏幕上的数据还能返回顶点阶段

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

### 运动编码与分类量化

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

#### 量化后的类别才是实际读回值

代表角色程序向附加通道写入一个 0.4 的控制量，但目标 alpha 只有两位，因此实际可存值只有 $0,1/3,2/3,1$。0.4 写入后落在 $1/3$ 档。

后面程序按接近 0.3 的区间判断相关类别，匹配的正是量化后的值。若只阅读写入常量，期待消费者精确读到 0.4，就会误解这个分支。

这也是为什么格式和通道含义必须一起说明。格式并非附带的资源列表，它直接影响算法条件。

<span id="temporal"></span>

### 整帧历史：验证、汇总、融合分成三个步骤

在角色、透明与效果完成当前颜色和运动之后，整帧处理才能比较新旧表面。它读取的不仅是旧 HDR，还有旧深度与旧运动、类别信息。

#### 第一步：逐像素检查对应关系

预处理比较当前与历史的深度、运动和分类。它输出一份邻域深度，以及同时保存运动和变化标志的数据。

深度用于发现遮挡显露或表面变化，运动差用于判断前后对应是否稳定，类别变化则防止不同处理规则之间随意继承旧状态。只比较颜色相似度，不能完整替代这些判断。

#### 第二步：在较低分辨率汇总变化

汇总阶段读取中心与四个对角位置，将变化标志组织成 860×360 的单通道结果，再供颜色融合使用。

![历史有效性汇总结果的单通道预览](/images/rendering-analysis/endfield/history-validity.png)

黑白区域是后续控制条件的分布，不是已经发生拖影的位置，也不是最终颜色误差图。它帮助观察历史控制如何覆盖人物、前景与背景边界。

低分辨率汇总使邻域的变化能够影响对应区域的历史使用，而不是只保留一个孤立像素的判断。

#### 第三步：融合 HDR 并回写置信状态

颜色阶段读取当前 HDR、重投影后的旧颜色和前面形成的有效性信息，输出新 HDR 与置信状态。它和 AO 的历史是两套数据：一个稳定局部遮蔽，另一个稳定整幅照明颜色。

旧颜色还被反射读取，因此必须在两个消费者结束后才交换历史版本。颜色、深度、运动和分类也需要保持时间对应；只有颜色更新、其他数据停留在不同时间，会破坏验证。

下面继续展开本次颜色融合程序中可以直接核对的重建、统计与状态计算；控制位仍按已经确认的行为描述。

#### 历史重建先压缩亮度，再恢复并限制过冲

<figure class="rendering-diagram"><a href="/images/rendering-analysis/endfield/temporal-confidence.svg" target="_blank" rel="noopener"><img src="/images/rendering-analysis/endfield/temporal-confidence.svg" alt="终末地整帧历史示意：表面验证、邻域统计、历史重建与置信状态各自参与融合" loading="lazy" width="1000" height="1180"></a><figcaption>算法示意 · 点击查看大图</figcaption></figure>

*按本帧三阶段依赖与颜色融合程序绘制。图中的置信状态是此路径的反馈量，不是概率或最终画质评分。*

历史颜色采用五次过滤采样组成十字形三次重建。每个样本 $H_i$ 在累加前先做亮度压缩：

$$
\ell(H_i)=0.2126H_{i,r}+0.7152H_{i,g}+0.0722H_{i,b},
\qquad
\widetilde H_i=\frac{H_i}{1+\ell(H_i)}
$$

在压缩域按三次权重累加并归一化后，再用相应反变换恢复 HDR。程序随后在旧坐标额外取得一次普通过滤样本 $H_b$，把重建值按通道限制到 $[0.2H_b,1.8H_b]$。

这道限制处理的是三次重建可能产生的过冲，依据来自同一位置的历史图；接下来的当前邻域统计，则处理历史与当前画面不一致。二者处于不同颜色阶段，不能省掉其中一个后仍声称保留了原来的历史约束。

#### 当前 3×3 邻域在 YCoCg 中形成允许范围

当前颜色先取非负部分，再转成以下尺度的亮度与色差分量：

$$
Y=R+2G+B,\qquad Co=2R-2B,\qquad Cg=-R+2G-B
$$

对九个当前样本分别计算均值和标准差：

$$
\mu=\frac19\sum_i X_i,\qquad
\sigma=\sqrt{\left|\frac19\sum_i X_i^2-\mu^2\right|}
$$
$$
\gamma=1.25-0.7\,\operatorname{smoothstep}(20,40,\sigma)
$$
$$
L=\min(\mu-\gamma\sigma,X_{\text{center}}),\qquad
U=\max(\mu+\gamma\sigma,X_{\text{center}})
$$

这些运算按三个分量分别进行，原程序使用约 0.1111 的系数。区间最后扩展到包含当前中心值，避免中心本身因为邻域差异而被排除。普通路径把历史 YCoCg 夹入该区间。

20 与 40 是上述 HDR 色差空间中的数值阈值，不是像素距离，也不能用于缩小四倍后的另一种 YCoCg 编码。随着标准差增大，$\gamma$ 从 1.25 降到 0.55，但区间宽度仍是 $\gamma\sigma$，因此不能简单说“高对比区域一定使用更窄的绝对范围”。

#### 置信状态同时依赖当前结构与旧状态

程序还判断当前中心与八邻居的亮度关系，形成邻域结构候选状态 $q_{\text{local}}$。已有历史 alpha 记为 $q_{\text{old}}$，主要反馈关系为：

$$
q_{\text{new}}=\max(q_{\text{local}},0.9q_{\text{old}})\,G
$$

$G$ 汇总低分辨率有效性标记、分类、越界和其他拒绝／重置条件。它不是由颜色相似度单独决定。程序中的结构判断包含邻居亮度比与组合掩码；本篇不把未完整命名的组合模式假定为“头发”“粒子”等业务类别。

当 $q_{\text{new}}\ge0.1$ 且历史位置有效，一条强状态分支允许放宽普通的方差夹取，并将相应混合权重调整到 0.9。若当前结构不再提供支持，旧状态的 0.9 倍仍可以短暂延续，但会受 $G$ 再次筛选。这解释了 alpha 为何需要跨帧保存：它记录的是后续融合会使用的响应状态，而非颜色透明度。

#### 最终混合仍在归一化的亮度／色差空间

记选定的当前 YCoCg 为 $X_c$、允许使用的历史为 $X_h$，分别以其第一分量归一化：

$$
\widetilde X_c=\frac{X_c}{1+Y_c},\qquad
\widetilde X_h=\frac{X_h}{1+Y_h}
$$
$$
\widetilde X=(1-w_h)\widetilde X_c+w_h\widetilde X_h,\qquad
X=\frac{\widetilde X}{\max(1-\widetilde Y,0.001)}
$$

之后由：

$$
R=(Y+Co-Cg)/4,\quad G=(Y+Cg)/4,\quad B=(Y-Co-Cg)/4
$$

恢复 RGB，限制为非负，并将 $q_{\text{new}}$ 写到 alpha。$w_h$ 在前面已受运动、采样位置、分类、拒绝条件和强状态分支改变，不能把整个过程压缩成固定比例的 HDR 插值。

<span id="bloom"></span>

### 泛光：从软阈值到多尺度重建

泛光位于 HDR 历史融合之后。它先挑选亮部，再建立多个空间尺度，最后逐层合成。这条路径同时决定亮点周围扩散多远，以及核心细节保留多少。

<div class="rendering-figures">
<figure><a href="/scene-capture-comparison/figures/replay/endfield-bloom-source.png"><img src="/scene-capture-comparison/figures/replay/endfield-bloom-source.png" alt="高亮提取后的结果" loading="lazy" width="750" height="239"></a><figcaption>高亮提取后的结果</figcaption></figure>
<figure><a href="/scene-capture-comparison/figures/replay/endfield-bloom-filtered.png"><img src="/scene-capture-comparison/figures/replay/endfield-bloom-filtered.png" alt="多尺度过滤后的结果" loading="lazy" width="750" height="239"></a><figcaption>多尺度过滤后的结果</figcaption></figure>
<figure><a href="/scene-capture-comparison/figures/replay/endfield-bloom-final.png"><img src="/scene-capture-comparison/figures/replay/endfield-bloom-final.png" alt="最终画面中的对应亮部" loading="lazy" width="750" height="239"></a><figcaption>最终画面中的对应亮部</figcaption></figure>
</div>

前两张都用 0 到 0.02 的 HDR 标尺，便于观察弱扩散。第三张是最终外观参照，包含本体颜色与其他合成，不能据它单独反推泛光强度。

#### 高亮提取有柔和过渡

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

#### 极亮孤立样本会降低自身过滤权重

对提取色 $C_b$，亮点抑制项为：

$$
w_b=\frac1{1+C_b\cdot(0.2127,0.7152,0.0722)}
$$

预过滤把空间权重与该项相乘，累加加权颜色，再除以总权重。越极端的亮点，越不容易单独支配整个邻域。

当前预过滤共使用 13 条采样记录，包括中心、较远四角、轴向点及内侧点。已保存的程序中，内侧记录有一个偏移重复；本文按实际记录理解它，不擅自替换成常见的完全对称模板。该细节是否属于源程序设计，需要进一步材料确认。

#### 下降链覆盖越来越宽的空间尺度

当前亮部从半分辨率开始，依次下降：

~~~text
1720×720 → 860×360 → 430×180 → 215×90
         → 108×45 → 54×23 → 27×11 → 13×6 → 7×3
~~~

越低分辨率的一次邻域过滤，对应原画面中越宽的范围。细层保留集中亮部，粗层形成大范围光晕。

这些不是可以生成下一层就全部丢弃的中间图：上升阶段还需要每一层原先的下降结果，才能将局部细节与较粗光晕重新组合。

#### 九点可分离过滤怎样复用数据

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

#### 上升重建保留每层自己的亮部

对较粗图的采样位置，程序按小数坐标构造三次 B-spline 权重。每轴四个一维权重配对为两个双线性采样位置，二维组合只需四次双线性采样。

得到较粗层重建色后，与本层保留的下降结果混合：

$$
C_{\text{level}}=
\operatorname{lerp}(C_{\text{down}},C_{\text{coarse,reconstructed}},0.41)
$$

0.41 是当前代表路径的参数，不推广为所有画质或所有变体的固定值。它具体说明了为什么不能只放大最小那张图：本层细节还在参与最终结果。

#### 四次双线性采样如何表达二维三次 B-spline

<figure class="rendering-diagram"><a href="/images/rendering-analysis/endfield/bloom-pyramid.svg" target="_blank" rel="noopener"><img src="/images/rendering-analysis/endfield/bloom-pyramid.svg" alt="终末地泛光示意：下降链保存各层亮部，四次过滤采样重建粗层，再与细层混合" loading="lazy" width="1000" height="1090"></a><figcaption>算法示意 · 点击查看大图</figcaption></figure>

*层级与重建示意，仅画出代表层；真实下降尺寸列在上文。两个方向的权重配对来自当前上升程序。*

在每个轴上，设采样位置的小数部分为 $f$，四个 B-spline 权重的数学形式为：

$$
w_0=(1-f)^3/6,\quad
w_1=(3f^3-6f^2+4)/6
$$
$$
w_2=(-3f^3+3f^2+3f+1)/6,\quad
w_3=f^3/6
$$

原程序使用相应的浮点近似常量。令 $g_0=w_0+w_1$、$g_1=w_2+w_3$，将相邻两项改写为：

$$
w_0C_{-1}+w_1C_0
=g_0\operatorname{lerp}(C_{-1},C_0,w_1/g_0)
$$
$$
w_2C_1+w_3C_2
=g_1\operatorname{lerp}(C_1,C_2,w_3/g_1)
$$

一次硬件线性过滤就能完成每对的插值。横向需要两个位置，纵向也需要两个位置，组合成四次双线性读取；最后用两轴的 $g$ 乘积加权。它减少的是显式纹理读取次数，四个像素的数学支撑范围仍存在。

例如 $f=0.5$，四权重为 $[1,23,23,1]/48$，两组权重和均为 0.5。由此可见，大部分权重集中在中间两项，远端两项维持平滑过渡。这套非负核与前面时序重建中的负瓣核承担不同任务：这里希望粗层光晕平滑放大。

上升时先重建粗层，再与当前层保留的下降结果混合，才得到这一层的新结果。若各层都采用代表值 0.41，一个只存在于很粗层的贡献每向上传一层都会再乘相应混合比例；同时，每个较细层都重新加入自己的亮部。这是多种尺度共同组成光晕的过程，不是把最小图不断放大后一次性覆盖。

泛光之后继续进行最终颜色合成。当前还有较小尺寸的光晕或模糊支路，但不能据此把其他角色展示场景的完整景深机制移植到这份竹林分析中。

<span id="conclusion"></span>

### 数据如何共同形成这幅画面

竹林表面先保存材质与可见性；方向体积按位置和朝向提供环境光，屏幕深度搜索形成局部遮蔽，旧 HDR 为反射提供颜色，累积雾描述从表面到相机之间的空气。角色在后续几何阶段读取这些条件，再写回自己的颜色、运动与分类。

完成所有当前帧写入后，整帧历史将深度、运动和类别一起验证，再交给多尺度泛光与最终显示。AO、反射、雾和整帧颜色各自保留所需状态，不能用一张统一的“历史图”替代全部依赖。

当前已经展开上述主要消费与计算规则。仍未完整确认的是方向光照的生产算法、反射追踪及未命中处理、辅助几何的具体部位，以及全部角色材质和跨帧更新策略。上述结论限于当前样本中已经确认的计算与依赖。

</div>
