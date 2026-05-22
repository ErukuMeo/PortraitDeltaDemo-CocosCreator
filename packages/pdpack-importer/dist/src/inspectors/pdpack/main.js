"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const IMPORTER_TYPE = "pdpack";
const COMPONENT_NAME = "pdpack";
const PREVIEW_MIN_SCALE = 1;
const PREVIEW_MAX_SCALE = 4;
const Fs = tryRequire("fire-fs") || tryRequire("fs");
const Path = tryRequire("fire-path") || tryRequire("path");
const PdpackCore = require("../../../runtime-resource/runtime/core/PdpackCore");
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
                    <span class="pdpack-label" title="metadata 中记录的默认变体名称。">默认变体</span>
                    <span class="pdpack-value pdpack-mono pdpack-break" id="defaultVariant">-</span>
                </div>
                <div class="pdpack-row">
                    <span class="pdpack-label" title="文件头中记录的变体数量，包含默认变体。">数量</span>
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
                <span class="pdpack-label" title="当前预览的变体。默认变体和其他变体使用同一套变体选择逻辑。">预览目标</span>
                <select id="variantSelect" class="pdpack-select"></select>
            </div>
            <div class="pdpack-row">
                <span class="pdpack-label" title="当前预览画面的实际像素尺寸。">预览尺寸</span>
                <span class="pdpack-value pdpack-mono" id="previewSize">-</span>
            </div>
            <div class="pdpack-row">
                <span class="pdpack-label" title="当前 Canvas 预览缩放比例，滚轮可缩放，范围限制在 100% 到 300% 之间。">缩放</span>
                <span class="pdpack-value pdpack-mono" id="previewZoom">-</span>
            </div>
            <div id="previewWrap" class="pdpack-preview-wrap" title="滚轮缩放，拖拽移动；棋盘格背景用于观察 PNG 透明通道。">
                <canvas id="previewCanvas" class="pdpack-preview-canvas"></canvas>
                <div id="previewEmpty" class="pdpack-preview-empty">暂无预览</div>
            </div>
        </div>
    </div>
