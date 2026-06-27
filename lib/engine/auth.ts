// Minimal, real per-user accounts: email + scrypt password, sessions in Neon,
// a signed httpOnly cookie. Raw SQL on the same Neon client style as the store
// (no second ORM, per the design's F9). Inert-until-keyed: requires DATABASE_URL
// plus a signing secret (AUTH_SECRET, falling back to VAULT_KEK). When absent,
// accounts are disabled and the app stays fully anonymous. Server-only.

import crypto from "crypto";
import { neon } from "@neondatabase/serverless";

const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

export const SESSION_COOKIE = "nw_session";
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_MAX_AGE = Math.floor(TTL_MS / 1000);

// The vault-unlock grant: a separate short-lived signed cookie proving the user
// entered their PIN recently. 15 minutes, bound to the user id, cleared on signout.
export const VAULT_COOKIE = "nw_vault";
const VAULT_TTL_MS = 15 * 60 * 1000;
export const VAULT_MAX_AGE = Math.floor(VAULT_TTL_MS / 1000);

function secret(): string | null {
  return process.env.AUTH_SECRET || process.env.VAULT_KEK || null;
}

export function authAvailable(): boolean {
  return Boolean(sql && secret());
}

export function authStatus(): { available: boolean; reason?: string } {
  if (!sql) return { available: false, reason: "accounts need a database (set DATABASE_URL)" };
  if (!secret()) return { available: false, reason: "accounts not enabled (set AUTH_SECRET)" };
  return { available: true };
}

let schemaInit: Promise<void> | null = null;
async function ensureSchema(): Promise<void> {
  if (!sql) return;
  schemaInit ??= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS users (
      id text PRIMARY KEY,
      email text UNIQUE NOT NULL,
      pass_hash text NOT NULL,
      pass_salt text NOT NULL,
      created_at bigint NOT NULL
    )`;
    await sql`CREATE TABLE IF NOT EXISTS sessions (
      id text PRIMARY KEY,
      user_id text NOT NULL,
      created_at bigint NOT NULL,
      expires_at bigint NOT NULL
    )`;
    // Optional 4-digit PIN gate on the per-user vault. Added defensively for
    // existing user rows. The PIN is a session-unlock factor, not an encryption
    // key (see verifyPin / requireVaultUnlock).
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash text`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_salt text`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_set_at bigint`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_failed_count int NOT NULL DEFAULT 0`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_locked_until bigint`;
  })();
  await schemaInit;
}

function id(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function hashPw(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function safeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function sign(sessionId: string): string {
  const mac = crypto.createHmac("sha256", secret()!).update(sessionId).digest("base64url");
  return `${sessionId}.${mac}`;
}

function unsign(token: string): string | null {
  const s = secret();
  if (!s) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const sid = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expect = crypto.createHmac("sha256", s).update(sid).digest("base64url");
  return safeEq(mac, expect) ? sid : null;
}

export interface User {
  id: string;
  email: string;
}

interface AuthResult {
  user?: User;
  token?: string;
  error?: string;
}

export async function signUp(email: string, password: string): Promise<AuthResult> {
  if (!authAvailable()) return { error: authStatus().reason };
  const e = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return { error: "Enter a valid email address." };
  if (password.length < 8) return { error: "Use a password of at least 8 characters." };
  await ensureSchema();
  const existing = (await sql!`SELECT id FROM users WHERE email = ${e} LIMIT 1`) as Array<{ id: string }>;
  if (existing.length) return { error: "An account with that email already exists." };
  const salt = crypto.randomBytes(16).toString("hex");
  const uid = id();
  await sql!`INSERT INTO users (id, email, pass_hash, pass_salt, created_at)
    VALUES (${uid}, ${e}, ${hashPw(password, salt)}, ${salt}, ${Date.now()})`;
  return { user: { id: uid, email: e }, token: await createSession(uid) };
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  if (!authAvailable()) return { error: authStatus().reason };
  const e = email.trim().toLowerCase();
  await ensureSchema();
  const rows = (await sql!`SELECT id, email, pass_hash, pass_salt FROM users WHERE email = ${e} LIMIT 1`) as Array<{
    id: string;
    email: string;
    pass_hash: string;
    pass_salt: string;
  }>;
  const u = rows[0];
  if (!u || !safeEq(hashPw(password, u.pass_salt), u.pass_hash)) {
    return { error: "Invalid email or password." };
  }
  return { user: { id: u.id, email: u.email }, token: await createSession(u.id) };
}

async function createSession(userId: string): Promise<string> {
  const sid = id();
  const now = Date.now();
  await sql!`INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (${sid}, ${userId}, ${now}, ${now + TTL_MS})`;
  return sign(sid);
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!sql || !token) return;
  const sid = unsign(token);
  if (!sid) return;
  await ensureSchema();
  await sql`DELETE FROM sessions WHERE id = ${sid}`;
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq) === name) return decodeURIComponent(part.slice(eq + 1));
  }
  return undefined;
}

