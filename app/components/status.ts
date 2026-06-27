import type { IntegrationStatus, PhaseStatus, TelemetryLevel } from "@/lib/engine/types";

export const STATUS_META: Record<
  IntegrationStatus,
  { label: string; color: string; dotClass: string }
> = {
  draft: { label: "Draft", color: "var(--color-muted)", dotClass: "" },
  running: { label: "Running", color: "var(--color-live)", dotClass: "pulse-dot" },
  planned: { label: "Planned", color: "var(--color-teal)", dotClass: "" },
  "needs-credentials": { label: "Needs you", color: "var(--color-signal)", dotClass: "" },
  "needs-verification": { label: "Verifying", color: "var(--color-signal)", dotClass: "" },
  connected: { label: "Connected", color: "var(--color-teal)", dotClass: "" },
  "connected-via-session": { label: "Live session", color: "var(--color-live)", dotClass: "" },
  "connected-via-connector": { label: "Connector live", color: "var(--color-live)", dotClass: "" },
  generated: { label: "Built", color: "var(--color-teal)", dotClass: "" },
  blocked: { label: "Blocked", color: "var(--color-blocked)", dotClass: "" },
};

export const PHASE_DOT: Record<PhaseStatus, string> = {
  pending: "var(--color-line-2)",
  running: "var(--color-live)",
  done: "var(--color-teal)",
  blocked: "var(--color-blocked)",
  skipped: "var(--color-muted)",
};

export const TELEMETRY_PREFIX: Record<TelemetryLevel, string> = {
  scan: "::",
  info: "  ",
  ok: "ok",
  warn: "!!",
  action: ">>",
};

export function timeAgo(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
