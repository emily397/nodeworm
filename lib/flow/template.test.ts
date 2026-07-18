import { describe, expect, it } from "vitest";
import { getPath, renderJson, renderValue } from "./template";

const ctx = {
  trigger: { body: { email: "amy@x.com", amount: 4200, customer: { name: "Amy" } }, items: [{ sku: "A1" }, { sku: "B2" }] },
  steps: { s1: { output: { id: "row_9", tags: ["vip"] } } },
};

describe("getPath", () => {
  it("walks nested objects and array indices", () => {
    expect(getPath(ctx, "trigger.body.customer.name")).toBe("Amy");
    expect(getPath(ctx, "trigger.items.1.sku")).toBe("B2");
    expect(getPath(ctx, "steps.s1.output.tags.0")).toBe("vip");
  });

  it("returns undefined for a missing path", () => {
    expect(getPath(ctx, "trigger.body.phone")).toBeUndefined();
    expect(getPath(ctx, "steps.nope.output")).toBeUndefined();
  });
});

describe("renderValue", () => {
  it("interpolates placeholders into a string", () => {
    expect(renderValue("Hi {{trigger.body.customer.name}}, ref {{steps.s1.output.id}}", ctx)).toBe("Hi Amy, ref row_9");
  });

  it("returns the raw value when the template is exactly one placeholder", () => {
    expect(renderValue("{{trigger.body.amount}}", ctx)).toBe(4200);
    expect(renderValue("{{steps.s1.output.tags}}", ctx)).toEqual(["vip"]);
  });

  it("renders missing paths as empty string inside text", () => {
    expect(renderValue("to: {{trigger.body.phone}}!", ctx)).toBe("to: !");
  });
});

describe("renderJson", () => {
  it("renders placeholders inside a JSON template, keeping raw types for whole-placeholder strings", () => {
    const out = renderJson('{"total":"{{trigger.body.amount}}","note":"paid by {{trigger.body.email}}"}', ctx);
    expect(out).toEqual({ total: 4200, note: "paid by amy@x.com" });
  });

  it("renders nested arrays and objects", () => {
    const out = renderJson('{"rows":[{"sku":"{{trigger.items.0.sku}}"}]}', ctx);
    expect(out).toEqual({ rows: [{ sku: "A1" }] });
  });

  it("returns undefined for an empty template", () => {
    expect(renderJson("", ctx)).toBeUndefined();
    expect(renderJson("   ", ctx)).toBeUndefined();
  });
});
