// The adapted-piece registry. Pieces are additive: import the definition, add it
// here, and it becomes a Gallery node, an OAuth provider, and a set of builder
// actions with no other change. Gated by PIECES_ENABLED so the spike ships dark.

import { HUBSPOT } from "./hubspot";
import { VENDOR_PIECES } from "./vendor";
import { pieceActions, pieceOAuth, pieceToNode } from "./adapt";
import type { PieceDefinition } from "./types";

const PIECES: PieceDefinition[] = [HUBSPOT, ...VENDOR_PIECES];

export function piecesEnabled(): boolean {
  return process.env.PIECES_ENABLED === "1";
}

const norm = (s: string) => s.trim().toLowerCase();

export function pieceFor(appName: string): PieceDefinition | undefined {
  if (!piecesEnabled()) return undefined;
  return PIECES.find((p) => norm(p.name) === norm(appName) || norm(p.id) === norm(appName));
}

// Every adapted piece, for the Gallery and the attribution page. Empty when the
// flag is off so nothing half-built shows up in the product.
export function allPieces(): PieceDefinition[] {
  return piecesEnabled() ? PIECES : [];
}

// Provenance for /oss and the licence guard. Always returns the full list,
// independent of the feature flag: attribution is not feature-gated.
export function pieceProvenance(): Array<PieceDefinition["upstream"] & { name: string }> {
  return PIECES.map((p) => ({ name: p.name, ...p.upstream }));
}

// Only the pieces that are derivative works and therefore need attribution.
export function adaptedProvenance() {
  return pieceProvenance().filter((p) => p.origin === "activepieces");
}

export function pieceCount(): number {
  return PIECES.length;
}

export { pieceActions, pieceOAuth, pieceToNode };
