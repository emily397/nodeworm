import { NextResponse } from "next/server";
import { getIntegration } from "@/lib/store";
import { storeClientCreds, vaultStatus } from "@/lib/engine/vault";
import { currentUserId, requireVaultUnlock } from "@/lib/engine/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Returns the guided recipe (portal link, redirect URI, scopes, steps). Never a
// secret: the recipe is only instructions.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getIntegration(id);
  if (!it) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ recipe: it.recovery ?? null });
}

// Accepts the client id/secret the user registered on the provider's portal and
// stores them encrypted in the vault. The browser then re-hits /oauth/start,
// which now resolves the vault client and runs the real consent.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getIntegration(id);
  if (!it) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { clientId?: string; clientSecret?: string };
  const clientId = body.clientId?.trim();
  const clientSecret = body.clientSecret?.trim();
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "Provide both the client ID and client secret." }, { status: 400 });
  }

  const vs = vaultStatus();
  if (!vs.available) {
    return NextResponse.json({ error: vs.reason }, { status: 503 });
  }

  if (!(await requireVaultUnlock(req))) {
    return NextResponse.json({ error: "Unlock your vault with your PIN to continue.", pin: "required" }, { status: 403 });
  }

  const userId = await currentUserId(req);
  const ok = await storeClientCreds(it.appName, { connectionId: id, userId }, clientId, clientSecret, "guided");
  if (!ok) return NextResponse.json({ error: "Could not store credentials." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
