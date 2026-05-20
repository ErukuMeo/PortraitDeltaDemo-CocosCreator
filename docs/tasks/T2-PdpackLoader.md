# T2 — PdpackLoader 文件加载与解析

## 目标

实现 `.pdpack` 文件的完整加载流程：从资源中读取原始二进制 → 解析文件头 → 解析偏移表 → 提取数据段（基础图 PNG、元数据 JSON、差异区域 PNGs），并组装为结构化数据。

**跨平台要求：Web + 原生（Android/iOS）均可用。**

## 产出文件

- `assets/Script/pdpack-runtime-cc/PdpackLoader.ts`
- `assets/Script/pdpack-runtime-cc/PdpackData.ts`

## 详细规格

### 加载策略 **[已确认·最终方案]**

按 CC 2.4.x 标准自定义资源管线（downloader + factory），参考 `docs/how-to-import-custom-assets.md`。

```
cc.resources.load('portraits/test/test', cc.BufferAsset, cb)
  └─ Bundle.load → loadAny → pipeline
       ├─ downloader: 以 ArrayBuffer 下载 .pdpack 文件
       ├─ parser:     二进制自动透传（无需注册）
       └─ factory:    创建 cc.BufferAsset（_nativeAsset = ArrayBuffer）
```

**三个注册点**：

| 注册点 | 是否注册 | 说明 |
|--------|---------|------|
| Downloader | ✅ 注册 | `responseType = 'arraybuffer'` → `downloadFile()` |
| Parser | ❌ 免注册 | 二进制找不到 handler 时自动透传 |
| Factory | ✅ 注册 | 创建 `cc.BufferAsset`，`_nativeAsset` 指向 ArrayBuffer |

**API**：`PdpackLoader.load(resourcesPath)` → `cc.resources.load(path, cc.BufferAsset)` → 提取 `_nativeAsset` → `parse()`

**API 变更**：`PdpackLoader.load(path)` → `PdpackLoader.loadByUuid(uuid)`，`PortraitController.resourcePath` → `PortraitController.pdpackUuid`

### 类设计

```typescript
export class PdpackLoader {
  /**
   * 从 resources 路径加载 pdpack 文件
   * @param path resources 下的路径，不含扩展名，如 'portraits/test/test'
   * @returns Promise<PdpackData>
   */
  static load(path: string): Promise<PdpackData>;
  
  /**
   * 从 ArrayBuffer 解析 pdpack 数据
   */
  static parse(buffer: ArrayBuffer): PdpackData;
}
```

### 解析流程

```
load(path)
  │
  ├─ 1. 加载二进制
  │     cc.resources.load(path, cc.BufferAsset) 或 XHR
  │
  └─ 2. parse(buffer)
        │
        ├─ 2.1 读取文件头 (24 bytes)
        │     - magic: "PDPK" 校验
        │     - version: 当前支持 1
        │     - flags: bit0 HAS_ALPHA
        │     - variant_count
        │     - offset_table 位置
        │
        ├─ 2.2 读取偏移表
        │     - base_offset / base_size
        │     - meta_offset / meta_size
        │     - 每个变体: region_count + [offset, size]×N
        │
        ├─ 2.3 提取数据段
        │     - 根据偏移+大小切片 ArrayBuffer
        │     - base.png → Uint8Array
        │     - metadata.json → 解析 JSON 字符串
        │     - 每个 region → Uint8Array (PNG bytes)
        │
        └─ 2.4 组装 PdpackData 对象
```

### PdpackData 数据结构

```typescript
export interface PdpackRegionInfo {
  x: number;        // 差异区域在基础图上的 x 偏移
  y: number;        // 差异区域在基础图上的 y 偏移
  width: number;    // 区域宽度
  height: number;   // 区域高度
}

export interface PdpackVariantInfo {
  name: string;           // 变体名称
  regions: PdpackRegionInfo[];  // 该变体的所有差异区域
  regionPngs: Uint8Array[];     // 各区域的 PNG 原始字节
}

export interface PdpackData {
  version: number;
  flags: number;
  imageWidth: number;       // 立绘总宽度
  imageHeight: number;      // 立绘总高度
  basePng: Uint8Array;      // 基础图 PNG 字节
  baseVariantName: string;  // 基准变体名称
  variants: PdpackVariantInfo[];  // 所有变体
}
```

### 实现要点

1. **魔数校验**：首 4 字节必须为 `PDPK`（ASCII），否则抛出 `"Not a valid pdpack file"` 错误
2. **版本兼容**：当前仅支持 version=1，其他版本报错
3. **元数据 JSON 结构**：需从测试文件的 `metadata.json` 段中推断完整 Schema，在实现时通过断点/日志确认
4. **容错**：
   - 变体数量 `variant_count` 与实际偏移表条目数不一致 → 报错
   - 偏移指向文件范围外 → 报错
   - metadata JSON 解析失败 → 报错并附带原始字符串头 100 字符
5. **异步加载**：`load()` 返回 `Promise`，不阻塞主线程。若使用 XHR 方案，需在 Promise 中包装回调

### 验收标准

- [ ] 能成功加载 `assets/resources/portraits/test/test.pdpack` 并完成 `parse()`
- [ ] 魔数、版本校验正确
- [ ] 解析出的变体数量 > 0，meta JSON 可正确解析
- [ ] 每个变体的 region PNG 字节长度 > 0
- [ ] 非法文件（非 PDPK 魔数、版本不支持）正确抛出异常
- [ ] 在 Cocos Creator 2.4.9 编辑器预览中正常工作

### 依赖与前置

- **T1 (PdpackBinaryReader)**：所有二进制读取操作依赖 T1

### 跨平台策略

| 环节 | Web | 原生 (Android/iOS) |
|------|-----|--------------------|
| 文件下载 | `cc.assetManager.downloader.downloadFile` → `ArrayBuffer` | 下载到临时文件 → `jsb.fileUtils.getDataFromFile` 读取 |
| 二进制解析 | `PdpackBinaryReader`（纯 JS，平台无关） | 同 Web |
| BufferAsset | **已弃用**（`cc.resources.load` 不支持 `.pdpack`） | 同 Web |

### 注意事项

- **metadata JSON Schema**：`PDPack-README.md` 未详述 JSON 结构。实现时需先打印/检查 `test.pdpack` 中提取的 JSON 原文，确认字段名后再完善解析逻辑。
- **PNG 字节处理**：提取的 PNG 字节为标准 PNG 格式。纹理创建方案见 T3。
- **原生平台 jsb 依赖**：`jsb.fileUtils` 仅在原生运行时可用，不要在代码中无条件引用 `jsb`。
