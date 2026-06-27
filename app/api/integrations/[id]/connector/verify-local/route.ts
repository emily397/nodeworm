import { NextResponse } from "next/server";
import { getIntegration, saveIntegration } from "@/lib/store";
import { assertConnectorUrl } from "@/lib/engine/connector";
import { storeConnector, vaultStatus } from "@/lib/engine/vault";
import { recompute } from "@/lib/engine/orchestrate";
import { currentUserId, requireVaultUnlock } from "@/lib/engine/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The NodeWorm Helper extension verified a connector that the cloud cannot reach
// (localhost, LAN). The extension ran the real GET from the user's own machine,
// got a 2xx, and reports back here. We trust the user's own browser extension
// (authenticated by their session cookie) to tell us the result honestly, store
// {url, token} encrypted, and flip the status to connected-via-connector.
// `reachableFrom: "extension"` marks that the proof came from the user's machine.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getIntegration(id);
  if (!it) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Allowed both as the primary method (researched-connector) and as the optional
  // advanced alternative under a managed session; both need a found connector.
  if (!it.research?.best) {
    return NextResponse.json({ error: "No researched connector for this integration." }, { status: 400 });
  }
  if (!(await requireVaultUnlock(req))) {
    return NextResponse.json({ ok: false, error: "Unlock your vault with your PIN to continue.", pin: "required" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    url?: string;
    token?: string;
    healthPath?: string;
    extensionStatus?: number;
    extensionDetail?: string;
  };
  const url = (body.url ?? "").trim();
  const token = (body.token ?? "").trim() || undefined;
  const healthPath = (body.healthPath ?? "").trim() || undefined;
  const extStatus = body.extensionStatus;
  const extDetail = (body.extensionDetail ?? "").trim();

  if (!url) return NextResponse.json({ ok: false, error: "URL required." });
  if (!extStatus || extStatus < 200 || extStatus >= 400) {
    return NextResponse.json({ ok: false, error: "Extension did not confirm a successful response from the connector." });
  }

  let target = url;
  if (healthPath) {
    try {
      target = new URL(healthPath, url).toString();
    } catch {
      /* fall back to bare url */
    }
  }

  // Validate the URL for the extension surface, which allows localhost/private IPs.
  const assertion = await assertConnectorUrl(target, "extension");
  if (!assertion.ok) return NextResponse.json({ ok: false, error: assertion.reason });

  const vs = vaultStatus();
  if (vs.available) {
    const userId = await currentUserId(req);
    await storeConnector(it.appName, { connectionId: id, userId }, target, token);
  }

  it.connector = {
    host: assertion.url.host,
    healthPath: healthPath || undefined,
    hasToken: Boolean(token),
    reachableFrom: "extension",
    private: assertion.isPrivate,
    verified: true,
    verifiedDetail: extDetail || `HTTP ${extStatus} (${assertion.url.host}) via Helper`,
    verifiedAt: Date.now(),
    methodName: it.research?.best?.name,
    methodKind: it.research?.best?.kind,
  };
  recompute(it);
  await saveIntegration(it);

  return NextResponse.json({ ok: true, detail: it.connector.verifiedDetail });
}
