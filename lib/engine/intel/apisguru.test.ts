import { describe, it, expect } from "vitest";
import { matchApiGuru, type ApiGuruList } from "./apisguru";

// A trimmed fixture mirroring api.apis.guru/v2/list.json shape.
const LIST: ApiGuruList = {
  "stripe.com": { preferred: "2022-11-15", versions: { "2022-11-15": { swaggerUrl: "https://api.apis.guru/v2/specs/stripe.com/2022-11-15/openapi.json", info: { title: "Stripe API", "x-providerName": "stripe.com" } } } },
  "notion.com": { preferred: "1", versions: { "1": { swaggerUrl: "https://api.apis.guru/v2/specs/notion.com/1/openapi.json", info: { title: "Notion API", "x-providerName": "notion.com" } } } },
  "github.com": { preferred: "1.1.4", versions: { "1.1.4": { swaggerUrl: "https://api.apis.guru/v2/specs/github.com/1.1.4/openapi.json", info: { title: "GitHub v3 REST API", "x-providerName": "github.com" } } } },
  "twilio.com:api": { preferred: "1.0.0", versions: { "1.0.0": { swaggerUrl: "https://api.apis.guru/v2/specs/twilio.com/api/1.0.0/openapi.json", info: { title: "Twilio API", "x-providerName": "twilio.com" } } } },
  "xero.com:xero-identity": { preferred: "2.9.4", versions: { "2.9.4": { swaggerUrl: "https://api.apis.guru/v2/specs/xero.com/xero-identity/2.9.4/openapi.json", info: { title: "Xero OAuth 2 Identity Service API", "x-providerName": "xero.com" } } } },
  "api.video": { preferred: "1", versions: { "1": { swaggerUrl: "https://api.apis.guru/v2/specs/api.video/1/openapi.json", info: { title: "api.video", "x-providerName": "api.video" } } } },
};

describe("matchApiGuru", () => {
  it("matches an app name to its provider domain", () => {
    expect(matchApiGuru(LIST, "Stripe")?.key).toBe("stripe.com");
    expect(matchApiGuru(LIST, "notion")?.key).toBe("notion.com");
    expect(matchApiGuru(LIST, "GitHub")?.key).toBe("github.com");
  });

  it("matches from a URL / domain", () => {
    expect(matchApiGuru(LIST, "https://github.com/settings")?.key).toBe("github.com");
    expect(matchApiGuru(LIST, "www.stripe.com")?.key).toBe("stripe.com");
  });

  it("resolves an api.* subdomain to its registrable domain, not a stray api.* provider", () => {
    // Regression: an "api." host must map to stripe.com, never api.video.
    expect(matchApiGuru(LIST, "https://api.stripe.com")?.key).toBe("stripe.com");
    expect(matchApiGuru(LIST, "app.asana-like.stripe.com")?.key).toBe("stripe.com");
  });

  it("matches a colon-suffixed provider by name", () => {
    expect(matchApiGuru(LIST, "Twilio")?.key).toBe("twilio.com:api");
    expect(matchApiGuru(LIST, "Xero")?.key).toBe("xero.com:xero-identity");
  });

  it("returns the preferred version's spec URL", () => {
    expect(matchApiGuru(LIST, "Stripe")?.specUrl).toBe("https://api.apis.guru/v2/specs/stripe.com/2022-11-15/openapi.json");
  });

  it("returns undefined for an app not in the directory", () => {
    expect(matchApiGuru(LIST, "Obscuria CRM 9000")).toBeUndefined();
    expect(matchApiGuru(LIST, "")).toBeUndefined();
  });
});
