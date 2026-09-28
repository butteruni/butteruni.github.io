---
title: "GPU/CPU 性能预算与回归协议"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-28T20:56:00+08:00"
permalink: 2026/09/27/gpu-performance-budget/
categories:
  - 图形学
tags:
  - astra
  - 技术文档
  - 渲染架构
---

> 由 astra 生成 · 首次发布于 2026-09-27 18:44 · 最近整理于 2026-09-28 20:56（北京时间）

状态：Living benchmark contract

日期：2026-08-29
适用范围：renderer、MMD runtime、GPU deformation、RenderGraph 与 shader reload

## 1. 目的

架构优化必须由相同场景、相同设置和可重复采样证明。本文件定义要采集的指标、基准场景、
回归阈值和功能迁移的性能 Gate。绝对预算在记录参考硬件基线后填写；在此之前不得用单次
FPS 或主观流畅度替代证据。

## 2. 测试档位

| 档位 | 场景 | 目的 |
|---|---|---|
| B0 | 空场景/基础 cube，1080p | renderer 固定成本 |
| B1 | Gene + Wavefile + camera VMD，1080p | 单 MMD 正确性与成本 |
| B2 | 同一 MMD asset 的 4 个独立 instance | asset 共享和 deformation 扩展 |
| B3 | Sponza/实例压力场景 | culling、descriptor、draw 扩展 |
| B4 | PathTrace/GI 压力场景 | 显存、history、长期 pass 成本 |

<!-- more -->

每个档位记录资产 commit/hash、分辨率、VSync、render settings、warmup 帧、采样帧数、GPU
驱动版本和参考硬件。截图作为正确性证据，不替代时间数据。

## 3. 必采指标

CPU：

- frame median/p95/p99；
- animation/IK/physics/morph 求值时间；
- command recording 与 RenderGraph compile 时间；
- scene load、PMX parse、shader compile/reload 时间；
- 每帧临时 allocation 次数与字节。

GPU：

- frame 与每 pass timestamp；
- deformation、shadow、geometry、post、culling 时间；
- draw/dispatch/copy 次数；
- pipeline compile/cache hit；
- queue overlap 与 wait 时间。

内存与上传：

- local budget/current usage；
- heap、placed/committed resource、descriptor 数量；
- upload/readback bytes per frame；
- morph vertex rewrite bytes、bone/morph weight bytes；
- transient peak、alignment waste、retired generation bytes。

## 4. 初始预算策略

目标帧档位：

- 60 Hz：总预算 `16.67 ms`；
- 30 Hz 离线预览：总预算 `33.33 ms`；
- CLI 离线导出按固定 simulation step，记录 throughput，不用墙钟 dt 改变结果。

在参考硬件基线落地前，使用相对回归 Gate：

- median 退化超过 5%：需要解释；
- p95 退化超过 10%：阻断合并，除非功能收益有明确批准；
- GPU memory peak 增长超过 10% 或 64 MiB 中较小者：需要归因；
- steady-state 新增每帧 committed resource、PSO 创建或 GPU drain：阻断；
- validation error、descriptor 越界、资源状态 warning：无条件阻断。

绝对 pass budget 应在第一次稳定 capture 后写入本文件，不从经验猜测。

## 5. 专项 Gate

### MMD Runtime

- 固定输入重复两次的 pose hash、关键截图一致；
- 多 instance 不复制 immutable asset 数据；
- seek/reset 不依赖上一次实时播放路径。

### GPU Deformation

- steady animation 的 CPU full-vertex upload 为 0；
- pause 且权重未变时 deformation dispatch 为 0；
- 4 instance 的 CPU 时间不得按完整顶点数线性增长；
- GPU 成本必须按 B1/B2 同时报告，不能只给单角色数据。

### Shader/Pipeline

- reload 失败保持旧 generation；
- 同 key 重复编译数量为 0；
- reload 不调用无条件 `WaitForGpuIdle`；
- 报告 staging/retired pipeline 内存峰值。

### RenderGraph v2

- graph structure 未变时不重复执行重型 compile/allocation；
- topology 与 linear 模式分别采样；
- aliasing 必须报告节省字节和新增 barrier/GPU 时间；
- async compute 必须报告实际 overlap，不只报告 queue 数量。2026-09-13 RG2-6 gate：RTX
  5070 Ti、1080p 雷米埃尔 30 帧中，HiZ GPU p50/p95=0.031904/0.033024 ms，
  ParticleSimulate=0.011488/0.011840 ms；可迁移候选 p95 合计约 0.0449 ms，不足以启动
  multi-queue。SSAO/SSGI 为 pixel pass，不计入可直接迁移收益。

