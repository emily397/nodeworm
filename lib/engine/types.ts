// NodeWorm - Autonomous Bidirectional Integration Engine
// Core type system shared by the engine, store, API and UI.

export type AuthType = "oauth2" | "apikey" | "none" | "browser" | "unknown";

export type IntegrationPath =
  | "hosted-mcp" // an MCP server already exists for this app
  | "browser-automation" // no API: drive the UI headlessly
  | "custom-mcp" // API exists but no MCP: build + deploy one
  | "no-path"; // dead end

export type PhaseId = "scout" | "architect" | "wire" | "auditor" | "present";

export type PhaseStatus = "pending" | "running" | "done" | "blocked" | "skipped";

export type IntegrationStatus =
  | "draft"
  | "running"
  | "planned"
  | "needs-credentials"
  | "needs-verification" // a token/session is held but not yet proven with a real call
  | "connected"
  | "connected-via-session" // a live authenticated managed browser session is held
  | "connected-via-connector" // a self-hosted connector was reached + verified with one real read
  | "generated" // a real connector was built; not live until the user deploys it
  | "blocked";

// How NodeWorm connects an app. The decision tree always lands on one of these:
// there is always a method, so "blocked" is unreachable for any login-able app.
export type ConnectMethod =
  | "hosted-mcp"
  | "oauth-api"
  | "public-api"
  | "hosted-connector" // NodeWorm HOSTS the connector (e.g. signal-cli-rest-api); user only links once (scan a QR)
  | "researched-connector" // autonomous research found a real method (self-host wrapper, community node, CLI...)
  | "managed-session" // the universal floor: drive the app's own UI in a managed browser
  | "generated-mcp"
  | "generated-scraper"
  | "export-import";

// What a connectMethod actually delivers, so nothing is overclaimed.
export type MethodKind = "live" | "managed-session" | "generated" | "workflow";

export type TelemetryLevel = "info" | "ok" | "warn" | "action" | "scan";

export interface TelemetryLine {
  level: TelemetryLevel;
  text: string;
}

// ---- Phase 1: SCOUT -------------------------------------------------------

export interface Discovery {
  appName: string;
  appUrl?: string;
  category: string;
  blurb: string;
  hasPublicApi: boolean;
  apiType: "rest" | "graphql" | "grpc" | "sdk" | "none" | "unknown";
  authType: AuthType;
  authMethods: AuthType[];
  hasHostedMcp: boolean;
  mcpName?: string;
  mcpTransport?: "sse" | "stdio" | "http";
  // The app's OFFICIAL hosted (remote, no-self-host) MCP, resolved from the
  // Model Context Protocol registry: the zero-setup, Claude-native way to connect
  // big SaaS apps (Notion -> mcp.notion.com, Stripe -> mcp.stripe.com, Linear ->
  // mcp.linear.app). Surfaced as the preferred recommendation without changing the
  // connect routing. Absent when no official hosted MCP exists.
  hostedMcp?: { name: string; url: string; transport: "http" | "sse" };
  docsUrl?: string;
  developerPortalUrl?: string;
  // The actual browser URL where a user AUTHENTICATES this app for a managed
  // session: a login form or a QR-link web client (e.g. web.whatsapp.com). The
  // managed-session opener navigates here so the user lands on a real auth screen,
  // never the marketing homepage. Absent for apps with no browser login.
  loginUrl?: string;
  // True for apps that have NO browser-based login at all (e.g. Signal, which is
  // mobile/desktop only). These cannot be connected by a managed browser session;
  // the engine routes them to a real connector instead of opening a dead web page.
  noWebClient?: boolean;
  oauthAuthorizeUrl?: string;
  oauthTokenUrl?: string;
  oauthScopes?: string[];
  oauthTokenAuth?: "body" | "basic"; // how the token endpoint takes client creds
  oauthScopeSep?: string; // scope delimiter (" " for most, "," for a few)
  hasWebhooks: boolean;
  rateLimited: boolean;
  ipRestricted: boolean;
  twoFactor: boolean;
  confidence: number; // 0..1
  source: "knowledge-base" | "heuristic" | "llm" | "probe";
  entities: string[];
  notes: string[];
  telemetry: TelemetryLine[];
  probe?: ProbeEvidence; // live reconnaissance, when the target was reachable
}

