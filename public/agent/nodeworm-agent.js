#!/usr/bin/env node
"use strict";
// NodeWorm Agent v2 - local WebSocket server on port 39742.
// Chrome connects directly: no extension required for basic connectivity.
// Private Network Access (PNA) preflight handled via OPTIONS HTTP.

const { createPublicKey, verify, createHash } = require("crypto");
const { execFile, spawn } = require("child_process");
const { appendFileSync, mkdirSync, existsSync, readFileSync, renameSync, writeFileSync } = require("fs");
const http = require("http");
const net = require("net");
const os = require("os");
const path = require("path");

const VERSION = "3.0.0";
const PORT = 39742;
const PUBLIC_KEY_ID = "nw-exec-ed25519-1";
const PUBLIC_KEY_B64 = "MCowBQYDK2VwAyEA0gSYkfXv72byhI08OkQIelEEB/5xEYj0VPzb5OtRDHQ=";
const PUBLIC_KEY = createPublicKey({ key: Buffer.from(PUBLIC_KEY_B64, "base64"), format: "der", type: "spki" });
const ALLOWED_BINS = new Set(["docker"]);
const ALLOWED_ORIGINS = new Set([
  "https://abie-three.vercel.app",
  "http://localhost:3000",
]);
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

const AGENT_DIR = path.join(os.homedir(), ".nodeworm");
const AUDIT = path.join(AGENT_DIR, "audit.log");
try { mkdirSync(AGENT_DIR, { recursive: true }); } catch (_) {}
function audit(obj) {
  try { appendFileSync(AUDIT, JSON.stringify({ t: new Date().toISOString(), ...obj }) + "\n"); } catch (_) {}
}

// ---- bundled Signal runtime (native, no Docker) ----
// The installer places signal-cli + a JRE next to the agent exe under ./bin.
// We spawn ONLY these bundled binaries; the signed plan can trigger the flow
// but never names an arbitrary executable.
const IS_WIN = process.platform === "win32";
const RUNTIME_DIR = process.env.NODEWORM_RUNTIME_DIR || path.join(path.dirname(process.execPath), "bin");
const SIGNAL_HOME = path.join(RUNTIME_DIR, "signal-cli");
const JAVA_HOME = path.join(RUNTIME_DIR, "jre");
const SIGNAL_CLI = path.join(SIGNAL_HOME, "bin", "signal-cli") + (IS_WIN ? ".bat" : "");
const SIGNAL_DATA = path.join(AGENT_DIR, "signal-data");

function signalRuntimePresent() {
  return existsSync(SIGNAL_CLI) && existsSync(JAVA_HOME);
}

function signalEnv() {
  return { ...process.env, JAVA_HOME, PATH: `${path.join(JAVA_HOME, "bin")}${path.delimiter}${process.env.PATH || ""}` };
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => { const p = srv.address().port; srv.close(() => resolve(p)); });
  });
}

let signalProc = null;
let signalPort = 0;

function startSignalDaemon() {
  return new Promise((resolve, reject) => {
    if (signalProc) { resolve(); return; }
    findFreePort().then((port) => {
      signalPort = port;
      mkdirSync(SIGNAL_DATA, { recursive: true });
      const args = ["--data-dir", IS_WIN ? `"${SIGNAL_DATA}"` : SIGNAL_DATA, "daemon", "--http", `127.0.0.1:${port}`];
      // Node refuses to spawn a .bat without shell:true; quote the path under shell.
      signalProc = spawn(IS_WIN ? `"${SIGNAL_CLI}"` : SIGNAL_CLI, args, { env: signalEnv(), shell: IS_WIN, windowsHide: true });
      signalProc.stdout && signalProc.stdout.on("data", () => {});
      signalProc.stderr && signalProc.stderr.on("data", () => {});
      signalProc.on("exit", () => { signalProc = null; });
      signalProc.on("error", (e) => { signalProc = null; reject(e); });
      resolve();
    }).catch(reject);
  });
}

