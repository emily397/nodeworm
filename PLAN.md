# NodeWorm OSS Adoption Plan

_Recon + phased plan for the six OSS adoption items. Recon done 2026-07-22 by reading this repo directly. Licence conclusions from the prior primary-source session are treated as ground truth and not re-litigated; every codebase assumption the mission flagged was verified against source and is cited below._

Status: PLAN for approval. Nothing beyond the Phase 1 spike scaffold is implemented. Two mission assumptions were found false and the plan is adjusted around them (see Recon Q2 and Q3).

---

## Phase 0: Codebase recon (file-referenced)

### Q1. Flow execution model
Flow runs execute inline inside Vercel serverless function invocations. There is no worker and no queue today, and runs do NOT go through the 5-agent swarm.

- Entry points, all `maxDuration = 300`, all calling `fireFlow`:
  - Manual: [app/api/flows/[id]/run/route.ts](app/api/flows/[id]/run/route.ts)
  - Webhook: [app/api/flows/[id]/hook/route.ts](app/api/flows/[id]/hook/route.ts)
  - Schedule + poll: [app/api/cron/flows/route.ts](app/api/cron/flows/route.ts), driven by Vercel cron `*/5 * * * *` in [vercel.json](vercel.json)
- `fireFlow` ([lib/flow/runtime.ts](lib/flow/runtime.ts)) calls the pure fold `executeFlow` ([lib/flow/run.ts](lib/flow/run.ts)) with real effects ([lib/flow/effects.ts](lib/flow/effects.ts)) and persists via `onTransition -> saveRun` after every step ([lib/flow/store.ts](lib/flow/store.ts), Neon table `flow_runs`).
- The 5-agent swarm (scout, architect, wire, auditor, relay in [lib/engine/phases.ts](lib/engine/phases.ts)) builds CONNECTORS. Flow RUNS never touch it. The mission's "is it the swarm" question resolves to no.
- On timeout, crash, or redeploy mid-run: **no resume**. The `flow_runs` row is left at whatever the last `saveRun` wrote (typically `status: "running"`). Nothing reaps or resumes it. There is no stuck-run detection.
- Retry/resume state: per-step retries exist (`step.retries` 0 to 2 with in-invocation backoff in `run.ts`), but only WITHIN one invocation, not across a crash. No waits/delays. No human-approval pauses. Per-step output is bounded to 4000 chars (`boundOutput`).
- Foundation that already exists for durability: `FlowRun` with per-step `StepRun` status/summary/output is written after every step. The state to resume from is persisted; only the resume DRIVER and the crash-safe transport are missing.

### Q2. Node/Gallery interface (MISSION ASSUMPTION PARTLY FALSE)
There is no per-node contract with auth, trigger, action, and config schema. The mission assumed one; it does not exist.

- The Gallery ([lib/catalog.ts](lib/catalog.ts)) is a STATIC display catalog: `NODES` are `{ name, category }` and `WORMS` are plain-language prompts. Nothing on a node declares auth, triggers, or actions.
- The executable action model lives in the Flows layer instead:
  - Step types ([lib/flow/types.ts](lib/flow/types.ts)): `http | mcp | connector | ai | filter | webhook-out | branch`.
  - The http step's actions come from DISCOVERED operations: `toActions(OpenApiOp[], apiBase)` in [lib/flow/actions.ts](lib/flow/actions.ts), fed by `collectSurfaceOps` in [lib/engine/generate-pipeline.ts](lib/engine/generate-pipeline.ts) (captured traffic, then the app's own OpenAPI, then APIs.guru).
  - Generated MCP tools are the other action surface ([lib/engine/generate.ts](lib/engine/generate.ts)).
- Consequence for Item 1: an Activepieces adapter cannot "implement the node interface" because there is none. It must introduce a NEW piece runtime (a `piece` step type plus a catalog entry plus a vault-backed auth binding). This is more work than the mission framing assumed and is reflected in the Phase 1 scope.