// ---- Live reconnaissance ("reverse engineering") --------------------------
// What an actual probe of the target's public discovery surfaces found. Every
// hit records the real URL + HTTP status so the evidence is auditable, never
// fabricated. Populated by lib/engine/probe.ts (server-only), surfaced on the
// Discovery so the Architect/Wire phases can act on real endpoints.

export interface ProbeEndpoint {
  kind:
    | "oauth-metadata" // RFC 8414 /.well-known/oauth-authorization-server
    | "openid" // OpenID Connect discovery
    | "openapi" // OpenAPI / Swagger spec
    | "mcp" // Model Context Protocol manifest or endpoint
    | "ai-plugin" // /.well-known/ai-plugin.json
    | "ai-openai" // OpenAI-compatible API (e.g. GET /v1/models)
    | "graphql" // a live GraphQL endpoint answering an introspection query
    | "auth-header"; // WWW-Authenticate challenge on a protected route
  url: string;
  status: number; // real HTTP status (0 = transport error / unreachable)
  detail?: string;
}

export interface ProbeEvidence {
  reachable: boolean;
  origins: string[]; // origins actually probed
  // OAuth, read from live authorization-server / OIDC / OpenAPI metadata.
  oauthAuthorizeUrl?: string;
  oauthTokenUrl?: string;
  oauthScopes?: string[];
  registrationEndpoint?: string; // dynamic client registration, if advertised
  // MCP.
  hasHostedMcp?: boolean;
  mcpName?: string;
  mcpTransport?: "sse" | "stdio" | "http";
  mcpUrl?: string;
  // AI endpoints.
  aiOpenAiCompatible?: boolean;
  aiPluginManifestUrl?: string;
  aiEndpoints: string[];
  // REST / OpenAPI.
  openApiUrl?: string;
  graphqlUrl?: string; // a live GraphQL endpoint that answered introspection
  apiType?: "rest" | "graphql";
  pathCount?: number;
  hasWebhooks?: boolean;
  authType?: AuthType; // inferred from securitySchemes / auth challenge
  entities?: string[];
  hits: ProbeEndpoint[];
  telemetry: TelemetryLine[];
}

// ---- Autonomous research (Pathfinder) -------------------------------------
// When an app has no API / OAuth / hosted MCP NodeWorm can call directly, the
// Pathfinder researches every real, documented way to connect it: self-hostable
// REST wrappers, official + community CLIs, desktop-automation bots, community
// nodes (n8n / Home Assistant / Zapier / Make), documented unofficial APIs, or a
// file export/import path. It surfaces the best/easiest real method rather than
// dead-ending. Model-derived, so it is labelled "researched" (verify the link),
// never claimed as already live. Populated server-side (lib/engine/research.ts).

export type ResearchKind =
  | "web-client" // the app's own official web interface, driveable via managed browser session
  | "mcp-server" // a community / third-party MCP server for the app (Claude speaks MCP natively)
  | "rest-wrapper" // a self-hostable REST API around the app (e.g. signal-cli-rest-api)
  | "cli" // an official or community command-line tool
  | "desktop-bot" // drives the installed desktop app (e.g. a CDP hook)
  | "community-node" // an n8n / Home Assistant / Zapier / Make integration
  | "unofficial-api" // a documented reverse-engineered API
  | "official-api" // a real official API the first-pass discovery missed
  | "export-import" // a file export / import path
  | "reverse-api-capture"; // active network-traffic capture to discover hidden endpoints + generate a working client

export interface ResearchMethod {
  kind: ResearchKind;
  name: string;
  summary: string;
  url?: string; // real repo or docs URL, when known
  urlVerified?: boolean; // true when the URL was checked and actually resolves (live link, not model recall)
  selfHostable: boolean;
  difficulty: "easy" | "moderate" | "advanced";
  reliability: "high" | "medium" | "low";
  setupSteps: string[];
}

