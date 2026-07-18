// Pure flow-record lifecycle: creation, client redaction, patch sanitising.
// The webhook token is minted server-side at creation and can never be set by
// a client patch; it is redacted on every generic read (mirrors inbound).

import type { Flow, FlowStep, FlowStepType, FlowTrigger } from "./types";

const STEP_TYPES: FlowStepType[] = ["http", "connector", "ai", "filter", "webhook-out"];
const OPS = new Set(["eq", "neq", "contains", "exists", "gt", "lt"]);
export const MAX_STEPS = 20;
export const MIN_SCHEDULE_MINS = 5;

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

function sanitizeStep(v: unknown, i: number): FlowStep | null {
  if (!v || typeof v !== "object") return null;
  const s = v as Record<string, unknown>;
  if (!STEP_TYPES.includes(s.type as FlowStepType)) return null;
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
  };
  const c = s.condition as Record<string, unknown> | undefined;
  if (c && typeof c === "object" && typeof c.left === "string" && OPS.has(String(c.op))) {
    step.condition = { left: c.left, op: c.op as NonNullable<FlowStep["condition"]>["op"], right: typeof c.right === "string" ? c.right : undefined };
  }
  return step;
}

function sanitizeTrigger(v: unknown, existing: FlowTrigger): FlowTrigger {
  if (!v || typeof v !== "object") return existing;
  const t = v as Record<string, unknown>;
  const type = t.type === "webhook" || t.type === "schedule" || t.type === "manual" ? t.type : existing.type;
  const out: FlowTrigger = {
    type,
    integrationId: str(t.integrationId) ?? existing.integrationId,
    appName: str(t.appName) ?? existing.appName,
    event: str(t.event) ?? existing.event,
    token: existing.token, // server-held; never client-set
  };
  if (type === "schedule") {
    const mins = Number(t.scheduleMins ?? existing.scheduleMins ?? 60);
    out.scheduleMins = Math.max(MIN_SCHEDULE_MINS, Math.floor(Number.isFinite(mins) ? mins : 60));
  }
  return out;
}

export function applyPatch(f: Flow, patch: Record<string, unknown>): Flow {
  const out: Flow = { ...f, updatedAt: Date.now() };
  if (typeof patch.name === "string" && patch.name.trim()) out.name = patch.name.trim().slice(0, 120);
  if (typeof patch.description === "string") out.description = patch.description.slice(0, 500);
  if (typeof patch.enabled === "boolean") out.enabled = patch.enabled;
  out.trigger = sanitizeTrigger(patch.trigger, f.trigger);
  if (Array.isArray(patch.steps)) {
    out.steps = patch.steps
      .map((s, i) => sanitizeStep(s, i))
      .filter((s): s is FlowStep => s !== null)
      .slice(0, MAX_STEPS);
  }
  return out;
}