### Q3. OAuth layer (MISSION ASSUMPTION PARTLY FALSE: no token refresh)
- Curated providers in [lib/engine/oauth.ts](lib/engine/oauth.ts): about 18 entries with `{ authorizeUrl, tokenUrl, scopes, scopeSep, pkce, tokenAuth }`. The token exchange is `grant_type: authorization_code` ONLY. It captures `refresh_token` (oauth.ts:405) but there is NO `grant_type: refresh_token` renewal path anywhere in the repo.
- Vault in [lib/engine/vault.ts](lib/engine/vault.ts): per-user or per-connection AES-256-GCM storage under `VAULT_KEK`; `storeTokens` / `getVaultTokens` return `{ accessToken, refreshToken? }`, scoped `u:<userId>` or `c:<connectionId>`, with an app-level client cache.
- Flow execution uses tokens raw: [lib/flow/effects.ts](lib/flow/effects.ts) http/connector/mcp call `getVaultTokens(...).accessToken` with a `Bearer` header and never refresh.
- Piece-style OAuth props (authUrl, tokenUrl, scopes, clientId, secret) DO map onto the `oauth.ts` provider shape plus vault storage. But the missing refresh is a real gap: pieces (and any long-running or durable flow) assume the platform keeps tokens fresh. So the auth bridge is "map onto the existing model AND add refresh," not "map only." A deterministic OAuth-endpoint seed already exists via the Nango registry (see Q7 flag).

### Q4. AI steps (LiteLLM readiness: GOOD, one choke point)
- All LLM calls go through [lib/engine/llm.ts](lib/engine/llm.ts): a cost cascade (Groq free, then OpenRouter free, then OpenRouter paid) keyed by `GROQ_API_KEY` / `OPENROUTER_API_KEY`. `providerUrl(p)` returns HARDCODED base URLs (`api.groq.com/openai/v1/...`, `openrouter.ai/api/v1/...`). Every call funnels through one `post(url, key, body)` and `callModel`. `LLM_CASCADE` overrides the model LIST only, not the base URL.
- The flow AI step ([lib/flow/effects.ts](lib/flow/effects.ts) `ai`) calls `chatJson`, same cascade.
- LiteLLM readiness is good: a single file and a single choke point. Add an `LLM_GATEWAY_URL` plus a per-customer virtual key that, when set, routes all `post()` calls through the gateway and passes the model as-is. No provider or model names are shown to end users today, so the house rule is already satisfied.

### Q5. Scheduling + dead-flow detection
- Scheduled and poll flows fire from [app/api/cron/flows/route.ts](app/api/cron/flows/route.ts) on Vercel cron `*/5 * * * *`, running each enabled `schedule` or `poll` flow whose interval elapsed (`isDue`: `now - lastRunAt >= scheduleMins*60000`; poll uses `pollState.lastPolledAt`). Minimum interval is 5 minutes (`MIN_SCHEDULE_MINS` in [lib/flow/model.ts](lib/flow/model.ts)).
- Dead-flow detection: NONE for flows. A separate connector-health cron exists ([app/api/cron/health/route.ts](app/api/cron/health/route.ts), every 6h) but it re-verifies CONNECTORS, not flow liveness. Heartbeats are net-new, and the cron sweep is the natural emit point.

### Q6. Error handling + GlitchTip attach points
- A thrown step is caught in `executeFlow` ([lib/flow/run.ts](lib/flow/run.ts)): `res = { ok: false, summary: e.message || "step crashed" }`, the step is marked `failed`, and the run halts unless `onError: "continue"` (which lands the run on `partial`). Failure text persists on `StepRun.summary`. `llm.ts` degrades silently to `null`.
- There is no error-tracking SDK anywhere in the repo.
- Clean GlitchTip attach points: (a) a shared server init module imported by the flow routes; (b) `fireFlow` in [lib/flow/runtime.ts](lib/flow/runtime.ts) to set flow-run context (flowId, runId, userId) and capture on terminal `failed`; (c) the failed-step branch inside `executeFlow` for per-step breadcrumbs. A user-visible "last error" can be derived from the latest `failed`/`partial` FlowRun's failed-step summary and rendered on [app/flows/[id]/FlowBuilder.tsx](app/flows/[id]/FlowBuilder.tsx) (the run History panel already exists).

