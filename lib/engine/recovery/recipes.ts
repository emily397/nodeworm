// Curated, hand-verified "crack it" recipes: how to register an OAuth client on
// each provider's own developer portal. The user does the portal clicks + login;
// NodeWorm supplies the exact redirect URI + scopes and captures the pasted-back
// client id/secret. No fabricated URLs: an unknown app falls to a generic recipe
// that tells the user to find the portal, never an invented link.

import { chatJson, isLlmEnabled } from "../llm";
import { lookup } from "../knowledge";
import type { GuidedRecipe } from "../types";

export interface RecipeHints {
  developerPortalUrl?: string;
  docsUrl?: string;
}

interface RecipeSeed {
  portalUrl: string;
  steps?: string[];
  notes?: string[];
  requiresApproval?: boolean;
}

const COMMON_STEPS = (appName: string): string[] => [
  `Log in to the developer portal and create a new app (or OAuth integration) for ${appName}.`,
  "Set the app's redirect / callback URL to the value below. Copy it exactly.",
  "Grant the scopes listed below.",
  "Copy the Client ID and Client Secret it gives you.",
  "Paste both back here. NodeWorm runs the consent and takes it from there.",
];

const SECRET_ONCE = "The Client Secret is usually shown only once: copy it before leaving the page.";
const EXACT_REDIRECT = "The redirect URI must match exactly (scheme, host, path) or the consent will fail.";

