---
title: "蓝色星原略略卡 RDC 逆向"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-28T20:56:00+08:00"
permalink: 2026/09/27/azur-promilia-rdc-readme/
categories:
  - 图形学
tags:
  - astra
  - 技术文档
  - 渲染架构
---

> 由 astra 生成 · 首次发布于 2026-09-27 18:44 · 最近整理于 2026-09-28 20:56（北京时间）

## 目标与边界

- 输入：`蓝色星原PC三测.rdc`，D3D11，frame 6639。
- 目标：复原角色阴影、角色 GBuffer、角色特有重绘及屏幕空间合成，并基本复原从角色输出到最终 scene color 的后处理链。
- 模型、顶点流、索引、纹理和捕获时常量可以直接取自 RDC。
- 每个捕获事件使用独立的 `azur.promilia.luoluo.*` program。Remielle、Genshin 和普通 PBR shader 不参与本 profile 的实现。

逐事件映射见 [pipeline-map.md](/2026/09/27/azur-promilia-rdc-pipeline-map/)。当前映射覆盖 5 个角色阴影事件、18 个角色事件和 61 个后处理事件。

## 数据流

主角色阶段写入五路 3440×1440 GBuffer 和 D32S8 depth：

<!-- more -->

| 资源 | 格式 | 角色阶段用途 |
|---:|---|---|
| 814 | R11G11B10_FLOAT | 角色/场景 HDR 输出 |
| 722 | R8G8B8A8_TYPELESS | 颜色和材质数据 |
| 726 | R10G10B10A2_TYPELESS | 编码法线/几何数据 |
| 730 | R8G8B8A8_TYPELESS | 材质标记和辅助数据 |
| 658 | R10G10B10A2_TYPELESS | 运动向量 |
| 740 | D32S8_TYPELESS | 主深度/模板 |

后续链路包含深度复制与降采样、屏幕空间阴影、角色阴影体、GTAO、capsule AO、延迟方向光、Depth Rim、雾、TAA、景深、Para、LUT 构建、Bloom、UberPost 和 Light Shaft。event 3506 将完成后处理的 scene color 复制到 UI 目标。

## Runtime 实现

