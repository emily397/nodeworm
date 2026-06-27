// Self-hosted connector reachability. When the Pathfinder recommends a connector
// the user stands up themselves (e.g. signal-cli-rest-api, an n8n webhook, a CLI
// with an HTTP mode), NodeWorm proves the connection is LIVE by making ONE real
// GET to the user's own endpoint. The endpoint URL and an optional token (the one
// the user set on THEIR OWN wrapper, never the third-party app's API key) live
// encrypted in the vault; only a derived boolean + sanitised detail reach the UI.
//
// Server-only. The pasted URL is attacker-influenced, so it is SSRF-guarded with
// real DNS resolution (stronger than the hostname-string match in dcr.ts): the
// resolved IPs are checked, the exact target is re-validated right before each
// fetch (defeats DNS rebinding), redirects are never followed, and the cloud
// surface blocks private/loopback/metadata targets it has no business reaching.

import { lookup as dnsLookup } from "node:dns/promises";

const PROBE_PATHS = ["/v1/health", "/health", "/healthz", "/v1/about", "/about", "/healthz/readiness", "/ready", "/"];
const TIMEOUT_MS = 8000;
const MAX_BYTES = 64 * 1024;

export type ConnectorSurface = "cloud" | "extension";

function isMetadataIp(ip: string): boolean {
  return ip === "169.254.169.254" || ip === "fd00:ec2::254";
}

function isPrivateIp(ip: string): boolean {
  const a = ip.toLowerCase();
  if (a === "::1" || a === "::" || a === "0.0.0.0") return true;
  if (a.startsWith("fc") || a.startsWith("fd") || a.startsWith("fe80")) return true;
  const v4 = a.startsWith("::ffff:") ? a.slice(7) : a;
  if (/^127\./.test(v4) || /^10\./.test(v4) || /^192\.168\./.test(v4) || /^169\.254\./.test(v4)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(v4)) return true;
  return false;
}

// Validate a connector URL and classify it. Resolves DNS so a public hostname
// that points at an internal IP is caught. Returns reason "private" specifically
// so the caller can show the "the cloud can't reach your LAN" guidance.
export async function assertConnectorUrl(
  raw: string,
  surface: ConnectorSurface,
): Promise<{ ok: true; url: URL; isPrivate: boolean } | { ok: false; reason: string }> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: "That is not a valid URL." };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, reason: "Use an http or https URL." };
  if (u.username || u.password) return { ok: false, reason: "Remove the credentials from the URL; use the token field instead." };
  if (u.port === "0") return { ok: false, reason: "That is not a valid port." };

  const host = u.hostname.toLowerCase();
  if (host === "metadata.google.internal") return { ok: false, reason: "That address is blocked." };

  let ips: { address: string }[];
  try {
    ips = await dnsLookup(host, { all: true });
  } catch {
    return { ok: false, reason: "Could not resolve that host." };
  }
  if (ips.some((i) => isMetadataIp(i.address))) return { ok: false, reason: "That address is blocked." };

  const loopbackName = /^(localhost|.*\.local|.*\.internal)$/i.test(host);
  const isPrivate = loopbackName || ips.some((i) => isPrivateIp(i.address));

  if (surface === "cloud") {
    // Private / loopback first: the cloud genuinely can't reach a LAN address, so
    // give the "use a tunnel / verify from the Helper" guidance rather than a
    // misleading https complaint. https is only required for a PUBLIC host (token
    // in transit). ALLOW_PRIVATE_CONNECTORS lets a self-hosted NodeWorm reach its own LAN.
    if (isPrivate) {
      if (!process.env.ALLOW_PRIVATE_CONNECTORS) return { ok: false, reason: "private" };
    } else if (u.protocol !== "https:") {
      return { ok: false, reason: "Use https for a connector NodeWorm reaches from the cloud." };
    }
  } else {
    // Extension surface: the user's own machine makes the call, so loopback / LAN
    // is fine. Still refuse plaintext http to a PUBLIC host so a token can't cross
    // the internet unencrypted.
    if (u.protocol !== "https:" && !isPrivate) return { ok: false, reason: "Use https for a public connector." };
  }
  return { ok: true, url: u, isPrivate };
}

export interface ConnectorVerify {
  ok: boolean;
  status?: number;
  detail?: string;
  registeredHint?: string;
  host?: string; // the verified host, for display
  path?: string; // the path that verified, for display
}

function authHeader(token: string): string {
  return /^(Bearer|Basic) /.test(token) ? token : `Bearer ${token}`;
}

// One real read of the connector. Returns ok only on a genuine 2xx/3xx response;
// a token-rejected 401/403 is NEVER live. Tries the user's explicit path first,
// then common health endpoints.
export async function verifyConnector(rawUrl: string, token: string | undefined, surface: ConnectorSurface): Promise<ConnectorVerify> {
  const base = await assertConnectorUrl(rawUrl, surface);
  if (!base.ok) return { ok: false, detail: base.reason };

  const givenPath = base.url.pathname && base.url.pathname !== "/" ? base.url.pathname : null;
  const candidates = givenPath ? [givenPath, ...PROBE_PATHS] : PROBE_PATHS;

  let lastStatus: number | undefined;
  let authRejected = false;
  for (const path of candidates) {
    const target = new URL(path, base.url).toString();
    // Re-validate the exact target right before the fetch (TOCTOU / DNS rebinding).
    const recheck = await assertConnectorUrl(target, surface);
    if (!recheck.ok) continue;
    const headers: Record<string, string> = {};
    if (token) headers.authorization = authHeader(token);
    let res: Response;
    try {
      res = await fetch(target, { method: "GET", headers, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      continue;
    }
    lastStatus = res.status;
    if (res.status === 401 || res.status === 403) {
      authRejected = true;
      await res.body?.cancel().catch(() => {});
      continue;
    }
    if (res.status >= 200 && res.status < 400) {
      const server = res.headers.get("server") ?? "";
      const detail = `HTTP ${res.status}${server ? ` ${server}` : ""} (${base.url.host})`;
      const registeredHint = await readRegisteredHint(base.url, token, surface);
      return { ok: true, status: res.status, detail, registeredHint, host: base.url.host, path };
    }
    await res.body?.cancel().catch(() => {});
  }

  if (authRejected) {
    return token
      ? { ok: false, detail: "Your connector rejected the token." }
      : { ok: false, detail: "Your connector needs auth. Add the token you set on it." };
  }
  return { ok: false, detail: "Could not reach the connector.", status: lastStatus };
}

// Best-effort, read-only extra: for a signal-cli-rest-api instance, GET /v1/accounts
// reveals whether a Signal number is linked yet. Never blocks the verdict, never
// echoes the raw body (only a derived count), bounded in size + time.
async function readRegisteredHint(base: URL, token: string | undefined, surface: ConnectorSurface): Promise<string | undefined> {
  const target = new URL("/v1/accounts", base).toString();
  const recheck = await assertConnectorUrl(target, surface);
  if (!recheck.ok) return undefined;
  try {
    const headers: Record<string, string> = {};
    if (token) headers.authorization = authHeader(token);
    const res = await fetch(target, { method: "GET", headers, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return undefined;
    }
    const text = (await res.text()).slice(0, MAX_BYTES);
    const data = JSON.parse(text);
    if (Array.isArray(data)) {
      return data.length ? `${data.length} number${data.length === 1 ? "" : "s"} linked` : "up, no number linked yet";
    }
    return undefined;
  } catch {
    return undefined;
  }
}
