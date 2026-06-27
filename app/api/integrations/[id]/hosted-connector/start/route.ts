import { NextResponse } from "next/server";
import { getIntegration, saveIntegration } from "@/lib/store";
import { hostedSpecForApp, hostedBaseUrl, fetchLinkQr } from "@/lib/engine/hosted-connectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Start a device link on the NodeWorm-hosted bridge for this app (e.g. the Signal
// bridge). Records the user's explicit consent first (messaging bridges hold a
// device link and read/send on their account), then returns the link QR to scan.
// The bridge URL and token never reach the client.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getIntegration(id);
  if (!it) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const spec = hostedSpecForApp(it.appName);
  if (!spec || !hostedBaseUrl(spec)) {
    return NextResponse.json({ error: `No hosted bridge is configured for ${it.appName}.` }, { status: 503 });
  }

  // Consent gate: a hosted messaging bridge can read and send on the user's account,
  // so NodeWorm records explicit consent before opening a link.
  const body = (await req.json().catch(() => ({}))) as { consent?: boolean };
  if (spec.consentGated) {
    if (body.consent === true && it.connectorConsent?.app !== it.appName) {
      it.connectorConsent = { app: it.appName, grantedAt: Date.now() };
      await saveIntegration(it);
    }
    if (it.connectorConsent?.app !== it.appName) {
      return NextResponse.json(
        { ok: false, error: `Linking ${it.appName} through a hosted bridge needs your explicit consent.`, needsConsent: true },
        { status: 403 },
      );
    }
  }

  const qr = await fetchLinkQr(spec);
  if (!qr.ok) return NextResponse.json({ ok: false, error: qr.error }, { status: 502 });
  return NextResponse.json({ ok: true, qrDataUrl: qr.qrDataUrl, qrUri: qr.qrUri, deviceName: spec.deviceName, appName: it.appName });
}
