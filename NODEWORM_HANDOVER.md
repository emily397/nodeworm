# NodeWorm - Handover / Framework Outline

_Last updated: 2026-07-11 · commit `e4442af` · 76 tests green · live at https://abie-three.vercel.app_

## What NodeWorm is
A user types a plain-language request ("connect Notion to Slack", or just "Stripe") and NodeWorm **autonomously finds the best way to connect that app and builds the connector** (hosted MCP, OAuth API, generated MCP/scraper, managed browser session, hosted bridge, or a self-hosted connector). The user does nothing but type and click OAuth popups. North-star: works for ANY app, even undocumented ones, with honest "here is the one human step" seams (never fake "connected").

- **Stack:** Next.js 16 (App Router, Turbopack), TypeScript, Neon (serverless Postgres) with a file-store fallback, Vercel deploy. Repo `emily397/nodeworm`, dir `C:\Users\emily\abie`, prod alias `abie-three.vercel.app`.
- **Deploy:** `git push origin main` then `npx vercel deploy --prod --yes` (auto-aliases to abie-three). Build gate: `npx tsc --noEmit` + `npm run build` + `npx vitest run` (all must be green).
- **Test runner:** vitest (`npm test`). 13 test files, 76 tests, pure-unit/characterization. No production edit ships without green.

## The engine pipeline (lib/engine/phases.ts, pure functions)
`scout -> architect -> wire -> auditor -> relay(report)`. Orchestrated by `lib/engine/orchestrate.ts` (`advance()` runs one phase per call; `recompute()` re-derives report; `repair()` walks the fallback ladder).

1. **scout(input)** -> `Discovery`. Knowledge base (`knowledge.ts`) for known apps, else `heuristics.ts`. Enriched live by `probe.ts` (reverse-engineers real endpoints), `research.ts` (LLM finds connectors), `intel/nango.ts` + `intel/mcp-registry.ts` (registries), `intel/apisguru.ts` (OpenAPI directory).
2. **architect(d, research, opts)** -> `ArchitectPlan`. Picks `connectMethod` down a fallback ladder: `hosted-mcp` -> `oauth-api` -> `public-api` -> `hosted-connector` -> `researched-connector` -> `managed-session` -> `generated-mcp` / `generated-scraper`. Always OAuth, never a raw API key.
3. **wire(d, plan)** -> `WireConfig` (outbound tools + inbound method: webhooks/polling/entity-mirror).
4. **auditor** -> `AuditResult` (defers live checks until credentials exist; never fails a viable path).
5. **report** -> `Report` (status, headline, capabilities, next steps). Statuses: `needs-credentials | connected | connected-via-session | connected-via-connector | generated | planned | blocked`.

**Discovery cache** (`cache.ts`, `TtlCache`): `orchestrate.discover()` memoizes per app+url, 15-min TTL. Repeat scouts ~4x faster and cost-free (skips probe/LLM/registry).

## Marquee capability: generate a real connector for ANY app
`lib/engine/generate.ts` `generateBundle(d, w, ops, gqlFields, apiBaseOverride, authHeader)` emits a **compilable typed TS project** (package.json, tsconfig, src/index.ts, README, .gitignore):
- **MCP** (has API): `api_request` escape hatch + `graphql_query` (if GraphQL probed) + typed per-operation tools + typed per-GraphQL-field tools. stdio + stateless-HTTP transports + `/health`.
- **Scraper** (no API): Playwright open_page/read_page/click/fill tools.
- Tools carry **typed body/query params** synthesized from real observed payloads.
- Connector **self-authenticates**: bakes the observed auth-header NAME (authorization / x-api-key / etc) as its default `AUTH_HEADER`.

**Sources of endpoints (highest signal first):** captured HAR/traffic -> app's own OpenAPI (probe) -> APIs.guru directory -> GraphQL introspection.

### Reverse-engineering loop (the big one)
- `har.ts` `parseHar(harText)` -> `{apiBase, ops}`: filters JSON XHR/fetch (drops html/assets), templatizes ids/uuids to `{id}`, dedups, extracts bodyKeys + queryKeys.
- `capture.ts` `normalizeCapture(input)`: ONE ingestion contract for any collector (CDP session log, Helper extension log, HAR export), reuses parseHar, also surfaces `authHeader`.
- `cobrowse.captureTraffic(connectUrl)`: attaches to the live CDP browser during the managed session and records real JSON XHR/fetch (method/url/status/mime/body + auth header NAMES only). **Inert-until-keyed** (needs BROWSERBASE_API_KEY).
- Route `POST /api/integrations/[id]/session/capture` runs it, persists `it.capturedRequests`; `POST .../generate` reads HAR / capturedRequests / `it.capturedRequests` and rebuilds a typed MCP even for apps with no public API. **Proven E2E:** captured traffic -> `specSource=har` -> typed MCP with real endpoints + typed body + correct auth header.

