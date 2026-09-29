---
title: "绝区零渲染实现分析：大厅材质、蕾米角色与整帧合成"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-29T17:34:37+08:00"
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

以大厅与蕾米这份截帧为例，先梳理人物模型、角色贴图、建筑图集与共享照明资源，再按整帧顺序分析镜像、材质、灯光、阴影、人物着色和历史合成。模型范围、贴图预览和阶段画面逐项对应；复杂的灯光筛选、翼部细分与时序算法另配示意图。

<!-- more -->

<link rel="stylesheet" href="/css/rendering-articles.css">

<div class="rendering-article">

<span id="frame"></span>

## 美术资源与渲染概况

![绝区零大厅最终画面：HIA 墙面、吧台、蕾米与右侧座椅](/scene-capture-comparison/leimi/e12209_rt0.png)

### 美术资源概况

- **人物按部位组织。** 蕾米身体、头发、脸部和眼睛有独立绘制与贴图；身体和头发的底色为 2K，法线为 1K。形态准备与翼部细分为后续几何提供不同形式的数据。
- **大厅表面复用材质与光照图集。** 建筑、小设施使用各自的底色／法线／控制输入，再通过另一套坐标读取 4K 烘焙光。
- **中央设备采用专用材质。** 显示设备与普通墙板的输入不同，不能按同一套表面算法解释。

### 渲染分析概况

| 环节 | 本帧的组织方式 |
|---|---|
| 几何与视图 | 初始角色准备后先处理镜像视图，再完成主视图前的其他阴影与细分准备 |
| 主材质 | 场景像素和角色像素在同一组目标中保存不同职责的数据，类别决定后续解释 |
| 光照 | 压缩烘焙光、屏幕与世界灯光列表、阴影及局部遮蔽共同参与 |
| 专用人物材质 | 脸部直接生成部分着色结果，眼睛单独进行预乘颜色合成 |
| 稳定与显示 | 运动和身份控制 HDR 历史融合，后面继续泛光、运动模糊与显示转换 |

### 样本条件

主视图有效区域为 3432×1440，最终输出为 3440×1440，接口为 D3D11。本文分析这份大厅与蕾米的单帧状态；画质档位、硬件耗时和距离切换策略没有从当前材料得到完整测量。

下文先按人物、建筑与环境资源解释它们是什么，再按整帧顺序说明数据如何变成最终画面。效果图与资源图均来自本帧，黄色线框用于定位实际几何，另绘的算法示意图会单独注明。

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

这里列出已单独确认范围的提交。头发还有另一组 5278 个三角形的提交，人物也会重复进入镜像、阴影等视图；这张表因此不用于求“整个角色唯一总面数”。

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

三个通道在衣料、皮肤与饰件上有不同分区。它们是数值输入，彩色预览本身不能证明每个通道的物理意义。BC6 这份资源只有 RGB，因此这里展示三个真实分量；把预览工具补出的常量 alpha 当作第四张材质遮罩会产生误读。后文只给已经沿采样与运算确认的角色公式赋予语义。

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

#### 重复表面使用图集，摆放后的照明使用另一套坐标

大厅墙板、地面、装饰和小型设施并非都使用一张整场景底色。代表建筑提交使用一组 1024×1024 的底色、法线与控制纹理；小型通风口使用另一组 512×256 纹理。两者共享同一张 4096×4096 的压缩烘焙光图集。

| 代表绘制 | 单实例三角形数 | 实例数 | 资源组织 |
|---|---:|---:|---|
| 一组大厅背景建筑 | 9177 | 1 | 1K 颜色、方向与控制图集 |
| 通风口 | 228 | 1 | 512×256 的独立小型材质 |
| 中央圆形设备的一条显示材质路径 | 4896 | 1 | 专用显示材质，绑定 2K 法线输入 |

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/zzz/architecture-colour.png"><img src="/images/rendering-analysis/zzz/architecture-colour.png" alt="背景建筑的底色图集：墙板、边框和饰面共享展开区域。" loading="lazy" width="768" height="768"></a><figcaption>背景建筑的底色图集：墙板、边框和饰面共享展开区域。</figcaption></figure>
<figure><a href="/images/rendering-analysis/zzz/architecture-normal.png"><img src="/images/rendering-analysis/zzz/architecture-normal.png" alt="同一建筑材质的方向纹理；不是照明结果。" loading="lazy" width="768" height="768"></a><figcaption>同一建筑材质的方向纹理；不是照明结果。</figcaption></figure>
</div>

