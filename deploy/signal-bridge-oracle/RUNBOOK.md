# Signal hosted-connector on Oracle Always Free (persistent, no Fly billing)

Stands up `bbernhard/signal-cli-rest-api` (digest-pinned, `MODE=json-rpc`, persistent
volume) behind a Bearer gate (Caddy) exposed over HTTPS by a Cloudflare Tunnel, then
repoints NodeWorm prod at it. Guardrails unchanged: consent-gated linking,
`verifyConnector` one-real-read on the bridge, inert-until-keyed, only human step is
scanning the QR. This same box can later host n8n and Infisical (add services to the
compose; each gets its own Cloudflare Tunnel hostname).

State today: `SIGNAL_BRIDGE_URL` is already set in Vercel prod (the old ephemeral HF
Space), so `/api/hosted-connectors/status` already shows `available:true`. This runbook
**repoints** it to the persistent box, so nothing on the NodeWorm side breaks mid-swap.

---

## 1. Provision the Oracle Ampere A1 instance  (human: Oracle account + card verify)

1. Sign in to Oracle Cloud (Always Free). Compute -> Instances -> Create instance.
2. Image & shape: **Canonical Ubuntu 22.04**, shape **VM.Standard.A1.Flex** (Ampere ARM),
   1-2 OCPU / 6-12 GB (all inside Always Free). Boot volume: default persistent (50 GB).
3. Add your SSH public key.
4. Expand **Advanced options -> Management -> cloud-init script** and paste
   `cloud-init.yaml` from this folder. Create.
5. Note the instance's public IP. (No inbound ports are needed at all with the tunnel,
   so you can leave the default security list closed except SSH.)

## 2. Create the Cloudflare Tunnel  (human: Cloudflare account, free)

1. Cloudflare Zero Trust -> Networks -> Tunnels -> **Create a tunnel** (Cloudflared).
2. Name it `signal-bridge`. Copy the **connector token** (the long string after `--token`).
3. Public hostname: add a subdomain on a domain in your CF account, e.g.
   `signal-bridge.yourdomain.com` -> **Service: HTTP -> `caddy:8080`**
   (the tunnel runs in the compose network, so `caddy` resolves; port 8080 is Caddy's
   Bearer gate). Save.

## 3. Bring the bridge up  (human: 3 commands + scan QR)

```sh
ssh ubuntu@<INSTANCE_IP>
cd /opt/signal-bridge
# cloud-init already generated a strong BRIDGE_TOKEN; add the tunnel token:
sudo sed -i "s#CLOUDFLARE_TUNNEL_TOKEN=replace-me#CLOUDFLARE_TUNNEL_TOKEN=<PASTE_TUNNEL_TOKEN>#" .env
sudo docker compose up -d
sudo docker compose ps         # all three services Up
# read the token you'll give NodeWorm:
sudo sed -n 's/^BRIDGE_TOKEN=//p' .env
```

Smoke-test the gate from your laptop (401 without token, 200/health with it):
```sh
curl -s -o /dev/null -w '%{http_code}\n' https://signal-bridge.yourdomain.com/v1/health           # 401
curl -s -H "Authorization: Bearer <BRIDGE_TOKEN>" https://signal-bridge.yourdomain.com/v1/health  # 200 {"...":...}
```

## 4. Repoint NodeWorm prod  (I can run this once you give me URL + token)

BOM-safe via Bash `printf` (PowerShell pipes prepend a UTF-8 BOM that corrupts the value):
```sh
cd /c/Users/emily/abie
# remove the old HF values, then set the new ones
vercel env rm SIGNAL_BRIDGE_URL production -y
vercel env rm SIGNAL_BRIDGE_TOKEN production -y
printf '%s' 'https://signal-bridge.yourdomain.com' | vercel env add SIGNAL_BRIDGE_URL production
printf '%s' '<BRIDGE_TOKEN>'                        | vercel env add SIGNAL_BRIDGE_TOKEN production
vercel deploy --prod --yes
```

## 5. Verify (NodeWorm side)

```sh
# a) status still available:true (now backed by the persistent box)
curl -s https://abie-three.vercel.app/api/hosted-connectors/status

# b) a Signal run resolves to the hosted-connector with the "scan one QR" copy
#    (create a Signal integration in the UI, or via the API, and read the report):
#    report.connectMethod == "hosted-connector"
#    report.headline contains "Scan one QR"

# c) /hosted-connector/start reaches the live bridge and returns the device-link QR
#    (in the UI: consent checkbox -> "Link Signal (scan one QR)" -> a QR renders).
#    Scan it in Signal -> Settings -> Linked devices. NodeWorm polls /v1/accounts and
#    flips to connected-via-connector on the first real read.
```

## Notes
- Persistence: the linked-device state lives in the `signal-data` Docker volume on the
  instance's persistent boot/block volume, so it survives restarts and reboots (the HF
  Space problem was ephemeral storage).
- Token model: `signal-cli-rest-api` has no auth; the Bearer is enforced by Caddy. Rotate
  by changing `BRIDGE_TOKEN` in `.env`, `docker compose up -d caddy`, and re-running step 4.
- Digest pin: image is pinned to `sha256:2399d449…286cf8` (== `lib/engine/hosted-connectors.ts`).
  To update, re-resolve the digest and bump both places together.
- Later: add `n8n` and `infisical` services to the same compose, each with its own
  Cloudflare Tunnel public hostname; the Ampere A1 free tier has ample headroom.
