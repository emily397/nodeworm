// NodeWorm Helper popup. Two jobs: show whether the local NodeWorm Agent is
// installed, and let the user grant/revoke the optional <all_urls> host access
// ("Advanced automation"). The grant MUST happen here: chrome.permissions.request
// needs a user gesture and is unavailable to content scripts, so the popup button
// click is the only reliable place to request it.

const agentEl = document.getElementById("agent");
const advEl = document.getElementById("adv");
const advBtn = document.getElementById("advBtn");

function setState(el, text, ok) {
  el.textContent = text;
  el.className = "state " + (ok ? "ok" : "muted");
}

// Agent presence (relayed to the native host by the service worker).
chrome.runtime.sendMessage({ type: "nw_agent_ping" }, (resp) => {
  if (chrome.runtime.lastError || !resp || !resp.installed) {
    setState(agentEl, "Not installed (optional)", false);
  } else {
    setState(agentEl, `Connected${resp.version ? " · v" + resp.version : ""}`, true);
  }
});

function refreshAdv() {
  chrome.permissions.contains({ origins: ["<all_urls>"] }, (granted) => {
    const on = Boolean(granted) && !chrome.runtime.lastError;
    setState(advEl, on ? "On" : "Off", on);
    advBtn.textContent = on ? "Turn off" : "Turn on";
    advBtn.className = on ? "off" : "";
    advBtn.dataset.on = on ? "1" : "0";
    advBtn.disabled = false;
  });
}

advBtn.addEventListener("click", () => {
  advBtn.disabled = true;
  if (advBtn.dataset.on === "1") {
    chrome.permissions.remove({ origins: ["<all_urls>"] }, refreshAdv);
  } else {
    chrome.permissions.request({ origins: ["<all_urls>"] }, refreshAdv);
  }
});

refreshAdv();
