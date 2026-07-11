# NodeWorm Roadmap - phased to the most advanced final product

_Planned 2026-07-11 from `NODEWORM_HANDOVER.md` at commit `413e17f`. Read the handover first; this file only orders the work._

**End state:** type any app name, authenticate once, get a live, durable, self-maintaining connector. Every phase ends deploy-green (tsc + build + vitest) and is proven with a real invocation, never a description.

## Phase 0 - Activation: DONE (verified 2026-07-11)
Keys were already in Vercel prod since Jun 24; the handover's inert-until-keyed list was stale. Live-verified: managed session opens (Steel), capture attaches over CDP, `EXECUTE_SIGNING_KEY` set (pubkey route serves the Ed25519 key), LLM discovery on (`/api/health` mode ai).
- **Remaining (Emily, optional):** `BROWSERBASE_API_KEY` is set but failing (sessions fall back to Steel, likely out of minutes). Top up or remove; Steel works either way.

## Phase 1 - Durability (Neon persistence, no keys needed)
Serverless cold starts currently lose generated bundles and the discovery cache; the autonomy loop in Phase 2 cannot chain long steps on amnesiac storage, so this lands first.
- Move `bundle-store.ts` to Neon (gzip bytea), keep file-store fallback for local dev.
- Read-through persistence for the discovery `TtlCache` (table with expiry, in-memory hot layer stays).
- Confirm `capturedRequests` survives the full record lifecycle.
- Idempotent migrations, characterization tests on store round-trip.
- **Exit test:** redeploy mid-flow; previously generated bundle still downloads, repeat scout hits the Neon cache.

## Phase 2 - The autonomy loop (flagship UX)
One button on the run console: **Capture and build**. Chains `session/capture` -> `generate` -> signed `build` -> `tunnel` -> verify -> `connected-via-connector`.
- Server: orchestration route persisting per-step status (resumable, honest failure per step, `repair()` walks the ladder instead of dead-ending).
- Client: `GeneratedConnectorCard` gains live step progress (invoke `frontend-design` skill before touching UI; verify via computed styles + production CSS, screenshots time out on the aurora).
- **Exit test:** prod demo against an undocumented app: user logs in once in the managed session, clicks once, gets a live typed MCP behind a verified tunnel.

## Phase 3 - Reach + hardening
- cloudflared darwin/linux: handle `.tgz` extraction (darwin currently returns null), platform matrix test for the Agent.
- Close the documented security decisions: digest-pin the agent docker argv (RCE primitive), token-handshake the WS agent beyond the spoofable origin gate, decide per-user vs shared Signal bridge and either provision per-user or document the shared-account limit in-product.
- Extension store publish follow-through when the Google account is ready (re-sync store id into native-host allowlist, set `NEXT_PUBLIC_EXTENSION_URL`).
- **Exit test:** Agent runs a signed plan on macOS/Linux; each security item closed or explicitly accepted in DECISIONS.md.

## Phase 4 - Intelligence + self-maintenance
What makes the product defensible rather than a builder script.
- Connector health monitor: scheduled re-verify of live connectors; on drift, re-probe -> regenerate -> diff -> redeploy (auto-repair without user action).
- LLM refinement pass over generated tool names/descriptions/param docs (free-first cascade), gated by snapshot evals so regressions can't ship.
- Cross-user connector reuse: registry keyed by app + specSource hash; second user of an app skips generation entirely (creds stay vault-scoped, code is shared).
- Inbound completion: webhook receiver plumbing wherever `wire` chose webhooks over polling.
- **Exit test:** deliberately break a connector's endpoint, watch it self-heal; second account connects the same app with zero generation time.

## Phase 5 - Perf + polish
Deliberately last: the known-risky SwarmConsole refactor should ride on a stable feature set.
- SwarmConsole state refactor: patch phase slices immutably, memoize cards, characterization tests written BEFORE the refactor (the deferred perf item from the handover).
- SSE/streaming run updates instead of tick polling.
- Gallery surfaces real generated connectors with live status badges.
- **Exit test:** done phases no longer re-render per tick; run console interaction stays smooth through a full pipeline run.

## Sequencing rationale
0 unlocks six built tiers for the cost of three env vars. 1 before 2 because the flagship loop needs durable artifacts between serverless invocations. 2 is the product's flagship moment and the demo that sells it. 3 broadens who can run it and retires the honest-open security items. 4 turns a generator into a self-maintaining platform. 5 is a refactor with regression risk, so it goes last on top of frozen behavior.

Rough effort: P0 half a session (mostly Emily's keys), P1 one session, P2 one to two, P3 one to two, P4 two to three, P5 one. Each phase is independently shippable; stop anywhere and the product is still coherent.
