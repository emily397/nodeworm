// Real step effects for the flow executor. Server-only. Every outbound URL is
// SSRF-guarded via assertConnectorUrl (cloud surface); connection auth is
// injected here from the vault and never lives on the flow definition.

import { assertConnectorUrl } from "../engine/connector";
import { chatJson, isLlmEnabled, SpendCapError } from "../engine/llm";
import { clientCreds, providerFor, refreshAccessToken } from "../engine/oauth";
import { shouldRefresh } from "../engine/refresh";
import type { Integration } from "../engine/types";
import { getVaultConnector, getVaultTokens, storeTokens } from "../engine/vault";
import { pieceFor } from "../pieces/registry";
import { buildEmailRequest } from "./email";
import { resolveConnectionFields, toFormBody, type BodyEncoding } from "./encode";
import { mcpEnvelope, parseMcpHttpBody, parseMcpResult } from "./mcp";
import type { EffectInput, EffectResult, StepEffects } from "./run";
import type { FlowStep } from "./types";

const TIMEOUT_MS = 15000;
const MAX_BODY = 64 * 1024;

const AI_SYSTEM = `You are one step inside a NodeWorm flow automation. Follow the step's instruction against the data it contains.
Respond with ONLY one minified JSON object: {"result": <string, object or array>}. No markdown, no commentary.`;

async function call(
  url: string,
  method: string,
  body: unknown,
  headers: Record<string, string>,
  encoding: BodyEncoding = "json",
): Promise<EffectResult & { status: number }> {
  const host = new URL(url).host;
  const form = encoding === "form";
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { "content-type": form ? "application/x-www-form-urlencoded" : "application/json", ...headers },
      body: body === undefined ? undefined : form ? toFormBody(body) : JSON.stringify(body),
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, summary: `could not reach ${host}`, status: 0 };
  }
  const text = (await res.text().catch(() => "")).slice(0, MAX_BODY);
  let output: unknown = text || undefined;
  try {
    output = JSON.parse(text);
  } catch {
    // non-JSON body stays as bounded text
  }
  const ok = res.status >= 200 && res.status < 400;
  return { ok, summary: `HTTP ${res.status} from ${host}`, output, status: res.status };
}

