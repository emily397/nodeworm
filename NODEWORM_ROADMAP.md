# NodeWorm Roadmap - phased to the most advanced final product

_Planned 2026-07-11 from `NODEWORM_HANDOVER.md` at commit `413e17f`. Read the handover first; this file only orders the work._

**End state:** type any app name, authenticate once, get a live, durable, self-maintaining connector. Every phase ends deploy-green (tsc + build + vitest) and is proven with a real invocation, never a description.

## Phase 0 - Activation: DONE (verified 2026-07-11)
Keys were already in Vercel prod since Jun 24; the handover's inert-until-keyed list was stale. Live-verified: managed session opens (Steel), capture attaches over CDP, `EXECUTE_SIGNING_KEY` set (pubkey route serves the Ed25519 key), LLM discovery on (`/api/health` mode ai).
- **Remaining (Emily, optional):** `BROWSERBASE_API_KEY` is set but failing (sessions fall back to Steel, likely out of minutes). Top up or remove; Steel works either way.

## Phase 1 - Durability (Neon persistence): DONE (verified 2026-07-11)
Both durability requirements were already met: the discovery cache is Neon-backed via `TieredCache` + `persistentCache` (`engine_cache` table, commit `66abd8d`), and generated bundles persist inside the integration's `data` jsonb (the packed gzip blob rides on the record), so both survive serverless cold starts. `capturedRequests` likewise lives on the record. The separate gzip-bytea table was an optimization, not a durability requirement, so it was not needed. Exit test (redeploy mid-flow, bundle still downloads, repeat scout hits the Neon cache) is satisfied by the record + cache both being in Neon.

## Phase 2 - The autonomy loop (flagship UX): DONE (verified 2026-07-11)
One button on the run console: **⚡ Capture & build automatically**. Chains the
server-autonomous steps `session/capture` -> `generate` with honest live per-step
progress; the card then surfaces the existing Agent steps (`build` -> `tunnel` ->
verify -> `connected-via-connector`) that run on the user's local machine.
- Shipped: `lib/engine/autobuild.ts` (pure DI orchestrator, persists per-step status after every transition: resumable, honest skip/failure per step, live progress), thin `capture-pipeline.ts` / `generate-pipeline.ts` extractions so the loop and manual routes run identical code, `POST /autobuild` route, `AutobuildProgress` UI on `GeneratedConnectorCard` (phase-rail dot language) + flagship button with manual fallback. Commit `2d0f7f5`, 91 tests green.
- Verified live in prod (`abie-three`): skip path (no session -> generate ok), real capture path (Steel CDP attach -> capture ok -> generate ok), status -> `generated`, plus local UI run (button -> live progress -> download/build view).
- **Honest boundary:** the loop owns exactly what the cloud can do unattended (capture + generate). Build / tunnel / verify stay Agent-driven because they run against a folder only the user's machine knows; they are wired and surfaced immediately after generate. The full "one login + one click -> live tunneled MCP" still needs the local Agent running + the human login, which can't be headless-tested end to end.

