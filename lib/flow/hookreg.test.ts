import { describe, expect, it } from "vitest";
import type { OpenApiOp } from "../engine/types";
import { buildRegistrationRequest, findRegistrationOp, HOOK_RECIPES, parseRegistrationResult, recipeFor } from "./hookreg";

const HOOK = "https://abie-three.vercel.app/api/flows/f1/hook?k=tok";

describe("recipeFor", () => {
  it("matches curated apps case-insensitively", () => {
    expect(recipeFor("Stripe")?.app).toBe("stripe");
    expect(recipeFor("GitHub")?.app).toBe("github");
    expect(recipeFor("NoSuchApp")).toBeUndefined();
  });

  it("every recipe declares its params and a delete path when known", () => {
    for (const r of HOOK_RECIPES) {
      expect(r.createPath.length).toBeGreaterThan(0);
      for (const p of r.params) expect(p.key && p.label).toBeTruthy();
    }
  });
});

describe("buildRegistrationRequest (curated)", () => {
  it("builds Stripe's form-encoded request with no params needed", () => {
    const req = buildRegistrationRequest({ recipe: recipeFor("stripe")! }, HOOK, {});
    if ("error" in req) throw new Error(req.error);
    expect(req.url).toBe("https://api.stripe.com/v1/webhook_endpoints");
    expect(req.contentType).toBe("form");
    expect(req.body).toContain(`url=${encodeURIComponent(HOOK)}`);
    expect(req.body).toContain("enabled_events");
  });

  it("substitutes params into the path and reports missing ones honestly", () => {
    const ok = buildRegistrationRequest({ recipe: recipeFor("github")! }, HOOK, { repo: "emily397/nodeworm" });
    if ("error" in ok) throw new Error(ok.error);
    expect(ok.url).toBe("https://api.github.com/repos/emily397/nodeworm/hooks");
    expect(ok.body).toContain(HOOK);

    const missing = buildRegistrationRequest({ recipe: recipeFor("github")! }, HOOK, {});
    expect("error" in missing && missing.error).toMatch(/repo/i);
  });
});

describe("findRegistrationOp", () => {
  const ops: OpenApiOp[] = [
    { method: "get", path: "/v1/webhooks", name: "list_webhooks" },
    { method: "post", path: "/v1/webhooks", name: "create_webhook", bodyKeys: ["target_url", "event"] },
    { method: "post", path: "/v1/things", name: "create_thing", bodyKeys: ["url"] },
  ];

  it("picks the POST webhooky op and its observed url key", () => {
    const hit = findRegistrationOp(ops)!;
    expect(hit.op.path).toBe("/v1/webhooks");
    expect(hit.urlKey).toBe("target_url");
  });

  it("returns null when nothing webhooky exists", () => {
    expect(findRegistrationOp([{ method: "post", path: "/v1/things", name: "x" }])).toBeNull();
  });

  it("builds a discovered-op request as JSON against the api base", () => {
    const hit = findRegistrationOp(ops)!;
    const req = buildRegistrationRequest({ discovered: hit, apiBase: "https://api.x.com" }, HOOK, {});
    if ("error" in req) throw new Error(req.error);
    expect(req.url).toBe("https://api.x.com/v1/webhooks");
    expect(req.contentType).toBe("json");
    expect(JSON.parse(req.body).target_url).toBe(HOOK);
  });
});

describe("parseRegistrationResult", () => {
  it("extracts common id shapes", () => {
    expect(parseRegistrationResult({ id: "we_1" })).toBe("we_1");
    expect(parseRegistrationResult({ id: 42 })).toBe("42");
    expect(parseRegistrationResult({ webhook: { id: "w9" } })).toBe("w9");
    expect(parseRegistrationResult({ data: { id: "d3" } })).toBe("d3");
    expect(parseRegistrationResult({ nothing: true })).toBeUndefined();
  });
});
