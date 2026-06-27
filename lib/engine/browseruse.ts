// AI browser agent that registers an OAuth app on ANY developer portal, so the
// user only ever signs in. Where cobrowse.ts hands the user a hosted browser and
// scrapes the DOM (fragile: every portal lays its form out differently), this
// drives a real agent (Browser Use Cloud v3, Skyvern fallback) that *understands*
// the page: it navigates, creates the app, sets the redirect URI and scopes, and
// reads back the client id/secret on its own. The human's only job is to sign in
// when a login wall appears, which they do inside the SAME live browser embedded in
// NodeWorm. No URL clicking, no copy-paste, no DOM-shape assumptions.
//
// Inert-until-keyed: Browser Use needs BROWSERUSE_API_KEY; the Skyvern fallback
// needs SKYVERN_API_KEY. Server-only. The agent NEVER types a password: NodeWorm
// passes no credentials to it, and the task prompt forbids it from entering any.
// The captured client id/secret are returned to the caller (a server route) which
// stores them in the per-user encrypted vault; they are never sent to the browser.

const BU_BASE = "https://api.browser-use.com/api/v3";
const SK_BASE = "https://api.skyvern.com";

// Browser Use's internal driver model. Balanced default (claude-sonnet-4.6): for
// agentic browser tasks a more capable model usually finishes in fewer steps, and
// browser-compute time (billed per minute, model-independent) dominates a short
// registration run, so a capable model is often CHEAPER per run than a weak one that
// wanders. Override with BROWSERUSE_MODEL to trade capability for per-token cost
// (e.g. "gemini-3-flash", "bu-mini", "gpt-5.4-mini"). Read per-call so a Vercel env
// change takes effect with no redeploy.
function buModel(): string {
  return process.env.BROWSERUSE_MODEL?.trim() || "claude-sonnet-4.6";
}

// Hard per-run spend ceiling: the run is stopped if it reaches this, which protects
// the balance while a human is slow to sign in. The real cost knob (more reliable
// than downgrading the model). Override with BROWSERUSE_MAX_COST_USD.
function buMaxCost(): number {
  const v = Number(process.env.BROWSERUSE_MAX_COST_USD);
  return Number.isFinite(v) && v > 0 ? v : 1.5;
}

// Bring-your-own-key: pay the model provider directly (a key configured in the
// Browser Use dashboard for the model's NATIVE provider) and let Browser Use charge
// only a reduced orchestration fee. Off by default; opt in with BROWSERUSE_USE_OWN_KEY=true
// once a provider key is set in the dashboard. NOTE: Browser Use's BYOK is direct-
// provider only (Anthropic / Google / OpenAI), not a gateway, so it cannot use an
// OpenRouter key, and a direct Google key is disallowed by house rule. If on but no
// key is configured for the chosen model's provider, Browser Use rejects the run, so
// startPortalRegistration surfaces that error honestly.
function buUseOwnKey(): boolean {
  return /^(1|true|yes)$/i.test(process.env.BROWSERUSE_USE_OWN_KEY?.trim() ?? "");
}

function buKey(): string | undefined {
  return process.env.BROWSERUSE_API_KEY;
}
function skKey(): string | undefined {
  return process.env.SKYVERN_API_KEY;
}

export type AgentProvider = "browseruse" | "skyvern";

export function agentDriverAvailable(): boolean {
  return Boolean(buKey() || skKey());
}

export function agentDriverStatus(): { available: boolean; provider?: AgentProvider; reason?: string } {
  if (buKey()) return { available: true, provider: "browseruse" };
  if (skKey()) return { available: true, provider: "skyvern" };
  return { available: false, reason: "no AI browser agent configured (set BROWSERUSE_API_KEY or SKYVERN_API_KEY)" };
}

export interface PortalTask {
  portalUrl: string;
  appName: string;
  redirectUri: string;
  scopes: string[];
}

export interface AgentRun {
  taskId: string;
  liveViewUrl: string;
  provider: AgentProvider;
}

export interface AgentPoll {
  // running: agent is working (or waiting for the human to sign in).
  // needs_login: agent hit a login wall and is waiting; the human signs in via liveUrl.
  // creds_ready: the OAuth app exists and the client id/secret were read back.
  // blocked: the portal gates registration behind manual review the agent can't pass.
  // failed: the run ended without credentials.
  state: "running" | "needs_login" | "creds_ready" | "blocked" | "failed";
  step?: string; // human-readable last action, for live progress
  clientId?: string;
  clientSecret?: string;
  note?: string;
  costUsd?: number;
}

