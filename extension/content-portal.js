// Injected into the provider's developer portal tab. Fills the redirect / callback
// URI (best-effort by field heuristics) and shows a NodeWorm capture panel. The
// user creates the app in the portal as normal; the panel grabs the client id /
// secret (auto-detected where possible, otherwise pasted) and sends them to the
// service worker, which posts them to NodeWorm. Honest about its limits: portals
// differ, so auto-fill / auto-detect are best-effort with manual fields as the
// reliable floor. Built with DOM nodes (no innerHTML) to avoid any injection.

(function () {
  if (window.__nwHelperLoaded) return;
  window.__nwHelperLoaded = true;

  chrome.storage.local.get("pending", ({ pending }) => {
    if (!pending || !pending.handoff) return;
    const h = pending.handoff;
    const filled = fillRedirect(h.redirectUri);
    renderPanel(h, filled);
  });

  function fieldHay(inp) {
    const label = inp.labels && inp.labels[0] ? inp.labels[0].textContent : "";
    return `${inp.name || ""} ${inp.id || ""} ${inp.placeholder || ""} ${inp.getAttribute("aria-label") || ""} ${label}`.toLowerCase();
  }

  function setValue(inp, value) {
    const proto = inp.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value");
    try {
      setter.set.call(inp, value);
    } catch {
      inp.value = value;
    }
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    inp.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function fillRedirect(uri) {
    let n = 0;
    document.querySelectorAll("input[type=text], input[type=url], input:not([type]), textarea").forEach((inp) => {
      if (inp.value) return;
      if (/redirect|callback|return.?url|reply.?url|\buri\b|\burl\b/.test(fieldHay(inp))) {
        inp.focus();
        setValue(inp, uri);
        n++;
      }
    });
    return n;
  }

  function detect(re) {
    for (const inp of document.querySelectorAll("input, textarea")) {
      if (inp.value && re.test(fieldHay(inp))) return inp.value.trim();
    }
    return "";
  }

  function el(tag, css, text) {
    const e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text != null) e.textContent = text;
    return e;
  }

  function renderPanel(h, filled) {
    const box = el(
      "div",
      "position:fixed;top:16px;right:16px;z-index:2147483647;width:300px;background:#f4efe3;color:#1b1812;border:1px solid #2c2820;border-radius:12px;box-shadow:0 12px 34px rgba(0,0,0,.28);font:13px system-ui,sans-serif;padding:14px;",
    );
    box.appendChild(el("div", "font:700 11px system-ui;letter-spacing:.05em;text-transform:uppercase;color:#e8590c;margin-bottom:6px;", "NodeWorm Helper"));

    const intro = el("div", "font-size:12px;color:#6b6357;margin-bottom:10px;");
    intro.append("Capturing the OAuth client for ");
    const strong = el("b", null, h.appName);
    intro.append(strong, filled ? ". Redirect URI filled in for you." : ". Set the redirect URI to the value below.");
    box.appendChild(intro);

    if (!filled) {
      const row = el("div", "display:flex;gap:6px;margin-bottom:10px;");
      const uri = el("input", "flex:1;min-width:0;padding:6px;border:1px solid #cdc6b8;border-radius:6px;font:11px monospace;");
      uri.readOnly = true;
      uri.value = h.redirectUri;
      const copy = el("button", "padding:6px 8px;border:1px solid #cdc6b8;border-radius:6px;background:#fff;cursor:pointer;font:12px system-ui;", "copy");
      copy.addEventListener("click", () => navigator.clipboard && navigator.clipboard.writeText(h.redirectUri));
      row.append(uri, copy);
      box.appendChild(row);
    }

    box.appendChild(el("label", "font:600 10px system-ui;text-transform:uppercase;color:#6b6357;", "Client ID"));
    const cid = el("input", "width:100%;box-sizing:border-box;margin:2px 0 8px;padding:7px;border:1px solid #cdc6b8;border-radius:6px;font:12px monospace;");
    box.appendChild(cid);

    box.appendChild(el("label", "font:600 10px system-ui;text-transform:uppercase;color:#6b6357;", "Client Secret"));
    const sec = el("input", "width:100%;box-sizing:border-box;margin:2px 0 10px;padding:7px;border:1px solid #cdc6b8;border-radius:6px;font:12px monospace;");
    sec.type = "text";
    box.appendChild(sec);

    const send = el("button", "width:100%;padding:8px;border:0;border-radius:8px;background:#1b1812;color:#f4efe3;font:600 13px system-ui;cursor:pointer;", "Send to NodeWorm");
    box.appendChild(send);
    const msg = el("div", "font-size:11px;color:#6b6357;margin-top:8px;");
    box.appendChild(msg);

    cid.value = detect(/client.?id|app.?id|consumer.?key/i);
    sec.value = detect(/client.?secret|app.?secret|consumer.?secret/i);

    send.addEventListener("click", () => {
      const clientId = cid.value.trim();
      const clientSecret = sec.value.trim();
      if (!clientId || !clientSecret) {
        msg.textContent = "Paste both the Client ID and Client Secret.";
        return;
      }
      msg.textContent = "Sending to NodeWorm…";
      chrome.runtime.sendMessage({ type: "nw_creds", clientId, clientSecret }, (resp) => {
        if (resp && resp.ok) {
          msg.textContent = "Done. NodeWorm is running the consent in its tab.";
          send.disabled = true;
        } else {
          msg.textContent = "Failed: " + ((resp && resp.error) || "unknown error");
        }
      });
    });

    document.body.appendChild(box);
  }
})();
