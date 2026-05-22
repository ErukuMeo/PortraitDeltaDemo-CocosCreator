/**
 * .pdpack 解析结果的数据结构定义
 */

import { RawImage } from "./RawImage";

/** 差异区域信息 */
export interface PdpackRegionInfo {
  /** 区域在基础图上的 x 偏移（像素，相对于左上角） */
  x: number;
  /** 区域在基础图上的 y 偏移（像素，相对于左上角） */
  y: number;
  /** 区域宽度（像素） */
  width: number;
  /** 区域高度（像素） */
  height: number;
  /** 解码后的 RGBA 像素数据 */
  rawImage?: RawImage;
}

/** 单个变体的完整信息 */
export interface PdpackVariantInfo {
  /** 变体名称 */
  name: string;
  /** 该变体的所有差异区域元数据 */
  regions: PdpackRegionInfo[];
}

/** 解析后的 pdpack 文件数据 */
export class PdpackData {
  version: number = 0;
  flags: number = 0;
  /** 立绘图像总宽度（像素） */
  imageWidth: number = 0;
  /** 立绘图像总高度（像素） */
  imageHeight: number = 0;
  /** 解码后的基础图 RGBA 像素数据 */
  baseRawImage: RawImage | null = null;
  /** 基准变体名称 */
  baseVariantName: string = '';
  /** 所有变体列表 */
  variants: PdpackVariantInfo[] = [];

  /** flags 的 bit0：是否包含 Alpha 通道 */
  get hasAlpha(): boolean {
    return (this.flags & 1) !== 0;
  }

  /** 变体数量 */
  get variantCount(): number {
    return this.variants.length;
  }

  /** 获取变体名称列表 */
  getVariantNames(): string[] {
    return this.variants.map(v => v.name);
  }

  /** 通过索引获取变体 */
  getVariant(index: number): PdpackVariantInfo | null {
    if (index < 0 || index >= this.variants.length) {
      return null;
    }
    return this.variants[index];
  }

  /** 通过名称获取变体 */
  getVariantByName(name: string): PdpackVariantInfo | null {
    return this.variants.find(v => v.name === name) || null;
  }
}
