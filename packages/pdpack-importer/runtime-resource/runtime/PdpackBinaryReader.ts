/**
 * 平台无关的大端序二进制读取工具
 * 为解析 .pdpack 文件提供基础读取能力
 */
export class PdpackBinaryReader {
  private _buffer: ArrayBuffer;
  private _view: DataView;
  private _position: number;

  constructor(buffer: ArrayBuffer) {
    this._buffer = buffer;
    this._view = new DataView(buffer);
    this._position = 0;
  }

  /** 读取 1 字节无符号整数 */
  readUint8(): number {
    this._checkBounds(1);
    const value = this._view.getUint8(this._position);
    this._position += 1;
    return value;
  }

  /** 读取 2 字节无符号整数（大端序） */
  readUint16(): number {
    this._checkBounds(2);
    const value = this._view.getUint16(this._position, false);
    this._position += 2;
    return value;
  }

  /** 读取 4 字节无符号整数（大端序） */
  readUint32(): number {
    this._checkBounds(4);
    const value = this._view.getUint32(this._position, false);
    this._position += 4;
    return value;
  }

  /** 读取指定长度的原始字节 */
  readBytes(length: number): ArrayBuffer {
    this._checkBounds(length);
    const slice = this._buffer.slice(this._position, this._position + length);
    this._position += length;
    return slice;
  }

  /** 读取指定长度的 ASCII 字符串 */
  readString(length: number): string {
    const bytes = new Uint8Array(this.readBytes(length));
    let str = '';
    for (let i = 0; i < bytes.length; i++) {
      str += String.fromCharCode(bytes[i]);
    }
    return str;
  }

  /** 设置读取位置 */
  seek(offset: number): void {
    if (offset < 0 || offset > this._buffer.byteLength) {
      throw new Error(
        `PdpackBinaryReader.seek: offset ${offset} out of range [0, ${this._buffer.byteLength}]`
      );
    }
    this._position = offset;
  }

  /** 跳过指定字节数 */
  skip(bytes: number): void {
    this.seek(this._position + bytes);
  }

  /** 返回当前读取位置 */
  tell(): number {
    return this._position;
  }

  /** 返回剩余可读字节数 */
  remaining(): number {
    return this._buffer.byteLength - this._position;
  }

  private _checkBounds(size: number): void {
    if (this._position + size > this._buffer.byteLength) {
      throw new Error(
        `PdpackBinaryReader: attempt to read ${size} bytes at offset ${this._position}, ` +
        `but only ${this.remaining()} bytes remaining`
      );
    }
  }
}
