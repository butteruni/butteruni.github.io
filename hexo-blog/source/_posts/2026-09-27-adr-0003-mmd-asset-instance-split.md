---
title: "ADR-0003：MMD 资产与实例分离"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-28T20:56:00+08:00"
permalink: 2026/09/27/adr-0003-mmd-asset-instance-split/
categories:
  - 软件架构
tags:
  - astra
  - 技术文档
---

> 由 astra 生成 · 首次发布于 2026-09-27 18:44 · 最近整理于 2026-09-28 20:56（北京时间）

状态：Accepted
日期：2026-08-29
接受日期：2026-08-30

## Context

当前 mutable Mesh/pose/morph/physics/playback 组合适合单角色切片，但不能安全共享同一 PMX
资产，也使 renderer 承担动画求值职责。

## Decision

PMX 导入结果形成不可变 `MmdAsset`；每个角色拥有独立 `MmdInstance`，保存 pose、morph
weights、player 和 physics state。renderer 只消费 `MmdFrameOutput`。

<!-- more -->

## Consequences

支持同资产多角色和 GPU deformation；需要迁移 clip 编辑、scene serialization 和资源
生命周期。单角色行为在迁移阶段必须保持不变。

## Revisit when

已于 MR1（`ParsePmxExtras` / `AssemblePmxExtras`，2026-08-30）完成后转为 Accepted。
若将来放弃 Assimp、改走自写 PMX parser 回到原生不镜像空间，需要新的 ADR 记录坐标约定回退。
