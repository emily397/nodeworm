// Bridge planner: NodeWorm's actual goal is connecting one app to another. Each
// side is a fully-run Integration (its own discovery, live probe, genuine-OAuth
// plan, wire), so this layer is pure synthesis over the two finished endpoints:
// it picks the flow direction, maps entities and fields across the pair, and
// produces the cross-app report. No I/O here; the per-app pipeline already did
// the network work. OAuth-only honesty carries over: a side with no genuine
// OAuth path, or a pair where neither side is writable, yields an honest block.

import type {
  BridgeDirection,
  BridgeFlow,
  BridgeMapping,
  BridgeReport,
  BridgeStatus,
  BridgeTrigger,
  FieldMap,
  InboundMethod,
  Integration,
  NextStep,
  TelemetryLine,
} from "./types";

function entitiesOf(it: Integration): string[] {
  const e = it.discovery?.entities ?? [];
  return e.length ? e : ["Record"];
}

function canWrite(it: Integration): boolean {
  const writable = (it.wire?.outboundTools ?? []).some((t) => t.method !== "GET");
  return writable && it.plan?.path !== "no-path";
}

function inboundOf(it: Integration): InboundMethod {
  if (it.discovery?.hasWebhooks) return "webhooks";
  const m = it.wire?.inboundMethod;
  return m && m !== "none" ? m : "polling";
}

// A side that exposes no genuine OAuth path cannot anchor a real bridge: NodeWorm
// connects only over OAuth, never a pasted key.
function oauthBlock(it: Integration): string | null {
  return it.plan?.path === "no-path" ? `${it.appName} exposes no genuine OAuth path` : null;
}

const STD_FIELDS: FieldMap[] = [
  { source: "id", target: "external_id" },
  { source: "title", target: "title" },
  { source: "status", target: "status" },
  { source: "updated_at", target: "synced_at" },
];

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "").replace(/s$/, "");
}

