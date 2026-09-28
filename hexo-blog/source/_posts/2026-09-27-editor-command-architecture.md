---
title: "编辑器命令与快照长期架构"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-28T20:56:00+08:00"
permalink: 2026/09/27/editor-command-architecture/
categories:
  - 开发工具
tags:
  - astra
  - 技术文档
---

> 由 astra 生成 · 首次发布于 2026-09-27 18:44 · 最近整理于 2026-09-28 20:56（北京时间）

状态：Long-term design

日期：2026-08-29
适用范围：GUI、CLI、undo/redo、scene serialization 与 renderer 编辑边界

## 1. 目标

在保留 DX12-only 和 `EditorRenderOps` 无 D3D12 类型约束的前提下，将当前宽接口收敛为
按领域分离的命令与查询边界。GUI 与 CLI 必须复用同一语义，编辑事务在帧边界原子生效，
scene 文件不依赖 renderer 内部状态拼装。

### 当前编辑器与帧循环边界

`Application` 拥有主窗口与循环；`EditorShell` 拥有 ImGui 生命周期、停靠布局和面板；
`ViewportWidget` 负责显示区域、拾取与输入门控。选择和 undo/redo 由编辑器持有。
`D3D12Renderer` 编排场景渲染，帧命令列表、交换链、fence 和 resize 由内部
`FrameScheduler` 持有。主窗口 resize 不得使用分离工具窗口的尺寸。

<!-- more -->

每帧依次执行 renderer `Update`、shell `NewFrame`、renderer `Render`、更新场景预览、
shell `RenderUI`，最后 `Present`。场景提交与 UI 提交使用各自的命令列表；场景 `Render`
不自行 present。停靠、最大化/恢复后的显示范围、相机 aspect 与输入映射仍是维护约束。
完整 UE 编辑器、通用文档标签系统及 Play/Simulate 不作为本阶段待办。

## 2. 当前问题

`EditorRenderOps` 已同时承载 scene、animation、morph、bone、material、light、VFX、render
settings、capture 和 diagnostics。接口数量增加会放大 fake、serializer 和 controller 的
修改面；同步 setter 还会把 editor event timing 直接传播到 renderer 生命周期。

## 3. 目标接口

```cpp
class EditorSceneOps;
class EditorAnimationOps;
class EditorMaterialOps;
class EditorRenderSettingsOps;
class EditorCaptureOps;
class EditorDiagnosticsOps;
```

这些接口是编辑器能力边界，不是生产 renderer 抽象。`D3D12Renderer` 可直接实现或由
轻量 adapter 组合实现；render pass 仍持有具体 `D3D12Renderer*`。

迁移期间保留 `EditorRenderOps` facade，把旧方法转发到窄接口，直到 GUI、CLI、测试与
serializer 全部迁移。不得一次删除 100+ 方法。

## 4. 命令与查询分离

### 4.1 写命令

所有有副作用的编辑操作转换为 typed command：

```cpp
using EditorCommand = std::variant<
    LoadScene,
    SetModelTransform,
    SetAnimationFrame,
    SetMorphWeight,
    SetMaterialParameter,
    SetRenderSetting>;
```

命令包含稳定目标 ID、预期版本和值，不包含裸 renderer 指针或 D3D12 handle。renderer 在
帧开始消费命令批次；同一批次要么完整应用，要么返回结构化错误。需要同步结果的 CLI
通过 command completion 等待该批次，而不是绕过队列直接修改 live state。

### 4.2 只读快照

UI、CLI `get` 和 serializer 从 immutable `EditorStateSnapshot` 查询：

- scene model/instance stable IDs；
- transform、selection、animation playback；
- morph/material/light/render settings；
- renderer stats 和 capability；
- snapshot version 与生成帧。

一帧内所有消费者看到同一版本。复杂数据可使用稳定 handle + 分页查询，不把 GPU resource
放进 snapshot。

## 5. Stable ID

外部编辑协议不再把 vector index 当长期身份。每个 model instance、material instance、
animation document 和 light 使用 generation-safe ID：

```text
ModelId { slot, generation }
MaterialId { model, slot, generation }
```

CLI 为兼容可继续接受 index，但进入 command 层前立即解析为 stable ID。删除/插入模型后，
旧 ID 必须明确失效，不能悄悄指向新对象。

## 6. Undo/Redo

