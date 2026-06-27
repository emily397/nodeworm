// NodeWorm Helper service worker. Orchestrates the portal hand-off:
//  1. content-nodeworm.js sends {type:"nw_start", handoff} when the user clicks
//     "Automate" on a NodeWorm recovery card.
//  2. We open the provider's developer portal, inject content-portal.js, which
//     fills the redirect URI and captures the client id/secret.
//  3. content-portal.js sends {type:"nw_creds", ...}; we POST them to the SAME
//     per-user-scoped paste-back route NodeWorm uses for manual entry
//     (/api/integrations/<id>/oauth/client), authenticated by the user's NodeWorm
//     session cookie (credentials:"include"). No tokens, no extra trust.
//  4. We navigate the NodeWorm tab to /oauth/start, which now finds the stored
//     client and runs the genuine consent.

// nw_verify_local: the UI found a localhost/private connector the cloud cannot
// reach. Content-nodeworm.js relays this message here. We make the real GET from
// the user's own machine (where localhost IS reachable), then POST the result
// back to NodeWorm's /connector/verify-local route (same session cookie auth).

// ---- NodeWorm Agent (native-messaging host) ----
// nw_agent_ping detects whether the locally-installed Agent is present. The
// long-lived "nw_exec" port bridges the page <-> Agent so a signed execution plan
// streams its step-by-step progress back to the run page in real time.
const NW_NATIVE_HOST = "com.nodeworm.executor";

// Broad host access (<all_urls>) is an OPTIONAL permission, granted once by the
// user from the popup (a gesture-capable surface), never at install. It is needed
// only by the two advanced features that touch sites outside NodeWorm: filling a
// provider portal and reaching a user-typed local connector. The primary flows
// (managed session, hosted connector, genuine OAuth) never need it. We check it
// before those features and, if missing, tell the page to prompt the popup grant.
function hasBroadHost() {
  return new Promise((resolve) => {
    try {
      chrome.permissions.contains({ origins: ["<all_urls>"] }, (granted) =>
        resolve(Boolean(granted) && !chrome.runtime.lastError),
      );
    } catch (_e) {
      resolve(false);
    }
  });
}
const GRANT_HINT =
  "Click the NodeWorm Helper icon in your toolbar and turn on Advanced automation, then try again.";

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== "nw_agent_ping") return;
  try {
    chrome.runtime.sendNativeMessage(NW_NATIVE_HOST, { type: "nw_ping" }, (resp) => {
      if (chrome.runtime.lastError || !resp) { sendResponse({ installed: false }); return; }
      sendResponse({ installed: true, version: resp.version, publicKeyId: resp.publicKeyId });
    });
  } catch (_e) {
    sendResponse({ installed: false });
  }
  return true;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "nw_exec") return;
  let nativePort = null;
  port.onMessage.addListener((m) => {
    if (m.type === "execute") {
      try {
        nativePort = chrome.runtime.connectNative(NW_NATIVE_HOST);
      } catch (_e) {
        port.postMessage({ type: "nw_done", ok: false, detail: "NodeWorm Agent is not installed." });
        return;
      }
      nativePort.onMessage.addListener((hm) => port.postMessage(hm));
      nativePort.onDisconnect.addListener(() => {
        const err = chrome.runtime.lastError;
        port.postMessage({ type: "nw_done", ok: false, detail: err ? err.message : "Agent disconnected." });
      });
      nativePort.postMessage({ type: "nw_execute", envelope: m.envelope });
    } else if (m.type === "abort" && nativePort) {
      nativePort.postMessage({ type: "nw_abort" });
    } else if (m.type === "respond" && nativePort) {
      nativePort.postMessage({ type: "nw_respond" });
    }
  });
  port.onDisconnect.addListener(() => { if (nativePort) { try { nativePort.disconnect(); } catch (_e) {} } });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "nw_start") {
    const handoff = msg.handoff;
    const nodewormTabId = sender.tab && sender.tab.id;
    const nodewormOrigin = sender.origin || (sender.url ? new URL(sender.url).origin : "");
    // Opening the portal tab and injecting content-portal.js needs host access to
    // the (arbitrary) provider origin. That lives behind the optional <all_urls>
    // grant; if the user has not enabled Advanced automation yet, say so instead of
    // opening a tab we cannot script.
    hasBroadHost().then((granted) => {
      if (!granted) {
        sendResponse({ ok: false, needsPermission: true, hint: GRANT_HINT });
        return;
      }
      chrome.tabs.create({ url: handoff.portalUrl || "about:blank" }, (tab) => {
        const portalTabId = tab.id;
        chrome.storage.local.set({ pending: { handoff, nodewormTabId, nodewormOrigin } });
        const onUpdated = (tid, info) => {
          if (tid === portalTabId && info.status === "complete") {
            chrome.scripting.executeScript({ target: { tabId: portalTabId }, files: ["content-portal.js"] }).catch(() => {});
            chrome.tabs.onUpdated.removeListener(onUpdated);
          }
        };
        chrome.tabs.onUpdated.addListener(onUpdated);
        sendResponse({ ok: true });
      });
    });
    return true;
  }

  if (msg.type === "nw_creds") {
    chrome.storage.local.get("pending", async ({ pending }) => {
      if (!pending || !pending.handoff) {
        sendResponse({ ok: false, error: "no pending hand-off" });
        return;
      }
      const { handoff, nodewormTabId, nodewormOrigin } = pending;
      try {
        const res = await fetch(`${nodewormOrigin}/api/integrations/${handoff.id}/oauth/client`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ clientId: msg.clientId, clientSecret: msg.clientSecret }),
        });
        const ok = res.ok;
        const error = ok ? undefined : ((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
        sendResponse({ ok, error });
        if (ok && nodewormTabId != null) {
          chrome.tabs.update(nodewormTabId, { active: true, url: `${nodewormOrigin}/api/integrations/${handoff.id}/oauth/start` });
        }
        chrome.storage.local.remove("pending");
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    });
    return true;
  }

  if (msg.type === "nw_verify_local") {
    // Fetch the connector from the user's own machine, where localhost is reachable.
    (async () => {
      const { id, url, token, healthPath, nodewormOrigin } = msg;
      // Reaching a user-typed connector origin needs the optional <all_urls> grant.
      if (!(await hasBroadHost())) {
        sendResponse({ ok: false, error: GRANT_HINT });
        return;
      }
      let extStatus, extDetail;
      try {
        const target = healthPath ? new URL(healthPath, url).toString() : url;
        const headers = {};
        if (token) headers.authorization = /^(Bearer|Basic) /.test(token) ? token : `Bearer ${token}`;
        const r = await fetch(target, {
          method: "GET",
          headers,
          redirect: "manual",
          cache: "no-store",
          signal: AbortSignal.timeout(8000),
        });
        extStatus = r.status;
        if (extStatus >= 200 && extStatus < 400) {
          const server = r.headers.get("server") ?? "";
          extDetail = `HTTP ${extStatus}${server ? ` ${server}` : ""} via Helper`;
        } else {
          sendResponse({ ok: false, error: `Connector returned HTTP ${extStatus}` });
          return;
        }
      } catch (e) {
        sendResponse({ ok: false, error: `Could not reach connector: ${e.message}` });
        return;
      }

      // Report the live read back to NodeWorm; session cookie authenticates.
      try {
        const res = await fetch(`${nodewormOrigin}/api/integrations/${id}/connector/verify-local`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ url, token, healthPath, extensionStatus: extStatus, extensionDetail: extDetail }),
        });
        const data = await res.json();
        sendResponse(data);
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }
});
