# NodeWorm - security + architecture decisions

Append-only log of decisions that a reader can't derive from the code alone. Newest first.

## 2026-07-11 - Phase 3 security items (from NODEWORM_HANDOVER "needs-decision")

### Docker argv is no longer an unconstrained RCE primitive - CLOSED
The NodeWorm Agent runs only Ed25519-signed plans, but a `docker` task with
unconstrained argv would let a tampered or buggy cloud smuggle
`docker run --privileged -v /:/host <anything>` and own the host. Added an
independent agent-side allowlist (`lib/engine/execute/docker-run.ts`,
`validateDockerArgv`, mirrored inline in `public/agent/nodeworm-agent.js`): a docker
task may only run read-only introspection (`ps/inspect/logs/version/info/port/top`)
or `docker run` with an image pinned by `@sha256:` digest and none of the
sandbox-breaching flags (`--privileged`, `-v/--volume/--mount`, `--device`,
`--cap-add`, `--pid/--ipc/--uts/--userns` host namespaces, `--network host`,
`--security-opt`, `--entrypoint`, ...). Defense in depth on top of the plan
signature. TDD (7 tests).

### WS agent access control - BOUNDARY DOCUMENTED + DNS-rebinding closed
The agent's WebSocket (127.0.0.1:39742) was gated only by an Origin allowlist, which
a non-browser local client can spoof. Decision: the real security boundary is the
**Ed25519 plan signature**, not the socket gate. The only privileged WS action is
`nw_execute`, which verifies a cloud-signed plan the attacker cannot forge; the other
messages (`nw_ping/nw_abort/nw_respond`) are no-ops scoped to the caller's own
session, so a spoofed session gains nothing.

A shared-secret WS token was considered and rejected: it cannot defend against the
stated threat (a same-user local process), because such a process can read any token
the agent stores or serves, exactly as it could read the user's own files. Secrets
don't create a boundary between a user and a process running as that user.

What a token WOULD help against is the browser-based cross-origin threat, and that is
already covered by the Origin allowlist + CORS. To also close DNS-rebinding (a page on
an attacker domain re-resolved to 127.0.0.1), added Host-header pinning to loopback on
both the CORS preflight and the WS upgrade (`hostAllowed`). Residual accepted: a
malicious same-user local process can open a WS session but cannot execute anything
without a forged signature.

### Signal (hosted) bridge is one shared account - ACCEPTED for now + disclosed in-product
Per-user bridge containers need a Fly.io payment method that isn't provisioned yet, so
the hosted Signal/WhatsApp bridge runs as a single shared NodeWorm-hosted instance. The
linked number is held encrypted, but shares infrastructure across users. Decision:
ship the shared bridge, disclose it honestly at the point of consent (the
HostedConnectorCard now shows a shared-instance heads-up and points technical users to
self-hosting their own bridge). Revisit per-user provisioning when billing is in place.

## 2026-07-11 - cloudflared macOS support - CLOSED
macOS `cloudflared` ships as a `.tgz`, not a raw executable, so it was previously
absent from the pin table (callers got null rather than a fabricated pin). Added
`darwin/x64` + `darwin/arm64` targets whose SHA-256 pins the whole archive (computed
from the real release assets, never fabricated), with an `archive: "tgz"` +
`innerPath` field. The agent verifies the archive hash, then extracts the single
`cloudflared` member in pure Node (`extractTgzMember`, no spawning system `tar`, which
would violate the "spawn only bundled binaries" invariant) and re-extracts from the
pin-verified archive before every spawn. Extraction verified against both real
artifacts (valid Mach-O output).
