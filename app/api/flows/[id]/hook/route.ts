import { NextResponse } from "next/server";
import { parseInbound, tokenMatches } from "@/lib/engine/inbound";
import { fireFlow } from "@/lib/flow/runtime";
import { getFlow } from "@/lib/flow/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// The public trigger. The third-party app calls the secret URL NodeWorm issued
// (?k=<token>). Not owner-scoped: the caller is the app. Constant-time token
// check; answers registration challenge handshakes; then actually runs the flow.
async function handle(req: Request, id: string): Promise<Response> {
  const flow = await getFlow(id);
  if (!flow?.trigger.token) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(req.url);
  const token = url.searchParams.get("k") ?? req.headers.get("x-nodeworm-token");
  if (!tokenMatches(flow.trigger.token, token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = req.method === "POST" ? await req.json().catch(() => undefined) : undefined;
  const parsed = parseInbound(body, url.searchParams.get("challenge"));
  if (parsed.challenge) {
    return new Response(parsed.challenge, { status: 200, headers: { "content-type": "text/plain" } });
  }

  if (!flow.enabled) return NextResponse.json({ ok: false, error: "This flow is paused." }, { status: 409 });
  const run = await fireFlow(flow, { type: "webhook", summary: parsed.summary, payload: body ?? {} });
  return NextResponse.json({ ok: true, runId: run.id, status: run.status });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(req, id);
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(req, id);
}
