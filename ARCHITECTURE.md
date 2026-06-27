# NodeWorm - Architecture & System Design

Optimal full-stack plan to take NodeWorm from "planner" (what is built today) to
"autonomous executor" (the blueprint's real promise). **Prioritised for low cost
first, scalability second, vendor sprawl avoided.** The hard rule: every component
costs ~$0 at idle and scales to paid only when real usage justifies it. Nothing
here requires an always-on server.

## The cost principle that drives every choice

1. **Scale to zero or die.** No component may bill while idle. Serverless
   functions (pay-per-invoke), Neon (compute suspends), cron (fires on schedule
   only). No VMs, no always-on workers, no idle dynos.
2. **No egress tax.** Data leaving a cloud is the silent killer at scale. Keep
   storage and compute on the same provider; prefer zero-egress object storage.
3. **Memoise the expensive part.** The only real per-run costs are LLM tokens and
   browser-automation minutes. Both are cached or avoided: every discovery feeds
   the knowledge base, so repeat apps cost $0 of LLM.

## TL;DR recommendation

| Layer | Pick | Why (cost lens) |
| --- | --- | --- |
| UI + control-plane API | **Next.js 16 on Vercel** (CF Pages later) | Marginal $0 on the shared Pro account, best Next DX. CF Pages is the pure-$0, single-vendor endgame. |
| Data | **Neon Postgres** (project `abie`, free, scale-to-zero) | $0 idle, real Postgres, 10 projects/org, first-class Vercel driver. DONE in Phase 0. |
| Auth (when multi-tenant) | **Neon Auth (Stack Auth)** | Built into Neon, consolidates vendors, free tier, RLS-ready. Clerk free (10k MAU) is the fallback. |
| Secrets / credential vault | **Envelope encryption in Neon, decrypt only at egress** | Real tokens never sit in plaintext, and it costs $0 (no managed vault needed). |
| Agent execution runtime | **Cloudflare Workflows + Queues + Cron** | Durable, resumable 5-phase pipeline with zero idle cost. NOT Vercel functions (timeouts). Already a sanctioned vendor. |
| Browser-automation fallback | **Cloudflare Browser Rendering** | The Plaud-style "no API" path. Usage-billed, only fires when no API exists. |
| Custom MCP deploy target | **Cloudflare Workers** | The blueprint already deploys connectors here. Runtime colocates with the output, zero idle. |
| Models | **AI Gateway + tiered routing** | Free/cheap model first (Gemini Flash via OpenRouter free, or Haiku), escalate to Sonnet/Opus only on ambiguity. Gateway adds caching + fallbacks + zero-retention. |
| Hot cache / blobs | **CF KV** + **R2** (Tigris fallback) | Sub-ms config cache; zero-egress object storage. R2 is not enabled on the current CF account, so Tigris (already used) is the live fallback. |

**Vendors: Neon + Vercel + Cloudflare = 3, all already in your stack. No sprawl.**

The non-obvious move: NodeWorm already lives in Cloudflare-land because it *deploys
connectors to Workers*. So the entire agentic execution layer (durable pipeline,
queues, cron-polling, headless browser) goes on Cloudflare too. That is durable
execution + browser + deploy target on one vendor you already run, instead of
bolting on Inngest + Browserbase (two new vendors).

## Why the data-layer pick is Neon, not Supabase

Under an explicit low-cost priority the calculus flips from the house default:

- A **new dedicated Supabase project** is not the cheap move: Supabase free caps
  at 2 active projects and pauses after 7 days idle (bad for a low-traffic tool
  that would then need waking), and a dedicated project means Supabase Pro $25/mo.
- **Neon free** gives up to 10 projects per org (you have room: 6 used), real
  scale-to-zero ($0 when idle), a first-class Vercel serverless driver, and a
  clean path to paid Postgres. It is also already your sanctioned direction
  (Pathfare is mid-migration onto Neon for this exact cost reason).
- **Cloudflare D1** is even cheaper at scale and colocates with the execution
  layer, but D1-from-Vercel is REST, not a native binding. Revisit D1 only if the
  whole product later moves onto Workers.

What you give up vs Supabase: bundled Auth + Vault. Both are replaced at $0 by
Neon Auth + envelope encryption (below), so the bundle is not worth a new paid
project here.

## Target architecture

```
   Browser ─► Next.js UI (Vercel, or CF Pages for $0)
                   │ control-plane API (fast, low QPS)
                   ▼
              Neon Postgres (integrations, runs, audit, encrypted creds; scale-to-zero)
                   │ enqueue run
                   ▼
   ┌──────────────── Cloudflare (the execution layer) ────────────────┐
   │  Workflow: Scout → Architect → Wire → Auditor → Relay (durable)   │
   │    ├─ AI Gateway ─► tiered LLM (free model first, escalate)       │
   │    ├─ Queues       (fan-out: discover N apps / sync N entities)   │
   │    ├─ Cron Triggers (scheduled inbound: polling + entity mirror)  │
   │    ├─ Browser Rendering (no-API / Plaud fallback only)            │
   │    ├─ Workers       (host the generated custom MCPs; zero idle)   │
   │    └─ KV (hot cache)   R2/Tigris (artifacts, transcripts)         │
   └──────────────────────────────────────────────────────────────────┘
```

The five agents map one-to-one onto Cloudflare's durable primitives. NodeWorm is not
a server, it is a pay-per-use pipeline.

## The two hard parts (the DB is the easy part)

### 1. Credential vault

The crown jewel. NodeWorm connects only via OAuth, so the vault holds OAuth
refresh tokens (never API keys) and they are radioactive.

- **Never** store raw secret material in an app table. Postgres holds only a
  **reference + masked hint** (which the current demo already does honestly).
- **Envelope encryption:** per-secret data key encrypts the secret; a master key
  (in a Worker Secret, never the DB) encrypts the data key. Ciphertext sits in
  Neon. $0, no managed vault required.
- **Decrypt only at egress:** plaintext exists only inside the Cloudflare Worker
  at the instant it calls the third party. UI, control plane, and LLM never see it.
- Abstract behind a `VaultProvider` interface (`put`, `getForEgress`, `rotate`,
  `revoke`) so a managed vault can slot in later if a compliance contract demands.
- OAuth tokens get a refresh job (Cron) before expiry; rotation and revocation
  are first-class.

### 2. Durable agent runtime

Today `advance()` runs the five phases synchronously inside one request. Fine for
a planner. For real execution each phase can take minutes, fail, and need resume.

- Model each run as a **Cloudflare Workflow**: one durable step per phase. Steps
  get automatic retries, replay, and survive restarts at zero idle cost.
- **Queues** decouple webhook ingestion and fan-out from the request path.
- **Cron Triggers** drive polling / entity-mirror reconciliation per integration.
  This is the line item that would otherwise force an always-on server.
- **Browser Rendering** runs the headless fallback for no-API apps only.
- The control-plane API (Vercel) just enqueues and reads status. The UI already
  polls per-phase, so the swap is mostly backend.

Managed alternatives if you would rather buy DX (each is a NEW vendor): Inngest,
Trigger.dev, Temporal, Browserbase, Convex. Good tech; only reach for them if the
CF-native path proves painful, because they add vendors and cost.

## Data model sketch (Postgres)

```
orgs(id, name, created_at)
users                          -- Neon Auth (Stack Auth)
integrations(id, org_id, app_name, app_url, status, mode, created_at, updated_at, data jsonb)
runs(id, integration_id, phase_id, status, output jsonb, started_at, finished_at)
vault_refs(id, integration_id, name, masked_hint, ciphertext, created_at)
deployed_mcps(id, integration_id, target, url, transport, deployed_at)
webhook_events(id, integration_id, signature_ok, payload jsonb, received_at, processed_at)
mirror_records(id, integration_id, entity, external_id, local jsonb, synced_at)
```

Today's table is the JSONB-keyed `integrations` row. Multi-tenant is one `org_id`
column + index + Neon Auth RLS (`org_id = auth.org()`) when that day comes. The
`lib/store.ts` surface (`list/get/create/save/remove`) is the single seam.

## Cost model

**Idle:** ~$0. Neon suspends, Workers/Functions bill per invoke, cron fires only
on schedule, browser runs only for no-API apps.

| Per-run item | Driver | Mitigation | Typical |
| --- | --- | --- | --- |
| LLM discovery | 1 call for unknown apps | KB memoisation (repeat = $0), free model first | sub-cent, $0 for known apps |
| Web search | 2-4 queries | Serper/Brave free tiers | $0 within quota |
| Compute | a few Worker invokes | free tier covers thousands/day | ~$0 |
| Browser minutes | no-API apps only | hard "API exists?" gate | $0 unless Plaud-class |

**At scale:** the first real bill is **Workers Paid ($5/mo)** (unlocks Queues +
headroom) and **Neon paid** when storage/compute-hours exceed free. Both are
usage-proportional, not provisioned. Live multi-tenant floor: **$5-25/mo** until
material volume, then linear. The two knobs that matter: grow the knowledge base
(LLM cost trends to zero) and gate browser automation behind a no-API check.

## Phasing (cheapest first, each ships independently)

| Phase | Scope | New cost |
| --- | --- | --- |
| **0. Data layer** (DONE) | Neon Postgres behind the existing store seam, verified end-to-end | $0 |
| **1. Deploy** | Ship control plane to Vercel; `DATABASE_URL` in env (set via Bash `printf`, not PowerShell pipe, to avoid BOM) | $0 |
| **2. Real credentials** | OAuth capture + envelope-encrypted tokens in Neon; status genuinely reaches `connected` | $0 |
| **3. Execution layer** | Move `advance()` phases into a CF Workflow; Queues + Cron for scheduled sync | $5/mo |
| **4. Browser fallback** | CF Browser Rendering for no-API apps | usage |
| **5. Custom MCP factory** | Generate + deploy connectors to Workers (Architect's custom-mcp path) | usage |
| **6. Multi-tenant** | Neon Auth + `org_id` RLS + per-tenant vaults | $0 base |

## "Is Neon better?" - the verdict, updated for the cost constraint

**Under low-cost-plus-scalable: yes, for NodeWorm's data layer.** A new dedicated
Supabase project is the more expensive path (2-project free cap + idle-pause, or
$25/mo Pro). Neon free is scale-to-zero, generous on project count, and scales
cleanly. The only thing Supabase would have bundled (Auth + Vault) is replaced at
$0 by Neon Auth + envelope encryption. Pick Supabase only if you specifically
want that managed bundle and are willing to pay for a dedicated project.

## DB options and when each actually wins

| DB | Wins when | For NodeWorm |
| --- | --- | --- |
| **Neon** | Scale-to-zero Postgres, many free projects, Vercel-native driver, lowest idle cost. | **Pick.** Cost-optimal + scalable for the control plane. |
| **Supabase Postgres** | You want Postgres + Auth + Vault + Storage in one box and will pay for a dedicated project. | Skip under the cost constraint. |
| **Cloudflare D1** | All-CF product, small relational data, colocate with the execution layer + MCP deploys. | Revisit if the product fully moves onto Workers. |
| **Convex** | Agent state machine + scheduler + reactive DB as one system. | Elegant for the runtime, but a new vendor that replaces Postgres. |
| **Turso** | libSQL/SQLite at the edge, multi-cloud. | Same niche as D1, no CF colocation advantage. |
| **Mongo / Firestore** | Document model or mobile offline sync. | No. NodeWorm's data is relational. |

## Ledger row

```
NodeWorm | host: Vercel (shared, marginal $0) | db: Neon (own free project abie, patient-lake-55619624, us-east-1, scale-to-zero)
     | auth: Neon Auth (when multi-tenant) | runtime: Cloudflare Workflows/Queues/Cron/Browser Rendering
     | vault: envelope encryption in Neon, decrypt at egress
     | cap-to-watch: Neon free compute-hours + CF Workers daily limits
     | deviation: cost priority flips data layer Supabase -> Neon; durable runtime -> Cloudflare
```
