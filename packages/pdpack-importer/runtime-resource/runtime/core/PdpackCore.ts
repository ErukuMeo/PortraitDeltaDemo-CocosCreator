import {
  NormalizedPdpackMetadata,
  PdpackContainer,
  PdpackHeader,
  PdpackHeaderSummary,
  PdpackRegionMetadata,
  PdpackRegionSegment,
  PdpackVariantMetadata,
  PdpackVariantSegment,
} from "./PdpackCoreTypes";

declare const TextDecoder: any;

const HEADER_SIZE = 24;
const BASE_OFFSET_TABLE_SIZE = 16;

export function parseHeader(input: ArrayBuffer | Uint8Array): PdpackHeader {
  const bytes = toUint8Array(input);
  ensureRange(bytes, 0, HEADER_SIZE, "header");

  const magic = readAscii(bytes, 0, 4);
  if (magic !== "PDPK") {
    throw new Error(`PdpackCore.parseHeader: invalid magic '${magic}', expected 'PDPK'`);
  }

  const view = toDataView(bytes);
  return {
    magic,
    version: readUint16(view, 4, "version"),
    flags: readUint16(view, 6, "flags"),
    variantCount: readUint16(view, 8, "variantCount"),
    offsetTablePtr: readUint32(view, 10, "offsetTablePtr"),
    dataSize: bytes.byteLength,
  };
}

export function parseMetadata(json: string): NormalizedPdpackMetadata {
  let raw: any;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    const preview = json.substring(0, 100);
    throw new Error(`PdpackCore.parseMetadata: invalid metadata JSON: ${messageOf(e)}\nFirst 100 chars: ${preview}`);
  }

  const base = raw.base && typeof raw.base === "object" ? raw.base : null;
  const imageWidth = raw.width !== undefined ? raw.width : base && base.width !== undefined ? base.width : 0;
  const imageHeight = raw.height !== undefined ? raw.height : base && base.height !== undefined ? base.height : 0;
  let baseVariantName = "";

  if (raw.base !== undefined) {
    if (typeof raw.base === "string") {
      baseVariantName = raw.base;
    } else if (base && typeof base.name === "string") {
      baseVariantName = base.name;
    } else {
      baseVariantName = String(raw.base);
    }
  }

  const variantNames: string[] = [];
  const variants: PdpackVariantMetadata[] = [];
  if (raw.variants && typeof raw.variants === "object") {
    const names = Object.keys(raw.variants);
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      const value = raw.variants[name];
      const sourceRegions = Array.isArray(value) ? value : value && Array.isArray(value.regions) ? value.regions : [];
      const regions: PdpackRegionMetadata[] = [];

      variantNames.push(name);
      for (let ri = 0; ri < sourceRegions.length; ri++) {
        regions.push(normalizeRegion(sourceRegions[ri]));
      }

      variants.push({ name, regions });
    }
  }

  return {
    imageWidth,
    imageHeight,
    baseVariantName,
    variantNames,
    variants,
    raw,
  };
}

export function parseContainer(input: ArrayBuffer | Uint8Array): PdpackContainer {
  const bytes = toUint8Array(input);
  const header = parseHeader(bytes);
  if (header.version !== 1) {
    throw new Error(`PdpackCore.parseContainer: unsupported version ${header.version}`);
  }

  ensureRange(bytes, header.offsetTablePtr, BASE_OFFSET_TABLE_SIZE, "offset table base entries");

  const view = toDataView(bytes);
  const baseOffset = readUint32(view, header.offsetTablePtr, "baseOffset");
  const baseSize = readUint32(view, header.offsetTablePtr + 4, "baseSize");
  if (baseSize === 0) {
    throw new Error("PdpackCore.parseContainer: base image size is 0");
  }

  const metaOffset = readUint32(view, header.offsetTablePtr + 8, "metadataOffset");
  const metaSize = readUint32(view, header.offsetTablePtr + 12, "metadataSize");
  if (metaSize === 0) {
    throw new Error("PdpackCore.parseContainer: metadata size is 0");
  }

  const basePngBytes = readSegment(bytes, baseOffset, baseSize, "base image");
  const metadataJson = decodeUtf8(readSegment(bytes, metaOffset, metaSize, "metadata"));
  const metadata = parseMetadata(metadataJson);

  return {
    header,
    imageWidth: metadata.imageWidth,
    imageHeight: metadata.imageHeight,
    baseVariantName: metadata.baseVariantName,
    variantNames: metadata.variantNames,
    metadata: metadata.raw,
    basePngBytes,
    basePngSize: baseSize,
    variants: parseVariants(bytes, view, header, metadata),
  };
}

export function toHeaderSummary(container: PdpackContainer): PdpackHeaderSummary {
  return {
    version: container.header.version,
    flags: container.header.flags,
    variantCount: container.header.variantCount,
    imageWidth: container.imageWidth,
    imageHeight: container.imageHeight,
    baseVariantName: container.baseVariantName,
    variantNames: container.variantNames.slice(),
    dataSize: container.header.dataSize,
  };
}

