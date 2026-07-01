// Agentic local execution: NodeWorm turns a connector's setup steps into a SIGNED,
// allowlisted execution plan that the user's locally-installed NodeWorm Agent (a
// native-messaging host) runs hands-off, pausing only for the human-only boundary
// (passwords, sudo, auth-approve, QR scan, 2FA). The cloud NEVER emits free-form
// shell: every command is an argv array drawn from a curated, digest-pinned recipe,
// and the whole plan is Ed25519-signed so the Agent only runs trusted plans.

import type { ResearchKind } from "../types";

export type TaskKind =
  | "docker-run" // run a containerized connector (preferred: the container is the sandbox)
  | "shell" // a single allowlisted argv command (e.g. `docker version`)
  | "verify" // a check probe, no side effects
  | "link-qr" // fetch a device-link QR from the local connector, show it, poll until linked
  | "manual" // a pure human step (scan a QR, approve), the Agent only waits
  | "signal-start" // start the bundled native signal-cli daemon (no Docker)
  | "signal-link" // startLink -> show QR -> finishLink (blocks until phone scans)
  | "signal-verify" // listAccounts on the linked native connector
  | "capture-session"; // spawn a capture process that opens a browser; Agent shows a prompt and
                       // polls captureReadyUrl until the tool signals completion, then continues

// The human-only actions the Agent must PAUSE for and never perform itself.
export type HumanKind = "password" | "username" | "auth-approve" | "2fa" | "qr-scan" | "wait";

export interface VerifyProbe {
  kind: "http-health" | "shell-exit" | "docker-running";
  url?: string; // http-health, on localhost (checked by the Agent on the user's machine)
  command?: string[]; // shell-exit / docker-running: argv, never a shell string
  expectStatusMax?: number; // http-health: pass if status < this (default 400)
}

export interface ExecuteTask {
  n: number;
  kind: TaskKind;
  title: string; // user-facing
  description: string;
  command?: string[]; // ARGV array; never a shell string with metacharacters
  cwd?: string;
  env?: Record<string, string>;
  // link-qr only: the local QR endpoint to fetch + display, and the local endpoint to
  // poll until the device links (a non-empty JSON array means linked).
  qrUrl?: string;
  linkedUrl?: string;
  // capture-session only: URL polled by the Agent to know when the capture subprocess
  // has finished writing the client (the wrapper server exposes GET /ready -> 200).
  captureReadyUrl?: string;
  verify?: VerifyProbe; // run after the task; failure on a criticalPath task aborts + rolls back
  rollback?: { command: string[] }; // idempotent cleanup run on failure / abort
  requiresHuman: boolean; // a pause point: the Agent hands control back to the user
  humanKind?: HumanKind;
  humanPrompt?: string;
  criticalPath: boolean; // false = a failure logs a warning but does not abort the plan
  timeoutMs?: number;
}

export interface ExecutionPlan {
  id: string;
  integrationId: string;
  connectorName: string; // e.g. "signal-cli-rest-api"
  appName: string;
  researchKind: ResearchKind;
  surface: "native-host";
  summary: string;
  warnings: string[];
  humanActions: string[]; // plain-English list of every moment the user will be asked to act
  connectorUrl: string; // where the connector will be reachable once up (localhost)
  tasks: ExecuteTask[];
  callbackUrl: string; // absolute URL the Agent POSTs the final result to
  callbackToken: string; // one-time, short-lived bearer authenticating the Agent's callback
  createdAt: number;
  expiresAt: number; // createdAt + 1h; the Agent refuses an expired plan
}

// Transport envelope: the route signs the EXACT canonical JSON string and ships it
// verbatim, so the Agent verifies the signature over the same bytes it parses (no
// canonicalization mismatch). The UI JSON.parses planJson to render the preview and
// forwards the whole envelope to the Agent via the extension.
export interface SignedPlanEnvelope {
  planJson: string; // canonical JSON of an ExecutionPlan
  signature: string; // base64 Ed25519 over planJson (utf-8)
  algo: "ed25519";
  publicKeyId: string;
}

// What the Agent POSTs back to the callback once the plan finishes (or aborts).
export interface ExecutionResult {
  planId: string;
  ok: boolean;
  aborted?: boolean;
  steps: Array<{ n: number; ok: boolean; verified?: boolean; detail?: string }>;
  connectorReachable?: boolean; // the Agent's local probe of connectorUrl succeeded
  detail?: string;
}
