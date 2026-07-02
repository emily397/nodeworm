import { NextResponse } from "next/server";
import { getIntegration, saveIntegration } from "@/lib/store";
import { recipeForApp } from "@/lib/engine/execute/recipes";
import { storeConnector, vaultStatus } from "@/lib/engine/vault";
import { recompute } from "@/lib/engine/orchestrate";
import { currentUserId } from "@/lib/engine/auth";
import type { ExecutionResult } from "@/lib/engine/execute/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The NodeWorm Agent reports the result of running a signed plan. Authenticated by
// the one-time callback token issued with the plan (only the Agent that received the
// plan holds it). On success NodeWorm records the now-running local connector exactly
// like a self-hosted one (reachable from the user's machine via the Helper extension)
// and flips to connected-via-connector.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getIntegration(id);
  if (!it) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const body = (await req.json().catch(() => ({}))) as { result?: ExecutionResult; callbackToken?: string };
  const token = bearer || body.callbackToken || "";
  const result = body.result;

  const ex = it.execution;
  if (!ex || !result) return NextResponse.json({ error: "No active execution." }, { status: 400 });
  if (Date.now() > ex.expiresAt) {
    it.execution = undefined;
    await saveIntegration(it);
    return NextResponse.json({ error: "This execution plan has expired." }, { status: 410 });
  }
  if (token !== ex.callbackToken || result.planId !== ex.planId) {
    return NextResponse.json({ error: "Invalid execution token." }, { status: 403 });
  }

  // One-time: consume the handshake so a result can't be replayed.
  it.execution = undefined;

  if (!result.ok || !result.connectorReachable) {
    await saveIntegration(it);
    return NextResponse.json({ ok: false, detail: result.detail ?? "Setup did not complete." });
  }

  // Tunnel result: the Agent claims a public URL now fronts the local connector.
  // Never trusted as-is: the cloud makes its own real GET (SSRF-guarded) and only
  // records reachable-from-cloud when that succeeds.
  if (result.tunnelUrl) {
    if (!/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(result.tunnelUrl)) {
      await saveIntegration(it);
      return NextResponse.json({ ok: false, detail: "Reported tunnel URL is not a trycloudflare.com origin." });
    }
    const { verifyConnector } = await import("@/lib/engine/connector");
    const check = await verifyConnector(result.tunnelUrl, undefined, "cloud");
    if (!check.ok) {
      await saveIntegration(it);
      return NextResponse.json({ ok: false, detail: `Tunnel reported up but the cloud could not reach it: ${check.detail ?? "no response"}.` });
    }
    const vsT = vaultStatus();
    if (vsT.available) {
      const userId = await currentUserId(req);
      await storeConnector(it.appName, { connectionId: id, userId }, result.tunnelUrl, undefined);
    }
    it.connector = {
      host: new URL(result.tunnelUrl).host,
      healthPath: check.path,
      hasToken: false,
      reachableFrom: "cloud",
      private: false,
      verified: true,
      verifiedDetail: `${check.detail ?? "verified"} via quick tunnel (ephemeral URL; re-tunnel after restarts)`,
      verifiedAt: Date.now(),
      methodName: it.research?.best?.name ?? it.generated?.connectorName ?? "local connector",
      methodKind: it.research?.best?.kind ?? "rest-wrapper",
    };
    recompute(it);
    await saveIntegration(it);
    return NextResponse.json({ ok: true, tunnel: true, detail: it.connector.verifiedDetail });
  }

  const recipe = recipeForApp(it.appName);
  const host = `localhost:${recipe?.port ?? 8080}`;
  const url = `http://${host}`;

  // The Agent already verified the connector live on the user's machine. It is on
  // localhost (the cloud can't reach it), so it is recorded reachable-from-extension,
  // matching the existing localhost-connector model.
  const vs = vaultStatus();
  if (vs.available) {
    const userId = await currentUserId(req);
    await storeConnector(it.appName, { connectionId: id, userId }, url, undefined);
  }

  it.connector = {
    host,
    healthPath: recipe?.healthPath,
    hasToken: false,
    reachableFrom: "extension",
    private: true,
    verified: true,
    verifiedDetail: result.detail ?? "NodeWorm Agent set it up and verified it locally",
    verifiedAt: Date.now(),
    registeredHint: result.steps?.find((s) => s.detail?.includes("linked"))?.detail,
    methodName: it.research?.best?.name ?? recipe?.connectorName,
    methodKind: it.research?.best?.kind ?? "rest-wrapper",
  };
  recompute(it); // status -> connected-via-connector
  await saveIntegration(it);

  return NextResponse.json({ ok: true });
}
