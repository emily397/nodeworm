// Drives an integration through one phase of the pipeline at a time.
// The UI calls advance() five times to watch the swarm come online.

import { lookup } from "./knowledge";
import { heuristicDiscovery } from "./heuristics";
import { isLlmEnabled, llmDiscovery } from "./llm";
import { enrichWithProbe, probeEnabled, probeTarget, seedUrls } from "./probe";
import { researchMethods } from "./research";
import { hostedConnectorAvailableFor } from "./hosted-connectors";
import { nangoLookup } from "./intel/nango";
import { hostedMcpForApp } from "./intel/mcp-registry";
import { scout, architect, wire, auditor, report } from "./phases";
import type { Discovery, Integration } from "./types";

// True exactly when the deterministic architect ladder would fall to the managed-
// session floor (no hosted MCP, and no public API path NodeWorm can call). Only
// then is the Pathfinder worth running: an API/OAuth/MCP app already has a method.
function noDirectPath(d: Discovery): boolean {
  if (d.hasHostedMcp) return false;
  const genuineOAuth = Boolean(d.oauthAuthorizeUrl && d.oauthTokenUrl);
  if (d.hasPublicApi && (d.authType === "none" || genuineOAuth)) return false;
  return true;
}

async function baseDiscovery(name: string, url?: string): Promise<Discovery> {
  // Known apps: the curated knowledge base wins (fast + accurate), keyed by name.
  if (lookup(name)) return scout(name);
  // Unknown apps: live LLM research if keyed, else heuristics. A supplied URL
  // disambiguates same-named apps and grounds the research, so it is passed along.
  if (isLlmEnabled()) {
    const d = await llmDiscovery(url ? `${name} (${url})` : name);
    if (d) return d;
  }
  return heuristicDiscovery(url ?? name);
}

async function discover(name: string, url?: string): Promise<Discovery> {
  const base = await baseDiscovery(name, url);
  if (url && !base.appUrl) base.appUrl = url;
  // Reverse-engineer the live target and layer real endpoints onto the base.
  const probe = probeEnabled() ? await probeTarget(seedUrls(base, url ?? name)) : null;
  const d = probe ? enrichWithProbe(base, probe) : base;
  await fillNangoOAuth(d, name);
  // Resolve the app's OFFICIAL hosted MCP from the registry (Notion/Stripe/Linear
  // etc.). Surfaced as the preferred zero-setup, Claude-native recommendation; it
  // does NOT change connect routing (a registry hiccup just yields no recommendation).
  d.hostedMcp = await hostedMcpForApp(d.appName).catch(() => undefined);
  if (d.hostedMcp) {
    d.telemetry = [
      ...d.telemetry,
      { level: "ok", text: `Official hosted MCP found: ${d.hostedMcp.name} (${d.hostedMcp.url}) - zero-setup, Claude-native.` },
    ];
  }
  return d;
}

// Deterministic OAuth from the Nango registry. If neither the knowledge base nor the
// live probe produced a genuine OAuth path (and no MCP wins), consult the registry of
// ~200 real providers before the engine falls to the managed-session floor. Real
// curated endpoints, so routing to genuine OAuth is honest; the recovery resolver
// then acquires the client creds (env -> vault -> DCR -> guided/automated portal).
async function fillNangoOAuth(d: Discovery, name: string): Promise<void> {
  if (d.hasHostedMcp) return;
  // The live probe (real published metadata) and our own knowledge base are
  // authoritative; never override them. But OAuth URLs that came from the LLM or
  // heuristics are model-recall and can be wrong, so the Nango registry (a curated,
  // maintained source of truth) PREFERS over them: it fills when absent AND corrects
  // a recalled guess when present.
  const fromProbe = Boolean(d.probe?.oauthAuthorizeUrl && d.probe?.oauthTokenUrl);
  const kb = lookup(name);
  const fromKb = Boolean(kb?.oauthAuthorizeUrl && kb?.oauthTokenUrl);
  if (fromProbe || fromKb) return;

  const ng = await nangoLookup(name).catch(() => undefined);
  if (!ng) return;
  const correcting = Boolean(d.oauthAuthorizeUrl) && d.oauthAuthorizeUrl !== ng.authorizeUrl;

  d.oauthAuthorizeUrl = ng.authorizeUrl;
  d.oauthTokenUrl = ng.tokenUrl;
  if (ng.scopeSeparator) d.oauthScopeSep = ng.scopeSeparator;
  if (ng.scopes?.length && !d.oauthScopes?.length) d.oauthScopes = ng.scopes.slice(0, 8);
  d.hasPublicApi = true;
  if (d.apiType === "none" || d.apiType === "unknown") d.apiType = "rest";
  d.authType = "oauth2";
  d.confidence = Math.max(d.confidence, 0.9);
  d.notes = [
    ...d.notes,
    correcting
      ? `OAuth endpoints corrected to the Nango provider registry (${ng.provider}) over a model-recalled guess.`
      : `OAuth endpoints resolved from the Nango provider registry (${ng.provider}).`,
  ];
  let host = ng.authorizeUrl;
  try {
    host = new URL(ng.authorizeUrl).host;
  } catch {
    /* keep raw */
  }
  d.telemetry = [...d.telemetry, { level: "ok", text: `Nango registry: genuine OAuth for ${ng.displayName} (${host}).` }];
}

