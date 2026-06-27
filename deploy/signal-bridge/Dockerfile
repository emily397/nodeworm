# NodeWorm Signal bridge: signal-cli-rest-api + Caddy token-auth proxy in one image.
#
# Base is the official bbernhard image so we inherit its /entrypoint.sh verbatim
# (it starts as root, runs usermod/groupmod/chown on the config dir, then setpriv
# down to uid 1000 to exec the API). We do NOT change the entrypoint user. We add
# the caddy binary and a tiny wrapper that runs both processes.

# Pull a static caddy binary from the official alpine image.
FROM caddy:2-alpine AS caddy

# signal-cli-rest-api. Pin to a released tag for reproducible deploys.
FROM bbernhard/signal-cli-rest-api:0.100

# Caddy is a single static binary; drop it on PATH.
COPY --from=caddy /usr/bin/caddy /usr/local/bin/caddy

# Public proxy config (token auth) and the process wrapper.
COPY Caddyfile /etc/caddy/Caddyfile
COPY start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/start.sh

# Caddy serves the public port; the API is moved to 8081 via PORT in fly.toml.
EXPOSE 8080

# Run as root (the bbernhard entrypoint requires it and drops privileges itself).
# The wrapper backgrounds /entrypoint.sh and runs caddy in the foreground.
ENTRYPOINT ["/usr/local/bin/start.sh"]