undo 记录领域状态变化，而不是调用 renderer getter 临时反推：

```text
Command + BeforeState + AfterState + TargetVersion
```

- 连续 slider/curve drag 合并为一个 transaction；
- GPU upload、PSO rebuild 和 physics reset 是应用命令后的派生效果，不写入 history；
- scene load/import 是大事务，失败时 live document 与 renderer snapshot 均不变；
- 外部 CLI 命令是否进入 undo stack 由命令元数据显式声明。

## 7. Scene Document 与序列化

`SceneSerializer` 的输入应逐步改为 `SceneDocument`，而不是大量调用 renderer getter。

```text
SceneDocument
  ├─ asset references
  ├─ model instances
  ├─ animation bindings/playback
  ├─ material overrides
  ├─ lights/VFX
  └─ render settings
```

renderer 是 document 的投影。restore/import 先解析并验证新 document，再作为命令事务应用；
文件版本门仍由 serializer 控制。runtime-only cache、descriptor 和 GPU 内存统计不进 scene。

## 8. GUI 与 CLI 共用路径

命令注册表负责参数解析和结果格式化，领域 handler 只出现一次：

```text
ImGui action ─┐
              ├─ EditorCommandBus ─ Runtime/Renderer ─ Snapshot
CLI command ──┘
```

GUI 不直接调用 renderer setter；CLI 不复制业务校验。错误使用 `{code, message, field,
targetId}`，JSON 与 UI toast 从同一错误对象派生。

## 9. 分阶段迁移

| 阶段 | 内容 | 验收 |
|---|---|---|
| EC0 | 给现有操作按领域分类并记录调用者 | 无行为变化 |
| EC1 | 引入 stable ID 与 snapshot，只迁移查询 | GUI/CLI get 一致 |
| EC2 | 动画/morph 命令进入帧边界队列 | scrub 与 key edit 可复现 |
| EC3 | material/render settings 迁移 | hot reload 事务不退化 |
| EC4 | `SceneDocument` 驱动 serializer | save/restore round-trip 一致 |
| EC5 | 拆窄接口并删除旧 facade | fake 只实现所需领域 |

## 10. 验收

- 同一操作由 GUI 与 CLI 产生相同 command 和 snapshot 结果；
- 连续编辑与 undo/redo 不依赖 GPU 时序；
- 删除模型后旧 stable ID 返回明确错误；
- scene restore 失败时 document、selection 与 live renderer 均不变；
- controller 测试无需构造完整 100+ 方法 fake；
- 一帧内 settings 与 animation 查询版本一致。

## 11. EC0:EditorRenderOps 方法盘点与迁移映射(2026-08-30)

104 个方法逐个的领域分类与调用者证据(EditorRenderOps.h 全量枚举 + 全仓 grep 生成)。
列:controller = EditorController 有同名转发;CLI = 处理它的 Execute* handler(省略前缀);
GUI = EditorShell 面板/ViewportWidget;ser = SceneSerializer;tst = 引用它的测试。

