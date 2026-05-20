# T1 — PdpackBinaryReader 二进制读取工具

## 目标

实现一个平台无关的大端序二进制读取工具类，为后续解析 `.pdpack` 文件提供基础能力。

## 产出文件

`assets/Script/pdpack-runtime-cc/PdpackBinaryReader.ts`

## 详细规格

### 类设计

```typescript
export class PdpackBinaryReader {
  private _buffer: ArrayBuffer;
  private _view: DataView;
  private _position: number;

  constructor(buffer: ArrayBuffer);
}
```

### 公共方法

| 方法 | 返回 | 说明 |
|------|------|------|
| `readUint8()` | `number` | 读取 1 字节无符号整数，指针 +1 |
| `readUint16()` | `number` | 读取 2 字节无符号整数（大端），指针 +2 |
| `readUint32()` | `number` | 读取 4 字节无符号整数（大端），指针 +4 |
| `readBytes(length)` | `ArrayBuffer` | 读取指定长度的原始字节，指针 +length |
| `readString(length)` | `string` | 读取指定长度的 ASCII 字符串，指针 +length |
| `seek(offset)` | `void` | 设置读取位置 |
| `skip(bytes)` | `void` | 跳过指定字节数 |
| `tell()` | `number` | 返回当前读取位置 |
| `remaining()` | `number` | 返回剩余可读字节数 |
| `hasRemaining()` | `boolean` | 是否还有剩余字节可读 |

### 实现要点

1. **大端序（Big-Endian）**：`.pdpack` 格式规定全大端序，使用 `DataView.getUint16/32(offset, false)` 的 `littleEndian = false`
2. **边界检查**：每次读取前检查 `_position + size <= _buffer.byteLength`，越界时抛出明确错误
3. **无外部依赖**：仅使用标准 `ArrayBuffer` / `DataView` API，兼容 CC 2.4.x 的 JS/TS 环境
4. **轻量**：不引入流式读取、缓冲区等复杂概念，保持简单直读

### 验收标准

- [ ] 能从已知字节序列中正确读取 uint8/uint16/uint32（大端序）
- [ ] seek/skip/tell 位置计算正确
- [ ] 越界读取抛出异常
- [ ] 在 Cocos Creator 2.4.x 项目编辑器中通过 `cc.Class` 或纯 TypeScript 正常编译

### 依赖与前置

- **无**：可独立实现，不需要其他模块

### 参考

- `.pdpack` 格式规范见 `PDPack-README.md` 第 69–118 行
- Cocos Creator 2.4.x TypeScript 环境使用标准 ES5/ES6 ArrayBuffer API
