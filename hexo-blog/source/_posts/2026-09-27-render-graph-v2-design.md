---
title: "RenderGraph v2 长期设计"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-28T20:56:00+08:00"
permalink: 2026/09/27/render-graph-v2-design/
categories:
  - 图形学
tags:
  - astra
  - 技术文档
  - 渲染架构
---

> 由 astra 生成 · 首次发布于 2026-09-27 18:44 · 最近整理于 2026-09-28 20:56（北京时间）

状态：RG2-0 至 RG2-4 已实现；RG2-5/6 gate 已完成，实际优化均延期

日期：2026-08-29
前置：v1 资源声明与 barrier 基线稳定，`PassFrameCatalog` 仍为唯一帧目录

## 1. 目标与启动条件

v2 的目标是让 graph compile 能证明资源生产/消费关系、生成稳定拓扑顺序，并为 transient
aliasing 与 multi-queue 提供可靠的 lifetime。它不是为了替换清晰的线性执行，也不以
“自动排序 pass”为单独收益。

满足任一条件后才启动：

<!-- more -->

- 新 pass 频繁因人工顺序产生 read-before-write 或重复清单错误；
- GPU deformation 等 buffer dependency 需要进入 graph；
- telemetry 证明 transient texture aliasing 有显存收益；
- async compute 有明确重叠区间和 GPU 时间收益。

### 1.1 当前实现快照（2026-09-13）

RG2-0 至 RG2-4 已落地。`PassFrameCatalog` 仍提供稳定 tie-break 和兼容基线，实际执行顺序
由 graph 选择：

- `RenderGraph::Compile(executionOrder)` 只针对本帧实际启用的 pass 生成版本；声明但未执行的
  PBR/Forward、可选效果不会成为虚假 writer；
- Imported 与 Persistent 资源从外部/上帧 version 0 开始，每次 write 产生递增 version；
- compiler 记录 writer→reader 和 previous-writer→next-writer 两类依赖，主场景多个
  `sceneHDR`/depth writer 因而成为确定的版本链；
- transient 的必需读取没有更早 writer 时立即拒绝，并在错误中报告 pass 与资源；仅对 shader
  fallback 明确声明的 `ReadsOptional` 允许无 producer 的 version 0；
- `ssgiBlur` 已按真实的上一帧消费方式标为 Persistent；无纹理依赖但有 GPU side effect 的
  particle simulation 也进入 compiled schedule；
- `PeanutRenderGraphTests` 覆盖多 writer 版本、writer→reader、禁用 pass 排除、Persistent
  version 0、optional producer 和 read-before-write 拒绝；
- 资源注册区分 `TextureHandle` 与 `BufferHandle`，错误类别、跨 `Reset` 的 stale handle 和同名
  资源类别变更都会被拒绝；
- 内置资源名只在初始化时由 `FrameGraphResources::Resolve` 解析一次，所有生产 pass 的声明、
  资源/descriptor/RTV 访问均使用 typed handle；
- Pipeline Asset semantic 只在 graph plan 编译时解析，普通 read/write 可绑定 texture 或 buffer，
  color/depth attachment 强制为 texture；执行计划不再保存 semantic 字符串或进行资源名查表；
- compiler 以资源版本边和显式 `Before`/`After` 约束生成稳定 Kahn 拓扑，ready 节点按当前实际
  执行位置作 tie-break；产物保留完整 topology dependency，能解释影子顺序与 catalog 的差异；
- Pipeline Asset execution DAG 的 `after` 约束会保留到 runtime generation，并继续进入
  RenderGraph topology；未知目标立即拒绝，cycle 诊断输出闭合的完整 pass 路径；
- renderer 使用 `CompileForExecution` 先从 catalog 偏好顺序生成拓扑，再以选定顺序重新编译
  resource version，最后按相同顺序记录命令；无依赖冲突时保持 catalog 顺序，显式约束造成的
  合法重排不再只是审计结果；
- 每个 compiled pass 保存预验证的 `ResourceHandle + RGAccess` barrier target plan，内置 pass
  通过 generation-safe `PassHandle` 直接执行，不再按 pass name 回查声明；实际 before-state
  仍由 `ResourceStateTracker` 根据跨帧状态决定；
- compiler 输出每个 graph-declared 资源的 first/last-use pass，并标注 Imported/Persistent 分类；这份
  lifetime 只用于验证和后续 allocator 输入，当前不改变物理分配。
