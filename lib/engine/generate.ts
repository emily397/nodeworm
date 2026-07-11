// Generates a REAL, typed, deployable MCP connector from an app's discovered API
// surface. Pure string templating (no node imports) so the engine stays pure; the
// generate route enriches with live OpenAPI operations before calling in here.
//
// Honesty model: the generated server's generic tools (api_request, graphql_query)
// call the app's REAL discovered endpoints. Per-operation tools come from the app's
// own OpenAPI spec when the probe found one; per-entity convenience tools otherwise
// use conventional REST paths and say so. The bundle is "generated, not deployed"
// until the user runs it and NodeWorm verifies one real read (connected-via-connector).

import type { Discovery, GeneratedBundle, GeneratedFile, OpenApiOp, WireConfig } from "./types";

const SDK_VERSION = "1.12.1";
const ZOD_VERSION = "3.23.8";

function slugName(app: string): string {
  return app.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function toolSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
}

// Optional refined tool descriptions, keyed by the emitted tool name. Threaded from
// the LLM refinement pass (refine.ts); every value has already passed the snapshot
// gate, so a lookup miss simply falls back to the built-in default description.
export type DescMap = Record<string, string> | undefined;
function desc(map: DescMap, name: string, fallback: string): string {
  const r = map?.[name];
  return typeof r === "string" && r.length > 0 ? r : fallback;
}

// The real API origin the generated connector will call, best-evidence-first:
// a live OpenAPI/GraphQL endpoint the probe actually reached beats any guess.
export function discoveredApiBase(d: Discovery): string | undefined {
  const fromUrl = (u?: string) => {
    if (!u) return undefined;
    try {
      return new URL(u).origin;
    } catch {
      return undefined;
    }
  };
  return (
    fromUrl(d.probe?.graphqlUrl) ??
    fromUrl(d.probe?.openApiUrl) ??
    fromUrl(d.probe?.aiEndpoints?.[0]) ??
    fromUrl(d.appUrl) ??
    fromUrl(d.docsUrl)
  );
}

function pkgJson(name: string, scraper: boolean): string {
  const deps: Record<string, string> = {
    "@modelcontextprotocol/sdk": `^${SDK_VERSION}`,
    zod: `^${ZOD_VERSION}`,
  };
  if (scraper) deps.playwright = "^1.49.0";
  return JSON.stringify(
    {
      name,
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: { build: "tsc", start: "node dist/index.js" },
      dependencies: deps,
      devDependencies: { typescript: "^5.6.0", "@types/node": "^20.0.0" },
    },
    null,
    2,
  );
}

const TSCONFIG = JSON.stringify(
  {
    compilerOptions: {
      target: "ES2022",
      module: "Node16",
      moduleResolution: "Node16",
      outDir: "dist",
      rootDir: "src",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
    },
    include: ["src"],
  },
  null,
  2,
);

