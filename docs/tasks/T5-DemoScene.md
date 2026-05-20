# T5 — DemoScene 演示场景

## 目标

构建一个可直接在 Cocos Creator 编辑器中运行、交互的演示场景，展示 pdpack 立绘的加载与变体切换功能。

## 产出文件

- `assets/Scene/PortraitDemo.fire` — 演示场景文件
- `assets/Script/PortraitDemoUI.ts` — 演示场景 UI 脚本
- 相关 `.meta` 文件

## 场景布局设计

```
┌──────────────────────────────────────────────┐
│  PortraitDetailDemo                          │
│                                              │
│       ┌──────────────────────┐               │
│       │                      │               │
│       │    Portrait Display  │               │
│       │    (立绘渲染区域)     │               │
│       │                      │               │
│       └──────────────────────┘               │
│                                              │
│   ◄─ 上一个    变体名称: default    下一个 ─► │
│                                              │
│   ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐       │
│   │ happy │ │ sad  │ │ angry│ │surpr.│       │
│   └──────┘ └──────┘ └──────┘ └──────┘       │
│                                              │
└──────────────────────────────────────────────┘
```

### Canvas 节点树

```
Canvas (cc.Canvas, 960×640 设计分辨率)
├── Camera
├── Background (cc.Sprite, 纯色/渐变背景)
│
├── PortraitArea (cc.Node, 立绘显示区域)
│   └── PortraitNode (cc.Node, 挂载 PortraitController)
│
├── BottomPanel (cc.Node, 底部 UI 区域)
│   ├── VariantLabel (cc.Label, "变体: happy")
│   ├── PrevButton (cc.Button, "◀")
│   ├── NextButton (cc.Button, "▶")
│   └── VariantButtonLayout (cc.Layout, HBox)
│       └── [变体按钮由脚本动态创建]
│
└── StatusLabel (cc.Label, 状态提示, 位于顶部)
```

### PortraitDemoUI 脚本

```typescript
@ccclass
export default class PortraitDemoUI extends cc.Component {
  @property(cc.Node) portraitNode: cc.Node = null;     // 挂 PortraitController 的节点
  @property(cc.Label) variantLabel: cc.Label = null;   // 变体名称显示
  @property(cc.Label) statusLabel: cc.Label = null;    // 状态提示
  @property(cc.Node) buttonContainer: cc.Node = null;  // 变体按钮父节点
  @property(cc.Prefab) variantBtnPrefab: cc.Prefab = null; // 变体按钮预制体

  private _controller: PortraitController = null;

  onLoad(): void;
  onStart(): void;
  private async initController(): Promise<void>;
  private createVariantButtons(): void;
  private onVariantBtnClick(index: number): void;
  private prevVariant(): void;
  private nextVariant(): void;
  private updateUI(): void;
}
```

### 交互设计

| 交互 | 行为 |
|------|------|
| 点击变体按钮 | 切换到对应变体，高亮当前按钮 |
| 点击 ◀ / ▶ | 切换到上一个/下一个变体，循环 |
| 键盘 ← → | 等同于 ◀ / ▶ |
| 加载完成 | StatusLabel 显示 "加载完成 — N 个变体" |
| 切换变体 | StatusLabel 显示 "切换至: xxx" 1s 后消失 |
| 加载失败 | StatusLabel 显示红色错误信息 |

### 实现要点

1. **按钮动态创建**：根据 `controller.getVariantNames()` 返回的列表，动态实例化按钮预制体
2. **高亮状态**：当前选中的变体按钮使用不同的颜色/缩放标识
3. **键盘输入**：在 `update()` 中监听 `cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN/KEY_UP)`
4. **场景文件**：直接在 CC 编辑器中将 `helloworld.fire` 另存为 `PortraitDemo.fire` 并搭建 UI

### 验收标准

- [ ] 场景在编辑器预览中正常运行，无控制台异常
- [ ] 立绘加载后正确显示默认变体
- [ ] 点击变体按钮可切换表情，画面更新正确
- [ ] 键盘 ← → 可切换变体
- [ ] 变体按钮与可用变体列表一致
- [ ] 加载失败时有明确的错误提示

### 依赖与前置

- **T4 (PortraitController)**：演示场景的核心依赖
