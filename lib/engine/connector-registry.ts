// Cross-user connector reuse. A generated bundle is a pure function of the app's
// discovered surface, so two users connecting the same app with the same surface get
// byte-identical code. The registry keys a stored bundle by that surface so the
// second user skips generation entirely (their credentials still live only in their
// own vault; only the CODE is shared).
//
// This module owns the pure reuse KEY (what makes two generations equivalent). The
// Neon-backed get/put live in the store (which holds the sql client).

import { createHash } from "node:crypto";
import type { Integration } from "./types";

// A stable key for the surface that drives generation. Returns null when there isn't
// enough signal to safely share (so we generate normally rather than risk a wrong
// reuse). Three regimes:
//  - captured traffic present -> user-specific (their HAR); keyed by its hash so the
//    SAME user's identical capture reuses, but it never collides across users.
//  - a public API / discovered spec -> user-independent; cross-user reuse.
//  - no API, no capture (a conventions scraper) -> identical per app; cross-user reuse.
export function computeReuseKey(it: Integration): string | null {
  if (!it.discovery || !it.wire) return null;
  const app = it.appName.trim().toLowerCase();
  const d = it.discovery;

  let signature: string;
  if (it.capturedRequests) {
    const harHash = sha(JSON.stringify(it.capturedRequests)).slice(0, 16);
    signature = `cap:${app}:${harHash}`;
  } else if (d.hasPublicApi || d.probe?.openApiUrl || d.probe?.graphqlUrl) {
    const spec = d.probe?.openApiUrl || d.probe?.graphqlUrl || "guru";
    signature = `spec:${app}:${d.apiType ?? ""}:${spec}`;
  } else {
    // No API and no captured traffic: a conventions-based scraper, identical per app.
    signature = `scr:${app}:${it.report?.connectMethod ?? "generated-scraper"}`;
  }
  return sha(signature).slice(0, 32);
}

function sha(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
