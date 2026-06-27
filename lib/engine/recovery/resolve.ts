// The self-recovering client resolver. Replaces the old dead-end: instead of
// "OAuth app not configured. Stop.", it walks credential tiers and either
// resolves a usable OAuth client or hands back a guided "crack it" recipe. The
// only honest terminal is `blocked` (no OAuth endpoints, or the provider gates
// registration behind manual review). Every degrade is recorded on the
// integration's recoveryAttempts.

import { envClientCreds, providerFor, type ClientCreds, type OAuthProvider } from "../oauth";
import { getVaultClientCreds, storeClientCreds, vaultAvailable } from "../vault";
import { assertPublicHttps, registerClient } from "./dcr";
import { curatedRecipe, genericRecipe, llmRecipe } from "./recipes";
import type { GuidedRecipe, Integration, RecoveryAttempt, RecoveryTier } from "../types";

export type Resolution =
  | { kind: "ready"; provider: OAuthProvider; creds: ClientCreds; source: RecoveryTier }
  | { kind: "recover"; recipe: GuidedRecipe }
  | { kind: "blocked"; reason: string };

function record(it: Integration, tier: RecoveryTier, outcome: RecoveryAttempt["outcome"], reason?: string) {
  it.recoveryAttempts ??= [];
  it.recoveryAttempts.push({ tier, at: Date.now(), outcome, reason });
}

export async function resolveClient(it: Integration, ctx: { origin: string; connectionId: string; userId?: string }): Promise<Resolution> {
  const provider = providerFor(it.appName, it.discovery);
  const redirectUri = `${ctx.origin}/api/integrations/${ctx.connectionId}/oauth/callback`;
  const scope = { connectionId: ctx.connectionId, userId: ctx.userId };

  // Without real authorize/token endpoints there is nothing to register a client
  // against and no consent to run. Honest terminal, not a fake.
  if (!provider) {
    record(it, "guided", "blocked", "no OAuth authorize/token endpoints discovered");
    return {
      kind: "blocked",
      reason: `NodeWorm could not find ${it.appName}'s OAuth 2.0 authorize/token endpoints, so it cannot run a consent here.`,
    };
  }

  const scopes = provider.scopes.length ? provider.scopes : it.discovery?.oauthScopes ?? [];

  // Tier 0: env-provided client (operator-configured, highest priority).
  const env = envClientCreds(it.appName);
  if (env) {
    record(it, "env", "used");
    return { kind: "ready", provider, creds: env, source: "env" };
  }

  // Tier 1: per-connection encrypted vault (a client the user already pasted /
  // that DCR registered earlier).
  const vaulted = await getVaultClientCreds(it.appName, scope);
  if (vaulted) {
    record(it, "vault", "used");
    return { kind: "ready", provider, creds: vaulted, source: "vault" };
  }

  // Tier 2: Dynamic Client Registration, when the provider advertises it.
  const regEndpoint = it.discovery?.probe?.registrationEndpoint;
  if (regEndpoint && assertPublicHttps(regEndpoint)) {
    const reg = await registerClient({ registrationEndpoint: regEndpoint, redirectUri, scopes });
    if ("creds" in reg) {
      await storeClientCreds(it.appName, scope, reg.creds.clientId, reg.creds.clientSecret, "dcr");
      record(it, "dcr", "used");
      return { kind: "ready", provider, creds: reg.creds, source: "dcr" };
    }
    record(it, "dcr", "degraded", reg.error);
  } else if (regEndpoint) {
    record(it, "dcr", "degraded", "registration endpoint is not a public https URL");
  }

  // Tier 3: the guided portal floor. Never a silent dead-end. The recipe is
  // resolved curated -> cached -> AI-researched -> generic, so ANY named app
  // gets a specific "crack it" workflow, not just the curated set.
  const hints = { developerPortalUrl: it.discovery?.developerPortalUrl, docsUrl: it.discovery?.docsUrl };
  let recipe =
    curatedRecipe(it.appName, scopes, redirectUri) ??
    (it.recovery && it.recovery.app === it.appName && !it.recovery.requiresApproval ? it.recovery : null) ??
    (await llmRecipe(it.appName, hints, scopes, redirectUri)) ??
    genericRecipe(it.appName, hints, scopes, redirectUri);
  // Keep scopes/redirect current even if a cached recipe was reused.
  recipe = { ...recipe, scopes: recipe.scopes.length ? recipe.scopes : scopes, redirectUri };
  if (recipe.requiresApproval) {
    record(it, "guided", "blocked", "provider requires manual approval");
    return {
      kind: "blocked",
      reason: `${it.appName} gates OAuth-app registration behind a manual approval NodeWorm cannot automate. Use ${recipe.portalUrl} to request access.`,
    };
  }
  record(it, "guided", "degraded", vaultAvailable() ? "awaiting client id/secret" : "vault not provisioned (set VAULT_KEK); env path still works");
  return { kind: "recover", recipe };
}
