import { PdpackData, PdpackRegionInfo, PdpackVariantInfo } from "./PdpackData";
import { RawImage } from "./RawImage";

export type PdpackVariantSelector = number | string;

export interface PdpackVariantRef {
  index: number;
  name: string;
  variant: PdpackVariantInfo;
}

export interface PdpackSpriteFrameResult {
  spriteFrame: cc.SpriteFrame;
  texture: cc.Texture2D;
  variantIndex: number;
  variantName: string;
  width: number;
  height: number;
}

export function resolvePdpackVariant(data: PdpackData, selector: PdpackVariantSelector = 0): PdpackVariantRef {
  if (typeof selector === "number") {
    if (selector < 0 || selector >= data.variantCount || selector !== Math.floor(selector)) {
      throw new Error(`PdpackSpriteFrame: variant index ${selector} out of range [0, ${data.variantCount - 1}]`);
    }

    const variant = data.getVariant(selector);
    if (!variant) {
      throw new Error(`PdpackSpriteFrame: variant index ${selector} not found`);
    }

    return {
      index: selector,
      name: variant.name,
      variant,
    };
  }

  const index = data.variants.findIndex((variant) => variant.name === selector);
  if (index === -1) {
    throw new Error(`PdpackSpriteFrame: variant '${selector}' not found`);
  }

  return {
    index,
    name: data.variants[index].name,
    variant: data.variants[index],
  };
}

export function createPdpackSpriteFrame(
  data: PdpackData,
  selector: PdpackVariantSelector = 0,
): PdpackSpriteFrameResult {
  if (!data.baseRawImage) {
    throw new Error("PdpackSpriteFrame: no base image in parsed pdpack data");
  }

  const resolved = resolvePdpackVariant(data, selector);
  const spriteFrame = mergeToSpriteFrame(data.baseRawImage, resolved.variant.regions);
  const texture = spriteFrame.getTexture();

  return {
    spriteFrame,
    texture,
    variantIndex: resolved.index,
    variantName: resolved.name,
    width: data.imageWidth || data.baseRawImage.width,
    height: data.imageHeight || data.baseRawImage.height,
  };
}

export function destroyPdpackSpriteFrame(spriteFrame: cc.SpriteFrame): void {
  const texture = spriteFrame.getTexture();
  spriteFrame.destroy();
  texture.destroy();
}

function mergeToSpriteFrame(base: RawImage, regions: PdpackRegionInfo[]): cc.SpriteFrame {
  const merged = base.clone();
  for (const region of regions) {
    if (!region.rawImage) {
      throw new Error(`PdpackSpriteFrame: region at (${region.x},${region.y}) has no decoded image`);
    }
    merged.overwrite(region.rawImage, region.x, region.y);
  }
  return merged.toSpriteFrame();
}
