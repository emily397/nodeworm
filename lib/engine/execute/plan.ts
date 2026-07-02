// Build + sign an ExecutionPlan from a curated recipe. The cloud only ever assembles
// allowlisted recipe tasks (recipes.ts) and signs them; it never emits free-form
// shell. The returned envelope is what the UI previews and the Agent runs.

import { randomBytes } from "crypto";
import type { Integration } from "../types";
import { recipeForApp } from "./recipes";
import { buildCaptureTasks, captureRecipeAvailable, CAPTURE_CONNECTOR_PORT } from "./capture-recipe";
import { signPlanJson, signingAvailable } from "./sign";
import type { ExecutionPlan, SignedPlanEnvelope } from "./types";

export function executionAvailableFor(appName: string, researchKind?: string, appUrl?: string): boolean {
  if (!signingAvailable()) return false;
  if (recipeForApp(appName)) return true;
  // Capture path: any app with a URL where the Pathfinder landed on reverse-api-capture.
  return researchKind === "reverse-api-capture" && captureRecipeAvailable(appUrl);
}

// Returns the signed envelope + the plan object (for the UI preview) + the callback
// token to persist on the integration, or null if execution is unavailable. The
// caller persists `token` on it.execution and returns { envelope, plan } to the UI.
export function buildSignedPlan(
  it: Integration,
  origin: string,
): { envelope: SignedPlanEnvelope; plan: ExecutionPlan; callbackToken: string } | null {
  if (!signingAvailable()) return null;

  const planId = randomBytes(12).toString("hex");
  const callbackToken = randomBytes(24).toString("hex");
  const now = Date.now();

  let connectorName: string;
  let summary: string;
  let humanActions: string[];
  let connectorUrl: string;
  let tasks;

  const recipe = recipeForApp(it.appName);
  const researchKind = it.research?.best?.kind;

  if (recipe) {
    tasks = recipe.build(recipe.port);
    connectorName = recipe.connectorName;
    summary = recipe.summary;
    humanActions = recipe.humanActions;
    connectorUrl = `http://localhost:${recipe.port}${recipe.healthPath}`;
  } else if (researchKind === "reverse-api-capture" && it.appUrl) {
    tasks = buildCaptureTasks({ appName: it.appName, appUrl: it.appUrl, origin });
    connectorName = `${it.appName}-reverse-api`;
    summary = `Capture live network traffic from ${it.appName}, generate a REST client, and start it as a local connector. Your only step is to log in during the capture.`;
    humanActions = [
      "Approve this plan (you will see every command before it runs).",
      `Log into ${it.appName} in the browser window NodeWorm opens. Browse to your key screens. Close the tab when done.`,
    ];
    connectorUrl = `http://localhost:${CAPTURE_CONNECTOR_PORT}/health`;
  } else {
    return null;
  }

  const plan: ExecutionPlan = {
    id: planId,
    integrationId: it.id,
    connectorName,
    appName: it.appName,
    researchKind: researchKind ?? "rest-wrapper",
    surface: "native-host",
    summary,
    warnings: [
      `NodeWorm will run ${tasks.filter((t) => t.command).length} commands on your machine. You will see every one before it runs.`,
      "You can pause or abort at any time. NodeWorm never types your password and never clicks an authorization for you.",
    ],
    humanActions,
    connectorUrl,
    tasks,
    callbackUrl: `${origin}/api/integrations/${it.id}/execute/callback`,
    callbackToken,
    createdAt: now,
    expiresAt: now + 60 * 60 * 1000,
  };

  const planJson = JSON.stringify(plan);
  const sig = signPlanJson(planJson);
  if (!sig) return null;

  const envelope: SignedPlanEnvelope = { planJson, ...sig };
  return { envelope, plan, callbackToken };
}

// A signed single-task plan that makes a LOCAL connector cloud-reachable via a
// hash-pinned cloudflared quick tunnel. Same signing + callback spine as setup
// plans; the callback route re-verifies the reported public URL from the cloud
// with one real GET before anything is recorded reachable.
export function buildSignedTunnelPlan(
  it: Integration,
  origin: string,
  port: number,
  healthPath: string,
): { envelope: SignedPlanEnvelope; plan: ExecutionPlan; callbackToken: string } | null {
  if (!signingAvailable()) return null;
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;

  const planId = randomBytes(12).toString("hex");
  const callbackToken = randomBytes(24).toString("hex");
  const now = Date.now();

  const plan: ExecutionPlan = {
    id: planId,
    integrationId: it.id,
    connectorName: `${it.appName}-tunnel`,
    appName: it.appName,
    researchKind: it.research?.best?.kind ?? "rest-wrapper",
    surface: "native-host",
    summary: `Expose your local ${it.appName} connector (127.0.0.1:${port}) to NodeWorm through an ephemeral Cloudflare quick tunnel. No account, no port-forwarding; the URL dies with the tunnel.`,
    warnings: [
      "The tunnel makes this one local port publicly reachable while it runs. Anyone with the random URL can hit that port, so keep the connector's own token on.",
      "Quick tunnels are ephemeral: a new URL is issued each start, and NodeWorm re-verifies before trusting it.",
    ],
    humanActions: ["Approve this plan. Nothing else: the Agent opens the tunnel and NodeWorm verifies it."],
    connectorUrl: `http://127.0.0.1:${port}${healthPath}`,
    tasks: [
      {
        n: 1,
        kind: "tunnel-start",
        title: "Open a secure tunnel to the local connector",
        description: `cloudflared (pinned + hash-verified) exposes 127.0.0.1:${port}; one real request through the public URL must succeed.`,
        tunnelPort: port,
        verify: { kind: "http-health", url: healthPath || "/health" },
        requiresHuman: false,
        criticalPath: true,
        timeoutMs: 240000,
      },
    ],
    callbackUrl: `${origin}/api/integrations/${it.id}/execute/callback`,
    callbackToken,
    createdAt: now,
    expiresAt: now + 60 * 60 * 1000,
  };

  const planJson = JSON.stringify(plan);
  const sig = signPlanJson(planJson);
  if (!sig) return null;
  return { envelope: { planJson, ...sig }, plan, callbackToken };
}
