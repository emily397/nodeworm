// Pure helpers for the phase-lane rendering, split out of SwarmConsole so the
// memoization contract is testable without a React harness. The advance loop hands
// the console a freshly-parsed integration every tick (all phase objects get new
// identities), so a plain component re-renders every lane each tick. phaseLaneSignature
// captures everything that actually changes a lane's output as a string; React.memo
// compares signatures and skips the re-render for lanes whose output is unchanged
// (i.e. every already-done phase, tick after tick).

import type { ArchitectPlan, AuditResult, Discovery, Integration, Report, TelemetryLine, WireConfig } from "@/lib/engine/types";

export interface LaneProps {
  index: number;
  phase: Integration["phases"][number];
  isActive: boolean;
  isLast: boolean;
  discovery?: Discovery;
  plan?: ArchitectPlan;
  wire?: WireConfig;
  audit?: AuditResult;
  report?: Report;
}

export function reportTelemetry(r: Report): TelemetryLine[] {
  return [
    { level: "info", text: "compiling integration report..." },
    { level: r.status === "blocked" ? "warn" : "ok", text: r.headline },
    { level: "action", text: `status: ${r.status}` },
  ];
}

// The telemetry a lane shows: whichever phase-specific payload it was handed.
export function laneTelemetry(p: Pick<LaneProps, "discovery" | "plan" | "wire" | "audit" | "report">): TelemetryLine[] | undefined {
  return (
    p.discovery?.telemetry ??
    p.plan?.telemetry ??
    p.wire?.telemetry ??
    p.audit?.telemetry ??
    (p.report ? reportTelemetry(p.report) : undefined)
  );
}

// A string that is equal iff two prop sets render the same lane. Two fresh-but-equal
// phase objects (new identity, same content) produce the same signature, so memo skips
// the work; a status flip, activation, or new telemetry line changes it, so it re-renders.
export function phaseLaneSignature(p: LaneProps): string {
  const t = laneTelemetry(p);
  const tsig = t ? `${t.length}:${t.length ? t[t.length - 1].text : ""}` : "-";
  return [p.phase.id, p.phase.status, p.isActive ? 1 : 0, p.isLast ? 1 : 0, tsig].join("|");
}
