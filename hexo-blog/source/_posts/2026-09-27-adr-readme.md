---
title: "Architecture Decision Records"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-28T20:56:00+08:00"
permalink: 2026/09/27/adr-readme/
categories:
  - 软件架构
tags:
  - astra
  - 技术文档
---

> 由 astra 生成 · 首次发布于 2026-09-27 18:44 · 最近整理于 2026-09-28 20:56（北京时间）

本目录记录影响多个阶段、后续可能被重新讨论的长期技术决策。设计文档描述“如何做”，
ADR 记录“为什么选择它、何时允许推翻”。

## 状态

- Proposed：尚未形成约束；
- Accepted：当前实现和后续计划必须遵守；
- Superseded：已由新的 ADR 替代；
- Rejected：评估后不采用，但保留理由。

## 当前记录

| ADR | 状态 | 决策 |
|---|---|---|
| `0001-dx12-only-production-renderer.md` | Accepted | 保持 DX12-only，不恢复通用 Renderer 基类 |
| `0002-linear-rendergraph-v1.md` | Accepted | v1 保持显式线性；v2 条件触发拓扑化 |
| `0003-mmd-asset-instance-split.md` | Accepted | MMD 资产不可变、实例状态可变 |
| `0004-conditional-pipeline-cache.md` | Proposed | 先统一 pipeline 协议，再按证据启用 cache |
| `0005-staged-gpu-deformation.md` | Proposed | 先 compute morph + VS skinning，再评估融合 |

<!-- more -->

## 模板

```markdown
# ADR-NNNN：标题

状态：Proposed/Accepted/Superseded/Rejected
日期：YYYY-MM-DD

## Context
## Decision
## Consequences
## Revisit when
```

ADR 一经 Accepted 不修改原决策内容；需要改变时新增 ADR 并标记 superseded。
