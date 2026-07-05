// The npm/node execution allowlist. The NodeWorm Agent may build + start a
// GENERATED connector bundle, but the cloud must never be able to make it run an
// arbitrary command. Every argv the Agent runs for a bundle passes through here:
// a fixed set of exact shapes, install locked to --ignore-scripts (so a malicious
// dependency's postinstall can't execute), and a hard reject on any shell
// metacharacter. This mirrors the recipes.ts allowlist philosophy for the
// generated-connector path.

const META = /[;&|`$(){}<>\n\r*?~!#]/; // shell metacharacters that must never appear

export interface NpmRunVerdict {
  ok: boolean;
  reason?: string;
}

export function validateNpmRun(command: unknown): NpmRunVerdict {
  if (!Array.isArray(command) || command.length === 0) {
    return { ok: false, reason: "Empty or invalid command." };
  }
  if (command.some((a) => typeof a !== "string")) {
    return { ok: false, reason: "All argv entries must be strings." };
  }
  const argv = command as string[];
  if (argv.some((a) => META.test(a))) {
    return { ok: false, reason: "Command contains disallowed shell metacharacters." };
  }

  const [bin, ...rest] = argv;

  if (bin === "node") {
    // Only the built connector entrypoint, nothing else (no -e, no other path).
    if (rest.length === 1 && rest[0] === "dist/index.js") return { ok: true };
    return { ok: false, reason: "node may only run dist/index.js." };
  }

  if (bin === "npm") {
    const sub = rest[0];
    if (sub === "install" || sub === "ci") {
      // Dependencies install ONLY with lifecycle scripts disabled.
      if (rest.length === 2 && rest[1] === "--ignore-scripts") return { ok: true };
      return { ok: false, reason: "install/ci must be exactly `--ignore-scripts` with no other flags." };
    }
    if (sub === "run") {
      if (rest.length === 2 && rest[1] === "build") return { ok: true };
      return { ok: false, reason: "npm run is limited to the `build` script." };
    }
    if (sub === "start") {
      if (rest.length === 1) return { ok: true };
      return { ok: false, reason: "npm start takes no extra arguments." };
    }
    return { ok: false, reason: `npm subcommand not allowed: ${sub}` };
  }

  return { ok: false, reason: `Binary not allowed: ${bin}` };
}

// The exact argv shapes the Agent is permitted to run for a generated bundle, in
// order. The signed plan emits these; the Agent re-validates each with the guard
// above before spawning, so a tampered plan cannot smuggle a different command.
export const NPM_RUN_SEQUENCE: string[][] = [
  ["npm", "install", "--ignore-scripts"],
  ["npm", "run", "build"],
];
