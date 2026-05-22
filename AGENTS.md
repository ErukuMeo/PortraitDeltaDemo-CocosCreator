# AGENTS.md

This file gives coding agents the current project context and maintenance rules for this repository.

## Language

Default to Chinese in user-facing replies unless the user explicitly requests another language.

## Project Overview

This is a Cocos Creator 2.4.x demo project for Portrait Delta Pack (`.pdpack`) runtime loading and rendering.

The project contains:

| Area | Location | Purpose |
|---|---|---|
| Demo scene | `assets/Scene/PortraitDemo.fire` | Scene that loads and switches portrait variants |
| Demo UI | `assets/Script/PortraitDemoUI.ts` | Buttons, keyboard navigation, status label |
| Editor importer | `packages/pdpack-importer/src` | TypeScript source for `.pdpack` AssetDB importer and Inspector |
| Editor entry output | `packages/pdpack-importer/dist` | Compiled CommonJS files used by Cocos package loading |
| Runtime resource | `packages/pdpack-importer/runtime-resource/runtime` | Runtime scripts mapped into the project by Cocos `runtime-resource` |
| Shared parser | `packages/pdpack-importer/runtime-resource/runtime/core` | Pure `.pdpack` binary parser shared by importer and runtime |

There is no conventional app build system. The real application build is done in Cocos Creator. Local TypeScript checks and extension compilation are still useful and should be run after code changes.

## Current Architecture

```text
packages/pdpack-importer
├── package.json
│   ├── main: dist/src/main.js
│   ├── inspector.pdpack: ./dist/src/inspectors/pdpack/main.js
│   └── runtime-resource: runtime-resource/runtime
├── src/
│   ├── main.ts
│   ├── meta.ts
│   └── inspectors/pdpack/main.ts
├── dist/
│   ├── src/
│   └── runtime-resource/runtime/core/
└── runtime-resource/runtime/
    ├── core/PdpackCore.ts
    ├── core/PdpackCoreTypes.ts
    ├── PdpackLoader.ts
    ├── PdpackManager.ts
    ├── PdpackSpriteFrame.ts
    ├── PdpackData.ts
    ├── RawImage.ts
    ├── UPNG.ts
    └── pdpack-asset.js
```

Runtime flow:

```text
PortraitDemoUI
  -> pdpackManager.getSpriteFrame()
  -> PdpackLoader.load(path | uuid | url)
  -> PdpackLoader.parse()
  -> PdpackCore.parseContainer()
  -> RawImage.fromPng()
  -> PdpackSpriteFrame.createPdpackSpriteFrame()
  -> merged Texture2D / SpriteFrame
```

Editor importer flow:

```text
packages/pdpack-importer/dist/src/main.js
  -> register .pdpack Meta
  -> dist/src/meta.js
  -> dist/runtime-resource/runtime/core/PdpackCore.js
  -> save cc.PdPackAsset JSON + native .pdpack copy
  -> dist/src/inspectors/pdpack/main.js for preview
```

## Key Runtime Files

| File | Role |
|---|---|
| `core/PdpackCore.ts` | Reads PDPK header, offset table, metadata JSON, base PNG bytes, and region PNG bytes |
| `core/PdpackCoreTypes.ts` | Parser result contracts used by editor and runtime |
| `PdpackLoader.ts` | Registers `.pdpack` downloader/factory, loads by path/UUID/remote URL, handles Android native file reads |
| `PdpackManager.ts` | Non-component runtime API for loading, SpriteFrame creation, and explicit release |
| `PdpackSpriteFrame.ts` | Shared variant resolution, pixel merge, SpriteFrame creation, and destruction |
| `PdpackData.ts` | Runtime data model consumed by manager and SpriteFrame creation |
| `RawImage.ts` | RGBA pixel container, PNG decode bridge, `Texture2D.initWithData` output |
| `UPNG.ts` | Pure JavaScript PNG decoder; keep as vendored decoder code |
| `pdpack-asset.js` | Runtime `cc.PdPackAsset` class registration |

`assets/Script/pdpack-runtime-cc` was removed. Do not restore it or add new runtime code there.

## Loading Rules

Primary demo loading uses a resources path:

```ts
pdpackPath = "portraits/test/test_portrait";
```

`PdpackLoader.load()` supports:

| Input | Loader path |
|---|---|
| resources path without extension | `cc.resources.load(path)` |
| dashed UUID | `cc.assetManager.loadAny({ url, ext: ".pdpack" })` |
| `http(s)://` URL | `cc.assetManager.loadRemote(url, { ext: ".pdpack" })` |

