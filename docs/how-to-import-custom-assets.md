  Cocos Creator 2.4.9 的资源加载系统由 4 个独立的可扩展注册表 构成。以下是完整调用链和扩展方案。

  ---
  加载调用链

  cc.resources.load('path/file', type, cb)
    └─ Bundle.load()
         └─ cc.assetManager.loadAny()
              └─ pipeline.async(task)
                   └─ preprocess (生成 RequestItem)
                        └─ load()
                             └─ loadOneAssetPipeline
                                  ├─ [1] fetch → packManager.load() → downloader.download()
                                  └─ [2] parse → parser.parse() → factory.create()

  四个扩展注册点

  ┌─────────────┬─────────────────────┬────────────────────────────────────────────────────┬────────────────────────┐
  │   注册点    │        文件         │                        API                         │          职责          │
  ├─────────────┼─────────────────────┼────────────────────────────────────────────────────┼────────────────────────┤
  │ downloader  │ downloader.js:416   │ cc.assetManager.downloader.register(ext, handler)  │ 如何下载文件           │
  ├─────────────┼─────────────────────┼────────────────────────────────────────────────────┼────────────────────────┤
  │ parser      │ parser.js:355       │ cc.assetManager.parser.register(ext, handler)      │ 如何解析下载后的数据   │
  ├─────────────┼─────────────────────┼────────────────────────────────────────────────────┼────────────────────────┤
  │ factory     │ factory.js:104      │ cc.assetManager.factory.register(ext, handler)     │ 如何创建 Asset 对象    │
  ├─────────────┼─────────────────────┼────────────────────────────────────────────────────┼────────────────────────┤
  │ packManager │ pack-manager.js:141 │ cc.assetManager.packManager.register(ext, handler) │ 如何拆解合并包（可选） │
  └─────────────┴─────────────────────┴────────────────────────────────────────────────────┴────────────────────────┘

  ---
  针对 .pdpack 二进制文件的扩展方案

  以已有的 .bin/.binary → BufferAsset 链路为参考（factory.js:190-193, downloader.js:587-589），需要注册两个环节：

  1. 注册 Downloader（下载方式）

  // 将 .pdpack 作为 ArrayBuffer 下载
  cc.assetManager.downloader.register('.pdpack', (url, options, onComplete) => {
      options.responseType = 'arraybuffer';
      cc.assetManager.downloader.downloadFile(url, options, options.onFileProgress, onComplete);
  });

  2. 注册 Factory（创建资源对象）

  有两种方式：

  方式 A — 直接复用 cc.BufferAsset（最简单，适合纯二进制数据）：

  cc.assetManager.factory.register('.pdpack', (id, data, options, onComplete) => {
      let out = new cc.BufferAsset();
      out._nativeUrl = id;
      out._nativeAsset = data;  // data 是 ArrayBuffer
      onComplete(null, out);
  });

  使用方式：cc.resources.load('file', cc.BufferAsset, (err, buf) => { /* buf.buffer 是 ArrayBuffer */ })

  方式 B — 自定义 Asset 子类（适合需要解析 .pdpack 内部结构的场景）：

  // 1. 定义自定义资源类
  let PdPackAsset = cc.Class({
      name: 'PdPackAsset',
      extends: cc.Asset,
      properties: {
          packets: [],  // 解析后的结构
      },
      onLoad() {
          // 从 this._nativeAsset (ArrayBuffer) 解析出具体结构
          this.packets = parsePdPack(this._nativeAsset);
      }
  });

  // 2. 注册 factory
  cc.assetManager.factory.register('.pdpack', (id, data, options, onComplete) => {
      let out = new PdPackAsset();
      out._nativeUrl = id;
      out._nativeAsset = data;
      onComplete(null, out);
  });

  使用方式：cc.resources.load('file', PdPackAsset, (err, pdpack) => { /* pdpack.packets */ })

  3. 关于 Parser

  对于二进制文件，parser 不需要额外注册——当 parser.parse() 找不到对应扩展名的 handler
  时，会直接透传原始数据（parser.js:412），这正是我们需要的。

  ---
  编辑器侧注意事项

  以上只是引擎运行时的扩展。要让 .pdpack 文件能被 cc.resources.loadRes 按路径加载到，还需要编辑器侧配合：

  1. 文件放在 assets/resources/ 下 — 这样构建时才会被打包进去
  2. 编辑器需要知道 .pdpack 的导入类型 — 否则构建生成的配置中可能找不到这个文件
    - 可以看到编辑器 资源数据库中 .pdpack 被识别为什么类型
    - 或者编写编辑器扩展插件，注册 .pdpack 的导入器

  如果你只需要加载远程的 .pdpack 文件，则更简单——直接用 cc.assetManager.loadRemote：

  cc.assetManager.loadRemote('http://example.com/data.pdpack', { ext: '.pdpack' }, (err, asset) => {
      console.log(asset.buffer);  // ArrayBuffer
  });

  这种方式的 ext 参数会告诉 factory.create() 使用 .pdpack 对应的工厂函数，完全绕开了编辑器配置。