import { NextResponse } from "next/server";
import { getIntegration, saveIntegration } from "@/lib/store";
import { captureCreds, releaseSession } from "@/lib/engine/cobrowse";
import { storeClientCreds } from "@/lib/engine/vault";
import { currentUserId, requireVaultUnlock } from "@/lib/engine/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Connect to the running hosted session, fill the redirect URI, and scrape the
// client id/secret the user just created. On success store them (per-user vault)
// and release the session. On a partial scrape, return what was found so the
// recovery card can prefill its manual fields.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getIntegration(id);
  if (!it) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!it.cobrowse?.connectUrl) return NextResponse.json({ error: "No active hosted browser session." }, { status: 400 });

  // Same gate as open (belt-and-braces): a direct capture POST cannot bypass consent.
  const pa = it.recovery?.portalAutomation;
  if (pa) {
    if (pa.risk === "blocked" || pa.allowAutomation === false) {
      return NextResponse.json({ error: pa.caveat }, { status: 409 });
    }
    if (pa.risk !== "low" && it.portalConsent?.app !== it.appName) {
      return NextResponse.json({ error: `Automating ${it.appName}'s portal needs your explicit consent.`, caveat: pa.caveat }, { status: 403 });
    }
  }

  if (!(await requireVaultUnlock(req))) {
    return NextResponse.json({ ok: false, error: "Unlock your vault with your PIN to continue.", pin: "required" }, { status: 403 });
  }

  const redirectUri = it.recovery?.redirectUri ?? `${new URL(req.url).origin}/api/integrations/${id}/oauth/callback`;
  const { clientId, clientSecret } = await captureCreds(it.cobrowse.connectUrl, redirectUri);

  if (clientId && clientSecret) {
    const userId = await currentUserId(req);
    await storeClientCreds(it.appName, { connectionId: id, userId }, clientId, clientSecret, "cloud");
    await releaseSession(it.cobrowse.sessionId);
    it.cobrowse = undefined;
    await saveIntegration(it);
    return NextResponse.json({ ok: true });
  }

  // Couldn't read both fields automatically. Never return the scraped secret to
  // the browser; the user finishes via the manual fields (server keeps nothing).
  return NextResponse.json({ ok: false });
}