// The instruction the agent executes. Deliberately strict about the one thing that
// must never happen (entering credentials) and explicit that a human shares the
// browser for sign-in. The structured-output contract is restated so the agent
// returns clean fields, not prose.
function buildPrompt(t: PortalTask): string {
  const scopeLine = t.scopes.length ? `Grant these scopes/permissions if the form asks: ${t.scopes.join(", ")}.` : "Grant the minimal read/write scopes the app offers.";
  return [
    `You are registering a new OAuth 2.0 application on ${t.appName}'s developer portal so a third-party tool can connect.`,
    `Start at: ${t.portalUrl}`,
    ``,
    `Do exactly this:`,
    `1. If you land on a sign-in, login, password, 2FA, or CAPTCHA page, DO NOT type anything and DO NOT attempt to log in. A human is watching this same browser and will sign in. Wait, then re-check the page every few steps until you are past the login wall, then continue.`,
    `2. Find where to create a new OAuth app / API client / integration (often "Developer settings", "Apps", "OAuth apps", "API credentials", or "Create app").`,
    `3. Create a new app named "NodeWorm" (or "${t.appName} via NodeWorm" if a name is required and "NodeWorm" is taken).`,
    `4. Set the redirect URI / callback URL / authorized redirect to EXACTLY this, copying it character-for-character: ${t.redirectUri}`,
    `5. ${scopeLine}`,
    `6. Save / create the app.`,
    `7. Open the app's settings and read its Client ID and Client Secret (may be called App ID / API Key and Secret / Consumer Key and Secret). If the secret is only shown once, reveal and read it now.`,
    ``,
    `NEVER enter a password, verification code, or payment detail. NEVER accept new legal terms on the user's behalf beyond what creating a standard developer app requires.`,
    `Return structured output: status "registered" with clientId and clientSecret when you have both; "needs_login" if you are still stuck behind a sign-in wall when you stop; "blocked" if the portal requires a manual review/approval you cannot complete; "failed" otherwise, with a short note explaining why.`,
  ].join("\n");
}

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["registered", "needs_login", "blocked", "failed"] },
    clientId: { type: "string" },
    clientSecret: { type: "string" },
    note: { type: "string" },
  },
  required: ["status"],
} as const;

// ---- Browser Use Cloud v3 -------------------------------------------------

async function buStart(t: PortalTask): Promise<AgentRun | { error: string }> {
  const key = buKey();
  if (!key) return { error: "Browser Use not configured" };
  const res = await fetch(`${BU_BASE}/sessions`, {
    method: "POST",
    headers: { "X-Browser-Use-API-Key": key, "content-type": "application/json" },
    body: JSON.stringify({
      task: buildPrompt(t),
      model: buModel(),
      outputSchema: OUTPUT_SCHEMA,
      maxCostUsd: buMaxCost(),
      keepAlive: true, // stay alive so the human has time to sign in mid-run
      ...(buUseOwnKey() ? { useOwnKey: true } : {}),
    }),
    cache: "no-store",
  });
  if (!res.ok) return { error: `Browser Use session create failed (HTTP ${res.status})` };
  const s = (await res.json()) as { id: string; liveUrl?: string };
  if (!s.liveUrl) return { error: "Browser Use did not return a live view" };
  return { taskId: s.id, liveViewUrl: s.liveUrl, provider: "browseruse" };
}

interface BuSession {
  status: "created" | "idle" | "running" | "stopped" | "timed_out" | "error";
  output?: unknown;
  isTaskSuccessful?: boolean | null;
  lastStepSummary?: string | null;
  totalCostUsd?: number | string | null;
}

function asOutput(raw: unknown): { status?: string; clientId?: string; clientSecret?: string; note?: string } {
  if (!raw) return {};
  let o: unknown = raw;
  if (typeof o === "string") {
    const s = o;
    try {
      o = JSON.parse(s);
    } catch {
      return { note: s.slice(0, 200) };
    }
  }
  if (typeof o !== "object" || o === null) return {};
  const r = o as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  return { status: str(r.status), clientId: str(r.clientId), clientSecret: str(r.clientSecret), note: str(r.note) };
}

