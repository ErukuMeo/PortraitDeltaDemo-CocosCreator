# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

Cocos Creator 2.4.x demo project for the **Portrait Delta Pack (.pdpack)** format — a character portrait differential packing scheme. The project implements runtime loading, parsing, pixel-level merging, rendering, and dynamic variant switching of `.pdpack` files.

There is no traditional build system. Development is done inside the **Cocos Creator 2.4.x editor**. Open the project root with the editor to preview scenes, import assets, or configure build targets.

## Runtime Architecture

```
PdpackBinaryReader          Platform-independent big-endian binary reader (DataView)
    └─ PdpackLoader         CC asset pipeline registration (.pdpack) + binary parse → PdpackData
         └─ PortraitRenderer   Pixel merge (base + diff regions) → Texture2D → Sprite node
              └─ PortraitController  cc.Component: lifecycle, variant switching, event callbacks
                   └─ PortraitDemoUI (T5)   Demo scene script: buttons, keyboard, status display
```

### Key files under `assets/Script/pdpack-runtime-cc/`

| File | Role |
|------|------|
| `PdpackBinaryReader.ts` | Wraps `DataView` for big-endian read (uint8/16/32, bytes, string, seek/tell) |
| `PdpackData.ts` | Parsed data model: `PdpackData`, `PdpackRegionInfo`, `PdpackVariantInfo` |
| `PdpackLoader.ts` | Self-registers CC downloader + factory for `.pdpack`; parses header, offset table, data segments, metadata JSON |
| `RawImage.ts` | RGBA pixel container; `fromPng()` via UPNG.js; `overwrite()` for diff merging; `toSpriteFrame()` via `Texture2D.initWithData` |
| `UPNG.ts` | Pure-JS PNG decoder (decode + toRGBA8) — no native dependencies |
| `PortraitRenderer.ts` | Merges base + diff pixels into a single `Texture2D` → `cc.Sprite`, avoids multi-layer alpha issues |
| `PortraitController.ts` | `@ccclass` component: `load()` → `render()` → `switchToVariant()` / `switchToVariantByName()`, with callback arrays |
| `index.ts` | Barrel export for the runtime package |

### Demo scene (`assets/Script/PortraitDemoUI.ts`)

Mounts on the scene root node. Expects `portraitNode` (with `PortraitController`), `variantLabel`, `statusLabel`, `buttonContainer`, and `variantBtnPrefab` (from `assets/resources/prefab/variantBtnPrefab.prefab`). Supports left/right arrow key navigation.

## Loading: UUID vs Path

The CC editor does not natively recognize `.pdpack`. **Use UUID-based loading** as the primary method:

```typescript
// In PortraitController.pdpackPath:
'ecd7233f-8154-4094-be87-00e0b72d10bc'  // from .pdpack.meta's uuid field
```

`PdpackLoader.load()` auto-detects the ID type:
- **UUID** (hex with dashes) → `cc.assetManager.loadAny({url, ext:'.pdpack'})` — triggers downloader + factory
- **http(s)://** → `cc.assetManager.loadRemote`
- **Other** → `cc.resources.load(path, cc.BufferAsset)` — only works if editor knows `.pdpack`

## .pdpack Binary Format (v1)

Big-endian layout:
- **Header** (24B): magic `PDPK`, version, flags (bit0=HAS_ALPHA), variant_count, offset_table ptr
- **Offset table**: base PNG offset/size, metadata JSON offset/size, then per-variant region_count + region offset/size pairs
- **Data segments**: base.png PNG bytes, metadata.json UTF-8, region PNGs

Test file: `assets/resources/portraits/test/test.pdpack`

## Editor Extension (Planned)

`.pdpack` editor importer is a future task (see `docs/how-to-custom-assets-pipeline.md`). The planned architecture uses `packages/pdpack-importer/` with a custom `Meta` class inheriting from `Editor.metas['custom-asset']`, registering via `main.js`.

## Pixel Merging (Not Layer Stacking)

`PortraitRenderer` creates one merged `Texture2D` rather than stacking multiple `Sprite` nodes. This avoids alpha compositing artifacts ("white blocks") that occurred with multi-layer Sprite approach (documented in TaskBoard).

## Cross-Platform Notes

- `Texture2D.initWithData(data, RGBA8888, w, h)` works on both Web and native — this is the unified approach
- `UPNG.js` is pure JS, platform-independent
- `PdpackBinaryReader` uses `DataView` with explicit big-endian (`false`), platform-independent
- Avoid unconditional `jsb.*` references — guard with `cc.sys.isNative` if needed

## Design Resolution

960×640 (landscape), fit-height mode (`settings/project.json`).

## Documentation
- [CocosCreator 2.4.x manual docs](https://docs.cocos.com/creator/2.4/manual/zh)
- [CocosCreator 2.4.x API docs](https://docs.cocos.com/creator/2.4/api/zh/)