"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Fs = require("fire-fs");
const Path = require("fire-path");
let PdPackMeta = null;
let registered = false;
let refreshedExistingAssets = false;
let refreshQueued = false;
let loggedWaitingForCustomAsset = false;
let loggedWaitingForAssetDb = false;
let loggedWaitingForRefresh = false;
let loggedInspectorLoadFailure = false;
const META_KEY = "pdpack";
const META_ALIASES = [META_KEY, "cc.PdPackAsset"];
const ASSETS_URL = "db://assets";
function getPdPackMeta() {
    if (!PdPackMeta) {
        PdPackMeta = require("./meta");
    }
    return PdPackMeta;
}
function loadInspectorTemplate() {
    try {
        require("./inspectors/pdpack/main");
    }
    catch (e) {
        if (!loggedInspectorLoadFailure) {
            Editor.warn("[pdpack-importer] Failed to load pdpack inspector template:", e.stack || e.message || e);
            loggedInspectorLoadFailure = true;
        }
    }
}
function registerMeta() {
    if (registered)
        return true;
    if (!Editor.metas["custom-asset"]) {
        if (!loggedWaitingForCustomAsset) {
            Editor.warn("[pdpack-importer] custom-asset meta is not ready; waiting for AssetDB.");
            loggedWaitingForCustomAsset = true;
        }
        return false;
    }
    const Meta = getPdPackMeta();
    // META_ALIASES.forEach((key) => {
    //     // { "mount": { "asset-icon": "unpack://static/icon/assets/mount.png"}}
    //     Editor.metas[key] = Meta;
    // });
    Editor.metas[META_KEY] = Meta; // Ensure the main key is set for AssetDB recognition
    Editor.log(JSON.stringify(Editor.metas));
    if (!Editor.assetdb || typeof Editor.assetdb.register !== "function") {
        if (!loggedWaitingForAssetDb) {
            Editor.warn("[pdpack-importer] Editor.assetdb.register is not ready; waiting for AssetDB.");
            loggedWaitingForAssetDb = true;
        }
        return false;
    }
    Editor.assetdb.register(".pdpack", false, Meta);
    registered = true;
    Editor.log("[pdpack-importer] .pdpack AssetDB importer registered");
    // 注册后立即刷新现有资产，以确保它们被正确识别和处理
    refreshExistingPdpackAssets("registering .pdpack importer");
    return true;
}
function unregisterMeta() {
    if (!registered || !PdPackMeta)
        return;
    if (Editor.assetdb && typeof Editor.assetdb.unregister === "function") {
        Editor.assetdb.unregister(PdPackMeta);
    }
    META_ALIASES.forEach((key) => {
        if (Editor.metas[key] === PdPackMeta) {
            delete Editor.metas[key];
        }
    });
    registered = false;
}
function refreshExistingPdpackAssets(reason) {
    if (refreshedExistingAssets || refreshQueued)
        return;
    if (!registered || !Editor.assetdb || typeof Editor.assetdb.refresh !== "function") {
        if (!loggedWaitingForRefresh) {
            Editor.warn("[pdpack-importer] AssetDB refresh is not ready; existing .pdpack assets were not refreshed.");
            loggedWaitingForRefresh = true;
        }
        return;
    }
    refreshedExistingAssets = true;
    refreshQueued = true;
    Editor.log(`[pdpack-importer] Queuing refresh of existing .pdpack assets after ${reason}...`);
    setTimeout(() => {
        refreshQueued = false;
        let urls;
        try {
            urls = findPdpackAssetUrls();
        }
        catch (e) {
            Editor.error("[pdpack-importer] Failed to scan existing .pdpack assets:", e.stack || e.message || e);
            return;
        }
        if (urls.length === 0)
            return;
        let remaining = urls.length;
        let failed = 0;
        urls.forEach((url) => {
            Editor.assetdb.refresh(url, (err) => {
                if (err) {
                    failed += 1;
                    Editor.warn(`[pdpack-importer] Failed to refresh '${url}':`, err.message || err);
                }
                remaining -= 1;
                if (remaining === 0) {
                    Editor.log(`[pdpack-importer] Refreshed ${urls.length - failed}/${urls.length} existing .pdpack asset(s) after ${reason}.`);
                }
            });
        });
    }, 0);
}
function findPdpackAssetUrls() {
    const assetsPath = getProjectAssetsPath();
    if (!assetsPath || !Fs.existsSync(assetsPath)) {
        return [];
    }
    const files = [];
    collectPdpackFiles(assetsPath, files);
    return files.map((fspath) => fspathToAssetUrl(fspath, assetsPath));
}
function getProjectAssetsPath() {
    const projectPath = (Editor.Project && Editor.Project.path) || (Editor.projectInfo && Editor.projectInfo.path);
    return projectPath ? Path.join(projectPath, "assets") : "";
}
function collectPdpackFiles(dir, out) {
    const names = Fs.readdirSync(dir);
    names.forEach((name) => {
        const fspath = Path.join(dir, name);
        const stat = Fs.statSync(fspath);
        if (stat.isDirectory()) {
            collectPdpackFiles(fspath, out);
            return;
        }
        if (stat.isFile() && Path.extname(fspath).toLowerCase() === ".pdpack") {
            out.push(fspath);
        }
    });
}
function fspathToAssetUrl(fspath, assetsPath) {
    if (Editor.assetdb && typeof Editor.assetdb.fspathToUrl === "function") {
        const url = Editor.assetdb.fspathToUrl(fspath);
        if (url)
            return url;
    }
    const relativePath = Path.relative(assetsPath, fspath).replace(/\\/g, "/");
    return `${ASSETS_URL}/${relativePath}`;
}
module.exports = {
    load() {
        Editor.log("[pdpack-importer] loaded");
        loadInspectorTemplate();
        registerMeta();
    },
    unload() {
        unregisterMeta();
        Editor.log("[pdpack-importer] unloaded");
    },
    messages: {
        "editor:ready"() {
            registerMeta();
        },
        "asset-db:assets-ready"() {
            if (registerMeta()) {
                refreshExistingPdpackAssets("asset-db:assets-ready");
            }
        },
        "pdpack:test"() {
            Editor.log("test");
            Editor.log(JSON.stringify(Object.getOwnPropertySymbols(Editor.assetdb)));
        },
    },
};
