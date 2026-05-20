import { UPNG } from "./UPNG";

/** Pixel container for RGBA image data. */
export class RawImage {
  readonly pixels: Uint8Array;
  readonly width: number;
  readonly height: number;

  constructor(width: number, height: number, pixels?: Uint8Array) {
    this.width = width;
    this.height = height;
    this.pixels = pixels || new Uint8Array(width * height * 4);
  }

  /** Deep copy: creates a new RawImage with cloned pixel data. */
  clone(): RawImage {
    return new RawImage(this.width, this.height, new Uint8Array(this.pixels));
  }

  /**
   * Overwrite this image's pixels with src pixels at (offsetX, offsetY).
   * Full pixel replacement — no alpha blending.
   */
  overwrite(src: RawImage, offsetX: number, offsetY: number): void {
    const srcRowBytes = src.width * 4;
    const dstRowBytes = this.width * 4;
    for (let row = 0; row < src.height; row++) {
      const srcStart = row * srcRowBytes;
      const dstStart = ((offsetY + row) * dstRowBytes) + offsetX * 4;
      this.pixels.set(
        src.pixels.subarray(srcStart, srcStart + srcRowBytes),
        dstStart,
      );
    }
  }

  /** Create a cc.SpriteFrame from this image via Texture2D.initWithData (cross-platform). */
  toSpriteFrame(): cc.SpriteFrame {
    const texture = new cc.Texture2D();
    texture.initWithData(
      this.pixels,
      cc.Texture2D.PixelFormat.RGBA8888,
      this.width,
      this.height,
    );
    texture.handleLoadedTexture(false);
    texture.packable = false;
    const rect = cc.rect(0, 0, this.width, this.height);
    return new cc.SpriteFrame(texture, rect);
  }

  /** Decode a PNG byte buffer into a RawImage. */
  static fromPng(pngBytes: Uint8Array): RawImage {
    const buffer = pngBytes.buffer.slice(
      pngBytes.byteOffset,
      pngBytes.byteOffset + pngBytes.byteLength,
    );
    const img = UPNG.decode(buffer);
    const rgba = UPNG.toRGBA8(img);
    return new RawImage(img.width, img.height, new Uint8Array(rgba[0]));
  }
}
