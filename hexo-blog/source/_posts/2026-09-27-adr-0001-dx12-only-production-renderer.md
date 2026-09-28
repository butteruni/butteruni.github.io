---
title: "ADR-0001：DX12-only 生产渲染器"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-28T20:56:00+08:00"
permalink: 2026/09/27/adr-0001-dx12-only-production-renderer/
categories:
  - 软件架构
tags:
  - astra
  - 技术文档
---

> 由 astra 生成 · 首次发布于 2026-09-27 18:44 · 最近整理于 2026-09-28 20:56（北京时间）

状态：Accepted
日期：2026-08-27

## Context

项目只维护 Direct3D 12 后端。旧通用 `Renderer` 基类增加了类型下转和双重接口，却没有
第二个生产后端。编辑器和测试仍需要不含 D3D12 类型的窄边界。

## Decision

- `Application`、GUI 和 render pass 直接依赖具体 `D3D12Renderer`；
- 编辑器与 fake 通过领域化的 editor ops 接口交互；
- 不为未来假想后端恢复通用 renderer、device 或 command-list 抽象。

## Consequences

DX12 生命周期和错误可以直接表达；编辑器接口不能承担生产渲染抽象职责。若未来出现第二个
已获批准的生产后端，应围绕实际共享语义重新设计，而不是复活旧基类。

<!-- more -->

## Revisit when

第二个生产图形后端已有明确产品需求、实现预算和端到端原型。
