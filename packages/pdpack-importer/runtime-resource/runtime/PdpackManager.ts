import { PdpackData } from "./PdpackData";
import { PdpackLoader } from "./PdpackLoader";
import {
  createPdpackSpriteFrame,
  destroyPdpackSpriteFrame,
  PdpackVariantSelector,
} from "./PdpackSpriteFrame";

interface ManagedSpriteFrame {
  source: string;
  spriteFrame: cc.SpriteFrame;
  variantIndex: number;
  variantName: string;
}

export class PdpackManager {
  private _packs: { [source: string]: Promise<PdpackData> } = {};
  private _frames: ManagedSpriteFrame[] = [];

  load(source: string): Promise<PdpackData> {
    if (!source) {
      throw new Error("PdpackManager.load: source is required");
    }

    if (!this._packs[source]) {
      this._packs[source] = PdpackLoader.load(source);
    }
    return this._packs[source];
  }

  async getSpriteFrame(source: string, variant: PdpackVariantSelector = 0): Promise<cc.SpriteFrame> {
    const data = await this.load(source);
    const result = createPdpackSpriteFrame(data, variant);
    this._frames.push({
      source,
      spriteFrame: result.spriteFrame,
      variantIndex: result.variantIndex,
      variantName: result.variantName,
    });
    return result.spriteFrame;
  }

  async getVariantNames(source: string): Promise<string[]> {
    const data = await this.load(source);
    return data.getVariantNames();
  }

  unload(source: string): void {
    if (!this._packs[source]) {
      throw new Error(`PdpackManager.unload: source '${source}' is not loaded`);
    }
    delete this._packs[source];
  }

  release(spriteFrame: cc.SpriteFrame): void {
    const index = this._frames.findIndex((entry) => entry.spriteFrame === spriteFrame);
    if (index === -1) {
      throw new Error("PdpackManager.release: spriteFrame is not managed by this manager");
    }

    const entry = this._frames.splice(index, 1)[0];
    destroyPdpackSpriteFrame(entry.spriteFrame);
  }

  releaseAll(): void {
    while (this._frames.length > 0) {
      const entry = this._frames.pop();
      destroyPdpackSpriteFrame(entry.spriteFrame);
    }
    this._packs = {};
  }
}

export const pdpackManager = new PdpackManager();
