import { NextResponse } from "next/server";
import { getOwnedIntegration, saveIntegration } from "@/lib/store";
import { buildSignedTunnelPlan } from "@/lib/engine/execute/plan";
import { recipeForApp } from "@/lib/engine/execute/recipes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Issue a signed tunnel plan: the NodeWorm Agent exposes the user's LOCAL connector
// (localhost/LAN, unreachable from the cloud) through a hash-pinned cloudflared
// quick tunnel. Reachability is only ever claimed after the callback route makes
// one real GET from the cloud to the reported public URL.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getOwnedIntegration(req, id);
  if (!it) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { port?: number; healthPath?: string };
  // Port priority: explicit request -> the recorded local connector -> the app's
  // recipe port -> the generated bundle's default HTTP port.
  const connectorPort = it.connector?.private ? Number(it.connector.host.split(":")[1]) : undefined;
  const port = body.port ?? connectorPort ?? recipeForApp(it.appName)?.port ?? (it.generated ? 8787 : undefined);
  if (!port || !Number.isInteger(port) || port < 1 || port > 65535) {
    return NextResponse.json({ error: "No local connector port to tunnel. Pass { port }." }, { status: 400 });
  }
  const healthPath = (body.healthPath ?? it.connector?.healthPath ?? recipeForApp(it.appName)?.healthPath ?? "/health").trim();

  const origin = new URL(req.url).origin;
  const built = buildSignedTunnelPlan(it, origin, port, healthPath.startsWith("/") ? healthPath : `/${healthPath}`);
  if (!built) return NextResponse.json({ error: "Tunnel plans are unavailable (signing not configured)." }, { status: 503 });

  it.execution = {
    planId: built.plan.id,
    callbackToken: built.callbackToken,
    createdAt: built.plan.createdAt,
    expiresAt: built.plan.expiresAt,
  };
  await saveIntegration(it);

  return NextResponse.json({ ok: true, envelope: built.envelope, plan: built.plan });
}