// Pair each App-A entity with the closest App-B entity: exact normalised-name
// match first, then the next unused B entity so every pair is distinct.
function pairEntities(aEnts: string[], bEnts: string[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  const used = new Set<number>();
  for (const a of aEnts) {
    let bi = bEnts.findIndex((b, i) => !used.has(i) && norm(a) === norm(b));
    if (bi < 0) bi = bEnts.findIndex((_, i) => !used.has(i));
    if (bi < 0) bi = 0;
    used.add(bi);
    pairs.push([a, bEnts[bi]]);
  }
  return pairs.slice(0, 4);
}

export function planBridge(a: Integration, b: Integration): BridgeFlow {
  const aW = canWrite(a);
  const bW = canWrite(b);
  const direction: BridgeDirection = aW && bW ? "bidirectional" : bW ? "a-to-b" : aW ? "b-to-a" : "none";

  const pairs = pairEntities(entitiesOf(a), entitiesOf(b));
  const mappings: BridgeMapping[] = pairs.map(([ae, be]) => ({
    fromEntity: `${a.appName}.${ae}`,
    toEntity: `${b.appName}.${be}`,
    fields: STD_FIELDS,
  }));

  const [ae0, be0] = pairs[0] ?? ["Record", "Record"];
  const triggers: BridgeTrigger[] = [];
  if (direction === "a-to-b" || direction === "bidirectional") {
    triggers.push({
      direction: "a-to-b",
      when: `a ${ae0} is created or updated in ${a.appName}`,
      then: `create or update the matching ${be0} in ${b.appName}`,
      via: inboundOf(a),
    });
  }
  if (direction === "b-to-a" || direction === "bidirectional") {
    triggers.push({
      direction: "b-to-a",
      when: `a ${be0} is created or updated in ${b.appName}`,
      then: `create or update the matching ${ae0} in ${a.appName}`,
      via: inboundOf(b),
    });
  }

  const telemetry: TelemetryLine[] = [
    { level: "scan", text: `bridge.plan(${a.appName} <-> ${b.appName})` },
    direction === "none"
      ? { level: "warn", text: `Neither side exposes a writable connector. No bridge direction available.` }
      : { level: "ok", text: `Direction: ${direction.replace(/-/g, " ")}. ${mappings.length} entity pair(s) mapped.` },
    direction === "none"
      ? { level: "warn", text: `Blocked: a bridge needs at least one writable, OAuth-reachable side.` }
      : { level: "action", text: `Connector: Cloudflare Worker + Queue (listens on source, acts on target).` },
  ];

  return {
    direction,
    triggers,
    mappings,
    connector: { framework: "Cloudflare Worker + Queue", deployTarget: "Cloudflare Workers" },
    notes: [],
    telemetry,
  };
}

export function bridgeReport(a: Integration, b: Integration, flow: BridgeFlow): BridgeReport {
  const arrow = flow.direction === "bidirectional" ? "<->" : flow.direction === "b-to-a" ? "<-" : "->";
  const aConnected = a.secrets.length > 0;
  const bConnected = b.secrets.length > 0;
  const blocks = [oauthBlock(a), oauthBlock(b)].filter(Boolean) as string[];

  let status: BridgeStatus;
  if (flow.direction === "none" || blocks.length) status = "blocked";
  else if (aConnected && bConnected) status = "connected";
  else status = "needs-credentials";

  const capabilities: string[] = [];
  const nextSteps: NextStep[] = [];

  if (status === "blocked") {
    const reason =
      flow.direction === "none"
        ? `Neither ${a.appName} nor ${b.appName} exposes a writable connector, so there is nothing to bridge between them.`
        : `${blocks.join(" and ")}. NodeWorm bridges only over genuine OAuth, so this pair cannot be wired until that side exposes an OAuth flow.`;
    nextSteps.push({ kind: "info", label: "Blocked: no bridgeable path", detail: reason });
  } else {
    for (const t of flow.triggers) {
      capabilities.push(`When ${t.when}, NodeWorm will ${t.then} (via ${t.via}).`);
    }
    capabilities.push(
      `Field-mapped across ${flow.mappings.length} entity pair(s): ${flow.mappings.map((m) => `${m.fromEntity} ${arrow} ${m.toEntity}`).slice(0, 3).join(", ")}.`,
    );
    capabilities.push("Both sides connect via genuine OAuth 2.0; NodeWorm holds masked tokens, never an API key.");

    const pending = [
      { it: a, connected: aConnected },
      { it: b, connected: bConnected },
    ].filter((x) => !x.connected);
    for (const p of pending) {
      nextSteps.push({
        kind: "oauth",
        label: `Authorize ${p.it.appName}`,
        detail: `Run the genuine OAuth consent for ${p.it.appName}. NodeWorm stores the returned tokens masked, never an API key.`,
        url: `/run/${p.it.id}`,
      });
    }
    nextSteps.push({
      kind: "info",
      label: "Deploy the bridge connector",
      detail: `${flow.connector.framework} on ${flow.connector.deployTarget}: it listens on the source, maps the payload, and acts on the target.`,
    });
  }

  const warnings = [...new Set([...(a.report?.warnings ?? []), ...(b.report?.warnings ?? [])])].slice(0, 5);

  const pendingCount = [aConnected, bConnected].filter((c) => !c).length;
  const headline =
    status === "blocked"
      ? `${a.appName} ${arrow} ${b.appName} cannot be bridged yet.`
      : status === "connected"
        ? `${a.appName} ${arrow} ${b.appName} is wired and ready.`
        : `${a.appName} ${arrow} ${b.appName} is planned. ${pendingCount} consent${pendingCount === 1 ? "" : "s"} from you to go live.`;

  const summary =
    status === "blocked"
      ? `No genuine bridge path is available for this pair.`
      : `${flow.direction === "bidirectional" ? "Two-way" : "One-way"} sync across ${flow.mappings.length} entity pair(s), over genuine OAuth on both sides. ${flow.connector.framework}.`;

  return { status, headline, summary, capabilities, nextSteps, warnings };
}

export function buildBridge(a: Integration, b: Integration): { flow: BridgeFlow; report: BridgeReport; status: BridgeStatus } {
  const flow = planBridge(a, b);
  const report = bridgeReport(a, b, flow);
  return { flow, report, status: report.status };
}