建筑图集中细长条带适合被多块墙面或边框重复使用。与此同时，摆放在不同位置的几何仍可以得到不同烘焙光，因为光照采样使用另一套 UV 与缩放偏移。底色图集负责“表面是什么”，光照图集负责该摆放位置已经得到的照明信息。

| 同一通风口绘制的输入 | 尺寸与格式 | 在材质中的职责 |
|---|---|---|
| 底色 | 512×256，BC1 sRGB | 表面色与条纹 |
| 法线 | 512×256，BC7 | 切线空间方向 |
| 材质控制 | 512×256，BC1 | 调整响应与分支 |
| 烘焙光／天空遮蔽 | 4096×4096，BC7 | 经专用解码后参与已有照明 |
| 湿润噪声 | 512×512 | 按空间位置提供变化 |
| 环境高度 | 509×512，R16 | 将表面位置联系到环境高度条件 |

后文的压缩光照与湿润公式来自这条通风口材质。大厅墙面阶段图用于说明整帧颜色发生了什么；具体到每一种墙板、设备或地面，还要以各自的材质分支为准。共享一张光照图集并不意味着全部表面使用完全相同的像素程序。

#### 显示设备有单独的材质路径

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/zzz/device-geometry.png"><img src="/images/rendering-analysis/zzz/device-geometry.png" alt="黄色线框定位中央圆形设备的这次提交，底图为当时的材质颜色。" loading="lazy" width="1280" height="537"></a><figcaption>黄色线框定位中央圆形设备的这次提交，底图为当时的材质颜色。</figcaption></figure>
</div>

这次显示设备绘制绑定的是专用电视／显示材质，输入中可确认 2048×2048 法线和默认方向纹理。它没有沿用上面通风口完整的底色、法线、控制、烘焙光组合。不能把背景建筑的纹理表同时当成屏幕内容的来源，也不能仅凭最终高亮外观就声称屏幕通过某张发光贴图实现；还需要追踪这条程序的颜色生产。

### 镜像、环境与共享照明资源

本帧在主视图前完整处理了一套镜像方向的场景，包含几何、照明与输出。它增加的是另一个观察方向的工作，不能将其绘制次数当作大厅内多出了一批模型。

此外，主视图材质使用烘焙光、环境高度，后续照明使用阴影、屏幕遮蔽、胶囊遮蔽与反射输入。它们的坐标系统不同：光照图集贴合表面 UV，环境高度按世界位置查询，阴影从光源方向查询，屏幕数据对应当前视角。

当前天空路径还绑定一张 4096×512 的低云纹理。不过这是一帧室内大厅画面，绑定天空输入并不能证明画面中存在可分析的可见云层。本文的资源重点因此放在确实可定位的人物、建筑、设备与照明数据上。


## 渲染分析

<span id="pipeline"></span>

### 整帧流程

| 阶段 | 实际工作 | 必须交付给后续的数据 |
|---|---|---|
| 初始角色准备 | 形态累加及部分几何准备 | 镜像等早期消费者需要的当前形状 |
| 镜像视图 | 独立进行几何、照明、透明与颜色处理 | 从镜像方向看到的场景颜色 |
| 主视图前的继续准备 | 镜像结束后进行其他阴影代理、翼部细分与阴影／深度、颜色表准备 | 主视图所需几何、阴影和颜色输入 |
| 主视图材质 | 分别处理场景与角色，建立可见深度 | 颜色、已有光照、法线、材质控制和分类 |
| 可见性与灯光整理 | 建立分级深度，筛选屏幕与世界网格中的灯光 | 每个区域相关的光源候选 |
| 阴影与遮蔽 | 解析主光和局部遮挡，加入屏幕及胶囊遮蔽 | 当前可见表面对应的遮挡结果 |
| 补光与合成 | 按类别解释材质，加入透明、雾和效果 | 当前 HDR 颜色及最终运动、身份信息 |
| 历史融合与输出 | 验证旧表面，限制旧颜色，再处理后续泛光和颜色 | 新画面与下一次所需的历史 |

这里的 HDR 是能保存超出普通显示亮度范围的中间颜色。历史融合之后还会继续处理高亮与显示颜色，所以不能把这份历史等同于最终截图。

