// Compact storage for generated connector bundles. A generated MCP/scraper can be
// tens of KB of source; keeping it verbatim on the Integration record bloats every
// read/write of that record. This packs the file list into a gzipped base64 blob
// (server-only, node zlib) and inflates it on demand. shouldPack lets the caller
// keep small bundles inline and only compress the large ones.

import { gzipSync, gunzipSync } from "node:zlib";
import type { GeneratedFile } from "./types";

// Above this serialized size, a bundle is worth compressing before it is stored.
const PACK_THRESHOLD_BYTES = 4096;

export function shouldPack(files: GeneratedFile[]): boolean {
  return JSON.stringify(files).length > PACK_THRESHOLD_BYTES;
}

export function packBundle(files: GeneratedFile[]): string {
  return gzipSync(Buffer.from(JSON.stringify(files), "utf8")).toString("base64");
}

export function unpackBundle(packed: string): GeneratedFile[] {
  const raw = gunzipSync(Buffer.from(packed, "base64")).toString("utf8");
  return JSON.parse(raw) as GeneratedFile[];
}
