// Dynamic recipe for the reverse-api-capture connector method.
// Unlike the per-app recipes in recipes.ts (which are hardcoded to known apps),
// this works for ANY app that has a URL and no documented API. The capture tool
// opens a browser at appUrl; the user logs in (the only human step); the tool
// records the HAR and generates a Python client; the wrapper server starts on
// localhost and NodeWorm verifies it exactly like any other connector.
//
// Server-only. The Agent side handles "capture-session" TaskKind by:
//   1. Spawning the command as a subprocess.
//   2. Showing humanPrompt so the user knows to interact in the opened browser.
//   3. Polling captureReadyUrl every 5 s until it returns 200 (tool finished).
//   4. Continuing to the next task.

import { join } from "path";
import { homedir } from "os";
import type { ExecuteTask } from "./types";

const CONNECTOR_PORT = 9080;
const WRAPPER_SERVER_URL = "/agent/nodeworm-connector-server.py";

// Where generated clients land. Scoped per-app so repeated captures do not
// overwrite each other. The Agent runs on the user's machine so homedir() is
// the user's home, not the server's.
function outputDir(appSlug: string): string {
  return join(homedir(), ".nodeworm", "connectors", appSlug);
}

function clientPath(appSlug: string): string {
  return join(outputDir(appSlug), "api_client.py");
}

// Slugify the app name to a safe directory segment.
function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Returns the static wrapper server path on the user's machine. The Agent
// downloads it from the NodeWorm server (served from /public/agent/) the first
// time and caches it locally. The server-download URL is passed as the command
// arg so the Agent knows where to fetch it.
function wrapperServerPath(appSlug: string): string {
  return join(homedir(), ".nodeworm", "connectors", appSlug, "nodeworm-connector-server.py");
}

export interface CaptureRecipeParams {
  appName: string;
  appUrl: string;
  // The public origin of the NodeWorm deployment, used to build the absolute
  // URL of the bundled wrapper server script (served from /public/agent/).
  origin: string;
}

export function captureRecipeAvailable(appUrl?: string): boolean {
  return Boolean(appUrl);
}

export function buildCaptureTasks(params: CaptureRecipeParams): ExecuteTask[] {
  const { appName, appUrl, origin } = params;
  const appSlug = slug(appName);
  const outDir = outputDir(appSlug);
  const client = clientPath(appSlug);
  const wrapperSrc = `${origin}${WRAPPER_SERVER_URL}`;
  const wrapperDest = wrapperServerPath(appSlug);
  const base = `http://localhost:${CONNECTOR_PORT}`;

  const capturePrompt = [
    `Capture every authenticated API endpoint and data operation for ${appName}.`,
    "Include: list endpoints, get/fetch single items, create/update/delete where they exist.",
    "Record all request headers (especially Authorization, Cookie, X-* tokens) and response shapes.",
    "Generate a complete Python client with one function per endpoint.",
  ].join(" ");

  return [
    {
      n: 1,
      kind: "shell",
      title: "Check Python is available",
      description: "Confirms Python 3 is installed before doing anything.",
      command: ["python3", "--version"],
      verify: { kind: "shell-exit", command: ["python3", "--version"] },
      requiresHuman: false,
      criticalPath: true,
      timeoutMs: 10000,
    },
    {
      n: 2,
      kind: "shell",
      title: "Install reverse-api-engineer",
      description: "Installs the capture tool via pip. Safe to re-run: --upgrade is idempotent.",
      command: ["pip3", "install", "--quiet", "--upgrade", "reverse-api-engineer"],
      verify: { kind: "shell-exit", command: ["python3", "-m", "reverse_api", "--version"] },
      requiresHuman: false,
      criticalPath: true,
      timeoutMs: 120000,
    },
    {
      n: 3,
      kind: "shell",
      title: "Create output directory",
      description: `Creates ${outDir} to hold the generated client.`,
      command: ["python3", "-c", `import os; os.makedirs(r"${outDir}", exist_ok=True)`],
      requiresHuman: false,
      criticalPath: true,
      timeoutMs: 10000,
    },
    {
      n: 4,
      kind: "shell",
      title: "Download connector wrapper server",
      description: "Fetches the bundled NodeWorm wrapper server script that exposes the generated client as HTTP.",
      command: [
        "python3", "-c",
        `import urllib.request, os; urllib.request.urlretrieve("${wrapperSrc}", r"${wrapperDest}")`,
      ],
      requiresHuman: false,
      criticalPath: true,
      timeoutMs: 30000,
    },
    {
      n: 5,
      kind: "capture-session",
      title: `Log into ${appName} (your only step)`,
      description: [
        `A browser window will open at ${appUrl}.`,
        `Log in with your ${appName} credentials, then browse to your main screens`,
        "(your contacts, tasks, files, or whatever you use this app for).",
        "NodeWorm is watching the network traffic.",
        "When you have loaded the key screens, close the browser tab.",
        "NodeWorm will then generate the connector automatically.",
      ].join(" "),
      command: [
        "python3", "-m", "reverse_api", "agent",
        "--url", appUrl,
        "--prompt", capturePrompt,
        "--output-dir", outDir,
        "--output-language", "python",
      ],
      captureReadyUrl: `file://${client}`,
      requiresHuman: true,
      humanKind: "wait",
      humanPrompt: [
        `A browser has opened at ${appUrl}.`,
        `Log in to ${appName}, then browse to the key screens you want NodeWorm to be able to access.`,
        "When you are done, close the browser tab. NodeWorm will generate your connector.",
      ].join(" "),
      criticalPath: true,
      timeoutMs: 600000, // 10 min ceiling; user controls actual duration
    },
    {
      n: 6,
      kind: "shell",
      title: "Start the connector server",
      description: `Launches the generated client as a local HTTP connector on port ${CONNECTOR_PORT}. NodeWorm reaches it exactly like any self-hosted connector.`,
      command: [
        "python3", wrapperDest,
        "--client", client,
        "--port", String(CONNECTOR_PORT),
      ],
      verify: { kind: "http-health", url: `${base}/health`, expectStatusMax: 400 },
      rollback: { command: ["python3", "-c", `import sys; sys.exit(0)`] },
      requiresHuman: false,
      criticalPath: true,
      timeoutMs: 30000,
    },
    {
      n: 7,
      kind: "verify",
      title: "Confirm the connector is live",
      description: "One real read of the running connector before NodeWorm marks it connected.",
      verify: { kind: "http-health", url: `${base}/health`, expectStatusMax: 400 },
      requiresHuman: false,
      criticalPath: true,
      timeoutMs: 15000,
    },
  ];
}

export const CAPTURE_CONNECTOR_PORT = CONNECTOR_PORT;