Android/native local `.pdpack` URLs are read through `jsb.fileUtils.getDataFromFile` inside the registered downloader. This is intentional and fixes APK asset reads that fail through native `downloadFile` with `status:4720(no response)`.

## Editor Extension Rules

Edit source under `packages/pdpack-importer/src` and shared parser code under `packages/pdpack-importer/runtime-resource/runtime/core`.

Then rebuild:

```bash
npx tsc -p packages/pdpack-importer/tsconfig.json --pretty false
```

Important: `packages/pdpack-importer/tsconfig.json` must keep `target: "es2015"` or higher. Cocos Creator 2.4.11 exposes `Editor.metas["custom-asset"]` as a native class; ES5 output calls `_super.call(this, ...)` and breaks with:

```text
Class constructors cannot be invoked without 'new'
```

The root `tsconfig.json` excludes `packages` because package editor/runtime-resource source is compiled with the package-specific tsconfig.

## Shared Parser Boundary

`PdpackCore` must remain platform-independent.

Allowed:

- `ArrayBuffer`
- `Uint8Array`
- `DataView`
- JSON parsing
- explicit big-endian reads

Not allowed in `PdpackCore`:

- `cc`
- `Editor`
- `jsb`
- DOM APIs
- Node file system APIs
- PNG decoding
- `Texture2D` or `SpriteFrame` creation

Keep PNG decode and rendering in runtime (`RawImage`, `PdpackSpriteFrame`, `PdpackManager`). Keep file I/O, AssetDB, and Inspector UI in the importer.

## Binary Format

`.pdpack` v1 layout is big-endian:

```text
Header, 24 bytes:
  magic "PDPK"
  uint16 version
  uint16 flags
  uint16 variant_count
  uint32 offset_table_ptr
  10 reserved bytes

Offset table:
  uint32 base_png_offset
  uint32 base_png_size
  uint32 metadata_json_offset
  uint32 metadata_json_size
  repeated per variant:
    uint16 region_count
    repeated per region:
      uint32 region_png_offset
      uint32 region_png_size
```

Metadata supplies image size, base variant name, variant names, and region rectangles.

## Scene Notes

The demo scene is `assets/Scene/PortraitDemo.fire`.

Current scene facts:

| Item | Value |
|---|---|
| Portrait node | `PortraitNode` |
| Portrait component | Native `cc.Sprite` |
| Runtime API | `pdpackManager` from `PdpackManager` |
| `PortraitDemoUI.pdpackPath` | `portraits/test/test_portrait` |
| Design resolution | `960 x 640`, fit-height |

When touching scene serialization, keep `PortraitNode` on native `cc.Sprite`; do not reintroduce `PortraitDeltaRenderer`.

## Validation

Run these after relevant changes:

```bash
npx tsc --noEmit --pretty false
npx tsc -p packages/pdpack-importer/tsconfig.json --pretty false
```

Smoke-test the parser:

```bash
node -e "const fs=require('fs'); const core=require('./packages/pdpack-importer/dist/runtime-resource/runtime/core/PdpackCore'); const c=core.parseContainer(fs.readFileSync('./assets/resources/portraits/test/test_portrait.pdpack')); console.log(c.header.version, c.header.variantCount, c.imageWidth, c.imageHeight)"
```

Expected values:

```text
1 3 1024 1024
```

For functional validation, use Cocos Creator:

| Platform | Check |
|---|---|
| Web preview | path load succeeds, default portrait renders, variant buttons and left/right keys switch variants |
| Android | no `status:4720(no response)`, path load succeeds, portrait renders, variants switch |

## Coding Guidance

- Prefer existing Cocos Creator 2.4 APIs and current project patterns.
- Do not add silent fallbacks or fake success paths. Loading and parsing failures should surface clear errors.
- Do not move generic parser logic back into importer or runtime-specific files.
- Do not make `PdpackCore` depend on editor, runtime, DOM, or Node globals.
- Do not manually edit `dist` as the source of truth; edit `src` or shared core and rebuild.
- Do not introduce another runtime copy under `assets/Script`.
- Keep vendored `UPNG.ts` behavior stable; small type annotations are acceptable, broad rewrites are not.
- If changing package compilation, preserve ES2015 class inheritance for `PdPackMeta`.

## Useful Docs

- `README.md`: user-facing project overview and usage
- `docs/tasks/TaskBoard.md`: implementation board and status
- `docs/tasks/TaskSpec.md`: detailed refactor plan and constraints
- `docs/how-to-custom-assets-pipeline.md`: custom AssetDB/importer investigation
- `PDPack-README.md`: `.pdpack` format and external packer notes