function signalRpc(method, params, timeoutMs) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: "2.0", method, params: params || {}, id: Date.now() });
    const req = http.request({
      hostname: "127.0.0.1", port: signalPort, path: "/api/v1/rpc", method: "POST",
      timeout: timeoutMs || 30000,
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { const p = JSON.parse(data); if (p.error) reject(new Error(p.error.message)); else resolve(p.result); }
        catch (e) { reject(e); }
      });
    });
    req.on("timeout", () => req.destroy(new Error("signal-cli RPC timed out")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// Poll a cheap RPC until the daemon accepts requests (Java cold start is 30-90s).
async function signalDaemonReady() {
  for (let i = 0; i < 120; i++) {
    try { await signalRpc("version", {}, 5000); return true; } catch (_) { await sleep(1000); }
  }
  return false;
}

// ---- WebSocket framing (RFC 6455) ----
function wsHandshake(req, socket) {
  const key = req.headers["sec-websocket-key"];
  if (!key) { socket.destroy(); return false; }
  const accept = createHash("sha1").update(key + WS_GUID).digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\n" +
    "Connection: Upgrade\r\n" +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  return true;
}

function wsSend(socket, obj) {
  if (socket.destroyed) return;
  const payload = Buffer.from(JSON.stringify(obj), "utf8");
  let header;
  if (payload.length < 126) {
    header = Buffer.from([0x81, payload.length]);
  } else if (payload.length < 65536) {
    header = Buffer.from([0x81, 126, payload.length >> 8, payload.length & 0xff]);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81; header[1] = 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  try { socket.write(Buffer.concat([header, payload])); } catch (_) {}
}

function wsParseFrame(buf) {
  if (buf.length < 2) return null;
  const masked = (buf[1] & 0x80) !== 0;
  let len = buf[1] & 0x7f;
  let offset = 2;
  if (len === 126) {
    if (buf.length < 4) return null;
    len = buf.readUInt16BE(2); offset = 4;
  } else if (len === 127) {
    if (buf.length < 10) return null;
    len = Number(buf.readBigUInt64BE(2)); offset = 10;
  }
  const maskLen = masked ? 4 : 0;
  if (buf.length < offset + maskLen + len) return null;
  let payload = buf.slice(offset + maskLen, offset + maskLen + len);
  if (masked) {
    const mk = buf.slice(offset, offset + 4);
    payload = Buffer.from(payload.map((b, i) => b ^ mk[i % 4]));
  }
  return { opcode: buf[0] & 0x0f, payload, consumed: offset + maskLen + len };
}

// ---- npm/node build allowlist (mirror of lib/engine/execute/npm-run.ts) ----
// The cloud may ask the Agent to build a GENERATED connector bundle, but only via
// this fixed set of argv shapes. install is locked to --ignore-scripts so a
// malicious dependency's postinstall cannot execute, and any shell metacharacter
// is rejected outright. Keep in lockstep with the tested TS validator.
const NPM_META = /[;&|`$(){}<>\n\r*?~!#]/;
function validateNpmRun(command) {
  if (!Array.isArray(command) || command.length === 0) return { ok: false, reason: "empty command" };
  if (command.some((a) => typeof a !== "string")) return { ok: false, reason: "non-string argv" };
  if (command.some((a) => NPM_META.test(a))) return { ok: false, reason: "shell metacharacters" };
  const [bin, ...rest] = command;
  if (bin === "node") return rest.length === 1 && rest[0] === "dist/index.js" ? { ok: true } : { ok: false, reason: "node entrypoint only" };
  if (bin === "npm") {
    const sub = rest[0];
    if (sub === "install" || sub === "ci") return rest.length === 2 && rest[1] === "--ignore-scripts" ? { ok: true } : { ok: false, reason: "install needs exactly --ignore-scripts" };
    if (sub === "run") return rest.length === 2 && rest[1] === "build" ? { ok: true } : { ok: false, reason: "only npm run build" };
    if (sub === "start") return rest.length === 1 ? { ok: true } : { ok: false, reason: "npm start takes no args" };
    return { ok: false, reason: `npm ${sub} not allowed` };
  }
  return { ok: false, reason: `binary not allowed: ${bin}` };
}

// Run a validated npm/node command inside the bundle's working directory. npm is a
// .cmd on Windows, so it must go through the shell there; the argv is validated
// (no metacharacters, fixed shapes) before this point, so shell use is safe.
function runNpm(argv, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const v = validateNpmRun(argv);
    if (!v.ok) { resolve({ ok: false, code: -1, out: "", err: `Command not allowed: ${v.reason}` }); return; }
    const bin = argv[0] === "npm" && IS_WIN ? "npm.cmd" : argv[0];
    execFile(bin, argv.slice(1), { cwd: cwd || undefined, timeout: timeoutMs || 300000, windowsHide: true, shell: IS_WIN && argv[0] === "npm", maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, code: err && typeof err.code === "number" ? err.code : err ? 1 : 0, out: String(stdout || ""), err: String(stderr || (err && err.message) || "") });
    });
  });
}

// ---- execution logic ----
function runCmd(argv, timeoutMs) {
  return new Promise((resolve) => {
    const bin = Array.isArray(argv) ? argv[0] : undefined;
    if (!bin || !ALLOWED_BINS.has(bin)) {
      resolve({ ok: false, code: -1, out: "", err: `Command not allowed: ${bin}` });
      return;
    }
    execFile(bin, argv.slice(1), { timeout: timeoutMs || 60000, windowsHide: true, shell: false, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, code: err && typeof err.code === "number" ? err.code : err ? 1 : 0, out: String(stdout || ""), err: String(stderr || (err && err.message) || "") });
    });
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function httpHealth(url, expectStatusMax) {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(8000) }); return r.status < (expectStatusMax || 400); } catch (_) { return false; }
}

async function runVerify(probe) {
  if (!probe) return true;
  if (probe.kind === "http-health") {
    for (let i = 0; i < 45; i++) { if (await httpHealth(probe.url, probe.expectStatusMax)) return true; await sleep(2000); }
    return false;
  }
  if (probe.kind === "shell-exit" || probe.kind === "docker-running") {
    const r = await runCmd(probe.command || [], 15000);
    return r.ok;
  }
  return true;
}

async function linkQr(task, send) {
  try {
    const r = await fetch(task.qrUrl, { signal: AbortSignal.timeout(15000) });
    if (r.ok) {
      const ct = (r.headers.get("content-type") || "image/png").split(";")[0];
      const buf = Buffer.from(await r.arrayBuffer());
      send({ type: "nw_qr", n: task.n, qrDataUrl: `data:${ct};base64,${buf.toString("base64")}` });
    }
  } catch (_) {}
  const deadline = Date.now() + (task.timeoutMs || 300000);
  while (Date.now() < deadline) {
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

// ---- cloudflared quick tunnel (zero-account) ----
// Makes a LOCAL connector cloud-reachable without port-forwarding: a pinned,
// hash-verified cloudflared binary opens an ephemeral trycloudflare.com tunnel to
// 127.0.0.1:<port>. The hash is checked before EVERY spawn (not just at download),
// so a swapped binary never runs. Quick tunnels get a fresh URL each start; the
// cloud re-verifies reachability itself before claiming anything is connected.
// Mirror of lib/engine/execute/cloudflared.ts (the tested source of truth). Bump
// together with that module. Only raw executables are pinned (win exe, linux
// binaries); macOS ships a .tgz and is intentionally absent until extraction is
// handled, so unsupported platforms get an honest "not supported" instead of a run.
const CLOUDFLARED_VERSION = "2026.6.1";
const CLOUDFLARED_BASE = `https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}`;
const CLOUDFLARED_TARGETS = {
  "win32/x64": { file: "cloudflared-windows-amd64.exe", sha256: "5253e66f1f493c4e13539749f1aa86fd0c61e3072900fec29a44ba046a6d97e2", filename: "cloudflared.exe" },
  "linux/x64": { file: "cloudflared-linux-amd64", sha256: "5861a10a438fe8ddcfebb3b830f83966cbf193edafce0fe2eeb198fbae1f7a22", filename: "cloudflared" },
  "linux/arm64": { file: "cloudflared-linux-arm64", sha256: "59816ce9b16db71f5bc2a86d59b3632a96c8c3ee934bde2bc8641ee83a6070eb", filename: "cloudflared" },
};
function cloudflaredTarget() {
  const t = CLOUDFLARED_TARGETS[`${process.platform}/${process.arch}`];
  if (!t) return null;
  return { url: `${CLOUDFLARED_BASE}/${t.file}`, sha256: t.sha256, bin: path.join(AGENT_DIR, "bin", t.filename) };
}
let tunnelProc = null;
let tunnelUrl = null;

function sha256File(p) {
  try { return createHash("sha256").update(readFileSync(p)).digest("hex"); } catch (_) { return ""; }
}

async function ensureCloudflared() {
  const t = cloudflaredTarget();
  if (!t) return { ok: false, detail: `Tunnel auto-setup is not supported on ${process.platform}/${process.arch} yet.` };
  if (sha256File(t.bin) === t.sha256) return { ok: true };
  try {
    mkdirSync(path.dirname(t.bin), { recursive: true });
    const r = await fetch(t.url, { signal: AbortSignal.timeout(180000), redirect: "follow" });
    if (!r.ok) return { ok: false, detail: `cloudflared download failed (HTTP ${r.status}).` };
    const buf = Buffer.from(await r.arrayBuffer());
    const got = createHash("sha256").update(buf).digest("hex");
    if (got !== t.sha256) {
      audit({ event: "tunnel-hash-mismatch", got, platform: `${process.platform}/${process.arch}` });
      return { ok: false, detail: "cloudflared hash mismatch; refusing to run it." };
    }
    const tmp = t.bin + ".tmp";
    writeFileSync(tmp, buf);
    if (!IS_WIN) { try { require("fs").chmodSync(tmp, 0o755); } catch (_) {} }
    renameSync(tmp, t.bin);
    return { ok: true };
  } catch (e) {
    return { ok: false, detail: String((e && e.message) || e) };
  }
}

function startTunnel(port, timeoutMs) {
  return new Promise((resolve) => {
    if (tunnelProc && tunnelUrl) { resolve({ ok: true, url: tunnelUrl }); return; }
    const t = cloudflaredTarget();
    // Re-verify the binary hash at spawn time, every time.
    if (!t || sha256File(t.bin) !== t.sha256) {
      resolve({ ok: false, detail: "cloudflared binary failed its hash check." });
      return;
    }
    const proc = spawn(t.bin, ["tunnel", "--url", `http://127.0.0.1:${port}`, "--no-autoupdate"], { windowsHide: true, shell: false });
    let out = "";
    let done = false;
    const finish = (res) => { if (!done) { done = true; resolve(res); } };
    const scan = (c) => {
      out += c.toString();
      const m = out.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m) { tunnelProc = proc; tunnelUrl = m[0]; audit({ event: "tunnel-up", url: m[0], port }); finish({ ok: true, url: m[0] }); }
    };
    proc.stdout && proc.stdout.on("data", scan);
    proc.stderr && proc.stderr.on("data", scan);
    proc.on("exit", () => { tunnelProc = null; tunnelUrl = null; finish({ ok: false, detail: "cloudflared exited before the tunnel came up." }); });
    proc.on("error", (e) => finish({ ok: false, detail: String((e && e.message) || e) }));
    setTimeout(() => finish({ ok: false, detail: "Tunnel did not come up in time." }), timeoutMs || 45000);
  });
}

