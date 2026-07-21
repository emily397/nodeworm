"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { timeAgo } from "@/app/components/status";
import type { Integration } from "@/lib/engine/types";
import type { FlowAction } from "@/lib/flow/actions";
import type { McpTool } from "@/lib/flow/mcp";
import type { ConditionOp, Flow, FlowBranch, FlowCondition, FlowRun, FlowStep, FlowStepType, FlowTriggerType } from "@/lib/flow/types";
import { ADVANCED_STEP_TYPES, PRIMARY_STEP_TYPES, RUN_COLORS, STEP_BLURBS, STEP_COLORS, STEP_LABELS, TRIGGER_LABEL } from "../meta";

const BRANCH_STEP_TYPES: FlowStepType[] = ["http", "ai", "filter", "webhook-out"];
const OPS: ConditionOp[] = ["eq", "neq", "contains", "exists", "gt", "lt"];

// Per-connection action catalog (real discovered operations + live MCP tools).
export interface Catalog {
  actions: FlowAction[];
  mcpTools: McpTool[];
  source: string;
}

const CATALOG_SOURCE_LABEL: Record<string, string> = {
  har: "from captured traffic",
  probe: "from the app's own OpenAPI",
  "apis.guru": "from the APIs.guru directory",
  none: "no discovered operations",
};

let stepSeq = 0;
function freshStep(type: FlowStepType): FlowStep {
  stepSeq += 1;
  return {
    id: `s${Date.now().toString(36)}${stepSeq}`,
    type,
    name: STEP_LABELS[type],
    method: type === "http" || type === "connector" || type === "webhook-out" ? "POST" : undefined,
    condition: type === "filter" ? { left: "", op: "exists" } : undefined,
    branches:
      type === "branch"
        ? [
            { id: `b${Date.now().toString(36)}a`, name: "when...", condition: { left: "", op: "eq", right: "" }, steps: [] },
            { id: `b${Date.now().toString(36)}b`, name: "otherwise", steps: [] },
          ]
        : undefined,
  };
}

const inputStyle: React.CSSProperties = {
  background: "var(--color-paper-2)",
  border: "1px solid var(--color-line-2)",
  color: "var(--color-ink)",
};

// Plain-language account status. Hides the engine's internal state names.
const LIVE_STATUSES = new Set(["connected", "connected-via-session", "connected-via-connector", "needs-verification"]);
function connLabel(status: string): string {
  if (LIVE_STATUSES.has(status)) return "connected";
  if (status === "running" || status === "planned" || status === "draft") return "being set up";
  return "needs sign-in";
}
function connReady(status: string): boolean {
  return LIVE_STATUSES.has(status);
}

