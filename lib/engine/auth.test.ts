import { describe, it, expect } from "vitest";
import { emailIsAdmin } from "./auth";

describe("emailIsAdmin", () => {
  it("is permissive when no allowlist is configured (single-operator default)", () => {
    expect(emailIsAdmin("anyone@x.com", undefined)).toBe(true);
    expect(emailIsAdmin(undefined, "")).toBe(true);
    expect(emailIsAdmin(undefined, "   ")).toBe(true);
  });

  it("gates to listed emails once an allowlist is set", () => {
    const list = "admin@nodeworm.app, ops@nodeworm.app";
    expect(emailIsAdmin("admin@nodeworm.app", list)).toBe(true);
    expect(emailIsAdmin("ops@nodeworm.app", list)).toBe(true);
    expect(emailIsAdmin("random@user.com", list)).toBe(false);
  });

  it("matches case-insensitively and trims", () => {
    expect(emailIsAdmin("Admin@NodeWorm.App", " admin@nodeworm.app ")).toBe(true);
  });

  it("denies anonymous (no email) when an allowlist is set", () => {
    expect(emailIsAdmin(undefined, "admin@nodeworm.app")).toBe(false);
  });
});