### Q7. Licence hygiene
- **No n8n-derived code.** Every grep hit is a reference, not merged code: search-query strings in [lib/engine/research.ts](lib/engine/research.ts) (it SEARCHES for "n8n node" as a research method), the `community-node` ResearchKind in [lib/engine/types.ts](lib/engine/types.ts), a comment in [lib/engine/connector.ts](lib/engine/connector.ts), and prose in `ARCHITECTURE.md`, `NODEWORM_ROADMAP.md`, `NODEWORM_HANDOVER.md`, `AUTONOMY-ENHANCEMENTS.md`, and `deploy/signal-bridge-oracle/RUNBOOK.md`. `package.json` has no n8n or automation-platform dependency.
- **FLAG 1 (pre-existing, mission-relevant): Nango data is already fetched at runtime.** [lib/engine/intel/nango.ts](lib/engine/intel/nango.ts) fetches `raw.githubusercontent.com/NangoHQ/nango/master/packages/providers/providers.yaml` and parses it into OAuth endpoints, used by `fillNangoOAuth` in [lib/engine/orchestrate.ts](lib/engine/orchestrate.ts). This is Nango DATA already in production use, and the mission flags Nango's licence as UNVERIFIED. It is not a code merge, but it is "adopting Nango." The mission's primary-source method must be applied to Nango's LICENSE and to `providers.yaml`'s licensing before Phase 1 relies further on it. If it fails the MIT/Apache/BSD bar, replace `intel/nango.ts`'s data source with a self-maintained provider table behind the same `nangoLookup` seam.
- **FLAG 2: `ARCHITECTURE.md` is stale and conflicts with the decided substrate.** It proposes Cloudflare Workflows/Queues/Cron as the execution runtime. The mission's decided substrate is Fly Machines (Sydney) + Neon + Upstash Redis + Tigris, UI on Vercel. This plan follows the mission, not `ARCHITECTURE.md`.
- **No attribution page and no root LICENSE exist.** The `app/` tree has only `extension-privacy/page.tsx`. The ground rules require an OSS attribution page for adapted code, so Phase 1 adds one (`/oss`) and keeps upstream headers on every adapted file.

---

## Per-item decisions

### Item 1: Activepieces piece adapter (ranked highest, the transformative one)

**Adapter shape: vendor-and-transform a curated subset. Do NOT runtime-import `@activepieces/piece-*`.**
Reasons: (1) the npm packages pull the Activepieces piece FRAMEWORK (`@activepieces/pieces-framework`) with its Property system and execution context, which assumes their engine and their token refresh; importing that drags a foreign runtime into a closed product. (2) Their framework churns. (3) MIT permits adapting source with headers, and vendoring decouples us from their release cadence and, critically, from accidentally pulling either `ee` carve-out path. (4) NodeWorm has no node interface (Recon Q2), so we need our own thin piece runtime regardless; a vendored, transformed piece definition (auth plus typed props plus actions plus triggers as data plus small handler functions) fits our Flows step model better than their live objects.
Trade-off acknowledged: vendoring loses cheap upstream updates. Mitigated by a pinned import script plus a bump policy (below).
Reserve option: where an app has a clean OpenAPI spec, NodeWorm ALREADY generates actions (`collectSurfaceOps`), so some "pieces" are redundant. Prefer our own generation for spec-backed apps; reserve piece adaptation for apps with no clean spec or with rich triggers.

**Framework primitive mapping:**
| Activepieces primitive | NodeWorm equivalent | Work |
| --- | --- | --- |
| Property types (ShortText, Dropdown, Number, Checkbox, StaticDropdown, Array, Object) | Flow step inputs are freeform templated strings today | Small typed-prop to form-field shim in the builder |
| OAuth2 property | `oauth.ts` provider plus vault (Q3) | Map, plus add refresh (Phase 0.5) |
| Polling trigger | NodeWorm `poll` trigger with dedupe ([lib/flow/poll.ts](lib/flow/poll.ts)) | Good fit, thin binding |
| Webhook trigger | NodeWorm `webhook` trigger plus auto-registration ([lib/flow/hookreg.ts](lib/flow/hookreg.ts)) | Good fit, thin binding |
| Files | No equivalent | Defer (Tigris is the substrate later) |
| `context` (store, connections, propsValue) | Vault-backed connection, small per-run KV on `flow_runs`, step config | Provide a NodeWorm-shaped context object |

