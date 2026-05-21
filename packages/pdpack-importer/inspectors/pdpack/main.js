"use strict";

const IMPORTER_TYPE = "pdpack";
const COMPONENT_NAME = "pdpack";
const Fs = tryRequire("fire-fs") || tryRequire("fs");
const Path = tryRequire("fire-path") || tryRequire("path");
const EditorRef = typeof Editor !== "undefined" ? Editor : null;
const VueRef = typeof globalThis !== "undefined" ? globalThis.Vue : typeof Vue !== "undefined" ? Vue : null;

const panel = {
    template: `
    <div class="pdpack-inspector">
        <div class="pdpack-main">
            <div class="pdpack-title">Portrait Delta Pack</div>

            <div class="pdpack-section">
                <div class="pdpack-section-title">IDENTITY</div>
                <div class="pdpack-row">
                    <span class="pdpack-label" title="资源在 Cocos Creator AssetDB 中的唯一标识，可用于运行时 UUID 加载。">UUID</span>
                    <span class="pdpack-value pdpack-mono pdpack-break" id="uuid">-</span>
                </div>
                <div class="pdpack-row">
                    <span class="pdpack-label" title="当前选中 .pdpack 资源的源文件名。">文件</span>
                    <span class="pdpack-value pdpack-mono pdpack-break" id="file">-</span>
                </div>
            </div>

            <div class="pdpack-section">
                <div class="pdpack-section-title">FORMAT</div>
                <div class="pdpack-grid">
                    <div class="pdpack-cell">
                        <span class="pdpack-label" title="PDPK 文件头中的格式版本号。">版本</span>
                        <span class="pdpack-value pdpack-mono" id="version">-</span>
                    </div>
                    <div class="pdpack-cell">
                        <span class="pdpack-label" title="从 .pdpack 内嵌 metadata 解析出的原始画布宽高。">画布</span>
                        <span class="pdpack-value pdpack-mono" id="canvas">-</span>
                    </div>
                    <div class="pdpack-cell">
                        <span class="pdpack-label" title="文件头 flags 的 HAS_ALPHA 标记，表示资源是否包含透明通道。">透明通道</span>
                        <span class="pdpack-value pdpack-mono" id="alpha">-</span>
                    </div>
                    <div class="pdpack-cell">
                        <span class="pdpack-label" title="当前 .pdpack 文件的二进制总大小。">数据大小</span>
                        <span class="pdpack-value pdpack-mono" id="dataSize">-</span>
                    </div>
                </div>
            </div>

            <div class="pdpack-section">
                <div class="pdpack-section-title">VARIANTS</div>
                <div class="pdpack-row">
                    <span class="pdpack-label" title="metadata 中记录的基础图像名称，作为差分合成的底图。">基础图</span>
                    <span class="pdpack-value pdpack-mono pdpack-break" id="base">-</span>
                </div>
                <div class="pdpack-row">
                    <span class="pdpack-label" title="文件头中记录的变体数量。">数量</span>
                    <span class="pdpack-value pdpack-mono" id="variantCount">-</span>
                </div>
                <div class="pdpack-row pdpack-row-block">
                    <span class="pdpack-label" title="metadata 中 variants 字段包含的所有变体名称。">名称</span>
                    <span class="pdpack-value pdpack-mono pdpack-list" id="variantNames">-</span>
                </div>
            </div>
        </div>

        <div class="pdpack-section pdpack-preview-section">
            <div class="pdpack-section-title">PREVIEW</div>
            <div class="pdpack-row">
                <span class="pdpack-label" title="当前预览的基础图或变体。选择变体时会将对应差分区域合成到基础图上。">预览目标</span>
                <select id="variantSelect" class="pdpack-select">
                    <option value="__base__">基础图</option>
                </select>
            </div>
            <div class="pdpack-row">
                <span class="pdpack-label" title="当前预览画面的实际像素尺寸。">预览尺寸</span>
                <span class="pdpack-value pdpack-mono" id="previewSize">-</span>
            </div>
            <div class="pdpack-preview-wrap" title="棋盘格背景用于观察 PNG 透明通道。">
                <canvas id="previewCanvas" class="pdpack-preview-canvas"></canvas>
                <div id="previewEmpty" class="pdpack-preview-empty">暂无预览</div>
            </div>
        </div>
    </div>
`,
    style: `
    .pdpack-inspector {
        padding: 4px 0 8px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        height: calc(100vh - 12px);
        min-height: 420px;
        overflow: hidden;
        color: var(--color-normal-contrast);
        font-size: 12px;
        line-height: 1.45;
    }

    .pdpack-main {
        flex: 1 1 auto;
        min-height: 0;
        overflow: auto;
        padding-right: 4px;
    }

    .pdpack-title {
        margin: 2px 0 8px;
        font-size: 15px;
        font-weight: 600;
        color: var(--color-normal-contrast-emphasis);
    }

    .pdpack-section {
        margin: 8px 0;
        padding: 8px;
        border: 1px solid var(--color-normal-border);
        border-radius: 3px;
        background: var(--color-normal-fill);
    }

    .pdpack-preview-section {
        flex: 0 0 auto;
        z-index: 1;
        margin: 8px 0 0;
        box-shadow: 0 -6px 10px rgba(0, 0, 0, 0.18);
    }

    .pdpack-section-title {
        margin: -2px 0 6px;
        padding-bottom: 4px;
        border-bottom: 1px solid var(--color-normal-border);
        color: var(--color-normal-contrast-weaker);
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.4px;
    }

    .pdpack-row,
    .pdpack-cell {
        display: flex;
        align-items: baseline;
        min-height: 22px;
        gap: 8px;
    }

    .pdpack-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        column-gap: 12px;
        row-gap: 2px;
    }

    .pdpack-label {
        flex: 0 0 76px;
        color: var(--color-normal-contrast-weakest);
        cursor: help;
    }

    .pdpack-cell .pdpack-label {
        flex-basis: 64px;
    }

    .pdpack-value {
        flex: 1 1 auto;
        min-width: 0;
        color: var(--color-normal-contrast-emphasis);
    }

    .pdpack-mono {
        font-family: monospace;
    }

    .pdpack-break {
        overflow-wrap: anywhere;
        word-break: break-word;
    }

    .pdpack-row-block {
        align-items: flex-start;
    }

    .pdpack-list {
        white-space: pre-wrap;
    }

    .pdpack-select {
        flex: 1 1 auto;
        min-width: 0;
        height: 22px;
    }

    .pdpack-preview-wrap {
        position: relative;
        margin-top: 8px;
        min-height: 140px;
        max-height: 45vh;
        overflow: auto;
        border: 1px solid var(--color-normal-border);
        background-color: #808080;
        background-image:
            linear-gradient(45deg, rgba(255,255,255,0.28) 25%, transparent 25%),
            linear-gradient(-45deg, rgba(255,255,255,0.28) 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.28) 75%),
            linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.28) 75%);
        background-position: 0 0, 0 8px, 8px -8px, -8px 0;
        background-size: 16px 16px;
    }

    .pdpack-preview-canvas {
        display: block;
        width: 100%;
        height: auto;
    }

    .pdpack-preview-empty {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 12px;
        color: var(--color-normal-contrast-weakest);
        pointer-events: none;
    }
`,

    $: {
        uuid: "#uuid",
        file: "#file",
        version: "#version",
        canvas: "#canvas",
        alpha: "#alpha",
        dataSize: "#dataSize",
        base: "#base",
        variantCount: "#variantCount",
        variantNames: "#variantNames",
        variantSelect: "#variantSelect",
        previewSize: "#previewSize",
        previewCanvas: "#previewCanvas",
        previewEmpty: "#previewEmpty",
    },

    props: {
        target: {
            twoWay: true,
            type: Object,
            default() {
                return { __dirty__: false };
            },
        },
    },

    data() {
        return {
            pdpackImporter: IMPORTER_TYPE,
            pdpackUuid: "-",
            pdpackInfo: null,
            _pdpackPreview: null,
            _pdpackCurrentVariant: "__base__",
            _pdpackAssetList: null,
            _pdpackMetaList: null,
            _pdpackResolveToken: "",
            _pdpackVariantSelectBound: false,
        };
    },

    ready() {
        bindVariantSelect(this);
        this.refreshUuid();
    },

    init() {
        // Vue 1.x/Cocos Creator 2.4 initializes DOM refs later; ready() refreshes the view.
    },

    update(assetList, metaList) {
        if (assetList !== undefined) {
            this._pdpackAssetList = assetList;
        }

        if (metaList !== undefined) {
            this._pdpackMetaList = metaList;
        }

        this.refreshUuid();
    },

    methods: {
        refreshUuid() {
            this.pdpackImporter = IMPORTER_TYPE;
            this.pdpackUuid = findUuid(this) || "-";
            setUuidText(this, this.pdpackUuid);
            refreshPdpackInfo(this, this.pdpackUuid);
        },
    },
};

