// Live reconnaissance: NodeWorm reverse-engineers a target's real integration
// surface by fetching its public discovery documents - OAuth/OIDC metadata,
// OpenAPI specs, MCP manifests, AI-plugin manifests and OpenAI-compatible
// endpoints. The discovered OAuth authorize/token/scope endpoints flow straight
// into Discovery.oauth* and from there into the genuine consent flow
// (providerFor's fallback), so probing an unknown app can light up a real
// connection with no hand-written provider entry.
//
// Server-only (network I/O). NEVER imported by phases.ts: the deterministic
// engine consumes only the evidence this writes onto Discovery. Safe by design:
// GET only, short timeouts, no credentials, no-store, an honest identifier, and
// a recorded URL + status for every hit. Any failure degrades to null/partial;
// it never throws. Zero keys, zero new vendors.

import type { AuthType, Discovery, ProbeEndpoint, ProbeEvidence, TelemetryLine } from "./types";

const UA = "NodeWorm-Probe/1.0 (+https://abie-three.vercel.app; integration reconnaissance)";
const TIMEOUT_MS = 3500;
const MAX_ORIGINS = 3;
const MAX_BYTES = 512 * 1024; // ignore specs larger than this; we only need the shape

export function probeEnabled(): boolean {
  return process.env.NODEWORM_PROBE !== "0";
}

interface Fetched {
  url: string;
  status: number;
  json?: unknown;
  contentType: string;
  wwwAuthenticate?: string;
}

async function get(url: string): Promise<Fetched> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "user-agent": UA, accept: "application/json, text/event-stream;q=0.5, */*;q=0.1" },
      redirect: "follow",
      cache: "no-store",
      signal: ctrl.signal,
    });
    const contentType = res.headers.get("content-type") ?? "";
    const wwwAuthenticate = res.headers.get("www-authenticate") ?? undefined;
    let json: unknown;
    if (res.ok && contentType.includes("json")) {
      const text = (await res.text()).slice(0, MAX_BYTES);
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
    } else {
      // Drain without buffering large bodies; we only needed status + headers.
      await res.body?.cancel().catch(() => {});
    }
    return { url, status: res.status, json, contentType, wwwAuthenticate };
  } catch {
    return { url, status: 0, contentType: "" };
  } finally {
    clearTimeout(timer);
  }
}

// Minimal GraphQL introspection. POST-only exception to the GET-only rule: a tiny
// read-only introspection query with no credentials. A response with a `data` or
// `errors` key proves a real GraphQL endpoint; `data.__schema` additionally yields
// the object types as entities. Same timeout/no-store/UA discipline as get().
async function introspect(url: string): Promise<Fetched> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "user-agent": UA, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ query: "{ __schema { queryType { name } types { name kind } } }" }),
      redirect: "follow",
      cache: "no-store",
      signal: ctrl.signal,
    });
    const contentType = res.headers.get("content-type") ?? "";
    let json: unknown;
    if (contentType.includes("json")) {
      const text = (await res.text()).slice(0, MAX_BYTES);
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
    } else {
      await res.body?.cancel().catch(() => {});
    }
    return { url, status: res.status, json, contentType };
  } catch {
    return { url, status: 0, contentType: "" };
  } finally {
    clearTimeout(timer);
  }
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

// Does a JSON body have the Model Context Protocol shape (vs an unrelated
// resource that merely lives at /mcp)?
function looksMcp(j: Record<string, unknown>): boolean {
  if ("protocolVersion" in j || "serverInfo" in j || "capabilities" in j) return true;
  if (str(j.jsonrpc)) return true;
  if (str(j.transport) && (str(j.name) || str(j.version))) return true;
  if (str(j.name) && Array.isArray(j.tools)) return true;
  return false;
}

function originsFrom(seeds: string[]): string[] {
  const out: string[] = [];
  const add = (o: string) => {
    if (o && !out.includes(o)) out.push(o);
  };
  for (const s of seeds) {
    let u: URL | undefined;
    try {
      u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    } catch {
      continue;
    }
    add(u.origin);
    // Most SaaS expose machine-readable surfaces on an api. subdomain.
    if (!u.hostname.startsWith("api.")) add(`${u.protocol}//api.${u.hostname}`);
  }
  return out.slice(0, MAX_ORIGINS);
}

// ---- field extractors -----------------------------------------------------

