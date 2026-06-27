// Optional live discovery via a cost-ordered model cascade. NodeWorm runs fully
// on the curated knowledge base + heuristics + live probe with no key; when an
// AI key is set, the Scout upgrades unknown apps to real model research.
//
// Cascade order honours cheapest-capable-first: Groq's free tier, then
// OpenRouter free models, then OpenRouter low-cost and cost-efficient paid
// models as the natural fallback when a cheaper model fails or returns nothing
// usable. No direct Anthropic key: everything routes through Groq / OpenRouter
// (both OpenAI-compatible). Any failure degrades silently to heuristics so the
// product never hard-fails.

import type { AuthType, Discovery, TelemetryLine } from "./types";

type Provider = "groq" | "openrouter";
type Tier = "free" | "low-cost" | "paid";
interface Candidate {
  provider: Provider;
  model: string;
  tier: Tier;
}

// Free first (Groq before OpenRouter), then low-cost, then cost-efficient paid.
const CASCADE: Candidate[] = [
  { provider: "groq", model: "llama-3.3-70b-versatile", tier: "free" },
  { provider: "groq", model: "llama-3.1-8b-instant", tier: "free" },
  { provider: "openrouter", model: "deepseek/deepseek-chat-v3-0324:free", tier: "free" },
  { provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct:free", tier: "free" },
  { provider: "openrouter", model: "google/gemini-2.0-flash-exp:free", tier: "free" },
  { provider: "openrouter", model: "deepseek/deepseek-chat-v3-0324", tier: "low-cost" },
  { provider: "openrouter", model: "google/gemini-2.0-flash-001", tier: "low-cost" },
  { provider: "openrouter", model: "openai/gpt-4o-mini", tier: "paid" },
];

function providerKey(p: Provider): string | undefined {
  return p === "groq" ? process.env.GROQ_API_KEY : process.env.OPENROUTER_API_KEY;
}

function providerUrl(p: Provider): string {
  return p === "groq"
    ? "https://api.groq.com/openai/v1/chat/completions"
    : "https://openrouter.ai/api/v1/chat/completions";
}

export function isLlmEnabled(): boolean {
  return Boolean(process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY);
}

// Candidates whose provider key is present. Override the whole list without a
// redeploy via LLM_CASCADE, e.g. "groq:llama-3.3-70b-versatile,openrouter:openai/gpt-4o-mini".
function candidates(): Candidate[] {
  const override = process.env.LLM_CASCADE;
  const list: Candidate[] = override
    ? override
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => {
          const [provider, ...rest] = t.split(":");
          return { provider: provider as Provider, model: rest.join(":"), tier: "free" as Tier };
        })
    : CASCADE;
  return list.filter((c) => Boolean(providerKey(c.provider)));
}

const DISCOVERY_KEYS = `appName(string), category(string), blurb(string),
hasPublicApi(boolean), apiType("rest"|"graphql"|"grpc"|"sdk"|"none"|"unknown"),
authType("oauth2"|"apikey"|"none"|"browser"|"unknown"), hasHostedMcp(boolean),
mcpName(string, optional), hasWebhooks(boolean), rateLimited(boolean),
ipRestricted(boolean), twoFactor(boolean), entities(string[]),
docsUrl(string, optional), oauthAuthorizeUrl(string, optional),
oauthTokenUrl(string, optional), oauthScopes(string[], optional),
oauthTokenAuth("body"|"basic", optional), oauthScopeSep(string, optional),
notes(string[])`;

const SYSTEM = `You are the Scout agent in an autonomous integration engine.
Given an app name or URL, profile its integration surface as accurately as you can from your knowledge.
Be honest: if an app has no public API, say so (hasPublicApi=false, apiType="none", authType="browser").
Pick the single most likely primary auth method. List 3-6 primary data entities a connector would sync.
Note any real-world footguns (IP allowlists, 2FA, aggressive bot protection, no webhooks, first-party-only OAuth).
Only claim a hosted MCP exists if you are confident one is published.
If the app supports OAuth 2.0, give the genuine authorization and token endpoints (oauthAuthorizeUrl, oauthTokenUrl) and the real OAuth scope strings (oauthScopes) for a least-privilege read+write connector. Also state how the token endpoint takes the client credentials (oauthTokenAuth: "basic" for an HTTP Basic header, "body" for client_id/client_secret in the form body) and the scope separator (oauthScopeSep, usually a single space, occasionally a comma). Only include these if you are confident they are correct; omit them otherwise rather than guessing.
Respond with ONLY a single minified JSON object, no markdown, with these keys: ${DISCOVERY_KEYS}.`;

interface ChatResult {
  ok: boolean;
  status: number;
  content?: string;
}

