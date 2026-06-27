// The execution ALLOWLIST. Every command the NodeWorm Agent can ever run comes from
// a curated recipe here, as argv arrays (never shell strings, never LLM-generated
// shell). A compromised or confused cloud cannot invent commands; it can only pick a
// recipe from this file and fill validated parameters (port). This is the single
// most important security boundary of agentic execution.

import type { ExecuteTask } from "./types";

export interface ConnectorRecipe {
  connectorName: string;
  apps: string[]; // app names (lowercase) this recipe sets up
  summary: string;
  port: number; // localhost port the connector is exposed on
  healthPath: string; // the connector's health endpoint (relative)
  build(port: number): ExecuteTask[];
  humanActions: string[]; // plain-English list of what the user will be asked to do
}

// Pinned by digest, never :latest. Verified against Docker Hub.
const SIGNAL_IMAGE =
  "bbernhard/signal-cli-rest-api:0.100@sha256:2399d449123cdad56c4d859277e3b9127e1a00c4d2ab4601c239882609286cf8";
const SIGNAL_CONTAINER = "nodeworm-signal";
const SIGNAL_VOLUME = "nodeworm-signal-data"; // keeps the linked device across restarts

const SIGNAL: ConnectorRecipe = {
  connectorName: "signal-cli-rest-api",
  apps: ["signal"],
  summary: "Run signal-cli-rest-api locally in Docker, link your Signal account by QR, and connect.",
  port: 8080,
  healthPath: "/v1/about",
  humanActions: [
    "Approve this plan once (you will see every command before it runs).",
    "Scan the device-link QR with Signal on your phone (Signal > Settings > Linked devices).",
  ],
  build(port) {
    const base = `http://localhost:${port}`;
    return [
      {
        n: 1,
        kind: "shell",
        title: "Check Docker is installed",
        description: "Confirms Docker is available before doing anything.",
        command: ["docker", "--version"],
        verify: { kind: "shell-exit", command: ["docker", "--version"] },
        requiresHuman: false,
        criticalPath: true,
        timeoutMs: 15000,
      },
      {
        n: 2,
        kind: "shell",
        title: "Clear any previous NodeWorm Signal container",
        description: "Removes a stale container from a prior run so this is repeatable.",
        command: ["docker", "rm", "-f", SIGNAL_CONTAINER],
        requiresHuman: false,
        criticalPath: false, // fine if nothing was there to remove
        timeoutMs: 30000,
      },
      {
        n: 3,
        kind: "docker-run",
        title: "Start the Signal connector",
        description: `Runs the official signal-cli-rest-api image in a container on port ${port}, with a volume that keeps your link across restarts.`,
        command: [
          "docker",
          "run",
          "-d",
          "--name",
          SIGNAL_CONTAINER,
          "-p",
          `${port}:8080`,
          "-e",
          "MODE=json-rpc",
          "-v",
          `${SIGNAL_VOLUME}:/home/.local/share/signal-cli`,
          SIGNAL_IMAGE,
        ],
        verify: { kind: "http-health", url: `${base}/v1/about`, expectStatusMax: 500 },
        rollback: { command: ["docker", "rm", "-f", SIGNAL_CONTAINER] },
        requiresHuman: false,
        criticalPath: true,
        timeoutMs: 180000, // image pull can be slow the first time
      },
      {
        n: 4,
        kind: "link-qr",
        title: "Link your Signal account",
        description: "NodeWorm shows the device-link QR from your local connector. Scan it with Signal on your phone; NodeWorm waits until the link completes.",
        qrUrl: `${base}/v1/qrcodelink?device_name=NodeWorm`,
        linkedUrl: `${base}/v1/accounts`,
        requiresHuman: true,
        humanKind: "qr-scan",
        humanPrompt: "Open Signal on your phone > Settings > Linked devices > Link new device, and scan this QR.",
        criticalPath: true,
        timeoutMs: 300000,
      },
      {
        n: 5,
        kind: "verify",
        title: "Confirm the connector is live",
        description: "One real read of the running connector before NodeWorm marks it connected.",
        verify: { kind: "http-health", url: `${base}/v1/about`, expectStatusMax: 500 },
        requiresHuman: false,
        criticalPath: true,
        timeoutMs: 15000,
      },
    ];
  },
};

const RECIPES: ConnectorRecipe[] = [SIGNAL];

const norm = (s: string) => s.trim().toLowerCase();

// A recipe exists for this app AND the Pathfinder's method matches a hostable kind.
export function recipeForApp(appName: string): ConnectorRecipe | undefined {
  const a = norm(appName);
  return RECIPES.find((r) => r.apps.some((x) => norm(x) === a));
}

export function recipeStatus(): Array<{ connectorName: string; apps: string[] }> {
  return RECIPES.map((r) => ({ connectorName: r.connectorName, apps: r.apps }));
}