if (VueRef && typeof VueRef.component === "function") {
    VueRef.component(COMPONENT_NAME, panel);
}

module.exports = panel;

function findUuid(context) {
    return findUuidInValue(context && context._pdpackAssetList) || findUuidInValue(context && context._pdpackMetaList) || findUuidInValue(context && context.target) || findUuidInSelection() || "";
}

function setUuidText(context, uuid) {
    setFieldText(context, "uuid", uuid);
}

function refreshPdpackInfo(context, uuid) {
    context.pdpackInfo = null;
    clearInfoFields(context);

    if (!isUuid(uuid)) {
        return;
    }

    context._pdpackResolveToken = uuid;
    setFieldText(context, "file", "加载中...");

    resolvePdpackPath(uuid, (filePath) => {
        if (context._pdpackResolveToken !== uuid) return;

        const info = parsePdpackFile(filePath);
        context.pdpackInfo = info;
        renderPdpackInfo(context, filePath, info);
    });
}

function clearInfoFields(context) {
    setFieldText(context, "file", "-");
    setFieldText(context, "version", "-");
    setFieldText(context, "canvas", "-");
    setFieldText(context, "alpha", "-");
    setFieldText(context, "dataSize", "-");
    setFieldText(context, "base", "-");
    setFieldText(context, "variantCount", "-");
    setFieldText(context, "variantNames", "-");
    setFieldText(context, "previewSize", "-");
    clearPreviewCanvas(context);
    populateVariantSelect(context, null);
}

