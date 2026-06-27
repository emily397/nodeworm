// Genuine OAuth 2.0 (Authorization Code + PKCE) for NodeWorm. This is the ONLY
// way NodeWorm acquires credentials: never an API key. The registry below holds
// the real authorize/token endpoints and scopes for well-known providers. The
// per-app client_id/client_secret live in env (OAUTH_<SLUG>_CLIENT_ID /
// _CLIENT_SECRET) so nothing secret is ever committed or pasted into the UI.
// Cost: standard fetch, zero new vendors. Unconfigured providers degrade
// honestly (the start route says which env vars to set) rather than faking it.

import crypto from "crypto";
import type { CredCtx } from "./types";

export interface OAuthProvider {
  // Real provider endpoints.
  authorizeUrl: string;
  tokenUrl: string;
  // Real provider scopes (NOT NodeWorm's abstract scopes).
  scopes: string[];
  scopeSep: string; // " " for most, "," for a few (GitHub, Calendly is " ")
  pkce: boolean; // send code_challenge / code_verifier
  tokenAuth: "body" | "basic"; // client creds in body params or HTTP Basic header
  // Extra params appended to the authorize URL (e.g. Google offline access).
  extraAuth?: Record<string, string>;
  // Some providers (Shopify, Salesforce) need a tenant domain in the URL.
  needsDomainEnv?: string;
}

const GOOGLE: Omit<OAuthProvider, "scopes"> = {
  authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  scopeSep: " ",
  pkce: true,
  tokenAuth: "body",
  extraAuth: { access_type: "offline", prompt: "consent" },
};

// Keyed by NodeWorm appName (exact, case-insensitive lookup below).
const PROVIDERS: Record<string, OAuthProvider> = {
  notion: {
    authorizeUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    scopes: [],
    scopeSep: " ",
    pkce: false,
    tokenAuth: "basic",
    extraAuth: { owner: "user" },
  },
  slack: {
    authorizeUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    scopes: ["chat:write", "channels:read", "channels:history", "users:read"],
    scopeSep: ",",
    pkce: false,
    tokenAuth: "body",
  },
  github: {
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scopes: ["repo", "read:org"],
    scopeSep: " ",
    pkce: false,
    tokenAuth: "body",
  },
  gmail: { ...GOOGLE, scopes: ["https://www.googleapis.com/auth/gmail.modify"] },
  "google calendar": { ...GOOGLE, scopes: ["https://www.googleapis.com/auth/calendar"] },
  hubspot: {
    authorizeUrl: "https://app.hubspot.com/oauth/authorize",
    tokenUrl: "https://api.hubapi.com/oauth/v1/token",
    scopes: ["crm.objects.contacts.read", "crm.objects.contacts.write", "crm.objects.deals.write"],
    scopeSep: " ",
    pkce: false,
    tokenAuth: "body",
  },
  linear: {
    authorizeUrl: "https://linear.app/oauth/authorize",
    tokenUrl: "https://api.linear.app/oauth/token",
    scopes: ["read", "write"],
    scopeSep: ",",
    pkce: false,
    tokenAuth: "body",
  },
  airtable: {
    authorizeUrl: "https://airtable.com/oauth2/v1/authorize",
    tokenUrl: "https://airtable.com/oauth2/v1/token",
    scopes: ["data.records:read", "data.records:write", "schema.bases:read"],
    scopeSep: " ",
    pkce: true,
    tokenAuth: "basic",
  },
  "quickbooks online": {
    authorizeUrl: "https://appcenter.intuit.com/connect/oauth2",
    tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    scopes: ["com.intuit.quickbooks.accounting"],
    scopeSep: " ",
    pkce: false,
    tokenAuth: "basic",
  },
  xero: {
    authorizeUrl: "https://login.xero.com/identity/connect/authorize",
    tokenUrl: "https://identity.xero.com/connect/token",
    scopes: ["openid", "offline_access", "accounting.transactions", "accounting.contacts"],
    scopeSep: " ",
    pkce: true,
    tokenAuth: "basic",
  },
  ticktick: {
    authorizeUrl: "https://ticktick.com/oauth/authorize",
    tokenUrl: "https://ticktick.com/oauth/token",
    scopes: ["tasks:read", "tasks:write"],
    scopeSep: " ",
    pkce: false,
    tokenAuth: "basic",
  },
  calendly: {
    authorizeUrl: "https://auth.calendly.com/oauth/authorize",
    tokenUrl: "https://auth.calendly.com/oauth/token",
    scopes: ["default"],
    scopeSep: " ",
    pkce: false,
    tokenAuth: "basic",
  },
  jira: {
    authorizeUrl: "https://auth.atlassian.com/authorize",
    tokenUrl: "https://auth.atlassian.com/oauth/token",
    scopes: ["read:jira-work", "write:jira-work", "offline_access"],
    scopeSep: " ",
    pkce: false,
    tokenAuth: "body",
    extraAuth: { audience: "api.atlassian.com", prompt: "consent" },
  },
  discord: {
    authorizeUrl: "https://discord.com/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    // No "bot" scope: that triggers Discord's bot-install flow (needs a guild +
    // permissions integer) and the token exchange does not return a user token.
    // A read+write user connector authorizes with identify + guilds.
    scopes: ["identify", "guilds"],
    scopeSep: " ",
    pkce: false,
    tokenAuth: "body",
  },
  shopify: {
    authorizeUrl: "https://{domain}/admin/oauth/authorize",
    tokenUrl: "https://{domain}/admin/oauth/access_token",
    scopes: ["read_orders", "write_products", "read_customers"],
    scopeSep: ",",
    pkce: false,
    tokenAuth: "body",
    needsDomainEnv: "OAUTH_SHOPIFY_SHOP",
  },
  salesforce: {
    authorizeUrl: "https://login.salesforce.com/services/oauth2/authorize",
    tokenUrl: "https://login.salesforce.com/services/oauth2/token",
    scopes: ["api", "refresh_token"],
    scopeSep: " ",
    pkce: true,
    tokenAuth: "body",
  },
  stripe: {
    // Stripe Connect OAuth: the genuine OAuth path for an API-key-native product.
    authorizeUrl: "https://connect.stripe.com/oauth/authorize",
    tokenUrl: "https://connect.stripe.com/oauth/token",
    scopes: ["read_write"],
    scopeSep: " ",
    pkce: false,
    tokenAuth: "body",
  },
};