const RECIPES: Record<string, RecipeSeed> = {
  ticktick: {
    portalUrl: "https://developer.ticktick.com/manage",
    steps: [
      "Log in at developer.ticktick.com/manage and click New App.",
      "Give it a name (e.g. NodeWorm).",
      "Set the OAuth redirect URL to the value below. Copy it exactly.",
      "Copy the generated Client ID and Client Secret.",
      "Paste both back here. NodeWorm runs the consent and takes it from there.",
    ],
    notes: [SECRET_ONCE, EXACT_REDIRECT],
  },
  notion: {
    portalUrl: "https://www.notion.so/my-integrations",
    steps: [
      "Open notion.so/my-integrations and create a new integration (type: Public, for OAuth).",
      "Set the Redirect URI to the value below. Copy it exactly.",
      "Copy the OAuth Client ID and Client Secret.",
      "Paste both back here.",
    ],
    notes: [EXACT_REDIRECT, "Public integrations may need basic info (name, icon) before secrets appear."],
  },
  slack: {
    portalUrl: "https://api.slack.com/apps",
    steps: [
      "Open api.slack.com/apps and click Create New App (from scratch).",
      "Under OAuth & Permissions, add a Redirect URL: the value below.",
      "Add the listed Bot/User scopes.",
      "From Basic Information, copy the Client ID and Client Secret.",
      "Paste both back here.",
    ],
    notes: [EXACT_REDIRECT],
  },
  github: {
    portalUrl: "https://github.com/settings/developers",
    steps: [
      "Open Settings > Developer settings > OAuth Apps > New OAuth App.",
      "Set the Authorization callback URL to the value below.",
      "Register the app, then Generate a new client secret.",
      "Copy the Client ID and Client Secret.",
      "Paste both back here.",
    ],
    notes: [SECRET_ONCE],
  },
  gmail: {
    portalUrl: "https://console.cloud.google.com/apis/credentials",
    steps: [
      "In Google Cloud Console, configure the OAuth consent screen, then Credentials > Create Credentials > OAuth client ID (Web application).",
      "Add the Authorized redirect URI below.",
      "Enable the Gmail API for the project.",
      "Copy the Client ID and Client Secret.",
      "Paste both back here.",
    ],
    notes: [EXACT_REDIRECT, "Test apps work immediately; production may need Google verification for sensitive scopes."],
  },
  "google calendar": {
    portalUrl: "https://console.cloud.google.com/apis/credentials",
    steps: [
      "In Google Cloud Console, configure the OAuth consent screen, then Credentials > Create Credentials > OAuth client ID (Web application).",
      "Add the Authorized redirect URI below.",
      "Enable the Google Calendar API for the project.",
      "Copy the Client ID and Client Secret.",
      "Paste both back here.",
    ],
    notes: [EXACT_REDIRECT, "Test apps work immediately; production may need Google verification for sensitive scopes."],
  },
  hubspot: {
    portalUrl: "https://developers.hubspot.com/",
    steps: [
      "In a HubSpot developer account, create an app, then open its Auth tab.",
      "Set the Redirect URL to the value below.",
      "Select the listed scopes.",
      "Copy the Client ID and Client Secret.",
      "Paste both back here.",
    ],
    notes: [EXACT_REDIRECT],
  },
  linear: {
    portalUrl: "https://linear.app/settings/api/applications/new",
    steps: [
      "Open Linear > Settings > API > Applications > New, or the link below.",
      "Add the Callback URL below.",
      "Copy the Client ID and Client Secret.",
      "Paste both back here.",
    ],
    notes: [EXACT_REDIRECT],
  },
  airtable: {
    portalUrl: "https://airtable.com/create/oauth",
    steps: [
      "Open airtable.com/create/oauth and register a new OAuth integration.",
      "Set the Redirect URL to the value below.",
      "Add the listed scopes.",
      "Copy the Client ID and (generate +) Client Secret.",
      "Paste both back here.",
    ],
    notes: [SECRET_ONCE, EXACT_REDIRECT],
  },
  "quickbooks online": {
    portalUrl: "https://developer.intuit.com/app/developer/dashboard",
    steps: [
      "In the Intuit developer dashboard, create an app (QuickBooks Online Accounting).",
      "Under Keys & OAuth, add the Redirect URI below.",
      "Copy the Client ID and Client Secret (use Development keys to start).",
      "Paste both back here.",
    ],
    notes: [EXACT_REDIRECT, "Production scopes may require Intuit app review."],
    requiresApproval: false,
  },
  xero: {
    portalUrl: "https://developer.xero.com/app/manage",
    steps: [
      "Open developer.xero.com/app/manage and create a new app (Web app / Auth code).",
      "Set the Redirect URI to the value below.",
      "Generate a Client Secret.",
      "Copy the Client ID and Client Secret.",
      "Paste both back here.",
    ],
    notes: [SECRET_ONCE, EXACT_REDIRECT],
  },
  calendly: {
    portalUrl: "https://developer.calendly.com/",
    steps: [
      "In the Calendly developer portal, create an OAuth application.",
      "Set the Redirect URI to the value below.",
      "Copy the Client ID and Client Secret.",
      "Paste both back here.",
    ],
    notes: [EXACT_REDIRECT],
  },
  jira: {
    portalUrl: "https://developer.atlassian.com/console/myapps/",
    steps: [
      "Open the Atlassian developer console, create an OAuth 2.0 (3LO) app.",
      "Under Authorization, add the Callback URL below.",
      "Add the Jira API + the listed scopes under Permissions.",
      "From Settings, copy the Client ID and Secret.",
      "Paste both back here.",
    ],
    notes: [EXACT_REDIRECT],
  },
  discord: {
    portalUrl: "https://discord.com/developers/applications",
    steps: [
      "Open discord.com/developers/applications > New Application.",
      "Under OAuth2, add a Redirect: the value below.",
      "Copy the Client ID and reset/copy the Client Secret.",
      "Paste both back here.",
    ],
    notes: [SECRET_ONCE, EXACT_REDIRECT],
  },
  shopify: {
    portalUrl: "https://partners.shopify.com/",
    steps: [
      "In the Shopify Partners dashboard, create an app.",
      "Under App setup, set the Allowed redirection URL to the value below.",
      "Copy the API key (Client ID) and API secret key (Client Secret).",
      "Paste both back here.",
    ],
    notes: [EXACT_REDIRECT, "Set OAUTH_SHOPIFY_SHOP to your shop domain so NodeWorm can target your store."],
  },
  salesforce: {
    portalUrl: "https://help.salesforce.com/s/articleView?id=sf.connected_app_create.htm",
    steps: [
      "In Setup > App Manager > New Connected App, enable OAuth Settings.",
      "Set the Callback URL to the value below.",
      "Select the listed OAuth scopes.",
      "Copy the Consumer Key (Client ID) and Consumer Secret.",
      "Paste both back here.",
    ],
    notes: [EXACT_REDIRECT, "Connected apps can take a few minutes to activate."],
  },
  stripe: {
    portalUrl: "https://dashboard.stripe.com/settings/connect",
    steps: [
      "Stripe connects via Stripe Connect (OAuth). In Settings > Connect, register a platform.",
      "Add the OAuth redirect URI below.",
      "Copy your Connect Client ID and a restricted secret key.",
      "Paste both back here.",
    ],
    notes: [EXACT_REDIRECT, "Connect must be enabled on the account."],
  },
};

// Apps whose OAuth portal the NodeWorm Helper extension may drive. Allowlist
// only (audit F3/F7): simple, automation-tolerant portals. Financial / review-
// gated portals (Google, Stripe, Shopify, Intuit, Salesforce, Xero) stay manual.
// Gated portals (shopify, gmail, google calendar, stripe, quickbooks online) are
// added here too, but each carries a knowledge-base portalAutomation caveat and is
// only ever flagged automatable when allowAutomation is true AND the user consents
// (enforced server-side in the cobrowse routes). Xero (high risk) and Salesforce
// (creation disabled) stay OUT, so they can never be automated.
const AUTOMATABLE = new Set([
  "ticktick",
  "notion",
  "linear",
  "discord",
  "airtable",
  "calendly",
  "github",
  "shopify",
  "gmail",
  "google calendar",
  "stripe",
  "quickbooks online",
]);

