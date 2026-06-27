// Runs on NodeWorm pages. When a recovery card for an automatable app appears,
// inject an "Automate with NodeWorm Helper" button that hands the (non-secret)
// recipe off to the service worker. The card is React-rendered after fetch, so
// we observe the DOM rather than running once.

// Also relays nw_verify_local messages from the page to the background service
// worker and posts the result back so the ResearchedMethodCard can react.

(function () {
  // ---- Portal automation button ----
  function tryInject() {
    const el = document.querySelector("[data-nodeworm-handoff]");
    if (!el || document.getElementById("nw-helper-btn")) return;
    let handoff;
    try {
      handoff = JSON.parse(el.getAttribute("data-nodeworm-handoff"));
    } catch {
      return;
    }
    if (!handoff || !handoff.automatable) return;
    // Defense-in-depth: a gated portal above low risk must carry recorded consent.
    // The page already sets automatable:false until consent, this double-checks.
    if (handoff.portalAutomation && handoff.portalAutomation.risk !== "low" && !handoff.consentGranted) return;
    const card = el.parentElement;
    if (!card) return;

    const btn = document.createElement("button");
    btn.id = "nw-helper-btn";
    btn.textContent = "⚡ Automate with NodeWorm Helper";
    btn.style.cssText =
      "display:block;width:100%;margin:0 0 10px;padding:9px 12px;border:0;border-radius:8px;background:#9fd80a;color:#1b1812;font:600 13px system-ui,sans-serif;cursor:pointer;";
    btn.addEventListener("click", () => {
      btn.textContent = "Opening portal…";
      btn.disabled = true;
      chrome.runtime.sendMessage({ type: "nw_start", handoff }, (resp) => {
        // Portal automation needs the one-time "Advanced automation" grant, which
        // can only be given from the popup (a content script cannot request it).
        if (resp && resp.needsPermission) {
          btn.textContent = "⚡ Turn on Advanced automation in the Helper popup, then retry";
          btn.disabled = false;
        }
      });
    });
    card.insertBefore(btn, el.nextSibling);
  }

  tryInject();
  const obs = new MutationObserver(() => tryInject());
  obs.observe(document.documentElement, { childList: true, subtree: true });

  // ---- Localhost connector verify relay ----
  // The page posts nw_verify_local when the cloud can't reach a private address.
  // We forward to the background (which CAN reach localhost) and post the result
  // back so the ResearchedMethodCard resolves without a page reload.
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== "nw_verify_local") return;
    const { id, url, token, healthPath } = event.data;
    const nodewormOrigin = window.location.origin;
    chrome.runtime.sendMessage(
      { type: "nw_verify_local", id, url, token, healthPath, nodewormOrigin },
      (response) => {
        window.postMessage({ type: "nw_verify_local_result", ...response }, window.location.origin);
      },
    );
  });

  // ---- NodeWorm Agent relay (native execution) ----
  // The page asks whether the Agent is installed and, if so, streams a signed
  // execution plan to it. Each Agent message is relayed back to the page; abort /
  // respond controls from the page are relayed to the Agent over the same port.
  const origin = window.location.origin;
  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data) return;
    const d = event.data;
    if (d.type === "nw_agent_ping") {
      chrome.runtime.sendMessage({ type: "nw_agent_ping" }, (resp) => {
        window.postMessage({ type: "nw_agent_pong", ...(resp || { installed: false }) }, origin);
      });
    } else if (d.type === "nw_agent_execute") {
      const port = chrome.runtime.connect({ name: "nw_exec" });
      const onCtrl = (e) => {
        if (e.source === window && e.data && e.data.type === "nw_agent_control") port.postMessage(e.data.control);
      };
      window.addEventListener("message", onCtrl);
      port.onMessage.addListener((hm) => window.postMessage({ type: "nw_agent_event", event: hm }, origin));
      port.onDisconnect.addListener(() => {
        window.removeEventListener("message", onCtrl);
        window.postMessage({ type: "nw_agent_event", event: { type: "nw_done", ok: false, detail: "Agent connection closed." } }, origin);
      });
      port.postMessage({ type: "execute", envelope: d.envelope });
    }
  });
})();
