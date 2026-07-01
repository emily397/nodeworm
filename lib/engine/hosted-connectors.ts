// NodeWorm-hosted connector bridges. For an app with no browser login (Signal),
// NodeWorm runs the connector ITSELF (e.g. bbernhard/signal-cli-rest-api), so the
// user's ONLY step is to link once by scanning a QR code in the app. NodeWorm then
// reaches the bridge over HTTP exactly like a self-hosted connector, reusing
// verifyConnector + storeConnector + the connected-via-connector status.
//
// Server-only (reads process.env, uses fetch/Buffer). The pure engine in phases.ts
// must NOT import this; orchestrate.ts passes a plain availability boolean in.
//
// Inert-until-keyed: a bridge counts as available only when its URL env is set.
// With nothing set, an app degrades to the self-hosted researched-connector path
// with zero overclaim. The bridge endpoint is operator-set (trusted env), so it is
// not run through the user-input SSRF guard; the live verify still goes through
// verifyConnector for the one real read.

export interface HostedConnectorSpec {
  kind: "rest-wrapper" | "cli"; // the ResearchKind family this bridge satisfies
  name: string; // user-facing, e.g. "Signal bridge"
  apps: string[]; // app names this bridge connects (lowercase-compared)
  urlEnv: string; // e.g. SIGNAL_BRIDGE_URL
  tokenEnv?: string; // optional bearer the operator set on the bridge
  deviceName: string; // device_name shown in the app's linked-devices list
  qrPath: string; // GET -> device-link QR (png or { uri })
  accountsPath: string; // GET -> linked-account signal (see `linked`)
  linked?: "accounts-nonempty" | "session-working"; // how accountsPath proves a link (default accounts-nonempty)
  consentGated: boolean; // messaging bridges always require explicit user consent
  // ---- provisioning blueprint (used by the provision workflow, not at runtime) ----
  image?: string; // the connector Docker image the bridge wraps
  upstreamPort?: number; // the port the connector listens on inside the container (default 8080)
  upstreamStart?: string; // command that launches the connector in the background (default /entrypoint.sh)
  verified?: boolean; // true once a real link has been proven end-to-end for this blueprint
}

// A hosted bridge is one blueprint per app family. Adding a new "scan-one-QR" app
// is a single entry here + one run of the provision workflow (.github/workflows/
// provision-bridge.yml) that stands up its Space and hands back the URL to key.
const SIGNAL: HostedConnectorSpec = {
  kind: "rest-wrapper",
  name: "Signal bridge (signal-cli-rest-api)",
  apps: ["signal"],
  urlEnv: "SIGNAL_BRIDGE_URL",
  tokenEnv: "SIGNAL_BRIDGE_TOKEN",
  deviceName: "NodeWorm",
  qrPath: "/v1/qrcodelink",
  accountsPath: "/v1/accounts",
  linked: "accounts-nonempty",
  consentGated: true,
  image: "bbernhard/signal-cli-rest-api:latest",
  upstreamPort: 8080,
  upstreamStart: "/entrypoint.sh",
  verified: true,
};

// WhatsApp via WAHA (devlikeapro/waha): a dockerized WhatsApp HTTP API with QR
// login. Inert until WHATSAPP_BRIDGE_URL is keyed. Endpoints are best-effort and
// marked unverified: run the provision workflow + a real link before relying on it.
// NOTE: automating WhatsApp Web risks account bans (Meta ToS); operator opt-in only.
const WHATSAPP: HostedConnectorSpec = {
  kind: "rest-wrapper",
  name: "WhatsApp bridge (WAHA)",
  apps: ["whatsapp"],
  urlEnv: "WHATSAPP_BRIDGE_URL",
  tokenEnv: "WHATSAPP_BRIDGE_TOKEN",
  deviceName: "NodeWorm",
  qrPath: "/api/default/auth/qr?format=image",
  accountsPath: "/api/sessions",
  linked: "session-working",
  consentGated: true,
  image: "devlikeapro/waha:latest",
  upstreamPort: 3000,
  upstreamStart: "", // WAHA's own image entrypoint runs it; supervisor uses the image default
  verified: false,
};

const SPECS: HostedConnectorSpec[] = [SIGNAL, WHATSAPP];

const norm = (s: string) => s.trim().toLowerCase();

export function hostedSpecForApp(appName: string): HostedConnectorSpec | undefined {
  const a = norm(appName);
  return SPECS.find((s) => s.apps.some((x) => norm(x) === a));
}

export function hostedBaseUrl(spec: HostedConnectorSpec): string | undefined {
  const v = process.env[spec.urlEnv]?.trim();
  return v ? v.replace(/\/+$/, "") : undefined;
}

