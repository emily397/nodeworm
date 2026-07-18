// Template resolution for flow step inputs. Placeholders reference the run
// context: {{trigger.<path>}} and {{steps.<stepId>.output.<path>}}. Pure.

const PLACEHOLDER = /\{\{\s*([\w.$-]+)\s*\}\}/g;
const WHOLE = /^\{\{\s*([\w.$-]+)\s*\}\}$/;

export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur)) {
      cur = cur[Number(part)];
    } else if (typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

// A template that is exactly one placeholder resolves to the RAW value (so JSON
// bodies can carry numbers/objects/arrays); anything else string-interpolates,
// with missing paths rendered as "".
export function renderValue(tpl: string, ctx: Record<string, unknown>): unknown {
  const whole = tpl.match(WHOLE);
  if (whole) return getPath(ctx, whole[1]);
  return tpl.replace(PLACEHOLDER, (_, path: string) => {
    const v = getPath(ctx, path);
    if (v === null || v === undefined) return "";
    return typeof v === "object" ? JSON.stringify(v) : String(v);
  });
}

function renderDeep(node: unknown, ctx: Record<string, unknown>): unknown {
  if (typeof node === "string") return renderValue(node, ctx);
  if (Array.isArray(node)) return node.map((n) => renderDeep(n, ctx));
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) out[k] = renderDeep(v, ctx);
    return out;
  }
  return node;
}

// Parse a JSON template (placeholders live inside string values) and render it.
// Empty template -> undefined. Invalid JSON throws; the executor reports it as
// an honest step failure.
export function renderJson(tplText: string, ctx: Record<string, unknown>): unknown {
  const t = tplText.trim();
  if (!t) return undefined;
  return renderDeep(JSON.parse(t), ctx);
}