// Signed plans already executed, keyed by plan.id -> expiresAt. A plan is single-
// use: without this a valid envelope captured off the wire is replayable for its
// whole 1h TTL. Evicted lazily once expired.
const seenPlans = new Map();

function verifyEnvelope(envelope) {
  if (!envelope || envelope.algo !== "ed25519" || !envelope.planJson || !envelope.signature) return null;
  let ok = false;
  try { ok = verify(null, Buffer.from(envelope.planJson, "utf8"), PUBLIC_KEY, Buffer.from(envelope.signature, "base64")); } catch (_) { ok = false; }
  if (!ok) return null;
  let plan = null;
  try { plan = JSON.parse(envelope.planJson); } catch (_) { return null; }
  if (!plan || typeof plan !== "object" || !Array.isArray(plan.tasks)) return null;
  if (typeof plan.expiresAt !== "number" || Date.now() > plan.expiresAt) return null;
  const now = Date.now();
  for (const [id, exp] of seenPlans) if (now > exp) seenPlans.delete(id);
  if (!plan.id || seenPlans.has(plan.id)) return null;
  seenPlans.set(plan.id, plan.expiresAt);
  return plan;
}

// ---- per-connection session ----
function createSession(socket) {
  let aborted = false;
  let humanResolver = null;
  let inbuf = Buffer.alloc(0);

  function send(obj) { wsSend(socket, obj); }

  function handle(msg) {
    if (!msg || typeof msg !== "object") return;
    switch (msg.type) {
      case "nw_ping":
        send({ type: "nw_pong", version: VERSION, publicKeyId: PUBLIC_KEY_ID, runtimeOk: signalRuntimePresent() });
        break;
      case "nw_abort":
        aborted = true;
        audit({ event: "abort" });
        break;
      case "nw_respond":
        if (humanResolver) { humanResolver(); humanResolver = null; }
        break;
      case "nw_execute":
        runEnvelope(msg.envelope).catch((e) => send({ type: "nw_done", ok: false, detail: String((e && e.message) || e) }));
        break;
    }
  }

  async function runEnvelope(envelope) {
    const plan = verifyEnvelope(envelope);
    if (!plan) {
      audit({ event: "reject", reason: "bad-signature-or-expired" });
      send({ type: "nw_done", ok: false, detail: "Plan signature invalid or expired." });
      return;
    }
    aborted = false;
    audit({ event: "plan-start", planId: plan.id, app: plan.appName });
    send({ type: "nw_started", planId: plan.id, taskCount: plan.tasks.length });

    const steps = [];
    let connectorReachable = false;
    let resultTunnelUrl = null;

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
        const linked = await linkQr(task, send);
        steps.push({ n: task.n, ok: linked.ok, detail: linked.ok ? `${linked.number} linked` : "link timed out" });
        send({ type: "nw_step", n: task.n, status: linked.ok ? "done" : "error" });
        if (!linked.ok && task.criticalPath) { send({ type: "nw_done", ok: false, detail: "Device link timed out." }); return; }
      } else if (task.kind === "signal-start") {
        send({ type: "nw_step", n: task.n, status: "running", title: task.title });
        if (!signalRuntimePresent()) {
          send({ type: "nw_step", n: task.n, status: "error", detail: "Signal runtime not installed. Re-run the installer." });
          send({ type: "nw_done", ok: false, detail: "Signal runtime missing." });
          return;
        }
        try { await startSignalDaemon(); } catch (e) {
          send({ type: "nw_step", n: task.n, status: "error", detail: String((e && e.message) || e) });
          send({ type: "nw_done", ok: false, detail: "Could not start the Signal connector." });
          return;
        }
        const ready = await signalDaemonReady();
        steps.push({ n: task.n, ok: ready, detail: ready ? "connector up" : "connector did not start" });
        send({ type: "nw_step", n: task.n, status: ready ? "done" : "error" });
        if (!ready) { send({ type: "nw_done", ok: false, detail: "Signal connector did not start in time." }); return; }
      } else if (task.kind === "signal-link") {
        send({ type: "nw_step", n: task.n, status: "waiting", title: task.title, humanPrompt: task.humanPrompt });
        let uri = null;
        try { const r = await signalRpc("startLink", {}, 15000); uri = r && r.deviceLinkUri; } catch (_) {}
        if (!uri) {
          send({ type: "nw_step", n: task.n, status: "error", detail: "Could not get a link code." });
          send({ type: "nw_done", ok: false, detail: "Signal link failed to start." });
          return;
        }
        send({ type: "nw_qr", n: task.n, linkUri: uri });
        let linked = null;
        try { linked = await signalRpc("finishLink", { deviceLinkUri: uri, deviceName: "NodeWorm" }, task.timeoutMs || 300000); }
        catch (_) { linked = null; }
        const number = linked && (linked.number || linked.account);
        steps.push({ n: task.n, ok: Boolean(number), detail: number ? `${number} linked` : "link timed out" });
        send({ type: "nw_step", n: task.n, status: number ? "done" : "error" });
        if (!number && task.criticalPath) { send({ type: "nw_done", ok: false, detail: "Device link timed out." }); return; }
      } else if (task.kind === "signal-verify") {
        send({ type: "nw_step", n: task.n, status: "running", title: task.title });
        let ok = false;
        try { const accts = await signalRpc("listAccounts", {}, 10000); ok = Array.isArray(accts) ? accts.length > 0 : Boolean(accts); } catch (_) {}
        if (ok) connectorReachable = true;
        steps.push({ n: task.n, ok, detail: ok ? "live" : "not reachable" });
        send({ type: "nw_step", n: task.n, status: ok ? "done" : "error" });
        if (!ok && task.criticalPath) { send({ type: "nw_done", ok: false, detail: "Connector not reachable." }); return; }
      } else if (task.kind === "npm-run") {
        send({ type: "nw_step", n: task.n, status: "running", title: task.title });
        const v = validateNpmRun(task.command);
        if (!v.ok) {
          steps.push({ n: task.n, ok: false, detail: v.reason });
          send({ type: "nw_step", n: task.n, status: "error", detail: `Blocked: ${v.reason}` });
          send({ type: "nw_done", ok: false, detail: `Command blocked: ${v.reason}` });
          return;
        }
        const res = await runNpm(task.command, task.cwd, task.timeoutMs);
        const line = (res.out || res.err || "").slice(0, 4000);
        if (line) send({ type: "nw_output", n: task.n, line });
        steps.push({ n: task.n, ok: res.ok, detail: res.ok ? "built" : (res.err || "failed").slice(0, 200) });
        send({ type: "nw_step", n: task.n, status: res.ok ? "done" : "error" });
        if (!res.ok && task.criticalPath) {
          if (task.rollback) await runCmd(task.rollback.command, 30000);
          send({ type: "nw_done", ok: false, detail: `Step ${task.n} (${task.title}) failed.` });
          return;
        }
      } else if (task.kind === "tunnel-start") {
        send({ type: "nw_step", n: task.n, status: "running", title: task.title });
        const port = task.tunnelPort;
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
          send({ type: "nw_step", n: task.n, status: "error", detail: "Invalid tunnel port." });
          send({ type: "nw_done", ok: false, detail: "Invalid tunnel port." });
          return;
        }
        const ready = await ensureCloudflared();
        if (!ready.ok) {
          steps.push({ n: task.n, ok: false, detail: ready.detail });
          send({ type: "nw_step", n: task.n, status: "error", detail: ready.detail });
          send({ type: "nw_done", ok: false, detail: ready.detail });
          return;
        }
        const tun = await startTunnel(port, task.timeoutMs);
        let proxied = false;
        if (tun.ok) {
          // One REAL request through the public URL (out to the edge and back in)
          // before the tunnel is reported up. Retried: edge routes take a few
          // seconds to propagate after the URL is printed.
          const probeUrl = tun.url + ((task.verify && task.verify.url) || "/health");
          for (let i = 0; i < 15 && !proxied; i++) { proxied = await httpHealth(probeUrl, task.verify && task.verify.expectStatusMax); if (!proxied) await sleep(2000); }
        }
        const ok = tun.ok && proxied;
        if (ok) { connectorReachable = true; resultTunnelUrl = tun.url; }
        steps.push({ n: task.n, ok, verified: proxied, detail: ok ? `tunnel up: ${tun.url}` : (tun.detail || "tunnel probe failed") });
        send({ type: "nw_step", n: task.n, status: ok ? "done" : "error", detail: ok ? tun.url : tun.detail });
        if (!ok && task.criticalPath) { send({ type: "nw_done", ok: false, detail: tun.detail || "Tunnel did not verify." }); return; }
      } else if (task.kind === "manual") {
        send({ type: "nw_step", n: task.n, status: "waiting", title: task.title, humanPrompt: task.humanPrompt });
        await new Promise((res) => { humanResolver = res; });
        steps.push({ n: task.n, ok: true });
        send({ type: "nw_step", n: task.n, status: "done" });
      }
    }

    let callbackOk = false;
    try {
      const r = await fetch(plan.callbackUrl, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${plan.callbackToken}` },
        body: JSON.stringify({ result: { planId: plan.id, ok: true, connectorReachable, steps, tunnelUrl: resultTunnelUrl || undefined } }),
        signal: AbortSignal.timeout(15000),
      });
      callbackOk = r.ok;
    } catch (_) {}
    audit({ event: "plan-done", planId: plan.id, connectorReachable, callbackOk });
    send({ type: "nw_done", ok: true, connectorReachable, callbackOk });
  }

  socket.on("data", (chunk) => {
    inbuf = Buffer.concat([inbuf, chunk]);
    let frame;
    while ((frame = wsParseFrame(inbuf))) {
      inbuf = inbuf.slice(frame.consumed);
      if (frame.opcode === 0x8) { socket.destroy(); return; }
      if (frame.opcode === 0x9) {
        try { socket.write(Buffer.from([0x8a, 0])); } catch (_) {}
        continue;
      }
      if (frame.opcode === 0x1 || frame.opcode === 0x2) {
        let msg = null;
        try { msg = JSON.parse(frame.payload.toString("utf8")); } catch (_) {}
        if (msg) handle(msg);
      }
    }
  });

  socket.on("error", () => {});
  socket.on("close", () => { aborted = true; });
}

// ---- HTTP server: PNA preflight + WebSocket upgrade ----
const server = http.createServer((req, res) => {
  const origin = req.headers["origin"] || "";
  if (req.method === "OPTIONS") {
    res.writeHead(200, {
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "null",
      "Access-Control-Allow-Private-Network": "true",
      "Access-Control-Allow-Methods": "GET",
      "Access-Control-Max-Age": "86400",
    });
    res.end();
    return;
  }
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end(`NodeWorm Agent ${VERSION}`);
});

server.on("upgrade", (req, socket) => {
  const origin = req.headers["origin"] || "";
  if (!ALLOWED_ORIGINS.has(origin)) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }
  if (!wsHandshake(req, socket)) return;
  createSession(socket);
});

server.listen(PORT, "127.0.0.1", () => {
  audit({ event: "agent-start", version: VERSION, port: PORT });
});

server.on("error", (err) => {
  audit({ event: "server-error", err: err.message });
  process.exit(1);
});
