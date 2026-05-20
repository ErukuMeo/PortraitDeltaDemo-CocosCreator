import { PdpackData } from "./PdpackData";

/** 临时文件计数器，避免文件名冲突 */
let _tempFileCounter = 0;

/**
 * 立绘渲染器（跨平台：Web + 原生 Android/iOS）
 * 将 PdpackData 渲染为 Cocos Creator Sprite 节点层级结构
 */
export class PortraitRenderer {
  private _parentNode: cc.Node;
  private _rootNode: cc.Node | null = null;
  private _baseSprite: cc.Sprite | null = null;
  private _diffContainer: cc.Node | null = null;
  /** 原生平台：记录临时文件路径以便清理 */
  private _tempFiles: string[] = [];

  constructor(parentNode: cc.Node) {
    this._parentNode = parentNode;
  }

  /** 渲染指定变体 */
  render(data: PdpackData, variantIndex: number): Promise<void> {
    this.dispose();

    const variant = data.getVariant(variantIndex);
    if (!variant) {
      return Promise.reject(
        new Error(`PortraitRenderer.render: invalid variant index ${variantIndex}`)
      );
    }

    this._rootNode = new cc.Node("PortraitRoot");
    this._parentNode.addChild(this._rootNode);

    return this._createSpriteFrame(data.basePng!)
      .then((baseFrame) => {
        // 从实际纹理获取尺寸（metadata 中可能没有 width/height）
        const texW = baseFrame.getOriginalSize().width;
        const texH = baseFrame.getOriginalSize().height;
        if (!data.imageWidth) data.imageWidth = texW;
        if (!data.imageHeight) data.imageHeight = texH;

        // 缩放适配
        const maxSize = Math.min(cc.winSize.width, cc.winSize.height) * 0.85;
        const scale = Math.min(1, maxSize / Math.max(texW, texH));
        this._rootNode!.scale = scale;

        const baseNode = new cc.Node("BaseLayer");
        baseNode.setParent(this._rootNode);
        this._baseSprite = baseNode.addComponent(cc.Sprite);
        this._baseSprite.spriteFrame = baseFrame;
        this._baseSprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
        baseNode.setContentSize(texW, texH);
        baseNode.setAnchorPoint(0.5, 0.5);
      })
      .then(() => {
        const w = data.imageWidth;
        const h = data.imageHeight;

        this._diffContainer = new cc.Node("DiffContainer");
        this._diffContainer.setParent(this._rootNode);
        this._diffContainer.setContentSize(w, h);
        this._diffContainer.setAnchorPoint(0.5, 0.5);

        return this._renderDiffRegions(variant, w, h);
      });
  }

  /** 切换变体（复用基础层，仅替换差异层） */
  switchVariant(data: PdpackData, variantIndex: number): Promise<void> {
    const variant = data.getVariant(variantIndex);
    if (!variant) {
      return Promise.reject(
        new Error(`PortraitRenderer.switchVariant: invalid variant index ${variantIndex}`)
      );
    }
    if (!this._diffContainer) {
      return Promise.reject(
        new Error("PortraitRenderer.switchVariant: render() must be called first")
      );
    }

    this._diffContainer.removeAllChildren(true);
    return this._renderDiffRegions(variant, data.imageWidth, data.imageHeight);
  }

  /** 释放所有渲染节点、纹理和临时文件 */
  dispose(): void {
    if (this._rootNode) {
      this._rootNode.removeFromParent(true);
      this._rootNode.destroy();
      this._rootNode = null;
    }
    this._baseSprite = null;
    this._diffContainer = null;

    // 清理原生平台临时文件
    if (cc.sys.isNative) {
      for (const path of this._tempFiles) {
        try {
          jsb.fileUtils.removeFile(path);
        } catch (e) {
          /* 忽略 */
        }
      }
    }
    this._tempFiles = [];
  }

  // ---------- 跨平台纹理创建 ----------