几个先后关系决定了正确性：不同消费者所需的几何在各自使用前完成，本次翼部细分位于镜像之后，不能倒推镜像读取了随后才生产的结果；灯光列表必须先于读取列表的着色；运动和身份必须在历史融合之前完成；旧颜色与旧身份则必须在读取结束之后才能更新。最后一项尤其容易被“反正只是一张上一帧图片”的理解掩盖。

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

### 主材质不是一套全图统一的颜色定义

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

### 大厅材质：从底色和法线得到压缩烘焙光

<div class="rendering-figures">
<figure><a href="/scene-capture-comparison/figures/replay/zzz-material-lighting.png"><img src="/scene-capture-comparison/figures/replay/zzz-material-lighting.png" alt="材质阶段：已有光照量" loading="lazy" width="640" height="520"></a><figcaption>材质阶段：已有光照量</figcaption></figure>
<figure><a href="/scene-capture-comparison/figures/replay/zzz-material-colour.png"><img src="/scene-capture-comparison/figures/replay/zzz-material-colour.png" alt="同一阶段：表面颜色" loading="lazy" width="640" height="520"></a><figcaption>同一阶段：表面颜色</figcaption></figure>
<figure><a href="/scene-capture-comparison/figures/replay/zzz-scene-final.png"><img src="/scene-capture-comparison/figures/replay/zzz-scene-final.png" alt="后续处理完成后的大厅局部" loading="lazy" width="640" height="519"></a><figcaption>后续处理完成后的大厅局部</figcaption></figure>
</div>

观察 HIA 浮雕、墙板凹处与吧台面。前两张是同阶段的不同输出：一张已有明暗，一张保留配色分区。第三张包含后续照明与显示处理，用于定位大厅的最终外观。这组三图对应的是场景局部；下方通风口的贴图与公式则来自一条具体材质，不能将该公式无条件推广到图中每一种墙板和设备。

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

#### 烘焙光为什么不能作为普通颜色直接使用

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

#### 湿润从世界环境进入材质

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/zzz/wetness-noise.png"><img src="/images/rendering-analysis/zzz/wetness-noise.png" alt="湿润噪声输入" loading="lazy" width="512" height="512"></a><figcaption>湿润噪声输入</figcaption></figure>
<figure><a href="/images/rendering-analysis/zzz/environment-height.png"><img src="/images/rendering-analysis/zzz/environment-height.png" alt="场景高度输入的单通道预览" loading="lazy" width="512" height="515"></a><figcaption>场景高度输入的单通道预览</figcaption></figure>
</div>

噪声提供局部变化，高度提供环境条件。它们是该材质实际读取的输入，不是湿润前后对照；哪片表面受到多少影响，还由位置、方向与参数共同决定。

湿润量的来源包括世界水平位置上的噪声、环境高度图的比较结果、当前位置高度和表面朝上程度。它不只存在于物体自己的 UV 贴图中，所以两处使用同一材质的表面也可能收到不同影响。

当前程序用这份影响改变颜色与表面响应；强度较大时，还把切线空间法线拉向 $(0,0,1)$，削弱细节起伏。可以把它理解为同时改变“表面是什么色”和“微小凹凸怎样受光”。

这是已确认的计算路径。现有图组没有单独关闭湿润，因此不把最终地面亮度的全部变化归给这一项。

<span id="lights"></span>

### 灯光列表：先筛屏幕区域，再筛深度体积

直接在每个像素遍历全部局部灯光会重复很多无关计算。这帧先为区域建立候选列表，再由着色查询与当前位置相关的候选。

#### 屏幕分区与非均匀深度层

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

#### 候选压紧、排序与精筛

每个工作组有 64 个线程。它们分担输入灯光的检查，以工作组宽度为步幅继续遍历后续光源。完整步骤是：

1. 用灯光屏幕包围范围与当前分区做粗筛。
2. 将通过的灯光压紧到组内候选数组，容量上限为 128。
3. 补齐排序所需范围，使用双调排序网络按索引整理候选。
4. 把灯光起止深度映射到层范围。
5. 对每层继续检查灯光体积与格子几何是否相交。
6. 写出分类后的索引列表和每格的数量、起始位置。

按索引排序服务于后面的类型与寻址组织，不表示按亮度挑选最重要灯光。候选数组的容量和最终每类每格的计数容量也不同：后者采用 5 位数量，写入计数限制为 31。

若把每类每格的列表头记为一个 32 位整数，其高 5 位表示数量，低 27 位表示列表起点。消费者先取得列表范围，再结合对应类型的基准读取灯光记录。这里写出这种组织，是为了说明像素怎样找到候选，不是让读者去查内部定位标识。