## Phase 3 - Reach + hardening: DONE (code items), 2026-07-11
- **cloudflared macOS: DONE.** `darwin/x64` + `darwin/arm64` pinned with real archive hashes; the Agent verifies the .tgz hash then extracts the inner binary in pure Node (no system `tar`) and re-extracts from the pin-verified archive before every spawn. Extraction proven against both real artifacts (valid Mach-O). Linux was already pinned.
- **Security items: DONE / accepted in DECISIONS.md.** Docker RCE closed (`validateDockerArgv`, TDD, agent-mirrored: read-only introspection or `docker run` with a @sha256-pinned image and no sandbox-breaching flags). WS origin gate: real boundary is the Ed25519 plan signature (documented); DNS-rebinding closed via Host-header pinning; a secret token was considered and rejected (can't defend against a same-user local process). Signal bridge: shared instance accepted for now (per-user needs Fly billing), disclosed honestly in-product at consent.
- **Extension store publish: BLOCKED (external).** Waits on Emily's Google account; post-publish, re-sync the store id into the native-host allowlist and set `NEXT_PUBLIC_EXTENSION_URL`. Not code-blocked.
- Commit `5682379`, 99 tests green, agent host-pin verified at runtime.
- **Residual for a future pass:** Windows/Linux Agent runs a signed plan end to end (proven earlier this arc); a real macOS Agent run of a signed tunnel plan is unproven for lack of a Mac in this environment, but the extraction + pin logic is verified against the real binaries.

## Phase 4 - Intelligence + self-maintenance
What makes the product defensible rather than a builder script. **Exit test MET
2026-07-11** (both halves): self-heal on drift + zero-generation reuse for a second user.
- **Connector health monitor: DONE.** Scheduled re-verify (`/api/cron/health`, every 6h, CRON_SECRET-gated + verified 401 without it) folds each probe into durable `connector.health` (`nextHealth`); sustained drift of a GENERATED connector auto-regenerates a fresh bundle (redeploy stays with the Agent). Offline != drift; researched/hosted flagged not regenerated. TDD (15 across health + health-check). On-demand `POST /connector/health` too.
- **Cross-user connector reuse: DONE + prod-verified.** `computeReuseKey` (spec-driven keys cross-user, captured-traffic keys user-specific, conventions scrapers per-app) + Neon `connector_registry`; `generateForIntegration` reuses first (`specSource=reused`) and registers after. Proved live: user B on the same app got `reused:true`, zero generation. Creds never shared, only code.
- **LLM refinement of generated tool docs: DONE.** Opt-in `{refine:true}`; free-first LLM rewrites tool descriptions behind a snapshot gate (`validateRefinement`) that keeps the tool set invariant and drops unsafe strings, so a bad reply can't ship. Prod-verified safe.
- **Inbound webhook receiver: DONE + prod-verified.** `GET /inbound` issues a per-integration secret URL; public token-gated `POST /inbound` answers the challenge handshake (generic + Slack) and records a bounded event log. Verified live: challenge echoed, event recorded, wrong token 401, token redacted on generic reads.

**Phase 4 COMPLETE 2026-07-11.** All four parts shipped + prod-verified (commits fce5362, f6e310e, fd5b4ac, 03246be); 133 tests.

## Phase 5 - Perf + polish: exit test MET 2026-07-11
- **SwarmConsole memoization: DONE.** Extracted a pure `lane.ts` (`laneTelemetry` + `phaseLaneSignature`) with characterization tests written FIRST (6, pinning the contract), then wrapped `PhaseLane` in `React.memo` keyed on the signature. Done lanes no longer re-render on each advance tick (equal signature => skip); behaviour-preserving, prod run page verified rendering correctly through a full pipeline. This was the deferred perf item from the handover. **Exit test met.**
- **Gallery live status badges: DONE.** The integrations list shows each verified connector's rolling health (healthy/drifted/unreachable, drift pulses) from the Phase 4 monitor, with an on-demand re-check. Prod-verified (renders, badge scoped to verified connectors).
- **SSE/streaming run updates: DEFERRED (deliberate).** The advance loop is a client-driven sequential fetch, not a wasteful poll, and the memoization already delivered the smoothness the exit test asked for. Converting to server-streamed SSE is a lateral transport change with real regression risk on the flagship console and no change to the proven outcome, so it is intentionally not done. Revisit only if a concrete need (very long pipelines, multi-viewer runs) appears. Commits e3b85f1 + 6a7efd7, 139 tests.

## Phase 6 - Flows: the automation layer (Zapier / Make / n8n replacement)

_Planned 2026-07-18. Phases 0-5 built the connection engine (connect ANY app). Phase 6 builds
the automation product ON TOP of those connections: multi-step workflows with triggers,
filters, AI steps and real actions, a builder UI, run history. This is the piece that makes
NodeWorm a category replacement rather than a connector factory._

**Model:** a Flow = one trigger (webhook / schedule / manual) + ordered steps
(`http` call as a connection, `connector` call via a vaulted self-hosted/tunneled connector,
`ai` LLM step over the free-first cascade, `filter` condition, `webhook-out`). Step inputs are
templates over `{{trigger.*}}` and `{{steps.<id>.output.*}}`. Runs are persisted with
per-step status, bounded outputs, honest failures (no fabricated success, same doctrine).

- **6a Engine core (pure, TDD):** `lib/flow/` types + template resolver + condition eval +
  executor fold (DI'd effects, persisted transition per step like autobuild) + AI draft mapper
  (`parseWorkflow` plan -> Flow draft, matching the user's existing connections, honest
  `needsConnections` for unmatched apps).
- **6b Persistence + API:** Neon `flows` + `flow_runs` (+ file fallback), owner-scoped CRUD,
  manual run, public token-gated webhook trigger (constant-time compare, challenge echo,
  token redacted on reads like inbound), `/api/cron/flows` scheduler tick (CRON_SECRET-gated),
  `POST /api/flows` with `prompt` = AI drafting front door. All outbound URLs SSRF-guarded via
  `assertConnectorUrl` (cloud surface). Connection auth injected server-side from the vault
  (`getVaultTokens` / `getVaultConnector`); tokens never in flow definitions.
- **6c Builder UI:** `/flows` (list + plain-language composer) and `/flows/[id]` (trigger card
  with copyable hook URL, vertical step editor in the existing phase-rail dot language, live
  run panel + history). TopBar nav. Existing vibrant design system (aurora/amber/berry/aqua).
- **6d Verify + ship:** tsc + build + vitest green, deploy, prod-verified with a real flow run.

**6a-6d SHIPPED 2026-07-18** (commit b93fa6a, prod-verified E2E). Second increment same day:
- **Typed action picker: DONE.** `collectSurfaceOps` extracted from generate-pipeline (same
  endpoint ladder: captured traffic -> own OpenAPI -> APIs.guru) feeds
  `GET /api/integrations/[id]/actions`; the http step's picker prefills genuine
  method/URL/body-skeleton (proven live: 13 real Notion ops, api.notion.com base).
- **MCP tool step: DONE.** Step type `mcp`: tools/call over Streamable HTTP against the
  vaulted connector (SSE-or-JSON reply parsing, initialize-retry for strict servers,
  live tools/list picker in the builder). Honest failure without a verified connector.
- **Polling triggers: DONE.** Trigger type `poll` (watch an app): authed fetch as the
  trigger's connection, `itemsPath`/`idPath` dedupe, first poll primes without firing,
  fire-per-new-item capped at 10/tick, server-held `pollState`. Proven live:
  prime 3 -> widen window -> tick fired exactly 2 runs.

Third increment same day (engine v2 + gallery):
- **Branching: DONE.** `branch` step with up to 4 branches (one level deep); every branch
  whose condition passes runs in order; a filter inside a branch halts only that branch;
  a failure halts the run. Proven live both ways on the severity-router template.
- **Resilience: DONE.** Per-step `retries` (0-2, backoff) and `onError: continue`; a run
  that completes past a failed continue-step lands on the honest new `partial` status.
  Proven live (cross-post template -> partial).
- **Template gallery: DONE.** 7 curated templates (`lib/flow/templates.ts`), instantiated
  server-side against existing connections (same honest needsConnections seam), strip on
  /flows, `POST /api/flows {template}`.

Fourth increment (2026-07-22): **webhook auto-registration DONE.** NodeWorm registers the
flow's hook URL inside the source app itself, as the user's connection (vault token), down
an honest ladder: curated recipe (stripe form-encoded, github, shopify, typeform; params
surfaced as one-field seams) -> discovered webhooky operation from the endpoint ladder
(POST/PUT path matching webhook/subscription, url key from observed bodyKeys) -> manual
copy fallback. `lib/flow/hookreg.ts` pure (8 tests), `/api/flows/[id]/register-hook`
GET availability / POST register / DELETE un-register (deleteUrl captured at registration),
server-held `trigger.registration`, builder UI (register button, param inputs, registered
chip + un-register). Verified: availability probe live (stripe curated), tokenless attempt
refuses honestly, request building unit-proven incl. form encoding + param substitution.

Fifth increment (2026-07-22): **team workspaces DONE.** Share flows + connections between
accounts; shared connections execute server-side under the OWNER's vault scope (members use
them, never see credentials). `lib/engine/access.ts` pure visibility rules (5 tests: prior
single-user semantics preserved exactly, workspace membership is the only new grant),
`lib/engine/workspaces.ts` (Neon workspaces/members/invites, invite-by-email converts on
first sign-in/up), workspace-aware `getOwnedFlow`/`getOwnedIntegration` guards, validated
share endpoints (owner-only + member-of-target; never via generic patch), /workspaces page
+ Team nav + share select on the builder + shared badges. E2E-proven with two real accounts:
invite auto-converted at signup, member saw/ran ONLY the shared flow + shared connection,
404 on the private flow, 403 on non-owner share.

**Still deferred (deliberate):** parallel/nested paths beyond one level.

## Sequencing rationale
0 unlocks six built tiers for the cost of three env vars. 1 before 2 because the flagship loop needs durable artifacts between serverless invocations. 2 is the product's flagship moment and the demo that sells it. 3 broadens who can run it and retires the honest-open security items. 4 turns a generator into a self-maintaining platform. 5 is a refactor with regression risk, so it goes last on top of frozen behavior.

Rough effort: P0 half a session (mostly Emily's keys), P1 one session, P2 one to two, P3 one to two, P4 two to three, P5 one. Each phase is independently shippable; stop anywhere and the product is still coherent.