export interface ResearchResult {
  ranked: ResearchMethod[];
  best?: ResearchMethod; // the recommended method (strong + easiest), if any is strong enough
  summary: string;
  telemetry: TelemetryLine[];
}

// ---- Phase 2: ARCHITECT ---------------------------------------------------

export interface Step {
  n: number;
  title: string;
  detail: string;
  actor: "agent" | "user";
}

export interface CustomMcpSpec {
  language: "python" | "typescript";
  framework: string;
  deployTarget: string;
  tools: string[];
}

export interface ArchitectPlan {
  path: IntegrationPath;
  pathLabel: string;
  pathReason: string;
  connectMethod: ConnectMethod;
  fallbacks?: ConnectMethod[]; // viable alternative methods, in order, for self-repair on failure
  methodKind: MethodKind;
  authType: AuthType;
  scopes: string[];
  credentialSteps: Step[];
  needsUserAction: boolean;
  buildsCustomMcp: boolean;
  customMcpSpec?: CustomMcpSpec;
  notes: string[];
  telemetry: TelemetryLine[];
}

// ---- Phase 3: WIRE --------------------------------------------------------

export interface ToolDef {
  name: string;
  method: string;
  description: string;
}

export interface FieldMap {
  source: string;
  target: string;
}

export interface EntityMapping {
  from: string;
  to: string;
  fields: FieldMap[];
}

export type InboundMethod = "webhooks" | "polling" | "entity-mirror" | "none";

export interface WireConfig {
  outboundTools: ToolDef[];
  inboundMethod: InboundMethod;
  inboundReason: string;
  pollIntervalSec?: number;
  entityMappings: EntityMapping[];
  bidirectional: boolean;
  notes: string[];
  telemetry: TelemetryLine[];
}

// ---- Phase 4: AUDITOR -----------------------------------------------------

export interface AuditTest {
  name: string;
  status: "pass" | "fail" | "skip";
  detail: string;
}

export interface AuditResult {
  tests: AuditTest[];
  passed: number;
  failed: number;
  skipped: number;
  telemetry: TelemetryLine[];
}

// ---- Phase 5: PRESENT -----------------------------------------------------

export interface NextStep {
  kind: "oauth" | "config" | "info";
  label: string;
  detail: string;
  url?: string;
}

export interface Report {
  status: IntegrationStatus;
  headline: string;
  summary: string;
  pathLabel: string;
  connectMethod: ConnectMethod;
  fallbacks?: Array<{ method: ConnectMethod; label: string }>; // other ways to connect, if this one fails
  methodKind: MethodKind;
  bidirectional: boolean;
  capabilities: string[];
  nextSteps: NextStep[];
  warnings: string[];
}

// ---- Record ---------------------------------------------------------------

export interface Phase {
  id: PhaseId;
  label: string;
  agent: string;
  tagline: string;
  status: PhaseStatus;
  startedAt?: number;
  finishedAt?: number;
}

export interface SecretRef {
  name: string;
  maskedValue: string;
  addedAt: number;
}

// ---- Self-recovering OAuth acquisition ------------------------------------
// When an app's OAuth client is not pre-configured, NodeWorm does not dead-end:
// a resolver walks credential tiers (env -> encrypted vault -> dynamic client
// registration -> guided portal) and either resolves a client or hands back a
// guided "crack it" recipe. Every degrade is recorded honestly.

export interface CredCtx {
  connectionId?: string;
  userId?: string;
}

export type RecoveryTier = "env" | "vault" | "dcr" | "guided" | "extension" | "cloud";

// The honest ToS / account-risk position for automating an app's OWN developer
// portal (driving the user's own portal session to register an OAuth client).
// Gated portals (Shopify, Google, Stripe, Intuit, Salesforce, Xero) carry this:
// the user must consent to the accurate caveat before NodeWorm automates, and
// some (risk "blocked"/allowAutomation:false) stay manual-only.
export interface PortalAutomation {
  risk: "low" | "medium" | "high" | "blocked";
  caveat: string;
  allowAutomation: boolean;
}

