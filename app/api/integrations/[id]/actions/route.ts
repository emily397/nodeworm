import { NextResponse } from "next/server";
import { discoveredApiBase } from "@/lib/engine/generate";
import { collectSurfaceOps } from "@/lib/engine/generate-pipeline";
import { getVaultConnector } from "@/lib/engine/vault";
import { toActions } from "@/lib/flow/actions";
import { mcpEnvelope, parseMcpTools } from "@/lib/flow/mcp";
import { mcpPost } from "@/lib/flow/effects";
import { getOwnedIntegration } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The flow builder's action catalog for one connection: real operations from the
// endpoint ladder (captured traffic -> the app's own OpenAPI -> APIs.guru), plus
// the live tool list of a verified MCP connector. Everything here is discovered,
// never fabricated; an app with no reachable surface honestly returns empty.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const it = await getOwnedIntegration(req, id);
  if (!it) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const surface = await collectSurfaceOps(it);
  const apiBase = surface.apiBase ?? (it.discovery ? discoveredApiBase(it.discovery) : undefined);
  const actions = toActions(surface.ops, apiBase);

  let mcpTools: Array<{ name: string; description: string }> = [];
  if (it.connector?.verified) {
    const conn = await getVaultConnector(it.appName, { connectionId: it.id, userId: it.userId });
    if (conn) {
      const reply = await mcpPost(conn.url, conn.token ? { authorization: /^(Bearer|Basic) /.test(conn.token) ? conn.token : `Bearer ${conn.token}` } : {}, mcpEnvelope("tools/list", {}));
      mcpTools = parseMcpTools(reply);
    }
  }

  return NextResponse.json({ actions, mcpTools, source: surface.specSource, apiBase });
}
