import { describe, it, expect } from "vitest";
import { validateDockerArgv } from "./docker-run";

const PINNED = "bbernhard/signal-cli-rest-api@sha256:2399d449123cdad56c4d859277e3b9127e1a00c4d2ab4601c239882609286cf8";

describe("validateDockerArgv", () => {
  it("allows a digest-pinned docker run with safe flags", () => {
    expect(validateDockerArgv(["docker", "run", "-d", "--rm", "--name", "nw-signal", "-p", "8080:8080", PINNED])).toEqual({ ok: true });
  });

  it("allows read-only introspection subcommands", () => {
    expect(validateDockerArgv(["docker", "ps"]).ok).toBe(true);
    expect(validateDockerArgv(["docker", "inspect", "nw-signal"]).ok).toBe(true);
    expect(validateDockerArgv(["docker", "logs", "nw-signal"]).ok).toBe(true);
  });

  it("rejects an unpinned (tag-only) image", () => {
    const v = validateDockerArgv(["docker", "run", "-d", "bbernhard/signal-cli-rest-api:latest"]);
    expect(v.ok).toBe(false);
    expect((v as { reason: string }).reason).toMatch(/@sha256/);
  });

  it("rejects host mounts, privileged, capabilities, devices even with a pinned image", () => {
    expect(validateDockerArgv(["docker", "run", "-v", "/:/host", PINNED]).ok).toBe(false);
    expect(validateDockerArgv(["docker", "run", "--volume", "/etc:/etc", PINNED]).ok).toBe(false);
    expect(validateDockerArgv(["docker", "run", "--privileged", PINNED]).ok).toBe(false);
    expect(validateDockerArgv(["docker", "run", "--cap-add", "SYS_ADMIN", PINNED]).ok).toBe(false);
    expect(validateDockerArgv(["docker", "run", "--device", "/dev/sda", PINNED]).ok).toBe(false);
    expect(validateDockerArgv(["docker", "run", "--mount", "type=bind,src=/,dst=/host", PINNED]).ok).toBe(false);
    expect(validateDockerArgv(["docker", "run", "--entrypoint", "/bin/sh", PINNED]).ok).toBe(false);
  });

  it("rejects host networking in both forms", () => {
    expect(validateDockerArgv(["docker", "run", "--network=host", PINNED]).ok).toBe(false);
    expect(validateDockerArgv(["docker", "run", "--network", "host", PINNED]).ok).toBe(false);
    expect(validateDockerArgv(["docker", "run", "--pid", "host", PINNED]).ok).toBe(false);
  });

  it("rejects non-run mutating subcommands (exec, cp, build, save)", () => {
    for (const sub of ["exec", "cp", "build", "save", "load", "commit", "export"]) {
      expect(validateDockerArgv(["docker", sub, "whatever"]).ok).toBe(false);
    }
  });

  it("rejects a non-docker binary and malformed input", () => {
    expect(validateDockerArgv(["bash", "-c", "rm -rf /"]).ok).toBe(false);
    expect(validateDockerArgv([]).ok).toBe(false);
    expect(validateDockerArgv("docker run").ok).toBe(false);
    expect(validateDockerArgv(["docker", 5]).ok).toBe(false);
  });
});
