import { describe, it, expect } from "vitest";
import { heuristicWorkflow } from "./intent";

describe("heuristicWorkflow", () => {
  it("parses a trigger/action sentence into an app-to-app workflow", () => {
    const w = heuristicWorkflow("when I get an email in Gmail, create a task in Notion");
    expect(w.kind).toBe("app-to-app");
    const names = w.apps.map((a) => a.name.toLowerCase());
    expect(names).toContain("gmail");
    expect(names).toContain("notion");
    expect(w.trigger?.app.toLowerCase()).toBe("gmail");
    expect(w.actions.length).toBeGreaterThan(0);
    expect(w.mappings.length).toBeGreaterThan(0);
  });

  it("parses a two-app 'sync X to Y' request into app-to-app", () => {
    const w = heuristicWorkflow("sync Notion to Slack");
    expect(w.kind).toBe("app-to-app");
    expect(w.apps.map((a) => a.name.toLowerCase())).toEqual(expect.arrayContaining(["notion", "slack"]));
  });

  it("treats a single named app as a single-app connect", () => {
    const w = heuristicWorkflow("connect Notion");
    expect(w.kind).toBe("single-app");
    expect(w.apps[0].name.toLowerCase()).toBe("notion");
  });

  it("asks a clarifying question for a trigger sentence with no recognizable apps", () => {
    const w = heuristicWorkflow("when a thing happens, do the needful");
    expect(w.kind).toBe("clarify");
    expect(w.clarify?.question.length).toBeGreaterThan(0);
    expect(w.apps.length).toBe(0);
  });

  it("clarifies (not single-app) for a vague multi-word phrase with no real app name", () => {
    expect(heuristicWorkflow("do something useful for me").kind).toBe("clarify");
    expect(heuristicWorkflow("just help me out here please").kind).toBe("clarify");
  });

  it("still treats a bare lowercase app name as single-app (no regression)", () => {
    expect(heuristicWorkflow("connect stripe").kind).toBe("single-app");
    expect(heuristicWorkflow("set up notion").kind).toBe("single-app");
  });

  it("preserves the raw request on every plan", () => {
    const raw = "when a row changes in Airtable, post to Slack";
    expect(heuristicWorkflow(raw).raw).toBe(raw);
  });
});
