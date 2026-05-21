"use strict";

const IMPORTER_TYPE = "pdpack";
const COMPONENT_NAME = "pdpack";
const EditorRef = typeof Editor !== "undefined" ? Editor : null;
const VueRef = typeof globalThis !== "undefined" ? globalThis.Vue : typeof Vue !== "undefined" ? Vue : null;

const panel = {
    template: `
    <h2>Portrait Delta Pack</h2>
    <div>UUID: <span id="uuid">-</span></div>
`,

    $: {
        uuid: "#uuid",
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
            _pdpackAssetList: null,
            _pdpackMetaList: null,
        };
    },

    ready() {
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
    const uuidElement = context && context.$el && context.$el.$uuid;
    if (!uuidElement) return;

    uuidElement.textContent = uuid;
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
