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

  // Characterizes CURRENT behavior: the fallback classifier is permissive and treats
  // a leftover non-trigger phrase as a single-app connect (appLooksNamed passes any
  // non-stopword text). Documented, not asserted-as-ideal; the LLM parse is the
  // primary path and only this heuristic fallback is this loose.
  it("currently classifies a bare vague phrase as single-app (known over-eager quirk)", () => {
    expect(heuristicWorkflow("do something useful for me").kind).toBe("single-app");
  });

  it("preserves the raw request on every plan", () => {
    const raw = "when a row changes in Airtable, post to Slack";
    expect(heuristicWorkflow(raw).raw).toBe(raw);
  });
});
