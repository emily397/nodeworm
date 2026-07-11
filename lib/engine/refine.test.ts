import { describe, it, expect } from "vitest";
import { buildManifest, validateRefinement, type ToolInfo } from "./refine";
import type { Discovery, OpenApiOp } from "./types";

const OPS: OpenApiOp[] = [
  { method: "get", path: "/v2/projects/{id}", name: "getProject", summary: "Fetch a project" },
  { method: "post", path: "/v2/projects", name: "createProject", summary: "Create a project" },
];

function disc(over: Partial<Discovery> = {}): Discovery {
  return { appName: "Acme", hasPublicApi: true, apiType: "rest", entities: ["Project", "User"], ...over } as unknown as Discovery;
}

describe("buildManifest", () => {
  it("names per-op tools exactly as the generator emits them, with params", () => {
    const m = buildManifest(disc(), OPS, []);
    expect(m.map((t) => t.name)).toEqual(["getproject", "createproject"]);
    expect(m[0].params).toEqual(["id", "query"]); // path param + query, no body on GET
    expect(m[1].params).toEqual(["query", "body"]); // POST adds body
  });

  it("builds per-entity list tools when there are no ops (conventions scraper/API)", () => {
    const m = buildManifest(disc({ entities: ["Widget"] } as Partial<Discovery>), [], []);
    expect(m.map((t) => t.name)).toContain("list_widgets");
  });
});

describe("validateRefinement (the snapshot gate)", () => {
  const manifest: ToolInfo[] = buildManifest(disc(), OPS, []);

  it("SNAPSHOT: output keys always equal the manifest tool set, for ANY proposed input", () => {
    const inputs: unknown[] = [
      null,
      {},
      "not an object",
      { getproject: "ok desc" },
      { nonexistent_tool: "invented", getproject: "good" }, // invented tool must be dropped
      { getproject: 123, createproject: ["array"] }, // wrong types
      { getproject: "x".repeat(9999) }, // oversized
    ];
    const expected = ["getproject", "createproject"].sort();
    for (const proposed of inputs) {
      const out = validateRefinement(manifest, proposed);
      expect(Object.keys(out).sort()).toEqual(expected); // tool SET is invariant
    }
  });

  it("uses a safe refined description, drops unsafe ones back to the default", () => {
    const out = validateRefinement(manifest, {
      getproject: "Retrieve a single project by its id.",
      createproject: "Create a project <script>alert(1)</script>", // markup -> rejected
    });
    expect(out.getproject).toBe("Retrieve a single project by its id.");
    expect(out.createproject).toBe(manifest.find((t) => t.name === "createproject")!.description); // fell back
  });

  it("rejects URLs, newlines, and empty strings", () => {
    const out = validateRefinement(manifest, {
      getproject: "See https://evil.example.com for details",
      createproject: "line one\nline two",
    });
    expect(out.getproject).toBe(manifest[0].description);
    expect(out.createproject).toBe(manifest[1].description);
  });

  it("never invents a tool the manifest doesn't have", () => {
    const out = validateRefinement(manifest, { totally_made_up: "nope" });
    expect(out).not.toHaveProperty("totally_made_up");
  });
});
