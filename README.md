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

## 外部调用

外部脚本可以直接通过运行时服务生成 `cc.SpriteFrame`，再赋值给原生 `cc.Sprite`：

```ts
import { pdpackManager } from "PdpackManager";

const spriteFrame = await pdpackManager.getSpriteFrame(
  "portraits/test/test_portrait",
  "variant_name",
);

this.portrait.spriteFrame = spriteFrame;
```

`getSpriteFrame(path, variant)` 支持的 `path` 与 `PdpackLoader.load(id)` 一致；`variant` 可以是变体名称或索引。`pdpackManager` 会缓存解析后的 `PdpackData`，但每次 `getSpriteFrame` 都会生成新的 `Texture2D/SpriteFrame`。调用方替换或不再使用该帧时，需要显式释放：

```ts
this.portrait.spriteFrame = null;
pdpackManager.releaseSpriteFrame(spriteFrame);
```

可用 API：

| API | 作用 |
|---|---|
| `pdpackManager.load(path, variant = 0)` | 加载并缓存 `.pdpack` 解析数据，同时校验指定变体存在 |
| `pdpackManager.getSpriteFrame(path, variant = 0)` | 生成指定变体的 `cc.SpriteFrame` |
| `pdpackManager.getSpriteFrames(path)` | 按变体顺序生成全部 `cc.SpriteFrame` |
| `pdpackManager.getTexture(path, variant = 0)` | 生成指定变体的 `cc.Texture2D` |
| `pdpackManager.getTextures(path)` | 按变体顺序生成全部 `cc.Texture2D` |
| `pdpackManager.release(path)` | 释放指定路径下的全部托管帧、纹理和解析缓存 |
| `pdpackManager.relase(path)` | `release(path)` 的兼容拼写入口 |
| `pdpackManager.releaseSpriteFrame(spriteFrame)` | 释放单个托管 `SpriteFrame` 及其底层 `Texture2D` |
| `pdpackManager.releaseSpriteFrames(spriteFrames)` | 批量释放托管 `SpriteFrame` |
| `pdpackManager.releaseTexture(texture)` | 释放单个托管 `Texture2D` |
| `pdpackManager.releaseTextures(textures)` | 批量释放托管 `Texture2D` |
