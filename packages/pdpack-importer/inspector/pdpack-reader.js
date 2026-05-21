'use strict';

/**
 * Lightweight .pdpack parser for editor Inspector preview.
 * It reads the header, base PNG bytes, and metadata JSON only.
 */
class PdpackPreviewReader {
  constructor(buffer) {
    this._buffer = buffer;
    this._validate();
    this._parse();
  }

  getBasePngBytes() {
    const bytes = this._buffer.slice(this._baseOffset, this._baseOffset + this._baseSize);
    return Buffer.from(bytes);
  }

  getInfo() {
    return {
      version: this._version,
      flags: this._flags,
      variantCount: this._variantCount,
      imageWidth: this._imageWidth,
      imageHeight: this._imageHeight,
      baseVariantName: this._baseVariantName,
      variantNames: this._variantNames,
      hasAlpha: (this._flags & 1) !== 0,
      fileSize: this._buffer.length,
      basePngSize: this._baseSize,
    };
  }

  _validate() {
    if (this._buffer.length < 24) {
      throw new Error('File too small: expected at least 24 bytes.');
    }

    const magic = this._buffer.toString('ascii', 0, 4);
    if (magic !== 'PDPK') {
      throw new Error(`Invalid magic '${magic}', expected 'PDPK'.`);
    }
  }

  _parse() {
    const buf = this._buffer;

    this._version = buf.readUInt16BE(4);
    if (this._version !== 1) {
      throw new Error(`Unsupported pdpack version ${this._version}.`);
    }

    this._flags = buf.readUInt16BE(6);
    this._variantCount = buf.readUInt16BE(8);

    const offsetTablePtr = buf.readUInt32BE(10);
    if (offsetTablePtr + 16 > buf.length) {
      throw new Error('Offset table out of range.');
    }

    this._baseOffset = buf.readUInt32BE(offsetTablePtr);
    this._baseSize = buf.readUInt32BE(offsetTablePtr + 4);
    const metaOffset = buf.readUInt32BE(offsetTablePtr + 8);
    const metaSize = buf.readUInt32BE(offsetTablePtr + 12);

    if (this._baseOffset + this._baseSize > buf.length) {
      throw new Error('Base PNG offset/size out of range.');
    }
    if (metaOffset + metaSize > buf.length) {
      throw new Error('Metadata offset/size out of range.');
    }

    this._imageWidth = 0;
    this._imageHeight = 0;
    this._baseVariantName = '';
    this._variantNames = [];

    const metaStr = buf.toString('utf-8', metaOffset, metaOffset + metaSize);
    const meta = JSON.parse(metaStr);
    const base = meta.base && typeof meta.base === 'object' ? meta.base : null;

    if (meta.width !== undefined) {
      this._imageWidth = meta.width;
    } else if (base && base.width !== undefined) {
      this._imageWidth = base.width;
    }

    if (meta.height !== undefined) {
      this._imageHeight = meta.height;
    } else if (base && base.height !== undefined) {
      this._imageHeight = base.height;
    }

    if (typeof meta.base === 'string') {
      this._baseVariantName = meta.base;
    } else if (base && typeof base.name === 'string') {
      this._baseVariantName = base.name;
    }

    if (meta.variants && typeof meta.variants === 'object') {
      this._variantNames = Object.keys(meta.variants);
    }
  }
}

module.exports = PdpackPreviewReader;
