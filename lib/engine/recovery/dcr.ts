// OAuth 2.0 Dynamic Client Registration (RFC 7591). When the probe discovered a
// registration_endpoint, NodeWorm can register a client programmatically with
// zero manual steps. Rare among consumer SaaS (mostly IdPs / MCP servers), but
// fully autonomous where present. Guarded against SSRF: the endpoint must be a
// public https URL.

import type { ClientCreds } from "../oauth";

// Block non-public targets so a malicious .well-known cannot point the server at
// internal/loopback/link-local hosts or the cloud metadata endpoint.
export function assertPublicHttps(rawUrl: string): URL | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return null;
  if (host === "169.254.169.254" || host === "metadata.google.internal") return null;
  if (/^(0\.|127\.|10\.|192\.168\.|169\.254\.)/.test(host)) return null;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return null;
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) return null;
  return u;
}

export async function registerClient(opts: {
  registrationEndpoint: string;
  redirectUri: string;
  scopes: string[];
  clientName?: string;
}): Promise<{ creds: ClientCreds } | { error: string }> {
  const safe = assertPublicHttps(opts.registrationEndpoint);
  if (!safe) return { error: "registration endpoint is not a public https URL" };

  const full: Record<string, unknown> = {
    redirect_uris: [opts.redirectUri],
    client_name: opts.clientName ?? "NodeWorm",
    grant_types: ["authorization_code"],
    response_types: ["code"],
    token_endpoint_auth_method: "client_secret_basic",
  };
  if (opts.scopes.length) full.scope = opts.scopes.join(" ");

  const post = async (payload: Record<string, unknown>) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(safe.toString(), {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
        signal: ctrl.signal,
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { status: res.status, json };
    } catch (e) {
      return { status: 0, json: { error: e instanceof Error ? e.message : "network error" } as Record<string, unknown> };
    } finally {
      clearTimeout(timer);
    }
  };

  let r = await post(full);
  // Some servers reject extra metadata; retry once with the minimal required body.
  if (r.status === 400) {
    r = await post({ redirect_uris: [opts.redirectUri], client_name: full.client_name });
  }

  const clientId = typeof r.json.client_id === "string" ? r.json.client_id : undefined;
  const clientSecret = typeof r.json.client_secret === "string" ? r.json.client_secret : undefined;
  if (r.status >= 200 && r.status < 300 && clientId && clientSecret) {
    return { creds: { clientId, clientSecret } };
  }
  const reason =
    r.status === 401 || r.status === 403
      ? "provider gates dynamic registration"
      : r.status === 0
        ? String(r.json.error ?? "network error")
        : `dynamic registration failed (HTTP ${r.status})`;
  return { error: reason };
}
