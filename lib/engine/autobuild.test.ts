import { describe, it, expect } from "vitest";
import { runAutobuild, type AutobuildDeps, type AutobuildState } from "./autobuild";

// A deterministic clock and a persist spy that records every snapshot it is handed,
// so we can assert the loop persists after EACH transition (resumable + live progress).
function harness(over: Partial<AutobuildDeps>) {
  const snapshots: AutobuildState[] = [];
  let t = 1000;
  const deps: AutobuildDeps = {
    now: () => t++,
    capture: async () => ({ detail: "captured 3 endpoints" }),
    generate: async () => ({ detail: "generated typed MCP" }),
    persist: async (s) => {
      snapshots.push(structuredClone(s));
    },
    ...over,
  };
  return { deps, snapshots };
}

describe("runAutobuild", () => {
  it("runs capture then generate, both ok, done+ok", async () => {
    const { deps, snapshots } = harness({});
    const state = await runAutobuild(deps);

    expect(state.steps.map((s) => s.key)).toEqual(["capture", "generate"]);
    expect(state.steps.map((s) => s.status)).toEqual(["ok", "ok"]);
    expect(state.done).toBe(true);
    expect(state.ok).toBe(true);
    expect(state.steps[0].detail).toBe("captured 3 endpoints");
    expect(state.steps[1].detail).toBe("generated typed MCP");
    // Persisted every transition: capture running, capture ok, generate running,
    // generate ok, plus the terminal done snapshot.
    expect(snapshots.length).toBeGreaterThanOrEqual(5);
    // Live progress must show a running state before the ok, never jump straight to ok.
    expect(snapshots.some((s) => s.steps[0]?.status === "running")).toBe(true);
  });

  it("skips capture (no managed session) but still generates", async () => {
    const { deps } = harness({ capture: async () => ({ skipped: true, detail: "no managed session; using discovered spec" }) });
    const state = await runAutobuild(deps);

    expect(state.steps.map((s) => s.status)).toEqual(["skipped", "ok"]);
    expect(state.done).toBe(true);
    expect(state.ok).toBe(true);
  });

  it("stops honestly when generate fails, capture stays ok", async () => {
    const { deps } = harness({
      generate: async () => {
        throw new Error("generation needs the discovered surface");
      },
    });
    const state = await runAutobuild(deps);

    expect(state.steps.map((s) => s.status)).toEqual(["ok", "failed"]);
    expect(state.steps[1].detail).toContain("discovered surface");
    expect(state.done).toBe(true);
    expect(state.ok).toBe(false);
  });

  it("stops at capture failure and never attempts generate", async () => {
    let generateCalled = false;
    const { deps } = harness({
      capture: async () => {
        throw new Error("session dropped");
      },
      generate: async () => {
        generateCalled = true;
        return { detail: "x" };
      },
    });
    const state = await runAutobuild(deps);

    expect(state.steps.map((s) => s.key)).toEqual(["capture"]);
    expect(state.steps[0].status).toBe("failed");
    expect(generateCalled).toBe(false);
    expect(state.ok).toBe(false);
    expect(state.done).toBe(true);
  });
});