function renderPdpackInfo(context, filePath, info) {
    if (!info) {
        clearInfoFields(context);
        setFieldText(context, "file", filePath || "无法读取 .pdpack");
        return;
    }

    setFieldText(context, "file", formatFileName(filePath));
    setFieldText(context, "version", `v${info.version}`);
    setFieldText(context, "canvas", info.imageWidth && info.imageHeight ? `${info.imageWidth} x ${info.imageHeight} px` : "-");
    setFieldText(context, "alpha", info.flags & 1 ? "是" : "否");
    setFieldText(context, "dataSize", formatBytes(info.dataSize));
    setFieldText(context, "base", info.baseVariantName || "-");
    setFieldText(context, "variantCount", `${info.variantCount}`);
    setFieldText(context, "variantNames", info.variantNames.length > 0 ? info.variantNames.join("\n") : "-");

    context._pdpackPreview = info;
    context._pdpackCurrentVariant = "__base__";
    populateVariantSelect(context, info);
    renderPreview(context, "__base__");
}

function setFieldText(context, field, text) {
    const element = context && context.$el && context.$el[`$${field}`];
    if (!element) return;

    const value = String(text);
    element.textContent = value;
    element.title = value;
}

function bindVariantSelect(context) {
    if (!context || context._pdpackVariantSelectBound || !context.$el || !context.$el.$variantSelect) return;

    context._pdpackVariantSelectBound = true;
    context.$el.$variantSelect.addEventListener("change", () => {
        context._pdpackCurrentVariant = context.$el.$variantSelect.value || "__base__";
        renderPreview(context, context._pdpackCurrentVariant);
    });
}

function populateVariantSelect(context, info) {
    const select = context && context.$el && context.$el.$variantSelect;
    if (!select) return;

    while (select.firstChild) {
        select.removeChild(select.firstChild);
    }

    appendOption(select, "__base__", "基础图", false);

    if (info && Array.isArray(info.variants)) {
        info.variants.forEach((variant) => {
            appendOption(select, variant.name, variant.name, false);
        });
    }

    select.value = "__base__";
}

