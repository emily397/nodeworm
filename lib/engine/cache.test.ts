import { describe, it, expect } from "vitest";
import { TtlCache } from "./cache";

describe("TtlCache", () => {
  it("stores and returns a value within its TTL", () => {
    const c = new TtlCache<number>({ ttlMs: 1000, max: 10 });
    c.set("a", 1, 0);
    expect(c.get("a", 500)).toBe(1);
  });

  it("misses on unknown keys", () => {
    const c = new TtlCache<number>({ ttlMs: 1000, max: 10 });
    expect(c.get("nope", 0)).toBeUndefined();
  });

  it("expires entries past their TTL", () => {
    const c = new TtlCache<number>({ ttlMs: 1000, max: 10 });
    c.set("a", 1, 0);
    expect(c.get("a", 1001)).toBeUndefined();
  });

  it("returns a clone so mutating the result cannot corrupt the cached value", () => {
    const c = new TtlCache<{ n: number }>({ ttlMs: 1000, max: 10 });
    c.set("a", { n: 1 }, 0);
    const first = c.get("a", 0)!;
    first.n = 99;
    expect(c.get("a", 0)!.n).toBe(1);
  });

  it("evicts the oldest entry past max size", () => {
    const c = new TtlCache<number>({ ttlMs: 10000, max: 2 });
    c.set("a", 1, 0);
    c.set("b", 2, 1);
    c.set("c", 3, 2); // "a" should be evicted
    expect(c.get("a", 3)).toBeUndefined();
    expect(c.get("b", 3)).toBe(2);
    expect(c.get("c", 3)).toBe(3);
  });
});
