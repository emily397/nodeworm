#!/usr/bin/env node
"use strict";
// NodeWorm Agent: a Chrome native-messaging host that runs SIGNED, allowlisted
// execution plans issued by NodeWorm and relayed by the NodeWorm Helper extension.
//
// Security model (load-bearing):
//  - Every plan is Ed25519-verified against the embedded public key. An invalid or
//    expired signature is refused. Nothing the offline key did not sign ever runs.
//  - Only argv-array commands whose binary is on ALLOWED_BINS are executed, with
//    shell:false (no shell, no metacharacter expansion, no injection).
//  - It NEVER types passwords / sudo / clicks auth approvals; human steps pause and
//    wait for the user, who acts out of band.
//  - Append-only audit log at ~/.nodeworm/audit.log.
//  - stdout is reserved for native-messaging framing; all logging goes to the audit
//    file. A stray stdout write would corrupt the protocol, so we never console.log.

const { createPublicKey, verify } = require("crypto");
const { execFile } = require("child_process");
const { appendFileSync, mkdirSync } = require("fs");
const os = require("os");
const path = require("path");

const VERSION = "1.0.0";
const PUBLIC_KEY_ID = "nw-exec-ed25519-1";
const PUBLIC_KEY_B64 = "MCowBQYDK2VwAyEA0gSYkfXv72byhI08OkQIelEEB/5xEYj0VPzb5OtRDHQ=";
const PUBLIC_KEY = createPublicKey({ key: Buffer.from(PUBLIC_KEY_B64, "base64"), format: "der", type: "spki" });

// The ONLY executables the Agent may launch. Docker is the sandbox: connectors run
// inside containers, not on the host. Extend this set only with a security review.
const ALLOWED_BINS = new Set(["docker"]);

const AGENT_DIR = path.join(os.homedir(), ".nodeworm");
const AUDIT = path.join(AGENT_DIR, "audit.log");
try { mkdirSync(AGENT_DIR, { recursive: true }); } catch (_) {}
function audit(obj) {
  try { appendFileSync(AUDIT, JSON.stringify({ t: new Date().toISOString(), ...obj }) + "\n"); } catch (_) {}
}

