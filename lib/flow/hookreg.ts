// Webhook auto-registration: NodeWorm registers a flow's hook URL inside the
// source app itself, over the app's own API, authenticated by the vaulted
// OAuth token. Ladder: curated recipe -> discovered webhooky operation ->
// honest manual copy. Pure request-building + parsing; the route does I/O.

import type { OpenApiOp } from "../engine/types";

export interface RecipeParam {
  key: string;
  label: string;
  example: string;
}

export interface HookRecipe {
  app: string; // lowercased app slug matched against the connection's appName
  createPath: string; // may carry {param} placeholders
  method: string;
  apiBase: string;
  contentType: "json" | "form";
  // Body template; {{hookUrl}} and {{<param>}} substitute.
  body: string;
  params: RecipeParam[];
  deletePathTemplate?: string; // {id} + params substitute
  events?: string; // human note about which events get subscribed
}

export const HOOK_RECIPES: HookRecipe[] = [
  {
    app: "stripe",
    createPath: "/v1/webhook_endpoints",
    method: "POST",
    apiBase: "https://api.stripe.com",
    contentType: "form",
    body: "url={{hookUrl}}&enabled_events[]=*",
    params: [],
    deletePathTemplate: "/v1/webhook_endpoints/{id}",
    events: "all events",
  },
  {
    app: "github",
    createPath: "/repos/{repo}/hooks",
    method: "POST",
    apiBase: "https://api.github.com",
    contentType: "json",
    body: '{"name":"web","active":true,"events":["*"],"config":{"url":"{{hookUrl}}","content_type":"json"}}',
    params: [{ key: "repo", label: "repository (owner/name)", example: "emily397/nodeworm" }],
    deletePathTemplate: "/repos/{repo}/hooks/{id}",
    events: "all events",
  },
  {
    app: "shopify",
    createPath: "/admin/api/2024-01/webhooks.json",
    method: "POST",
    apiBase: "", // per-store: the connection's own api base carries the shop domain
    contentType: "json",
    body: '{"webhook":{"topic":"{{topic}}","address":"{{hookUrl}}","format":"json"}}',
    params: [{ key: "topic", label: "topic", example: "orders/create" }],
    deletePathTemplate: "/admin/api/2024-01/webhooks/{id}.json",
  },
  {
    app: "typeform",
    createPath: "/forms/{form}/webhooks/nodeworm",
    method: "PUT",
    apiBase: "https://api.typeform.com",
    contentType: "json",
    body: '{"url":"{{hookUrl}}","enabled":true}',
    params: [{ key: "form", label: "form id", example: "abc123" }],
    deletePathTemplate: "/forms/{form}/webhooks/nodeworm",
  },
];

export function recipeFor(appName: string): HookRecipe | undefined {
  const want = appName.trim().toLowerCase();
  return HOOK_RECIPES.find((r) => want === r.app || want.startsWith(`${r.app} `));
}

// ---- Discovered path -------------------------------------------------------

const URL_KEYS = ["target_url", "callback_url", "hook_url", "webhook_url", "notification_url", "address", "endpoint", "url"];
const HOOKY = /webhook|hooks?$|hooks?\/|subscription/i;

export function findRegistrationOp(ops: OpenApiOp[]): { op: OpenApiOp; urlKey: string } | null {
  const candidates = ops.filter((o) => ["post", "put"].includes(o.method.toLowerCase()) && HOOKY.test(o.path));
  if (!candidates.length) return null;
  // Prefer an op whose observed body keys include a known url-ish field.
  for (const op of candidates) {
    const key = op.bodyKeys?.find((k) => URL_KEYS.includes(k.toLowerCase()));
    if (key) return { op, urlKey: key };
  }
  return { op: candidates[0], urlKey: "url" };
}

// ---- Request building (pure) -----------------------------------------------

export type RegistrationSource = { recipe: HookRecipe } | { discovered: { op: OpenApiOp; urlKey: string }; apiBase: string };

export interface RegistrationRequest {
  url: string;
  method: string;
  contentType: "json" | "form";
  body: string;
  deletePathTemplate?: string;
}

function substitute(tpl: string, values: Record<string, string>): { out: string; missing: string[] } {
  const missing: string[] = [];
  const out = tpl.replace(/\{(\w+)\}|\{\{(\w+)\}\}/g, (whole, brace: string | undefined, dbl: string | undefined) => {
    const key = brace ?? dbl!;
    const v = values[key];
    if (v === undefined || v === "") {
      missing.push(key);
      return whole;
    }
    return v;
  });
  return { out, missing: [...new Set(missing)] };
}

export function buildRegistrationRequest(
  source: RegistrationSource,
  hookUrl: string,
  params: Record<string, string>,
): RegistrationRequest | { error: string } {
  if ("recipe" in source) {
    const r = source.recipe;
    const values: Record<string, string> = { ...params, hookUrl: r.contentType === "form" ? encodeURIComponent(hookUrl) : hookUrl };
    const path = substitute(r.createPath, values);
    const body = substitute(r.body, values);
    const missing = [...new Set([...path.missing, ...body.missing])];
    if (missing.length) {
      const labels = missing.map((m) => r.params.find((p) => p.key === m)?.label ?? m);
      return { error: `needs ${labels.join(" + ")}` };
    }
    return { url: `${r.apiBase}${path.out}`, method: r.method, contentType: r.contentType, body: body.out, deletePathTemplate: r.deletePathTemplate };
  }

  const { op, urlKey } = source.discovered;
  const base = source.apiBase.replace(/\/+$/, "");
  if (!base) return { error: "no API base discovered for this app" };
  if (/\{\w+\}/.test(op.path)) return { error: `the discovered endpoint needs path values (${op.path})` };
  const body: Record<string, unknown> = { [urlKey]: hookUrl };
  return { url: `${base}${op.path}`, method: op.method.toUpperCase(), contentType: "json", body: JSON.stringify(body) };
}

export function parseRegistrationResult(json: unknown): string | undefined {
  const j = json as Record<string, unknown> | null;
  if (!j || typeof j !== "object") return undefined;
  for (const path of [["id"], ["webhook", "id"], ["data", "id"], ["result", "id"]]) {
    let cur: unknown = j;
    for (const k of path) cur = cur && typeof cur === "object" ? (cur as Record<string, unknown>)[k] : undefined;
    if (typeof cur === "string" && cur) return cur;
    if (typeof cur === "number") return String(cur);
  }
  return undefined;
}