function appendOption(select, value, text, disabled) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    option.disabled = !!disabled;
    select.appendChild(option);
}

function renderPreview(context, variantName) {
    if (!context || !context._pdpackPreview) {
        clearPreviewCanvas(context);
        return;
    }

    const info = context._pdpackPreview;
    const variant = variantName === "__base__" ? null : findVariant(info, variantName);

    if (variantName !== "__base__" && !variant) {
        clearPreviewCanvas(context);
        setFieldText(context, "previewSize", "未找到变体");
        return;
    }

    renderCompositedPreview(context, info, variant);
}

function renderCompositedPreview(context, info, variant) {
    const canvas = context && context.$el && context.$el.$previewCanvas;
    const empty = context && context.$el && context.$el.$previewEmpty;
    if (!canvas || !info || !info.baseImageUrl) {
        clearPreviewCanvas(context);
        return;
    }

    const token = bumpPreviewRenderToken(context);
    const sources = collectPreviewImageSources(info, variant);

    setFieldText(context, "previewSize", "渲染中...");

    loadImages(sources, (error, loaded) => {
        if (token !== getPreviewRenderToken(context)) return;

        if (error || !loaded || !loaded[0]) {
            clearPreviewCanvas(context);
            setFieldText(context, "previewSize", "预览解码失败");
            return;
        }

        try {
            const baseImage = loaded[0].image;
            const width = info.imageWidth || baseImage.naturalWidth || baseImage.width;
            const height = info.imageHeight || baseImage.naturalHeight || baseImage.height;

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("Canvas 2D context is unavailable");

            ctx.clearRect(0, 0, width, height);

            loaded.forEach((item, index) => {
                const source = item.source;
                const image = item.image;
                if (index === 0) {
                    ctx.drawImage(image, source.x, source.y);
                } else {
                    copyImagePixels(ctx, source, image);
                }
            });

            if (empty) empty.style.display = "none";
            setFieldText(context, "previewSize", `${width} x ${height} px`);
        } catch (e) {
            clearPreviewCanvas(context);
            setFieldText(context, "previewSize", "预览绘制失败");
        }
    });
}

function clearPreviewCanvas(context) {
    if (context) {
        bumpPreviewRenderToken(context);
    }

    const canvas = context && context.$el && context.$el.$previewCanvas;
    const empty = context && context.$el && context.$el.$previewEmpty;

    if (canvas) {
        const ctx = canvas.getContext("2d");
        canvas.width = 1;
        canvas.height = 1;
        if (ctx) ctx.clearRect(0, 0, 1, 1);
    }

    if (empty) empty.style.display = "flex";
}

function collectPreviewImageSources(info, variant) {
    const sources = [{ url: info.baseImageUrl, x: 0, y: 0, width: 0, height: 0 }];

    if (variant && Array.isArray(variant.regions)) {
        variant.regions.forEach((region) => {
            if (!region || !region.imageUrl) return;

            sources.push({
                url: region.imageUrl,
                x: region.x || 0,
                y: region.y || 0,
                width: region.width || 0,
                height: region.height || 0,
            });
        });
    }

    return sources;
}

function loadImages(sources, callback) {
    const loaded = new Array(sources.length);
    let pending = sources.length;
    let firstError = null;

    if (pending === 0) {
        callback(new Error("No preview images"), loaded);
        return;
    }

    sources.forEach((source, index) => {
        const image = new Image();
        let finished = false;

        const finish = (error) => {
            if (finished) return;
            finished = true;

            if (error && !firstError) {
                firstError = error;
            }

            if (!error) {
                loaded[index] = { source, image };
            }

            pending -= 1;
            if (pending === 0) callback(firstError, loaded);
        };

        image.onload = () => {
            finish(null);
        };

        image.onerror = () => {
            finish(new Error("Failed to decode preview image"));
        };

        image.src = source.url;

        if (image.complete && (image.naturalWidth || image.width)) {
            setTimeout(() => finish(null), 0);
        }
    });
}

