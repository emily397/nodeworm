// One ingestion contract for captured network traffic, whatever the source: the
// managed browser session (CDP), the NodeWorm Helper extension (chrome.webRequest),
// or a devtools HAR export. It normalizes everything into HAR shape and reuses
// parseHar, so auto-capture works the same regardless of collector. This is what
// lets NodeWorm rebuild a typed connector for ANY app the user just logs into.

import { parseHar } from "./har";
import type { OpenApiOp } from "./types";

// A flat captured request, as a CDP listener or extension would emit it. Field
// names are accepted loosely because different collectors label them differently.
export interface CaptureEntry {
  method?: string;
  url?: string;
  status?: number;
  responseStatus?: number;
  mimeType?: string;
  responseMimeType?: string;
  responseType?: string;
  requestBody?: string;
  postData?: string;
  body?: string;
  requestHeaders?: Record<string, string>;
}

// Auth header names, most-specific first. We surface only the NAME the app uses so
// the generated connector defaults to the right header; the secret value is never
// read, stored, or returned.
const AUTH_HEADERS = ["authorization", "x-api-key", "api-key", "x-auth-token", "x-access-token"];

function detectAuthHeader(entries: CaptureEntry[]): string | undefined {
  const counts = new Map<string, number>();
  for (const e of entries) {
    const names = Object.keys(e.requestHeaders ?? {}).map((h) => h.toLowerCase());
    for (const h of AUTH_HEADERS) if (names.includes(h)) counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  let best: string | undefined;
  let n = 0;
  for (const [h, c] of counts) if (c > n) { n = c; best = h; }
  return best;
}

function toHar(entries: CaptureEntry[]): string {
  return JSON.stringify({
    log: {
      entries: entries.map((e) => ({
        request: {
          method: e.method,
          url: e.url,
          postData: { text: e.requestBody ?? e.postData ?? e.body },
        },
        response: {
          status: e.status ?? e.responseStatus,
          content: { mimeType: e.mimeType ?? e.responseMimeType ?? e.responseType },
        },
      })),
    },
  });
}

export function normalizeCapture(input: unknown): { apiBase?: string; ops: OpenApiOp[]; authHeader?: string } {
  // Already a HAR object.
  if (input && typeof input === "object" && !Array.isArray(input) && "log" in (input as object)) {
    return parseHar(JSON.stringify(input));
  }
  // A flat capture array.
  if (Array.isArray(input)) {
    return { ...parseHar(toHar(input as CaptureEntry[])), authHeader: detectAuthHeader(input as CaptureEntry[]) };
  }
  // A JSON string: HAR or capture array.
  if (typeof input === "string") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input);
    } catch {
      return { ops: [] };
    }
    if (Array.isArray(parsed)) return { ...parseHar(toHar(parsed as CaptureEntry[])), authHeader: detectAuthHeader(parsed as CaptureEntry[]) };
    if (parsed && typeof parsed === "object" && "log" in (parsed as object)) return parseHar(input);
    return { ops: [] };
  }
  return { ops: [] };
}