function oauthFromMetadata(j: Record<string, unknown>) {
  return {
    authorizeUrl: str(j.authorization_endpoint),
    tokenUrl: str(j.token_endpoint),
    scopes: Array.isArray(j.scopes_supported) ? (j.scopes_supported as unknown[]).filter((x): x is string => typeof x === "string") : undefined,
    registration: str(j.registration_endpoint),
  };
}

function oauthFromOpenApi(spec: Record<string, unknown>) {
  const comps = asRecord(spec.components);
  const schemes = asRecord(comps?.securitySchemes) ?? asRecord(asRecord(spec.securityDefinitions ? spec : {})?.securityDefinitions);
  if (!schemes) return undefined;
  for (const v of Object.values(schemes)) {
    const s = asRecord(v);
    if (s?.type === "oauth2") {
      const flows = asRecord(s.flows) ?? s;
      const flow = asRecord(flows.authorizationCode) ?? asRecord((flows as Record<string, unknown>).accessCode);
      if (flow) {
        const scopeObj = asRecord(flow.scopes);
        return {
          authorizeUrl: str(flow.authorizationUrl),
          tokenUrl: str(flow.tokenUrl),
          scopes: scopeObj ? Object.keys(scopeObj) : undefined,
        };
      }
    }
  }
  return undefined;
}

function authTypeFromOpenApi(spec: Record<string, unknown>): AuthType | undefined {
  const comps = asRecord(spec.components);
  const schemes = asRecord(comps?.securitySchemes);
  if (!schemes) return undefined;
  let sawApiKey = false;
  let sawBearer = false;
  for (const v of Object.values(schemes)) {
    const s = asRecord(v);
    if (!s) continue;
    if (s.type === "oauth2" || s.type === "openIdConnect") return "oauth2";
    if (s.type === "apiKey") sawApiKey = true;
    if (s.type === "http" && String(s.scheme).toLowerCase() === "bearer") sawBearer = true;
  }
  if (sawApiKey || sawBearer) return "apikey";
  return undefined;
}

const AI_PATH = /\/(chat\/completions|completions|embeddings|responses|messages|generate)(\/|$)/i;
const WEBHOOK_PATH = /(webhook|\/events?(\/|$)|subscriptions?)/i;

function analyzeOpenApi(spec: Record<string, unknown>) {
  const paths = asRecord(spec.paths) ?? {};
  const pathKeys = Object.keys(paths);
  const hasWebhooks = Boolean(asRecord(spec.webhooks)) || pathKeys.some((p) => WEBHOOK_PATH.test(p));
  const aiEndpoints = pathKeys.filter((p) => AI_PATH.test(p));
  const tags = Array.isArray(spec.tags) ? (spec.tags as unknown[]).map((t) => str(asRecord(t)?.name)).filter((x): x is string => !!x) : [];
  const entities = (tags.length ? tags : pathKeys.map((p) => p.split("/").filter(Boolean)[0]).filter((x): x is string => !!x))
    .map((e) => e.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))
    .filter((e, i, a) => a.indexOf(e) === i)
    .slice(0, 6);
  return { pathCount: pathKeys.length, hasWebhooks, aiEndpoints, entities };
}

// ---- probe ----------------------------------------------------------------

