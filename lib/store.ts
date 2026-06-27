// Integration store. Neon (serverless Postgres) when DATABASE_URL is set,
// otherwise a file-backed JSON store so the app still runs with zero config.
// The function surface (list/get/create/save/remove/addSecret) is the only seam.

import fs from "fs";
import path from "path";
import { neon } from "@neondatabase/serverless";
import { freshPhases, type Bridge, type Integration } from "./engine/types";

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

// ---- Neon ----------------------------------------------------------------

let schemaInit: Promise<void> | null = null;
async function ensureSchema(): Promise<void> {
  if (!sql) return;
  schemaInit ??= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS integrations (
      id text PRIMARY KEY,
      created_at bigint NOT NULL,
      updated_at bigint NOT NULL,
      app_name text NOT NULL,
      status text NOT NULL,
      data jsonb NOT NULL
    )`;
    await sql`CREATE TABLE IF NOT EXISTS bridges (
      id text PRIMARY KEY,
      created_at bigint NOT NULL,
      updated_at bigint NOT NULL,
      source_id text NOT NULL,
      target_id text NOT NULL,
      status text NOT NULL,
      data jsonb NOT NULL
    )`;
  })();
  await schemaInit;
}

async function persistRow(rec: Integration): Promise<void> {
  await sql!`INSERT INTO integrations (id, created_at, updated_at, app_name, status, data)
    VALUES (${rec.id}, ${rec.createdAt}, ${rec.updatedAt}, ${rec.appName}, ${rec.status}, ${JSON.stringify(rec)}::jsonb)
    ON CONFLICT (id) DO UPDATE SET
      updated_at = EXCLUDED.updated_at,
      status = EXCLUDED.status,
      data = EXCLUDED.data`;
}

// ---- File fallback -------------------------------------------------------

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "abie.json");
let fileCache: Integration[] | null = null;

function fileLoad(): Integration[] {
  try {
    fileCache = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) as Integration[];
    return fileCache;
  } catch {
    fileCache ??= [];
    return fileCache;
  }
}

function filePersist(arr: Integration[]): void {
  fileCache = arr;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(arr, null, 2));
  } catch {
    // Read-only FS: in-memory only.
  }
}

// ---- Public surface ------------------------------------------------------

export async function listIntegrations(): Promise<Integration[]> {
  if (sql) {
    await ensureSchema();
    const rows = (await sql`SELECT data FROM integrations ORDER BY created_at DESC`) as Array<{ data: Integration }>;
    return rows.map((r) => r.data);
  }
  return [...fileLoad()].sort((a, b) => b.createdAt - a.createdAt);
}

export async function getIntegration(id: string): Promise<Integration | undefined> {
  if (sql) {
    await ensureSchema();
    const rows = (await sql`SELECT data FROM integrations WHERE id = ${id} LIMIT 1`) as Array<{ data: Integration }>;
    return rows[0]?.data;
  }
  return fileLoad().find((i) => i.id === id);
}

export async function createIntegration(appName: string, appUrl?: string, userId?: string): Promise<Integration> {
  const now = Date.now();
  const rec: Integration = {
    id: shortId(),
    appName: appName.trim(),
    appUrl: appUrl?.trim() || undefined,
    userId,
    status: "draft",
    createdAt: now,
    updatedAt: now,
    currentPhase: 0,
    phases: freshPhases(),
    mode: "heuristic",
    secrets: [],
  };
  if (sql) {
    await ensureSchema();
    await persistRow(rec);
  } else {
    const all = fileLoad();
    all.unshift(rec);
    filePersist(all);
  }
  return rec;
}

export async function saveIntegration(rec: Integration): Promise<Integration> {
  if (sql) {
    await ensureSchema();
    await persistRow(rec);
    return rec;
  }
  const all = fileLoad();
  const i = all.findIndex((x) => x.id === rec.id);
  if (i >= 0) all[i] = rec;
  else all.unshift(rec);
  filePersist(all);
  return rec;
}

export async function removeIntegration(id: string): Promise<boolean> {
  if (sql) {
    await ensureSchema();
    const rows = (await sql`DELETE FROM integrations WHERE id = ${id} RETURNING id`) as Array<{ id: string }>;
    return rows.length > 0;
  }
  const all = fileLoad();
  const i = all.findIndex((x) => x.id === id);
  if (i < 0) return false;
  all.splice(i, 1);
  filePersist(all);
  return true;
}

// Strip the transient OAuth handshake (one-time state + PKCE verifier) before a
// record crosses to the client. That field is server-only: leaking it would let
// the browser replay a consent state against the callback. Tokens never live
// here (only masked refs in secrets), so this is the sole client-facing scrub.
export function redactIntegration(it: Integration): Integration {
  if (!it.oauth && !it.cobrowse && !it.managedSession) return it;
  const copy = { ...it };
  delete copy.oauth;
  // connectUrl is a control endpoint for the remote browser; keep the user-facing
  // liveViewUrl but never ship the connectUrl (or the durable contextId) to the client.
  if (copy.cobrowse) copy.cobrowse = { ...copy.cobrowse, connectUrl: "" };
  if (copy.managedSession) copy.managedSession = { ...copy.managedSession, connectUrl: undefined };
  return copy;
}

// Pure object mutation; persistence is the caller's saveIntegration().
export function addSecret(it: Integration, name: string, value: string): Integration {
  it.secrets = it.secrets.filter((s) => s.name !== name);
  it.secrets.push({ name, maskedValue: mask(value), addedAt: Date.now() });
  return it;
}

// ---- Bridges (app-to-app) ------------------------------------------------

const BRIDGE_FILE = path.join(DATA_DIR, "bridges.json");
let bridgeCache: Bridge[] | null = null;

function bridgeLoad(): Bridge[] {
  try {
    bridgeCache = JSON.parse(fs.readFileSync(BRIDGE_FILE, "utf8")) as Bridge[];
    return bridgeCache;
  } catch {
    bridgeCache ??= [];
    return bridgeCache;
  }
}

function bridgePersistFile(arr: Bridge[]): void {
  bridgeCache = arr;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(BRIDGE_FILE, JSON.stringify(arr, null, 2));
  } catch {
    // Read-only FS: in-memory only.
  }
}

export async function listBridges(): Promise<Bridge[]> {
  if (sql) {
    await ensureSchema();
    const rows = (await sql`SELECT data FROM bridges ORDER BY created_at DESC`) as Array<{ data: Bridge }>;
    return rows.map((r) => r.data);
  }
  return [...bridgeLoad()].sort((a, b) => b.createdAt - a.createdAt);
}

export async function getBridge(id: string): Promise<Bridge | undefined> {
  if (sql) {
    await ensureSchema();
    const rows = (await sql`SELECT data FROM bridges WHERE id = ${id} LIMIT 1`) as Array<{ data: Bridge }>;
    return rows[0]?.data;
  }
  return bridgeLoad().find((b) => b.id === id);
}

export function newBridge(source: Integration, target: Integration): Bridge {
  const now = Date.now();
  return {
    id: shortId(),
    createdAt: now,
    updatedAt: now,
    sourceId: source.id,
    targetId: target.id,
    sourceName: source.appName,
    targetName: target.appName,
    status: "running",
  };
}

export async function saveBridge(rec: Bridge): Promise<Bridge> {
  rec.updatedAt = Date.now();
  if (sql) {
    await ensureSchema();
    await sql`INSERT INTO bridges (id, created_at, updated_at, source_id, target_id, status, data)
      VALUES (${rec.id}, ${rec.createdAt}, ${rec.updatedAt}, ${rec.sourceId}, ${rec.targetId}, ${rec.status}, ${JSON.stringify(rec)}::jsonb)
      ON CONFLICT (id) DO UPDATE SET updated_at = EXCLUDED.updated_at, status = EXCLUDED.status, data = EXCLUDED.data`;
    return rec;
  }
  const all = bridgeLoad();
  const i = all.findIndex((x) => x.id === rec.id);
  if (i >= 0) all[i] = rec;
  else all.unshift(rec);
  bridgePersistFile(all);
  return rec;
}

export async function removeBridge(id: string): Promise<boolean> {
  if (sql) {
    await ensureSchema();
    const rows = (await sql`DELETE FROM bridges WHERE id = ${id} RETURNING id`) as Array<{ id: string }>;
    return rows.length > 0;
  }
  const all = bridgeLoad();
  const i = all.findIndex((x) => x.id === id);
  if (i < 0) return false;
  all.splice(i, 1);
  bridgePersistFile(all);
  return true;
}

function shortId(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

function mask(value: string): string {
  const v = value.trim();
  if (v.length <= 8) return "****";
  return `${v.slice(0, 4)}...${v.slice(-4)}`;
}
