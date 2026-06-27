# NodeWorm

**Autonomous Bidirectional Integration Engine.** Name an app, a five-agent swarm
figures out how to connect to it: scouts the API, picks a connection path, designs
two-way sync, audits the result, and hands you the single action left to take.

This is the full-stack webapp build of the NodeWorm blueprint (`integration autonomous
build blueprint.pdf`).

## The pipeline

Each integration runs through five agents:

1. **Scout** (Discovery) - reverse-engineers the live target. On top of the curated
   knowledge base it probes the real host for `.well-known` OAuth/OIDC metadata,
   OpenAPI/Swagger specs, MCP manifests/endpoints, AI-plugin manifests and
   OpenAI-compatible APIs, then maps public-API availability, auth type, hosted-MCP
   availability, webhooks and entities from what it actually finds.
2. **Architect** (Credentials) - walks the decision tree and picks the path:
   hosted MCP, a custom MCP build, or a browser-automation fallback. Auth is
   **always OAuth, never an API key**: produces the consent steps and minimum scopes.
3. **Wire** (Sync) - registers outbound tools and chooses the inbound method
   (webhooks, polling, or entity mirroring), with an entity field map. Marks bidirectional.
4. **Auditor** (Verify) - a readiness audit plus the live test plan: what the engine
   can verify now vs what runs once your credentials are connected.
5. **Relay** (Handoff) - the report: capabilities unlocked, warnings, and the next
   steps (the OAuth consent the user still needs to grant).

The decision tree, agent roles, and real-world cases (Stripe, Notion, TickTick,
Plaud, GitHub) all come straight from the blueprint.

## How real is it

The engine is real and deterministic. It runs with **zero keys** on a curated
knowledge base (`lib/engine/knowledge.ts`) plus heuristics for unknown apps
(`lib/engine/heuristics.ts`). The decision tree lives in `lib/engine/phases.ts`.

It also **reverse-engineers the live target** (`lib/engine/probe.ts`): a safe,
GET-only reconnaissance pass that fetches the host's public discovery documents
and infers the real surface from them. It reads RFC 8414 / OpenID Connect metadata
for genuine `authorization_endpoint` / `token_endpoint` / scopes, OpenAPI &
Swagger specs (path count, webhooks, security schemes, entities), `.well-known`
MCP manifests and live SSE/Streamable-HTTP MCP endpoints, `ai-plugin.json`
manifests, and OpenAI-compatible APIs. Discovered OAuth endpoints flow straight
into the genuine consent flow, so an app that is **not** in the registry can still
be wired for real OAuth from its own published metadata - pending only the
operator's client creds. Every probe records the exact URL + HTTP status, nothing
is fabricated, and a target with no machine-readable surface degrades honestly to
the knowledge base / heuristics rather than guessing. Set `NODEWORM_PROBE=0` to
disable.

Connecting an app runs a **genuine OAuth 2.0 Authorization Code flow** (PKCE where
supported): a real authorize redirect, a real consent screen, and a real token
exchange (`lib/engine/oauth.ts`, `app/api/integrations/[id]/oauth/*`). NodeWorm
captures the returned access and refresh tokens and stores them as a **masked
reference only** - the raw token is never persisted or returned to the browser. The
per-app OAuth client ID/secret live in server env (`OAUTH_<APP>_CLIENT_ID` /
`_CLIENT_SECRET`); when they are absent the connect button honestly reports the app
as unconfigured instead of faking a token. **NodeWorm never asks for an API key**: if
an app has no genuine OAuth path, the run is reported as blocked rather than routed
through a key.

It still does **not** register the OAuth app for you or deploy the planned MCPs -
those are the operator's one-time setup, so NodeWorm plans and reports them instead.

### Live LLM discovery (optional)

Set `GROQ_API_KEY` and/or `OPENROUTER_API_KEY` and unknown apps upgrade from
heuristics to live model research (`lib/engine/llm.ts`). Models are tried
cheapest-capable-first: Groq's free tier, then OpenRouter free models, then
OpenRouter low-cost and cost-efficient paid models as the natural fallback. No
direct Anthropic key - everything routes through Groq / OpenRouter (both
OpenAI-compatible). Override the whole cascade with `LLM_CASCADE` (comma list of
`provider:model`, e.g. `groq:llama-3.3-70b-versatile,openrouter:openai/gpt-4o-mini`).
Known apps still use the knowledge base. With no key the top bar shows "Heuristic
mode"; with a key it shows "AI scout".

## Run it

```bash
npm install
npm run dev      # http://localhost:3000
```

```bash
npm run build && npm start
```

## Stack

- Next.js 16 (App Router) + React 19 + Tailwind v4
- Fonts: Bricolage Grotesque (display), Hanken Grotesk (body), JetBrains Mono (telemetry)
- Storage: **Neon Postgres** when `DATABASE_URL` is set (scale-to-zero, $0 idle),
  otherwise a file-backed JSON store so the app still runs with zero config. The
  function surface (`list/get/create/save/remove`) is the only seam. See
  [ARCHITECTURE.md](ARCHITECTURE.md) for the full cost-optimised plan.

## API

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/integrations` | GET / POST | list / create (kicks off a run) |
| `/api/integrations/[id]` | GET / DELETE | fetch / remove |
| `/api/integrations/[id]/advance` | POST | run the next pipeline phase |
| `/api/integrations/[id]/oauth/start` | GET | begin the genuine OAuth flow (PKCE + state, redirect to consent) |
| `/api/integrations/[id]/oauth/callback` | GET | exchange the auth code for tokens, store masked |
| `/api/health` | GET | mode (ai/heuristic), known-app count, status tallies |

## Deploy

Deploys to Vercel as-is. Set `DATABASE_URL` (Neon, already provisioned) and
optionally `GROQ_API_KEY` / `OPENROUTER_API_KEY` for live discovery. Set env
values via Bash `printf '%s' | vercel env add` rather than a PowerShell pipe,
which prepends a BOM and breaks the value.
