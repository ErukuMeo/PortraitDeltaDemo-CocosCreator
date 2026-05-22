'use strict';

export {};

const Fs = require('fire-fs');
const Path = require('fire-path');
const PdpackCore = require('../runtime-resource/pdpack-runtime/core/PdpackCore');

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
    try {
      return PdpackCore.toHeaderSummary(PdpackCore.parseContainer(buffer));
    } catch (e) {
      throw new Error(`PdPackMeta: failed to parse '${fspath}': ${e.message || e}`);
    }
  }
}

module.exports = PdPackMeta;
