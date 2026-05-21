'use strict';

const Fs = require('fire-fs');
const Path = require('fire-path');

const IMPORTER_TYPE = 'pdpack';
const ASSET_TYPE = 'cc.PdPackAsset';

const CustomAssetMeta = Editor.metas['custom-asset'];

if (!CustomAssetMeta) {
  throw new Error('[pdpack-importer] Editor.metas["custom-asset"] is not available.');
}

class PdPackMeta extends CustomAssetMeta {
  constructor(assetdb) {
    super(assetdb);
  }

  // ---- required static ----

  static version() {
    return '1.0.5';
  }

  static defaultType() {
    return IMPORTER_TYPE;
  }

  static validate(assetpath) {
    return Path.extname(assetpath).toLowerCase() === '.pdpack';
  }

  // ---- import pipeline ----

  import(fspath, cb) {
    let header;
    try {
      const buffer = Fs.readFileSync(fspath);
      header = this._parseHeader(buffer, fspath);
    } catch (err) {
      return cb(err);
    }

    const nativePath = this._assetdb._uuidToImportPathNoExt(this.uuid) + '.pdpack';
    Fs.copy(fspath, nativePath, (err) => {
      if (err) {
        return cb(err);
      }

      const asset = {
        __type__: ASSET_TYPE,
        _name: Path.basenameNoExt(fspath),
        _objFlags: 0,
        _native: '.pdpack',
        header: header,
      };

      this._assetdb.saveAssetToLibrary(this.uuid, asset);
      cb();
    });
  }

  postImport(fspath, cb) {
    cb();
  }

  dests() {
    const importPathNoExt = this._assetdb._uuidToImportPathNoExt(this.uuid);
    const rawPath = this._assetdb.uuidToFspath(this.uuid);
    const extname = Path.extname(rawPath);
    return [
      importPathNoExt + '.json',
      importPathNoExt + extname,
    ];
  }

  // ---- internal ----

  _parseHeader(buffer, fspath) {
    if (buffer.length < 24) {
      throw new Error(`PdPackMeta: '${fspath}' is too small (${buffer.length} bytes, min 24)`);
    }

    const magic = buffer.toString('ascii', 0, 4);
    if (magic !== 'PDPK') {
      throw new Error(`PdPackMeta: '${fspath}' has invalid magic '${magic}'`);
    }

    const version  = buffer.readUInt16BE(4);
    const flags    = buffer.readUInt16BE(6);
    const variantCount = buffer.readUInt16BE(8);
    const offsetTablePtr = buffer.readUInt32BE(10);

    if (offsetTablePtr + 16 > buffer.length) {
      throw new Error(`PdPackMeta: '${fspath}' offset table out of range`);
    }

    let imageWidth = 0;
    let imageHeight = 0;
    let baseVariantName = '';
    let variantNames = [];

    try {
      const metaOffset = buffer.readUInt32BE(offsetTablePtr + 8);
      const metaSize   = buffer.readUInt32BE(offsetTablePtr + 12);
      if (metaOffset + metaSize <= buffer.length) {
        const metaStr = buffer.toString('utf-8', metaOffset, metaOffset + metaSize);
        const meta = JSON.parse(metaStr);
        const base = meta.base && typeof meta.base === 'object' ? meta.base : null;

        if (meta.width !== undefined) {
          imageWidth = meta.width;
        } else if (base && base.width !== undefined) {
          imageWidth = base.width;
        }

        if (meta.height !== undefined) {
          imageHeight = meta.height;
        } else if (base && base.height !== undefined) {
          imageHeight = base.height;
        }

        if (typeof meta.base === 'string') {
          baseVariantName = meta.base;
        } else if (base && typeof base.name === 'string') {
          baseVariantName = base.name;
        }

        if (meta.variants && typeof meta.variants === 'object') {
          variantNames = Object.keys(meta.variants);
        }
      }
    } catch (e) {
      Editor.warn(`[pdpack-importer] Metadata parse warning for '${Path.basename(fspath)}':`, e.message);
    }

    return {
      version,
      flags,
      variantCount,
      imageWidth,
      imageHeight,
      baseVariantName,
      variantNames,
      dataSize: buffer.length,
    };
  }
}

module.exports = PdPackMeta;
