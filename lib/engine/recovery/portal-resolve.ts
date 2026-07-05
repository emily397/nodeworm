// Resolve the REAL developer-portal URL where an OAuth app is registered, so the AI
// browser agent starts on a page it can actually act on. The guessed portalUrl is
// often an API endpoint (e.g. app.clio.com/api/v4/applications) that 404s in a
// browser; this validates the candidate and, when it is an API/dead URL, searches
// the web for the app's official registration page.
//
// The two classifiers below are pure + tested; resolvePortalUrl() adds the network
// (reachability + search) around them and is server-only.

import type { SearchHit } from "../websearch";

// A URL a browser cannot register an app on: an API path or machine endpoint rather
// than a portal UI. Malformed input is treated as non-API (the caller checks
// reachability separately), so a genuine portal is never dropped on a parse quirk.
export function looksLikeApiUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  const host = u.hostname.toLowerCase();
  const path = u.pathname.toLowerCase();
  if (/^api[.-]/.test(host) || /\.api\./.test(host)) return true;
  // A version segment (/v4/, /api/v1/) or a machine endpoint. A bare "api" segment
  // is NOT enough: real portals live under paths like /settings/api/applications.
  if (/(^|\/)v[1-9]\d*(\/|$)/.test(path)) return true;
  if (/(^|\/)graphql(\/|$)/.test(path)) return true;
  if (/\.(json|xml)$/.test(path)) return true;
  return false;
}

// Signals that a page is where you create/register an app.
const PORTAL_SIGNAL = /(developer|devs?\.|\/dev(\/|$)|portal|oauth|\/apps?(\/|$)|application|credential|console|client|integration|api-?key)/i;

// Choose the best registration-portal URL from search results: skip API endpoints,
// keep only hits that carry a portal signal in host or path, and rank ones that also
// name the app first. Returns undefined when nothing looks like a portal.
export function pickPortalHit(hits: SearchHit[], appName: string): string | undefined {
  const app = appName.trim().toLowerCase();
  const scored = hits
    .filter((h) => h.url && !looksLikeApiUrl(h.url))
    .map((h) => {
      let u: URL | null = null;
      try {
        u = new URL(h.url);
      } catch {
        return null;
      }
      const hay = `${u.hostname}${u.pathname}`.toLowerCase();
      if (!PORTAL_SIGNAL.test(hay)) return null;
      let score = 0;
      if (/(^|\.)dev(eloper)?\./.test(u.hostname)) score += 2;
      if (/\/(oauth|apps?|applications|credentials|integrations)(\/|$)/.test(u.pathname.toLowerCase())) score += 2;
      if (app && (hay.includes(app) || `${h.title} ${h.snippet}`.toLowerCase().includes(app))) score += 1;
      return { url: h.url, score };
    })
    .filter((x): x is { url: string; score: number } => x !== null)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.url;
}

// Full resolution (server-only): keep the candidate when it is a usable portal;
// otherwise search for the app's real registration page. Falls back to the original
// candidate when search is unavailable or finds nothing, so behaviour never regresses.
export async function resolvePortalUrl(appName: string, candidate: string): Promise<{ url: string; resolvedBySearch: boolean }> {
  const { searchWeb, verifyUrlReachable, webSearchAvailable } = await import("../websearch");
  const candidateOk = candidate && !looksLikeApiUrl(candidate) && (await verifyUrlReachable(candidate)) !== "dead";
  if (candidateOk) return { url: candidate, resolvedBySearch: false };
  if (!webSearchAvailable()) return { url: candidate, resolvedBySearch: false };

  const hits = await searchWeb(`${appName} developer portal create OAuth application register app`, 6);
  const picked = pickPortalHit(hits, appName);
  if (picked && (await verifyUrlReachable(picked)) !== "dead") return { url: picked, resolvedBySearch: true };
  return { url: candidate, resolvedBySearch: false };
}
