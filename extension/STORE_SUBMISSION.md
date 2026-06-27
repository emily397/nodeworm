# NodeWorm Helper: Chrome Web Store submission pack

Everything below is pre-filled and verified against current (2026) Chrome Web Store policy. Your only manual steps are the ones marked **YOU** (they need your Google account). Copy/paste the rest.

The packaged, store-ready zip is at `public/agent/nodeworm-helper.zip` (served at `https://abie-three.vercel.app/agent/nodeworm-helper.zip`). It contains the store manifest (no dev `key`), icons, scripts, and popup. Nothing else to build.

---

## 0. What was fixed to make it submittable

The previous package would have been rejected immediately. Now resolved:

- **Added icons** (16/32/48/128) and an **`action`** with a popup. Both were missing (instant rejection / load failure).
- **Dropped the dev `key`** from the store manifest. The store assigns its own ID; shipping the key forces a mismatched fixed ID and is flagged. The key lives on in `manifest.dev.json` for unpacked dev loading.
- **Dropped the `tabs` permission.** The code only uses `tabs.create/update/onUpdated` (reading `status` only) and `sender.tab.id`, none of which need it. Least-privilege.
- **Moved `<all_urls>` to `optional_host_permissions`** (the top rejection risk as a standing install-time grant). It is now requested at runtime, only when you turn on "Advanced automation" in the popup. Required hosts are just the two NodeWorm origins. A popup plus permission checks were added so the advanced features still work after this change.

---

## 1. Listing fields (copy/paste)

- **Item name:** `NodeWorm Helper`
- **Summary** (max 132 chars): `Speeds up connecting apps in NodeWorm: auto-fills OAuth redirect URIs, checks local connectors, and relays signed setup plans.`
- **Category:** `Developer Tools`
- **Language:** English

**Description:**

```
NodeWorm Helper is a companion for the NodeWorm integration app (https://abie-three.vercel.app and your local NodeWorm dev server). It removes the tab-switching from connecting an app, so non-technical users can finish OAuth setup hands-off.

WHAT IT DOES
- Adds an "Automate with NodeWorm Helper" button to NodeWorm's connection cards.
- Opens the provider's developer portal and fills in the OAuth redirect / callback URI for you (best-effort by field matching).
- Captures the Client ID and Client Secret you create in that portal (auto-detected where possible, or you paste them into the panel) and sends them back to NodeWorm over your existing NodeWorm session, exactly as if you typed them in yourself.
- Verifies a connector running on your own machine (for example http://localhost) that NodeWorm's cloud cannot reach, by making the request locally and reporting the result back to NodeWorm.
- Relays Ed25519-signed setup plans to a separately installed local helper app (the NodeWorm Agent) and streams progress back to the page.

WHAT IT DOES NOT DO
- It never sees or stores your provider password. You log in and click the provider's own "create app" / "authorize" buttons.
- It does not collect, sell, or transfer your personal data. Captured client credentials go only to your own NodeWorm account.
- It runs on a third-party developer portal only after you click Automate, only on the tab it opened for you, and only with the one-time site access you grant at that moment. High-risk portals (Google, Stripe, Shopify, Intuit, Salesforce, Xero) are intentionally left fully manual.

WHO IT IS FOR
Existing NodeWorm users who want one-click app connections instead of copying redirect URIs and credentials between tabs.

This extension is only useful alongside NodeWorm; it has no standalone function.
```

- **Privacy policy URL:** `https://abie-three.vercel.app/extension-privacy`  *(live; page added to the app)*
- **Homepage / support URL:** `https://abie-three.vercel.app`

---

## 2. Privacy practices tab (copy/paste)

**Single purpose:**

```
A companion to the NodeWorm app that automates OAuth app registration on developer portals (filling the redirect URI and relaying the resulting client credentials back to the user's own NodeWorm account), verifies the user's local connectors, and relays signed setup plans to the locally installed NodeWorm Agent. Every feature serves the single purpose of helping a NodeWorm user finish connecting an app.
```

**Permission justifications:**

