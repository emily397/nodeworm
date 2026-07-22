// HubSpot piece, adapted for NodeWorm.
//
// Adapted from activepieces/activepieces, packages/pieces/community/hubspot
// (MIT License, Copyright (c) 2023 Activepieces Inc), pinned at commit
// 062907cc038c775c5a1c13711155719630279756. Nothing from packages/ee or
// packages/server/api/src/app/ee (Activepieces Enterprise License) is used here.
// Upstream ships 45 actions and 24 triggers; this adaptation carries the core CRM
// surface. Extending it is additive: append entries below, no runtime change.
//
// Transformed, not copied: upstream pieces are live framework objects bound to the
// Activepieces engine. NodeWorm reduces each to the data-first PieceDefinition in
// ./types so no foreign runtime enters this product. See PLAN.md Item 1.

import type { PieceDefinition } from "./types";

export const HUBSPOT: PieceDefinition = {
  id: "hubspot",
  name: "HubSpot",
  category: "crm",
  apiBase: "https://api.hubapi.com",
  auth: {
    type: "oauth2",
    authorizeUrl: "https://app.hubspot.com/oauth/authorize",
    tokenUrl: "https://api.hubapi.com/oauth/v1/token",
    scopes: ["crm.objects.contacts.read", "crm.objects.contacts.write", "crm.objects.companies.read", "crm.objects.companies.write", "crm.objects.deals.read", "crm.objects.deals.write"],
    scopeSep: " ",
    pkce: false,
  },
  props: [
    { key: "email", label: "Email", type: "text", required: true },
    { key: "firstname", label: "First name", type: "text" },
    { key: "lastname", label: "Last name", type: "text" },
  ],
  actions: [
    { key: "create_contact", name: "Create contact", description: "Create a contact in HubSpot", method: "post", path: "/crm/v3/objects/contacts", bodyKeys: ["properties"] },
    { key: "update_contact", name: "Update contact", description: "Update an existing contact", method: "patch", path: "/crm/v3/objects/contacts/{contactId}", bodyKeys: ["properties"] },
    { key: "get_contact", name: "Get contact", description: "Fetch a contact by id", method: "get", path: "/crm/v3/objects/contacts/{contactId}" },
    { key: "find_contact", name: "Find contact", description: "Search contacts", method: "post", path: "/crm/v3/objects/contacts/search", bodyKeys: ["filterGroups", "properties"] },
    { key: "create_company", name: "Create company", description: "Create a company", method: "post", path: "/crm/v3/objects/companies", bodyKeys: ["properties"] },
    { key: "get_company", name: "Get company", description: "Fetch a company by id", method: "get", path: "/crm/v3/objects/companies/{companyId}" },
    { key: "create_deal", name: "Create deal", description: "Create a deal", method: "post", path: "/crm/v3/objects/deals", bodyKeys: ["properties"] },
    { key: "get_deal", name: "Get deal", description: "Fetch a deal by id", method: "get", path: "/crm/v3/objects/deals/{dealId}" },
    { key: "create_ticket", name: "Create ticket", description: "Create a support ticket", method: "post", path: "/crm/v3/objects/tickets", bodyKeys: ["properties"] },
  ],
  triggers: [
    { key: "new_contact", name: "New contact", type: "polling", itemsPath: "results", idPath: "id" },
    { key: "new_company", name: "New company", type: "polling", itemsPath: "results", idPath: "id" },
    { key: "new_deal", name: "New deal", type: "polling", itemsPath: "results", idPath: "id" },
  ],
  upstream: {
    repo: "activepieces/activepieces",
    sourcePath: "packages/pieces/community/hubspot",
    sha: "062907cc038c775c5a1c13711155719630279756",
    license: "MIT",
  },
};
