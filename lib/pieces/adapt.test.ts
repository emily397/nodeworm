import { describe, expect, it } from "vitest";
import { pieceActions, pieceOAuth, pieceToNode } from "./adapt";
import type { PieceDefinition } from "./types";

// A minimal HubSpot-shaped piece: enough to pin the adapter contract. The Phase 1
// spike fills in the real vendored HubSpot piece; this test defines what "adapted"
// means before that code exists (RED until adapt.ts is implemented).
const HUBSPOT: PieceDefinition = {
  id: "hubspot",
  name: "HubSpot",
  category: "crm",
  apiBase: "https://api.hubapi.com",
  auth: {
    type: "oauth2",
    authorizeUrl: "https://app.hubspot.com/oauth/authorize",
    tokenUrl: "https://api.hubapi.com/oauth/v1/token",
    scopes: ["crm.objects.contacts.read", "crm.objects.contacts.write"],
    scopeSep: " ",
    pkce: false,
  },
  props: [{ key: "email", label: "Email", type: "text", required: true }],
  actions: [
    { key: "create_contact", name: "Create contact", description: "Create a contact", method: "post", path: "/crm/v3/objects/contacts", bodyKeys: ["email", "firstname"] },
    { key: "get_contact", name: "Get contact", description: "Fetch a contact", method: "get", path: "/crm/v3/objects/contacts/{id}" },
  ],
  triggers: [{ key: "new_contact", name: "New contact", type: "polling", itemsPath: "results", idPath: "id" }],
  upstream: { origin: "activepieces", repo: "activepieces/activepieces", sourcePath: "packages/pieces/community/hubspot", sha: "PENDING", license: "MIT" },
};

describe("pieceToNode", () => {
  it("maps a piece to a Gallery node", () => {
    expect(pieceToNode(HUBSPOT)).toEqual({ name: "HubSpot", category: "crm" });
  });
});

describe("pieceOAuth", () => {
  it("maps oauth2 auth onto the oauth.ts provider shape, defaulting scopeSep and pkce", () => {
    expect(pieceOAuth(HUBSPOT)).toEqual({
      authorizeUrl: "https://app.hubspot.com/oauth/authorize",
      tokenUrl: "https://api.hubapi.com/oauth/v1/token",
      scopes: ["crm.objects.contacts.read", "crm.objects.contacts.write"],
      scopeSep: " ",
      pkce: false,
    });
  });

  it("returns null for a non-oauth2 piece", () => {
    expect(pieceOAuth({ ...HUBSPOT, auth: { type: "apikey", header: "authorization" } })).toBeNull();
  });
});

describe("pieceActions", () => {
  it("maps piece actions to builder FlowActions with absolute urls and a body skeleton", () => {
    const actions = pieceActions(HUBSPOT);
    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({ name: "Create contact", method: "POST", url: "https://api.hubapi.com/crm/v3/objects/contacts" });
    expect(JSON.parse(actions[0].bodyTemplate!)).toEqual({ email: "", firstname: "" });
    expect(actions[1]).toMatchObject({ method: "GET", url: "https://api.hubapi.com/crm/v3/objects/contacts/{id}" });
    expect(actions[1].bodyTemplate).toBeUndefined();
  });
});