async function buPoll(taskId: string): Promise<AgentPoll> {
  const key = buKey();
  if (!key) return { state: "failed", note: "Browser Use not configured" };
  const res = await fetch(`${BU_BASE}/sessions/${taskId}`, {
    headers: { "X-Browser-Use-API-Key": key },
    cache: "no-store",
  });
  if (!res.ok) return { state: "failed", note: `poll failed (HTTP ${res.status})` };
  const s = (await res.json()) as BuSession;
  const cost = typeof s.totalCostUsd === "string" ? Number(s.totalCostUsd) : s.totalCostUsd ?? undefined;
  const step = s.lastStepSummary ?? undefined;

  if (s.status === "created" || s.status === "idle" || s.status === "running") {
    return { state: "running", step, costUsd: cost ?? undefined };
  }
  // Terminal. Read the structured output.
  const out = asOutput(s.output);
  if (out.clientId && out.clientSecret) {
    return { state: "creds_ready", clientId: out.clientId, clientSecret: out.clientSecret, step, costUsd: cost ?? undefined };
  }
  if (out.status === "needs_login") return { state: "needs_login", step, note: out.note, costUsd: cost ?? undefined };
  if (out.status === "blocked") return { state: "blocked", step, note: out.note, costUsd: cost ?? undefined };
  return { state: "failed", step, note: out.note ?? (s.status === "timed_out" ? "the agent ran out of time" : "the agent finished without the keys"), costUsd: cost ?? undefined };
}

async function buStop(taskId: string): Promise<void> {
  const key = buKey();
  if (!key) return;
  await fetch(`${BU_BASE}/sessions/${taskId}/stop`, {
    method: "POST",
    headers: { "X-Browser-Use-API-Key": key },
    cache: "no-store",
  }).catch(() => {});
}

// ---- Skyvern (fallback) ----------------------------------------------------

async function skStart(t: PortalTask): Promise<AgentRun | { error: string }> {
  const key = skKey();
  if (!key) return { error: "Skyvern not configured" };
  const res = await fetch(`${SK_BASE}/v1/run/tasks`, {
    method: "POST",
    headers: { "x-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({
      prompt: buildPrompt(t),
      url: t.portalUrl,
      title: `Register OAuth app on ${t.appName}`,
      data_extraction_schema: OUTPUT_SCHEMA,
      max_steps: 40,
    }),
    cache: "no-store",
  });
  if (!res.ok) return { error: `Skyvern task create failed (HTTP ${res.status})` };
  const s = (await res.json()) as { run_id: string; app_url?: string; recording_url?: string };
  const live = s.app_url ?? s.recording_url ?? "";
  if (!s.run_id) return { error: "Skyvern did not return a run" };
  return { taskId: s.run_id, liveViewUrl: live, provider: "skyvern" };
}

async function skPoll(runId: string): Promise<AgentPoll> {
  const key = skKey();
  if (!key) return { state: "failed", note: "Skyvern not configured" };
  const res = await fetch(`${SK_BASE}/v1/runs/${runId}`, { headers: { "x-api-key": key }, cache: "no-store" });
  if (!res.ok) return { state: "failed", note: `poll failed (HTTP ${res.status})` };
  const s = (await res.json()) as { status: string; output?: unknown; failure_reason?: string };
  const live = ["created", "queued", "running"];
  if (live.includes(s.status)) return { state: "running" };
  if (s.status !== "completed") return { state: "failed", note: s.failure_reason ?? `run ${s.status}` };
  const out = asOutput(s.output);
  if (out.clientId && out.clientSecret) return { state: "creds_ready", clientId: out.clientId, clientSecret: out.clientSecret };
  if (out.status === "needs_login") return { state: "needs_login", note: out.note };
  if (out.status === "blocked") return { state: "blocked", note: out.note };
  return { state: "failed", note: out.note ?? "the agent finished without the keys" };
}

async function skStop(runId: string): Promise<void> {
  const key = skKey();
  if (!key) return;
  await fetch(`${SK_BASE}/v1/runs/${runId}/cancel`, { method: "POST", headers: { "x-api-key": key }, cache: "no-store" }).catch(() => {});
}

// ---- Public surface --------------------------------------------------------

// Browser Use is the primary driver; Skyvern is the fallback only when Browser Use
// is unkeyed or its session create fails (e.g. balance exhausted).
export async function startPortalRegistration(t: PortalTask): Promise<AgentRun | { error: string }> {
  if (buKey()) {
    const r = await buStart(t);
    if (!("error" in r)) return r;
    if (!skKey()) return r; // no fallback; surface the Browser Use error
  }
  if (skKey()) return skStart(t);
  return { error: "no AI browser agent configured" };
}

export async function pollPortalRegistration(taskId: string, provider: AgentProvider): Promise<AgentPoll> {
  return provider === "skyvern" ? skPoll(taskId) : buPoll(taskId);
}

export async function stopPortalRegistration(taskId: string, provider: AgentProvider): Promise<void> {
  return provider === "skyvern" ? skStop(taskId) : buStop(taskId);
}
