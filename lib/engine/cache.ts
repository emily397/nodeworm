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