## 6. 采样协议

1. Debug 用于 validation；Release/RelWithDebInfo 用于性能结论；
2. warmup 至少 120 帧，随后采样至少 600 帧；
3. 每档至少运行 3 次，报告 median 与最差 p95；
4. shader compile、scene load 和 steady frame 分开测量；
5. 禁用会改变时序的外部 capture 后再取最终数字，capture 仅用于定位；
6. 原始 JSON/CSV 放到不入库的 capture 目录，摘要和配置写入提交/PR。

统计窗口的 p50/p95 使用 nearest-rank 定义：排序后取 `ceil(p*n)-1` 下标。

## 7. CLI 与输出

现有 `render.memory.get`、profiler/stats 作为入口扩展，同一 snapshot 同时供 CLI 与 Stats UI。
长期建议增加：

```text
render.performance.snapshot
render.performance.capture.begin frames=600
render.performance.capture.end output=...
render.deformation.stats   # 已实现(2026-08-30,GD0):CPU rewrite/upload 字节、copy 次数、
                           # 求值/发布耗时 p50/p95、frame_ms,120 帧滚动窗,schema_version=1;
                           # 开关 render.deformation_stats(默认关,近零开销)
render.pipeline.stats
render.graph.dump
```

JSON 字段需要版本号，单位写在字段名或 schema 中，禁止同一字段混用 bytes/MiB 或
milliseconds/microseconds。

## 8. Definition of Done

- B0-B4 有可重复命令和参考设置；
- 参考硬件、驱动、构建配置与 commit 被记录；
- 架构迁移前后使用同一 capture protocol；
- 性能结论同时包含正确性截图、CPU、GPU、内存与 upload；
- 超过阈值的回归有明确接受者和原因，不以“之后优化”关闭。

## 9. GD0 基线(B1,2026-08-30)

- 场景:Gene.pmx + `mmd/motion/wavefile_v2.vmd` + `mmd/camera/wavefile_camera.vmd`,1080p,持续播放。
- 参考硬件:NVIDIA GeForce RTX 5070 Ti(15995 MB VRAM);构建:**Debug**(性能结论需按 §6 用
  RelWithDebInfo 复测);采集 commit:`0029980`(原始 JSON 采集于该提交前的同一工作树,
  即 parent `8c9e7c9` + 遥测改动;树内容与 `0029980` 等价,数值可直接追溯至 `0029980`)。
- 采样:warmup ~180 帧,3 轮 × ~600 帧,CLI `render.deformation.stats -format json` 轮询,
  每快照为 120 帧滚动窗;原始数据 `captures/gd0-baseline-b1.json`(不入库)。
- 表中 GD0 p95 由 `0029980` 当时的旧下标公式生成；当前实现已切换为上述 nearest-rank，
  GD2 前后正式对比必须在同一新公式下重新采集，不能直接把旧 p95 当回归基准。

| 指标 | median | 最差轮 | 单位 |
|---|---|---|---|
| frame 耗时 p50 / p95 | 12.3 / 14.8 | 12.5 / 15.0 | ms |
| EvaluatePose 求值 p50 / p95 | 2375 / 3881 | 2534 / 3971 | µs |
| EvaluateMorphs 求值 p50 / p95 | 3748 / 4902 | 3821 / 5057 | µs |
| renderer 发布段 p50 / p95 | 841 / 1503 | 894 / 1530 | µs |
| morph vertex rewrite(CPU memcpy) | 14 697 072 | 同左 | bytes/frame |
| morph upload CopyBufferRegion | 13 次 / 14 697 072 | 同左 | 次 / bytes/frame |
| bone palette memcpy + copy | 14 336 + 14 336 | 同左 | bytes/frame |
| morph weight 独立通道字节 | 0(无通道,CPU 合成) | 0 | bytes/frame |

要点:morph 播放期每帧约 **14.7 MB** CPU 顶点重写 + 同量 GPU copy(28k 顶点 × 13 submesh
全量),这正是 GD1-GD3 要消除的成本;暂停且权重不变时 rewrite/copies 归零(pause 不
dispatch 的 CPU 侧基线),bone palette 因物理持续推进仍每帧 14.3 KB。
