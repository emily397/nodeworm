// Inbound webhook receiver plumbing. When `wire` chooses inboundMethod "webhooks",
// the app needs a real endpoint to POST events to. NodeWorm issues a per-integration
// URL carrying a secret token; the receiver verifies the token, answers the common
// registration challenge handshakes, and records a bounded log of received events
// (metadata only, never the full payload). This module is the pure core; the route
// does the I/O.

export interface InboundEvent {
  at: number;
  summary: string;
}

export interface InboundConfig {
  token: string; // secret in the registered URL; server-only, redacted before the client
  createdAt: number;
  lastEventAt?: number;
  events: InboundEvent[];
}

// Keep the log bounded so a chatty webhook can never bloat the record.
export const INBOUND_EVENT_CAP = 50;

// Constant-time token comparison (avoids leaking length/prefix via timing).
export function tokenMatches(expected: string, provided: string | null | undefined): boolean {
  if (!provided || provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  return diff === 0;
}

// Extract a verification challenge (generic ?challenge=, or Slack-style
// {type:"url_verification", challenge}) or summarize the event type for the log.
// Never returns the raw payload.
export function parseInbound(body: unknown, challengeParam: string | null): { challenge?: string; summary: string } {
  if (challengeParam) return { challenge: challengeParam, summary: "verification challenge" };
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.challenge === "string" && (b.type === "url_verification" || b.type === undefined)) {
      return { challenge: b.challenge, summary: "verification challenge" };
    }
    const nested = b.event && typeof b.event === "object" ? (b.event as Record<string, unknown>) : undefined;
    const type =
      (typeof b.type === "string" && b.type) ||
      (typeof b.event_type === "string" && b.event_type) ||
      (nested && typeof nested.type === "string" && nested.type) ||
      "event";
    return { summary: String(type).slice(0, 80) };
  }
  return { summary: "event" };
}

// Append an event, newest-first, capped. Pure: returns a new config.
export function appendInboundEvent(cfg: InboundConfig, summary: string, at: number): InboundConfig {
  const events = [{ at, summary }, ...cfg.events].slice(0, INBOUND_EVENT_CAP);
  return { ...cfg, events, lastEventAt: at };
}
