// Universal OAuth popup closer. When the consent runs in a popup window (?popup=1),
// every terminal outcome (connected, error, recover, blocked) returns this tiny HTML
// instead of a full-page redirect: it posts the result to the opener and closes. This
// is what makes "click the OAuth popup" a generic capability for ANY discovered OAuth
// path (curated, Nango, or probe), not per-app plumbing. targetOrigin is pinned to
// this deployment's own origin so the message is never readable cross-site.

import { NextResponse } from "next/server";

export type OAuthOutcome = "connected" | "error" | "recover" | "blocked";

export function popupResult(origin: string, id: string, outcome: OAuthOutcome, reason?: string): NextResponse {
  const payload = JSON.stringify({ source: "nodeworm-oauth", id, outcome, reason: reason ?? null });
  const html = `<!doctype html><meta charset="utf-8"><title>NodeWorm</title>
<body style="font:15px system-ui;margin:0;display:grid;place-items:center;height:100vh;background:#0b0b0f;color:#e7e7ea">
<div style="text-align:center">${outcome === "connected" ? "Connected. You can close this window." : "Done. You can close this window."}</div>
<script>
(function(){
  var msg = ${payload};
  try { if (window.opener) window.opener.postMessage(msg, ${JSON.stringify(origin)}); } catch (e) {}
  setTimeout(function(){ try { window.close(); } catch (e) {} }, 400);
})();
</script></body>`;
  return new NextResponse(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
