import { describe, expect, it } from "vitest";
import { mcpEnvelope, parseMcpHttpBody, parseMcpResult, parseMcpTools } from "./mcp";

describe("mcpEnvelope", () => {
  it("builds a JSON-RPC 2.0 request", () => {
    const e = mcpEnvelope("tools/call", { name: "list_rows", arguments: { limit: 5 } });
    expect(e.jsonrpc).toBe("2.0");
    expect(e.method).toBe("tools/call");
    expect((e.params as { name: string }).name).toBe("list_rows");
    expect(typeof e.id).toBe("number");
  });
});

describe("parseMcpTools", () => {
  it("extracts tool names + descriptions from a tools/list result", () => {
    const tools = parseMcpTools({ jsonrpc: "2.0", id: 1, result: { tools: [{ name: "api_request", description: "raw escape hatch" }, { name: "list_rows" }] } });
    expect(tools).toEqual([
      { name: "api_request", description: "raw escape hatch" },
      { name: "list_rows", description: "" },
    ]);
  });

  it("returns empty on errors or junk", () => {
    expect(parseMcpTools({ error: { message: "nope" } })).toEqual([]);
    expect(parseMcpTools("garbage")).toEqual([]);
  });
});

describe("parseMcpHttpBody", () => {
  it("parses a plain JSON body", () => {
    expect(parseMcpHttpBody('{"jsonrpc":"2.0","id":1,"result":{}}')).toEqual({ jsonrpc: "2.0", id: 1, result: {} });
  });

  it("parses the last data line of an SSE-framed body", () => {
    const sse = 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n\n';
    expect(parseMcpHttpBody(sse)).toEqual({ jsonrpc: "2.0", id: 1, result: { ok: true } });
  });

  it("returns null for junk", () => {
    expect(parseMcpHttpBody("<html>nope</html>")).toBeNull();
  });
});

describe("parseMcpResult", () => {
  it("returns parsed JSON when the text content is JSON, else the raw text", () => {
    const json = parseMcpResult({ result: { content: [{ type: "text", text: '{"rows":[1,2]}' }] } });
    expect(json.ok).toBe(true);
    expect(json.output).toEqual({ rows: [1, 2] });

    const text = parseMcpResult({ result: { content: [{ type: "text", text: "done." }] } });
    expect(text.ok).toBe(true);
    expect(text.output).toBe("done.");
  });

  it("surfaces JSON-RPC and tool-level errors honestly", () => {
    const rpc = parseMcpResult({ error: { message: "unknown tool" } });
    expect(rpc.ok).toBe(false);
    expect(rpc.summary).toContain("unknown tool");

    const toolErr = parseMcpResult({ result: { isError: true, content: [{ type: "text", text: "HTTP 401 upstream" }] } });
    expect(toolErr.ok).toBe(false);
    expect(toolErr.summary).toContain("HTTP 401 upstream");
  });
});
