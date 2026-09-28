---
title: "Shader 与 Pipeline 长期架构"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-28T20:56:00+08:00"
permalink: 2026/09/27/shader-pipeline-architecture/
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
适用范围：shader 编译、PSO/root signature、变体、缓存与热重载

> 2026-09-11：材质、shader 与 pipeline 的边界，以及反射预处理、静态 artifact、
> 自动 root-family 归并的近期实施顺序，以
> `Docs/material-pipeline-decoupling-development-plan.md` 为准。本文保留长期生命周期约束。

## 1. 目标

统一 shader 编译输入、依赖追踪、layout 编译/校验和事务式 pipeline reload。pass 保留
执行语义，pipeline asset 拥有 program、固定状态和接口契约。只有出现真实跨 pass 复用后
才启用全局 cache；不引入静态自注册系统。

<!-- more -->

## 2. 核心类型

```cpp
struct ShaderKey
{
    CanonicalPath path;
    std::string   entryPoint;
    ShaderProfile profile;
    DefineSet     defines;
    CompilerMode  compilerMode;
};

struct PipelineDesc
{
    PipelineKind    kind;
    RootLayoutId    rootLayout;
    ShaderKeySet    shaders;
    FixedStateKey   fixedState;
    RenderTargetKey targets;
    MeshFeatureSet  meshFeatures;
};
```

`ShaderKey` 的 cache identity 还必须包含 transitive include content hash、编译器版本和影响
codegen 的 flags。路径只用于诊断，不能单独作为 cache key。

`PipelineHandle` 是稳定逻辑句柄；内部 live generation 可在 GPU-safe 边界替换。pass 不长期
保存 staging PSO 裸指针。

## 3. 所有权

- `ShaderCompiler`：编译单个 `ShaderKey`，返回 bytecode、reflection、dependency list；
- `RootLayoutRegistry`：预处理生成的 root layout、接口签名与运行时对象缓存；
- `PipelineBuilder`：从 `PipelineDesc` 创建完整 graphics/compute PSO；
- `PipelineSet`：由一个 pipeline asset/profile 拥有的一组逻辑 program；
- `PipelineReloadCoordinator`：跨 set 构建 staging generation 并事务提交；
- `PipelineCache`：条件启用的去重层，不拥有 reload 策略。

该所有权已与旧材质风格表分离；材质 schema、pipeline program 和 shader 编译
结果由独立服务拥有，`Resource/MaterialPresetRegistry` 只提供材质 authoring preset 与
编辑器参数 metadata。

## 4. Root layout 与 reflection

文件源码和运行时生成的自包含 HLSL 必须经过同一个 `ShaderLoader` staging 路径。MME
转译 shader 使用稳定逻辑 source identity 记录内存源码依赖，并在创建 PSO 前产生归一化
`ShaderInterface`；renderer pass 不允许直接调用 `D3DCompile` 绕过反射、hash 与诊断。

root parameter 不再通过裸槽位数字在 pass 间传播。`RootLayoutId` 对应声明式布局：

```text
FrameConstants
MaterialConstants
InstanceData
BonePalette
MorphWeights
BindlessTextures
```

编译后 reflection 在预处理/staging 阶段生成并验证 register、space、resource kind 和
visibility，layout 不匹配不能等到 draw 时由 GPU validation 发现。runtime generation 只
加载已编译 layout，不在渲染帧内反射或改变 root signature。

## 5. 变体策略

变体维度分为：

- geometry：static、skinned、morphed-skinned、未来 SDEF/QDEF；
- material style：PBR、toon、face、GI/GFL2 等；
- pass：forward、shadow、outline、depth；
- platform/config：debug instrumentation 等少量受控开关。

只有影响 shader code 或 fixed state 的字段进入 key。运行时数值参数继续走 cbuffer，避免
变体爆炸。系统必须能输出每个 pipeline 的完整 key 和命中/编译原因。

## 6. 事务式 Reload

```text
file change
   │
   ▼
dependency index → affected ShaderKeys
   │
   ▼
compile all bytecode → validate reflection → build all staging PSOs
   │                                      │
   ├─ any failure: discard staging ───────┘
   │
   ▼
GPU-safe frame boundary → atomic generation swap → retire old generation by fence
```

约束：

- 任一受影响 pipeline 失败时，所有 live PSO 保持原 generation；
- include 改动必须失效所有传递依赖；
- swap 不允许无条件 `WaitForGpuIdle`，旧 generation 按 fence 延迟释放；
- 错误包含 style/pass/path/entry/profile/defines/include chain；
- reload 与 scene load 可并行 staging，但提交必须有明确顺序。

## 7. Cache 准入条件

初始阶段每个 `PipelineSet` 可独立持有产物。只有同时满足以下条件才启用全局
`PipelineCache`：

1. 至少两个真实 pass 生成相同 `ShaderKey` 或 `PipelineDesc`；
2. telemetry 观察到重复编译/PSO 创建成本；
3. root layout 与 fixed-state key 已稳定；
4. cache hit/miss、内存和 invalidation 可观测；
5. device reset/reload 的销毁顺序已有测试。

cache 是性能层，移除 cache 后语义必须完全一致。

## 8. 与 RenderGraph 的关系

RenderGraph 决定 pass 的资源依赖和执行顺序；pipeline system 决定 pass 内绑定什么 PSO。
二者通过 pass identity 和 attachment formats 连接，不互相拥有。graph compile 不触发 shader
编译，shader reload 不重新排序 graph。

## 9. 分阶段迁移

| 阶段 | 内容 | 验收 |
|---|---|---|
| SP0 | 枚举当前 pipeline、shader dependency 和 root layout | 形成 inventory |
| SP1 | 引入 `ShaderKey` 与统一 compiler result | 编译输出不变 |
| SP2 | reflection/layout 验证与具名 root 参数 | GBV 与自检绿色 |
| SP3 | `PipelineSet` staging reload | 失败保留旧画面 |
| SP4 | fence-retired generation swap | reload 无 GPU drain |
| SP5 | 条件触发全局 cache | 重复编译下降 |

## 10. 验收

- 故意破坏任一 shader 时 reload 整体拒绝，旧画面继续渲染；
- 修复后一次 reload 全量生效；
- include 修改能列出全部受影响 pipeline；
- root layout 不匹配在 PSO staging 前给出可读错误；
- static/skinned/toon/shadow 变体 key 稳定且可枚举；
- cache 开关不改变截图、执行顺序或错误语义。
