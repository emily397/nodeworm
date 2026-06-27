// Deterministic MCP-server discovery from the OFFICIAL Model Context Protocol
// registry (registry.modelcontextprotocol.io). MCP is Claude-native, so a real MCP
// server for an app is a first-class connection method. This adds verified, current
// servers to the Pathfinder beyond what the grounded LLM happens to recall, and
// flags the ones with a hosted "remote" endpoint (connectable directly, zero setup).
//
// Server-only (network). Inert on failure: a registry hiccup yields no matches.
// Matching is token-strict (every app word must be a token in the server name/title)
// so "Signal" does not pull in "boolsai/signals" trading-signal noise.

const REGISTRY = "https://registry.modelcontextprotocol.io/v0/servers";

export interface RegistryMcp {
  name: string; // e.g. ai.notion/notion
  title?: string;
  description: string;
  repoUrl?: string;
  remoteUrl?: string; // streamable-http / sse endpoint = a HOSTED MCP (no self-host)
}

interface RawServer {
  name?: string;
  title?: string;
  description?: string;
  repository?: { url?: string };
  remotes?: Array<{ type?: string; url?: string }>;
}

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);

export async function mcpServersForApp(appName: string): Promise<RegistryMcp[]> {
  const appWords = words(appName);
  if (!appWords.length) return [];
  try {
    const r = await fetch(`${REGISTRY}?search=${encodeURIComponent(appName)}&limit=30`, {
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    if (!r.ok) return [];
    const data = (await r.json()) as { servers?: Array<{ server?: RawServer } & RawServer> };
    const out: RegistryMcp[] = [];
    const seen = new Set<string>();
    for (const item of data.servers ?? []) {
      const s: RawServer = item.server ?? item;
      const name = s.name ?? "";
      if (!name) continue;
      if (seen.has(name)) continue;
      const remote = (s.remotes ?? []).find((rm) => rm.type === "streamable-http" || rm.type === "sse");
      // HIGH-PRECISION match (the deterministic source must not surface false options;
      // grounding handles community breadth). Single-word apps only, matched as an
      // EXACT dot-label so the app OWNS it: the vendor's last segment (com.notion ->
      // "notion", app.linear -> "linear") OR a label of the hosted remote host
      // (mcp.notion.com, mcp.stripe.com). This drops common-word noise: "signal" does
      // NOT match "ai.boolsai" / "signals.boolsai.ai" / "ai.signal8", and the generic
      // "io.github.<user>" host-namespace does not make every server match "GitHub".
      const app = appWords.length === 1 ? appWords[0] : null;
      if (!app) continue;
      const vendor = name.includes("/") ? name.slice(0, name.lastIndexOf("/")) : name;
      const vendorSegs = words(vendor);
      const vendorMatch = vendorSegs[vendorSegs.length - 1] === app;
      let remoteMatch = false;
      if (remote?.url) {
        try {
          remoteMatch = new URL(remote.url).host.toLowerCase().split(".").includes(app);
        } catch {
          /* ignore */
        }
      }
      if (!vendorMatch && !remoteMatch) continue;
      seen.add(name);
      const title = s.title ?? "";
      out.push({
        name,
        title: title || undefined,
        description: s.description ?? "",
        repoUrl: s.repository?.url,
        remoteUrl: remote?.url,
      });
      if (out.length >= 5) break;
    }
    return out;
  } catch {
    return [];
  }
}

export interface HostedMcp {
  name: string;
  url: string;
  transport: "http" | "sse";
}

// The single best HOSTED (remote, no-self-host) MCP for an app: the official,
// zero-setup, Claude-native way to connect it. Returns the first high-precision
// registry match that exposes a remote endpoint, or undefined. Drives NodeWorm's
// "preferred path" recommendation for big SaaS apps.
export async function hostedMcpForApp(appName: string): Promise<HostedMcp | undefined> {
  const servers = await mcpServersForApp(appName);
  const hosted = servers.find((s) => s.remoteUrl);
  if (!hosted?.remoteUrl) return undefined;
  return {
    name: hosted.title || hosted.name,
    url: hosted.remoteUrl,
    transport: /\/sse(\b|$|\?)/i.test(hosted.remoteUrl) ? "sse" : "http",
  };
}
