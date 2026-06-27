// Connector intelligence: the Nango provider registry. Nango publishes a public,
// machine-readable providers.yaml with the real authorize/token URLs + scopes for
// ~200 OAuth providers. Ingesting it gives NodeWorm DETERMINISTIC genuine-OAuth
// endpoints for hundreds of apps with zero LLM guessing, widening the R2 oauth-api
// path far beyond the curated knowledge base and the apps that publish RFC 8414
// metadata (most consumer apps do not).
//
// Server-only (network + yaml). Fetched + parsed once per warm instance, cached 24h.
// Inert on any failure: a fetch/parse error just yields no match, never an error.
// Only CONCRETE OAUTH2 entries are used; templated URLs (need per-tenant subdomain)
// are skipped so we never hand the engine a ${...} placeholder.

import { load as yamlLoad } from "js-yaml";

export interface NangoOAuth {
  provider: string; // nango slug
  displayName: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopeSeparator?: string;
  scopes?: string[];
}

interface RawProvider {
  display_name?: string;
  auth_mode?: string;
  authorization_url?: string;
  token_url?: string;
  scope_separator?: string;
  default_scopes?: string[];
}

const PROVIDERS_URL = "https://raw.githubusercontent.com/NangoHQ/nango/master/packages/providers/providers.yaml";
const TTL_MS = 24 * 60 * 60 * 1000;

let cache: { at: number; byKey: Map<string, NangoOAuth> } | null = null;
let inflight: Promise<Map<string, NangoOAuth>> | null = null;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

async function build(): Promise<Map<string, NangoOAuth>> {
  const byKey = new Map<string, NangoOAuth>();
  try {
    const res = await fetch(PROVIDERS_URL, { signal: AbortSignal.timeout(15000), cache: "no-store" });
    if (!res.ok) return byKey;
    const doc = yamlLoad(await res.text()) as Record<string, RawProvider> | null;
    if (!doc || typeof doc !== "object") return byKey;
    for (const [slug, v] of Object.entries(doc)) {
      if (!v || typeof v !== "object") continue;
      const a = v.authorization_url;
      const t = v.token_url;
      if (!a || !t || a.includes("${") || t.includes("${")) continue; // concrete only
      if (!(v.auth_mode ?? "").toUpperCase().startsWith("OAUTH2")) continue;
      const entry: NangoOAuth = {
        provider: slug,
        displayName: v.display_name ?? slug,
        authorizeUrl: a,
        tokenUrl: t,
        scopeSeparator: v.scope_separator,
        scopes: Array.isArray(v.default_scopes) ? v.default_scopes : undefined,
      };
      byKey.set(norm(slug), entry);
      if (v.display_name) byKey.set(norm(v.display_name), entry);
    }
  } catch {
    /* inert: registry unreachable -> no matches, never throws */
  }
  return byKey;
}

async function index(): Promise<Map<string, NangoOAuth>> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.byKey;
  if (!inflight) {
    inflight = build().then((byKey) => {
      cache = { at: Date.now(), byKey };
      inflight = null;
      return byKey;
    });
  }
  return inflight;
}

// Resolve an app name to real OAuth endpoints from the registry, or undefined.
export async function nangoLookup(appName: string): Promise<NangoOAuth | undefined> {
  const byKey = await index();
  return byKey.get(norm(appName));
}
