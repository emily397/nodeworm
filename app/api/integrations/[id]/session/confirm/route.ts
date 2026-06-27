import { NextResponse } from "next/server";
import { getIntegration, saveIntegration } from "@/lib/store";
import { releaseSession, verifySession } from "@/lib/engine/cobrowse";
import { recompute } from "@/lib/engine/orchestrate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Verify the managed session is live + on the app (one real read), then mark the
// integration connected-via-session and release the live session (the login
// persists in the Context for future re-opens / syncs).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getIntegration(id);
  if (!it) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!it.managedSession?.connectUrl) return NextResponse.json({ error: "No active managed session." }, { status: 400 });

  const v = await verifySession(it.managedSession.connectUrl);
  if (!v.ok) {
    const why = v.reason ? ` (${v.reason})` : "";
    return NextResponse.json({ ok: false, error: `Not connected yet${why}. Finish signing in inside the hosted browser, then try again.` });
  }

  const sessionId = it.managedSession.sessionId;
  const provider = it.managedSession.provider;
  it.managedSession = { contextId: it.managedSession.contextId, startedAt: it.managedSession.startedAt, verified: true, verifiedDetail: v.detail, provider };
  recompute(it); // status -> connected-via-session
  await saveIntegration(it);
  if (sessionId) await releaseSession(sessionId, provider);

  return NextResponse.json({ ok: true, detail: v.detail });
}
