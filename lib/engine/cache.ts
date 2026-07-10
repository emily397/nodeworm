// A tiny in-process TTL + LRU cache. Used to memoize expensive discovery (live
// probe + LLM research + registry lookups) per app so repeat requests are instant
// and free. Clones on read so a cached value can never be mutated by a caller.
// Serverless instances are ephemeral, so this helps within a warm instance and
// across close-in-time requests; a DB-backed cache would persist further.

export class TtlCache<T> {
  private readonly ttlMs: number;
  private readonly max: number;
  private readonly store = new Map<string, { value: T; expires: number }>();

  constructor(opts: { ttlMs: number; max: number }) {
    this.ttlMs = opts.ttlMs;
    this.max = Math.max(1, opts.max);
  }

  get(key: string, nowMs: number = Date.now()): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (nowMs >= hit.expires) {
      this.store.delete(key);
      return undefined;
    }
    // Refresh LRU order and hand back a clone.
    this.store.delete(key);
    this.store.set(key, hit);
    return clone(hit.value);
  }

  set(key: string, value: T, nowMs: number = Date.now()): void {
    this.store.delete(key);
    this.store.set(key, { value: clone(value), expires: nowMs + this.ttlMs });
    // Evict oldest (insertion/most-recently-used order) beyond max.
    while (this.store.size > this.max) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }
}

function clone<T>(v: T): T {
  return v == null || typeof v !== "object" ? v : (structuredClone(v) as T);
}

// Persistent second tier for a TieredCache. Backed by Neon (or the file store)
// so cache warmth survives serverless cold starts. Absolute expiry travels with
// the row; the backend never applies its own TTL policy.
export interface CacheBackend<T> {
  get(key: string): Promise<{ value: T; expires: number } | undefined>;
  set(key: string, value: T, expires: number): Promise<void>;
}

// Memory-first cache with a persistent read-through/write-through second tier.
// The backend is best-effort: a down DB degrades to plain in-memory caching,
// it can never break the caller.
export class TieredCache<T> {
  private readonly memory: TtlCache<T>;
  private readonly ttlMs: number;
  private readonly backend: CacheBackend<T>;

  constructor(opts: { ttlMs: number; max: number }, backend: CacheBackend<T>) {
    this.memory = new TtlCache<T>(opts);
    this.ttlMs = opts.ttlMs;
    this.backend = backend;
  }

  async get(key: string, nowMs: number = Date.now()): Promise<T | undefined> {
    const hot = this.memory.get(key, nowMs);
    if (hot !== undefined) return hot;
    const row = await this.backend.get(key).catch(() => undefined);
    if (!row || nowMs >= row.expires) return undefined;
    // Seed memory preserving the row's absolute expiry: TtlCache computes
    // expires = nowMs + ttlMs, so shift nowMs back to land exactly on it.
    this.memory.set(key, row.value, row.expires - this.ttlMs);
    return row.value;
  }

  async set(key: string, value: T, nowMs: number = Date.now()): Promise<void> {
    this.memory.set(key, value, nowMs);
    await this.backend.set(key, value, nowMs + this.ttlMs).catch(() => {});
  }
}