async function post(url: string, key: string, body: Record<string, unknown>): Promise<ChatResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        // OpenRouter attribution headers (ignored by Groq).
        "HTTP-Referer": "https://abie-three.vercel.app",
        "X-Title": "NodeWorm",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return { ok: false, status: res.status };
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return { ok: true, status: res.status, content: json.choices?.[0]?.message?.content };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

async function callModel(c: Candidate, system: string, user: string): Promise<Record<string, unknown> | null> {
  const key = providerKey(c.provider);
  if (!key) return null;
  const url = providerUrl(c.provider);
  const base = {
    model: c.model,
    max_tokens: 1200,
    temperature: 0.2,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
  // Prefer JSON mode; retry once without it for models that reject the param.
  let res = await post(url, key, { ...base, response_format: { type: "json_object" } });
  if (!res.ok && (res.status === 400 || res.status === 422 || res.status === 404)) {
    res = await post(url, key, base);
  }
  if (!res.ok || !res.content) return null;
  return parseJson(res.content);
}

// Reusable structured-JSON call over the cost cascade. Used by recipe research
// and intent parsing. Returns the first model's parsed JSON, or null if no key
// is set / every model failed.
export async function chatJson(system: string, user: string): Promise<Record<string, unknown> | null> {
  for (const c of candidates()) {
    const data = await callModel(c, system, user);
    if (data) return data;
  }
  return null;
}

function parseJson(s: string): Record<string, unknown> | null {
  const cleaned = s.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function llmDiscovery(input: string): Promise<Discovery | null> {
  for (const c of candidates()) {
    const data = await callModel(c, SYSTEM, `Profile this app for integration (JSON only): ${input}`);
    if (data && data.appName) return normalize(data, input, `${c.provider}:${c.model}`);
  }
  return null;
}

function normalize(d: Record<string, unknown>, input: string, label: string): Discovery {
  const authType = (d.authType as AuthType) ?? "unknown";
  const hasPublicApi = Boolean(d.hasPublicApi);
  const url = /^https?:\/\//i.test(input) ? input : undefined;
  const notes = Array.isArray(d.notes) ? (d.notes as string[]) : [];
  const oauthAuthorizeUrl = typeof d.oauthAuthorizeUrl === "string" ? d.oauthAuthorizeUrl : undefined;
  const oauthTokenUrl = typeof d.oauthTokenUrl === "string" ? d.oauthTokenUrl : undefined;
  const oauthScopes = Array.isArray(d.oauthScopes) ? (d.oauthScopes as string[]) : undefined;
  const oauthTokenAuth = d.oauthTokenAuth === "basic" || d.oauthTokenAuth === "body" ? d.oauthTokenAuth : undefined;
  const oauthScopeSep = typeof d.oauthScopeSep === "string" ? d.oauthScopeSep : undefined;

  const telemetry: TelemetryLine[] = [
    { level: "scan", text: `llm.research("${String(d.appName)}")` },
    { level: "ok", text: `Live discovery via ${label}.` },
    hasPublicApi
      ? { level: "ok", text: `${String(d.apiType).toUpperCase()} API, auth: ${authType}.` }
      : { level: "warn", text: `No public API detected. Browser path likely.` },
    d.hasHostedMcp
      ? { level: "ok", text: `Hosted MCP reported: ${String(d.mcpName ?? "yes")}.` }
      : { level: "info", text: `No hosted MCP found in research.` },
  ];
  if (oauthAuthorizeUrl && oauthTokenUrl) {
    telemetry.push({ level: "ok", text: `Genuine OAuth endpoints discovered: ${oauthAuthorizeUrl.replace(/^https?:\/\//, "").split("/")[0]}.` });
  }
  for (const n of notes) telemetry.push({ level: "warn", text: n });

  return {
    appName: String(d.appName ?? input),
    appUrl: url,
    category: String(d.category ?? "Unknown"),
    blurb: String(d.blurb ?? ""),
    hasPublicApi,
    apiType: (d.apiType as Discovery["apiType"]) ?? "unknown",
    authType,
    authMethods: hasPublicApi ? [authType] : ["browser"],
    hasHostedMcp: Boolean(d.hasHostedMcp),
    mcpName: typeof d.mcpName === "string" ? d.mcpName : undefined,
    mcpTransport: d.hasHostedMcp ? "http" : undefined,
    docsUrl: typeof d.docsUrl === "string" ? d.docsUrl : undefined,
    oauthAuthorizeUrl,
    oauthTokenUrl,
    oauthScopes,
    oauthTokenAuth,
    oauthScopeSep,
    hasWebhooks: Boolean(d.hasWebhooks),
    rateLimited: Boolean(d.rateLimited),
    ipRestricted: Boolean(d.ipRestricted),
    twoFactor: Boolean(d.twoFactor),
    confidence: 0.8,
    source: "llm",
    entities: Array.isArray(d.entities) ? (d.entities as string[]) : [],
    notes,
    telemetry,
  };
}
