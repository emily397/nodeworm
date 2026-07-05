import { describe, it, expect } from "vitest";
import { packBundle, unpackBundle, shouldPack } from "./bundle-store";
import type { GeneratedFile } from "./types";

const files: GeneratedFile[] = [
  { path: "package.json", content: '{"name":"x"}' },
  { path: "src/index.ts", content: "console.log('hi');\n".repeat(400) },
];

describe("bundle-store", () => {
  it("round-trips files exactly through pack -> unpack", () => {
    const packed = packBundle(files);
    expect(typeof packed).toBe("string");
    expect(unpackBundle(packed)).toEqual(files);
  });

  it("compresses a large repetitive bundle below its raw JSON size", () => {
    const raw = JSON.stringify(files).length;
    expect(packBundle(files).length).toBeLessThan(raw);
  });

  it("shouldPack is true only past the size threshold", () => {
    expect(shouldPack([{ path: "a", content: "small" }])).toBe(false);
    expect(shouldPack(files)).toBe(true);
  });

  it("unpack rejects a corrupt / non-bundle string", () => {
    expect(() => unpackBundle("not-base64-gzip!!")).toThrow();
  });
});