export function sessionToken(req: Request): string | undefined {
  return readCookie(req, SESSION_COOKIE);
}

export async function currentUser(req: Request): Promise<User | null> {
  if (!authAvailable()) return null;
  const token = sessionToken(req);
  if (!token) return null;
  const sid = unsign(token);
  if (!sid) return null;
  await ensureSchema();
  const rows = (await sql!`SELECT s.expires_at AS expires_at, u.id AS id, u.email AS email
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ${sid} LIMIT 1`) as Array<{
    expires_at: number | string;
    id: string;
    email: string;
  }>;
  const r = rows[0];
  if (!r || Number(r.expires_at) < Date.now()) return null;
  return { id: r.id, email: r.email };
}

export async function currentUserId(req: Request): Promise<string | undefined> {
  return (await currentUser(req))?.id;
}

// ---- PIN vault gate -------------------------------------------------------
// A 4-digit PIN is ~10^4 entropy: useless as a standalone encryption key. So the
// PIN is NOT mixed into vault-crypto. It is an ONLINE-checked session-unlock: a
// correct PIN mints a 15-minute signed grant (nw_vault cookie) that the vault
// routes require for a signed-in user who has set one. The real defense against
// guessing is the tiered lockout below, not the PIN's entropy. Honest threat
// model: this protects a stolen nw_session cookie / shared device / shoulder
// surfer. It does NOT protect against server / env / RCE compromise (where
// VAULT_KEK leaks and the creds decrypt regardless of any PIN).