  private _createSpriteFrame(pngBytes: Uint8Array): Promise<cc.SpriteFrame> {
    return new Promise((resolve, reject) => {
      if (cc.sys.isNative) {
        this._createSpriteFrameNative(pngBytes, resolve, reject);
      } else {
        this._createSpriteFrameWeb(pngBytes, resolve, reject);
      }
    });
  }

  /** Web: Blob URL → HTMLImageElement → Texture2D.initWithElement */
  private _createSpriteFrameWeb(
    pngBytes: Uint8Array,
    resolve: (sf: cc.SpriteFrame) => void,
    reject: (e: Error) => void
  ): void {
    const blob = new Blob([pngBytes], { type: "image/png" });
    const url = URL.createObjectURL(blob);

    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);

      const texture = new cc.Texture2D();
      texture.initWithElement(img);
      texture.handleLoadedTexture(false);
      texture.packable = false;

      const rect = cc.rect(0, 0, img.width, img.height);
      const spriteFrame = new cc.SpriteFrame(texture, rect);
      resolve(spriteFrame);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("PortraitRenderer: Web — failed to decode PNG image"));
    };
    img.src = url;
  }

  /** 原生: jsb.fileUtils 写临时文件 → cc.assetManager.loadRemote 加载纹理 */
  private _createSpriteFrameNative(
    pngBytes: Uint8Array,
    resolve: (sf: cc.SpriteFrame) => void,
    reject: (e: Error) => void
  ): void {
    const writablePath = jsb.fileUtils.getWritablePath();
    const tempPath = writablePath + "pdpack_tex_" + ++_tempFileCounter + ".png";

    try {
      const success = jsb.fileUtils.writeDataToFile(pngBytes, tempPath);
      if (!success) {
        reject(new Error("PortraitRenderer: Native — failed to write temp PNG file"));
        return;
      }
      this._tempFiles.push(tempPath);
    } catch (e) {
      reject(new Error("PortraitRenderer: Native — writeDataToFile error: " + e));
      return;
    }

    cc.assetManager.loadRemote(
      tempPath,
      { ext: ".png" },
      (err: Error | null, texture: cc.Texture2D) => {
        if (err) {
          reject(
            new Error(
              "PortraitRenderer: Native — failed to load texture from temp file: " +
                (err.message || err)
            )
          );
          return;
        }
        const rect = cc.rect(0, 0, texture.width, texture.height);
        const spriteFrame = new cc.SpriteFrame(texture, rect);
        resolve(spriteFrame);
      }
    );
  }

  // ---------- 差异区域渲染 ----------

  private _renderDiffRegions(
    variant: import("./PdpackData").PdpackVariantInfo,
    imageW: number,
    imageH: number
  ): Promise<void> {
    if (variant.regionPngs.length === 0) {
      return Promise.resolve();
    }

    const promises = variant.regionPngs.map((pngBytes, i) => {
      const region = variant.regions[i];
      if (!region) return Promise.resolve();

      return this._createSpriteFrame(pngBytes).then((frame) => {
        // 从实际纹理获取尺寸（metadata 中可能为 0）
        const texW = frame.getOriginalSize().width;
        const texH = frame.getOriginalSize().height;
        const rw = region.width || texW;
        const rh = region.height || texH;
        const rx = region.x || 0;
        const ry = region.y || 0;

        const regionNode = new cc.Node(`Region_${i}`);
        regionNode.setParent(this._diffContainer!);

        const sprite = regionNode.addComponent(cc.Sprite);
        sprite.spriteFrame = frame;
        sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
        regionNode.setContentSize(rw, rh);
        regionNode.setAnchorPoint(0.5, 0.5);

        // 坐标转换：region(x,y) 是左上角相对基础图的像素偏移
        const localX = rx + rw / 2 - imageW / 2;
        const localY = imageH / 2 - ry - rh / 2;
        regionNode.setPosition(localX, localY);
      });
    });

    return Promise.all(promises).then(() => {});
  }
}
