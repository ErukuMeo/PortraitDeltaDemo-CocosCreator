'use strict';


let PdPackAsset = cc.Class({
    name: 'cc.PdPackAsset',
    extends: cc.Asset,

    ctor() {
        this._packData = null;
    },

    properties: {
        header: {
            default: null,
            visible: false,
        },

        _nativeAsset: {
            get() {
                return this._packData;
            },
            set(buf) {
                this._packData = buf;
            },
            override: true,
        },
    },

    get buffer() {
        return this._packData;
    },

    onLoad() {
        // Parsing handled by PdpackLoader at runtime
    },
});

cc.PdPackAsset = module.exports = PdPackAsset;
