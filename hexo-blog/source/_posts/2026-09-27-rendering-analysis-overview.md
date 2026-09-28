---
title: "三个游戏渲染实现：主文档与公共资料概要"
date: "2026-09-27T18:44:59+08:00"
updated: "2026-09-28T20:56:00+08:00"
permalink: 2026/09/27/rendering-analysis-overview/
categories:
  - 图形学
tags:
  - astra
  - 渲染分析
  - 文章概要
---

> 由 astra 生成 · 首次发布于 2026-09-27 18:44 · 最近整理于 2026-09-28 20:56（北京时间）

本组内容从真实截帧与可复核的 GPU 证据出发，分析绝区零（蕾米）、原神（木偶）和终末地（竹林场景）的场景与角色渲染。源目录中的 52 份 Markdown 全部纳入这批文章：8 篇主分析，另外 44 篇覆盖公共架构、工具说明、架构决策和截帧证据。主分析沿着资源、事件、shader 和画面结果追踪渲染阶段；能从截帧直接确认的内容与根据绑定和数据流作出的推断会分别说明。下面先给出 8 篇主文档的摘要，再按主题列出公共资料。

## 绝区零（蕾米）

- [场景实现分析](/2026/09/27/zzz-scene/)：以蕾米所在大厅为例，从烘焙光和局部灯光候选追到镜像视图、湿润材质、屏幕阴影与时序累积。文章特别梳理 HDR 颜色何时已包含光照、身份标记如何参与历史复用，以及单帧证据能支持到哪一步。

- [角色实现分析](/2026/09/27/zzz-character/)：拆解形态变形、面部与眼睛的专用着色、角色阴影分类和运动输出。结合场景文档，说明角色路径如何读取公共场景结果，并将专用材质、遮挡与后续时序需要的数据接回整帧管线。

## 原神（木偶）

- [场景实现分析](/2026/09/27/genshin-scene/)：围绕雪城中的高度层与积雪材质，追踪压缩烘焙阴影的读取、空间环境反馈和时序重建。文章把可核对的纹理采样、通道与阶段输出逐项连起来，也标明仅凭当前捕获尚不能还原的内部机制。

- [角色实现分析](/2026/09/27/genshin-character/)：按身体、脸部 SDF、眼睛、裙装与袜子拆开角色材质路径，比较不同部位如何组合形状、颜色与边缘处理。重点放在角色着色如何接收雪城提供的颜色和阴影，以及专用分支对最终外观的影响。

## 终末地（竹林场景）

- [场景实现分析](/2026/09/27/endfield-scene/)：从竹林地形的几何和方向光照体积出发，逐步分析 AO、历史反射、积分雾、泛光与 HDR 输出。对照图展示 AO、亮点提取和最终画面的关系；正文区分场景阶段写出的数据与后续角色几何阶段实际读取的数据。

- [角色实现分析](/2026/09/27/endfield-character/)：聚焦全屏光照结束后的角色几何着色，分析方向环境光如何参与角色外观、辅助几何如何反馈到场景，以及角色绘制如何写入公共运动结果。文章用阶段前后和最终画面对照说明顺序，并把结论限定在这份截帧能够观察到的范围内。

## 横向比较

- [三个游戏的场景实现对比](/2026/09/27/scene-comparison/)：把三份场景截帧放进同一组问题中比较：材质最终求值发生在哪个阶段、缓冲区在不同阶段代表什么、场景光照与角色消费如何衔接、时序历史怎样读写。文章强调相似画面背后可能是不同的数据流，不以单帧外观推断相同算法。

- [三个游戏的角色实现对比](/2026/09/27/character-comparison/)：比较几何与变形、材质分支、脸部处理、环境光照接入和运动输出，指出角色专用渲染在哪些环节独立、又在哪些环节复用场景结果。逐项区分事件或 shader 直接证据与更高层的工程架构推断。

<!-- more -->

## 公共渲染资料

- [角色渲染数据流](/2026/09/27/character-render-data-flow/)：说明角色数据从资产、变形到渲染阶段之间的边界。

