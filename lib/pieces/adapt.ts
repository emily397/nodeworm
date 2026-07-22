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

export function pieceToNode(piece: PieceDefinition): Node {
  return { name: piece.name, category: piece.category };
}

export function pieceOAuth(piece: PieceDefinition): PieceOAuthProvider | null {
  if (piece.auth.type !== "oauth2") return null;
  const a = piece.auth;
  return {
    authorizeUrl: a.authorizeUrl,
    tokenUrl: a.tokenUrl,
    scopes: a.scopes,
    scopeSep: a.scopeSep ?? " ",
    pkce: a.pkce ?? false,
  };
}

function join(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

// A piece action becomes exactly the FlowAction shape the builder already renders
// for discovered OpenAPI operations, so pieces need no new picker or step type.
export function pieceActions(piece: PieceDefinition): FlowAction[] {
  return piece.actions.map((a) => ({
    name: a.name,
    method: a.method.toUpperCase(),
    path: a.path,
    url: join(piece.apiBase, a.path),
    summary: a.description,
    bodyTemplate: a.bodyKeys?.length ? JSON.stringify(Object.fromEntries(a.bodyKeys.map((k) => [k, ""]))) : undefined,
  }));
}
