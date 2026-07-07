// APIs.guru: a free, keyless directory of ~2,500 real OpenAPI specs, keyed by
// provider domain (stripe.com, notion.com, twilio.com:api). It is fuel for the
// Scout + the generated-connector path: when a user names an app, NodeWorm can pull
// its REAL spec (servers, operations, auth) instead of guessing, for thousands of
// apps that don't advertise a spec at a discoverable URL. Server-only; the list is
// fetched once and cached per instance.

export interface ApiGuruVersion {
  swaggerUrl?: string;
  swaggerYamlUrl?: string;
  info?: { title?: string; "x-providerName"?: string };
}
export interface ApiGuruEntry {
  preferred?: string;
  versions: Record<string, ApiGuruVersion>;
}
export type ApiGuruList = Record<string, ApiGuruEntry>;

const LIST_URL = "https://api.apis.guru/v2/list.json";

// Pull the spec URL for an entry: the preferred version, else any.
function specUrlOf(entry: ApiGuruEntry): string | undefined {
  const v = (entry.preferred && entry.versions[entry.preferred]) || Object.values(entry.versions)[0];
  return v?.swaggerUrl ?? v?.swaggerYamlUrl;
}

// Extract a comparable host from a URL or bare domain (strip scheme/www/path).
function hostOf(raw: string): string | undefined {
  let s = raw.trim().toLowerCase();
  if (!s) return undefined;
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  s = s.split(/[/?#]/)[0];
  return /\.[a-z]{2,}$/.test(s) ? s : undefined;
}

// The registrable domain: the last two labels (api.stripe.com -> stripe.com). Good
// enough for matching APIs.guru provider domains, and stops an "api." subdomain from
// matching a stray api.* provider. Two-label public suffixes (co.uk) fall back safely.
function registrable(host: string): string {
  const parts = host.split(".");
  return parts.length <= 2 ? host : parts.slice(-2).join(".");
}

// Pure matcher: map an app name / URL to its APIs.guru entry. Prefers an exact
// provider-domain match, then a name-derived domain, then the leftmost label of the
// provider, then a title contains. Colon-suffixed providers (twilio.com:api) match
// on their base domain.
export function matchApiGuru(list: ApiGuruList, query: string): { key: string; specUrl: string } | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  const host = hostOf(q);
  const reg = host ? registrable(host) : undefined;
  const nameSlug = q.replace(/[^a-z0-9]/g, "");
  if (!host && !nameSlug) return undefined;

  let best: { key: string; score: number } | undefined;
  for (const key of Object.keys(list)) {
    const provider = key.split(":")[0]; // domain
    const label = provider.split(".")[0]; // leftmost label, e.g. "stripe"
    const title = (Object.values(list[key].versions)[0]?.info?.title ?? "").toLowerCase();
    let score = 0;
    if (reg && (provider === reg || provider === host)) score = 100;
    else if (!host && provider === `${nameSlug}.com`) score = 90;
    else if (!host && nameSlug.length >= 3 && label === nameSlug) score = 80;
    else if (!host && nameSlug.length >= 3 && title.replace(/[^a-z0-9]/g, "").includes(nameSlug)) score = 40;
    if (score === 0) continue;
    // Tiebreak: a base provider (no colon) beats a variant of equal score.
    if (!key.includes(":")) score += 1;
    if (!best || score > best.score) best = { key, score };
  }
  if (!best) return undefined;
  const specUrl = specUrlOf(list[best.key]);
  return specUrl ? { key: best.key, specUrl } : undefined;
}

let cache: { at: number; list: ApiGuruList } | null = null;
const TTL_MS = 6 * 60 * 60 * 1000;

async function loadList(): Promise<ApiGuruList | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.list;
  try {
    const r = await fetch(LIST_URL, { signal: AbortSignal.timeout(12000), cache: "no-store" });
    if (!r.ok) return cache?.list ?? null;
    const list = (await r.json()) as ApiGuruList;
    cache = { at: Date.now(), list };
    return list;
  } catch {
    return cache?.list ?? null;
  }
}

// Resolve an app name / URL to a real OpenAPI spec URL from APIs.guru, or undefined.
export async function apisGuruSpecUrl(nameOrUrl: string): Promise<{ key: string; specUrl: string } | undefined> {
  const list = await loadList();
  if (!list) return undefined;
  return matchApiGuru(list, nameOrUrl);
}
