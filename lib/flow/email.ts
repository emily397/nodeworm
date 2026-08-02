// Email delivery for the `email` step. Provider-agnostic: the operator picks one
// with EMAIL_PROVIDER and its credentials, and the step works. Nothing here
// bundles a provider SDK, every provider is a plain HTTPS call.
//
// listmonk is deliberately HTTP-API only (it is AGPL, so it runs as a separate
// service and is never linked into this product).
//
// Pure request building so it is testable without credentials; the effect does
// the I/O.

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

export interface EmailRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  provider: string;
}

const EMAIL_RE = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;

export function validRecipient(to: string): boolean {
  return EMAIL_RE.test(to.trim());
}

function env(k: string): string {
  return (process.env[k] ?? "").trim();
}

export function emailProvider(): "resend" | "listmonk" | null {
  const p = env("EMAIL_PROVIDER").toLowerCase();
  return p === "resend" || p === "listmonk" ? p : null;
}

export function emailConfigured(): boolean {
  const p = emailProvider();
  if (!p || !env("EMAIL_FROM")) return false;
  if (p === "resend") return Boolean(env("RESEND_API_KEY"));
  return Boolean(env("LISTMONK_URL") && env("LISTMONK_USER") && env("LISTMONK_PASSWORD"));
}

export function buildEmailRequest(msg: EmailMessage): EmailRequest | { error: string } {
  const provider = emailProvider();
  if (!provider || !emailConfigured()) {
    return { error: "email is not set up on this account yet" };
  }
  const to = msg.to.trim();
  if (!validRecipient(to)) return { error: `"${msg.to}" is not a valid email address` };
  const subject = msg.subject.trim();
  const body = msg.body.trim();
  if (!subject && !body) return { error: "give the email a subject or a message" };

  const from = env("EMAIL_FROM");

  if (provider === "resend") {
    return {
      provider,
      url: "https://api.resend.com/emails",
      headers: { authorization: `Bearer ${env("RESEND_API_KEY")}` },
      body: { from, to: [to], subject, text: body },
    };
  }

  const base = env("LISTMONK_URL").replace(/\/+$/, "");
  const auth = Buffer.from(`${env("LISTMONK_USER")}:${env("LISTMONK_PASSWORD")}`).toString("base64");
  return {
    provider,
    url: `${base}/api/tx`,
    headers: { authorization: `Basic ${auth}` },
    body: { subscriber_email: to, from_email: from, subject, content_type: "plain", data: { body }, body },
  };
}
