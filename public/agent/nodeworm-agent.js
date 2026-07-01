#!/usr/bin/env node
"use strict";
// NodeWorm Agent v2 - local WebSocket server on port 39742.
// Chrome connects directly: no extension required for basic connectivity.
// Private Network Access (PNA) preflight handled via OPTIONS HTTP.

const { createPublicKey, verify, createHash } = require("crypto");
const { execFile } = require("child_process");
const { appendFileSync, mkdirSync } = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const VERSION = "2.1.0";
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
        runCmd(["docker", "--version"], 8000).then((r) =>
          send({ type: "nw_pong", version: VERSION, publicKeyId: PUBLIC_KEY_ID, dockerOk: r.ok })
        );
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
        body: JSON.stringify({ result: { planId: plan.id, ok: true, connectorReachable, steps } }),
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
