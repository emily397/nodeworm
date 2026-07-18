// Real step effects for the flow executor. Server-only. Every outbound URL is
// SSRF-guarded via assertConnectorUrl (cloud surface); connection auth is
// injected here from the vault and never lives on the flow definition.

import { assertConnectorUrl } from "../engine/connector";
import { chatJson, isLlmEnabled } from "../engine/llm";
import type { Integration } from "../engine/types";
import { getVaultConnector, getVaultTokens } from "../engine/vault";
import type { EffectInput, EffectResult, StepEffects } from "./run";
import type { FlowStep } from "./types";

const TIMEOUT_MS = 15000;
const MAX_BODY = 64 * 1024;

const AI_SYSTEM = `You are one step inside a NodeWorm flow automation. Follow the step's instruction against the data it contains.
Respond with ONLY one minified JSON object: {"result": <string, object or array>}. No markdown, no commentary.`;

async function call(url: string, method: string, body: unknown, headers: Record<string, string>): Promise<EffectResult> {
  const host = new URL(url).host;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { "content-type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, summary: `could not reach ${host}` };
  }
  const text = (await res.text().catch(() => "")).slice(0, MAX_BODY);
  let output: unknown = text || undefined;
  try {
    output = JSON.parse(text);
  } catch {
    // non-JSON body stays as bounded text
  }
  const ok = res.status >= 200 && res.status < 400;
  return { ok, summary: `HTTP ${res.status} from ${host}`, output };
}

async function guard(url: string): Promise<string | null> {
  const v = await assertConnectorUrl(url, "cloud");
  if (v.ok) return null;
  return v.reason === "private" ? "the cloud cannot reach a private address; use a tunnel" : v.reason;
}

export function realEffects(getIntegration: (id: string) => Promise<Integration | undefined>): StepEffects {
  async function connection(step: FlowStep): Promise<{ it?: Integration; fail?: string }> {
    if (!step.integrationId) return {};
    const it = await getIntegration(step.integrationId);
    if (!it) return { fail: "that connection no longer exists" };
    return { it };
  }

  async function httpLike(step: FlowStep, input: EffectInput, withAuth: boolean): Promise<EffectResult> {
    if (!input.url) return { ok: false, summary: "no URL configured on this step" };
    const blocked = await guard(input.url);
    if (blocked) return { ok: false, summary: blocked };
    const headers: Record<string, string> = {};
    if (withAuth) {
      const { it, fail } = await connection(step);
      if (fail) return { ok: false, summary: fail };
      if (it) {
        const tokens = await getVaultTokens(it.appName, { connectionId: it.id, userId: it.userId });
        if (!tokens) return { ok: false, summary: `no stored token for ${it.appName}; reconnect it first` };
        headers.authorization = `Bearer ${tokens.accessToken}`;
      }
    }
    return call(input.url, input.method ?? "POST", input.body, headers);
  }

  return {
    http: (step, input) => httpLike(step, input, true),
    webhookOut: (step, input) => httpLike(step, input, false),

    async connector(step, input) {
      const { it, fail } = await connection(step);
      if (fail) return { ok: false, summary: fail };
      if (!it) return { ok: false, summary: "pick a connection for this step" };
      const conn = await getVaultConnector(it.appName, { connectionId: it.id, userId: it.userId });
      if (!conn) return { ok: false, summary: `no connector saved for ${it.appName}; verify it first` };
      const target = new URL(input.path || "/", conn.url).toString();
      const blocked = await guard(target);
      if (blocked) return { ok: false, summary: blocked };
      const headers: Record<string, string> = {};
      if (conn.token) headers.authorization = /^(Bearer|Basic) /.test(conn.token) ? conn.token : `Bearer ${conn.token}`;
      return call(target, input.method ?? "POST", input.body, headers);
    },

    async ai(step, input) {
      if (!input.prompt) return { ok: false, summary: "no instruction configured on this AI step" };
      if (!isLlmEnabled()) return { ok: false, summary: "no AI model available (set GROQ_API_KEY or OPENROUTER_API_KEY)" };
      const data = await chatJson(AI_SYSTEM, input.prompt);
      if (!data) return { ok: false, summary: "every model in the cascade failed" };
      return { ok: true, summary: "model replied", output: data.result ?? data };
    },
  };
}
