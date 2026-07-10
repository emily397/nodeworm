import { NextResponse } from "next/server";
import { getOwnedIntegration, saveIntegration } from "@/lib/store";
import { generateBundle, type GraphqlField } from "@/lib/engine/generate";
import { recompute } from "@/lib/engine/orchestrate";
import { packBundle, shouldPack, unpackBundle } from "@/lib/engine/bundle-store";
import { apisGuruSpecUrl } from "@/lib/engine/intel/apisguru";
import { normalizeCapture } from "@/lib/engine/capture";
import type { OpenApiOp } from "@/lib/engine/types";

// Unwrap a GraphQL introspection type ref down to its named type + kind.
function namedType(t: unknown): { name?: string; kind?: string } {
  let cur = t as { name?: string; kind?: string; ofType?: unknown } | null;
  let guard = 0;
  while (cur && !cur.name && cur.ofType && guard++ < 8) cur = cur.ofType as typeof cur;
  return { name: cur?.name, kind: cur?.kind };
}

// Render a GraphQL type ref back to SDL (Int, String!, [ID!]) for variable decls.
function typeString(t: unknown): string {
  const n = t as { name?: string; kind?: string; ofType?: unknown } | null;
  if (!n) return "String";
  if (n.kind === "NON_NULL") return `${typeString(n.ofType)}!`;
  if (n.kind === "LIST") return `[${typeString(n.ofType)}]`;
  return n.name ?? "String";
}

type IntroField = { name: string; args?: Array<{ name: string; type: unknown }> };
const SCALAR_KINDS = new Set(["SCALAR", "ENUM"]);

async function gqlPost(url: string, query: string): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ query }),
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return null;
  return res.json();
}

function toFields(fields: IntroField[] | undefined): GraphqlField[] {
  if (!fields) return [];
  return fields.slice(0, 12).map((f) => ({
    name: f.name,
    args: (f.args ?? []).map((a) => {
      const nt = namedType(a.type);
      // A directly-named scalar/enum is safely typed for a GraphQL variable. A
      // wrapper-typed arg (NON_NULL/LIST) whose inner type the server's depth
      // limit hid stays non-scalar and is simply not emitted as a typed param.
      const scalar = SCALAR_KINDS.has(nt.kind ?? "") && Boolean(nt.name);
      return { name: a.name, type: scalar ? typeString(a.type) : nt.name ?? "String", scalar };
    }),
  }));
}

