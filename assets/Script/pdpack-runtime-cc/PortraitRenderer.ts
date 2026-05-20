import { PdpackData, PdpackRegionInfo } from "./PdpackData";
import { RawImage } from "./RawImage";

/**
 * 立绘渲染器（跨平台：Web + 原生 Android/iOS）
 * 将 PdpackData 通过像素合并渲染为单个 cc.Sprite 节点
 */
export class PortraitRenderer {
  private _parentNode: cc.Node;
  private _rootNode: cc.Node | null = null;
  private _sprite: cc.Sprite | null = null;
  private _mergedTexture: cc.Texture2D | null = null;

  constructor(parentNode: cc.Node) {
    this._parentNode = parentNode;
  }

  /** 渲染指定变体 */
  render(data: PdpackData, variantIndex: number): Promise<void> {
    this.dispose();

    const variant = data.getVariant(variantIndex);
    if (!variant) {
      return Promise.reject(
        new Error(`PortraitRenderer.render: invalid variant index ${variantIndex}`),
      );
    }
    if (!data.baseRawImage) {
      return Promise.reject(
        new Error("PortraitRenderer.render: PdpackData has no decoded base image"),
      );
    }

    const spriteFrame = this._mergeToSpriteFrame(data.baseRawImage, variant.regions);
    this._mergedTexture = spriteFrame.getTexture();

    const texW = data.baseRawImage.width;
    const texH = data.baseRawImage.height;
    if (!data.imageWidth) data.imageWidth = texW;
    if (!data.imageHeight) data.imageHeight = texH;

    const maxSize = Math.min(cc.winSize.width, cc.winSize.height) * 0.85;
    const scale = Math.min(1, maxSize / Math.max(texW, texH));

    this._rootNode = new cc.Node("PortraitRoot");
    this._rootNode.scale = scale;
    this._parentNode.addChild(this._rootNode);

    const spriteNode = new cc.Node("MergedSprite");
    spriteNode.setParent(this._rootNode);
    spriteNode.setContentSize(texW, texH);
    spriteNode.setAnchorPoint(0.5, 0.5);

    this._sprite = spriteNode.addComponent(cc.Sprite);
    this._sprite.spriteFrame = spriteFrame;
    this._sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;

    return Promise.resolve();
  }

  /** 切换变体（复用节点，仅替换合并后的纹理） */
  switchVariant(data: PdpackData, variantIndex: number): Promise<void> {
    const variant = data.getVariant(variantIndex);
    if (!variant) {
      return Promise.reject(
        new Error(`PortraitRenderer.switchVariant: invalid variant index ${variantIndex}`),
      );
    }
    if (!this._sprite || !data.baseRawImage) {
      return Promise.reject(
        new Error("PortraitRenderer.switchVariant: render() must be called first"),
      );
    }

    const spriteFrame = this._mergeToSpriteFrame(data.baseRawImage, variant.regions);

    const oldTexture = this._mergedTexture;
    this._mergedTexture = spriteFrame.getTexture();
    this._sprite.spriteFrame = spriteFrame;

    if (oldTexture) {
      oldTexture.destroy();
    }

    return Promise.resolve();
  }

  /** 释放所有渲染节点和纹理 */
  dispose(): void {
    if (this._rootNode) {
      this._rootNode.removeFromParent(true);
      this._rootNode.destroy();
      this._rootNode = null;
    }
    if (this._mergedTexture) {
      this._mergedTexture.destroy();
      this._mergedTexture = null;
    }
    this._sprite = null;
  }

  /** 克隆 base 像素 → 覆盖 diff 区域 → 生成 SpriteFrame */
  private _mergeToSpriteFrame(base: RawImage, regions: PdpackRegionInfo[]): cc.SpriteFrame {
    const merged = base.clone();
    for (const region of regions) {
      if (!region.rawImage) {
        cc.warn(`PortraitRenderer: region at (${region.x},${region.y}) has no decoded image, skipping`);
        continue;
      }
      merged.overwrite(region.rawImage, region.x, region.y);
    }
    return merged.toSpriteFrame();
  }
}