- `render.memory.get` 输出 transient committed/active/inactive bytes、兼容 alias slot 数、计划
  heap bytes 与 potential savings；估算采用不重叠 lifetime + 精确 format/flag/clear/alignment
  兼容分组，只生成可实现的保守 slot plan，不创建 placed texture。

本阶段不做 aliasing 或 multi-queue。

## 2. 保留的 v1 约束

- `PassFrameCatalog` 仍是 pass 构造、identity、profiling label 和默认顺序来源；
- 不使用静态自注册、全局 service locator 或运行时反射发现 pass；
- graph 管资源、依赖、barrier 与 schedule，不拥有游戏/编辑器状态；
- imported、persistent、history 和 transient 生命周期必须显式；
- 单 graphics queue 后端长期保留，作为调试和兼容执行模式。

## 3. Typed handle 与资源版本

```cpp
template<class Tag> struct RGHandle
{
    uint32_t index;
    uint32_t generation;
};

using RGTexture = RGHandle<TextureTag>;
using RGBuffer  = RGHandle<BufferTag>;

struct RGVersion
{
    uint32_t resource;
    uint32_t version;
};
```

字符串只用于 debug name。pass setup 使用 typed handle；每次 write 产生新 version，read 必须
绑定确定版本。这样可检测：未初始化读取、多 writer 覆盖、读取旧版本、错误资源类型和
graph `Reset` 后缓存失效 handle。仅重建底层尺寸资源的 resize 保持逻辑句柄稳定。

Imported 资源进入图时提供初始外部 version。History 资源明确声明 `previous` 与 `current`，
跨帧边不是本帧拓扑环。

## 4. Pass 声明

```cpp
graph.AddPass("SSGI", QueueHint::Graphics,
    & {
        b.Read(depth, RGUsage::ShaderRead);
        ssgi = b.Write(ssgi, RGUsage::UnorderedAccess);
        b.After("Geometry");       // 仅用于无资源边的语义约束
    },
    & { /* record */ });
```

Setup 只声明资源与显式约束；execute 只记录命令。pass 不缓存跨 compile 的物理 resource、
RTV/SRV handle 或临时 frame snapshot 指针。

Side-effect pass（capture、timestamp resolve、present）必须显式标记，否则 compile 可将其
视为无消费者并裁剪。

## 5. 依赖图与稳定拓扑排序

依赖边来源：

1. writer version → reader；
2. previous writer → next writer；
3. `Before` / `After` 显式约束；
4. side-effect/present 的终点约束。

拓扑排序使用稳定 Kahn 算法；多个合法节点同时 ready 时，以 `PassFrameCatalog` 原顺序作为
tie-breaker。这样迁移初期在依赖等价时保持当前画面和 profiler 顺序。

compile 必须拒绝并输出完整路径：

- cycle；
- read without producer/import；
- incompatible usage/format/sample count；
- history 误接成本帧 cycle；
- 未声明 side effect；
- descriptor/RTV/DSV 预算溢出。

## 6. 编译产物

`CompiledRenderGraph` 包含：

- ordered pass list；
- logical version → physical resource 映射；
- barrier batches，包括 UAV 与 aliasing barrier；
- first/last use lifetime；
- queue assignment 与 cross-queue fence（后续阶段）；
- descriptor plan；
- 可导出的 JSON/DOT 调试图。

结构未变化时复用 compile 产物；每帧只更新 imported provider、settings 和动态 enable。

2026-09-18 已实现 `CompileForExecution` 的单份编译缓存：精确比较 pass 声明、首选顺序
和资源元数据，一致时复用拓扑、版本依赖、barrier target、lifetime 与 aliasing 估算。
`ClearPasses` 暂存旧产物但对调用方仍呈现空图；缓存命中也生成新的 pass generation，
旧 `PassHandle` 继续失效。资源 provider、descriptor 与实际 barrier before-state 在执行时
查询，不跨帧缓存。resize、资源重建、Reset、设备初始化或声明变化会重新编译。
当前仍逐帧重建声明目录；此优化只消除重复编译，不改变资源分配或引入多队列。
结构性 enable/disable 必须产生新的 graph signature。

## 7. Barrier 与 aliasing

首阶段只把现有 `ResourceStateTracker` 结果移入 compiled barrier plan，不改变资源分配。
aliasing 在 lifetime 验证完成后单独启用：