#### 从工作组到深度层：同一批线程分两次承担任务

<figure class="rendering-diagram"><a href="/images/rendering-analysis/zzz/cluster-dataflow.svg" target="_blank" rel="noopener"><img src="/images/rendering-analysis/zzz/cluster-dataflow.svg" alt="灯光列表的数据流示意：屏幕候选、深度范围、体积精筛与压缩表头" loading="lazy" width="1000" height="1080"></a><figcaption>算法示意 · 点击查看大图</figcaption></figure>

*算法示意图，依据本帧程序重绘；图中的示例索引用于解释寻址。本文的这类示意图与截帧图分别标明，绘图布局不代表引擎内部界面。*

工作组开始时，线程各自检查不同光源。通过屏幕包围范围检查的光源，通过组内原子加取得互不重复的槽位。同步后才能排序：如果某些线程还在写候选，其他线程已经开始交换元素，排序读到的就不是完整集合。

排序长度向上补到二的幂，空槽写入最大的无符号数。交换时使用无符号比较，这些空槽会被放到末端。双调网络让线程按异或关系找到交换伙伴；每轮交换后的同步，是下一轮能读取上轮结果的前提。这里排序的对象是光源索引，程序没有计算“亮度优先级”。

之后，同一个组里的线程改变职责：每个有效线程负责一个深度层。它先只检查各光源的起止层，统计可能需要的索引数量，再向全局索引池申请空间。**申请数量发生在精筛之前**，因此它是容量预留，最终有效数量可以更少。不能用全局计数器的增长量直接表示真正影响格子的光源数。

深度区间也被压紧存储：一个光源的起始层和结束层分别放入两个 8 位字段；两个光源共用一个 32 位整数。虽然字段能容纳 0～255，本帧实际只有 64 层。字段容量与本次启用规模需要分开理解。

#### 体积精筛为什么只适合称为保守剔除

程序分批为光源体积建立六个平面。每批处理四个候选，共享暂存区因此容纳 24 个平面。对某个深度格子，由屏幕分区四角的射线和该层前后深度构成八个角点。

对于平面 $p$，把角点 $X_j$ 代入：

$$
d_{p,j}=n_p\cdot X_j+b_p,\qquad j=0,\ldots,7
$$

如果八个点全部处于这个平面标记的外侧，整个格子可以排除；只要某个平面做到这一点，就不把该光源写入列表。若六个平面均未排除，候选通过。这里不把外侧固定写成世界坐标的正方向，平面法线在构建时已经按体积朝向调整。

这种检查能证明一部分“不相交”，没有额外检查所有可能的分离轴，因此通过检查不等于证明格子内每个像素都受光。后续着色仍要用当前位置计算距离、方向和衰减。区域列表的职责是减少遍历量，逐像素照明的职责是算贡献。

#### 列表头、类型基址和三种容量不是同一件事

记压缩表头为 $H$，消费端的寻址关系可写成：

$$
n=H\mathbin{\gg}27,\qquad
b=H\mathbin{\&}(2^{27}-1)
$$
$$
\text{light}(i)=\text{typeBase}+\text{indexPool}[b+i],
\quad 0\leq i<n
$$

生产端在写索引前，会减去所属类型的基址。第一类和第二类分别得到表头，第二类列表从第一类实际写入数量之后开始。这里的“类型”只表示程序中的两类数据分区，不据此擅自命名为点光或聚光。

例如表头起点为 100、数量为 3，索引池保存 $[2,5,9]$，类型基址为 200，则恢复的是 $[202,205,209]$。这些是假设值，解释的是相对索引如何回到对应数据区。

| 限制位置 | 当前规则 | 影响 |
|---|---|---|
| 屏幕候选暂存 | 最多保存 128 项 | 超出槽位的候选不进入后续排序 |
| 全局索引空间申请 | 依据深度范围命中的候选数量 | 为精筛结果预留容量，可能留有空余 |
| 每类表头数量 | 最多编码 31 项 | 消费者能遍历的数量被表头限制 |

不能从这些上限推出“本帧一定丢灯”。这需要统计实际候选和各类命中数；也不能把容量溢出的行为描述成按亮度选出最重要光源，本次程序没有这样的排序依据。

#### 世界网格是另一套组织