| 方法 | 领域 | 目标窄接口 | 读写 | controller | CLI | GUI | ser | tst |
|---|---|---|---|---|---|---|---|---|
| GetBackBuffer | lifecycle/viewport | (viewport/frame plumbing,不进命令边界) | read | - | - | - | - | editor_controller_test |
| GetDepthBuffer | lifecycle/viewport | (viewport/frame plumbing,不进命令边界) | read | - | - | - | - | editor_controller_test |
| GetSceneColorBuffer | lifecycle/viewport | (viewport/frame plumbing,不进命令边界) | read | - | - | - | - | editor_controller_test |
| GetWidth | lifecycle/viewport | (viewport/frame plumbing,不进命令边界) | read | - | - | - | - | editor_controller_test |
| GetHeight | lifecycle/viewport | (viewport/frame plumbing,不进命令边界) | read | - | - | - | - | editor_controller_test |
| GetFrameIndex | lifecycle/viewport | (viewport/frame plumbing,不进命令边界) | read | - | - | - | - | editor_controller_test |
| GetCamera | lifecycle/viewport | (viewport/frame plumbing,不进命令边界) | read | yes | - | HierarchyPanel,InspectorPanel,ViewportPanel,ViewportWidget | yes | editor_controller_test |
| GetCameraController | lifecycle/viewport | (viewport/frame plumbing,不进命令边界) | read | - | - | EditorShell,ViewportPanel,ViewportWidget | - | editor_controller_test |
| GetResourceManager | lifecycle/viewport | (viewport/frame plumbing,不进命令边界) | read | - | - | - | - | editor_controller_test |
| GetModel | lifecycle/viewport | (viewport/frame plumbing,不进命令边界) | read | yes | - | EditorShell | - | editor_controller_test |
| LoadScene | scene | EditorSceneOps | write | yes | SceneLoad | ContentBrowserPanel | yes | editor_controller_test |
| AddSceneModel | scene | EditorSceneOps | write | yes | - | - | yes | editor_controller_test |
| GetSceneModelCount | scene | EditorSceneOps | read | yes | SceneAdd,SceneGet | AnimationPanel,ExpressionPanel,HierarchyPanel,ViewportWidget | yes | editor_controller_test |
| CaptureScreenshot | capture | EditorCaptureOps | write | yes | EditorScreenshot | - | - | editor_controller_test |
| LoadAnimation | animation | EditorAnimationOps | write | yes | AnimationLoad | AnimationPanel,ContentBrowserPanel | yes | - |
| UnloadAnimation | animation | EditorAnimationOps | write | yes | AnimationUnload | AnimationPanel | - | - |
| SetAnimationFrame | animation | EditorAnimationOps | write | yes | AnimationSeek,AnimationStop | AnimationPanel | yes | - |
| SetAnimationPlaying | animation | EditorAnimationOps | write | yes | AnimationPause,AnimationPlay,AnimationStop | AnimationPanel,ExpressionPanel | yes | - |
| SetAnimationLoop | animation | EditorAnimationOps | write | yes | AnimationPlay | AnimationPanel | yes | - |
| SetAnimationSpeed | animation | EditorAnimationOps | write | yes | AnimationPlay | AnimationPanel | yes | - |
| GetAnimationInfo | animation | EditorAnimationOps | read | yes | AnimationGet,AnimationLoad,AnimationPause,AnimationPlay,AnimationSeek,AnimationStop,AnimationUnload | AnimationPanel,ExpressionPanel | yes | - |
| LoadCameraAnimation | animation | EditorAnimationOps | write | yes | CameraAnimationLoad | AnimationPanel,ContentBrowserPanel | yes | - |
| UnloadCameraAnimation | animation | EditorAnimationOps | write | yes | CameraAnimationUnload | AnimationPanel | - | - |
| SetCameraAnimationFrame | animation | EditorAnimationOps | write | yes | CameraAnimationSeek,CameraAnimationStop | AnimationPanel | yes | - |
| SetCameraAnimationPlaying | animation | EditorAnimationOps | write | yes | CameraAnimationPause,CameraAnimationPlay,CameraAnimationStop | AnimationPanel | yes | - |
| SetCameraAnimationLoop | animation | EditorAnimationOps | write | yes | - | AnimationPanel | yes | - |
| SetCameraAnimationSpeed | animation | EditorAnimationOps | write | yes | - | AnimationPanel | yes | - |
| GetCameraAnimationInfo | animation | EditorAnimationOps | read | yes | CameraAnimationGet,CameraAnimationKey,CameraAnimationLoad,CameraAnimationPause,CameraAnimationPlay,CameraAnimationSeek,CameraAnimationStop,CameraAnimationUnload | AnimationPanel | yes | - |
| GetMorphCount | morph | EditorAnimationOps(morph) | read | yes | - | ExpressionPanel | - | - |
| GetMorphName | morph | EditorAnimationOps(morph) | read | yes | - | ExpressionPanel | - | - |
| GetMorphWeight | morph | EditorAnimationOps(morph) | read | yes | - | ExpressionPanel | - | - |
| SetMorphWeight | morph | EditorAnimationOps(morph) | write | yes | - | ExpressionPanel | - | - |
| SetMorphKey | morph | EditorAnimationOps(morph) | write | yes | - | ExpressionPanel | - | - |
| RemoveMorphKey | morph | EditorAnimationOps(morph) | write | yes | - | ExpressionPanel | - | - |
| SmoothMorphTrack | morph | EditorAnimationOps(morph) | write | yes | - | ExpressionPanel | - | - |
| GetMorphTrackKeys | morph | EditorAnimationOps(morph) | read | yes | - | ExpressionPanel | - | - |
| SaveAnimation | animation | EditorAnimationOps | write | yes | AnimationSave | AnimationPanel | - | - |
| SaveCameraAnimation | animation | EditorAnimationOps | write | yes | CameraAnimationSave | AnimationPanel | - | - |
| AddCameraKeyFromCurrentCamera | animation | EditorAnimationOps | write | yes | CameraAnimationKey | AnimationPanel | - | - |
| GetBoneWorldTransform | bone/IK | EditorAnimationOps(bone) | read | yes | BoneKey | ViewportWidget | - | - |
| SetBoneWorldTransform | bone/IK | EditorAnimationOps(bone) | write | yes | BoneKey | ViewportWidget | - | - |
| DeleteBoneKey | bone/IK | EditorAnimationOps(bone) | write | yes | BoneKeyRemove | - | - | - |
| DeleteCameraKey | animation | EditorAnimationOps | write | yes | CameraAnimationKeyRemove | - | - | - |
| SetIkChainEnabled | bone/IK | EditorAnimationOps(bone) | write | yes | BoneIkSet | - | - | - |
| GetIkChainEnabled | bone/IK | EditorAnimationOps(bone) | read | yes | - | - | - | - |
| GetBoneTrackKeys | bone/IK | EditorAnimationOps(bone) | read | yes | - | - | - | - |
| RestoreBoneTrack | bone/IK | EditorAnimationOps(bone) | write | yes | - | - | - | - |
| RestoreMorphTrack | morph | EditorAnimationOps(morph) | write | yes | - | - | - | - |
| GetCameraKeys | animation | EditorAnimationOps | read | yes | - | - | - | - |
| RestoreCameraKeys | animation | EditorAnimationOps | write | yes | - | - | - | - |
| ReloadShaders | render settings | EditorRenderSettingsOps | write | yes | ShaderReload | - | - | - |
| LoadMmeEffect | vfx/mme | EditorMaterialOps(MME) 或独立 EditorVfxOps | write | yes | MmeLoad | - | - | - |
| UnloadMmeEffect | vfx/mme | EditorMaterialOps(MME) 或独立 EditorVfxOps | write | yes | MmeUnload | - | - | - |
| ReloadMmeEffects | vfx/mme | EditorMaterialOps(MME) 或独立 EditorVfxOps | write | yes | MmeReload | - | - | - |
| GetMmeEffectListText | vfx/mme | EditorMaterialOps(MME) 或独立 EditorVfxOps | read | yes | MmeList | - | - | - |
| GetInstanceWorldMatrix | scene | EditorSceneOps | read | yes | - | ViewportWidget | yes | editor_controller_test |
| SetInstanceWorldMatrix | scene | EditorSceneOps | write | yes | - | ViewportWidget | yes | editor_controller_test |
| SetSelectedInstanceIndex | scene | EditorSceneOps | write | yes | - | EditorShell | - | editor_controller_test,selection_system_test |
| GetInstanceBoundingSphere | scene | EditorSceneOps | read | yes | - | HierarchyPanel,ViewportPanel | - | editor_controller_test |
| GetSceneModelMesh | scene | EditorSceneOps | read | yes | - | AnimationPanel,ExpressionPanel,HierarchyPanel,InspectorPanel,ViewportWidget | yes | editor_controller_test |
| SetMaterialDiffuseTexture | material | EditorMaterialOps | write | yes | - | - | yes | editor_controller_test |
| SetMaterialFaceSdfTexture | material | EditorMaterialOps | write | yes | - | - | yes | editor_controller_test |
| SetMaterialLightMapTexture | material | EditorMaterialOps | write | yes | - | - | yes | editor_controller_test |
| SetMaterialRampWarmTexture | material | EditorMaterialOps | write | yes | - | - | yes | editor_controller_test |
| SetMaterialRampCoolTexture | material | EditorMaterialOps | write | yes | - | - | yes | editor_controller_test |
| SetMaterialNormalTexture | material | EditorMaterialOps | write | - | - | - | yes | editor_controller_test |
| SetMaterialDetailNormalTexture | material | EditorMaterialOps | write | - | - | - | yes | editor_controller_test |
| SetMaterialGiProbeTexture | material | EditorMaterialOps | write | - | - | - | yes | editor_controller_test |
| SetMaterialGiMaskTexture | material | EditorMaterialOps | write | - | - | - | yes | editor_controller_test |
| SetMaterialTextureSlot | material | EditorMaterialOps | write | yes | - | - | - | editor_controller_test |
| SetNodeLocalTransform | scene | EditorSceneOps | write | yes | - | ViewportWidget | yes | editor_controller_test |
| GetNodeWorldMatrix | scene | EditorSceneOps | read | yes | - | ViewportWidget | - | editor_controller_test |
| SetNodeHidden | scene | EditorSceneOps | write | yes | NodeHideShow | HierarchyPanel,InspectorPanel | yes | editor_controller_test |
| SetInstanceHidden | scene | EditorSceneOps | write | yes | InstanceHideShow | HierarchyPanel,InspectorPanel | yes | editor_controller_test |
| GetSceneModelPath | scene | EditorSceneOps | read | - | - | AnimationPanel,HierarchyPanel | yes | editor_controller_test |
| DuplicateInstance | scene | EditorSceneOps | write | yes | InstanceDuplicate | EditorShell,HierarchyPanel,InspectorPanel | - | editor_controller_test |
| DeleteInstance | scene | EditorSceneOps | write | yes | InstanceDelete | HierarchyPanel,InspectorPanel | yes | editor_controller_test |
| InsertInstance | scene | EditorSceneOps | write | yes | - | - | yes | editor_controller_test |
| GetCameraConstantsBuffer | lifecycle/viewport | (viewport/frame plumbing,不进命令边界) | read | - | - | - | - | editor_controller_test |
| GetLightingConstantsBuffer | lifecycle/viewport | (viewport/frame plumbing,不进命令边界) | read | - | - | - | - | editor_controller_test |
| GetMaterialConstantsBuffer | lifecycle/viewport | (viewport/frame plumbing,不进命令边界) | read | - | - | - | - | editor_controller_test |
| RegisterRenderPass | lifecycle/viewport | (viewport/frame plumbing,不进命令边界) | write | - | - | - | - | editor_controller_test |
| ExecuteRenderPasses | lifecycle/viewport | (viewport/frame plumbing,不进命令边界) | write | - | - | - | - | editor_controller_test |
| GetRenderSettings | render settings | EditorRenderSettingsOps | read | yes | RenderSettingList | ServicePanel,StatsPanel | - | editor_controller_test |
| GetRenderSetting | render settings | EditorRenderSettingsOps | read | yes | BoolPropertyGet,DeformationStats,NvPerfGet,ProfilerGet,RenderCpuStatsGet,RenderGpuStatsGet,RenderSettingGet | InspectorPanel | - | editor_controller_test |
| SetRenderSetting | render settings | EditorRenderSettingsOps | write | yes | BoolPropertySet,RenderSettingSet | InspectorPanel,ServicePanel,StatsPanel | - | editor_controller_test |
| GetRenderSettingFloat | render settings | EditorRenderSettingsOps | read | yes | RenderSettingGet,RenderSettingSet | InspectorPanel | yes | editor_controller_test |
| SetRenderSettingFloat | render settings | EditorRenderSettingsOps | write | yes | RenderSettingSet | InspectorPanel,StatsPanel | yes | editor_controller_test |
| GetInstanceCount | scene | EditorSceneOps | read | yes | - | - | yes | editor_controller_test |
| GetLastVisibleInstanceCount | diagnostics | EditorDiagnosticsOps | read | yes | - | StatsPanel | - | editor_controller_test |
| GetLastVisiblePairCapacity | diagnostics | EditorDiagnosticsOps | read | yes | - | StatsPanel | - | editor_controller_test |
| GetGpuCullRejectCounts | diagnostics | EditorDiagnosticsOps | read | yes | RenderGpuStatsGet | - | - | editor_controller_test |
| GetCpuOcclusionCullCounts | diagnostics | EditorDiagnosticsOps | read | yes | RenderCpuStatsGet | - | - | editor_controller_test |
| GetPostExposure | render settings | EditorRenderSettingsOps | read | - | - | - | - | editor_controller_test |
| HasValidHiZData | diagnostics | EditorDiagnosticsOps | read | yes | - | StatsPanel | - | editor_controller_test |
| GetHiZDebugInfo | diagnostics | EditorDiagnosticsOps | read | yes | - | - | - | editor_controller_test |
| GetPassTimings | diagnostics | EditorDiagnosticsOps | read | yes | ProfilerGet | StatsPanel | - | - |
| GetNvPerfSamples | diagnostics | EditorDiagnosticsOps | read | yes | NvPerfGet | StatsPanel | - | - |
| GetDeformationStats | diagnostics | EditorDiagnosticsOps | read | yes | DeformationStats | - | - | editor_controller_test |
| GetMemoryInfo | diagnostics | EditorDiagnosticsOps | read | yes | RenderMemoryGet | - | - | editor_controller_test |
| GetFrameRate | diagnostics | EditorDiagnosticsOps | read | - | - | ViewportWidget | - | - |
| IsNvPerfSamplingActive | diagnostics | EditorDiagnosticsOps | read | yes | NvPerfGet | - | - | - |
| GetMaterialCbvBaseIndex | lifecycle/viewport | (viewport/frame plumbing,不进命令边界) | read | - | - | - | - | editor_controller_test |
| GetSkyboxSrvIndex | lifecycle/viewport | (viewport/frame plumbing,不进命令边界) | read | - | - | - | - | editor_controller_test |