function findVariant(info, variantName) {
    if (!info || !Array.isArray(info.variants)) return null;

    for (let i = 0; i < info.variants.length; i += 1) {
        if (info.variants[i].name === variantName) return info.variants[i];
    }

    return null;
}

function copyImagePixels(targetCtx, source, image) {
    const width = source.width || image.naturalWidth || image.width;
    const height = source.height || image.naturalHeight || image.height;
    if (!width || !height) return;

    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);

    targetCtx.putImageData(ctx.getImageData(0, 0, width, height), source.x, source.y);
}

function bumpPreviewRenderToken(context) {
    const holder = getPreviewStateHolder(context);
    if (!holder) return 0;

    holder.__pdpackPreviewRenderToken = (holder.__pdpackPreviewRenderToken || 0) + 1;
    return holder.__pdpackPreviewRenderToken;
}

function getPreviewRenderToken(context) {
    const holder = getPreviewStateHolder(context);
    return holder ? holder.__pdpackPreviewRenderToken || 0 : 0;
}

function getPreviewStateHolder(context) {
    return context && context.$el ? context.$el : context || null;
}

function resolvePdpackPath(uuid, callback) {
    const syncPath = uuidToFspath(uuid);
    if (isPdpackFile(syncPath)) {
        callback(syncPath);
        return;
    }

    if (!EditorRef || !EditorRef.assetdb || typeof EditorRef.assetdb.queryPathByUuid !== "function") {
        callback("");
        return;
    }

    EditorRef.assetdb.queryPathByUuid(uuid, (err, filePath) => {
        if (err || !filePath) {
            callback("");
            return;
        }

        callback(filePath);
    });
}

function uuidToFspath(uuid) {
    if (!EditorRef || !EditorRef.assetdb || typeof EditorRef.assetdb.uuidToFspath !== "function") return "";

    try {
        return EditorRef.assetdb.uuidToFspath(uuid) || "";
    } catch (e) {
        return "";
    }
}

function parsePdpackFile(filePath) {
    if (!isPdpackFile(filePath)) return null;

    try {
        const buffer = Fs.readFileSync(filePath);
        if (buffer.length < 24 || buffer.toString("ascii", 0, 4) !== "PDPK") {
            return null;
        }

        const version = buffer.readUInt16BE(4);
        const flags = buffer.readUInt16BE(6);
        const variantCount = buffer.readUInt16BE(8);
        const offsetTablePtr = buffer.readUInt32BE(10);
        const info = {
            version,
            flags,
            variantCount,
            imageWidth: 0,
            imageHeight: 0,
            baseVariantName: "",
            variantNames: [],
            baseImageUrl: "",
            basePngSize: 0,
            variants: [],
            dataSize: buffer.length,
        };

        if (offsetTablePtr + 16 > buffer.length) {
            return info;
        }

        const baseOffset = buffer.readUInt32BE(offsetTablePtr);
        const baseSize = buffer.readUInt32BE(offsetTablePtr + 4);
        if (baseOffset + baseSize <= buffer.length) {
            const basePngBytes = buffer.slice(baseOffset, baseOffset + baseSize);
            info.baseImageUrl = `data:image/png;base64,${basePngBytes.toString("base64")}`;
            info.basePngSize = baseSize;
        }

        const metaOffset = buffer.readUInt32BE(offsetTablePtr + 8);
        const metaSize = buffer.readUInt32BE(offsetTablePtr + 12);
        if (metaOffset + metaSize > buffer.length) {
            return info;
        }

        const metadata = JSON.parse(buffer.toString("utf8", metaOffset, metaOffset + metaSize));
        const base = metadata.base && typeof metadata.base === "object" ? metadata.base : null;

        info.imageWidth = metadata.width !== undefined ? metadata.width : base && base.width !== undefined ? base.width : 0;
        info.imageHeight = metadata.height !== undefined ? metadata.height : base && base.height !== undefined ? base.height : 0;
        info.baseVariantName = typeof metadata.base === "string" ? metadata.base : base && typeof base.name === "string" ? base.name : "";
        info.variantNames = metadata.variants && typeof metadata.variants === "object" ? Object.keys(metadata.variants) : [];
        info.variants = parseVariantOffsetTable(buffer, offsetTablePtr, variantCount, metadata);

        return info;
    } catch (e) {
        return null;
    }
}

