import { NextResponse } from "next/server";
import { getIntegration, saveIntegration } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Record the user's explicit consent to automate a gated developer portal, after
// they have seen the accurate ToS/account-risk caveat. This route only RECORDS
// consent (it.portalConsent + a recoveryAttempts entry); the cobrowse open/capture
// routes enforce it. A "blocked" / allowAutomation:false portal can never consent.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getIntegration(id);
  if (!it) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const pa = it.recovery?.portalAutomation;
  if (!pa || pa.risk === "blocked" || pa.allowAutomation === false) {
    return NextResponse.json(
      { error: "This portal can't be automated. Create the app yourself and paste the credentials.", caveat: pa?.caveat },
      { status: 409 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { surface?: "cobrowse" | "extension" };
  const surface = body.surface === "extension" ? "extension" : "cobrowse";

  it.portalConsent = { app: it.appName, risk: pa.risk, grantedAt: Date.now(), surface };
  it.recoveryAttempts = [
    ...(it.recoveryAttempts ?? []),
    { tier: surface === "extension" ? "extension" : "cloud", at: Date.now(), outcome: "used", reason: `portal-automation consent (risk=${pa.risk})` },
  ];
  await saveIntegration(it);
  return NextResponse.json({ ok: true });
}