世界空间还存在一条独立列表路径。它按空间格子组织灯光，用组内前缀和为各线程计算输出位置，再由一个线程一次性申请整组的全局区间。

与屏幕路径相比，它的列表头计数宽度不同，灯光记录也不是同一种结构。两者可以共同服务场景，但不能共用一套不加区分的解释。由这些结构可以确认筛选和组织方式，尚不能单凭候选容量推算实际 GPU 耗时。

<span id="shadows"></span>

### 阴影、屏幕遮蔽与胶囊遮蔽怎样分工

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

屏幕遮蔽有半分辨率结果和独立过滤、历史路径；胶囊数据又有自己的几何输入。当前已确认两条链的接入，尚未完整还原屏幕遮蔽内核及胶囊到每个骨骼的全部对应。

<span id="reflections"></span>

### 反射与调色具有独立的数据来源

大厅的平面反射通过镜像视点重新进行几何、深度、照明、透明和颜色处理，得到供主视图使用的离屏颜色。这一步需要另一份可见性判断，不能由“翻转最终截图”代替。

场景还读取立方体环境探针。镜像视图提供特定镜面方向下重新生成的场景，探针提供按方向保存的环境颜色。当前材料已确认两类来源；它们在各材质中的完整选择与混合尚未全部展开。

颜色也不是只在最后统一调整。天空相关查找表服务环境颜色，角色与场景又可以有各自的颜色变换。眼睛部分将展示角色查找表如何在整帧输出前参与计算。

本帧雾可以追到屏幕结果与合成关系，但其内部介质表示不完整。因此本篇只在执行顺序中保留已知雾合成，不套用其他项目的体积雾公式。

<span id="character-geometry"></span>

### 蕾米几何：稀疏形态增量与方向数据一起更新

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

### 翼部细分：屏幕尺度、边规则与新三角形

翼部计算实际生成新顶点与连接关系，职责分为细分强度、边位置和索引生成。输入顶点与输出顶点的布局不同：前者为 40 字节，后者为 48 字节，后续读取必须使用新的布局。

#### 由距离和投影尺度决定细分强度

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

#### 中点、平滑候选与方向约束

对一条边，端点记为 $A,B$，两侧相邻三角形的对面点记为 $C,D$。中点和平滑候选为：

$$
M=\frac{A+B}{2},\qquad
Q=\frac38(A+B)+\frac18(C+D)
$$

完整邻接条件下，第二式与 Loop 边规则一致。程序根据边强度在 $M$ 与 $Q$ 之间插值。缺少邻接或条件不同的边，不应机械套用同一平滑规则。

一条受控制标记影响的分支还把 $Q-M$ 投影到指定方向，再加回中点。它约束新点允许移动的方向，因此“标准 Loop 细分”不足以描述整个过程。

#### 新三角形怎样分配输出空间

原三角形根据需要拆分的边数，生成一到四个三角形。额外索引数等于拆边数乘三。

每组 64 个线程先汇总组内额外索引数，由一个线程向全局计数器申请整组连续区间，再由各线程按组内偏移写入。这样避免每个线程都单独申请全局空间；同步点保证计数与写入顺序一致。

这说明几何拓扑可由 GPU 动态产生，但当前尚未完整还原所有间接绘制参数的生成，不能把这一步扩大成对整个场景提交架构的判断。

#### 索引生成的两级分配与同步

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

<span id="face"></span>

### 脸部：专用颜色、阴影与分类共同决定结果

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/zzz/face-base-colour.png"><img src="/images/rendering-analysis/zzz/face-base-colour.png" alt="蕾米脸部与眼部的颜色图案" loading="lazy" width="768" height="768"></a><figcaption>蕾米脸部与眼部的颜色图案</figcaption></figure>
<figure><a href="/images/rendering-analysis/zzz/face-light-control.png"><img src="/images/rendering-analysis/zzz/face-light-control.png" alt="脸部光照控制输入的 RGB 预览" loading="lazy" width="512" height="512"></a><figcaption>脸部光照控制输入的 RGB 预览</figcaption></figure>
</div>

脸部图案在 UV 展开中保存皮肤、眼睛等区域，光照控制图则编码另一组数值。其绿色和黄色是通道显示，不能当作脸上实际光源的颜色。

脸部写出的 HDR RGB 已经包括阴影、实体照明与材质调色。它同时写出控制量、法线与运动，供后续整帧处理继续使用。

#### 九点阴影比较具体怎样取样

