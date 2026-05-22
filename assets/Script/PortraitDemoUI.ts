import { pdpackManager } from "PdpackManager";

const { ccclass, property } = cc._decorator;

/**
 * 演示场景 UI 脚本
 * 负责通过 pdpackManager 生成 SpriteFrame，并赋值给原生 cc.Sprite。
 */
@ccclass
export default class PortraitDemoUI extends cc.Component {
    @property({ type: cc.String })
    pdpackPath: string = "portraits/test/test_portrait";

    @property({ type: cc.Sprite, tooltip: "立绘显示节点" })
    portraitSprite: cc.Sprite = null;

    @property({ type: cc.Label })
    variantLabel: cc.Label = null;

    @property({ type: cc.Label })
    statusLabel: cc.Label = null;

    @property({ type: cc.Node })
    buttonContainer: cc.Node = null;

    @property({ type: cc.Prefab })
    variantBtnPrefab: cc.Prefab = null;

    private _currentSpriteFrame: cc.SpriteFrame = null;
    private _variantNames: string[] = [];
    private _currentVariantIndex: number = -1;
    private _isLoaded: boolean = false;
    private _buttons: cc.Node[] = [];

    onLoad(): void {
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, this._onKeyDown, this);
    }

    async start(): Promise<void> {
        if (!this.pdpackPath) {
            const err = new Error("PortraitDemoUI: pdpackPath is not set");
            this._setStatus("错误: 未配置 pdpackPath", true);
            throw err;
        }

        this._setStatus("正在加载...");

        try {
            this._variantNames = await pdpackManager.getVariantNames(this.pdpackPath);
            if (this._variantNames.length === 0) {
                throw new Error("PortraitDemoUI: pdpack contains no variants");
            }

            this._createVariantButtons();
            await this._switchToVariant(0, false);
            this._isLoaded = true;
            this._setLoadedStatus();
        } catch (e) {
            this._setStatus(e instanceof Error ? e.message : String(e), true);
            throw e;
        }
    }

    onDestroy(): void {
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_DOWN, this._onKeyDown, this);
        this._releaseCurrentSpriteFrame();
    }

    private _createVariantButtons(): void {
        if (!this.buttonContainer || !this.variantBtnPrefab) return;

        for (const btn of this._buttons) {
            btn.destroy();
        }
        this._buttons = [];

        for (let i = 0; i < this._variantNames.length; i++) {
            const btnNode = cc.instantiate(this.variantBtnPrefab);
            btnNode.setParent(this.buttonContainer);

            const label = btnNode.getComponentInChildren(cc.Label);
            if (label) {
                label.string = this._variantNames[i];
            }

            const btn = btnNode.getComponent(cc.Button);
            if (btn) {
                const idx = i;
                btnNode.on("click", () => this._onVariantBtnClick(idx), this);
            }

            this._buttons.push(btnNode);
        }

        const layout = this.buttonContainer.getComponent(cc.Layout);
        if (layout) {
            layout.updateLayout();
        }
    }

    private async _onVariantBtnClick(index: number): Promise<void> {
        await this._switchToVariantWithStatus(index);
    }

    private _onKeyDown(event: cc.Event.EventKeyboard): void {
        if (!this._isLoaded) return;

        switch (event.keyCode) {
            case cc.macro.KEY.left:
                this._prevVariant().catch((e) => {
                    this._setStatus(e instanceof Error ? e.message : String(e), true);
                    throw e;
                });
                break;
            case cc.macro.KEY.right:
                this._nextVariant().catch((e) => {
                    this._setStatus(e instanceof Error ? e.message : String(e), true);
                    throw e;
                });
                break;
        }
    }

    private async _prevVariant(): Promise<void> {
        const total = this._variantNames.length;
        const next = (this._currentVariantIndex - 1 + total) % total;
        await this._switchToVariant(next, true);
    }

    private async _nextVariant(): Promise<void> {
        const total = this._variantNames.length;
        const next = (this._currentVariantIndex + 1) % total;
        await this._switchToVariant(next, true);
    }

    private async _switchToVariantWithStatus(index: number): Promise<void> {
        try {
            await this._switchToVariant(index, true);
        } catch (e) {
            this._setStatus(e instanceof Error ? e.message : String(e), true);
            throw e;
        }
    }

    private async _switchToVariant(index: number, showStatus: boolean): Promise<void> {
        if (index < 0 || index >= this._variantNames.length) {
            throw new Error(`PortraitDemoUI.switchToVariant: index ${index} out of range [0, ${this._variantNames.length - 1}]`);
        }
        if (index === this._currentVariantIndex) return;

        const spriteFrame = await pdpackManager.getSpriteFrame(this.pdpackPath, index);
        const oldSpriteFrame = this._currentSpriteFrame;

        this.portraitSprite.sizeMode = cc.Sprite.SizeMode.CUSTOM;
        this.portraitSprite.spriteFrame = spriteFrame;
        this._currentSpriteFrame = spriteFrame;
        this._currentVariantIndex = index;
        this._fitPortraitNode(spriteFrame);

        if (oldSpriteFrame) {
            pdpackManager.release(oldSpriteFrame);
        }

        this._updateUI();
        if (showStatus) {
            this._setStatus(`切换至: ${this._variantNames[index]}`);
            this.scheduleOnce(() => this._setLoadedStatus(), 1.5);
        }
    }

    private _fitPortraitNode(spriteFrame: cc.SpriteFrame): void {
        const size = spriteFrame.getOriginalSize();
        const maxSize = Math.min(cc.winSize.width, cc.winSize.height) * 0.85;
        const scale = Math.min(1, maxSize / Math.max(size.width, size.height));

        this.portraitSprite.node.scale = scale;
        this.portraitSprite.node.setContentSize(size.width, size.height);
        this.portraitSprite.node.setAnchorPoint(0.5, 0.5);
    }

    private _releaseCurrentSpriteFrame(): void {
        if (!this._currentSpriteFrame) return;

        if (this.portraitSprite) {
            this.portraitSprite.spriteFrame = null;
        }
        pdpackManager.release(this._currentSpriteFrame);
        this._currentSpriteFrame = null;
    }

    private _setLoadedStatus(): void {
        this._setStatus(`加载完成 - ${this._variantNames.length} 个变体: ${this._variantNames.join(", ")}`);
    }

    private _updateUI(): void {
        if (this.variantLabel) {
            const name = this._variantNames[this._currentVariantIndex] || "";
            this.variantLabel.string = `变体: ${name}`;
        }

        for (let i = 0; i < this._buttons.length; i++) {
            const sprite = this._buttons[i].getComponent(cc.Sprite);
            if (sprite) {
                sprite.node.color = i === this._currentVariantIndex ? cc.color(100, 180, 255) : cc.color(255, 255, 255);
            }
        }
    }

    private _setStatus(msg: string, isError: boolean = false): void {
        if (this.statusLabel) {
            this.statusLabel.string = msg;
            if (isError) {
                this.statusLabel.node.color = cc.color(255, 80, 80);
            } else {
                this.statusLabel.node.color = cc.color(200, 200, 200);
            }
        }
    }
}
