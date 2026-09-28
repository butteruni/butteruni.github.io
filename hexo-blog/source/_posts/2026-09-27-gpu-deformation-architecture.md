---
title: "GPU Deformation 长期架构"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-28T20:56:00+08:00"
permalink: 2026/09/27/gpu-deformation-architecture/
categories:
  - 图形学
tags:
  - astra
  - 技术文档
  - 渲染架构
---

> 由 astra 生成 · 首次发布于 2026-09-27 18:44 · 最近整理于 2026-09-28 20:56（北京时间）

状态：Long-term design

日期：2026-08-29
依赖：`Docs/mmd-runtime-architecture.md`、`Docs/gpu-performance-budget.md`

## 1. 目标

将 MMD morph 与 skinning 从“CPU 修改整份 Vertex 并全量上传”迁移为可测量、可多实例、
可供 Shadow/PBR/Outline 共用的 GPU deformation 路径。

本设计不立即实现通用几何管线，不把所有模型强制改为 compute skinning，也不在缺少
telemetry 时引入复杂 transient allocator。

<!-- more -->

## 2. 当前成本

当前 morph 更新会：

1. 在 CPU 恢复全部 base position；
2. 遍历有效 morph 的 sparse delta；
3. Map/Unmap 每个 submesh upload buffer 并复制完整 `Vertex`；
4. 在下一帧把完整 vertex buffer copy 到 DEFAULT heap；
5. 各 draw pass 再执行 VS skinning。

即使 morph 只影响面部少量顶点，上传粒度仍是整个模型。角色数量与顶点数增长时，CPU
内存带宽、PCIe/upload 带宽和 copy/barrier 数量会线性增长。

## 3. 决策

首个 GPU 版本采用“compute morph，现有 VS skinning”：

```text
immutable base vertices
        + sparse morph deltas
        + per-instance weights
                  │
                  ▼
          MorphComputePass
                  │
                  ▼
      per-instance morphed vertex buffer
                  │
                  ▼
      existing skinned vertex shaders
        Shadow / PBR / Outline
```

原因：它消除最大 CPU/full-upload 成本，同时复用现有骨骼 palette、VS 与 pass。只有
telemetry 证明重复 VS skinning 是主要瓶颈时，才进入“compute morph + skinning 融合”。

2026-09-18 实现补充：renderer 在求值前选择消费路径。GPU 路径只调用
`MmdRuntime::EvaluateMorphState` 更新有效权重和保守 bounds，不再先执行 CPU 顶点合成；
`EvaluateMorphs` 保留为 CPU 参考/回退路径。`morphBoundsVersion` 与
`morphVerticesVersion` 独立缓存，切回 CPU 时即使播放暂停，也能补算尚未合成的版本。
`MmdFrameOutput::boundsValid` 独立于 `morphVerticesDirty`，GPU 路径继续发布 bounds。
现有 `morph_vertex_rewrite_bytes_per_frame` 统计的是 CPU 顶点上传 memcpy，不能单独用它
推断 runtime 是否执行了顶点合成；求值耗时看 `evaluate_morphs_us_*`，跳过合成由纯 CPU
回归测试验证（包括 group morph、零权重、暂停和 pose/state 求值顺序）。

## 4. GPU 数据布局

资产级不可变 buffer：

- base positions/normals/tangents；
- skin indices/weights；
- `MorphHeader { deltaOffset, deltaCount }`；
- `MorphDelta { vertexIndex, positionDelta, normalDelta? }`；
- 可选 group morph 已在 CPU runtime 展开为叶子权重。

实例级 buffer：

- morph weights；
- bone palette；
- morphed output vertex stream；
- deformation bounds/reduction scratch；
- version 与 last-used fence。

首版仍使用当前 `Vertex` 兼容输出，降低 pass 迁移风险。后续可拆 position/normal 附加流，
让静态属性继续引用 asset buffer。

## 5. Dispatch 与同步

- 只有 morph weight version 变化时 dispatch；
- 无有效 morph 时直接绑定 base stream；
- compute 完成后输出转为 vertex/constant-buffer state；
- 当前 RenderGraph v1 只管理屏幕纹理，因此 deformation buffer 状态先由
  `DeformationGpuSystem` + `ResourceStateTracker` 管理；
