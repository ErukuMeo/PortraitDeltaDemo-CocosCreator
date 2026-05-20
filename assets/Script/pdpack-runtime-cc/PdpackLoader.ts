import { PdpackBinaryReader } from "./PdpackBinaryReader";
import { PdpackData, PdpackRegionInfo } from "./PdpackData";

/** 注册 .pdpack 扩展管线（模块加载时执行一次） */
let _registered = false;

function ensureRegistered(): void {
  if (_registered) return;
  _registered = true;

  // 1. Downloader — 将 .pdpack 作为 ArrayBuffer 下载
  cc.assetManager.downloader.register(".pdpack", (url: string, options: any, onComplete: Function) => {
    options.responseType = "arraybuffer";
    cc.assetManager.downloader.downloadFile(url, options, options.onFileProgress, onComplete);
  });

  // 2. Factory — 创建 cc.BufferAsset，后续可通过 asset._nativeAsset 获取 ArrayBuffer
  cc.assetManager.factory.register(".pdpack", (id: string, data: any, options: any, onComplete: Function) => {
    const out = new cc.BufferAsset();
    out._nativeUrl = id;
    out._nativeAsset = data; // data 是 downloader 返回的 ArrayBuffer
    onComplete(null, out);
  });

  // Parser 无需注册 — 二进制类型 parser.parse() 找不到 handler 时自动透传
}

/**
 * 从加载结果中提取 ArrayBuffer
 * 兼容两种情形：
 * - downloader 直接返回 ArrayBuffer（parser 无 .pdpack handler 时透传）
 * - factory 返回 cc.BufferAsset（_nativeAsset 持有 ArrayBuffer）
 */
function toArrayBuffer(data: any): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  if (data && data.buffer instanceof ArrayBuffer) return data.buffer; // TypedArray
  const native = (data as any)?._nativeAsset;
  if (native instanceof ArrayBuffer) return native;
  if (native && native.buffer instanceof ArrayBuffer) return native.buffer;
  throw new Error("PdpackLoader: unable to extract ArrayBuffer, got " + typeof data);
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
  /**
   * 通用加载入口，自动识别输入类型：
   * - UUID（如 ecd7233f-...）→ cc.assetManager.loadAny（绕过 bundle，推荐）
   * - URL（http(s)://...）→ cc.assetManager.loadRemote
   * - 其他路径 → cc.resources.load（需要编辑器识别 .pdpack 扩展名）
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
      cc.resources.load(path, cc.BufferAsset, (err: Error | null, asset: cc.BufferAsset) => {
        if (err) {
          reject(new Error(
            `PdpackLoader.load: '${path}' — ${err.message || err}。` +
            `提示：编辑器不识别 .pdpack 扩展名时，请使用 UUID 加载（在 .pdpack.meta 中可找到）`
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
    data.basePng = new Uint8Array(buffer.slice(baseOffset, baseOffset + baseSize));

    const metaBytes = new Uint8Array(buffer.slice(metaOffset, metaOffset + metaSize));
    const metaJson = PdpackLoader._decodeUtf8(metaBytes);
    const metadata = PdpackLoader._parseMetadata(metaJson, data);

    const variantRegionInfos: PdpackRegionInfo[][] = [];
    const variantRegionPngs: Uint8Array[][] = [];

    for (let vi = 0; vi < variantCount; vi++) {
      const regionCount = reader.readUint16();
      const regions: PdpackRegionInfo[] = [];
      const pngs: Uint8Array[] = [];

      for (let ri = 0; ri < regionCount; ri++) {
        const regionOffset = reader.readUint32();
        const regionSize = reader.readUint32();

        const metaRegion = metadata.flatRegions.shift();
        if (!metaRegion) {
          throw new Error(`PdpackLoader.parse: metadata region mismatch at variant ${vi}, region ${ri}`);
        }

        regions.push(metaRegion);
        pngs.push(new Uint8Array(buffer.slice(regionOffset, regionOffset + regionSize)));
      }

      variantRegionInfos.push(regions);
      variantRegionPngs.push(pngs);
    }

    // --- 4. 组装 PdpackData ---
    for (let vi = 0; vi < variantCount; vi++) {
      const name = metadata.variantNames[vi] || String(vi);
      const regions = variantRegionInfos[vi];
      const pngs = variantRegionPngs[vi];
      cc.log(`[PdpackLoader] variant[${vi}] '${name}': ${regions.length} regions, ${pngs.length} pngs`);
      for (let ri = 0; ri < regions.length; ri++) {
        const r = regions[ri];
        cc.log(`  region[${ri}]: x=${r.x} y=${r.y} w=${r.width} h=${r.height} pngBytes=${pngs[ri]?.length || 0}`);
      }
      data.variants.push({ name, regions, regionPngs: pngs });
    }

    // --- 5. 确保基准变体在列表中 ---
    if (data.baseVariantName && !data.variants.some(v => v.name === data.baseVariantName)) {
      data.variants.unshift({
        name: data.baseVariantName,
        regions: [],
        regionPngs: [],
      });
      cc.log(`[PdpackLoader] prepended base variant '${data.baseVariantName}' at index 0`);
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

    cc.log('[PdpackLoader] metadata keys:', Object.keys(meta));
    cc.log('[PdpackLoader] width/height/base:', meta.width, meta.height,
      typeof meta.base === 'object' ? JSON.stringify(meta.base) : meta.base);

    if (meta.width !== undefined) data.imageWidth = meta.width;
    if (meta.height !== undefined) data.imageHeight = meta.height;
    if (meta.base !== undefined) {
      if (typeof meta.base === 'string') {
        data.baseVariantName = meta.base;
      } else if (meta.base && typeof meta.base === 'object' && typeof meta.base.name === 'string') {
        data.baseVariantName = meta.base.name;
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
            flatRegions.push({ x: r.x || 0, y: r.y || 0, width: r.width || 0, height: r.height || 0 });
          }
        } else if (vd && Array.isArray(vd.regions)) {
          for (const r of vd.regions) {
            flatRegions.push({ x: r.x || 0, y: r.y || 0, width: r.width || 0, height: r.height || 0 });
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
    for (let i = 0; i < bytes.length; i++) {
      str += String.fromCharCode(bytes[i]);
    }
    return str;
  }
}
