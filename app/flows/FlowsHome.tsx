"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BrandLogo } from "@/app/components/BrandLogo";
import { timeAgo } from "@/app/components/status";
import { LogoCloud } from "@/app/components/LogoCloud";
import { TEMPLATES } from "@/lib/flow/templates";
import type { Flow, FlowStep, FlowTrigger } from "@/lib/flow/types";
import { STEP_COLORS, TRIGGER_CHIP, TRIGGER_LABEL } from "./meta";

const EXAMPLES = [
  { text: "When a Stripe payment succeeds, add a row in Notion and message Slack", apps: ["Stripe", "Notion", "Slack"] },
  { text: "Every morning, summarise yesterday's Shopify orders with AI and email me", apps: ["Shopify", "Gmail"] },
  { text: "When a Typeform response lands, create a GitHub issue", apps: ["Typeform", "GitHub"] },
];

// The distinct apps a template/flow touches, trigger first, for a logo row.
function flowApps(trigger: FlowTrigger, steps: FlowStep[]): string[] {
  const names: string[] = [];
  const add = (n?: string) => {
    if (n && !names.some((x) => x.toLowerCase() === n.toLowerCase())) names.push(n);
  };
  add(trigger.appName);
  for (const s of steps) {
    add(s.appName);
    for (const b of s.branches ?? []) for (const inner of b.steps) add(inner.appName);
  }
  return names;
}

