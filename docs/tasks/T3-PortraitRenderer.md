# T3 — PortraitRenderer 立绘节点渲染

## 目标

将 `PdpackData` 渲染为 Cocos Creator 场景中的 Sprite 节点层级结构，实现基础图 + 差分层叠加的正确显示，并管理节点生命周期。

**跨平台要求：Web + 原生（Android/iOS）均可用。**

## 产出文件

`assets/Script/pdpack-runtime-cc/PortraitRenderer.ts`

## 详细规格

### 节点层级结构

```
PortraitNode (cc.Node, 锚点 0.5,0.5)
├── BaseLayer (cc.Sprite, zIndex=0)
│     - 显示基础图 PNG
│     - 尺寸 = imageWidth × imageHeight
│
└── DiffContainer (cc.Node, zIndex=1..N)
      ├── Region_0 (cc.Sprite, zIndex=1)
      │     - 显示差异区域 PNG，位置 = (region.x, region.y)
      ├── Region_1 (cc.Sprite, zIndex=2)
      └── ...
```

### 类设计

```typescript
export class PortraitRenderer {
  private _rootNode: cc.Node;
  private _baseSprite: cc.Sprite;
  private _diffContainer: cc.Node;
  private _diffSprites: cc.Sprite[];

  /**
   * @param parentNode 父节点，渲染结果将挂载到此节点下
   */
  constructor(parentNode: cc.Node);

  /**
   * 渲染指定变体
   * @param data 已解析的 pdpack 数据
   * @param variantIndex 变体索引
   */
  render(data: PdpackData, variantIndex: number): Promise<void>;

  /**
   * 切换到另一个变体（复用已创建的纹理，仅替换差异区域）
   */
  switchVariant(data: PdpackData, variantIndex: number): Promise<void>;

  /**
   * 清理所有渲染节点
   */
  dispose(): void;
}
```

### 纹理创建流程 **[已确认·跨平台]**

```
Uint8Array (PNG bytes)
  │
  ├─ Web 路径:
  │   1. Blob([pngBytes]) → URL.createObjectURL → Image(img.src)
  │   2. img.onload → new cc.Texture2D() → texture.initWithElement(img)
  │   3. texture.handleLoadedTexture(true) → new cc.SpriteFrame(texture)
  │
  └─ 原生路径 (Android/iOS):
      1. jsb.fileUtils.writeDataToFile(pngBytes, tempPath)
      2. cc.assetManager.loadRemote(tempPath, {ext:'.png'}) → Texture2D
      3. new cc.SpriteFrame(texture) → 记录 tempPath 以便 dispose 清理
```

### 实现要点

1. **纹理创建（跨平台）**：`_createSpriteFrame` 内部分支 `cc.sys.isNative`
   - **Web**：`Blob → URL.createObjectURL → Image → texture.initWithElement()`
   - **原生**：`jsb.fileUtils.writeDataToFile → cc.assetManager.loadRemote(tempPath, {ext:'.png'})`
2. **回调异步**：两个路径都需要 `Promise` 封装异步结果
3. **Alpha 通道**：Web 路径 `handleLoadedTexture(true)` 启用预乘 Alpha；原生路径由 loadRemote 自动处理
4. **临时文件清理（原生）**：`dispose()` 时遍历 `_tempFiles` 调用 `jsb.fileUtils.removeFile`

2. **坐标系统**：
   - CC 坐标系原点在节点左下角（anchor=0,0 时）
   - Region 的 (x, y) 是相对于基础图**左上角**的像素偏移
   - 需转换为 CC 坐标：`ccY = imageHeight - region.y - region.height`

3. **渲染顺序**：差异层必须覆盖在基础层之上。使用 `node.zIndex` 或 `node.setSiblingIndex()` 控制渲染顺序

4. **缓存纹理**：切换变体时，`baseSprite` 不变，仅替换 `diffContainer` 下的子节点。避免重复创建基础纹理

5. **内存管理**：`dispose()` 时释放所有动态创建的 `Texture2D` 和 `SpriteFrame`。CC 2.4.x 中动态创建的纹理不会自动回收

6. **尺寸适配**：
   - 基础层 Sprite 的 `node.setContentSize(imageWidth, imageHeight)`
   - 若立绘尺寸超过屏幕，按比例缩放 `rootNode`

### 验收标准

- [ ] 渲染一个变体后，场景中可见正确的立绘图像
- [ ] 基础图与差分层位置对齐，无明显偏移/缝隙
- [ ] `switchVariant()` 正确替换差异层，基础层保持不变
- [ ] `dispose()` 后节点被正确移除
- [ ] 纹理含 Alpha 通道，半透明区域正确渲染

### 依赖与前置

- **T2 (PdpackLoader)**：依赖 `PdpackData` 数据结构
- **T1 (PdpackBinaryReader)**：间接依赖

### 技术风险

| 风险 | 等级 | 缓解措施 | 状态 |
|------|------|---------|------|
| ~~CC 2.4.x 从内存 PNG 创建纹理的 API 不明确~~ | — | Web: Blob+Image+initWithElement；原生: tempFile+loadRemote | ✅ 已解决 |
| 大尺寸立绘（> 2048px）在移动端纹理限制 | 低 | 已有 scale 适配逻辑 | — |
| 原生平台 `loadRemote` 加载本地文件兼容性 | 中 | 备选方案：`cc.textureCache.addImageAsync`；需真机验证 | ⚠️ 关注 |