// Live introspection: pull the Query type's fields and their scalar/enum args so
// the generated MCP gets real, typed per-field tools. Tries a deep query first
// (full type info) and falls back to a shallow one for servers that enforce a
// query-depth limit (e.g. Rick and Morty API). Any failure yields no gql fields
// and the generic graphql_query still ships.
async function graphqlQueryFields(url?: string): Promise<GraphqlField[]> {
  if (!url) return [];
  try {
    const deep = (await gqlPost(
      url,
      `{ __schema { queryType { name } types { name kind fields { name args { name type { kind name ofType { kind name ofType { kind name } } } } } } } }`,
    )) as { data?: { __schema?: { queryType?: { name?: string }; types?: Array<{ name?: string; fields?: IntroField[] }> } } } | null;
    const schema = deep?.data?.__schema;
    if (schema?.queryType?.name) {
      const qType = schema.types?.find((t) => t.name === schema.queryType!.name);
      if (qType?.fields) return toFields(qType.fields);
    }
    // Shallow fallback: no nested ofType, targets only the Query type.
    const shallow = (await gqlPost(url, `{ __type(name: "Query") { fields { name args { name type { kind name } } } } }`)) as
      | { data?: { __type?: { fields?: IntroField[] } } }
      | null;
    return toFields(shallow?.data?.__type?.fields);
  } catch {
    return [];
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lift REAL operations from the app's own OpenAPI spec (the URL the probe already
// reached), so generated tools are genuine paths rather than conventions. Best
// effort: a fetch/parse failure just yields zero ops and the generator says so.
async function parseOpenApi(specUrl?: string): Promise<{ ops: OpenApiOp[]; apiBase?: string }> {
  if (!specUrl) return { ops: [] };
  try {
    const res = await fetch(specUrl, {
      signal: AbortSignal.timeout(9000),
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return { ops: [] };
    const spec = (await res.json()) as {
      paths?: Record<string, Record<string, { operationId?: string; summary?: string }>>;
      servers?: Array<{ url?: string }>;
      host?: string;
      basePath?: string;
      schemes?: string[];
    };
    // Real base: OpenAPI 3 servers[], else Swagger 2 scheme+host+basePath.
    let apiBase: string | undefined = spec.servers?.[0]?.url?.trim() || undefined;
    if (!apiBase && spec.host) apiBase = `${spec.schemes?.[0] ?? "https"}://${spec.host}${spec.basePath ?? ""}`;
    if (apiBase && !/^https?:\/\//.test(apiBase)) apiBase = undefined; // skip templated/relative bases
    const ops: OpenApiOp[] = [];
    for (const [path, methods] of Object.entries(spec.paths ?? {})) {
      for (const m of ["get", "post", "put", "patch", "delete"]) {
        const op = methods?.[m];
        if (!op) continue;
        ops.push({
          method: m,
          path,
          name: op.operationId ?? `${m}_${path.replace(/[{}]/g, "").replace(/[^a-zA-Z0-9]+/g, "_")}`,
          summary: op.summary,
        });
        if (ops.length >= 15) return { ops, apiBase };
      }
    }
    return { ops, apiBase };
  } catch {
    return { ops: [] };
  }
}

// POST: generate the connector bundle from the discovered surface and persist it.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getOwnedIntegration(req, id);
  if (!it) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!it.discovery || !it.wire) {
    return NextResponse.json({ error: "Run the pipeline first: generation needs the discovered surface." }, { status: 400 });
  }

  // OpenAPI source: the app's own discovered spec first; else fall back to the real
  // spec from the APIs.guru directory (thousands of apps that don't advertise one).
  let specSource: "probe" | "apis.guru" | "har" | "none" = "none";
  let specUrl = it.discovery.probe?.openApiUrl;
  if (specUrl) specSource = "probe";
  else if (it.discovery.hasPublicApi && it.discovery.apiType !== "graphql") {
    const guru = await apisGuruSpecUrl(it.discovery.appUrl || it.appName);
    if (guru) { specUrl = guru.specUrl; specSource = "apis.guru"; }
  }
  // Captured-traffic source (highest signal): a HAR from the managed session /
  // Helper / devtools export reveals the app's REAL private API. It unlocks
  // generation even when the app advertises no public spec at all.
  // Captured traffic can arrive as a raw HAR string, or as the flat request array a
  // CDP session / Helper extension emits; both normalize through the same contract.
  // it.capturedRequests is set by the auto-capture session route (zero user action).
  const body = (await req.json().catch(() => ({}))) as { har?: string; capturedRequests?: unknown };
  const captureInput = body.har ?? body.capturedRequests ?? it.capturedRequests;
  const harResult = captureInput ? normalizeCapture(captureInput) : { ops: [], apiBase: undefined };

  const specResult = it.discovery.hasPublicApi ? await parseOpenApi(specUrl) : { ops: [], apiBase: undefined };
  // HAR ops win on conflicts (they are ground truth), then spec ops fill gaps.
  const seen = new Set(harResult.ops.map((o) => `${o.method} ${o.path}`));
  const ops = [...harResult.ops, ...specResult.ops.filter((o) => !seen.has(`${o.method} ${o.path}`))].slice(0, 40);
  const apiBase = harResult.apiBase ?? specResult.apiBase;
  if (harResult.ops.length) specSource = "har";

  const gqlFields =
    it.discovery.apiType === "graphql" ? await graphqlQueryFields(it.discovery.probe?.graphqlUrl) : [];
  // Captured traffic gives a real REST surface even for apps with no public API, so
  // build a typed MCP (not a scraper) whenever HAR ops exist.
  const genDiscovery =
    harResult.ops.length && !it.discovery.hasPublicApi
      ? { ...it.discovery, hasPublicApi: true, apiType: "rest" as const }
      : it.discovery;
  const bundle = generateBundle(genDiscovery, it.wire, ops, gqlFields, apiBase);
  const files = bundle.files;
  // Large bundles are stored packed (files emptied) so the Integration record stays
  // lean; readers hydrate. The response below still returns the full files.
  it.generated = shouldPack(files) ? { ...bundle, files: [], packed: packBundle(files) } : bundle;
  recompute(it);
  await saveIntegration(it);

  return NextResponse.json({
    ok: true,
    kind: bundle.kind,
    connectorName: bundle.connectorName,
    apiBase: bundle.apiBase,
    openApiOps: ops.length,
    specSource,
    graphqlTools: gqlFields.length,
    packed: Boolean(it.generated.packed),
    files,
    deploySteps: bundle.deploySteps,
    status: it.status,
  });
}

// GET: return the previously generated bundle (download surface).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getOwnedIntegration(req, id);
  if (!it) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!it.generated) return NextResponse.json({ error: "Nothing generated yet." }, { status: 404 });
  const files = it.generated.packed ? unpackBundle(it.generated.packed) : it.generated.files;
  return NextResponse.json({ ok: true, ...it.generated, packed: undefined, files });
}
