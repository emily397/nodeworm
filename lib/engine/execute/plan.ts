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
