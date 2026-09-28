---
title: "ADR-0005：GPU deformation 分阶段迁移"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-28T20:56:00+08:00"
permalink: 2026/09/27/adr-0005-staged-gpu-deformation/
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

CPU morph 当前重写并上传完整 vertex buffer；直接融合 morph、skinning、SDEF、bounds 和
multi-queue 风险过高，也难以定位收益。

## Decision

第一阶段使用 compute morph 生成 per-instance morphed stream，继续复用现有 VS skinning。
只有 profiler 证明重复 VS skinning 是瓶颈，才融合 compute skinning 或加入 SDEF/QDEF。

<!-- more -->

## Consequences

能先移除最大 CPU/upload 成本并保持 Shadow/PBR/Outline 接线；会暂时保留一份实例级
morphed output buffer，需要内存预算和 fence-safe 复用。

## Revisit when

GD3 完成并取得 B1/B2 deformation、VS 和显存数据。
