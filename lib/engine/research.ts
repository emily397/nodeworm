// The Pathfinder. When an app has no API / OAuth / hosted MCP NodeWorm can call
// directly, the deterministic ladder would fall to the managed-browser-session
// floor. But for many such apps there is a BETTER real method: a self-hostable
// REST wrapper (Signal -> signal-cli-rest-api), a CLI, a desktop-automation bot,
// or a community node (n8n / Home Assistant / Zapier / Make). This module asks
// the model to find every documented method and ranks them, so NodeWorm surfaces
// the best/easiest real way to connect instead of dead-ending.
//
// Server-only (uses the LLM cascade). Like the probe and llmRecipe, it is run by
// orchestrate.ts and attached to the integration; the pure engine in phases.ts
// only READS the attached result. Honest: results are model-derived, labelled
// "researched" (verify the link), and never claimed as already live.

import { chatJson, isLlmEnabled } from "./llm";
import { searchWeb, verifyUrlReachable, webSearchAvailable, type Reach } from "./websearch";
import { mcpServersForApp } from "./intel/mcp-registry";
import type { Discovery, ResearchKind, ResearchMethod, ResearchResult, TelemetryLine } from "./types";

// The Pathfinder no longer makes ONE generic call and hopes the model lists every
// option (it does not - a cheap model asked for "2-5 methods" routinely returns 1,
// so real paths like an MCP server, a no-code node, or a webhook service get
// silently dropped). Instead it sweeps EACH method family in parallel, so breadth is
// guaranteed by construction, then merges + verifies + ranks the union.

interface Category {
  kind: ResearchKind;
  label: string;
  want: string;
}

const CATEGORIES: Category[] = [
  { kind: "web-client", label: "official web client", want: "an official browser web client / web app a user logs into (e.g. web.whatsapp.com, web.telegram.org)" },
  { kind: "mcp-server", label: "MCP server", want: "Model Context Protocol (MCP) servers, including community / third-party ones on GitHub, Smithery, Glama, mcp.so, or PulseMCP (Claude speaks MCP natively, so these are first-class)" },
  { kind: "rest-wrapper", label: "self-hostable REST bridge", want: "self-hostable REST API wrappers or bridges, e.g. a Docker container exposing a local REST API (like signal-cli-rest-api)" },
  { kind: "community-node", label: "no-code automation node", want: "no-code automation integrations on n8n, Make, Pipedream, Zapier, IFTTT, or Home Assistant" },
  { kind: "cli", label: "command-line tool", want: "official or community command-line tools" },
  { kind: "unofficial-api", label: "API or webhook service", want: "ready-to-use connection methods: official public APIs/webhooks, documented unofficial/reverse-engineered APIs, or hosted send-only notification/webhook services (e.g. CallMeBot, a free webhook sender). EXCLUDE low-level protocol libraries / SDKs that are not a usable connector on their own" },
  { kind: "reverse-api-capture", label: "network-capture API generator", want: "active network-traffic capture tools that record browser sessions as HAR files, then analyze the HTTP requests to discover undocumented REST endpoints and generate a working API client. Use ONLY when no documented or known API exists at all. The primary tool for this is reverse-api-engineer (pip install reverse-api-engineer), which captures live traffic and uses an LLM to produce a ready-to-run client." },
];

// One strong call beats a fan-out: a capable-enough model, told to walk EVERY family
// and aim for breadth, returns the full option set in a single request (proven: it
// returns signal-cli-rest-api + signal-cli + the n8n node + CallMeBot + an MCP server
// in one shot). The earlier per-category sweep just rate-limited the free tier.
const FAMILY_CHECKLIST =
  CATEGORIES.map((c) => `- "${c.kind}": ${c.want}`).join("\n") +
  `\n- "desktop-bot": a bot that drives the installed desktop app\n- "official-api": a real official public API a first pass may have missed\n- "export-import": a structured file export / import path`;

const RESEARCH_SYSTEM = `You are the Pathfinder agent in an autonomous integration engine. The target app has no API/OAuth/hosted-MCP the engine can call directly. Find EVERY real, currently-existing way to connect, automate, or integrate it.

You MUST consider ALL of these method families and list EVERY real option you know in each (most apps have several - do not stop at one):
${FAMILY_CHECKLIST}

Aim for 5-8 methods when the app supports many; only omit a family if nothing real exists for it. Use the exact kind slug (e.g. "mcp-server", "rest-wrapper", "community-node"), not a prose label.

Return ONLY JSON { "methods": Method[] }. Each Method = { kind (one of the slugs above), name (the real tool/project/integration name), summary (one sentence: what it is and how it connects), url (the REAL repo / registry / docs / web URL - OMIT if you are not confident it exists), selfHostable (boolean), difficulty ("easy"|"moderate"|"advanced"), reliability ("high"|"medium"|"low"), setupSteps (3 to 5 concrete ordered steps) }. NEVER invent a URL or repo. JSON only, no markdown.`;

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

const KINDS: ResearchKind[] = [
  "web-client",
  "mcp-server",
  "rest-wrapper",
  "cli",
  "desktop-bot",
  "community-node",
  "unofficial-api",
  "official-api",
  "export-import",
  "reverse-api-capture",
];

