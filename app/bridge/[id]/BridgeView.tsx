"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Bridge, BridgeMapping, BridgeTrigger, Integration, NextStep } from "@/lib/engine/types";
import { StatusChip } from "@/app/components/ui";

export function BridgeView({
  bridge: initialBridge,
  source: initialSource,
  target: initialTarget,
}: {
  bridge: Bridge;
  source: Integration | null;
  target: Integration | null;
}) {
  const [bridge, setBridge] = useState(initialBridge);
  const [source, setSource] = useState(initialSource);
  const [target, setTarget] = useState(initialTarget);
  const [checking, setChecking] = useState(false);

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch(`/api/bridges/${initialBridge.id}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setBridge(data.bridge);
        setSource(data.source);
        setTarget(data.target);
      }
    } finally {
      setChecking(false);
    }
  }, [initialBridge.id]);

  // Poll while waiting on consent so authorizing a side in another tab reflects here.
  useEffect(() => {
    if (bridge.status !== "needs-credentials") return;
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [bridge.status, refresh]);

  const r = bridge.report;
  const flow = bridge.flow;
  const arrow = flow?.direction === "bidirectional" ? "⇄" : flow?.direction === "b-to-a" ? "←" : "→";

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <Link href="/" className="font-mono text-xs inline-flex items-center gap-1.5 mb-5" style={{ color: "var(--color-muted)" }}>
        <span>&larr;</span> new bridge
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <div className="kicker mb-2">app-to-app bridge</div>
          <h1 className="display-xl text-[clamp(2rem,5vw,3.3rem)] leading-none flex items-center gap-3 flex-wrap">
            <span>{bridge.sourceName}</span>
            <span style={{ color: "var(--color-signal)" }}>{arrow}</span>
            <span>{bridge.targetName}</span>
          </h1>
          <div className="flex items-center gap-3 mt-3">
            <StatusChip status={bridge.status} />
            {flow && flow.direction !== "none" && (
              <span className="chip">
                <span className="dot" style={{ background: "var(--color-teal)" }} />
                {flow.direction === "bidirectional" ? "two-way" : "one-way"} sync
              </span>
            )}
          </div>
        </div>
        <button onClick={refresh} disabled={checking} className="btn btn-ghost text-sm">
          {checking ? "checking..." : "re-check connections"}
        </button>
      </div>

      {/* Report hero */}
      {r && (
        <div className="card overflow-hidden mb-6" style={{ boxShadow: "var(--shadow-soft)" }}>
          <div className="p-6 sm:p-7 wires" style={{ background: "var(--color-paper-2)" }}>
            <h2 className="font-display font-extrabold text-[clamp(1.4rem,3vw,2rem)] leading-tight max-w-2xl">{r.headline}</h2>
            <p className="mt-2 text-base max-w-2xl" style={{ color: "var(--color-ink-soft)" }}>
              {r.summary}
            </p>
          </div>
        </div>
      )}

      {/* Endpoints */}
      <div className="grid sm:grid-cols-[1fr_auto_1fr] items-stretch gap-3 mb-6">
        <Endpoint it={source} role="source" />
        <div className="hidden sm:grid place-items-center px-1">
          <span className="font-display text-2xl" style={{ color: "var(--color-signal)" }}>
            {arrow}
          </span>
        </div>
        <Endpoint it={target} role="target" />
      </div>

      {/* Flow */}
      {flow && flow.triggers.length > 0 && (
        <div className="card p-5 mb-6">
          <div className="kicker mb-4">the flow</div>
          <div className="space-y-3">
            {flow.triggers.map((t, i) => (
              <TriggerRow key={i} t={t} />
            ))}
          </div>
          {flow.mappings.length > 0 && (
            <div className="mt-5 pt-4 border-t hairline">
              <div className="font-mono text-[0.6rem] uppercase tracking-wider mb-2" style={{ color: "var(--color-muted)" }}>
                entity mapping
              </div>
              <div className="space-y-1">
                {flow.mappings.map((m) => (
                  <MappingRow key={m.fromEntity} m={m} />
                ))}
              </div>
            </div>
          )}
          <div className="mt-5 pt-4 border-t hairline font-mono text-xs" style={{ color: "var(--color-ink-soft)" }}>
            <span style={{ color: "var(--color-teal)" }}>connector</span> {flow.connector.framework} &rarr; {flow.connector.deployTarget}
          </div>
        </div>
      )}

      {/* Capabilities + next steps */}
      {r && (
        <div className="grid lg:grid-cols-2 gap-6">
          {r.capabilities.length > 0 && (
            <div>
              <div className="kicker mb-3">what it does</div>
              <ul className="space-y-2.5">
                {r.capabilities.map((c, i) => (
                  <li key={i} className="flex gap-2.5 text-sm">
                    <span style={{ color: "var(--color-teal)" }}>&#10003;</span>
                    <span style={{ color: "var(--color-ink-soft)" }}>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <div className="kicker mb-3">next steps</div>
            <div className="space-y-2.5">
              {r.nextSteps.map((s, i) => (
                <NextStepRow key={i} s={s} />
              ))}
            </div>
            {r.warnings.length > 0 && (
              <div className="mt-5">
                <div className="font-mono text-[0.6rem] uppercase tracking-wider mb-2" style={{ color: "var(--color-muted)" }}>
                  watch for
                </div>
                <ul className="space-y-1.5">
                  {r.warnings.map((w, i) => (
                    <li key={i} className="font-mono text-xs flex gap-2" style={{ color: "var(--color-muted)" }}>
                      <span style={{ color: "var(--color-signal)" }}>!</span>
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Endpoint({ it, role }: { it: Integration | null; role: "source" | "target" }) {
  if (!it) return <div className="card p-5" style={{ color: "var(--color-muted)" }}>endpoint unavailable</div>;
  const connected = it.secrets.length > 0;
  const accent = role === "source" ? "var(--color-signal)" : "var(--color-teal)";
  return (
    <div className="card p-5 flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-mono text-[0.6rem] uppercase tracking-wider" style={{ color: accent }}>
            {role}
          </div>
          <div className="font-display font-bold text-xl leading-tight mt-0.5">{it.appName}</div>
          <div className="font-mono text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
            {it.discovery?.category ?? "scouted"}
          </div>
        </div>
        <StatusChip status={it.status} />
      </div>
      <div className="mt-3 font-mono text-[0.7rem]" style={{ color: "var(--color-ink-soft)" }}>
        {it.plan?.pathLabel ?? "no path"}
      </div>
      <div className="flex-1" />
      <div className="mt-4">
        {connected ? (
          <span className="chip" style={{ borderColor: "var(--color-teal)" }}>
            <span className="dot" style={{ background: "var(--color-teal)" }} />
            authorized &#10003;
          </span>
        ) : (
          <Link href={`/run/${it.id}`} className="btn btn-signal text-sm w-full justify-center">
            Authorize {it.appName} &rarr;
          </Link>
        )}
      </div>
    </div>
  );
}

function TriggerRow({ t }: { t: BridgeTrigger }) {
  return (
    <div className="flex items-start gap-3">
      <span
        className="font-mono text-[0.62rem] mt-0.5 px-1.5 py-0.5 rounded shrink-0"
        style={{ background: "var(--color-paper-2)", border: "1px solid var(--color-line-2)", color: "var(--color-muted)" }}
      >
        {t.via}
      </span>
      <p className="text-sm leading-snug">
        <span style={{ color: "var(--color-muted)" }}>When </span>
        <span className="font-semibold">{t.when}</span>
        <span style={{ color: "var(--color-signal)" }}>, NodeWorm will </span>
        <span className="font-semibold">{t.then}</span>
        <span style={{ color: "var(--color-muted)" }}>.</span>
      </p>
    </div>
  );
}

function MappingRow({ m }: { m: BridgeMapping }) {
  return (
    <div className="font-mono text-xs">
      <span style={{ color: "var(--color-signal)" }}>{m.fromEntity}</span>
      <span style={{ color: "var(--color-muted)" }}> &#8644; </span>
      <span style={{ color: "var(--color-teal)" }}>{m.toEntity}</span>
    </div>
  );
}

function NextStepRow({ s }: { s: NextStep }) {
  const body = (
    <div
      className="card p-3 flex items-start gap-3"
      style={{ borderColor: s.kind === "oauth" ? "color-mix(in srgb, var(--color-signal) 40%, var(--color-line-2))" : "var(--color-line-2)" }}
    >
      <span
        className="font-mono text-[0.58rem] uppercase tracking-wider mt-0.5 px-1.5 py-0.5 rounded shrink-0"
        style={{
          background: s.kind === "oauth" ? "var(--color-signal)" : "var(--color-paper-2)",
          color: s.kind === "oauth" ? "#fff" : "var(--color-muted)",
          border: s.kind === "oauth" ? "none" : "1px solid var(--color-line-2)",
        }}
      >
        {s.kind}
      </span>
      <div>
        <div className="text-sm font-semibold">
          {s.label}
          {s.url && <span style={{ color: "var(--color-signal)" }}> &rarr;</span>}
        </div>
        <div className="text-xs mt-0.5" style={{ color: "var(--color-ink-soft)" }}>
          {s.detail}
        </div>
      </div>
    </div>
  );
  return s.url ? (
    <Link href={s.url} className="block transition-transform hover:-translate-y-0.5">
      {body}
    </Link>
  ) : (
    body
  );
}
