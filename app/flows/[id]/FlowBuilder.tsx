"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { timeAgo } from "@/app/components/status";
import type { Integration } from "@/lib/engine/types";
import type { FlowAction } from "@/lib/flow/actions";
import type { McpTool } from "@/lib/flow/mcp";
import type { ConditionOp, Flow, FlowBranch, FlowCondition, FlowRun, FlowStep, FlowStepType, FlowTriggerType } from "@/lib/flow/types";
import { RUN_COLORS, STEP_BLURBS, STEP_COLORS, STEP_LABELS, TRIGGER_LABEL } from "../meta";

const STEP_TYPES: FlowStepType[] = ["http", "mcp", "connector", "ai", "filter", "webhook-out", "branch"];
const BRANCH_STEP_TYPES: FlowStepType[] = ["http", "mcp", "connector", "ai", "filter", "webhook-out"];
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

  const connectionOptions = useMemo(
    () =>
      connections.map((c) => (
        <option key={c.id} value={c.id}>
          {c.appName} ({c.status})
        </option>
      )),
    [connections],
  );

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-8">
      <div>
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <Link href="/flows" className="font-mono text-xs" style={{ color: "var(--color-muted)" }}>
            flows /
          </Link>
          <span className="chip">
            <span className="dot" style={{ background: flow.enabled ? "var(--color-live)" : "var(--color-amber)" }} />
            {flow.enabled ? "live" : "paused"}
          </span>
          {flow.draftedBy === "ai" && <span className="chip">AI-drafted</span>}
        </div>

        <input
          value={flow.name}
          onChange={(e) => patch({ name: e.target.value })}
          className="w-full bg-transparent outline-none font-display font-extrabold text-[clamp(1.6rem,4vw,2.4rem)] leading-tight mb-1"
          style={{ color: "var(--color-ink)" }}
          aria-label="Flow name"
        />
        {flow.description && (
          <p className="font-mono text-xs mb-4" style={{ color: "var(--color-muted)" }}>
            &ldquo;{flow.description}&rdquo;
          </p>
        )}

        {flow.needsConnections && flow.needsConnections.length > 0 && (
          <div
            className="rounded-xl px-4 py-3 mb-5 font-mono text-xs"
            style={{ border: "1px solid color-mix(in srgb, var(--color-amber) 50%, transparent)", color: "var(--color-ink-soft)" }}
          >
            This flow wants {flow.needsConnections.join(" + ")} connected.{" "}
            <Link href="/" className="underline decoration-dotted" style={{ color: "var(--color-signal)" }}>
              Dispatch the swarm
            </Link>{" "}
            then pick the connection on the step.
          </div>
        )}

        {/* Trigger */}
        <div className="card-pop p-5 mb-1 relative">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5">
              <span className="dot" style={{ width: 12, height: 12, background: "var(--color-teal)" }} />
              <span className="font-display font-bold">Trigger</span>
              {flow.trigger.appName && (
                <span className="font-mono text-xs" style={{ color: "var(--color-muted)" }}>
                  {flow.trigger.appName} · {flow.trigger.event}
                </span>
              )}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {(["webhook", "poll", "schedule", "manual"] as FlowTriggerType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => patch({ trigger: { ...flow.trigger, type: t } })}
                  className="font-mono text-[0.66rem] uppercase tracking-wider px-2.5 py-1.5 rounded-lg transition-colors"
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
              <code
                className="flex-1 min-w-[220px] truncate font-mono text-[0.7rem] rounded-lg px-3 py-2"
                style={{ background: "var(--color-paper-2)", border: "1px solid var(--color-line)", color: "var(--color-ink-soft)" }}
              >
                {hookUrl ?? "loading hook URL..."}
              </code>
              <button onClick={copyHook} className="btn btn-ghost text-xs" disabled={!hookUrl}>
                {copied ? "copied" : "copy"}
              </button>
              {reg && reg.mode !== "none" && (
                <div className="w-full rounded-xl px-3 py-2.5 space-y-2" style={{ border: "1px dashed var(--color-line-2)" }}>
                  {reg.registration?.state === "registered" ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="chip">
                        <span className="dot" style={{ background: "var(--color-live)" }} />
                        registered{reg.registration.id ? ` · ${reg.registration.id}` : ""}
                      </span>
                      <span className="font-mono text-[0.62rem] flex-1" style={{ color: "var(--color-muted)" }}>
                        {reg.registration.detail}
                      </span>
                      <button onClick={unregisterHook} disabled={regBusy} className="font-mono text-xs px-2 py-1 rounded-lg" style={{ color: "var(--color-muted)", border: "1px solid var(--color-line)" }}>
                        un-register
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      {reg.params.map((p) => (
                        <input
                          key={p.key}
                          value={regParams[p.key] ?? ""}
                          onChange={(e) => setRegParams((v) => ({ ...v, [p.key]: e.target.value }))}
                          placeholder={`${p.label} (${p.example})`}
                          className="flex-1 min-w-[160px] rounded-lg px-3 py-2 font-mono text-xs outline-none"
                          style={inputStyle}
                        />
                      ))}
                      <button onClick={registerHook} disabled={regBusy} className="btn btn-signal text-xs whitespace-nowrap">
                        {regBusy ? "registering..." : `⚡ Register in ${flow.trigger.appName ?? "the app"}`}
                      </button>
                      <span className="w-full font-mono text-[0.62rem]" style={{ color: "var(--color-muted)" }}>
                        {reg.detail}
                        {reg.registration?.state === "failed" ? ` · last attempt: ${reg.registration.detail}` : ""}
                        {regError ? ` · ${regError}` : ""}
                      </span>
                    </div>
                  )}
                </div>
              )}
              <span className="w-full font-mono text-[0.62rem]" style={{ color: "var(--color-muted)" }}>
                {reg?.registration?.state === "registered"
                  ? "NodeWorm registered this URL inside the app for you."
                  : "Or register this URL in the source app yourself; NodeWorm answers its verification challenge automatically."}
              </span>
            </div>
          )}

          {flow.trigger.type === "schedule" && (
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs" style={{ color: "var(--color-muted)" }}>
                every
              </span>
              <input
                type="number"
                min={5}
                value={flow.trigger.scheduleMins ?? 60}
                onChange={(e) => patch({ trigger: { ...flow.trigger, scheduleMins: Number(e.target.value) } })}
                className="w-24 rounded-lg px-3 py-2 font-mono text-sm outline-none"
                style={inputStyle}
              />
              <span className="font-mono text-xs" style={{ color: "var(--color-muted)" }}>
                minutes (5 min floor)
              </span>
            </div>
          )}

          {flow.trigger.type === "poll" && (
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="poll as connection (optional, adds auth)">
                <select
                  value={flow.trigger.integrationId ?? ""}
                  onChange={(e) => patch({ trigger: { ...flow.trigger, integrationId: e.target.value || undefined } })}
                  className="w-full rounded-lg px-3 py-2 font-mono text-xs outline-none"
                  style={inputStyle}
                >
                  <option value="">unauthenticated</option>
                  {connectionOptions}
                </select>
              </Field>
              <Field label="url to watch">
                <input
                  value={flow.trigger.url ?? ""}
                  onChange={(e) => patch({ trigger: { ...flow.trigger, url: e.target.value } })}
                  placeholder="https://api.example.com/v1/orders"
                  className="w-full rounded-lg px-3 py-2 font-mono text-xs outline-none"
                  style={inputStyle}
                />
              </Field>
              <div className="grid grid-cols-3 gap-3 sm:col-span-2">
                <Field label="items path">
                  <input
                    value={flow.trigger.itemsPath ?? ""}
                    onChange={(e) => patch({ trigger: { ...flow.trigger, itemsPath: e.target.value } })}
                    placeholder="data (empty = whole response)"
                    className="w-full rounded-lg px-3 py-2 font-mono text-xs outline-none"
                    style={inputStyle}
                  />
                </Field>
                <Field label="id field">
                  <input
                    value={flow.trigger.idPath ?? "id"}
                    onChange={(e) => patch({ trigger: { ...flow.trigger, idPath: e.target.value } })}
                    className="w-full rounded-lg px-3 py-2 font-mono text-xs outline-none"
                    style={inputStyle}
                  />
                </Field>
                <Field label="every (mins)">
                  <input
                    type="number"
                    min={5}
                    value={flow.trigger.scheduleMins ?? 15}
                    onChange={(e) => patch({ trigger: { ...flow.trigger, scheduleMins: Number(e.target.value) } })}
                    className="w-full rounded-lg px-3 py-2 font-mono text-xs outline-none"
                    style={inputStyle}
                  />
                </Field>
              </div>
              <p className="sm:col-span-2 font-mono text-[0.62rem]" style={{ color: "var(--color-muted)" }}>
                First poll primes the seen-set without firing; each genuinely new item then runs the flow once (item = <code>{"{{trigger.*}}"}</code>).
                {flow.pollState?.lastDetail ? ` Last poll: ${flow.pollState.lastDetail}.` : ""}
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
                connectionOptions={connectionOptions}
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
            <div className="font-mono text-[0.62rem] uppercase tracking-wider mb-2" style={{ color: "var(--color-muted)" }}>
              add a step
            </div>
            <div className="flex flex-wrap gap-2">
              {STEP_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setFlow((f) => ({ ...f, steps: [...f.steps, freshStep(t)] }));
                    setDirty(true);
                  }}
                  title={STEP_BLURBS[t]}
                  className="inline-flex items-center gap-2 font-mono text-xs px-3 py-2 rounded-lg transition-transform hover:-translate-y-0.5"
                  style={{ border: `1px solid color-mix(in srgb, ${STEP_COLORS[t]} 45%, transparent)`, color: "var(--color-ink-soft)" }}
                >
                  <span className="dot" style={{ width: 8, height: 8, background: STEP_COLORS[t] }} />
                  {STEP_LABELS[t]}
                </button>
              ))}
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
            title={flow.enabled ? "Pause: webhook + schedule triggers stop firing" : "Resume triggers"}
          >
            {flow.enabled ? "Pause flow" : "Resume flow"}
          </button>
          <span className="flex-1" />
          <button onClick={remove} className="font-mono text-xs px-2.5 py-1.5 rounded-lg" style={{ color: "var(--color-blocked)", border: "1px solid var(--color-line)" }}>
            delete flow
          </button>
        </div>
      </div>

      {/* Run panel */}
      <div className="space-y-5">
        <div className="card-pop p-5">
          <div className="kicker mb-3">test bench</div>
          <Field label="trigger payload (JSON)">
            <textarea
              value={testPayload}
              onChange={(e) => setTestPayload(e.target.value)}
              rows={5}
              className="w-full rounded-lg px-3 py-2 font-mono text-xs outline-none resize-y"
              style={inputStyle}
            />
          </Field>
          <button onClick={runNow} disabled={running || flow.steps.length === 0} className="btn btn-signal w-full mt-3">
            {running ? "running..." : "⚡ Run now"}
          </button>
          {flow.steps.length === 0 && (
            <p className="font-mono text-[0.62rem] mt-2" style={{ color: "var(--color-muted)" }}>
              Add at least one step first.
            </p>
          )}
        </div>

        <div className="card p-5">
          <div className="kicker mb-3">runs</div>
          {runs.length === 0 ? (
            <p className="font-mono text-xs" style={{ color: "var(--color-muted)" }}>
              No runs yet. Fire the trigger or press Run now.
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
  connectionOptions,
  catalogs,
  onChange,
  onMove,
  onRemove,
  insideBranch,
}: {
  step: FlowStep;
  index: number;
  total: number;
  connectionOptions: React.ReactNode;
  catalogs: Record<string, Catalog>;
  onChange: (p: Partial<FlowStep>) => void;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
  insideBranch?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const color = STEP_COLORS[step.type];
  const catalog = step.integrationId ? catalogs[step.integrationId] : undefined;
  const usesConnection = step.type === "http" || step.type === "connector" || step.type === "mcp";
  const usesBody = step.type === "http" || step.type === "connector" || step.type === "webhook-out";
  const isEffect = step.type !== "filter" && step.type !== "branch";

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
        <span className="font-mono text-[0.62rem] uppercase tracking-wider px-2 py-0.5 rounded" style={{ color, border: `1px solid color-mix(in srgb, ${color} 45%, transparent)` }}>
          {STEP_LABELS[step.type]}
        </span>
        <input
          value={step.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="flex-1 bg-transparent outline-none font-display font-bold text-[0.95rem]"
          style={{ color: "var(--color-ink)" }}
          aria-label="Step name"
        />
        <div className="flex items-center gap-1 font-mono text-xs" style={{ color: "var(--color-muted)" }}>
          <button onClick={() => onMove(-1)} disabled={index === 0} className="px-1.5 py-0.5 rounded disabled:opacity-30" aria-label="Move up">
            ↑
          </button>
          <button onClick={() => onMove(1)} disabled={index === total - 1} className="px-1.5 py-0.5 rounded disabled:opacity-30" aria-label="Move down">
            ↓
          </button>
          <button onClick={() => setOpen((o) => !o)} className="px-1.5 py-0.5 rounded" aria-label="Toggle step config">
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
            <Field label="connection">
              <select
                value={step.integrationId ?? ""}
                onChange={(e) => onChange({ integrationId: e.target.value || undefined })}
                className="w-full rounded-lg px-3 py-2 font-mono text-xs outline-none"
                style={inputStyle}
              >
                <option value="">{step.appName ? `pick your ${step.appName} connection...` : "no connection (unauthenticated)"}</option>
                {connectionOptions}
              </select>
            </Field>
          )}

          {step.type === "http" && step.integrationId && (
            <Field label={`real operations ${CATALOG_SOURCE_LABEL[catalog?.source ?? "none"] ?? ""}`}>
              <select
                value=""
                onChange={(e) => applyAction(e.target.value)}
                disabled={!catalog || catalog.source === "loading" || catalog.actions.length === 0}
                className="w-full rounded-lg px-3 py-2 font-mono text-xs outline-none"
                style={inputStyle}
              >
                <option value="">
                  {!catalog || catalog.source === "loading"
                    ? "discovering operations..."
                    : catalog.actions.length
                      ? `prefill from ${catalog.actions.length} discovered operation(s)...`
                      : "none discovered; configure manually"}
                </option>
                {catalog?.actions.map((a) => (
                  <option key={`${a.method} ${a.path}`} value={a.name}>
                    {a.method} {a.path} {a.summary ? `· ${a.summary}` : ""}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {step.type === "mcp" && (
            <>
              <Field label="tool">
                {catalog?.mcpTools.length ? (
                  <select
                    value={step.tool ?? ""}
                    onChange={(e) => onChange({ tool: e.target.value || undefined })}
                    className="w-full rounded-lg px-3 py-2 font-mono text-xs outline-none"
                    style={inputStyle}
                  >
                    <option value="">pick a live tool...</option>
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
                    placeholder={step.integrationId ? "no live tools found; type a tool name" : "pick a connection first"}
                    className="w-full rounded-lg px-3 py-2 font-mono text-xs outline-none"
                    style={inputStyle}
                  />
                )}
              </Field>
              <div className="sm:col-span-2">
                <Field label="tool arguments (JSON template)">
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

          {(step.type === "http" || step.type === "webhook-out") && (
            <Field label="url">
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
                <Field label="body template (JSON, {{trigger.x}} and {{steps.<id>.output.x}} interpolate)">
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

          {step.type === "ai" && (
            <div className="sm:col-span-2">
              <Field label="instruction (templates interpolate)">
                <textarea
                  value={step.prompt ?? ""}
                  onChange={(e) => onChange({ prompt: e.target.value })}
                  rows={3}
                  placeholder="Summarise this order for a Slack message: {{trigger.order}}"
                  className="w-full rounded-lg px-3 py-2 font-mono text-xs outline-none resize-y"
                  style={inputStyle}
                />
              </Field>
            </div>
          )}

          {step.type === "filter" && step.condition && (
            <>
              <Field label="value">
                <input
                  value={step.condition.left}
                  onChange={(e) => onChange({ condition: { ...step.condition!, left: e.target.value } })}
                  placeholder="{{trigger.amount}}"
                  className="w-full rounded-lg px-3 py-2 font-mono text-xs outline-none"
                  style={inputStyle}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="op">
                  <select
                    value={step.condition.op}
                    onChange={(e) => onChange({ condition: { ...step.condition!, op: e.target.value as ConditionOp } })}
                    className="w-full rounded-lg px-3 py-2 font-mono text-xs outline-none"
                    style={inputStyle}
                  >
                    {OPS.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </Field>
                {step.condition.op !== "exists" && (
                  <Field label="compare to">
                    <input
                      value={step.condition.right ?? ""}
                      onChange={(e) => onChange({ condition: { ...step.condition!, right: e.target.value } })}
                      placeholder="100"
                      className="w-full rounded-lg px-3 py-2 font-mono text-xs outline-none"
                      style={inputStyle}
                    />
                  </Field>
                )}
              </div>
            </>
          )}

          {isEffect && (
            <div className="flex flex-wrap gap-4 sm:col-span-2">
              <Field label="retries">
                <select
                  value={step.retries ?? 0}
                  onChange={(e) => onChange({ retries: Number(e.target.value) || undefined })}
                  className="rounded-lg px-3 py-2 font-mono text-xs outline-none"
                  style={inputStyle}
                >
                  <option value={0}>none</option>
                  <option value={1}>1 retry</option>
                  <option value={2}>2 retries</option>
                </select>
              </Field>
              <Field label="on failure">
                <select
                  value={step.onError ?? "halt"}
                  onChange={(e) => onChange({ onError: e.target.value === "continue" ? "continue" : undefined })}
                  className="rounded-lg px-3 py-2 font-mono text-xs outline-none"
                  style={inputStyle}
                >
                  <option value="halt">stop the run</option>
                  <option value="continue">continue (run marked partial)</option>
                </select>
              </Field>
            </div>
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
                        connectionOptions={connectionOptions}
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
