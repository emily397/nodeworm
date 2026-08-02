import { afterEach, describe, expect, it } from "vitest";
import { buildEmailRequest, emailConfigured, validRecipient } from "./email";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("emailConfigured", () => {
  it("is off until a provider and its credentials are set", () => {
    delete process.env.EMAIL_PROVIDER;
    expect(emailConfigured()).toBe(false);

    process.env.EMAIL_PROVIDER = "resend";
    delete process.env.RESEND_API_KEY;
    expect(emailConfigured()).toBe(false);

    process.env.RESEND_API_KEY = "re_x";
    process.env.EMAIL_FROM = "bot@nodeworm.test";
    expect(emailConfigured()).toBe(true);
  });

  it("needs the base URL and credentials for listmonk", () => {
    process.env.EMAIL_PROVIDER = "listmonk";
    process.env.EMAIL_FROM = "bot@nodeworm.test";
    process.env.LISTMONK_URL = "https://mail.internal";
    delete process.env.LISTMONK_USER;
    expect(emailConfigured()).toBe(false);
    process.env.LISTMONK_USER = "api";
    process.env.LISTMONK_PASSWORD = "tok";
    expect(emailConfigured()).toBe(true);
  });
});

describe("validRecipient", () => {
  it("accepts a plain address and rejects junk", () => {
    expect(validRecipient("amy@x.com")).toBe(true);
    expect(validRecipient(" amy@x.com ")).toBe(true);
    expect(validRecipient("amy@")).toBe(false);
    expect(validRecipient("")).toBe(false);
    expect(validRecipient("{{trigger.email}}")).toBe(false);
  });
});

describe("buildEmailRequest", () => {
  const msg = { to: "amy@x.com", subject: "Order 41", body: "Thanks Amy" };

  it("builds a Resend request", () => {
    process.env.EMAIL_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "re_x";
    process.env.EMAIL_FROM = "bot@nodeworm.test";
    const r = buildEmailRequest(msg);
    if ("error" in r) throw new Error(r.error);
    expect(r.url).toBe("https://api.resend.com/emails");
    expect(r.headers.authorization).toBe("Bearer re_x");
    expect(r.body).toEqual({ from: "bot@nodeworm.test", to: ["amy@x.com"], subject: "Order 41", text: "Thanks Amy" });
  });

  it("builds a listmonk request with basic auth against its transactional endpoint", () => {
    process.env.EMAIL_PROVIDER = "listmonk";
    process.env.LISTMONK_URL = "https://mail.internal/";
    process.env.LISTMONK_USER = "api";
    process.env.LISTMONK_PASSWORD = "tok";
    process.env.EMAIL_FROM = "bot@nodeworm.test";
    const r = buildEmailRequest(msg);
    if ("error" in r) throw new Error(r.error);
    expect(r.url).toBe("https://mail.internal/api/tx");
    expect(r.headers.authorization).toBe(`Basic ${Buffer.from("api:tok").toString("base64")}`);
    expect(r.body).toMatchObject({ subscriber_email: "amy@x.com", from_email: "bot@nodeworm.test" });
  });

  it("refuses to send when no provider is configured, rather than failing silently", () => {
    delete process.env.EMAIL_PROVIDER;
    const r = buildEmailRequest(msg);
    expect("error" in r && r.error).toMatch(/not set up/i);
  });

  it("refuses an invalid recipient", () => {
    process.env.EMAIL_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "re_x";
    process.env.EMAIL_FROM = "bot@nodeworm.test";
    const r = buildEmailRequest({ ...msg, to: "not-an-email" });
    expect("error" in r && r.error).toMatch(/valid email/i);
  });

  it("refuses an empty subject and body so a blank email is never sent", () => {
    process.env.EMAIL_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "re_x";
    process.env.EMAIL_FROM = "bot@nodeworm.test";
    expect("error" in buildEmailRequest({ ...msg, subject: "  ", body: "  " })).toBe(true);
  });
});