备注:

- light.* 与 vfx.system/emitter 的编辑不经 EditorRenderOps(controller 直改 scene
  document);EC2+ 纳入命令边界时一并收敛到 EditorSceneOps。
- lifecycle/viewport 一组是渲染循环与面板的底层 plumbing,不进 §3 的命令/查询边界;
  EC5 拆接口时留在 renderer 直接持有的 ViewportContext。
- 迁移顺序建议(EC1 只迁查询):scene/selection 的 get(scene.get、selection.get、
  instance.transform.get)→ diagnostics 遥测读 → animation/morph 的 get;写路径 EC2 起。

## 12. EC1-A 实现状态（2026-09-27 更新）

首个查询纵切已完成：

- `EditorStateSnapshot` 是无 D3D12 类型的 immutable shared snapshot，带单调 `version`、
  `sceneVersion`、`selectionVersion` 与 `generatedFrame`；旧快照在 selection 或 scene 变化后
  仍可安全持有。`scene::PrimitiveStore` 持有 revision，并从逻辑模型生成、缓存
  `Scene/SceneSnapshot.h` 中的模型/实例快照，不依赖 GPU proxy 或设备生命周期。
  `EditorStateSnapshot` 继承场景快照并加入 selection；renderer 只缓存按源快照身份失效的
  兼容视图，稳态 GUI/CLI 查询不会每帧重拷全部 instance matrix。