// Build the account options for a step: the relevant app's accounts first, ready
// ones ahead of the rest, and a deduped display so the giant test-data list stops
// being a wall. When the step targets a specific app we show only that app's
// accounts (with a "show every account" escape hatch handled by the caller).
function connectionOptionsFor(connections: Integration[], appName: string | undefined, showAll: boolean): React.ReactNode {
  const want = appName?.trim().toLowerCase();
  let list = connections;
  if (want && !showAll) list = connections.filter((c) => c.appName.trim().toLowerCase() === want);
  const seen = new Set<string>();
  const sorted = [...list].sort((a, b) => {
    const am = want && a.appName.toLowerCase() === want ? 0 : 1;
    const bm = want && b.appName.toLowerCase() === want ? 0 : 1;
    if (am !== bm) return am - bm;
    return Number(connReady(b.status)) - Number(connReady(a.status));
  });
  return sorted
    .filter((c) => {
      const key = `${c.appName.toLowerCase()}|${connLabel(c.status)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((c) => (
      <option key={c.id} value={c.id}>
        {`${c.appName} (${connLabel(c.status)})`}
      </option>
    ));
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="font-mono text-[0.62rem] uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function FlowBuilder({ initial, initialRuns }: { initial: Flow; initialRuns: FlowRun[] }) {
  const router = useRouter();
  const [flow, setFlow] = useState(initial);
  const [runs, setRuns] = useState(initialRuns);
  const [connections, setConnections] = useState<Integration[]>([]);
  const [hookUrl, setHookUrl] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [testPayload, setTestPayload] = useState('{\n  "example": "value"\n}');
  const [copied, setCopied] = useState(false);
  const [catalogs, setCatalogs] = useState<Record<string, Catalog>>({});
  const [reg, setReg] = useState<{
    mode: "curated" | "discovered" | "none";
    params: Array<{ key: string; label: string; example: string }>;
    detail: string;
    registration: NonNullable<Flow["trigger"]["registration"]> | null;
  } | null>(null);
  const [regParams, setRegParams] = useState<Record<string, string>>({});
  const [regBusy, setRegBusy] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [showAdvancedSteps, setShowAdvancedSteps] = useState(false);
  const [ws, setWs] = useState<{ signedIn?: boolean; userId?: string; workspaces: Array<{ id: string; name: string }> } | null>(null);

  useEffect(() => {
    fetch("/api/workspaces")
      .then((r) => r.json())
      .then((d) => setWs(d.available ? d : null))
      .catch(() => {});
  }, []);

  async function shareTo(workspaceId: string) {
    const d = await fetch(`/api/flows/${initial.id}/share`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId: workspaceId || null }),
    })
      .then((r) => r.json())
      .catch(() => null);
    if (d?.flow) setFlow((f) => ({ ...f, workspaceId: d.flow.workspaceId }));
  }

  useEffect(() => {
    fetch("/api/integrations")
      .then((r) => r.json())
      .then((d) => setConnections(d.integrations ?? []))
      .catch(() => {});
    fetch(`/api/flows/${initial.id}`)
      .then((r) => r.json())
      .then((d) => setHookUrl(d.hookUrl ?? null))
      .catch(() => {});
  }, [initial.id]);

  // Probe how this webhook could be auto-registered in the source app.
  useEffect(() => {
    if (flow.trigger.type !== "webhook" || !flow.trigger.integrationId) {
      setReg(null);
      return;
    }
    fetch(`/api/flows/${initial.id}/register-hook`)
      .then((r) => r.json())
      .then((d) => setReg(d.mode ? d : null))
      .catch(() => setReg(null));
  }, [initial.id, flow.trigger.type, flow.trigger.integrationId]);

  async function registerHook() {
    if (regBusy) return;
    setRegBusy(true);
    setRegError(null);
    try {
      const d = await fetch(`/api/flows/${initial.id}/register-hook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ params: regParams }),
      }).then((r) => r.json());
      if (d.registration) setReg((p) => (p ? { ...p, registration: d.registration } : p));
      else if (d.error) setRegError(d.error);
    } catch {
      setRegError("registration attempt failed to send");
    }
    setRegBusy(false);
  }

  async function unregisterHook() {
    if (regBusy) return;
    setRegBusy(true);
    await fetch(`/api/flows/${initial.id}/register-hook`, { method: "DELETE" }).catch(() => {});
    setReg((p) => (p ? { ...p, registration: null } : p));
    setRegBusy(false);
  }

  // Lazily fetch the action catalog for every connection any step references.
  useEffect(() => {
    const all = flow.steps.flatMap((s) => [s, ...(s.branches?.flatMap((b) => b.steps) ?? [])]);
    const wanted = new Set(all.map((s) => s.integrationId).filter(Boolean) as string[]);
    for (const id of wanted) {
      if (catalogs[id]) continue;
      setCatalogs((c) => ({ ...c, [id]: { actions: [], mcpTools: [], source: "loading" } }));
      fetch(`/api/integrations/${id}/actions`)
        .then((r) => r.json())
        .then((d) => setCatalogs((c) => ({ ...c, [id]: { actions: d.actions ?? [], mcpTools: d.mcpTools ?? [], source: d.source ?? "none" } })))
        .catch(() => setCatalogs((c) => ({ ...c, [id]: { actions: [], mcpTools: [], source: "none" } })));
    }
  }, [flow.steps, catalogs]);

  function patch(p: Partial<Flow>) {
    setFlow((f) => ({ ...f, ...p }));
    setDirty(true);
  }

  function patchStep(id: string, p: Partial<FlowStep>) {
    setFlow((f) => ({ ...f, steps: f.steps.map((s) => (s.id === id ? { ...s, ...p } : s)) }));
    setDirty(true);
  }

  function moveStep(id: string, dir: -1 | 1) {
    setFlow((f) => {
      const i = f.steps.findIndex((s) => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= f.steps.length) return f;
      const steps = [...f.steps];
      [steps[i], steps[j]] = [steps[j], steps[i]];
      return { ...f, steps };
    });
    setDirty(true);
  }

  async function save(): Promise<Flow | null> {
    setSaving(true);
    try {
      const data = await fetch(`/api/flows/${flow.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: flow.name, description: flow.description, enabled: flow.enabled, trigger: flow.trigger, steps: flow.steps }),
      }).then((r) => r.json());
      if (data.flow) {
        setFlow(data.flow);
        setDirty(false);
        return data.flow;
      }
    } catch {
      // keep dirty state; the button stays honest
    } finally {
      setSaving(false);
    }
    return null;
  }

  async function runNow() {
    if (running) return;
    setRunning(true);
    if (dirty) await save();
    let payload: unknown = {};
    try {
      payload = JSON.parse(testPayload);
    } catch {
      // free text becomes {text}
      payload = { text: testPayload };
    }
    try {
      const data = await fetch(`/api/flows/${flow.id}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload }),
      }).then((r) => r.json());
      if (data.run) setRuns((prev) => [data.run, ...prev].slice(0, 20));
    } catch {
      // the runs list stays as-is; nothing fabricated
    }
    setRunning(false);
  }

  async function remove() {
    await fetch(`/api/flows/${flow.id}`, { method: "DELETE" }).catch(() => {});
    router.push("/flows");
  }

  async function copyHook() {
    if (!hookUrl) return;
    await navigator.clipboard.writeText(hookUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  // Options for the trigger's poll/webhook account picker (filtered to the app).
  const triggerConnOptions = useMemo(
    () => connectionOptionsFor(connections, flow.trigger.appName, false),
    [connections, flow.trigger.appName],
  );

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-8">
      <div>
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <Link href="/flows" className="text-xs" style={{ color: "var(--color-muted)" }}>
            ← All automations
          </Link>
          <span className="chip">
            <span className="dot" style={{ background: flow.enabled ? "var(--color-live)" : "var(--color-amber)" }} />
            {flow.enabled ? "on" : "off"}
          </span>
          {flow.draftedBy === "ai" && <span className="chip">written by AI</span>}
        </div>

        <input
          value={flow.name}
          onChange={(e) => patch({ name: e.target.value })}
          className="w-full bg-transparent outline-none font-display font-extrabold text-[clamp(1.6rem,4vw,2.4rem)] leading-tight mb-1"
          style={{ color: "var(--color-ink)" }}
          aria-label="Automation name"
        />
        {flow.description && (
          <p className="text-sm mb-4" style={{ color: "var(--color-muted)" }}>
            &ldquo;{flow.description}&rdquo;
          </p>
        )}

        {flow.needsConnections && flow.needsConnections.length > 0 && (
          <div
            className="rounded-xl px-4 py-3 mb-5 text-sm"
            style={{ border: "1px solid color-mix(in srgb, var(--color-amber) 50%, transparent)", color: "var(--color-ink-soft)" }}
          >
            First connect {flow.needsConnections.join(" and ")} so this can run.{" "}
            <Link href="/integrations" className="underline decoration-dotted font-semibold" style={{ color: "var(--color-signal)" }}>
              Connect an app
            </Link>
            , then choose the account on each step below.
          </div>
        )}

        {/* Trigger */}
        <div className="card-pop p-5 mb-1 relative">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5">
              <span className="dot" style={{ width: 12, height: 12, background: "var(--color-teal)" }} />
              <span className="font-display font-bold">When should this run?</span>
              {flow.trigger.appName && (
                <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                  {flow.trigger.appName}: {flow.trigger.event}
                </span>
              )}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {(["webhook", "poll", "schedule", "manual"] as FlowTriggerType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => patch({ trigger: { ...flow.trigger, type: t } })}
                  className="text-xs px-2.5 py-1.5 rounded-lg transition-colors"
                  style={{
                    border: `1px solid ${flow.trigger.type === t ? "var(--color-teal)" : "var(--color-line)"}`,
                    color: flow.trigger.type === t ? "var(--color-teal)" : "var(--color-muted)",
                    background: flow.trigger.type === t ? "color-mix(in srgb, var(--color-teal) 8%, transparent)" : "transparent",
                  }}
                >
                  {TRIGGER_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          {flow.trigger.type === "webhook" && (
            <div className="flex flex-wrap items-center gap-2">
              <p className="w-full text-sm" style={{ color: "var(--color-ink-soft)" }}>
                {flow.trigger.appName ?? "The app"} tells NodeWorm the moment this happens. Press the button below and NodeWorm
                sets that up for you.
              </p>
              <details className="w-full">
                <summary className="text-xs cursor-pointer" style={{ color: "var(--color-muted)" }}>
                  Set it up manually instead
                </summary>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <code
                    className="flex-1 min-w-[220px] truncate font-mono text-[0.7rem] rounded-lg px-3 py-2"
                    style={{ background: "var(--color-paper-2)", border: "1px solid var(--color-line)", color: "var(--color-ink-soft)" }}
                  >
                    {hookUrl ?? "loading..."}
                  </code>
                  <button onClick={copyHook} className="btn btn-ghost text-xs" disabled={!hookUrl}>
                    {copied ? "copied" : "copy"}
                  </button>
                  <span className="w-full text-[0.7rem]" style={{ color: "var(--color-muted)" }}>
                    Paste this web address into {flow.trigger.appName ?? "the app"}&apos;s webhook settings. NodeWorm confirms it automatically.
                  </span>
                </div>
              </details>
              {reg && reg.mode !== "none" && (
                <div className="w-full rounded-xl px-3 py-2.5 space-y-2" style={{ border: "1px dashed var(--color-line-2)" }}>
                  {reg.registration?.state === "registered" ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="chip">
                        <span className="dot" style={{ background: "var(--color-live)" }} />
                        set up automatically
                      </span>
                      <span className="text-xs flex-1" style={{ color: "var(--color-muted)" }}>
                        NodeWorm is now listening for events from {flow.trigger.appName ?? "the app"}.
                      </span>
                      <button onClick={unregisterHook} disabled={regBusy} className="text-xs px-2 py-1 rounded-lg" style={{ color: "var(--color-muted)", border: "1px solid var(--color-line)" }}>
                        undo
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      {reg.params.map((p) => (
                        <input
                          key={p.key}
                          value={regParams[p.key] ?? ""}
                          onChange={(e) => setRegParams((v) => ({ ...v, [p.key]: e.target.value }))}
                          placeholder={`${p.label} (example: ${p.example})`}
                          className="flex-1 min-w-[160px] rounded-lg px-3 py-2 text-sm outline-none"
                          style={inputStyle}
                        />
                      ))}
                      <button onClick={registerHook} disabled={regBusy} className="btn btn-signal text-xs whitespace-nowrap">
                        {regBusy ? "setting up..." : `Set this up in ${flow.trigger.appName ?? "the app"} for me`}
                      </button>
                      {reg.registration?.state === "failed" && (
                        <span className="w-full text-[0.7rem]" style={{ color: "var(--color-blocked)" }}>
                          That did not work: {reg.registration.detail}. You can set it up manually above.
                        </span>
                      )}
                      {regError && (
                        <span className="w-full text-[0.7rem]" style={{ color: "var(--color-blocked)" }}>
                          {regError}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {flow.trigger.type === "schedule" && (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm" style={{ color: "var(--color-ink-soft)" }}>
                Run this every
              </span>
              <input
                type="number"
                min={5}
                value={flow.trigger.scheduleMins ?? 60}
                onChange={(e) => patch({ trigger: { ...flow.trigger, scheduleMins: Number(e.target.value) } })}
                className="w-24 rounded-lg px-3 py-2 text-sm outline-none"
                style={inputStyle}
              />
              <span className="text-sm" style={{ color: "var(--color-ink-soft)" }}>
                minutes (5 minimum)
              </span>
            </div>
          )}

          {flow.trigger.type === "poll" && (
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="check it using which account (optional)">
                <select
                  value={flow.trigger.integrationId ?? ""}
                  onChange={(e) => patch({ trigger: { ...flow.trigger, integrationId: e.target.value || undefined } })}
                  className="w-full rounded-lg px-3 py-2 font-mono text-xs outline-none"
                  style={inputStyle}
                >
                  <option value="">no sign-in needed</option>
                  {triggerConnOptions}
                </select>
              </Field>
              <Field label="web address to check">
                <input
                  value={flow.trigger.url ?? ""}
                  onChange={(e) => patch({ trigger: { ...flow.trigger, url: e.target.value } })}
                  placeholder="https://example.com/orders"
                  className="w-full rounded-lg px-3 py-2 font-mono text-xs outline-none"
                  style={inputStyle}
                />
              </Field>
              <div className="grid grid-cols-3 gap-3 sm:col-span-2">
                <Field label="check every (mins)">
                  <input
                    type="number"
                    min={5}
                    value={flow.trigger.scheduleMins ?? 15}
                    onChange={(e) => patch({ trigger: { ...flow.trigger, scheduleMins: Number(e.target.value) } })}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                    style={inputStyle}
                  />
                </Field>
                <details className="col-span-2 self-center">
                  <summary className="text-xs cursor-pointer" style={{ color: "var(--color-muted)" }}>
                    Advanced: where the list lives
                  </summary>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <input
                      value={flow.trigger.itemsPath ?? ""}
                      onChange={(e) => patch({ trigger: { ...flow.trigger, itemsPath: e.target.value } })}
                      placeholder="list field (blank = whole reply)"
                      className="w-full rounded-lg px-3 py-2 font-mono text-xs outline-none"
                      style={inputStyle}
                    />
                    <input
                      value={flow.trigger.idPath ?? "id"}
                      onChange={(e) => patch({ trigger: { ...flow.trigger, idPath: e.target.value } })}
                      placeholder="id field"
                      className="w-full rounded-lg px-3 py-2 font-mono text-xs outline-none"
                      style={inputStyle}
                    />
                  </div>
                </details>
              </div>
              <p className="sm:col-span-2 text-xs" style={{ color: "var(--color-muted)" }}>
                NodeWorm checks on a timer and runs this once for each new thing it finds. It ignores what was already there the first time, so you don&apos;t get flooded.
                {flow.pollState?.lastDetail ? ` Last check: ${flow.pollState.lastDetail}.` : ""}
              </p>
            </div>
          )}

          {flow.trigger.type === "manual" && (
            <p className="font-mono text-xs" style={{ color: "var(--color-muted)" }}>
              Runs only when you press Run now.
            </p>
          )}
        </div>

        {/* Steps rail */}
        <div className="relative pl-6">
          <span
            className="absolute left-[11px] top-0 bottom-0 w-px"
            style={{ background: "linear-gradient(180deg, var(--color-teal), var(--color-signal), var(--color-berry))", opacity: 0.35 }}
          />
          {flow.steps.map((s, i) => (
            <div key={s.id} className="relative pt-4 rise" style={{ animationDelay: `${i * 50}ms` }}>
              <span
                className="absolute -left-6 top-[34px] dot"
                style={{ width: 13, height: 13, background: STEP_COLORS[s.type], border: "2px solid var(--color-card)" }}
              />
              <StepCard
                step={s}
                index={i}
                total={flow.steps.length}
                connections={connections}
                catalogs={catalogs}
                onChange={(p) => patchStep(s.id, p)}
                onMove={(d) => moveStep(s.id, d)}
                onRemove={() => {
                  setFlow((f) => ({ ...f, steps: f.steps.filter((x) => x.id !== s.id) }));
                  setDirty(true);
                }}
              />
            </div>
          ))}

          <div className="pt-4 pb-2">
            <div className="font-display font-bold text-sm mb-2" style={{ color: "var(--color-ink-soft)" }}>
              Then, add a step
            </div>
            <div className="flex flex-wrap gap-2">
              {PRIMARY_STEP_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setFlow((f) => ({ ...f, steps: [...f.steps, freshStep(t)] }));
                    setDirty(true);
                  }}
                  title={STEP_BLURBS[t]}
                  className="inline-flex items-center gap-2 text-sm px-3.5 py-2 rounded-lg transition-transform hover:-translate-y-0.5"
                  style={{ border: `1px solid color-mix(in srgb, ${STEP_COLORS[t]} 45%, transparent)`, color: "var(--color-ink-soft)" }}
                >
                  <span className="dot" style={{ width: 8, height: 8, background: STEP_COLORS[t] }} />
                  {STEP_LABELS[t]}
                </button>
              ))}
              {showAdvancedSteps ? (
                ADVANCED_STEP_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setFlow((f) => ({ ...f, steps: [...f.steps, freshStep(t)] }));
                      setDirty(true);
                    }}
                    title={STEP_BLURBS[t]}
                    className="inline-flex items-center gap-2 text-sm px-3.5 py-2 rounded-lg transition-transform hover:-translate-y-0.5"
                    style={{ border: `1px solid color-mix(in srgb, ${STEP_COLORS[t]} 45%, transparent)`, color: "var(--color-ink-soft)" }}
                  >
                    <span className="dot" style={{ width: 8, height: 8, background: STEP_COLORS[t] }} />
                    {STEP_LABELS[t]}
                  </button>
                ))
              ) : (
                <button onClick={() => setShowAdvancedSteps(true)} className="text-sm px-3.5 py-2 rounded-lg" style={{ color: "var(--color-muted)", border: "1px dashed var(--color-line-2)" }}>
                  More step types
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-6">
          <button onClick={save} disabled={!dirty || saving} className={`btn ${dirty ? "btn-signal" : "btn-ghost"}`}>
            {saving ? "saving..." : dirty ? "Save changes" : "Saved"}
          </button>
          <button
            onClick={() => patch({ enabled: !flow.enabled })}
            className="btn btn-ghost"
            title={flow.enabled ? "Pause: this automation stops running automatically" : "Turn it back on"}
          >
            {flow.enabled ? "Turn off" : "Turn on"}
          </button>
          {ws?.signedIn && ws.workspaces.length > 0 && flow.userId === ws.userId && (
            <select
              value={flow.workspaceId ?? ""}
              onChange={(e) => shareTo(e.target.value)}
              title="Share this automation with your team; members can view, edit and run it"
              className="rounded-lg px-3 py-2 text-sm outline-none"
              style={inputStyle}
            >
              <option value="">Just me</option>
              {ws.workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  Shared with {w.name}
                </option>
              ))}
            </select>
          )}
          <span className="flex-1" />
          <button onClick={remove} className="text-sm px-2.5 py-1.5 rounded-lg" style={{ color: "var(--color-blocked)", border: "1px solid var(--color-line)" }}>
            Delete
          </button>
        </div>
      </div>

      {/* Run panel */}
      <div className="space-y-5">
        <div className="card-pop p-5">
          <div className="font-display font-bold text-base mb-1">Try it out</div>
          <p className="text-xs mb-3" style={{ color: "var(--color-muted)" }}>
            Run it once with example data to see what happens, before it goes live.
          </p>
          <details>
            <summary className="text-xs cursor-pointer mb-2" style={{ color: "var(--color-muted)" }}>
              Example data (advanced)
            </summary>
            <textarea
              value={testPayload}
              onChange={(e) => setTestPayload(e.target.value)}
              rows={5}
              className="w-full rounded-lg px-3 py-2 font-mono text-xs outline-none resize-y"
              style={inputStyle}
            />
          </details>
          <button onClick={runNow} disabled={running || flow.steps.length === 0} className="btn btn-signal w-full mt-3">
            {running ? "running..." : "▶ Test run"}
          </button>
          {flow.steps.length === 0 && (
            <p className="text-[0.7rem] mt-2" style={{ color: "var(--color-muted)" }}>
              Add at least one step first.
            </p>
          )}
        </div>

        <div className="card p-5">
          <div className="font-display font-bold text-base mb-3">History</div>
          {runs.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--color-muted)" }}>
              Nothing has run yet. Press Test run above, or wait for the trigger.
            </p>
          ) : (
            <div className="space-y-3">
              {runs.map((r) => (
                <RunCard key={r.id} run={r} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StepCard({
  step,
  index,
  total,
  connections,
  catalogs,
  onChange,
  onMove,
  onRemove,
  insideBranch,
}: {
  step: FlowStep;
  index: number;
  total: number;
  connections: Integration[];
  catalogs: Record<string, Catalog>;
  onChange: (p: Partial<FlowStep>) => void;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
  insideBranch?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [showAllConns, setShowAllConns] = useState(false);
  const color = STEP_COLORS[step.type];
  const catalog = step.integrationId ? catalogs[step.integrationId] : undefined;
  const usesConnection = step.type === "http" || step.type === "connector" || step.type === "mcp";
  const usesBody = step.type === "http" || step.type === "connector" || step.type === "webhook-out";
  const isEffect = step.type !== "filter" && step.type !== "branch";

  const wantApp = step.appName?.trim().toLowerCase();
  const hasMatch = wantApp ? connections.some((c) => c.appName.trim().toLowerCase() === wantApp) : true;
  const connOptions = connectionOptionsFor(connections, step.appName, showAllConns || !hasMatch);

  function applyAction(name: string) {
    const a = catalog?.actions.find((x) => x.name === name);
    if (!a) return;
    onChange({ name: a.summary || a.name, method: a.method, url: a.url ?? step.url, body: a.bodyTemplate ?? step.body });
  }

  function patchBranch(bid: string, p: Partial<FlowBranch>) {
    onChange({ branches: (step.branches ?? []).map((b) => (b.id === bid ? { ...b, ...p } : b)) });
  }

  return (
    <div className={insideBranch ? "card p-3" : "card p-4"} style={{ borderColor: `color-mix(in srgb, ${color} 30%, var(--color-line))` }}>
      <div className="flex items-center gap-3">
        <span className="text-[0.66rem] px-2 py-0.5 rounded font-semibold" style={{ color, border: `1px solid color-mix(in srgb, ${color} 45%, transparent)` }}>
          {STEP_LABELS[step.type]}
        </span>
        <input
          value={step.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="flex-1 bg-transparent outline-none font-display font-bold text-[0.95rem]"
          style={{ color: "var(--color-ink)" }}
          aria-label="Step name"
        />
        <div className="flex items-center gap-1 text-sm" style={{ color: "var(--color-muted)" }}>
          <button onClick={() => onMove(-1)} disabled={index === 0} className="px-1.5 py-0.5 rounded disabled:opacity-30" aria-label="Move up">
            ↑
          </button>
          <button onClick={() => onMove(1)} disabled={index === total - 1} className="px-1.5 py-0.5 rounded disabled:opacity-30" aria-label="Move down">
            ↓
          </button>
          <button onClick={() => setOpen((o) => !o)} className="px-1.5 py-0.5 rounded" aria-label="Toggle step settings">
            {open ? "−" : "+"}
          </button>
          <button onClick={onRemove} className="px-1.5 py-0.5 rounded" style={{ color: "var(--color-blocked)" }} aria-label="Remove step">
            ×
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3 grid sm:grid-cols-2 gap-3">
          {usesConnection && (
            <div className="sm:col-span-2">
              <Field label={step.appName ? `Which ${step.appName} account` : "Which account"}>
                <select
                  value={step.integrationId ?? ""}
                  onChange={(e) => onChange({ integrationId: e.target.value || undefined })}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                >
                  <option value="">{step.appName ? `Choose your ${step.appName} account...` : "No account needed"}</option>
                  {connOptions}
                </select>
              </Field>
              {step.appName && !hasMatch && (
                <p className="text-xs mt-1.5" style={{ color: "var(--color-ink-soft)" }}>
                  No {step.appName} account connected yet.{" "}
                  <Link href="/integrations" className="underline decoration-dotted font-semibold" style={{ color: "var(--color-signal)" }}>
                    Connect {step.appName}
                  </Link>
                  , then choose it here.
                </p>
              )}
              {step.appName && hasMatch && !showAllConns && (
                <button onClick={() => setShowAllConns(true)} className="text-[0.7rem] mt-1.5" style={{ color: "var(--color-muted)" }}>
                  Show all accounts
                </button>
              )}
            </div>
          )}

          {step.type === "http" && step.integrationId && (
            <div className="sm:col-span-2">
              <Field label="What should it do?">
                <select
                  value=""
                  onChange={(e) => applyAction(e.target.value)}
                  disabled={!catalog || catalog.source === "loading" || catalog.actions.length === 0}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={inputStyle}
                >
                  <option value="">
                    {!catalog || catalog.source === "loading"
                      ? "finding available actions..."
                      : catalog.actions.length
                        ? `Choose from ${catalog.actions.length} available action${catalog.actions.length === 1 ? "" : "s"}...`
                        : "No ready-made actions; set it up under Advanced"}
                  </option>
                  {catalog?.actions.map((a) => (
                    <option key={`${a.method} ${a.path}`} value={a.name}>
                      {a.summary ? a.summary : `${a.method} ${a.path}`}
                    </option>
                  ))}
                </select>
              </Field>
              {catalog && catalog.source !== "loading" && catalog.actions.length > 0 && (
                <p className="text-[0.7rem] mt-1" style={{ color: "var(--color-muted)" }}>
                  Picked up {CATALOG_SOURCE_LABEL[catalog.source] ?? "from the app"}.
                </p>
              )}
            </div>
          )}

          {step.type === "mcp" && (
            <>
              <Field label="tool">
                {catalog?.mcpTools.length ? (
                  <select
                    value={step.tool ?? ""}
                    onChange={(e) => onChange({ tool: e.target.value || undefined })}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                    style={inputStyle}
                  >
                    <option value="">Choose a tool...</option>
                    {catalog.mcpTools.map((t) => (
                      <option key={t.name} value={t.name} title={t.description}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={step.tool ?? ""}
                    onChange={(e) => onChange({ tool: e.target.value })}
                    placeholder={step.integrationId ? "type a tool name" : "choose an account first"}
                    className="w-full rounded-lg px-3 py-2 font-mono text-xs outline-none"
                    style={inputStyle}
                  />
                )}
              </Field>
              <div className="sm:col-span-2">
                <Field label="what to send (advanced)">
                  <textarea
                    value={step.body ?? ""}
                    onChange={(e) => onChange({ body: e.target.value })}
                    rows={3}
                    placeholder='{"limit": 5, "query": "{{trigger.text}}"}'
                    className="w-full rounded-lg px-3 py-2 font-mono text-xs outline-none resize-y"
                    style={inputStyle}
                  />
                </Field>
              </div>
            </>
          )}

          {step.type === "ai" && (
            <div className="sm:col-span-2">
              <Field label="What should AI do?">
                <textarea
                  value={step.prompt ?? ""}
                  onChange={(e) => onChange({ prompt: e.target.value })}
                  rows={3}
                  placeholder="Write a short, friendly summary of this order for the team."
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-y"
                  style={inputStyle}
                />
              </Field>
              <p className="text-[0.7rem] mt-1" style={{ color: "var(--color-muted)" }}>
                Tip: type <code>{"{{"}</code> to pull in data from the trigger, e.g. {"{{trigger.email}}"}.
              </p>
            </div>
          )}

          {step.type === "filter" && step.condition && (
            <>
              <Field label="Only continue if this value">
                <input
                  value={step.condition.left}
                  onChange={(e) => onChange({ condition: { ...step.condition!, left: e.target.value } })}
                  placeholder="{{trigger.amount}}"
                  className="w-full rounded-lg px-3 py-2 font-mono text-xs outline-none"
                  style={inputStyle}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="is">
                  <select
                    value={step.condition.op}
                    onChange={(e) => onChange({ condition: { ...step.condition!, op: e.target.value as ConditionOp } })}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                    style={inputStyle}
                  >
                    <option value="eq">equal to</option>
                    <option value="neq">not equal to</option>
                    <option value="contains">contains</option>
                    <option value="exists">present</option>
                    <option value="gt">greater than</option>
                    <option value="lt">less than</option>
                  </select>
                </Field>
                {step.condition.op !== "exists" && (
                  <Field label="this">
                    <input
                      value={step.condition.right ?? ""}
                      onChange={(e) => onChange({ condition: { ...step.condition!, right: e.target.value } })}
                      placeholder="100"
                      className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                      style={inputStyle}
                    />
                  </Field>
                )}
              </div>
            </>
          )}

          {(usesBody || isEffect) && (
            <details className="sm:col-span-2">
              <summary className="text-xs cursor-pointer" style={{ color: "var(--color-muted)" }}>
                Advanced settings
              </summary>
              <div className="mt-2 grid sm:grid-cols-2 gap-3">
                {(step.type === "http" || step.type === "webhook-out") && (
                  <Field label="web address">
                    <input
                      value={step.url ?? ""}
                      onChange={(e) => onChange({ url: e.target.value })}
                      placeholder="https://api.example.com/v1/things"
                      className="w-full rounded-lg px-3 py-2 font-mono text-xs outline-none"
                      style={inputStyle}
                    />
                  </Field>
                )}
                {step.type === "connector" && (
                  <Field label="path on your connector">
                    <input
                      value={step.path ?? ""}
                      onChange={(e) => onChange({ path: e.target.value })}
                      placeholder="/v2/send"
                      className="w-full rounded-lg px-3 py-2 font-mono text-xs outline-none"
                      style={inputStyle}
                    />
                  </Field>
                )}
                {usesBody && (
                  <>
                    <Field label="method">
                      <select value={step.method ?? "POST"} onChange={(e) => onChange({ method: e.target.value })} className="w-full rounded-lg px-3 py-2 font-mono text-xs outline-none" style={inputStyle}>
                        {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                          <option key={m}>{m}</option>
                        ))}
                      </select>
                    </Field>
                    <div className="sm:col-span-2">
                      <Field label="what to send (JSON; {{trigger.x}} pulls in data)">
                        <textarea
                          value={step.body ?? ""}
                          onChange={(e) => onChange({ body: e.target.value })}
                          rows={3}
                          placeholder='{"text": "New payment: {{trigger.amount}}"}'
                          className="w-full rounded-lg px-3 py-2 font-mono text-xs outline-none resize-y"
                          style={inputStyle}
                        />
                      </Field>
                    </div>
                  </>
                )}
                {isEffect && (
                  <div className="flex flex-wrap gap-4 sm:col-span-2">
                    <Field label="if it fails, try again">
                      <select
                        value={step.retries ?? 0}
                        onChange={(e) => onChange({ retries: Number(e.target.value) || undefined })}
                        className="rounded-lg px-3 py-2 text-sm outline-none"
                        style={inputStyle}
                      >
                        <option value={0}>don&apos;t retry</option>
                        <option value={1}>retry once</option>
                        <option value={2}>retry twice</option>
                      </select>
                    </Field>
                    <Field label="if it still fails">
                      <select
                        value={step.onError ?? "halt"}
                        onChange={(e) => onChange({ onError: e.target.value === "continue" ? "continue" : undefined })}
                        className="rounded-lg px-3 py-2 text-sm outline-none"
                        style={inputStyle}
                      >
                        <option value="halt">stop here</option>
                        <option value="continue">keep going anyway</option>
                      </select>
                    </Field>
                  </div>
                )}
              </div>
            </details>
          )}

          {step.type === "branch" && (
            <div className="sm:col-span-2 space-y-3">
              {(step.branches ?? []).map((b) => (
                <div key={b.id} className="rounded-xl p-3 space-y-3" style={{ border: "1px dashed var(--color-line-2)" }}>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={b.name}
                      onChange={(e) => patchBranch(b.id, { name: e.target.value })}
                      className="flex-1 min-w-[120px] bg-transparent outline-none font-display font-bold text-sm"
                      style={{ color: "var(--color-ink)" }}
                      aria-label="Branch name"
                    />
                    <select
                      value={b.condition ? "when" : "always"}
                      onChange={(e) =>
                        patchBranch(b.id, { condition: e.target.value === "when" ? ({ left: "", op: "eq", right: "" } as FlowCondition) : undefined })
                      }
                      className="rounded-lg px-2 py-1.5 font-mono text-[0.66rem] outline-none"
                      style={inputStyle}
                    >
                      <option value="always">always runs</option>
                      <option value="when">only when...</option>
                    </select>
                    <button
                      onClick={() => onChange({ branches: (step.branches ?? []).filter((x) => x.id !== b.id) })}
                      className="font-mono text-xs px-1.5 py-0.5 rounded"
                      style={{ color: "var(--color-blocked)" }}
                      aria-label={`Remove branch ${b.name}`}
                    >
                      ×
                    </button>
                  </div>

                  {b.condition && (
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        value={b.condition.left}
                        onChange={(e) => patchBranch(b.id, { condition: { ...b.condition!, left: e.target.value } })}
                        placeholder="{{trigger.severity}}"
                        className="rounded-lg px-3 py-2 font-mono text-xs outline-none"
                        style={inputStyle}
                      />
                      <select
                        value={b.condition.op}
                        onChange={(e) => patchBranch(b.id, { condition: { ...b.condition!, op: e.target.value as ConditionOp } })}
                        className="rounded-lg px-3 py-2 font-mono text-xs outline-none"
                        style={inputStyle}
                      >
                        {OPS.map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </select>
                      {b.condition.op !== "exists" && (
                        <input
                          value={b.condition.right ?? ""}
                          onChange={(e) => patchBranch(b.id, { condition: { ...b.condition!, right: e.target.value } })}
                          placeholder="critical"
                          className="rounded-lg px-3 py-2 font-mono text-xs outline-none"
                          style={inputStyle}
                        />
                      )}
                    </div>
                  )}

                  <div className="space-y-2 pl-3" style={{ borderLeft: `2px solid color-mix(in srgb, ${STEP_COLORS.branch} 40%, transparent)` }}>
                    {b.steps.map((inner, ii) => (
                      <StepCard
                        key={inner.id}
                        step={inner}
                        index={ii}
                        total={b.steps.length}
                        connections={connections}
                        catalogs={catalogs}
                        insideBranch
                        onChange={(p) => patchBranch(b.id, { steps: b.steps.map((x) => (x.id === inner.id ? { ...x, ...p } : x)) })}
                        onMove={(d) => {
                          const j = ii + d;
                          if (j < 0 || j >= b.steps.length) return;
                          const steps = [...b.steps];
                          [steps[ii], steps[j]] = [steps[j], steps[ii]];
                          patchBranch(b.id, { steps });
                        }}
                        onRemove={() => patchBranch(b.id, { steps: b.steps.filter((x) => x.id !== inner.id) })}
                      />
                    ))}
                    <div className="flex flex-wrap gap-1.5">
                      {BRANCH_STEP_TYPES.map((t) => (
                        <button
                          key={t}
                          onClick={() => patchBranch(b.id, { steps: [...b.steps, freshStep(t)] })}
                          title={STEP_BLURBS[t]}
                          className="inline-flex items-center gap-1.5 font-mono text-[0.66rem] px-2 py-1 rounded-lg"
                          style={{ border: `1px solid color-mix(in srgb, ${STEP_COLORS[t]} 40%, transparent)`, color: "var(--color-muted)" }}
                        >
                          <span className="dot" style={{ width: 6, height: 6, background: STEP_COLORS[t] }} />
                          {STEP_LABELS[t]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
              {(step.branches ?? []).length < 4 && (
                <button
                  onClick={() =>
                    onChange({ branches: [...(step.branches ?? []), { id: `b${Date.now().toString(36)}${(step.branches ?? []).length}`, name: `branch ${(step.branches ?? []).length + 1}`, steps: [] }] })
                  }
                  className="btn btn-ghost text-xs"
                >
                  + add branch
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RunCard({ run }: { run: FlowRun }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl p-3" style={{ border: "1px solid var(--color-line)" }}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2.5 text-left">
        <span className={`dot ${run.status === "failed" ? "pulse-dot" : ""}`} style={{ width: 9, height: 9, background: RUN_COLORS[run.status] }} />
        <span className="font-mono text-xs flex-1" style={{ color: "var(--color-ink-soft)" }}>
          {run.trigger.type} · {run.status}
        </span>
        <span className="font-mono text-[0.62rem]" style={{ color: "var(--color-muted)" }}>
          {timeAgo(run.startedAt, Date.now())}
        </span>
      </button>
      {open && (
        <div className="mt-2.5 space-y-1.5 pl-1">
          {run.steps.map((s, si) => (
            <div key={`${run.id}-${s.stepId}-${si}`} className="flex items-start gap-2" style={s.branch ? { paddingLeft: 14 } : undefined}>
              <span className="dot mt-1" style={{ width: 7, height: 7, background: RUN_COLORS[s.status] }} />
              <div className="min-w-0">
                <div className="font-mono text-[0.7rem]" style={{ color: "var(--color-ink-soft)" }}>
                  {s.branch ? <span style={{ color: "var(--color-muted)" }}>{s.branch} / </span> : null}
                  {s.name} <span style={{ color: "var(--color-muted)" }}>· {s.status}</span>
                </div>
                {s.summary && (
                  <div className="font-mono text-[0.62rem] truncate" style={{ color: "var(--color-muted)" }}>
                    {s.summary}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
