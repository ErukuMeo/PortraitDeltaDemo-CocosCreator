'use strict';

(function () {
  const name_s = 'pdpack-importer';
  const component_s = 'pdpack';
  const Fs = require('fire-fs');
  const PdpackPreviewReader = Editor.require('packages://pdpack-importer/inspector/pdpack-reader');

  class model {
    constructor() {
      this.component_data_o = null;
      this.loaded = false;
      this.error = '';
      this.info = emptyInfo();
      this._blobUrl = '';
      this._loadId = 0;
      this._destroyed = false;
    }
  }

  function emptyInfo() {
    return {
      version: 0,
      flags: 0,
      hasAlpha: false,
      imageWidth: 0,
      imageHeight: 0,
      fileSize: 0,
      basePngSize: 0,
      variantCount: 0,
      baseVariantName: '',
      variantNames: [],
    };
  }

  const panel = {
    name_s,
    component_s,

    template: `
<div class="pdpack-inspector" style="padding:8px 10px;color:#bdbdbd;font-size:12px;line-height:1.45;">
  <div style="font-weight:bold;color:#ddd;margin-bottom:8px;">Preview</div>

  <div v-if="!loaded && !error" style="color:#888;padding:8px 0;">Select a .pdpack asset</div>
  <div v-if="error" style="color:#ff7373;white-space:normal;padding:8px 0;">{{ error }}</div>

  <canvas
    ref="canvas"
    v-show="loaded"
    style="display:block;max-width:100%;margin:0 auto 12px auto;background:#1f1f1f;"
  ></canvas>

  <div v-if="loaded" style="border-top:1px solid #3a3a3a;padding-top:8px;margin-top:8px;">
    <div style="font-weight:bold;color:#ddd;margin-bottom:6px;">File Info</div>
    <table style="width:100%;border-collapse:collapse;">
      <tr><td style="color:#888;padding:2px 8px 2px 0;">Version</td><td style="color:#ddd;">{{ versionText }}</td></tr>
      <tr><td style="color:#888;padding:2px 8px 2px 0;">Flags</td><td style="color:#ddd;">{{ flagsHex }}</td></tr>
      <tr><td style="color:#888;padding:2px 8px 2px 0;">Has Alpha</td><td style="color:#ddd;">{{ hasAlphaText }}</td></tr>
      <tr><td style="color:#888;padding:2px 8px 2px 0;">Dimensions</td><td style="color:#ddd;">{{ dimensions }}</td></tr>
      <tr><td style="color:#888;padding:2px 8px 2px 0;">File Size</td><td style="color:#ddd;">{{ fileSize }}</td></tr>
      <tr><td style="color:#888;padding:2px 8px 2px 0;">Base PNG</td><td style="color:#ddd;">{{ basePngSize }}</td></tr>
      <tr><td style="color:#888;padding:2px 8px 2px 0;">Variants</td><td style="color:#ddd;">{{ variantCountText }}</td></tr>
      <tr><td style="color:#888;padding:2px 8px 2px 0;">Base Variant</td><td style="color:#ddd;">{{ baseVariantText }}</td></tr>
    </table>
  </div>

  <div v-if="loaded && info.variantNames.length > 0" style="border-top:1px solid #3a3a3a;padding-top:8px;margin-top:8px;">
    <div style="font-weight:bold;color:#ddd;margin-bottom:6px;">Variant List</div>
    <div v-for="(name, i) in info.variantNames" :key="name + ':' + i" style="padding:2px 0;color:#ddd;">
      <span style="display:inline-block;width:34px;color:#888;">#{{ i }}</span>{{ name }}
    </div>
  </div>
</div>
    `,

    $: {},

    props: {
      target: {
        twoWay: true,
        type: Object,
      },
    },

    data() {
      return new model();
    },

    computed: {
      flagsHex() {
        return '0x' + Number(this.info.flags || 0).toString(16).toUpperCase().padStart(4, '0');
      },

      versionText() {
        return String(this.info.version || 0);
      },

      hasAlphaText() {
        return this.info.hasAlpha ? 'Yes' : 'No';
      },

      dimensions() {
        const w = this.info.imageWidth || '?';
        const h = this.info.imageHeight || '?';
        return w + ' x ' + h;
      },

      fileSize() {
        return this._formatBytes(this.info.fileSize || 0);
      },

      basePngSize() {
        return this._formatBytes(this.info.basePngSize || 0);
      },

      variantCountText() {
        return String(this.info.variantCount || 0);
      },

      baseVariantText() {
        return this.info.baseVariantName || '(none)';
      },
    },

    methods: {
      self: {},

      init(self) {
        self.component_data_o = self.target;
        self._loadFromTarget();
      },

      _loadFromTarget() {
        const loadId = this._nextLoadId();
        this._revokeBlobUrl();
        this.loaded = false;
        this.error = '';
        this.info = emptyInfo();
        this._clearCanvas();

        let fspath = '';
        try {
          const uuid = this._targetUuid();
          fspath = Editor.assetdb.uuidToFspath(uuid);
          if (!fspath) {
            throw new Error('AssetDB did not return a file path for uuid: ' + uuid);
          }
        } catch (e) {
          this.error = e.message || String(e);
          return;
        }

        if (!/\.pdpack$/i.test(fspath)) {
          this.error = 'Selected asset is not a .pdpack file.';
          return;
        }

        this._previewFile(fspath, loadId);
      },

      _targetUuid() {
        if (!this.target || !this.target.uuid || !this.target.uuid.value) {
          throw new Error('Pdpack Inspector target.uuid.value is not available.');
        }
        return this.target.uuid.value;
      },

      _previewFile(fspath, loadId) {
        if (!Fs.existsSync(fspath)) {
          this.error = 'Pdpack file does not exist: ' + fspath;
          return;
        }

        let reader;
        try {
          reader = new PdpackPreviewReader(Fs.readFileSync(fspath));
        } catch (e) {
          if (!this._isCurrentLoad(loadId)) return;
          this.error = e.message || String(e);
          return;
        }

        if (!this._isCurrentLoad(loadId)) return;
        this.info = reader.getInfo();
        this.loaded = true;
        this._renderPng(reader.getBasePngBytes(), loadId);
      },

      _renderPng(pngBuffer, loadId) {
        const blobUrl = URL.createObjectURL(new Blob([pngBuffer], { type: 'image/png' }));
        this._blobUrl = blobUrl;

        const img = new Image();
        img.onload = () => {
          if (!this._isCurrentLoad(loadId) || this._blobUrl !== blobUrl) return;

          const canvas = this.$refs.canvas;
          if (!canvas) return;

          const container = canvas.parentElement;
          const maxWidth = Math.max(32, (container && container.clientWidth ? container.clientWidth : 320) - 16);
          const maxHeight = 400;
          let drawW = img.naturalWidth;
          let drawH = img.naturalHeight;

          if (drawW > maxWidth || drawH > maxHeight) {
            const scale = Math.min(maxWidth / drawW, maxHeight / drawH);
            drawW = Math.floor(drawW * scale);
            drawH = Math.floor(drawH * scale);
          }

          canvas.width = drawW;
          canvas.height = drawH;
          canvas.getContext('2d').drawImage(img, 0, 0, drawW, drawH);
        };

        img.onerror = () => {
          if (!this._isCurrentLoad(loadId) || this._blobUrl !== blobUrl) return;
          this._revokeBlobUrl();
          this.error = 'Failed to decode base PNG image.';
        };

        img.src = blobUrl;
      },

      _formatBytes(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
      },

      _nextLoadId() {
        this._loadId += 1;
        return this._loadId;
      },

      _isCurrentLoad(loadId) {
        return !this._destroyed && this._loadId === loadId;
      },

      _clearCanvas() {
        const canvas = this.$refs && this.$refs.canvas;
        if (!canvas) return;
        canvas.width = 0;
        canvas.height = 0;
      },

      _revokeBlobUrl() {
        if (!this._blobUrl) return;
        URL.revokeObjectURL(this._blobUrl);
        this._blobUrl = '';
      },
    },

    async init() {
      await new Promise((resolve) => {
        const handle = setInterval(() => {
          if (!this.$el) return;

          clearInterval(handle);
          panel.methods.self = this;
          this.init(this);
          resolve(null);
        }, 100);
      });
    },

    destroyed() {
      this._destroyed = true;
      this._loadId += 1;
      this._revokeBlobUrl();
    },
  };

  if (globalThis.Vue && typeof globalThis.Vue.component === 'function') {
    globalThis.Vue.component(component_s, panel);
  }

  module.exports = panel;
})();
