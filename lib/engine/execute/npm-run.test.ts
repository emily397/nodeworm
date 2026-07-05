import { describe, it, expect } from "vitest";
import { validateNpmRun } from "./npm-run";

describe("validateNpmRun", () => {
  it("allows the deploy lifecycle (install with scripts blocked, build, start)", () => {
    expect(validateNpmRun(["npm", "ci", "--ignore-scripts"]).ok).toBe(true);
    expect(validateNpmRun(["npm", "install", "--ignore-scripts"]).ok).toBe(true);
    expect(validateNpmRun(["npm", "run", "build"]).ok).toBe(true);
    expect(validateNpmRun(["npm", "start"]).ok).toBe(true);
    expect(validateNpmRun(["node", "dist/index.js"]).ok).toBe(true);
  });

  it("blocks install without --ignore-scripts (postinstall RCE vector)", () => {
    const r = validateNpmRun(["npm", "install"]);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/ignore-scripts/i);
  });

  it("blocks arbitrary npm run scripts other than build", () => {
    expect(validateNpmRun(["npm", "run", "postinstall"]).ok).toBe(false);
    expect(validateNpmRun(["npm", "run", "evil"]).ok).toBe(false);
  });

  it("blocks non-allowlisted binaries", () => {
    expect(validateNpmRun(["rm", "-rf", "/"]).ok).toBe(false);
    expect(validateNpmRun(["curl", "http://x"]).ok).toBe(false);
  });

  it("blocks node running anything but the built entrypoint", () => {
    expect(validateNpmRun(["node", "-e", "process.exit(1)"]).ok).toBe(false);
    expect(validateNpmRun(["node", "../../../etc/passwd"]).ok).toBe(false);
  });

  it("blocks shell metacharacters smuggled into args", () => {
    expect(validateNpmRun(["npm", "run", "build; rm -rf /"]).ok).toBe(false);
    expect(validateNpmRun(["npm", "install", "--ignore-scripts", "&&curl evil"]).ok).toBe(false);
    expect(validateNpmRun(["npm", "run", "build`whoami`"]).ok).toBe(false);
  });

  it("rejects empty or non-array input", () => {
    expect(validateNpmRun([]).ok).toBe(false);
    expect(validateNpmRun(undefined).ok).toBe(false);
  });
});
