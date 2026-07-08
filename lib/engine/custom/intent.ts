// Parses a free-text integration request into a structured intent. This is the
// front door for the custom mode: "export my Stripe customers into Notion",
// "migrate Asana tasks to Linear", "build an MCP for TickTick", "connect Slack".
// The model classifies + extracts the app(s); a deterministic heuristic is the
// fallback so it degrades without an LLM key. The honest plan/execute boundary
// (NodeWorm plans + scaffolds, does not yet deploy connectors) is enforced by
// the downstream report, not here.

import { chatJson, isLlmEnabled } from "../llm";

export type IntentKind = "bridge" | "connect" | "export" | "migrate" | "field-map" | "build-mcp" | "custom";

export interface IntentSpec {
  kind: IntentKind;
  source: string;
  target?: string;
  summary: string;
}

const SYSTEM = `Extract the integration intent from the user's request. Output ONLY a JSON object:
{ "kind": one of "bridge"|"connect"|"export"|"migrate"|"field-map"|"build-mcp"|"custom",
  "source": string (the primary app name or URL, exactly as written),
  "target": string (the second app, or "" if only one app is involved),
  "summary": string (one short sentence restating the goal) }.
"bridge"/"export"/"migrate"/"field-map" involve two apps (source then target). "connect"/"build-mcp" involve a single app. Pick the closest kind. Respond with JSON only.`;

const KINDS: IntentKind[] = ["bridge", "connect", "export", "migrate", "field-map", "build-mcp", "custom"];

export async function parseIntent(prompt: string): Promise<IntentSpec | null> {
  const raw = prompt.trim();
  if (!raw) return null;

  if (isLlmEnabled()) {
    const data = await chatJson(SYSTEM, raw);
    const source = typeof data?.source === "string" ? data.source.trim() : "";
    if (data && source) {
      const kind = KINDS.includes(data.kind as IntentKind) ? (data.kind as IntentKind) : "connect";
      const target = typeof data.target === "string" && data.target.trim() ? data.target.trim() : undefined;
      const summary = typeof data.summary === "string" && data.summary.trim() ? data.summary.trim() : raw;
      return { kind, source, target, summary };
    }
  }

  return heuristicIntent(raw);
}

// No LLM: split on common connectors and infer a kind from the verb.
function heuristicIntent(raw: string): IntentSpec {
  const verb = /\bexport\b/i.test(raw)
    ? "export"
    : /\bmigrat/i.test(raw)
      ? "migrate"
      : /\bmap\b/i.test(raw)
        ? "field-map"
        : /\bmcp\b/i.test(raw)
          ? "build-mcp"
          : null;
  const m = raw.match(/^(.*?)\s+(?:->|→|\binto\b|\bto\b|\band\b|\bwith\b)\s+(.*)$/i);
  if (m && m[1].trim() && m[2].trim()) {
    const source = stripVerb(m[1]);
    const target = m[2].trim().replace(/[.?!]+$/, "");
    return { kind: (verb ?? "bridge") as IntentKind, source, target, summary: raw };
  }
  const single = stripVerb(raw).replace(/[.?!]+$/, "");
  return { kind: (verb === "build-mcp" ? "build-mcp" : "connect") as IntentKind, source: single, summary: raw };
}

function stripVerb(s: string): string {
  return s
    .trim()
    .replace(/^(connect|integrate|bridge|sync|export|import|migrate|move|map|build an? mcp for|build an? mcp|set up|my)\s+/i, "")
    .replace(/\bmy\b/gi, "")
    .replace(/[.?!]+$/, "")
    .trim();
}

// ---- Workflow plan --------------------------------------------------------
// The richer front-door output: an arbitrary plain-language request, including
// "when X happens in app A, do Y in app B", parsed into a concrete, typed,
// executable shape. Apps, the trigger, ordered actions, and cross-app entity/field
// mappings. The chosen ConnectMethod per app is NOT decided here: it is filled by
// the real architect/discovery pipeline downstream, so the method is grounded in a
// live probe rather than guessed. When a request is genuinely ambiguous the parser
// returns kind:"clarify" with one question rather than guessing; when it cannot be
// mapped to any integration it returns kind:"unmappable" honestly.

export type WorkflowKind = "single-app" | "app-to-app" | "multi-step" | "clarify" | "unmappable";

export interface WorkflowApp {
  name: string;
  url?: string;
  role: "source" | "target" | "both";
}

export interface WorkflowTrigger {
  app: string;
  event: string; // "a payment succeeds", "a new task is created"
}

