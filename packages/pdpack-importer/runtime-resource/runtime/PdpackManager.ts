import { PdpackData } from "./PdpackData";
import { PdpackLoader } from "./PdpackLoader";
import {
  createPdpackSpriteFrame,
  createPdpackTexture,
  destroyPdpackSpriteFrame,
  destroyPdpackTexture,
  PdpackVariantSelector,
  resolvePdpackVariant,
} from "./PdpackRenderFactory";

interface ManagedSpriteFrame {
  path: string;
  spriteFrame: cc.SpriteFrame;
}

interface ManagedTexture {
  path: string;
  texture: cc.Texture2D;
}

export class PdpackManager {
  private _packs: { [path: string]: Promise<PdpackData> } = {};
  private _spriteFrames: ManagedSpriteFrame[] = [];
  private _textures: ManagedTexture[] = [];

  /**
   * 加载并缓存指定 .pdpack。
   * variant 参数用于在加载完成后校验指定变体是否存在。
   */
  async load(path: string, variant: PdpackVariantSelector = 0): Promise<void> {
    const data = await this._loadData(path, "load");
    resolvePdpackVariant(data, variant);
  }

  /**
   * 获取指定 .pdpack 的全部变体名称。
   * 返回数组是数据快照，调用方修改该数组不会影响内部缓存。
   */
  async getVariants(path: string): Promise<string[]> {
    const data = await this._loadData(path, "getVariants");
    return data.getVariantNames();
  }

  /**
   * 生成指定变体的 SpriteFrame。
   * 返回对象由 pdpackManager 托管，调用方不再使用时必须调用 releaseSpriteFrame。
   */
  async getSpriteFrame(path: string, variant: PdpackVariantSelector = 0): Promise<cc.SpriteFrame> {
    const data = await this._loadData(path, "getSpriteFrame");
    const result = createPdpackSpriteFrame(data, variant);
    this._trackSpriteFrame(path, result.spriteFrame);
    return result.spriteFrame;
  }

  /**
   * 按 .pdpack 变体顺序生成全部 SpriteFrame。
   * 返回数组内每一项都由 pdpackManager 托管，可用 releaseSpriteFrames 批量释放。
   */
  async getSpriteFrames(path: string): Promise<cc.SpriteFrame[]> {
    const data = await this._loadData(path, "getSpriteFrames");
    const spriteFrames: cc.SpriteFrame[] = [];

    for (let i = 0; i < data.variantCount; i++) {
      const result = createPdpackSpriteFrame(data, i);
      this._trackSpriteFrame(path, result.spriteFrame);
      spriteFrames.push(result.spriteFrame);
    }

    return spriteFrames;
  }

  /**
   * 生成指定变体的 Texture2D。
   * 返回对象由 pdpackManager 托管，调用方不再使用时必须调用 releaseTexture。
   */
  async getTexture(path: string, variant: PdpackVariantSelector = 0): Promise<cc.Texture2D> {
    const data = await this._loadData(path, "getTexture");
    const result = createPdpackTexture(data, variant);
    this._trackTexture(path, result.texture);
    return result.texture;
  }

  /**
   * 按 .pdpack 变体顺序生成全部 Texture2D。
   * 返回数组内每一项都由 pdpackManager 托管，可用 releaseTextures 批量释放。
   */
  async getTextures(path: string): Promise<cc.Texture2D[]> {
    const data = await this._loadData(path, "getTextures");
    const textures: cc.Texture2D[] = [];

    for (let i = 0; i < data.variantCount; i++) {
      const result = createPdpackTexture(data, i);
      this._trackTexture(path, result.texture);
      textures.push(result.texture);
    }

    return textures;
  }

  /**
   * 释放指定路径下由 pdpackManager 生成的全部 SpriteFrame/Texture2D，并清除解析缓存。
   */
  release(path: string): void {
    this._requirePath(path, "release");

    if (!this._packs[path]) {
      throw new Error(`PdpackManager.release: path '${path}' is not loaded`);
    }

    this._releaseSpriteFramesByPath(path);
    this._releaseTexturesByPath(path);
    delete this._packs[path];
  }

  /**
   * 释放单个由 getSpriteFrame/getSpriteFrames 返回的 SpriteFrame，并销毁其底层 Texture2D。
   */
  releaseSpriteFrame(spriteFrame: cc.SpriteFrame): void {
    const index = this._spriteFrames.findIndex((entry) => entry.spriteFrame === spriteFrame);
    if (index === -1) {
      throw new Error("PdpackManager.releaseSpriteFrame: spriteFrame is not managed by this manager");
    }

    const entry = this._spriteFrames.splice(index, 1)[0];
    destroyPdpackSpriteFrame(entry.spriteFrame);
  }

  /**
   * 批量释放由 getSpriteFrame/getSpriteFrames 返回的 SpriteFrame。
   */
  releaseSpriteFrames(spriteFrames: cc.SpriteFrame[]): void {
    for (const spriteFrame of spriteFrames) {
      this.releaseSpriteFrame(spriteFrame);
    }
  }

  /**
   * 释放单个由 getTexture/getTextures 返回的 Texture2D。
   */
  releaseTexture(texture: cc.Texture2D): void {
    const index = this._textures.findIndex((entry) => entry.texture === texture);
    if (index === -1) {
      throw new Error("PdpackManager.releaseTexture: texture is not managed by this manager");
    }

    const entry = this._textures.splice(index, 1)[0];
    destroyPdpackTexture(entry.texture);
  }

  /**
   * 批量释放由 getTexture/getTextures 返回的 Texture2D。
   */
  releaseTextures(textures: cc.Texture2D[]): void {
    for (const texture of textures) {
      this.releaseTexture(texture);
    }
  }

  private async _loadData(path: string, method: string): Promise<PdpackData> {
    this._requirePath(path, method);

    if (!this._packs[path]) {
      this._packs[path] = PdpackLoader.load(path);
    }

    return this._packs[path];
  }

  private _trackSpriteFrame(path: string, spriteFrame: cc.SpriteFrame): void {
    this._spriteFrames.push({
      path,
      spriteFrame,
    });
  }

  private _trackTexture(path: string, texture: cc.Texture2D): void {
    this._textures.push({
      path,
      texture,
    });
  }

  private _releaseSpriteFramesByPath(path: string): void {
    for (let i = this._spriteFrames.length - 1; i >= 0; i--) {
      const entry = this._spriteFrames[i];
      if (entry.path === path) {
        this._spriteFrames.splice(i, 1);
        destroyPdpackSpriteFrame(entry.spriteFrame);
      }
    }
  }

  private _releaseTexturesByPath(path: string): void {
    for (let i = this._textures.length - 1; i >= 0; i--) {
      const entry = this._textures[i];
      if (entry.path === path) {
        this._textures.splice(i, 1);
        destroyPdpackTexture(entry.texture);
      }
    }
  }

  private _requirePath(path: string, method: string): void {
    if (!path) {
      throw new Error(`PdpackManager.${method}: path is required`);
    }
  }
}

export const pdpackManager = new PdpackManager();
