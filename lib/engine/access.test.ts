import { describe, expect, it } from "vitest";
import { canAccess, visibleList } from "./access";

const mine = { userId: "u1" };
const theirs = { userId: "u2" };
const sharedIn = { userId: "u2", workspaceId: "w1" };
const sharedOut = { userId: "u2", workspaceId: "w9" };
const anon = {};

describe("canAccess (per-record guard)", () => {
  it("keeps the existing rules: anonymous records pass, own records pass, others' are blocked", () => {
    expect(canAccess(anon, "u1", [])).toBe(true);
    expect(canAccess(mine, "u1", [])).toBe(true);
    expect(canAccess(theirs, "u1", [])).toBe(false);
  });

  it("grants access to another user's record when it is shared into one of my workspaces", () => {
    expect(canAccess(sharedIn, "u1", ["w1"])).toBe(true);
    expect(canAccess(sharedOut, "u1", ["w1"])).toBe(false);
  });

  it("never grants workspace access to a signed-out request, even with a stale member list", () => {
    expect(canAccess(sharedIn, undefined, ["w1"])).toBe(false);
    expect(canAccess(sharedIn, undefined, [])).toBe(false);
  });
});

describe("visibleList", () => {
  const all = [mine, theirs, sharedIn, sharedOut, anon];

  it("signed-in: own records plus workspace-shared ones, never others' or anonymous", () => {
    expect(visibleList(all, "u1", ["w1"])).toEqual([mine, sharedIn]);
  });

  it("signed-out: anonymous records only (single-tenant mode unchanged)", () => {
    expect(visibleList(all, undefined, [])).toEqual([anon]);
  });
});
