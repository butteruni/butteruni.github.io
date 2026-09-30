---
title: "绝区零渲染实现分析：大厅材质、蕾米角色与整帧合成"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-30T17:32:06+08:00"
permalink: 2026/09/27/zzz-rendering-analysis/
categories:
  - 图形学
tags:
  - astra
  - 渲染分析
  - 绝区零
mathjax: true
---

> 由 astra 生成

以大厅与蕾米这份截帧为例，先梳理人物与场景资源，再通过整帧流程定位各阶段，随后按材质外观、照明、阴影、反射、人物形变与着色、透明层次和画面稳定逐项分析。每个效果内说明所用技术、数据流与截帧证据，复杂算法另配示意图。

<!-- more -->

<link rel="stylesheet" href="/css/rendering-articles.css?v=20260929-flow">

<div class="rendering-article">

<span id="frame"></span>

## 美术资源与渲染概况

![绝区零大厅最终画面：HIA 墙面、吧台、蕾米与右侧座椅](/scene-capture-comparison/leimi/e12209_rt0.png)

### 美术资源概况

- **人物按部位组织。** 蕾米身体、头发、脸部和眼睛有独立绘制与贴图；身体和头发的底色为 2K，法线为 1K。形态准备与翼部细分为后续几何提供不同形式的数据。
- **大厅表面复用材质与光照图集。** 建筑、小设施使用各自的底色／法线／控制输入，再通过另一套坐标读取 4K 烘焙光。
- **中央设备采用专用材质。** 显示设备与普通墙板的输入不同，不能按同一套表面算法解释。

### 渲染分析概况

| 画面效果 | 本帧的主要实现 |
|---|---|
| 大厅材质与受光 | 底色、细节法线与湿润建立表面；烘焙漫反射和运行时直接光共同形成照明 |
| 阴影、反射与空气 | 光源深度与局部遮蔽限制受光，镜像和探针提供反射，雾继续接入颜色 |
| 人物形变与外观 | 形态混合、翼部细分以及头发、脸部、眼睛的专用着色 |
| 轮廓与透明层次 | 几何外壳描边，按部位区分深度、模板与颜色混合 |
| 画面稳定与显示 | 运动和身份控制 HDR 历史融合，随后处理泛光、运动模糊与显示颜色 |

### 样本条件

主视图有效区域为 3432×1440，最终输出为 3440×1440，接口为 D3D11。本文分析这份大厅与蕾米的单帧状态；画质档位、硬件耗时和距离切换策略没有从当前材料得到完整测量。

下文先按人物、建筑与环境资源解释它们是什么，再用流程图定位阶段、按画面效果展开实现。效果图与资源图均来自本帧，黄色线框用于定位实际几何，另绘的算法示意图会单独注明。

<span id="resources"></span>

## 美术资源详细统计

### 渲染提交统计

下表按执行顺序合并连续阶段区间。每行包括区间内的相邻准备或合成工作，不将整段计数当作某一个效果的独占开销。绘制包含主视图、阴影、全屏处理及界面；计算分派单列。

| 连续阶段区间 | 绘制次数 | 计算分派 | 提交三角形数 |
|---|---:|---:|---:|
| 角色初始准备 | 36 | 31 | 0 |
| 镜像视图及其输出 | 240 | 0 | 349,138 |
| 主视图前的阴影、细分与颜色表准备 | 211 | 18 | 435,984 |
| 主视图材质与贴花 | 172 | 1 | 352,654 |
| 深度层级、灯光、遮蔽与延迟照明 | 63 | 9 | 462 |
| 后续几何、透明、局部效果与历史处理 | 79 | 0 | 65,198 |
| 泛光、运动模糊、显示与界面 | 178 | 0 | 3,134 |
| **全帧合计** | **979** | **59** | **1,206,570** |

三角形按实际拓扑与实例数计入：三角形列表的一次提交量为“索引数 ÷ 3 × 实例数”。同一几何进入不同视图或阶段会重复计数；点形式的几何准备计入绘制次数，但不计作三角形。这里没有 GPU 时间数据，不能用调用或面数直接评价耗时。

下面改按资源对象拆开说明。每个部件的数字只对应已定位的代表提交，避免把整帧重复工作误当作唯一模型规模。

### 蕾米人物资源

#### 模型按着色任务拆分

蕾米并非一次提交完整人物。主视图中，头发、身体、脸部先后建立自己的材质结果；眼睛在更晚的位置单独合成。翼部还经过计算细分，几何的生产和可见着色发生在不同阶段。

| 代表部件 | 单次索引数 | 单实例三角形数 | 本次实例数 |
|---|---:|---:|---:|
| 一组头发 | 24279 | 8093 | 1 |
| 主身体与服饰 | 63582 | 21194 | 1 |
| 脸部 | 7458 | 2486 | 1 |
| 眼睛 | 1260 | 420 | 1 |

这里列出已单独确认范围的提交。头发还有一组 5278 个三角形的辅助范围，参与后续分层提交，人物也会重复进入镜像、阴影等视图；这张表因此不用于求“整个角色唯一总面数”。

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/zzz/hair-geometry.png"><img src="/images/rendering-analysis/zzz/hair-geometry.png" alt="头发的一组实际绘制范围；此时身体尚未画入当前颜色。" loading="lazy" width="640" height="1309"></a><figcaption>头发的一组实际绘制范围；此时身体尚未画入当前颜色。</figcaption></figure>
<figure><a href="/images/rendering-analysis/zzz/body-geometry.png"><img src="/images/rendering-analysis/zzz/body-geometry.png" alt="主身体与服饰的绘制范围；黄色覆盖上身与配饰。" loading="lazy" width="640" height="1309"></a><figcaption>主身体与服饰的绘制范围；黄色覆盖上身与配饰。</figcaption></figure>
<figure><a href="/images/rendering-analysis/zzz/face-geometry.png"><img src="/images/rendering-analysis/zzz/face-geometry.png" alt="脸部单独绘制；范围与身体、头发不同。" loading="lazy" width="640" height="1309"></a><figcaption>脸部单独绘制；范围与身体、头发不同。</figcaption></figure>
</div>

黄色线框是回放工具对该次几何提交的辅助显示。底图停留在对应绘制完成时，未出现的场景或部件将在后面加入；黑色背景不属于人物贴图。

#### 身体与头发：颜色、方向和控制各自保存

| 资源 | 本次尺寸、格式与用途 | 贴图预览 |
|---|---|---|
| 身体底色 | 2048×2048，BC7 sRGB；衣料、皮肤与饰件的颜色图集 | <a href="/images/rendering-analysis/zzz/body-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/zzz/body-colour.png" alt="本行资源的实际贴图预览" loading="lazy" width="768" height="768"></a> |
| 身体法线 | 1024×1024，RGBA8；提供局部方向细节 | <a href="/images/rendering-analysis/zzz/body-normal.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/zzz/body-normal.png" alt="本行资源的实际贴图预览" loading="lazy" width="768" height="768"></a> |
| 身体材质控制 M | 2048×2048，BC6 无符号浮点 RGB；多种区域控制共用图集 | <a href="/images/rendering-analysis/zzz/body-control.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/zzz/body-control.png" alt="本行资源的实际贴图预览" loading="lazy" width="768" height="768"></a> |
| 头发底色 | 2048×2048，BC7 sRGB；不同发束共享展开区域 | <a href="/images/rendering-analysis/zzz/hair-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/zzz/hair-colour.png" alt="本行资源的实际贴图预览" loading="lazy" width="768" height="768"></a> |
| 头发法线 | 1024×1024，RGBA8；方向数据与底色分开 | <a href="/images/rendering-analysis/zzz/hair-normal.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/zzz/hair-normal.png" alt="本行资源的实际贴图预览" loading="lazy" width="768" height="768"></a> |
| 头发材质控制 M | 2048×2048，BC6 无符号浮点 RGB | <a href="/images/rendering-analysis/zzz/hair-control.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/zzz/hair-control.png" alt="本行资源的实际贴图预览" loading="lazy" width="768" height="768"></a> |

两组材质还各自绑定一张 2048×2048 的 BC6 浮点辅助控制 A；身体另外读取 256×256 的颜色纹理数组。M、A 在此仅保留资产中的区分名称，不把它们自动解释成 metallic 和 alpha。

身体底色能看出衣料、肤色与装饰的分块，法线图保留相同 UV 展开位置的表面方向变化。两者分辨率相差一倍：本次身体颜色为 2K，法线为 1K，说明颜色细节和方向细节分别配置资源，并非所有角色贴图统一采用相同尺寸。

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/zzz/body-control-r.png"><img src="/images/rendering-analysis/zzz/body-control-r.png" alt="身体 M 图的 R 通道。" loading="lazy" width="512" height="512"></a><figcaption>身体 M 图的 R 通道。</figcaption></figure>
<figure><a href="/images/rendering-analysis/zzz/body-control-g.png"><img src="/images/rendering-analysis/zzz/body-control-g.png" alt="身体 M 图的 G 通道。" loading="lazy" width="512" height="512"></a><figcaption>身体 M 图的 G 通道。</figcaption></figure>
<figure><a href="/images/rendering-analysis/zzz/body-control-b.png"><img src="/images/rendering-analysis/zzz/body-control-b.png" alt="身体 M 图的 B 通道。" loading="lazy" width="512" height="512"></a><figcaption>身体 M 图的 B 通道。</figcaption></figure>
</div>

三个通道在衣料、皮肤与饰件上有不同分区。它们是数值输入，彩色预览本身不能证明每个通道的物理意义。BC6 这份资源只有 RGB，因此这里展示三个真实分量；把预览工具补出的常量 alpha 当作第四张材质遮罩会产生误读。后文以已还原的头发路径进一步说明 M.R 区域选择、其余控制分量、高光以及实体光的消费关系。不同角色部件仍按各自程序解释。

#### 顶点输入与形变结果的关系

主身体这次绘制消费以下有效输入。表中尺寸指每个顶点在输入流中的存储，不等同于程序使用的分量数。

| 数据 | 当前存储 | 在本路径中的作用 |
|---|---|---|
| 位置、法线、切线 | 分别占一个 16 字节浮点向量 | 提供当前形状与局部方向；位置和法线使用前三个分量 |
| 顶点颜色 | 4 字节归一化 RGBA | 本变体实际使用其中的控制分量 |
| 多组纹理坐标 | 每组两个 32 位浮点数 | 为不同材质计算提供坐标输入 |
| 额外位置类输入 | 独立流中的 16 字节浮点向量 | 与前后状态有关的几何输入；后文结合运动路径说明 |

输入布局里还绑定了未被当前程序读取的槽位，不能据此额外统计蒙皮权重或 UV 组数。头发路径的两组坐标还指向相同偏移；“两个语义名”也不等于“两个独立展开”。

角色准备阶段的稀疏形态记录与这里的绘制输入不是同一种布局：形态记录按 40 字节组织，后续几何使用重新组织过的流，翼部细分结果又以 48 字节保存位置和方向。理解这些中间形式，才能解释为什么角色变形先执行、可见绘制后消费，而不是每个像素重新计算形态。

#### 脸与眼睛使用专门输入

脸部读取 2048×2048 的 BC7 sRGB 底色、256×256 的 RGBA16F 光照控制，以及 2048×2048 的阴影深度输入。它会直接生成部分已着色颜色。眼睛则在独立绘制中使用预乘合成，并读取 1024×32 的角色颜色查找表。

这两条路径的差别首先体现在输出职责：脸部要建立颜色及供后续分类的状态；眼睛要在已有颜色上控制局部覆盖。对应的阴影比较、颜色变换和查找表插值放在渲染分析中逐步展开。

### 大厅建筑与地表资源

#### 柜台图集与摆放后的烘焙照明

大厅墙面、地面、柜台和设备各自选用材质。这里采用主视图中可明确定位的圆形柜台作为资源示例：这次提交为 2,266 个三角形、1 个实例，底色、法线和控制纹理均为 2048×1024，并读取 4096×4096 的压缩烘焙光图集。

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/zzz/counter-located.png"><img src="/images/rendering-analysis/zzz/counter-located.png" alt="圆形柜台的实际提交范围。" loading="lazy" width="700" height="518"></a><figcaption>圆形柜台的实际提交范围。</figcaption></figure>
<figure><a href="/images/rendering-analysis/zzz/counter-final.png"><img src="/images/rendering-analysis/zzz/counter-final.png" alt="相同位置的最终柜台与大厅环境。" loading="lazy" width="700" height="517"></a><figcaption>相同位置的最终柜台与大厅环境。</figcaption></figure>
</div>

两图范围一致。线框只定位这一组柜台几何，人物、座椅、柜台上的终端和背景分别由其他提交形成。最终外观叠加了光照、空气和显示处理。

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/zzz/counter-colour.png"><img src="/images/rendering-analysis/zzz/counter-colour.png" alt="柜台底色，2048×1024。" loading="lazy" width="900" height="450"></a><figcaption>柜台底色，2048×1024。</figcaption></figure>
<figure><a href="/images/rendering-analysis/zzz/counter-normal.png"><img src="/images/rendering-analysis/zzz/counter-normal.png" alt="与柜台底色同次绑定的法线编码图。" loading="lazy" width="900" height="450"></a><figcaption>与柜台底色同次绑定的法线编码图。</figcaption></figure>
<figure><a href="/images/rendering-analysis/zzz/counter-control.png"><img src="/images/rendering-analysis/zzz/counter-control.png" alt="与柜台底色同次绑定的材质控制图。" loading="lazy" width="900" height="450"></a><figcaption>与柜台底色同次绑定的材质控制图。</figcaption></figure>
</div>

三张纹理是上述柜台绘制实际绑定的一组输入，图案共享 UV。控制图的 R、G 等分量影响材质响应；法线编码则需要按该路径解码，不能把数值图预览的粉色、绿色当成表面颜色。

柜台的底色图集负责表面细节，烘焙光使用另一套坐标对应它在大厅里的摆放。多种物件可以共享光照图集，但不会因此共用同一张底色或同一套材质参数。

| 代表绘制 | 单实例三角形数 | 实例数 | 对应资源 |
|---|---:|---:|---|
| 圆形柜台 | 2266 | 1 | 2048×1024 底色、法线与控制 |
| 小型通风口 | 228 | 1 | 512×256 材质；后文用于解释具体照明公式 |
| 中央圆形设备 | 4896 | 1 | 专用显示材质，颜色阶段另读外壳与序列图 |

| 同一通风口绘制的输入 | 尺寸与格式 | 在材质中的职责 |
|---|---|---|
| 底色 | 512×256，BC1 sRGB | 表面色与条纹 |
| 法线 | 512×256，BC7 | 切线空间方向 |
| 材质控制 | 512×256，BC1 | 调整响应与分支 |
| 烘焙光／天空遮蔽 | 4096×4096，BC7 | 经专用解码后参与已有照明 |
| 湿润噪声 | 512×512 | 按空间位置提供变化 |
| 环境高度 | 509×512，R16 | 将表面位置联系到环境高度条件 |

后文的压缩光照与湿润公式来自这条通风口材质；上面的资源图则对应柜台，不将通风口参数套到柜台。大厅阶段图用于说明整帧颜色发生了什么；具体到每一种墙板、设备或地面，还要以各自的材质分支为准。共享一张光照图集并不意味着全部表面使用完全相同的像素程序。