export interface WorkflowAction {
  app: string;
  op: string; // "create a row", "send a message"
  order: number;
}

export interface WorkflowFieldMap {
  source: string;
  target: string;
}

export interface WorkflowEntityMap {
  fromApp: string;
  fromEntity: string;
  toApp: string;
  toEntity: string;
  fields: WorkflowFieldMap[];
}

export interface WorkflowPlan {
  kind: WorkflowKind;
  summary: string;
  apps: WorkflowApp[];
  trigger?: WorkflowTrigger; // absent for a pure single-app connect
  actions: WorkflowAction[];
  mappings: WorkflowEntityMap[];
  clarify?: { question: string; because: string };
  unmappable?: string;
  raw: string;
}

const SYSTEM_WF = `You turn a non-technical person's plain-language automation request into a strict JSON plan. Output ONLY one minified JSON object, no markdown.

Schema:
{ "kind": "single-app" | "app-to-app" | "multi-step" | "clarify" | "unmappable",
  "summary": string,                       // one plain sentence restating the goal
  "apps": [ { "name": string, "url": string(optional), "role": "source"|"target"|"both" } ],
  "trigger": { "app": string, "event": string } | null,   // for "when X happens in A"
  "actions": [ { "app": string, "op": string, "order": number } ],
  "mappings": [ { "fromApp": string, "fromEntity": string, "toApp": string, "toEntity": string,
                  "fields": [ { "source": string, "target": string } ] } ],
  "clarify": { "question": string, "because": string } | null,
  "unmappable": string | null }

Rules:
- "single-app": connect ONE app (e.g. "connect Slack", "build an MCP for TickTick"). apps has 1 entry, trigger null.
- "app-to-app": a trigger in one app drives an action in another (e.g. "when a Stripe payment succeeds, add a row in Notion"). apps has 2 entries (source + target), set trigger and at least one action, and at least one mapping.
- "multi-step": one trigger then two or more ordered actions, possibly across 3+ apps.
- "clarify": use ONLY when the request is genuinely ambiguous. Return exactly one short question that would resolve it. Set apps to whatever you are confident about. Do NOT guess a second app that was never named.
- "unmappable": use when the request is not an app integration at all (e.g. "what's the weather"). Put the reason in "unmappable".
- Use the app names EXACTLY as written. Never invent an app the user did not mention. Prefer clarify over guessing.
- Keep field mappings realistic (id, title/name, status, timestamps). Omit rather than fabricate exotic fields.`;

const WF_KINDS: WorkflowKind[] = ["single-app", "app-to-app", "multi-step", "clarify", "unmappable"];

export async function parseWorkflow(prompt: string): Promise<WorkflowPlan | null> {
  const raw = prompt.trim();
  if (!raw) return null;

  if (isLlmEnabled()) {
    const data = await chatJson(SYSTEM_WF, raw);
    const plan = data ? validateWorkflow(data, raw) : null;
    if (plan) return plan;
    // LLM produced nothing usable; fall through to the deterministic parser.
  }
  return heuristicWorkflow(raw);
}

// Coerce + validate a model object into a WorkflowPlan, repairing self-inconsistent
// shapes (a two-app kind with one app becomes clarify) so a bad classification never
// yields a dishonest plan.
function validateWorkflow(d: Record<string, unknown>, raw: string): WorkflowPlan | null {
  let kind = WF_KINDS.includes(d.kind as WorkflowKind) ? (d.kind as WorkflowKind) : null;
  if (!kind) return null;

  const apps = coerceApps(d.apps);
  const summary = typeof d.summary === "string" && d.summary.trim() ? d.summary.trim() : raw;

  if (kind === "unmappable") {
    const reason = typeof d.unmappable === "string" && d.unmappable.trim() ? d.unmappable.trim() : "This request is not an app integration.";
    return { kind, summary, apps, actions: [], mappings: [], unmappable: reason, raw };
  }
  if (kind === "clarify") {
    const c = d.clarify as Record<string, unknown> | undefined;
    const question = typeof c?.question === "string" && c.question.trim() ? c.question.trim() : "Which apps should this connect, and what should happen?";
    const because = typeof c?.because === "string" && c.because.trim() ? c.because.trim() : "The request was ambiguous.";
    return { kind, summary, apps, actions: [], mappings: [], clarify: { question, because }, raw };
  }

  const trigger = coerceTrigger(d.trigger);
  const actions = coerceActions(d.actions);
  const mappings = coerceMappings(d.mappings);

  // Repair inconsistent classifications rather than emit a dishonest plan.
  if ((kind === "app-to-app" || kind === "multi-step") && apps.length < 2) {
    return {
      kind: "clarify",
      summary,
      apps,
      actions: [],
      mappings: [],
      clarify: {
        question: apps.length === 1 ? `What should happen in which other app when something happens in ${apps[0].name}?` : "Which two apps should this connect?",
        because: "The request implies an app-to-app automation but only one app was identified.",
      },
      raw,
    };
  }
  if (kind === "single-app" && apps.length === 0) return null;

  return { kind, summary, apps, trigger, actions, mappings, raw };
}

