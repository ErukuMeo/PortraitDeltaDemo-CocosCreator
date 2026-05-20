# T4 — PortraitController 立绘控制器

## 目标

封装 `PdpackLoader` 和 `PortraitRenderer`，提供面向调用方的高级 API：一键加载立绘、切换表情变体、查询可用变体列表。

## 产出文件

- `assets/Script/pdpack-runtime-cc/PortraitController.ts`
- `assets/Script/pdpack-runtime-cc/PortraitController.ts.meta`

## 详细规格

### 类设计

```typescript
@ccclass
export default class PortraitController extends cc.Component {
  /** resources 下的 pdpack 文件路径（不含扩展名） */
  @property(cc.String)
  resourcePath: string = '';

  // 内部状态
  private _data: PdpackData | null = null;
  private _renderer: PortraitRenderer | null = null;
  private _currentVariantIndex: number = 0;
  private _isLoaded: boolean = false;

  // 生命周期
  onLoad(): void;
  onDestroy(): void;

  // 公共 API
  /** 加载并渲染默认变体（索引 0） */
  load(): Promise<void>;

  /** 切换到指定变体 */
  switchToVariant(index: number): Promise<void>;

  /** 切换到变体名称（通过 metadata 查找） */
  switchToVariantByName(name: string): Promise<void>;

  /** 获取变体名称列表 */
  getVariantNames(): string[];

  /** 获取当前变体索引 */
  get currentVariantIndex(): number;

  /** 获取变体总数 */
  get variantCount(): number;

  /** 是否加载完成 */
  get isLoaded(): boolean;

  // 事件回调（可选，供外部注册）
  /** 加载完成回调列表 */
  onLoaded: Array<() => void>;
  /** 变体切换完成回调列表 */
  onVariantChanged: Array<(index: number, name: string) => void>;
  /** 错误回调列表 */
  onError: Array<(error: Error) => void>;
}
```

### 组件属性

在 Cocos Creator 编辑器属性面板中可配置：

```
┌─────────────────────────────────────┐
│ PortraitController                  │
├─────────────────────────────────────┤
│ Resource Path  [portraits/test/test] │
└─────────────────────────────────────┘
```

### 使用示例

```typescript
// 外部脚本调用
const controller = this.getComponent(PortraitController);
await controller.load();

// 切换到第二个变体
controller.switchToVariant(1);

// 获取所有变体名称
const names = controller.getVariantNames();
// names = ["default", "happy", "sad", ...]
```

### 实现要点

1. **单组件模式**：一个 `PortraitController` 管理一个角色立绘。多个角色需挂多个组件到不同节点
2. **加载时机**：`load()` 可在 `start()` 中自动调用，也可由外部手动触发
3. **初始变体**：默认加载变体索引 0（按 offset table 顺序，即 base variant）
4. **错误处理**：加载或切换失败时调用 `onError` 回调，不静默吞掉异常
5. **Promise 链**：`load()` 和 `switchToVariant()` 返回 Promise，调用方可 await 或 .then() 处理

### 验收标准

- [ ] 组件可挂载到节点并在编辑器中配置 `resourcePath`
- [ ] `load()` 后立绘正确显示
- [ ] `switchToVariant()` 正确切换表情
- [ ] `getVariantNames()` 返回正确的变体名称列表
- [ ] 连续快速切换变体不出现渲染错误或崩溃

### 依赖与前置

- **T2 (PdpackLoader)**：加载与解析
- **T3 (PortraitRenderer)**：渲染与节点管理
