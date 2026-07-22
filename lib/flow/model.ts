// Pure flow-record lifecycle: creation, client redaction, patch sanitising.
// The webhook token is minted server-side at creation and can never be set by
// a client patch; it is redacted on every generic read (mirrors inbound).

import type { Flow, FlowBranch, FlowCondition, FlowStep, FlowStepType, FlowTrigger } from "./types";

const STEP_TYPES: FlowStepType[] = ["http", "connector", "ai", "filter", "webhook-out", "mcp", "branch", "wait"];
export const MAX_WAIT_MS = 7 * 24 * 60 * 60 * 1000; // a week is plenty; keeps a typo from parking a run forever
const OPS = new Set(["eq", "neq", "contains", "exists", "gt", "lt"]);
export const MAX_STEPS = 20;
export const MIN_SCHEDULE_MINS = 5;
export const MAX_BRANCHES = 4;
export const MAX_BRANCH_STEPS = 10;

function shortId(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

function hookToken(): string {
  const bytes = new Uint8Array(18);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function newFlowRecord(name: string, userId?: string): Flow {
  const now = Date.now();
  return {
    id: shortId(),
    userId,
    name: name.trim() || "Untitled flow",
    enabled: true,
    trigger: { type: "manual", token: hookToken() },
    steps: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function redactFlow(f: Flow): Flow {
  return { ...f, trigger: { ...f.trigger, token: "" } };
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function sanitizeCondition(v: unknown): FlowCondition | undefined {
  const c = v as Record<string, unknown> | undefined;
  if (!c || typeof c !== "object" || typeof c.left !== "string" || !OPS.has(String(c.op))) return undefined;
  return { left: c.left, op: c.op as FlowCondition["op"], right: typeof c.right === "string" ? c.right : undefined };
}

function sanitizeStep(v: unknown, i: number, insideBranch = false): FlowStep | null {
  if (!v || typeof v !== "object") return null;
  const s = v as Record<string, unknown>;
  if (!STEP_TYPES.includes(s.type as FlowStepType)) return null;
  if (s.type === "branch" && insideBranch) return null; // one level deep only
  const step: FlowStep = {
    id: str(s.id) ?? `s${i + 1}-${shortId().slice(0, 4)}`,
    type: s.type as FlowStepType,
    name: str(s.name) ?? "Step",
    integrationId: str(s.integrationId),
    appName: str(s.appName),
    method: str(s.method)?.toUpperCase(),
    url: str(s.url),
    path: str(s.path),
    body: typeof s.body === "string" ? s.body : undefined,
    prompt: typeof s.prompt === "string" ? s.prompt : undefined,
    tool: str(s.tool),
  };
  step.condition = sanitizeCondition(s.condition);
  const retries = Number(s.retries);
  if (Number.isFinite(retries) && retries >= 1) step.retries = Math.min(2, Math.floor(retries));
  if (step.type === "wait") {
    const w = Number(s.waitMs);
    step.waitMs = Number.isFinite(w) && w > 0 ? Math.min(MAX_WAIT_MS, Math.floor(w)) : 60_000;
  }
  if (s.onError === "continue") step.onError = "continue";
  if (step.type === "branch" && Array.isArray(s.branches)) {
    step.branches = s.branches
      .map((b, bi): FlowBranch | null => {
        if (!b || typeof b !== "object") return null;
        const br = b as Record<string, unknown>;
        const steps = Array.isArray(br.steps)
          ? br.steps.map((x, xi) => sanitizeStep(x, xi, true)).filter((x): x is FlowStep => x !== null).slice(0, MAX_BRANCH_STEPS)
          : [];
        return { id: str(br.id) ?? `b${bi + 1}-${shortId().slice(0, 4)}`, name: str(br.name) ?? `Branch ${bi + 1}`, condition: sanitizeCondition(br.condition), steps };
      })
      .filter((b): b is FlowBranch => b !== null)
      .slice(0, MAX_BRANCHES);
  }
  return step;
}

function sanitizeTrigger(v: unknown, existing: FlowTrigger): FlowTrigger {
  if (!v || typeof v !== "object") return existing;
  const t = v as Record<string, unknown>;
  const type = t.type === "webhook" || t.type === "schedule" || t.type === "manual" || t.type === "poll" ? t.type : existing.type;
  const out: FlowTrigger = {
    type,
    integrationId: str(t.integrationId) ?? existing.integrationId,
    appName: str(t.appName) ?? existing.appName,
    event: str(t.event) ?? existing.event,
    token: existing.token, // server-held; never client-set
    registration: existing.registration, // server-held; never client-set
  };
  if (type === "schedule" || type === "poll") {
    const mins = Number(t.scheduleMins ?? existing.scheduleMins ?? 60);
    out.scheduleMins = Math.max(MIN_SCHEDULE_MINS, Math.floor(Number.isFinite(mins) ? mins : 60));
  }
  if (type === "poll") {
    out.url = str(t.url) ?? existing.url;
    out.method = str(t.method)?.toUpperCase() ?? existing.method;
    out.itemsPath = typeof t.itemsPath === "string" ? t.itemsPath.trim() : existing.itemsPath;
    out.idPath = str(t.idPath) ?? existing.idPath ?? "id";
  }
  return out;
}

export function applyPatch(f: Flow, patch: Record<string, unknown>): Flow {
  const out: Flow = { ...f, updatedAt: Date.now() };
  if (typeof patch.name === "string" && patch.name.trim()) out.name = patch.name.trim().slice(0, 120);
  if (typeof patch.description === "string") out.description = patch.description.slice(0, 500);
  if (typeof patch.enabled === "boolean") out.enabled = patch.enabled;
  if (typeof patch.heartbeatUrl === "string") out.heartbeatUrl = patch.heartbeatUrl.trim().slice(0, 400) || undefined;
  out.trigger = sanitizeTrigger(patch.trigger, f.trigger);
  if (Array.isArray(patch.steps)) {
    out.steps = patch.steps
      .map((s, i) => sanitizeStep(s, i))
      .filter((s): s is FlowStep => s !== null)
      .slice(0, MAX_STEPS);
  }
  return out;
}
