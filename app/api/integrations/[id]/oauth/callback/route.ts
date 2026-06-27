import { NextResponse } from "next/server";
import { addSecret, getIntegration, saveIntegration } from "@/lib/store";
import { recompute } from "@/lib/engine/orchestrate";
import { clientCreds, exchangeCode, providerFor, slug } from "@/lib/engine/oauth";
import { storeTokens } from "@/lib/engine/vault";
import { currentUserId } from "@/lib/engine/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getIntegration(id);
  if (!it) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const origin = new URL(req.url).origin;
  const url = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(`${origin}/run/${id}?${q}`);

  const providerError = url.searchParams.get("error");
  if (providerError) return back(`oauth=error&reason=${encodeURIComponent(providerError)}`);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !it.oauth || state !== it.oauth.state) {
    return back(`oauth=error&reason=${encodeURIComponent("Invalid or expired authorization state.")}`);
  }

  // The handshake is single-use: capture its parameters, then clear and persist
  // it before any token exchange. A replayed callback (same code + state) now
  // fails the state check above instead of triggering a second exchange.
  const handshake = it.oauth;
  it.oauth = undefined;
  await saveIntegration(it);

  // Authorization codes are short-lived; treat a consent older than 10 minutes
  // as expired rather than attempting an exchange the provider will reject.
  if (Date.now() - handshake.startedAt > 10 * 60 * 1000) {
    return back(`oauth=error&reason=${encodeURIComponent("Authorization expired. Start the connection again.")}`);
  }

  const userId = await currentUserId(req);
  const provider = providerFor(it.appName, it.discovery);
  const creds = await clientCreds(it.appName, { connectionId: id, userId });
  if (!provider || !creds) return back(`oauth=error&reason=${encodeURIComponent("OAuth app no longer configured.")}`);

  const result = await exchangeCode({
    provider,
    creds,
    code,
    redirectUri: handshake.redirectUri,
    verifier: handshake.verifier,
  });
  if (!result.ok) return back(`oauth=error&reason=${encodeURIComponent(result.error ?? "Token exchange failed.")}`);

  // Retain the real tokens encrypted in the vault (this is the first place a
  // usable token is kept; the secrets list below is masked, display-only).
  await storeTokens(it.appName, { connectionId: id, userId }, result.accessToken!, result.refreshToken, "oauth");

  const s = slug(it.appName);
  addSecret(it, `${s}_ACCESS_TOKEN`, result.accessToken!);
  if (result.refreshToken) addSecret(it, `${s}_REFRESH_TOKEN`, result.refreshToken);
  it.recovery = undefined; // consent succeeded; clear the guided recipe
  recompute(it);
  await saveIntegration(it);

  return back("oauth=connected");
}
