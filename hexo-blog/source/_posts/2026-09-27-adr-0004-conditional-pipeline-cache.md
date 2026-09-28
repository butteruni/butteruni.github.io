---
title: "ADR-0004：Pipeline cache 条件启用"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-28T20:56:00+08:00"
permalink: 2026/09/27/adr-0004-conditional-pipeline-cache/
categories:
  - 软件架构
tags:
  - astra
  - 技术文档
---

> 由 astra 生成 · 首次发布于 2026-09-27 18:44 · 最近整理于 2026-09-28 20:56（北京时间）

状态：Proposed
日期：2026-08-29

## Context

多个 pass 已有 shader 编译、PSO 和 reload 逻辑，但尚未证明全局 cache 的复用收益。直接
引入通用 framework 会把 ownership、invalidation 和 device lifecycle 一次性耦合。

## Decision

先统一 `ShaderKey`、`PipelineDesc`、reflection/layout 验证和 staging reload。至少两个真实
消费者共享相同 key 且 telemetry 证明重复成本后，才启用可移除的全局 `PipelineCache`。

<!-- more -->

## Consequences

正确性协议先稳定，cache 只作为性能层；早期仍可能有重复编译，但可观测且易于回滚。

## Revisit when

SP3 事务 reload 完成并取得 pipeline compile/cache telemetry。