脸部读取附加阴影深度以及主视图相关的级联阴影。附加路径先沿法线偏移表面，变换到光源空间，再映射到阴影子区域，进行九次比较采样。

以一个纹素为单位，采样位置包括中心、四个对角和四个轴向点：

$$
(0,0),\quad(\pm1,\pm1),\quad
(\pm\sqrt2,0),\quad(0,\pm\sqrt2)
$$

当前附加深度图为 2048×2048，基础纹理偏移是 $1/2048$。通过率约为九个比较结果之和乘 0.1111。每次比较返回的是“该位置是否受遮挡”的过滤结果，不是直接把深度值当作阴影灰度。

沿法线偏移改变实际比较的位置，多点采样使边界形成过渡。通过率之后还会与材质遮蔽、强度和开关组合，不能把这条阴影无条件乘到所有脸部颜色上。

级联路径根据表面到若干参考中心的距离选择覆盖层，再以扰动后的偏移采样。附加阴影与级联阴影是两个输入，单独保留其中一个不足以还原当前脸部受光。

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

### 眼睛：预乘合成与角色颜色查找表

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

<span id="motion"></span>

### 角色运动怎样交给整帧历史处理

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

### 历史融合：先判定表面，再约束颜色

当前 HDR 颜色、运动与身份是三类不同输入。旧颜色使用独立颜色历史保存，旧身份另存为单通道数据。身份用于判断重投影后的表面是否仍适合复用，并未被证明等同于游戏逻辑中的对象标识。

#### 从靠前表面取得运动

程序比较中心及四个对角的深度，选取适合的近处表面，再使用其运动找旧坐标。轮廓附近一个像素周围可能同时包含人物和背景，直接使用任意邻居的位移，会把两种表面的历史混在一起。

中心覆盖标记及其屏幕变化还影响当前采样偏移和是否旁路历史。深度择近、采样偏移与覆盖条件共同决定当前计算真正使用的位置。

#### 身份不匹配时立即使用当前结果

![当前运动输入中的身份通道预览](/images/rendering-analysis/zzz/temporal-identity.png)

这里单独显示供匹配使用的标记，可辨认角色与其他区域采用不同值。明暗只表示标记数据的显示，不能理解为受光强度；该通道的作用要由接下来的比较说明。


重投影到旧坐标后，先点采样身份。若当前与旧身份之差的绝对值大于 0.1，就放弃旧颜色，直接输出当前颜色和当前身份。

这一判断解决人物移开后露出墙面之类的问题：屏幕坐标可以找到，但旧位置的内容已经不适合当前表面。颜色相似也不能替代身份判断。

#### 身份通过以后，仍需限制旧颜色

旧 HDR 颜色采用过滤采样。当前颜色使用中心与四个半纹素对角样本，并应用当前参数为 0.6 的锐化。程序随后根据最大颜色分量把 HDR 压到较小计算范围，在该范围里建立可容许区间。

区间由当前对角邻居的最小值、最大值和亮度差扩张得到。旧颜色沿区间中心方向被裁剪到允许范围，再参与混合。其作用是防止旧颜色虽然属于允许的表面，却已经落后于新的照明或局部颜色变化。

身份拒绝回答“能否用”，颜色裁剪回答“允许用到什么值”。两者职责不同。

#### 把锐化、亮度扩张和方向裁剪写成完整计算

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

#### 运动量控制剩余历史的比例

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

#### 最后输出还受到覆盖标记控制

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

### 从历史结果到最终显示

主要历史融合完成后，画面仍会继续处理泛光、过滤、运动模糊与最终颜色。前面已经参与材质的角色查找表也不会因此消失：局部调色与最后整帧转换处于不同阶段。

所以本文中的材质双输出、眼睛前后图与最终图有明确分工。配对阶段图用于观察特定写入，最终图用于认识完整外观；它们不能作为某一个效果独立开启与关闭的实验。

这份分析已经展开烘焙光解码、灯光筛选、形变与细分、脸部阴影、眼睛查表以及历史主要规则。仍未完整覆盖的部分是所有材质变体、屏幕遮蔽内核、雾内部表示和跨帧缓存更新策略。连续运动中的闪烁与拖影也需要连续画面验证。

大厅与蕾米最终能够汇合，是因为各阶段约定了清楚的数据职责：几何保证形状一致，分类保证颜色解释正确，运动和身份保证历史对应正确。在这三个前提上，专用角色着色与场景照明才能进入同一条完整画面流程。

</div>
