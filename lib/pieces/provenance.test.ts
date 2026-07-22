import { describe, expect, it } from "vitest";
import { pieceProvenance } from "./registry";

// Licence guard. Activepieces is MIT at the root but carves out TWO enterprise
// paths (packages/ee and packages/server/api/src/app/ee) under a paid licence that
// forbids copying. Nothing adapted here may originate from either, and every piece
// must carry a pinned commit plus an approved licence. This test is the CI gate.
const APPROVED = new Set(["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause"]);
const FORBIDDEN = [/(^|\/)packages\/ee(\/|$)/, /server\/api\/src\/app\/ee(\/|$)/, /(^|\/)ee(\/|$)/];

describe("piece provenance", () => {
  const all = pieceProvenance();

  it("registers at least one adapted piece", () => {
    expect(all.length).toBeGreaterThan(0);
  });

  it("never sources from an Activepieces enterprise carve-out path", () => {
    for (const p of all) {
      if (p.origin !== "activepieces") continue;
      for (const bad of FORBIDDEN) {
        expect(bad.test(p.sourcePath), `${p.name} sourcePath ${p.sourcePath} hits an ee carve-out`).toBe(false);
      }
    }
  });

  it("pins every adapted piece to a real upstream commit under an approved licence", () => {
    for (const p of all) {
      if (p.origin !== "activepieces") continue;
      expect(APPROVED.has(p.license), `${p.name} licence ${p.license} is not permissive`).toBe(true);
      expect(p.sha, `${p.name} is not pinned`).toMatch(/^[0-9a-f]{40}$/);
      expect(p.repo.length).toBeGreaterThan(0);
    }
  });

  // A piece authored from vendor docs must NOT claim an upstream commit it did
  // not come from: that would put a false attribution on the /oss page.
  it("keeps vendor-authored pieces free of any third-party licence claim", () => {
    for (const p of all) {
      if (p.origin !== "vendor-docs") continue;
      expect(p.docsUrl, `${p.name} has no vendor docs reference`).toMatch(/^https:\/\//);
      expect("sha" in p, `${p.name} claims an upstream commit it did not come from`).toBe(false);
      expect("license" in p, `${p.name} claims a third-party licence it does not carry`).toBe(false);
    }
  });

  it("declares an origin for every piece", () => {
    for (const p of all) {
      expect(["activepieces", "vendor-docs"]).toContain(p.origin);
    }
  });
});