**Auth bridge: map, do not duplicate.** Reuse `oauth.ts` plus vault; a piece's OAuth2 config registers as or matches a curated provider (the popup/callback/vault already work for any discovered OAuth path). Prerequisite: token refresh (Phase 0.5).

**Versioning: pin to upstream commit SHAs.** Each vendored piece records `{ piece, upstreamSha, adaptedAt, license, sourcePath }` in `lib/pieces/MANIFEST.json`. Never track `main`. Bump on demand via the import script. Keep the upstream MIT header in each adapted file and list every piece on `/oss`.

**Spike piece: recommend HubSpot over Xero.** Xero sits on NodeWorm's gated-portal allowlist (registration/ToS friction baked into the honesty constraints), whereas HubSpot has clean OAuth, is already a curated `oauth.ts`/knowledge app, and has a well-formed community piece. If recon of `recovery/portal-resolve.ts` shows Xero is not gated, either works; HubSpot is the safer spike.

**Marginal cost of pieces 2..N:** the spike measures how much is one-time runtime versus per-piece transform, how many candidate pieces are pure OpenAPI wrappers (skip, use our generation), and how much Property-shim coverage a real piece needs. The 300-connector figure is a CEILING, not a promise. Realistic near-term target is a curated top 50. The spike produces the per-piece hour estimate that the 300 claim stands or falls on.

### Item 2: Durable Flows runtime
**Decision: build a minimal Postgres-backed run-state machine plus a queue. Do NOT adopt Trigger.dev or Temporal now.**
Reasons: (1) volume is low. (2) NodeWorm ALREADY persists per-step `FlowRun` state after every step (Q1), so most of the resume substrate exists. (3) The mission's bias is the smallest thing that survives a redeploy and supports retry/backoff and waits. (4) The substrate is Fly + Neon + Upstash + Tigris: a Fly worker plus an Upstash queue plus a `flow_runs` resume driver is far less surface than standing up Trigger.dev's own Postgres/Redis/workers as a new service and porting the executor onto its SDK.
Honest caveat: if flows grow long human-approval waits, high fan-out, and complex retry policies, revisit Trigger.dev (Apache-2.0, verified clean) as the managed option. The minimal machine is deliberately built at the `runtime.ts` seam so it can be swapped.

Minimal design: (1) `flow_runs` gains `cursor` (next step index or branch path), `resumeAt`, and `attempt`. (2) A durable trigger enqueues a job to Upstash Redis instead of executing inline. (3) A Fly Machine worker (Sydney) consumes the queue and calls `executeFlow` with a starting cursor; on crash the job is redelivered (at-least-once) and resumes from the persisted cursor. (4) Wait/delay steps persist `resumeAt` and re-enqueue with a delay. (5) The existing per-step retries and backoff stay. Vercel routes become thin enqueuers.

Migration: flow DEFINITIONS are unchanged; only the RUNNER changes. Keep the inline path behind `DURABLE_RUNTIME` so we run inline (today) or durable (worker) without touching any `Flow`. `executeFlow` already takes `onTransition` plus effects, so it is the natural resume seam; add a `startCursor` parameter.

### Item 3: Flow heartbeats (Uptime Kuma push). Small.
On a successful scheduled-flow run in `cron/flows`, POST a push ping to a per-flow `heartbeatUrl` (stored on the flow, server-only and redacted like the hook token). The separately stood-up Kuma instance alerts on a missed ping. Config per flow (a field plus a builder toggle). No new hosting.

