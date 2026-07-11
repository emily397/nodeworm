import { describe, it, expect } from "vitest";
import { nextHealth, shouldAutoRepair, type ConnectorHealth } from "./health";

describe("nextHealth", () => {
  it("a successful probe is healthy and resets the failure streak + stamps lastOkAt", () => {
    const prior: ConnectorHealth = { state: "drifted", checkedAt: 10, consecutiveFailures: 3, lastOkAt: 5 };
    const h = nextHealth(prior, { ok: true, status: 200, detail: "HTTP 200" }, 100);
    expect(h.state).toBe("healthy");
    expect(h.consecutiveFailures).toBe(0);
    expect(h.lastOkAt).toBe(100);
    expect(h.checkedAt).toBe(100);
  });

  it("a 4xx is drift (answered wrongly) and increments the streak, preserving lastOkAt", () => {
    const prior: ConnectorHealth = { state: "healthy", checkedAt: 10, consecutiveFailures: 0, lastOkAt: 10 };
    const h = nextHealth(prior, { ok: false, status: 404, detail: "not found" }, 200);
    expect(h.state).toBe("drifted");
    expect(h.consecutiveFailures).toBe(1);
    expect(h.lastOkAt).toBe(10);
  });

  it("a network failure or 5xx is unreachable, not drift", () => {
    expect(nextHealth(undefined, { ok: false }, 1).state).toBe("unreachable");
    expect(nextHealth(undefined, { ok: false, status: 502 }, 1).state).toBe("unreachable");
  });

  it("streak accumulates across consecutive failures from no prior", () => {
    let h = nextHealth(undefined, { ok: false, status: 404 }, 1);
    h = nextHealth(h, { ok: false, status: 404 }, 2);
    h = nextHealth(h, { ok: false, status: 404 }, 3);
    expect(h.consecutiveFailures).toBe(3);
  });
});

describe("shouldAutoRepair", () => {
  const drifted2: ConnectorHealth = { state: "drifted", checkedAt: 1, consecutiveFailures: 2 };

  it("fires for a generated connector drifted >= threshold", () => {
    expect(shouldAutoRepair("generated", drifted2)).toBe(true);
  });

  it("does not fire on a single drift (below threshold)", () => {
    expect(shouldAutoRepair("generated", { state: "drifted", checkedAt: 1, consecutiveFailures: 1 })).toBe(false);
  });

  it("never fires for merely unreachable (offline): regenerating code won't revive a dead host", () => {
    expect(shouldAutoRepair("generated", { state: "unreachable", checkedAt: 1, consecutiveFailures: 5 })).toBe(false);
  });

  it("never fires for researched/hosted connectors (NodeWorm can't regenerate them)", () => {
    expect(shouldAutoRepair("researched", drifted2)).toBe(false);
    expect(shouldAutoRepair("hosted", drifted2)).toBe(false);
  });

  it("never fires when healthy", () => {
    expect(shouldAutoRepair("generated", { state: "healthy", checkedAt: 1, consecutiveFailures: 0 })).toBe(false);
  });
});
