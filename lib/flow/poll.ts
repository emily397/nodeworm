// Polling-trigger dedupe: fold a fetched payload against the flow's seen-id
// set. First poll primes without firing (no flood of historical records);
// later polls fire once per genuinely new item. Pure.

import { getPath } from "./template";

export const SEEN_CAP = 500;

export interface PollDiff {
  newItems: unknown[];
  seen: string[];
}

export function diffNewItems(payload: unknown, itemsPath: string, idPath: string, seen: string[] | undefined): PollDiff {
  const list = itemsPath ? getPath(payload, itemsPath) : payload;
  if (!Array.isArray(list)) return { newItems: [], seen: seen ?? [] };

  const ids: string[] = [];
  const withIds: Array<{ id: string; item: unknown }> = [];
  for (const item of list) {
    const raw = idPath ? getPath(item, idPath) : undefined;
    if (raw === undefined || raw === null || typeof raw === "object") continue;
    const id = String(raw);
    ids.push(id);
    withIds.push({ id, item });
  }

  // No prior set: prime with everything currently visible, fire nothing.
  if (seen === undefined) return { newItems: [], seen: ids.slice(0, SEEN_CAP) };

  const known = new Set(seen);
  const newItems = withIds.filter((w) => !known.has(w.id)).map((w) => w.item);
  const merged = [...ids, ...seen.filter((s) => !ids.includes(s))].slice(0, SEEN_CAP);
  return { newItems, seen: merged };
}
