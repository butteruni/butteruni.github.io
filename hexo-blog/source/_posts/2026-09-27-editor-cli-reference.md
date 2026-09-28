---
title: "编辑器 CLI 参考"
date: "2026-09-27T18:44:00+08:00"
updated: "2026-09-28T20:56:00+08:00"
permalink: 2026/09/27/editor-cli-reference/
categories:
  - 开发工具
tags:
  - astra
  - 技术文档
---

> 由 astra 生成 · 首次发布于 2026-09-27 18:44 · 最近整理于 2026-09-28 20:56（北京时间）

> 从 `AGENTS.md` 拆出的完整命令参考;AGENTS.md 只保留分组速查与入口说明。

运行中的编辑器通过命名管道接受 `PeanutCli.exe -mode cli -command <cmd> [args]`。
所有命令支持 `-format json` 输出。**工作闭环:改场景 → `editor.screenshot` → 读 PNG 确认。**

<!-- more -->

## 连接与输出约定

Debug 产物位于 `Peanut/build_test/bin/Debug`。`help`、`asset.list`、`config.get`、
`config.set` 在 CLI 本地执行；运行时命令连接已启动的 `Peanut.exe`，不会代为启动编辑器。
连接失败返回 `runtime_unavailable`。

默认管道为 `\\.\pipe\PeanutEditorCommand`。隔离自动化可在启动 GUI 和 CLI 前，给两者
设置相同的 `PEANUT_EDITOR_PIPE_NAME`，避免操作用户正在使用的编辑器。

JSON 输出统一包含 `ok`、`exit_code`、`error_code`、`message`、`data`；成功和失败使用
同一信封，脚本应同时检查退出码与 `ok`。已有 CLI 冒烟入口：

```powershell
ctest --test-dir Peanut/build_test -C Debug -R PeanutEditorCliSmoke --output-on-failure
```

## 发现与状态

```
ping | help
scene.get                              # 模型/材质/实例数 + stable IDs + snapshot version/frame
render.setting.list                    # 全部渲染设置(bool+float)及当前值
instance.count / instance.list -start 0 -count 20
material.list / material.get -name X
selection.get
```

## 场景操作

```
scene.load -path model/cube/cube.obj   # 相对 Assets 根;自动恢复 .scene.json sidecar
scene.add -path model/cube/cube.obj    # 追加模型到当前场景(单实例、普通 draw)
scene.save [-path file]                # 保存实例/节点/点光/相机/材质键值段(默认 <ModelPath>.scene.json;
                                       # scene.load 与编辑器启动时自动恢复)
scene.restore [-path file]
scene.export -path file                # 整场景导出 v6:模型+逐 entry 实例+材质键值段+节点局部覆写+相机
scene.import -path file                # 整场景导入(全量替换当前场景)
node.list [-model N]                       # 节点树(索引/名/父节点/meshIndex)
node.select -model N -node M
node.transform.get -node M [-model N]
node.transform.set -node M [-model N] -position x,y,z -rotation x,y,z -scale x,y,z
node.hide / node.show -node M [-model N]   # 节点隐藏(网格级;渲染/剔除/拾取/PT BVH 同步,可撤销,场景文件持久化;
                                           # PT 零三角形旧帧残留待复核，见 renderer-architecture-development-plan.md §3.3)
bone.list [-model N] [-start 0] [-count 40] # MMD 骨骼列表
bone.get / bone.select -bone M [-model N]  # 骨骼信息 / 选中(Hierarchy+Inspector)
animation.load -path model/.../x.vmd [-model 0]
animation.unload / play / pause / stop [-model 0]
animation.seek -frame N [-model 0]
animation.get [-model 0]                   # loaded/path/frame/playing/loop/speed/bones
animation.play [-loop true] [-speed 1]     # 与 Animation 面板同等能力
animation.save -path out.vmd [-model 0]    # 模型 clip(骨骼+morph 轨)写回 VMD
bone.key -bone N [-model 0]                # 把当前帧该骨姿态烘进 clip(同视口骨骼 gizmo 路径;
                                           # 无 -bone 时批量烘焙全部选中骨;选中骨骼后视口拖
                                           # gizmo=逐帧打关键帧,多选时 median pivot 联动)
bone.key.remove -bone N -frame F           # 删除骨骼关键帧(可撤销)
bone.ik.list [-model 0]                    # IK 链列表(ik/effector/links/iters/enabled)
bone.ik.set -index N -enabled true|false   # 逐链 IK 开关(Blender 约束 enable 语义;
                                           # 未驱动(clip 无该 IK 骨轨道)或 VMD IK enable
                                           # 帧禁用的链自动不求解——髪ＩＫ/ネクタイＩＫ
                                           # 这类 FK 驱动的链不会被钉到 rest 位)
camera.animation.load -path mmd/camera/x.vmd   # 独立相机 VMD 轨(模型 clip 的相机键不生效,
                                           # 需单独 load 同一文件;采样为小数帧插值)
camera.animation.unload / play / pause / stop / seek -frame N / get
camera.animation.key                       # 当前视口相机姿态 upsert 到当前帧相机键
camera.animation.save -path out.vmd        # 相机轨写回 VMD
model.scale.get / model.scale.set -value 0.01   # 单位归一化(UE 资产导入式):
                                       # 写 <模型>.import.json 并重载,loader 把缩放烘进顶点,
                                       # 实例 transform 保持纯净;之后任何加载自动应用
editor.screenshot -path ./captures/viewport.png   # 视口 PNG(无 UI)
render.resource.hash -name sceneHDR               # 回读 RenderGraph Texture2D 的 subresource 0;
                                                   # 对 format/尺寸和去 row-padding 原始行字节做稳定 128-bit hash
renderdoc.capture.trigger -path ./captures/x      # 需 config: RenderDocEnabled=true
```

