import { describe, it, expect } from "vitest";
import { looksLikeApiUrl, pickPortalHit } from "./portal-resolve";

describe("looksLikeApiUrl", () => {
  it("flags API endpoints a browser can't register an app on", () => {
    expect(looksLikeApiUrl("https://app.clio.com/api/v4/applications")).toBe(true);
    expect(looksLikeApiUrl("https://api.stripe.com/v1/charges")).toBe(true);
    expect(looksLikeApiUrl("https://example.com/data.json")).toBe(true);
    expect(looksLikeApiUrl("https://example.com/graphql")).toBe(true);
  });

  it("does not flag real developer-portal pages", () => {
    expect(looksLikeApiUrl("https://developer.intuit.com/app/developer/dashboard")).toBe(false);
    expect(looksLikeApiUrl("https://github.com/settings/developers")).toBe(false);
    expect(looksLikeApiUrl("https://app.clio.com/settings/developer_applications")).toBe(false);
    expect(looksLikeApiUrl("https://linear.app/settings/api/applications/new")).toBe(false);
  });

  it("treats a malformed URL as non-API (caller validates reachability separately)", () => {
    expect(looksLikeApiUrl("not a url")).toBe(false);
  });
});

describe("pickPortalHit", () => {
  it("picks the developer-portal result over an API result", () => {
    const hits = [
      { title: "Clio API v4", url: "https://app.clio.com/api/v4/applications", snippet: "" },
      { title: "Create a Clio developer application", url: "https://app.clio.com/settings/developer_applications", snippet: "register your OAuth app" },
    ];
    expect(pickPortalHit(hits, "Clio")).toBe("https://app.clio.com/settings/developer_applications");
  });

  it("prefers portal signals (developer/oauth/apps/console) in host or path", () => {
    const hits = [
      { title: "Blog", url: "https://medium.com/some-post", snippet: "" },
      { title: "Developer console", url: "https://console.example.com/apps/new", snippet: "create app" },
    ];
    expect(pickPortalHit(hits, "Example")).toBe("https://console.example.com/apps/new");
  });

  it("returns undefined when no hit looks like a registration portal", () => {
    const hits = [
      { title: "News", url: "https://news.example.com/story", snippet: "" },
      { title: "API ref", url: "https://api.example.com/v2/things", snippet: "" },
    ];
    expect(pickPortalHit(hits, "Example")).toBeUndefined();
  });
});
