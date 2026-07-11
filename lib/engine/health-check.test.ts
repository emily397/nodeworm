import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Integration } from "./types";

// Mock the I/O boundaries so the wiring (fold + auto-repair trigger) is deterministic.
const getVaultConnector = vi.fn();
const verifyConnector = vi.fn();
const generateForIntegration = vi.fn(async () => ({}));

vi.mock("./vault", () => ({ getVaultConnector: (...a: unknown[]) => getVaultConnector(...a) }));
vi.mock("./connector", () => ({ verifyConnector: (...a: unknown[]) => verifyConnector(...a) }));
vi.mock("./generate-pipeline", () => ({
  generateForIntegration: (...a: unknown[]) => generateForIntegration(...a),
  GenerateError: class extends Error {},
}));

import { runHealthCheck } from "./health-check";

function integ(over: Partial<Integration> = {}): Integration {
  return {
    id: "i1",
    appName: "Acme",
    userId: "u1",
    status: "connected-via-connector",
    createdAt: 0,
    updatedAt: 0,
    currentPhase: 5,
    phases: [],
    mode: "heuristic",
    secrets: [],
    report: { connectMethod: "generated-scraper" } as Integration["report"],
    discovery: {} as Integration["discovery"],
    wire: {} as Integration["wire"],
    connector: { host: "x.trycloudflare.com", hasToken: false, verified: true },
    ...over,
  } as Integration;
}

beforeEach(() => {
  getVaultConnector.mockReset().mockResolvedValue({ url: "https://x.trycloudflare.com", token: undefined });
  verifyConnector.mockReset();
  generateForIntegration.mockReset().mockResolvedValue({});
});

describe("runHealthCheck wiring", () => {
  it("skips when there is no verified connector (no false failure recorded)", async () => {
    const it = integ({ connector: undefined });
    const r = await runHealthCheck(it, 100);
    expect(r.checked).toBe(false);
    expect(generateForIntegration).not.toHaveBeenCalled();
  });

  it("records healthy on a good read and never regenerates", async () => {
    verifyConnector.mockResolvedValue({ ok: true, status: 200, detail: "HTTP 200" });
    const it = integ();
    const r = await runHealthCheck(it, 100);
    expect(r.checked).toBe(true);
    expect(it.connector!.health!.state).toBe("healthy");
    expect(generateForIntegration).not.toHaveBeenCalled();
  });

  it("does not regenerate on the FIRST drift (below threshold)", async () => {
    verifyConnector.mockResolvedValue({ ok: false, status: 404, detail: "gone" });
    const it = integ();
    const r = await runHealthCheck(it, 100);
    expect(it.connector!.health!.state).toBe("drifted");
    expect(it.connector!.health!.consecutiveFailures).toBe(1);
    expect(r.repaired).toBeFalsy();
    expect(generateForIntegration).not.toHaveBeenCalled();
  });

  it("regenerates a generated connector on SUSTAINED drift (>= threshold)", async () => {
    verifyConnector.mockResolvedValue({ ok: false, status: 404, detail: "gone" });
    const it = integ({ connector: { host: "x", hasToken: false, verified: true, health: { state: "drifted", checkedAt: 1, consecutiveFailures: 1 } } });
    const r = await runHealthCheck(it, 200);
    expect(it.connector!.health!.consecutiveFailures).toBe(2);
    expect(r.repaired).toBe(true);
    expect(generateForIntegration).toHaveBeenCalledTimes(1);
    expect(it.connector!.health!.detail).toMatch(/regenerated/);
  });

  it("never regenerates a researched connector even on sustained drift", async () => {
    verifyConnector.mockResolvedValue({ ok: false, status: 404 });
    const it = integ({
      report: { connectMethod: "researched-connector" } as Integration["report"],
      connector: { host: "x", hasToken: false, verified: true, health: { state: "drifted", checkedAt: 1, consecutiveFailures: 3 } },
    });
    const r = await runHealthCheck(it, 300);
    expect(r.repaired).toBeFalsy();
    expect(generateForIntegration).not.toHaveBeenCalled();
  });

  it("treats an offline connector as unreachable, not drift, so it never regenerates", async () => {
    verifyConnector.mockResolvedValue({ ok: false });
    const it = integ({ connector: { host: "x", hasToken: false, verified: true, health: { state: "unreachable", checkedAt: 1, consecutiveFailures: 5 } } });
    await runHealthCheck(it, 400);
    expect(it.connector!.health!.state).toBe("unreachable");
    expect(generateForIntegration).not.toHaveBeenCalled();
  });
});
