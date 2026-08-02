// Request-body encoding and per-connection URL resolution. Pure.
//
// Two gaps this closes, both blocking real connectors:
// 1. Some APIs (Stripe) take application/x-www-form-urlencoded with bracket
//    notation for nested values, not JSON.
// 2. Some APIs live on a per-tenant host (Shopify: acme.myshopify.com), so the
//    base URL is a property of the CONNECTION, not of the step.

export type BodyEncoding = "json" | "form";

// Flatten to Stripe-style bracket notation: metadata[order_id]=A1,
// line_items[0][price]=p1. Null and undefined are dropped; false and 0 are kept.
export function toFormBody(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const parts: string[] = [];

  const walk = (prefix: string, value: unknown): void => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(`${prefix}[${i}]`, v));
      return;
    }
    if (typeof value === "object") {
      for (const [k, v] of Object.entries(value)) walk(`${prefix}[${k}]`, v);
      return;
    }
    parts.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(value))}`);
  };

  for (const [k, v] of Object.entries(body as Record<string, unknown>)) walk(k, v);
  return parts.join("&");
}

export interface ConnectionField {
  key: string;
  label: string;
  example: string;
  help?: string;
}

// Substitute {key} placeholders the PIECE declared as connection-level config.
// Placeholders it did not declare are step-level params and are left untouched,
// so this never changes behaviour for existing connectors.
export function resolveConnectionFields(
  url: string,
  fields: ConnectionField[],
  config: Record<string, string> | undefined,
): { url: string; missing: string[] } {
  if (!fields.length) return { url, missing: [] };
  const missing: string[] = [];
  let out = url;
  for (const f of fields) {
    const token = `{${f.key}}`;
    if (!out.includes(token)) continue;
    const v = config?.[f.key]?.trim();
    if (!v) {
      missing.push(f.label);
      continue;
    }
    out = out.split(token).join(v);
  }
  return { url: out, missing };
}