function parseVariantOffsetTable(buffer, offsetTablePtr, variantCount, metadata) {
    const variants = [];
    const metaVariants = collectVariantMetadata(metadata);
    let cursor = offsetTablePtr + 16;

    for (let vi = 0; vi < variantCount; vi += 1) {
        if (cursor + 2 > buffer.length) break;

        const regionCount = buffer.readUInt16BE(cursor);
        cursor += 2;

        const metaVariant = metaVariants[vi] || { name: String(vi), regions: [] };
        const regions = [];

        for (let ri = 0; ri < regionCount; ri += 1) {
            if (cursor + 8 > buffer.length) break;

            const offset = buffer.readUInt32BE(cursor);
            const size = buffer.readUInt32BE(cursor + 4);
            cursor += 8;

            const metaRegion = metaVariant.regions[ri] || {};
            regions.push({
                x: metaRegion.x || 0,
                y: metaRegion.y || 0,
                width: metaRegion.width !== undefined ? metaRegion.width : metaRegion.w || 0,
                height: metaRegion.height !== undefined ? metaRegion.height : metaRegion.h || 0,
                offset,
                size,
                imageUrl: offset + size <= buffer.length ? `data:image/png;base64,${buffer.slice(offset, offset + size).toString("base64")}` : "",
            });
        }

        variants.push({
            name: metaVariant.name,
            regions,
        });
    }

    return variants;
}

function collectVariantMetadata(metadata) {
    const variants = [];
    if (!metadata || !metadata.variants || typeof metadata.variants !== "object") {
        return variants;
    }

    Object.keys(metadata.variants).forEach((name) => {
        const value = metadata.variants[name];
        const regions = Array.isArray(value) ? value : value && Array.isArray(value.regions) ? value.regions : [];
        variants.push({ name, regions });
    });

    return variants;
}

function findUuidInValue(value) {
    value = unwrapDumpValue(value);
    if (!value) return "";

    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i += 1) {
            const uuid = findUuidInValue(value[i]);
            if (uuid) return uuid;
        }
        return "";
    }

    if (typeof value === "string") {
        return isUuid(value) ? value : "";
    }

    if (typeof value !== "object") {
        return "";
    }

    return (
        readValue(value, "uuid") ||
        readValue(value, "assetUuid") ||
        findUuidInValue(readValue(value, "asset")) ||
        findUuidInValue(readValue(value, "meta")) ||
        findUuidInValue(readValue(value, "assetList")) ||
        findUuidInValue(readValue(value, "metaList")) ||
        ""
    );
}

function findUuidInSelection() {
    const selection = EditorRef && EditorRef.Selection;
    if (!selection) return "";

    const methods = ["curActivate", "curSelection", "curGlobalSelection"];
    for (let i = 0; i < methods.length; i += 1) {
        const method = methods[i];
        if (typeof selection[method] !== "function") continue;

        try {
            const uuid = findUuidInValue(selection[method]("asset"));
            if (uuid) return uuid;
        } catch (e) {}
    }

    return "";
}

function readValue(source, key) {
    source = unwrapDumpValue(source);
    if (!source || typeof source !== "object") return "";

    return unwrapDumpValue(source[key]);
}

function unwrapDumpValue(value) {
    if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "value")) {
        return value.value;
    }

    return value;
}

function isUuid(value) {
    return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isPdpackFile(filePath) {
    return !!filePath && typeof filePath === "string" && /\.pdpack$/i.test(filePath) && Fs && Fs.existsSync(filePath);
}

function formatFileName(filePath) {
    if (!filePath) return "-";
    if (!Path) return filePath;

    return Path.basename(filePath);
}

function formatBytes(size) {
    if (size === undefined || size === null || size === "") return "-";

    const units = ["B", "KB", "MB", "GB"];
    let value = Number(size);
    let index = 0;

    while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index += 1;
    }

    return `${index === 0 ? value : value.toFixed(2).replace(/\.00$/, "")} ${units[index]}`;
}

function tryRequire(name) {
    try {
        return require(name);
    } catch (e) {
        return null;
    }
}
