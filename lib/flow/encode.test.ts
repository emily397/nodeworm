import { describe, expect, it } from "vitest";
import { resolveConnectionFields, toFormBody } from "./encode";

describe("toFormBody", () => {
  it("encodes flat values", () => {
    expect(toFormBody({ amount: 1500, currency: "aud" })).toBe("amount=1500&currency=aud");
  });

  it("uses bracket notation for nested objects, the way Stripe expects", () => {
    expect(toFormBody({ metadata: { order_id: "A1" } })).toBe("metadata%5Border_id%5D=A1");
    expect(decodeURIComponent(toFormBody({ metadata: { order_id: "A1" } }))).toBe("metadata[order_id]=A1");
  });

  it("indexes arrays", () => {
    expect(decodeURIComponent(toFormBody({ items: ["a", "b"] }))).toBe("items[0]=a&items[1]=b");
  });

  it("handles arrays of objects", () => {
    expect(decodeURIComponent(toFormBody({ line_items: [{ price: "p1", quantity: 2 }] }))).toBe(
      "line_items[0][price]=p1&line_items[0][quantity]=2",
    );
  });

  it("escapes reserved characters", () => {
    expect(toFormBody({ email: "a+b@x.com" })).toBe("email=a%2Bb%40x.com");
  });

  it("skips null and undefined but keeps false and zero", () => {
    expect(toFormBody({ a: null, b: undefined, c: false, d: 0 })).toBe("c=false&d=0");
  });

  it("returns an empty string for a non-object", () => {
    expect(toFormBody(undefined)).toBe("");
    expect(toFormBody("nope")).toBe("");
  });
});

describe("resolveConnectionFields", () => {
  const fields = [{ key: "shop", label: "Shop domain", example: "acme.myshopify.com" }];

  it("substitutes declared connection placeholders in a URL", () => {
    const r = resolveConnectionFields("https://{shop}/admin/api/2024-01/orders.json", fields, { shop: "acme.myshopify.com" });
    expect(r.url).toBe("https://acme.myshopify.com/admin/api/2024-01/orders.json");
    expect(r.missing).toEqual([]);
  });

  it("reports missing values instead of sending a literal placeholder", () => {
    const r = resolveConnectionFields("https://{shop}/x", fields, {});
    expect(r.missing).toEqual(["Shop domain"]);
    expect(r.url).toBe("https://{shop}/x");
  });

  it("leaves placeholders the piece did not declare alone, they are step-level params", () => {
    const r = resolveConnectionFields("https://api.hubapi.com/contacts/{contactId}", fields, { shop: "acme" });
    expect(r.url).toBe("https://api.hubapi.com/contacts/{contactId}");
    expect(r.missing).toEqual([]);
  });

  it("is a no-op when the piece declares no connection fields", () => {
    const r = resolveConnectionFields("https://api.x.com/{id}", [], {});
    expect(r.url).toBe("https://api.x.com/{id}");
    expect(r.missing).toEqual([]);
  });
});
