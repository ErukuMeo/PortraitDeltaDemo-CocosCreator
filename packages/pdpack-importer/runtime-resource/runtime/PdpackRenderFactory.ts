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

export interface PdpackTextureResult {
  texture: cc.Texture2D;
  variantIndex: number;
  variantName: string;
  width: number;
  height: number;
}

export function resolvePdpackVariant(data: PdpackData, selector: PdpackVariantSelector = 0): PdpackVariantRef {
  if (typeof selector === "number") {
    if (selector < 0 || selector >= data.variantCount || selector !== Math.floor(selector)) {
      throw new Error(`PdpackRenderFactory: variant index ${selector} out of range [0, ${data.variantCount - 1}]`);
    }

    const variant = data.getVariant(selector);
    if (!variant) {
      throw new Error(`PdpackRenderFactory: variant index ${selector} not found`);
    }

    return {
      index: selector,
      name: variant.name,
      variant,
    };
  }

  const index = data.variants.findIndex((variant) => variant.name === selector);
  if (index === -1) {
    throw new Error(`PdpackRenderFactory: variant '${selector}' not found`);
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
  const result = createPdpackTexture(data, selector);
  const rect = cc.rect(0, 0, result.width, result.height);
  const spriteFrame = new cc.SpriteFrame(result.texture, rect);

  return {
    spriteFrame,
    texture: result.texture,
    variantIndex: result.variantIndex,
    variantName: result.variantName,
    width: result.width,
    height: result.height,
  };
}

export function createPdpackTexture(
  data: PdpackData,
  selector: PdpackVariantSelector = 0,
): PdpackTextureResult {
  const baseRawImage = requireBaseRawImage(data);
  const resolved = resolvePdpackVariant(data, selector);
  const rawImage = mergeToRawImage(baseRawImage, resolved.variant.regions);

  return {
    texture: rawImage.toTexture(),
    variantIndex: resolved.index,
    variantName: resolved.name,
    width: data.imageWidth || baseRawImage.width,
    height: data.imageHeight || baseRawImage.height,
  };
}

export function destroyPdpackSpriteFrame(spriteFrame: cc.SpriteFrame): void {
  const texture = spriteFrame.getTexture();
  spriteFrame.destroy();
  texture.destroy();
}

export function destroyPdpackTexture(texture: cc.Texture2D): void {
  texture.destroy();
}

function requireBaseRawImage(data: PdpackData): RawImage {
  if (!data.baseRawImage) {
    throw new Error("PdpackRenderFactory: no base image in parsed pdpack data");
  }
  return data.baseRawImage;
}

function mergeToRawImage(base: RawImage, regions: PdpackRegionInfo[]): RawImage {
  const merged = base.clone();
  for (const region of regions) {
    if (!region.rawImage) {
      throw new Error(`PdpackRenderFactory: region at (${region.x},${region.y}) has no decoded image`);
    }
    merged.overwrite(region.rawImage, region.x, region.y);
  }
  return merged;
}