export function FlowsHome({ initial }: { initial: Flow[] }) {
  const router = useRouter();
  const [flows, setFlows] = useState(initial);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "clarify" | "unmappable" | "error"; text: string } | null>(null);
  const now = Date.now();

  async function draft() {
    const p = prompt.trim();
    if (!p || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const data = await fetch("/api/flows", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: p }),
      }).then((r) => r.json());
      if (data.flow) {
        router.push(`/flows/${data.flow.id}`);
        return;
      }
      if (data.clarify) setNotice({ kind: "clarify", text: data.clarify.question });
      else if (data.unmappable) setNotice({ kind: "unmappable", text: data.unmappable });
      else setNotice({ kind: "error", text: data.error ?? "Could not draft that." });
    } catch {
      setNotice({ kind: "error", text: "Something broke drafting that. Try again." });
    }
    setBusy(false);
  }

  async function fromTemplate(id: string) {
    if (busy) return;
    setBusy(true);
    const data = await fetch("/api/flows", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ template: id }),
    })
      .then((r) => r.json())
      .catch(() => null);
    if (data?.flow) router.push(`/flows/${data.flow.id}`);
    else setBusy(false);
  }

  async function blank() {
    if (busy) return;
    setBusy(true);
    const data = await fetch("/api/flows", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    })
      .then((r) => r.json())
      .catch(() => null);
    if (data?.flow) router.push(`/flows/${data.flow.id}`);
    else setBusy(false);
  }

  async function remove(id: string) {
    setFlows((prev) => prev.filter((f) => f.id !== id));
    await fetch(`/api/flows/${id}`, { method: "DELETE" }).catch(() => {});
  }

  return (
    <div className="space-y-8">
      <div className="card-pop p-6 sm:p-8">
        <div className="font-display font-bold text-lg mb-1">Describe what you want, in plain English</div>
        <p className="text-sm mb-3" style={{ color: "var(--color-muted)" }}>
          NodeWorm builds the automation for you. Edit anything afterward.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && draft()}
            placeholder="When a payment comes in on Stripe, add a row to my Notion..."
            className="flex-1 rounded-xl px-4 py-3.5 text-[0.95rem] outline-none"
            style={{ background: "var(--color-paper-2)", border: "1px solid var(--color-line-2)", color: "var(--color-ink)" }}
          />
          <button onClick={draft} disabled={busy || !prompt.trim()} className="btn btn-signal whitespace-nowrap">
            {busy ? "building..." : "Build it for me"}
          </button>
        </div>

        {notice && (
          <div
            className="mt-4 rounded-xl px-4 py-3 text-sm"
            style={{
              border: `1px solid color-mix(in srgb, ${notice.kind === "clarify" ? "var(--color-amber)" : "var(--color-blocked)"} 45%, transparent)`,
              color: "var(--color-ink-soft)",
            }}
          >
            {notice.kind === "clarify" ? "Quick question: " : ""}
            {notice.text}
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.text}
              onClick={() => setPrompt(ex.text)}
              className="flex items-center gap-2.5 text-sm px-3 py-2 rounded-xl text-left transition-transform hover:-translate-y-0.5"
              style={{ color: "var(--color-ink-soft)", border: "1px solid var(--color-line)", background: "var(--color-paper)" }}
            >
              <span className="flex items-center -space-x-1.5">
                {ex.apps.map((a) => (
                  <BrandLogo key={a} name={a} size={22} className="ring-2" />
                ))}
              </span>
              <span className="min-w-0">{ex.text}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Marketing: real logos, the apps this works with. */}
      <div>
        <p className="text-center text-xs uppercase tracking-[0.2em] mb-4" style={{ color: "var(--color-muted)" }}>
          Connects the apps you already use
        </p>
        <LogoCloud />
      </div>

      <div>
        <div className="font-display font-bold text-base mb-4">Or pick a ready-made template</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {TEMPLATES.map((t, i) => {
            const apps = flowApps(t.trigger, t.steps);
            return (
              <button
                key={t.id}
                onClick={() => fromTemplate(t.id)}
                disabled={busy}
                className="card p-4 text-left rise transition-transform hover:-translate-y-1"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                {apps.length > 0 && (
                  <div className="flex items-center gap-1.5 mb-3">
                    {apps.slice(0, 4).map((a, j) => (
                      <span key={a} className="flex items-center gap-1.5">
                        {j > 0 && <span style={{ color: "var(--color-line-2)" }}>→</span>}
                        <BrandLogo name={a} size={28} />
                      </span>
                    ))}
                  </div>
                )}
                <div className="font-display font-bold text-[0.95rem] leading-tight mb-1">{t.name}</div>
                <div className="text-xs mb-3" style={{ color: "var(--color-muted)" }}>
                  {t.blurb}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[0.62rem] uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>
                    {TRIGGER_LABEL[t.trigger.type]}
                  </span>
                  <span className="text-[0.6rem]" style={{ color: "var(--color-line-2)" }}>
                    →
                  </span>
                  {t.steps.flatMap((s) => [s, ...(s.branches?.flatMap((b) => b.steps) ?? [])]).map((s, j) => (
                    <span key={j} className="dot" style={{ width: 7, height: 7, background: STEP_COLORS[s.type] }} />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <span className="font-display font-bold text-base">Your automations</span>
          <button onClick={blank} className="btn btn-ghost text-sm">
            Start from scratch
          </button>
        </div>

        {flows.length === 0 ? (
          <div className="card p-12 text-center wires">
            <p className="text-sm" style={{ color: "var(--color-muted)" }}>
              Nothing here yet. Describe one above and watch it build itself.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {flows.map((f, i) => {
              const apps = flowApps(f.trigger, f.steps);
              return (
              <div key={f.id} className="card p-4 sm:p-5 rise" style={{ animationDelay: `${i * 40}ms` }}>
                <div className="flex flex-wrap items-center gap-4">
                  {apps.length > 0 && (
                    <span className="flex items-center -space-x-2 shrink-0">
                      {apps.slice(0, 3).map((a) => (
                        <span key={a} className="rounded-lg" style={{ boxShadow: "0 0 0 2px var(--color-card)" }}>
                          <BrandLogo name={a} size={32} />
                        </span>
                      ))}
                    </span>
                  )}
                  <Link href={`/flows/${f.id}`} className="flex-1 min-w-[200px] group">
                    <div className="font-display font-bold text-lg leading-tight group-hover:underline decoration-dotted">
                      {f.name}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs" style={{ color: "var(--color-muted)" }}>
                      <span>{TRIGGER_CHIP[f.trigger.type]}</span>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1">
                        {f.steps.slice(0, 6).map((s) => (
                          <span key={s.id} className="dot" style={{ width: 7, height: 7, background: STEP_COLORS[s.type] }} />
                        ))}
                        {f.steps.length === 0 ? "nothing to do yet" : `${f.steps.length} step${f.steps.length === 1 ? "" : "s"}`}
                      </span>
                    </div>
                  </Link>

                  <span className="text-[0.7rem] hidden sm:block" style={{ color: "var(--color-muted)" }}>
                    {f.lastRunAt ? `last ran ${timeAgo(f.lastRunAt, now)}` : "not run yet"}
                  </span>

                  {f.workspaceId && (
                    <span className="chip" title="Shared with your team">
                      <span className="dot" style={{ background: "var(--color-aqua)" }} />
                      shared
                    </span>
                  )}
                  <span className="chip">
                    <span className="dot" style={{ background: f.enabled ? "var(--color-live)" : "var(--color-amber)" }} />
                    {f.enabled ? "on" : "off"}
                  </span>

                  <button
                    onClick={() => remove(f.id)}
                    aria-label={`Delete ${f.name}`}
                    className="text-xs px-2.5 py-1.5 rounded-lg transition-colors"
                    style={{ color: "var(--color-muted)", border: "1px solid var(--color-line)" }}
                  >
                    remove
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
