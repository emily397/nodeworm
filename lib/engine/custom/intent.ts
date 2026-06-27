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
