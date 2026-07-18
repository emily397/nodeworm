// Flow + run persistence. Neon when DATABASE_URL is set, file-backed fallback
// otherwise (same seam discipline as lib/store.ts).

import fs from "fs";
import path from "path";
import { neon } from "@neondatabase/serverless";
import { authAvailable, currentUserId } from "../engine/auth";
import type { Flow, FlowRun } from "./types";

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

export const RUN_CAP = 100;

let schemaInit: Promise<void> | null = null;
async function ensureSchema(): Promise<void> {
  if (!sql) return;
  schemaInit ??= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS flows (
      id text PRIMARY KEY,
      created_at bigint NOT NULL,
      updated_at bigint NOT NULL,
      user_id text,
      enabled boolean NOT NULL,
      data jsonb NOT NULL
    )`;
    await sql`CREATE TABLE IF NOT EXISTS flow_runs (
      id text PRIMARY KEY,
      flow_id text NOT NULL,
      created_at bigint NOT NULL,
      status text NOT NULL,
      data jsonb NOT NULL
    )`;
    await sql`CREATE INDEX IF NOT EXISTS flow_runs_flow_idx ON flow_runs (flow_id, created_at DESC)`;
  })();
  await schemaInit;
}

// ---- File fallback ---------------------------------------------------------

const DATA_DIR = path.join(process.cwd(), ".data");
const FLOWS_FILE = path.join(DATA_DIR, "flows.json");
const RUNS_FILE = path.join(DATA_DIR, "flow-runs.json");

function load<T>(file: string, cache: { v: T[] | null }): T[] {
  try {
    cache.v = JSON.parse(fs.readFileSync(file, "utf8")) as T[];
    return cache.v;
  } catch {
    cache.v ??= [];
    return cache.v;
  }
}

function persist<T>(file: string, cache: { v: T[] | null }, arr: T[]): void {
  cache.v = arr;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(arr, null, 2));
  } catch {
    // Read-only FS: in-memory only.
  }
}

const flowCache: { v: Flow[] | null } = { v: null };
const runCache: { v: FlowRun[] | null } = { v: null };

// ---- Flows -----------------------------------------------------------------

export async function listFlows(): Promise<Flow[]> {
  if (sql) {
    await ensureSchema();
    const rows = (await sql`SELECT data FROM flows ORDER BY created_at DESC`) as Array<{ data: Flow }>;
    return rows.map((r) => r.data);
  }
  return [...load(FLOWS_FILE, flowCache)].sort((a, b) => b.createdAt - a.createdAt);
}

export async function getFlow(id: string): Promise<Flow | undefined> {
  if (sql) {
    await ensureSchema();
    const rows = (await sql`SELECT data FROM flows WHERE id = ${id} LIMIT 1`) as Array<{ data: Flow }>;
    return rows[0]?.data;
  }
  return load(FLOWS_FILE, flowCache).find((f) => f.id === id);
}

// Ownership-scoped fetch, mirroring getOwnedIntegration: with accounts on, an
// owned flow is only reachable by its owner (route answers 404 otherwise).
export async function getOwnedFlow(req: Request, id: string): Promise<Flow | undefined> {
  const f = await getFlow(id);
  if (!f) return undefined;
  if (authAvailable() && f.userId && f.userId !== (await currentUserId(req))) return undefined;
  return f;
}

export async function saveFlow(rec: Flow): Promise<Flow> {
  if (sql) {
    await ensureSchema();
    await sql`INSERT INTO flows (id, created_at, updated_at, user_id, enabled, data)
      VALUES (${rec.id}, ${rec.createdAt}, ${rec.updatedAt}, ${rec.userId ?? null}, ${rec.enabled}, ${JSON.stringify(rec)}::jsonb)
      ON CONFLICT (id) DO UPDATE SET updated_at = EXCLUDED.updated_at, enabled = EXCLUDED.enabled, data = EXCLUDED.data`;
    return rec;
  }
  const all = load(FLOWS_FILE, flowCache);
  const i = all.findIndex((x) => x.id === rec.id);
  if (i >= 0) all[i] = rec;
  else all.unshift(rec);
  persist(FLOWS_FILE, flowCache, all);
  return rec;
}

export async function removeFlow(id: string): Promise<boolean> {
  if (sql) {
    await ensureSchema();
    await sql`DELETE FROM flow_runs WHERE flow_id = ${id}`;
    const rows = (await sql`DELETE FROM flows WHERE id = ${id} RETURNING id`) as Array<{ id: string }>;
    return rows.length > 0;
  }
  const all = load(FLOWS_FILE, flowCache);
  const i = all.findIndex((x) => x.id === id);
  if (i < 0) return false;
  all.splice(i, 1);
  persist(FLOWS_FILE, flowCache, all);
  const runs = load(RUNS_FILE, runCache).filter((r) => r.flowId !== id);
  persist(RUNS_FILE, runCache, runs);
  return true;
}

// ---- Runs ------------------------------------------------------------------

export async function saveRun(run: FlowRun): Promise<void> {
  if (sql) {
    await ensureSchema();
    await sql`INSERT INTO flow_runs (id, flow_id, created_at, status, data)
      VALUES (${run.id}, ${run.flowId}, ${run.startedAt}, ${run.status}, ${JSON.stringify(run)}::jsonb)
      ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, data = EXCLUDED.data`;
    await sql`DELETE FROM flow_runs WHERE flow_id = ${run.flowId} AND id NOT IN (
      SELECT id FROM flow_runs WHERE flow_id = ${run.flowId} ORDER BY created_at DESC LIMIT ${RUN_CAP}
    )`;
    return;
  }
  const all = load(RUNS_FILE, runCache);
  const i = all.findIndex((r) => r.id === run.id);
  if (i >= 0) all[i] = run;
  else all.unshift(run);
  const byFlow = all.filter((r) => r.flowId === run.flowId).sort((a, b) => b.startedAt - a.startedAt);
  const keep = new Set(byFlow.slice(0, RUN_CAP).map((r) => r.id));
  persist(
    RUNS_FILE,
    runCache,
    all.filter((r) => r.flowId !== run.flowId || keep.has(r.id)),
  );
}

export async function listRuns(flowId: string, limit = 30): Promise<FlowRun[]> {
  if (sql) {
    await ensureSchema();
    const rows = (await sql`SELECT data FROM flow_runs WHERE flow_id = ${flowId} ORDER BY created_at DESC LIMIT ${limit}`) as Array<{ data: FlowRun }>;
    return rows.map((r) => r.data);
  }
  return load(RUNS_FILE, runCache)
    .filter((r) => r.flowId === flowId)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, limit);
}
