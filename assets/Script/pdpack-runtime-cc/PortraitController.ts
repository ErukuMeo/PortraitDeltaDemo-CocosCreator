import { PdpackLoader } from "./PdpackLoader";
import { PdpackData } from "./PdpackData";
import { PortraitRenderer } from "./PortraitRenderer";

const { ccclass, property } = cc._decorator;

/**
 * 立绘控制器
 * 封装加载、解析、渲染流程，提供面向调用方的高级 API
 * 挂载到场景节点上使用
 */
@ccclass
export default class PortraitController extends cc.Component {
    /** pdpack 资源标识：UUID（推荐）/ 远程URL / resources路径，如 'ecd7233f-8154-4094-be87-00e0b72d10bc' */
    @property(cc.String)
    pdpackPath: string = "";

    private _data: PdpackData | null = null;
    private _renderer: PortraitRenderer | null = null;
    private _currentVariantIndex: number = -1;
    private _isLoaded: boolean = false;

    /** 加载完成回调列表 */
    onLoaded: Array<() => void> = [];
    /** 变体切换完成回调列表 */
    onVariantChanged: Array<(index: number, name: string) => void> = [];
    /** 错误回调列表 */
    onError: Array<(error: Error) => void> = [];

    onDestroy(): void {
        if (this._renderer) {
            this._renderer.dispose();
            this._renderer = null;
        }
        this._data = null;
        this._isLoaded = false;
    }

    /** 加载 pdpack 并渲染默认变体（索引 0） */
    async load(): Promise<void> {
        if (this._isLoaded) return;

        if (!this.pdpackPath) {
            const err = new Error("PortraitController: pdpackPath is not set");
            this._notifyError(err);
            throw err;
        }

        try {
            this._data = await PdpackLoader.load(this.pdpackPath);
            this._renderer = new PortraitRenderer(this.node);
            await this._renderer.render(this._data, 0);
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
        if (!this._isLoaded || !this._renderer || !this._data) {
            throw new Error("PortraitController: not loaded, call load() first");
        }
        if (index < 0 || index >= this._data.variantCount) {
            throw new Error(`PortraitController.switchToVariant: index ${index} out of range [0, ${this._data.variantCount - 1}]`);
        }
        if (index === this._currentVariantIndex) return;

        try {
            await this._renderer.switchVariant(this._data, index);
            this._currentVariantIndex = index;

            const name = this._data.getVariant(index)?.name || "";
            for (const cb of this.onVariantChanged) {
                try {
                    cb(index, name);
                } catch (e) {
                    /* 不中断其他回调 */
                }
            }
        } catch (e) {
            this._notifyError(e instanceof Error ? e : new Error(String(e)));
            throw e;
        }
    }

    /** 通过名称切换到指定变体 */
    async switchToVariantByName(name: string): Promise<void> {
        if (!this._data) {
            throw new Error("PortraitController: not loaded");
        }
        const index = this._data.variants.findIndex((v) => v.name === name);
        if (index === -1) {
            throw new Error(`PortraitController.switchToVariantByName: variant '${name}' not found`);
        }
        return this.switchToVariant(index);
    }

    /** 获取变体名称列表 */
    getVariantNames(): string[] {
        return this._data ? this._data.getVariantNames() : [];
    }

    /** 获取当前变体索引 */
    get currentVariantIndex(): number {
        return this._currentVariantIndex;
    }

    /** 获取变体总数 */
    get variantCount(): number {
        return this._data ? this._data.variantCount : 0;
    }

    /** 是否加载完成 */
    get isLoaded(): boolean {
        return this._isLoaded;
    }

    /** 获取解析后的数据（只读） */
    get data(): PdpackData | null {
        return this._data;
    }

    private _notifyLoaded(): void {
        for (const cb of this.onLoaded) {
            try {
                cb();
            } catch (e) {
                /* 不中断其他回调 */
            }
        }
    }

    private _notifyError(err: Error): void {
        for (const cb of this.onError) {
            try {
                cb(err);
            } catch (e) {
                /* 不中断其他回调 */
            }
        }
    }
}
