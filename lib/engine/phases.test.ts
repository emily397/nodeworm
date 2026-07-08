import { describe, it, expect } from "vitest";
import { scout, architect, wire, auditor, report } from "./phases";
import type { ConnectMethod } from "./types";

const STATUSES = new Set([
  "connected",
  "connected-via-session",
  "connected-via-connector",
  "needs-credentials",
  "generated",
  "planned",
  "blocked",
]);

// Run the whole pure pipeline for an app the way orchestrate does.
function pipeline(input: string, opts?: Parameters<typeof architect>[2]) {
  const d = scout(input);
  const plan = architect(d, undefined, opts);
  const w = wire(d, plan);
  const a = auditor(d, plan, w, false);
  const r = report(d, plan, w, a, false, undefined, false, false);
  return { d, plan, w, a, r };
}

describe("scout", () => {
  it("resolves a known app from the knowledge base with high confidence", () => {
    const d = scout("Notion");
    expect(d.appName).toBe("Notion");
    expect(d.source).toBe("knowledge-base");
    expect(d.hasHostedMcp).toBe(true);
    expect(d.confidence).toBeGreaterThan(0.5);
  });

  it("falls back to heuristic discovery for an unknown app", () => {
    const d = scout("some-obscure-saas-xyz.example.com");
    expect(d.source).not.toBe("knowledge-base");
    expect(d.appName.length).toBeGreaterThan(0);
    expect(Array.isArray(d.telemetry)).toBe(true);
  });
});

describe("architect connect-method routing", () => {
  it("routes an app with a hosted MCP to the hosted-mcp method", () => {
    expect(pipeline("Notion").plan.connectMethod).toBe("hosted-mcp");
  });

  it("routes a public-API + genuine-OAuth app (no hosted MCP) to oauth-api", () => {
    expect(pipeline("TickTick").plan.connectMethod).toBe("oauth-api");
  });

  it("routes a no-API no-web-client app to a real connector method, never a dead end", () => {
    const cm = pipeline("Plaud").plan.connectMethod;
    expect(["managed-session", "researched-connector", "hosted-connector", "generated-scraper"]).toContain(cm);
  });

  it("walks the fallback ladder to a generated connector when richer methods are excluded", () => {
    const plan = pipeline("TickTick", {
      excludeMethods: ["oauth-api", "managed-session", "researched-connector"] as ConnectMethod[],
    }).plan;
    expect(plan.connectMethod).toBe("generated-mcp");
    expect(plan.methodKind).toBe("generated");
  });

  it("always produces at least one credential/setup step and a path label", () => {
    for (const app of ["Notion", "TickTick", "Plaud", "unknown-xyz.example"]) {
      const { plan } = pipeline(app);
      expect(plan.credentialSteps.length).toBeGreaterThan(0);
      expect(plan.pathLabel.length).toBeGreaterThan(0);
    }
  });
});

describe("wire", () => {
  it("registers outbound tools and a defined inbound method", () => {
    const { w } = pipeline("Notion");
    expect(w.outboundTools.length).toBeGreaterThan(0);
    expect(typeof w.inboundMethod).toBe("string");
  });
});

describe("auditor + report", () => {
  it("defers live checks when there are no credentials and never fails a viable path", () => {
    const { a } = pipeline("Notion");
    expect(a.failed).toBe(0);
    expect(a.passed).toBeGreaterThan(0);
  });

  it("produces a known status and non-empty capabilities for every app", () => {
    for (const app of ["Notion", "TickTick", "Plaud", "unknown-xyz.example"]) {
      const { r } = pipeline(app);
      expect(STATUSES.has(r.status)).toBe(true);
      expect(r.capabilities.length).toBeGreaterThan(0);
      expect(r.headline.length).toBeGreaterThan(0);
    }
  });

  it("reports connected-via-connector once a connector is verified", () => {
    const d = scout("Plaud");
    const plan = architect(d);
    const w = wire(d, plan);
    const a = auditor(d, plan, w, false);
    const r = report(d, plan, w, a, false, undefined, true, false);
    expect(r.status).toBe("connected-via-connector");
  });
});
