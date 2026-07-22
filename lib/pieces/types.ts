// Piece adapter contract (Phase 1 spike). A PieceDefinition is the DATA-first
// shape a vendored + transformed Activepieces community piece is reduced to:
// auth, typed props, actions, and triggers as data plus small handlers. It is
// deliberately NOT the Activepieces framework object; we adapt MIT piece source
// into this shape so nothing of their runtime (or their ee paths) is imported.
// See PLAN.md, Item 1 and Phase 1.

import type { NodeCategory } from "../catalog";

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
}

export type PieceTrigger =
  | { key: string; name: string; type: "polling"; itemsPath: string; idPath: string }
  | { key: string; name: string; type: "webhook"; event: string };

export interface PieceDefinition {
  id: string; // stable slug, e.g. "hubspot"
  name: string; // display name, e.g. "HubSpot"
  category: NodeCategory;
  apiBase: string; // absolute base the actions resolve against
  auth: PieceAuth;
  props: PieceProp[];
  actions: PieceAction[];
  triggers: PieceTrigger[];
  // Provenance, mirrored into lib/pieces/MANIFEST.json. Kept so the /oss page
  // and the ee-provenance CI check have a single source of truth.
  upstream: { repo: string; sourcePath: string; sha: string; license: "MIT" };
}