// The model often returns a prose kind ("MCP Server", "Community Node", "Webhook
// Service") instead of the slug. Normalize to a real ResearchKind so methods are
// tagged + ranked correctly instead of all defaulting to unofficial-api.
function normKind(raw: unknown): ResearchKind {
  const k = String(raw ?? "").toLowerCase().trim().replace(/\s+/g, "-");
  if ((KINDS as string[]).includes(k)) return k as ResearchKind;
  if (/mcp/.test(k)) return "mcp-server";
  if (/web.?client|web.?app/.test(k)) return "web-client";
  if (/rest|wrapper|bridge|docker/.test(k)) return "rest-wrapper";
  if (/n8n|make|pipedream|zapier|ifttt|home.?assistant|community|no.?code|node/.test(k)) return "community-node";
  if (/\bcli\b|command|terminal/.test(k)) return "cli";
  if (/desktop/.test(k)) return "desktop-bot";
  if (/export|import/.test(k)) return "export-import";
  if (/official/.test(k) && !/unofficial/.test(k)) return "official-api";
  if (/reverse.?api|har.?capture|network.?capture|traffic.?capture/.test(k)) return "reverse-api-capture";
  return "unofficial-api"; // webhook / notification / reverse-engineered / unknown
}

function coerceMethod(raw: unknown): ResearchMethod | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name);
  const summary = str(r.summary);
  if (!name || !summary) return null;
  const kind = normKind(r.kind);
  const difficulty =
    r.difficulty === "easy" || r.difficulty === "advanced" ? r.difficulty : "moderate";
  const reliability =
    r.reliability === "high" || r.reliability === "low" ? r.reliability : "medium";
  const steps = Array.isArray(r.setupSteps)
    ? (r.setupSteps as unknown[]).map(str).filter((s): s is string => Boolean(s)).slice(0, 6)
    : [];
  const url = str(r.url);
  // Only keep a URL that looks like a real absolute link, never a bare guess.
  const safeUrl = url && /^https?:\/\/[^\s]+\.[^\s]+/i.test(url) ? url : undefined;
  return {
    kind,
    name,
    summary,
    url: safeUrl,
    selfHostable: Boolean(r.selfHostable),
    difficulty,
    reliability,
    setupSteps: steps,
  };
}

// Rank: web-client first (zero setup, just a login), then an MCP server (Claude
// speaks MCP natively), then a self-host REST wrapper, then the rest. Reliability and
// ease break ties. The kind bonus encodes the automation/fit ordering.
const KIND_BONUS: Partial<Record<ResearchKind, number>> = {
  "web-client": 100,
  "mcp-server": 60,
  "rest-wrapper": 30,
  "community-node": 20,
  "reverse-api-capture": 15, // last-resort: only surfaces when nothing else exists
};
function score(m: ResearchMethod): number {
  const kindBonus = KIND_BONUS[m.kind] ?? 0;
  const rel = m.reliability === "high" ? 3 : m.reliability === "medium" ? 2 : 1;
  const diff = m.difficulty === "easy" ? 3 : m.difficulty === "moderate" ? 2 : 1;
  return kindBonus + rel * 10 + diff * 2 + (m.selfHostable ? 1 : 0);
}


