---
title: "终末地渲染实现分析：竹林光照、角色着色与 HDR 后处理"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-30T19:33:44+08:00"
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

以竹林场景这份截帧为例，先统计人物、石质表面、地表与竹叶冠层资源，再用整帧流程定位执行阶段。正文按环境受光、阴影、接触暗部、反射、雾、人物外观、画面稳定、泛光与显示色彩组织，各效果内结合实际输入、计算过程与阶段对照展开分析。

<!-- more -->

<link rel="stylesheet" href="/css/rendering-articles.css?v=20260929-flow">

<div class="rendering-article">

<span id="frame"></span>

## 美术资源与渲染概况

![竹林最终画面：岩壁、石阶、人物与左侧金色效果](/images/rendering-analysis/endfield/final-output.png)

### 美术资源概况

- **人物先建立表面，再补专用照明。** 脸与身体有各自图集，同一几何会在主材质和后续着色中承担不同工作。
- **地表同时使用局部材质与大范围共享数据。** 2K 石质图集、8K 拼块资源、地表参数、纹理数组和深度在不同路径中组合。
- **竹林同时使用细叶片与低面数冠层。** 已定位的调用从每实例 12 个三角形到 6444 个三角形不等，实例数量也明显不同。

### 渲染分析概况

| 画面效果 | 本帧的主要实现 |
|---|---|
| 竹林环境受光 | 三层空间数据按位置与表面方向恢复低阶环境光 |
| 阴影与接触暗部 | 光源阴影控制受光，AO 经方向搜索、历史与保边过滤形成局部遮蔽 |
| 反射与空气层次 | 屏幕反射读取旧 HDR 并与环境探针混合，雾分别累积散射与透射 |
| 人物形变与外观 | 压缩方向与蒙皮建立表面，后续专用材质补入角色颜色 |
| 画面稳定与泛光 | 深度、运动和类别验证历史，HDR 融合后再进行多尺度亮部重建 |

### 样本条件

主视图与输出为 3440×1440，接口为 Vulkan。当前分析只对应这份竹林场景及其中人物；没有将另一角色展示场景的材质或后处理机制移入本文。

正文先用模型范围、纹理和实例统计解释资源，再用流程图定位阶段、按画面效果分析实现。阶段 HDR 对照使用相同显示范围，最终截图另作外观参照；所有辅助线框和算法示意均在图注中说明。

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
<figure><a href="/images/rendering-analysis/endfield/face-geometry.png"><img src="/images/rendering-analysis/endfield/face-geometry.png" alt="脸部主材质几何，放大到可辨认的范围。" loading="lazy" width="700" height="758"></a><figcaption>脸部主材质几何，放大到可辨认的范围。</figcaption></figure>
<figure><a href="/images/rendering-analysis/endfield/face-final.png"><img style="max-height:420px;object-fit:contain" src="/images/rendering-analysis/endfield/face-final.png" alt="相同位置的最终脸部与头饰；头发和饰件另行绘制。" loading="lazy" width="700" height="758"></a><figcaption>相同位置的最终脸部与头饰；头发和饰件另行绘制。</figcaption></figure>
<figure><a href="/images/rendering-analysis/endfield/body-geometry.png"><img src="/images/rendering-analysis/endfield/body-geometry.png" alt="身体这一组部件的几何范围，不包含人物全部部件。" loading="lazy" width="700" height="894"></a><figcaption>身体这一组部件的几何范围，不包含人物全部部件。</figcaption></figure>
<figure><a href="/images/rendering-analysis/endfield/body-final.png"><img style="max-height:420px;object-fit:contain" src="/images/rendering-analysis/endfield/body-final.png" alt="同一局部的最终人物外观。" loading="lazy" width="700" height="894"></a><figcaption>同一局部的最终人物外观。</figcaption></figure>
</div>

黄色线框只标出这次提交。脸部图与身体图各自保持与最终图一致的位置和裁切；早期尚未出现的头发、衣片或场景背景，不代表纹理丢失。后面的纹理清单覆盖四名角色，并合并核对各阶段绑定。

<span id="character-textures"></span>

#### 脸部、身体与其他角色的图集

这份竹林截帧中有四名角色。下面逐项列出人物材质绑定的 **136 份去重纹理资源**：覆盖主材质、后续受光、描边以及毛发和衣料的透明叠加阶段，也检查了这些资源在阴影与深度阶段的复用。立方体按一份六面资源计数；同一资源被不同部件或多个阶段复用时只列一次。这里的完整范围是当前截帧中的绑定资产，不能据此推断游戏安装包里所有角色资源。

