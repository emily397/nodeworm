// Credential vault: the single server-side egress point for OAuth client creds
// and tokens. Values are encrypted at rest (vault-crypto, AAD-bound) and only
// ever decrypted here, server-side, never returned to the browser.
//
// Scope: a signed-in user's creds are stored once per (user, app) and reused
// across all their connections to that app (scope "u:<userId>"); an anonymous
// run stores per (connection, app) (scope "c:<connectionId>"). The AAD and row
// key both derive from this scope, so a stolen ciphertext cannot be transplanted
// to another scope.
//
// Inert-until-keyed: requires DATABASE_URL (Neon) AND VAULT_KEK. When either is
// missing the vault reports unprovisioned and the resolver degrades to the
// guided portal flow instead of persisting anything.

import { neon } from "@neondatabase/serverless";
import { open, seal, vaultKeyed } from "./vault-crypto";
import { slug } from "./oauth";
import type { ClientCreds } from "./oauth";

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

export interface CredScope {
  connectionId: string;
  userId?: string;
}

function scopeKey(scope: CredScope): string {
  return scope.userId ? `u:${scope.userId}` : `c:${scope.connectionId}`;
}

export function vaultAvailable(): boolean {
  return Boolean(sql && vaultKeyed());
}

export function vaultStatus(): { available: boolean; reason?: string } {
  if (!sql) return { available: false, reason: "vault needs a database (set DATABASE_URL)" };
  if (!vaultKeyed()) return { available: false, reason: "credential vault not provisioned (set VAULT_KEK)" };
  return { available: true };
}

let warned = false;
function warnIfMisconfigured() {
  if (sql && !vaultKeyed() && !warned) {
    warned = true;
    console.warn("[nodeworm] DATABASE_URL is set but VAULT_KEK is not: OAuth credential vault is disabled, recovery degrades to guided portal.");
  }
}

