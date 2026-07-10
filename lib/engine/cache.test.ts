import { describe, it, expect } from "vitest";
import { TtlCache, TieredCache, type CacheBackend } from "./cache";

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

function fakeBackend<T>() {
  const rows = new Map<string, { value: T; expires: number }>();
  let gets = 0;
  let sets = 0;
  const backend: CacheBackend<T> = {
    async get(key) {
      gets++;
      return rows.get(key);
    },
    async set(key, value, expires) {
      sets++;
      rows.set(key, { value, expires });
    },
  };
  return { backend, rows, counts: () => ({ gets, sets }) };
}

describe("TieredCache", () => {
  it("returns a memory hit without consulting the backend", async () => {
    const { backend, counts } = fakeBackend<number>();
    const c = new TieredCache<number>({ ttlMs: 1000, max: 10 }, backend);
    await c.set("a", 1, 0);
    expect(await c.get("a", 500)).toBe(1);
    expect(counts().gets).toBe(0);
  });

  it("set writes through to the backend with expiry = now + ttl", async () => {
    const { backend, rows } = fakeBackend<number>();
    const c = new TieredCache<number>({ ttlMs: 1000, max: 10 }, backend);
    await c.set("a", 1, 100);
    expect(rows.get("a")).toEqual({ value: 1, expires: 1100 });
  });

  it("falls back to a fresh backend row on memory miss and seeds memory", async () => {
    const { backend, rows, counts } = fakeBackend<number>();
    rows.set("a", { value: 7, expires: 1000 });
    const c = new TieredCache<number>({ ttlMs: 1000, max: 10 }, backend);
    expect(await c.get("a", 500)).toBe(7);
    expect(await c.get("a", 600)).toBe(7);
    expect(counts().gets).toBe(1); // second get served from memory
  });

  it("a memory entry seeded from the backend keeps the backend expiry", async () => {
    const { backend, rows } = fakeBackend<number>();
    rows.set("a", { value: 7, expires: 1000 });
    const c = new TieredCache<number>({ ttlMs: 10000, max: 10 }, backend);
    await c.get("a", 500);
    rows.delete("a");
    expect(await c.get("a", 1001)).toBeUndefined();
  });

  it("ignores an expired backend row", async () => {
    const { backend, rows } = fakeBackend<number>();
    rows.set("a", { value: 7, expires: 1000 });
    const c = new TieredCache<number>({ ttlMs: 1000, max: 10 }, backend);
    expect(await c.get("a", 1000)).toBeUndefined();
  });

  it("misses when both tiers are empty", async () => {
    const { backend } = fakeBackend<number>();
    const c = new TieredCache<number>({ ttlMs: 1000, max: 10 }, backend);
    expect(await c.get("nope", 0)).toBeUndefined();
  });

  it("a failing backend never breaks get or set", async () => {
    const backend: CacheBackend<number> = {
      async get() {
        throw new Error("db down");
      },
      async set() {
        throw new Error("db down");
      },
    };
    const c = new TieredCache<number>({ ttlMs: 1000, max: 10 }, backend);
    await expect(c.set("a", 1, 0)).resolves.toBeUndefined();
    expect(await c.get("a", 500)).toBe(1); // memory tier still works
    expect(await c.get("other", 0)).toBeUndefined();
  });
});
