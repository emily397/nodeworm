import { describe, it, expect } from "vitest";
import { tokenMatches, parseInbound, appendInboundEvent, INBOUND_EVENT_CAP, type InboundConfig } from "./inbound";

describe("tokenMatches", () => {
  it("accepts the exact token, rejects wrong/short/empty", () => {
    expect(tokenMatches("secret123", "secret123")).toBe(true);
    expect(tokenMatches("secret123", "secret124")).toBe(false);
    expect(tokenMatches("secret123", "secret12")).toBe(false);
    expect(tokenMatches("secret123", "")).toBe(false);
    expect(tokenMatches("secret123", null)).toBe(false);
    expect(tokenMatches("secret123", undefined)).toBe(false);
  });
});

describe("parseInbound", () => {
  it("echoes a generic ?challenge= for the registration handshake", () => {
    expect(parseInbound({}, "abc123")).toEqual({ challenge: "abc123", summary: "verification challenge" });
  });

  it("echoes a Slack-style url_verification challenge from the body", () => {
    const r = parseInbound({ type: "url_verification", challenge: "slackchal" }, null);
    expect(r.challenge).toBe("slackchal");
  });

  it("summarizes an event by type (top-level, event_type, or nested event.type)", () => {
    expect(parseInbound({ type: "issue.opened" }, null).summary).toBe("issue.opened");
    expect(parseInbound({ event_type: "push" }, null).summary).toBe("push");
    expect(parseInbound({ event: { type: "message" } }, null).summary).toBe("message");
    expect(parseInbound({ foo: 1 }, null).summary).toBe("event");
  });

  it("never treats a bare body.challenge with a real event type as a handshake", () => {
    // A real event that happens to carry a `challenge` field but a non-verification
    // type is an event, not a handshake.
    const r = parseInbound({ type: "message", challenge: "x" }, null);
    expect(r.challenge).toBeUndefined();
    expect(r.summary).toBe("message");
  });
});

describe("appendInboundEvent", () => {
  const base: InboundConfig = { token: "t", createdAt: 0, events: [] };

  it("prepends newest-first and stamps lastEventAt", () => {
    const c1 = appendInboundEvent(base, "a", 10);
    const c2 = appendInboundEvent(c1, "b", 20);
    expect(c2.events.map((e) => e.summary)).toEqual(["b", "a"]);
    expect(c2.lastEventAt).toBe(20);
  });

  it("caps the log at INBOUND_EVENT_CAP", () => {
    let c = base;
    for (let i = 0; i < INBOUND_EVENT_CAP + 20; i++) c = appendInboundEvent(c, `e${i}`, i);
    expect(c.events.length).toBe(INBOUND_EVENT_CAP);
    expect(c.events[0].summary).toBe(`e${INBOUND_EVENT_CAP + 19}`); // newest kept
  });
});
