 编辑器扩展插件 — 注册 .pdpack 导入器

  整体架构

  扩展目录结构:
    packages/
      pdpack-importer/
        package.json       ← 扩展描述文件
        main.js            ← 入口，注册导入器
        meta.js            ← 自定义 Meta 类（导入逻辑）
        engine/            ← （可选）运行时扩展
          pdpack-asset.js  ← 自定义 cc.Asset 子类

  各文件详细实现

  1. package.json

  {
      "name": "pdpack-importer",
      "version": "1.0.0",
      "description": "Custom importer for .pdpack binary files",
      "author": "Your Name",
      "main": "main.js",
      "runtime-resource": {
          "path": "engine",
          "name": "pdpack"
      },
      "panel": {},
      "contributions": {
          "asset-db": {
              "mount": {
                  "path": "./assets"
              }
          }
      }
  }

  关键字段说明：

  ┌──────────────────────────────┬───────────────────────────────────────────────────────────────┐
  │             字段             │                             作用                              │
  ├──────────────────────────────┼───────────────────────────────────────────────────────────────┤
  │ main                         │ 扩展入口脚本                                                  │
  ├──────────────────────────────┼───────────────────────────────────────────────────────────────┤
  │ runtime-resource.path        │ 运行时引擎扩展文件的目录（会被拷贝到构建产物中）              │
  ├──────────────────────────────┼───────────────────────────────────────────────────────────────┤
  │ runtime-resource.name        │ 运行时 import 名称（构建后可在引擎中 require('pdpack') 引用） │
  ├──────────────────────────────┼───────────────────────────────────────────────────────────────┤
  │ contributions.asset-db.mount │ 可选的资源数据挂载路径                                        │
  └──────────────────────────────┴───────────────────────────────────────────────────────────────┘

  2. main.js — 入口，注册导入器和运行时扩展

  'use strict';

  // ============ 向引擎注册运行时扩展 ============
  module.exports = {
      load() {
          // 编辑器启动时调用
          Editor.log('[pdpack] Editor extension loaded');
      },

      unload() {
          // 编辑器关闭/插件禁用时调用
          Editor.log('[pdpack] Editor extension unloaded');
      },

      // ============ 运行时消息处理 ============
      messages: {
          'asset-db:assets-ready'(event) {
              // 资源数据库就绪后注册自定义导入器
              this._registerMeta();
          },

          'editor:ready'(event) {
              this._registerMeta();
          }
      },

      _registerMeta() {
          // 将自定义的 Meta 类注册到 Editor.metas 表中
          Editor.metas['pdpack'] = PdPackMeta;
          Editor.log('[pdpack] Custom pdpack meta registered');
      }
  };

  // 延迟加载 meta 类
  const PdPackMeta = require('./meta');

  3. meta.js — 核心：自定义资源导入器

  这是最关键的实现，参考 Spine 的 SpineMeta（继承自 Editor.metas['custom-asset']）：

  'use strict';

  const Fs = require('fire-fs');
  const Path = require('fire-path');

  // 继承编辑器内置的 custom-asset Meta
  const CustomAssetMeta = Editor.metas['custom-asset'];

  class PdPackMeta extends CustomAssetMeta {
      constructor(assetdb) {
          super(assetdb);
      }

      // ------ 必须实现 -------

      /**
       * 版本号：当导入逻辑变更时递增，触发全量重新导入
       */
      static version() {
          return '1.0.0';
      }

      /**
       * 默认类型字符串
       * 这个字符串会被写入 config.json 的 paths 表，
       * 引擎运行时通过 js._getClassById(defaultType()) 解析为此类型的构造函数
       */
      static defaultType() {
          return 'pdpack';
          // 如果引擎侧用 cc.Class({ name: 'cc.PdPackAsset' }) 注册，这里应返回 'cc.PdPackAsset'
      }

      /**
       * 文件验证：判断某个文件是否为 .pdpack 格式
       * 返回 true 表示匹配，编辑器会用此 Meta 类处理该文件
       */
      static validate(assetpath) {
          // 方式一：按扩展名判断（推荐，简单可靠）
          if (assetpath.endsWith('.pdpack')) {
              return true;
          }

          // 方式二：按魔数判断（更严格）
          /*
          try {
              let buf = Buffer.alloc(4);
              let fd = Fs.openSync(assetpath, 'r');
              Fs.readSync(fd, buf, 0, 4, 0);
              Fs.closeSync(fd);
              // 检查魔数，例如 'PDPK'
              return buf[0] === 0x50 && buf[1] === 0x44
                  && buf[2] === 0x50 && buf[3] === 0x4B;
          } catch (e) {
              return false;
          }
          */

          return false;
      }

      // ------ 导入管线 -------

      /**
       * 同步导入阶段
       * 在这里生成资源的 JSON 描述文件，并将原生二进制文件拷贝到库目录
       */
      import(fspath, cb) {
          // 读取原始二进制文件
          let buffer = Fs.readFileSync(fspath);

          // 可选：解析二进制结构（如果是自定义格式）
          let header = this._parseHeader(buffer);
          let metaData = {
              version: header.version,
              dataSize: buffer.length,
              // ......其他元数据
          };

          // 1. 创建资源对象（编辑器中用的 JSON 描述）
          let asset = {
              __type__: PdPackMeta.defaultType(),  // 类型标识
              name: Path.basenameNoExt(fspath),
              _native: '.pdpack',                   // 标记为原生资源，扩展名为 .pdpack
              header: metaData,                      // 自定义元数据
          };

          // 2. 将资源 JSON 保存到 library 目录
          //    saveAssetToLibrary 内部会序列化 asset 为 .json 文件
          this._assetdb.saveAssetToLibrary(this.uuid, asset);

          cb();
      }

      /**
       * 后导入阶段（异步）
       * 通常用于处理依赖的其他资源
       * 对于纯二进制文件，可以直接完成
       */
      postImport(fspath, cb) {
          // .pdpack 没有额外依赖，直接完成
          cb();

          // 如果有依赖资源（如纹理），参考 Spine 的模式：
          /*
          let asset = this._assetdb.loadAssetFromLibrary(this.uuid);
          // ......修改 asset......
          this._assetdb.saveAssetToLibrary(this.uuid, asset);
          cb();
          */
      }

      // ------ 可选：输出文件声明 -------

      /**
       * 声明此资源在 library 中产生的文件列表
       * 用于构建时的文件映射
       */
      dests() {
          let importPathNoExt = this._assetdb._uuidToImportPathNoExt(this.uuid);
          let rawPath = this._assetdb.uuidToFspath(this.uuid);
          let extname = Path.extname(rawPath);
          // JSON 描述文件 + 原生文件
          return [
              importPathNoExt + '.json',
              importPathNoExt + extname,    // 原生 .pdpack 文件被拷贝到此处
          ];
      }

      // ------ 内部辅助 -------

      _parseHeader(buffer) {
          // 解析 .pdpack 的二进制头部
          return {
              version: 1,
              // ......
          };
      }
  }

  module.exports = PdPackMeta;

  4. engine/pdpack-asset.js — （可选）运行时 Asset 子类

  'use strict';

  /**
   * 自定义资源类：用于在游戏中承载 .pdpack 的运行时数据
   */
  let PdPackAsset = cc.Class({
      name: 'cc.PdPackAsset',
      extends: cc.Asset,

      ctor() {
          this._packData = null;
      },

      properties: {
          _nativeAsset: {
              get() {
                  return this._packData;
              },
              set(buf) {
                  // buf 是 ArrayBuffer
                  this._packData = buf;
              },
              override: true
          },

          /**
           * 获取原始二进制数据
           */
          get buffer() {
              return this._packData;
          },

          /**
           * 将二进制解析为结构化数据
           * 在资源加载完成后自动调用
           */
          onLoad() {
              if (this._packData) {
                  // 解析 .pdpack 格式
                  // this._parsedData = parsePdPack(this._packData);
              }
          }
      }
  });

  cc.PdPackAsset = module.exports = PdPackAsset;

  ---
  导入管线时序图

  用户将 file.pdpack 拖入 assets/
  ┌─────────────────────────────────────────────────┐
  │ 1. AssetDB 检测新文件                            │
  │    → 遍历所有注册的 Meta，调用 validate(fspath)   │
  │    → PdPackMeta.validate('file.pdpack') → true   │
  │    → 用 PdPackMeta 处理此文件                     │
  ├─────────────────────────────────────────────────┤
  │ 2. import(fspath, cb)                            │
  │    → 读取原始二进制 Buffer                        │
  │    → 构建 asset 对象 { __type__:'pdpack',... }    │
  │    → saveAssetToLibrary(uuid, asset)             │
  │       → 写入 library/xx/xxxxxxx.json             │
  │       → 拷贝原生文件到 library/xx/xxxxxxx.pdpack  │
  ├─────────────────────────────────────────────────┤
  │ 3. postImport(fspath, cb)                        │
  │    → 处理依赖资源（如有）                          │
  ├─────────────────────────────────────────────────┤
  │ 4. 构建项目时                                     │
  │    → config.json 的 paths 表写入:                 │
  │      "xxxx": ["pdpack/file", "pdpack"]            │
  │    → 原生文件映射到构建产物中                       │
  ├─────────────────────────────────────────────────┤
  │ 5. 运行时调用                                     │
  │    cc.resources.load('pdpack/file', callback)    │
  │    → config.getInfoWithPath → { uuid, ctor }     │
  │    → downloader.download('.pdpack') → ArrayBuffer│
  │    → factory.create('.pdpack') → PdPackAsset     │
  │    → asset.onLoad() 自动调用                      │
  └─────────────────────────────────────────────────┘

  引擎侧配合注册（运行时）

  在 main.js 的 load() 中或通过 runtime-resource 机制执行：

  // 1. 注册下载器 —— 让引擎知道如何下载 .pdpack 文件
  cc.assetManager.downloader.register('.pdpack', function(url, options, onComplete) {
      options.responseType = 'arraybuffer';
      cc.assetManager.downloader.downloadFile(url, options, options.onFileProgress, onComplete);
  });

  // 2. 注册工厂 —— 让引擎将下载的 ArrayBuffer 包装成 PdPackAsset
  cc.assetManager.factory.register('.pdpack', function(id, data, options, onComplete) {
      let out = new cc.PdPackAsset();
      out._nativeUrl = id;
      out._nativeAsset = data;
      onComplete(null, out);
  });

  关键类型关系

  defaultType() 返回值 ──────────> config.json paths 表
         │                              │
         │                    paths["uuid"] = ["path", "pdpack"]
         │                              │
         │                    js._getClassById("pdpack")
         │                              │
         ▼                              ▼
   cc.Class({ name: 'cc.PdPackAsset' })  或  cc.PdPackAsset 构造函数

  defaultType() 的返回值必须与 cc.Class({ name: '...' }) 中的 name 一致，或与运行时注册到 js._registeredClassIds 中的 ID
  一致。这是编辑器构建的 config.json 到引擎运行时类型解析的关键桥梁。
