import { describe, it, expect } from "vitest";
import { parseHar } from "./har";

// A minimal HAR capturing a couple of real API calls plus noise (html, static asset).
const har = JSON.stringify({
  log: {
    entries: [
      { request: { method: "GET", url: "https://app.acme.com/dashboard" }, response: { status: 200, content: { mimeType: "text/html" } } },
      { request: { method: "GET", url: "https://app.acme.com/static/main.abc123.js" }, response: { status: 200, content: { mimeType: "application/javascript" } } },
      { request: { method: "GET", url: "https://api.acme.com/v2/projects?limit=20" }, response: { status: 200, content: { mimeType: "application/json" } } },
      { request: { method: "GET", url: "https://api.acme.com/v2/projects/8842" }, response: { status: 200, content: { mimeType: "application/json" } } },
      { request: { method: "GET", url: "https://api.acme.com/v2/projects/9931" }, response: { status: 200, content: { mimeType: "application/json; charset=utf-8" } } },
      { request: { method: "POST", url: "https://api.acme.com/v2/projects/8842/tasks" }, response: { status: 201, content: { mimeType: "application/json" } } },
      { request: { method: "GET", url: "https://api.acme.com/v2/users/3f9a7c2e-0b11-4d5e-9a10-1c2b3d4e5f60" }, response: { status: 200, content: { mimeType: "application/json" } } },
    ],
  },
});

describe("parseHar", () => {
  it("extracts JSON API endpoints and ignores html/static assets", () => {
    const { ops } = parseHar(har);
    const paths = ops.map((o) => `${o.method.toUpperCase()} ${o.path}`);
    expect(paths).not.toContain("GET /dashboard");
    expect(paths.some((p) => p.includes("/static/"))).toBe(false);
    expect(paths).toContain("GET /v2/projects");
  });

  it("parameterizes numeric and uuid path segments and dedups by template", () => {
    const { ops } = parseHar(har);
    const paths = ops.map((o) => `${o.method.toUpperCase()} ${o.path}`);
    // The two numeric project ids collapse to one templated op.
    expect(paths.filter((p) => p === "GET /v2/projects/{id}").length).toBe(1);
    expect(paths).toContain("POST /v2/projects/{id}/tasks");
    expect(paths).toContain("GET /v2/users/{id}"); // uuid templated
  });

  it("picks the dominant API origin as the base and names each op", () => {
    const { apiBase, ops } = parseHar(har);
    expect(apiBase).toBe("https://api.acme.com");
    expect(ops.every((o) => o.name && o.name.length > 0)).toBe(true);
  });

  it("returns empty ops for junk input without throwing", () => {
    expect(parseHar("not json").ops).toEqual([]);
    expect(parseHar(JSON.stringify({ log: {} })).ops).toEqual([]);
  });
});