// Shared runtime: env-configured base + auth, one real fetch helper, stdio + HTTP
// transports, /health for NodeWorm's connector verification.
function serverPrelude(app: string, apiBase: string | undefined, authHeader?: string): string {
  return [
    `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";`,
    `import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";`,
    `import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";`,
    `import { createServer } from "node:http";`,
    `import { z } from "zod";`,
    ``,
    `const API_BASE = process.env.API_BASE_URL ?? ${JSON.stringify(apiBase ?? "")};`,
    `const AUTH_HEADER = process.env.AUTH_HEADER ?? ${JSON.stringify(authHeader ?? "authorization")};`,
    `// Your own token for ${app} (from its OAuth flow or your own account), never shared with NodeWorm.`,
    `const AUTH_VALUE = process.env.API_TOKEN ? (process.env.AUTH_SCHEME ?? "Bearer") + " " + process.env.API_TOKEN : undefined;`,
    ``,
    `async function call(method: string, path: string, body?: unknown, query?: Record<string, string>) {`,
    `  if (!API_BASE) throw new Error("Set API_BASE_URL");`,
    `  const url = new URL(path.startsWith("http") ? path : API_BASE + path);`,
    `  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);`,
    `  const headers: Record<string, string> = { accept: "application/json" };`,
    `  if (AUTH_VALUE) headers[AUTH_HEADER] = AUTH_VALUE;`,
    `  if (body !== undefined) headers["content-type"] = "application/json";`,
    `  const res = await fetch(url, { method: method.toUpperCase(), headers, body: body === undefined ? undefined : JSON.stringify(body) });`,
    `  const text = await res.text();`,
    `  let data: unknown = text;`,
    `  try { data = JSON.parse(text); } catch { /* non-JSON body stays text */ }`,
    `  return { status: res.status, data };`,
    `}`,
    ``,
    `function out(v: unknown) {`,
    `  return { content: [{ type: "text" as const, text: typeof v === "string" ? v : JSON.stringify(v, null, 2) }] };`,
    `}`,
    ``,
    `// One server per transport: stdio gets a single instance, stateless HTTP builds`,
    `// a fresh pair per request (the SDK binds a server to exactly one transport).`,
    `function buildServer(): McpServer {`,
    `const server = new McpServer({ name: ${JSON.stringify(`${slugName(app)}-connector`)}, version: "0.1.0" });`,
    ``,
  ].join("\n");
}

const SERVER_MAIN = [
  ``,
  `return server;`,
  `}`,
  ``,
  `async function main() {`,
  `  if (process.env.TRANSPORT === "http") {`,
  `    const port = Number(process.env.PORT ?? 8787);`,
  `    createServer((req, res) => {`,
  `      if (req.url === "/health") {`,
  `        res.writeHead(200, { "content-type": "application/json" });`,
  `        res.end(JSON.stringify({ ok: true, name: "generated-mcp", ts: Date.now() }));`,
  `        return;`,
  `      }`,
  `      const chunks: Buffer[] = [];`,
  `      req.on("data", (c) => chunks.push(c));`,
  `      req.on("end", () => {`,
  `        void (async () => {`,
  `          let body: unknown;`,
  `          try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { body = undefined; }`,
  `          const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });`,
  `          res.on("close", () => void transport.close());`,
  `          await buildServer().connect(transport);`,
  `          await transport.handleRequest(req, res, body);`,
  `        })().catch(() => { if (!res.headersSent) { res.writeHead(500); res.end(); } });`,
  `      });`,
  `    }).listen(port, () => console.error("HTTP MCP on :" + port + " (/health for checks)"));`,
  `  } else {`,
  `    await buildServer().connect(new StdioServerTransport());`,
  `    console.error("stdio MCP up");`,
  `  }`,
  `}`,
  ``,
  `main().catch((e) => { console.error(e); process.exit(1); });`,
  ``,
].join("\n");

// A real Query field lifted from live GraphQL introspection: its name and its
// scalar arguments (with their GraphQL type string, e.g. "Int", "String!").
export interface GraphqlField {
  name: string;
  args: { name: string; type: string; scalar: boolean }[];
}

