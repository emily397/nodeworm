import { describe, it, expect } from "vitest";
import { cloudflaredTarget, CLOUDFLARED_VERSION } from "./cloudflared";

describe("cloudflaredTarget", () => {
  it("resolves Windows x64 to the pinned exe + sha (raw, no archive)", () => {
    const t = cloudflaredTarget("win32", "x64");
    expect(t).not.toBeNull();
    expect(t!.url).toContain(`/download/${CLOUDFLARED_VERSION}/cloudflared-windows-amd64.exe`);
    expect(t!.sha256).toBe("5253e66f1f493c4e13539749f1aa86fd0c61e3072900fec29a44ba046a6d97e2");
    expect(t!.filename).toBe("cloudflared.exe");
    expect(t!.archive).toBe("none");
    expect(t!.innerPath).toBeUndefined();
  });

  it("resolves Linux x64 and arm64 to pinned binaries (raw, no archive)", () => {
    expect(cloudflaredTarget("linux", "x64")!.sha256).toBe(
      "5861a10a438fe8ddcfebb3b830f83966cbf193edafce0fe2eeb198fbae1f7a22",
    );
    expect(cloudflaredTarget("linux", "arm64")!.sha256).toBe(
      "59816ce9b16db71f5bc2a86d59b3632a96c8c3ee934bde2bc8641ee83a6070eb",
    );
    expect(cloudflaredTarget("linux", "x64")!.url).toContain("cloudflared-linux-amd64");
    expect(cloudflaredTarget("linux", "x64")!.archive).toBe("none");
  });

  it("resolves macOS x64 and arm64 to pinned .tgz + inner binary (real, hashed pins)", () => {
    const amd = cloudflaredTarget("darwin", "x64");
    expect(amd).not.toBeNull();
    expect(amd!.url).toContain("cloudflared-darwin-amd64.tgz");
    expect(amd!.sha256).toBe("d7a66b525fe76820da6e5406611b61e48b40de682368ac00454d9158f085be4b");
    expect(amd!.archive).toBe("tgz");
    expect(amd!.innerPath).toBe("cloudflared"); // the file to extract from the archive
    expect(amd!.filename).toBe("cloudflared"); // what the extracted binary is saved as

    const arm = cloudflaredTarget("darwin", "arm64");
    expect(arm!.url).toContain("cloudflared-darwin-arm64.tgz");
    expect(arm!.sha256).toBe("f6d4c439c6c782b83264951d327989ce5e23373acc5942b872411601fedb020d");
    expect(arm!.archive).toBe("tgz");
  });

  it("returns null for genuinely unsupported platform/arch (honest, not a fake pin)", () => {
    expect(cloudflaredTarget("linux", "s390x")).toBeNull();
    expect(cloudflaredTarget("aix", "x64")).toBeNull();
    expect(cloudflaredTarget("darwin", "ppc")).toBeNull();
  });

  it("every pinned sha256 is a 64-char lowercase hex string", () => {
    for (const [p, a] of [
      ["win32", "x64"],
      ["linux", "x64"],
      ["linux", "arm64"],
      ["darwin", "x64"],
      ["darwin", "arm64"],
    ] as const) {
      expect(cloudflaredTarget(p, a)!.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