function signVaultGrant(userId: string): string {
  const exp = Date.now() + VAULT_TTL_MS;
  const payload = `${userId}.${exp}`;
  const mac = crypto.createHmac("sha256", secret()!).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

function verifyVaultGrant(token: string | undefined, userId: string): boolean {
  const s = secret();
  if (!s || !token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [uid, expStr, mac] = parts;
  if (uid !== userId) return false;
  const expect = crypto.createHmac("sha256", s).update(`${uid}.${expStr}`).digest("base64url");
  if (!safeEq(mac, expect)) return false;
  return Number(expStr) > Date.now();
}

// Reject trivially guessable PINs (the lockout still backstops, this is a nudge).
const WEAK_PINS = new Set([
  "0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999",
  "1234", "2345", "3456", "4567", "5678", "6789", "0123", "4321", "9876", "1212",
  "1122", "2580", "0852", "1004", "2468", "1357", "6969", "1313", "1010", "0007",
]);

function validatePin(pin: string): string | null {
  if (!/^\d{4}$/.test(pin)) return "Use a 4-digit PIN (numbers only).";
  if (WEAK_PINS.has(pin)) return "That PIN is too common. Choose a less guessable one.";
  return null;
}

// Failed-attempt lockout. The count is the NEW total after this failure.
function lockMsFor(count: number): number {
  if (count >= 20) return 365 * 24 * 60 * 60 * 1000; // effectively requires a password reset
  if (count >= 16) return 24 * 60 * 60 * 1000;
  if (count >= 11) return 60 * 60 * 1000;
  if (count >= 6) return 5 * 60 * 1000;
  if (count >= 5) return 60 * 1000;
  return 0;
}

interface PinRow {
  pin_hash: string | null;
  pin_salt: string | null;
  pin_failed_count: number | string | null;
  pin_locked_until: number | string | null;
  pass_hash: string;
  pass_salt: string;
}

export async function pinStatus(req: Request): Promise<{ available: boolean; signedIn: boolean; hasPin: boolean; unlocked: boolean; lockedFor?: number }> {
  if (!authAvailable()) return { available: false, signedIn: false, hasPin: false, unlocked: false };
  const user = await currentUser(req);
  if (!user) return { available: true, signedIn: false, hasPin: false, unlocked: false };
  await ensureSchema();
  const rows = (await sql!`SELECT pin_hash, pin_locked_until FROM users WHERE id = ${user.id} LIMIT 1`) as Array<{ pin_hash: string | null; pin_locked_until: number | string | null }>;
  const u = rows[0];
  const hasPin = Boolean(u?.pin_hash);
  const now = Date.now();
  const lockedUntil = u?.pin_locked_until != null ? Number(u.pin_locked_until) : 0;
  const unlocked = hasPin ? verifyVaultGrant(readCookie(req, VAULT_COOKIE), user.id) : true;
  return { available: true, signedIn: true, hasPin, unlocked, lockedFor: lockedUntil > now ? Math.ceil((lockedUntil - now) / 1000) : undefined };
}

// Set or change the PIN. A change needs the current PIN; a reset (forgot PIN)
// needs the account password (the stolen-cookie attacker does not have it).
export async function setPin(req: Request, newPin: string, opts: { currentPin?: string; password?: string }): Promise<{ ok: true; grant: string } | { ok: false; error: string }> {
  const user = await currentUser(req);
  if (!user) return { ok: false, error: "Sign in first." };
  const invalid = validatePin(newPin);
  if (invalid) return { ok: false, error: invalid };
  await ensureSchema();
  const rows = (await sql!`SELECT pin_hash, pin_salt, pass_hash, pass_salt FROM users WHERE id = ${user.id} LIMIT 1`) as PinRow[];
  const u = rows[0];
  if (!u) return { ok: false, error: "Account not found." };
  if (u.pin_hash && u.pin_salt) {
    const byPassword = Boolean(opts.password) && safeEq(hashPw(opts.password!, u.pass_salt), u.pass_hash);
    const byCurrentPin = Boolean(opts.currentPin) && safeEq(hashPw(opts.currentPin!, u.pin_salt), u.pin_hash);
    if (!byPassword && !byCurrentPin) {
      return { ok: false, error: "Enter your current PIN, or your account password to reset it." };
    }
  }
  const salt = crypto.randomBytes(16).toString("hex");
  await sql!`UPDATE users SET pin_hash = ${hashPw(newPin, salt)}, pin_salt = ${salt}, pin_set_at = ${Date.now()}, pin_failed_count = 0, pin_locked_until = NULL WHERE id = ${user.id}`;
  return { ok: true, grant: signVaultGrant(user.id) };
}

// Verify the PIN and, on success, mint an unlock grant. Lockout is checked BEFORE
// the scrypt compare. A wrong PIN returns an identical message regardless of how
// close it was; only the lockout exposes a (duration-only) signal.
export async function verifyPin(req: Request, pin: string): Promise<{ ok: true; grant: string } | { ok: false; error: string; lockedFor?: number }> {
  const user = await currentUser(req);
  if (!user) return { ok: false, error: "Sign in first." };
  await ensureSchema();
  const rows = (await sql!`SELECT pin_hash, pin_salt, pin_failed_count, pin_locked_until FROM users WHERE id = ${user.id} LIMIT 1`) as Array<{
    pin_hash: string | null;
    pin_salt: string | null;
    pin_failed_count: number | string | null;
    pin_locked_until: number | string | null;
  }>;
  const u = rows[0];
  if (!u?.pin_hash || !u.pin_salt) return { ok: false, error: "No PIN is set." };
  const now = Date.now();
  const lockedUntil = u.pin_locked_until != null ? Number(u.pin_locked_until) : 0;
  if (lockedUntil > now) {
    return { ok: false, error: "Too many attempts. Try again later.", lockedFor: Math.ceil((lockedUntil - now) / 1000) };
  }
  if (safeEq(hashPw(pin, u.pin_salt), u.pin_hash)) {
    await sql!`UPDATE users SET pin_failed_count = 0, pin_locked_until = NULL WHERE id = ${user.id}`;
    return { ok: true, grant: signVaultGrant(user.id) };
  }
  // Atomic increment, then lock if the new count crosses a threshold.
  const upd = (await sql!`UPDATE users SET pin_failed_count = pin_failed_count + 1 WHERE id = ${user.id} RETURNING pin_failed_count`) as Array<{ pin_failed_count: number | string }>;
  const count = Number(upd[0]?.pin_failed_count ?? 0);
  const lockMs = lockMsFor(count);
  if (lockMs > 0) {
    await sql!`UPDATE users SET pin_locked_until = ${now + lockMs} WHERE id = ${user.id}`;
    return { ok: false, error: "Too many attempts. Try again later.", lockedFor: Math.ceil(lockMs / 1000) };
  }
  return { ok: false, error: "Incorrect PIN." };
}

// The gate the vault routes call. Passes for anonymous / unkeyed / no-PIN users
// (soft enforcement), locked only for a signed-in user who set a PIN and has no
// valid unlock grant.
export async function requireVaultUnlock(req: Request): Promise<boolean> {
  if (!authAvailable()) return true;
  const user = await currentUser(req);
  if (!user) return true;
  await ensureSchema();
  const rows = (await sql!`SELECT pin_hash FROM users WHERE id = ${user.id} LIMIT 1`) as Array<{ pin_hash: string | null }>;
  if (!rows[0]?.pin_hash) return true;
  return verifyVaultGrant(readCookie(req, VAULT_COOKIE), user.id);
}

export function clearVaultCookie(): { name: string; value: string; maxAge: number } {
  return { name: VAULT_COOKIE, value: "", maxAge: 0 };
}
