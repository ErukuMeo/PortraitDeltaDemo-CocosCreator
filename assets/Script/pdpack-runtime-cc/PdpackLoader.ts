import { PdpackBinaryReader } from "./PdpackBinaryReader";
import { PdpackData, PdpackRegionInfo } from "./PdpackData";
import { RawImage } from "./RawImage";

declare const jsb: any;

/** 注册 .pdpack 扩展管线（模块加载时执行一次） */
let _registered = false;

function ensureRegistered(): void {
  if (_registered) return;
  _registered = true;

  // 1. Downloader — 将 .pdpack 作为 ArrayBuffer 下载
  cc.assetManager.downloader.register(".pdpack", (url: string, options: any, onComplete: Function) => {
    if (isNativeLocalAssetUrl(url)) {
      readNativeLocalFile(url, onComplete);
      return;
    }

    options.responseType = "arraybuffer";
    (cc.assetManager.downloader as any).downloadFile(url, options, options.onFileProgress, onComplete);
  });

  // 2. Factory — 创建 cc.BufferAsset，后续可通过 asset._nativeAsset 获取 ArrayBuffer
  (cc.assetManager as any).factory.register(".pdpack", (id: string, data: any, options: any, onComplete: Function) => {
    const out = new cc.BufferAsset();
    (out as any)._nativeUrl = id;
    (out as any)._nativeAsset = data; // data 是 downloader 返回的 ArrayBuffer/TypedArray
    onComplete(null, out);
  });

  // Parser 无需注册 — 二进制类型 parser.parse() 找不到 handler 时自动透传
}

function isNativeLocalAssetUrl(url: string): boolean {
  return !!(cc.sys && cc.sys.isNative) && !/^https?:\/\//i.test(url);
}

function readNativeLocalFile(url: string, onComplete: Function): void {
  if (typeof jsb === "undefined" || !jsb.fileUtils) {
    onComplete(new Error(`PdpackLoader: jsb.fileUtils is unavailable for native file '${url}'`));
    return;
  }

  const fileUtils = jsb.fileUtils;
  let readPath = url;
  let data: any = null;

  try {
    const normalizedUrl = url.replace(/^file:\/\//i, "");
    const fullPath = fileUtils.fullPathForFilename
      ? fileUtils.fullPathForFilename(normalizedUrl)
      : normalizedUrl;
    readPath = fullPath || normalizedUrl;
    data = fileUtils.getDataFromFile(readPath);
  } catch (e) {
    onComplete(new Error(`PdpackLoader: failed to read native file '${url}': ${e.message || e}`));
    return;
  }

  if (!hasBinaryData(data)) {
    onComplete(new Error(`PdpackLoader: failed to read native file '${url}' from '${readPath}'`));
    return;
  }

  onComplete(null, data);
}

function hasBinaryData(data: any): boolean {
  if (data instanceof ArrayBuffer) return data.byteLength > 0;
  if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView && ArrayBuffer.isView(data)) {
    return data.byteLength > 0;
  }
  return false;
}

/**
 * 从加载结果中提取 ArrayBuffer
 * 兼容两种情形：
 * - downloader 直接返回 ArrayBuffer（parser 无 .pdpack handler 时透传）
 * - factory 返回 cc.BufferAsset（_nativeAsset 持有 ArrayBuffer）
 */
function toArrayBuffer(data: any): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView && ArrayBuffer.isView(data)) {
    return typedArrayToArrayBuffer(data);
  }
  const native = (data as any)?._nativeAsset;
  if (native instanceof ArrayBuffer) return native;
  if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView && ArrayBuffer.isView(native)) {
    return typedArrayToArrayBuffer(native);
  }
  throw new Error("PdpackLoader: unable to extract ArrayBuffer, got " + typeof data);
}

function typedArrayToArrayBuffer(view: ArrayBufferView): ArrayBuffer {
  const buffer = view.buffer;
  if (view.byteOffset === 0 && view.byteLength === buffer.byteLength) {
    return buffer;
  }
  return buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
}

/** 判断字符串是否为 UUID 格式 */
function isUuid(s: string): boolean {
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s);
}

/**
 * .pdpack 文件加载器（跨平台）
 * 通过 CC 标准管线（downloader → factory）加载 .pdpack 二进制文件并解析
 */
export class PdpackLoader {
  /** Set to true to enable verbose parse logging */
  static verbose: boolean = false;