function coerceApps(v: unknown): WorkflowApp[] {
  if (!Array.isArray(v)) return [];
  const out: WorkflowApp[] = [];
  for (const a of v) {
    const name = typeof a?.name === "string" ? a.name.trim() : "";
    if (!name) continue;
    const role = a?.role === "source" || a?.role === "target" || a?.role === "both" ? a.role : "source";
    const url = typeof a?.url === "string" && a.url.trim() ? a.url.trim() : undefined;
    out.push({ name, url, role });
  }
  // Dedupe by lowercased name, keep first role.
  const seen = new Set<string>();
  return out.filter((a) => (seen.has(a.name.toLowerCase()) ? false : (seen.add(a.name.toLowerCase()), true))).slice(0, 4);
}

function coerceTrigger(v: unknown): WorkflowTrigger | undefined {
  const t = v as Record<string, unknown> | null;
  if (!t || typeof t !== "object") return undefined;
  const app = typeof t.app === "string" ? t.app.trim() : "";
  const event = typeof t.event === "string" ? t.event.trim() : "";
  return app && event ? { app, event } : undefined;
}

function coerceActions(v: unknown): WorkflowAction[] {
  if (!Array.isArray(v)) return [];
  const out: WorkflowAction[] = [];
  v.forEach((a, i) => {
    const app = typeof a?.app === "string" ? a.app.trim() : "";
    const op = typeof a?.op === "string" ? a.op.trim() : "";
    if (app && op) out.push({ app, op, order: typeof a?.order === "number" ? a.order : i + 1 });
  });
  return out.sort((a, b) => a.order - b.order).slice(0, 6);
}

function coerceMappings(v: unknown): WorkflowEntityMap[] {
  if (!Array.isArray(v)) return [];
  const out: WorkflowEntityMap[] = [];
  for (const m of v) {
    const fromApp = typeof m?.fromApp === "string" ? m.fromApp.trim() : "";
    const toApp = typeof m?.toApp === "string" ? m.toApp.trim() : "";
    const fromEntity = typeof m?.fromEntity === "string" ? m.fromEntity.trim() : "";
    const toEntity = typeof m?.toEntity === "string" ? m.toEntity.trim() : "";
    if (!fromApp || !toApp) continue;
    const fields: WorkflowFieldMap[] = Array.isArray(m?.fields)
      ? m.fields
          .map((f: Record<string, unknown>) => ({ source: String(f?.source ?? "").trim(), target: String(f?.target ?? "").trim() }))
          .filter((f: WorkflowFieldMap) => f.source && f.target)
          .slice(0, 8)
      : [];
    out.push({ fromApp, fromEntity: fromEntity || "Record", toApp, toEntity: toEntity || "Record", fields });
  }
  return out.slice(0, 4);
}

