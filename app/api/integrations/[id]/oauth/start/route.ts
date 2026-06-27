import { NextResponse } from "next/server";
import { getIntegration, saveIntegration } from "@/lib/store";
import { buildAuthorizeUrl, pkcePair, randomState } from "@/lib/engine/oauth";
import { resolveClient } from "@/lib/engine/recovery/resolve";
import { currentUserId, requireVaultUnlock } from "@/lib/engine/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getIntegration(id);
  if (!it) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const origin = new URL(req.url).origin;
  const back = (q: string) => NextResponse.redirect(`${origin}/run/${id}?${q}`);

  // PIN gate: a signed-in user who set a vault PIN must unlock before NodeWorm
  // reads or writes their stored credentials. The run page opens the unlock modal
  // and re-hits this route once a grant is held.
  if (!(await requireVaultUnlock(req))) return back("pin=required");

  // Self-recovering resolver replaces the old "OAuth app not configured" dead-end:
  // env -> encrypted vault -> dynamic registration -> guided portal -> honest block.
  const userId = await currentUserId(req);
  const r = await resolveClient(it, { origin, connectionId: id, userId });

  if (r.kind === "blocked") {
    it.recovery = undefined;
    await saveIntegration(it);
    return back(`oauth=blocked&reason=${encodeURIComponent(r.reason)}`);
  }
  if (r.kind === "recover") {
    it.recovery = r.recipe;
    await saveIntegration(it);
    return back("recover=1");
  }

  // ready: run the genuine Authorization Code (+ PKCE) consent.
  const state = randomState();
  const redirectUri = `${origin}/api/integrations/${id}/oauth/callback`;
  const pkce = r.provider.pkce ? pkcePair() : undefined;

  it.recovery = undefined;
  it.oauth = { state, verifier: pkce?.verifier, redirectUri, startedAt: Date.now() };
  await saveIntegration(it);

  const authorizeUrl = buildAuthorizeUrl({
    appName: it.appName,
    provider: r.provider,
    creds: r.creds,
    redirectUri,
    state,
    challenge: pkce?.challenge,
  });
  return NextResponse.redirect(authorizeUrl);
}
