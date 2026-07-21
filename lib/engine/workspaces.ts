// Team workspaces: share flows + connections between accounts. Server-only,
// Neon-backed, inert without a database (workspaces simply unavailable, the
// app stays single-user). Credentials are NEVER shared: a member runs a shared
// connection server-side under the owner's vault scope and never sees tokens.

import { neon } from "@neondatabase/serverless";
import { authAvailable } from "./auth";

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

export function workspacesAvailable(): boolean {
  return Boolean(sql) && authAvailable();
}

let schemaInit: Promise<void> | null = null;
async function ensureSchema(): Promise<void> {
  if (!sql) return;
  schemaInit ??= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS workspaces (
      id text PRIMARY KEY,
      name text NOT NULL,
      owner_id text NOT NULL,
      created_at bigint NOT NULL
    )`;
    await sql`CREATE TABLE IF NOT EXISTS workspace_members (
      workspace_id text NOT NULL,
      user_id text NOT NULL,
      role text NOT NULL,
      added_at bigint NOT NULL,
      PRIMARY KEY (workspace_id, user_id)
    )`;
    await sql`CREATE TABLE IF NOT EXISTS workspace_invites (
      workspace_id text NOT NULL,
      email text NOT NULL,
      invited_at bigint NOT NULL,
      PRIMARY KEY (workspace_id, email)
    )`;
  })();
  await schemaInit;
}

function id(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

export interface WorkspaceRef {
  id: string;
  name: string;
  role: "owner" | "member";
}

export async function createWorkspace(name: string, ownerId: string): Promise<WorkspaceRef> {
  await ensureSchema();
  const wid = id();
  const now = Date.now();
  await sql!`INSERT INTO workspaces (id, name, owner_id, created_at) VALUES (${wid}, ${name.trim().slice(0, 80) || "Workspace"}, ${ownerId}, ${now})`;
  await sql!`INSERT INTO workspace_members (workspace_id, user_id, role, added_at) VALUES (${wid}, ${ownerId}, 'owner', ${now})`;
  return { id: wid, name: name.trim().slice(0, 80) || "Workspace", role: "owner" };
}

export async function myWorkspaces(userId: string): Promise<WorkspaceRef[]> {
  if (!sql) return [];
  await ensureSchema();
  const rows = (await sql`SELECT w.id AS id, w.name AS name, m.role AS role
    FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id
    WHERE m.user_id = ${userId} ORDER BY w.created_at DESC`) as Array<{ id: string; name: string; role: "owner" | "member" }>;
  return rows;
}

export async function myWorkspaceIds(userId: string | undefined): Promise<string[]> {
  if (!userId || !sql) return [];
  return (await myWorkspaces(userId)).map((w) => w.id);
}

export async function isMember(workspaceId: string, userId: string): Promise<boolean> {
  if (!sql) return false;
  await ensureSchema();
  const rows = (await sql`SELECT 1 AS ok FROM workspace_members WHERE workspace_id = ${workspaceId} AND user_id = ${userId} LIMIT 1`) as unknown[];
  return rows.length > 0;
}

export async function memberRole(workspaceId: string, userId: string): Promise<"owner" | "member" | null> {
  if (!sql) return null;
  await ensureSchema();
  const rows = (await sql`SELECT role FROM workspace_members WHERE workspace_id = ${workspaceId} AND user_id = ${userId} LIMIT 1`) as Array<{ role: "owner" | "member" }>;
  return rows[0]?.role ?? null;
}

export async function listMembers(workspaceId: string): Promise<Array<{ userId: string; email: string; role: string }>> {
  await ensureSchema();
  const rows = (await sql!`SELECT m.user_id AS user_id, u.email AS email, m.role AS role
    FROM workspace_members m JOIN users u ON u.id = m.user_id
    WHERE m.workspace_id = ${workspaceId} ORDER BY m.added_at ASC`) as Array<{ user_id: string; email: string; role: string }>;
  return rows.map((r) => ({ userId: r.user_id, email: r.email, role: r.role }));
}

export async function listInvites(workspaceId: string): Promise<string[]> {
  await ensureSchema();
  const rows = (await sql!`SELECT email FROM workspace_invites WHERE workspace_id = ${workspaceId} ORDER BY invited_at ASC`) as Array<{ email: string }>;
  return rows.map((r) => r.email);
}

// Invite by email. If that account already exists it becomes a member right
// away; otherwise a pending invite converts on their first sign-in/up.
export async function invite(workspaceId: string, email: string): Promise<{ status: "member" | "invited" | "invalid" }> {
  const e = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return { status: "invalid" };
  await ensureSchema();
  const users = (await sql!`SELECT id FROM users WHERE email = ${e} LIMIT 1`) as Array<{ id: string }>;
  if (users.length) {
    await sql!`INSERT INTO workspace_members (workspace_id, user_id, role, added_at)
      VALUES (${workspaceId}, ${users[0].id}, 'member', ${Date.now()}) ON CONFLICT DO NOTHING`;
    return { status: "member" };
  }
  await sql!`INSERT INTO workspace_invites (workspace_id, email, invited_at)
    VALUES (${workspaceId}, ${e}, ${Date.now()}) ON CONFLICT DO NOTHING`;
  return { status: "invited" };
}

// Called after a successful sign-in/up: pending invites become memberships.
export async function acceptInvites(userId: string, email: string): Promise<number> {
  if (!sql) return 0;
  await ensureSchema();
  const e = email.trim().toLowerCase();
  const rows = (await sql`SELECT workspace_id FROM workspace_invites WHERE email = ${e}`) as Array<{ workspace_id: string }>;
  for (const r of rows) {
    await sql`INSERT INTO workspace_members (workspace_id, user_id, role, added_at)
      VALUES (${r.workspace_id}, ${userId}, 'member', ${Date.now()}) ON CONFLICT DO NOTHING`;
  }
  if (rows.length) await sql`DELETE FROM workspace_invites WHERE email = ${e}`;
  return rows.length;
}

export async function removeMember(workspaceId: string, userId: string): Promise<void> {
  await ensureSchema();
  await sql!`DELETE FROM workspace_members WHERE workspace_id = ${workspaceId} AND user_id = ${userId} AND role <> 'owner'`;
}

export async function cancelInvite(workspaceId: string, email: string): Promise<void> {
  await ensureSchema();
  await sql!`DELETE FROM workspace_invites WHERE workspace_id = ${workspaceId} AND email = ${email.trim().toLowerCase()}`;
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  await ensureSchema();
  await sql!`DELETE FROM workspace_invites WHERE workspace_id = ${workspaceId}`;
  await sql!`DELETE FROM workspace_members WHERE workspace_id = ${workspaceId}`;
  await sql!`DELETE FROM workspaces WHERE id = ${workspaceId}`;
}
