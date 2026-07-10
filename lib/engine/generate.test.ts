import { describe, it, expect } from "vitest";
import { generateBundle } from "./generate";
import type { Discovery, WireConfig } from "./types";

const wire: WireConfig = {
  outboundTools: [],
  inboundMethod: "polling",
  inboundReason: "",
  entityMappings: [],
  bidirectional: false,
  notes: [],
  telemetry: [],
};

function discovery(over: Partial<Discovery>): Discovery {
  return {
    appName: "Acme",
    appUrl: "https://acme.example",
    category: "data",
    blurb: "",
    hasPublicApi: true,
    apiType: "rest",
    authType: "none",
    authMethods: ["none"],
    hasHostedMcp: false,
    hasWebhooks: false,
    rateLimited: true,
    ipRestricted: false,
    twoFactor: false,
    confidence: 0.8,
    source: "probe",
    entities: ["Widget"],
    notes: [],
    telemetry: [],
    ...over,
  };
}

function indexTs(bundle: ReturnType<typeof generateBundle>): string {
  return bundle.files.find((f) => f.path === "src/index.ts")!.content;
}

describe("generateBundle", () => {
  it("produces a runnable MCP project for a public-API app", () => {
    const b = generateBundle(discovery({ hasPublicApi: true }), wire, []);
    expect(b.kind).toBe("mcp");
    const paths = b.files.map((f) => f.path);
    expect(paths).toEqual(expect.arrayContaining(["package.json", "tsconfig.json", "src/index.ts", "README.md"]));
    const src = indexTs(b);
    expect(src).toContain('server.tool(');
    expect(src).toContain('"api_request"');
    // package.json declares the MCP SDK dependency.
    const pkg = JSON.parse(b.files.find((f) => f.path === "package.json")!.content);
    expect(pkg.dependencies["@modelcontextprotocol/sdk"]).toBeTruthy();
  });

  it("emits a graphql_query tool and typed field tools when a GraphQL endpoint was probed", () => {
    const d = discovery({
      apiType: "graphql",
      probe: { reachable: true, origins: ["https://acme.example"], graphqlUrl: "https://acme.example/graphql", apiType: "graphql", aiEndpoints: [], hits: [], telemetry: [] },
    });
    const src = indexTs(generateBundle(d, wire, [], [{ name: "widgets", args: [{ name: "page", type: "Int", scalar: true }] }]));
    expect(src).toContain('"graphql_query"');
    expect(src).toContain("gql_widgets");
  });

  it("produces a Playwright scraper project for an app with no public API", () => {
    const b = generateBundle(discovery({ hasPublicApi: false, loginUrl: "https://acme.example/login" }), wire, []);
    expect(b.kind).toBe("scraper");
    const src = indexTs(b);
    expect(src).toContain("playwright");
    expect(src).toContain('"open_page"');
    expect(b.files.find((f) => f.path === "package.json")!.content).toContain("playwright");
  });

  it("emits typed body + query params on tools built from captured traffic", () => {
    const op = {
      method: "post",
      path: "/v1/tasks",
      name: "post_v1_tasks",
      bodyKeys: ["title", "assignee"],
      queryKeys: ["notify"],
    };
    const src = indexTs(generateBundle(discovery({ hasPublicApi: true }), wire, [op]));
    expect(src).toContain("post_v1_tasks");
    expect(src).toContain("title");
    expect(src).toContain("assignee");
    expect(src).toContain("notify");
    // typed object body, not the generic z.unknown passthrough
    expect(src).toMatch(/body:\s*z\.object/);
  });

  it("bakes an observed auth header name as the connector's default", () => {
    const src = indexTs(generateBundle(discovery({ hasPublicApi: true }), wire, [], [], undefined, "x-api-key"));
    expect(src).toContain('process.env.AUTH_HEADER ?? "x-api-key"');
  });

  it("uses the probe-discovered origin as the API base", () => {
    const d = discovery({
      probe: { reachable: true, origins: ["https://api.acme.example"], openApiUrl: "https://api.acme.example/openapi.json", apiType: "rest", aiEndpoints: [], hits: [], telemetry: [] },
    });
    expect(generateBundle(d, wire, []).apiBase).toBe("https://api.acme.example");
  });
});