- 主角色阶段由固定绑定 `azur.promilia.luoluo` 的 `AzurPromiliaCharacterPass` 执行，按 18 个事件分别创建 PSO。Runtime 只选择 36 个逐事件语义 HLSL stage；资源、常量域、顶点输入、插值和五路 GBuffer 输出均使用稳定语义名，运算顺序来自已通过 RDC 36/36 替换门禁的源文件。原始 DXBC 与固定常量快照仅供离线 RDC replacement validation。逐事件 sampler、MRT、深度/模板、混合和光栅状态保持隔离。常量槽按当前 profile 的最大真实 CB 大小分配；Azur 的约 45 KiB `b0` 不再被旧的 4 KiB 上限截断。
- Runtime 现在从 `capture-geometry.pnmesh` 加载捕获原始 VB/IB，逐事件保留输入槽、stride、offset、格式、零 stride 常量流、index 格式、firstIndex 和 baseVertex。每个 PSO 的 input layout 也从对应事件 contract 独立构建；事件 1621 的 `TEXCOORD5` 继续绑定 slot 3。普通 PBR、Forward 和 Shadow pass 会跳过此 profile，避免同一份几何被通用材质路径以错误声明重复消费。
- BasePass 的 RDC 替换矩阵为 36/36 个 VS/PS 用例逐字节一致，状态与验收门见 [base/README.md](/2026/09/27/azur-promilia-rdc-base-readme/)。运行时以源世界原点 `(400,0,400)` 为基准，把逐 draw 对象矩阵组合到当前 `CharacterDrawData` 的 node/instance。Profile 显式声明 `engineToSourceAxis=(-1,1,1)`，对象、RH source camera、camera position 和方向光统一通过该基变换，因此编辑器 LH gizmo 的 X/Z 操作与画面运动一致。
- `AzurPromiliaPostPass` 只接受 `azur.promilia.luoluo`，不调用 Remielle post shader。Runtime 只执行 `post-interactive.pipeline.json`，把实时 depth/GBuffer/motion/scene 绑定到 Azur 自有的语义 shader，并按当前视口缩放图资源。Depth Rim、Fog、AO、TAA 与 DOF 的 camera、light、depth-linearization、texel-size 和 pass-dimension 参数逐帧更新。e2562 与 e2687 的 history 采样槽直接复用同阶段 current-color source，禁止跨 DOF/transparent 阶段混色，也避免为同一 RenderGraph semantic 声明重复 source。`post.pipeline.json` 的固定 66 节点图只保留为离线基线。
- C++ 运行时按职责拆分：`AzurPromiliaPostPass.cpp` 保留帧图声明、pipeline 编排与执行，`AzurPromiliaPostPass_Constants.cpp` 负责逐帧常量更新，`AzurPromiliaPostPass_Resources.cpp` 负责捕获 buffer/DSV/SRV，`AzurPromiliaRuntime` 统一 BasePass/PostPass 共用的坐标基、相机矩阵、参考分辨率与二进制读取。`AzurPromiliaCharacterPass` 也有独立头文件，不再挂在通用 capture pass 声明末尾。
- 捕获中的 61 个 post event 另以事件为最小单位保存在 `capture/post-programs/<event>`；每个目录只包含该事件的 contract、原始 DXBC/ASM、常量快照和该事件通过门禁的 HLSL，索引见 `capture/post-programs/manifest.json`。这些目录不共享 program identity，也不与 Remielle、Genshin 或 24 个研究性 D3D12 近似节点混用。
- Runtime shader 文件只按功能命名，例如 `DepthRim.hlsl`、`TemporalAA.hlsl`、`DOFResample.hlsl`；捕获事件号只保留在 `e####-*` program/pass ID。共享同一捕获 shader identity 的事件引用同一个功能文件，独立 VS/PS 才使用 `VS`/`PS` 后缀。18 个 BasePass 事件目录统一使用 `BasePassVS.hlsl` / `BasePassPS.hlsl`。旧的 `PostE####*` 名称和未被管线引用的早期近似 shader 已删除，生成器会拒绝事件号或 `Post` 前缀重新进入 runtime 文件名。
- 当前最终画面连续执行 event 3022、3037、3052、3070、3088、3104、3119、3134、3149、3164 和 3506。捕获中的 e2977→e3052 六个 Bloom 上采样事件都绑定同一个 pixel shader `a26441f071b1`；runtime 因而用一个全量语义化的 Azur 专用 `BloomUpsample.hlsl` 重复执行各层。该 shader 用具名 cubic 权重、组合采样偏移、双线性行插值和层混合代替反编译寄存器代码。event 3022 使用 430×180 bloom 16571、215×90 low bloom 16575 和自己的 1936 字节 pixel `b0`，写入 430×180 R11 图资源；event 3037 使用 860×360 bloom 16559、event 3022 图输出和自己的 `b0`，写入 860×360 R11 图资源；event 3052 使用 1720×720 base bloom 16549、event 3037 图输出和自己的 `b0`，写入 1720×720 R11 图资源。event 3070 使用 event-local scene 830、event 3052 图输出、1024×32 LUT 837 和 2288 字节 pixel `b0`，执行捕获验证过的 UberPost 色彩变换。event 3088 使用 event-local depth 734、event 3070 图输出、两个独立 sampler 和 43520 字节 pixel `b0` 生成 Light Shaft Mask；event 3104、3119、3134 和 3149 同样按照捕获的共同 shader identity 复用一个 `LightShaftFilter.hlsl`，但保留四份 43520 字节 vertex `b0`、输入输出和图节点。event 3164 复用 event 3070 图输出，叠加 event 3149 的过滤结果并绑定 43488 字节 pixel `b0`；event 3506 再绑定 1840 字节 pixel `b0` 执行颜色转换。最终输出不再读取捕获的中间结果 16567、16555、16545、814、16609、16615 或 886。其余手写 runtime 节点尚未完成 D3D12 端口验证，不进入最终输出，也不标记为已完成逆向。
- 61 个 post event 现在全部具备可重编译 HLSL 基线，并已在原 RDC 中完成一次完整矩阵替换验证：61/61 个事件的全部 RT、depth/stencil 和 UAV 输出逐字节一致。修复项包括 3 个反编译符号分支、compute UAV 写回、GTAO 动态循环采样、capsule AO 结构步长，以及原捕获的 FXC 优化参数。细节见 [semantic/README.md](/2026/09/27/azur-promilia-rdc-semantic-readme/)。
- 资产生成器会验证 29 个图节点（normal resolve + 28 个 post）与 program 一一对应、pixel shader 路径全部位于 `AzurPromiliaCapture`，并要求 binding layout、graphics state、常量和图资源保持逐事件隔离。只有捕获 shader identity 相同的已登记事件组可以共享 runtime shader；其余意外复用会被拒绝。已语义化的 runtime shader 还会拒绝 `r0`、`cb0`、`cmp` 等反编译标识，并检查关键语义字段。同时要求 61/61 个捕获 post event 都有独立目录和对应的 replacement-validation 记录。
- 主角色 18 个 draw 使用原始多流几何实时重放，用于逐事件调试；当前最终展示连续重放 event 3022→3164 和 event 3506。16571、16575 必须从 event 3022 时刻导出，16559 必须从 event 3037 时刻导出，16549 必须从 event 3052 时刻导出，830、837 必须从 event 3070 时刻导出，734 必须从 event 3088 时刻导出；生成器会清理旧阶段 DDS，并拒绝缺少事件局部快照的资产构建。屏幕纹理和 depth DDS 在导入时统一为 RenderGraph 的逻辑 UV 方向，LUT 保持捕获行序；shader 内不再按事件散落纵向翻转。event 3022 的输出 16567 与 event 3037 输入快照的 DDS SHA-256 完全一致；接入 e3022 后 `azurBloomA`、`azurBloomB` 和最终 `characterPostHDR` 哈希均保持不变，最终截图逐通道完全一致。该帧的 event 3088 输出 RGB 全零，且 event 3164 的 `cb0[2717]` 为零。捕获角色私有 descriptor block 已扩至 128 个纹理槽，以容纳逐事件边界资源而不与其他 profile 混用。
- 61 个捕获 post event 的原始 DXBC/CB/资源/固定状态与通过替换验证的 HLSL 共同构成精确基线。当前 28 段 runtime 图是独立的 Azur D3D12 端口；除 capture-backed final presentation 外尚未逐段通过等价性门禁。

