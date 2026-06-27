// Cloud co-browse via Browserbase. For users who can't / won't run the Helper
// extension, NodeWorm spins up a hosted browser, pre-navigates it to the
// provider's developer portal, and hands back a live-view URL. The user logs in
// and creates the OAuth app in that disposable browser; NodeWorm then connects
// over CDP (playwright-core, no local browser) to fill the redirect URI and
// scrape the client id/secret, storing them via the same per-user vault.
//
// Inert-until-keyed: requires BROWSERBASE_API_KEY. The project id is auto-
// discovered from the API (or set via BROWSERBASE_PROJECT_ID). Server-only.
// playwright-core is dynamically imported only when a session is actually driven,
// so availability checks stay cheap.

const BASE = "https://api.browserbase.com";
const STEEL_BASE = "https://api.steel.dev";

function apiKey(): string | undefined {
  return process.env.BROWSERBASE_API_KEY;
}

function steelKey(): string | undefined {
  return process.env.STEEL_API_KEY;
}

// Hosted browser is available if EITHER provider is keyed. NodeWorm prefers
// Browserbase and falls back to Steel when Browserbase is out of minutes / unkeyed.
export function cobrowseAvailable(): boolean {
  return Boolean(apiKey() || steelKey());
}

export function cobrowseStatus(): { available: boolean; reason?: string } {
  return apiKey() || steelKey()
    ? { available: true }
    : { available: false, reason: "no hosted browser configured (set BROWSERBASE_API_KEY or STEEL_API_KEY)" };
}

let cachedProject: string | null = null;
async function projectId(): Promise<string | undefined> {
  if (process.env.BROWSERBASE_PROJECT_ID) return process.env.BROWSERBASE_PROJECT_ID;
  if (cachedProject) return cachedProject;
  const key = apiKey();
  if (!key) return undefined;
  const res = await fetch(`${BASE}/v1/projects`, { headers: { "x-bb-api-key": key }, cache: "no-store" });
  if (!res.ok) return undefined;
  const projects = (await res.json()) as Array<{ id: string }>;
  cachedProject = projects[0]?.id ?? null;
  return cachedProject ?? undefined;
}

export interface CoBrowseSession {
  sessionId: string;
  connectUrl: string;
  liveViewUrl: string;
  provider?: "browserbase" | "steel";
}