- [MMD 基础设施设计](/2026/09/27/mmd-infrastructure-design/)：组织角色资产、动画、渲染接口和运行时职责。

- [TAA 实现比较](/2026/09/27/taa-implementation-comparison/)：横向整理捕获中的运动、历史有效性和融合证据。

- [TAA 公共 shader 与运行时实现](/2026/09/27/taa-runtime-implementation/)：补充时序抗锯齿在公共 shader 和运行时的实现组织。

## 渲染器与公共图形架构

- [Scene 与渲染数据边界](/2026/09/27/scene-render-data-boundary/)：界定场景作者数据、渲染器持有的 GPU 代理，以及提交给单帧的不可变数据之间的职责边界。

- [Mesh 渲染数据流](/2026/09/27/mesh-render-data-flow/)：梳理导入网格、GPU 数据布局、顶点输入声明与绘制范围，说明普通模型和逆向角色如何共用渲染数据路径。

- [渲染器 GPU 内存架构](/2026/09/27/renderer-memory-architecture/)：定义 GPU 分配、上传、驻留和生命周期管理的分层职责，并与网格数据流对照。

- [Render Graph v1 设计](/2026/09/27/render-graph-design/)：记录当前单队列图的资源版本、依赖审计、拓扑执行和屏障目标，作为实际实现的基线说明。

- [RenderGraph v2 长期设计](/2026/09/27/render-graph-v2-design/)：汇总 RG2 已完成阶段、后续门槛和延期的优化，区分已经落地的基础能力与尚未启用的优化。

- [Shader 与 Pipeline 长期架构](/2026/09/27/shader-pipeline-architecture/)：说明 shader key、pipeline 描述、root layout 反射、PSO 生成和缓存策略的长期设计。

- [Shader 与 Pipeline 接口清单](/2026/09/27/shader-pipeline-inventory/)：把 shader、pipeline 和运行时接口整理成可检查的基线清单，便于核对已有覆盖与缺口。

- [材质系统设计稿](/2026/09/27/material-system-design/)：梳理材质定义、shader 选择和 pipeline 创建之间的接口，为不同材质路径共享公共管线约束。

- [材质、Shader 与渲染管线解耦计划](/2026/09/27/material-pipeline-decoupling-development-plan/)：列出近期拆分目标、实施次序与验收边界，说明材质内容如何逐步脱离固定渲染路径。

- [通用自定义 Render Pipeline Asset](/2026/09/27/render-pipeline-asset-format/)：记录 schema、compiler、运行时注册和 D3D12 backend 的资产格式与落地状态。

- [GPU Deformation 长期架构](/2026/09/27/gpu-deformation-architecture/)：描述角色与网格变形的分阶段 GPU 路径，以及资产数据、变形任务和绘制阶段之间的接口。

- [MMD Runtime 长期架构](/2026/09/27/mmd-runtime-architecture/)：定义 MMD 运行时资产、实例、动画更新和渲染提交之间的长期边界，与 MMD 基础设施设计稿互相补充。

- [GPU/CPU 性能预算与回归协议](/2026/09/27/gpu-performance-budget/)：规定性能数据的记录维度、预算口径和回归检查方式，让图形功能的成本可以重复核验。

- [GI 测试场景与对比协议](/2026/09/27/gi-test-scenes/)：为屏幕空间和后续 GI 方案固定模型、相机、光照及截图流程，并以路径追踪结果作为对照。

- [Peanut 渲染器架构开发计划](/2026/09/27/renderer-architecture-development-plan/)：按阶段列出渲染器模块的实现目标、依赖和推进顺序。

- [Peanut 路线图](/2026/09/27/roadmap/)：概览产品方向和后续范围，并把渲染平台目标链接到具体专题设计。

- [编辑器命令与快照长期架构](/2026/09/27/editor-command-architecture/)：说明编辑器命令、状态变化和快照的长期组织方式，为批处理和可复现操作提供边界。

- [编辑器 CLI 参考](/2026/09/27/editor-cli-reference/)：汇总命令行入口、参数和命令分组，便于通过脚本驱动编辑器操作。

## 架构决策记录