  /**
   * 通用加载入口，自动识别输入类型：
   * - UUID（如 ecd7233f-...）→ cc.assetManager.loadAny（绕过 bundle，推荐）
   * - URL（http(s)://...）→ cc.assetManager.loadRemote
   * - 其他路径 → cc.resources.load（resources 路径，需由 pdpack-importer 导入）
   *
   * @param id 资源 UUID / 远程 URL / resources 路径
   */
  static load(id: string): Promise<PdpackData> {
    ensureRegistered();

    if (isUuid(id)) {
      return PdpackLoader._loadByUuid(id);
    }
    if (/^https?:\/\//.test(id)) {
      return PdpackLoader._loadRemote(id);
    }
    return PdpackLoader._loadByPath(id);
  }

  /** 通过 UUID 加载：解析为文件 URL → loadAny({url}) → 触发 downloader + factory */
  private static _loadByUuid(uuid: string): Promise<PdpackData> {
    return new Promise((resolve, reject) => {
      // UUID → 原生文件 URL（如 library/imports/ec/xxx.pdpack）
      const url = cc.assetManager.utils.getUrlWithUuid(uuid, {
        isNative: true,
        nativeExt: ".pdpack",
      });
      if (!url) {
        reject(new Error(`PdpackLoader.load: failed to resolve UUID '${uuid}' to URL`));
        return;
      }

      // URL 模式加载，触发 .pdpack downloader → parser(透传) → factory
      cc.assetManager.loadAny(
        { url, ext: ".pdpack" },
        (err: Error | null, asset: any) => {
          if (err) {
            reject(new Error(`PdpackLoader.load: UUID '${uuid}' — ${err.message || err}`));
            return;
          }
          try {
            resolve(PdpackLoader.parse(toArrayBuffer(asset)));
          } catch (e) {
            reject(e);
          }
        }
      );
    });
  }