export function slug(appName: string): string {
  return appName.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export function providerFor(
  appName: string,
  discovery?: {
    oauthAuthorizeUrl?: string;
    oauthTokenUrl?: string;
    oauthScopes?: string[];
    oauthTokenAuth?: "body" | "basic";
    oauthScopeSep?: string;
  },
): OAuthProvider | undefined {
  const known = PROVIDERS[appName.trim().toLowerCase()];
  if (known) return known;
  // Fall back to endpoints surfaced by live LLM discovery for unknown apps.
  // Honour the discovered token-auth style and scope separator (a wrong guess
  // here is the usual reason a real exchange fails), defaulting to the most
  // common shape (creds in body, space-separated scopes, PKCE) when unstated.
  if (discovery?.oauthAuthorizeUrl && discovery?.oauthTokenUrl) {
    return {
      authorizeUrl: discovery.oauthAuthorizeUrl,
      tokenUrl: discovery.oauthTokenUrl,
      scopes: discovery.oauthScopes ?? [],
      scopeSep: discovery.oauthScopeSep ?? " ",
      pkce: true,
      tokenAuth: discovery.oauthTokenAuth ?? "body",
    };
  }
  return undefined;
}

export interface ClientCreds {
  clientId: string;
  clientSecret: string;
}

// Operator-provided client, from server env (highest priority, sync).
export function envClientCreds(appName: string): ClientCreds | undefined {
  const s = slug(appName);
  const clientId = process.env[`OAUTH_${s}_CLIENT_ID`];
  const clientSecret = process.env[`OAUTH_${s}_CLIENT_SECRET`];
  if (clientId && clientSecret) return { clientId, clientSecret };
  return undefined;
}

// Resolve a usable client: env first, then the per-connection encrypted vault
// (where a pasted-back or DCR-registered client lives). Async because the vault
// decrypts server-side.
export async function clientCreds(appName: string, ctx?: CredCtx): Promise<ClientCreds | undefined> {
  const env = envClientCreds(appName);
  if (env) return env;
  if (ctx?.connectionId) {
    const { getVaultClientCreds } = await import("./vault");
    return getVaultClientCreds(appName, { connectionId: ctx.connectionId, userId: ctx.userId });
  }
  return undefined;
}

export interface ConfigCheck {
  ok: boolean;
  reason?: string;
  envVars: string[];
}

// Honest gate: can NodeWorm actually run a real consent for this app right now?
export function configCheck(appName: string, provider?: OAuthProvider): ConfigCheck {
  const s = slug(appName);
  const envVars = [`OAUTH_${s}_CLIENT_ID`, `OAUTH_${s}_CLIENT_SECRET`];
  if (!provider) {
    return { ok: false, reason: `No OAuth provider endpoints are registered for ${appName}.`, envVars };
  }
  if (provider.needsDomainEnv) envVars.push(provider.needsDomainEnv);
  if (!envClientCreds(appName)) {
    return { ok: false, reason: `OAuth client credentials are not set for ${appName}.`, envVars };
  }
  if (provider.needsDomainEnv && !process.env[provider.needsDomainEnv]) {
    return { ok: false, reason: `${appName} needs a tenant domain in ${provider.needsDomainEnv}.`, envVars };
  }
  return { ok: true, envVars };
}

function resolveUrl(template: string, provider: OAuthProvider): string {
  if (!provider.needsDomainEnv) return template;
  const domain = process.env[provider.needsDomainEnv] ?? "";
  return template.replace("{domain}", domain);
}

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function randomState(): string {
  return crypto.randomBytes(16).toString("base64url");
}

export function buildAuthorizeUrl(opts: {
  appName: string;
  provider: OAuthProvider;
  creds: ClientCreds;
  redirectUri: string;
  state: string;
  challenge?: string;
  scopesOverride?: string[];
}): string {
  const { provider, creds, redirectUri, state } = opts;
  const url = new URL(resolveUrl(provider.authorizeUrl, provider));
  const scopes = (opts.scopesOverride?.length ? opts.scopesOverride : provider.scopes).join(provider.scopeSep);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", creds.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  if (scopes) url.searchParams.set("scope", scopes);
  if (provider.pkce && opts.challenge) {
    url.searchParams.set("code_challenge", opts.challenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  for (const [k, v] of Object.entries(provider.extraAuth ?? {})) url.searchParams.set(k, v);
  return url.toString();
}

export interface TokenResult {
  ok: boolean;
  accessToken?: string;
  refreshToken?: string;
  raw?: Record<string, unknown>;
  error?: string;
}

export async function exchangeCode(opts: {
  provider: OAuthProvider;
  creds: ClientCreds;
  code: string;
  redirectUri: string;
  verifier?: string;
}): Promise<TokenResult> {
  const { provider, creds, code, redirectUri, verifier } = opts;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  if (provider.pkce && verifier) body.set("code_verifier", verifier);

  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
    accept: "application/json",
  };
  if (provider.tokenAuth === "basic") {
    headers.authorization = `Basic ${Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64")}`;
  } else {
    body.set("client_id", creds.clientId);
    body.set("client_secret", creds.clientSecret);
  }

  try {
    const res = await fetch(resolveUrl(provider.tokenUrl, provider), { method: "POST", headers, body });
    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = Object.fromEntries(new URLSearchParams(text));
    }
    if (!res.ok || data.error) {
      return { ok: false, error: String(data.error_description ?? data.error ?? `HTTP ${res.status}`) };
    }
    // Slack nests the bot token under authed_user / access_token at top level.
    const accessToken = String(data.access_token ?? (data.authed_user as Record<string, unknown>)?.access_token ?? "");
    if (!accessToken) return { ok: false, error: "No access_token in token response." };
    return {
      ok: true,
      accessToken,
      refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : undefined,
      raw: data,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Token exchange failed." };
  }
}
