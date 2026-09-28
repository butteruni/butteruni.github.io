---
title: "TAA 公共 shader 与运行时实现"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-28T10:32:00+08:00"
permalink: 2026/09/27/taa-runtime-implementation/
categories:
  - 图形学
tags:
  - astra
  - 渲染分析

---

> 由 astra 生成 · 首次发布于 2026-09-27 18:44 · 最近整理于 2026-09-28 10:32（北京时间）

更新：2026-09-26。范围为洛茜、洛洛和蕾米，FSR 不在本次修改范围内。

<!-- more -->

## 公共代码

TemporalAACommon.inl 提供有符号平方/四次方运动解码、带编码中心参数的运动编码、clip 坐标运动差、历史 UV 越界判断、最大通道 HDR 压缩/展开、两种尺度的 YCoCg 转换，以及蕾米使用的沿方向颜色盒裁剪。

洛洛的 YCoCg 转换采用保留原始分量赋值顺序的宏。将这段改成返回 `float3` 的普通函数会改变 FXC 的浮点优化结果；目前抽取后的捕获替换结果保持逐字节一致。宏的源和目标必须是不同变量。

各自 shader 继续持有采样器、常量 ABI、深度候选次序、采样足迹、材质/ID 分支、历史权重和 MRT 输出。洛茜的五 tap 历史重建、洛洛的逐通道 clamp/方差裁剪，以及蕾米的 ID 拒绝并未合成一个通用 resolve。

## 各条运行时链

| 路径 | 本帧处理 | 跨帧资源 |
|---|---|---|
| 洛茜 | Prepare → 低分辨率 Mask → Resolve | RGBA16F 颜色（含置信度 alpha）、R16F 深度、RGB10A2 运动/分类 |
| 洛洛 | Mobile TAA → 景深分支/合成 → 最终 TAA | 两段共同读取 R11G11B10F 颜色历史，最终 TAA 输出写回；Mobile 另读写 R8 运动遮罩 |
| 蕾米 | primary-lighting → temporal-aa → general-lut | R11G11B10F 颜色与 R8 ID，两个当前输出分别写回对应历史 |

洛洛的离线参考图继续绑定原始捕获资源；交互图绑定真实历史资源和 `PSRuntime`。历史不再指向当前阶段颜色。`PSRuntime` 只增加运行时重置及必要的坐标适配，正常帧沿用捕获算法。Mobile 输出处于当前采样网格，因此其历史 UV 另补偿本帧 jitter；最后一段负责移除当前颜色的 jitter。

蕾米的生产 shader 为 ZZZRemielleSemantic/TemporalAA.hlsl。颜色与 ID 不一致时提前拒绝历史，保留 0.498039216 的运动编码中心、五个颜色采样、亮度差扩张、压缩 RGB 裁剪和按像素标记旁路。运行时位于 Peanut 已有的主光照与 LUT 之间，不能据此声称原游戏全部雾、透明合成、Bloom 和运动模糊已还原。

## 相机、运动与历史生命周期

- `render.taa` 默认开启，作用于上述三个 profile；路径追踪时关闭本次采样偏移。
- 统一使用独立于 backbuffer slot 的帧序号，以及 16 点零均值 Halton 偏移。该序列是 Peanut 的实现选择，并非单帧捕获证明的原游戏序列。
- 光栅化使用抖动投影；运动使用不带 jitter 的当前/上一帧投影和对象变换。深度重建使用与本帧光栅化一致的投影。
- 洛洛补上真实 previous VP，修正运行时有符号运动编码，并避免把透明程序中全零的矩阵模板匹配到任意常量填充区。蕾米补上 previous VP、previous view/projection，以及用于运动的 non-jittered VP。
- 捕获资产没有实时的上一帧骨骼形变流，本次支持这些静态捕获角色的相机、实例和节点变换运动；不能把捕获的 alternate-position 当成正在播放的上一帧姿态。
- 首帧、资源重新分配、帧序号中断、场景身份改变、切镜/投影变化、开关切换和 shader reload 均使历史失效。reset shader 会在读历史颜色之前返回，避免未初始化数据或 NaN 经零权重传播。
- 历史为独立 persistent 纹理。读取旧历史 → 当前 resolve → `CopyResource` 写回，均在同一图形队列上排序，使用资源状态跟踪器切换状态。CPU 双缓冲不意味着可在同一次 draw 中读写同一历史纹理。

公共 CPU 支持见 TemporalAA.h、TemporalHistory.h；注册和开关编排在 D3D12Renderer_Temporal.cpp。

## 仍需区分的证据边界

洛洛原始 mask 670 在捕获整帧仅由 e2562 读取，未发现生产者。运行时接出 Mobile shader 已有的 `SV_Target1` 并保存为下一帧 mask，这是使实时反馈完整的适配；原始 e2562 只绑定 RT0。它不是对原游戏 mask 交换策略的确证。

蕾米保留上游 primary-lighting 输出的 z/w 分类契约，不把 ID 改写为实例编号。Peanut 的原始 velocity target 仍用零背景作为最终合成覆盖信号；仅在 TAA 内把无几何背景适配为该解码器的中性运动，避免破坏合成遮罩。

## 验证

捕获替换使用原始事件、原始输入和 capture 入口；包含新 `.inl`。结果保存在 [shader-refactor-validation.json](/public-doc-assets/taa-evidence/shader-refactor-validation.json)。

| 替换事件 | 比较结果 |
|---|---|
| 洛茜 Prepare e948 | 深度 9,907,200 字节、数据 19,814,400 字节，均零差异 |
| 洛茜 Resolve e966 | 39,628,800 字节，零差异；保留 `-O0` 捕获编译契约 |
| 洛洛 Mobile e2562 | 19,814,400 字节中 11 字节差异；抽取前的已有 shader 也是同样 11 字节，替换输出 hash 完全相同 |
| 洛洛最终 TAA e2687 | 19,814,400 字节，零差异 |
| 蕾米 e11966 | ID 输出零差异；颜色 19,768,320 字节中 8 字节差异，涉及 5 个像素，最大通道差 2 个 R11G11B10 编码步长 |

Mobile 和蕾米尚未达到与原始 DXBC 的逐字节一致，不把严格验证器的 `passed=false` 改写成通过。

Debug 完整构建通过。21 项 CTest 通过，包括 shader cook、帧图、管线资产、GPU 资源验证和 temporal 相机测试。本轮排除了先前已在 WARP 上出现 device-removal 的 `PeanutEditorCliSmoke`；实际硬件另行验证了三 profile 的画面、TAA 开关、相机移动/跳转、场景切换及 shader reload，最终验证期间未记录 D3D12/GBV 错误。运行时尺寸重建依赖分配身份失效机制，本轮未进行窗口拖拽 resize 的交互验证。

另捕获了 Peanut 自身的蕾米实时帧，确认 resolve 时 reset 标志为 0，读取的是独立旧颜色/ID；帧末拷贝后两份历史 hash 分别等于当前颜色/ID。见 [runtime-history-verification.json](/public-doc-assets/taa-evidence/runtime-history-verification.json)。

本地画面位于 `Peanut/build_test/taa-validation/`：`endfield-shared-final.png`、`azur-shared-final.png`、`remielle-shared-final.png`，以及对应的开关和移动截图。