[中央角色](#central-character-textures) · [左侧角色](#left-character-textures) · [后方角色](#rear-character-textures) · [右侧角色](#right-character-textures) · [共用图案与查表](#shared-character-textures)

底色、方向和控制图分别列出，尺寸与格式使用截帧中的实际规格。预览保留纹理坐标方向，脸部展开可能倒置；RGB 预览保留完整图集，最终轮廓还需要 alpha、覆盖控制或独立几何。窄条渐变和查色表仅纵向放大，便于阅读；它们不等于一张普通角色底图。

BC5 只储存两个方向通道，预览偏黄绿。毛发双方向图则使用 RG、BA 恢复两套方向。描边控制图在顶点阶段读取，不能漏掉，也不能把它当作普通表面 AO。

<span id="central-character-textures"></span>

##### 中央角色：脸、皮肤、装备、衣装与毛发

<figure><a href="/images/rendering-analysis/endfield/characters/central-final.png"><img src="/images/rendering-analysis/endfield/characters/central-final.png" alt="中央角色在本帧最终画面中的外观，用于定位下表资源所属角色。" loading="lazy" width="241" height="389"></a><figcaption>中央角色的最终局部。下表包含其多个材质部件；共用资源集中列在后表，并注明使用角色。</figcaption></figure>

| 输入 | 本次规格 | 职责与使用范围 | 贴图预览 |
|---|---|---|---|
| 脸部底色 | 1024×1024，BC7 sRGB | 对应部件的底色与图案；表中保留完整 UV 展开。 | <a href="/images/rendering-analysis/endfield/characters/central-face-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/central-face-colour.png" alt="脸部底色的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 脸部区域控制 | 256×256，BC7 | 面部区域权重，参与方向混合与明暗控制。 | <a href="/images/rendering-analysis/endfield/characters/central-face-control.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/central-face-control.png" alt="脸部区域控制的实际纹理预览" loading="lazy" width="256" height="256"></a> |
| 脸部明暗查询 | 1024×1024，RGBA8 | 用面部方向和光向相关坐标查询，参与脸部明暗边界。 | <a href="/images/rendering-analysis/endfield/characters/central-face-shadow.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/central-face-shadow.png" alt="脸部明暗查询的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 脸部局部细节 | 512×512，BC7 | 独立细节输入，按该部件的坐标与参数采样。 | <a href="/images/rendering-analysis/endfield/characters/central-face-detail.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/central-face-detail.png" alt="脸部局部细节的实际纹理预览" loading="lazy" width="512" height="512"></a> |
| 眼睛图案 | 512×512，BC7 sRGB | 对应部件的底色与图案；表中保留完整 UV 展开。 | <a href="/images/rendering-analysis/endfield/characters/central-eye-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/central-eye-colour.png" alt="眼睛图案的实际纹理预览" loading="lazy" width="512" height="512"></a> |
| 眼睛环境高光 | 256×256，BC7 sRGB | 按观察空间方向查询眼睛高光图案。 | <a href="/images/rendering-analysis/endfield/characters/central-eye-matcap.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/central-eye-matcap.png" alt="眼睛环境高光的实际纹理预览" loading="lazy" width="256" height="256"></a> |
| 皮肤与嘴部底色 | 1024×1024，BC7 sRGB | 对应部件的底色与图案；表中保留完整 UV 展开。 | <a href="/images/rendering-analysis/endfield/characters/central-skin-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/central-skin-colour.png" alt="皮肤与嘴部底色的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 皮肤方向 | 1024×1024，BC5 | 方向数据；BC5 以 RG 储存，须按对应材质解码后进入受光。 | <a href="/images/rendering-analysis/endfield/characters/central-skin-normal.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/central-skin-normal.png" alt="皮肤方向的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 身体装备图集底色 | 2048×2048，BC7 sRGB | 对应部件的底色与图案；表中保留完整 UV 展开。 | <a href="/images/rendering-analysis/endfield/characters/central-equipment-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/central-equipment-colour.png" alt="身体装备图集底色的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 身体装备图集方向 | 2048×2048，BC5 | 方向数据；BC5 以 RG 储存，须按对应材质解码后进入受光。 | <a href="/images/rendering-analysis/endfield/characters/central-equipment-normal.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/central-equipment-normal.png" alt="身体装备图集方向的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 身体装备图集控制 | 2048×2048，BC7 | 各通道供区域、遮蔽及材质响应分支使用；预览颜色不是表面颜色。 | <a href="/images/rendering-analysis/endfield/characters/central-equipment-control.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/central-equipment-control.png" alt="身体装备图集控制的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 服装与配件图集底色 | 2048×2048，BC7 sRGB | 对应部件的底色与图案；表中保留完整 UV 展开。 | <a href="/images/rendering-analysis/endfield/characters/central-cloth-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/central-cloth-colour.png" alt="服装与配件图集底色的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 服装与配件图集方向 | 2048×2048，BC5 | 方向数据；BC5 以 RG 储存，须按对应材质解码后进入受光。 | <a href="/images/rendering-analysis/endfield/characters/central-cloth-normal.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/central-cloth-normal.png" alt="服装与配件图集方向的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 服装与配件图集控制 | 2048×2048，BC7 | 各通道供区域、遮蔽及材质响应分支使用；预览颜色不是表面颜色。 | <a href="/images/rendering-analysis/endfield/characters/central-cloth-control.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/central-cloth-control.png" alt="服装与配件图集控制的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 服装与配件描边控制 | 512×512，BC7 | 后续顶点阶段采样；R 控制屏幕扩张幅度，G 参与深度偏移。 | <a href="/images/rendering-analysis/endfield/characters/central-cloth-outline.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/central-cloth-outline.png" alt="服装与配件描边控制的实际纹理预览" loading="lazy" width="512" height="512"></a> |
| 服装附加高光查表 | 256×256，RGBA8 | 二维高光颜色查表，输入来自方向及材质响应，不使用普通底色 UV。 | <a href="/images/rendering-analysis/endfield/characters/central-cloth-highlight.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/central-cloth-highlight.png" alt="服装附加高光查表的实际纹理预览" loading="lazy" width="256" height="256"></a> |
| 头发与耳部底色 | 2048×2048，BC7 sRGB | 对应部件的底色与图案；表中保留完整 UV 展开。 | <a href="/images/rendering-analysis/endfield/characters/central-hair-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/central-hair-colour.png" alt="头发与耳部底色的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 头发双方向编码 | 2048×2048，BC7 | RG 与 BA 分别恢复两套方向，供表面受光及毛发高光计算。 | <a href="/images/rendering-analysis/endfield/characters/central-hair-directions.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/central-hair-directions.png" alt="头发双方向编码的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 头发高光与区域控制 | 2048×2048，BC7 | 毛发区域、高光方向混合与响应控制；不是普通 RGB 法线。 | <a href="/images/rendering-analysis/endfield/characters/central-hair-control.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/central-hair-control.png" alt="头发高光与区域控制的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 头发高光查表 | 256×256，RGBA8 | 二维高光颜色查表，输入来自方向及材质响应，不使用普通底色 UV。 | <a href="/images/rendering-analysis/endfield/characters/central-hair-highlight.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/central-hair-highlight.png" alt="头发高光查表的实际纹理预览" loading="lazy" width="256" height="256"></a> |
| 头发描边控制 | 512×512，BC7 | 后续顶点阶段采样；R 控制屏幕扩张幅度，G 参与深度偏移。 | <a href="/images/rendering-analysis/endfield/characters/central-hair-outline.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/central-hair-outline.png" alt="头发描边控制的实际纹理预览" loading="lazy" width="512" height="512"></a> |
| 尾部与耳部毛绒底色 | 2048×2048，BC7 sRGB | 对应部件的底色与图案；表中保留完整 UV 展开。 | <a href="/images/rendering-analysis/endfield/characters/central-fur-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/central-fur-colour.png" alt="尾部与耳部毛绒底色的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 毛绒方向 | 2048×2048，BC5 | 方向数据；BC5 以 RG 储存，须按对应材质解码后进入受光。 | <a href="/images/rendering-analysis/endfield/characters/central-fur-normal.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/central-fur-normal.png" alt="毛绒方向的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 毛绒区域控制 | 2048×2048，BC7 | 各通道供区域、遮蔽及材质响应分支使用；预览颜色不是表面颜色。 | <a href="/images/rendering-analysis/endfield/characters/central-fur-control.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/central-fur-control.png" alt="毛绒区域控制的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 毛绒主材质覆盖控制 | 512×512，BC7 | 主材质读取 R 做阈值丢弃，并结合底色 alpha 建立毛绒覆盖。 | <a href="/images/rendering-analysis/endfield/characters/central-fur-coverage.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/central-fur-coverage.png" alt="毛绒主材质覆盖控制的实际纹理预览" loading="lazy" width="512" height="512"></a> |
| 毛绒高光查表 | 256×256，RGBA8 | 二维高光颜色查表，输入来自方向及材质响应，不使用普通底色 UV。 | <a href="/images/rendering-analysis/endfield/characters/central-fur-highlight.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/central-fur-highlight.png" alt="毛绒高光查表的实际纹理预览" loading="lazy" width="256" height="256"></a> |

<span id="left-character-textures"></span>

##### 左侧角色：脸、皮肤、外套、配件与织物

<figure><a href="/images/rendering-analysis/endfield/characters/left-final.png"><img src="/images/rendering-analysis/endfield/characters/left-final.png" alt="左侧角色在本帧最终画面中的外观，用于定位下表资源所属角色。" loading="lazy" width="249" height="332"></a><figcaption>左侧角色的最终局部。下表包含其多个材质部件；共用资源集中列在后表，并注明使用角色。</figcaption></figure>

| 输入 | 本次规格 | 职责与使用范围 | 贴图预览 |
|---|---|---|---|
| 脸部底色 | 1024×1024，BC7 sRGB | 对应部件的底色与图案；表中保留完整 UV 展开。 | <a href="/images/rendering-analysis/endfield/characters/left-face-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/left-face-colour.png" alt="脸部底色的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 眼睛图案 | 512×512，BC7 sRGB | 对应部件的底色与图案；表中保留完整 UV 展开。 | <a href="/images/rendering-analysis/endfield/characters/left-eye-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/left-eye-colour.png" alt="眼睛图案的实际纹理预览" loading="lazy" width="512" height="512"></a> |
| 眼睛环境高光 | 256×256，BC7 sRGB | 按观察空间方向查询眼睛高光图案。 | <a href="/images/rendering-analysis/endfield/characters/left-eye-matcap.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/left-eye-matcap.png" alt="眼睛环境高光的实际纹理预览" loading="lazy" width="256" height="256"></a> |
| 皮肤与嘴部底色 | 1024×1024，BC7 sRGB | 对应部件的底色与图案；表中保留完整 UV 展开。 | <a href="/images/rendering-analysis/endfield/characters/left-skin-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/left-skin-colour.png" alt="皮肤与嘴部底色的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 皮肤方向 | 1024×1024，BC5 | 方向数据；BC5 以 RG 储存，须按对应材质解码后进入受光。 | <a href="/images/rendering-analysis/endfield/characters/left-skin-normal.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/left-skin-normal.png" alt="皮肤方向的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 外套底色 | 2048×2048，BC7 sRGB | 对应部件的底色与图案；表中保留完整 UV 展开。 | <a href="/images/rendering-analysis/endfield/characters/left-coat-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/left-coat-colour.png" alt="外套底色的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 外套方向 | 2048×2048，BC5 | 方向数据；BC5 以 RG 储存，须按对应材质解码后进入受光。 | <a href="/images/rendering-analysis/endfield/characters/left-coat-normal.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/left-coat-normal.png" alt="外套方向的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 外套材质控制 | 2048×2048，BC7 | 各通道供区域、遮蔽及材质响应分支使用；预览颜色不是表面颜色。 | <a href="/images/rendering-analysis/endfield/characters/left-coat-control.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/left-coat-control.png" alt="外套材质控制的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 外套描边控制 | 512×512，BC7 | 后续顶点阶段采样；R 控制屏幕扩张幅度，G 参与深度偏移。 | <a href="/images/rendering-analysis/endfield/characters/left-coat-outline.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/left-coat-outline.png" alt="外套描边控制的实际纹理预览" loading="lazy" width="512" height="512"></a> |
| 外套透明层局部颜色 | 2048×2048，BC7 sRGB | 后续透明叠加路径的局部颜色输入，与主表面底色分开绑定。 | <a href="/images/rendering-analysis/endfield/characters/left-coat-overlay.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/left-coat-overlay.png" alt="外套透明层局部颜色的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 衣装与装备底色 | 2048×2048，BC7 sRGB | 对应部件的底色与图案；表中保留完整 UV 展开。 | <a href="/images/rendering-analysis/endfield/characters/left-equipment-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/left-equipment-colour.png" alt="衣装与装备底色的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 衣装与装备方向 | 2048×2048，BC5 | 方向数据；BC5 以 RG 储存，须按对应材质解码后进入受光。 | <a href="/images/rendering-analysis/endfield/characters/left-equipment-normal.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/left-equipment-normal.png" alt="衣装与装备方向的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 衣装与装备控制 | 2048×2048，BC7 | 各通道供区域、遮蔽及材质响应分支使用；预览颜色不是表面颜色。 | <a href="/images/rendering-analysis/endfield/characters/left-equipment-control.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/left-equipment-control.png" alt="衣装与装备控制的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 衣装与装备附加颜色 | 2048×2048，BC7 sRGB | 局部附加颜色／发光输入，黑色区域不提供该项颜色；是否显现还受当前参数控制。 | <a href="/images/rendering-analysis/endfield/characters/left-equipment-emission.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/left-equipment-emission.png" alt="衣装与装备附加颜色的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 衣装与装备描边控制 | 512×512，BC7 | 后续顶点阶段采样；R 控制屏幕扩张幅度，G 参与深度偏移。 | <a href="/images/rendering-analysis/endfield/characters/left-equipment-outline.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/left-equipment-outline.png" alt="衣装与装备描边控制的实际纹理预览" loading="lazy" width="512" height="512"></a> |
| 配件与腿部部件底色 | 1024×1024，BC7 sRGB | 对应部件的底色与图案；表中保留完整 UV 展开。 | <a href="/images/rendering-analysis/endfield/characters/left-accessory-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/left-accessory-colour.png" alt="配件与腿部部件底色的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 配件与腿部部件方向 | 1024×1024，BC5 | 方向数据；BC5 以 RG 储存，须按对应材质解码后进入受光。 | <a href="/images/rendering-analysis/endfield/characters/left-accessory-normal.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/left-accessory-normal.png" alt="配件与腿部部件方向的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 配件与腿部部件控制 | 1024×1024，BC7 | 各通道供区域、遮蔽及材质响应分支使用；预览颜色不是表面颜色。 | <a href="/images/rendering-analysis/endfield/characters/left-accessory-control.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/left-accessory-control.png" alt="配件与腿部部件控制的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 配件附加颜色 | 1024×1024，BC7 sRGB | 局部附加颜色／发光输入，黑色区域不提供该项颜色；是否显现还受当前参数控制。 | <a href="/images/rendering-analysis/endfield/characters/left-accessory-emission.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/left-accessory-emission.png" alt="配件附加颜色的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 腰间织物底色 | 2048×2048，BC7 sRGB | 对应部件的底色与图案；表中保留完整 UV 展开。 | <a href="/images/rendering-analysis/endfield/characters/left-fabric-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/left-fabric-colour.png" alt="腰间织物底色的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 腰间织物细节方向 | 512×512，BC7 sRGB | 此资源虽以 sRGB 格式绑定，当前路径仍将其用于细节方向；不能按外观当作底色。 | <a href="/images/rendering-analysis/endfield/characters/left-fabric-normal.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/left-fabric-normal.png" alt="腰间织物细节方向的实际纹理预览" loading="lazy" width="512" height="512"></a> |
| 腰间织物表面细节 | 1024×1024，BC7 sRGB | 独立细节输入，按该部件的坐标与参数采样。 | <a href="/images/rendering-analysis/endfield/characters/left-fabric-detail.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/left-fabric-detail.png" alt="腰间织物表面细节的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 织物顶点与像素共用扰动 | 512×512，BC7 sRGB | 同一纹理同时进入织物顶点和像素阶段的扰动计算。 | <a href="/images/rendering-analysis/endfield/characters/left-fabric-displacement.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/left-fabric-displacement.png" alt="织物顶点与像素共用扰动的实际纹理预览" loading="lazy" width="512" height="512"></a> |
| 织物覆盖噪声 | 1024×1024，BC7 sRGB | 透明织物路径的空间变化输入，控制局部纹理变化。 | <a href="/images/rendering-analysis/endfield/characters/left-fabric-noise.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/left-fabric-noise.png" alt="织物覆盖噪声的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 织物局部图案 | 512×512，BC7 sRGB | 局部图案／覆盖权重，供叠加分支使用。 | <a href="/images/rendering-analysis/endfield/characters/left-fabric-shape.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/left-fabric-shape.png" alt="织物局部图案的实际纹理预览" loading="lazy" width="512" height="512"></a> |
| 织物多通道扰动 | 512×512，BC7 | 透明织物路径的多通道细节输入，需与同组图案、噪声共同读取。 | <a href="/images/rendering-analysis/endfield/characters/left-fabric-distortion.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/left-fabric-distortion.png" alt="织物多通道扰动的实际纹理预览" loading="lazy" width="512" height="512"></a> |
| 头发底色 | 2048×2048，BC7 sRGB | 对应部件的底色与图案；表中保留完整 UV 展开。 | <a href="/images/rendering-analysis/endfield/characters/left-hair-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/left-hair-colour.png" alt="头发底色的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 头发双方向编码 | 2048×2048，BC7 | RG 与 BA 分别恢复两套方向，供表面受光及毛发高光计算。 | <a href="/images/rendering-analysis/endfield/characters/left-hair-directions.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/left-hair-directions.png" alt="头发双方向编码的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 头发高光与区域控制 | 2048×2048，BC7 | 毛发区域、高光方向混合与响应控制；不是普通 RGB 法线。 | <a href="/images/rendering-analysis/endfield/characters/left-hair-control.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/left-hair-control.png" alt="头发高光与区域控制的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 头发高光查表 | 256×256，RGBA8 | 二维高光颜色查表，输入来自方向及材质响应，不使用普通底色 UV。 | <a href="/images/rendering-analysis/endfield/characters/left-hair-highlight.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/left-hair-highlight.png" alt="头发高光查表的实际纹理预览" loading="lazy" width="256" height="256"></a> |
| 头发描边控制 | 512×512，BC7 | 后续顶点阶段采样；R 控制屏幕扩张幅度，G 参与深度偏移。 | <a href="/images/rendering-analysis/endfield/characters/left-hair-outline.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/left-hair-outline.png" alt="头发描边控制的实际纹理预览" loading="lazy" width="512" height="512"></a> |
| 头发透明层独立方向 | 2048×2048，BC5 | 方向数据；BC5 以 RG 储存，须按对应材质解码后进入受光。 | <a href="/images/rendering-analysis/endfield/characters/left-hair-overlay-normal.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/left-hair-overlay-normal.png" alt="头发透明层独立方向的实际纹理预览" loading="lazy" width="600" height="600"></a> |

<span id="rear-character-textures"></span>

##### 后方角色：脸、皮肤、服装与随身物件

<figure><a href="/images/rendering-analysis/endfield/characters/rear-final.png"><img src="/images/rendering-analysis/endfield/characters/rear-final.png" alt="后方角色在本帧最终画面中的外观，用于定位下表资源所属角色。" loading="lazy" width="158" height="223"></a><figcaption>后方角色的最终局部。下表包含其多个材质部件；共用资源集中列在后表，并注明使用角色。</figcaption></figure>

| 输入 | 本次规格 | 职责与使用范围 | 贴图预览 |
|---|---|---|---|
| 脸部底色 | 1024×1024，BC7 sRGB | 对应部件的底色与图案；表中保留完整 UV 展开。 | <a href="/images/rendering-analysis/endfield/characters/rear-face-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/rear-face-colour.png" alt="脸部底色的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 眼睛图案 | 512×512，BC7 sRGB | 对应部件的底色与图案；表中保留完整 UV 展开。 | <a href="/images/rendering-analysis/endfield/characters/rear-eye-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/rear-eye-colour.png" alt="眼睛图案的实际纹理预览" loading="lazy" width="512" height="512"></a> |
| 皮肤与嘴部底色 | 1024×1024，BC7 sRGB | 对应部件的底色与图案；表中保留完整 UV 展开。 | <a href="/images/rendering-analysis/endfield/characters/rear-skin-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/rear-skin-colour.png" alt="皮肤与嘴部底色的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 皮肤方向 | 1024×1024，BC5 | 方向数据；BC5 以 RG 储存，须按对应材质解码后进入受光。 | <a href="/images/rendering-analysis/endfield/characters/rear-skin-normal.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/rear-skin-normal.png" alt="皮肤方向的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 上身硬质部件底色 | 2048×2048，BC7 sRGB | 对应部件的底色与图案；表中保留完整 UV 展开。 | <a href="/images/rendering-analysis/endfield/characters/rear-equipment-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/rear-equipment-colour.png" alt="上身硬质部件底色的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 上身硬质部件方向 | 2048×2048，BC5 | 方向数据；BC5 以 RG 储存，须按对应材质解码后进入受光。 | <a href="/images/rendering-analysis/endfield/characters/rear-equipment-normal.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/rear-equipment-normal.png" alt="上身硬质部件方向的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 上身硬质部件控制 | 2048×2048，BC7 | 各通道供区域、遮蔽及材质响应分支使用；预览颜色不是表面颜色。 | <a href="/images/rendering-analysis/endfield/characters/rear-equipment-control.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/rear-equipment-control.png" alt="上身硬质部件控制的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 裙装与服装部件底色 | 2048×2048，BC7 sRGB | 对应部件的底色与图案；表中保留完整 UV 展开。 | <a href="/images/rendering-analysis/endfield/characters/rear-skirt-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/rear-skirt-colour.png" alt="裙装与服装部件底色的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 裙装与服装部件方向 | 2048×2048，BC5 | 方向数据；BC5 以 RG 储存，须按对应材质解码后进入受光。 | <a href="/images/rendering-analysis/endfield/characters/rear-skirt-normal.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/rear-skirt-normal.png" alt="裙装与服装部件方向的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 裙装与服装部件控制 | 2048×2048，BC7 | 各通道供区域、遮蔽及材质响应分支使用；预览颜色不是表面颜色。 | <a href="/images/rendering-analysis/endfield/characters/rear-skirt-control.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/rear-skirt-control.png" alt="裙装与服装部件控制的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 服装局部附加颜色 | 1024×1024，BC7 sRGB | 局部附加颜色／发光输入，黑色区域不提供该项颜色；是否显现还受当前参数控制。 | <a href="/images/rendering-analysis/endfield/characters/rear-skirt-emission.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/rear-skirt-emission.png" alt="服装局部附加颜色的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 服装叠加图案 | 512×512，BC7 sRGB | 独立叠加图案，按部件参数和坐标参与局部效果。 | <a href="/images/rendering-analysis/endfield/characters/rear-skirt-pattern.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/rear-skirt-pattern.png" alt="服装叠加图案的实际纹理预览" loading="lazy" width="512" height="512"></a> |
| 服装叠加遮罩 | 1024×1024，BC7 | 局部图案／覆盖权重，供叠加分支使用。 | <a href="/images/rendering-analysis/endfield/characters/rear-skirt-mask.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/rear-skirt-mask.png" alt="服装叠加遮罩的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 上衣与装备底色 | 2048×2048，BC7 sRGB | 对应部件的底色与图案；表中保留完整 UV 展开。 | <a href="/images/rendering-analysis/endfield/characters/rear-jacket-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/rear-jacket-colour.png" alt="上衣与装备底色的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 上衣与装备方向 | 2048×2048，BC5 | 方向数据；BC5 以 RG 储存，须按对应材质解码后进入受光。 | <a href="/images/rendering-analysis/endfield/characters/rear-jacket-normal.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/rear-jacket-normal.png" alt="上衣与装备方向的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 上衣与装备控制 | 2048×2048，BC7 | 各通道供区域、遮蔽及材质响应分支使用；预览颜色不是表面颜色。 | <a href="/images/rendering-analysis/endfield/characters/rear-jacket-control.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/rear-jacket-control.png" alt="上衣与装备控制的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 上衣局部附加颜色 | 1024×1024，BC7 sRGB | 局部附加颜色／发光输入，黑色区域不提供该项颜色；是否显现还受当前参数控制。 | <a href="/images/rendering-analysis/endfield/characters/rear-jacket-emission.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/rear-jacket-emission.png" alt="上衣局部附加颜色的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 随身毛绒小物底色 | 2048×2048，BC7 sRGB | 对应部件的底色与图案；表中保留完整 UV 展开。 | <a href="/images/rendering-analysis/endfield/characters/rear-plush-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/rear-plush-colour.png" alt="随身毛绒小物底色的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 随身毛绒小物方向 | 2048×2048，BC5 | 方向数据；BC5 以 RG 储存，须按对应材质解码后进入受光。 | <a href="/images/rendering-analysis/endfield/characters/rear-plush-normal.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/rear-plush-normal.png" alt="随身毛绒小物方向的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 随身毛绒小物控制 | 2048×2048，BC7 | 各通道供区域、遮蔽及材质响应分支使用；预览颜色不是表面颜色。 | <a href="/images/rendering-analysis/endfield/characters/rear-plush-control.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/rear-plush-control.png" alt="随身毛绒小物控制的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 手边小物底色 | 1024×1024，BC7 sRGB | 对应部件的底色与图案；表中保留完整 UV 展开。 | <a href="/images/rendering-analysis/endfield/characters/rear-prop-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/rear-prop-colour.png" alt="手边小物底色的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 手边小物方向 | 1024×1024，BC5 | 方向数据；BC5 以 RG 储存，须按对应材质解码后进入受光。 | <a href="/images/rendering-analysis/endfield/characters/rear-prop-normal.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/rear-prop-normal.png" alt="手边小物方向的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 手边小物控制 | 1024×1024，BC7 | 各通道供区域、遮蔽及材质响应分支使用；预览颜色不是表面颜色。 | <a href="/images/rendering-analysis/endfield/characters/rear-prop-control.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/rear-prop-control.png" alt="手边小物控制的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 同组小物另一颜色输入 | 1024×1024，BC7 sRGB | 对应部件的底色与图案；表中保留完整 UV 展开。 | <a href="/images/rendering-analysis/endfield/characters/rear-prop-overlay-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/rear-prop-overlay-colour.png" alt="同组小物另一颜色输入的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 同组小物附加几何图案 | 128×128，BC7 sRGB | 独立叠加图案，按部件参数和坐标参与局部效果。 | <a href="/images/rendering-analysis/endfield/characters/rear-prop-pattern.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/rear-prop-pattern.png" alt="同组小物附加几何图案的实际纹理预览" loading="lazy" width="128" height="128"></a> |
| 头发底色 | 2048×2048，BC7 sRGB | 对应部件的底色与图案；表中保留完整 UV 展开。 | <a href="/images/rendering-analysis/endfield/characters/rear-hair-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/rear-hair-colour.png" alt="头发底色的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 头发双方向编码 | 2048×2048，BC7 | RG 与 BA 分别恢复两套方向，供表面受光及毛发高光计算。 | <a href="/images/rendering-analysis/endfield/characters/rear-hair-directions.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/rear-hair-directions.png" alt="头发双方向编码的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 头发高光与区域控制 | 2048×2048，BC7 | 毛发区域、高光方向混合与响应控制；不是普通 RGB 法线。 | <a href="/images/rendering-analysis/endfield/characters/rear-hair-control.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/rear-hair-control.png" alt="头发高光与区域控制的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 头发高光查表 | 256×256，RGBA8 | 二维高光颜色查表，输入来自方向及材质响应，不使用普通底色 UV。 | <a href="/images/rendering-analysis/endfield/characters/rear-hair-highlight.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/rear-hair-highlight.png" alt="头发高光查表的实际纹理预览" loading="lazy" width="256" height="256"></a> |
| 头发描边控制 | 512×512，BC7 | 后续顶点阶段采样；R 控制屏幕扩张幅度，G 参与深度偏移。 | <a href="/images/rendering-analysis/endfield/characters/rear-hair-outline.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/rear-hair-outline.png" alt="头发描边控制的实际纹理预览" loading="lazy" width="512" height="512"></a> |

<span id="right-character-textures"></span>

##### 右侧角色：脸、皮肤、内层服装、外套与长发

<figure><a href="/images/rendering-analysis/endfield/characters/right-final.png"><img src="/images/rendering-analysis/endfield/characters/right-final.png" alt="右侧角色在本帧最终画面中的外观，用于定位下表资源所属角色。" loading="lazy" width="309" height="425"></a><figcaption>右侧角色的最终局部。下表包含其多个材质部件；共用资源集中列在后表，并注明使用角色。</figcaption></figure>

| 输入 | 本次规格 | 职责与使用范围 | 贴图预览 |
|---|---|---|---|
| 脸部底色 | 1024×1024，BC7 sRGB | 对应部件的底色与图案；表中保留完整 UV 展开。 | <a href="/images/rendering-analysis/endfield/characters/right-face-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/right-face-colour.png" alt="脸部底色的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 脸部方向 | 1024×1024，BC5 | 方向数据；BC5 以 RG 储存，须按对应材质解码后进入受光。 | <a href="/images/rendering-analysis/endfield/characters/right-face-normal.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/right-face-normal.png" alt="脸部方向的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 脸部明暗查询 | 1024×1024，RGBA8 | 用面部方向和光向相关坐标查询，参与脸部明暗边界。 | <a href="/images/rendering-analysis/endfield/characters/right-face-shadow.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/right-face-shadow.png" alt="脸部明暗查询的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 眼睛图案 | 512×512，BC7 sRGB | 对应部件的底色与图案；表中保留完整 UV 展开。 | <a href="/images/rendering-analysis/endfield/characters/right-eye-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/right-eye-colour.png" alt="眼睛图案的实际纹理预览" loading="lazy" width="512" height="512"></a> |
| 皮肤与颈部底色 | 512×512，BC7 sRGB | 对应部件的底色与图案；表中保留完整 UV 展开。 | <a href="/images/rendering-analysis/endfield/characters/right-skin-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/right-skin-colour.png" alt="皮肤与颈部底色的实际纹理预览" loading="lazy" width="512" height="512"></a> |
| 皮肤与颈部方向 | 512×512，BC5 | 方向数据；BC5 以 RG 储存，须按对应材质解码后进入受光。 | <a href="/images/rendering-analysis/endfield/characters/right-skin-normal.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/right-skin-normal.png" alt="皮肤与颈部方向的实际纹理预览" loading="lazy" width="512" height="512"></a> |
| 身体内层服装底色 | 2048×2048，BC7 sRGB | 对应部件的底色与图案；表中保留完整 UV 展开。 | <a href="/images/rendering-analysis/endfield/characters/right-cloth-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/right-cloth-colour.png" alt="身体内层服装底色的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 身体内层服装方向 | 2048×2048，BC5 | 方向数据；BC5 以 RG 储存，须按对应材质解码后进入受光。 | <a href="/images/rendering-analysis/endfield/characters/right-cloth-normal.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/right-cloth-normal.png" alt="身体内层服装方向的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 身体内层服装控制 | 2048×2048，BC7 | 各通道供区域、遮蔽及材质响应分支使用；预览颜色不是表面颜色。 | <a href="/images/rendering-analysis/endfield/characters/right-cloth-control.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/right-cloth-control.png" alt="身体内层服装控制的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 局部服装高光查表 | 256×256，RGBA8 | 二维高光颜色查表，输入来自方向及材质响应，不使用普通底色 UV。 | <a href="/images/rendering-analysis/endfield/characters/right-cloth-highlight.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/right-cloth-highlight.png" alt="局部服装高光查表的实际纹理预览" loading="lazy" width="256" height="256"></a> |
| 外套与装备底色 | 2048×2048，BC7 sRGB | 对应部件的底色与图案；表中保留完整 UV 展开。 | <a href="/images/rendering-analysis/endfield/characters/right-coat-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/right-coat-colour.png" alt="外套与装备底色的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 外套与装备方向 | 2048×2048，BC5 | 方向数据；BC5 以 RG 储存，须按对应材质解码后进入受光。 | <a href="/images/rendering-analysis/endfield/characters/right-coat-normal.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/right-coat-normal.png" alt="外套与装备方向的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 外套与装备控制 | 2048×2048，BC7 | 各通道供区域、遮蔽及材质响应分支使用；预览颜色不是表面颜色。 | <a href="/images/rendering-analysis/endfield/characters/right-coat-control.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/right-coat-control.png" alt="外套与装备控制的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 外套与装备附加颜色 | 2048×2048，BC7 sRGB | 局部附加颜色／发光输入，黑色区域不提供该项颜色；是否显现还受当前参数控制。 | <a href="/images/rendering-analysis/endfield/characters/right-coat-emission.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/right-coat-emission.png" alt="外套与装备附加颜色的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 长发底色 | 2048×2048，BC7 sRGB | 对应部件的底色与图案；表中保留完整 UV 展开。 | <a href="/images/rendering-analysis/endfield/characters/right-hair-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/right-hair-colour.png" alt="长发底色的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 长发双方向编码 | 2048×2048，BC7 | RG 与 BA 分别恢复两套方向，供表面受光及毛发高光计算。 | <a href="/images/rendering-analysis/endfield/characters/right-hair-directions.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/right-hair-directions.png" alt="长发双方向编码的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 长发高光与区域控制 | 2048×2048，BC7 | 毛发区域、高光方向混合与响应控制；不是普通 RGB 法线。 | <a href="/images/rendering-analysis/endfield/characters/right-hair-control.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/right-hair-control.png" alt="长发高光与区域控制的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 长发高光查表 | 256×256，RGBA8 | 二维高光颜色查表，输入来自方向及材质响应，不使用普通底色 UV。 | <a href="/images/rendering-analysis/endfield/characters/right-hair-highlight.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/right-hair-highlight.png" alt="长发高光查表的实际纹理预览" loading="lazy" width="256" height="256"></a> |
| 长发描边控制 | 512×512，BC7 | 后续顶点阶段采样；R 控制屏幕扩张幅度，G 参与深度偏移。 | <a href="/images/rendering-analysis/endfield/characters/right-hair-outline.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/right-hair-outline.png" alt="长发描边控制的实际纹理预览" loading="lazy" width="512" height="512"></a> |

<span id="shared-character-textures"></span>

##### 共用图案、专用查表与默认资源

这里同时收录跨角色复用的纹理和便于比较而集中展示的专用查表。“使用角色”明确当前绑定关系，不能把每一张都理解为四名角色通用。不同资源即使预览相似，也保留各自条目。屏幕深度、阴影、环境体积和累积雾等运行时结果见下方接入表。

| 输入 | 本次规格 | 职责与使用范围 | 贴图预览 |
|---|---|---|---|
| 共用脸部区域控制 | 256×256，BC7 | 面部区域权重，参与方向混合与明暗控制。 使用：左侧角色、后方角色、右侧角色。 | <a href="/images/rendering-analysis/endfield/characters/shared-face-control.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/shared-face-control.png" alt="共用脸部区域控制的实际纹理预览" loading="lazy" width="256" height="256"></a> |
| 左侧与后方角色明暗查询 | 1024×1024，RGBA8 | 用面部方向和光向相关坐标查询，参与脸部明暗边界。 使用：左侧角色、后方角色。 | <a href="/images/rendering-analysis/endfield/characters/shared-face-shadow.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/shared-face-shadow.png" alt="左侧与后方角色明暗查询的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 面部局部颜色图集 | 1024×1024，BC7 sRGB | 面部局部颜色按 2×2 图集选区，alpha 参与叠加权重。 使用：中央角色、左侧角色、后方角色、右侧角色。 | <a href="/images/rendering-analysis/endfield/characters/shared-face-expression.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/shared-face-expression.png" alt="面部局部颜色图集的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 面部描边控制 | 128×128，BC7 | 后续顶点阶段采样；R 控制屏幕扩张幅度，G 参与深度偏移。 使用：中央角色、左侧角色、后方角色、右侧角色。 | <a href="/images/rendering-analysis/endfield/characters/shared-face-outline.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/shared-face-outline.png" alt="面部描边控制的实际纹理预览" loading="lazy" width="128" height="128"></a> |
| 右侧与后方角色眼睛高光 | 256×256，BC7 sRGB | 按观察空间方向查询眼睛高光图案。 使用：后方角色、右侧角色。 | <a href="/images/rendering-analysis/endfield/characters/shared-eye-matcap.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/shared-eye-matcap.png" alt="右侧与后方角色眼睛高光的实际纹理预览" loading="lazy" width="256" height="256"></a> |
| 肤色等材质查色表 | 1024×32，BC7 sRGB | 将颜色映射到 32 个切片组成的二维查色表，并在相邻切片之间插值。 使用：中央角色、左侧角色、后方角色。 | <a href="/images/rendering-analysis/endfield/characters/shared-colour-lut-skin.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/shared-colour-lut-skin.png" alt="肤色等材质查色表的实际纹理预览" loading="lazy" width="600" height="80"></a> |
| 右侧角色皮肤与脸部查色表 | 1024×32，BC7 sRGB | 将颜色映射到 32 个切片组成的二维查色表，并在相邻切片之间插值。 使用：右侧角色。 | <a href="/images/rendering-analysis/endfield/characters/shared-colour-lut-face.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/shared-colour-lut-face.png" alt="右侧角色皮肤与脸部查色表的实际纹理预览" loading="lazy" width="600" height="80"></a> |
| 毛发及附加材质查色表 | 1024×32，BC7 sRGB | 将颜色映射到 32 个切片组成的二维查色表，并在相邻切片之间插值。 使用：中央角色、左侧角色、后方角色。 | <a href="/images/rendering-analysis/endfield/characters/shared-colour-lut-hair.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/shared-colour-lut-hair.png" alt="毛发及附加材质查色表的实际纹理预览" loading="lazy" width="600" height="80"></a> |
| 面部附加层查色表 | 1024×32，BC7 sRGB | 将颜色映射到 32 个切片组成的二维查色表，并在相邻切片之间插值。 使用：中央角色、左侧角色。 | <a href="/images/rendering-analysis/endfield/characters/shared-colour-lut-overlay.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/shared-colour-lut-overlay.png" alt="面部附加层查色表的实际纹理预览" loading="lazy" width="600" height="80"></a> |
| 通用表面高光查表 | 256×256，RGBA8 | 二维高光颜色查表，输入来自方向及材质响应，不使用普通底色 UV。 使用：中央角色、左侧角色、后方角色、右侧角色。 | <a href="/images/rendering-analysis/endfield/characters/shared-surface-highlight.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/shared-surface-highlight.png" alt="通用表面高光查表的实际纹理预览" loading="lazy" width="256" height="256"></a> |
| 服装明暗渐变 | 256×1，RGBA8 | 按受光方向等标量查询的明暗颜色曲线；原资源只有一行。 使用：中央角色、左侧角色、后方角色、右侧角色。 | <a href="/images/rendering-analysis/endfield/characters/shared-ramp-cloth.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/shared-ramp-cloth.png" alt="服装明暗渐变的实际纹理预览" loading="lazy" width="256" height="32"></a> |
| 皮肤与眼睛明暗渐变 | 256×1，RGBA8 | 按受光方向等标量查询的明暗颜色曲线；原资源只有一行。 使用：中央角色、左侧角色、后方角色、右侧角色。 | <a href="/images/rendering-analysis/endfield/characters/shared-ramp-skin.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/shared-ramp-skin.png" alt="皮肤与眼睛明暗渐变的实际纹理预览" loading="lazy" width="256" height="32"></a> |
| 脸部与部分皮肤明暗渐变 | 256×1，RGBA8 | 按受光方向等标量查询的明暗颜色曲线；原资源只有一行。 使用：中央角色、左侧角色、后方角色、右侧角色。 | <a href="/images/rendering-analysis/endfield/characters/shared-ramp-face.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/shared-ramp-face.png" alt="脸部与部分皮肤明暗渐变的实际纹理预览" loading="lazy" width="256" height="32"></a> |
| 头发明暗渐变 | 256×1，RGBA8 | 按受光方向等标量查询的明暗颜色曲线；原资源只有一行。 使用：中央角色、左侧角色、后方角色、右侧角色。 | <a href="/images/rendering-analysis/endfield/characters/shared-ramp-hair.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/shared-ramp-hair.png" alt="头发明暗渐变的实际纹理预览" loading="lazy" width="256" height="32"></a> |
| 毛绒与透明层明暗渐变 | 256×1，RGBA8 | 按受光方向等标量查询的明暗颜色曲线；原资源只有一行。 使用：中央角色、左侧角色。 | <a href="/images/rendering-analysis/endfield/characters/shared-ramp-fur.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/shared-ramp-fur.png" alt="毛绒与透明层明暗渐变的实际纹理预览" loading="lazy" width="256" height="32"></a> |
| 左侧织物明暗渐变 | 256×1，RGBA8 | 按受光方向等标量查询的明暗颜色曲线；原资源只有一行。 使用：左侧角色。 | <a href="/images/rendering-analysis/endfield/characters/shared-ramp-fabric.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/shared-ramp-fabric.png" alt="左侧织物明暗渐变的实际纹理预览" loading="lazy" width="256" height="32"></a> |
| 左侧外套明暗渐变 | 256×1，RGBA8 | 按受光方向等标量查询的明暗颜色曲线；原资源只有一行。 使用：左侧角色。 | <a href="/images/rendering-analysis/endfield/characters/shared-ramp-coat.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/shared-ramp-coat.png" alt="左侧外套明暗渐变的实际纹理预览" loading="lazy" width="256" height="32"></a> |
| 后方毛绒小物明暗渐变 | 256×1，RGBA8 | 按受光方向等标量查询的明暗颜色曲线；原资源只有一行。 使用：后方角色。 | <a href="/images/rendering-analysis/endfield/characters/shared-ramp-plush.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/shared-ramp-plush.png" alt="后方毛绒小物明暗渐变的实际纹理预览" loading="lazy" width="256" height="32"></a> |
| 左侧腿部部件明暗渐变 | 256×1，RGBA8 | 按受光方向等标量查询的明暗颜色曲线；原资源只有一行。 使用：左侧角色。 | <a href="/images/rendering-analysis/endfield/characters/shared-ramp-accessory.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/shared-ramp-accessory.png" alt="左侧腿部部件明暗渐变的实际纹理预览" loading="lazy" width="256" height="32"></a> |
| 后方服装透明层明暗渐变 | 256×1，RGBA8 | 按受光方向等标量查询的明暗颜色曲线；原资源只有一行。 使用：后方角色。 | <a href="/images/rendering-analysis/endfield/characters/shared-ramp-transparent.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/shared-ramp-transparent.png" alt="后方服装透明层明暗渐变的实际纹理预览" loading="lazy" width="256" height="32"></a> |
| 默认白色输入 | 4×4，RGBA8 sRGB | 4×4 白色常量资源，在若干默认颜色及材质分支中复用。 使用：中央角色、左侧角色、后方角色、右侧角色。 | <a href="/images/rendering-analysis/endfield/characters/shared-white.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/shared-white.png" alt="默认白色输入的实际纹理预览" loading="lazy" width="4" height="4"></a> |
| 角色共用空间变化输入 | 512×512，BC7 | 角色表面修饰分支共用的空间图案输入；具体可见强度由材质参数决定。 使用：中央角色、左侧角色、后方角色、右侧角色。 | <a href="/images/rendering-analysis/endfield/characters/shared-surface-noise.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/shared-surface-noise.png" alt="角色共用空间变化输入的实际纹理预览" loading="lazy" width="512" height="512"></a> |
| 面部共用局部方向输入 | 256×256，BC7 | 角色表面修饰分支共用的空间图案输入；具体可见强度由材质参数决定。 使用：中央角色、左侧角色、后方角色、右侧角色。 | <a href="/images/rendering-analysis/endfield/characters/shared-face-surface-detail.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/shared-face-surface-detail.png" alt="面部共用局部方向输入的实际纹理预览" loading="lazy" width="256" height="256"></a> |
| 面部共用条纹输入 | 256×256，BC7 | 角色表面修饰分支共用的空间图案输入；具体可见强度由材质参数决定。 使用：中央角色、左侧角色、后方角色、右侧角色。 | <a href="/images/rendering-analysis/endfield/characters/shared-face-streak.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/shared-face-streak.png" alt="面部共用条纹输入的实际纹理预览" loading="lazy" width="256" height="256"></a> |
| 身体共用条纹输入 | 256×256，BC7 | 角色表面修饰分支共用的空间图案输入；具体可见强度由材质参数决定。 使用：中央角色、左侧角色、后方角色、右侧角色。 | <a href="/images/rendering-analysis/endfield/characters/shared-surface-streak.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/shared-surface-streak.png" alt="身体共用条纹输入的实际纹理预览" loading="lazy" width="256" height="256"></a> |
| 身体共用表面细节输入 | 1024×1024，BC7 | 角色表面修饰分支共用的空间图案输入；具体可见强度由材质参数决定。 使用：中央角色、左侧角色、后方角色、右侧角色。 | <a href="/images/rendering-analysis/endfield/characters/shared-surface-detail.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/shared-surface-detail.png" alt="身体共用表面细节输入的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 身体材质环境立方体 | 128×128×6 面，BC6 无符号浮点 | 六面环境颜色，供身体等材质的环境镜面项采样；预览按 0—1 范围显示。 使用：中央角色、左侧角色、后方角色、右侧角色。 | <a href="/images/rendering-analysis/endfield/characters/shared-environment-cube.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/shared-environment-cube.png" alt="身体材质环境立方体的实际纹理预览" loading="lazy" width="384" height="256"></a> |
| 透明阶段共用空间图案 | 1024×1024，BC7 sRGB | 角色表面修饰分支共用的空间图案输入；具体可见强度由材质参数决定。 使用：中央角色、左侧角色、后方角色、右侧角色。 | <a href="/images/rendering-analysis/endfield/characters/shared-transparent-pattern.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/shared-transparent-pattern.png" alt="透明阶段共用空间图案的实际纹理预览" loading="lazy" width="600" height="600"></a> |
| 毛发共用细条纹 | 512×512，BC7 | 按毛发 UV 缩放采样的细条纹，参与细束高光变化。 使用：中央角色、左侧角色、后方角色、右侧角色。 | <a href="/images/rendering-analysis/endfield/characters/shared-hair-strands.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/characters/shared-hair-strands.png" alt="毛发共用细条纹的实际纹理预览" loading="lazy" width="512" height="512"></a> |

##### 运行时照明与屏幕输入怎样接到角色

这些输入也确实被人物程序读取，但由本帧或已有环境状态生成，与上表的固定材质资产承担不同职责。它们在各自的效果章节中配图展开，不混入某名角色的底色或法线清单。

| 输入 | 本帧规格 | 角色侧的用途 |
|---|---|---|
| 屏幕遮蔽及相关控制 | 3440×1440，RG8 | 接入已有表面遮蔽条件，见[接触暗部](#ao) |
| 光源阴影 | 6144×4096，D16 | 判断主光等受光是否被遮挡，见[阴影](#shadows) |
| 三层环境幅度与方向 | 每层 128×64×128 幅度、128×192×128 方向，共六份体积 | 按角色表面位置与方向查询环境照明，见[环境光](#environment-volume) |
| 累积雾 | 313×180×128，RGBA16F | 角色按自身深度合成空气颜色与透射，见[体积雾](#fog) |
| 屏幕深度与阶段辅助目标 | 主视图尺寸 | 毛发、描边及透明叠加路径的深度关系和合成条件 |

同一张身体底图会在主材质、后续着色、描边或透明层中再次出现。只有把这些阶段合在一起检查，才能同时看到底色、法线、控制、查表和扩张遮罩；仅截取某一次颜色绘制的绑定列表会遗漏其他输入。

#### 输入流同时包含浮点和压缩属性

中央身体绘制的输入包括 12 字节浮点位置、双通道 32 位浮点坐标、4 字节带符号归一化向量，以及四通道 16 位归一化和四通道 8 位整数属性；还存在独立的归一化颜色类输入。

这些布局分别承载位置、压缩方向、坐标、骨骼权重与索引等输入。对照相同原始程序的语义还原，可以确认压缩切线基和一、二、四影响蒙皮的分支；后文展开解码及当前／旧位置如何生成。输入精度、字段含义与实际选择的分支需要一起理解。

人物可见几何建立后，晚些时候的着色可以用相等深度测试找到同一表面，再把空间环境光、阴影和雾的结果接入。资源拆分、可见性与后续着色是连续关系，不能只看最后一次绘制的纹理列表就推断整个人物的生产流程。

### 地表与石质场景资源

#### 地表资源需要按实际表面定位

前景石阶、远处石质构件与复用地表数据的小几何不是同一个资源对象。远景提交读取的石砖图集不能用来说明整片前景石阶的材质。下面以已经定位的共享地表路径说明其图集、数组与屏幕输入；仍未确认全部前景表面各自使用哪一块图集。

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

#### 植被图必须结合覆盖通道显示

| 植被资源 | 颜色与控制尺寸 | 颜色预览 |
|---|---|---|
| 树冠组 A | 两张 512×512，颜色为 BC7 sRGB，控制为 BC7 | <a href="/images/rendering-analysis/endfield/foliage-a-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/foliage-a-colour.png" alt="本行资源的实际贴图预览" loading="lazy" width="700" height="700"></a> |
| 竹叶几何 | 两张 1024×1024，颜色为 BC7 sRGB，控制为 BC7 | <a href="/images/rendering-analysis/endfield/foliage-b-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/foliage-b-colour.png" alt="本行资源的实际贴图预览" loading="lazy" width="700" height="700"></a> |
| 树冠组 B | 两张 512×512，颜色为 BC7 sRGB，控制为 BC7 | <a href="/images/rendering-analysis/endfield/foliage-c-colour.png"><img class="rendering-texture-preview" src="/images/rendering-analysis/endfield/foliage-c-colour.png" alt="本行资源的实际贴图预览" loading="lazy" width="700" height="700"></a> |

上表以同一颜色纹理的 alpha 显示覆盖，灰色是预览背景，图集方向按纹理坐标保留。原先只显示 RGB 时，轮廓外无覆盖区域的 RGB 也出现了，看起来像整块矩形或破碎色块；那些区域不等于最终叶片。

树冠图包含较完整的枝叶簇轮廓，叶片图则把细小叶片组织到一张图集。二者承担的表示尺度不同：细模型依靠较多几何表达轮廓与摆放，低面数模型把更多轮廓细节交给图案和材质。

两组主要叶片调用采用相等深度测试并关闭深度写入，复用之前建立的可见性；另一树冠变体仍写深度。由此可见，植被也不能作为一个固定状态的统一 Pass：可见性准备、叶片材质和远处冠层分别有自己的处理规则。

一条 658 实例的调用只提交 7896 个三角形，而 13 实例的细竹叶就提交了 83772 个三角形。这个例子说明，“实例多”与“几何多”不是同一个指标。像素覆盖和被丢弃的叶片背景又属于另一类成本，单纯用三角形数量无法排序所有植被开销。

### 环境与中间资源

竹林照明同时使用屏幕数据和空间数据。下表先说明资源规模，后文再沿生产与消费关系解释算法。

| 数据 | 本次布局 | 保存内容 |
|---|---|---|
| 材质颜色 | 3440×1440，RGBA8 sRGB | 供照明读取的表面色 |
| 法线、材质控制、运动 | 分别为全分辨率 RGB10A2 | 人物分支分别保存方向、按位拆分的实体标记、压缩运动与类别 |
| HDR 颜色 | 全分辨率，R11G11B10F | 场景与人物逐步加入的照明颜色 |
| 阴影代表输入 | 6144×4096，16 位深度 | 光源方向的遮挡 |
| AO 主要工作尺寸 | 1720×720 | 局部环境遮蔽和过滤数据 |
| 累积雾 | 313×180×128，RGBA16F | 视线散射颜色与透射率 |
| 环境光幅度 | 三组 128×64×128 浮点体积 | 不同空间层级的幅度数据 |
| 环境方向系数 | 三组 128×192×128 归一化体积 | 每层将 RGB 三组方向系数分段保存 |

环境幅度与方向系数按近、中、远层组织。这里“三组”对应三个空间层级，不是简单的红、绿、蓝三张独立体积；每次查询会一起恢复颜色及其随表面朝向变化的响应。

当前画面还有明显的竹林远景与天空亮部，但单凭它们的外观不足以确认一套独立云或水算法。后文集中解释已沿实际资源确定的阴影、环境光、遮蔽、反射与雾。


## 渲染分析

<span id="effects"></span>

先用[整帧流程](#pipeline)定位执行阶段，再按下面的画面效果阅读。每个效果章节先交代画面作用，再展开实现技术、数据流与截帧证据；资源尺寸和几何统计见前一部分。章节顺序用于阅读，实际执行先后以流程图为准。

| 画面效果 | 本文展开的实现与证据 |
|---|---|
| [植被轮廓与方向](#vegetation-coverage) | 前置 alpha 剪裁、颜色覆盖复用、方向编码与双面处理 |
| [方向性环境受光](#environment-volume) | 三层空间覆盖、一阶系数与表面方向查询 |
| [光源遮挡](#shadows) | 阴影图集同时进入表面照明与雾更新 |
| [接触暗部](#ao) | 方向搜索、角度积分、历史稳定与保边过滤 |
| [表面反射](#reflections) | 分块查询、深度命中、历史校验、粗糙过滤与环境探针补足 |
| [雾与空气](#fog) | 局部散射／消光、深度积分与场景／角色合成 |
| [人物形变](#packed-character-geometry) | 压缩方向、骨骼混合和双时刻位置 |
| [角色外观与受光](#character-appearance) | 阶段对照、身体法线、脸部色调与明暗控制 |
| [晚期受光面片](#late-transparent-effects) | 烟雾图集、柔和交界、受光、加色与运动目标混合 |
| [抗锯齿与画面稳定](#image-stability) | 抖动／运动分离、历史验证、重建与置信状态 |
| [亮部泛光](#bloom) | 软阈值、亮点抑制、下降过滤与上升重建 |
| [锐化、暗角与显示色彩](#display-effects) | 五点锐化、颜色缩放、暗角、对数查表与显示抖动 |

<span id="pipeline"></span>

<span id="整帧流程"></span>

### 整帧流程与表面数据

整帧流程先交代场景、角色与后处理的依赖，再说明各效果共用的表面数据。辅助几何反馈已经确认读写链，但具体部位未定，因此也在本节保留其范围说明。

<p class="rendering-flow-intro">从上向下跟随箭头阅读。每个阶段说明实际工作与输出结果；阶段标题可跳转到对应分析。箭头表示主要执行次序，颜色、深度等数据可以跨过多个阶段继续使用。</p>
<ol class="rendering-frame-flow" aria-label="终末地整帧执行流程">
<li class="rendering-flow-step rendering-flow-prepare">
<div class="rendering-flow-card">
<p class="rendering-flow-title"><span class="rendering-flow-phase">准备</span><a href="#shadows">阴影与前置几何</a></p>
<dl class="rendering-flow-detail">
<dt>工作</dt><dd>准备并绘制光源方向的可见几何，建立阴影深度；这些遮挡信息随后同时服务表面和空气受光。</dd>
<dt>输出</dt><dd>光源可见性与阴影深度 → 体积雾、场景和角色着色。</dd>
</dl>
</div>
</li>
<li class="rendering-flow-step rendering-flow-lighting">
<div class="rendering-flow-card">
<p class="rendering-flow-title"><span class="rendering-flow-phase">空气</span><a href="#fog">体积雾生成与沿深度积分</a></p>
<dl class="rendering-flow-detail">
<dt>工作</dt><dd>局部更新散射和消光，结合灯光、阴影及已有体积状态，再沿视线逐段累计散射和透射。</dd>
<dt>输出</dt><dd>累积雾体积 → 后续场景与角色按位置查询。</dd>
</dl>
<p class="rendering-flow-note"><strong>跨次输入</strong>已有雾状态参与更新。它拥有独立的空间存储与累计关系。</p>
</div>
</li>
<li class="rendering-flow-step rendering-flow-surface">
<div class="rendering-flow-card">
<p class="rendering-flow-title"><span class="rendering-flow-phase">可见性</span><a href="#gbuffer">主视图预深度</a></p>
<dl class="rendering-flow-detail">
<dt>工作</dt><dd>从当前相机建立可见表面的深度覆盖，为后面的材质和屏幕处理提供位置基础。</dd>
<dt>输出</dt><dd>主视图深度 → 主材质及屏幕空间处理。</dd>
</dl>
</div>
</li>
<li class="rendering-flow-step rendering-flow-surface">
<div class="rendering-flow-card">
<p class="rendering-flow-title"><span class="rendering-flow-phase">表面</span><a href="#gbuffer">主视图材质</a></p>
<dl class="rendering-flow-detail">
<dt>工作</dt><dd>场景与人物写入材质色、编码法线、参数、运动和类别等数据；人物部分的专用照明颜色仍留给后续阶段建立。</dd>
<dt>输出</dt><dd>表面数据与深度 → 遮蔽、反射、场景照明和人物着色。</dd>
</dl>
</div>
</li>
<li class="rendering-flow-step rendering-flow-surface">
<div class="rendering-flow-card">
<p class="rendering-flow-title"><span class="rendering-flow-phase">辅助表面</span><a href="#auxiliary">贴花与辅助几何</a></p>
<dl class="rendering-flow-detail">
<dt>工作</dt><dd>继续处理贴花，并为辅助几何组织单独的法线、深度和标记等屏幕数据，形成后续反馈输入。</dd>
<dt>输出</dt><dd>更新的表面数据及辅助反馈 → 环境处理、后续几何与合成。</dd>
</dl>
</div>
</li>
<li class="rendering-flow-step rendering-flow-lighting">
<div class="rendering-flow-card">
<p class="rendering-flow-title"><span class="rendering-flow-phase">环境</span><a href="#ao">屏幕环境遮蔽</a></p>
<dl class="rendering-flow-detail">
<dt>工作</dt><dd>沿屏幕方向搜索遮挡，结合旧遮蔽结果稳定当前估计，再做保边过滤和分辨率恢复。</dd>
<dt>输出</dt><dd>稳定后的 AO → 场景及相关表面受光。</dd>
</dl>
<p class="rendering-flow-note"><strong>跨帧输入</strong>这里读取遮蔽自身的历史，不使用整帧颜色历史替代。</p>
</div>
</li>
<li class="rendering-flow-step rendering-flow-lighting">
<div class="rendering-flow-card">
<p class="rendering-flow-title"><span class="rendering-flow-phase">环境</span><a href="#reflections">反射取样与重建</a></p>
<dl class="rendering-flow-detail">
<dt>工作</dt><dd>按屏幕块分配查询预算，在当前深度中搜索反射位置，用运动和旧深度验证对应；读取旧 HDR，分别过滤反射颜色与有效权重，再与环境探针混合。</dd>
<dt>输出</dt><dd>当前反射输入 → 场景照明。</dd>
</dl>
<p class="rendering-flow-note"><strong>跨帧输入</strong>旧 HDR 在这里先被读取，后面的整帧时序还要读取；保存新颜色时必须保留这一顺序。</p>
</div>
</li>
<li class="rendering-flow-step rendering-flow-lighting">
<div class="rendering-flow-card">
<p class="rendering-flow-title"><span class="rendering-flow-phase">照明</span><a href="#environment-volume">场景全屏照明</a></p>
<dl class="rendering-flow-detail">
<dt>工作</dt><dd>按材质与类别解释表面数据，接入已有的方向环境光、阴影、AO、反射及相关雾输入，建立场景照明。</dd>
<dt>输出</dt><dd>场景 HDR 颜色 → 后续人物与效果；部分人物颜色仍未完成。</dd>
</dl>
<p class="rendering-flow-note"><strong>已有资源</strong>方向环境光按空间位置与表面朝向查询；本段没有证明其全部生产过程都发生在这次截帧内。</p>
</div>
</li>
<li class="rendering-flow-step rendering-flow-lighting">
<div class="rendering-flow-card">
<p class="rendering-flow-title"><span class="rendering-flow-phase">人物</span><a href="#character">后续角色几何着色</a></p>
<dl class="rendering-flow-detail">
<dt>工作</dt><dd>再次绘制角色可见几何，以相等深度匹配主材质阶段的表面，把专用材质、受控明暗、空间环境与雾写入颜色。</dd>
<dt>输出</dt><dd>补入角色后的 HDR 颜色与运动 → 后续辅助和透明合成。</dd>
</dl>
</div>
</li>
<li class="rendering-flow-step rendering-flow-lighting">
<div class="rendering-flow-card">
<p class="rendering-flow-title"><span class="rendering-flow-phase">合成</span><a href="#late-transparent-effects">辅助合成、透明、效果与运动准备</a></p>
<dl class="rendering-flow-detail">
<dt>工作</dt><dd>处理晚出现的辅助几何与受光效果面片；由深度差控制柔和交界，按材质模式混合 HDR，同时通过独立目标处理运动与类别。</dd>
<dt>输出</dt><dd>完整的当前颜色、深度、运动和分类 → 整帧历史验证。</dd>
</dl>
</div>
</li>
<li class="rendering-flow-step rendering-flow-history">
<div class="rendering-flow-card">
<p class="rendering-flow-title"><span class="rendering-flow-phase">历史</span><a href="#temporal">历史验证、汇总与 HDR 融合</a></p>
<dl class="rendering-flow-detail">
<dt>工作</dt><dd>比较前后深度、运动和类别，汇总邻域有效性；再对当前与旧 HDR 颜色进行约束和融合，更新置信状态。</dd>
<dt>输出</dt><dd>稳定后的 HDR → 泛光；更新的颜色与状态 → 后续帧。</dd>
</dl>
<p class="rendering-flow-note"><strong>历史分工</strong>整帧颜色、AO、反射和雾具有各自的读取及更新关系；不能用一个统一的历史节点代替它们。</p>
</div>
</li>
<li class="rendering-flow-step rendering-flow-display">
<div class="rendering-flow-card">
<p class="rendering-flow-title"><span class="rendering-flow-phase">后处理</span><a href="#bloom">多尺度泛光与末段合成</a></p>
<dl class="rendering-flow-detail">
<dt>工作</dt><dd>用软阈值提取高亮，逐层下降过滤，再向上重建扩散颜色，并继续处理末段的光晕或模糊支路。</dd>
<dt>输出</dt><dd>泛光及末段颜色结果 → 最终显示合成。</dd>
</dl>
</div>
</li>
<li class="rendering-flow-step rendering-flow-display">
<div class="rendering-flow-card">
<p class="rendering-flow-title"><span class="rendering-flow-phase">显示</span><a href="#display-effects">锐化、调色与最终显示</a></p>
<dl class="rendering-flow-detail">
<dt>工作</dt><dd>完成最后的颜色输出及界面合成，把当前结果写成可显示的整帧画面。</dd>
<dt>输出</dt><dd>最终显示画面。</dd>
</dl>
</div>
</li>
</ol>
<p class="rendering-flow-caption">依据本次截帧的执行顺序整理；下方阶段画面用于观察颜色怎样逐步建立，详细算法继续在后文展开。</p>

#### 沿同一视角观察颜色的建立

<div class="rendering-figures rendering-stages">
<figure><a href="/images/rendering-analysis/endfield/stage-material.png"><img src="/images/rendering-analysis/endfield/stage-material.png" alt="主材质颜色：可以辨认人物、石阶与植被的表面色。" loading="lazy" width="1200" height="502"></a><figcaption>主材质颜色：可以辨认人物、石阶与植被的表面色。</figcaption></figure>
<figure><a href="/images/rendering-analysis/endfield/stage-lighting.png"><img src="/images/rendering-analysis/endfield/stage-lighting.png" alt="场景照明之后：部分人物区域仍未完成专用颜色。" loading="lazy" width="1200" height="502"></a><figcaption>场景照明之后：部分人物区域仍未完成专用颜色。</figcaption></figure>
<figure><a href="/images/rendering-analysis/endfield/stage-character.png"><img src="/images/rendering-analysis/endfield/stage-character.png" alt="后续人物几何着色之后；人物接入既有环境输入。" loading="lazy" width="1200" height="502"></a><figcaption>后续人物几何着色之后；人物接入既有环境输入。</figcaption></figure>
<figure><a href="/images/rendering-analysis/endfield/final-output.png"><img src="/images/rendering-analysis/endfield/final-output.png" alt="最终输出：透明、历史、泛光与显示处理均已完成。" loading="lazy" width="3440" height="1440"></a><figcaption>最终输出：透明、历史、泛光与显示处理均已完成。</figcaption></figure>
</div>

场景照明和人物着色两张图都以 0 到 0.2 的 HDR 范围并作显示伽马转换。材质色与最终图各有自己的颜色含义，不用它们的直接亮度差反推单项光照强度。

<span id="gbuffer"></span>

<span id="g-buffer材质先存在照明颜色随后建立"></span>

#### 效果共用的表面颜色、方向与分类

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/endfield/surface-colour.png"><img src="/images/rendering-analysis/endfield/surface-colour.png" alt="主材质后的表面颜色" loading="lazy" width="1000" height="419"></a><figcaption>主材质后的表面颜色</figcaption></figure>
<figure><a href="/images/rendering-analysis/endfield/surface-normal.png"><img src="/images/rendering-analysis/endfield/surface-normal.png" alt="相同表面的法线编码" loading="lazy" width="1000" height="419"></a><figcaption>相同表面的法线编码</figcaption></figure>
<figure><a href="/images/rendering-analysis/endfield/unlit-hdr.png"><img src="/images/rendering-analysis/endfield/unlit-hdr.png" alt="尚未完成照明的 HDR 目标" loading="lazy" width="1000" height="419"></a><figcaption>尚未完成照明的 HDR 目标</figcaption></figure>
</div>

表面色已经能识别植被、石阶和角色，法线保存方向；此时 HDR 目标大体接近黑色。这组图说明表面信息与受光颜色处在不同数据中。

##### 八面体编码怎样保存方向

三维单位方向只有两个独立自由度，可以用两个分量保存。这里的法线采用八面体编码：先按方向分量的绝对值总和投影，再把下半部分折叠到二维区域。

图中两个通道的颜色不能直接当作世界横纵分量。AO 读取时先恢复三维单位方向，再变换到观察空间，与深度一起计算邻域几何关系。

表面颜色按 sRGB 储存，方向与控制则按数值编码。解释这些输入时，色彩转换、方向解码和分类读取需要分别处理。

##### 分类照明怎样加入已有颜色

全屏照明按模板类别筛选表面，再执行对应分支。已确认的合成为：

$$
C_{\text{new}}=C_{\text{lighting}}+
\alpha_{\text{output}}C_{\text{old}}
$$

这里 alpha 控制已有贡献的保留程度，不应自动解释为常规透明物体的覆盖率。类别、输出数值与混合设置共同决定最终贡献。

一轮全屏照明结束后，某些角色区域仍未完成颜色。后面的几何着色直接读取环境光与雾，把专用材质接入当前 HDR。

<span id="auxiliary"></span>

<span id="辅助几何屏幕上的数据还能返回顶点阶段"></span>

#### 辅助反馈准备：数据链已确认，具体部位未定

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

<span id="vegetation-coverage"></span>

### 植被轮廓与双面方向

树冠与竹叶的外观需要把颜色、覆盖和方向解码放在一起理解。资源表已按颜色图自身 alpha 显示轮廓：灰色背景处没有对应的可见叶片颜色，原始 RGB 在这些位置仍可能有填充值。

#### 叶缘先进入深度，颜色复用同一覆盖

已核对的树冠前置程序读取颜色图 alpha，并与一个随观察方向调整的阈值比较；低于阈值的片元被丢弃。几何面片因此只在叶簇轮廓内建立深度。后面的树冠颜色路径使用相等深度测试、关闭深度写入，复用已经建立的覆盖。

这是剪裁得到的叶缘。预览把颜色图按 alpha 显示，只用于让读者看到对应图案；它不是把深度剪裁改成整张面片的透明混合，也不代表每个半透明预览像素最终保留相同比例。

#### 方向图 RG 需要按该材质的编码恢复

树冠代表颜色程序读取另一张数值图。其 RG 并不是直接把 $z=\sqrt{1-x^2-y^2}$ 接到两个解码分量之后。令 $x=2R-1$、$y=2G-1$，本路径先算：

$$
h=1-x^2-y^2,\qquad
n=(2x\sqrt h,\;2y\sqrt h,\;2h-1)
$$

上式描述编码的有效范围。随后调整方向强度、归一化，再用模型的切线、切线副方向与几何法线转到世界空间。相同一张 RG 纹理若按另一种常见法线格式读取，会得到不同方向，进而改变叶片上的明暗和反射。

#### 背面方向与材质控制分开处理

程序根据材质／顶点条件决定是否启用双面调整。启用时，正反面符号参与局部方向的横向分量变换，也参与世界方向的最后处理，使背面不能简单沿用正面朝向。这个条件来自实际材质与几何输入，并不等于整片竹林都使用一个固定的双面开关。

同张数值图的 B、A 还参与材质响应、局部遮蔽及分类相关控制；颜色纹理的 alpha 则服务前置轮廓。这是两张纹理里的不同 alpha，不能把它们统一称为叶片透明度。细竹叶与低面数树冠采用不同几何和变体，资源规模与当前状态仍需按各自提交理解。

<span id="environment-volume"></span>

<span id="三层环境光位置查询与一阶方向重建"></span>

### 竹林表面的方向性环境受光

竹林表面会因所在位置与朝向不同而接收不同环境光。当前路径从三层空间数据中选择覆盖范围，恢复一阶方向系数，再与着色方向组合；本节沿一个表面查询完整走过这条链。

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

<span id="shadows"></span>

<span id="阴影既服务表面也服务空气"></span>

### 物体与空气中的光源遮挡

光源方向的遮挡既改变表面的直接受光，也影响空气里可积累的散射光。本节说明同一阴影图集怎样服务这两类消费者，体积中的具体累积放在[雾效果](#fog)中展开。

场景阴影按光源视图组织到图集中。主照明利用它判断物体是否收到光，雾的局部体积更新也读取它，控制空间中的散射光是否被遮挡。

同一遮挡关系因此影响两件事：石面受到多少直接光，以及相机前方空气里能积累多少光。只在最终表面颜色上乘阴影，无法替代雾生成时的阴影查询。

辅助几何也有独立深度，但其生产者和消费者与主阴影不同。不能因为一张图只保存深度，就把它归为光源阴影。

目前确认的是图集查询和多处消费。区块如何长期分配、哪些光源分帧更新，仍需跨帧材料。

<span id="ao"></span>

<span id="环境遮蔽方向搜索历史稳定与保边过滤"></span>

### 接触暗部与环境遮蔽

石面、竹林与人物周围的邻近遮挡需要由当前深度和方向判断。当前实现沿多个方向搜索遮挡边界，再用历史和保边过滤稳定结果；本节从可见输出进入搜索、积分与过滤的细节。

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

<span id="反射先求采样位置再从历史画面取色"></span>

### 表面反射与历史颜色取样

竹林地面局部能够反射人物和周围颜色。本帧把这项效果拆成屏幕查询与环境探针两路：前者利用当前可见深度找到反射位置，再从旧 HDR 读取颜色；后者按空间范围与反射方向读取已保存的环境。最后按经过过滤的有效权重混合，继续乘材质的镜面响应。

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/endfield/reflection-original-detail.png"><img src="/images/rendering-analysis/endfield/reflection-original-detail.png" alt="原流程：地面保留屏幕反射，包含人物下方的倒影。" loading="lazy" width="700" height="466"></a><figcaption>原流程：地面保留屏幕反射，包含人物下方的倒影。</figcaption></figure>
<figure><a href="/images/rendering-analysis/endfield/reflection-probes-detail.png"><img src="/images/rendering-analysis/endfield/reflection-probes-detail.png" alt="屏幕反射权重置零：保留环境探针和其余照明。" loading="lazy" width="700" height="466"></a><figcaption>屏幕反射权重置零：保留环境探针和其余照明。</figcaption></figure>
</div>

两图来自同一截帧、同一最终颜色阶段和同一裁切范围。左图保留原流程，右图只将屏幕反射的最终混合权重置零，保留环境探针及其余阶段。可观察后方红色角色下方地面的红色倒影和浅色反光变化；这项对照并未关闭人物直接高光或环境照明。

对照前还执行了使用原程序的替换回放：原程序与基准在全分辨率显示 RGB 上仅有极少量量化差异，屏幕反射关闭后的变化则明显集中在地面。它验证的是当前截帧的贡献，不用于推导连续运动中的稳定性。

<figure class="rendering-diagram"><a href="/images/rendering-analysis/endfield/reflection-routing.svg" target="_blank" rel="noopener"><img src="/images/rendering-analysis/endfield/reflection-routing.svg" alt="终末地反射流程：当前深度查询命中位置，经运动和旧深度验证后读取历史颜色；颜色与权重分别过滤，再与环境探针混合" loading="lazy" width="1000" height="1100"></a><figcaption>算法示意 · 按当前截帧的数据流绘制</figcaption></figure>

<span id="reflection-selection"></span>

#### 哪些表面值得发起屏幕查询

准备阶段在 1720×720 的半分辨率上读取深度、法线及材质参数。法线先按八面体编码解开；两份表面方向的选择还受到恢复位置之间的距离控制，环境相关的表面调节继续改变用于反射的方向与粗糙程度。因此后面的反射并非只拿一张未经处理的法线图求镜像方向。

将这条路径最终使用的粗糙度控制记为 $r$，法线与视线夹角的绝对余弦记为 $n_v$，线性视空间深度记为 $z_v$。本帧主要查询权重可整理为：

$$
w_0=[1-\operatorname{smoothstep}(0.2,0.6,r)]
\,[1-\operatorname{saturate}(2n_v-1)]\,f_z
$$
$$
f_z=\begin{cases}
1,&r<0.1\\
\operatorname{saturate}[(100-z_v)\,0.1],&r\ge0.1
\end{cases}
$$

粗糙表面逐渐退出查询；视角项倾向保留掠射方向；对非极光滑表面，距离项还会减少远处查询。这里的距离按截帧使用的空间单位表达。具有特定表面标记的像素，还会比较两份深度对应的前后关系，不满足条件时把权重归零。

这份权重随后以单通道八位格式保存。它用于判断当前是否值得查询，既不是实际反射亮度，也不是已经找到命中的证明。

#### 按屏幕块分配两种采样预算

每个 8×8 半分辨率块先汇总像素分类。有效权重达到阈值后，$r<0.3$ 的像素进入高采样类别；$0.3\le r<0.6$ 进入低采样类别；其他像素不需要发起有效查询。组内归约后，将块坐标压入对应列表，再由间接分派消费。

| 当前块类别 | 本帧块数 | 实际处理 |
|---|---:|---|
| 含高采样像素 | 2,112 | 高类别像素使用 128 个候选采样；同块其他有效像素仍可使用较低预算 |
| 仅需较低预算 | 13,488 | 当前候选采样数为 16，即高预算的八分之一 |
| 无有效查询 | 3,750 | 写入默认坐标、零有效权重及所需控制，不做同样的深度搜索 |

三类合计 19,350 块，正好覆盖 $215\times90$ 的半分辨率工作组网格。块数说明的是调度分布，不是命中次数；高采样块也不代表块内全部 64 个像素都执行 128 次搜索。

<span id="reflection-trace"></span>

#### 沿反射方向寻找深度相交位置

程序由当前深度恢复视空间位置 $P$，把表面方向变换到同一空间，再计算反射方向：

$$
R=\operatorname{reflect}(\operatorname{normalize}(P),N_v)
$$

它将这条方向投影到屏幕，按屏幕边界限制搜索线段，再依据当前预算得到屏幕坐标和投影深度的每步增量。起始位置加入与像素和帧状态有关的扰动；若一个步长投影后不足一个像素，还会调整起始偏移，减少反复查询起点附近。

当前两个查询程序都以四个连续候选为一组读取深度。它们在搜索期间读取所绑定深度层级的第零级；后面的粗糙反射过滤才显式查询不同层级。因此不能仅凭“绑定了深度金字塔”就把这里写成逐级下降的 Hi-Z 遍历。

记候选射线的投影深度与已见表面深度之差为 $d$，一次步进的深度容差为 $\epsilon=\max(|\Delta z|,10^{-4})$。候选满足：

$$
|d+\epsilon|<\epsilon
\quad\Longleftrightarrow\quad
-2\epsilon<d<0
$$

才进入命中处理。四个候选中优先选择最早满足条件的一个，并用前后深度差作一次受限插值：

$$
t=\operatorname{saturate}\left(\frac{d_{prev}}{d_{prev}-d_{hit}}\right)
$$

得到更细的屏幕落点。这是有限采样与厚度容差下的近似相交；深度只记录当前视图可见表面，遮挡背后的几何不会因此自动变得可查询。

#### 找到当前落点以后，还要验证旧帧对应

命中位置越靠近屏幕边缘，权重越低。本帧以 UV 到最近边缘的距离 $b$ 构造 $\operatorname{saturate}(b/0.1)$，乘到已有查询权重上。超出屏幕或贴近边缘的结果，不能与画面内部结果同等使用。

接下来读取命中表面的运动，把当前落点移回旧帧位置。运动按本篇后文所述的四次方关系解码。历史深度可用、且当前历史校验分支启用时，程序分别恢复当前命中点与旧点的位置，检查：

$$
\|P_{old}-P_{hit}\|\le\max(0.25,0.01z_v^2)
$$

超过阈值就取消本次有效权重。本帧运动重投影和这条深度校验均启用；阈值随深度增大，不能解释成全场景固定的 0.25 距离。

若搜索没有命中，程序写回当前像素自身的默认坐标，并将当前有效权重设为零。默认坐标方便后续按统一接口读写；**它不表示允许把当前位置的颜色直接当作反射。** 是否采用屏幕颜色，还要由独立权重以及后面的历史过滤决定。

<span id="reflection-history"></span>

#### 命中坐标、反射颜色与有效权重分别保存

查询结果包含三种用途不同的数据：旧画面中的二维坐标、当前有效权重，以及用于历史响应和粗糙度过滤的控制。两张二维坐标／控制图使用双通道十六位归一化存储，当前有效权重使用单通道八位存储。

颜色读取阶段再恢复到主视图尺寸。记全分辨率像素坐标为 $p$，画面尺寸为 $S$，半分辨率坐标图的值为 $u_r$：

$$
u_h=u_r+\frac{p\bmod2}{S},\qquad
C_r=C_{\text{history}}(u_h)
$$

同一个半分辨率位置对应四个全分辨率像素，余数项保留四者的子像素差异。它没有为每个全分辨率像素重新执行一遍完整查询。

#### 极亮颜色先压缩，再参与过滤

旧 HDR 取色后，先按最大分量压缩：

$$
F(C)=\frac{C}{1+\max(C)}
$$

极亮样本各通道按同一个分母缩小，减轻它在过滤中的支配程度。这里是可逆的中间计算域，过滤结束后还会按 $F^{-1}(X)=X/[1-\max(X)]$ 恢复 HDR；它并不是最后的显示调色。

颜色与有效权重随后**分别进行历史过滤**。权重使用标量邻域，颜色则转到 YCoCg 亮度／色差空间；两者都读取当前 3×3 邻域，结合轴向及对角范围、均值和 $1.25\sigma$ 构造允许区间，再限制重投影后的历史。

颜色的历史裁剪沿“区间中心到旧颜色”的方向缩回允许盒内，保持分量间的对应。两条历史路径的混合权重均为 $0.97q$，其中 $q$ 来自查询阶段生成的运动与深度相关控制；**0.97 是上限系数，不是全图固定使用 97% 旧结果。**

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/endfield/reflection-trace-mask.png"><img src="/images/rendering-analysis/endfield/reflection-trace-mask.png" alt="本次查询与旧帧位置校验后的有效权重。" loading="lazy" width="1200" height="502"></a><figcaption>本次查询与旧帧位置校验后的有效权重。</figcaption></figure>
<figure><a href="/images/rendering-analysis/endfield/reflection-mix-mask.png"><img src="/images/rendering-analysis/endfield/reflection-mix-mask.png" alt="历史与尺度处理后，实际交给照明的混合权重。" loading="lazy" width="1200" height="502"></a><figcaption>历史与尺度处理后，实际交给照明的混合权重。</figcaption></figure>
</div>

左图是当前深度查询和对应校验之后的有效权重；右图是历史及尺度处理之后，交给场景照明的混合权重。均为真实单通道结果，按零到一显示。本次前者约 11.7% 的像素非零，后者约 18.7% 非零：历史与邻域处理改变了分布，后者不能当作当前搜索的命中率，更不能当作最终画面中反射可见面积的百分比。

#### 粗糙表面怎样得到更宽的反射

查询程序还根据粗糙程度估算反射的屏幕足迹。其中角宽关系为：

$$
\theta=\arccos\left(0.244^{1/(2/r^4-1)}\right)
$$

它结合查询距离、观察方向与表面切向，将两个方向的展开投影回屏幕，再由足迹估计对数过滤层级，当前限制在零到六。极光滑的分支直接使用较细结果；粗糙表面则从颜色层级取得更宽的平均。

合成时，在相邻两个整数层级上各读取一组 4×4 颜色样本。空间核为 $[1,3,3,1]/8$ 的二维组合，并乘深度差权重：

$$
w_{ij}=k_i k_j\,\exp[-0.01|z_{ij}-z_c|]
$$

分别归一化两层结果，再按层级的小数部分插值，最后恢复 HDR。深度差限制不同距离表面随意混在一起，但它并不能补出视图之外缺失的几何。

<span id="reflection-probes"></span>

#### 未命中和低权重区域由环境探针补足

场景照明先计算一份独立的环境反射。当前输入是一张 **576×576、32 层、10 级 mip 的二维纹理数组**：反射方向经过八面体展开后定位到二维坐标，数组层选择不同环境记录。32 是资源容量，不能直接当作本视角同时贡献的探针数。

局部探针按屏幕分区与深度分区的位集合交集筛选，再检查着色位置是否位于各自的空间范围。记录可以给出盒内方向修正开关、边界淡出与亮度调整。开启盒内修正时，程序把反射方向变换到局部空间，求射线与盒边界的交点，再由修正方向查询环境；未开启时沿原反射方向查询。该分支按每条记录分别判断。

多个记录按剩余权重依次组合：

$$
C_{env}\leftarrow C_{env}+T\alpha_i C_i,\qquad
T\leftarrow T(1-\alpha_i)
$$

剩余量仍大于 0.01 时，再由默认环境层补足。这里既有空间筛选也有剩余权重，不能把它写成所有探针颜色无条件相加。

最后，用前面得到的屏幕反射颜色 $C_s$ 与最终有效权重 $w_s$ 组合：

$$
C_{reflection}=w_sC_s+(1-w_s)C_{env}
$$

当前屏幕反射合成开关开启。$w_s=0$ 时使用环境反射；$w_s$ 接近一时更多采用屏幕结果。该颜色之后还要乘材质的镜面基色、视角／粗糙度响应和相关遮蔽，才进入场景照明。因此，“查询失败就整块变黑”和“取到旧画面后直接贴到地面上”都不符合本帧实际组合。

需要继续区分的是：本节已确认当前场景路径的筛选、搜索、校验、历史过滤和探针补足；它没有验证所有其他材质变体，也没有证明单帧回放能反映快速运动时的全部更新行为。

<span id="fog"></span>

<span id="体积雾局部介质与沿视线累积是两种数据"></span>

### 雾的散射、透射与空间层次

空气一方面增加散射光，另一方面削弱来自表面的原有颜色。当前实现先生成局部介质，再按深度顺序累积两种量，最后让场景与角色共同读取；深度切片图用于分别观察这两个作用。

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

<span id="screen-shafts"></span>

#### 屏幕径向光束：本帧执行，但输出为零

空气层次之外，本帧还执行一条屏幕光束链。它先从场景颜色提取超过阈值的亮部，乘深度、画面边缘和光源中心附近的空间权重，再连续进行径向平均。颜色提取的亮度阈值为 0.62，当前径向程序每次使用 12 个样本。

将屏幕像素记为 $u$，光源中心记为 $c$，当前链的局部范围权重包括：

$$
w_c=[1-\operatorname{saturate}(2\|u-c\|)]^2
$$

而本帧中心约为 $(1.1206,2.2298)$，位于屏幕范围之外，所有可见像素都被这一局部范围项排除。回放读取的亮部源与过滤结果也均为零。因此，竹林远处可见的雾亮度应沿前面的空气散射与透射链解释，不能拿这条没有输出的径向光束来归因。

<span id="packed-character-geometry"></span>

<span id="人物顶点压缩方向蒙皮与双时刻位置"></span>

### 人物形变与表面方向

人物姿态改变时，几何位置、法线和切线必须保持一致。当前身体路径先解码压缩方向，再混合骨骼变换，同时保留前后时刻的位置供[画面稳定](#image-stability)使用。

这条身体顶点程序与此前完成语义还原的对应程序具有完全相同的原始反汇编，因此可以继续解释此前尚未命名的输入。以下计算按竹林这次绑定说明；其他捕获的相机、材质和姿态常量不参与本篇取值。

<figure class="rendering-diagram"><a href="/images/rendering-analysis/endfield/packed-geometry-flow.svg" target="_blank" rel="noopener"><img src="/images/rendering-analysis/endfield/packed-geometry-flow.svg" alt="人物几何数据流：方向解码、当前与旧蒙皮、表面输出和运动分开组织。" loading="lazy" width="1120" height="690"></a><figcaption>算法示意 · 点击查看大图</figcaption></figure>

#### 一个 32 位字可同时保存法线、切线方向和手性

位置后的一个 32 位存储槽，在压缩路径中按整数位解释：

| 位段 | 含义 |
|---|---|
| 低 10 位 | 法线投影的第一个坐标 |
| 接下来的 10 位 | 法线投影的第二个坐标 |
| 再后面的 10 位 | 切线绕法线的方向参数 |
| 倒数第二位 | 是否采用压缩切线基 |
| 最高位 | 切线手性，恢复为负一或正一 |

前两段从无符号码恢复为带符号值，再乘约 $1/511$。以 $x,y$ 为投影坐标，先令 $z=1-|x|-|y|$；$z<0$ 时折叠 XY，最后归一化，得到模型法线。

第三段也先恢复为带符号归一化参数。程序用法线分量的循环差构造种子方向，得到与法线关联的参考基；再以该参数构造二维方向并归一化，在参考基中恢复切线。最高位决定副切线应采用哪一种手性。

这解释了输入布局里看似只有一个浮点分量的槽位：它可以承载完整的位编码数据。把这个浮点数的数值直接当成法线 X，会失去其中三组字段。

#### 骨骼行先混合，再同时变换位置与方向

实体记录中的标记决定是否蒙皮，以及采用一、二或四个骨骼影响。每个骨骼以三行四分量向量保存仿射变换，当前和旧骨骼各有基址。

对于二或四影响，先按权重混合矩阵行：

$$
R_j=\sum_i w_i R_{i,j},\qquad j=0,1,2
$$
$$
p'_j=R_j\cdot(p_x,p_y,p_z,1)
$$

法线和切线使用相同行的前三个分量参与变换，不带位置的平移项。四影响分支按前两个、后两个组成两组后再相加；单影响分支直接读取相应骨骼行。归一化的输入权重参与运算，程序不会在这里再把它们除以权重和。

当前位置和旧位置各自使用对应的骨骼行，因此人物自己摆动的位移可以被保留下来。未启用蒙皮的分支则保留当前输入位置，并从备用输入取得旧位置；另一个实体控制还允许用当前蒙皮位置代替旧蒙皮位置，但仍保留旧物体和旧相机变换。

<span id="character-appearance"></span>

### 角色的表面色、明暗与高光

角色先建立材质与可见表面，之后再通过专用几何着色补入颜色。下面用阶段对照定位这一步，再依次展开材质分类、身体方向、脸部视角色调和最终受光；环境光与雾由前面的场景效果提供。

<span id="character"></span>

<span id="后续角色着色为何场景受光后还要绘制几何"></span>

#### 阶段对照：角色颜色何时接入场景

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

##### 深度相等让着色落在已有表面上

前面的深度和材质阶段已经建立人物可见性。代表后续路径使用相等深度测试，在匹配已有表面的位置输出颜色与运动。

黑色人物区域因此不意味着此前没有几何。更准确的解释是：人物的表面位置已经存在，专用颜色等到适当阶段再计算。它能够直接利用前面已经准备好的空间光照、阴影与雾。

这一阶段共有多次几何绘制，包含已确认会补入人物颜色的路径；不能因为连续的一组绘制都写同一目标，就把组内所有匿名程序都认定成同一种角色部件。

#### 材质准备：身体方向、脸部色调与分类

人物主材质在照明之前保存后续所需的数据。下面三项分别解释分类标记、表面方向与脸部基础颜色。

##### 代表人物的材质目标还保存一个完整的整数标记字

中央身体和脸部的主材质程序从实体记录取得一个 32 位整数，按 RGB10A2 的位宽拆为四部分：

$$
r=(F\mathbin{\&}1023)/1023,\quad
g=((F\gg10)\mathbin{\&}1023)/1023
$$
$$
b=((F\gg20)\mathbin{\&}1023)/1023,\quad
a=((F\gg30)\mathbin{\&}3)/3
$$

这里四个归一化值用于让渲染目标按 10、10、10、2 位保存原来的字段。该人物分支中，这个目标并不是四个独立连续的物理材质参数。恢复后还需要按后续消费者的位域规则解释；也不能将这套布局推广到所有场景表面。

这和运动目标里的类别量不同。运动目标另写 RG 位移、B=1、A=0.4；最后一项经过两位 alpha 量化后读回为 $1/3$。一个是整数拆位保存，一个是浮点值经过目标格式量化，尽管二者都使用 RGB10A2，编码过程并不相同。

##### 身体法线从材质纹理恢复，再进入屏幕法线编码

身体材质先取法线纹理的 $a\times r$ 和 $g$：

$$
x=2ar-1,\qquad y=2g-1,\qquad
z=\max\left(10^{-16},\sqrt{1-\operatorname{clamp}(x^2+y^2,0,1)}\right)
$$

然后才对 XY 乘法线强度，变换到世界切线基。本次使用 BC5，未存储的 alpha 按默认分量取值，强度为一。这个顺序说明材质强度并未重新计算 Z；它在已有方向上调整横向幅度，再通过归一化恢复单位长度。

背面会乘 $-1+2k_b$，正面乘一。本次 $k_b=0$，因此背面方向反转。随后归一化并编码到屏幕法线目标。

屏幕编码采用世界方向的 X、Z 作二维坐标，以 Y 区分上下半球：

$$
q=N_{xz}/(|N_x|+|N_y|+|N_z|)
$$

当 $N_y\le0$ 时折叠 $q$，再存为 $0.5q+0.5$。[人物形变中的顶点压缩方向](#packed-character-geometry)的折叠轴与这里不应混淆；它们是两处独立的存储接口。

##### 脸部在材质颜色阶段已经加入一项视角色调

脸部主材质并非只复制底色。它先由表面到相机的方向 $V$ 和正反面调整后的法线 $N$ 计算：

$$
s=\operatorname{saturate}
\left[(1-\operatorname{saturate}(0.85\operatorname{saturate}(N\cdot V)+0.15))k_s\right]
$$
$$
C_{base}=C_{texture}C_{tint}\left[(1-s)+sC_{view}\right]
$$

本次 $k_s=0.5$，$C_{view}\approx(0.5395,0.1859,0.1746)$，基础乘色为白色。当表面正对观察方向时，$s$ 接近零；接近轮廓且 $N\cdot V=0$ 时，$s=0.425$。因此还没进入后续脸部光照，材质颜色就可能出现随朝向变化的偏色。

这项输入依赖观察方向，不查询光源深度，应该与真正的阴影采样分别理解。它能够解释材质图里某些脸部明暗，而不能被当作该帧实时自阴影的证明。

这条脸部路径和身体一样向 HDR 目标写零，向材质颜色写处理后的 RGB 与 alpha=1；脸部还向法线目标 alpha 写 0.4，身体的对应分量写零。后面的分类与照明通过这些不同字段继续选择处理方式。

<span id="character-material"></span>

<span id="代表脸部材质反射分配与受控明暗方向"></span>

#### 脸部受光：漫反射、高光与受控明暗方向

下面展开与前文中央人物脸部对应的后续着色程序。它的一次提交为 3530 个三角形，结论限定于这条已追踪路径。

##### 金属混合量同时影响两种颜色

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

##### 主光与材质方向共同决定分区

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

##### 环境光使用的是同一套着色方向

三层环境数据解码后，每个颜色得到一个常量项和三个方向系数，与 $(N_x,N_y,N_z,1)$ 点乘，并限制为非负。

场景提供位置相关的光照系数，角色提供经过材质调整的方向，两者在这里相接。环境光不是对角色无差别乘一个固定 RGB，也不是一定等于全屏照明此前算出的颜色。

随后，当前角色颜色接受累积雾和其他空气项的合成。几何运动仍独立写入，并不因为颜色被雾衰减就一起变成“雾的运动”。

<span id="late-transparent-effects"></span>

### 晚期受光面片与柔和交界

主体人物和场景之后，还有读取烟雾状图集的效果面片。下面选取当前角色头部附近的一次代表提交，说明纹理、深度交界、受光、颜色混合与运动目标分别承担什么任务。

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/endfield/lit-effect-geometry.png"><img src="/images/rendering-analysis/endfield/lit-effect-geometry.png" alt="头部附近效果面片的实际几何范围；黄色线框为回放辅助显示。" loading="lazy" width="600" height="670"></a><figcaption>头部附近效果面片的实际几何范围；黄色线框为回放辅助显示。</figcaption></figure>
<figure><a href="/images/rendering-analysis/endfield/lit-effect-texture.png"><img src="/images/rendering-analysis/endfield/lit-effect-texture.png" alt="当前材质读取的烟雾状图集 RGB 预览；不是最终画面中的烟雾覆盖。" loading="lazy" width="512" height="512"></a><figcaption>当前材质读取的烟雾状图集 RGB 预览；不是最终画面中的烟雾覆盖。</figcaption></figure>
</div>

左图黄色线框定位实际面片，右图是该材质读取的 512×512 烟雾状图集，均来自截帧。该提交只有 44 个三角形。它在当前姿态下的单次可见贡献很弱，所取局部阶段预览没有明显前后差别，因此本节使用几何和输入图定位算法，不将其描述为这幅画面中强烈的烟雾效果。

#### 图集颜色、覆盖量与分支开关

代表程序用传入 UV 读取图集，将纹理与顶点颜色、材质乘色组合。本帧颜色倍率为 1.5、覆盖倍率为 0.3；另有高于阈值的亮度增强和曝光响应。图集中的局部图案为面片提供细节，实际可见范围还需要后面的空间及覆盖条件共同决定。

| 当前控制 | 本帧状态 | 作用 |
|---|---|---|
| 深度交界淡出 | 启用，宽度参数 8、偏移 0 | 面片接近已有表面时逐渐降低覆盖量 |
| 近远距离淡出 | 启用 | 近处从 0.001 到 1 逐渐出现，远处从 100 到 120 逐渐消失 |
| 受光方向覆盖 | 启用 | 使用向上的方向参与受光，而不是逐片沿几何法线形成明暗 |
| 溶解分支 | 关闭 | 当前不把图案边缘解释为正在发生的溶解 |
| 位移写入 | 当前分支关闭 | 通过目标混合保留已有运动，不生成这次提交的独立位移 |

距离和交界宽度均沿用截帧的空间单位，不额外假定它们就是米。

#### 深度差让面片与实体表面柔和连接

程序读取已有场景深度并恢复位置，与当前面片的视空间深度比较。将两者记为 $z_s,z_p$，本帧交界权重为：

$$
w_{soft}=\operatorname{saturate}\left(\frac{z_s-z_p}{8}\right)
$$

它再乘纹理覆盖、距离淡出及实例控制。面片紧贴实体表面时覆盖趋近零，距离拉开以后逐渐保留原覆盖。这比单靠深度测试的通过／失败多了一段过渡，用来减轻效果面片与石头、人物等相交时的硬切边。

本帧距离项可整理为：

$$
w_{distance}=\operatorname{saturate}\left(\frac{z_p-0.001}{1-0.001}\right)
\operatorname{saturate}\left(\frac{120-z_p}{20}\right)
$$

这两项都作用于当前覆盖量。它们没有改变后方物体的深度，也不等同于场景体积雾沿视线进行的透射积分。

#### 效果颜色也会查询灯光与环境

代表程序把方向覆盖为 $(0,1,0)$，再读取主光和阴影；局部光通过屏幕块与深度分区的位集合筛选，逐个计算距离衰减、方向受光与相关限制。它还读取实例保存的低阶方向环境系数，按当前着色方向恢复环境颜色。

因此，这组面片并非只把一张白色烟雾图以固定亮度贴上去。纹理颜色、材质倍率、主光、局部光和环境系数共同形成未合成颜色，随后仍接入本场景的雾透射与材质颜色控制。

#### 内部覆盖量与输出 alpha 不必相同

这次颜色目标使用源因子一、目标因子一减源 alpha。程序先以内部覆盖量调节 RGB，但本帧模式又把送往混合器的 alpha 设为零。因此这次组合表现为：

$$
C_{new}=C_{old}+\alpha_{internal}C_{effect}
$$

效果有覆盖控制，同时采用加色合成。仅看到最终 alpha 为零就认为“该提交没有颜色贡献”，或把它当成普通遮挡背景的透明面片，都会漏掉程序内部的预乘与模式选择。

另一个目标保存运动及效果控制，混合因子采用源颜色和一减源颜色。对其任一分量，混合形式为：

$$
M_{new}=M_{src}^{2}+(1-M_{src})M_{old}
$$

当前位移分支输出零时，对应分量保留旧运动；其他控制分量仍能按覆盖后的亮度标记效果区域，供后面的历史处理使用。颜色、内部覆盖、输出 alpha 与历史标记在这里是不同的数据，不能用一个“透明度”概括。

<span id="image-stability"></span>

### 抗锯齿与画面稳定

画面稳定首先要求历史颜色对应同一表面。当前实现分别表达采样抖动与物体运动，再通过深度、运动和分类验证历史，约束旧颜色并回写置信状态；它与 AO 自己的历史属于不同数据链。

#### 相机抖动只进入光栅位置，不直接进入运动差

当前蒙皮位置经过当前物体变换，并减去当前世界参考原点；旧位置使用旧物体变换和旧参考原点。两者随后分别投影。

设未抖动的当前裁剪坐标为 $c$，本帧纹理域抖动为 $j$，光栅使用的位置包含：

$$
c'_{xy}=c_{xy}-j(2,-2)c_w
$$

但传给运动计算的仍是未加入这项的当前 $c_{xyw}$ 与旧 $c_{xyw}$。这使采样位置的抗锯齿抖动与表面的物理屏幕位移分别表达。后面还会按捕获接口的纵向约定处理坐标，不能在另一处再重复翻转。

这条链补足了“运动来自前后位置”的具体含义：前后位置不仅包含相机矩阵，还包含姿态、物体变换、参考原点，以及一个可控制的旧位置选择。

<span id="motion"></span>

<span id="运动编码与分类量化"></span>

#### 表面对应：运动编码与分类量化

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

##### 量化后的类别才是实际读回值

代表角色程序向附加通道写入一个 0.4 的控制量，但目标 alpha 只有两位，因此实际可存值只有 $0,1/3,2/3,1$。0.4 写入后落在 $1/3$ 档。

后面程序按接近 0.3 的区间判断相关类别，匹配的正是量化后的值。若只阅读写入常量，期待消费者精确读到 0.4，就会误解这个分支。

这也是为什么格式和通道含义必须一起说明。格式并非附带的资源列表，它直接影响算法条件。

<span id="temporal"></span>

<span id="整帧历史验证汇总融合分成三个步骤"></span>

#### 历史颜色：有效性检查、重建与融合

在角色、透明与效果完成当前颜色和运动之后，整帧处理才能比较新旧表面。它读取的不仅是旧 HDR，还有旧深度与旧运动、类别信息。

##### 第一步：逐像素检查对应关系

预处理比较当前与历史的深度、运动和分类。它输出一份邻域深度，以及同时保存运动和变化标志的数据。

深度用于发现遮挡显露或表面变化，运动差用于判断前后对应是否稳定，类别变化则防止不同处理规则之间随意继承旧状态。只比较颜色相似度，不能完整替代这些判断。

##### 第二步：在较低分辨率汇总变化

汇总阶段读取中心与四个对角位置，将变化标志组织成 860×360 的单通道结果，再供颜色融合使用。

![历史有效性汇总结果的单通道预览](/images/rendering-analysis/endfield/history-validity.png)

黑白区域是后续控制条件的分布，不是已经发生拖影的位置，也不是最终颜色误差图。它帮助观察历史控制如何覆盖人物、前景与背景边界。

低分辨率汇总使邻域的变化能够影响对应区域的历史使用，而不是只保留一个孤立像素的判断。

##### 第三步：融合 HDR 并回写置信状态

颜色阶段读取当前 HDR、重投影后的旧颜色和前面形成的有效性信息，输出新 HDR 与置信状态。它和 AO 的历史是两套数据：一个稳定局部遮蔽，另一个稳定整幅照明颜色。

旧颜色还被反射读取，因此必须在两个消费者结束后才交换历史版本。颜色、深度、运动和分类也需要保持时间对应；只有颜色更新、其他数据停留在不同时间，会破坏验证。

下面继续展开本次颜色融合程序中可以直接核对的重建、统计与状态计算；控制位仍按已经确认的行为描述。

##### 历史重建先压缩亮度，再恢复并限制过冲

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

##### 当前 3×3 邻域在 YCoCg 中形成允许范围

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

##### 置信状态同时依赖当前结构与旧状态

程序还判断当前中心与八邻居的亮度关系，形成邻域结构候选状态 $q_{\text{local}}$。已有历史 alpha 记为 $q_{\text{old}}$，主要反馈关系为：

$$
q_{\text{new}}=\max(q_{\text{local}},0.9q_{\text{old}})\,G
$$

$G$ 汇总低分辨率有效性标记、分类、越界和其他拒绝／重置条件。它不是由颜色相似度单独决定。程序中的结构判断包含邻居亮度比与组合掩码；本篇不把未完整命名的组合模式假定为“头发”“粒子”等业务类别。

当 $q_{\text{new}}\ge0.1$ 且历史位置有效，一条强状态分支允许放宽普通的方差夹取，并将相应混合权重调整到 0.9。若当前结构不再提供支持，旧状态的 0.9 倍仍可以短暂延续，但会受 $G$ 再次筛选。这解释了 alpha 为何需要跨帧保存：它记录的是后续融合会使用的响应状态，而非颜色透明度。

##### 最终混合仍在归一化的亮度／色差空间

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

<span id="泛光从软阈值到多尺度重建"></span>

### 亮部泛光与多尺度光晕

泛光让高亮区域向周围扩散，同时保留亮部核心。当前路径按软阈值提取亮部，用不同尺度覆盖不同扩散范围，再把每层细节与较粗光晕逐层组合。

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

<span id="display-effects"></span>

### 细节锐化、暗角与最终显示颜色

泛光重建完成以后，这帧还执行一条完整的颜色输出程序：先做邻域锐化与颜色缩放，组合泛光，再处理画面边缘的衰减，通过颜色查找表完成映射，最后进行显示编码与微小抖动。这些操作共同决定最终画面的细节对比、边缘亮度与显示色彩。

<div class="rendering-figures">
<figure><a href="/images/rendering-analysis/endfield/display-hdr-input.png"><img src="/images/rendering-analysis/endfield/display-hdr-input.png" alt="显示合成读取的 HDR 颜色，零到一预览。" loading="lazy" width="1200" height="502"></a><figcaption>显示合成读取的 HDR 颜色，零到一预览。</figcaption></figure>
<figure><a href="/images/rendering-analysis/endfield/display-colour.png"><img src="/images/rendering-analysis/endfield/display-colour.png" alt="锐化、亮部组合、暗角、颜色查表与显示编码之后。" loading="lazy" width="1200" height="502"></a><figcaption>锐化、亮部组合、暗角、颜色查表与显示编码之后。</figcaption></figure>
</div>

左图是该阶段读取的 HDR 颜色，按零到一范围预览；右图是完成显示颜色处理后的结果。两者处于不同颜色域，右图同时包含亮部合成和调色，不能把明暗差单独归给锐化。

#### 五点邻域锐化先于颜色查表

程序读取中心和上下左右共五个样本。局部亮度变化与各通道的极值共同限制负的邻居权重，以中心和周围差异增强细节。将最终得到的邻居权重记为 $a$：

$$
C_{sharp}=\frac{C_0+a(C_N+C_S+C_E+C_W)}{1+4a}
$$

本帧锐化强度参数为 0.3。$a$ 仍由当前邻域计算，并非全图固定的 -0.3；程序在将限制后的权重乘强度之前，将其范围约束到 $[-0.1875,0]$，还乘局部对比控制。这样在增强中心细节时，也保留了对邻域范围的限制。

锐化结果之后乘当前约 6.5575 的颜色缩放，再与已有泛光结果组合。泛光合成还使用软阈值相关参数调整主体亮部与扩散贡献，不能简单写成把泛光贴图无条件覆盖到屏幕上。

#### 画面边缘衰减独立于场景阴影

当前暗角以屏幕中心 $(0.5,0.5)$ 为参考，分别处理横纵距离与长宽比，经过幂次、限制和颜色插值后乘已有颜色。本帧使用黑色边缘颜色。它由屏幕位置控制，不查询角色或竹林的光源深度，因此画面边缘变暗与场景投影阴影属于不同效果。

#### 宽亮度颜色先压缩到查表域

颜色查找表的实际尺寸是 1024×32，表示边长为 32 的三维颜色格。进入查表前，对每个颜色分量应用的主要压缩关系可整理为：

$$
x=\operatorname{saturate}\left[0.2442\log_{10}(5.5556C+0.048)+0.3860\right]
$$

这里 $C$ 已经包含此前的颜色缩放、泛光和边缘调节；式中系数按原程序浮点常量近似表示。蓝色对应的压缩分量决定相邻两个切片，红绿分量确定切片内的位置。程序分别查询两个切片，再按蓝色轴的小数部分插值。因此输出外观不仅取决于压缩函数，也取决于这张实际绑定的颜色表。

#### 显示编码与抖动发生在最后

查表后的线性颜色 $c$ 继续转换为显示编码，当前形式为：

$$
s(c)=\begin{cases}
12.92c,&c\le 0.0031308\\
1.055|c|^{1/2.4}-0.055,&c>0.0031308
\end{cases}
$$

之后加入由屏幕像素位置构造的 RGB 微小扰动。当前幅度约为 $0.35/255$ 乘一个位于 $[-0.5,0.5)$ 的量，用于改变量化落点；它与前面几何投影的采样抖动不是同一种数据。

后面仍有两条受深度约束的晚期效果绘制，然后才拷贝到最终输出目标。该最终拷贝保留 RGB，并将 alpha 固定为零；场景的显示颜色已在前面的程序中形成，不能通过最终 alpha 去判断场景是否存在。

<span id="conclusion"></span>

<span id="数据如何共同形成这幅画面"></span>

### 本帧效果的配合与分析范围

竹林表面先保存材质与可见性；方向体积按位置和朝向提供环境光，屏幕深度搜索形成局部遮蔽。反射由当前深度决定查询位置，旧 HDR 提供屏幕颜色，环境探针补足低权重区域；累积雾描述从表面到相机之间的空气。角色与后续受光面片读取这些条件，再按各自规则写回颜色、运动与分类。

完成所有当前帧写入后，整帧历史将深度、运动和类别一起验证，再交给多尺度泛光与最终显示。AO、反射、雾和整帧颜色各自保留所需状态，不能用一张统一的“历史图”替代全部依赖。

本文也展开了泛光之后的五点锐化、颜色缩放、屏幕暗角、对数查表和显示编码。最终拷贝的 alpha 为零不影响其已存在的 RGB；这里展示实际显示颜色，避免把输出通道约定误判为场景空白。

当前场景反射的分块查询、命中判断、旧帧校验、独立历史与环境探针补足已在本篇展开，并用关闭屏幕反射的回放对照验证了地面贡献。晚期受光面片也给出一条实际材质的深度淡出、受光及输出规则；本帧执行的径向光束结果为零，不将其归因为可见雾光。

仍未完整确认的是方向光照的生产算法、辅助反馈几何的全部具体部位、其余场景／角色材质与效果变体，以及连续运动时的更新行为。不同材质对同一反射输入的消费也需要分别核对。小尺寸模糊支路不能直接当作另一份角色展示截帧中的景深。

</div>