- RenderGraph v2 支持 typed buffer handle 后，再将 dispatch 依赖纳入 graph；
- output buffer 按 frame-in-flight 或 fence 安全复用，禁止覆盖 GPU 正在读取的实例输出。

## 6. Bounds 与剔除

GPU deformation 后模型 bounds 不能继续只使用 bind-pose AABB。迁移顺序：

1. 资产导入时为每个 morph 预计算保守 bounds delta；
2. CPU 按有效权重组合保守 bounds，供现有 culling 使用；
3. 只有保守 bounds 导致明显过度绘制时，增加 GPU reduction/readback-free bounds；
4. 在准确 bounds 完成前，蒙皮/MMD 模型不得使用会产生漏绘的静态 Hi-Z bounds。

## 7. Pipeline 变体

几何能力通过 `MeshFeatureSet` 进入 pipeline key：

```text
Static
Skinned
MorphedSkinned
SdefSkinned        # 未来
```

材质风格（PBR/toon/face）与几何能力是两个正交维度。变体创建、缓存和热重载由
`Docs/shader-pipeline-architecture.md` 定义，禁止在每个 pass 内继续扩散裸 `#define`。

## 8. 分阶段迁移

| 阶段 | 内容 | Gate |
|---|---|---|
| GD0 | 记录 CPU morph、upload bytes、copy 次数与 GPU VS 成本。**已完成**(2026-08-30,`0029980`):`render.deformation.stats` 遥测 + B1 基线(见 gpu-performance-budget.md §9;GPU VS 成本沿用 profiler.get)。GD0 仅交付 CLI 输出;Stats UI 消费同一 snapshot 为后续可选项,不在 GD0 范围 | 基线已落档 |
| GD1 | 上传 asset sparse delta 与 instance weight buffer。**已完成**(2026-08-30):同资产路径共享 immutable sparse twin；每实例 weight channel 按当帧 morphVersion 发布；load/add/reload 纳入描述符预算、事务回滚与 tracker teardown | 结果未切换 |
| GD2 | compute morph position，接入 PBR 单路径。**已完成**(2026-08-30):`MorphDeformer`(copy+atomic accumulate,超限自动分段,Vertex 兼容输出无需 VS 变体)+ CPU/GPU 共用递归展开并 clamp 后的 leaf weights + PBR 路径 VBV 切换；输出创建/teardown 事务化，shader reload 强制重算，`render.gpu_morph` 可对照；CPU 路径保留至 GD3 | 叶 morph 与 nested/multi-path group morph 同 CPU 语义；暂停不 dispatch |
| GD3 | Shadow/Outline 共用 morphed stream，删除 CPU full upload。**已完成**(2026-08-30):Shadow/Forward/PBR 经 `RenderPrimitive::SelectVertexBufferView` 统一绑定(独立 OutlinePass 是 gnormal/depth 后处理,不读顶点流);GPU 生效时 geometry VB 恒为 base;picking/PT 自 MR2 起即读 base;CPU 上传仅在 `render.gpu_morph=false` 显式回落时运行 | 所有 pass 一致 |
| GD4 | bounds 与多实例池化。**已完成**(2026-08-30):资产导入时逐 morph 预计算保守 extent(逐轴 max|delta|),runtime 按有效权重组合(Σ|w|×extent),实例包围球按组合 extent 保守扩展;蒙皮 entry 在 GPU 剔除本就不剔除(静态 Hi-Z bounds 约束维持);池化 = 同路径共享 morph twin(delta/base SRV)+ per-entry weight/输出流 | 多角色无漏绘 |
| GD5 | 条件触发：融合 compute skinning/SDEF/QDEF | profiler 证明收益 |

## 9. 性能和正确性验收

- 动画 morph 播放时 CPU vertex rewrite bytes/frame 降为 0；
- 每实例每帧 CPU 上传量约为 morph weights + bone palette；
- 单角色和四角色 profile 均满足 `gpu-performance-budget.md`；
- PBR、Shadow、Outline 的 silhouette 与 CPU 基线一致；
- pause 且权重未变时不 dispatch；
- resize、scene reload、shader reload 和 device validation 无资源状态错误；
- GPU 路径失败时不得静默回落到每帧 CPU full upload，必须明确记录 capability/fallback。