// Steel.dev hosted browser (Browserbase fallback). CDP-compatible: connectOverCDP
// works against the websocket endpoint, so the same drive/verify code is reused. The
// live view is Steel's session viewer. Pre-navigates to startUrl like Browserbase.
async function createSteelSession(startUrl: string): Promise<CoBrowseSession | { error: string }> {
  const key = steelKey();
  if (!key) return { error: "Steel not configured" };
  const res = await fetch(`${STEEL_BASE}/v1/sessions`, {
    method: "POST",
    headers: { "steel-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ timeout: 600000 }),
    cache: "no-store",
  });
  if (!res.ok) return { error: `Steel session create failed (HTTP ${res.status})` };
  const s = (await res.json()) as { id: string; sessionViewerUrl?: string };
  const connectUrl = `wss://connect.steel.dev?apiKey=${key}&sessionId=${s.id}`;
  try {
    const { chromium } = await import("playwright-core");
    const browser = await chromium.connectOverCDP(connectUrl);
    const c = browser.contexts()[0] ?? (await browser.newContext());
    const page = c.pages()[0] ?? (await c.newPage());
    if (startUrl) {
      await page.bringToFront().catch(() => {});
      await page.goto(startUrl, { waitUntil: "commit", timeout: 20000 }).catch(() => {});
    }
    await browser.close();
  } catch {
    /* user can still navigate via the live view */
  }
  return { sessionId: s.id, connectUrl, liveViewUrl: s.sessionViewerUrl ?? "", provider: "steel" };
}

export async function createSession(startUrl: string): Promise<CoBrowseSession | { error: string }> {
  const key = apiKey();
  if (!key) return { error: "cloud co-browse not configured" };
  const proj = await projectId();
  if (!proj) return { error: "no Browserbase project found" };

  const res = await fetch(`${BASE}/v1/sessions`, {
    method: "POST",
    headers: { "x-bb-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ projectId: proj, keepAlive: true, timeout: 600 }),
    cache: "no-store",
  });
  if (!res.ok) return { error: `Browserbase session create failed (HTTP ${res.status})` };
  const sess = (await res.json()) as { id: string; connectUrl: string };

  // Pre-navigate to the portal so the user lands in the right place. keepAlive
  // keeps the session running after we disconnect.
  try {
    const { chromium } = await import("playwright-core");
    const browser = await chromium.connectOverCDP(sess.connectUrl);
    const ctx = browser.contexts()[0] ?? (await browser.newContext());
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    if (startUrl) {
      await page.bringToFront().catch(() => {});
      await page.goto(startUrl, { waitUntil: "commit", timeout: 20000 }).catch(() => {});
    }
    await browser.close();
  } catch {
    // Connect failed: the user can still navigate via the live view.
  }

  const dbg = await fetch(`${BASE}/v1/sessions/${sess.id}/debug`, { headers: { "x-bb-api-key": key }, cache: "no-store" });
  const debug = dbg.ok ? ((await dbg.json()) as { debuggerFullscreenUrl?: string }) : {};
  return { sessionId: sess.id, connectUrl: sess.connectUrl, liveViewUrl: debug.debuggerFullscreenUrl ?? "", provider: "browserbase" };
}

export async function captureCreds(connectUrl: string, redirectUri: string): Promise<{ clientId?: string; clientSecret?: string }> {
  try {
    const { chromium } = await import("playwright-core");
    const browser = await chromium.connectOverCDP(connectUrl);
    const ctx = browser.contexts()[0];
    const pages = ctx?.pages() ?? [];
    const page = pages[pages.length - 1];
    if (!page) {
      await browser.close();
      return {};
    }
    const result = await page.evaluate((uri: string) => {
      const inputs = Array.from(document.querySelectorAll("input, textarea")) as HTMLInputElement[];
      const hay = (el: HTMLInputElement) =>
        `${el.name || ""} ${el.id || ""} ${el.placeholder || ""} ${el.getAttribute("aria-label") || ""}`.toLowerCase();
      for (const inp of inputs) {
        if (!inp.value && /redirect|callback|return.?url|reply.?url|\buri\b/.test(hay(inp))) {
          inp.focus();
          inp.value = uri;
          inp.dispatchEvent(new Event("input", { bubbles: true }));
          inp.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
      const find = (re: RegExp) => {
        for (const inp of inputs) if (inp.value && re.test(hay(inp))) return inp.value.trim();
        return "";
      };
      return {
        clientId: find(/client.?id|app.?id|consumer.?key/),
        clientSecret: find(/client.?secret|app.?secret|consumer.?secret/),
      };
    }, redirectUri);
    await browser.close();
    return { clientId: result.clientId || undefined, clientSecret: result.clientSecret || undefined };
  } catch {
    return {};
  }
}

// ---- Managed session (R6 floor): connect the APP ITSELF, not a dev portal -----
// The user logs into the app's own UI in a hosted browser; its auth persists in a
// Browserbase Context (the durable, encrypted pointer NodeWorm holds), so the
// connection survives session timeouts.

export async function createContext(): Promise<string | undefined> {
  const key = apiKey();
  if (!key) return undefined;
  const proj = await projectId();
  if (!proj) return undefined;
  const res = await fetch(`${BASE}/v1/contexts`, {
    method: "POST",
    headers: { "x-bb-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ projectId: proj }),
    cache: "no-store",
  });
  if (!res.ok) return undefined;
  const ctx = (await res.json()) as { id: string };
  return ctx.id;
}

// Open a hosted browser at the app, reusing the persisted Context so a prior login
// is still in effect. Pre-navigates to startUrl; returns the live-view for the user.
export async function createAppSession(startUrl: string, contextId?: string): Promise<CoBrowseSession | { error: string }> {
  const key = apiKey();
  // No Browserbase key at all -> go straight to Steel if available.
  if (!key) {
    if (steelKey()) return createSteelSession(startUrl);
    return { error: "managed session not configured" };
  }
  const proj = await projectId();
  if (!proj) return steelKey() ? createSteelSession(startUrl) : { error: "no Browserbase project found" };

  const body: Record<string, unknown> = { projectId: proj, keepAlive: true, timeout: 600 };
  if (contextId) body.browserSettings = { context: { id: contextId, persist: true } };

  const res = await fetch(`${BASE}/v1/sessions`, {
    method: "POST",
    headers: { "x-bb-api-key": key, "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  // Browserbase failed (e.g. HTTP 402 = free browser-minutes exhausted). Fall back to
  // Steel so managed-session stays reliable instead of dead-ending.
  if (!res.ok) {
    if (steelKey()) return createSteelSession(startUrl);
    return { error: `Browserbase session create failed (HTTP ${res.status})` };
  }
  const sess = (await res.json()) as { id: string; connectUrl: string };

  try {
    const { chromium } = await import("playwright-core");
    const browser = await chromium.connectOverCDP(sess.connectUrl);
    const c = browser.contexts()[0] ?? (await browser.newContext());
    const page = c.pages()[0] ?? (await c.newPage());
    if (startUrl) {
      await page.bringToFront().catch(() => {});
      // "commit" resolves as soon as navigation starts, so a slow or unreachable
      // host can't hang the session on a blank page.
      await page.goto(startUrl, { waitUntil: "commit", timeout: 20000 }).catch(() => {});
    }
    await browser.close();
  } catch {
    // The user can still navigate via the live view.
  }

  const dbg = await fetch(`${BASE}/v1/sessions/${sess.id}/debug`, { headers: { "x-bb-api-key": key }, cache: "no-store" });
  const debug = dbg.ok ? ((await dbg.json()) as { debuggerFullscreenUrl?: string }) : {};
  return { sessionId: sess.id, connectUrl: sess.connectUrl, liveViewUrl: debug.debuggerFullscreenUrl ?? "", provider: "browserbase" };
}

// Prove the session is live and on the app, and not still sitting on a sign-in
// screen, before marking "connected-via-session". A bare host + title check is not
// enough on its own: it passes for the login screen itself, and it fails for
// QR-link apps like Signal Web where the URL and title never change after the scan.
//
// We deliberately reject ONLY on the two high-confidence logged-out signals the
// headless browser can read reliably across apps:
//   - a visible password field (a login form is still showing), or
//   - a QR canvas alongside scan/link/qr text (a device-link code not yet scanned).
// Everything else is accepted. We intentionally do NOT infer auth from
// localStorage / IndexedDB / the URL path: those are unreliable (httpOnly-cookie
// and SSO sessions store nothing readable, sessionStorage-only SPAs read empty,
// login pages pre-seed storage, and indexedDB.databases() is not universal), so
// they produce both false rejects and false accepts. This check is a sanity gate
// on top of the user's own "I'm signed in" assertion, not a guarantee of auth; an
// exotic passwordless login screen could slip through, which is acceptable here.
export async function verifySession(connectUrl: string): Promise<{ ok: boolean; detail?: string; reason?: string }> {
  try {
    const { chromium } = await import("playwright-core");
    const browser = await chromium.connectOverCDP(connectUrl);
    const c = browser.contexts()[0];
    const pages = c?.pages() ?? [];
    const page = pages[pages.length - 1];
    if (!page) {
      await browser.close();
      return { ok: false, reason: "no page is open in the hosted browser yet" };
    }
    const title = await page.title().catch(() => "");
    const url = page.url();
    const signals = await page
      .evaluate(() => {
        const text = (document.body?.innerText || "").slice(0, 6000);
        const hasPassword = !!document.querySelector('input[type="password"]');
        const hasQr = !!document.querySelector("canvas") && /\b(scan|link|qr code)\b/i.test(text);
        return { hasPassword, hasQr };
      })
      .catch(() => ({ hasPassword: false, hasQr: false }));
    await browser.close();

    let host = "";
    try {
      host = new URL(url).host;
    } catch {
      host = "";
    }
    if (!host || url.startsWith("about:")) return { ok: false, reason: "the app page has not loaded yet" };
    if (signals.hasQr) return { ok: false, reason: "the device-link QR code has not been scanned yet" };
    if (signals.hasPassword) return { ok: false, reason: "the sign-in form is still showing; finish signing in first" };
    return { ok: true, detail: title ? `${title} (${host})` : host };
  } catch {
    return { ok: false, reason: "could not reach the hosted browser session" };
  }
}

export async function releaseSession(sessionId: string, provider?: "browserbase" | "steel"): Promise<void> {
  if (provider === "steel") {
    const key = steelKey();
    if (!key) return;
    await fetch(`${STEEL_BASE}/v1/sessions/${sessionId}/release`, {
      method: "POST",
      headers: { "steel-api-key": key },
      cache: "no-store",
    }).catch(() => {});
    return;
  }
  const key = apiKey();
  if (!key) return;
  const proj = await projectId();
  if (!proj) return;
  await fetch(`${BASE}/v1/sessions/${sessionId}`, {
    method: "POST",
    headers: { "x-bb-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ projectId: proj, status: "REQUEST_RELEASE" }),
    cache: "no-store",
  }).catch(() => {});
}
