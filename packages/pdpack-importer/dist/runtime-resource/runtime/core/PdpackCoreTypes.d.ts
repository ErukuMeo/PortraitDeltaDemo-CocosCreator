export interface PdpackHeader {
    magic: "PDPK";
    version: number;
    flags: number;
    variantCount: number;
    offsetTablePtr: number;
    dataSize: number;
}
export interface PdpackRegionMetadata {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface PdpackVariantMetadata {
    name: string;
    regions: PdpackRegionMetadata[];
}
export interface NormalizedPdpackMetadata {
    imageWidth: number;
    imageHeight: number;
    baseVariantName: string;
    variantNames: string[];
    variants: PdpackVariantMetadata[];
    raw: any;
}
export interface PdpackRegionSegment extends PdpackRegionMetadata {
    offset: number;
    size: number;
    pngBytes: Uint8Array;
}
export interface PdpackVariantSegment {
    name: string;
    regions: PdpackRegionSegment[];
}
export interface PdpackContainer {
    header: PdpackHeader;
    imageWidth: number;
    imageHeight: number;
    baseVariantName: string;
    variantNames: string[];
    metadata: any;
    basePngBytes: Uint8Array;
    basePngSize: number;
    variants: PdpackVariantSegment[];
}
export interface PdpackHeaderSummary {
    version: number;
    flags: number;
    variantCount: number;
    imageWidth: number;
    imageHeight: number;
    baseVariantName: string;
    variantNames: string[];
    dataSize: number;
}
