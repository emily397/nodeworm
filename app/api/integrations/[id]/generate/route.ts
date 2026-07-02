import { NextResponse } from "next/server";
import { getOwnedIntegration, saveIntegration } from "@/lib/store";
import { generateBundle } from "@/lib/engine/generate";
import { recompute } from "@/lib/engine/orchestrate";
import type { OpenApiOp } from "@/lib/engine/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lift REAL operations from the app's own OpenAPI spec (the URL the probe already
// reached), so generated tools are genuine paths rather than conventions. Best
// effort: a fetch/parse failure just yields zero ops and the generator says so.
async function openApiOps(specUrl?: string): Promise<OpenApiOp[]> {
  if (!specUrl) return [];
  try {
    const res = await fetch(specUrl, {
      signal: AbortSignal.timeout(6000),
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const spec = (await res.json()) as { paths?: Record<string, Record<string, { operationId?: string; summary?: string }>> };
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
        if (ops.length >= 15) return ops;
      }
    }
    return ops;
  } catch {
    return [];
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

  const ops = it.discovery.hasPublicApi ? await openApiOps(it.discovery.probe?.openApiUrl) : [];
  it.generated = generateBundle(it.discovery, it.wire, ops);
  recompute(it);
  await saveIntegration(it);

  return NextResponse.json({
    ok: true,
    kind: it.generated.kind,
    connectorName: it.generated.connectorName,
    apiBase: it.generated.apiBase,
    openApiOps: ops.length,
    files: it.generated.files,
    deploySteps: it.generated.deploySteps,
    status: it.status,
  });
}

// GET: return the previously generated bundle (download surface).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getOwnedIntegration(req, id);
  if (!it) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!it.generated) return NextResponse.json({ error: "Nothing generated yet." }, { status: 404 });
  return NextResponse.json({ ok: true, ...it.generated });
}
