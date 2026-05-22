import { NormalizedPdpackMetadata, PdpackContainer, PdpackHeader, PdpackHeaderSummary } from "./PdpackCoreTypes";
export declare function parseHeader(input: ArrayBuffer | Uint8Array): PdpackHeader;
export declare function parseMetadata(json: string): NormalizedPdpackMetadata;
export declare function parseContainer(input: ArrayBuffer | Uint8Array): PdpackContainer;
export declare function toHeaderSummary(container: PdpackContainer): PdpackHeaderSummary;
