import { describe, it, expect, beforeAll } from "vitest";
import { generateKeyPairSync, createPublicKey, verify as edVerify } from "node:crypto";
import { buildSignedBuildPlan } from "./plan";
import { validateNpmRun } from "./npm-run";
import type { Integration } from "../types";

let publicKeyDer: Buffer;

beforeAll(() => {
  // A throwaway Ed25519 key so signing is available in the test env.
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  process.env.EXECUTE_SIGNING_KEY = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
  publicKeyDer = publicKey.export({ format: "der", type: "spki" }) as Buffer;
});

function fakeIntegration(): Integration {
  return {
    id: "abc123",
    appName: "Acme",
    status: "generated",
    createdAt: 0,
    updatedAt: 0,
    currentPhase: 5,
    phases: [],
    mode: "heuristic",
    secrets: [],
    generated: {
      kind: "mcp",
      connectorName: "acme-mcp",
      language: "typescript",
      files: [{ path: "package.json", content: "{}" }],
      deploySteps: [],
      generatedAt: 0,
    },
  } as Integration;
}

describe("buildSignedBuildPlan", () => {
  it("emits only allowlisted npm-run tasks in the given cwd", () => {
    const built = buildSignedBuildPlan(fakeIntegration(), "https://x.test", "C:/Users/me/acme-mcp");
    expect(built).not.toBeNull();
    for (const t of built!.plan.tasks) {
      expect(t.kind).toBe("npm-run");
      expect(t.cwd).toBe("C:/Users/me/acme-mcp");
      expect(validateNpmRun(t.command!).ok).toBe(true);
    }
    // install (scripts disabled) must precede build.
    expect(built!.plan.tasks[0].command).toEqual(["npm", "install", "--ignore-scripts"]);
    expect(built!.plan.tasks[1].command).toEqual(["npm", "run", "build"]);
  });

  it("produces a signature that verifies over the exact plan JSON", () => {
    const built = buildSignedBuildPlan(fakeIntegration(), "https://x.test", "/home/me/acme")!;
    const pub = createPublicKey({ key: publicKeyDer, format: "der", type: "spki" });
    const ok = edVerify(null, Buffer.from(built.envelope.planJson, "utf8"), pub, Buffer.from(built.envelope.signature, "base64"));
    expect(ok).toBe(true);
    expect(JSON.parse(built.envelope.planJson).id).toBe(built.plan.id);
  });

  it("rejects a cwd with shell metacharacters", () => {
    expect(buildSignedBuildPlan(fakeIntegration(), "https://x.test", "/tmp/x; rm -rf /")).toBeNull();
  });

  it("rejects path traversal in cwd", () => {
    expect(buildSignedBuildPlan(fakeIntegration(), "https://x.test", "../../etc")).toBeNull();
    expect(buildSignedBuildPlan(fakeIntegration(), "https://x.test", "/home/me/../../root")).toBeNull();
  });

  it("returns null when signing is unavailable", () => {
    const saved = process.env.EXECUTE_SIGNING_KEY;
    delete process.env.EXECUTE_SIGNING_KEY;
    expect(buildSignedBuildPlan(fakeIntegration(), "https://x.test", "/home/me/acme")).toBeNull();
    process.env.EXECUTE_SIGNING_KEY = saved;
  });
});