// A hand-verified recipe, or null if this app is not in the curated set.
export function curatedRecipe(appName: string, scopes: string[], redirectUri: string): GuidedRecipe | null {
  const key = appName.trim().toLowerCase();
  const seed = RECIPES[key];
  if (!seed) return null;
  const pa = lookup(appName)?.portalAutomation;
  return {
    app: appName,
    portalUrl: seed.portalUrl,
    steps: seed.steps ?? COMMON_STEPS(appName),
    scopes,
    redirectUri,
    notes: seed.notes ?? [SECRET_ONCE, EXACT_REDIRECT],
    requiresApproval: seed.requiresApproval,
    // A "blocked" / allowAutomation:false portal can never be flagged automatable,
    // even if its key is in the allowlist. Consent is enforced separately server-side.
    automatable: AUTOMATABLE.has(key) && (pa?.allowAutomation ?? true),
    portalAutomation: pa,
  };
}

const RECIPE_SYSTEM = `You are NodeWorm's OAuth onboarding researcher. Given an app, output ONLY a JSON object describing how a developer registers an OAuth 2.0 client for that app on the app's OWN developer portal, so NodeWorm can guide the user through it.
Keys: portalUrl (string: the exact developer portal / console URL where you create an OAuth app), steps (string[]: 3 to 6 concrete ordered steps the user follows in that portal, explicitly mentioning where to set the redirect / callback URL and where the client id + client secret are shown), scopeHints (string[]: real OAuth scope strings for a least-privilege read+write connector), requiresApproval (boolean: true ONLY if the provider gates OAuth-app creation behind manual review / a partner program), notes (string[]: short real gotchas).
Be accurate and specific to THIS app. If you are unsure of the exact portal URL, give your best-known URL and add a note to verify it. Never invent scopes that do not exist. Respond with JSON only.`;

// Live model research: when an app is not in the curated set, NodeWorm asks the
// model to crack that specific app's OAuth-app registration workflow. Grounded
// by any portal/docs URL discovery already found, and tagged aiResearched so the
// UI flags it as model-derived (verify the link) rather than hand-verified.
export async function llmRecipe(appName: string, hints: RecipeHints, scopes: string[], redirectUri: string): Promise<GuidedRecipe | null> {
  if (!isLlmEnabled()) return null;
  const ground = [
    hints.developerPortalUrl ? `Known developer portal: ${hints.developerPortalUrl}` : "",
    hints.docsUrl ? `Docs: ${hints.docsUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const data = await chatJson(RECIPE_SYSTEM, `App: ${appName}\n${ground}\nDescribe the OAuth client registration workflow as JSON.`);
  if (!data) return null;

  const steps = Array.isArray(data.steps) ? (data.steps as unknown[]).filter((s): s is string => typeof s === "string" && s.trim().length > 0).slice(0, 7) : [];
  if (!steps.length) return null;
  const scopeHints = Array.isArray(data.scopeHints) ? (data.scopeHints as unknown[]).filter((s): s is string => typeof s === "string") : [];
  const aiNotes = Array.isArray(data.notes) ? (data.notes as unknown[]).filter((s): s is string => typeof s === "string").slice(0, 2) : [];
  const portalUrl = hints.developerPortalUrl ?? (typeof data.portalUrl === "string" ? data.portalUrl : "");
  const pa = lookup(appName)?.portalAutomation;

  return {
    app: appName,
    portalUrl,
    steps: [...steps, "Paste the Client ID and Client Secret back here. NodeWorm runs the consent from there."],
    scopes: scopes.length ? scopes : scopeHints,
    redirectUri,
    notes: [...aiNotes, "AI-researched steps: double-check the portal link and field names before you paste.", EXACT_REDIRECT],
    requiresApproval: Boolean(data.requiresApproval),
    aiResearched: true,
    portalAutomation: pa,
  };
}

// Last-resort floor: point at whatever portal discovery actually found, never an
// invented URL. If none is known, instruct the user to locate it.
export function genericRecipe(appName: string, hints: RecipeHints, scopes: string[], redirectUri: string): GuidedRecipe {
  const portalUrl = hints.developerPortalUrl ?? hints.docsUrl ?? "";
  return {
    app: appName,
    portalUrl,
    steps: [
      portalUrl
        ? `Open ${appName}'s developer portal (link below) and register an OAuth app.`
        : `Find ${appName}'s developer portal (search "${appName} OAuth app" / "${appName} developer") and register an OAuth app.`,
      "Set the app's redirect / callback URL to the value below. Copy it exactly.",
      "Request the scopes listed below (or the closest read + write equivalents).",
      "Copy the Client ID and Client Secret.",
      "Paste both back here. NodeWorm runs the consent and takes it from there.",
    ],
    scopes,
    redirectUri,
    notes: [SECRET_ONCE, EXACT_REDIRECT],
    portalAutomation: lookup(appName)?.portalAutomation,
  };
}