`,
    style: `
    .pdpack-inspector {
        padding: 4px 0 0;
        box-sizing: border-box;
        min-height: 100vh;
        color: var(--color-normal-contrast);
        font-size: 12px;
        line-height: 1.45;
    }

    .pdpack-main {
        box-sizing: border-box;
        min-height: 100vh;
        padding-bottom: calc(46vh + 88px);
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
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 20;
        box-sizing: border-box;
        margin: 0;
        max-height: calc(100vh - 16px);
        overflow: hidden;
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
        height: calc(54vh - 106px);
        min-height: 256px;
        max-height: 420px;
        overflow: hidden;
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
        height: 100%;
        cursor: grab;
    }

    .pdpack-preview-canvas.is-dragging {
        cursor: grabbing;
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
        defaultVariant: "#defaultVariant",
        variantCount: "#variantCount",
        variantNames: "#variantNames",
        variantSelect: "#variantSelect",
        previewSize: "#previewSize",
        previewZoom: "#previewZoom",
        previewWrap: "#previewWrap",
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
            _pdpackCurrentVariant: "",
            _pdpackAssetList: null,
            _pdpackMetaList: null,
            _pdpackResolveToken: "",
            _pdpackVariantSelectBound: false,
        };
    },
    ready() {
        bindVariantSelect(this);
        bindPreviewCanvasInteractions(this);
        bindSelectionRefresh(this);
        scheduleRefresh(this);
    },
    init() {
        // Vue 1.x/Cocos Creator 2.4 initializes DOM refs later; ready() refreshes the view.
    },
    beforeDestroy() {
        unbindPreviewCanvasInteractions(this);
        unbindSelectionRefresh(this);
    },
    detached() {
        unbindPreviewCanvasInteractions(this);
        unbindSelectionRefresh(this);
    },
    update(assetList, metaList) {
        if (assetList !== undefined) {
            this._pdpackAssetList = assetList;
        }
        if (metaList !== undefined) {
            this._pdpackMetaList = metaList;
        }
        scheduleRefresh(this, findUuidInValue(assetList) || findUuidInValue(metaList));
    },
    methods: {
        refreshUuid(preferredUuid) {
            this.pdpackImporter = IMPORTER_TYPE;
            this.pdpackUuid = preferredUuid || findUuid(this) || "-";
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
    return findUuidInValue(context && context.target) || findUuidInSelection() || findUuidInValue(context && context._pdpackAssetList) || findUuidInValue(context && context._pdpackMetaList) || "";
}
function setUuidText(context, uuid) {
    setFieldText(context, "uuid", uuid);
}
function scheduleRefresh(context, preferredUuid) {
    const holder = getPanelStateHolder(context);
    if (!holder) {
        if (context && typeof context.refreshUuid === "function") {
            context.refreshUuid(preferredUuid);
        }
        return;
    }
    holder.__pdpackRefreshToken = (holder.__pdpackRefreshToken || 0) + 1;
    markPreferredRefresh(context, preferredUuid);
    const token = holder.__pdpackRefreshToken;
    setTimeout(() => {
        if (token !== holder.__pdpackRefreshToken)
            return;
        context.refreshUuid(preferredUuid);
    }, 0);
    setTimeout(() => {
        if (token !== holder.__pdpackRefreshToken)
            return;
        const liveUuid = findLiveUuid(context);
        if (shouldIgnoreLiveUuid(context, liveUuid))
            return;
        if (liveUuid && liveUuid !== context.pdpackUuid) {
            context.refreshUuid(liveUuid);
        }
        else if (!context.pdpackUuid || context.pdpackUuid === "-") {
            context.refreshUuid(preferredUuid);
        }
    }, 80);
}
function bindSelectionRefresh(context) {
    const holder = getPanelStateHolder(context);
    if (!holder || holder.__pdpackSelectionTimer)
        return;
    holder.__pdpackSelectionTimer = setInterval(() => {
        if (!isElementAttached(context && context.$el)) {
            unbindSelectionRefresh(context);
            return;
        }
        const uuid = findLiveUuid(context);
        if (!uuid || uuid === context.pdpackUuid)
            return;
        if (shouldIgnoreLiveUuid(context, uuid))
            return;
        context.refreshUuid(uuid);
    }, 250);
}
function unbindSelectionRefresh(context) {
    const holder = getPanelStateHolder(context);
    if (!holder || !holder.__pdpackSelectionTimer)
        return;
    clearInterval(holder.__pdpackSelectionTimer);
    holder.__pdpackSelectionTimer = null;
}
function findLiveUuid(context) {
    return findUuidInValue(context && context.target) || findUuidInSelection() || "";
}
function markPreferredRefresh(context, uuid) {
    if (!isUuid(uuid))
        return;
    const holder = getPanelStateHolder(context);
    if (!holder)
        return;
    holder.__pdpackPreferredUuid = uuid;
    holder.__pdpackPreferredUntil = Date.now() + 600;
}
function shouldIgnoreLiveUuid(context, liveUuid) {
    const holder = getPanelStateHolder(context);
    if (!holder || !isUuid(liveUuid))
        return false;
    return context.pdpackUuid === holder.__pdpackPreferredUuid && liveUuid !== holder.__pdpackPreferredUuid && Date.now() < holder.__pdpackPreferredUntil;
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
        if (context._pdpackResolveToken !== uuid)
            return;
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
    setFieldText(context, "defaultVariant", "-");
    setFieldText(context, "variantCount", "-");
    setFieldText(context, "variantNames", "-");
    setFieldText(context, "previewSize", "-");
    setFieldText(context, "previewZoom", "-");
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
    setFieldText(context, "defaultVariant", info.defaultVariantName || "-");
    setFieldText(context, "variantCount", `${info.variantCount}`);
    setFieldText(context, "variantNames", info.variantNames.length > 0 ? info.variantNames.join("\n") : "-");
    context._pdpackPreview = info;
    context._pdpackCurrentVariant = getInitialVariantName(info);
    populateVariantSelect(context, info, context._pdpackCurrentVariant);
    renderPreview(context, context._pdpackCurrentVariant);
}
function setFieldText(context, field, text) {
    const element = context && context.$el && context.$el[`$${field}`];
    if (!element)
        return;
    const value = String(text);
    element.textContent = value;
    element.title = value;
}
function bindVariantSelect(context) {
    if (!context || context._pdpackVariantSelectBound || !context.$el || !context.$el.$variantSelect)
        return;
    context._pdpackVariantSelectBound = true;
    context.$el.$variantSelect.addEventListener("change", () => {
        context._pdpackCurrentVariant = context.$el.$variantSelect.value || "";
        renderPreview(context, context._pdpackCurrentVariant);
    });
}
function bindPreviewCanvasInteractions(context) {
    const canvas = context && context.$el && context.$el.$previewCanvas;
    const holder = getPreviewStateHolder(context);
    if (!canvas || !holder || holder.__pdpackPreviewEvents)
        return;
    const onWheel = (event) => {
        const state = getPreviewState(context);
        if (!state || !state.sourceCanvas || !state.view)
            return;
        if (event && typeof event.preventDefault === "function")
            event.preventDefault();
        const point = getCanvasPoint(canvas, event);
        const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
        zoomPreviewAt(context, point.x, point.y, factor);
    };
    const onMouseDown = (event) => {
        const state = getPreviewState(context);
        if (!state || !state.sourceCanvas || !state.view || event.button !== 0)
            return;
        if (event && typeof event.preventDefault === "function")
            event.preventDefault();
        state.dragging = true;
        state.dragX = event.clientX;
        state.dragY = event.clientY;
        if (canvas.classList)
            canvas.classList.add("is-dragging");
    };
    const onMouseMove = (event) => {
        const state = getPreviewState(context);
        if (!state || !state.dragging || !state.view)
            return;
        const viewport = getPreviewViewportSize(context);
        state.view.x += event.clientX - state.dragX;
        state.view.y += event.clientY - state.dragY;
        state.dragX = event.clientX;
        state.dragY = event.clientY;
        state.view = clampPreviewView(state.view, state.imageWidth, state.imageHeight, viewport);
        drawPreviewViewport(context);
    };
    const onMouseUp = () => {
        const state = getPreviewState(context);
        if (state)
            state.dragging = false;
        if (canvas.classList)
            canvas.classList.remove("is-dragging");
    };
    const onResize = () => {
        drawPreviewViewport(context);
    };
    canvas.addEventListener("wheel", onWheel, false);
    canvas.addEventListener("mousedown", onMouseDown, false);
    if (typeof document !== "undefined") {
        document.addEventListener("mousemove", onMouseMove, false);
        document.addEventListener("mouseup", onMouseUp, false);
    }
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
        window.addEventListener("resize", onResize, false);
    }
    holder.__pdpackPreviewEvents = {
        canvas,
        onWheel,
        onMouseDown,
        onMouseMove,
        onMouseUp,
        onResize,
    };
}
function unbindPreviewCanvasInteractions(context) {
    const holder = getPreviewStateHolder(context);
    const events = holder && holder.__pdpackPreviewEvents;
    if (!events)
        return;
    events.canvas.removeEventListener("wheel", events.onWheel, false);
    events.canvas.removeEventListener("mousedown", events.onMouseDown, false);
    if (typeof document !== "undefined") {
        document.removeEventListener("mousemove", events.onMouseMove, false);
        document.removeEventListener("mouseup", events.onMouseUp, false);
    }
    if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
        window.removeEventListener("resize", events.onResize, false);
    }
    holder.__pdpackPreviewEvents = null;
}
function populateVariantSelect(context, info, selectedVariantName = "") {
    const select = context && context.$el && context.$el.$variantSelect;
    if (!select)
        return;
    while (select.firstChild) {
        select.removeChild(select.firstChild);
    }
    if (info && Array.isArray(info.variants)) {
        info.variants.forEach((variant) => {
            appendOption(select, variant.name, variant.name, false);
        });
    }
    select.value = selectedVariantName || getInitialVariantName(info);
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
    const variant = findVariant(info, variantName);
    if (!variant) {
        clearPreviewCanvas(context);
        setFieldText(context, "previewSize", "未找到变体");
        return;
    }
    renderCompositedPreview(context, info, variant);
}
function renderCompositedPreview(context, info, variant) {
    const canvas = context && context.$el && context.$el.$previewCanvas;
    const empty = context && context.$el && context.$el.$previewEmpty;
    if (!canvas || !info || !info.defaultVariantImageUrl) {
        clearPreviewCanvas(context);
        return;
    }
    const token = bumpPreviewRenderToken(context);
    const sources = collectPreviewImageSources(info, variant);
    setFieldText(context, "previewSize", "渲染中...");
    loadImages(sources, (error, loaded) => {
        if (token !== getPreviewRenderToken(context))
            return;
        if (error || !loaded || !loaded[0]) {
            clearPreviewCanvas(context);
            setFieldText(context, "previewSize", "预览解码失败");
            return;
        }
        try {
            const defaultVariantImage = loaded[0].image;
            const width = info.imageWidth || defaultVariantImage.naturalWidth || defaultVariantImage.width;
            const height = info.imageHeight || defaultVariantImage.naturalHeight || defaultVariantImage.height;
            const sourceCanvas = document.createElement("canvas");
            sourceCanvas.width = width;
            sourceCanvas.height = height;
            const ctx = sourceCanvas.getContext("2d");
            if (!ctx)
                throw new Error("Canvas 2D context is unavailable");
            ctx.clearRect(0, 0, width, height);
            loaded.forEach((item, index) => {
                const source = item.source;
                const image = item.image;
                if (index === 0) {
                    ctx.drawImage(image, source.x, source.y);
                }
                else {
                    copyImagePixels(ctx, source, image);
                }
            });
            setPreviewSourceCanvas(context, sourceCanvas, width, height);
            if (empty)
                empty.style.display = "none";
        }
        catch (e) {
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
    const state = getPreviewState(context);
    if (state) {
        state.sourceCanvas = null;
        state.imageWidth = 0;
        state.imageHeight = 0;
        state.view = null;
        state.dragging = false;
    }
    if (canvas) {
        const ctx = canvas.getContext("2d");
        canvas.width = 1;
        canvas.height = 1;
        if (ctx)
            ctx.clearRect(0, 0, 1, 1);
        if (canvas.classList)
            canvas.classList.remove("is-dragging");
    }
    if (empty)
        empty.style.display = "flex";
}
function collectPreviewImageSources(info, variant) {
    const sources = [{ url: info.defaultVariantImageUrl, x: 0, y: 0, width: 0, height: 0 }];
    if (variant && Array.isArray(variant.regions)) {
        variant.regions.forEach((region) => {
            if (!region || !region.imageUrl)
                return;
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
        const timer = setTimeout(() => {
            finish(new Error("Preview image decode timeout"));
        }, 5000);
        const finish = (error) => {
            if (finished)
                return;
            finished = true;
            clearTimeout(timer);
            if (error && !firstError) {
                firstError = error;
            }
            if (!error) {
                loaded[index] = { source, image };
            }
            pending -= 1;
            if (pending === 0)
                callback(firstError, loaded);
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
function getInitialVariantName(info) {
    if (!info)
        return "";
    return info.defaultVariantName || "";
}
function findVariant(info, variantName) {
    if (!info || !Array.isArray(info.variants))
        return null;
    for (let i = 0; i < info.variants.length; i += 1) {
        if (info.variants[i].name === variantName)
            return info.variants[i];
    }
    return null;
}
function copyImagePixels(targetCtx, source, image) {
    const width = source.width || image.naturalWidth || image.width;
    const height = source.height || image.naturalHeight || image.height;
    if (!width || !height)
        return;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx)
        return;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    targetCtx.putImageData(ctx.getImageData(0, 0, width, height), source.x, source.y);
}
function setPreviewSourceCanvas(context, sourceCanvas, imageWidth, imageHeight) {
    const state = getPreviewState(context);
    if (!state || !sourceCanvas || !imageWidth || !imageHeight)
        return;
    const previousView = state.view && state.imageWidth === imageWidth && state.imageHeight === imageHeight ? state.view : null;
    const viewport = getPreviewViewportSize(context);
    state.sourceCanvas = sourceCanvas;
    state.imageWidth = imageWidth;
    state.imageHeight = imageHeight;
    state.view = previousView ? clampPreviewView(previousView, imageWidth, imageHeight, viewport) : createInitialPreviewView(imageWidth, imageHeight, viewport);
    state.dragging = false;
    drawPreviewViewport(context);
}
function drawPreviewViewport(context) {
    const state = getPreviewState(context);
    const canvas = context && context.$el && context.$el.$previewCanvas;
    const empty = context && context.$el && context.$el.$previewEmpty;
    if (!state || !state.sourceCanvas || !canvas)
        return;
    const viewport = getPreviewViewportSize(context);
    const dpr = getDevicePixelRatio();
    const pixelWidth = Math.max(1, Math.floor(viewport.width * dpr));
    const pixelHeight = Math.max(1, Math.floor(viewport.height * dpr));
    if (canvas.width !== pixelWidth)
        canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight)
        canvas.height = pixelHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx)
        return;
    state.view = clampPreviewView(state.view || createInitialPreviewView(state.imageWidth, state.imageHeight, viewport), state.imageWidth, state.imageHeight, viewport);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewport.width, viewport.height);
    ctx.imageSmoothingEnabled = true;
    const drawScale = getPreviewDrawScale(state, viewport);
    ctx.drawImage(state.sourceCanvas, state.view.x, state.view.y, state.imageWidth * drawScale, state.imageHeight * drawScale);
    if (empty)
        empty.style.display = "none";
    setFieldText(context, "previewSize", `${state.imageWidth} x ${state.imageHeight} px`);
    setFieldText(context, "previewZoom", formatPreviewZoom(state));
}
function zoomPreviewAt(context, viewportX, viewportY, factor) {
    const state = getPreviewState(context);
    if (!state || !state.view || !state.sourceCanvas)
        return;
    const range = getPreviewScaleRange(state.imageWidth, state.imageHeight);
    const viewport = getPreviewViewportSize(context);
    const oldScale = state.view.scale;
    const scale = clamp(oldScale * factor, range.min, range.max);
    if (scale === oldScale)
        return;
    const oldDrawScale = getPreviewDrawScale(state, viewport);
    const imageX = (viewportX - state.view.x) / oldDrawScale;
    const imageY = (viewportY - state.view.y) / oldDrawScale;
    const nextDrawScale = getPreviewDrawScale({ imageWidth: state.imageWidth, imageHeight: state.imageHeight, view: { scale } }, viewport);
    state.view = clampPreviewView({
        scale,
        x: viewportX - imageX * nextDrawScale,
        y: viewportY - imageY * nextDrawScale,
    }, state.imageWidth, state.imageHeight, viewport);
    drawPreviewViewport(context);
}
function createInitialPreviewView(imageWidth, imageHeight, viewport) {
    return clampPreviewView({
        scale: 1,
        x: 0,
        y: 0,
    }, imageWidth, imageHeight, viewport);
}
function clampPreviewView(view, imageWidth, imageHeight, viewport) {
    const range = getPreviewScaleRange(imageWidth, imageHeight);
    const scale = clamp(view && view.scale ? view.scale : range.max, range.min, range.max);
    const drawScale = getPreviewDrawScale({ imageWidth, imageHeight, view: { scale } }, viewport);
    const displayWidth = imageWidth * drawScale;
    const displayHeight = imageHeight * drawScale;
    let x = view && isFinite(view.x) ? view.x : 0;
    let y = view && isFinite(view.y) ? view.y : 0;
    if (displayWidth <= viewport.width) {
        x = (viewport.width - displayWidth) / 2;
    }
    else {
        x = clamp(x, viewport.width - displayWidth, 0);
    }
    if (displayHeight <= viewport.height) {
        y = (viewport.height - displayHeight) / 2;
    }
    else {
        y = clamp(y, viewport.height - displayHeight, 0);
    }
    return { scale, x, y };
}
function getPreviewScaleRange(imageWidth, imageHeight) {
    if (!imageWidth || !imageHeight) {
        return { min: PREVIEW_MIN_SCALE, max: PREVIEW_MIN_SCALE };
    }
    return {
        min: PREVIEW_MIN_SCALE,
        max: PREVIEW_MAX_SCALE,
    };
}
function getPreviewDrawScale(state, viewport) {
    return getPreviewFitScale(state.imageWidth, state.imageHeight, viewport) * state.view.scale;
}
function getPreviewFitScale(imageWidth, imageHeight, viewport) {
    if (!imageWidth || !imageHeight || !viewport || !viewport.width || !viewport.height)
        return 1;
    return Math.min(1, viewport.width / imageWidth, viewport.height / imageHeight);
}
function getPreviewViewportSize(context) {
    const canvas = context && context.$el && context.$el.$previewCanvas;
    const wrap = (context && context.$el && context.$el.$previewWrap) || (canvas && canvas.parentElement);
    const rect = wrap && typeof wrap.getBoundingClientRect === "function" ? wrap.getBoundingClientRect() : null;
    const width = Math.floor((rect && rect.width) || (wrap && wrap.clientWidth) || (canvas && canvas.clientWidth) || 256);
    const height = Math.floor((rect && rect.height) || (wrap && wrap.clientHeight) || (canvas && canvas.clientHeight) || 256);
    return {
        width: Math.max(1, width),
        height: Math.max(1, height),
    };
}
function getCanvasPoint(canvas, event) {
    const rect = canvas && typeof canvas.getBoundingClientRect === "function" ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
    };
}
function getPreviewState(context) {
    const holder = getPreviewStateHolder(context);
    if (!holder)
        return null;
    if (!holder.__pdpackPreviewState) {
        holder.__pdpackPreviewState = {
            sourceCanvas: null,
            imageWidth: 0,
            imageHeight: 0,
            view: null,
            dragging: false,
            dragX: 0,
            dragY: 0,
        };
    }
    return holder.__pdpackPreviewState;
}
function formatPreviewZoom(state) {
    return `${Math.round(state.view.scale * 100)}%`;
}
function getDevicePixelRatio() {
    return typeof window !== "undefined" && window.devicePixelRatio ? window.devicePixelRatio : 1;
}
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
function bumpPreviewRenderToken(context) {
    const holder = getPreviewStateHolder(context);
    if (!holder)
        return 0;
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
function getPanelStateHolder(context) {
    return context && context.$el ? context.$el : context || null;
}
function isElementAttached(element) {
    if (!element)
        return false;
    if (element.isConnected !== undefined)
        return !!element.isConnected;
    if (typeof document === "undefined" || !document.body || typeof document.body.contains !== "function")
        return true;
    return document.body.contains(element);
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
    if (!EditorRef || !EditorRef.assetdb || typeof EditorRef.assetdb.uuidToFspath !== "function")
        return "";
    try {
        return EditorRef.assetdb.uuidToFspath(uuid) || "";
    }
    catch (e) {
        return "";
    }
}
function parsePdpackFile(filePath) {
    if (!isPdpackFile(filePath))
        return null;
    try {
        const buffer = Fs.readFileSync(filePath);
        const container = PdpackCore.parseContainer(buffer);
        const defaultVariant = findVariant(container, container.baseVariantName);
        if (!container.baseVariantName) {
            throw new Error("default variant name is missing");
        }
        if (!defaultVariant) {
            throw new Error(`default variant '${container.baseVariantName}' is not listed in variants`);
        }
        if (defaultVariant.regions.length !== 0) {
            throw new Error(`default variant '${container.baseVariantName}' must have an empty diff`);
        }
        return {
            version: container.header.version,
            flags: container.header.flags,
            variantCount: container.variants.length,
            imageWidth: container.imageWidth,
            imageHeight: container.imageHeight,
            defaultVariantName: container.baseVariantName,
            variantNames: container.variantNames,
            defaultVariantImageUrl: pngBytesToDataUrl(container.basePngBytes),
            defaultVariantPngSize: container.basePngSize,
            variants: container.variants.map((variant) => ({
                name: variant.name,
                regions: variant.regions.map((region) => ({
                    x: region.x,
                    y: region.y,
                    width: region.width,
                    height: region.height,
                    offset: region.offset,
                    size: region.size,
                    imageUrl: pngBytesToDataUrl(region.pngBytes),
                })),
            })),
            dataSize: container.header.dataSize,
        };
    }
    catch (e) {
        if (EditorRef && typeof EditorRef.error === "function") {
            EditorRef.error(`[pdpack-importer] Failed to parse '${filePath}':`, e.stack || e.message || e);
        }
        return null;
    }
}
function pngBytesToDataUrl(bytes) {
    if (typeof Buffer === "undefined") {
        throw new Error("Buffer is required to build pdpack preview data URLs");
    }
    return `data:image/png;base64,${Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64")}`;
}
function findUuidInValue(value) {
    value = unwrapDumpValue(value);
    if (!value)
        return "";
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i += 1) {
            const uuid = findUuidInValue(value[i]);
            if (uuid)
                return uuid;
        }
        return "";
    }
    if (typeof value === "string") {
        return isUuid(value) ? value : "";
    }
    if (typeof value !== "object") {
        return "";
    }
    return (readValue(value, "uuid") ||
        readValue(value, "assetUuid") ||
        findUuidInValue(readValue(value, "asset")) ||
        findUuidInValue(readValue(value, "meta")) ||
        findUuidInValue(readValue(value, "assetList")) ||
        findUuidInValue(readValue(value, "metaList")) ||
        "");
}
function findUuidInSelection() {
    const selection = EditorRef && EditorRef.Selection;
    if (!selection)
        return "";
    const methods = ["curActivate", "curSelection", "curGlobalSelection"];
    for (let i = 0; i < methods.length; i += 1) {
        const method = methods[i];
        if (typeof selection[method] !== "function")
            continue;
        try {
            const uuid = findUuidInValue(selection[method]("asset"));
            if (uuid)
                return uuid;
        }
        catch (e) { }
    }
    return "";
}
function readValue(source, key) {
    source = unwrapDumpValue(source);
    if (!source || typeof source !== "object")
        return "";
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
    if (!filePath)
        return "-";
    if (!Path)
        return filePath;
    return Path.basename(filePath);
}
function formatBytes(size) {
    if (size === undefined || size === null || size === "")
        return "-";
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
    }
    catch (e) {
        return null;
    }
}
