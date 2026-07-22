import { afterEach, describe, expect, it } from "vitest";
import { gatewayEnabled, isSpendCapStatus, resolveEndpoint } from "./gateway";

const saved = { url: process.env.LLM_GATEWAY_URL, key: process.env.LLM_GATEWAY_KEY, groq: process.env.GROQ_API_KEY };
afterEach(() => {
  process.env.LLM_GATEWAY_URL = saved.url;
  process.env.LLM_GATEWAY_KEY = saved.key;
  process.env.GROQ_API_KEY = saved.groq;
});

describe("gatewayEnabled", () => {
  it("is on only when both a gateway URL and a virtual key are configured", () => {
    process.env.LLM_GATEWAY_URL = "https://gw.internal/v1";
    process.env.LLM_GATEWAY_KEY = "sk-virtual";
    expect(gatewayEnabled()).toBe(true);

    delete process.env.LLM_GATEWAY_KEY;
    expect(gatewayEnabled()).toBe(false);
  });
});

describe("resolveEndpoint", () => {
  it("routes every provider through the gateway when enabled, using the virtual key", () => {
    process.env.LLM_GATEWAY_URL = "https://gw.internal/v1";
    process.env.LLM_GATEWAY_KEY = "sk-virtual";
    const groq = resolveEndpoint("groq");
    const or = resolveEndpoint("openrouter");
    expect(groq).toEqual({ url: "https://gw.internal/v1/chat/completions", key: "sk-virtual" });
    expect(or).toEqual(groq);
  });

  it("tolerates a trailing slash on the gateway URL", () => {
    process.env.LLM_GATEWAY_URL = "https://gw.internal/v1/";
    process.env.LLM_GATEWAY_KEY = "sk-virtual";
    expect(resolveEndpoint("groq").url).toBe("https://gw.internal/v1/chat/completions");
  });

  it("falls back to the direct provider when no gateway is set", () => {
    delete process.env.LLM_GATEWAY_URL;
    delete process.env.LLM_GATEWAY_KEY;
    process.env.GROQ_API_KEY = "gk";
    expect(resolveEndpoint("groq")).toEqual({ url: "https://api.groq.com/openai/v1/chat/completions", key: "gk" });
  });
});

describe("isSpendCapStatus", () => {
  it("treats payment-required and rate-limit as a budget stop, not a model failure", () => {
    expect(isSpendCapStatus(402)).toBe(true);
    expect(isSpendCapStatus(429)).toBe(true);
    expect(isSpendCapStatus(500)).toBe(false);
    expect(isSpendCapStatus(400)).toBe(false);
  });
});