function parseVariants(
  bytes: Uint8Array,
  view: DataView,
  header: PdpackHeader,
  metadata: NormalizedPdpackMetadata,
): PdpackVariantSegment[] {
  const variants: PdpackVariantSegment[] = [];
  let cursor = header.offsetTablePtr + BASE_OFFSET_TABLE_SIZE;

  for (let vi = 0; vi < header.variantCount; vi++) {
    ensureRange(bytes, cursor, 2, `variant ${vi} region count`);
    const regionCount = readUint16(view, cursor, `variant ${vi} region count`);
    cursor += 2;

    const metaVariant = metadata.variants[vi];
    if (!metaVariant) {
      throw new Error(`PdpackCore.parseContainer: metadata missing variant ${vi}`);
    }

    const regions: PdpackRegionSegment[] = [];
    for (let ri = 0; ri < regionCount; ri++) {
      ensureRange(bytes, cursor, 8, `variant ${vi} region ${ri} offset entry`);
      const offset = readUint32(view, cursor, `variant ${vi} region ${ri} offset`);
      const size = readUint32(view, cursor + 4, `variant ${vi} region ${ri} size`);
      cursor += 8;

      const metaRegion = metaVariant.regions[ri];
      if (!metaRegion) {
        throw new Error(`PdpackCore.parseContainer: metadata missing variant ${vi} region ${ri}`);
      }

      regions.push({
        x: metaRegion.x,
        y: metaRegion.y,
        width: metaRegion.width,
        height: metaRegion.height,
        offset,
        size,
        pngBytes: readSegment(bytes, offset, size, `variant ${vi} region ${ri} image`),
      });
    }

    variants.push({ name: metaVariant.name, regions });
  }

  return variants;
}

function normalizeRegion(region: any): PdpackRegionMetadata {
  region = region || {};
  return {
    x: region.x || 0,
    y: region.y || 0,
    width: region.width !== undefined ? region.width : region.w || 0,
    height: region.height !== undefined ? region.height : region.h || 0,
  };
}

function readSegment(bytes: Uint8Array, offset: number, size: number, label: string): Uint8Array {
  if (size === 0) {
    throw new Error(`PdpackCore: ${label} size is 0`);
  }
  ensureRange(bytes, offset, size, label);
  return bytes.subarray(offset, offset + size);
}

function toUint8Array(input: ArrayBuffer | Uint8Array): Uint8Array {
  if (input instanceof Uint8Array) {
    return input;
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView && ArrayBuffer.isView(input as any)) {
    const view = input as any;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  throw new Error("PdpackCore: input must be ArrayBuffer or Uint8Array");
}

function toDataView(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function ensureRange(bytes: Uint8Array, offset: number, size: number, label: string): void {
  if (offset < 0 || size < 0 || offset + size > bytes.byteLength || offset + size < offset) {
    throw new Error(
      `PdpackCore: ${label} out of range (offset=${offset}, size=${size}, dataSize=${bytes.byteLength})`,
    );
  }
}

function readUint16(view: DataView, offset: number, label: string): number {
  ensureDataViewRange(view, offset, 2, label);
  return view.getUint16(offset, false);
}

function readUint32(view: DataView, offset: number, label: string): number {
  ensureDataViewRange(view, offset, 4, label);
  return view.getUint32(offset, false);
}

function ensureDataViewRange(view: DataView, offset: number, size: number, label: string): void {
  if (offset < 0 || offset + size > view.byteLength || offset + size < offset) {
    throw new Error(
      `PdpackCore: ${label} out of range (offset=${offset}, size=${size}, dataSize=${view.byteLength})`,
    );
  }
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  ensureRange(bytes, offset, length, "ascii string");
  let out = "";
  for (let i = 0; i < length; i++) {
    out += String.fromCharCode(bytes[offset + i]);
  }
  return out;
}

function decodeUtf8(bytes: Uint8Array): string {
  if (typeof TextDecoder !== "undefined") {
    return new TextDecoder("utf-8").decode(bytes);
  }

  let str = "";
  let i = 0;
  while (i < bytes.length) {
    const byte1 = bytes[i++];
    if (byte1 < 0x80) {
      str += String.fromCharCode(byte1);
    } else if (byte1 < 0xe0) {
      const byte2 = bytes[i++];
      str += String.fromCharCode(((byte1 & 0x1f) << 6) | (byte2 & 0x3f));
    } else if (byte1 < 0xf0) {
      const byte2 = bytes[i++];
      const byte3 = bytes[i++];
      str += String.fromCharCode(((byte1 & 0x0f) << 12) | ((byte2 & 0x3f) << 6) | (byte3 & 0x3f));
    } else {
      const byte2 = bytes[i++];
      const byte3 = bytes[i++];
      const byte4 = bytes[i++];
      const cp = ((byte1 & 0x07) << 18) | ((byte2 & 0x3f) << 12) | ((byte3 & 0x3f) << 6) | (byte4 & 0x3f);
      str += String.fromCodePoint(cp);
    }
  }
  return str;
}

function messageOf(error: any): string {
  return error && error.message ? error.message : String(error);
}
