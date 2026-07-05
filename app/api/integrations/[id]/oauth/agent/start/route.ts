import { NextResponse } from "next/server";
import { getIntegration, saveIntegration } from "@/lib/store";
import { agentDriverStatus, startPortalRegistration } from "@/lib/engine/browseruse";
import { resolvePortalUrl } from "@/lib/engine/recovery/portal-resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Launch the AI browser agent to register the OAuth app on the provider's portal.
// Returns the live-view URL, which the client embeds in an iframe inside NodeWorm:
// the user signs in there if asked; the agent does navigation, app creation, redirect
// URI and scopes, and reads back the keys. The taskId is stored server-side for the
// poll step. Same consent gate as cobrowse: a blocked portal is never automated, and
// anything above low risk needs recorded consent first.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getIntegration(id);
  if (!it) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const pa = it.recovery?.portalAutomation;
  if (pa) {
    if (pa.risk === "blocked" || pa.allowAutomation === false) {
      return NextResponse.json({ error: pa.caveat }, { status: 409 });
    }
    if (pa.risk !== "low" && it.portalConsent?.app !== it.appName) {
      return NextResponse.json({ error: `Automating ${it.appName}'s portal needs your explicit consent.`, caveat: pa.caveat }, { status: 403 });
    }
  }

  const status = agentDriverStatus();
  if (!status.available) return NextResponse.json({ error: status.reason }, { status: 503 });

  const recipe = it.recovery;
  if (!recipe?.portalUrl) return NextResponse.json({ error: "No developer portal is known for this app yet." }, { status: 400 });
  const redirectUri = recipe.redirectUri ?? `${new URL(_req.url).origin}/api/integrations/${id}/oauth/callback`;

  // The stored portalUrl is often a guessed API path (e.g. app/api/v4/applications)
  // that 404s in a browser. Validate it and, if it's an API/dead URL, discover the
  // app's real registration page by search so the agent starts somewhere it can act.
  const { url: portalUrl } = await resolvePortalUrl(it.appName, recipe.portalUrl);

  const run = await startPortalRegistration({
    portalUrl,
    appName: it.appName,
    redirectUri,
    scopes: recipe.scopes ?? [],
  });
  if ("error" in run) return NextResponse.json({ error: run.error }, { status: 502 });

  it.agentRun = { taskId: run.taskId, liveViewUrl: run.liveViewUrl, provider: run.provider, startedAt: Date.now() };
  await saveIntegration(it);
  return NextResponse.json({ liveViewUrl: run.liveViewUrl, provider: run.provider });
}
