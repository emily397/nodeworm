import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// Force the file-store fallback: this test must never touch a real database.
delete process.env.DATABASE_URL;
const { persistentCache } = await import("./store");

const CACHE_FILE = path.join(process.cwd(), ".data", "cache.json");

describe("persistentCache (file fallback)", () => {
  it("round-trips a value with its absolute expiry", async () => {
    const expires = Date.now() + 60_000;
    await persistentCache.set("t:roundtrip", { n: 1 }, expires);
    expect(await persistentCache.get("t:roundtrip")).toEqual({ value: { n: 1 }, expires });
  });

  it("survives outside process memory (row is on disk)", async () => {
    const expires = Date.now() + 60_000;
    await persistentCache.set("t:durable", "v", expires);
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    expect(raw["t:durable"]).toEqual({ value: "v", expires });
  });

  it("prunes expired rows on write", async () => {
    await persistentCache.set("t:stale", "old", Date.now() - 1);
    await persistentCache.set("t:fresh", "new", Date.now() + 60_000);
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    expect(raw["t:stale"]).toBeUndefined();
    expect(raw["t:fresh"]).toBeDefined();
  });

  it("misses on unknown keys", async () => {
    expect(await persistentCache.get("t:nope")).toBeUndefined();
  });
});