export function hostedToken(spec: HostedConnectorSpec): string | undefined {
  return spec.tokenEnv ? process.env[spec.tokenEnv]?.trim() || undefined : undefined;
}

// A hosted bridge for this app exists AND is configured. Drives the architect's
// choice of "hosted-connector" over the self-hosted "researched-connector".
export function hostedConnectorAvailableFor(appName: string): boolean {
  const spec = hostedSpecForApp(appName);
  return Boolean(spec && hostedBaseUrl(spec));
}

// Honest inert-until-keyed status for /api/hosted-connectors/status.
export function hostedConnectorsStatus(): Array<{ kind: string; name: string; apps: string[]; available: boolean }> {
  return SPECS.map((s) => ({ kind: s.kind, name: s.name, apps: s.apps, available: Boolean(hostedBaseUrl(s)) }));
}

function authHeaders(token?: string): Record<string, string> {
  return token ? { authorization: `Bearer ${token}` } : {};
}

// Fetch the device-link QR from the bridge. signal-cli-rest-api returns a PNG by
// default (Content-Type image/png); some builds return JSON { uri }. Handle both
// and hand back a data URL the browser can render. The bridge URL + token never
// reach the client.
export async function fetchLinkQr(
  spec: HostedConnectorSpec,
): Promise<{ ok: true; qrDataUrl?: string; qrUri?: string } | { ok: false; error: string }> {
  const base = hostedBaseUrl(spec);
  if (!base) return { ok: false, error: `${spec.name} is not configured (set ${spec.urlEnv}).` };
  const sep = spec.qrPath.includes("?") ? "&" : "?";
  const url = `${base}${spec.qrPath}${sep}device_name=${encodeURIComponent(spec.deviceName)}`;
  try {
    const r = await fetch(url, { headers: authHeaders(hostedToken(spec)), cache: "no-store", signal: AbortSignal.timeout(20000) });
    if (!r.ok) return { ok: false, error: `Bridge returned HTTP ${r.status} for the link QR.` };
    const ct = r.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const j = (await r.json()) as { uri?: string };
      return j.uri ? { ok: true, qrUri: j.uri } : { ok: false, error: "Bridge did not return a link URI." };
    }
    const buf = Buffer.from(await r.arrayBuffer());
    const mime = ct.split(";")[0]?.trim() || "image/png";
    return { ok: true, qrDataUrl: `data:${mime};base64,${buf.toString("base64")}` };
  } catch {
    return { ok: false, error: "Could not reach the hosted bridge to start a device link." };
  }
}

// Poll the bridge for a completed link: a non-empty accounts array = linked.
// Returns the linked account id (phone number) so it can be held as the per-user
// scope on the connector record.
export async function pollLinkedNumber(spec: HostedConnectorSpec): Promise<string | undefined> {
  const base = hostedBaseUrl(spec);
  if (!base) return undefined;
  try {
    const r = await fetch(`${base}${spec.accountsPath}`, { headers: authHeaders(hostedToken(spec)), cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!r.ok) return undefined;
    const data: unknown = await r.json();
    // session-working: an array of sessions, linked when one is "WORKING" (WAHA-style).
    if (spec.linked === "session-working") {
      const sessions: Array<{ name?: string; status?: string; me?: { id?: string } }> = Array.isArray(data) ? data : [];
      const live = sessions.find((s) => String(s.status).toUpperCase() === "WORKING");
      return live ? String(live.me?.id ?? live.name ?? "linked") : undefined;
    }
    // accounts-nonempty (default): an array of account ids, linked when non-empty.
    const list: unknown[] = Array.isArray(data)
      ? data
      : Array.isArray((data as { accounts?: unknown[] })?.accounts)
        ? (data as { accounts: unknown[] }).accounts
        : [];
    return list.length ? String(list[list.length - 1]) : undefined;
  } catch {
    return undefined;
  }
}

// Blueprints that carry enough to be auto-provisioned by the provision workflow.
export function provisionableBlueprints(): Array<{ app: string; name: string; image: string; upstreamPort: number; upstreamStart: string; urlEnv: string; tokenEnv?: string; verified: boolean }> {
  return SPECS.filter((s) => s.image).map((s) => ({
    app: s.apps[0],
    name: s.name,
    image: s.image!,
    upstreamPort: s.upstreamPort ?? 8080,
    upstreamStart: s.upstreamStart ?? "/entrypoint.sh",
    urlEnv: s.urlEnv,
    tokenEnv: s.tokenEnv,
    verified: Boolean(s.verified),
  }));
}
