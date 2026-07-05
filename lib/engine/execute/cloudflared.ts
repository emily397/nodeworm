// Pinned cloudflared quick-tunnel binaries, by platform. The NodeWorm Agent
// downloads the exact binary for the user's OS/arch and verifies its SHA-256
// before (and re-verifies before every spawn of) running it, so a swapped binary
// never executes. This module is the single source of truth for the pins; the
// Agent (plain JS) mirrors these values. Bump CLOUDFLARED_VERSION and refresh all
// hashes together on upgrade.

export const CLOUDFLARED_VERSION = "2026.6.1";

const BASE = `https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}`;

export interface CloudflaredTarget {
  url: string;
  sha256: string;
  filename: string; // what the Agent saves the binary as
}

// Keyed by `${platform}/${arch}` using Node's process.platform / process.arch
// values. Only raw executables are pinned (win32 exe, linux binaries); macOS
// ships as a .tgz and is intentionally absent until the Agent handles extraction,
// so callers get a null rather than a fabricated pin.
const TARGETS: Record<string, { file: string; sha256: string; filename: string }> = {
  "win32/x64": {
    file: "cloudflared-windows-amd64.exe",
    sha256: "5253e66f1f493c4e13539749f1aa86fd0c61e3072900fec29a44ba046a6d97e2",
    filename: "cloudflared.exe",
  },
  "linux/x64": {
    file: "cloudflared-linux-amd64",
    sha256: "5861a10a438fe8ddcfebb3b830f83966cbf193edafce0fe2eeb198fbae1f7a22",
    filename: "cloudflared",
  },
  "linux/arm64": {
    file: "cloudflared-linux-arm64",
    sha256: "59816ce9b16db71f5bc2a86d59b3632a96c8c3ee934bde2bc8641ee83a6070eb",
    filename: "cloudflared",
  },
};

export function cloudflaredTarget(platform: string, arch: string): CloudflaredTarget | null {
  const t = TARGETS[`${platform}/${arch}`];
  if (!t) return null;
  return { url: `${BASE}/${t.file}`, sha256: t.sha256, filename: t.filename };
}