#### 显示设备有单独的材质路径

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/zzz/device-geometry.png"><img src="/images/rendering-analysis/zzz/device-geometry.png" alt="黄色线框定位中央圆形设备的这次提交，底图为当时的材质颜色。" loading="lazy" width="1280" height="537"></a><figcaption>黄色线框定位中央圆形设备的这次提交，底图为当时的材质颜色。</figcaption></figure>
</div>

线框定位中央设备的几何。这里展示的是较早的表面准备：读取 2048×2048 法线和默认方向，写入表面方向等数据，颜色输出本身尚未给出完整设备外观。后续颜色阶段再次使用这套网格，才读取底色、控制图、显示序列及照明输入。两阶段的职责和实际显示内容见[设备外壳与显示画面](#device-display)。

### 镜像、环境与共享照明资源

本帧在主视图前完整处理了一套镜像方向的场景，包含几何、照明与输出。它增加的是另一个观察方向的工作，不能将其绘制次数当作大厅内多出了一批模型。

此外，主视图材质使用烘焙光、环境高度，后续照明使用阴影、屏幕遮蔽、胶囊遮蔽与反射输入。它们的坐标系统不同：光照图集贴合表面 UV，环境高度按世界位置查询，阴影从光源方向查询，屏幕数据对应当前视角。

当前天空路径还绑定一张 4096×512 的低云纹理。不过这是一帧室内大厅画面，绑定天空输入并不能证明画面中存在可分析的可见云层。本文的资源重点因此放在确实可定位的人物、建筑、设备与照明数据上。


## 渲染分析

<span id="effects"></span>

先用[整帧流程](#pipeline)定位执行阶段，再按下面的画面效果阅读。每个效果章节先交代画面作用，再展开实现技术、数据流与截帧证据；资源尺寸和几何统计见前一部分。章节顺序用于阅读，实际执行先后以流程图为准。

| 画面效果 | 本文展开的实现与证据 |
|---|---|
| [大厅材质外观](#scene-material) | 底色与细节法线、双套 UV、空间湿润控制 |
| [墙面标识与贴花](#decals) | 深度投影、局部范围、材质颜色与法线覆盖 |
| [大厅照明](#lights) | 烘焙漫反射、实时直接光、局部光筛选与分项关闭对照 |
| [阴影与接触暗部](#shadows) | 光源深度、屏幕方向搜索、角度积分、独立 AO 历史与胶囊遮蔽 |
| [反射](#reflections) | 镜像视图与局部探针的方向采样 |
| [设备显示](#device-display) | 外壳受光、两组材质、序列图块与颜色输出 |
| [雾与空气](#atmosphere) | 盒内步进、阴影调制、面片淡出、三点历史约束及加色合成 |
| [屏幕光束](#light-shafts) | 遮挡提取与径向采样；本帧输出无可见贡献 |
| [人物形变与翼部轮廓](#character-shape) | 稀疏形态混合、观察尺度细分、顶点和索引生成 |
| [翼部花纹与背向受光](#wing-shading) | 花纹三通道、方向响应与指数颜色调制 |
| [头发明暗与高光](#character-material-routing) | 区域参数、法线、实体受光与亮度控制 |
| [脸部受光](#face)与[眼睛层次](#eyes) | 脸部阴影验证；眼部预乘合成与颜色查表 |
| [人物描边](#outline-geometry) | 平滑扩张方向、距离宽度和前后帧外壳 |
| [透明与前后层次](#character-layer-composition) | 深度／模板、分层混合和可选消隐 |
| [抗锯齿与画面稳定](#image-stability) | 运动、身份拒绝、邻域约束和 HDR 历史融合 |
| [亮部、运动模糊与显示色彩](#output) | 两套泛光、材质筛选、方向积累与局部／整帧调色 |

<span id="pipeline"></span>

<span id="整帧流程"></span>

### 整帧流程与表面数据

流程图负责说明先后与依赖。下方补充主材质的输出约定，后面的照明、阴影和人物效果都以这些表面数据为输入。

<p class="rendering-flow-intro">从上向下跟随箭头阅读。每个阶段说明实际工作与输出结果；阶段标题可跳转到对应分析。箭头表示主要执行次序，颜色、深度等数据可以跨过多个阶段继续使用。</p>
<ol class="rendering-frame-flow" aria-label="绝区零整帧执行流程">
<li class="rendering-flow-step rendering-flow-prepare">
<div class="rendering-flow-card">
<p class="rendering-flow-title"><span class="rendering-flow-phase">准备</span><a href="#character-geometry">角色形态与早期几何准备</a></p>
<dl class="rendering-flow-detail">
<dt>工作</dt><dd>累加角色形态增量，同步更新位置与方向，准备早期视图会使用的几何。</dd>
<dt>输出</dt><dd>当前角色形状 → 镜像及后续几何消费者。</dd>
</dl>
</div>
</li>
<li class="rendering-flow-step rendering-flow-prepare">
<div class="rendering-flow-card">
<p class="rendering-flow-title"><span class="rendering-flow-phase">离屏视图</span><a href="#reflections">镜像视图独立渲染</a></p>
<dl class="rendering-flow-detail">
<dt>工作</dt><dd>从镜像视点重新处理可见几何、深度、照明、透明和颜色，形成这一路视图的画面。</dd>
<dt>输出</dt><dd>镜像方向的场景颜色 → 主视图中对应的反射使用。</dd>
</dl>
<p class="rendering-flow-note"><strong>视图顺序</strong>本次翼部细分发生在镜像之后；镜像使用此前已经准备好的几何。</p>
</div>
</li>
<li class="rendering-flow-step rendering-flow-prepare">
<div class="rendering-flow-card">
<p class="rendering-flow-title"><span class="rendering-flow-phase">准备</span><a href="#wing-subdivision">主视图阴影、翼部细分与颜色准备</a></p>
<dl class="rendering-flow-detail">
<dt>工作</dt><dd>镜像结束后继续绘制场景阴影代理；再生成翼部细分几何，完成后续阴影、深度及颜色查找表准备。</dd>
<dt>输出</dt><dd>主视图所需几何、光源深度与颜色表 → 材质及照明。</dd>
</dl>
</div>
</li>
<li class="rendering-flow-step rendering-flow-surface">
<div class="rendering-flow-card">
<p class="rendering-flow-title"><span class="rendering-flow-phase">表面</span><a href="#surfaces">主视图材质与贴花</a></p>
<dl class="rendering-flow-detail">
<dt>工作</dt><dd>建立可见表面。人物分部位写入颜色和控制；大厅按独立 UV 解码烘焙光，分别保存表面色与已有照明。</dd>
<dt>输出</dt><dd>深度、颜色、法线、材质参数及分类 → 后续屏幕处理与照明。</dd>
</dl>
<p class="rendering-flow-note"><strong>输入区别</strong>烘焙光图集是已有资源；此处完成采样和解码。人物部分写出的则已经包含专用着色。</p>
</div>
</li>
<li class="rendering-flow-step rendering-flow-prepare">
<div class="rendering-flow-card">
<p class="rendering-flow-title"><span class="rendering-flow-phase">筛选</span><a href="#lights">分级深度与屏幕候选列表</a></p>
<dl class="rendering-flow-detail">
<dt>工作</dt><dd>建立分级深度，并按屏幕区域和深度层筛选候选；局部光与反射探针分别写入自己的列表分区。</dd>
<dt>输出</dt><dd>深度层级、格子表头和索引 → 屏幕查询、局部光照与探针反射。</dd>
</dl>
<p class="rendering-flow-note"><strong>同段支路</strong>世界网格列表也被构建，但本帧只查到其输出写入，未确认后续读取。</p>
</div>
</li>
<li class="rendering-flow-step rendering-flow-lighting">
<div class="rendering-flow-card">
<p class="rendering-flow-title"><span class="rendering-flow-phase">照明输入</span><a href="#shadows">阴影、雾与局部遮蔽准备</a></p>
<dl class="rendering-flow-detail">
<dt>工作</dt><dd>由相机深度恢复表面，查询光源深度并解析遮挡；结合角色分类、屏幕遮蔽及胶囊遮蔽，准备表面受光限制。局部雾另以盒体步进和面片淡出生成颜色，并完成自身历史过滤。</dd>
<dt>输出</dt><dd>当前表面的受光限制与环境辅助结果 → 后续照明和合成。</dd>
</dl>
</div>
</li>
<li class="rendering-flow-step rendering-flow-lighting">
<div class="rendering-flow-card">
<p class="rendering-flow-title"><span class="rendering-flow-phase">照明</span><a href="#baked-and-listed-lighting">延迟照明与环境反射</a></p>
<dl class="rendering-flow-detail">
<dt>工作</dt><dd>把烘焙值接入漫反射照明；主光与列表中的局部光计算直接漫反射和高光，探针采样另行生成环境镜面反射。</dd>
<dt>输出</dt><dd>主体照明后的 HDR 颜色 → 后续几何和透明合成。</dd>
</dl>
</div>
</li>
<li class="rendering-flow-step rendering-flow-lighting">
<div class="rendering-flow-card">
<p class="rendering-flow-title"><span class="rendering-flow-phase">合成</span><a href="#character-layer-composition">后续几何、透明与光束合成</a></p>
<dl class="rendering-flow-detail">
<dt>工作</dt><dd>继续绘制<a href="#device-display">设备外壳与显示内容</a>、透明材质和局部效果，处理较早亮部链与场景调色，并将过滤后的<a href="#atmosphere">局部雾加到 HDR</a>；光束链也会执行，但本帧光束结果为零。各路径按自己的深度和混合规则写入。</dd>
<dt>输出</dt><dd>当前 HDR 颜色、运动及身份信息 → 整帧历史融合。</dd>
</dl>
</div>
</li>
<li class="rendering-flow-step rendering-flow-history">
<div class="rendering-flow-card">
<p class="rendering-flow-title"><span class="rendering-flow-phase">历史</span><a href="#temporal">HDR 历史融合</a></p>
<dl class="rendering-flow-detail">
<dt>工作</dt><dd>利用运动找到旧表面，以身份和邻域条件判断历史是否可用；限制旧颜色后，与当前颜色融合。</dd>
<dt>输出</dt><dd>稳定后的 HDR 颜色 → 泛光；更新的颜色与身份 → 后续帧。</dd>
</dl>
<p class="rendering-flow-note"><strong>跨帧输入</strong>读取旧颜色和旧身份。完成这些读取后，才能保存新的历史；此处还没有得到最终显示图。</p>
</div>
</li>
<li class="rendering-flow-step rendering-flow-display">
<div class="rendering-flow-card">
<p class="rendering-flow-title"><span class="rendering-flow-phase">后处理</span><a href="#output">主视图泛光</a></p>
<dl class="rendering-flow-detail">
<dt>工作</dt><dd>对高亮颜色进行提取和多尺度处理，准备亮部向周围扩散的贡献。</dd>
<dt>输出</dt><dd>泛光及相关颜色结果 → 后续运动模糊与末段合成。</dd>
</dl>
</div>
</li>
<li class="rendering-flow-step rendering-flow-display">
<div class="rendering-flow-card">
<p class="rendering-flow-title"><span class="rendering-flow-phase">后处理</span><a href="#output">运动模糊</a></p>
<dl class="rendering-flow-detail">
<dt>工作</dt><dd>利用当前运动描述处理画面中的移动，使当前颜色进入本帧后续显示合成。</dd>
<dt>输出</dt><dd>运动模糊后的颜色 → 最终显示处理。</dd>
</dl>
</div>
</li>
<li class="rendering-flow-step rendering-flow-display">
<div class="rendering-flow-card">
<p class="rendering-flow-title"><span class="rendering-flow-phase">显示</span><a href="#output">最终颜色与界面输出</a></p>
<dl class="rendering-flow-detail">
<dt>工作</dt><dd>完成末段颜色合成与显示转换，再叠加界面等最终内容。</dd>
<dt>输出</dt><dd>最终显示画面；与前面用于时序的 HDR 历史分开理解。</dd>
</dl>
</div>
</li>
</ol>
<p class="rendering-flow-caption">依据本次截帧的执行顺序整理；下方阶段画面用于观察颜色怎样逐步建立，详细算法继续在后文展开。</p>

#### 沿同一视角观察颜色的建立

<div class="rendering-figures rendering-stages">
<figure><a href="/images/rendering-analysis/zzz/stage-characters.png"><img src="/images/rendering-analysis/zzz/stage-characters.png" alt="主材质早段：人物颜色已经出现，大厅尚未填入。" loading="lazy" width="1200" height="503"></a><figcaption>主材质早段：人物颜色已经出现，大厅尚未填入。</figcaption></figure>
<figure><a href="/images/rendering-analysis/zzz/stage-material.png"><img src="/images/rendering-analysis/zzz/stage-material.png" alt="主材质完成：大厅写入已有照明，人物保留自己的着色职责。" loading="lazy" width="1200" height="503"></a><figcaption>主材质完成：大厅写入已有照明，人物保留自己的着色职责。</figcaption></figure>
<figure><a href="/images/rendering-analysis/zzz/stage-lighting.png"><img src="/images/rendering-analysis/zzz/stage-lighting.png" alt="延迟照明之后：场景已有主照明，仍未完成全部后续效果。" loading="lazy" width="1200" height="503"></a><figcaption>延迟照明之后：场景已有主照明，仍未完成全部后续效果。</figcaption></figure>
<figure><a href="/images/rendering-analysis/zzz/stage-transparent.png"><img src="/images/rendering-analysis/zzz/stage-transparent.png" alt="后续几何、透明与局部效果之后。" loading="lazy" width="1200" height="503"></a><figcaption>后续几何、透明与局部效果之后。</figcaption></figure>
<figure><a href="/images/rendering-analysis/zzz/stage-temporal.png"><img src="/images/rendering-analysis/zzz/stage-temporal.png" alt="HDR 历史处理的输出；后面仍会继续泛光与显示转换。" loading="lazy" width="1200" height="503"></a><figcaption>HDR 历史处理的输出；后面仍会继续泛光与显示转换。</figcaption></figure>
<figure><a href="/scene-capture-comparison/leimi/e12209_rt0.png"><img src="/scene-capture-comparison/leimi/e12209_rt0.png" alt="最终输出：整帧显示转换与界面已完成。" loading="lazy" width="3440" height="1440"></a><figcaption>最终输出：整帧显示转换与界面已完成。</figcaption></figure>
</div>

前五张按 0 到 1 的线性 HDR 显示范围进行预览，并作显示伽马转换；最终图包含游戏自己的显示处理。材质阶段同一颜色目标存在不同类型的内容，不能将相邻图的亮度差全部解释成新加入的一盏灯。

<span id="surfaces"></span>

<span id="主材质不是一套全图统一的颜色定义"></span>

#### 效果共用的表面颜色、方向与分类

主视图同时写出多类表面数据。下表按用途描述它们，不要求读者知道内部存储标识。

| 数据 | 场景材质写入什么 | 脸部路径写入什么 |
|---|---|---|
| HDR 颜色 | 烘焙光等已有光照量 | 已经过阴影与调色的脸部颜色 |
| 表面色／控制图 | 处理后的表面颜色 | 一个材质控制量的重复分量 |
| 材质扩展图 | 表面响应及分支控制 | 压缩屏幕运动及附加标记 |
| 法线图 | 表面朝向及分类信息 | 表面朝向及不同的附加分类 |
| 深度与模板 | 当前可见表面和材质类别 | 角色表面和角色类别 |

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/zzz/surface-colour.png"><img src="/images/rendering-analysis/zzz/surface-colour.png" alt="主视图的表面颜色" loading="lazy" width="1000" height="420"></a><figcaption>主视图的表面颜色</figcaption></figure>
<figure><a href="/images/rendering-analysis/zzz/surface-normal.png"><img src="/images/rendering-analysis/zzz/surface-normal.png" alt="主视图的法线编码" loading="lazy" width="1000" height="420"></a><figcaption>主视图的法线编码</figcaption></figure>
<figure><a href="/images/rendering-analysis/zzz/surface-lighting.png"><img src="/images/rendering-analysis/zzz/surface-lighting.png" alt="同阶段已保存的光照贡献" loading="lazy" width="1000" height="420"></a><figcaption>同阶段已保存的光照贡献</figcaption></figure>
</div>

颜色、法线与已有光照在此时分别保存。人物在不同目标中的外观并不一致，正是材质分支采用不同输出语义的表现；法线图中的彩色不表示实际涂色。

法线表示表面朝向。当前直接编码的方向满足：

$$
C_N=0.5N+0.5,\qquad N=\operatorname{normalize}(2C_N-1)
$$

把带正负号的方向映射到零到一后，才能放入无符号归一化通道。显示成彩色的法线图并非物体底色，读取它的程序会先恢复方向。

分类信息决定某个像素应该按哪一行规则解释。若给整张 HDR 图统一起名为“底色”，会把场景光照量与角色已着色颜色混为一谈；若把材质扩展图统一当成粗糙度，又会把脸部运动当成材质参数。这是本帧后续分支必须存在的原因之一。

<span id="scene-material"></span>

<span id="大厅材质从底色和法线得到压缩烘焙光"></span>

### 大厅表面的配色、凹凸与湿润

墙板、通风口和地面先由底色建立配色，再由细节法线改变受光方向；湿润控制继续调整颜色与方向。下面沿代表通风口材质解释这些输入如何形成表面，烘焙照明的解码与合成集中放在[大厅照明](#lights)中。

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/zzz/vent-base-colour.png"><img src="/images/rendering-analysis/zzz/vent-base-colour.png" alt="通风口的基础颜色" loading="lazy" width="768" height="384"></a><figcaption>通风口的基础颜色</figcaption></figure>
<figure><a href="/images/rendering-analysis/zzz/vent-normal.png"><img src="/images/rendering-analysis/zzz/vent-normal.png" alt="同一材质的法线输入" loading="lazy" width="768" height="384"></a><figcaption>同一材质的法线输入</figcaption></figure>
<figure><a href="/images/rendering-analysis/zzz/vent-material-mask.png"><img src="/images/rendering-analysis/zzz/vent-material-mask.png" alt="同一材质的控制输入" loading="lazy" width="768" height="384"></a><figcaption>同一材质的控制输入</figcaption></figure>
</div>

底色图中的板缝、标识与法线中的方向变化相互对应，但控制图保存的是数值分区。下面的解码说明它们如何变成表面色、朝向和响应参数。

#### 两套 UV 让材质贴图与烘焙光独立布置

以大厅通风口的代表材质为例，它读取底色、法线、材质遮罩和一张压缩光照／天空遮蔽贴图。底色使用 sRGB 颜色解释，法线与控制量按线性数值读取；光照贴图为 4096×4096 的压缩纹理。

模型提供两套 UV。第一套定位底色和细节，第二套定位预先计算的光照。每个实例还可以对第二套 UV 做缩放和平移，因此不同摆放实例能够使用自己的光照区域，而不必改变同一份材质底图。

当前实例数据中，位置变换、法线变换、切线方向与负缩放符号、光照 UV 变换分别存在。法线不能简单套用任意位置变换：位置包含平移，方向不应受平移影响；负缩放也会改变切线坐标系的朝向。材质最终收到的是一致的世界空间位置与方向。

#### 法线贴图怎样恢复真实的表面朝向

当前程序并非简单地取贴图 RGB 乘二减一。记法线贴图分量为 $r,g,a$，强度为 $s$：

$$
x=(2ra-1)s,\qquad y=(2g-1)s
$$
$$
z=\sqrt{1-\min(x^2+y^2,1)}
$$

随后用世界切线 $T$、几何法线 $N_g$ 和切线符号 $h$ 构造副切线：

$$
B=\operatorname{cross}(N_g,T)h
$$
$$
N_s=\operatorname{normalize}(xT+yB+zN_g)
$$

$N_s$ 是供着色使用的细节法线。当前强度为 1；横向分量使用 $r\times a$，因此不能因为纹理采用某种压缩格式就忽略 alpha。平方根中的限制则保证重建量不会因为横向长度略大于一而落入负数。

材质遮罩也不直接等同于常见的“遮蔽、粗糙度、金属度”三通道约定。当前一项取绿色分量的反值并限制到 0.99，另一项从红色分量经独立强度得到；湿润处理还会继续修改它们。这里保留运算职责，不给未经确认的通道强行命名。

#### 湿润从世界环境进入材质

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/zzz/wetness-noise.png"><img src="/images/rendering-analysis/zzz/wetness-noise.png" alt="湿润噪声输入" loading="lazy" width="512" height="512"></a><figcaption>湿润噪声输入</figcaption></figure>
<figure><a href="/images/rendering-analysis/zzz/environment-height.png"><img src="/images/rendering-analysis/zzz/environment-height.png" alt="场景高度输入的单通道预览" loading="lazy" width="512" height="515"></a><figcaption>场景高度输入的单通道预览</figcaption></figure>
</div>

噪声提供局部变化，高度提供环境条件。它们是该材质实际读取的输入，不是湿润前后对照；哪片表面受到多少影响，还由位置、方向与参数共同决定。

湿润量的来源包括世界水平位置上的噪声、环境高度图的比较结果、当前位置高度和表面朝上程度。它不只存在于物体自己的 UV 贴图中，所以两处使用同一材质的表面也可能收到不同影响。

当前程序用这份影响改变颜色与表面响应；强度较大时，还把切线空间法线拉向 $(0,0,1)$，削弱细节起伏。可以把它理解为同时改变“表面是什么色”和“微小凹凸怎样受光”。

这是已确认的计算路径。现有图组没有单独关闭湿润，因此不把最终地面亮度的全部变化归给这一项。

<span id="decals"></span>

### 墙面标识与贴花

大厅右侧的标语并不完全来自建筑底色图集。本帧还有一条贴花绘制：读取当前相机深度，把已可见表面的位置恢复出来，再投影到贴花自身的局部空间，为墙面补入颜色、材质控制与方向。

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/zzz/decal-before-detail.png"><img src="/images/rendering-analysis/zzz/decal-before-detail.png" alt="贴花写入前：右侧墙面的材质颜色。" loading="lazy" width="700" height="529"></a><figcaption>贴花写入前：右侧墙面的材质颜色。</figcaption></figure>
<figure><a href="/images/rendering-analysis/zzz/decal-after-detail.png"><img src="/images/rendering-analysis/zzz/decal-after-detail.png" alt="贴花写入后：“坚毅勇敢”标语进入材质颜色。" loading="lazy" width="700" height="529"></a><figcaption>贴花写入后：“坚毅勇敢”标语进入材质颜色。</figcaption></figure>
</div>

两图取同一材质颜色目标、同一区域，分别停在贴花绘制前后。观察“坚毅勇敢”标语；此时尚未进行完整场景照明，不能把这两张材质图当作最终发光效果。

#### 从深度找到接收表面，再限制投影范围

程序由屏幕坐标和深度恢复空间位置，先排除朝向条件不符合的表面，再使用贴花实例变换得到局部坐标。只有三个坐标分量都落在零到一内部，像素才继续执行。随后选择投影平面，应用旋转、缩放、平移及纹理坐标变换，查询标语颜色与法线。

因此，贴花可以覆盖已有墙面而无需把字样烘进整张建筑图集；深度恢复和局部范围限制则约束它实际落到哪里。当前程序还保留湿润相关调节，贴花方向与配色会继续服从相应材质条件。

#### 颜色和方向各自使用覆盖权重

这条路径向材质颜色、材质扩展和法线输出写入数据。颜色与法线输出都已乘各自覆盖量，后续采用源因子一、目标因子一减源 alpha 的混合：

$$
C_{new}=\alpha C_{decal}+(1-\alpha)C_{old}
$$

这里写的是预乘输出与混合状态合起来的结果。法线目标使用自己的方向覆盖量，不能假定它与颜色 alpha 完全相同；已有 HDR 照明也没有被这条像素程序当作新的颜色输出。贴花首先修改待照明的表面，之后才由光照消费者解释这些数据。

<span id="lights"></span>

<span id="灯光列表先筛屏幕区域再筛深度体积"></span>

### 大厅照明：烘焙漫反射与实时受光

大厅的亮暗由多项照明共同形成。本节先拆开漫反射与高光的贡献，再说明烘焙输入怎样解码、局部光怎样筛选，最后用逐项关闭回放检查实际影响。环境反射的取样过程见[反射效果](#reflections)，遮挡的合成位置见[阴影与接触遮蔽](#shadows)。

<span id="baked-and-listed-lighting"></span>

#### 烘焙和运行时求值，分别贡献哪一项光照

对本帧大厅普通 PBR 表面，已经能沿实际计算明确分工：**烘焙图提供预计算的漫反射照明；主光和局部光在运行时计算直接漫反射与直接镜面高光；环境探针提供环境镜面反射。** 场景还有空间环境照明的补充查询，它同样接入漫反射侧。蕾米脸部等专用着色分支在后文单独讨论。

| 照明分项 | 主要来源 | 运行时怎样形成该项 |
|---|---|---|
| 预计算漫反射照明 | 大厅烘焙光图集 | 解码、做法线修正，再与漫反射颜色及环境反射能量分配组合 |
| 空间环境漫反射补充 | 当前绑定的空间照明数据与环境参数 | 按位置、方向和分支求值，接入环境漫反射照明量 |
| 运行时直接漫反射 | 主方向光、列表中的局部光 | 按当前表面位置与法线求受光，乘光色、距离／方向衰减及相应阴影 |
| 运行时直接镜面高光 | 主方向光、列表中的局部光 | 用法线、观察方向、光向、粗糙度和反射率计算镜面响应，再乘该光的可见性与强度 |
| 环境镜面反射 | 局部反射探针 | 按反射方向和粗糙度采样环境颜色，再乘环境 BRDF 权重 |

按这些职责，可以把进入后续遮蔽、雾和显示处理之前的表面颜色概括为：

$$
C=C_{\mathrm{diff,pre}}+C_{\mathrm{diff,spatial}}
 +C_{\mathrm{diff,direct}}+C_{\mathrm{spec,direct}}
 +C_{\mathrm{spec,env}}+C_{\mathrm{emission}}
$$

这些是颜色的贡献分项。具体像素还受材质分类、各光源参数与后续合成控制；本节下面沿当前程序说明其中怎样相乘、相加。

##### 烘焙值最终乘的是漫反射颜色

场景材质先把烘焙 RGB 解码，保存在已有照明目标。大厅的后续照明程序读取这份结果，接入相应空间环境补充与调节后，才乘表面材质响应。

记基础色为 $C_b$、当前路径的金属度为 $m$，漫反射颜色与基础镜面反射率分别为：

$$
C_d=(1-m)C_b,\qquad F_0=(1-m)\,0.04+mC_b
$$

程序根据法线 $N$ 与观察方向 $V$ 的夹角，以及材质粗糙度查询二维 BRDF 表。当前路径先由平滑度求 $p=\operatorname{clamp}(1-\mathrm{smoothness},0.045,1)$，再以 $\sqrt{\max(N\cdot V,10^{-4})}$ 和 $p$ 定位表中的数据。若查得两个分量为 $A,B$，用于环境反射的 RGB 权重为：

$$
F_{env}=A+(B-A)F_0
$$

对当前普通表面路径，经过空间环境查询及运行时调节的照明量记为 $\widetilde E$，其漫反射贡献采用：

$$
C_{\mathrm{diff,environment}}
=\widetilde E\,C_d\,(1-F_{env})
$$

烘焙值就在 $\widetilde E$ 的输入中。这里既乘了漫反射颜色，又扣除了对应环境镜面权重；因此可以确认它在着色端承担漫反射照明。金属度趋近一时，$C_d$ 趋近零，这条烘焙漫反射贡献随之减弱，金属外观主要由其他镜面分项建立。

这里确认的是**烘焙结果被如何使用**。图集生成时是否同时烘入部分直接漫反射和多次反射，消费端没有保留可将二者拆开的来源标签。因此可以明确写“预计算漫反射照明”，但还不能进一步把其中每一块亮度都归为纯间接光，或归到某一盏运行时光源。

##### 局部光的直接漫反射和高光有各自的权重

局部光循环里先计算镜面响应，再加上独立的漫反射项，随后共同乘光色、衰减、受光方向和阴影。将各自参数记为漫反射权重 $d_i$、镜面权重 $s_i$，可整理为：

$$
C_{local}=\sum_i I_i\,K_i
\left[d_i C_d+s_i f_{spec}(N,V,\ell_i,\alpha,F_0)\right]
$$

这里 $I_i$ 是光色，$\ell_i$ 是表面指向该光的单位方向，$\alpha=p^2$ 是镜面计算使用的粗糙度参数；$K_i$ 汇总该光的距离、方向、阴影及经过控制的法线受光项。这个整理式突出两条材质响应的组合位置，具体衰减和可见性仍由当前光源参数控制。

这份镜面计算包含法线分布、遮蔽可见性、Fresnel 型反射率以及相应补偿；漫反射颜色独立加到镜面结果上。两项可以分别调节，光源位置固定也仍然可以在运行时求值。

重新读取这帧进入屏幕候选列表的 22 个局部光记录，得到：

| 参数 | 当前候选记录中的取值 |
|---|---|
| 漫反射权重 | 22 项全部为 1 |
| 镜面权重 | 18 项为 1，1 项为 0.5，3 项为 0 |

这直接说明本帧并非“烘焙包办漫反射，局部光只补高光”。局部光的直接漫反射确实启用，部分光反而关闭了镜面贡献。候选记录数也不代表每个像素都被这些光照到，具体贡献仍由列表和逐像素条件筛选。

主方向光另有自己的着色与阴影路径，也会形成直接漫反射和镜面响应；它不需要通过这个局部候选列表查找。

#### 烘焙光为什么不能作为普通颜色直接使用

<div class="rendering-figures">
<figure><a href="/scene-capture-comparison/figures/replay/zzz-material-lighting.png"><img src="/scene-capture-comparison/figures/replay/zzz-material-lighting.png" alt="材质阶段：已有光照量" loading="lazy" width="640" height="520"></a><figcaption>材质阶段：已有光照量</figcaption></figure>
<figure><a href="/scene-capture-comparison/figures/replay/zzz-material-colour.png"><img src="/scene-capture-comparison/figures/replay/zzz-material-colour.png" alt="同一阶段：表面颜色" loading="lazy" width="640" height="520"></a><figcaption>同一阶段：表面颜色</figcaption></figure>
<figure><a href="/scene-capture-comparison/figures/replay/zzz-scene-final.png"><img src="/scene-capture-comparison/figures/replay/zzz-scene-final.png" alt="后续处理完成后的大厅局部" loading="lazy" width="640" height="519"></a><figcaption>后续处理完成后的大厅局部</figcaption></figure>
</div>

观察 HIA 浮雕、墙板凹处与吧台面。前两张是同阶段的不同输出：一张已有明暗，一张保留配色分区。第三张包含后续照明与显示处理，用于定位大厅的最终外观。这组三图对应的是场景局部；本节烘焙解码公式来自前一节的代表通风口材质，不能将该公式无条件推广到图中每一种墙板和设备。

![大厅的压缩烘焙光图集预览](/images/rendering-analysis/zzz/baked-light-atlas.png)

图中可见许多按模型表面展开的区域，部分区域已经包含明暗。它是空间表面的图集，没有主相机透视；每个实例通过自己的第二套 UV 选择其中区域。预览显示的是压缩存储值，着色前还需要下面的解码。


压缩贴图的某个颜色分量记为 $u$。先限制上界，再恢复 HDR 光照：

$$
u'=\min(u,0.9961),\qquad L_b=\frac{0.5u'}{1-u'}
$$

| 存储值 | 解码后的光照 | 说明 |
|---:|---:|---|
| 0.2 | 0.125 | 较暗的光照 |
| 0.5 | 0.5 | 中间范围 |
| 0.9 | 4.5 | 接近存储上端可表达很亮的光照 |

这是公式算例。它展示了一个有限存储区间如何覆盖较大的亮度范围；直接把 0.9 当作显示颜色，会完全丢失 4.5 所代表的强度。

程序还按细节法线与几何法线的一致程度修正烘焙结果：

$$
k_N=0.3+0.7\operatorname{saturate}
\bigl(N_s\cdot\operatorname{normalize}(N_g)\bigr)
$$
$$
L_{\text{out}}=k_N(L_b+aL_{\text{sky}})I
$$

其中 $a$ 是同一贴图的附加分量，$L_{\text{sky}}$ 是天空附加颜色，$I$ 是光照强度。当前 $I=1$，天空附加颜色为零，但贴图的附加数据仍参与其他输出。

当细节方向与几何方向一致时，修正接近 1；夹角很大时，修正最低保留 0.3。它把贴图带来的局部朝向变化接入已有照明，但不是重新求一套完整动态间接光。

#### 局部光查找：屏幕列表与深度体积

列表缩小每个表面需要检查的光源范围，同一套组织也供反射探针查询。筛选之后才执行前面的逐光照明公式。

##### 这帧的两个列表分区，分别被谁读取

继续沿实际消费者核对，可以把此前仅称作“两类数据”的分区具体说明：

- **局部光照消费者**读取格子的起点与数量，再从每项 360 字节的参数表取局部光记录。循环内既有距离／方向相关计算，也有与法线、观察方向和材质参数共同形成的漫反射及镜面响应，结果逐项累加到照明颜色。
- **环境反射消费者**读取另一个分区，从每项 52 字节的参数表取得探针位置、范围、朝向和采样索引；它根据表面法线与观察方向构造反射方向，按材质响应选择采样层级，读取立方体纹理数组并按空间覆盖权重混合。

两种消费者共享格子与索引的组织方式，实际记录和着色算法不同。构建阶段使用的 156 字节候选描述也只是筛选输入，不能把它当成上述任一消费者的完整着色记录。

本帧两类表头各覆盖 79488 个格子。重新读取构建结果，局部光分区有 12414 个非空格子，单格最多 9 项；探针分区有 13819 个非空格子，单格最多 2 项。两个分区都实际产生了候选。格子范围包括没有可见表面的空间，这些数字表示候选分布，不能当成屏幕受光像素数或独立光源总数。

区域列表解决的是候选查找。直接在每个像素遍历全部局部光与探针会重复很多无关计算；先用所在格子缩小范围，之后仍由各自消费者计算具体贡献。


##### 屏幕分区与非均匀深度层

主视图有效尺寸为 3432×1440，屏幕分区为 64×64 像素，向上取整后是 54×23 个区域。每个区域沿深度再分为 64 层，形成三维格子。

这些层不是等距切分。近端 $n=0.03$、远端 $f=5000$、比例 $r=1.1$，层边界可整理为：

$$
z_k=n+(f-n)\frac{r^k-1}{r^{64}-1}
$$

反过来，由深度求层号：

$$
k(z)=\operatorname{clamp}\left(
\left\lfloor\log_r
\left[1+\frac{\max(z-n,0)}{f-n}(r^{64}-1)\right]\right\rfloor,
0,63\right)
$$

近处层薄，远处层厚。在固定层数下，可以给近处可见细节更密的空间划分。这里的距离是引擎世界单位，未换算为米。

##### 候选压紧、排序与精筛

每个工作组有 64 个线程。它们分担输入候选的检查，以工作组宽度为步幅继续遍历后续光源。完整步骤是：

1. 用候选的屏幕包围范围与当前分区做粗筛。
2. 将通过的候选压紧到组内候选数组，容量上限为 128。
3. 补齐排序所需范围，使用双调排序网络按索引整理候选。
4. 把候选起止深度映射到层范围。
5. 对每层继续检查候选体积与格子几何是否相交。
6. 写出分类后的索引列表和每格的数量、起始位置。

按索引排序服务于后面的类型与寻址组织，不表示按亮度挑选最重要灯光。候选数组的容量和最终每类每格的计数容量也不同：后者采用 5 位数量，写入计数限制为 31。

若把每类每格的列表头记为一个 32 位整数，其高 5 位表示数量，低 27 位表示列表起点。消费者先取得列表范围，再从对应类型的参数表读取记录。这里写出这种组织，是为了说明像素怎样找到候选，不是让读者去查内部定位标识。

##### 从工作组到深度层：同一批线程分两次承担任务

<figure class="rendering-diagram"><a href="/images/rendering-analysis/zzz/cluster-dataflow.svg" target="_blank" rel="noopener"><img src="/images/rendering-analysis/zzz/cluster-dataflow.svg" alt="灯光列表的数据流示意：屏幕候选、深度范围、体积精筛与压缩表头" loading="lazy" width="1000" height="1080"></a><figcaption>算法示意 · 点击查看大图</figcaption></figure>

*算法示意图，依据本帧程序重绘；图中的示例索引用于解释寻址。本文的这类示意图与截帧图分别标明，绘图布局不代表引擎内部界面。*

工作组开始时，线程各自检查不同候选。通过屏幕包围范围检查的候选，通过组内原子加取得互不重复的槽位。同步后才能排序：如果某些线程还在写候选，其他线程已经开始交换元素，排序读到的就不是完整集合。

排序长度向上补到二的幂，空槽写入最大的无符号数。交换时使用无符号比较，这些空槽会被放到末端。双调网络让线程按异或关系找到交换伙伴；每轮交换后的同步，是下一轮能读取上轮结果的前提。这里排序的对象是光源索引，程序没有计算“亮度优先级”。

之后，同一个组里的线程改变职责：每个有效线程负责一个深度层。它先只检查各候选的起止层，统计可能需要的索引数量，再向全局索引池申请空间。**申请数量发生在精筛之前**，因此它是容量预留，最终有效数量可以更少。不能用全局计数器的增长量直接表示真正影响格子的光源数。

深度区间也被压紧存储：一个候选的起始层和结束层分别放入两个 8 位字段；两个候选共用一个 32 位整数。虽然字段能容纳 0～255，本帧实际只有 64 层。字段容量与本次启用规模需要分开理解。

##### 体积精筛为什么只适合称为保守剔除

程序分批为候选体积建立六个平面。每批处理四个候选，共享暂存区因此容纳 24 个平面。对某个深度格子，由屏幕分区四角的射线和该层前后深度构成八个角点。

对于平面 $p$，把角点 $X_j$ 代入：

$$
d_{p,j}=n_p\cdot X_j+b_p,\qquad j=0,\ldots,7
$$

如果八个点全部处于这个平面标记的外侧，整个格子可以排除；只要某个平面做到这一点，就不把该候选写入列表。若六个平面均未排除，候选通过。这里不把外侧固定写成世界坐标的正方向，平面法线在构建时已经按体积朝向调整。

这种检查能证明一部分“不相交”，没有额外检查所有可能的分离轴，因此通过检查不等于证明格子内每个像素都受光。后续着色仍要用当前位置计算距离、方向以及光照衰减或探针混合权重。区域列表的职责是减少遍历量，逐像素照明的职责是算贡献。

##### 列表头、类型基址和三种容量不是同一件事

记压缩表头为 $H$，消费端的寻址关系可写成：

$$
n=H\mathbin{\gg}27,\qquad
b=H\mathbin{\&}(2^{27}-1)
$$
$$
\text{record}(i)=\text{records}_{type}[\text{indexPool}[b+i]],
\quad 0\leq i<n
$$

生产端在写索引前，会减去所属类型的基址。局部光与反射探针分别得到表头，第二类列表从第一类实际写入数量之后开始。后续着色已分别确认这两个分区的用途；它们不是点光与聚光这两种局部光形状。

例如表头起点为 100、数量为 3，索引池保存 $[2,5,9]$，局部光消费者就读取局部光参数表的第 2、5、9 项，探针消费者则读取探针参数表。这里使用假设值解释寻址；生产阶段减去的统一候选基址，不需要在这两个独立参数表的消费者中再加回。

| 限制位置 | 当前规则 | 影响 |
|---|---|---|
| 屏幕候选暂存 | 最多保存 128 项 | 超出槽位的候选不进入后续排序 |
| 全局索引空间申请 | 依据深度范围命中的候选数量 | 为精筛结果预留容量，可能留有空余 |
| 每类表头数量 | 最多编码 31 项 | 消费者能遍历的数量被表头限制 |

不能从这些上限推出“本帧一定丢灯”。这需要统计实际候选和各类命中数；也不能把容量溢出的行为描述成按亮度选出最重要光源，本次程序没有这样的排序依据。

##### 世界网格是另一套组织

世界空间还存在一条独立列表路径。它按空间格子组织灯光，用组内前缀和为各线程计算输出位置，再由一个线程一次性申请整组的全局区间。

这条路径使用的列表头计数宽度与屏幕列表不同，筛选时读取局部光参数表。本次继续检查其两个输出的资源使用记录，只找到构建阶段的计算写入，没有找到后续读取。因此，本文确认它在本帧被构建，但不把它列为已证明影响当前大厅颜色的输入。主视图局部光照与探针反射的实际消费者读取的是上面那套屏幕格子列表。

#### 逐项关闭验证：三种贡献都实际影响本帧

下面是同一截帧的受控回放。先将未修改指令重新组装，确认结果与原绘制逐字节一致，再分别清零普通大厅照明路径中的烘焙输入、局部漫反射项、局部镜面项。没有同时关闭其他分项。

<div class="rendering-figures rendering-stages">
<figure><a href="/images/rendering-analysis/zzz/lighting-components-reference.png"><img src="/images/rendering-analysis/zzz/lighting-components-reference.png" alt="原始回放：保留烘焙输入、局部漫反射与局部镜面。作为后三图的共同基准。" loading="lazy" width="1200" height="503"></a><figcaption>原始回放：保留烘焙输入、局部漫反射与局部镜面。作为后三图的共同基准。</figcaption></figure>
<figure><a href="/images/rendering-analysis/zzz/lighting-no-baked-diffuse.png"><img src="/images/rendering-analysis/zzz/lighting-no-baked-diffuse.png" alt="受控回放 · 关闭本路径烘焙 RGB 输入：大厅墙面等区域明显变暗，中央地面仍保留局部光受光。" loading="lazy" width="1200" height="503"></a><figcaption>受控回放 · 关闭本路径烘焙 RGB 输入：大厅墙面等区域明显变暗，中央地面仍保留局部光受光。</figcaption></figure>
<figure><a href="/images/rendering-analysis/zzz/lighting-no-local-diffuse.png"><img src="/images/rendering-analysis/zzz/lighting-no-local-diffuse.png" alt="受控回放 · 关闭局部光漫反射：中央木色地面和座椅周围变暗，烘焙照明与镜面分项仍保留。" loading="lazy" width="1200" height="503"></a><figcaption>受控回放 · 关闭局部光漫反射：中央木色地面和座椅周围变暗，烘焙照明与镜面分项仍保留。</figcaption></figure>
<figure><a href="/images/rendering-analysis/zzz/lighting-no-local-specular.png"><img src="/images/rendering-analysis/zzz/lighting-no-local-specular.png" alt="受控回放 · 关闭局部光镜面：地面等表面的局部高光减弱，主光高光与探针环境反射仍保留。" loading="lazy" width="1200" height="503"></a><figcaption>受控回放 · 关闭局部光镜面：地面等表面的局部高光减弱，主光高光与探针环境反射仍保留。</figcaption></figure>
</div>

四图使用同一相机、同一阶段、固定 0–1 的 HDR 预览范围及相同显示转换，均来自截帧回放。观察点位于主体照明合成完成后，尚未加入全部晚期几何、透明和最终后处理；人物也保留自己的着色路径。

关闭烘焙输入后，场景大范围的漫反射底层发生变化；关闭局部漫反射后，运行时局部受光区域改变；关闭局部镜面后，高光贡献减弱，但主光高光、探针反射和其余照明仍在。图像变化验证的是指定分项在本帧有实际贡献，其最终强弱仍由材质和其他合成项共同决定。

<span id="shadows"></span>

<span id="阴影屏幕遮蔽与胶囊遮蔽怎样分工"></span>

### 投影阴影与接触遮蔽

物体背光处与人物附近的接触暗部使用不同的遮挡输入。光源深度限制直接光，屏幕与胶囊遮蔽补充局部暗部；本节把各自的数据来源和最终调节的颜色分项接起来。

阴影深度从光源方向记录首先遇到的表面。屏幕解析则由相机深度恢复当前可见位置，把该位置投影到光源视角，比较它是否被更近的物体挡住，再把结果转换为当前像素的受光比例。

局部光阴影按子区块放在图集中，主视图相关阴影使用数组等形式。阴影代理可以采用不同于最终可见材质的几何；它负责遮挡关系，不必重复完整材质着色。

角色相关处理还会先写分类，再解析对象级遮挡。分类准备只决定后面的步骤允许影响哪些像素，不等于已经算出阴影强度。

#### 相机深度把屏幕位置重新联系到空间

![当前视图深度预览](/images/rendering-analysis/zzz/screen-depth.png)

这张图从相机视角显示人物、墙面和大厅物件的深度差异。为看清本帧分布，预览范围设置为 0 到 0.02；它仍是投影后的深度编码，图中灰度不能直接读成世界距离。

屏幕解析使用深度和逆投影关系恢复可见位置，再去光源视图查询。相机深度负责“主相机看到了哪块表面”，阴影深度负责“光源能否看到这块表面”，两者需要经过空间变换才能联系起来。

#### 两种局部遮蔽输入

| 路径 | 已知的输入 | 能表达的遮挡信息 |
|---|---|---|
| 屏幕环境遮蔽 | 相机深度、法线、分级深度与历史 | 当前视图中邻近表面形成的局部遮挡 |
| 胶囊遮蔽 | 深度恢复的位置、法线及胶囊线段和半径 | 遮挡物的简化空间形状 |

![胶囊遮蔽结果的单通道预览](/images/rendering-analysis/zzz/capsule-occlusion.png)

结果主要在角色附近形成局部遮挡，其余区域接近未遮蔽值。它不是角色真实阴影的完整最终图，后面还会与其他遮挡和照明一起使用。

胶囊可以理解为线段与半径形成的近似体积。计算当前表面与这些体积的关系，可以补充仅凭可见深度难以表达的近似遮挡。它不是把角色轮廓在屏幕上简单模糊一下。

屏幕遮蔽有半分辨率结果和独立过滤、历史路径；胶囊数据又有自己的几何输入。下面继续展开屏幕链的搜索、积分和历史规则；胶囊与每个骨骼的全部对应仍需单独核对。

<span id="screen-ao-details"></span>

#### 屏幕接触暗部：方向搜索、角度积分与独立历史

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/zzz/screen-ao.png"><img src="/images/rendering-analysis/zzz/screen-ao.png" alt="屏幕遮蔽输出，零到一标尺；暗色表示较强遮蔽。" loading="lazy" width="1200" height="503"></a><figcaption>屏幕遮蔽输出，零到一标尺；暗色表示较强遮蔽。</figcaption></figure>
</div>

这张图是当前全分辨率屏幕遮蔽的真实输出，按零到一显示：墙板接缝、台面与座椅附近出现较暗区域。它与前面的胶囊结果来自不同算法，最终颜色还会受到直接阴影和材质影响。

当前屏幕链分为四步：

| 步骤 | 做什么 | 交给下一步的数据 |
|---|---|---|
| 搜索遮挡边界 | 从深度恢复相邻位置，沿四个方向的正负两侧搜索；当前程序展开了 40 次分级深度采样 | 每方向两侧的角度边界，以半精度成对打包 |
| 结合表面方向积分 | 解包角度，与当前法线一起积分；从邻近样本按相对深度差加权 | 半分辨率遮蔽标量 |
| 稳定遮蔽历史 | 由当前深度及前后变换重投影旧遮蔽，再限制到当前邻域范围 | 新的半分辨率遮蔽历史 |
| 恢复主视图尺寸 | 联合主视图深度、半分辨率深度与法线读取结果 | 3432×1440 的遮蔽输入 |

搜索方向包含像素位置与帧状态引入的扰动。搜索半径也先由空间参数和深度换算到屏幕尺度；该路径将其限制在 5 到 512 的采样像素范围。第一步保存的是遮挡角度，随后才结合表面法线得到遮蔽，不能把打包目标直接作为普通灰度 AO 使用。

这份历史处理有独立于整帧抗锯齿的规则。令当前中心遮蔽为 $A_c$，中心及四个对角样本的最小、最大值为 $A_{min},A_{max}$，重投影旧值为 $A_h$：

$$
A'_h=\operatorname{clamp}(A_h,A_{min}-0.05,A_{max}+0.05)
$$
$$
A_{new}=0.4A_c+0.6A'_h
$$

旧值受到当前邻域的限制，随后以本路径固定的 0.6 权重接入。这解释了为什么屏幕遮蔽先拥有自己的历史，而整帧 HDR 后面还需要另一套历史融合。这里已展开当前搜索与历史规则；各遮挡物对应的胶囊记录仍需另外核对。

#### 阴影和 AO 调节哪些部分

主光和局部光的阴影在各自直接光路径中限制对应光源的贡献。后面的合成还会将已有照明与环境镜面反射组合，应用屏幕及胶囊遮蔽的调节，再处理雾。

这段后续遮蔽对非自发光颜色起作用：程序先从已有颜色中取出独立的自发光项，处理其余照明和反射，再把自发光加回。当前遮蔽强度还受主光遮挡状态调节，并非无条件给整幅最终颜色乘同一个 AO 值。烘焙照明、直接光和环境反射的来源分工，与它们后来共同受到哪些合成操作影响，是两个连续步骤。

<span id="reflections"></span>

### 大厅反射：镜像与环境高光

表面的反射需要与当前观察方向和粗糙度相联系。这份大厅截帧同时准备镜像视图和局部环境探针：前者重绘另一个视点，后者查询并混合已有环境颜色。

<span id="反射与调色具有独立的数据来源"></span>

#### 镜像视点重新绘制可见场景

大厅的平面反射通过镜像视点重新进行几何、深度、照明、透明和颜色处理，得到供主视图使用的离屏颜色。这一步需要另一份可见性判断，不能由“翻转最终截图”代替。

#### 局部探针与镜像输入的区别

场景还读取立方体环境探针。镜像视图提供特定镜面方向下重新生成的场景，探针提供按方向保存的环境颜色。[大厅照明中的列表消费](#lights)已确认，探针路径通过空间权重混合局部立方体采样；它们在全部材质中的选择与混合仍未完整展开。

#### 探针接入的是环境镜面分项

探针消费者先用当前法线和观察方向构造反射方向，根据材质粗糙度选择采样层级，再按空间覆盖权重混合局部立方体纹理。当前结果先保存到半分辨率环境反射颜色中，后续全分辨率合成再乘上[照明分项中定义的](#baked-and-listed-lighting)环境 BRDF 权重：

$$
C_{\mathrm{spec,env}}=L_{probe}\,F_{env}
$$

因此，即使局部光的镜面权重为零，表面仍可能通过探针呈现环境反射；关闭局部光高光也不等于把所有镜面贡献都关掉。探针颜色可以来自预先准备的数据，运行时进行的是当前位置、反射方向、采样层级和材质权重的求值。

<span id="device-display"></span>

### 设备外壳与显示画面

中央设备同时具有受环境照明影响的实体外壳和独立显示内容。实现把表面准备与完整颜色分开提交，又在颜色程序里区分两组材质区域。本节的对象由下面的线框定位；台面前的红色终端、人物和后方招牌各有自己的绘制。

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/zzz/device-colour-geometry.png"><img src="/images/rendering-analysis/zzz/device-colour-geometry.png" alt="后续颜色阶段的线框定位：分析对象仍为中央圆形设备。" loading="lazy" width="1200" height="503"></a><figcaption>后续颜色阶段的线框定位：分析对象仍为中央圆形设备。</figcaption></figure>
</div>

#### 早期建立表面，后续补齐颜色

已核对的前后两阶段复用了相同顶点与索引缓冲，每次提交 4,896 个三角形。早期像素程序读取法线，写出编码后的世界方向，并给颜色与控制目标写入约定值；仅检查这个阶段，会漏掉设备真正使用的颜色资源。

| 阶段 | 读取与计算 | 实际写入 |
|---|---|---|
| 表面准备 | 用网格区域标记选择法线输入，转换为世界方向 | 材质相关目标与法线；这里尚无完整设备颜色 |
| 后续颜色 | 底色、材质控制、法线、烘焙光、局部光、反射探针及显示内容 | 当前 HDR 颜色 |

后续程序声明了附加运动输出，但本次这组绘制只绑定了颜色目标。声明和计算一个输出，不等于本次一定有附件接收它。

#### 外壳的贴图通道怎样参加受光

颜色阶段绑定了两组材质输入：一组底色、法线与控制图均为 2048×2048；另一组底色为 32×32、控制图为 128×128，并使用默认法线。由几何传入的区域标记在两组之间选择，不能把小尺寸输入当成大图的某一级缩略图。

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/zzz/device-base.png"><img src="/images/rendering-analysis/zzz/device-base.png" alt="设备的 2K 底色图集；图案位置对应模型 UV，不是屏幕最终画面。" loading="lazy" width="768" height="768"></a><figcaption>设备的 2K 底色图集；图案位置对应模型 UV，不是屏幕最终画面。</figcaption></figure>
</div>

控制图 R 调节金属度 $m$，底色 $C$ 随之参与构造法向入射反射率：

$$
F_0=(1-m)\,0.04+mC
$$

G 经材质缩放后控制感知粗糙度：$r=1-(1-G)s_r$，先限制下限为 0.01，进入镜面计算前再限制到 0.045—1。当前两组缩放 $s_r$ 都为一，因此进入该计算的是 $\operatorname{clamp}(G,0.045,1)$；后面还会使用它的平方与四次方。法线输入使用 R、G、A：先由 $x=2RA-1$、$y=2G-1$ 恢复两个分量，再令 $z=\sqrt{1-\min(1,x^2+y^2)}$，最后通过网格方向基转换并归一化。

在另一材质区域，控制图 B 还可以调节随底色生成的自发光。当前该开关开启，发光色乘数为白色，因此这一路为 $E=B_{control}C$；它与后面的显示图集分支分开。法线图 B 与控制图 B 是不同输入，也不能因通道字母相同而混用。

这组材质仍接入烘焙漫反射、运行时局部光与探针镜面反射。显示内容是另一路颜色贡献，不能用屏幕的亮暗替代外壳的金属、粗糙度和受光计算。两类照明的职责见[烘焙光与运行时求值](#baked-and-listed-lighting)。

#### 显示内容来自图集内的一个矩形

显示分支读取一张 1024×1024 的序列图集。下面分别展示完整图集和本帧参数选中的图块；它们都是实际绑定纹理的预览，图块为方便阅读放大。

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/zzz/device-sequence-atlas.png"><img src="/images/rendering-analysis/zzz/device-sequence-atlas.png" alt="实际显示序列图集，原尺寸 1024×1024。" loading="lazy" width="768" height="768"></a><figcaption>实际显示序列图集，原尺寸 1024×1024。</figcaption></figure>
<figure><a href="/images/rendering-analysis/zzz/device-sequence-patch.png"><img src="/images/rendering-analysis/zzz/device-sequence-patch.png" alt="本帧 UV 参数选择的 150×94 图块，放大预览。" loading="lazy" width="600" height="376"></a><figcaption>本帧 UV 参数选择的 150×94 图块，放大预览。</figcaption></figure>
</div>

本帧采用的 UV 变换是：

$$
uv_{display}=uv\odot(0.146484375,0.091796875)
 +(0.5859375,0.08203125)
$$

乘图集尺寸，可得到源图坐标中的矩形：起点约 $(600,84)$，宽 150、高 94。上图显示时处理了图像纵向方向，公式仍保留 shader 使用的 UV 约定。

取样后先乘显示颜色，再按图块 alpha 组织覆盖。当前颜色乘数为白色，色相／饱和度／明度的额外偏移均为零，对比度缩放为一；第二显示层绑定黑色默认输入，不提供额外 RGB。程序支持更多图层混合和颜色调整，但当前参数并未启用那些变化。

从一帧可以确认“本次选了哪块内容”，不能据此确定动画帧率、图块更新周期，或断言它是视频解码。这里显示的是 shader 对现有图集的读取。

#### 显示贡献与目标 alpha 的含义

材质参数可以控制显示贡献在局部颜色变换之前或之后加入。当前选择后加；整条颜色输出的 alpha 固定为零。此绘制的 RGB 混合因子为“源一、背景乘源 alpha”，因此在通过深度测试的像素上：

$$
C_{new}=C_{device}+0\,C_{old}=C_{device}
$$

输出 alpha 为零在这里表示不保留旧背景颜色，不能解释成设备完全透明。显示发光、实体受光和材质内的空气处理已在源 RGB 中组织好，再交给后续场景颜色与泛光处理。

<span id="atmosphere"></span>

### 大厅雾与空气合成

大厅局部雾先在 1920×805 的浮点颜色目标中生成，再作独立历史过滤，最后加到场景 HDR。本帧既有在局部盒体内沿视线取样的体积路径，也有直接画在面片上的柔和颜色层。二者服务局部空气与亮部层次，生成方式和混合规则各不相同。

<figure class="rendering-diagram"><a href="/images/rendering-analysis/zzz/local-fog-flow.svg" target="_blank" rel="noopener"><img src="/images/rendering-analysis/zzz/local-fog-flow.svg" alt="大厅局部雾：两种生成方式，共用颜色历史" loading="lazy" width="1120" height="694"></a><figcaption>算法示意 · 点击查看大图</figcaption></figure>

#### 盒体限定空气范围，深度限定可见长度

体积路径用盒体几何限定屏幕覆盖。像素程序把相机和视线变换到局部空间，求与盒子的交点；再读取场景深度，将积分终点限制在可见表面之前。深度查询包含四组 Gather，共 16 个深度值，从中取得约束，避免粗分辨率雾直接穿过前景物体。

没有有效视线区间就返回零。存在区间时，步长为：

$$
h=\max(0.01,0.25s)+\frac{\max(0,\ell)}{64}
$$

其中 $\ell$ 是截断后的视线区间长度，$s$ 为局部体积的步长参数。本帧两个代表体积的 $s$ 分别为 5 和 0.5，对应固定步长部分 1.25 和 0.125；长区间再增加 $\ell/64$。这不是固定走 64 次：程序另将遍历区间限制在至多 100 个步长，并允许提前结束。

起点加入随屏幕位置和帧状态变化的抖动，使相邻像素不总在同一组平面取样。后面的历史融合负责稳定这些取样差异。

#### 空气受光使用方向权重和阴影比较

这条代表路径用主光颜色、局部体积颜色和以下方向项形成散射颜色 $I$：

$$
I=C_{light}\odot C_{volume}
\left[1+g\max(\hat v\cdot\hat l,0)^2\right]
$$

$\hat v$ 为当前视线方向，$\hat l$ 为程序中的光方向。当前两组 $g$ 为 0.1 和 1.1。这是该 shader 的方向性调制；没有把它替换为另一种常见散射相函数。

沿线样本根据覆盖范围选择阴影层，再作深度比较，得到受光比例 $S$。单步衰减系数和状态更新为：

$$
q=2^{-0.144269511\rho h}=e^{-0.1\rho h}
$$
$$
L_{next}=L+T\,S\,I(1-q),\qquad T_{next}=Tq
$$

初始 $L=0,T=1$；当前两组密度参数 $\rho$ 为 0.125 和 0.0875。**这里的状态更新只在 $S>0.01$ 时执行。** 阴影较深的样本同时跳过这次颜色和 $T$ 更新，因此应按这一具体控制解释结果，不能把它写成对所有介质段都计算消光的完整物理模型。$T<0.05$ 时可提前退出。

体积输出 alpha 为 $\max(T,a_{min})$，两组下限分别为 0.1 和 0.35；当前 RGB 混合为“源 alpha、背景一”。于是加入局部雾颜色目标的是 $\max(T,a_{min})L$。这个目标采用 R11G11B10 浮点格式，只保存 RGB，未把 $T$ 作为第四通道留给最后合成。

#### 面片路径用径向衰减补充局部颜色

另两次局部绘制使用平面，当前选择的权重形式为：

$$
w=0.15\,[\operatorname{saturate}(1-ar^2)]^2
\operatorname{saturate}(z_{scene}-z_{plane})
\min\left[\left(\frac{d_{camera}}4\right)^2,1\right]
$$

$r$ 来自面片的局部径向坐标，深度差在恢复后的深度空间比较，当前交界偏移为零。两组 $a$ 为 0.16 和约 0.08163，对应局部径向支持范围 2.5 和 3.5。最后一项让靠近相机的面片平缓消失。

这条路径输出 $(wC,w)$，以“源一、背景一减源 alpha”混合，故 $F_{new}=wC+(1-w)F_{old}$。它没有执行前面的盒内多步积分。把两条路径一并叫作体积光，会掩盖它们在空间覆盖、深度交界和颜色组合上的差别。

#### 独立历史只稳定雾颜色

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/zzz/fog-current-detail.png"><img src="/images/rendering-analysis/zzz/fog-current-detail.png" alt="局部盒体与面片绘制后的雾颜色，HDR 预览范围 0—0.03。" loading="lazy" width="1200" height="503"></a><figcaption>局部盒体与面片绘制后的雾颜色，HDR 预览范围 0—0.03。</figcaption></figure>
<figure><a href="/images/rendering-analysis/zzz/fog-resolved-detail.png"><img src="/images/rendering-analysis/zzz/fog-resolved-detail.png" alt="重投影与三点范围约束后的雾颜色，相同预览范围。" loading="lazy" width="1200" height="503"></a><figcaption>重投影与三点范围约束后的雾颜色，相同预览范围。</figcaption></figure>
</div>

两图分别为局部绘制后的雾和历史过滤结果，均使用零到 0.03 的 HDR 预览范围，使较弱的冷色斜向分布可读；高于范围的部分会截亮。黑色表示该颜色目标中贡献较小，图里的明暗不表示几何深度。

过滤阶段使用深度重建位置，投影到旧视图后读取历史雾 $H$。当前邻域由中心及偏移 $(-1,-1)$、$(1,1)$ 的两个样本组成，按通道求最小／最大值，将历史夹在其中：

$$
F_{new}=0.2F_{current}+0.8\operatorname{clamp}(H,F_{min},F_{max})
$$

这是三点颜色范围约束，没有使用整幅画面的身份通道，也没有使用当前 3×3 的均值和方差。雾历史先完成自己的稳定，再进入后面的整帧历史流程。

#### 最后合成的是加色雾

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/zzz/fog-composite-before.png"><img src="/images/rendering-analysis/zzz/fog-composite-before.png" alt="局部雾全屏合成之前，HDR 预览范围 0—1。" loading="lazy" width="1200" height="503"></a><figcaption>局部雾全屏合成之前，HDR 预览范围 0—1。</figcaption></figure>
<figure><a href="/images/rendering-analysis/zzz/fog-composite-after.png"><img src="/images/rendering-analysis/zzz/fog-composite-after.png" alt="局部雾全屏加色之后，相同预览范围。" loading="lazy" width="1200" height="503"></a><figcaption>局部雾全屏加色之后，相同预览范围。</figcaption></figure>
</div>

这组图取雾全屏合成的紧邻前后，固定零到一 HDR 预览。局部亮部与右侧空气颜色发生变化；大厅整体受光已经在此前形成。

该次全屏绘制的 RGB 混合为“源一、背景一”，因此：

$$
C_{out}=C_{scene}+F_{filtered}
$$

前面体积循环中的 $T$ 用于生成局部雾贡献，没有在这一步再次乘场景颜色。大厅其他材质仍可有自己的距离／高度空气项；本节核实的是这条独立屏幕雾链，不能据此概括所有空气处理都只有加色。

<span id="light-shafts"></span>

### 屏幕光束：存在执行，本帧没有可见贡献

大厅流程包含一条屏幕光束链。它先从场景颜色附近取四个样本，结合相机深度与阈值生成二值遮挡图，再沿屏幕中的光源中心到当前像素的连线采样，形成径向扩散结果。

当前阈值为 0.5；径向采样数量为 128，程序上限同样是 128。采样位置可概括为：

$$
u_k=c+(u-c)\left(1-\frac{k}{n-1}+0.025\xi\right)
$$

$c$ 为光源的屏幕位置，$u$ 为当前像素，$\xi$ 为由像素坐标生成的扰动。结果还经过长宽比修正的径向衰减、屏幕边界淡出、光束颜色和强度调节。它以屏幕遮挡图为输入，与前面查询空气介质的雾路径分别理解。

**本帧的遮挡图与光束结果，原始 RGB 数据均全为零。** 因而可以说明算法与实际执行顺序，却不能把大厅的灯带、墙面亮度或后面的泛光归为这条光束的可见贡献。此处保留明确的当前状态，避免用一张全黑图充当光束效果示例。

<span id="character-shape"></span>

### 人物形变与翼部轮廓

角色姿态改变时，位置与表面方向需要一起更新；翼部还根据观察尺度细分几何。形态累加负责改变已有顶点，细分负责补充轮廓与表面几何，二者的结果继续供可见绘制、阴影和镜像使用。

<span id="character-geometry"></span>

<span id="蕾米几何稀疏形态增量与方向数据一起更新"></span>

#### 形态混合：同时更新位置与方向

形态混合的输入只保存受到影响的顶点。每条记录包含目标位置以及位置、法线、切线三组增量；一条记录为 40 字节。这个布局使工作量由受影响顶点数决定，而不需要为每个目标重新遍历整张网格。

用一个形态目标表示，更新为：

$$
P'=P+w\Delta P,\quad N'=N+w\Delta N,\quad T'=T+w\Delta T
$$

$w$ 为当前权重，三组增量分别对应形状与方向。改变位置后同步改变方向，是为了让后续着色能够跟随变形，而不是在新轮廓上继续使用旧受光方向。

~~~text
为受影响顶点分配工作
    → 读取目标顶点的已有值
    → 按形态权重累加位置、法线与切线增量
    → 将更新后的顶点交给后续几何处理
~~~

这段计算本身没有在累加后归一化方向，也没有原子浮点累加。因此存在两个明确依赖：输出必须先拥有基础值；可能同时改同一顶点的任务必须由数据组织或执行顺序避免写入冲突。不能把顺序形态调用任意并成一个同时写的任务。

可见绘制、阴影和镜像都需要与当前形状一致。不同视图不一定使用完全相同的材质，但不能随意混用不同时间点的角色几何。

<span id="wing-subdivision"></span>

<span id="翼部细分屏幕尺度边规则与新三角形"></span>

#### 翼部细分：由观察尺度控制新增几何

翼部计算实际生成新顶点与连接关系，职责分为细分强度、边位置和索引生成。输入顶点与输出顶点的布局不同：前者为 40 字节，后者为 48 字节，后续读取必须使用新的布局。

##### 由距离和投影尺度决定细分强度

把顶点到参考位置的距离记为 $d$，几何尺度为 $g$，投影比例为 $p$：

$$
s_{\text{screen}}=\frac{g}{d}p
$$
$$
w_d=\operatorname{saturate}\bigl((s_{\text{screen}}-s_0)k\bigr)
$$
$$
w_{\text{split}}=\min\left(\frac{q}{63},\,w_d b\right)
$$

$q$ 为预存的 6 位强度，$b$ 是分支倍率。代表调用中 $p$ 约为 1978.18，起始阈值 $s_0$ 约为 0.7，过渡斜率 $k$ 约为 5，分支倍率可取 1 或 3。

距离增大，屏幕尺度下降，细分强度便可能减小；预存强度又为每条边保留上限。这个控制直接联系当前观察尺度，区别于把网格始终保留成固定高密度。

##### 中点、平滑候选与方向约束

对一条边，端点记为 $A,B$，两侧相邻三角形的对面点记为 $C,D$。中点和平滑候选为：

$$
M=\frac{A+B}{2},\qquad
Q=\frac38(A+B)+\frac18(C+D)
$$

完整邻接条件下，第二式与 Loop 边规则一致。程序根据边强度在 $M$ 与 $Q$ 之间插值。缺少邻接或条件不同的边，不应机械套用同一平滑规则。

一条受控制标记影响的分支还把 $Q-M$ 投影到指定方向，再加回中点。它约束新点允许移动的方向，因此“标准 Loop 细分”不足以描述整个过程。

##### 新三角形怎样分配输出空间

原三角形根据需要拆分的边数，生成一到四个三角形。额外索引数等于拆边数乘三。

每组 64 个线程先汇总组内额外索引数，由一个线程向全局计数器申请整组连续区间，再由各线程按组内偏移写入。这样避免每个线程都单独申请全局空间；同步点保证计数与写入顺序一致。

这说明几何拓扑可由 GPU 动态产生，但当前尚未完整还原所有间接绘制参数的生成，不能把这一步扩大成对整个场景提交架构的判断。

##### 索引生成的两级分配与同步

<figure class="rendering-diagram"><a href="/images/rendering-analysis/zzz/subdivision-allocation.svg" target="_blank" rel="noopener"><img src="/images/rendering-analysis/zzz/subdivision-allocation.svg" alt="翼部细分示意：边拆分改变三角形数量，组内申请与全局申请分别分配索引区间" loading="lazy" width="1000" height="880"></a><figcaption>算法示意 · 点击查看大图</figcaption></figure>

*拓扑与内存分配示意。上半图显示典型连接关系，下半图使用假设计数；不表示当前帧每个三角形的实际拆分次数。*

是否拆边并非只看浮点值是否非零：索引生成程序用 $w_{\text{split}}>0.001$ 判断三条边。记通过的边数为 $k$，生成三角形数为 $1+k$。原三角形对应的三个索引槽继续用于第一个输出三角形，其他三角形才进入追加区域：

$$
N_{\text{tri}}=1+k,\qquad
N_{\text{append}}=3k,\qquad k\in\{0,1,2,3\}
$$

因此，不拆边时无需申请追加空间；三条边都拆分时，原三个槽位外再申请九个索引。新点的位置已经由边处理阶段写好，这一阶段主要读取新点索引并组合连接关系，不能把“产生顶点”和“产生索引”合并成一次无依赖的写入。

实际分配过程可整理为：

~~~text
组内计数清零 → 全组同步
有效线程：localOffset = 原子增加组内计数(3 × 拆边数)
全组同步
一个线程：groupBase = 原子增加全局计数(组内总数)
全组同步
有效线程：写原有三个槽；追加部分从 groupBase + localOffset 开始
~~~

这里的组内偏移来自原子加的返回值，并非按三角形编号固定排序的前缀和。假设四个任务依次取得 $[0,3,9,6]$ 个追加索引，可以得到总数 18，以及互不重叠的四段空间；并行到达顺序不同，各段在缓冲中的排列也可以不同，只要每段和对应三角形的写入一致即可。

尾部工作组可能有不足 64 个有效任务。程序让无效线程也越过前面的同步点，然后才退出。若改成一进入就返回，其他有效线程可能无法完成组同步。由此可见，拓扑逻辑之外，执行顺序也是这个算法的一部分。

在资源层面，边权重、新点数据、新点索引、最终三角形索引形成前后相连的读写链。主视图、镜像和阴影消费生成结果之前，都必须等到相应写入完成。截帧能证明这些阶段的读写依赖，但单凭这一段仍不能还原 CPU 怎样调度所有间接绘制参数。

<span id="wing-shading"></span>

### 翼部花纹与背向受光

前面的细分解释翼部轮廓怎样生成，翼部像素材质还有一条独立的花纹与背向受光调制。本次绘制绑定翼部底色、法线、材质控制、辅助控制，以及专门的三通道花纹输入；这些参数随后进入角色自己的受光与调色。

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/zzz/wing-material-geometry.png"><img src="/images/rendering-analysis/zzz/wing-material-geometry.png" alt="翼部材质的实际几何范围；黄色线框为回放辅助显示。" loading="lazy" width="650" height="850"></a><figcaption>翼部材质的实际几何范围；黄色线框为回放辅助显示。</figcaption></figure>
</div>

黄色线框标出这条翼部材质真正覆盖的左右垂落翼片。底图停留在人物材质阶段，脸部与场景尚未完成，不能把背景黑色或未完成的脸当作最终效果。

#### 花纹控制的是受光形状与指数颜色调制

把花纹三个分量记为 $T_R,T_G,T_B$，材质此前算出的表面色记为 $C$，背向受光项记为 $q$。当前程序中的两组关键关系为：

$$
q=\operatorname{saturate}(-L\cdot N_t),\qquad
g=10T_G q^{30T_B}
$$
$$
a=\exp[-10T_R(1-C)]
$$

$L$ 与 $N_t$ 是当前程序用于这一分支的光向和调整后的表面方向。蓝色分量改变背向响应的集中程度，绿色控制其强度，红色控制按颜色分量计算的指数调制。程序再结合已有阴影权重，以形如 $1+g\,a\,k_{shadow}$ 的倍率调节先前照明，之后继续角色明暗、边缘色和最终调色。

它在背光关系下改变翼片的颜色与亮度，但没有读取后方场景颜色来折射背景。也不能仅由这一条经验响应把翼片解释为求解了真实厚度与多次散射的介质。本帧可确认的是花纹采样和这条受光调制确实在翼部着色程序中连接起来；它的单独视觉增益尚未做关闭对照。

<span id="character-material-routing"></span>

<span id="头发材质区域表细节法线与实体光照怎样汇合"></span>

### 头发的分区明暗与高光

发束的颜色、亮暗分区和高光由控制纹理与区域参数共同组织。本节按区域选择、细节方向、正反面采样和实体受光展开，说明同一份头发资源怎样形成不同的材质响应。

人物资源表中的 D、N、M、A 四组输入，在像素程序中分别进入颜色、方向与控制计算。下面以已经完成语义还原的头发路径为例，把贴图接到具体运算，而不是只根据文件名解释它们。

#### M 图的红色通道选择五套区域参数

程序读取 M 图后，将分量重排为 B、R、G。随后拿原始 R 与 0.2、0.4、0.6、0.8 比较，按区间选择漫反射颜色、阴影权重、高光颜色、边缘光颜色及若干响应参数。

| 原始 M.R 范围 | 选择的区域 | 随区域切换的内容 |
|---|---|---|
| 小于 0.2 | 最低区间 | 一组颜色、阴影与高光参数 |
| 0.2 到 0.4 | 第二个区间 | 另一组完整参数 |
| 0.4 到 0.6 | 中间区间 | 可使用不同的高光宽度与分支 |
| 0.6 到 0.8 | 第四个区间 | 独立的漫反射、高光和边缘色 |
| 不小于 0.8 | 最高区间 | 默认高区间参数 |

本次头发 M.R 的单通道预览整体呈高值，主要落入最高区间。五个区间描述程序可选择的参数组；它不意味着当前这组头发同时使用了五种区域。可结合前面资源表中的头发 M 图查看，图中的蓝色变化属于另一个控制分量。

因此，红色分量首先承担离散区域选择。一个图集里的两块区域即使底色相近，也可以因落在不同区间而使用不同的高光和阴影设计。把这个通道按连续金属度解释，会漏掉整组参数切换。

另一个选择量可以写为：

$$
r=\max\bigl(0,4-\lfloor5M_r\rfloor\bigr)
$$

程序将它与当前指定区域比较，再从实体记录中选择相应附加光照项。这里的区域编号是算法内部的分类值，不是人物模型部件的编号。

已确定的其他消费包括：M.G 先乘材质强度，参与表面颜色与照明控制；M.B 进入高光响应；A 图的 B、G 被分别读取，参与边缘光及高光等后续项。每项还受区域参数和开关影响，通道的职责不能脱离当前变体独立套用。

#### 法线重建保留双面与编码偏移

头发法线图的 XY 先按下式恢复：

$$
n_{xy}=s\bigl(2\operatorname{saturate}(N_{tex,xy})-1.004\bigr),
\qquad
n_z=\sqrt{1-\min(n_x^2+n_y^2,1)}
$$

本次 $s=1$。Z 还乘正反面符号，再通过切线、副切线和几何法线组合成世界方向并归一化。1.004 是当前指令中的近似常量；把它随手改为 1，会使平坦输入附近的方向发生小幅变化。

贴图存储的第三个分量没有直接用作上述重建 Z，而是保留给后面的高光分支。一处区域控制会先计算 $\operatorname{saturate}(1.5(2N_{tex,z}-1)-0.5)$，再与半角方向和 M 图的控制量共同形成高光形状。这解释了为什么“把 RGB 全部当作标准切线法线”会丢失材质功能。

#### 正反面可以选不同 UV

底色与方向纹理的坐标选择由正反面、备用坐标和材质开关共同决定。当前头发的备用 UV 开关为零，使用主坐标；另一组身体材质的背面备用 UV 开关为一。两组身体绘制还关闭了面剔除，因此背面确实是需要处理的输入情形。

这里应分别理解两个问题：光栅状态决定背面是否进入像素程序，程序再决定背面用哪套 UV、如何调整方向。只恢复双面显示，仍不足以恢复衣料内侧的颜色和明暗。

#### 实体光照先按距离混合，再参与区域材质

头发路径从实体表选出光源位置、作用范围、颜色和混合控制。表面到该位置的距离为 $d$，范围为 $R$，一项距离控制为：

$$
f=\max(0,1-d^2/R^2),\qquad
C_e=\operatorname{lerp}(C_{fallback},C_{entity},f)
$$

它让实体颜色在范围内逐步接入，而不是在边界处突然开关。后面还读取实体的环境与直接贡献，并根据区域选择使用哪一组。实体记录是角色受光的输入，不能简单等同于场景里所有灯光的逐像素列表。

照明亮度还有独立的压缩。若亮度 $Y$ 超过区间起点 $a$，当前曲线可整理为：

$$
Y'=b-\frac{(b-a)^2}{Y+b-2a};\qquad Y<a\text{ 时保持 }Y
$$

它在起点附近连接原亮度，较大亮度逐渐接近 $b$；程序再由 $Y'/(Y+10^{-4})$ 得到缩放。颜色、区域高光与边缘光随后继续组合。因此控制纹理、高光分区、实体光和亮度压缩是在不同环节发挥作用的。

<span id="face"></span>

<span id="脸部专用颜色阴影与分类共同决定结果"></span>

### 脸部的受光与阴影颜色

脸部需要在专用材质中建立明暗和阴影用色。下面先核对本帧真正影响输出的阴影输入，再展开采样、颜色变换与分类规则，避免把仅被绑定的资源当成实际效果。

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/zzz/face-base-colour.png"><img src="/images/rendering-analysis/zzz/face-base-colour.png" alt="蕾米脸部与眼部的颜色图案" loading="lazy" width="768" height="768"></a><figcaption>蕾米脸部与眼部的颜色图案</figcaption></figure>
<figure><a href="/images/rendering-analysis/zzz/face-light-control.png"><img src="/images/rendering-analysis/zzz/face-light-control.png" alt="脸部光照控制输入的 RGB 预览" loading="lazy" width="512" height="512"></a><figcaption>脸部光照控制输入的 RGB 预览</figcaption></figure>
</div>

脸部图案在 UV 展开中保存皮肤、眼睛等区域，光照控制图则编码另一组数值。其绿色和黄色是通道显示，不能当作脸上实际光源的颜色。

脸部写出的 HDR RGB 已经包括阴影、实体照明与材质调色。它同时写出控制量、法线与运动，供后续整帧处理继续使用。

#### 本帧真正改变人物颜色的是哪一份阴影

角色程序绑定两类深度输入：场景几何生成的环境阴影缓存，以及人物自己写出的专用阴影图。此前在本帧头发、身体和脸部代表绘制中分别取消相应采样贡献，得到不同结果：

| 对原绘制做的替换 | 已确认的结果 |
|---|---|
| 将角色专用阴影的比较采样固定为通过 | 三个代表材质的主 HDR 颜色目标均未发生字节变化 |
| 将环境阴影缓存的比较采样固定为通过 | 三个代表材质的主 HDR 颜色目标均发生变化 |

因此，本帧这些代表材质的可见受光依赖环境缓存；不能因为角色专用深度被绑定，就把当前脸上的暗部解释成它产生的自阴影。该深度仍有其他后续消费者，这个结论只针对所检查的接收路径。

下面的九点比较是程序中已还原的算法。它说明这条输入怎样被计算；当前图像中的实际贡献还要服从上述分支与替换结果。

#### 九点阴影比较具体怎样取样

脸部读取附加阴影深度以及主视图相关的级联阴影。附加路径先沿法线偏移表面，变换到光源空间，再映射到阴影子区域，进行九次比较采样。

以一个纹素为单位，采样位置包括中心、四个对角和四个轴向点：

$$
(0,0),\quad(\pm1,\pm1),\quad
(\pm\sqrt2,0),\quad(0,\pm\sqrt2)
$$

当前附加深度图为 2048×2048，基础纹理偏移是 $1/2048$。通过率约为九个比较结果之和乘 0.1111。每次比较返回的是“该位置是否受遮挡”的过滤结果，不是直接把深度值当作阴影灰度。

沿法线偏移改变实际比较的位置，多点采样使边界形成过渡。通过率之后还会与材质遮蔽、强度和开关组合，不能把这条阴影无条件乘到所有脸部颜色上。

环境缓存路径根据表面到参考中心的距离选择覆盖层，再通过多次比较采样得到受光控制。两份资源在程序中的存在，与本次材质是否实际依赖其结果，需要分别说明；上述替换验证已确认当前环境缓存的贡献。

#### 阴影颜色不是固定色的简单相乘

脸部还包含 HSV 型变换：由颜色最大和最小分量得到明度、饱和度相关量，再调整阴影用色并重建 RGB。这使阴影里的色相与饱和度能够受材质控制，不能只用“底色乘统一阴影色”概括。

程序存在额外叠加贴图分支，但当前代表材质的开关为零。纹理被准备为可用输入，与它在当前分支真正贡献颜色，是两件需要分别确认的事。

#### 分类写入和脸部颜色写入分开

脸部主着色会更新可见深度与角色分类；另一条阴影分类路径只检查已有角色位，再写一个附加状态位，保留颜色和其他分类。眼睛又使用不同的写入方式。

| 路径 | 深度职责 | 颜色与分类职责 |
|---|---|---|
| 脸部主着色 | 测试并更新当前表面 | 写专用颜色、法线和材质数据，建立角色类别 |
| 阴影分类准备 | 测试已有表面，不更新深度 | 只附加局部分类状态 |
| 眼睛绘制 | 测试已有表面，不更新深度 | 合成眼部颜色，按目标分别保留或覆盖数据 |

这张表直接解释为什么三次绘制不能只用同一组混合和写入规则执行。

<span id="eyes"></span>

<span id="眼睛预乘合成与角色颜色查找表"></span>

### 眼睛的颜色层次与合成

眼部颜色在已有脸部上叠加，覆盖边缘和颜色映射会直接影响最终外观。本节从实际前后对照进入预乘混合与角色颜色查找表，说明眼睛怎样接入脸部。

<div class="rendering-figures">
<figure><a href="/scene-capture-comparison/figures/replay/zzz-eye-before.png"><img src="/scene-capture-comparison/figures/replay/zzz-eye-before.png" alt="眼睛颜色合成之前" loading="lazy" width="520" height="468"></a><figcaption>眼睛颜色合成之前</figcaption></figure>
<figure><a href="/scene-capture-comparison/figures/replay/zzz-eye-after.png"><img src="/scene-capture-comparison/figures/replay/zzz-eye-after.png" alt="合成之后：紫色虹膜、瞳孔与亮点" loading="lazy" width="520" height="468"></a><figcaption>合成之后：紫色虹膜、瞳孔与亮点</figcaption></figure>
<figure><a href="/scene-capture-comparison/figures/replay/zzz-face-final.png"><img src="/scene-capture-comparison/figures/replay/zzz-face-final.png" alt="完成后续处理的脸部" loading="lazy" width="520" height="466"></a><figcaption>完成后续处理的脸部</figcaption></figure>
</div>

前两张使用同一区域与相同 HDR 显示设置。变化集中在眼白内部，说明眼睛作为独立颜色贡献接入；第三张另含后续着色与显示处理。

#### 预乘规则为什么必须与输出一致

设眼睛计算出的颜色为 $E$，覆盖率为 $\alpha$，已有脸部颜色为 $B$。程序输出已经乘过覆盖率的 $P=\alpha E$，随后采用：

$$
C=P+(1-\alpha)B
$$

如果后续又把 $P$ 乘一次覆盖率，眼睛贡献就从 $\alpha E$ 变成 $\alpha^2E$。在部分覆盖的边缘，颜色会被重复压低，这直接说明输出形式与混合规则必须配套。

眼睛并不覆盖全部辅助数据：法线与一张材质扩展图保持已有结果，另一张材质控制图直接写本次结果。这种按目标分别控制写入的行为，解释了为何“眼睛增加了颜色”不意味着底层所有表面数据都被重建。

#### 三维颜色表怎样放进二维纹理

![角色颜色查找表的二维条带](/images/rendering-analysis/zzz/character-colour-lut.png)

条带中相邻小块对应颜色立方体的连续切片。它是颜色到颜色的映射，和角色模型的 UV 图集不是同一种组织。


眼睛程序可读取一张 1024×32 的角色颜色查找表。因为 $1024=32\times32$，它可以把一个 32 级颜色立方体的切片横向排开：

- 一个颜色轴决定处于哪两个相邻切片。
- 另外两个轴决定切片内的位置。
- 对相邻切片各采样一次，再按小数部分插值。

进入查找表之前，曝光缩放后的颜色 $C_e$ 还会压缩为：

$$
u=\operatorname{saturate}
\left[
0.0735\log_2(5.555556C_e+0.047996)+0.386036
\right]
$$

这把较宽亮度范围映射到查表域。角色因此能够在进入最终整帧颜色处理之前，使用自己的颜色变换。查表位于条件分支内；是否作用于某个像素仍由当前条件决定。

<span id="outline-geometry"></span>

<span id="描边平滑方向距离宽度与前后帧轮廓"></span>

### 人物描边与轮廓宽度

描边把人物轮廓从背景中勾勒出来。当前实现扩张几何外壳，并用平滑方向、距离和顶点控制调节宽度；前后帧都要计算同样的外壳，才能让轮廓参与后续画面稳定。

角色描边使用扩张几何并剔除正面的方式生成外壳。它与人物主材质共享部分模型输入，但顶点位置、颜色求值和运动都另有计算。

#### 扩张方向来自专门保存的平滑方向

输入的一组双通道数据为 $q=(x,y)$，先恢复：

$$
z=\sqrt{1-\min(x^2+y^2,1)},\qquad
N_{smooth}=xT+yB+zN
$$

$T$、$B$、$N$ 是模型的切线基。这个辅助方向允许描边采用比着色法线更连续的方向，减少硬边处分开的外壳。它在局部切线基中定义平滑方向，Z 由非负平方根恢复。

方向变换到观察空间后，只取 XY，并在归一化时补入很小的 Z 分量。随后沿屏幕平面扩张。这样轮廓宽度主要由投影方向控制，不是简单沿世界法线移动一个固定距离。

#### 宽度同时受顶点、距离和分辨率影响

令 $d=-z_v/P_y$，其中 $z_v$ 是观察空间深度、$P_y$ 是投影纵向尺度。距离过渡量为：

$$
t_0=\operatorname{saturate}(10d),\quad
t_1=\operatorname{saturate}(d-0.1),\quad
t_2=\operatorname{saturate}(0.5d-1.05)
$$
$$
w_0=0.00105t_0,\quad
w_1=\operatorname{lerp}(w_0,0.005,t_1),\quad
w_2=\operatorname{lerp}(w_1,0.0035,t_2)
$$

之后还可以混向与分辨率控制有关的宽度。主宽度乘顶点颜色 R 和材质宽度参数；另一组深度控制决定是否继续缩放。顶点颜色 G 减去约 0.502 后，又控制沿视线方向的额外位移。

这些系数处于观察空间位置的计算中，不能直接称为固定的“若干像素宽”。距离分段、投影、顶点控制和分辨率共同决定最终轮廓。

#### 旧轮廓必须按旧状态再扩张一次

顶点程序对当前位置计算一遍描边，对旧位置、旧物体变换与旧观察矩阵再计算一遍，然后分别输出当前和旧的投影位置。旧位置可以来自备用的变形后位置流。

描边像素使用的是扩张外壳的运动。如果直接拿未扩张主体的位移覆盖描边，转身或距离变化时，边缘历史的对应位置可能与实际轮廓不一致。

描边像素本身还读取底色、材质区域和实体光照，通过颜色与明暗变换形成轮廓色，并写入运动和必要的分类。因此这条描边也不等同于最终画面上的固定黑线。

<span id="character-layer-composition"></span>

<span id="头发眼睛与透明衣料使用不同的分层规则"></span>

### 头发与透明衣料的前后层次

头发、眼睛和透明衣料需要按各自可见性与覆盖方式进入画面。本节比较深度、模板和颜色混合的配合，再展开不同 alpha 含义与可选消隐分支。眼睛的颜色计算见[眼部效果](#eyes)。

<figure class="rendering-diagram"><a href="/images/rendering-analysis/zzz/character-layer-flow.svg" target="_blank" rel="noopener"><img src="/images/rendering-analysis/zzz/character-layer-flow.svg" alt="蕾米分层示意：可见性、颜色合成、描边与运动分别承担任务。" loading="lazy" width="1120" height="690"></a><figcaption>算法示意 · 点击查看大图</figcaption></figure>

| 已确认路径 | 可见性与写入 | RGB 合成 |
|---|---|---|
| 不透明头发／身体 | 写深度和角色类别；身体是双面材质 | 直接写多路材质结果 |
| 不透明描边 | 扩张几何、剔除正面；写深度及相关分类 | 写描边颜色和辅助数据 |
| 后续头发深度层 | 无颜色附件，准备深度／模板 | 不产生当前颜色 |
| 后续头发颜色 | 按深度／模板约束范围，并继续写深度 | 源颜色乘源 alpha，背景乘其反值 |
| 眼睛 | 测深度，不写深度，辅助目标各自控制 | 源颜色已预乘，背景乘一减源 alpha |
| 透明衣料前置层 | 写深度和模板，保留原有颜色 | 源因子零、背景因子一 |
| 透明衣料颜色 | 测深度，不写深度 | 源因子一、背景因子为源 alpha |
| 透明衣料描边 | 剔除正面，并写深度 | 与该透明颜色路径相同的 RGB 因子 |

表中的透明前置层即使像素程序声明并计算了颜色输出，混合状态也会将原颜色保留下来。判断一次绘制的作用必须把 shader 输出和目标的混合规则合在一起看。

#### 同名 alpha 在三个路径里含义不同

记已有颜色为 $B$，当前输出 RGB 为 $S$、输出 alpha 为 $a$，三条实际 RGB 混合分别是：

$$
C_{hair}=aS+(1-a)B
$$
$$
C_{eye}=S+(1-a)B
$$
$$
C_{transparent}=S+aB
$$

透明衣料中的 $a$ 在这个接口上是背景保留系数。程序一条输出分支写入 $a=1+\alpha(k-1)$，其中 $\alpha$ 为内部材质覆盖、$k$ 为材质控制；另一模式可以直接输出内部 alpha。RGB 在输出前已经过覆盖与材质调制。不能把这条路径换成眼睛的因子，或再额外给源 RGB 乘一次 alpha。

目标 alpha 自己还有独立混合方程。上式只说明 RGB，不意味着目标中保存的 alpha 同时变成普通透明度。

#### 头发深度程序中的消隐分支，本帧并未全部开启

程序支持三类剔除：屏幕位置索引 4×4 阈值表的有序消隐、两份纹理 R 通道相乘后的阈值剔除，以及几何传入的平面距离剔除。第二种虽然服务覆盖测试，读取的实际分量仍是 R，不能仅凭用途把它写成采样贴图 alpha。

本次头发深度层的径向消隐开关为零；纵向控制两端都为一，给出常量覆盖；有序消隐输入为一，高于约 0.9412 的进入阈值；纹理阈值剔除开关也为零。这意味着本帧不需要依靠这些可选分支打孔。程序仍完成自身的几何裁剪及可见性准备，随后颜色层按模板条件接入。

这类当前状态直接影响对画面的解释：看到深度 shader 里有抖动表，并不能把截图中的任意细碎边缘归因于正在执行的抖动透明。

<span id="image-stability"></span>

### 抗锯齿与画面稳定

相机或人物运动后，同一表面在屏幕上的位置会改变。当前路径先提供运动与身份，再对旧颜色做对应检查、范围裁剪和融合，用于稳定整幅 HDR 画面；具体运动中的效果仍需连续帧验证。

<span id="motion"></span>

<span id="角色运动怎样交给整帧历史处理"></span>

#### 表面对应：由前后位置生成运动

脸部比较当前和旧的投影位置。先除以齐次坐标的 $w$，得到归一化设备坐标，再乘 $(0.5,-0.5)$ 转成纹理坐标差。负号已经处理了屏幕纵向约定，后续不能再无条件翻转一次。

小位移通过有符号平方根编码；整帧时序读取时，执行对应解码：

$$
q=C_{\text{motion}}-\frac{127}{255},\qquad
v=\operatorname{sign}(q)(2q)^2
$$
$$
uv_{\text{history}}=uv_{\text{current}}-v
$$

零运动的编码中心是 $127/255$，约为 0.498039，而不是简单的 0.5。若忽略这种约定，会给历史查找引入固定误差。

这里的运动描述屏幕中的表面对应，不是骨骼在世界中的速度。人物变形、相机运动与遮挡显露都会影响这种对应关系。后续把角色和场景的相关数据整理到统一运动／身份输入后，才能开始整帧融合。

<span id="temporal"></span>

<span id="历史融合先判定表面再约束颜色"></span>

#### 历史颜色：身份检查、颜色裁剪与融合

当前 HDR 颜色、运动与身份是三类不同输入。旧颜色使用独立颜色历史保存，旧身份另存为单通道数据。身份用于判断重投影后的表面是否仍适合复用，并未被证明等同于游戏逻辑中的对象标识。

##### 从靠前表面取得运动

程序比较中心及四个对角的深度，选取适合的近处表面，再使用其运动找旧坐标。轮廓附近一个像素周围可能同时包含人物和背景，直接使用任意邻居的位移，会把两种表面的历史混在一起。

中心覆盖标记及其屏幕变化还影响当前采样偏移和是否旁路历史。深度择近、采样偏移与覆盖条件共同决定当前计算真正使用的位置。

##### 身份不匹配时立即使用当前结果

![当前运动输入中的身份通道预览](/images/rendering-analysis/zzz/temporal-identity.png)

这里单独显示供匹配使用的标记，可辨认角色与其他区域采用不同值。明暗只表示标记数据的显示，不能理解为受光强度；该通道的作用要由接下来的比较说明。


重投影到旧坐标后，先点采样身份。若当前与旧身份之差的绝对值大于 0.1，就放弃旧颜色，直接输出当前颜色和当前身份。

这一判断解决人物移开后露出墙面之类的问题：屏幕坐标可以找到，但旧位置的内容已经不适合当前表面。颜色相似也不能替代身份判断。

##### 身份通过以后，仍需限制旧颜色

旧 HDR 颜色采用过滤采样。当前颜色使用中心与四个半纹素对角样本，并应用当前参数为 0.6 的锐化。程序随后根据最大颜色分量把 HDR 压到较小计算范围，在该范围里建立可容许区间。

区间由当前对角邻居的最小值、最大值和亮度差扩张得到。旧颜色沿区间中心方向被裁剪到允许范围，再参与混合。其作用是防止旧颜色虽然属于允许的表面，却已经落后于新的照明或局部颜色变化。

身份拒绝回答“能否用”，颜色裁剪回答“允许用到什么值”。两者职责不同。

##### 把锐化、亮度扩张和方向裁剪写成完整计算

<figure class="rendering-diagram"><a href="/images/rendering-analysis/zzz/temporal-resolve.svg" target="_blank" rel="noopener"><img src="/images/rendering-analysis/zzz/temporal-resolve.svg" alt="绝区零时序融合数据流示意：深度择近、身份拒绝、颜色裁剪以及颜色与身份双输出" loading="lazy" width="1000" height="1060"></a><figcaption>算法示意 · 点击查看大图</figcaption></figure>

*依据本帧时序程序整理的分支图。身份拒绝在历史颜色处理之前，末尾仍保留覆盖标记控制的回退。*

设当前采样中心为 $C$，四个半纹素对角样本为 $D_1,\ldots,D_4$；其中 $D_1,D_2$ 是对角线上的一对。当前锐化结果为：

$$
S=\operatorname{clamp}
\left[C+0.6\left(C-\frac14\sum_{i=1}^{4}D_i\right),
0,65472\right]
$$

程序还构造一份用于亮度比较的参考值：

$$
Q=\frac{4(D_1+D_2)-2C+S}{7}
$$

这解释了为什么不能用“当前邻域平均值”概括所有中间量：$S$ 负责保留当前细节，$Q$ 参与判断局部亮度差，构造边界时又只使用其中一对对角样本。它们各自使用不同权重。

颜色压缩函数与对应的恢复关系为：

$$
F(X)=\frac{X}{1+\max(X_r,X_g,X_b)},\qquad
F^{-1}(x)=\frac{x}{1-\max(x_r,x_g,x_b)}
$$

在非负 HDR 颜色范围内，$F$ 把较大的数值压入有限区间。算例中 $X=(8,2,1)$ 会变为 $(8/9,2/9,1/9)$。它不是最终显示的色调映射：融合后还要恢复 HDR，后面的泛光仍需要亮度大于一的值。

压缩域亮度取：

$$
Y(x)=0.212673x_r+0.715152x_g+0.072175x_b
$$
$$
\delta=|Y(F(S))-Y(F(Q))|,\qquad
g=4-3.75\min(80\lVert v\rVert,1)
$$
$$
L=\min(F(D_1),F(D_2))-g\delta,\qquad
U=\max(F(D_1),F(D_2))+g\delta
$$

最小值和最大值按通道计算，标量 $g\delta$ 扩张三个通道。运动越大，扩张倍率由 4 减到 0.25。这一倍率用的是 $80\lVert v\rVert$，后面的历史权重用的是 $5000\lVert v\rVert$：二者有不同响应尺度，不能共用一个已经饱和的运动因子。

取区间中心 $M=(L+U)/2$、半宽 $E=(U-L)/2$，压缩后的历史为 $h$，则方向裁剪是：

$$
D=h-M,\qquad
t=\min\left(1,\min_{c\in\{r,g,b\}}
\frac{|E_c|}{\max(|D_c|,10^{-4})}\right)
$$
$$
h_{\text{clip}}=M+tD
$$

所有分量共用一个 $t$，历史点沿着“区间中心到历史点”的直线退回盒内。它与每个通道分别夹取不同。用二维截面算例说明：中心为零、半宽为 $(0.2,0.1)$、历史偏差为 $(0.4,0.15)$，方向裁剪得到 $(0.2,0.075)$，逐通道夹取则得到 $(0.2,0.1)$。前者保持这条偏差向量的方向；这里不把它扩大解释成严格保持感知色相。

上述流程没有当前 3×3 颜色的均值和方差，也没有转入 YCoCg。它确实是本帧的压缩 RGB 邻域范围裁剪，不能因为最后都用于抗锯齿就换成另一套常见时序公式。

##### 运动量控制剩余历史的比例

当前路径的基础历史权重为：

$$
w_h=0.95-0.25\operatorname{saturate}(5000\lVert v\rVert)
$$

| UV 位移长度的假设值 | 由公式得到的基础历史权重 |
|---:|---:|
| 0 | 0.95 |
| 0.0001 | 0.825 |
| 0.0002 及以上 | 0.70 |

这是权重响应算例，只适用于已经通过前面检查的路径。中心标记还可能进一步要求偏向当前颜色。若身份不匹配，则根本不会进入这条保留历史的混合。

最后，程序将混合颜色恢复到相应颜色域，并同时写出新颜色与当前身份。下一次查找必须读取这对对应结果；只更新颜色而保留旧身份，会破坏匹配关系。

##### 最后输出还受到覆盖标记控制

设已经通过身份检查的历史权重为 $w_h$，先得到：

$$
R=F^{-1}\bigl[(1-w_h)F(S)+w_hh_{\text{clip}}\bigr]
$$

恢复后的 $R$ 被限制到非负且不超过 65472，再与未经上述历史融合的当前样本 $C$ 混合：

$$
C_{\text{out}}=(1-m)R+mC
$$

$m$ 来自当前中心的覆盖／分类标记。程序还检查标记的屏幕变化：两个方向导数的绝对值之和超过 0.5 时，会强制相应控制量为一。这个分支同时影响采样偏移和最终当前帧回退，所以它不能被理解为普通透明度，或者作为历史权重里的另一个随意乘数。

颜色与身份的更新可用下面的状态表检查：

| 条件 | 新颜色 | 新身份 |
|---|---|---|
| 当前与重投影身份不匹配 | 当前样本，提前返回 | 当前身份 |
| 身份匹配，标记允许融合 | 经压缩、裁剪、融合后恢复的颜色 | 当前身份 |
| 身份匹配，但标记要求回退 | 按标记偏向当前样本，取一时完全使用当前 | 当前身份 |

本阶段没有独立的上一帧深度输入，不能额外替它补出“当前世界位置与历史深度比较”的步骤。它的主要防护来自当前深度择近、身份比较、邻域颜色约束和覆盖标记。单帧资源绑定能确认这些输入输出；历史缓冲跨多帧如何交换、相机切换时怎样清空，仍需连续截帧或调度代码。

<span id="output"></span>

### 亮部扩散、运动模糊与显示色彩

亮部扩散分为较早的场景处理和主要历史之后的末段处理；运动模糊再使用运动方向与有效权重组织颜色。本节分别说明两套泛光、模糊链和调色的输入、当前参数及可见范围。

<span id="从历史结果到最终显示"></span>

主要历史融合完成后，画面仍会继续处理泛光、过滤、运动模糊与最终颜色。前面已经参与材质的角色查找表也不会因此消失：局部调色与最后整帧转换处于不同阶段。

<span id="bloom-details"></span>

#### 两套泛光分别位于哪里

大厅有两套不同的亮部处理。第一套在晚期场景几何之后、人物透明材质与主要 HDR 历史之前执行；另一套在主要历史阶段之后准备亮部，并进入最终显示合成。仅把它们统称为最后的 Bloom，会丢失颜色处理的实际次序。

| 路径 | 当前输入与处理 | 合成位置 |
|---|---|---|
| 较早的场景亮部链 | 读取场景 HDR、材质色与法线／分类；经过高质量泛光和过滤支路 | 将亮部结果与场景颜色相加，再通过场景专用颜色表 |
| 末段亮部链 | 同时读取颜色、材质 alpha、法线分类及反射输入；筛选亮部后进行多级过滤 | 生成半分辨率泛光，交给最终显示程序 |

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/zzz/local-bloom-before.png"><img src="/images/rendering-analysis/zzz/local-bloom-before.png" alt="较早亮部处理与场景调色之前。" loading="lazy" width="1200" height="503"></a><figcaption>较早亮部处理与场景调色之前。</figcaption></figure>
<figure><a href="/images/rendering-analysis/zzz/local-bloom-after.png"><img src="/images/rendering-analysis/zzz/local-bloom-after.png" alt="亮部组合与场景颜色查表之后；不代表单独关闭泛光的对照。" loading="lazy" width="1200" height="503"></a><figcaption>亮部组合与场景颜色查表之后；不代表单独关闭泛光的对照。</figcaption></figure>
</div>

这组图定位较早亮部链前后的场景颜色，两图均按零到一的 HDR 范围预览。后一图同时包含该链中的场景颜色查表，因此整幅画面的色调差异不能单独归因于光晕扩散。当前场景查表开关开启，颜色表为 1024×32 的二维条带，按相邻切片插值表示三维映射。

末段亮部提取的当前阈值为 0.45、缩放为 1。主颜色分支先作四样本平均，再对各颜色分量取 $\max(\overline C-0.45,0)$。反射分支则先检查材质分类，并乘材质与颜色 alpha 的相关权重，再与主分支组合。这不是只按最终屏幕亮度统一选取所有像素。

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/zzz/main-bloom-detail.png"><img src="/images/rendering-analysis/zzz/main-bloom-detail.png" alt="末段泛光输出；HDR 预览范围为零到 0.03。" loading="lazy" width="1200" height="503"></a><figcaption>末段泛光输出；HDR 预览范围为零到 0.03。</figcaption></figure>
</div>

末段泛光本帧强度较弱。图中将 HDR 预览范围固定为零到 0.03，便于观察角色附近的蓝色亮部扩散；这个范围与上面的场景颜色对照不同，不能直接比较图上显示亮度。

<span id="motion-blur-details"></span>

#### 运动模糊：先整理运动，再沿方向积累颜色

当前运动模糊由五次全屏处理组成。前段从编码运动恢复位移，结合周围样本整理模糊所需输入；随后在半分辨率生成沿运动方向积累的颜色和单独权重，最后回到主视图尺寸合成。

方向积累先检查当前有效量，低于阈值时直接保留输入。需要模糊的像素沿限制长度后的运动方向读取颜色，以样本的有效量参与累加并归一化；权重因此与模糊颜色分开保存。最终一步为：

$$
C_{out}=(1-w)C_{history}+wC_{blur}
$$

这里的 $C_{history}$ 是本帧 HDR 历史阶段已经得到的颜色，$w$ 来自模糊链生成的单通道结果，最终 alpha 保留该颜色输入的值。

这帧人物与相机没有呈现明显拖曳。固定相机、固定零到一预览范围的前后对照，在缩小预览中仅有一个像素发生量化差异；因此本篇说明当前算法和接入关系，不拿这帧静止画面当作强运动模糊的展示。

#### 局部颜色查找与整帧颜色处理

颜色也不是只在最后统一调整。天空相关查找表服务环境颜色，角色与场景又可以有各自的颜色变换。[眼睛效果](#eyes)中已展示角色查找表如何在整帧输出前参与计算。

<span id="conclusion"></span>

### 本帧效果的配合与分析范围

大厅与蕾米最终能够汇合，是因为各阶段约定了清楚的数据职责：几何保证形状一致，分类保证颜色解释正确，运动和身份保证历史对应正确。在这三个前提上，专用角色着色与场景照明才能进入同一条完整画面流程。

所以本文中的材质双输出、眼睛前后图与最终图有明确分工。配对阶段图用于观察特定写入，最终图用于认识完整外观；它们不能作为某一个效果独立开启与关闭的实验。

本文已展开贴花投影、烘焙光与实时照明分工、屏幕遮蔽搜索及历史、形变与细分、翼部背向受光、头发区域参数、脸部阴影、眼睛查表、描边与透明层次，以及两套泛光、运动模糊和整帧历史。光束虽然执行，本帧结果为零；运动模糊也没有明显拖曳，不能把程序存在等同于画面中有强烈效果。

中央设备的外壳与显示图块、局部雾的两种生成方式和独立颜色历史也已分别展开。仍未完整覆盖的是其他材质的全部颜色分支、各探针与镜像在所有材质中的选择、胶囊与骨骼的对应、体积参数在连续运动中的更新及缓存管理。连续运动中的闪烁与拖影还需要连续画面验证。

</div>
