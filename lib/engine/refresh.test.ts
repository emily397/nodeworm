import { afterEach, describe, expect, it, vi } from "vitest";
import { refreshAccessToken } from "./oauth";
import { shouldRefresh } from "./refresh";

const provider = {
  authorizeUrl: "https://app.hubspot.com/oauth/authorize",
  tokenUrl: "https://api.hubapi.com/oauth/v1/token",
  scopes: [],
  scopeSep: " ",
  pkce: false,
  tokenAuth: "body" as const,
};
const creds = { clientId: "cid", clientSecret: "csec" };

afterEach(() => vi.unstubAllGlobals());

function stubFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; body: string }> = [];
  vi.stubGlobal("fetch", async (url: string, init: { body?: string }) => {
    calls.push({ url: String(url), body: String(init?.body ?? "") });
    return { ok: status < 400, status, text: async () => JSON.stringify(body) } as unknown as Response;
  });
  return calls;
}

describe("refreshAccessToken", () => {
  it("posts grant_type=refresh_token with the stored refresh token and returns the new tokens", async () => {
    const calls = stubFetch(200, { access_token: "new-access", refresh_token: "new-refresh" });
    const r = await refreshAccessToken({ provider, creds, refreshToken: "old-refresh" });

    expect(r.ok).toBe(true);
    expect(r.accessToken).toBe("new-access");
    expect(r.refreshToken).toBe("new-refresh");
    expect(calls[0].url).toBe("https://api.hubapi.com/oauth/v1/token");
    const sent = new URLSearchParams(calls[0].body);
    expect(sent.get("grant_type")).toBe("refresh_token");
    expect(sent.get("refresh_token")).toBe("old-refresh");
    expect(sent.get("client_id")).toBe("cid");
  });

  it("keeps the existing refresh token when the provider does not rotate it", async () => {
    stubFetch(200, { access_token: "new-access" });
    const r = await refreshAccessToken({ provider, creds, refreshToken: "old-refresh" });
    expect(r.refreshToken).toBe("old-refresh");
  });

  it("fails honestly when the provider rejects the refresh token", async () => {
    stubFetch(400, { error: "invalid_grant", error_description: "refresh token expired" });
    const r = await refreshAccessToken({ provider, creds, refreshToken: "dead" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/expired/i);
  });
});

describe("shouldRefresh", () => {
  it("refreshes only on an auth rejection when a refresh token exists", () => {
    expect(shouldRefresh(401, "rt")).toBe(true);
    expect(shouldRefresh(403, "rt")).toBe(true);
    expect(shouldRefresh(500, "rt")).toBe(false);
    expect(shouldRefresh(200, "rt")).toBe(false);
  });

  it("never refreshes without a stored refresh token", () => {
    expect(shouldRefresh(401, undefined)).toBe(false);
    expect(shouldRefresh(401, "")).toBe(false);
  });
});