### Item 4: GlitchTip. Small.
Add `@sentry/node` (GlitchTip is Sentry-SDK compatible) init in a shared server module gated on `GLITCHTIP_DSN`. In `fireFlow` set flow-run context and capture on terminal failure. Surface "last error" on `/flows/[id]` from the latest failed run (data already present). No model or provider names in captured context surfaced to users.

### Item 5: LiteLLM routing. Small to Medium.
Add `LLM_GATEWAY_URL` plus per-customer virtual-key resolution at the `llm.ts` choke point. When set, all AI-step calls route through LiteLLM. The Medium part: today `chatJson` returns `null` on any failure and the AI effect reports a generic message, so a spend-cap rejection (gateway 402/429) is indistinguishable from "all models failed." Change the AI effect to distinguish "gateway refused or cap hit" from "no model succeeded" so a cap becomes a VISIBLE flow-step error, not a silent stall. MIT core only; do not enable `enterprise/` features.

### Item 6: Email action via listmonk/SES. Future, not now.
There is NO email step today (`FlowStepType` has no email). It is roadmap-worthy (templates say "email me", but that would need a manually wired http step). Decision: note as future. Implement later as a first-class email step calling listmonk's HTTP API (AGPL boundary respected, API only) or SES, once the step is scoped. Not in this plan's build scope beyond this note.

---

## Phased plan (each phase is a shippable increment)

### Phase 0.5: OAuth token refresh (prerequisite). Effort: S/M.
New scope the original mission framing did not budget, surfaced by Recon Q3. Hard dependency for a CORRECT piece spike and for durable long-running flows.
- Add `grant_type: refresh_token` renewal in `oauth.ts` and a `getFreshTokens` wrapper on the vault path used by `effects.ts`.
- Acceptance: an expired access token with a stored refresh token auto-renews on a flow http step; TDD covers the refresh exchange and the "no refresh token, fail honestly" path; when no refresh token exists the step returns "reconnect X", never a silent 401 loop.

### Phase 1: Activepieces single-piece adapter (the spike). Effort: M/L.
Behind `PIECES_ENABLED`.
- Build the piece runtime (`lib/pieces/`): a piece-definition type (auth plus typed props plus actions plus triggers as data plus handlers), a `piece` flow step type, a Property to builder-field shim, catalog registration, and ONE vendored and transformed HubSpot piece (auth plus one trigger plus one action) with upstream MIT headers, a `/oss` attribution page, and `MANIFEST.json`.
- Acceptance: the HubSpot piece appears in the Gallery; a dev flow runs its trigger plus action against real HubSpot (or a recorded fixture in CI); tests are green; a provenance check confirms nothing from `packages/ee` or `packages/server/api/src/app/ee` was copied. Deliver the marginal-cost estimate for pieces 2..N.

### Phase 2: Durable minimal runtime. Effort: M.
Behind `DURABLE_RUNTIME`.
- `flow_runs` cursor/resume columns, Upstash enqueue, a Fly worker consumer, resume-from-cursor, and wait/delay support.
- Acceptance: a flow whose worker is killed mid-run resumes and completes exactly the remaining steps after redelivery; a `wait 10m` step survives a worker restart; the inline path is unchanged when the flag is off.

### Phase 3: Heartbeats + GlitchTip + last-error UI. Effort: S.
Bundle the two small ops items plus the last-error surface.
- Acceptance: a successful scheduled run emits a Kuma ping; a thrown step is captured in GlitchTip with flowId and runId; `/flows/[id]` shows the last error.

### Phase 4: LiteLLM gateway routing. Effort: S/M.
- Acceptance: with `LLM_GATEWAY_URL` set, AI steps route through the gateway; a simulated spend-cap 402 surfaces as a visible flow-step error, not a silent stall; unset leaves the cascade unchanged.

### Phase 5: Scale-up (future, not scheduled here).
Pieces 2..N scale-up gated on Phase 1's per-piece number, plus a first-class email step (listmonk/SES, API only). Gated on an explicit spec.

---

---

## Spike outcome (executed 2026-07-22)

