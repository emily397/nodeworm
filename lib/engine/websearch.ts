// Grounded web search + URL-reachability verification for the Pathfinder. Two jobs:
//  1. searchWeb(): real current results (Tavily / Brave / Serper, free-first), used
//     to GROUND the research LLM in current sources instead of model memory.
//     Inert-until-keyed: with no key, returns [] and research stays model-only.
//  2. verifyUrlReachable(): the zero-key win. Checks a recommended repo/docs URL
//     actually resolves before a method may be ranked `best`, dropping hallucinated
//     repos. LENIENT by design: only a hard failure (DNS failure, 404/410, or a
//     private/blocked host) counts as dead; timeouts / 403 / 429 / bot-blocks are
//     "unknown" and kept, so we never wrongly drop a real repo behind Cloudflare.
//
// Server-only (node dns + fetch). Never imported by the pure engine (phases.ts).

import { lookup as dnsLookup } from "dns/promises";

export type SearchHit = { title: string; url: string; snippet: string };

export function webSearchAvailable(): boolean {
  return Boolean(
    process.env.TAVILY_API_KEY?.trim() || process.env.BRAVE_API_KEY?.trim() || process.env.SERPER_API_KEY?.trim(),
  );
}

// Free-first: Tavily, then Brave, then Serper. First keyed provider wins.
export async function searchWeb(query: string, n = 5): Promise<SearchHit[]> {
  const tav = process.env.TAVILY_API_KEY?.trim();
  const brave = process.env.BRAVE_API_KEY?.trim();
  const serper = process.env.SERPER_API_KEY?.trim();
  try {
    if (tav) return await tavily(query, n, tav);
    if (brave) return await braveSearch(query, n, brave);
    if (serper) return await serper_(query, n, serper);
  } catch {
    /* search is best-effort grounding; never block research on it */
  }
  return [];
}

async function tavily(query: string, n: number, key: string): Promise<SearchHit[]> {
  const r = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ api_key: key, query, max_results: n, search_depth: "basic" }),
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) return [];
  const d = (await r.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> };
  return (d.results ?? []).map((x) => ({ title: x.title ?? "", url: x.url ?? "", snippet: (x.content ?? "").slice(0, 400) })).filter((h) => h.url);
}

async function braveSearch(query: string, n: number, key: string): Promise<SearchHit[]> {
  const u = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${n}`;
  const r = await fetch(u, { headers: { "x-subscription-token": key, accept: "application/json" }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) return [];
  const d = (await r.json()) as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
  return (d.web?.results ?? []).map((x) => ({ title: x.title ?? "", url: x.url ?? "", snippet: (x.description ?? "").slice(0, 400) })).filter((h) => h.url);
}

async function serper_(query: string, n: number, key: string): Promise<SearchHit[]> {
  const r = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "x-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ q: query, num: n }),
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) return [];
  const d = (await r.json()) as { organic?: Array<{ title?: string; link?: string; snippet?: string }> };
  return (d.organic ?? []).map((x) => ({ title: x.title ?? "", url: x.link ?? "", snippet: (x.snippet ?? "").slice(0, 400) })).filter((h) => h.url);
}

// ---- URL reachability (zero-key) ----

function isPrivateIp(ip: string): boolean {
  if (ip.includes(":")) {
    const s = ip.toLowerCase();
    return s === "::1" || s.startsWith("fe80") || s.startsWith("fc") || s.startsWith("fd") || s.startsWith("::ffff:");
  }
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) || // link-local + cloud metadata 169.254.169.254
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

export type Reach = "alive" | "dead" | "unknown";

// Lenient + SSRF-guarded. dead = DNS failure / 404 / 410 / private host. Anything
// else (200, 3xx, 403, 429, timeout, network blip) = keep (alive/unknown).
export async function verifyUrlReachable(rawUrl: string): Promise<Reach> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return "dead";
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return "dead";
  // SSRF guard: resolve the host and refuse private / metadata addresses.
  try {
    const addrs = await dnsLookup(u.hostname, { all: true });
    if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) return "dead";
  } catch {
    return "dead"; // host does not resolve
  }
  try {
    const r = await fetch(u.toString(), { method: "GET", redirect: "follow", signal: AbortSignal.timeout(8000), headers: { "user-agent": "NodeWorm-LinkCheck/1.0" } });
    if (r.status === 404 || r.status === 410) return "dead";
    if (r.status < 400 || r.status === 401 || r.status === 403 || r.status === 405 || r.status === 429) return "alive";
    return "unknown";
  } catch {
    return "unknown"; // timeout / transient: keep, do not punish a live-but-slow host
  }
}
