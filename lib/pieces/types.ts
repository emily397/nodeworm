// Piece adapter contract (Phase 1 spike). A PieceDefinition is the DATA-first
// shape a vendored + transformed Activepieces community piece is reduced to:
// auth, typed props, actions, and triggers as data plus small handlers. It is
// deliberately NOT the Activepieces framework object; we adapt MIT piece source
// into this shape so nothing of their runtime (or their ee paths) is imported.
// See PLAN.md, Item 1 and Phase 1.

import type { NodeCategory } from "../catalog";
import type { ConnectionField } from "../flow/encode";

export type { ConnectionField };

export type PiecePropType = "text" | "number" | "checkbox" | "dropdown";

export interface PieceProp {
  key: string;
  label: string;
  type: PiecePropType;
  required?: boolean;
  options?: Array<{ label: string; value: string }>; // dropdown only
}

// OAuth2 is the only auth the spike proves. apikey/none are declared so the
// contract is stable, but map onto the vault the same way (Phase 0.5 refresh
// applies to oauth2 only).
export type PieceAuth =
  | { type: "oauth2"; authorizeUrl: string; tokenUrl: string; scopes: string[]; scopeSep?: string; pkce?: boolean }
  | { type: "apikey"; header: string }
  | { type: "none" };

// An action maps onto a NodeWorm http-style call. Path may carry {param}
// placeholders resolved from props/trigger data at run time.
export interface PieceAction {
  key: string;
  name: string;
  description: string;
  method: string;
  path: string;
  bodyKeys?: string[];
  // Overrides the piece default; some APIs take form-encoded bodies, not JSON.
  encoding?: "json" | "form";
}

export type PieceTrigger =
  | { key: string; name: string; type: "polling"; itemsPath: string; idPath: string }
  | { key: string; name: string; type: "webhook"; event: string };

export interface PieceDefinition {
  id: string; // stable slug, e.g. "hubspot"
  name: string; // display name, e.g. "HubSpot"
  category: NodeCategory;
  // Absolute base the actions resolve against. May carry {key} placeholders that
  // name a connectionField, for APIs on a per-tenant host (Shopify).
  apiBase: string;
  auth: PieceAuth;
  props: PieceProp[];
  actions: PieceAction[];
  triggers: PieceTrigger[];
  upstream: PieceProvenance;
  // Default body encoding for every action on this piece (default json).
  encoding?: "json" | "form";
  // Values collected ONCE per connection (a shop domain, an account id), not per
  // step. Non-secret: secrets stay in the vault.
  connectionFields?: ConnectionField[];
}

// Where a piece came from. Being precise matters legally: only "activepieces"
// pieces are derivative works needing attribution and a pinned commit. Pieces
// authored from a vendor's own public API docs carry no third-party licence, and
// must not claim an upstream commit they did not come from.
export type PieceProvenance =
  | { origin: "activepieces"; repo: string; sourcePath: string; sha: string; license: "MIT" }
  | { origin: "vendor-docs"; docsUrl: string };
