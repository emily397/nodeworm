import { NextResponse } from "next/server";
import { assertConnectorUrl } from "@/lib/engine/connector";
import { discoveredApiBase } from "@/lib/engine/generate";
import { collectSurfaceOps } from "@/lib/engine/generate-pipeline";
import { getVaultTokens } from "@/lib/engine/vault";
import { buildRegistrationRequest, findRegistrationOp, recipeFor, parseRegistrationResult, type RegistrationSource } from "@/lib/flow/hookreg";
import { getOwnedFlow, saveFlow } from "@/lib/flow/store";
import type { Flow } from "@/lib/flow/types";
import { getOwnedIntegration } from "@/lib/store";
import type { Integration } from "@/lib/engine/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Resolved {
  flow: Flow;
  it: Integration;
}

async function resolve(req: Request, id: string): Promise<Resolved | Response> {
  const flow = await getOwnedFlow(req, id);
  if (!flow) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (flow.trigger.type !== "webhook") return NextResponse.json({ error: "This flow's trigger is not a webhook." }, { status: 400 });
  if (!flow.trigger.integrationId) return NextResponse.json({ error: "Pick the trigger's connection first." }, { status: 400 });
  const it = await getOwnedIntegration(req, flow.trigger.integrationId);
  if (!it) return NextResponse.json({ error: "That connection no longer exists." }, { status: 400 });
  return { flow, it };
}

async function source(it: Integration): Promise<{ src?: RegistrationSource; mode: "curated" | "discovered" | "none"; params: Array<{ key: string; label: string; example: string }>; detail: string }> {
  const recipe = recipeFor(it.appName);
  const surface = await collectSurfaceOps(it);
  const apiBase = surface.apiBase ?? (it.discovery ? discoveredApiBase(it.discovery) : undefined) ?? "";
  if (recipe) {
    const r = recipe.apiBase ? recipe : { ...recipe, apiBase };
    if (!r.apiBase) return { mode: "none", params: [], detail: `NodeWorm knows how to register in ${it.appName} but has no API base for this connection.` };
    return { src: { recipe: r }, mode: "curated", params: recipe.params, detail: `via NodeWorm's ${recipe.app} recipe${recipe.events ? ` (${recipe.events})` : ""}` };
  }
  const hit = findRegistrationOp(surface.ops);
  if (hit && apiBase) {
    return { src: { discovered: hit, apiBase }, mode: "discovered", params: [], detail: `via the app's own discovered endpoint ${hit.op.method.toUpperCase()} ${hit.op.path}` };
  }
  return { mode: "none", params: [], detail: "no registration surface discovered; copy the URL into the app manually" };
}

// Availability probe: how WOULD this hook get registered, and what does it need.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await resolve(req, id);
  if (r instanceof Response) return r;
  const s = await source(r.it);
  return NextResponse.json({ mode: s.mode, params: s.params, detail: s.detail, registration: r.flow.trigger.registration ?? null });
}

// Actually register the hook URL inside the source app, as the user's connection.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await resolve(req, id);
  if (r instanceof Response) return r;
  const { flow, it } = r;
  const body = (await req.json().catch(() => ({}))) as { params?: Record<string, string> };

  const tokens = await getVaultTokens(it.appName, { connectionId: it.id, userId: it.userId });
  if (!tokens) return NextResponse.json({ error: `no stored token for ${it.appName}; reconnect it first` }, { status: 400 });

  const s = await source(it);
  if (!s.src) return NextResponse.json({ error: s.detail }, { status: 400 });

  const origin = new URL(req.url).origin;
  const hookUrl = `${origin}/api/flows/${flow.id}/hook?k=${flow.trigger.token}`;
  const built = buildRegistrationRequest(s.src, hookUrl, body.params ?? {});
  if ("error" in built) return NextResponse.json({ error: built.error, params: s.params }, { status: 400 });

  const guard = await assertConnectorUrl(built.url, "cloud");
  if (!guard.ok) return NextResponse.json({ error: guard.reason }, { status: 400 });

  let res: Response;
  try {
    res = await fetch(built.url, {
      method: built.method,
      headers: {
        authorization: `Bearer ${tokens.accessToken}`,
        "content-type": built.contentType === "form" ? "application/x-www-form-urlencoded" : "application/json",
        accept: "application/json",
      },
      body: built.body,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return await record(flow, { state: "failed", via: s.mode as "curated" | "discovered", detail: `could not reach ${new URL(built.url).host}`, at: Date.now() });
  }
  const text = (await res.text().catch(() => "")).slice(0, 4000);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }

  if (res.status >= 200 && res.status < 300) {
    const hookId = parseRegistrationResult(json);
    let deleteUrl: string | undefined;
    if (built.deletePathTemplate && "recipe" in s.src) {
      const path = built.deletePathTemplate.replace(/\{(\w+)\}/g, (w, k: string) => (k === "id" ? hookId ?? w : body.params?.[k] ?? w));
      if (!/\{\w+\}/.test(path)) deleteUrl = `${s.src.recipe.apiBase}${path}`;
    }
    return await record(flow, { state: "registered", via: s.mode as "curated" | "discovered", id: hookId, deleteUrl, detail: `HTTP ${res.status} ${s.detail}`, at: Date.now() });
  }
  const snippet = typeof json === "object" && json ? JSON.stringify(json).slice(0, 160) : text.slice(0, 160);
  return await record(flow, { state: "failed", via: s.mode as "curated" | "discovered", detail: `HTTP ${res.status}${snippet ? `: ${snippet}` : ""}`, at: Date.now() });
}

// Best-effort de-registration using the delete URL captured at registration.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await resolve(req, id);
  if (r instanceof Response) return r;
  const { flow, it } = r;
  const reg = flow.trigger.registration;
  if (!reg) return NextResponse.json({ ok: true });

  if (reg.deleteUrl) {
    const tokens = await getVaultTokens(it.appName, { connectionId: it.id, userId: it.userId });
    const guard = await assertConnectorUrl(reg.deleteUrl, "cloud");
    if (tokens && guard.ok) {
      await fetch(reg.deleteUrl, {
        method: "DELETE",
        headers: { authorization: `Bearer ${tokens.accessToken}` },
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      }).catch(() => {});
    }
  }
  flow.trigger.registration = undefined;
  await saveFlow(flow);
  return NextResponse.json({ ok: true, registration: null });
}

async function record(flow: Flow, registration: NonNullable<Flow["trigger"]["registration"]>): Promise<Response> {
  flow.trigger.registration = registration;
  await saveFlow(flow);
  return NextResponse.json({ ok: registration.state === "registered", registration });
}
