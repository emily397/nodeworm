# NodeWorm hosted Signal bridge

This stands up a private, token-protected Signal bridge on Fly.io that NodeWorm
(https://abie-three.vercel.app) talks to over HTTPS. Once it is running, a
NodeWorm user links their Signal by scanning one QR code in the app. No CLI, no
servers to babysit.

## What it is

One Fly Machine running two things together:

1. **signal-cli-rest-api** (`bbernhard/signal-cli-rest-api`): the actual Signal
   bridge. Listens privately on port 8081. Stores the device link under
   `/home/.local/share/signal-cli`, which is kept on a **persistent volume** so
   the link survives restarts and redeploys.
2. **Caddy**: the public HTTPS entrypoint on port 8080. It checks every request
   for `Authorization: Bearer <token>` and returns **401** if it is wrong or
   missing, then forwards valid requests to the API. signal-cli-rest-api has no
   auth of its own, so Caddy is the lock on the door. The one exception is
   `/v1/health`, which is open so Fly can health-check the machine.

NodeWorm calls exactly these, with the Bearer token on every request:

- `GET /v1/qrcodelink?device_name=NodeWorm` -> the device-link QR (PNG)
- `GET /v1/accounts` -> the list of linked numbers (a non-empty list means linked)

### Why one machine, not two

The bbernhard image's startup script must run as root (it fixes file ownership
on the config dir, then drops to a non-root user to run the API). The device
link also lives on a single volume that can only attach to one machine. Running
Caddy and the API on separate Fly machines would mean cross-machine networking
plus a real risk that one is up while the other is stopped, which breaks the
time-sensitive QR-link handshake. Co-locating them in one machine is simpler and
more reliable. A tiny `start.sh` runs the API in the background and Caddy in the
foreground.

### MODE

Deployed with `MODE=native`, which links, sends, and reads `/v1/accounts`
reliably on first deploy with no extra services. If you later want real-time
message receiving (push, not polling), change `MODE` to `json-rpc-native` in
`fly.toml` and redeploy; the image's entrypoint wires up the supervisor for that
mode automatically.

## Deploy (what Emily does)

You need the Fly CLI installed (`flyctl`). Then:

```sh
# 1. Log in to Fly ONCE (opens a browser):
flyctl auth login

# 2. From this folder, run:
./deploy.sh
```

That is it. `deploy.sh` will:

1. Confirm you are logged in (`flyctl auth whoami`).
2. Create the app `nodeworm-signal-bridge` if it does not exist.
3. Create the persistent volume `signal_data` (region `syd`) if it does not exist.
4. Generate a strong random `BRIDGE_TOKEN` and store it as a Fly secret (only on
   first run; later runs reuse it so your linked Signal keeps working).
5. Build and deploy the combined image.
6. Smoke-test that `/v1/health` is open and `/v1/accounts` is locked (401).
7. Print your `SIGNAL_BRIDGE_URL` and `SIGNAL_BRIDGE_TOKEN`, plus the exact
   commands to wire them into NodeWorm on Vercel.

The script is safe to re-run (idempotent): it redeploys without recreating the
app, volume, or token.

## Wire it into NodeWorm (Vercel)

NodeWorm reads two environment variables (see `lib/engine/hosted-connectors.ts`):

| Variable              | Where                 | Note                                                        |
|-----------------------|-----------------------|-------------------------------------------------------------|
| `SIGNAL_BRIDGE_URL`   | Vercel (NodeWorm)     | The `https://...fly.dev` URL the deploy script prints.      |
| `SIGNAL_BRIDGE_TOKEN` | Vercel (NodeWorm)     | The Bearer token the deploy script prints. Keep it secret.  |

The Vercel CLI is already authenticated. `deploy.sh` prints ready-to-paste
commands. They use `printf '%s' | vercel env add` so no UTF-8 BOM sneaks into
the value (a BOM silently breaks the token comparison). After adding them,
redeploy NodeWorm:

```sh
vercel deploy --prod --yes
```

## Files

| File         | Purpose                                                            |
|--------------|--------------------------------------------------------------------|
| `fly.toml`   | Fly app config: one machine, the volume mount, the public service. |
| `Dockerfile` | Combines `bbernhard/signal-cli-rest-api` with the Caddy binary.    |
| `Caddyfile`  | Public proxy: enforces the Bearer token, exempts `/v1/health`.     |
| `start.sh`   | Runs the API (background) and Caddy (foreground) in one machine.   |
| `deploy.sh`  | The one command that stands the whole thing up.                    |

## Rotating the token

```sh
flyctl secrets unset BRIDGE_TOKEN -a nodeworm-signal-bridge
./deploy.sh   # generates and prints a fresh token
```

Then update `SIGNAL_BRIDGE_TOKEN` in Vercel with the new value and redeploy
NodeWorm.

## Costs

One `shared-cpu-1x` / 1GB machine kept always-on (the QR-link poll needs it
warm) plus a 1GB volume. This is a small always-on footprint, not scale-to-zero,
because a sleeping bridge cannot complete the device-link handshake.
