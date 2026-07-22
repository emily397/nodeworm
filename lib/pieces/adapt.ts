// Pure adapters from a PieceDefinition onto NodeWorm's existing models. These are
// the seams the Phase 1 spike proves: a piece becomes a Gallery node, an OAuth
// provider (reusing lib/engine/oauth.ts + vault, plus Phase 0.5 refresh), and a
// set of builder actions (reusing lib/flow/actions.ts FlowAction). STUBBED: the
// spike is TDD, so these throw until adapt.test.ts drives them green. See PLAN.md.

import type { FlowAction } from "../flow/actions";
import type { Node } from "../catalog";
import type { PieceDefinition } from "./types";

// The OAuth provider shape lib/engine/oauth.ts already understands.
export interface PieceOAuthProvider {
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  scopeSep: string;
  pkce: boolean;
}

export function pieceToNode(_piece: PieceDefinition): Node {
  throw new Error("not implemented: pieceToNode");
}

export function pieceOAuth(_piece: PieceDefinition): PieceOAuthProvider | null {
  throw new Error("not implemented: pieceOAuth");
}

export function pieceActions(_piece: PieceDefinition): FlowAction[] {
  throw new Error("not implemented: pieceActions");
}
