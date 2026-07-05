import { describe, it, expect } from "vitest";
import { cloudflaredTarget, CLOUDFLARED_VERSION } from "./cloudflared";

describe("cloudflaredTarget", () => {
  it("resolves Windows x64 to the pinned exe + sha", () => {
    const t = cloudflaredTarget("win32", "x64");
    expect(t).not.toBeNull();
    expect(t!.url).toContain(`/download/${CLOUDFLARED_VERSION}/cloudflared-windows-amd64.exe`);
    expect(t!.sha256).toBe("5253e66f1f493c4e13539749f1aa86fd0c61e3072900fec29a44ba046a6d97e2");
    expect(t!.filename).toBe("cloudflared.exe");
  });

  it("resolves Linux x64 and arm64 to pinned binaries", () => {
    expect(cloudflaredTarget("linux", "x64")!.sha256).toBe(
      "5861a10a438fe8ddcfebb3b830f83966cbf193edafce0fe2eeb198fbae1f7a22",
    );
    expect(cloudflaredTarget("linux", "arm64")!.sha256).toBe(
      "59816ce9b16db71f5bc2a86d59b3632a96c8c3ee934bde2bc8641ee83a6070eb",
    );
    expect(cloudflaredTarget("linux", "x64")!.url).toContain("cloudflared-linux-amd64");
  });

  it("returns null for unsupported platform/arch (honest, not a fake pin)", () => {
    expect(cloudflaredTarget("darwin", "arm64")).toBeNull(); // ships as .tgz, not yet handled
    expect(cloudflaredTarget("linux", "s390x")).toBeNull();
    expect(cloudflaredTarget("aix", "x64")).toBeNull();
  });

  it("every pinned sha256 is a 64-char lowercase hex string", () => {
    for (const [p, a] of [
      ["win32", "x64"],
      ["linux", "x64"],
      ["linux", "arm64"],
    ] as const) {
      expect(cloudflaredTarget(p, a)!.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
