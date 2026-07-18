"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { timeAgo } from "@/app/components/status";
import type { Integration } from "@/lib/engine/types";
import type { ConditionOp, Flow, FlowRun, FlowStep, FlowStepType, FlowTriggerType } from "@/lib/flow/types";
import { RUN_COLORS, STEP_BLURBS, STEP_COLORS, STEP_LABELS, TRIGGER_LABEL } from "../meta";

const STEP_TYPES: FlowStepType[] = ["http", "connector", "ai", "filter", "webhook-out"];
const OPS: ConditionOp[] = ["eq", "neq", "contains", "exists", "gt", "lt"];

let stepSeq = 0;
function freshStep(type: FlowStepType): FlowStep {
  stepSeq += 1;
  return {
    id: `s${Date.now().toString(36)}${stepSeq}`,
    type,
    name: STEP_LABELS[type],
    method: type === "http" || type === "connector" || type === "webhook-out" ? "POST" : undefined,
    condition: type === "filter" ? { left: "", op: "exists" } : undefined,
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
            <div className="flex gap-1.5">
              {(["webhook", "schedule", "manual"] as FlowTriggerType[]).map((t) => (
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
              <span className="w-full font-mono text-[0.62rem]" style={{ color: "var(--color-muted)" }}>
                Register this URL in the source app; NodeWorm answers its verification challenge automatically.
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
  onChange,
  onMove,
  onRemove,
}: {
  step: FlowStep;
  index: number;
  total: number;
  connectionOptions: React.ReactNode;
  onChange: (p: Partial<FlowStep>) => void;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(true);
  const color = STEP_COLORS[step.type];
  const usesConnection = step.type === "http" || step.type === "connector";
  const usesBody = step.type === "http" || step.type === "connector" || step.type === "webhook-out";

  return (
    <div className="card p-4" style={{ borderColor: `color-mix(in srgb, ${color} 30%, var(--color-line))` }}>
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
          {run.steps.map((s) => (
            <div key={`${run.id}-${s.stepId}`} className="flex items-start gap-2">
              <span className="dot mt-1" style={{ width: 7, height: 7, background: RUN_COLORS[s.status] }} />
              <div className="min-w-0">
                <div className="font-mono text-[0.7rem]" style={{ color: "var(--color-ink-soft)" }}>
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