**Nango licence check: FAILED the bar, dependency removed.** Primary source, method as prescribed: GitHub API gives default branch `master` and SPDX `NOASSERTION` ("Other"); the raw root LICENSE is **Elastic License 2.0**, applied uniformly with **no directory carve-out**; `packages/providers/providers.yaml` carries **no differing per-file marker**, so it is ELv2 too. ELv2 forbids offering the software as a hosted service, which is precisely NodeWorm's model, and it is not MIT/Apache/BSD. `lib/engine/intel/nango.ts` (which fetched that file at runtime) is **deleted** and replaced by `lib/engine/intel/providers.ts`: a self-maintained 38-provider registry authored from each vendor's own public OAuth docs, behind the same seam (`providerLookup`). `orchestrate.ts` updated; no behaviour change beyond provenance. Risk 3 is closed.

**Phase 0.5 (token refresh): DONE.** `refreshAccessToken` in `lib/engine/oauth.ts` does `grant_type: refresh_token`, preserving a non-rotated refresh token and failing honestly on `invalid_grant`. `lib/engine/refresh.ts` holds the pure `shouldRefresh` decision. `lib/flow/effects.ts` now retries a step ONCE through a renewed token on 401/403, and when renewal is impossible it says "reconnect it" rather than looping. Chose REACTIVE refresh over a stored `expires_at` so no vault schema migration was needed; proactive expiry-based refresh stays available later. 5 new tests.

**Phase 1 spike: DONE (adapter proven end to end).** `lib/pieces/` holds the data-first contract (`types.ts`), the pure adapters (`adapt.ts`), the registry (`registry.ts`, gated by `PIECES_ENABLED`), the licence guard (`provenance.test.ts`), and the adapted HubSpot piece (`hubspot.ts`) pinned to upstream `062907cc` with the MIT notice preserved. Verified live: with the flag off, HubSpot returns `source=none, actions=0`; with it on, `source=piece, apiBase=https://api.hubapi.com, actions=9` with genuine endpoints and body skeletons, and a flow step built from a piece action reaches the vault-auth boundary and fails honestly ("no stored token for HubSpot; reconnect it first"). `/oss` attribution page ships with the pinned commit table. **Not proven: a real authenticated HubSpot call**, which needs a HubSpot account connected via OAuth; that is a credential gap, not a code gap.

**Key design win:** because `pieceActions` emits the existing `FlowAction` shape, a piece needs **no new step type and no new picker**. It plugs into the action catalog route as a higher-priority source. Phase 1 came in well under the M/L estimate for that reason.

**Marginal cost of pieces 2..N (the number the 300 claim rests on):** the one-time runtime is now built, so per-piece cost is authoring a `PieceDefinition`. Auth is usually already in the provider registry; the real cost scales with **actions adapted, not pieces**. Upstream HubSpot ships 45 actions and 24 triggers; a useful curated subset was 9 actions in minutes. Estimate: **20 to 40 minutes per connector** for a curated 8 to 12 action surface, versus 2 to 3 hours to exhaust a large piece. **Honest revision to the 300 claim:** 300 connectors by hand is roughly 150 hours, which is not a sensible way to spend it. The data-first shape makes a **codegen path** (parse upstream piece source, emit a `PieceDefinition`) tractable, and that is the only route to 300. Recommendation: hand-curate a top 50 (about 25 to 30 hours), build codegen for the tail, and market the curated number rather than the ceiling.

## Phases 2 to 4 outcome (executed 2026-07-22)

**Phase 2 (durable runtime): DONE, with a deliberate substrate deviation.** The plan proposed Upstash plus a Fly worker. Recon showed per-step state was already persisted after every step, so the smallest thing that satisfies the acceptance criterion is a **cursor plus a resume sweep on the existing cron**, with no new infrastructure at all. That is what shipped: `flow_runs` now carries `cursor`, `resumeAt` and `attempt`; the trigger payload is persisted so a resumed run rebuilds its template context; `executeFlow` takes a `resume` option and continues from the cursor; a new `wait` step parks a run; `resumeDueRuns` in the flows cron picks up parked and orphaned runs (`DURABLE_RUNTIME=1`, `MAX_ATTEMPTS` 5, 10 minute stale threshold). Verified live: a flow parked at a wait (`status=waiting, cursor=2`, later steps not run), the sweep resumed the SAME run and executed only the remaining step to `ok`; a run forced to stale `running` was recovered on the next sweep (`attempt=2`). Upstash plus Fly remains the upgrade path if volume ever needs it; the seam is `runtime.ts`.

