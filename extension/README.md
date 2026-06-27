# NodeWorm Helper (browser extension)

Companion to the NodeWorm app. It removes tab-switching from connecting an app:

1. adds an **"⚡ Automate with NodeWorm Helper"** button to a connection card,
2. opens the provider's portal and fills the redirect / callback URI for you,
3. captures the Client ID + Client Secret (auto-detected where possible, or you
   paste them into its panel) and sends them straight back to your NodeWorm
   account, which runs the genuine consent,
4. verifies a connector running on your **own machine** (e.g. `http://localhost`)
   that NodeWorm's cloud can't reach, and
5. relays Ed25519-signed setup plans to the locally-installed **NodeWorm Agent**.

You still log in to the provider and click its own buttons. The Helper never sees
or stores your password.

## Two manifests

- `manifest.json` is the **store build**: no `key` (the Web Store assigns the ID),
  `<all_urls>` is an optional permission, icons + `action` + popup included.
- `manifest.dev.json` is the **dev build**: identical but keeps the stable-ID `key`
  so unpacked loading stays `dalghcagdbckejfmdgfheoaaecmbpnog` (the ID the NodeWorm
  Agent native-host allowlist references). To load unpacked, copy it over
  `manifest.json` first. Do not ship it in the store zip.

## Load it (unpacked, ~30 seconds)

1. Open `chrome://extensions` (Chrome or Edge).
2. Turn on **Developer mode** (top right).
3. (For the stable dev ID) copy `manifest.dev.json` over `manifest.json`.
4. Click **Load unpacked** and select this `extension/` folder.
5. Go to NodeWorm and start a connection.

## Advanced automation (optional permission)

The everyday flows (sign in, scan a QR, OAuth) need only the two NodeWorm origins,
granted at install. The two features that touch other sites, filling a provider
portal and reaching a connector on your own machine, need broad host access. That
is an **optional** permission, **off by default**: click the NodeWorm Helper icon
in the toolbar and turn on **Advanced automation** to grant it (and turn it off to
revoke). Until then, those two features show a hint instead of failing silently.

## Security

- No tokens are placed in the page. The Helper posts the captured client id /
  secret to the **same** per-user route NodeWorm uses for manual entry
  (`/api/integrations/<id>/oauth/client`), authenticated by your existing NodeWorm
  session cookie. It is exactly as trusted as typing them in yourself.
- It runs no remote code: native messaging and `fetch()` exchange data only.
- It acts on a developer portal only on the tab it opened, only after you click
  Automate, and only with the Advanced-automation grant active.

## Honest limits

Developer portals all differ, so the redirect-URI auto-fill and client-id/secret
auto-detect are **best-effort**. When a field can't be matched, the panel's manual
fields are the reliable fallback. High-risk / review-gated portals (Google, Stripe,
Shopify, Intuit, Salesforce, Xero) are intentionally **not** automated.

## Publishing

See `STORE_SUBMISSION.md` for the complete, pre-filled Chrome Web Store submission
pack (listing copy, permission justifications, privacy disclosures, screenshots,
step-by-step, and the post-publish native-host re-sync).
