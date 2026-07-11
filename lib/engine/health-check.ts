// Server side of the connector health monitor: re-verify a live self-hosted
// connector by resolving its stored {url, token} from the vault and making one real
// read, then fold the result into durable health with nextHealth. On sustained drift
// of a GENERATED connector, regenerate a fresh typed bundle from the discovered
// surface (the redeploy of that bundle stays with the user/Agent, so we flag it).

import type { Integration } from "./types";
import { getVaultConnector } from "./vault";
import { verifyConnector } from "./connector";
import { nextHealth, shouldAutoRepair, type ConnectorKind, type HealthProbe } from "./health";
import { generateForIntegration } from "./generate-pipeline";

// A generated connector is one NodeWorm wrote; anything else reached over a stored
// {url, token} is a researched self-hosted connector. (Hosted bridges verify on a
// different path and aren't swept here.)
export function connectorKindOf(it: Integration): ConnectorKind {
  const m = it.report?.connectMethod;
  return m === "generated-mcp" || m === "generated-scraper" ? "generated" : "researched";
}

// One real read of the live connector using its vault-stored creds. Returns null when
// there is nothing to check (no verified connector, or no stored creds because the
// vault is off), so callers skip rather than record a false failure.
export async function probeConnectorHealth(it: Integration): Promise<HealthProbe | null> {
  if (!it.connector?.verified) return null;
  const creds = await getVaultConnector(it.appName, { connectionId: it.id, userId: it.userId });
  if (!creds?.url) return null;
  const v = await verifyConnector(creds.url, creds.token, "cloud");
  return { ok: v.ok, status: v.status, detail: v.detail };
}

export interface HealthCheckResult {
  checked: boolean; // false = nothing to check (skipped)
  repaired?: boolean; // a fresh bundle was regenerated after sustained drift
  state?: string;
}

// Re-verify one integration's connector, update its rolling health, and auto-repair
// a generated connector that has drifted past the threshold. Mutates `it`; the caller
// persists. Returns what happened for logging / the response.
export async function runHealthCheck(it: Integration, now: number): Promise<HealthCheckResult> {
  const probe = await probeConnectorHealth(it);
  if (!probe || !it.connector) return { checked: false };

  const health = nextHealth(it.connector.health, probe, now);
  it.connector.health = health;

  let repaired = false;
  const kind = connectorKindOf(it);
  if (shouldAutoRepair(kind, health) && it.discovery && it.wire) {
    // Regenerate a fresh typed bundle from the discovered surface + captured traffic.
    // This is the "self-heal" half: the new code is ready immediately; redeploying it
    // to the user's host is the Agent's job, so health stays drifted until a real read
    // through the redeployed connector succeeds.
    try {
      await generateForIntegration(it, {});
      repaired = true;
      it.connector.health = { ...health, detail: `${health.detail ?? "drifted"}; regenerated a fresh bundle to redeploy` };
    } catch {
      // Regeneration failed (surface not ready); leave the drift recorded honestly.
    }
  }

  return { checked: true, repaired, state: health.state };
}