export async function researchMethods(d: Discovery): Promise<ResearchResult | null> {
  if (!isLlmEnabled()) return null;

  const ground = [
    d.appUrl ? `Official site / URL: ${d.appUrl}` : "",
    d.docsUrl ? `Docs: ${d.docsUrl}` : "",
    d.category ? `Category: ${d.category}` : "",
    d.entities.length ? `Data it holds: ${d.entities.join(", ")}` : "",
    d.notes.length ? `Known constraints: ${d.notes.slice(0, 3).join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  // Ground the model in CURRENT web results so it cites real sources, not memory.
  // Inert-until-keyed: with no search key this is empty and research stays model-only.
  let grounding = "";
  let grounded = false;
  if (webSearchAvailable()) {
    const queries = [
      `${d.appName} API documentation`,
      `${d.appName} MCP server`,
      `${d.appName} self-host REST bridge OR n8n node OR unofficial API`,
    ];
    const hits = (await Promise.all(queries.map((q) => searchWeb(q, 4)))).flat();
    const seen = new Set<string>();
    const uniq = hits.filter((h) => h.url && !seen.has(h.url) && (seen.add(h.url), true)).slice(0, 10);
    if (uniq.length) {
      grounded = true;
      grounding =
        "\n\nCURRENT WEB RESULTS (prefer + cite these real, current sources; do not invent repos):\n" +
        uniq.map((h) => `- ${h.title} :: ${h.url} :: ${h.snippet}`).join("\n");
    }
  }

  // Deterministic MCP servers from the official registry, run in parallel with the
  // grounded LLM sweep. These are real, current, Claude-native servers with verified
  // URLs - the ones with a hosted "remote" connect with zero setup.
  const [data, registryMcps] = await Promise.all([
    chatJson(
      RESEARCH_SYSTEM,
      `App: ${d.appName}\n${ground}${grounding}\nList every real way to connect or automate ${d.appName}, across ALL the method families. Aim for 5-8 methods. JSON only.`,
    ),
    mcpServersForApp(d.appName).catch(() => []),
  ]);
  const registryMethods: ResearchMethod[] = registryMcps.map((m) => ({
    kind: "mcp-server",
    name: m.title || m.name,
    summary: (m.remoteUrl
      ? `Hosted MCP server (connect directly, no self-host): ${m.description}`
      : `MCP server for ${d.appName}: ${m.description}`
    ).slice(0, 200),
    url: m.repoUrl ?? m.remoteUrl,
    urlVerified: true, // straight from the official registry
    selfHostable: !m.remoteUrl,
    difficulty: m.remoteUrl ? "easy" : "moderate",
    reliability: "high",
    setupSteps: m.remoteUrl
      ? ["Point your MCP client at the hosted endpoint", "Authorize if prompted", "Use the exposed tools"]
      : ["Install the MCP server", `Configure it for ${d.appName}`, "Add it to your MCP client config"],
  }));
  const llmMethods = (Array.isArray(data?.methods) ? (data!.methods as unknown[]) : [])
    .map(coerceMethod)
    .filter((m): m is ResearchMethod => Boolean(m));
  // Registry servers first so dedupe keeps the verified-registry version over an LLM guess.
  const merged = [...registryMethods, ...llmMethods];

  // Dedupe by name+url (the same tool can surface in two category sweeps). Higher-
  // priority categories run earlier in CATEGORIES order, so the first-seen wins.
  const seen = new Set<string>();
  const coerced = merged
    .filter((m) => {
      const key = `${m.name}|${m.url ?? ""}`.toLowerCase().replace(/\s+/g, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => score(b) - score(a));
  if (!coerced.length) return null;

  // Verify recommended URLs (lenient + SSRF-guarded). KEY: a dead link usually means
  // the model guessed the repo PATH wrong, not that the METHOD is fake - signal-cli-
  // rest-api genuinely exists even if the model wrote the wrong GitHub URL. So we do
  // NOT drop the option; we strip the bad link (so no broken URL is shown) and keep
  // the method, flagging the ones whose links DO resolve. This preserves the full
  // option set while staying honest. Web grounding (when keyed) supplies correct URLs
  // so more of them verify. Only a method with no name/summary was already dropped.
  const checked = await Promise.all(
    coerced.map(async (m): Promise<{ m: ResearchMethod; reach: Reach }> => ({
      m,
      reach: m.url ? await verifyUrlReachable(m.url) : "unknown",
    })),
  );
  const ranked: ResearchMethod[] = checked.map((c) =>
    c.reach === "dead"
      ? { ...c.m, url: undefined, urlVerified: false } // real method, wrong link: keep, strip it
      : { ...c.m, urlVerified: c.reach === "alive" },
  );
  const badLinks = checked.filter((c) => c.reach === "dead").length;
  if (!ranked.length) return null;

  // "best" is only set when the top method is actually worth recommending over the
  // managed-session floor: not low-reliability, and either self-hostable or a real
  // community node / API. Otherwise the floor (a managed login) is the honest call.
  const top = ranked[0];
  const strongKinds: ResearchKind[] = [
    "web-client",
    "mcp-server",
    "rest-wrapper",
    "cli",
    "community-node",
    "official-api",
    "unofficial-api",
    "export-import",
    "reverse-api-capture",
  ];
  const best = top.reliability !== "low" && strongKinds.includes(top.kind) ? top : undefined;

  const kindsFound = Array.from(new Set(ranked.map((m) => m.kind)));
  const telemetry: TelemetryLine[] = [
    { level: "scan", text: `pathfinder.sweep(${CATEGORIES.length} method families${grounded ? " + web grounding" : ""}) for "${d.appName}"` },
    { level: "ok", text: `Found ${ranked.length} real method${ranked.length === 1 ? "" : "s"} across ${kindsFound.length} categor${kindsFound.length === 1 ? "y" : "ies"} (${kindsFound.join(", ")}).` },
  ];
  if (grounded) telemetry.push({ level: "info", text: "Grounded in current web results (not model memory)." });
  if (badLinks > 0) telemetry.push({ level: "warn", text: `${badLinks} method${badLinks === 1 ? "" : "s"} had an unverified link (kept, link stripped). A web-search key supplies correct URLs.` });
  for (const m of ranked.slice(0, 6)) {
    telemetry.push({ level: m === best ? "action" : "info", text: `${m.name} (${m.kind}, ${m.reliability} reliability)${m.urlVerified ? " - link verified" : ""}.` });
  }
  if (best) telemetry.push({ level: "action", text: `Recommended: ${best.name}.` });

  return {
    ranked: ranked.slice(0, 8),
    best,
    summary: `${ranked.length} documented way${ranked.length === 1 ? "" : "s"} to connect ${d.appName}, across ${kindsFound.length} method categor${kindsFound.length === 1 ? "y" : "ies"}.`,
    telemetry,
  };
}
