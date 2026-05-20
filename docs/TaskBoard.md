# TaskBoard — PortraitDetailDemo

## 项目目标

在 Cocos Creator 2.4.x 中演示 `.pdpack`（Portrait Delta Pack）角色立绘差分文件的运行时加载、解析、渲染与动态切换。

## 任务总览

| ID | 任务 | 状态 | 依赖 | 优先级 | 预估工时 |
|----|------|------|------|--------|---------|
| T1 | PdpackBinaryReader — 二进制读取工具 | ✅ 已完成 | — | P0 | 0.5d |
| T2 | PdpackLoader — 文件加载与解析 | ✅ 已完成 | T1 | P0 | 1d |
| T3 | PortraitRenderer — 立绘节点渲染 | ✅ 已完成 | T2 | P0 | 1d |
| T4 | PortraitController — 立绘控制器 | ✅ 已完成 | T3 | P0 | 0.5d |
| T5 | DemoScene — 演示场景 | 🔄 进行中 | T4 | P1 | 1d |
| T6 | 集成测试与验证 | ⬜ 待开始 | T5 | P1 | 0.5d |

**状态图例**： ⬜ 待开始 | 🔄 进行中 | ✅ 已完成 | ⏸️ 阻塞 | ❌ 取消

## 依赖关系

```
T1 (BinaryReader)
 └─► T2 (Loader) ──► T3 (Renderer) ──► T4 (Controller) ──► T5 (DemoScene) ──► T6 (测试)
```

T1–T4 全部完成 ✅

## 里程碑

| 里程碑 | 完成标志 | 状态 |
|--------|---------|------|
| M1: Runtime 核心完成 | T1–T4 全部完成 | ✅ 已完成 |
| M2: Demo 可演示 | T5 完成，可在编辑器中运行 | 🔄 待编辑器搭建场景 |
| M3: 验证通过 | T6 完成，所有变体渲染正确 | ⬜ 待开始 |

## 进度记录

| 日期 | 更新 |
|------|------|
| 2026-05-20 | 初始化 TaskBoard |
| 2026-05-20 | T1–T4 完成：BinaryReader、Loader（UUID+自定义下载器方案）、Renderer（Blob+Image+initWithElement方案）、Controller |
| 2026-05-20 | T2 修复：cc.resources.load 不支持 .pdpack，改用 UUID + cc.assetManager.loadAny + 自定义下载器 |
| 2026-05-20 | T2/T3 跨平台修复：下载器用 downloadFile(Web→ArrayBuffer, 原生→jsb读取)；纹理创建分 Web(Blob+Image) / 原生(tempFile+loadRemote) |
| 2026-05-20 | T2 最终方案：按 CC 标准管线 — Downloader(.pdpack→ArrayBuffer) + Factory(.pdpack→BufferAsset)，无需自定义 Parser。API: PdpackLoader.load(path) |
| 2026-05-20 | T3 多层 Sprite 存在 Alpha 白块问题，Canvas 合成方案同样无效，已回退。白块根因待从 PNG 像素数据层面排查 |
| 2026-05-20 | T5 代码完成（PortraitDemoUI.ts），待 CC 编辑器中搭建场景 |

## 产出文件

```
assets/Script/pdpack-runtime-cc/
├── PdpackBinaryReader.ts    # T1 — 大端序二进制读取
├── PdpackData.ts            # T2 — 数据结构定义
├── PdpackLoader.ts          # T2 — 文件加载与解析
├── PortraitRenderer.ts      # T3 — Sprite 节点渲染
└── PortraitController.ts    # T4 — 高级 API 组件
assets/Script/
└── PortraitDemoUI.ts        # T5 — 演示场景 UI 脚本
```

## 资源

- 测试文件：`assets/resources/portraits/test/test.pdpack`
- 运行时代码目录：`assets/Script/pdpack-runtime-cc/`
- 格式规范：`PDPack-README.md`