// The app-specific steps to register an OAuth client on the provider's own
// developer portal. The user does the portal clicks + login; NodeWorm supplies
// the exact redirect URI and scopes and captures the pasted-back client creds.
export interface GuidedRecipe {
  app: string;
  portalUrl: string;
  steps: string[];
  scopes: string[];
  redirectUri: string;
  notes: string[];
  requiresApproval?: boolean; // honest terminal: provider gates registration behind manual review
  aiResearched?: boolean; // steps came from live model research, not a curated recipe
  automatable?: boolean; // the NodeWorm Helper extension may drive this app's portal (allowlist only)
  portalAutomation?: PortalAutomation; // accurate ToS/account-risk caveat for automating this portal
}

export interface RecoveryAttempt {
  tier: RecoveryTier;
  at: number;
  outcome: "used" | "degraded" | "blocked";
  reason?: string;
}

export interface Integration {
  id: string;
  appName: string;
  appUrl?: string;
  userId?: string; // owner when created while signed in; absent for anonymous runs
  status: IntegrationStatus;
  createdAt: number;
  updatedAt: number;
  currentPhase: number; // index into phases (0..5; 5 == complete)
  phases: Phase[];
  discovery?: Discovery;
  plan?: ArchitectPlan;
  wire?: WireConfig;
  audit?: AuditResult;
  report?: Report;
  mode: "ai" | "heuristic";
  secrets: SecretRef[];
  // Transient OAuth handshake state, written when the consent redirect starts
  // and cleared once the callback exchanges the code. Never holds a token.
  oauth?: { state: string; verifier?: string; redirectUri: string; startedAt: number };
  // Guided "crack it" recipe surfaced when the OAuth client must be registered.
  recovery?: GuidedRecipe;
  // Honest transcript of why each recovery tier was used or degraded.
  recoveryAttempts?: RecoveryAttempt[];
  // Active cloud co-browse session (Browserbase). connectUrl is server-only and
  // stripped before the record reaches the client (it controls the remote browser).
  cobrowse?: { sessionId: string; connectUrl: string; liveViewUrl: string; startedAt: number };
  // Active AI-browser-agent run (Browser Use Cloud, Skyvern fallback) that registers
  // the OAuth app on the provider's portal autonomously. liveViewUrl is embedded in
  // NodeWorm so the user can sign in inside it; the agent does everything else. taskId
  // is the provider's session/run id. Cleared once creds are captured or the run ends.
  agentRun?: { taskId: string; liveViewUrl: string; provider: "browseruse" | "skyvern"; startedAt: number };
  // Managed browser session that IS the connection (R6 floor): the user logs into
  // the app's own UI in a Browserbase session whose auth persists in a Context.
  // contextId is the durable, encrypted pointer; verified flips on a real read.
  managedSession?: {
    contextId?: string;
    sessionId?: string;
    connectUrl?: string;
    liveViewUrl?: string;
    startedAt: number;
    verified?: boolean;
    verifiedDetail?: string;
    // Which hosted-browser provider backs this session, so it is released correctly.
    // NodeWorm tries Browserbase first, then falls back to Steel when Browserbase is
    // out of free minutes (HTTP 402) or unkeyed.
    provider?: "browserbase" | "steel";
    // Local fallback: when the hosted browser (Browserbase) is unavailable / out of
    // minutes, NodeWorm drives the user's OWN browser via the Helper extension. The
    // user signs in once in a real tab at loginUrl; the extension verifies it. No
    // hosted browser, no quota.
    local?: boolean;
    loginUrl?: string;
  };
  // Pathfinder research: real connection methods found when no direct API/OAuth/MCP
  // path exists (self-host wrappers, community nodes, CLIs). Drives the connect
  // method to "researched-connector" when a strong method is found.
  research?: ResearchResult;
  // A user's OWN self-hosted connector (e.g. signal-cli-rest-api) that NodeWorm
  // reaches over HTTP. Only client-safe display fields live here; the secret
  // { url, token } live ONLY in the vault. The token is the one the user set on
  // THEIR OWN wrapper, never the third-party app's API key. `verified` flips only
  // after one real read of the connector.
  connector?: {
    host: string;
    healthPath?: string;
    hasToken: boolean;
    reachableFrom?: "cloud" | "extension";
    private?: boolean;
    verified?: boolean;
    verifiedDetail?: string;
    verifiedAt?: number;
    registeredHint?: string;
    methodName?: string;
    methodKind?: ResearchKind;
  };
  // Explicit, recorded consent to automate a gated developer portal (Shopify,
  // Google, Stripe, etc.) after seeing the accurate ToS/account-risk caveat. Per run.
  portalConsent?: { app: string; risk: string; grantedAt: number; surface: "cobrowse" | "extension" };
  // Explicit consent to link a messaging app (Signal/WhatsApp/...) through a
  // NodeWorm-hosted bridge: the user acknowledges NodeWorm will hold a device link
  // and can read/send on their account for the actions they connect. Per run.
  connectorConsent?: { app: string; grantedAt: number };
  // Transient agentic-execution handshake: a one-time callback token tied to the
  // signed plan the NodeWorm Agent is running, so only the real Agent (running that
  // plan) can report the result back. Cleared once the plan finishes. Never a secret.
  execution?: { planId: string; callbackToken: string; createdAt: number; expiresAt: number };
  // Connect methods that failed (or the user skipped), excluded from re-architecting
  // so self-repair walks down the fallback ladder instead of re-offering a dead end.
  excludedMethods?: ConnectMethod[];
}

