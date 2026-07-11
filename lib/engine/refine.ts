// LLM refinement of generated tool descriptions, gated so a regression can't ship.
// The generator writes correct-but-terse descriptions ("GET /v2/projects/{id} (from
// Acme's own OpenAPI spec)"). A free-first LLM pass rewrites them into clearer,
// action-oriented docs. Crucially it can ONLY touch description TEXT: the snapshot
// gate (validateRefinement) rejects anything that changes the tool set, invents
// tools, or emits unsafe/oversized strings, so refinement can never alter behaviour.

import type { Discovery, OpenApiOp } from "./types";
import { type GraphqlField, toolSlug } from "./generate";
import { chatJson } from "./llm";

export interface ToolInfo {
  name: string;
  description: string;
  params: string[];
}

const MAX_DESC = 240;

// The refinable tools and their default descriptions + params, named EXACTLY as the
// generator emits them (so a refined description keys straight onto the tool). The
// generic api_request/graphql_query and the scraper tools are hand-written and left
// alone. Mirrors the per-op / per-entity / per-gql-field emission in generate.ts.
export function buildManifest(d: Discovery, ops: OpenApiOp[], gqlFields: GraphqlField[]): ToolInfo[] {
  const out: ToolInfo[] = [];
  for (const op of ops) {
    const pathParams = (op.path.match(/{([^}]+)}/g) ?? []).map((s) => s.slice(1, -1));
    const params = [...pathParams, "query"];
    if (op.method !== "get" && op.method !== "delete") params.push("body");
    out.push({
      name: toolSlug(op.name),
      description: `${op.summary ?? `${op.method.toUpperCase()} ${op.path}`} (from ${d.appName}'s own OpenAPI spec)`,
      params,
    });
  }
  if (ops.length === 0 && d.apiType !== "graphql") {
    for (const en of (d.entities ?? []).slice(0, 4)) {
      const plural = toolSlug(en) + (toolSlug(en).endsWith("s") ? "" : "s");
      out.push({ name: `list_${plural}`, description: `List ${en} records.`, params: ["query"] });
    }
  }
  for (const f of gqlFields) {
    out.push({ name: toolSlug(`gql_${f.name}`), description: `GraphQL query ${f.name}`, params: f.args.map((a) => a.name) });
  }
  return out;
}

// A refined description is safe only if it is a plain, bounded, single-line string
// with no code/markup/interpolation characters that could break the generated source
// (descriptions are emitted via JSON.stringify, but we still forbid these to keep the
// docs clean and injection-free). Unsafe or missing entries fall back to the default.
function safeDescription(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (s.length === 0 || s.length > MAX_DESC) return null;
  if (/[<>`{}\n\r\t]/.test(s)) return null;
  if (/\bhttps?:\/\//i.test(s)) return null; // no smuggled URLs
  return s;
}

// The snapshot gate. Given the manifest (ground truth) and the LLM's proposed map,
// return a complete description map covering EVERY manifest tool: a proposed value is
// used only if it names a real tool and passes safeDescription; otherwise the tool's
// default is kept. Keys the LLM invented (tools that don't exist) are dropped. So the
// tool SET is invariant and only descriptions can change.
export function validateRefinement(manifest: ToolInfo[], proposed: unknown): Record<string, string> {
  const map = (proposed && typeof proposed === "object" ? (proposed as Record<string, unknown>) : {}) as Record<string, unknown>;
  const known = new Set(manifest.map((t) => t.name));
  const out: Record<string, string> = {};
  for (const t of manifest) {
    const safe = known.has(t.name) ? safeDescription(map[t.name]) : null;
    out[t.name] = safe ?? t.description;
  }
  return out;
}

const SYSTEM =
  "You improve tool descriptions for a generated API connector. Rewrite each description to be a single clear sentence, action-oriented, under 200 characters, no markup, no URLs. Do NOT invent tools, rename them, or change their meaning. Return ONLY a JSON object mapping the EXACT given tool name to its improved description.";

// Run the free-first LLM cascade to refine descriptions, then gate the result. When
// no LLM key is set or the call fails, returns the manifest defaults unchanged (a
// no-op), so refinement is always safe and optional.
export async function refineToolDescriptions(manifest: ToolInfo[]): Promise<Record<string, string>> {
  if (manifest.length === 0) return {};
  const user = JSON.stringify(manifest.map((t) => ({ name: t.name, description: t.description, params: t.params })));
  const proposed = await chatJson(SYSTEM, user).catch(() => null);
  return validateRefinement(manifest, proposed);
}
