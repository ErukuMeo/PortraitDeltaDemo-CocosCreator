# Portrait Detail Demo - Cocos Creator

这是一个 Cocos Creator 2.4.x 示例项目，用于演示 `.pdpack` 角色立绘差分包在编辑器导入、运行时加载、像素合成和变体切换中的完整流程。

`.pdpack` 是 Portrait Delta Pack 二进制格式：一个基础 PNG，加上每个变体的差异区域 PNG 和 metadata。运行时不是叠加多层 Sprite，而是把基础图和差异区域合成为一张 `Texture2D`，避免透明边缘和白块类混合问题。

## 当前状态

| 项 | 状态 |
|---|---|
| Cocos 版本 | 2.4.x，当前按 2.4.11 兼容 |
| `.pdpack` 导入 | `packages/pdpack-importer` 自定义 importer |
| runtime 位置 | `packages/pdpack-importer/runtime-resource/runtime` |
| 推荐加载方式 | `resources` path，不带扩展名 |
| Android 本地资源 | 通过 `jsb.fileUtils.getDataFromFile` 读取，绕开 native `downloadFile` 的 `status:4720(no response)` |
| Demo 场景 | `assets/Scene/PortraitDemo.fire` |

## 架构

```text
packages/pdpack-importer
├── src/                                      编辑器扩展 TS 源码
│   ├── main.ts                               注册 .pdpack importer 和 inspector
│   ├── meta.ts                               AssetDB Meta，实现导入与 native 文件复制
│   └── inspectors/pdpack/main.ts             Inspector 预览面板
├── dist/                                     编辑器扩展构建产物，package.json 实际入口
└── runtime-resource/
    └── runtime/
        ├── core/PdpackCore.ts                通用二进制解析核心
        ├── PdpackLoader.ts                   path / UUID / remote 加载与 Android native 读取
        ├── PdpackManager.ts                  非组件 API，管理加载、生成 SpriteFrame 和显式释放
        ├── PdpackSpriteFrame.ts              共享 SpriteFrame 合成与销毁逻辑
        ├── RawImage.ts                       RGBA 像素容器与 Texture2D 输出
        └── UPNG.ts                           纯 JS PNG 解码

assets/Script/PortraitDemoUI.ts               Demo UI、按钮和键盘切换
assets/resources/portraits/test/test_portrait.pdpack
```

核心分层：

```text
.pdpack bytes
  -> PdpackCore.parseContainer                纯解析，无 cc / Editor / jsb
  -> PdpackLoader.parse                       转为 PdpackData，解码 PNG
  -> PdpackSpriteFrame                        合成像素，生成 SpriteFrame
  -> pdpackManager                            管理加载、生成 SpriteFrame 和显式释放
  -> PortraitDemoUI                           使用原生 cc.Sprite 展示状态和变体切换
```

## 快速开始

1. 用 Cocos Creator 2.4.x 打开项目根目录。
2. 等待 `pdpack-importer` 加载并刷新 `.pdpack` 资源。
3. 打开 `assets/Scene/PortraitDemo.fire`。
4. 运行 Web 预览。

Demo 里的 `PortraitDemoUI.pdpackPath` 当前配置为：

```ts
"portraits/test/test_portrait"
```

这是 `assets/resources` 下的相对路径，不带 `.pdpack` 扩展名。

## 扩展包构建

编辑器侧源码在 `packages/pdpack-importer/src`，修改后需要重新生成 `dist`：

```bash
npx tsc -p packages/pdpack-importer/tsconfig.json --pretty false
```

`packages/pdpack-importer/tsconfig.json` 必须保持：

```json
{
  "compilerOptions": {
    "target": "es2015",
    "module": "commonjs"
  }
}
```

原因是 Cocos Creator 2.4.11 的 `Editor.metas["custom-asset"]` 是原生 class。如果降级到 ES5，TypeScript 会生成 `_super.call(this, ...)`，编辑器刷新资源时会报：

```text
Class constructors cannot be invoked without 'new'
```

## 运行时加载