export async function probeTarget(seeds: string[]): Promise<ProbeEvidence | null> {
  const origins = originsFrom(seeds);
  if (!origins.length) return null;

  const ev: ProbeEvidence = { reachable: false, origins, aiEndpoints: [], hits: [], telemetry: [] };
  const hits = ev.hits;
  const note = (status: number) => (status === 0 ? "no response" : `HTTP ${status}`);
  const record = (kind: ProbeEndpoint["kind"], f: Fetched, detail?: string) => {
    hits.push({ kind, url: f.url, status: f.status, detail });
  };

  // Build the request matrix. Well-known docs sit on the primary origin; the
  // REST/AI/MCP surfaces are tried on every origin (often the api. subdomain).
  const jobs: Array<Promise<void>> = [];
  for (const origin of origins) {
    const wellKnown = [
      { kind: "oauth-metadata" as const, url: `${origin}/.well-known/oauth-authorization-server` },
      { kind: "openid" as const, url: `${origin}/.well-known/openid-configuration` },
      { kind: "ai-plugin" as const, url: `${origin}/.well-known/ai-plugin.json` },
      { kind: "mcp" as const, url: `${origin}/.well-known/mcp.json` },
    ];
    const surfaces = [
      { kind: "openapi" as const, url: `${origin}/openapi.json` },
      { kind: "openapi" as const, url: `${origin}/swagger.json` },
      { kind: "openapi" as const, url: `${origin}/v3/api-docs` },
      { kind: "openapi" as const, url: `${origin}/.well-known/openapi.json` },
      { kind: "ai-openai" as const, url: `${origin}/v1/models` },
      { kind: "mcp" as const, url: `${origin}/mcp` },
      { kind: "mcp" as const, url: `${origin}/sse` },
    ];
    for (const probe of [...wellKnown, ...surfaces]) {
      jobs.push(
        get(probe.url).then((f) => {
          if (f.status > 0) ev.reachable = true;
          handle(probe.kind, f, ev, record);
        }),
      );
    }
    // GraphQL: a POST introspection query at the common endpoints. A live schema
    // here means a real GraphQL API to connect, not a managed-session fallback.
    for (const path of ["/graphql", "/api/graphql", "/query"]) {
      jobs.push(
        introspect(`${origin}${path}`).then((f) => {
          if (f.status > 0) ev.reachable = true;
          handle("graphql", f, ev, record);
        }),
      );
    }
  }
  await Promise.allSettled(jobs);

  if (!ev.reachable) return null;
  finalize(ev, note);
  return ev;
}

function handle(
  kind: ProbeEndpoint["kind"],
  f: Fetched,
  ev: ProbeEvidence,
  record: (k: ProbeEndpoint["kind"], f: Fetched, d?: string) => void,
) {
  const j = asRecord(f.json);

  if ((kind === "oauth-metadata" || kind === "openid") && f.status === 200 && j) {
    const o = oauthFromMetadata(j);
    if (o.authorizeUrl && o.tokenUrl && !ev.oauthAuthorizeUrl) {
      ev.oauthAuthorizeUrl = o.authorizeUrl;
      ev.oauthTokenUrl = o.tokenUrl;
      ev.oauthScopes = o.scopes;
      ev.registrationEndpoint = o.registration;
      ev.authType = "oauth2";
      record(kind, f, `authorize+token endpoints (${o.scopes?.length ?? 0} scopes)`);
      return;
    }
  }

  if (kind === "ai-plugin" && f.status === 200 && j) {
    ev.aiPluginManifestUrl = f.url;
    const api = asRecord(j.api);
    const apiUrl = str(api?.url);
    if (apiUrl && !ev.openApiUrl) ev.openApiUrl = apiUrl;
    const auth = asRecord(j.auth);
    if (str(auth?.type)?.includes("oauth")) ev.authType ??= "oauth2";
    record(kind, f, "ChatGPT plugin manifest");
    return;
  }

  if (kind === "mcp") {
    const isSse = f.contentType.includes("text/event-stream");
    const isManifestPath = f.url.endsWith("/.well-known/mcp.json") || f.url.endsWith("/mcp.json");
    // A JSON body only counts as MCP if it is the well-known manifest or has the
    // protocol's shape: a bare 200 JSON/HTML at /mcp is some other resource, not
    // proof of an MCP server. Avoids false positives on generic /sse endpoints.
    if (f.status === 200 && j && (isManifestPath || looksMcp(j))) {
      ev.hasHostedMcp = true;
      ev.mcpUrl = f.url;
      ev.mcpName = str(j.name) ?? str(asRecord(j.server)?.name);
      ev.mcpTransport = str(j.transport) === "sse" ? "sse" : "http";
      record(kind, f, `MCP manifest${ev.mcpName ? `: ${ev.mcpName}` : ""}`);
      return;
    }
    // A live text/event-stream response at the MCP transport path is a real
    // streaming endpoint; a plain status code is not enough to claim one.
    if (isSse && [200, 401, 405, 406].includes(f.status)) {
      ev.hasHostedMcp = true;
      ev.mcpUrl = f.url;
      ev.mcpTransport = "sse";
      record(kind, f, "SSE MCP endpoint");
      return;
    }
  }

  if (kind === "ai-openai" && [200, 401].includes(f.status)) {
    // GET /v1/models answering (even 401) is the OpenAI-compatible signature.
    ev.aiOpenAiCompatible = true;
    if (!ev.aiEndpoints.includes(f.url)) ev.aiEndpoints.push(f.url);
    record(kind, f, "OpenAI-compatible /v1/models");
    return;
  }

  if (kind === "openapi" && f.status === 200 && j) {
    if (!ev.openApiUrl) ev.openApiUrl = f.url;
    ev.apiType = "rest";
    const a = analyzeOpenApi(j);
    ev.pathCount = a.pathCount;
    ev.hasWebhooks = ev.hasWebhooks || a.hasWebhooks;
    if (a.entities.length) ev.entities = a.entities;
    for (const e of a.aiEndpoints) {
      const full = e.startsWith("http") ? e : `${new URL(f.url).origin}${e}`;
      if (!ev.aiEndpoints.includes(full)) ev.aiEndpoints.push(full);
    }
    if (!ev.oauthAuthorizeUrl) {
      const o = oauthFromOpenApi(j);
      if (o?.authorizeUrl && o.tokenUrl) {
        ev.oauthAuthorizeUrl = o.authorizeUrl;
        ev.oauthTokenUrl = o.tokenUrl;
        ev.oauthScopes = o.scopes;
        ev.authType = "oauth2";
      }
    }
    ev.authType ??= authTypeFromOpenApi(j);
    record(kind, f, `OpenAPI (${a.pathCount} paths${a.hasWebhooks ? ", webhooks" : ""})`);
    return;
  }

  if (kind === "graphql" && f.status === 200 && j) {
    // Only a real introspection result (data.__schema with types) counts, so a
    // REST endpoint that merely answers POST is never mistaken for GraphQL.
    const schema = asRecord(asRecord(j.data)?.__schema);
    if (schema && Array.isArray(schema.types)) {
      if (!ev.graphqlUrl) ev.graphqlUrl = f.url;
      ev.apiType = "graphql";
      const entities = (schema.types as unknown[])
        .map(asRecord)
        .filter((t): t is Record<string, unknown> => Boolean(t))
        .filter(
          (t) =>
            t.kind === "OBJECT" &&
            typeof t.name === "string" &&
            !t.name.startsWith("__") &&
            !["Query", "Mutation", "Subscription"].includes(t.name),
        )
        .map((t) => t.name as string)
        .slice(0, 8);
      if (entities.length && !ev.entities?.length) ev.entities = entities;
      record("graphql", f, `GraphQL schema (${entities.length} types)`);
      return;
    }
  }

  // A bearer challenge on any surface is a weak-but-real auth signal.
  if (f.wwwAuthenticate && /bearer/i.test(f.wwwAuthenticate)) {
    record("auth-header", f, f.wwwAuthenticate.slice(0, 60));
    ev.authType ??= "oauth2";
  }
}

