# NodeWorm: Autonomy + Research + Reverse-Engineering Enhancements

Grounded in the current engine (orchestrate.ts, phases.ts architect ladder, probe.ts, research.ts, recovery/*, hosted-connectors.ts, execute/*). Goal: make NodeWorm connect ANY app by SOME method with maximum automation, a flexible scored decision tree (not a rigid ladder), creative auto-research woven across the app, continuously-scraped connector intelligence, and deeper API reverse-engineering.

## Non-negotiable constraints (carry forward)
- **Architectural seam**: `phases.ts` stays PURE/deterministic (no node crypto, no network). All I/O (probe, research, codegen, crawl, tunnel) lives in server-only modules invoked by `orchestrate.ts` and attached to the Integration; phases.ts only READS attached evidence. Every new module follows this.
- **Honesty dictionary**: live (real API/OAuth) | managed-session (live browser, UI-fragile) | hosted-connector / connected-via-connector (verified by one real read) | researched (model-derived, "verify the link") | generated (built, NOT live until deployed) | needs-verification (token held, unproven). Never claim a tier you have not earned.
- **OAuth-only creds**, consent-gated for account-driving/messaging bridges, SSRF guard (resolve-and-pin, the `assertConnectorUrl`/`resolvePinnedTarget` pattern) on EVERY fetched URL, automation allowlists (tosForbidsAutomation, portalConsent), inert-until-keyed on every new capability.
- **LLM**: free-first cascade (`lib/engine/llm.ts`), no direct Anthropic, Gemini only via OpenRouter ([[feedback_no_gemini]]).
- Next.js here is the breaking-change build (see AGENTS.md): read `node_modules/next/dist/docs/` before writing route/runtime code.

## Current state (validate before extending)
- Pipeline Scout -> Architect -> Wire -> Auditor -> Relay, one phase per `advance()`.
- Discovery: knowledge base -> LLM -> heuristics, then `probe.ts` reverse-engineers live well-known surfaces and enriches.
- Decision tree (architect ladder, first-match-wins): R1 hosted-mcp > R2 oauth-api (genuine authorize+token) > R3 public-api > R4 hosted-connector > R5 researched-connector > R6 managed-session floor > R7 honest terminal.
- Pathfinder `research.ts`: ONE `chatJson` call, ranks web-client>rest-wrapper>cli>community-node>..., one bounded retry. URLs sanitized but NOT verified-reachable, and NOT web-grounded (pure model recall).
- Probe `probe.ts`: GET well-known (oauth-authorization-server, openid-configuration, ai-plugin.json, mcp.json) + surfaces (openapi/swagger/v3-api-docs, /v1/models, /mcp, /sse) across primary + api. subdomain, 3 origins. No GraphQL introspection, no JS-bundle scrape, no network capture.

## The six gaps and the enhancements

### 1. Grounded auto-research (kill LLM-recall, make it current + verified)
`research.ts` and `recovery/recipes.ts llmRecipe` recommend from model memory. They can name stale or wrong repos. Fix: a grounding pre-step.
- **Add `lib/engine/websearch.ts`** (server-only, inert-until-keyed): real search via Tavily `FREE` / Brave `FREE` / Serper (you already key Serper elsewhere) / Firecrawl `/search` (you have the skill). Query templates per app: `"<app> API documentation"`, `"<app> MCP server"`, `"<app> n8n node"`, `"<app> self-host REST bridge"`, `"<app> unofficial API"`.
- **Scrape top hits** with Firecrawl `/scrape` to extract real repo/docs URLs + a snippet, feed as grounding into the existing `chatJson` Pathfinder prompt so it cites real current sources, not memory.
- **Verify every recommended URL is reachable** (HEAD/GET, SSRF-guarded) before a method can be `best`. An unreachable repo drops out of ranking. This single check removes hallucinated-repo risk.
- Where: new `websearch.ts`; `research.ts` takes optional grounding; `orchestrate.discover/architect` passes it; phases.ts unchanged (still reads `it.research`).
- Honesty: grounded methods upgrade from "researched, verify the link" to "researched + reachable, verified <date>".

### 2. Connector-Intelligence corpus (the "scrape updated connector info" engine)
There is no continuously-refreshed index of what is connectable and how. Build one NodeWorm consults deterministically during discovery, before guessing.
- **New `connector_intel` table** (Neon) + `lib/engine/intel/` crawler, refreshed on a schedule (QStash/cron, free).
- **Sources to ingest** (each a small adapter):
  - **Nango `providers.yaml`** (github.com/NangoHQ/nango): a public machine-readable registry of 250+ OAuth providers WITH authorize_url / token_url / scopes. Ingesting this deterministically populates `oauthAuthorizeUrl/TokenUrl` for hundreds of apps, massively widening the R2 genuine-OAuth path with zero LLM and zero guessing. Highest-yield single source.
  - **APIs.guru** OpenAPI directory (4,000+ specs) + **public-apis** dataset: REST surface + base URLs.
  - **MCP registries**: official MCP registry (you have the `mcp-registry` connector), Smithery, Glama, mcp.so, PulseMCP, awesome-mcp-servers: maps app -> hosted/community MCP (feeds R1).
  - **Automation catalogs**: n8n nodes, Pipedream apps (has an API), Zapier/Make app lists, Composio (you have it) + your other connected unified-API integrations: maps app -> maintained community node (feeds R5/ipaas).
  - **apitracker.io** category scrape (the seed from the portfolio doc).
- Discovery flow becomes: knowledge base -> **connector_intel exact/fuzzy match** -> LLM -> heuristics, then probe. So an unknown app with a Nango entry or a Smithery MCP resolves deterministically instead of via model guess.
- Honesty: corpus rows carry source + last_seen; a stale row is re-verified by the probe before it is claimed live.

### 3. Deeper reverse-engineering (probe + consented network capture)
`probe.ts` only reads standard discovery docs. Add real RE for "when required":
- **GraphQL introspection**: when apiType graphql or `/graphql` answers, POST the `__schema` introspection query, extract types/queries/mutations as entities + tools. (phases.ts already branches on graphql; give it live schema.)
- **JS-bundle endpoint extraction**: fetch the app homepage, parse `<script src>` bundles, regex for API base URLs, `fetch("/api/...")`, GraphQL operation names. Surfaces private/undocumented APIs no well-known doc advertises.
- **More probe paths**: `/.well-known/apple-app-site-association` + `/.well-known/assetlinks.json` (reveal the mobile API host), `/api`, `/api/v1`, `/api/docs`, `/graphql`, `/postman.json`, `/.well-known/security.txt`.
- **Network-capture RE during the managed session (the big one)**: while the consented Browserbase session is open and the user is logged in, record XHR/fetch traffic (CDP Network domain) to map the app's REAL private API with its real auth. Feed captured calls to the architect to synthesize a connector. Turns the managed session from "drive the UI" into "learn the private API, then call it directly", far more robust than UI scraping. Consent-gated, read-only capture, redact tokens from anything surfaced.
- Where: extend `probe.ts` (introspection + bundle + paths, all GET/POST-introspection only, SSRF-guarded); new capture mode in `cobrowse.ts`; new evidence fields on `ProbeEvidence`/Discovery; phases.ts reads them.

### 4. Flexible scored decision tree (replace first-match ladder)
`architect()` is a fixed if/else cascade. Make it a candidate tournament with self-repair.
- **Build a Candidate[] of ALL feasible ConnectMethods**, each scored on confidence x reliability x automation-level x setup-effort x ToS-risk. The current ladder order becomes the default tiebreak, but a high-confidence reachable researched MCP can outrank a fragile managed session. Keep the full ranked list as fallbacks on the Integration.
- **Self-repair loop in orchestrate**: if the chosen method fails downstream (probe's OpenAPI 404s on a real call, managed-session verify fails, connector unreachable), automatically advance to the next-ranked candidate instead of stopping. Generalizes the existing single bounded re-research into a repair ladder.
- **Parallelize discovery**: run probe + grounded research + connector_intel lookup concurrently in scout (they are independent) so the architect chooses from a full candidate set in one pass, not sequentially.
- Where: refactor `architect()` to emit `Candidate[]` + chosen; `orchestrate.advance` gains the repair step; `types.ts` adds `Candidate`/`MethodScore`.

### 5. New ConnectMethods (cover the user's full list: tunnel, generated, ipaas)
The enum already has `generated-mcp`/`generated-scraper`/`export-import` but `architect()` never selects them. Wire them + add new ones:
- **`tunnel`**: expose a self-hosted/localhost connector (the unsolved signal-cli `localhost:8080` gap) via a managed tunnel. The agentic execution host runs a digest-pinned `cloudflared tunnel` (or Tailscale Funnel) recipe, yielding a public https URL NodeWorm verifies with one real GET. Closes the "needs a tunnel or VPS" caveat and makes self-hosted connectors work from anywhere. Matches the literal "tunnel" ask.
- **`generated-mcp` / `generated-scraper` (P4 build sub-workflow)**: when only an OpenAPI spec (from probe) or captured network calls (from RE) exist, auto-GENERATE a connector (openapi-to-MCP codegen for specs; a typed scraper from captured XHR) and stand it up via agentic execution / hosted compute. Status `generated` until a real read flips it live. The "absolute automation for any app" endgame.
- **`ipaas-handoff`**: when connector_intel shows a maintained n8n/Make/Pipedream/Composio node, offer a one-click handoff to that platform rather than building. Pragmatic fallback that always works for catalog apps.
- **`mcp-gateway`**: for apps already exposing an MCP (R1), proxy through a single gateway so many MCPs share one auth/observability surface.

### 6. "What's possible" research surface (auto-research across the webapp)
Expose the corpus + grounded research as a browsable/searchable UI, not just a per-run result.
- A `/explore` surface backed by `connector_intel`: search any app, see every known path (MCP, OAuth via Nango, n8n node, REST spec, researched connector) with freshness, before starting a run.
- On-demand deep-research button for niche apps: fires the grounded research + a bounded multi-source crawl and caches the result into the corpus, so the next user gets it instantly.

## Prioritized build order
1. **Grounded research + URL verification** (#1): biggest correctness win, reuses the LLM cascade, inert-until-keyed on a free search key. Makes the existing Pathfinder trustworthy and current.
2. **Nango providers.yaml ingest** (slice of #2): one adapter, deterministically lights up genuine OAuth for hundreds of apps. Highest yield for least code.
3. **Deeper probe: GraphQL introspection + JS-bundle + extra paths** (#3 part 1): pure extension of probe.ts, no new consent surface.
4. **Scored candidate tree + self-repair** (#4): converts the rigid ladder into flexible fallbacks; unlocks graceful degradation.
5. **Tunnel method via agentic execution** (#5): closes the known localhost gap, small + concrete.
6. **Network-capture RE in the managed session** (#3 part 2): high-fidelity private-API discovery, consent-gated.
7. **Generated-connector sub-workflow** (#5): the auto-build endgame.
8. **Connector-intel crawler + /explore surface** (#2, #6): the continuous freshness + browse layer.

## Guardrails restated for the new surfaces
- Web search / scrape / crawl: SSRF-guarded fetches, rate-limited, cached, inert-until-keyed. Never fetch private IPs.
- Network capture: consent-gated, read-only, tokens redacted from anything stored or surfaced.
- Generated connectors: status `generated` (NOT live) until a real read; allowlisted codegen templates only, never free-form shell (mirror the execute/recipes.ts allowlist + Ed25519-signed-plan model).
- Tunnel: digest-pinned recipe, runs only via the signed-plan agentic host, audit-logged.
- Corpus rows: source-attributed + last_seen; re-verified by probe before any live claim.
