---
title: "ADR-0002：RenderGraph v1 保持线性执行"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-28T20:56:00+08:00"
permalink: 2026/09/27/adr-0002-linear-rendergraph-v1/
categories:
  - 软件架构
tags:
  - astra
  - 技术文档
---

> 由 astra 生成 · 首次发布于 2026-09-27 18:44 · 最近整理于 2026-09-28 20:56（北京时间）

状态：Accepted
日期：2026-08-29

## Context

当前 graph 已能统一屏幕资源、访问声明和 barrier。pass 数量及 queue 模型尚不要求通用
调度器，贸然拓扑化会扩大 resize、history 与调试风险。

## Decision

v1 使用 `PassFrameCatalog` 的显式线性顺序。typed handle、资源版本、稳定拓扑排序、
aliasing 和 multi-queue 进入独立的条件式 v2 路线，见 `Docs/render-graph-v2-design.md`。

<!-- more -->

## Consequences

当前执行顺序清晰可调试；新增 pass 必须显式接线。v2 可以先进行影子编译和依赖审计，
在不改变画面的情况下验证模型。

## Revisit when

出现频繁顺序错误、buffer graph 需求、可量化 aliasing 收益或 async compute 重叠机会。
