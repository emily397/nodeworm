import { describe, expect, it } from "vitest";
import { instantiateTemplate, TEMPLATES } from "./templates";

const conns = [
  { id: "i-stripe", appName: "Stripe", status: "connected" },
  { id: "i-slack", appName: "slack", status: "connected" },
];

describe("templates", () => {
  it("ships a curated set with unique ids and at least one branch showcase", () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(6);
    expect(TEMPLATES.some((t) => t.steps.some((s) => s.type === "branch"))).toBe(true);
  });

  it("instantiates a template, matching named apps to connections case-insensitively", () => {
    const t = TEMPLATES.find((x) => x.id === "payment-ledger-ping")!;
    const d = instantiateTemplate(t.id, conns)!;
    expect(d.name).toBe(t.name);
    expect(d.trigger.type).toBe(t.trigger.type);
    expect(d.steps.length).toBe(t.steps.length);
    const slackStep = d.steps.find((s) => s.appName?.toLowerCase() === "slack")!;
    expect(slackStep.integrationId).toBe("i-slack");
    expect(d.needsConnections).toContain("Notion");
    expect(d.needsConnections).not.toContain("Stripe");
  });

  it("returns null for an unknown template id", () => {
    expect(instantiateTemplate("nope", conns)).toBeNull();
  });

  it("gives every instantiated step a fresh unique id", () => {
    const d1 = instantiateTemplate("payment-ledger-ping", conns)!;
    const d2 = instantiateTemplate("payment-ledger-ping", conns)!;
    const ids1 = d1.steps.map((s) => s.id);
    expect(new Set(ids1).size).toBe(ids1.length);
    expect(ids1.some((id) => d2.steps.map((s) => s.id).includes(id))).toBe(false);
  });
});
