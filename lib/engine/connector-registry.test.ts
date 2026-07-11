import { describe, it, expect } from "vitest";
import { computeReuseKey } from "./connector-registry";
import type { Integration } from "./types";

function integ(over: Partial<Integration> = {}): Integration {
  return {
    id: "i", appName: "Stripe", status: "generated", createdAt: 0, updatedAt: 0,
    currentPhase: 5, phases: [], mode: "heuristic", secrets: [],
    discovery: { hasPublicApi: true, apiType: "rest", probe: { openApiUrl: "https://stripe.com/openapi.json" } } as Integration["discovery"],
    wire: {} as Integration["wire"],
    report: { connectMethod: "generated-mcp" } as Integration["report"],
    ...over,
  } as Integration;
}

describe("computeReuseKey", () => {
  it("is null without a discovered surface (no unsafe reuse)", () => {
    expect(computeReuseKey(integ({ discovery: undefined }))).toBeNull();
    expect(computeReuseKey(integ({ wire: undefined }))).toBeNull();
  });

  it("two users, same public-API app + same spec -> identical key (cross-user reuse)", () => {
    const a = computeReuseKey(integ({ id: "userA" }));
    const b = computeReuseKey(integ({ id: "userB" }));
    expect(a).not.toBeNull();
    expect(a).toBe(b);
  });

  it("different apps never collide", () => {
    expect(computeReuseKey(integ({ appName: "Stripe" }))).not.toBe(computeReuseKey(integ({ appName: "Notion" })));
  });

  it("app name is normalized (case / whitespace)", () => {
    expect(computeReuseKey(integ({ appName: "  STRIPE " }))).toBe(computeReuseKey(integ({ appName: "stripe" })));
  });

  it("captured traffic makes the key user-specific: same HAR reuses, different HAR does not", () => {
    const har1 = integ({ capturedRequests: [{ method: "GET", url: "https://api.x.com/a" }] });
    const har1b = integ({ id: "other", capturedRequests: [{ method: "GET", url: "https://api.x.com/a" }] });
    const har2 = integ({ capturedRequests: [{ method: "GET", url: "https://api.x.com/DIFFERENT" }] });
    expect(computeReuseKey(har1)).toBe(computeReuseKey(har1b)); // identical capture -> shareable
    expect(computeReuseKey(har1)).not.toBe(computeReuseKey(har2)); // different capture -> different code
  });

  it("a conventions scraper (no API, no capture) reuses across users of the same app", () => {
    const noApi = { hasPublicApi: false, apiType: undefined, probe: undefined } as unknown as Integration["discovery"];
    const a = integ({ id: "a", discovery: noApi, report: { connectMethod: "generated-scraper" } as Integration["report"] });
    const b = integ({ id: "b", discovery: noApi, report: { connectMethod: "generated-scraper" } as Integration["report"] });
    expect(computeReuseKey(a)).toBe(computeReuseKey(b));
    expect(computeReuseKey(a)).not.toBeNull();
  });
});
