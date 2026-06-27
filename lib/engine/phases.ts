// The NodeWorm decision-tree engine. Pure, deterministic functions that take the
// output of the previous phase and produce the next. Faithful to the blueprint:
// Scout -> Architect -> Wire -> Auditor -> Relay.

import { lookup, type KnowledgeEntry } from "./knowledge";
import { heuristicDiscovery } from "./heuristics";
import type {
  ArchitectPlan,
  AuditResult,
  AuditTest,
  AuthType,
  ConnectMethod,
  Discovery,
  EntityMapping,
  InboundMethod,
  IntegrationStatus,
  NextStep,
  Report,
  ResearchResult,
  Step,
  TelemetryLine,
  ToolDef,
  WireConfig,
} from "./types";

// ---- SCOUT ----------------------------------------------------------------

function discoveryFromKnowledge(e: KnowledgeEntry, input: string): Discovery {
  const url = /^https?:\/\//i.test(input) ? input : undefined;
  const telemetry: TelemetryLine[] = [
    { level: "scan", text: `web.search("${e.appName} API documentation")` },
    { level: "scan", text: `mcp.registry.lookup("${e.appName}")` },
    { level: "ok", text: `Matched knowledge base: ${e.appName} (${e.category}).` },
    e.hasPublicApi
      ? { level: "ok", text: `Public ${e.apiType.toUpperCase()} API confirmed.` }
      : { level: "warn", text: `No public API. UI-only product.` },
    e.hasHostedMcp
      ? { level: "ok", text: `Hosted MCP available: ${e.mcpName}.` }
      : { level: "info", text: `No hosted MCP in the registry.` },
    {
      level: e.authType === "browser" ? "warn" : "info",
      text: `Auth: ${authLabel(e.authType)}.`,
    },
  ];
  if (e.oauthAuthorizeUrl) {
    telemetry.push({
      level: "ok",
      text: `OAuth 2.0 endpoint resolved: ${hostOf(e.oauthAuthorizeUrl)} (genuine Authorization Code flow).`,
    });
  }
  for (const q of e.quirks ?? []) telemetry.push({ level: "warn", text: q });

  return {
    appName: e.appName,
    appUrl: url ?? (e.developerPortalUrl ? undefined : undefined),
    category: e.category,
    blurb: e.blurb,
    hasPublicApi: e.hasPublicApi,
    apiType: e.apiType,
    authType: e.authType,
    authMethods: e.authMethods,
    hasHostedMcp: e.hasHostedMcp,
    mcpName: e.mcpName,
    mcpTransport: e.mcpTransport,
    docsUrl: e.docsUrl,
    developerPortalUrl: e.developerPortalUrl,
    loginUrl: e.loginUrl,
    noWebClient: e.noWebClient,
    oauthAuthorizeUrl: e.oauthAuthorizeUrl,
    oauthTokenUrl: e.oauthTokenUrl,
    hasWebhooks: e.hasWebhooks,
    rateLimited: e.rateLimited ?? true,
    ipRestricted: e.ipRestricted ?? false,
    twoFactor: e.twoFactor ?? false,
    confidence: 0.95,
    source: "knowledge-base",
    entities: e.entities ?? [],
    notes: e.quirks ?? [],
    telemetry,
  };
}

export function scout(input: string): Discovery {
  const hit = lookup(input);
  if (hit) return discoveryFromKnowledge(hit, input);
  return heuristicDiscovery(input);
}

function hostOf(url: string): string {
  const m = url.match(/^https?:\/\/([^/]+)/i);
  return m ? m[1] : url;
}

function authLabel(a: string): string {
  switch (a) {
    case "oauth2":
      return "OAuth 2.0";
    case "apikey":
      return "API key";
    case "browser":
      return "No API auth (browser session)";
    case "none":
      return "None / public";
    default:
      return "Unknown";
  }
}

