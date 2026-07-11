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
  sha256: string; // hash of the DOWNLOADED artifact (the .exe/binary, or the whole .tgz)
  filename: string; // what the Agent saves the runnable binary as
  archive: "none" | "tgz"; // "tgz" -> the download is an archive to extract first
  innerPath?: string; // for archives: the member to extract and run
}

type TargetSpec = { file: string; sha256: string; filename: string; archive?: "none" | "tgz"; innerPath?: string };

// Keyed by `${platform}/${arch}` using Node's process.platform / process.arch
// values. Windows and Linux ship raw executables; macOS ships a gzipped tar whose
// SHA-256 pins the WHOLE archive (verified before extraction), with innerPath naming
// the single `cloudflared` binary inside. Every hash is computed from the real
// release asset, never fabricated; a genuinely unsupported platform returns null.
const TARGETS: Record<string, TargetSpec> = {
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
  "darwin/x64": {
    file: "cloudflared-darwin-amd64.tgz",
    sha256: "d7a66b525fe76820da6e5406611b61e48b40de682368ac00454d9158f085be4b",
    filename: "cloudflared",
    archive: "tgz",
    innerPath: "cloudflared",
  },
  "darwin/arm64": {
    file: "cloudflared-darwin-arm64.tgz",
    sha256: "f6d4c439c6c782b83264951d327989ce5e23373acc5942b872411601fedb020d",
    filename: "cloudflared",
    archive: "tgz",
    innerPath: "cloudflared",
  },
};

export function cloudflaredTarget(platform: string, arch: string): CloudflaredTarget | null {
  const t = TARGETS[`${platform}/${arch}`];
  if (!t) return null;
  return {
    url: `${BASE}/${t.file}`,
    sha256: t.sha256,
    filename: t.filename,
    archive: t.archive ?? "none",
    innerPath: t.innerPath,
  };
}
