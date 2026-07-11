// Docker argv allowlist. The NodeWorm Agent will only ever run Ed25519-signed
// plans, but a docker task is an RCE primitive if its argv is unconstrained: a
// tampered or buggy cloud could smuggle `docker run --privileged -v /:/host ...`
// and own the machine. So the Agent independently validates every docker argv
// against this allowlist before spawning, mirroring validateNpmRun. This module is
// the tested source of truth; the Agent (plain JS) mirrors it inline.
//
// Rules: only read-only introspection subcommands, or `run` with an image pinned by
// @sha256: digest and none of the flags that would breach the container sandbox
// (host mounts, host namespaces, privileged, added capabilities, devices, custom
// entrypoint). Everything else (exec, cp, build, save/load, commit, ...) is refused.

export type DockerVerdict = { ok: true } | { ok: false; reason: string };

// Subcommands that only read state; they cannot execute code or mutate the host.
const READONLY_SUBCOMMANDS = new Set(["ps", "inspect", "logs", "version", "info", "port", "top"]);

// Flags on `docker run` that break the container boundary. Compared against the
// part before any `=`, so `--network=host` and `--network host` both match here for
// the ones that take a value, and value-less ones (`--privileged`) match directly.
const DANGEROUS_RUN_FLAGS = new Set([
  "--privileged",
  "-v",
  "--volume",
  "--mount",
  "--device",
  "--cap-add",
  "--pid",
  "--ipc",
  "--uts",
  "--userns",
  "--security-opt",
  "--cgroup-parent",
  "--entrypoint",
  "--group-add",
]);

const DIGEST_PINNED = /@sha256:[0-9a-f]{64}$/;

export function validateDockerArgv(command: unknown): DockerVerdict {
  if (!Array.isArray(command) || command.length === 0) return { ok: false, reason: "Empty or invalid command." };
  if (command.some((a) => typeof a !== "string")) return { ok: false, reason: "Command args must all be strings." };
  const argv = command as string[];
  if (argv[0] !== "docker") return { ok: false, reason: `binary not allowed: ${argv[0]}` };

  const sub = argv[1];
  if (!sub) return { ok: false, reason: "docker needs a subcommand" };
  if (READONLY_SUBCOMMANDS.has(sub)) return { ok: true };
  if (sub !== "run") return { ok: false, reason: `docker ${sub} not allowed (only run + read-only introspection)` };

  const rest = argv.slice(2);
  let hasPinnedImage = false;
  for (let i = 0; i < rest.length; i++) {
    const tok = rest[i];
    const base = tok.split("=")[0];
    if (DANGEROUS_RUN_FLAGS.has(base)) return { ok: false, reason: `docker run flag not allowed: ${base}` };
    // Reject host networking / host PID etc. whether given as --network=host or --network host.
    if (base === "--network" || base === "--net") {
      const val = tok.includes("=") ? tok.split("=")[1] : rest[i + 1];
      if (val === "host") return { ok: false, reason: "docker run --network host not allowed" };
    }
    if (DIGEST_PINNED.test(tok)) hasPinnedImage = true;
  }
  if (!hasPinnedImage) return { ok: false, reason: "docker run image must be pinned by @sha256: digest" };
  return { ok: true };
}