// ---- Bridge (app-to-app) --------------------------------------------------
// A bridge connects one app to another (App A <-> App B). Each side is a normal
// Integration (its own discovery, genuine-OAuth plan, wire), so a bridge reuses
// the per-app pipeline for both endpoints and adds the cross-app flow on top.

export type BridgeStatus = "running" | "planned" | "needs-credentials" | "connected" | "blocked";

export type BridgeDirection = "a-to-b" | "b-to-a" | "bidirectional" | "none";

export interface BridgeTrigger {
  direction: "a-to-b" | "b-to-a";
  when: string;
  then: string;
  via: InboundMethod;
}

export interface BridgeMapping {
  fromEntity: string;
  toEntity: string;
  fields: FieldMap[];
}

export interface BridgeFlow {
  direction: BridgeDirection;
  triggers: BridgeTrigger[];
  mappings: BridgeMapping[];
  connector: { framework: string; deployTarget: string };
  notes: string[];
  telemetry: TelemetryLine[];
}

export interface BridgeReport {
  status: BridgeStatus;
  headline: string;
  summary: string;
  capabilities: string[];
  nextSteps: NextStep[];
  warnings: string[];
}

export interface Bridge {
  id: string;
  createdAt: number;
  updatedAt: number;
  sourceId: string; // Integration id for App A
  targetId: string; // Integration id for App B
  sourceName: string;
  targetName: string;
  status: BridgeStatus;
  flow?: BridgeFlow;
  report?: BridgeReport;
}

export const PHASE_BLUEPRINT: Omit<Phase, "status">[] = [
  {
    id: "scout",
    label: "Discovery",
    agent: "Scout",
    tagline: "Maps the app's integration surface",
  },
  {
    id: "architect",
    label: "Credential Acquisition",
    agent: "Architect",
    tagline: "Chooses the connection path and auth",
  },
  {
    id: "wire",
    label: "Integration Config",
    agent: "Wire",
    tagline: "Designs bidirectional sync",
  },
  {
    id: "auditor",
    label: "Verification",
    agent: "Auditor",
    tagline: "Tests the live connection",
  },
  {
    id: "present",
    label: "Handoff",
    agent: "Relay",
    tagline: "Reports and surfaces next actions",
  },
];

export function freshPhases(): Phase[] {
  return PHASE_BLUEPRINT.map((p) => ({ ...p, status: "pending" as PhaseStatus }));
}