**Phase 3 (heartbeats, GlitchTip, last error): DONE.** Per-flow `heartbeatUrl` pinged after a successful scheduled or poll run, SSRF-guarded and never able to affect the run outcome (verified live: `pinged: true`). GlitchTip wired through `lib/flow/telemetry.ts` with a lazily imported Sentry SDK, fully inert without `GLITCHTIP_DSN`, sending flow id, run id, trigger, and the failing step name and reason, never outputs, credentials, or model and provider names. The pure `lastError` helper lives in `lib/flow/errors.ts` (kept out of the Node-only telemetry module so it is client-safe) and renders on the flow page (verified live).

**Phase 4 (LiteLLM): DONE.** `lib/engine/gateway.ts` routes every model call through `LLM_GATEWAY_URL` with a per-customer `LLM_GATEWAY_KEY` when both are set, and falls back to the direct provider cascade otherwise. A gateway spend cap (402 or 429) now raises `SpendCapError`, which stops the cascade and surfaces on the AI step as a real, visible failure instead of looking like "no model worked". AI step messages were also scrubbed of provider names to honour the no-model-disclosure rule.

**Not verified live (credential gaps, not code gaps):** GlitchTip capture needs a DSN, and gateway routing needs a running LiteLLM instance. Both are inert and unit-tested until those exist.

## Risk register (top 5)

1. **Activepieces `ee` carve-out contamination** (two paths, including the easy-to-miss `packages/server/api/src/app/ee`). Mitigation: the vendoring script copies ONLY `packages/pieces/community/<piece>`; a CI check greps adapted files for any `ee` provenance and records the upstream SHA plus per-piece licence in `MANIFEST.json`.
2. **Per-piece marginal cost too high, collapsing the 300-connector claim.** Mitigation: the spike measures it; prefer our own OpenAPI generation where a spec exists; commit publicly only to a curated top N and present 300 as a ceiling.
3. **Nango data licence unverified but already in runtime use** (Recon Q7 Flag 1). Mitigation: apply the mission's primary-source method to Nango before Phase 1; if it fails the bar, replace the `intel/nango.ts` data source with a self-maintained provider table behind the same `nangoLookup` seam.
4. **"Build-minimal" durability underestimated** (at-least-once semantics, step idempotency, poison jobs). Mitigation: scope Phase 2 to at-least-once with a documented non-idempotency caveat, and design the `runtime.ts` seam so Trigger.dev can replace it if the minimal machine strains.
5. **Token-refresh gap breaks long-running and durable flows and pieces silently.** Mitigation: Phase 0.5 goes first; fail honestly ("reconnect X") when no refresh token, never a silent retry loop.

---

## Explicitly NOT doing (with reasons)

- Not adopting n8n or Windmill code (Sustainable Use Licence, AGPL plus gated EE). API-call-only if ever.
- Not runtime-importing `@activepieces/piece-*` packages: drags their framework and engine into a closed product; vendor instead.
- Not redistributing the Activepieces Docker image: it ships compiled `ee` code.
- Not adopting Trigger.dev or Temporal now: a minimal Postgres plus queue machine fits current volume; the seam is kept to swap later.
- Not proposing Cloudflare Workflows (as `ARCHITECTURE.md` suggests): conflicts with the decided Fly, Neon, Upstash, Tigris substrate.
- Not building a first-class email step yet: no email step exists; future, listmonk/SES API only.
- Not touching flow definitions for durability: only the runner changes, behind a flag.
- Not showing model or provider names in the AI-step UI: house rule; LiteLLM stays server-side.
- Not enabling LiteLLM `enterprise/` features: MIT core only.
- Not continuing to rely on Nango data unchecked: gate it behind the primary-source licence check first.
