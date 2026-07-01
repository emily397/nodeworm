#!/usr/bin/env bash
# Generic NodeWorm hosted-bridge provisioner.
# Stands up a Hugging Face Docker Space that runs ANY connector image behind a
# Caddy bearer-token gate, for any "scan-one-QR" app (Signal, WhatsApp, ...).
# This is the runner the autonomous provision workflow calls.
#
# Required env:
#   HF_TOKEN      HF write token (huggingface.co/settings/tokens)
#   BRIDGE_TOKEN  long random string; must match <APP>_BRIDGE_TOKEN in NodeWorm
#   APP           app slug, e.g. signal | whatsapp
#   IMAGE         connector image, e.g. bbernhard/signal-cli-rest-api:latest
# Optional env:
#   UPSTREAM_PORT   connector's internal port (default 8080)
#   UPSTREAM_START  command to launch the connector in the background (default /entrypoint.sh)
#   HF_USER         HF namespace (default emward)
#   SPACE_NAME      space repo name (default nodeworm-<APP>-bridge)
set -euo pipefail

: "${HF_TOKEN:?set HF_TOKEN (HF write token)}"
: "${BRIDGE_TOKEN:?set BRIDGE_TOKEN (must match <APP>_BRIDGE_TOKEN in NodeWorm)}"
: "${APP:?set APP (e.g. signal)}"
: "${IMAGE:?set IMAGE (connector docker image)}"
UPSTREAM_PORT="${UPSTREAM_PORT:-8080}"
UPSTREAM_START="${UPSTREAM_START:-/entrypoint.sh}"
HF_USER="${HF_USER:-emward}"
SPACE_NAME="${SPACE_NAME:-nodeworm-${APP}-bridge}"
REPO="${HF_USER}/${SPACE_NAME}"
API="https://huggingface.co/api"

WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

cat > README.md <<EOF
---
title: NodeWorm ${APP} bridge
emoji: 🪱
colorFrom: yellow
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---
Hosted connector (${IMAGE}) behind a Caddy bearer gate for NodeWorm. Zero-install:
the user scans one QR in the app. Free-tier HF storage is ephemeral (a Space
restart drops the link and needs a re-scan).
EOF

# Caddy gate: :7860 public, bearer-checked, proxied to the connector on UPSTREAM_PORT.
cat > Caddyfile <<'EOF'
{
	auto_https off
	admin off
}
{$BRIDGE_LISTEN:-:7860} {
	handle /healthz { respond "ok" 200 }
	@unauthorized not header Authorization "Bearer {$BRIDGE_TOKEN}"
	handle @unauthorized { respond "Unauthorized" 401 { close } }
	handle { reverse_proxy 127.0.0.1:{$UPSTREAM_PORT:-8080} }
}
EOF

# Two-process supervisor: connector in background, Caddy in foreground.
cat > supervisor.sh <<'EOF'
#!/bin/sh
set -eu
API_PID=""
term() { [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null || true; exit 0; }
trap term TERM INT
START="${UPSTREAM_START:-/entrypoint.sh}"
if [ -z "$START" ] || [ ! -e "${START%% *}" ]; then
  echo "supervisor: UPSTREAM_START ('$START') not runnable; set it for this image" >&2
  exit 1
fi
# shellcheck disable=SC2086
$START &
API_PID=$!
i=0; while [ "$i" -lt 20 ]; do
  [ -d /proc/"$API_PID" ] || { echo "supervisor: connector exited on startup" >&2; exit 1; }
  i=$((i + 1)); sleep 1
done
echo "supervisor: starting Caddy on ${BRIDGE_LISTEN:-:7860}" >&2
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
EOF

cat > Dockerfile <<EOF
FROM caddy:2-alpine AS caddy
FROM ${IMAGE}
COPY --from=caddy /usr/bin/caddy /usr/bin/caddy
COPY Caddyfile /etc/caddy/Caddyfile
COPY supervisor.sh /usr/local/bin/supervisor.sh
RUN chmod +x /usr/local/bin/supervisor.sh || true
ENV BRIDGE_LISTEN=:7860
ENV UPSTREAM_PORT=${UPSTREAM_PORT}
ENV UPSTREAM_START="${UPSTREAM_START}"
ENV MODE=json-rpc
EXPOSE 7860
ENTRYPOINT ["/usr/local/bin/supervisor.sh"]
EOF

echo ">> creating Space ${REPO}"
curl -s -X POST "${API}/repos/create" -H "Authorization: Bearer ${HF_TOKEN}" -H "Content-Type: application/json" \
  -d "{\"type\":\"space\",\"name\":\"${SPACE_NAME}\",\"sdk\":\"docker\",\"private\":false}" >/dev/null 2>&1 || echo "   (may already exist)"
echo ">> setting BRIDGE_TOKEN secret"
curl -s -o /dev/null -w "   secret HTTP %{http_code}\n" -X POST "${API}/spaces/${REPO}/secrets" \
  -H "Authorization: Bearer ${HF_TOKEN}" -H "Content-Type: application/json" \
  -d "{\"key\":\"BRIDGE_TOKEN\",\"value\":\"${BRIDGE_TOKEN}\"}"
echo ">> pushing Space files"
git init -q && git checkout -q -b main && git add -A
git -c user.email="deploy@nodeworm" -c user.name="nodeworm" commit -qm "provision ${APP} bridge"
git push -qf "https://${HF_USER}:${HF_TOKEN}@huggingface.co/spaces/${REPO}.git" main

BRIDGE_URL="https://${HF_USER}-${SPACE_NAME}.hf.space"
echo ""
echo ">> DONE. Building: https://huggingface.co/spaces/${REPO}"
echo ">> Set in NodeWorm (Vercel prod):"
UP="$(echo "${APP}" | tr '[:lower:]' '[:upper:]')"
echo "     printf '%s' '${BRIDGE_URL}' | vercel env add ${UP}_BRIDGE_URL production"
echo "     printf '%s' '${BRIDGE_TOKEN}' | vercel env add ${UP}_BRIDGE_TOKEN production"
