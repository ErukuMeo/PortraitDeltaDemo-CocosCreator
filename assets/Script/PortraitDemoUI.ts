import PortraitController from "./pdpack-runtime-cc/PortraitController";

const { ccclass, property } = cc._decorator;

/**
 * 演示场景 UI 脚本
 * 负责变体按钮、状态显示、键盘交互
 */
@ccclass
export default class PortraitDemoUI extends cc.Component {
    @property(cc.Node)
    portraitNode: cc.Node = null;

    @property(cc.Label)
    variantLabel: cc.Label = null;

    @property(cc.Label)
    statusLabel: cc.Label = null;

    @property(cc.Node)
    buttonContainer: cc.Node = null;

    @property(cc.Prefab)
    variantBtnPrefab: cc.Prefab = null;

    private _controller: PortraitController = null;
    private _buttons: cc.Node[] = [];

    onLoad(): void {
        // 注册键盘事件
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, this._onKeyDown, this);

        if (this.portraitNode) {
            this._controller = this.portraitNode.getComponent(PortraitController);
        }
    }

    async start(): Promise<void> {
        if (!this._controller) {
            this._setStatus("错误: 未找到 PortraitController 组件", true);
            return;
        }

        if (!this._controller.pdpackPath) {
            this._setStatus("错误: 未配置 pdpackPath", true);
            return;
        }

        this._setStatus("正在加载...");

        this._controller.onLoaded.push(() => {
            this._onLoaded();
        });
        this._controller.onVariantChanged.push((index, name) => {
            this._onVariantChanged(index, name);
        });
        this._controller.onError.push((err) => {
            this._setStatus(err.message, true);
        });

        try {
            await this._controller.load();
        } catch (e) {
            // 错误已通过 onError 回调处理
        }
    }

    onDestroy(): void {
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_DOWN, this._onKeyDown, this);
    }

    private _onLoaded(): void {
        const count = this._controller.variantCount;
        const names = this._controller.getVariantNames();
        this._setStatus(`加载完成 — ${count} 个变体: ${names.join(", ")}`);
        this._createVariantButtons();
        this._updateUI();
    }

    private _onVariantChanged(index: number, name: string): void {
        this._updateUI();
        this._setStatus(`切换至: ${name}`);
        this.scheduleOnce(() => {
            if (this.statusLabel) {
                const count = this._controller.variantCount;
                const names = this._controller.getVariantNames();
                this.statusLabel.string = `加载完成 — ${count} 个变体: ${names.join(", ")}`;
            }
        }, 1.5);
    }

    private _createVariantButtons(): void {
        if (!this.buttonContainer || !this.variantBtnPrefab) return;

        // 清除已有按钮
        for (const btn of this._buttons) {
            btn.destroy();
        }
        this._buttons = [];

        const names = this._controller.getVariantNames();
        for (let i = 0; i < names.length; i++) {
            const btnNode = cc.instantiate(this.variantBtnPrefab);
            btnNode.setParent(this.buttonContainer);

            // 设置按钮文字
            const label = btnNode.getComponentInChildren(cc.Label);
            if (label) {
                label.string = names[i];
            }

            // 绑定点击事件
            const btn = btnNode.getComponent(cc.Button);
            if (btn) {
                const idx = i;
                btnNode.on("click", () => this._onVariantBtnClick(idx), this);
            }

            this._buttons.push(btnNode);
        }

        // 调整 Layout
        const layout = this.buttonContainer.getComponent(cc.Layout);
        if (layout) {
            layout.updateLayout();
        }
    }

    private _onVariantBtnClick(index: number): void {
        this._controller.switchToVariant(index).catch((e) => {
            cc.error("切换变体失败:", e);
        });
    }

    private _onKeyDown(event: any): void {
        if (!this._controller || !this._controller.isLoaded) return;

        switch (event.keyCode) {
            case cc.macro.KEY.left:
                this._prevVariant();
                break;
            case cc.macro.KEY.right:
                this._nextVariant();
                break;
        }
    }

    private _prevVariant(): void {
        const total = this._controller.variantCount;
        const cur = this._controller.currentVariantIndex;
        const next = (cur - 1 + total) % total;
        this._controller.switchToVariant(next).catch((e) => cc.error(e));
    }

    private _nextVariant(): void {
        const total = this._controller.variantCount;
        const cur = this._controller.currentVariantIndex;
        const next = (cur + 1) % total;
        this._controller.switchToVariant(next).catch((e) => cc.error(e));
    }

    private _updateUI(): void {
        if (this.variantLabel) {
            const name = this._controller.getVariantNames()[this._controller.currentVariantIndex] || "";
            this.variantLabel.string = `变体: ${name}`;
        }

        // 高亮当前按钮
        for (let i = 0; i < this._buttons.length; i++) {
            const sprite = this._buttons[i].getComponent(cc.Sprite);
            if (sprite) {
                sprite.color = i === this._controller.currentVariantIndex ? cc.color(100, 180, 255) : cc.color(255, 255, 255);
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