// Deterministic parser (no LLM). Genuinely extracts a trigger/action from a
// "when X ... <do> Y" sentence and detects the two apps; degrades to a single-app
// connect; and asks a clarifying question when a request names an action with no
// clear app (rather than guessing).
export function heuristicWorkflow(raw: string): WorkflowPlan {
  const summary = raw.replace(/\s+/g, " ").trim();

  // "when <trigger phrase> [,] <action phrase>" form.
  const whenMatch = raw.match(/^\s*(?:when|whenever|if|every time|each time)\s+(.+?)\s*(?:,|\bthen\b|\bautomatically\b)\s*(.+)$/i);
  if (whenMatch) {
    const triggerClause = whenMatch[1].trim();
    const actionClause = whenMatch[2].trim();
    const tApp = appInClause(triggerClause);
    const aApp = appInClause(actionClause);
    if (tApp && aApp && tApp.toLowerCase() !== aApp.toLowerCase()) {
      return {
        kind: "app-to-app",
        summary,
        apps: [
          { name: tApp, role: "source" },
          { name: aApp, role: "target" },
        ],
        trigger: { app: tApp, event: stripApp(triggerClause, tApp) },
        actions: [{ app: aApp, op: stripApp(actionClause, aApp), order: 1 }],
        mappings: [{ fromApp: tApp, fromEntity: "Record", toApp: aApp, toEntity: "Record", fields: heuristicFields() }],
        raw,
      };
    }
    // A trigger sentence but we could not pin both apps: ask, do not guess.
    const known = tApp ?? aApp;
    return {
      kind: "clarify",
      summary,
      apps: known ? [{ name: known, role: tApp ? "source" : "target" }] : [],
      actions: [],
      mappings: [],
      clarify: {
        question: known
          ? `Which app should ${tApp ? "receive the action" : "trigger this"}, alongside ${known}?`
          : "Which two apps should this connect, and what should happen?",
        because: "It reads as a trigger/action automation but both apps were not clear.",
      },
      raw,
    };
  }

  // Fall back to the flat intent extraction for the two-app / single-app cases.
  const intent = heuristicIntent(raw);
  if (intent.target) {
    const verbAction = intent.kind === "export" || intent.kind === "migrate" ? intent.kind : "sync";
    return {
      kind: "app-to-app",
      summary,
      apps: [
        { name: intent.source, role: "source" },
        { name: intent.target, role: "target" },
      ],
      actions: [{ app: intent.target, op: `${verbAction} records`, order: 1 }],
      mappings: [{ fromApp: intent.source, fromEntity: "Record", toApp: intent.target, toEntity: "Record", fields: heuristicFields() }],
      raw,
    };
  }

  // Single app named -> single-app connect. Nothing recognisable -> clarify.
  if (intent.source && intent.source.length > 1 && appLooksNamed(intent.source)) {
    return { kind: "single-app", summary, apps: [{ name: intent.source, role: "both" }], actions: [], mappings: [], raw };
  }
  return {
    kind: "clarify",
    summary,
    apps: [],
    actions: [],
    mappings: [],
    clarify: { question: "Which app (or apps) should this connect, and what should happen?", because: "No app was clearly named in the request." },
    raw,
  };
}

// Pull the most likely app name out of a clause: the capitalised token or a known
// connector word's object. Deliberately conservative; returns undefined when unsure
// so the caller asks rather than guesses.
function appInClause(clause: string): string | undefined {
  // "in/into/to/on/from <App>" preposition object, first.
  const prep = clause.match(/\b(?:in|into|to|on|from|via|through)\s+([A-Z][\w.-]*(?:\s+[A-Z][\w.-]*)?)/);
  if (prep && prep[1]) return prep[1].trim();
  // A standalone Capitalised token (app names are proper nouns).
  const cap = clause.match(/\b([A-Z][a-zA-Z0-9.]{1,})\b/);
  if (cap && cap[1] && !STOPWORDS.has(cap[1].toLowerCase())) return cap[1].trim();
  return undefined;
}

const STOPWORDS = new Set(["i", "a", "an", "the", "when", "whenever", "if", "then", "my", "me", "new", "create", "add", "send", "update"]);

// Freeform english fillers that mark a phrase as NOT an app name, so a vague
// request ("do something useful for me") clarifies instead of being treated as a
// connect to an app literally named after the leftover words.
const NON_APP_WORDS = new Set([
  "something", "anything", "everything", "someone", "stuff", "things", "thing",
  "help", "for", "me", "us", "you", "please", "some", "useful", "out", "here",
  "just", "really", "actually", "somehow", "whatever", "it", "them", "this", "that",
]);

// An app name is a short proper noun: 1-2 tokens, letters present, no english
// filler word. Deliberately loose enough to accept bare lowercase names ("stripe",
// "google calendar") but strict enough to reject freeform phrases.
function appLooksNamed(s: string): boolean {
  const t = s.trim();
  if (!/[A-Za-z]/.test(t) || STOPWORDS.has(t.toLowerCase())) return false;
  const words = t.split(/\s+/);
  if (words.length > 2) return false;
  return !words.some((w) => NON_APP_WORDS.has(w.toLowerCase()));
}

function stripApp(clause: string, app: string): string {
  return clause
    .replace(new RegExp(`\\b(?:in|into|to|on|from|via|through)\\s+${app.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), "")
    .replace(new RegExp(`\\b${app.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), "")
    .replace(/\s+/g, " ")
    .replace(/^[,\s]+|[,\s]+$/g, "")
    .trim() || clause.trim();
}

function heuristicFields(): WorkflowFieldMap[] {
  return [
    { source: "id", target: "external_id" },
    { source: "title", target: "title" },
    { source: "status", target: "status" },
  ];
}
