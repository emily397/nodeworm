import { NextResponse } from "next/server";
import { getIntegration, getOwnedIntegration, saveIntegration } from "@/lib/store";
import { appendInboundEvent, parseInbound, tokenMatches, type InboundConfig } from "@/lib/engine/inbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The public webhook RECEIVER. The third-party app POSTs events here to the secret
// URL NodeWorm issued (path id + ?k=<token>). Not owner-scoped: the caller is the
// app, not the user. Auth is the token in the URL; without it, nothing is accepted.
// Answers the registration challenge handshake, then records a bounded event log.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getIntegration(id);
  if (!it?.inbound) return NextResponse.json({ error: "Inbound webhooks are not enabled for this integration." }, { status: 404 });

  const url = new URL(req.url);
  const token = url.searchParams.get("k") ?? req.headers.get("x-nodeworm-token");
  if (!tokenMatches(it.inbound.token, token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => undefined);
  const parsed = parseInbound(body, url.searchParams.get("challenge"));

  // Registration handshake: echo the challenge value verbatim (works for generic
  // ?challenge= verifiers and Slack-style url_verification), record nothing.
  if (parsed.challenge) {
    return new Response(parsed.challenge, { status: 200, headers: { "content-type": "text/plain" } });
  }

  it.inbound = appendInboundEvent(it.inbound, parsed.summary, Date.now());
  await saveIntegration(it);
  return NextResponse.json({ ok: true });
}

// Owner-scoped: return the inbound config, issuing the secret URL on first call when
// the wire actually chose webhooks. The token is returned ONLY as part of the full
// webhookUrl the user copies into the app; redactIntegration keeps it off the record's
// generic client reads.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getOwnedIntegration(req, id);
  if (!it) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (it.wire?.inboundMethod !== "webhooks") {
    return NextResponse.json({ ok: false, error: "This integration's inbound method is not webhooks." }, { status: 400 });
  }

  if (!it.inbound) {
    const cfg: InboundConfig = { token: newToken(), createdAt: Date.now(), events: [] };
    it.inbound = cfg;
    await saveIntegration(it);
  }

  const origin = new URL(req.url).origin;
  const webhookUrl = `${origin}/api/integrations/${id}/inbound?k=${it.inbound.token}`;
  return NextResponse.json({
    ok: true,
    webhookUrl,
    events: it.inbound.events,
    lastEventAt: it.inbound.lastEventAt,
  });
}

function newToken(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, "") + globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}
