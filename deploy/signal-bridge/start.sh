#!/bin/sh
# Run signal-cli-rest-api and Caddy together in one machine.
#
# /entrypoint.sh is the bbernhard image's original entrypoint. It starts as root,
# fixes ownership on SIGNAL_CLI_CONFIG_DIR, then setpriv's down to uid 1000 and
# execs the API. We run it in the background (unchanged) on PORT=8081, then run
# Caddy in the foreground as the process Fly watches.
set -e

# Start the Signal REST API exactly as the upstream image would.
/entrypoint.sh &
API_PID=$!

# If the API dies, take the machine down so Fly restarts the whole thing.
trap 'kill -TERM "$API_PID" 2>/dev/null; exit 0' TERM INT

# Caddy is the foreground process (public :8080, enforces the Bearer token).
# It will reverse_proxy authorized requests to the API on 127.0.0.1:8081.
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