`PdpackLoader.load(id)` 会自动识别输入：

| 输入 | 示例 | 行为 |
|---|---|---|
| resources path | `portraits/test/test_portrait` | `cc.resources.load(path)` |
| UUID | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` | `cc.assetManager.loadAny({ url, ext: ".pdpack" })` |
| HTTP URL | `https://.../file.pdpack` | `cc.assetManager.loadRemote(url, { ext: ".pdpack" })` |

当前 Demo 以 path 加载为主，要求 `.pdpack` 位于 `assets/resources` 下，并由 importer 导入到 AssetDB。Android 构建后，`assets/resources/config.json` 应包含 path 和 uuid 映射。

## 非组件 API

外部脚本可以直接通过运行时服务生成 `cc.SpriteFrame`，再赋值给原生 `cc.Sprite`：

```ts
import { pdpackManager } from "PdpackManager";

const spriteFrame = await pdpackManager.getSpriteFrame(
  "portraits/test/test_portrait",
  "variant_name",
);

this.portrait.spriteFrame = spriteFrame;
```

`getSpriteFrame(source, variant)` 支持的 `source` 与 `PdpackLoader.load(id)` 一致；`variant` 可以是变体名称或索引。`pdpackManager` 会缓存解析后的 `PdpackData`，但每次 `getSpriteFrame` 都会生成新的 `Texture2D/SpriteFrame`。调用方替换或不再使用该帧时，需要显式释放：

```ts
this.portrait.spriteFrame = null;
pdpackManager.release(spriteFrame);
```

可用 API：

| API | 作用 |
|---|---|
| `pdpackManager.load(source)` | 加载并缓存 `.pdpack` 解析数据 |
| `pdpackManager.getSpriteFrame(source, variant)` | 生成一个新的 `cc.SpriteFrame` |
| `pdpackManager.getVariantNames(source)` | 获取变体名称列表 |
| `pdpackManager.release(spriteFrame)` | 销毁由该 manager 生成的单个 `SpriteFrame` 和底层 `Texture2D` |
| `pdpackManager.unload(source)` | 移除指定 `.pdpack` 的解析数据缓存 |
| `pdpackManager.releaseAll()` | 销毁全部已托管 `SpriteFrame` 并清空解析缓存 |

## 验证命令

项目级 TypeScript 检查：

```bash
npx tsc --noEmit --pretty false
```

扩展包构建：

```bash
npx tsc -p packages/pdpack-importer/tsconfig.json --pretty false
```

共享解析核心 smoke test：

```bash
node -e "const fs=require('fs'); const core=require('./packages/pdpack-importer/dist/runtime-resource/runtime/core/PdpackCore'); const c=core.parseContainer(fs.readFileSync('./assets/resources/portraits/test/test_portrait.pdpack')); console.log(c.header.version, c.header.variantCount, c.imageWidth, c.imageHeight)"
```

预期输出包含：

```text
1 3 1024 1024
```

## 关键注意事项

| 事项 | 说明 |
|---|---|
| 不要恢复 `assets/Script/runtime-cc` | 运行时已经迁入 `runtime-resource`，旧目录会造成同名组件和解析逻辑重复 |
| 不要把扩展包 TS target 改回 ES5 | 会触发 `Class constructors cannot be invoked without 'new'` |
| 不要在普通 runtime 脚本里直接跨目录 import `packages/...` | runtime 应通过 `runtime-resource` 映射参与 Creator 编译和构建 |
| `PdpackCore` 保持纯净 | 不应依赖 `cc`、`Editor`、`jsb`、DOM 或文件系统 |
| `dist` 是编辑器入口 | 修改 `src` 或 shared core 后要重新构建 |

## 相关文档

- `docs/tasks/TaskBoard.md`: 重构任务板和当前进度
- `docs/tasks/TaskSpec.md`: runtime-resource 重构实施细节
- `docs/how-to-custom-assets-pipeline.md`: Cocos 自定义资源导入调研
- `PDPack-README.md`: `.pdpack` 格式和打包工具说明
