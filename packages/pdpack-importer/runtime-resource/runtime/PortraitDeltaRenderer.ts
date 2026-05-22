import { PdpackLoader } from "./PdpackLoader";
import { PdpackData, PdpackRegionInfo } from "./PdpackData";
import { RawImage } from "./RawImage";

const { ccclass, property } = cc._decorator;

/**
 * 立绘差分渲染组件
 * 封装 .pdpack 加载、解析、像素合并、Sprite 渲染与变体切换的完整流程
 * 挂载到场景节点上使用，直接在当前节点上添加 cc.Sprite
 */
@ccclass
export default class PortraitDeltaRenderer extends cc.Component {
    @property(cc.String)
    pdpackPath: string = "";

    private _data: PdpackData | null = null;
    private _sprite: cc.Sprite | null = null;
    private _mergedTexture: cc.Texture2D | null = null;
    private _currentVariantIndex: number = -1;
    private _isLoaded: boolean = false;

    onLoaded: Array<() => void> = [];
    onVariantChanged: Array<(index: number, name: string) => void> = [];
    onError: Array<(error: Error) => void> = [];

    onDestroy(): void {
        this._disposeRender();
        this._data = null;
        this._isLoaded = false;
    }

    /** 加载 pdpack 并渲染默认变体（索引 0） */
    async load(): Promise<void> {
        if (this._isLoaded) return;

        if (!this.pdpackPath) {
            const err = new Error("PortraitDeltaRenderer: pdpackPath is not set");
            this._notifyError(err);
            throw err;
        }

        try {
            this._data = await PdpackLoader.load(this.pdpackPath);
            this._renderVariant(0);
            this._currentVariantIndex = 0;
            this._isLoaded = true;
            this._notifyLoaded();
        } catch (e) {
            this._notifyError(e instanceof Error ? e : new Error(String(e)));
            throw e;
        }
    }

    /** 切换到指定变体 */
    async switchToVariant(index: number): Promise<void> {
        if (!this._isLoaded || !this._data) {
            throw new Error("PortraitDeltaRenderer: not loaded, call load() first");
        }
        if (index < 0 || index >= this._data.variantCount) {
            throw new Error(`PortraitDeltaRenderer.switchToVariant: index ${index} out of range [0, ${this._data.variantCount - 1}]`);
        }
        if (index === this._currentVariantIndex) return;

        try {
            this._renderVariant(index);
            this._currentVariantIndex = index;

            const name = this._data.getVariant(index)?.name || "";
            for (const cb of this.onVariantChanged) {
                try { cb(index, name); } catch (e) { /* 不中断其他回调 */ }
            }
        } catch (e) {
            this._notifyError(e instanceof Error ? e : new Error(String(e)));
            throw e;
        }
    }

    /** 通过名称切换到指定变体 */
    async switchToVariantByName(name: string): Promise<void> {
        if (!this._data) {
            throw new Error("PortraitDeltaRenderer: not loaded");
        }
        const index = this._data.variants.findIndex((v) => v.name === name);
        if (index === -1) {
            throw new Error(`PortraitDeltaRenderer.switchToVariantByName: variant '${name}' not found`);
        }
        return this.switchToVariant(index);
    }

    getVariantNames(): string[] {
        return this._data ? this._data.getVariantNames() : [];
    }

    get currentVariantIndex(): number {
        return this._currentVariantIndex;
    }

    get variantCount(): number {
        return this._data ? this._data.variantCount : 0;
    }

    get isLoaded(): boolean {
        return this._isLoaded;
    }

    get data(): PdpackData | null {
        return this._data;
    }

    // ---- 内部渲染 ----

    private _renderVariant(variantIndex: number): void {
        if (!this._data || !this._data.baseRawImage) {
            throw new Error("PortraitDeltaRenderer: no parsed data");
        }

        const variant = this._data.getVariant(variantIndex);
        if (!variant) {
            throw new Error(`PortraitDeltaRenderer: invalid variant index ${variantIndex}`);
        }

        const spriteFrame = this._mergeToSpriteFrame(this._data.baseRawImage, variant.regions);
        const newTexture = spriteFrame.getTexture();

        const texW = this._data.imageWidth || this._data.baseRawImage.width;
        const texH = this._data.imageHeight || this._data.baseRawImage.height;

        const maxSize = Math.min(cc.winSize.width, cc.winSize.height) * 0.85;
        const scale = Math.min(1, maxSize / Math.max(texW, texH));

        // 初次渲染需要创建 Sprite 和设置节点
        if (!this._sprite) {
            this.node.scale = scale;
            this.node.setContentSize(texW, texH);
            this.node.setAnchorPoint(0.5, 0.5);
            this._sprite = this.node.addComponent(cc.Sprite);
            this._sprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
        }

        const oldTexture = this._mergedTexture;
        this._mergedTexture = newTexture;
        this._sprite.spriteFrame = spriteFrame;

        if (oldTexture) {
            oldTexture.destroy();
        }
    }

    /** 释放 Sprite 组件和纹理，不销毁节点本身 */
    private _disposeRender(): void {
        if (this._sprite) {
            this._sprite.destroy();
            this._sprite = null;
        }
        if (this._mergedTexture) {
            this._mergedTexture.destroy();
            this._mergedTexture = null;
        }
    }

    /** 克隆 base 像素 → 覆盖 diff 区域 → 生成 SpriteFrame */
    private _mergeToSpriteFrame(base: RawImage, regions: PdpackRegionInfo[]): cc.SpriteFrame {
        const merged = base.clone();
        for (const region of regions) {
            if (!region.rawImage) {
                cc.warn(`PortraitDeltaRenderer: region at (${region.x},${region.y}) has no decoded image, skipping`);
                continue;
            }
            merged.overwrite(region.rawImage, region.x, region.y);
        }
        return merged.toSpriteFrame();
    }

    // ---- 回调通知 ----

    private _notifyLoaded(): void {
        for (const cb of this.onLoaded) {
            try { cb(); } catch (e) { /* 不中断其他回调 */ }
        }
    }

    private _notifyError(err: Error): void {
        for (const cb of this.onError) {
            try { cb(err); } catch (e) { /* 不中断其他回调 */ }
        }
    }
}
