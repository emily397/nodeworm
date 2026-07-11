import { describe, it, expect } from "vitest";
import { phaseLaneSignature, laneTelemetry, type LaneProps } from "./lane";
import type { Discovery, Integration, Report, TelemetryLine } from "@/lib/engine/types";

const phase = (over: Partial<Integration["phases"][number]> = {}): Integration["phases"][number] =>
  ({ id: "scout", agent: "Scout", label: "DISCOVERY", tagline: "Maps the surface", status: "done", ...over }) as Integration["phases"][number];

const props = (over: Partial<LaneProps> = {}): LaneProps => ({
  index: 0,
  phase: phase(),
  isActive: false,
  isLast: false,
  ...over,
});

const tele = (lines: string[]): TelemetryLine[] => lines.map((text) => ({ level: "info", text }));

describe("phaseLaneSignature (memoization contract)", () => {
  it("is IDENTICAL when a fresh phase object has the same content (the per-tick case)", () => {
    // The advance loop hands new objects every tick; equal content must not re-render.
    const a = props({ phase: phase({ status: "done" }), discovery: { telemetry: tele(["a", "b"]) } as unknown as Discovery });
    const b = props({ phase: phase({ status: "done" }), discovery: { telemetry: tele(["a", "b"]) } as unknown as Discovery });
    expect(a.phase).not.toBe(b.phase); // different identities...
    expect(phaseLaneSignature(a)).toBe(phaseLaneSignature(b)); // ...same signature
  });

  it("CHANGES when the phase status flips (pending -> running -> done)", () => {
    const q = phaseLaneSignature(props({ phase: phase({ status: "pending" }) }));
    const r = phaseLaneSignature(props({ phase: phase({ status: "running" }) }));
    const d = phaseLaneSignature(props({ phase: phase({ status: "done" }) }));
    expect(new Set([q, r, d]).size).toBe(3);
  });

  it("CHANGES when the lane becomes active", () => {
    expect(phaseLaneSignature(props({ isActive: false }))).not.toBe(phaseLaneSignature(props({ isActive: true })));
  });

  it("CHANGES when a new telemetry line streams in (active phase)", () => {
    const before = props({ isActive: true, discovery: { telemetry: tele(["x"]) } as unknown as Discovery });
    const after = props({ isActive: true, discovery: { telemetry: tele(["x", "y"]) } as unknown as Discovery });
    expect(phaseLaneSignature(before)).not.toBe(phaseLaneSignature(after));
  });

  it("distinguishes lanes by phase id and isLast", () => {
    expect(phaseLaneSignature(props({ phase: phase({ id: "scout" }) }))).not.toBe(phaseLaneSignature(props({ phase: phase({ id: "wire" }) })));
    expect(phaseLaneSignature(props({ isLast: false }))).not.toBe(phaseLaneSignature(props({ isLast: true })));
  });
});

describe("laneTelemetry", () => {
  it("prefers discovery, falls through to report telemetry", () => {
    expect(laneTelemetry({ discovery: { telemetry: tele(["d"]) } as unknown as Discovery })?.[0].text).toBe("d");
    const rep = { status: "connected", headline: "All good" } as Report;
    const t = laneTelemetry({ report: rep });
    expect(t?.some((l) => l.text === "All good")).toBe(true);
  });
});
