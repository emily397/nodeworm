import { NextResponse } from "next/server";
import { getIntegration, saveIntegration } from "@/lib/store";
import { cobrowseStatus, createSession } from "@/lib/engine/cobrowse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Spin up a hosted Browserbase browser, pre-navigated to the provider's portal,
// and return its interactive live-view URL. The connectUrl is stored server-side
// (on the integration) for the later capture step; never sent to the client.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getIntegration(id);
  if (!it) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Gated portals: never automate a blocked one, and require recorded consent for
  // anything above low risk. The original allowlisted apps carry no portalAutomation
  // and are unaffected.
  const pa = it.recovery?.portalAutomation;
  if (pa) {
    if (pa.risk === "blocked" || pa.allowAutomation === false) {
      return NextResponse.json({ error: pa.caveat }, { status: 409 });
    }
    if (pa.risk !== "low" && it.portalConsent?.app !== it.appName) {
      return NextResponse.json({ error: `Automating ${it.appName}'s portal needs your explicit consent.`, caveat: pa.caveat }, { status: 403 });
    }
  }

  const vs = cobrowseStatus();
  if (!vs.available) return NextResponse.json({ error: vs.reason }, { status: 503 });

  const sess = await createSession(it.recovery?.portalUrl ?? "");
  if ("error" in sess) return NextResponse.json({ error: sess.error }, { status: 502 });

  it.cobrowse = { sessionId: sess.sessionId, connectUrl: sess.connectUrl, liveViewUrl: sess.liveViewUrl, startedAt: Date.now() };
  await saveIntegration(it);
  return NextResponse.json({ liveViewUrl: sess.liveViewUrl });
}