// Renew this connection's access token with its stored refresh token and persist the
// result, so the caller can retry once. Returns the new access token, or null when the
// app has no refreshable provider/client or the provider rejects the refresh.
async function renewToken(it: Integration, refreshToken: string): Promise<string | null> {
  const provider = providerFor(it.appName, it.discovery);
  if (!provider) return null;
  const creds = await clientCreds(it.appName, { connectionId: it.id, userId: it.userId });
  if (!creds) return null;
  const r = await refreshAccessToken({ provider, creds, refreshToken });
  if (!r.ok || !r.accessToken) return null;
  await storeTokens(it.appName, { connectionId: it.id, userId: it.userId }, r.accessToken, r.refreshToken, "refresh");
  return r.accessToken;
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

    const headers: Record<string, string> = {};
    let authed: { it: Integration; refreshToken?: string } | null = null;
    let url = input.url;
    let encoding: BodyEncoding = step.encoding ?? "json";

    if (withAuth) {
      const { it, fail } = await connection(step);
      if (fail) return { ok: false, summary: fail };
      if (it) {
        // A per-tenant API (Shopify) keeps its host on the connection, not the
        // step. Resolve those placeholders before anything touches the network.
        const piece = pieceFor(it.appName);
        if (piece) {
          if (!step.encoding && piece.encoding) encoding = piece.encoding;
          const r = resolveConnectionFields(url, piece.connectionFields ?? [], it.connectionConfig);
          if (r.missing.length) {
            return { ok: false, summary: `${it.appName} needs your ${r.missing.join(" and ")}; add it on the connection` };
          }
          url = r.url;
        }
        const tokens = await getVaultTokens(it.appName, { connectionId: it.id, userId: it.userId });
        if (!tokens) return { ok: false, summary: `no stored token for ${it.appName}; reconnect it first` };
        headers.authorization = `Bearer ${tokens.accessToken}`;
        authed = { it, refreshToken: tokens.refreshToken };
      }
    }

    const blocked = await guard(url);
    if (blocked) return { ok: false, summary: blocked };

    const first = await call(url, input.method ?? "POST", input.body, headers, encoding);
    // Reactive refresh: an expired access token shows up as a 401/403. Renew once
    // with the stored refresh token and retry, so long-lived connections stop dying
    // silently. Without a refresh token we say so honestly rather than loop.
    if (authed && shouldRefresh(first.status, authed.refreshToken)) {
      const fresh = await renewToken(authed.it, authed.refreshToken!);
      if (!fresh) {
        return { ...first, summary: `${authed.it.appName} rejected the saved login and it could not be renewed; reconnect it` };
      }
      return call(url, input.method ?? "POST", input.body, { ...headers, authorization: `Bearer ${fresh}` }, encoding);
    }
    return first;
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

    async email(step, input) {
      if (!input.to) return { ok: false, summary: "who should this email go to?" };
      const built = buildEmailRequest({ to: input.to, subject: input.subject ?? "", body: input.text ?? "" });
      if ("error" in built) return { ok: false, summary: built.error };
      const blocked = await guard(built.url);
      if (blocked) return { ok: false, summary: blocked };
      const res = await call(built.url, "POST", built.body, built.headers);
      if (!res.ok) return { ...res, summary: `could not send the email (${res.summary})` };
      return { ok: true, summary: `emailed ${input.to}`, output: res.output };
    },

    async ai(step, input) {
      if (!input.prompt) return { ok: false, summary: "no instruction configured on this AI step" };
      if (!isLlmEnabled()) return { ok: false, summary: "AI is not available on this account yet" };
      let data: Record<string, unknown> | null;
      try {
        data = await chatJson(AI_SYSTEM, input.prompt);
      } catch (e) {
        // A budget stop is a real, actionable failure, not a flaky model.
        if (e instanceof SpendCapError) return { ok: false, summary: e.message };
        throw e;
      }
      if (!data) return { ok: false, summary: "the AI step could not produce a result" };
      return { ok: true, summary: "AI replied", output: data.result ?? data };
    },

    async mcp(step, input) {
      if (!step.tool) return { ok: false, summary: "pick a tool for this step" };
      const { it, fail } = await connection(step);
      if (fail) return { ok: false, summary: fail };
      if (!it) return { ok: false, summary: "pick a connection for this step" };
      const conn = await getVaultConnector(it.appName, { connectionId: it.id, userId: it.userId });
      if (!conn) return { ok: false, summary: `no connector saved for ${it.appName}; verify it first` };
      const blocked = await guard(conn.url);
      if (blocked) return { ok: false, summary: blocked };
      const headers: Record<string, string> = {};
      if (conn.token) headers.authorization = /^(Bearer|Basic) /.test(conn.token) ? conn.token : `Bearer ${conn.token}`;

      const args = input.body && typeof input.body === "object" ? (input.body as Record<string, unknown>) : {};
      let reply = await mcpPost(conn.url, headers, mcpEnvelope("tools/call", { name: step.tool, arguments: args }));
      // Stateless servers that still insist on the handshake: initialize, retry once.
      if (reply && /initiali[sz]/i.test(JSON.stringify((reply as { error?: unknown }).error ?? ""))) {
        await mcpPost(
          conn.url,
          headers,
          mcpEnvelope("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "nodeworm-flows", version: "1.0" } }),
        );
        reply = await mcpPost(conn.url, headers, mcpEnvelope("tools/call", { name: step.tool, arguments: args }));
      }
      if (!reply) return { ok: false, summary: `could not reach the ${it.appName} connector as an MCP server` };
      return parseMcpResult(reply);
    },
  };
}

export async function mcpPost(url: string, headers: Record<string, string>, envelope: Record<string, unknown>): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
      body: JSON.stringify(envelope),
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = (await res.text().catch(() => "")).slice(0, MAX_BODY);
    return parseMcpHttpBody(text);
  } catch {
    return null;
  }
}
