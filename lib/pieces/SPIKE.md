# Phase 1 spike: Activepieces single-piece adapter

Branch: `spike/activepieces-adapter`. Scope and reasoning: see PLAN.md (Item 1, Phase 1). This directory is the STARTING scaffold, not the finished spike. It compiles; the contract test is intentionally RED until the adapter is implemented.

## What is here
- `types.ts`: the data-first `PieceDefinition` contract a vendored piece is reduced to.
- `adapt.ts`: three pure adapters (`pieceToNode`, `pieceOAuth`, `pieceActions`), stubbed to throw (TDD red state).
- `adapt.test.ts`: the contract test that defines "adapted" for a HubSpot-shaped piece. Run `npx vitest run lib/pieces` to see it RED.

## Prerequisite before finishing the spike (blocks correctness)
Phase 0.5 (OAuth token refresh) must land first. Recon Q3 found NodeWorm captures `refresh_token` but never renews (`lib/engine/oauth.ts` does `grant_type: authorization_code` only). A piece connection that outlives the access-token lifetime will 401 without it.

## Remaining spike checklist (after approval)
1. Phase 0.5: add `grant_type: refresh_token` renewal + a fresh-token wrapper on the vault path used by `lib/flow/effects.ts`.
2. Implement `adapt.ts` to green (TDD): `pieceToNode`, `pieceOAuth` (default scopeSep to " ", pkce to false), `pieceActions` (reuse `lib/flow/actions.ts` join + body skeleton logic).
3. Add a `piece` flow step type (or extend `http`) that executes a piece action with vault-injected, refreshed auth; bind polling triggers to `lib/flow/poll.ts` and webhook triggers to `lib/flow/hookreg.ts`.
4. Vendor + transform ONE real HubSpot piece from `activepieces/activepieces` `packages/pieces/community/hubspot` (MIT), keeping the upstream header; record `{ sha, license, sourcePath }` in `lib/pieces/MANIFEST.json`.
5. Register it in the Gallery behind `PIECES_ENABLED`; add the `/oss` attribution page.
6. Property-to-field shim in the builder for typed props.
7. ee-provenance CI check: assert nothing from `packages/ee` or `packages/server/api/src/app/ee` was copied.
8. Run a real dev flow (auth + one trigger + one action). Record the per-piece hour cost; that number decides whether the 300-connector ceiling is realistic.
