import { describe, expect, it } from "vitest";
import { diffNewItems, SEEN_CAP } from "./poll";

const payload = { data: [{ id: 1, t: "a" }, { id: 2, t: "b" }, { id: 3, t: "c" }] };

describe("diffNewItems", () => {
  it("primes without firing on the first poll (no prior seen set)", () => {
    const r = diffNewItems(payload, "data", "id", undefined);
    expect(r.newItems).toEqual([]);
    expect(r.seen).toEqual(["1", "2", "3"]);
  });

  it("returns only unseen items afterwards, newest seen kept", () => {
    const r = diffNewItems(payload, "data", "id", ["1", "2"]);
    expect(r.newItems).toEqual([{ id: 3, t: "c" }]);
    expect(r.seen).toContain("3");
    expect(r.seen).toContain("1");
  });

  it("treats the payload itself as the list when itemsPath is empty and it is an array", () => {
    const r = diffNewItems([{ id: "x" }], "", "id", []);
    expect(r.newItems).toEqual([{ id: "x" }]);
  });

  it("skips items without an id and reports nothing for a non-array", () => {
    expect(diffNewItems({ data: [{ noid: 1 }] }, "data", "id", []).newItems).toEqual([]);
    expect(diffNewItems({ data: "nope" }, "data", "id", []).newItems).toEqual([]);
  });

  it("bounds the seen set", () => {
    const many = { data: Array.from({ length: SEEN_CAP + 50 }, (_, i) => ({ id: i })) };
    const r = diffNewItems(many, "data", "id", []);
    expect(r.seen.length).toBeLessThanOrEqual(SEEN_CAP);
  });
});