当前编辑器闭环截图：`captures/azur-promilia-latest-rdc/peanut-azur-e3022-e3506-semantic.png`。与 resource 886 翻转并缩放后的参考图相比，8-bit RGB 平均绝对误差分别为 0.549、0.507、0.440。

## 角色几何

| 部件 | 主 Event | 顶点 | 三角形 | 捕获 shader |
|---|---:|---:|---:|---|
| 眼睛 | 1592 | 90 | 112 | `Character/Eyes` |
| 武器 | 1621 | 6,268 | 7,868 | `Character/Weapon` |
| 头发 | 1659 | 9,456 | 10,506 | `Character/Hair` |
| 半透明衣物 | 1696 | 9,266 | 12,302 | `Character/Standard` |
| 衣物尾部 | 1732 | 1,745 | 2,606 | `Character/Standard` |
| 主衣物 | 1765 | 11,296 | 16,880 | `Character/Standard` |
| 脸部 | 1805 | 2,013 | 2,898 | `Character/NewFace` |
| 眉毛 | 1836 | 80 | 72 | `Character/Eyebrow` |

捕获顶点输入包含 POSITION、NORMAL、TANGENT、COLOR、TEXCOORD0/1/2，并在部分主 pass 中使用 TEXCOORD5。所有输入流和 draw 的固定状态都保存在逐事件 contract 中。OBJ 只保留位置、法线和 UV0，可用于几何检查，不能作为最终渲染资产。

## 可复现产物

- `captures/azur-promilia-latest-rdc/analysis/frame-passes.json`：帧内 422 个 draw/dispatch 的紧凑状态和资源依赖。
- `captures/azur-promilia-latest-rdc/contract/manifest.json`：84 个选中事件的索引。
- `captures/azur-promilia-latest-rdc/contract/programs/<event>/contract.json`：单事件 shader、签名、CB、SRV/UAV、sampler、MRT、深度/模板、混合和光栅契约。
- `programs/<event>/*.dxbc`：捕获的原始 shader bytecode。
- `programs/<event>/*.asm`：对应反汇编。
- `programs/<event>/*_bN.bin`：在该事件绑定的常量缓冲快照。
- `contract/resources/*.dds`：92 个被选中 pass 引用的精确纹理；同名 PNG 只作检查。

导出校验结果为 84 个事件、167 个 shader stage、269 个 CB 快照；文件大小和 SHA-256 均与 contract 一致。Pipeline Asset 的 stage 可用 `"precompiled": true` 直接载入独立 DXBC，同时仍执行反射、root layout 编译、依赖指纹和 artifact 校验。

## 工具

```powershell
# 扫描全部 draw/dispatch
& "$env:ProgramFiles\RenderDoc\qrenderdoc.exe" `
  "--python=$PWD\captures\azur_promilia_rdc_frame_graph.py"

# 导出独立 pass 契约
& "$env:ProgramFiles\RenderDoc\qrenderdoc.exe" `
  "--python=$PWD\captures\azur_promilia_rdc_contract_export.py"

# 导出被引用的 DDS/PNG
& "$env:ProgramFiles\RenderDoc\qrenderdoc.exe" `
  "--python=$PWD\captures\azur_promilia_rdc_resource_export.py"

# 从 contract 重新生成逐事件表
python Peanut/tools/Generate-AzurPromiliaPipelineMap.py
```

语义 HLSL 只能逐事件替换。每个候选 shader 必须通过 `Peanut/tools/Invoke-RdcShaderReplacementValidation.ps1`，确认该事件所有 MRT、深度/模板或 Post-VS 数据逐字节一致，才可替代对应 DXBC 基线。
