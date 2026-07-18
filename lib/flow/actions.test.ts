import { describe, expect, it } from "vitest";
import type { OpenApiOp } from "../engine/types";
import { toActions } from "./actions";

const ops: OpenApiOp[] = [
  { method: "post", path: "/v1/messages", name: "create_message", summary: "Send a message", bodyKeys: ["channel", "text"] },
  { method: "get", path: "/v1/users/{id}", name: "get_user" },
];

describe("toActions", () => {
  it("maps ops to picker actions with absolute urls and a body skeleton from observed keys", () => {
    const a = toActions(ops, "https://api.x.com");
    expect(a).toHaveLength(2);
    expect(a[0]).toMatchObject({ name: "create_message", method: "POST", url: "https://api.x.com/v1/messages" });
    expect(JSON.parse(a[0].bodyTemplate!)).toEqual({ channel: "", text: "" });
    expect(a[1].method).toBe("GET");
    expect(a[1].url).toBe("https://api.x.com/v1/users/{id}");
    expect(a[1].bodyTemplate).toBeUndefined();
  });

  it("keeps the path visible and omits urls when no api base is known", () => {
    const a = toActions(ops, undefined);
    expect(a[0].url).toBeUndefined();
    expect(a[0].path).toBe("/v1/messages");
  });

  it("joins base and path without duplicate slashes", () => {
    const a = toActions([{ method: "get", path: "/things", name: "list" }], "https://api.x.com/v2/");
    expect(a[0].url).toBe("https://api.x.com/v2/things");
  });
});