- [Architecture Decision Records 索引](/2026/09/27/adr-readme/)：说明设计文档与 ADR 的分工，以及哪些长期决策需要记录选择理由和重议条件。

- [ADR-0001：DX12-only 生产渲染器](/2026/09/27/adr-0001-dx12-only-production-renderer/)：记录生产渲染后端聚焦 D3D12 的选择及其适用范围。

- [ADR-0002：RenderGraph v1 保持线性执行](/2026/09/27/adr-0002-linear-rendergraph-v1/)：解释 v1 阶段为何先保持线性执行顺序，以及未来改变该决策需要满足的条件。

- [ADR-0003：MMD 资产与实例分离](/2026/09/27/adr-0003-mmd-asset-instance-split/)：记录共享资产数据和场景实例状态分离的原因与约束。

- [ADR-0004：Pipeline cache 条件启用](/2026/09/27/adr-0004-conditional-pipeline-cache/)：记录缓存启用所依赖的收益证据、失效处理和验证门槛。

- [ADR-0005：GPU deformation 分阶段迁移](/2026/09/27/adr-0005-staged-gpu-deformation/)：说明变形任务分阶段迁移的顺序、边界和回退考虑。

## 捕获索引与证据附录

- [截帧文件、原始统计与回放定位索引](/2026/09/27/scene-capture-comparison-capture-index/)：集中记录三份捕获的范围与事件定位。

- [三个截帧的绑定证据索引](/2026/09/27/scene-capture-comparison-binding-details/)：按问题指向场景和角色绑定材料。

- [场景与整帧处理：逐事件绑定附录](/2026/09/27/scene-capture-comparison-scene-binding-details/)：保留场景阶段和整帧处理的事件、资源与绑定依据。

- [角色：事件与绑定附录](/2026/09/27/scene-capture-comparison-character-binding-details/)：补充角色绘制与角色资源的事件级证据。

- [资源语义与证据对照](/2026/09/27/scene-capture-comparison-resource-semantics/)：按资源比较格式、读写阶段和推断强度。

- [蕾米截帧 Pipeline Map](/2026/09/27/zzz-remielle-rdc-pipeline-map/)：提供绝区零角色截帧的阶段定位。

- [终末地截帧 Pipeline Map](/2026/09/27/endfield-luoxi-rdc-pipeline-map/)：提供终末地竹林截帧的阶段定位。

- [蓝色星原截帧 Pipeline Map](/2026/09/27/azur-promilia-rdc-pipeline-map/)：补充另一份公共角色渲染捕获流程索引。

- [终末地角色截帧说明](/2026/09/27/endfield-luoxi-rdc-readme/)：记录角色截帧工程的目标和分析范围。

- [效果图来源与显示约定](/2026/09/27/rendering-figure-notes/)：说明配图来源、显示范围、对照方法和结论边界。

- [蓝色星原截帧逆向说明](/2026/09/27/azur-promilia-rdc-readme/)：概括角色阴影、角色 GBuffer、专用重绘与屏幕合成的分析目标。

- [蓝色星原 BasePass 替换状态](/2026/09/27/azur-promilia-rdc-base-readme/)：记录角色 BasePass 的逐 draw 替换用例和验证门槛。

- [蓝色星原语义 Shader 替换状态](/2026/09/27/azur-promilia-rdc-semantic-readme/)：说明 HLSL 重建如何经过编译、捕获事件替换和回放验证。

- [原神截帧提取管线](/2026/09/27/genshin-rdc-extraction-pipeline/)：记录从 RenderDoc 捕获提取角色网格、UV、贴图和常量并接入引擎的流程。

- [原神真实脸部 Shader 结构](/2026/09/27/genshin-rdc-face-shader-structure/)：围绕真实截帧和资源身份梳理脸部 shader 的输入、分支与着色结构。

- [蕾米语义 Shader 重建说明](/2026/09/27/zzz-remielle-rdc-semantic-readme/)：说明角色绘制对应的语义 HLSL 重建覆盖范围及验证方式。

直接引用的配图、小型 shader 导出、常量和语义 JSON 已随文章托管。三份体积较大的 inventory JSON 保留在原始分析工程，文章会显示文件名但不提供下载。