// ---- native-messaging framing (4-byte LE length prefix + JSON) ----
function send(msg) {
  const body = Buffer.from(JSON.stringify(msg), "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(body.length, 0);
  process.stdout.write(len);
  process.stdout.write(body);
}

let inbuf = Buffer.alloc(0);
let aborted = false;
let humanResolver = null;

process.stdin.on("data", (chunk) => {
  inbuf = Buffer.concat([inbuf, chunk]);
  while (inbuf.length >= 4) {
    const len = inbuf.readUInt32LE(0);
    if (inbuf.length < 4 + len) break;
    let msg = null;
    try { msg = JSON.parse(inbuf.slice(4, 4 + len).toString("utf8")); } catch (_) {}
    inbuf = inbuf.slice(4 + len);
    if (msg) handle(msg);
  }
});
process.stdin.on("end", () => process.exit(0));

function handle(msg) {
  if (!msg || typeof msg !== "object") return;
  switch (msg.type) {
    case "nw_ping":
      send({ type: "nw_pong", version: VERSION, publicKeyId: PUBLIC_KEY_ID });
      return;
    case "nw_abort":
      aborted = true;
      audit({ event: "abort" });
      return;
    case "nw_respond":
      if (humanResolver) { humanResolver(); humanResolver = null; }
      return;
    case "nw_execute":
      runEnvelope(msg.envelope).catch((e) => send({ type: "nw_done", ok: false, detail: String((e && e.message) || e) }));
      return;
  }
}

function verifyEnvelope(envelope) {
  if (!envelope || envelope.algo !== "ed25519" || !envelope.planJson || !envelope.signature) return null;
  let ok = false;
  try { ok = verify(null, Buffer.from(envelope.planJson, "utf8"), PUBLIC_KEY, Buffer.from(envelope.signature, "base64")); } catch (_) { ok = false; }
  if (!ok) return null;
  let plan = null;
  try { plan = JSON.parse(envelope.planJson); } catch (_) { return null; }
  if (!plan || typeof plan !== "object" || !Array.isArray(plan.tasks)) return null;
  if (typeof plan.expiresAt !== "number" || Date.now() > plan.expiresAt) return null;
  return plan;
}

function runCmd(argv, timeoutMs) {
  return new Promise((resolve) => {
    const bin = Array.isArray(argv) ? argv[0] : undefined;
    if (!bin || !ALLOWED_BINS.has(bin)) { resolve({ ok: false, code: -1, out: "", err: `Command not allowed: ${bin}` }); return; }
    execFile(bin, argv.slice(1), { timeout: timeoutMs || 60000, windowsHide: true, shell: false, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({
        ok: !err,
        code: err && typeof err.code === "number" ? err.code : err ? 1 : 0,
        out: String(stdout || ""),
        err: String(stderr || (err && err.message) || ""),
      });
    });
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function httpHealth(url, expectStatusMax) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    return r.status < (expectStatusMax || 400);
  } catch (_) { return false; }
}

async function runVerify(probe) {
  if (!probe) return true;
  if (probe.kind === "http-health") {
    for (let i = 0; i < 45 && !aborted; i++) { // ~90s for a slow image pull / boot
      if (await httpHealth(probe.url, probe.expectStatusMax)) return true;
      await sleep(2000);
    }
    return false;
  }
  if (probe.kind === "shell-exit" || probe.kind === "docker-running") {
    const r = await runCmd(probe.command || [], 15000);
    return r.ok;
  }
  return true;
}

async function linkQr(task) {
  try {
    const r = await fetch(task.qrUrl, { signal: AbortSignal.timeout(15000) });
    if (r.ok) {
      const ct = (r.headers.get("content-type") || "image/png").split(";")[0];
      const buf = Buffer.from(await r.arrayBuffer());
      send({ type: "nw_qr", n: task.n, qrDataUrl: `data:${ct};base64,${buf.toString("base64")}` });
    }
  } catch (_) {}
  const deadline = Date.now() + (task.timeoutMs || 300000);
  while (Date.now() < deadline && !aborted) {
    try {
      const r = await fetch(task.linkedUrl, { signal: AbortSignal.timeout(8000) });
      if (r.ok) {
        const data = await r.json();
        const list = Array.isArray(data) ? data : Array.isArray(data && data.accounts) ? data.accounts : [];
        if (list.length) return { ok: true, number: String(list[list.length - 1]) };
      }
    } catch (_) {}
    await sleep(3000);
  }
  return { ok: false };
}

function waitForHuman() { return new Promise((res) => { humanResolver = res; }); }

async function runEnvelope(envelope) {
  const plan = verifyEnvelope(envelope);
  if (!plan) {
    audit({ event: "reject", reason: "bad-signature-or-expired" });
    send({ type: "nw_done", ok: false, detail: "Plan signature invalid or expired. Refusing to run." });
    return;
  }
  aborted = false;
  audit({ event: "plan-start", planId: plan.id, app: plan.appName, cmds: plan.tasks.map((t) => t.command || t.kind) });
  send({ type: "nw_started", planId: plan.id, taskCount: plan.tasks.length });

  const steps = [];
  let connectorReachable = false;

  for (const task of plan.tasks) {
    if (aborted) { send({ type: "nw_done", ok: false, aborted: true, detail: "Aborted." }); return; }

    if (task.kind === "shell" || task.kind === "docker-run") {
      send({ type: "nw_step", n: task.n, status: "running", title: task.title });
      const res = await runCmd(task.command || [], task.timeoutMs);
      audit({ event: "cmd", n: task.n, argv: task.command, code: res.code });
      const line = (res.out || res.err || "").slice(0, 4000);
      if (line) send({ type: "nw_output", n: task.n, line });
      const verified = task.verify ? await runVerify(task.verify) : true;
      const ok = task.kind === "docker-run" ? verified : res.ok && verified;
      if (verified && task.verify && task.verify.kind === "http-health") connectorReachable = true;
      steps.push({ n: task.n, ok, verified, detail: ok ? "done" : (res.err || "failed").slice(0, 200) });
      if (!ok && task.criticalPath) {
        if (task.rollback) await runCmd(task.rollback.command, 30000);
        send({ type: "nw_step", n: task.n, status: "error", detail: (res.err || "verification failed").slice(0, 300) });
        send({ type: "nw_done", ok: false, detail: `Step ${task.n} (${task.title}) failed.` });
        audit({ event: "plan-fail", n: task.n });
        return;
      }
      send({ type: "nw_step", n: task.n, status: ok ? "done" : "warn" });
    } else if (task.kind === "verify") {
      send({ type: "nw_step", n: task.n, status: "running", title: task.title });
      const verified = await runVerify(task.verify);
      if (verified) connectorReachable = true;
      steps.push({ n: task.n, ok: verified, verified, detail: verified ? "live" : "not reachable" });
      send({ type: "nw_step", n: task.n, status: verified ? "done" : "error" });
      if (!verified && task.criticalPath) { send({ type: "nw_done", ok: false, detail: "Connector did not come up." }); return; }
    } else if (task.kind === "link-qr") {
      send({ type: "nw_step", n: task.n, status: "waiting", title: task.title, humanPrompt: task.humanPrompt });
      const linked = await linkQr(task);
      steps.push({ n: task.n, ok: linked.ok, detail: linked.ok ? `${linked.number} linked` : "link timed out" });
      send({ type: "nw_step", n: task.n, status: linked.ok ? "done" : "error", detail: linked.ok ? `${linked.number} linked` : undefined });
      if (!linked.ok && task.criticalPath) { send({ type: "nw_done", ok: false, detail: "Device link timed out." }); return; }
    } else if (task.kind === "manual") {
      send({ type: "nw_step", n: task.n, status: "waiting", title: task.title, humanPrompt: task.humanPrompt });
      await waitForHuman();
      steps.push({ n: task.n, ok: true });
      send({ type: "nw_step", n: task.n, status: "done" });
    }
  }

  const result = {
    planId: plan.id,
    ok: true,
    connectorReachable,
    steps,
    detail: connectorReachable ? "Connector running and verified locally" : "Completed",
  };

  let callbackOk = false;
  try {
    const r = await fetch(plan.callbackUrl, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${plan.callbackToken}` },
      body: JSON.stringify({ result }),
      signal: AbortSignal.timeout(15000),
    });
    callbackOk = r.ok;
  } catch (_) {}
  audit({ event: "plan-done", planId: plan.id, connectorReachable, callbackOk });
  send({ type: "nw_done", ok: true, connectorReachable, callbackOk });
}

audit({ event: "agent-start", version: VERSION });