  /** 通过 resources 路径加载 */
  private static _loadByPath(path: string): Promise<PdpackData> {
    return new Promise((resolve, reject) => {
      cc.resources.load(path, (err: Error | null, asset: cc.Asset) => {
        if (err) {
          reject(new Error(
            `PdpackLoader.load: '${path}' — ${err.message || err}。` +
            `请确认该 .pdpack 位于 assets/resources 下，并已由 pdpack-importer 导入。`
          ));
          return;
        }
        try {
          resolve(PdpackLoader.parse(toArrayBuffer(asset)));
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  /** 通过远程 URL 加载 */
  private static _loadRemote(url: string): Promise<PdpackData> {
    return new Promise((resolve, reject) => {
      cc.assetManager.loadRemote(url, { ext: ".pdpack" }, (err: Error | null, asset: any) => {
        if (err) {
          reject(new Error(`PdpackLoader.load: URL '${url}' — ${err.message || err}`));
          return;
        }
        try {
          resolve(PdpackLoader.parse(toArrayBuffer(asset)));
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  /**
   * 从 ArrayBuffer 解析 pdpack 数据
   */
  static parse(buffer: ArrayBuffer): PdpackData {
    const reader = new PdpackBinaryReader(buffer);
    const data = new PdpackData();

    // --- 1. 文件头 (24 bytes) ---
    const magic = reader.readString(4);
    if (magic !== "PDPK") {
      throw new Error(`PdpackLoader.parse: invalid magic '${magic}', expected 'PDPK'`);
    }

    data.version = reader.readUint16();
    if (data.version !== 1) {
      throw new Error(`PdpackLoader.parse: unsupported version ${data.version}`);
    }

    data.flags = reader.readUint16();
    const variantCount = reader.readUint16();
    const offsetTable = reader.readUint32();
    reader.skip(10);

    // --- 2. 偏移表 ---
    reader.seek(offsetTable);

    const baseOffset = reader.readUint32();
    const baseSize = reader.readUint32();
    if (baseSize === 0) throw new Error("PdpackLoader.parse: base image size is 0");

    const metaOffset = reader.readUint32();
    const metaSize = reader.readUint32();
    if (metaSize === 0) throw new Error("PdpackLoader.parse: metadata size is 0");

    // --- 3. 数据段提取 ---
    const basePngBytes = new Uint8Array(buffer.slice(baseOffset, baseOffset + baseSize));
    data.baseRawImage = RawImage.fromPng(basePngBytes);

    if (!data.imageWidth) data.imageWidth = data.baseRawImage.width;
    if (!data.imageHeight) data.imageHeight = data.baseRawImage.height;

    const metaBytes = new Uint8Array(buffer.slice(metaOffset, metaOffset + metaSize));
    const metaJson = PdpackLoader._decodeUtf8(metaBytes);
    const metadata = PdpackLoader._parseMetadata(metaJson, data);

    const variantRegionInfos: PdpackRegionInfo[][] = [];

    for (let vi = 0; vi < variantCount; vi++) {
      const regionCount = reader.readUint16();
      const regions: PdpackRegionInfo[] = [];

      for (let ri = 0; ri < regionCount; ri++) {
        const regionOffset = reader.readUint32();
        const regionSize = reader.readUint32();

        const metaRegion = metadata.flatRegions.shift();
        if (!metaRegion) {
          throw new Error(`PdpackLoader.parse: metadata region mismatch at variant ${vi}, region ${ri}`);
        }

        const pngBytes = new Uint8Array(buffer.slice(regionOffset, regionOffset + regionSize));
        regions.push(metaRegion);
        metaRegion.rawImage = RawImage.fromPng(pngBytes);
      }

      variantRegionInfos.push(regions);
    }

    // --- 4. 组装 PdpackData ---
    for (let vi = 0; vi < variantCount; vi++) {
      const name = metadata.variantNames[vi] || String(vi);
      data.variants.push({ name, regions: variantRegionInfos[vi] });
    }

    // --- 5. 确保基准变体在列表中 ---
    if (data.baseVariantName && !data.variants.some(v => v.name === data.baseVariantName)) {
      data.variants.unshift({ name: data.baseVariantName, regions: [] });
    }

    return data;
  }

  private static _parseMetadata(json: string, data: PdpackData): { variantNames: string[]; flatRegions: PdpackRegionInfo[] } {
    let meta: any;
    try {
      meta = JSON.parse(json);
    } catch (e) {
      const preview = json.substring(0, 100);
      throw new Error(`PdpackLoader.parse: invalid metadata JSON: ${e}\nFirst 100 chars: ${preview}`);
    }

    if (PdpackLoader.verbose) {
      cc.log('[PdpackLoader] metadata keys:', Object.keys(meta));
      cc.log('[PdpackLoader] width/height/base:', meta.width, meta.height,
        typeof meta.base === 'object' ? JSON.stringify(meta.base) : meta.base);
    }

    const base = meta.base && typeof meta.base === 'object' ? meta.base : null;

    if (meta.width !== undefined) {
      data.imageWidth = meta.width;
    } else if (base && base.width !== undefined) {
      data.imageWidth = base.width;
    }

    if (meta.height !== undefined) {
      data.imageHeight = meta.height;
    } else if (base && base.height !== undefined) {
      data.imageHeight = base.height;
    }

    if (meta.base !== undefined) {
      if (typeof meta.base === 'string') {
        data.baseVariantName = meta.base;
      } else if (base && typeof base.name === 'string') {
        data.baseVariantName = base.name;
      } else {
        data.baseVariantName = String(meta.base);
      }
    }

    const variantNames: string[] = [];
    const flatRegions: PdpackRegionInfo[] = [];

    if (meta.variants && typeof meta.variants === "object") {
      for (const key of Object.keys(meta.variants)) {
        variantNames.push(key);
        const vd = meta.variants[key];

        if (Array.isArray(vd)) {
          for (const r of vd) {
            flatRegions.push({
              x: r.x || 0,
              y: r.y || 0,
              width: r.width !== undefined ? r.width : (r.w || 0),
              height: r.height !== undefined ? r.height : (r.h || 0),
            });
          }
        } else if (vd && Array.isArray(vd.regions)) {
          for (const r of vd.regions) {
            flatRegions.push({
              x: r.x || 0,
              y: r.y || 0,
              width: r.width !== undefined ? r.width : (r.w || 0),
              height: r.height !== undefined ? r.height : (r.h || 0),
            });
          }
        }
      }
    }

    return { variantNames, flatRegions };
  }

  private static _decodeUtf8(bytes: Uint8Array): string {
    if (typeof TextDecoder !== "undefined") {
      return new TextDecoder("utf-8").decode(bytes);
    }
    let str = "";
    let i = 0;
    while (i < bytes.length) {
      const byte1 = bytes[i++];
      if (byte1 < 0x80) {
        str += String.fromCharCode(byte1);
      } else if (byte1 < 0xE0) {
        const byte2 = bytes[i++];
        str += String.fromCharCode(((byte1 & 0x1F) << 6) | (byte2 & 0x3F));
      } else if (byte1 < 0xF0) {
        const byte2 = bytes[i++];
        const byte3 = bytes[i++];
        str += String.fromCharCode(((byte1 & 0x0F) << 12) | ((byte2 & 0x3F) << 6) | (byte3 & 0x3F));
      } else {
        const byte2 = bytes[i++];
        const byte3 = bytes[i++];
        const byte4 = bytes[i++];
        const cp = ((byte1 & 0x07) << 18) | ((byte2 & 0x3F) << 12) | ((byte3 & 0x3F) << 6) | (byte4 & 0x3F);
        str += String.fromCodePoint(cp);
      }
    }
    return str;
  }
}