function mcpTools(d: Discovery, w: WireConfig, ops: OpenApiOp[], gqlFields: GraphqlField[], descriptions?: DescMap): string {
  const lines: string[] = [];

  lines.push(
    `server.tool(`,
    `  "api_request",`,
    `  ${JSON.stringify(`Raw ${d.appName} API call against ${discoveredApiBase(d) ?? "API_BASE_URL"}. The escape hatch when no specific tool fits.`)},`,
    `  {`,
    `    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),`,
    `    path: z.string().describe("Path relative to the API base, e.g. /v1/items"),`,
    `    query: z.record(z.string()).optional(),`,
    `    body: z.unknown().optional(),`,
    `  },`,
    `  async ({ method, path, query, body }) => out(await call(method, path, body, query)),`,
    `);`,
    ``,
  );

  if (d.probe?.graphqlUrl) {
    lines.push(
      `const GRAPHQL_URL = process.env.GRAPHQL_URL ?? ${JSON.stringify(d.probe.graphqlUrl)};`,
      `server.tool(`,
      `  "graphql_query",`,
      `  ${JSON.stringify(`Run a GraphQL query against ${d.appName}'s live endpoint (probe-verified: it answered introspection).`)},`,
      `  { query: z.string(), variables: z.record(z.unknown()).optional() },`,
      `  async ({ query, variables }) => out(await call("POST", GRAPHQL_URL, { query, variables })),`,
      `);`,
      ``,
    );
    // Typed per-field tools from LIVE introspection: real Query fields with their
    // scalar args, so an MCP client gets first-class tools (not just a raw query
    // box). The caller supplies the selection set; args ride as GraphQL variables.
    for (const f of gqlFields.slice(0, 12)) {
      const args = f.args.filter((a) => a.scalar);
      const schema = args.map((a) => `    ${JSON.stringify(a.name)}: z.string().optional(),`);
      const varDecls = args.map((a) => `$${a.name}: ${a.type}`).join(", ");
      lines.push(
        `server.tool(`,
        `  ${JSON.stringify(toolSlug(`gql_${f.name}`))},`,
        `  ${JSON.stringify(`Query ${f.name} on ${d.appName} (real GraphQL). Pass 'select' as the GraphQL selection set${args.length ? `; args: ${args.map((a) => a.name).join(", ")}` : ""}.`)},`,
        `  {`,
        ...schema,
        `    select: z.string().describe("GraphQL selection set, e.g. 'results { id name }'"),`,
        `  },`,
        `  async (args) => {`,
        `    const provided = Object.entries(args as Record<string, unknown>).filter(([k, v]) => k !== "select" && v !== undefined);`,
        `    const decls = (${JSON.stringify(args.map((a) => ({ name: a.name, type: a.type })))} as { name: string; type: string }[]).filter((d) => provided.some(([k]) => k === d.name));`,
        `    const head = decls.length ? "(" + decls.map((d) => "$" + d.name + ": " + d.type).join(", ") + ")" : "";`,
        `    const call2 = decls.length ? "(" + decls.map((d) => d.name + ": $" + d.name).join(", ") + ")" : "";`,
        `    // Coerce string inputs to the arg's real GraphQL scalar (Int/Float/Boolean).`,
        `    const variables = Object.fromEntries(provided.map(([k, v]) => {`,
        `      const t = decls.find((d) => d.name === k)?.type ?? "";`,
        `      if (/^Int/.test(t)) return [k, parseInt(String(v), 10)];`,
        `      if (/^Float/.test(t)) return [k, parseFloat(String(v))];`,
        `      if (/^Boolean/.test(t)) return [k, v === true || v === "true"];`,
        `      return [k, v];`,
        `    }));`,
        `    const query = "query " + head + " { ${f.name}" + call2 + " { " + args.select + " } }";`,
        `    return out(await call("POST", GRAPHQL_URL, { query, variables }));`,
        `  },`,
        `);`,
        ``,
      );
      void varDecls;
    }
  }

  // Real operations from the app's own OpenAPI spec: genuine paths, not guesses.
  for (const op of ops.slice(0, 15)) {
    const params = [...op.path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
    const schema: string[] = params.map((p) => `    ${JSON.stringify(p)}: z.string(),`);
    // Observed query params (from captured traffic) become a typed object; otherwise
    // a permissive record so the caller can still pass anything.
    if (op.queryKeys?.length) {
      schema.push(`    query: z.object({ ${op.queryKeys.map((k) => `${JSON.stringify(k)}: z.string().optional()`).join(", ")} }).partial().optional(),`);
    } else {
      schema.push(`    query: z.record(z.string()).optional(),`);
    }
    if (op.method !== "get" && op.method !== "delete") {
      if (op.bodyKeys?.length) {
        schema.push(`    body: z.object({ ${op.bodyKeys.map((k) => `${JSON.stringify(k)}: z.unknown().optional()`).join(", ")} }).partial().optional(),`);
      } else {
        schema.push(`    body: z.unknown().optional(),`);
      }
    }
    const argNames = [...params.map((p) => JSON.stringify(p).replace(/"/g, "")), "query"];
    if (op.method !== "get" && op.method !== "delete") argNames.push("body");
    let pathExpr = JSON.stringify(op.path);
    for (const p of params) {
      pathExpr = pathExpr.replace(`{${p}}`, `" + encodeURIComponent(args[${JSON.stringify(p)}] as string) + "`);
    }
    lines.push(
      `server.tool(`,
      `  ${JSON.stringify(toolSlug(op.name))},`,
      `  ${JSON.stringify(desc(descriptions, toolSlug(op.name), `${op.summary ?? `${op.method.toUpperCase()} ${op.path}`} (from ${d.appName}'s own OpenAPI spec)`))},`,
      `  {`,
      ...schema,
      `  },`,
      `  async (args) => out(await call(${JSON.stringify(op.method)}, ${pathExpr}, ${op.method !== "get" && op.method !== "delete" ? `(args as Record<string, unknown>).body` : "undefined"}, args.query as Record<string, string> | undefined)),`,
      `);`,
      ``,
    );
  }

  // No spec: conventional per-entity tools, honestly labelled as conventions.
  if (ops.length === 0 && d.apiType !== "graphql") {
    for (const en of d.entities.slice(0, 4)) {
      const plural = toolSlug(en) + (toolSlug(en).endsWith("s") ? "" : "s");
      lines.push(
        `server.tool(`,
        `  ${JSON.stringify(`list_${plural}`)},`,
        `  ${JSON.stringify(desc(descriptions, `list_${plural}`, `List ${en} records. Uses the conventional path /${plural}; override with ENTITY_PATH_${plural.toUpperCase()} if ${d.appName}'s docs differ.`))},`,
        `  { query: z.record(z.string()).optional() },`,
        `  async ({ query }) => out(await call("GET", process.env[${JSON.stringify(`ENTITY_PATH_${plural.toUpperCase()}`)}] ?? ${JSON.stringify(`/${plural}`)}, undefined, query)),`,
        `);`,
        ``,
      );
    }
  }

  return lines.join("\n");
}

const SCRAPER_IMPORTS = `import { chromium, type Browser, type Page } from "playwright";\n`;

function scraperTools(d: Discovery): string {
  const start = d.loginUrl ?? d.appUrl ?? "";
  return [
    `const START_URL = process.env.START_URL ?? ${JSON.stringify(start)};`,
    `// Sign in once with: npx playwright codegen <login url> --save-storage=auth.json`,
    `const STORAGE = process.env.STORAGE_STATE ?? "auth.json";`,
    `let browser: Browser | undefined;`,
    `let page: Page | undefined;`,
    ``,
    `async function getPage(): Promise<Page> {`,
    `  if (page) return page;`,
    `  browser = await chromium.launch({ headless: true });`,
    `  const ctx = await browser.newContext({ storageState: STORAGE }).catch(() => browser!.newContext());`,
    `  page = await ctx.newPage();`,
    `  return page;`,
    `}`,
    ``,
    `server.tool("open_page", "Navigate the scraper to a URL (defaults to the app).", { url: z.string().optional() }, async ({ url }) => {`,
    `  const p = await getPage();`,
    `  await p.goto(url ?? START_URL, { waitUntil: "domcontentloaded" });`,
    `  return out({ url: p.url(), title: await p.title() });`,
    `});`,
    ``,
    `server.tool("read_page", "Read visible text (optionally scoped to a CSS selector).", { selector: z.string().optional() }, async ({ selector }) => {`,
    `  const p = await getPage();`,
    `  const text = selector ? await p.locator(selector).first().innerText() : await p.locator("body").innerText();`,
    `  return out(text.slice(0, 20000));`,
    `});`,
    ``,
    `server.tool("click", "Click an element by CSS selector.", { selector: z.string() }, async ({ selector }) => {`,
    `  const p = await getPage();`,
    `  await p.locator(selector).first().click();`,
    `  return out({ ok: true, url: p.url() });`,
    `});`,
    ``,
    `server.tool("fill", "Fill an input by CSS selector.", { selector: z.string(), value: z.string() }, async ({ selector, value }) => {`,
    `  const p = await getPage();`,
    `  await p.locator(selector).first().fill(value);`,
    `  return out({ ok: true });`,
    `});`,
    ``,
  ].join("\n");
}

function readme(d: Discovery, kind: "mcp" | "scraper", name: string, apiBase?: string): string {
  const auth =
    kind === "mcp"
      ? [
          `## Auth`,
          ``,
          `Set \`API_TOKEN\` to your own ${d.appName} token (yours, never shared with NodeWorm).`,
          `Header defaults to \`Authorization: Bearer <token>\`; override with \`AUTH_HEADER\` / \`AUTH_SCHEME\`.`,
          apiBase ? `API base (discovered live): \`${apiBase}\`. Override with \`API_BASE_URL\`.` : `Set \`API_BASE_URL\` to the API origin.`,
        ]
      : [
          `## Auth`,
          ``,
          `Sign in once and save the session: \`npx playwright codegen ${d.loginUrl ?? d.appUrl ?? "<login url>"} --save-storage=auth.json\``,
          `The scraper reuses \`auth.json\` (override path with \`STORAGE_STATE\`). Your password never touches this code.`,
        ];
  return [
    `# ${name}`,
    ``,
    `Generated by NodeWorm from ${d.appName}'s discovered ${kind === "mcp" ? "API surface" : "web UI"}. Honest status: generated, not deployed. It goes live when you run it and NodeWorm verifies one real read.`,
    ``,
    `## Run`,
    ``,
    "```",
    `npm install`,
    `npm run build`,
    `TRANSPORT=http PORT=8787 npm start   # HTTP MCP + GET /health`,
    `npm start                            # stdio MCP (Claude Desktop / any MCP client)`,
    "```",
    ``,
    ...auth,
    ``,
    `## Connect back to NodeWorm`,
    ``,
    `Expose the HTTP server publicly (tunnel or deploy), then paste its URL into NodeWorm's connector panel. NodeWorm makes one real GET /health before it marks anything connected.`,
    ``,
  ].join("\n");
}

export function generateBundle(d: Discovery, w: WireConfig, ops: OpenApiOp[] = [], gqlFields: GraphqlField[] = [], apiBaseOverride?: string, authHeader?: string, descriptions?: DescMap): GeneratedBundle {
  const kind: "mcp" | "scraper" = d.hasPublicApi ? "mcp" : "scraper";
  const name = `${slugName(d.appName)}-${kind === "mcp" ? "mcp" : "scraper"}`;
  // A spec-declared server (e.g. from APIs.guru) is authoritative over a guess.
  const apiBase = kind === "mcp" ? (apiBaseOverride || discoveredApiBase(d)) : undefined;

  const src =
    kind === "mcp"
      ? serverPrelude(d.appName, apiBase, authHeader) + mcpTools(d, w, ops, gqlFields, descriptions) + SERVER_MAIN
      : SCRAPER_IMPORTS + serverPrelude(d.appName, apiBase, authHeader) + scraperTools(d) + SERVER_MAIN;

  const files: GeneratedFile[] = [
    { path: "package.json", content: pkgJson(name, kind === "scraper") },
    { path: "tsconfig.json", content: TSCONFIG },
    { path: "src/index.ts", content: src },
    { path: "README.md", content: readme(d, kind, name, apiBase) },
    { path: ".gitignore", content: "node_modules\ndist\nauth.json\n.env\n" },
  ];

  return {
    kind,
    connectorName: name,
    language: "typescript",
    apiBase,
    files,
    deploySteps: [
      "npm install && npm run build",
      "TRANSPORT=http PORT=8787 npm start",
      "Expose it publicly (tunnel or deploy), then paste the URL into NodeWorm",
    ],
    generatedAt: Date.now(),
  };
}