- model/instance 使用 `{slot,generation}` stable ID，由 `PrimitiveStore` 分配和回收。
  load/add/insert 分配 ID，delete/remove/clear 递增 generation 并回收 slot；GPU 资源销毁
  不再释放逻辑对象 ID。vector index 移动不会改变存活对象的 ID，已删除 ID 不再解析到新对象；
  generation 耗尽时永久退役 slot，避免回绕重新命中旧 ID。
- 实例插入/删除的 CPU 数组、ID 与 revision 由 `PrimitiveStore` 一起提交；GPU 准备失败时
  恢复原数组，不发布新 ID 或 revision。删除最后一个实例后模型可以为空，GPU 最小分配只作为
  占位资源。undo/redo 和全场景 import 通过 stable model ID + local index 插入，避免空模型
  或相邻模型边界上的全局索引歧义；旧 `InsertInstance(globalIndex, ...)` 保留兼容。
- `scene.get`、`selection.get`、`instance.transform.get` 改从同一 controller snapshot 查询，
  输出 `snapshot_version`/`snapshot_frame` 及对应 stable ID；旧 selection token 保持兼容。
- Hierarchy、Animation、Expression 的 scene model 枚举和 ServicePanel selection 读路径复用
  controller snapshot，GUI 与 CLI 不再各自拼装这组状态。
- controller 回归覆盖 immutable 旧快照、删除后 ID 失效、index shift 后存活 ID 保持，以及
  GUI/CLI 三个 get 命令读取同一 snapshot version。
- `PeanutSceneStateTests` 无需渲染设备，覆盖 scene 生命周期、旧 ID 失效、快照不可变性、
  多模型索引、实例事务回滚，以及 GPU 准备期间只公开已提交快照。

EC1 后续仍按既定顺序迁移 diagnostics，再迁 animation/morph 只读查询；写入队列仍属于 EC2。
