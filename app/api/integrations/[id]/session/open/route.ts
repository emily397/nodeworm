import { NextResponse } from "next/server";
import { getIntegration, saveIntegration } from "@/lib/store";
import { cobrowseStatus, createAppSession, createContext } from "@/lib/engine/cobrowse";
import type { Integration } from "@/lib/engine/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Open a hosted browser at the app itself so the user can log in. The auth
// persists in a Browserbase Context (durable, encrypted) reused on every re-open.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getIntegration(id);
  if (!it) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const vs = cobrowseStatus();
  if (!vs.available) return NextResponse.json({ error: vs.reason }, { status: 503 });

  const contextId = it.managedSession?.contextId ?? (await createContext());
  const sess = await createAppSession(appUrl(it), contextId);
  if ("error" in sess) return NextResponse.json({ error: sess.error }, { status: 502 });

  it.managedSession = {
    contextId,
    sessionId: sess.sessionId,
    connectUrl: sess.connectUrl,
    liveViewUrl: sess.liveViewUrl,
    provider: sess.provider,
    startedAt: Date.now(),
    verified: it.managedSession?.verified,
    verifiedDetail: it.managedSession?.verifiedDetail,
  };
  await saveIntegration(it);
  return NextResponse.json({ liveViewUrl: sess.liveViewUrl, provider: sess.provider });
}

// Land the hosted browser on a real AUTHENTICATION screen, never the marketing
// homepage. Priority: the app's known login / web-client URL (web.whatsapp.com,
// notion.so/login, ...), then a discovered OAuth/SSO consent screen, then a search
// that lands on the app's login. Marketing origins (appUrl/docsUrl) are deliberately
// NOT used as the target: opening signal.org is useless, the user needs a sign-in.
function appUrl(it: Integration): string {
  const auth = it.discovery?.loginUrl || it.discovery?.oauthAuthorizeUrl;
  if (auth) return auth;
  return `https://www.google.com/search?q=${encodeURIComponent(`${it.appName} log in`)}`;
}