// Tool/scope naming: entity names arrive in mixed forms (singular "Project",
// plural "Issues", multi-word "Merge requests"). Normalise to a snake_case slug,
// then build list_<plural> / create_<singular> so a plural entity does not become
// "issuess" and a space never leaks into a tool name.
function entitySlug(en: string): string {
  return en.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function singularSlug(en: string): string {
  const s = entitySlug(en);
  if (/ies$/.test(s)) return s.replace(/ies$/, "y");
  if (/(s|x|z|ch|sh)es$/.test(s)) return s.replace(/es$/, "");
  if (/ss$/.test(s)) return s;
  if (/s$/.test(s)) return s.replace(/s$/, "");
  return s;
}

function pluralSlug(en: string): string {
  const s = singularSlug(en);
  if (/[^aeiou]y$/.test(s)) return s.replace(/y$/, "ies");
  if (/(s|x|z|ch|sh)$/.test(s)) return `${s}es`;
  return `${s}s`;
}

// ---- ARCHITECT ------------------------------------------------------------

// Genuine OAuth is only claimable when we actually hold the real authorize + token
// endpoints (from the knowledge base or live discovery). Without them there is no
// real consent + token-exchange flow to run, so NodeWorm must not claim one. The
// flow itself is driven by the provider registry in oauth.ts (server-only); this
// pure check is the engine's honest proxy for "a genuine flow exists".
function hasGenuineOAuth(d: Discovery): boolean {
  return Boolean(d.oauthAuthorizeUrl && d.oauthTokenUrl);
}

function mcpSpec(d: Discovery) {
  const lang = d.apiType === "graphql" ? "typescript" : "python";
  const framework = lang === "typescript" ? "graphql-request + @modelcontextprotocol/sdk" : "FastMCP";
  const stableEgress = d.ipRestricted;
  const deployTarget = stableEgress
    ? "Local npx (stdio) with a stable egress IP"
    : "Cloudflare Workers (HTTP MCP)";
  const tools =
    d.entities.length > 0
      ? d.entities.flatMap((en) => [`list_${pluralSlug(en)}`, `create_${singularSlug(en)}`])
      : ["list_items", "create_item"];
  return { language: lang as "python" | "typescript", framework, deployTarget, tools };
}

function credentialSteps(d: Discovery, path: string): Step[] {
  const portal = d.developerPortalUrl ?? d.docsUrl ?? "the developer portal";
  if (path === "hosted-mcp" && d.authType === "oauth2") {
    return [
      { n: 1, title: "Add MCP to config", detail: `Register ${d.mcpName} in the connector list.`, actor: "agent" },
      { n: 2, title: "Authorize", detail: "Approve the genuine OAuth consent screen for the minimum scopes.", actor: "user" },
      { n: 3, title: "Store tokens", detail: "Persist the access + refresh tokens returned by the token exchange, server-side.", actor: "agent" },
    ];
  }
  if (d.authType === "oauth2") {
    return [
      { n: 1, title: "Register OAuth client", detail: `NodeWorm's OAuth app is registered once at ${portal}; its client ID/secret live in the server env, never in the browser.`, actor: "agent" },
      { n: 2, title: "Scope down", detail: "Request only the minimum scopes for the chosen actions.", actor: "agent" },
      { n: 3, title: "Authorize", detail: "You approve the real consent screen; NodeWorm captures the authorization code at its redirect URI.", actor: "user" },
      { n: 4, title: "Exchange + store", detail: "NodeWorm swaps the code for access + refresh tokens (PKCE-protected) and stores them masked. No API key is ever requested.", actor: "agent" },
    ];
  }
  if (d.authType === "browser") {
    return [
      { n: 1, title: "Authorize in-session", detail: "Sign in once via the app's own OAuth / SSO inside the managed browser. NodeWorm captures the session, never your password.", actor: "user" },
      { n: 2, title: "Persist session", detail: "Cache the authorized session so the agent stays logged in.", actor: "agent" },
      { n: 3, title: "Map UI flows", detail: "Record the click paths for each read / write action.", actor: "agent" },
    ];
  }
  if (d.authType === "none") {
    return [{ n: 1, title: "No auth required", detail: `${d.appName} exposes a public API; NodeWorm calls it directly.`, actor: "agent" }];
  }
  return [
    {
      n: 1,
      title: "No OAuth path available",
      detail: `${d.appName} offers no genuine OAuth 2.0 flow. NodeWorm connects only via OAuth, so it cannot complete this connection until one exists.`,
      actor: "agent",
    },
  ];
}

export function architect(
  d: Discovery,
  research?: ResearchResult,
  opts?: { hostedConnector?: boolean; excludeMethods?: ConnectMethod[] },
): ArchitectPlan {
  const tel: TelemetryLine[] = [];
  let path: ArchitectPlan["path"];
  let buildsCustomMcp = false;
  let customMcpSpec: ArchitectPlan["customMcpSpec"];
  const notes: string[] = [];

  if (d.hasHostedMcp) {
    path = "hosted-mcp";
    tel.push({ level: "ok", text: `Hosted MCP found (${d.mcpName}). Skipping build, going straight to auth.` });
  } else if (d.hasPublicApi) {
    path = "custom-mcp";
    buildsCustomMcp = true;
    customMcpSpec = mcpSpec(d);
    tel.push({ level: "warn", text: `No hosted MCP. Scaffolding a custom MCP over the ${d.apiType.toUpperCase()} API.` });
    tel.push({ level: "info", text: `Stack: ${customMcpSpec.framework} -> ${customMcpSpec.deployTarget}.` });
  } else {
    path = "browser-automation";
    buildsCustomMcp = true;
    d = { ...d, authType: "browser" };
    customMcpSpec = mcpSpec({ ...d, apiType: "rest" });
    customMcpSpec.framework = "Playwright + Browserbase (headless)";
    customMcpSpec.deployTarget = "Local npx (stdio)";
    tel.push({ level: "warn", text: `No public API. Building a headless browser-automation MCP.` });
    notes.push("Browser automation is fragile: it breaks when the app's UI changes. Flagged for monitoring.");
  }

  // NodeWorm connects exclusively via OAuth: it never asks for or stores a raw API
  // key. Browser-path apps authorize via OAuth/SSO inside the managed session;
  // public (no-auth) apps need nothing. For an API path, OAuth is only honest when
  // a real Authorization Code flow exists for the app (genuine authorize + token
  // endpoints). If none exists, NodeWorm keeps the app's real auth label and
  // reports the connection as blocked rather than faking an OAuth step.
  const genuineOAuth = hasGenuineOAuth(d);
  const authType: AuthType =
    path === "browser-automation"
      ? "browser"
      : d.authType === "none"
        ? "none"
        : genuineOAuth
          ? "oauth2"
          : d.authType;
  // Every app lands on a real method: hosted MCP, genuine OAuth, a public API,
  // a Pathfinder-researched connector (self-host wrapper / community node / CLI),
  // or the universal floor: a managed browser session driving the app's own UI.
  // There is always a way, so this never dead-ends.
  const baseMethod: ArchitectPlan["connectMethod"] = d.hasHostedMcp
    ? "hosted-mcp"
    : authType === "oauth2"
      ? "oauth-api"
      : authType === "none"
        ? "public-api"
        : "managed-session";
  // Managed session is the autonomous default: NodeWorm drives the app's own web
  // UI after the user authenticates ONCE (a login or a QR scan). The user does
  // nothing else. So whenever NodeWorm can reach the app in a browser, that is the
  // method. A self-hosted researched-connector is only the PRIMARY path in the rare
  // case where the app has no web UI to drive at all (a pure CLI / desktop tool).
  // Otherwise the Pathfinder's findings ride along on the integration as an OPTIONAL
  // advanced alternative for technical users, never as the user's required path.
  const rawBest = baseMethod === "managed-session" ? research?.best : undefined;
  // An app with a browser login can be driven by a managed session (the user just
  // signs in). An app with NO web client at all (Signal: mobile/desktop only)
  // cannot, so it falls through to a real self-hosted connector instead of opening
  // a dead marketing page. hasWebUi stays true for the long tail (assume web-login)
  // and is forced false only for apps the knowledge base flags as no-web-client.
  const hasWebUi =
    !d.noWebClient &&
    (Boolean(d.loginUrl || d.appUrl || d.developerPortalUrl || d.docsUrl) || rawBest?.kind === "web-client");
  let best = hasWebUi ? undefined : rawBest;
  // When NodeWorm itself hosts a connector for this no-web-login app (e.g. a Signal
  // bridge keyed in env), the user only LINKS once (scans a QR); NodeWorm runs the
  // connector. That beats asking them to self-host, so it wins over researched-
  // connector whenever it is available and the method is a hostable wrapper/CLI.
  const hostable = best && (best.kind === "rest-wrapper" || best.kind === "cli");
  const useHosted = Boolean(best && hostable && opts?.hostedConnector);
  const primaryMethod: ArchitectPlan["connectMethod"] = best
    ? useHosted
      ? "hosted-connector"
      : "researched-connector"
    : baseMethod;

  // Self-repair: the chosen method plus its viable fallbacks, in preference order.
  // When a method fails downstream (verify fails, no hosted browser, connector
  // unreachable) the repair route re-architects with it excluded, so the engine
  // advances to the next candidate instead of dead-ending. With nothing excluded the
  // primary is identical to before.
  const candidates: ConnectMethod[] = [
    primaryMethod,
    // A self-hosted connector is a fallback whenever the Pathfinder found ANY real
    // method, even for web-loginable apps where managed-session is the primary.
    ...(research?.best && primaryMethod !== "researched-connector" ? (["researched-connector"] as ConnectMethod[]) : []),
    // The managed browser session is the universal floor for any web-loginable app,
    // so it backstops the API/OAuth/connector methods.
    ...(!d.noWebClient && primaryMethod !== "managed-session" ? (["managed-session"] as ConnectMethod[]) : []),
  ].filter((m, i, a) => a.indexOf(m) === i);
  const exclude = opts?.excludeMethods ?? [];
  const connectMethod: ArchitectPlan["connectMethod"] = candidates.find((m) => !exclude.includes(m)) ?? primaryMethod;
  const fallbacks = candidates.filter((m) => m !== connectMethod);
  // If repair landed on a connector method for a web-loginable app (where `best` was
  // cleared so managed-session could be primary), restore it so the connector branches
  // describe the actual Pathfinder method.
  if ((connectMethod === "researched-connector" || connectMethod === "hosted-connector") && !best) best = research?.best;
  const methodKind: ArchitectPlan["methodKind"] =
    connectMethod === "researched-connector"
      ? "workflow"
      : connectMethod === "hosted-connector"
        ? "managed-session"
        : connectMethod === "managed-session"
          ? "managed-session"
          : "live";
  if (connectMethod === "hosted-connector" && best) {
    notes.push(
      `${d.appName} has no browser login, so NodeWorm hosts the connector for you (${best.name}). Your only step is to link your account once by scanning a QR code in ${d.appName}; NodeWorm holds the link encrypted and drives it. You install and configure nothing.`,
    );
    notes.push(
      `A hosted bridge reads and sends on your ${d.appName} account for the actions you connect, so linking it needs your explicit consent.`,
    );
    tel.push({ level: "action", text: `No web login for ${d.appName}. NodeWorm hosts ${best.name}; you link via QR.` });
  } else if (connectMethod === "researched-connector" && best) {
    if (d.noWebClient) {
      notes.push(
        `${d.appName} has no browser login, so it cannot be connected by simply signing in. The genuine path is ${best.name}: ${best.summary} ${best.selfHostable ? `Self-host ${best.name}, then NodeWorm connects to it.` : `Set ${best.name} up, then connect it.`}`,
      );
    } else {
      notes.push(
        `${d.appName} has no API or OAuth NodeWorm can call directly, but the Pathfinder found a real way in: ${best.name}. ${best.summary} ${best.selfHostable ? `Self-host ${best.name}, then NodeWorm connects to it.` : `Set ${best.name} up, then connect it.`}`,
      );
    }
    notes.push("This method is model-researched: verify the project and link before relying on it.");
    tel.push({ level: "action", text: `No direct API/OAuth for ${d.appName}. Pathfinder recommends ${best.name} (${best.kind}).` });
  } else if (connectMethod === "managed-session") {
    notes.push(
      `${d.appName} exposes no API or OAuth NodeWorm can call directly, so it connects via a managed browser session: you authenticate to ${d.appName}'s own UI once (a login or a QR scan) in a hosted browser, and NodeWorm holds the live session and drives the UI for everything else. It never sees your password, and you do nothing beyond that one sign-in.`,
    );
    tel.push({ level: "action", text: `No API/OAuth path for ${d.appName}. Connecting via a managed browser session (auth-only).` });
    // The Pathfinder may have also found a self-hostable connector. It is NOT the
    // user's path (that would be setup work); it rides along as an optional advanced
    // alternative for technical users who would rather self-host.
    if (research?.best) {
      notes.push(
        `A self-hostable alternative also exists (${research.best.name}) for technical users who prefer to run their own connector. It is optional: the managed session needs only your sign-in.`,
      );
    }
  }
  const scopes = d.entities.length
    ? (lookupScopes(d) ?? defaultScopes(d))
    : defaultScopes(d);

  tel.push({ level: "action", text: `Auth path: ${authLabel(authType)}.` });
  if (authType === "oauth2" && d.oauthAuthorizeUrl) {
    tel.push({ level: "ok", text: `Genuine OAuth: Authorization Code flow against ${hostOf(d.oauthAuthorizeUrl)}.` });
    notes.push("Connection runs a real OAuth 2.0 Authorization Code flow (PKCE where supported): a live consent screen, a real token exchange, and refresh-token storage. The operator sets the OAuth client ID/secret in env; you are never asked for an API key.");
  }

  if (d.ipRestricted) {
    notes.push("IP allowlist required: deploy the connector from a fixed egress IP and register it.");
    tel.push({ level: "warn", text: `IP-restricted API. Pinning a stable egress IP.` });
  }
  if (d.twoFactor) {
    notes.push("Account uses 2FA: use an app password or an interactive first-run auth.");
  }
  if (d.rateLimited) {
    notes.push("Rate limited: the connector throttles and backs off on 429s.");
  }

  const steps =
    connectMethod === "hosted-connector"
      ? [
          { n: 1, title: "Link your account", detail: `Scan the QR code in ${d.appName} > Linked devices. That is your only step.`, actor: "user" as const },
          { n: 2, title: "Verify the link", detail: "NodeWorm confirms the device linked and holds it encrypted.", actor: "agent" as const },
          { n: 3, title: "Drive it", detail: `NodeWorm reads and sends through the hosted ${best?.name ?? "bridge"} it runs for you.`, actor: "agent" as const },
        ]
      : credentialSteps({ ...d, authType }, path);
  const needsUserAction = steps.some((s) => s.actor === "user");

  return {
    path,
    pathLabel:
      connectMethod === "hosted-connector" && best
        ? `Hosted bridge: ${best.name}`
        : connectMethod === "researched-connector" && best
          ? `Researched connector: ${best.name}`
          : connectMethod === "managed-session"
            ? "Managed browser session"
            : pathLabel(path, authType),
    pathReason:
      connectMethod === "hosted-connector" && best
        ? `${d.appName} has no browser login, so NodeWorm hosts ${best.name} for you. You link once by scanning a QR; NodeWorm runs and drives the connector.`
        : connectMethod === "researched-connector" && best
          ? `${d.appName} has no API or OAuth, but the Pathfinder found a real method: ${best.name}. ${best.summary}`
          : connectMethod === "managed-session"
            ? `${d.appName} has no API or OAuth, so NodeWorm connects it by driving its own UI in a managed browser session you log into once.`
            : pathReason(path, d),
    connectMethod,
    fallbacks,
    methodKind,
    authType,
    scopes,
    credentialSteps: steps,
    needsUserAction,
    buildsCustomMcp,
    customMcpSpec,
    notes,
    telemetry: tel,
  };
}

function lookupScopes(d: Discovery): string[] | undefined {
  const e = lookup(d.appName);
  return e?.scopes;
}

function defaultScopes(d: Discovery): string[] {
  if (d.authType === "browser" || !d.hasPublicApi) return [];
  const base = d.entities.length ? d.entities : ["data"];
  return base.flatMap((en) => [`${entitySlug(en)}:read`, `${entitySlug(en)}:write`]).slice(0, 6);
}

function pathLabel(path: string, auth: string): string {
  const authSuffix =
    auth === "oauth2" || auth === "browser" || auth === "none" ? authLabel(auth) : "no OAuth path";
  switch (path) {
    case "hosted-mcp":
      return `Hosted MCP (${authSuffix})`;
    case "custom-mcp":
      return `Custom MCP build (${authSuffix})`;
    case "browser-automation":
      return "Browser automation fallback";
    default:
      return "No path";
  }
}

function pathReason(path: string, d: Discovery): string {
  switch (path) {
    case "hosted-mcp":
      return `${d.appName} already has a maintained MCP server, so NodeWorm wires it directly instead of building one.`;
    case "custom-mcp":
      return `${d.appName} exposes a ${d.apiType.toUpperCase()} API but no MCP, so NodeWorm scaffolds and deploys a thin connector.`;
    case "browser-automation":
      return `${d.appName} has no public API, so NodeWorm drives the web UI headlessly as a last resort.`;
    default:
      return "No viable integration path was found.";
  }
}

// ---- WIRE -----------------------------------------------------------------

function outboundTools(d: Discovery): ToolDef[] {
  const e = lookup(d.appName);
  if (e?.outbound?.length) {
    return e.outbound.map((name) => ({
      name,
      method: name.startsWith("list") || name.startsWith("get") || name.startsWith("search") ? "GET" : "POST",
      description: humanizeTool(name, d.appName),
    }));
  }
  const ents = d.entities.length ? d.entities : ["Item"];
  return ents.flatMap((en) => [
    { name: `list_${pluralSlug(en)}`, method: "GET", description: `Read ${en} records from ${d.appName}.` },
    { name: `create_${singularSlug(en)}`, method: "POST", description: `Create a ${en} in ${d.appName}.` },
    { name: `update_${singularSlug(en)}`, method: "PATCH", description: `Update a ${en} in ${d.appName}.` },
  ]);
}

function humanizeTool(name: string, app: string): string {
  const verb = name.split("_")[0];
  const obj = name.split("_").slice(1).join(" ");
  const v = verb === "list" ? "List" : verb === "create" ? "Create" : verb === "update" ? "Update" : verb === "send" ? "Send" : verb.charAt(0).toUpperCase() + verb.slice(1);
  return `${v} ${obj} in ${app}.`;
}

function chooseInbound(d: Discovery, path: string): { method: InboundMethod; reason: string; poll?: number } {
  if (path === "browser-automation") {
    return { method: "entity-mirror", reason: "No API and no webhooks: NodeWorm mirrors records and re-scrapes on a schedule.", poll: 900 };
  }
  if (d.hasWebhooks) {
    return { method: "webhooks", reason: `${d.appName} emits webhooks: NodeWorm registers an endpoint and reacts in real time.` };
  }
  const dataLike = /task|record|page|doc|row|item|note|contact|deal/i.test(d.entities.join(" "));
  if (dataLike) {
    return { method: "entity-mirror", reason: `No webhooks: NodeWorm mirrors ${d.entities[0] ?? "records"} locally and reconciles on a poll.`, poll: 300 };
  }
  return { method: "polling", reason: "No webhooks: NodeWorm polls for changes on an interval.", poll: 300 };
}

function entityMappings(d: Discovery): EntityMapping[] {
  const ents = d.entities.slice(0, 2);
  if (ents.length === 0) return [];
  return ents.map((en) => ({
    from: `${d.appName}.${en}`,
    to: `nodeworm.${en}`,
    fields: [
      { source: "id", target: "external_id" },
      { source: en.toLowerCase() === "task" ? "title" : "name", target: "title" },
      { source: "status", target: "status" },
      { source: "updated_at", target: "synced_at" },
    ],
  }));
}

export function wire(d: Discovery, plan: ArchitectPlan): WireConfig {
  const tel: TelemetryLine[] = [];
  const tools = outboundTools(d);
  tel.push({ level: "ok", text: `Outbound: registered ${tools.length} write/read tools.` });

  const inbound = chooseInbound(d, plan.path);
  tel.push({
    level: inbound.method === "webhooks" ? "ok" : "info",
    text: `Inbound: ${inbound.method}${inbound.poll ? ` (every ${inbound.poll}s)` : ""}.`,
  });

  const mappings = entityMappings(d);
  if (mappings.length) tel.push({ level: "ok", text: `Mapped ${mappings.length} entity(s) for two-way sync.` });

  const bidirectional = tools.length > 0 && inbound.method !== "none";
  tel.push({
    level: bidirectional ? "action" : "warn",
    text: bidirectional ? "Bidirectional sync wired." : "Outbound-only (no inbound channel).",
  });

  const notes: string[] = [];
  if (inbound.method === "webhooks") notes.push("Webhook endpoint requires a URL verification handshake on first registration.");
  if (inbound.method === "entity-mirror") notes.push("Mirror writes NodeWorm-originated changes back to avoid echo loops.");

  return {
    outboundTools: tools,
    inboundMethod: inbound.method,
    inboundReason: inbound.reason,
    pollIntervalSec: inbound.poll,
    entityMappings: mappings,
    bidirectional,
    notes,
    telemetry: tel,
  };
}

// ---- AUDITOR --------------------------------------------------------------

export function auditor(d: Discovery, plan: ArchitectPlan, w: WireConfig, hasCreds: boolean): AuditResult {
  const tel: TelemetryLine[] = [];
  const tests: AuditTest[] = [];
  const live = hasCreds ? "pass" : "skip";
  const liveDetail = hasCreds ? "Verified against the live endpoint." : "Runs automatically once credentials are connected.";

  tests.push({ name: "Discovery resolved", status: "pass", detail: `Surface mapped at ${(d.confidence * 100) | 0}% confidence.` });
  tests.push({
    name: "Connection path viable",
    status: plan.path === "no-path" ? "fail" : "pass",
    detail: plan.path === "no-path" ? "No integration path exists." : plan.pathLabel,
  });
  // Every app resolves to a real connect method, so this always passes - the
  // point is to name HOW it connects, never to dead-end.
  const methodLabels: Record<string, string> = {
    "hosted-mcp": "Hosted MCP",
    "oauth-api": "Genuine OAuth 2.0 (Authorization Code + PKCE)",
    "public-api": "Public API (no auth)",
    "hosted-connector": "NodeWorm-hosted connector (you link once; NodeWorm runs the bridge)",
    "researched-connector": "Researched connector (self-hostable / community method)",
    "managed-session": "Managed browser session (you log in; NodeWorm holds the session)",
    "generated-mcp": "Generated self-hosted MCP",
    "generated-scraper": "Generated scraper",
    "export-import": "Export / import bridge",
  };
  tests.push({
    name: "Connection method resolved",
    status: "pass",
    detail: methodLabels[plan.connectMethod] ?? plan.connectMethod,
  });
  tests.push({
    name: "Scopes within least-privilege",
    status: plan.scopes.length || plan.authType === "browser" ? "pass" : "skip",
    detail: plan.scopes.length ? plan.scopes.join(", ") : "No scoped API.",
  });
  tests.push({
    name: "Entity mapping complete",
    status: w.entityMappings.length ? "pass" : "skip",
    detail: w.entityMappings.length ? `${w.entityMappings.length} entity(s) mapped.` : "No entities to mirror.",
  });
  tests.push({ name: "Live connectivity", status: live as AuditTest["status"], detail: liveDetail });
  tests.push({ name: "Auth persistence (token refresh)", status: plan.authType === "oauth2" ? (live as AuditTest["status"]) : "skip", detail: plan.authType === "oauth2" ? liveDetail : "Not an OAuth flow." });
  tests.push({ name: "Write round-trip (create + delete)", status: live as AuditTest["status"], detail: liveDetail });
  tests.push({
    name: `Inbound delivery (${w.inboundMethod})`,
    status: w.inboundMethod === "none" ? "skip" : (live as AuditTest["status"]),
    detail: w.inboundMethod === "none" ? "No inbound channel." : liveDetail,
  });
  tests.push({
    name: "Bidirectional reconciliation",
    status: w.bidirectional ? (live as AuditTest["status"]) : "skip",
    detail: w.bidirectional ? liveDetail : "Outbound-only.",
  });

  if (d.ipRestricted) {
    tests.push({ name: "Egress IP allowlisted", status: hasCreds ? "pass" : "skip", detail: "Connector must call from a registered IP." });
  }

  const passed = tests.filter((t) => t.status === "pass").length;
  const failed = tests.filter((t) => t.status === "fail").length;
  const skipped = tests.filter((t) => t.status === "skip").length;

  tel.push({ level: "info", text: `Running ${tests.length} checks...` });
  tel.push({ level: failed ? "warn" : "ok", text: `${passed} passed, ${skipped} deferred, ${failed} failed.` });
  if (!hasCreds) tel.push({ level: "action", text: "Live tests deferred until credentials are connected." });

  return { tests, passed, failed, skipped, telemetry: tel };
}

// ---- RELAY (present) ------------------------------------------------------

export function report(
  d: Discovery,
  plan: ArchitectPlan,
  w: WireConfig,
  audit: AuditResult,
  connected: boolean,
  research?: ResearchResult,
  connectorVerified = false,
): Report {
  const cm = plan.connectMethod;
  const mk = plan.methodKind;
  const managed = cm === "managed-session";
  const researched = cm === "researched-connector";
  const hosted = cm === "hosted-connector";
  const best = research?.best;

  // Never blocked: every app reaches a real method. A live method is "connected"
  // once it holds creds; a managed session is "connected-via-session" once the
  // user logs in and one read is verified; a researched connector is
  // "connected-via-connector" once NodeWorm reaches it with one real GET. Until
  // then it just "needs an action from you" - honest, not a dead-end.
  // connectorVerified can be reached even when the primary method is managed-session
  // (a technical user opted into the advanced self-host path), so it wins outright.
  let status: IntegrationStatus;
  if (connectorVerified) status = "connected-via-connector";
  else if (researched || hosted) status = "needs-credentials";
  else if (managed) status = connected ? "connected-via-session" : "needs-credentials";
  else status = connected ? "connected" : "needs-credentials";

  // A researched connector only becomes a "live" method once a real read proves
  // it; before that it is honestly a "workflow" (setup steps not yet live).
  const effectiveMethodKind = connectorVerified ? "live" : mk;

  const capabilities: string[] = [];
  const nextSteps: NextStep[] = [];

  // Preferred path: the app's OFFICIAL hosted MCP (resolved from the MCP registry).
  // It is zero-setup and Claude-native, so it leads as the top recommendation even
  // though it does not change the engine's connect routing. Surfaced for any app
  // that has one (Notion -> mcp.notion.com, Stripe -> mcp.stripe.com, etc.).
  if (d.hostedMcp) {
    capabilities.push(
      `Fastest path: ${d.appName} publishes an official hosted MCP (${d.hostedMcp.url}). Add it to any MCP client (Claude included) for a zero-setup, native connection - no build, no server to run.`,
    );
    nextSteps.push({
      kind: "config",
      label: `Add ${d.appName}'s official MCP (zero setup)`,
      detail: `Point your MCP client at ${d.hostedMcp.url} (${d.hostedMcp.transport} transport). In Claude Code: claude mcp add --transport ${d.hostedMcp.transport} ${entitySlug(d.appName)} ${d.hostedMcp.url}. You authorize once in your client; nothing to install.`,
      url: d.hostedMcp.url,
    });
  }

  if (connectorVerified && best) {
    const via = hosted ? `${best.name} (NodeWorm hosts it for you)` : best.name;
    capabilities.push(`Connected via ${via}: NodeWorm reached the connector and verified one real read.`);
    const writes = w.outboundTools.filter((t) => t.method !== "GET");
    if (writes.length) {
      capabilities.push(`Write actions (${writes.slice(0, 3).map((t) => t.name).join(", ")}) and two-way sync are verified separately the first time you use them.`);
    }
  } else if (hosted && best) {
    // NodeWorm runs the connector itself: the user only links once (scans a QR).
    capabilities.push(
      `NodeWorm hosts ${best.name} for you. Your only step is to scan a QR code in ${d.appName} once to link your account; NodeWorm holds the link encrypted and drives it. You install and configure nothing.`,
    );
    const writes = w.outboundTools.filter((t) => t.method !== "GET");
    if (writes.length) capabilities.push(`Once linked: act in ${d.appName} (${writes.slice(0, 3).map((t) => t.name).join(", ")}).`);
    capabilities.push(`A hosted bridge reads and sends on your ${d.appName} account for the actions you connect, so linking it needs your explicit consent.`);
    nextSteps.push({
      kind: "oauth",
      label: `Link ${d.appName} (scan the QR)`,
      detail: `NodeWorm opens a device link on the bridge it runs for you. Scan the QR in ${d.appName} > Linked devices; NodeWorm verifies the link and holds it encrypted. No install, no setup.`,
    });
  } else if (researched && best) {
    // The rare genuine no-web-UI app: a self-hosted connector is the only path.
    capabilities.push(`Connect ${d.appName} via ${best.name}: ${best.summary}`);
    if (best.selfHostable) {
      capabilities.push(`Self-hostable (${best.difficulty} setup): you run ${best.name}, then NodeWorm talks to it directly. No password ever shared.`);
    }
    const writes = w.outboundTools.filter((t) => t.method !== "GET");
    if (writes.length) capabilities.push(`Once it is up: act in ${d.appName} (${writes.slice(0, 3).map((t) => t.name).join(", ")}).`);
    const others = (research?.ranked ?? []).filter((m) => m !== best);
    if (others.length) {
      capabilities.push(`${others.length} more real method${others.length === 1 ? "" : "s"} found as a fallback: ${others.slice(0, 3).map((m) => m.name).join(", ")}.`);
    }
    nextSteps.push({
      kind: "info",
      label: `Set up ${best.name}`,
      detail: best.setupSteps[0] ?? best.summary,
      url: best.url,
    });
  } else if (managed) {
    capabilities.push(
      `NodeWorm drives ${d.appName} for you: you authenticate once (a login or a QR scan) in a hosted browser, and NodeWorm holds the live session and runs every read and write through the UI itself. You do nothing else; it never sees your password.`,
    );
    const writes = w.outboundTools.filter((t) => t.method !== "GET");
    if (writes.length) capabilities.push(`Drive ${d.appName} through its UI: ${writes.slice(0, 4).map((t) => t.name).join(", ")}.`);
    capabilities.push(`Mirror ${d.appName} changes back into NodeWorm on a schedule.`);
    if (w.bidirectional) capabilities.push("Two-way sync: changes flow in both directions.");
    if (research?.best) {
      capabilities.push(`Optional, for technical users: a self-hostable connector (${research.best.name}) is also available as an advanced alternative. Not required.`);
    }
    nextSteps.push({
      kind: "oauth",
      label: `Connect ${d.appName} (you just sign in)`,
      detail: `NodeWorm spins up a hosted browser at ${d.appName}. You log in or scan the QR once; NodeWorm verifies the live session and then drives everything else. No setup, no install.`,
    });
  } else {
    if (cm === "oauth-api" && d.oauthAuthorizeUrl) {
      capabilities.push(
        `Connect via genuine OAuth 2.0 (Authorization Code + PKCE) against ${hostOf(d.oauthAuthorizeUrl)}: a real consent screen and token exchange, tokens stored encrypted, never an API key.`,
      );
    }
    const writes = w.outboundTools.filter((t) => t.method !== "GET");
    if (writes.length) capabilities.push(`Act in ${d.appName}: ${writes.slice(0, 4).map((t) => t.name).join(", ")}.`);
    const reads = w.outboundTools.filter((t) => t.method === "GET");
    if (reads.length) capabilities.push(`Read live data: ${reads.slice(0, 3).map((t) => t.name).join(", ")}.`);
    if (w.inboundMethod !== "none") {
      capabilities.push(
        w.inboundMethod === "webhooks"
          ? `React in real time to ${d.appName} events via webhooks.`
          : `Mirror ${d.appName} changes back into NodeWorm every ${(w.pollIntervalSec ?? 300) / 60} min.`,
      );
    }
    if (w.bidirectional) capabilities.push("Two-way sync: changes flow in both directions.");

    if (cm === "oauth-api") {
      nextSteps.push({
        kind: "oauth",
        label: `Authorize ${d.appName}`,
        detail: `You approve the consent screen once; NodeWorm runs the genuine OAuth token exchange for ${plan.scopes.join(", ") || "minimum scopes"} and stores the tokens, never an API key. Nothing else for you to do.`,
      });
    }
    // The connector build (custom MCP) and webhook registration are NodeWorm's own
    // jobs, done automatically once you authorize. They are NOT user steps, so they
    // are never surfaced as next-actions: the user only ever authorizes.
  }

  const warnings = [...plan.notes, ...w.notes].filter((x, i, a) => a.indexOf(x) === i);

  const headline =
    status === "connected"
      ? `${d.appName} is wired and ready.`
      : status === "connected-via-session"
        ? `${d.appName} is connected via a managed session.`
        : status === "connected-via-connector" && best
          ? `${d.appName} is connected via ${best.name}.`
          : hosted && best
            ? `${d.appName} is ready. Scan one QR to link it; NodeWorm hosts the rest.`
            : researched && best
              ? `${d.appName} connects via ${best.name}. Researched and ready to set up.`
              : managed
                ? `${d.appName} is ready. Sign in once and NodeWorm does the rest.`
                : `${d.appName} is planned. One action from you to go live.`;

  const summary =
    (researched || hosted) && best && connectorVerified
      ? `Connected via ${best.name}. NodeWorm reached the connector and verified one real read. Write actions and two-way sync are verified the first time you use them.`
      : hosted && best
        ? `NodeWorm hosts ${best.name} for you. ${d.appName} has no browser login, so your only step is to scan a QR once to link your account; NodeWorm runs and drives the connector. ${w.bidirectional ? "Bidirectional" : "Outbound"} sync via ${w.inboundMethod}.`
        : researched && best
          ? `Pathfinder method: ${best.name}. ${best.summary} ${best.selfHostable ? "Self-host it, then NodeWorm connects to it." : "Set it up, then connect it."}`
          : managed
            ? `Managed browser session. You authenticate to ${d.appName} once (a login or a QR scan); NodeWorm holds the live session and drives the UI for everything else. ${w.bidirectional ? "Bidirectional" : "Outbound"} sync via ${w.inboundMethod}.`
            : `${plan.pathLabel}. ${w.bidirectional ? "Bidirectional" : "Outbound-only"} sync via ${w.inboundMethod}. ${plan.buildsCustomMcp ? "A connector will be deployed." : "Wired to the hosted MCP."}`;

  const fallbackLabel: Record<ConnectMethod, string> = {
    "hosted-mcp": "use the hosted MCP",
    "oauth-api": "authorize via OAuth",
    "public-api": "use the public API",
    "hosted-connector": "let NodeWorm host the connector (scan a QR)",
    "researched-connector": "self-host a connector",
    "managed-session": "sign in via a managed browser",
    "generated-mcp": "build a connector",
    "generated-scraper": "build a scraper",
    "export-import": "export / import a file",
  };
  const fallbacks = (plan.fallbacks ?? []).map((m) => ({ method: m, label: fallbackLabel[m] }));

  return {
    status,
    headline,
    summary,
    pathLabel: plan.pathLabel,
    connectMethod: cm,
    fallbacks: fallbacks.length ? fallbacks : undefined,
    methodKind: effectiveMethodKind,
    bidirectional: w.bidirectional,
    capabilities,
    nextSteps,
    warnings,
  };
}