2026-09-27 编辑语义补充：`loaded` 表示内存中是否存在 clip，不能用 `path` 非空判断；
新建但未保存的骨骼、表情或相机动画也可播放、定位和停止。`animation.seek` 与
`camera.animation.seek` 接受最后关键帧之后的非负帧，已有轨道保持端点采样，便于在
更远帧新增关键帧。CLI 的模型 seek/play/pause/stop 默认联动已存在的相机 clip；GUI
按 `Sync motion + camera` 开关控制联动。删除或撤销关键帧后，`max_frame` 按剩余
bone/morph/camera/IK-enable 记录重新计算。

说明:多模型场景下实例为全局编址(跨模型连续编号);所有模型统一走 GPU-driven
indirect,剔除粒度为 (submesh×实例) 对(视锥/屏幕尺寸/Hi-Z,submesh local bounds
加载时逐 submesh 计算);GPU-driven 关闭时退回普通 instanced draw,VS 经恒等
visible-id 列表直通;debug readback(render.gpu.stats.get)只跟踪第一个 entry,
visible_pairs/total_pairs 为 (实例×submesh) 对口径。
蒙皮模型(`Mesh::HasSkeleton()`,PMX/PMD)不做任何剔除:metadata flag bit0=1
时剔除 CS 直接写 visible(绑定姿态 bounds 不跟踪骨骼动画,センター 平移会把
角色移出剔除球);SDOC 路径同样整体跳过蒙皮 entry(既不当 occluder 也不查询)。
MMD 坐标系:Assimp MMD importer 内置 `MakeLeftHanded`(顶点 z 取反),整个
网格/骨架处于 Z 镜像空间;`AnimationClip::LoadVmd` 对 VMD 骨骼键(pos z 取反、
quat x/y 取反)与相机键(interest z、欧拉 x/y 取反)施加同一镜像,相机眼点
取 `+|distance|`(saba RH 约定)——三处转换都在 `AnimationClip.cpp`,改坐标系
方案时同进同退,详见 Docs/mmd-infrastructure-design.md §3.5.1。
IK:`ParsePmxExtras`/`AssemblePmxExtras`(PmxExtrasLoader.cpp)把 PMX IK 链
(目标骨/迭代数/角度上限/链接骨及逐 link 角度限制)解析进
`Skeleton::ikChains`,`ApplyAnimationPose` 在 bone morph + FK 后逐链 CCD
求解(每步绕 link 原点世界旋、钳 chain angleLimit 与 link XYZ 欧拉范围、
全表重算 globals)——VMD 回放与骨骼 gizmo/bone.key 自动生效(拖 左足ＩＫ
弯膝);VMD IK-enable 帧和 `bone.ik.set` 实例开关均参与求解门控;
`render.animation.ik` 可关(A/B 用)。注意:assimp MMD importer 不给无父骨
(センター/足ＩＫ 等)的
节点赋值变换,`ProcessSkeleton` 对 PMX 改用 inverseBind 平移推导 restLocal
(T(bonePos-parentPos)),否则整个骨架按根骨高度下沉(曾致 IK 把腿拉折)。
物理(Bullet,external/bullet3,静态库):`LoadPmxPhysics` 解析 PMX 剛体
(球/盒/胶囊,group/mask,三类模式)与ジョイント(6DOF 弹簧,限位+刚度,
注意记录前有 1 字节 joint_type,morph 与刚体之间有 表示枠 段,两处都易漏);
`BulletPhysicsWorld`(src/Physics)按骨骼 rest 建世界(Z 镜像空间,转换与
VMD 键同约定),mode0 kinematic 跟随骨骼,mode1 全动态,mode2 位置同步
骨骼,btGeneric6DofSpringConstraint 接关节;每帧 ApplyAnimationPose 后
Simulate 并把动态骨骼全局写回(后代骨用原始 local 重算);动态骨骼覆盖
VMD 的髪 FK 键(MMD 语义);`render.physics` 可关。seek/关键帧编辑/undo
等同步路径不步进仿真,改用 `BulletPhysicsWorld::Reset` 把刚体吸附到新
姿态并清零速度(MMD seek 语义,scrub 可复现);morph 顶点更新有 dirty
门控(权重/sub-frame 没变不重算不上传,clip 键编辑会失效缓存)。
撤销:骨骼/morph/相机关键帧编辑纳入 Ctrl+Z 撤销栈(gizmo/曲线拖动按手势
合并为一条),经 `AnimationClip::Set*TrackKeys` 整轨恢复。CLI 与 GUI 共用
一个 EditorController 实例(Application 持有,EditorShell 借用),edit.undo
与 Ctrl+Z 是同一条栈。
视口:骨骼叠加层(骨架绘制+点击拾取)默认开,工具栏 "Bones" 可关;
ShadowPass 的 VS/PSO/input layout 已接蒙皮(t25 骨骼调色板),阴影跟随
动作(此前阴影深度只画绑定姿态)。
CPU 剔除后端(SDOC,external/sdoc):`render.gpu.driven=false` + `render.cpu.occlusion=true`
时启用,逐 submesh 查询 (submesh×实例) world AABB 遮挡并跳过被挡的 draw;
occluder 为三角形数 ≥ `render.cpu.occlusion_min_tris`(默认 256)的 submesh,
逐实例提交。多实例 entry 为"任一实例可见则整 submesh 画"的保守近似。
NVPerf 周期采样(Nsight Perf SDK,external/nsight-perf-sdk):`render.nvperf=true` 时
`NvPerfSampler`(src/Renderer)以 ~10ms GPU_TIME_INTERVAL 采集少量硬件计数器
(SM/DRAM/L1/L2 throughput 等,运行时按 chip 过滤不支持的指标),每帧 Poll 解码
评估最新样本;CLI `nvperf.get` / Stats 面板 NVPerf 小节读取。运行时 DLL
(nvperf_grfx_host/target/host.dll)由 CMake `NVPERF_RUNTIME_DIR` POST_BUILD 拷到
exe 旁,动态加载无 import lib;`NvPerfSampler.cpp` 是唯一 include
`nvperf_host_impl.h` 的 TU。
Tracy 性能分析(external/tracy,v0.11.1 submodule,TRACY_ON_DEMAND):
编辑器常驻监听 8086,用 Tracy profiler GUI 连接即可(未连接时开销≈0);
每个 render pass 有 CPU zone + GPU zone(D3D12QueueCtx,timestamp 走场景
命令列表),`PopulateCommandList` 外层 zone,Present 处 FrameMark。
注意:GPU context 跟随连接生命周期——每次新连接在 PopulateCommandList
里销毁重建(context 必须先于 GPU zones 向该连接 announce,否则 capture
server 会崩);GUI/capture 工具可用 `cmake -S external/tracy/{profiler,capture}`
本地编(需 -DCMAKE_POLICY_VERSION_MINIMUM=3.5)。
材质预设表(`src/Resource/MaterialPresetRegistry.h/.cpp`,设计见
Docs/material-system-design.md):全部渲染风格(pbr/toon/gfl2/stockings/gfl2eye/
gi/giBody/gieye/gilash/zzzHair/zzzBody/zzzWings/zzzFace/zzzFaceMask/zzzEye/
zzzHairShadow/zzzHairShadowLayer/zzzTransparent/toonOutline/gfl2Outline)
只表达 authoring preset、domain/features 与编辑器参数 metadata。
PBR/Forward/Shadow/遮挡剔除/PathTrace BVH 不读取该表；旧输入由
`LegacyMaterialAdapter` 一次转成 domain/features，program 由 pipeline selection 选择。shader、
PSO、stencil reference、刘海二次混合与描边 follow-up 全部由
`Assets/pipeline/pbr.pipeline.json` 的 program/`drawRouting` 拥有。b4/b6 通过同一
`MaterialBindingInstance` 和 reflection copy plan 打包；b6 切片大小从当前 pipeline
generation 推导。
原神角色风格使用具名 capture-semantic 参数块；旧 `B221`、`G280`、`E233`
等 capture-row 名作为兼容别名，写入后会规范化为语义名。新风格只需添加
shader、pipeline program/schema 和可选 style-constant catalog block；不再向 preset 表添加
shader/root/PSO/draw-routing 数据。
Phase 2 已落地(材质描述文件+键值持久化):原神脸、身体、头发、裙装、
下半脸/眉毛和瞳孔均由无寄存器流的语义 shader 与具名 b6 参数驱动；
RDC 参考核心已分别通过 RT0–RT5 逐字节替换门禁，Peanut 只保留资源、相机、
灯光和两目标输出适配层；
`MaterialData::Properties()` 逐材质保存 canonical 覆盖，b6 切片填充=外部 catalog 默认+覆盖；
资产目录 `materials/<材质名>.mat.json`
({preset, params, textures}；兼容读取旧 `shader` 键；textures 键=diffuse/normal/lightmap/rampWarm/
rampCool/faceSdf/detailNormal/giProbe/giMask)在 Wire* 自动接线后应用并覆盖
(未知风格/参数/槽/材质名 → warning);scene json 增加顶层 "materials" 键值段
(save/export 写 v6,load/restore/import 读;旧 "sty" sscanf 行和 v4-v5 `shader` 键只读兼容,
新文件不再写);`material.set -name X -property <G|B|E 参数名> -value x,y,z,w`
直接写覆盖(可撤销),material.get 输出 preset 与 canonical 属性（`style` 保留为只读兼容别名）;
mini-JSON 解析器在
`src/Core/JsonMini.h`;gi 角色默认资产为 `gi_marionette_official`
(`marionette_full_official.gltf`:游戏 7.0 block 解包网格+贴图,非 MMD、非截帧;
materials/*.mat.json 由 `tmp/official_materials.py` 维护)。旧截帧提取包已移除,
shader 转录仍保留。

绝区零雷米埃尔编辑器资产为
`model/zzz_remielle_passeul/remielle_passeul_capture.gltf`:20 个按捕获 draw 拆分的
submesh 保留 COLOR+UV0-UV3+normal+tangent、变形后位置与各自对象矩阵；
`materials/*.mat.json`
中的 `zzz*` 风格只负责资产序列化和专用管线路由。`RemielleCharacterPass` 按截帧事件顺序
执行 29 个 draw，独立拥有语义 shader、完整 t0-t10/b0-b4 绑定、4 MRT、深度模板、
逐目标混合与采样器状态；不再通过 StyleRegistry 的内部附加 style 拼装近似 Pass。
解包生成的 `remielle_passeul_game.gltf` 仅保留为变形适配层研究资产，在高精度面部的
skinning、expression color、UV2/UV3 等运行时通道被还原前不作为编辑器加载入口。
完整 draw/event、无损替换和 DX12 适配边界见
`Docs/zzz-remielle-rdc/pipeline-map.md`。

## 渲染设置·统计·材质·灯光·VFX·MME

```
selection.get                          # 选中状态 + instance stable IDs + snapshot version/frame
render.gpu.stats.get                   # GPU 剔除统计(需先开 render.gpu.stats_readback)
render.cpu.stats.get                   # CPU(SDOC)剔除统计(occluder/查询/剔除数)
profiler.get                             # per-pass GPU/CPU 耗时(需 render.profiler=true)
nvperf.get                               # NVPerf GPU 硬件计数器样本(需 render.nvperf=true)
render.deformation.stats                 # deformation 遥测(GD0;需 render.deformation_stats=true,toggle 会重置窗口;
                                         # 120 帧滚动窗均值(morph 顶点重写/copy bytes、bone palette、morph weight 通道)
                                         # + EvaluatePose/EvaluateMorphs/publish/frame 的 nearest-rank p50/p95;
                                         # morph_weight_bytes_per_frame 记录 GD1 version-driven 独立 weight 通道;
                                         # morph_gpu_dispatches_per_frame 记录 CopyBase/Accumulate 的实际 Dispatch 次数)
render.gpu_morph(设置项)                  # GD2 PBR GPU morph 开关(默认开;关闭时保持 CPU 顶点流)
render.memory.get                        # 渲染器内存遥测(持久描述符、场景/纹理、DXGI usage/budget、buffer arena；另含 rg_transient_*：资源/活跃数、alias slot、committed/active/inactive/planned/potential-savings bytes。RG 字段是保守计划估算，当前 texture 仍为 committed)
render.pathtrace(设置项)             # GroundTruth 路径追踪开关(写 sceneHDR)
render.pathtrace.max_bounces(设置项) # PT 最大反弹次数(默认 4)
render.pathtrace.spp(设置项)         # PT 每帧采样数 1-16(默认 4,抗转相机 1spp 闪烁)
render.light.*(设置项)               # 方向光/环境光/点光 0,运行时即改即生效;
                                     # dir_x/y/z 是 UE 风格光线传播方向 D,着色用 L=-D
render.ibl.intensity(设置项)         # PBR IBL 乘子;GI 对比时设 0(见 Docs/gi-test-scenes.md)
render.sky.uniform(设置项)           # 均匀天空开关(替代贴图天空,NV RTXGI 样例对齐)
render.sky.color_r/g/b(设置项)       # 均匀天空颜色(NV 1.x: 1,1,1;v2: 0.5,0.75,1)
render.sky.intensity(设置项)         # 均匀天空强度(NV 1.x: 0.1;v2: 8)
render.bloom(.threshold/.intensity)(设置项)  # HDR 泛光(threshold 提取+分离高斯,合成 HDR 域加算)
render.outline(.threshold/.strength)(设置项) # NPR 描边(深度+法线 Roberts-cross,合成端压暗;
                                     # 只作用于非 toon 几何(gnormal alpha=0 跳过:天空/toon 像素))
render.outline.geometry(设置项)              # toon 材质几何描边(反面扩张 inverted-hull,默认开)
material.set -name X -property outline_width -value 1     # 几何描边宽度(0=关;face/hair 自动 0.7)
material.set -name X -property outline_color -value r,g,b # 几何描边颜色(逐风格 PS:toon→ToonOutline_PS
                                     # albedo×color,默认酒红 0.35,0.16,0.24;gfl2→GFL2Outline_PS
                                     # albedo 压暗;HSR 自动 0.35,0.16,0.24,GFL2 自动 0.32,0.14,0.20)
material.set -name X -property outline_shadow_color / outline_intensity -value …
                                     # GFL2 描边光照响应(亮侧=outline_color,背光侧=outline_shadow_color
                                     # 深酒红 0.14,0.06,0.09,按 NdotL01 插值;强度默认 1.2)
material.set -name X -property gfl2 -value 1      # GFL2 式 PBR+NPR 混合(独立 GFL2PixelShader:
                                     # sigmoid 阴影截止+4 行 ramp+半写实 GGX 高光+正背光 rim;
                                     # 走几何描边,gnormal alpha=0;角色吃 SSAO;
                                     # 加载时自动接线签名:目录树含 normalmap/*_orm.png
                                     # → 全部材质 gfl2=1+酒红描边 1.0(0.32,0.14,0.20)+
                                     # face 区域 face=1+名称含 sock/stock → stockings=1+
                                     # gfl2_directional_shadow_ramp.png(若存在))
material.set -name X -property stockings -value 1 # 丝袜/网袜(独立 GFL2StockingsPixelShader:
                                     # 掠射角压暗向 outside 色+常数 F 高光带;几何描边同 GFL2)
material.set -name X -property stock_pow / stock_inside_color / stock_outside_color -value …
                                     # 丝袜参数(默认 1.5 / 白 1,1,1 / 灰 0.5,0.5,0.5)
material.set -name X -property gfl2eye -value 1   # 眼睛(独立 GFL2EyePixelShader:上睑/睫毛阴影
                                     # 压暗眼白上部;名称恰为 eyes/eyes+ 时自动接线)
material.set -name X -property gi -value 1        # 原神式渲染(脸部/身体/头发/裙装均直接运行
                                     # capture-semantic shader；截帧反汇编/dump 仅作为证据,
                                     # 运行时 FaceSDF/ILM/terminator/ramp、身体法线/区域色/
                                     # 区域高光均为具名语义代码;
                                     # 独立 VS GenshinVertexShader.hlsl
                                     # + 独立插值 GenshinCommon.hlsli(o1-o12 游戏语义通道);
                                     # albedo 采原始 sRGB 值不解码(游戏数学的定义域),引擎侧无
                                     # IBL/SSGI 叠加(游戏数学自包含,叠加会洗白);脸部基底色=
                                     # 官方 Face_Diffuse(游戏 UV1 面盘采样;giGameUv=0 的 MMD 网格
                                     # 回退 UV0——MMD 包已退役,该路径留作兜底);
                                     # 眼睛无 lightmap 时回退 albedo;贴图槽 t18 SDF/t19 lightmap/
                                     # t20 ramp/t21 specLUT/t22 detailNormal/t23 envProbe/t24 mask;
                                     # 脸部 SDF 用截帧世代官方图(MMD 网格的重生成版已随 MMD 包
                                     # 退役删除;alpha 必须保留——实机 shader
                                     # 的 s=(a>1e-4)?(a+1)/2:r/2,alpha=255 会把 s 钉死在 1 永远受光);
                                     # 当前版本按实机截帧 muou_light.rdc 转录(大世界变体:脸部 SDF
                                     # 软带=sigmoid+cb0[320..322] 子带,与菜单版不同;cb0282/
                                     # cb0270=该帧太阳方向,游戏每帧驱动→VS 以引擎方向光馈入
                                     # bent offset;脸部 SDF 先把世界光投影到当前 instance/node
                                     # 的 local right/forward,再由 local forward 控阈值、local right
                                     # 选左右 SDF;身体响应是阶跃式 ramp;官方 giGameUv 资产读取真实
                                     # ILM.g,仅旧转换网格回退钉值 0.5;
                                     # GI 角色的明暗完全不吃引擎阴影贴图(转录 shader 无采样),
                                     # 调阴影贴图分辨率对角色无效;
                                     # 身体 albedo alpha=区域固定色掩码(alpha>0.01 走常量区域色而
                                     # 非 ramp 阴影;官方 diffuse 99.7% alpha=0,无 alpha 的转换贴图
                                     # 采样得 1 会全身平光——MMD 替代(tex_conv_a0)已随 MMD 包退役
                                     # 删除);显示域:游戏输出 LDR sRGB 字节(o1=RGBA8_SRGB),GI shader
                                     # 预编码 pow(x,2.2)+合成走线性 tonemap(tonemap_aces=0);
                                     # 加载自动接线签名:目录含 Avatar_Girl_Tex_FaceSDF 或
                                     # *_Tex_Body_Lightmap → gi=1+按材质名接线,见
                                     # gi_marionette_official;脸部/细节贴图接受官方实名
                                     # fallback(findFileAny:_tex_face01_shadow/
                                     # _tex_eye_blendshape_diffuse/_tex_appear_face_mask/
                                     # _tex_stockings_detailmap);截帧网格/贴图资产已移除,
                                     # 提取流程文档见 Docs/genshin-rdc/extraction-pipeline.md;
                                     # 材质系统化改造设计见 Docs/material-system-design.md)
material.set -name X -property gieye -value 1       # 原神瞳孔(独立 capture-semantic eye shader;
                                     # muou_light.rdc eid 10567;vColor.r≤0.5=iris 区
                                     # (视差 ray-march 求折射 iris UV+高光条+3 层 decal+matcap),
                                     # >0.5=sclera 区(t8 星形高光,非高光像素 discard 露出下层);
                                     # 贴图槽复用:iris=diffuse(t1),matcap=rampCool(t21),sparkle ramp=
                                     # rampWarm(t20),decal ramp=detailNormal(t22),decal1/2/3=
                                     # lightMap(t19)/faceSdf(t18)/giProbe(t23),sparkle mask=giMask(t24);
                                     # 全部贴图在截帧里是 SRGB view,shader 内做精确 sRGB→linear 解码;
                                     # 加载自动接线:pupil 材质 → gieye=1+官方 Pupil 贴图组,
                                     # lash → gilash=1(截帧 eid 10416 PS 75685 UV0 脸变体+
                                     # region/Face_Diffuse/Mask/SDF);常量=10567 cb0 dump,E261/262/263
                                     # 已换算到本模型空间(推导 tmp/eye_frame_xform.txt),光源走
                                     # 引擎方向光(同脸 shader 的 cb0[282] 替代约定))
material.set -name X -property eye_lid_pos / eye_lid_soft / eye_lid_strength / eye_lid_color -value …
                                     # 睑影参数(默认 0.45 / 0.15 / 0.85 / 暖棕 0.22,0.13,0.10,
                                     # 按各模型眼 UV 调;Cheeta 眼杏仁 v≈0.30-0.69,YooHee 全盘)
material.set -name X -property gfl2_shadow_offset / gfl2_shadow_smooth_ndotl /
                               gfl2_shadow_smooth_scene / gfl2_shadow_strength -value …  # 阴影 sigmoid 参数
material.set -name X -property gfl2_rim_width -value 2.5  # rim 强度
material.set -name X -property gfl2_shadow_color / gfl2_rim_front_color / gfl2_rim_back_color -value r,g,b
material.set -name X -property face_sdf_texture -value <path>   # GFL2 脸部 SDF(face=1 时启用,
                                     # 采样 UV1/face-disc 布局;sigmoid 截止被 SDF band 整体替代;
                                     # 无贴图时回退水平角 band;YooHee 实测可复用通用 W_140 盘面图)
                                     # GFL2 ramp 复用 ramp_warm_texture 槽(t20):256x4 四行布局,
                                     # 采样 V=0.125(阴影行)/ V=0.375(高光彩带行),sRGB
material.set -name X -property crystal -value 1   # 水晶风格化材质(fresnel 彩虹边缘+锐 env 反射,0/1 开关)
material.set -name X -property toon -value 1      # HSR 式卡通(LightMap 色阶+warm/cool ramp 阴影染色+rim+高光带;
                                     # 无 lightmap/ramp 时回退程序化 band;HSR 资产目录加载时自动接好)
material.set -name X -property face -value 1      # 脸部模式(无投影+水平角色调,需 toon=1)
material.set -name X -property diffuse_texture -value Assets/model/.../x.png   # 运行时挂贴图(一次性 GPU 上传)
                                     # 贴图槽通用规则:<snake_case(槽名)>_texture,
                                     # 槽名见 Resource/MaterialTextureSlots
                                     # (faceSdf→face_sdf_texture、detailNormal→detail_normal_texture、
                                     # giProbe→gi_probe_texture、giMask→gi_mask_texture、normal→
                                     # normal_texture 等,全部走通用槽位挂载+可撤销)
material.set -name X -property style -value giBody   # 直接按旧材质兼容名切风格
                                     # (toon/gfl2/stockings/gfl2eye/gi/giBody/giBodyCrystal/giDress/
                                     # giDress01/giHair/giHairBang/gieye/gilash/pbr;
                                     # giDress/giDress01 对应大世界 10491/10503，包含双面
                                     # UV/法线与各自 sparkle 常量，不应退回 giBody;
                                     # giBodyCrystal 对应 10466 Body01，包含独立晶体
                                     # microfacet/env/pattern/Fresnel/混合路径；
                                     # 等价于旧的排他 flag 写法 -property gi_body -value 1)
                                     # GUI 对等:Inspector 材质区有 Style 下拉(同名)、NPR Knobs
                                     # (CLI 全部标量/颜色参数的通用编辑)、All Texture Slots
                                     # (逐槽路径编辑,回车应用)
material.set -name X -property lightmap_texture -value <path>    # HSR LightMap(r=rim 宽度,g=阴影阈值,b=高光阈值,a=部件序号)
material.set -name X -property ramp_warm_texture / ramp_cool_texture -value <path>   # warm/cool 阴影 ramp(8 行,sRGB)
material.set -name X -property shadow_boost -value 1        # ramp 染色强度(0=不染)
material.set -name X -property ramp_offset -value 0.5       # ramp U 偏移(暗/亮行分界)
material.set -name X -property shadow_softness -value 0.1   # 阴影边缘 smoothstep 宽度
material.set -name X -property shadow_center -value 0       # 阴影阈值偏移
material.set -name X -property spec_intensity / spec_shininess / spec_roughness -value …  # 风格化高光(hair: 0.3/8/0.02)
material.set -name X -property rim_width / rim_intensity -value …   # rim 指数/强度
material.set -name X -property spec_color / rim_color / face_shadow_color -value r,g,b   # 风格化颜色
light.list                           # 方向光+全部点光(数量/位置/强度)
light.add -position x,y,z [-intensity f] [-color r,g,b] [-range f]   # 加点光(上限 4,可撤销)
light.delete -index N                # 0=方向光(=禁用),N=点光 N-1(可撤销)
                                     # 点光随场景文件持久化(scene.export/import 与 sidecar 的 lights 段)
vfx.list                             # VFX system/emitter 列表(位置/preset/启用 module)
vfx.system.add -position x,y,z       # 加 VFX system(上限 16,可撤销;emitter 总数上限 32)
vfx.system.delete -index N           # 删 VFX system(可撤销)
vfx.emitter.add -system N -preset spark|smoke|magic   # 加 emitter(内置 module 组合 preset,可撤销)
vfx.emitter.set -system N -emitter M -module SpawnRate -param rate -value 100
                                     # 改 module 参数(1-4 个 float;module 名/参数名见
                                     # src/VFX/VfxEmitter.h 的 GetVfxModuleTable;赋值即隐含启用该
                                     # module;可撤销)
                                     # VFX 随场景文件持久化("vfx" 段,逐 system/emitter 一行,
                                     # save/export/load/restore/import 同 lights 段语义)
                                     # 设置:render.vfx(开关)+ render.vfx.max_particles(环形池
                                     # 活跃容量,池上限 65536);架构:Niagara 裁剪四层
                                     # (System/Emitter/Module/Renderer),GPU 模拟
                                     # ParticleSimulatePass(order 15,VfxSimulateCS.hlsl 的
                                     # SpawnCS/UpdateCS)+ ParticleRenderPass(order 45,additive
                                     # billboard,全仓第一条非 default BlendState,ReadDSV 不写深度)
mme.load -path effects/xxx.fx        # MME 后处理(.fx 子集,Phase 1;上限 8 个,按加载顺序串行)
mme.unload -index N                  # 卸载 effect
mme.reload                           # 全部 effect 重新解析+重编译(改 fx 后零 C++ 构建迭代)
mme.list                             # effect 列表(path/technique/passes/rts)
                                     # 设置:render.mme(bool);fx 放 Assets/effects/;
                                     # 解析器 src/Resource/MmeEffectLoader.h/.cpp(纯文本,
                                     # 不依赖 D3D12),运行时 MmeEffectPass(order 85,bloom 后
                                     # outline 前,ForwardOnly)。支持:RENDERCOLORTARGET 语义
                                     # texture(ViewPortRatio/Width/Height 注解)→ pass 自有
                                     # RTV+SRV;Script 命令 RenderColorTarget0/ClearSetColor/
                                     # Clear/ScriptExternal=Color(sceneHDR 拷进当前 RT)/
                                     # Pass/LoopByCount/LoopGetIndex/LoopEnd;pass 注解
                                     # Draw=Buffer=全屏三角形(fx 自带 VS 忽略);pass 状态
                                     # AlphaBlendEnable/SrcBlend/DestBlend→PSO。
                                     # 转写:tex2D(s,uv)→tex.Sample(s,uv)、POSITION/COLOR→
                                     # SV_*、sampler 映射 4 个静态 sampler(linear/point×
                                     # clamp/wrap)、语义变量进 cbuffer b0
                                     # (TIME/ELAPSEDTIME/VIEWPORTPIXELSIZE/WORLDVIEWPROJECTION/
                                     # VIEW/PROJECTION+INVERSE、POSITION<Object=Camera>、
                                     # DIRECTION/COLOR<Object=Light>;未知语义喂 0+warning,
                                     # LoopGetIndex 变量运行时喂值)。不做(Phase 2):对象特效
                                     # (MMDPass/Subset)、RENDERDEPTHSTENCILTARGET、MRT、
                                     # ResourceName 外部贴图(喂默认白图+warning)。
                                     # DX12-only 策略:D3D9 方言不兼容、转写直接报错
                                     # (tex2Dlod/tex2Dproj/tex2Dbias/tex2Dgrad、tex1D/tex3D/
                                     # texCUBE*、VPOS/VFACE、sampler2D/3D/CUBE、逗号多声明
                                     # 初始化 float a=1,b=2; —— 报错信息点名构造,改 fx 适配
                                     # SM5,不加仿真路径)。
                                     # 验证资产:Assets/effects/{passthrough,invert,
                                     # diffusion_mini}.fx;单测 tests/mme_effect_test.cpp
                                     # (PeanutMmeEffectTests)
render.gpu.hiz.debug.get
camera.orbit_distance.get/set -value N
camera.transform.get                 # 相机位置+朝向(pitch,yaw 度;相机即场景对象)
camera.transform.set [-position x,y,z] [-rotation pitch,yaw]   # 未给的参数保持原值
camera.select                        # 选中相机(Inspector 可编辑位置/朝向/FOV)
asset.list [-path P] [-filter F] [-recursive true]
```

## 编辑

```
instance.select -index N
instance.transform.get -index N               # 返回 stable id + snapshot version/frame
instance.transform.set -index N -position x,y,z -rotation x,y,z -scale x,y,z
instance.duplicate -index N                    # 复制实例,返回 instance.created=<newIndex>
instance.delete -index N
instance.hide / instance.show -index N         # 实例可见性(canonical 保留变换,GPU 槽塌缩;可撤销+持久化)
edit.undo / edit.redo                          # 撤销/重做(覆盖设置、变换、材质、增删)
selection.set -index N / selection.clear        # submesh 选择(材质编辑用)
material.set -name X -property metallic -value 0.5
material.set -name X -property diffuse -value r,g,b
                                     # 多模型材质:X 可写 M<n>:<name>(n=模型序号);
                                     # 裸名优先 entry 0,找不到再全场景搜
render.setting.set -name render.gpu.driven -value true|false
render.setting.set -name render.taa -value true|false # 洛茜/洛洛/蕾米各自的时序抗锯齿；默认开启，切换时重置历史
render.setting.set -name render.gpu.screen_min_pixels -value 15
config.get -key K / config.set -key K -value V    # 注意:在 CLI 进程本地执行
```
