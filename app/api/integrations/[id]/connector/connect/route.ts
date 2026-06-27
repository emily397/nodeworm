import { NextResponse } from "next/server";
import { getIntegration, saveIntegration } from "@/lib/store";
import { verifyConnector } from "@/lib/engine/connector";
import { storeConnector, vaultStatus } from "@/lib/engine/vault";
import { recompute } from "@/lib/engine/orchestrate";
import { currentUserId, requireVaultUnlock } from "@/lib/engine/auth";
import { KNOWLEDGE } from "@/lib/engine/knowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// A researched connector goes LIVE: the user set up the recommended self-hosted
// connector (e.g. signal-cli-rest-api) and points NodeWorm at it. NodeWorm makes
// ONE real GET to verify it is reachable, stores {url, token} encrypted (the token
// is the one the user set on THEIR OWN wrapper, never the app's API key), and
// flips the status to connected-via-connector. Mirrors session/confirm.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getIntegration(id);
  if (!it) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // The connector path is the primary method for a genuine no-web-UI app
  // (connectMethod "researched-connector") AND the optional advanced alternative a
  // technical user can opt into when the primary method is a managed session. Both
  // require that the Pathfinder actually found a connector to point at.
  if (!it.research?.best) {
    return NextResponse.json({ error: "No researched connector for this integration." }, { status: 400 });
  }
  if (!(await requireVaultUnlock(req))) {
    return NextResponse.json({ ok: false, error: "Unlock your vault with your PIN to continue.", pin: "required" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { url?: string; token?: string; healthPath?: string };
  const url = (body.url ?? "").trim();
  const token = (body.token ?? "").trim() || undefined;
  const healthPath = (body.healthPath ?? "").trim() || undefined;
  if (!url) return NextResponse.json({ ok: false, error: "Enter your connector's URL." });

  // Banned-key deflection: if the URL host is a known first-party SaaS API host
  // that has a genuine OAuth path, this is not a self-hosted connector, it is the
  // app's own API. NodeWorm does not store third-party API keys: steer to OAuth.
  const saas = bannedSaasHost(url);
  if (saas) {
    return NextResponse.json({
      ok: false,
      error: `That looks like ${saas}'s own API host. NodeWorm doesn't store third-party API keys. Connect with ${saas} to authorize via its real login instead.`,
    });
  }

  let target = url;
  if (healthPath) {
    try {
      target = new URL(healthPath, url).toString();
    } catch {
      /* let verifyConnector report the invalid URL */
    }
  }

  const v = await verifyConnector(target, token, "cloud");
  if (!v.ok) {
    const isPrivate = v.detail === "private";
    return NextResponse.json({
      ok: false,
      error: isPrivate
        ? "That address is on a private network NodeWorm's cloud can't reach. Expose it over https (a tunnel like Cloudflare Tunnel or Tailscale Funnel), or verify it from the NodeWorm Helper on your own machine."
        : v.detail,
      needsExtension: isPrivate,
    });
  }

  // Verified. Persist {url, token} encrypted. Without the vault we still report the
  // verified read, but a token can't be stored, so we don't claim a durable connection.
  const vs = vaultStatus();
  if (!vs.available && token) {
    return NextResponse.json({
      ok: false,
      error: `Reached your connector (${v.detail}), but the credential vault is not configured (${vs.reason}), so the token can't be stored.`,
      verifiedButUnpersisted: true,
    });
  }
  if (vs.available) {
    const userId = await currentUserId(req);
    await storeConnector(it.appName, { connectionId: id, userId }, target, token);
  }

  it.connector = {
    host: v.host ?? new URL(target).host,
    healthPath: v.path,
    hasToken: Boolean(token),
    reachableFrom: "cloud",
    private: false,
    verified: true,
    verifiedDetail: v.detail,
    verifiedAt: Date.now(),
    registeredHint: v.registeredHint,
    methodName: it.research?.best?.name,
    methodKind: it.research?.best?.kind,
  };
  recompute(it); // status -> connected-via-connector, methodKind -> live
  await saveIntegration(it);

  return NextResponse.json({ ok: true, detail: v.detail });
}

function bannedSaasHost(rawUrl: string): string | null {
  let host: string;
  try {
    host = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
  for (const e of KNOWLEDGE) {
    if (!(e.oauthAuthorizeUrl && e.oauthTokenUrl)) continue; // only apps with a genuine OAuth path
    const urlHosts = [e.oauthAuthorizeUrl, e.oauthTokenUrl, e.developerPortalUrl, e.docsUrl]
      .filter((u): u is string => Boolean(u))
      .map((u) => {
        try {
          return new URL(u).hostname.toLowerCase();
        } catch {
          return "";
        }
      });
    const domainMatches = e.match.filter((m) => m.includes("."));
    if (urlHosts.includes(host) || domainMatches.some((m) => host === m || host.endsWith(`.${m}`))) {
      return e.appName;
    }
  }
  return null;
}
