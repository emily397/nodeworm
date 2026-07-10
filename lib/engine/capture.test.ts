import { describe, it, expect } from "vitest";
import { normalizeCapture } from "./capture";

describe("normalizeCapture", () => {
  it("accepts a flat capture array (CDP / extension shape) and templatizes paths", () => {
    const entries = [
      { method: "GET", url: "https://api.acme.com/v2/projects/8842", status: 200, mimeType: "application/json" },
      { method: "GET", url: "https://api.acme.com/v2/projects/9931", status: 200, mimeType: "application/json" },
      { method: "POST", url: "https://api.acme.com/v2/projects/8842/tasks", status: 201, mimeType: "application/json", requestBody: '{"title":"x","done":false}' },
      { method: "GET", url: "https://app.acme.com/static/app.js", status: 200, mimeType: "application/javascript" },
    ];
    const { apiBase, ops } = normalizeCapture(entries);
    expect(apiBase).toBe("https://api.acme.com");
    const paths = ops.map((o) => `${o.method.toUpperCase()} ${o.path}`);
    expect(paths).toContain("GET /v2/projects/{id}");
    expect(paths.filter((p) => p === "GET /v2/projects/{id}").length).toBe(1);
    expect(paths.some((p) => p.includes("/static/"))).toBe(false);
    const post = ops.find((o) => o.method === "post")!;
    expect(post.bodyKeys).toEqual(expect.arrayContaining(["title", "done"]));
  });

  it("accepts a HAR string (or object) unchanged", () => {
    const har = { log: { entries: [{ request: { method: "GET", url: "https://api.x.com/v1/things" }, response: { status: 200, content: { mimeType: "application/json" } } }] } };
    expect(normalizeCapture(JSON.stringify(har)).ops.map((o) => o.path)).toContain("/v1/things");
    expect(normalizeCapture(har).ops.map((o) => o.path)).toContain("/v1/things");
  });

  it("tolerates alternate field names (responseStatus / postData / body)", () => {
    const entries = [
      { method: "get", url: "https://api.y.com/v3/items", responseStatus: 200, responseMimeType: "application/json" },
      { method: "put", url: "https://api.y.com/v3/items/5", responseMimeType: "application/json", postData: '{"name":"n"}' },
    ];
    const { ops } = normalizeCapture(entries);
    expect(ops.map((o) => `${o.method.toUpperCase()} ${o.path}`)).toEqual(
      expect.arrayContaining(["GET /v3/items", "PUT /v3/items/{id}"]),
    );
    expect(ops.find((o) => o.method === "put")!.bodyKeys).toContain("name");
  });

  it("surfaces the observed auth header NAME (never the value)", () => {
    const entries = [
      { method: "GET", url: "https://api.z.com/v1/a", status: 200, mimeType: "application/json", requestHeaders: { authorization: "Bearer secret-abc", accept: "application/json" } },
      { method: "GET", url: "https://api.z.com/v1/b", status: 200, mimeType: "application/json", requestHeaders: { Authorization: "Bearer secret-abc" } },
    ];
    const { authHeader } = normalizeCapture(entries);
    expect(authHeader).toBe("authorization");
    // the secret token value must never be surfaced anywhere
    expect(JSON.stringify(normalizeCapture(entries))).not.toContain("secret-abc");
  });

  it("detects api-key style auth headers too", () => {
    const entries = [{ method: "GET", url: "https://api.z.com/v1/a", status: 200, mimeType: "application/json", requestHeaders: { "x-api-key": "k123" } }];
    expect(normalizeCapture(entries).authHeader).toBe("x-api-key");
  });

  it("returns empty for junk without throwing", () => {
    expect(normalizeCapture("not json").ops).toEqual([]);
    expect(normalizeCapture(null).ops).toEqual([]);
    expect(normalizeCapture(42).ops).toEqual([]);
  });
});