let schemaInit: Promise<void> | null = null;
async function ensureSchema(): Promise<void> {
  if (!sql) return;
  schemaInit ??= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS oauth_creds (
      id text PRIMARY KEY,
      scope_key text NOT NULL,
      app_slug text NOT NULL,
      client_id_enc text,
      client_secret_enc text,
      access_token_enc text,
      refresh_token_enc text,
      connector_url_enc text,
      connector_token_enc text,
      source text NOT NULL,
      created_at bigint NOT NULL,
      updated_at bigint NOT NULL,
      UNIQUE (scope_key, app_slug)
    )`;
    // Existing deployments predate the connector columns: add them defensively.
    await sql`ALTER TABLE oauth_creds ADD COLUMN IF NOT EXISTS connector_url_enc text`;
    await sql`ALTER TABLE oauth_creds ADD COLUMN IF NOT EXISTS connector_token_enc text`;
  })();
  await schemaInit;
}

function aad(key: string, appSlug: string, field: string): string {
  return `${key}:${appSlug}:${field}`;
}

function rowId(key: string, appSlug: string): string {
  return `${key}__${appSlug}`;
}

interface CredRow {
  client_id_enc: string | null;
  client_secret_enc: string | null;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  connector_url_enc: string | null;
  connector_token_enc: string | null;
}

async function loadRow(key: string, appSlug: string): Promise<CredRow | undefined> {
  await ensureSchema();
  const rows = (await sql!`SELECT client_id_enc, client_secret_enc, access_token_enc, refresh_token_enc, connector_url_enc, connector_token_enc
    FROM oauth_creds WHERE scope_key = ${key} AND app_slug = ${appSlug} LIMIT 1`) as CredRow[];
  return rows[0];
}

export async function storeClientCreds(appName: string, scope: CredScope, clientId: string, clientSecret: string, source: string): Promise<boolean> {
  warnIfMisconfigured();
  if (!vaultAvailable()) return false;
  await ensureSchema();
  const s = slug(appName);
  const key = scopeKey(scope);
  const now = Date.now();
  const cidEnc = seal(clientId, aad(key, s, "client_id"));
  const secEnc = seal(clientSecret, aad(key, s, "client_secret"));
  await sql!`INSERT INTO oauth_creds (id, scope_key, app_slug, client_id_enc, client_secret_enc, source, created_at, updated_at)
    VALUES (${rowId(key, s)}, ${key}, ${s}, ${cidEnc}, ${secEnc}, ${source}, ${now}, ${now})
    ON CONFLICT (scope_key, app_slug) DO UPDATE SET
      client_id_enc = EXCLUDED.client_id_enc,
      client_secret_enc = EXCLUDED.client_secret_enc,
      source = EXCLUDED.source,
      updated_at = EXCLUDED.updated_at`;
  return true;
}

export async function getVaultClientCreds(appName: string, scope: CredScope): Promise<ClientCreds | undefined> {
  if (!vaultAvailable()) return undefined;
  const s = slug(appName);
  const key = scopeKey(scope);
  const row = await loadRow(key, s);
  if (!row?.client_id_enc || !row.client_secret_enc) return undefined;
  return {
    clientId: open(row.client_id_enc, aad(key, s, "client_id")),
    clientSecret: open(row.client_secret_enc, aad(key, s, "client_secret")),
  };
}

export async function storeTokens(appName: string, scope: CredScope, accessToken: string, refreshToken: string | undefined, source: string): Promise<boolean> {
  if (!vaultAvailable()) return false;
  await ensureSchema();
  const s = slug(appName);
  const key = scopeKey(scope);
  const now = Date.now();
  const atEnc = seal(accessToken, aad(key, s, "access_token"));
  const rtEnc = refreshToken ? seal(refreshToken, aad(key, s, "refresh_token")) : null;
  await sql!`INSERT INTO oauth_creds (id, scope_key, app_slug, access_token_enc, refresh_token_enc, source, created_at, updated_at)
    VALUES (${rowId(key, s)}, ${key}, ${s}, ${atEnc}, ${rtEnc}, ${source}, ${now}, ${now})
    ON CONFLICT (scope_key, app_slug) DO UPDATE SET
      access_token_enc = EXCLUDED.access_token_enc,
      refresh_token_enc = COALESCE(EXCLUDED.refresh_token_enc, oauth_creds.refresh_token_enc),
      updated_at = EXCLUDED.updated_at`;
  return true;
}

export async function getVaultTokens(appName: string, scope: CredScope): Promise<{ accessToken: string; refreshToken?: string } | undefined> {
  if (!vaultAvailable()) return undefined;
  const s = slug(appName);
  const key = scopeKey(scope);
  const row = await loadRow(key, s);
  if (!row?.access_token_enc) return undefined;
  return {
    accessToken: open(row.access_token_enc, aad(key, s, "access_token")),
    refreshToken: row.refresh_token_enc ? open(row.refresh_token_enc, aad(key, s, "refresh_token")) : undefined,
  };
}

// A user's self-hosted connector endpoint + the optional token THEY set on their
// own wrapper. NOT the third-party app's API key. Both are encrypted at rest (the
// URL too: a self-host endpoint is sensitive network topology) and read only
// server-side at call time, never returned to the browser.
export async function storeConnector(appName: string, scope: CredScope, url: string, token?: string): Promise<boolean> {
  warnIfMisconfigured();
  if (!vaultAvailable()) return false;
  await ensureSchema();
  const s = slug(appName);
  const key = scopeKey(scope);
  const now = Date.now();
  const urlEnc = seal(url, aad(key, s, "connector_url"));
  const tokEnc = token ? seal(token, aad(key, s, "connector_token")) : null;
  await sql!`INSERT INTO oauth_creds (id, scope_key, app_slug, connector_url_enc, connector_token_enc, source, created_at, updated_at)
    VALUES (${rowId(key, s)}, ${key}, ${s}, ${urlEnc}, ${tokEnc}, ${"connector"}, ${now}, ${now})
    ON CONFLICT (scope_key, app_slug) DO UPDATE SET
      connector_url_enc = EXCLUDED.connector_url_enc,
      connector_token_enc = COALESCE(EXCLUDED.connector_token_enc, oauth_creds.connector_token_enc),
      source = EXCLUDED.source,
      updated_at = EXCLUDED.updated_at`;
  return true;
}

export async function getVaultConnector(appName: string, scope: CredScope): Promise<{ url: string; token?: string } | undefined> {
  if (!vaultAvailable()) return undefined;
  const s = slug(appName);
  const key = scopeKey(scope);
  const row = await loadRow(key, s);
  if (!row?.connector_url_enc) return undefined;
  return {
    url: open(row.connector_url_enc, aad(key, s, "connector_url")),
    token: row.connector_token_enc ? open(row.connector_token_enc, aad(key, s, "connector_token")) : undefined,
  };
}

export async function deleteVaultCreds(scope: CredScope): Promise<void> {
  if (!sql) return;
  await ensureSchema();
  await sql`DELETE FROM oauth_creds WHERE scope_key = ${scopeKey(scope)}`;
}
