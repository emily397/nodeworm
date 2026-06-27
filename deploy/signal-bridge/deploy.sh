#!/usr/bin/env bash
# One-shot deploy for the NodeWorm hosted Signal bridge.
#
# Prereq (run ONCE, by you): flyctl auth login
# Then just:                 ./deploy.sh
#
# This script is idempotent: re-running it redeploys without clobbering the
# existing app, volume, or token.
set -euo pipefail

APP="nodeworm-signal-bridge"
REGION="syd"
VOLUME="signal_data"
VOLUME_SIZE_GB=1
VERCEL_PROJECT_DIR_HINT="your NodeWorm repo (the one linked to abie-three.vercel.app)"

# Run from this script's own directory so flyctl finds fly.toml / Dockerfile.
cd "$(dirname "$0")"

echo "==> Checking Fly auth..."
if ! flyctl auth whoami >/dev/null 2>&1; then
  echo "ERROR: not logged in to Fly. Run 'flyctl auth login' first, then re-run ./deploy.sh" >&2
  exit 1
fi
echo "    Logged in as: $(flyctl auth whoami)"

echo "==> Ensuring app '$APP' exists..."
if flyctl apps list 2>/dev/null | awk '{print $1}' | grep -qx "$APP"; then
  echo "    App already exists."
else
  echo "    Creating app..."
  flyctl apps create "$APP"
fi

echo "==> Ensuring volume '$VOLUME' exists in region '$REGION'..."
if flyctl volumes list -a "$APP" 2>/dev/null | awk '{print $2}' | grep -qx "$VOLUME"; then
  echo "    Volume already exists."
else
  echo "    Creating ${VOLUME_SIZE_GB}GB volume..."
  flyctl volumes create "$VOLUME" --app "$APP" --region "$REGION" --size "$VOLUME_SIZE_GB" --yes
fi

echo "==> Ensuring BRIDGE_TOKEN secret is set..."
if flyctl secrets list -a "$APP" 2>/dev/null | awk '{print $1}' | grep -qx "BRIDGE_TOKEN"; then
  echo "    BRIDGE_TOKEN already set. Reusing it (so the already-wired Vercel value keeps working)."
  echo "    To rotate it, run:  flyctl secrets unset BRIDGE_TOKEN -a $APP   then re-run this script."
  TOKEN=""   # unknown: Fly never reveals secret values back to us.
else
  echo "    Generating a strong random token..."
  if command -v openssl >/dev/null 2>&1; then
    TOKEN="$(openssl rand -hex 32)"
  else
    TOKEN="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  fi
  # Pipe the value via 'secrets import' (the documented stdin path) so the token
  # never lands on the command line / shell history. --stage sets it without an
  # immediate restart; the deploy below applies it, avoiding a brand-new-app race.
  printf 'BRIDGE_TOKEN=%s\n' "$TOKEN" | flyctl secrets import --app "$APP" --stage
  echo "    BRIDGE_TOKEN staged."
fi

echo "==> Deploying (builds the Dockerfile: signal-cli-rest-api + Caddy)..."
flyctl deploy --app "$APP" --ha=false

# Resolve the public hostname Fly assigned.
HOST="$(flyctl status -a "$APP" --json 2>/dev/null | sed -n 's/.*"Hostname":[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
if [ -z "${HOST:-}" ]; then
  HOST="${APP}.fly.dev"
fi
URL="https://${HOST}"

echo ""
echo "============================================================"
echo " Signal bridge deployed."
echo "============================================================"
echo " SIGNAL_BRIDGE_URL   = ${URL}"
if [ -n "${TOKEN:-}" ]; then
  echo " SIGNAL_BRIDGE_TOKEN = ${TOKEN}"
else
  echo " SIGNAL_BRIDGE_TOKEN = (unchanged: reused existing Fly secret; already in Vercel)"
fi
echo "============================================================"
echo ""

# Quick smoke test: /v1/health must be reachable WITHOUT a token (it is exempt),
# and /v1/accounts must 401 WITHOUT a token (proves the gate is live).
echo "==> Smoke test..."
if curl -fsS --max-time 20 "${URL}/v1/health" >/dev/null 2>&1; then
  echo "    /v1/health OK (Caddy + API both up)."
else
  echo "    NOTE: /v1/health not green yet; the machine may still be booting. Retry in ~30s."
fi
GATE_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "${URL}/v1/accounts" || echo "000")"
if [ "$GATE_CODE" = "401" ]; then
  echo "    Token gate OK (/v1/accounts returns 401 without a token)."
else
  echo "    NOTE: /v1/accounts returned HTTP ${GATE_CODE} without a token (expected 401 once booted)."
fi

echo ""
echo "============================================================"
echo " Wire these into NodeWorm on Vercel (Vercel CLI already authed)."
echo " Run from inside ${VERCEL_PROJECT_DIR_HINT}:"
echo "============================================================"
if [ -n "${TOKEN:-}" ]; then
  cat <<EOF

# SIGNAL_BRIDGE_URL (production, preview, development) -- BOM-free via printf:
printf '%s' "${URL}" | vercel env add SIGNAL_BRIDGE_URL production
printf '%s' "${URL}" | vercel env add SIGNAL_BRIDGE_URL preview
printf '%s' "${URL}" | vercel env add SIGNAL_BRIDGE_URL development

# SIGNAL_BRIDGE_TOKEN (production, preview, development) -- BOM-free via printf:
printf '%s' "${TOKEN}" | vercel env add SIGNAL_BRIDGE_TOKEN production
printf '%s' "${TOKEN}" | vercel env add SIGNAL_BRIDGE_TOKEN preview
printf '%s' "${TOKEN}" | vercel env add SIGNAL_BRIDGE_TOKEN development

# Then redeploy NodeWorm so the new env is picked up:
vercel deploy --prod --yes
EOF
else
  cat <<EOF

# BRIDGE_TOKEN was reused (not regenerated), so SIGNAL_BRIDGE_TOKEN in Vercel is
# already correct. Only (re)set the URL if it changed:
printf '%s' "${URL}" | vercel env add SIGNAL_BRIDGE_URL production
EOF
fi
echo ""
echo "Done."