function finalize(ev: ProbeEvidence, note: (s: number) => string) {
  const t: TelemetryLine[] = ev.telemetry;
  const material = ev.hits.filter((h) => h.detail);
  t.push({ level: "scan", text: `probe.reverse-engineer(${ev.origins.join(", ")})` });

  if (ev.oauthAuthorizeUrl && ev.oauthTokenUrl) {
    const host = ev.oauthAuthorizeUrl.replace(/^https?:\/\//, "").split("/")[0];
    t.push({ level: "ok", text: `Reverse-engineered live OAuth endpoints at ${host} (${ev.oauthScopes?.length ?? 0} scopes). Genuine consent is wireable.` });
  }
  if (ev.hasHostedMcp) {
    t.push({ level: "ok", text: `MCP endpoint found${ev.mcpName ? ` (${ev.mcpName})` : ""}: ${ev.mcpTransport ?? "http"} transport.` });
  }
  if (ev.openApiUrl) {
    t.push({ level: "ok", text: `OpenAPI spec located: ${ev.pathCount ?? 0} paths${ev.hasWebhooks ? ", webhooks advertised" : ""}.` });
  }
  if (ev.graphqlUrl) {
    const host = ev.graphqlUrl.replace(/^https?:\/\//, "").split("/")[0];
    t.push({ level: "ok", text: `Live GraphQL API introspected at ${host} (${ev.entities?.length ?? 0} types).` });
  }
  if (ev.aiOpenAiCompatible || ev.aiEndpoints.length) {
    t.push({ level: "ok", text: `AI endpoints detected: ${ev.aiEndpoints.length}${ev.aiOpenAiCompatible ? " (OpenAI-compatible)" : ""}.` });
  }
  if (!material.length) {
    const probed = ev.hits.length;
    t.push({ level: "info", text: `Target reachable but exposed no machine-readable surface (${probed} paths probed).` });
  } else {
    for (const h of material) t.push({ level: "info", text: `${h.kind}: ${h.url} -> ${note(h.status)}` });
  }
}

// ---- enrichment -----------------------------------------------------------
// Layer real probe evidence onto a base Discovery. Pure (no I/O). Live evidence
// overrides a guess but defers to curated knowledge unless it adds something the
// knowledge base lacked (e.g. an OAuth endpoint not in the registry).

export function enrichWithProbe(base: Discovery, probe: ProbeEvidence): Discovery {
  const d: Discovery = { ...base, telemetry: [...base.telemetry, ...probe.telemetry], notes: [...base.notes], probe };
  const contributed: string[] = [];

  if (probe.oauthAuthorizeUrl && probe.oauthTokenUrl && !d.oauthAuthorizeUrl) {
    d.oauthAuthorizeUrl = probe.oauthAuthorizeUrl;
    d.oauthTokenUrl = probe.oauthTokenUrl;
    if (probe.oauthScopes?.length && !d.oauthScopes?.length) d.oauthScopes = probe.oauthScopes;
    if (d.authType !== "oauth2") {
      d.authType = "oauth2";
      if (!d.authMethods.includes("oauth2")) d.authMethods = ["oauth2", ...d.authMethods];
    }
    contributed.push("genuine OAuth endpoints");
  }
  if (probe.hasHostedMcp && !d.hasHostedMcp) {
    d.hasHostedMcp = true;
    d.mcpName = probe.mcpName ?? `${d.appName.toLowerCase()} (discovered)`;
    d.mcpTransport = probe.mcpTransport ?? "http";
    contributed.push("hosted MCP");
  }
  if (probe.openApiUrl) {
    if (!d.hasPublicApi) d.hasPublicApi = true;
    if (d.apiType === "none" || d.apiType === "unknown") d.apiType = "rest";
    if (!d.docsUrl) d.docsUrl = probe.openApiUrl;
    contributed.push("OpenAPI surface");
  }
  if (probe.graphqlUrl) {
    if (!d.hasPublicApi) d.hasPublicApi = true;
    d.apiType = "graphql";
    if (!d.docsUrl) d.docsUrl = probe.graphqlUrl;
    contributed.push("GraphQL API");
  }
  if (probe.hasWebhooks && !d.hasWebhooks) {
    d.hasWebhooks = true;
    contributed.push("webhooks");
  }
  if (probe.aiEndpoints.length) {
    d.notes.push(`Reverse-engineered ${probe.aiEndpoints.length} AI endpoint(s)${probe.aiOpenAiCompatible ? " (OpenAI-compatible)" : ""}: ${probe.aiEndpoints.slice(0, 3).join(", ")}.`);
    contributed.push("AI endpoints");
  }
  const generic = d.entities.length === 0 || (d.entities.length <= 2 && d.entities.every((e) => ["Record", "Item"].includes(e)));
  if (probe.entities?.length && generic) d.entities = probe.entities;

  if (contributed.length) {
    // Real evidence beats a guess; a corroborated knowledge entry gains confidence.
    if (base.source === "heuristic") d.source = "probe";
    d.confidence = Math.max(d.confidence, base.source === "knowledge-base" ? 0.97 : 0.85);
    d.notes.push(`Live reconnaissance confirmed: ${contributed.join(", ")}.`);
  }
  return d;
}

// Seed origins for the probe, from whatever the base discovery already knows
// plus the raw input. Real hosts first; a name-based guess only as a fallback.
export function seedUrls(base: Discovery, input: string): string[] {
  const seeds: string[] = [];
  const push = (u?: string) => {
    if (u) seeds.push(u);
  };
  if (/^https?:\/\//i.test(input) || /^[\w-]+\.[a-z]{2,}/i.test(input)) push(input);
  push(base.appUrl);
  push(base.oauthAuthorizeUrl);
  push(base.docsUrl);
  push(base.developerPortalUrl);
  if (!seeds.length) {
    const slug = base.appName.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (slug) push(`https://${slug}.com`);
  }
  return seeds;
}
