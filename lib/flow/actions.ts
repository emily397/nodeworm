// Maps real discovered operations (captured traffic / the app's own OpenAPI /
// APIs.guru) into picker-ready actions for the flow builder: pick one and the
// http step is prefilled with the genuine method, URL and a body skeleton from
// observed payload keys. Pure.

import type { OpenApiOp } from "../engine/types";

export interface FlowAction {
  name: string;
  method: string;
  path: string;
  url?: string;
  summary?: string;
  bodyTemplate?: string;
  // Set when the action's API takes a form-encoded body rather than JSON.
  encoding?: "json" | "form";
}

function join(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export function toActions(ops: OpenApiOp[], apiBase?: string): FlowAction[] {
  return ops.map((o) => ({
    name: o.name,
    method: o.method.toUpperCase(),
    path: o.path,
    url: apiBase ? join(apiBase, o.path) : undefined,
    summary: o.summary,
    bodyTemplate: o.bodyKeys?.length ? JSON.stringify(Object.fromEntries(o.bodyKeys.map((k) => [k, ""]))) : undefined,
  }));
}
