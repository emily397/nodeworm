// Optional LLM gateway (LiteLLM). When LLM_GATEWAY_URL and LLM_GATEWAY_KEY are
// set, every model call routes through one OpenAI-compatible endpoint with a
// per-customer virtual key, so spend caps and routing live in one place instead
// of in this codebase. Unset, the direct provider cascade is unchanged.
//
// MIT core only: none of LiteLLM's enterprise/ features are used or required.

export type LlmProvider = "groq" | "openrouter";

const DIRECT: Record<LlmProvider, string> = {
  groq: "https://api.groq.com/openai/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
};

export function gatewayEnabled(): boolean {
  return Boolean(process.env.LLM_GATEWAY_URL && process.env.LLM_GATEWAY_KEY);
}

function directKey(p: LlmProvider): string | undefined {
  return p === "groq" ? process.env.GROQ_API_KEY : process.env.OPENROUTER_API_KEY;
}

// Where a call for this provider should actually go, and with which key.
export function resolveEndpoint(p: LlmProvider): { url: string; key?: string } {
  if (gatewayEnabled()) {
    const base = process.env.LLM_GATEWAY_URL!.replace(/\/+$/, "");
    return { url: `${base}/chat/completions`, key: process.env.LLM_GATEWAY_KEY };
  }
  return { url: DIRECT[p], key: directKey(p) };
}

// A budget stop is not a model failure: it must surface as a real error rather
// than silently falling through the cascade and looking like "no model worked".
export function isSpendCapStatus(status: number): boolean {
  return status === 402 || status === 429;
}
