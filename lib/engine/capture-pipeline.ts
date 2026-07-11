// Shared traffic-capture pipeline. Extracted from the /session/capture route so the
// autonomy loop runs the identical capture the manual button runs. Attaches to the
// live managed-session browser (CDP), records real JSON XHR/fetch, and persists the
// raw capture on the record; the caller persists the integration. Mutates the record
// (sets `capturedRequests`) and returns a summary.

import { captureTraffic } from "./cobrowse";
import { normalizeCapture } from "./capture";
import type { Integration } from "./types";

export class CaptureError extends Error {}

export interface CaptureResult {
  captured: number;
  endpoints: number;
  apiBase?: string;
  sample: string[];
}

export async function captureForIntegration(it: Integration, windowMs = 20000): Promise<CaptureResult> {
  if (!it.managedSession?.connectUrl) {
    throw new CaptureError("Open the managed session and sign in first, then browse the screens you want connected.");
  }
  const clamped = Math.min(Math.max(Number(windowMs) || 20000, 3000), 45000);
  const captured = await captureTraffic(it.managedSession.connectUrl, { windowMs: clamped });
  const { apiBase, ops } = normalizeCapture(captured);

  it.capturedRequests = captured;

  return {
    captured: captured.length,
    endpoints: ops.length,
    apiBase,
    sample: ops.slice(0, 8).map((o) => `${o.method.toUpperCase()} ${o.path}`),
  };
}