// A connection exists once OAuth tokens are held OR a managed browser session has
// been verified with one real read. Both auditor and report key off this.
function connectedNow(it: Integration): boolean {
  return it.secrets.length > 0 || Boolean(it.managedSession?.verified) || Boolean(it.connector?.verified);
}

export async function advance(it: Integration): Promise<Integration> {
  const now = Date.now();
  const idx = it.currentPhase;
  if (idx >= it.phases.length) return it;

  const phase = it.phases[idx];
  phase.startedAt = phase.startedAt ?? now;

  switch (phase.id) {
    case "scout": {
      const d = await discover(it.appName, it.appUrl);
      it.discovery = d;
      it.mode = d.source === "llm" ? "ai" : "heuristic";
      break;
    }
    case "architect": {
      if (it.discovery) {
        // No direct API/OAuth/MCP path? Run the Pathfinder to find a real method
        // (self-host wrapper, community node, CLI) before falling to the floor.
        if (noDirectPath(it.discovery) && !it.research) {
          let research = await researchMethods(it.discovery);
          // Self-adapt: if the first pass found no strong method, try once more,
          // telling the model the easy paths failed so it digs for ANY real
          // connector. Bounded to a single retry to keep cost in check.
          if ((!research || !research.best) && isLlmEnabled()) {
            const deeper: Discovery = {
              ...it.discovery,
              notes: [
                ...it.discovery.notes,
                "A first research pass found no strong connector. Dig deeper: any self-hostable bridge/wrapper, community node, documented unofficial API, or export/import path is acceptable. Return the most reliable one.",
              ],
            };
            const retry = await researchMethods(deeper);
            research = retry?.best ? retry : (research ?? retry);
          }
          if (research) it.research = research;
        }
        // If the Pathfinder found the app's own web client, that IS the login screen
        // the managed session should open, so carry it as the discovery's loginUrl.
        const webClient = it.research?.best;
        if (it.discovery && !it.discovery.loginUrl && webClient?.kind === "web-client" && webClient.url) {
          it.discovery.loginUrl = webClient.url;
        }
        // When NodeWorm hosts a connector for this app (e.g. a Signal bridge keyed
        // via SIGNAL_BRIDGE_URL), the architect prefers it over a self-hosted one so
        // the user only links once instead of standing up their own wrapper.
        const hostedConnector = hostedConnectorAvailableFor(it.appName);
        it.plan = architect(it.discovery, it.research, { hostedConnector });
      }
      break;
    }
    case "wire": {
      if (it.discovery && it.plan) it.wire = wire(it.discovery, it.plan);
      break;
    }
    case "auditor": {
      if (it.discovery && it.plan && it.wire) {
        it.audit = auditor(it.discovery, it.plan, it.wire, connectedNow(it));
      }
      break;
    }
    case "present": {
      if (it.discovery && it.plan && it.wire && it.audit) {
        it.report = report(it.discovery, it.plan, it.wire, it.audit, connectedNow(it), it.research, Boolean(it.connector?.verified));
      }
      break;
    }
  }

  phase.status = it.plan?.path === "no-path" && phase.id !== "scout" ? "blocked" : "done";
  phase.finishedAt = Date.now();
  it.currentPhase = idx + 1;
  it.updatedAt = Date.now();

  // Status while running, final status from the report.
  if (it.currentPhase >= it.phases.length && it.report) {
    it.status = it.report.status;
  } else {
    it.status = "running";
  }
  return it;
}

// Recompute downstream phases when credentials change (so the Auditor and
// report reflect connected secrets without re-running discovery).
export function recompute(it: Integration): Integration {
  if (it.discovery && it.plan && it.wire) {
    it.audit = auditor(it.discovery, it.plan, it.wire, connectedNow(it));
    if (it.currentPhase >= it.phases.length) {
      it.report = report(it.discovery, it.plan, it.wire, it.audit, connectedNow(it), it.research, Boolean(it.connector?.verified));
      it.status = it.report.status;
    }
  }
  it.updatedAt = Date.now();
  return it;
}

// Self-repair: the current connect method failed (or the user chose to try another
// way), so re-architect with it EXCLUDED. The engine advances to the next viable
// candidate, re-wires, and clears any half-held session/connector for the old method.
// Exclusions accumulate, so repeated repairs walk down the fallback ladder.
export function repair(it: Integration): Integration {
  if (!it.discovery || !it.plan) return it;
  const excluded = Array.from(new Set([...(it.excludedMethods ?? []), it.plan.connectMethod]));
  it.excludedMethods = excluded;
  const hostedConnector = hostedConnectorAvailableFor(it.appName);
  it.plan = architect(it.discovery, it.research, { hostedConnector, excludeMethods: excluded });
  it.wire = wire(it.discovery, it.plan);
  // The old method failed: drop its half-held state so the new method starts clean.
  it.connector = undefined;
  it.managedSession = undefined;
  it.audit = auditor(it.discovery, it.plan, it.wire, connectedNow(it));
  it.report = report(it.discovery, it.plan, it.wire, it.audit, connectedNow(it), it.research, false);
  it.status = it.report.status;
  it.updatedAt = Date.now();
  return it;
}
