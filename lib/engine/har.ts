// Reverse-engineer an app's real (often undocumented/private) API from a recorded
// HAR file. The managed browser session, the Helper extension, or the user's own
// devtools export produces the HAR; this turns the captured XHR/fetch traffic into
// typed OpenApiOp[] that feed generateBundle. This is how NodeWorm connects apps
// that publish no OpenAPI/GraphQL surface at all: it watches the real calls the app
// makes and rebuilds a client from them.

import type { OpenApiOp } from "./types";

interface HarEntry {
  request?: {
    method?: string;
    url?: string;
    postData?: { mimeType?: string; text?: string };
    queryString?: Array<{ name?: string }>;
  };
  response?: { status?: number; content?: { mimeType?: string } };
}

// Top-level field names of a JSON request body, if it parsed as an object.
function bodyKeysOf(entry: HarEntry): string[] {
  const text = entry.request?.postData?.text;
  if (!text) return [];
  try {
    const obj = JSON.parse(text);
    return obj && typeof obj === "object" && !Array.isArray(obj) ? Object.keys(obj).slice(0, 24) : [];
  } catch {
    return [];
  }
}

const ASSET_EXT = /\.(js|mjs|css|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot|map|mp4|webm|wasm|pdf)(\?|$)/i;

// Collapse volatile path segments (numeric ids, uuids, long hex/tokens) to {id} so
// /projects/8842 and /projects/9931 become one templated operation.
function templatize(pathname: string): string {
  return pathname
    .split("/")
    .map((seg) => {
      if (!seg) return seg;
      if (/^\d+$/.test(seg)) return "{id}";
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return "{id}";
      if (/^[0-9a-f]{16,}$/i.test(seg)) return "{id}";
      if (/^\d[\w-]*\d$/.test(seg) && /\d{4,}/.test(seg)) return "{id}";
      return seg;
    })
    .join("/");
}

function opName(method: string, path: string): string {
  const slug = path.replace(/[{}]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `${method.toLowerCase()}_${slug || "root"}`.slice(0, 60);
}

export function parseHar(harText: string): { apiBase?: string; ops: OpenApiOp[] } {
  let entries: HarEntry[] = [];
  try {
    const parsed = JSON.parse(harText) as { log?: { entries?: HarEntry[] } };
    entries = parsed.log?.entries ?? [];
  } catch {
    return { ops: [] };
  }
  if (!Array.isArray(entries)) return { ops: [] };

  const originCounts = new Map<string, number>();
  const seen = new Set<string>();
  const ops: OpenApiOp[] = [];

  for (const e of entries) {
    const method = (e.request?.method ?? "").toUpperCase();
    const rawUrl = e.request?.url ?? "";
    if (!method || !rawUrl) continue;

    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      continue;
    }
    if (ASSET_EXT.test(url.pathname)) continue;

    const mime = (e.response?.content?.mimeType ?? "").toLowerCase();
    const looksApi = /\/(api|v\d+|rest|graphql|gql)(\/|$)/i.test(url.pathname);
    // Keep JSON responses, or paths that clearly look like an API even if the mime
    // was not captured. Everything else (html docs, assets) is dropped.
    if (!mime.includes("json") && !looksApi) continue;
    if (mime.includes("html")) continue;

    const path = templatize(url.pathname);
    const key = `${method} ${path}`;
    originCounts.set(url.origin, (originCounts.get(url.origin) ?? 0) + 1);
    if (seen.has(key)) continue;
    seen.add(key);

    const queryKeys = [...new Set([...url.searchParams.keys(), ...(e.request?.queryString ?? []).map((q) => q.name ?? "").filter(Boolean)])];
    const bodyKeys = bodyKeysOf(e);
    ops.push({
      method: method.toLowerCase(),
      path,
      name: opName(method, path),
      summary: `${method} ${path} (captured from live traffic)`,
      ...(bodyKeys.length ? { bodyKeys } : {}),
      ...(queryKeys.length ? { queryKeys } : {}),
    });
    if (ops.length >= 40) break;
  }

  let apiBase: string | undefined;
  let best = 0;
  for (const [origin, n] of originCounts) {
    if (n > best) {
      best = n;
      apiBase = origin;
    }
  }
  return { apiBase, ops };
}
