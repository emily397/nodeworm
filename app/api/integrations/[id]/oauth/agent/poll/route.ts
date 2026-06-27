import { NextResponse } from "next/server";
import { getIntegration, saveIntegration } from "@/lib/store";
import { pollPortalRegistration, stopPortalRegistration } from "@/lib/engine/browseruse";
import { storeClientCreds } from "@/lib/engine/vault";
import { currentUserId, requireVaultUnlock } from "@/lib/engine/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Poll the running AI browser agent. While it works we return its live status
// (running / needs_login) plus the last step for progress. When it has produced the
// client id/secret we require a vault unlock, store them encrypted (per-user), stop
// the run, and tell the client to start the genuine consent. The secret is NEVER
// returned to the browser. keepAlive on the run keeps its output readable, so if the
// vault is locked at the moment creds appear, the user unlocks and we re-poll.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getIntegration(id);
  if (!it) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!it.agentRun) return NextResponse.json({ error: "No active agent run." }, { status: 400 });

  const { taskId, provider } = it.agentRun;
  const poll = await pollPortalRegistration(taskId, provider);

  if (poll.state === "creds_ready" && poll.clientId && poll.clientSecret) {
    if (!(await requireVaultUnlock(req))) {
      // Hold here: do not return the secret. The user unlocks and re-polls; the run's
      // output is still readable (keepAlive), so the creds are recaptured then.
      return NextResponse.json({ ok: false, state: "creds_ready", pin: "required" });
    }
    const userId = await currentUserId(req);
    await storeClientCreds(it.appName, { connectionId: id, userId }, poll.clientId, poll.clientSecret, "cloud");
    await stopPortalRegistration(taskId, provider).catch(() => {});
    it.agentRun = undefined;
    await saveIntegration(it);
    return NextResponse.json({ ok: true, state: "creds_ready" });
  }

  if (poll.state === "blocked" || poll.state === "failed") {
    await stopPortalRegistration(taskId, provider).catch(() => {});
    it.agentRun = undefined;
    await saveIntegration(it);
  }

  return NextResponse.json({ ok: false, state: poll.state, step: poll.step, note: poll.note });
}
