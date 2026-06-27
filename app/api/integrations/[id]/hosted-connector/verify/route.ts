import { NextResponse } from "next/server";
import { getIntegration, saveIntegration } from "@/lib/store";
import { hostedSpecForApp, hostedBaseUrl, hostedToken, pollLinkedNumber } from "@/lib/engine/hosted-connectors";
import { verifyConnector } from "@/lib/engine/connector";
import { storeConnector, vaultStatus } from "@/lib/engine/vault";
import { recompute } from "@/lib/engine/orchestrate";
import { currentUserId, requireVaultUnlock } from "@/lib/engine/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Poll the NodeWorm-hosted bridge for a completed device link. Once the user has
// scanned the QR (a number appears in the bridge's accounts), NodeWorm verifies the
// bridge with one real GET, stores {url, token} encrypted, and flips the status to
// connected-via-connector. Mirrors connector/connect + session/confirm.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getIntegration(id);
  if (!it) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const spec = hostedSpecForApp(it.appName);
  const base = spec ? hostedBaseUrl(spec) : undefined;
  if (!spec || !base) return NextResponse.json({ error: `No hosted bridge is configured for ${it.appName}.` }, { status: 503 });

  if (spec.consentGated && it.connectorConsent?.app !== it.appName) {
    return NextResponse.json({ ok: false, error: "Consent required before linking.", needsConsent: true }, { status: 403 });
  }
  if (!(await requireVaultUnlock(req))) {
    return NextResponse.json({ ok: false, error: "Unlock your vault with your PIN to continue.", pin: "required" }, { status: 403 });
  }

  const number = await pollLinkedNumber(spec);
  if (!number) {
    return NextResponse.json({ ok: false, error: "Not linked yet. Scan the QR in the app's Linked devices; it connects automatically once the link completes." });
  }

  // One real read proves the bridge is live before we claim a connection.
  const token = hostedToken(spec);
  const v = await verifyConnector(base, token, "cloud");
  if (!v.ok) {
    return NextResponse.json({ ok: false, error: `Linked ${number}, but couldn't verify the bridge (${v.detail}).` });
  }

  // Persist {url, token} encrypted (the token is the one the OPERATOR set on the
  // bridge, never the user's third-party key). Without the vault we still report the
  // verified read but don't claim a durable connection.
  const vs = vaultStatus();
  if (vs.available) {
    const userId = await currentUserId(req);
    await storeConnector(it.appName, { connectionId: id, userId }, base, token);
  }

  it.connector = {
    host: v.host ?? new URL(base).host,
    healthPath: v.path,
    hasToken: Boolean(token),
    reachableFrom: "cloud",
    private: false,
    verified: true,
    verifiedDetail: v.detail,
    verifiedAt: Date.now(),
    registeredHint: `${number} linked`,
    methodName: spec.name,
    methodKind: spec.kind,
  };
  recompute(it); // status -> connected-via-connector, methodKind -> live
  await saveIntegration(it);

  return NextResponse.json({ ok: true, detail: v.detail, number });
}