- **storage:** Stores a single short-lived "pending" hand-off object (the non-secret OAuth recipe and the IDs of the NodeWorm tab and portal tab) so the service worker can match the portal tab it opened to the originating NodeWorm tab. Written on "Automate", deleted as soon as credentials are posted back. No user data persisted.
- **scripting:** Used by `chrome.scripting.executeScript` to inject `content-portal.js` into the single developer-portal tab the extension itself opened after the user clicks Automate. That script fills the OAuth redirect URI and shows the credential-capture panel. Never injected into tabs the user opened independently.
- **nativeMessaging:** Connects to the user's separately installed local app, the NodeWorm Agent (native host `com.nodeworm.executor`), to detect whether it is present and to stream Ed25519-signed setup plans to it for hands-off execution. Only signed plan envelopes and control messages are exchanged; no browsing data is sent.
- **Host `http://localhost:3000/*` and `https://abie-three.vercel.app/*`:** The NodeWorm app origins. The content script runs only here to add the Automate button, and the worker posts captured credentials and connector-verify results back here using your existing NodeWorm session cookie. Core, always-on scope.
- **Optional host `<all_urls>` (requested at runtime, not on install):** Requested with `chrome.permissions.request` only when the user enables "Advanced automation" in the popup, because (1) the developer portal the user chooses can be any provider domain where the redirect URI must be filled, and (2) a self-hosted connector lives at a user-typed address (often localhost or a private host) only the user's browser can reach. User-initiated and revocable, never a standing all-sites grant.

**Data collection:** check **Authentication information** only. Do NOT check PII, health, financial/payment, personal communications, location, web history, or website content.

**Remote code:** answer **No**. The extension runs only packaged code; native messaging and `fetch()` exchange data, not executable code (no `eval`, no dynamic-function evaluation, no remote-script load; `content-portal.js` builds DOM nodes, no `innerHTML`).

**Certifications:** check all three (no selling/transfer to third parties outside approved use; no use unrelated to single purpose; not for creditworthiness/lending).

---

## 3. Screenshots (YOU upload 1 to 5; 1280x800 PNG, square corners, full-bleed)

Suggested set (captions optional):
1. A NodeWorm connection card with the green "Automate with NodeWorm Helper" button injected. Caption: "One click to start a connection."
2. A provider dev portal with the redirect URI auto-filled and the Helper capture panel pinned. Caption: "Redirect URI filled in for you."
3. The capture panel with Client ID / Client Secret plus "Send to NodeWorm". Caption: "Credentials go straight to your own NodeWorm account."
4. A NodeWorm run page streaming live step progress from the Agent. Caption: "Signed setup plans run hands-off."

Store icon: use `icons/icon128.png` (128x128). Promo tiles (440x280, 1400x560) are **optional** under current policy, only needed if you want featuring. Skip to publish.

---

## 4. Submit (YOU, needs your Google account)

1. **YOU:** Go to the Chrome Web Store Developer Dashboard: https://chrome.google.com/webstore/devconsole . If this is your first item, register as a developer (one-time **US$5** fee) and complete account verification.
2. **YOU:** Click **New item**, upload `public/agent/nodeworm-helper.zip`. Resolve any manifest warnings it surfaces (there should be none).
3. **YOU:** Fill the **Store listing** tab from section 1 (name, summary, description, category, store icon, screenshots, privacy policy plus homepage URLs).
4. **YOU:** Fill the **Privacy practices** tab from section 2 (single purpose, permission justifications, data collection = Authentication information only, remote code = No, all three certifications, privacy policy URL).
5. **YOU:** Set visibility (Public or Unlisted) and **Submit for review**. Reviews for `nativeMessaging` plus broad-host extensions can take several days and may include follow-up questions; the justifications above pre-answer the common ones.

---

## 5. After it is approved (one code step on my side)

The store assigns a **new extension ID** that differs from the dev ID `dalghcagdbckejfmdgfheoaaecmbpnog`.

1. **YOU:** Open the published item, copy the assigned 32-char extension ID.
2. **ME:** Add `chrome-extension://<NEW_STORE_ID>/` to the NodeWorm Agent native-host manifest `allowed_origins` (keep the dev ID only if you still load unpacked) and re-cut the Agent installer. Then set `NEXT_PUBLIC_EXTENSION_URL` to the store listing URL so NodeWorm shows a real "Add to Chrome" button instead of the zip download.
3. Send me the ID and I will do step 2 and redeploy.
