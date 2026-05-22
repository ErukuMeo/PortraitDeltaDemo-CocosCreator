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

export function resolvePdpackVariant(data: PdpackData, selector?: PdpackVariantSelector): PdpackVariantRef {
  const resolvedSelector = selector === undefined ? data.defaultVariantName : selector;

  if (typeof resolvedSelector === "number") {
    if (resolvedSelector < 0 || resolvedSelector >= data.variantCount || resolvedSelector !== Math.floor(resolvedSelector)) {
      throw new Error(`PdpackRenderFactory: variant index ${resolvedSelector} out of range [0, ${data.variantCount - 1}]`);
    }

    const variant = data.getVariant(resolvedSelector);
    if (!variant) {
      throw new Error(`PdpackRenderFactory: variant index ${resolvedSelector} not found`);
    }

    return {
      index: resolvedSelector,
      name: variant.name,
      variant,
    };
  }

  if (!resolvedSelector) {
    throw new Error("PdpackRenderFactory: default variant name is missing");
  }

  const index = data.variants.findIndex((variant) => variant.name === resolvedSelector);
  if (index === -1) {
    throw new Error(`PdpackRenderFactory: variant '${resolvedSelector}' not found`);
  }

  return {
    index,
    name: data.variants[index].name,
    variant: data.variants[index],
  };
}

export function createPdpackSpriteFrame(
  data: PdpackData,
  selector?: PdpackVariantSelector,
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
  selector?: PdpackVariantSelector,
): PdpackTextureResult {
  const defaultVariantRawImage = requireDefaultVariantRawImage(data);
  const resolved = resolvePdpackVariant(data, selector);
  const rawImage = mergeToRawImage(defaultVariantRawImage, resolved.variant.regions);

  return {
    texture: rawImage.toTexture(),
    variantIndex: resolved.index,
    variantName: resolved.name,
    width: data.imageWidth || defaultVariantRawImage.width,
    height: data.imageHeight || defaultVariantRawImage.height,
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

function requireDefaultVariantRawImage(data: PdpackData): RawImage {
  if (!data.defaultVariantRawImage) {
    throw new Error("PdpackRenderFactory: no default variant image in parsed pdpack data");
  }
  return data.defaultVariantRawImage;
}

function mergeToRawImage(defaultVariantImage: RawImage, regions: PdpackRegionInfo[]): RawImage {
  const merged = defaultVariantImage.clone();
  for (const region of regions) {
    if (!region.rawImage) {
      throw new Error(`PdpackRenderFactory: region at (${region.x},${region.y}) has no decoded image`);
    }
    merged.overwrite(region.rawImage, region.x, region.y);
  }
  return merged;
}