- 仅 transient 且 first/last use 不重叠的兼容资源共享 heap range；
- imported、persistent、history、PT accumulation 永不 alias；
- clear value、format family、sample count 与 heap flag 必须兼容；
- aliasing 前后自动插 barrier；
- 可通过开关禁用 aliasing并获得完全一致的画面。

### 7.1 RG2-5 启动门槛实测（2026-09-13）

环境：RTX 5070 Ti、1920×1080、雷米埃尔角色管线，SSAO/SSGI/Bloom 开启。CLI 原始字段：

```text
rg_transient_resources=12
rg_transient_active_resources=12
rg_transient_alias_slots=10
rg_transient_committed_bytes=83361792
rg_transient_planned_heap_bytes=76218368
rg_transient_potential_savings_bytes=7143424
video_memory_usage_bytes=718028800
video_memory_budget_bytes=15966666752
```

即 committed 79.5 MiB → 保守计划 72.6875 MiB，最多节省 6.8125 MiB；约占当前显存使用量
0.995%，占 local budget 0.045%。收益不足以覆盖 placed texture heap、aliasing barrier 与
clear-value 验证复杂度，因此 **RG2-5 实际 aliasing 延期**。估算遥测保留；只有新增大量
分辨率相关 transient、或典型场景 potential savings 明显增长时才重新启动。

## 8. Multi-queue

拓扑化不等于立即启用 async compute。queue assignment 分为：

1. pass 提供 `Graphics`、`ComputeCandidate` 或 `CopyCandidate` hint；
2. compiler 验证资源与命令能力；
3. profiler 证明可与 graphics 重叠；
4. compiler 插 queue wait/signal；
5. debug 模式可强制单 queue 对照。

首批候选只能选择依赖边清晰、持续时间可观测的 compute pass，例如独立 deformation 或
部分后处理。没有重叠收益的 pass 保持 graphics queue。

### 8.1 RG2-6 启动门槛实测（2026-09-13）

环境同 §7.1，开启 `render.profiler` 后连续读取 30 个稳定帧，nearest-rank 结果：

| Pass | Queue 可迁移性 | GPU p50 | GPU p95 |
|---|---|---:|---:|
| HiZ | compute candidate，依赖本帧 depth，结果供后帧剔除 | 0.031904 ms | 0.033024 ms |
| ParticleSimulate | compute candidate，与大部分角色 graphics 独立 | 0.011488 ms | 0.011840 ms |
| SSAO | 当前为 pixel pass | 0.115584 ms | 0.118432 ms |
| SSGI | 当前为 pixel pass | 0.171712 ms | 0.188480 ms |

真正可直接迁移的两个 compute candidate 合计 p50/p95 约 0.0434/0.0449 ms，明显不足以抵消
额外 command queue、wait/signal、跨队列资源 ownership 与诊断成本。较重的 SSAO/SSGI 需要
先改写为 compute 才可能成为候选，那是独立 shader/perf 项，不能用 multi-queue 重构顺带完成。
因此 **RG2-6 延期**；当前单 graphics queue 继续作为唯一执行路径，不增加空转 fence。

## 9. 迁移阶段

| 阶段 | 内容 | 行为要求 |
|---|---|---|
| RG2-0 | 已完成：v1 同步生成资源版本和依赖审计 | 仍按现有顺序执行 |
| RG2-1 | 已完成：typed texture/buffer handle | pass 与执行计划内无字符串查找 |
| RG2-2 | 已完成：stable topology 影子编译 | 与 catalog 顺序差异可解释，尚不驱动执行 |
| RG2-3 | 已完成：topology 成为执行顺序 | resource version 与命令记录顺序一致；截图基线一致 |
| RG2-4 | 已完成：compiled barrier target/lifetime | PassHandle 无运行时名字查表；GBV 零 error |
| RG2-5 | 已有 gate telemetry，实际 aliasing 延期 | 当前仅 6.8125 MiB / 0.995% live usage |
| RG2-6 | gate 已完成，multi-queue 延期 | compute candidates p95 合计约 0.0449 ms |

## 10. 验收

- 当前所有 pass 在 RG2-0/1 下执行顺序不变；
- 人工制造 cycle/read-without-writer 时输出完整资源和 pass 路径；
- resize、pass toggle、FXAA/PT/history 资源版本正确；
- graph 可导出结构、barrier、lifetime 和 descriptor plan；
- 单 queue、topology、aliasing off/on 的截图一致；
- multi-queue 关闭时无额外 fence；开启后有 profiler 证明的重叠收益。
