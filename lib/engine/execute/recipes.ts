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

const SIGNAL: ConnectorRecipe = {
  connectorName: "signal-cli-native",
  apps: ["signal"],
  summary: "Run the bundled Signal connector locally (no Docker), link your Signal account by QR, and connect.",
  port: 0, // native: agent picks a free loopback port for the signal-cli daemon
  healthPath: "",
  humanActions: [
    "Scan the device-link QR with Signal on your phone (Signal > Settings > Linked devices).",
  ],
  build() {
    return [
      {
        n: 1,
        kind: "signal-start",
        title: "Start the Signal connector",
        description: "Starts the bundled signal-cli connector on your machine (no Docker, no install). First start can take up to a minute.",
        requiresHuman: false,
        criticalPath: true,
        timeoutMs: 130000,
      },
      {
        n: 2,
        kind: "signal-link",
        title: "Link your Signal account",
        description: "NodeWorm shows a device-link QR. Scan it with Signal on your phone; NodeWorm waits until the link completes.",
        requiresHuman: true,
        humanKind: "qr-scan",
        humanPrompt: "Open Signal on your phone > Settings > Linked devices > Link new device, and scan this QR.",
        criticalPath: true,
        timeoutMs: 300000,
      },
      {
        n: 3,
        kind: "signal-verify",
        title: "Confirm the connector is live",
        description: "One real read of the linked account before NodeWorm marks it connected.",
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
