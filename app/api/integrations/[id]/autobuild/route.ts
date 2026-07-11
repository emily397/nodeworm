import { NextResponse } from "next/server";
import { getOwnedIntegration, saveIntegration } from "@/lib/store";
import { runAutobuild } from "@/lib/engine/autobuild";
import { captureForIntegration } from "@/lib/engine/capture-pipeline";
import { generateForIntegration } from "@/lib/engine/generate-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The autonomy loop, one call: capture the app's real traffic from the live managed
// session, then generate a typed connector from it. Per-step status is persisted on
// the record after every transition, so a client polling the integration sees honest
// live progress and the loop is resumable. Build / tunnel / verify stay on the local
// Agent (they need a folder only the user's machine knows).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getOwnedIntegration(req, id);
  if (!it) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!it.discovery || !it.wire) {
    return NextResponse.json({ error: "Run the pipeline first: the autonomy loop needs the discovered surface." }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { windowMs?: number };

  const state = await runAutobuild({
    now: () => Date.now(),
    // Capture is best-effort: with no managed session, skip it and let generation
    // fall back to the discovered spec rather than failing the whole loop.
    capture: async () => {
      if (!it.managedSession?.connectUrl) {
        return { skipped: true, detail: "No managed session open; generating from the discovered spec instead." };
      }
      const r = await captureForIntegration(it, Number(body.windowMs) || 20000);
      return { detail: `Captured ${r.captured} calls, ${r.endpoints} real endpoints${r.apiBase ? ` on ${r.apiBase}` : ""}.` };
    },
    generate: async () => {
      const g = await generateForIntegration(it, {});
      const src = g.specSource === "har" ? "captured traffic" : g.specSource === "none" ? "conventions" : g.specSource;
      return { detail: `Generated ${g.connectorName} (${g.openApiOps} tools from ${src}).` };
    },
    // Persist the whole record after every transition so live progress is honest and
    // the loop is resumable from the true point reached.
    persist: async (s) => {
      it.autobuild = s;
      await saveIntegration(it);
    },
  });

  return NextResponse.json({ ok: state.ok, autobuild: state, status: it.status, generated: Boolean(it.generated) });
}