## Execution + deployment of generated connectors (lib/engine/execute/*)
- **Ed25519 signed plans** (`sign.ts`): the cloud only assembles allowlisted recipe tasks and signs them; the Agent verifies before running. `execute/pubkey` exposes the key.
- **npm-run allowlist** (`npm-run.ts`, TDD): the Agent may only run `npm install --ignore-scripts` / `npm run build` / `npm start` / `node dist/index.js`; rejects shell metacharacters. Route `POST .../build` issues a signed build plan (`buildSignedBuildPlan`, path-traversal-guarded).
- **Tunnel** (`cloudflared.ts` pinned win/linux binaries + SHA256; agent mirrors): `POST .../tunnel` opens a hash-verified cloudflared quick tunnel so a localhost connector is cloud-reachable; the cloud re-verifies with its own SSRF-guarded GET before claiming reachable.
- **Bundle storage** (`bundle-store.ts`): large generated bundles gzip-packed on the record, hydrated in `redactIntegration` + generate GET.
- **NodeWorm Agent**: `public/agent/nodeworm-agent.js` (native-messaging host / WS). Handles signed plans, npm-run, tunnel-start, Signal recipe. `AgentExecutionModal.tsx` drives it.

## Auth / OAuth / vault
- **Universal OAuth popup:** `oauth-popup.ts` + `?popup=1` on `oauth/start` + `oauth/callback` post a pinned-origin message and self-close; works for ANY discovered OAuth path (curated `oauth.ts` providers + Nango/probe-discovered endpoints). ~18 curated providers.
- **Recovery ladder** (`recovery/resolve.ts`, `dcr.ts`, `portal-resolve.ts`): env -> encrypted vault -> dynamic client registration (RFC 7591) -> guided portal (AI browser agent registers the OAuth app for the user) -> honest block.
- **Vault:** `vault.ts` + `vault-crypto.ts`, per-user scoped, PIN-gated (`auth/pin`), app-level client cache so the 2nd user of an app skips registration.
- **Managed session / co-browse** (`cobrowse.ts`, `browseruse.ts`): Browserbase/Steel hosted browser over CDP; user logs in once, NodeWorm holds the session. Inert-until-keyed.
- **Hosted connector** (`hosted-connectors.ts`): NodeWorm runs a bridge (e.g. Signal); user scans one QR. Inert-until-keyed.

## Security posture (all preserved, do not regress)
Multi-tenant IDOR fixed (`getOwnedIntegration` across `[id]/**` incl. oauth start/callback). WS agent replay-protected. Signed Ed25519 plans. SSRF guards on connector verify + DCR. Consent-gated hosted/managed paths. Per-user vault scoping. Inert-until-keyed everywhere. No direct Anthropic/Gemini keys (LLM via `llm.ts` free-first cascade). House style: NO em/en-dashes, terse comments only where the why is non-obvious.

## Frontend (vibrant, motion-rich; Make/Zapier/Base44 energy)
- `app/globals.css`: warm parchment base + **animated aurora** (saturated drifting blobs, GPU-composited), vibrant palette (amber/berry/aqua + signature gradients), `.gradient-text`, gradient+glow `.btn-signal`, `.card`/`.card-pop` glows, phase-rail flow animation. All `prefers-reduced-motion` safe.
- Pages: `app/page.tsx` (hero + 5-agent rainbow pipeline + decision tree + gallery teaser), `app/gallery/*` (nodes + worms + go-fish + composer; `lib/catalog.ts` saturated category colors), `app/run/[id]/SwarmConsole.tsx` (the executing pipeline, flowing rail, report panel, all the connect cards incl. GeneratedConnectorCard).
- **CLAUDE.md rule:** invoke `frontend-design` skill before any UI work. Verify visuals via computed styles + production-CSS grep (preview screenshots TIME OUT on the continuous aurora, a known quirk not a bug; Tailwind v4 dev cache lies, always check `.next/static/chunks/*.css`).

## Recently shipped this arc (all TDD, prod-verified)
HAR to typed MCP · typed params from observed payloads · discovery cache (4x) · auto-capture from managed session (CDP) · captured connectors self-authenticate · vibrant UI overhaul (aurora, gradients, rainbow pipeline, saturated gallery).

## Honest open items / next moves
- **keys: VERIFIED LIVE IN PROD 2026-07-11** (this section was stale; keys landed Jun 24). Managed session live via Steel, capture live (CDP attach proven), `EXECUTE_SIGNING_KEY` set (pubkey route serves Ed25519), LLM discovery on (`/api/health` mode ai). One anomaly: `BROWSERBASE_API_KEY` is set but sessions fall back to Steel, so the Browserbase key is out of minutes or invalid; Steel carries the load.
- **model-buildable next:** run-console UI button for "capture + build automatically" (wire `/session/capture` -> `/generate` in GeneratedConnectorCard, needs frontend-design skill); persist generated bundles + discovery cache to Neon (survive serverless cold starts); Linux/macOS cloudflared for the tunnel on non-Windows agents (darwin still returns null, ships as .tgz, extraction unhandled).
- **needs-decision (documented, untouched):** agent docker argv is an RCE primitive (needs digest-pinning); WS origin-gate is spoofable by non-browser clients; Signal bridge is one shared account.
- **known perf item (deferred, risky):** SwarmConsole advance loop replaces the whole integration object each tick, so done phases re-render. Needs a careful state-update refactor with its own tests.

## How to work here (from CLAUDE.md + this session's norms)
TDD everything (red -> green -> refactor; watch it fail first). Token-efficient/caveman. Verify every capability with a REAL invocation, not a description. Keep tsc + build + vitest green each batch. Commit messages end with the Claude co-author line. Push+deploy only when asked. Prefer editing existing files. Prove backend E2E against local (port 3011 via preview) or prod with curl.
