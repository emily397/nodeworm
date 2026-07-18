// Minimal MCP-over-HTTP client plumbing for flow steps: JSON-RPC envelopes and
// honest result parsing. Pure; the effect does the fetch.

let rpcSeq = 0;

export function mcpEnvelope(method: string, params: Record<string, unknown>): Record<string, unknown> {
  rpcSeq += 1;
  return { jsonrpc: "2.0", id: rpcSeq, method, params };
}

export interface McpTool {
  name: string;
  description: string;
}

export function parseMcpTools(json: unknown): McpTool[] {
  const result = (json as { result?: { tools?: unknown } } | null)?.result;
  if (!result || !Array.isArray(result.tools)) return [];
  return result.tools
    .filter((t): t is { name: string; description?: string } => Boolean(t && typeof (t as { name?: unknown }).name === "string"))
    .map((t) => ({ name: t.name, description: typeof t.description === "string" ? t.description : "" }));
}

// Streamable-HTTP replies are either plain JSON or a single SSE frame; take the
// last data: line in the SSE case.
export function parseMcpHttpBody(text: string): unknown | null {
  const t = text.trim();
  try {
    return JSON.parse(t);
  } catch {
    const dataLines = t.split("\n").filter((l) => l.startsWith("data:"));
    if (!dataLines.length) return null;
    try {
      return JSON.parse(dataLines[dataLines.length - 1].slice(5).trim());
    } catch {
      return null;
    }
  }
}

export interface McpCallResult {
  ok: boolean;
  summary: string;
  output?: unknown;
}

export function parseMcpResult(json: unknown): McpCallResult {
  const j = json as { error?: { message?: string }; result?: { isError?: boolean; content?: Array<{ type?: string; text?: string }> } } | null;
  if (j?.error) return { ok: false, summary: `MCP error: ${j.error.message ?? "unknown"}` };
  const content = j?.result?.content;
  const text = Array.isArray(content) ? content.filter((c) => c?.type === "text" && typeof c.text === "string").map((c) => c.text).join("\n") : "";
  if (j?.result?.isError) return { ok: false, summary: `tool failed: ${text.slice(0, 200) || "no detail"}` };
  if (!j?.result) return { ok: false, summary: "not an MCP response" };
  let output: unknown = text;
  try {
    output = JSON.parse(text);
  } catch {
    // plain-text tool result stays text
  }
  return { ok: true, summary: "tool replied", output };
}
