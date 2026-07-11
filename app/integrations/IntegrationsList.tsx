"use client";

import Link from "next/link";
import { useState } from "react";
import type { Integration } from "@/lib/engine/types";
import { StatusChip } from "@/app/components/ui";
import { timeAgo } from "@/app/components/status";

// Live connector health, surfaced from the Phase 4 monitor. A verified connector
// shows its rolling state; clicking re-verifies it on demand.
const HEALTH_STYLE: Record<string, { color: string; label: string; pulse: boolean }> = {
  healthy: { color: "var(--color-live)", label: "healthy", pulse: false },
  drifted: { color: "var(--color-berry)", label: "drifted", pulse: true },
  unreachable: { color: "var(--color-amber)", label: "unreachable", pulse: true },
  unchecked: { color: "var(--color-muted)", label: "unchecked", pulse: false },
};

function HealthBadge({ it, onChange }: { it: Integration; onChange: (health: NonNullable<Integration["connector"]>["health"]) => void }) {
  const [busy, setBusy] = useState(false);
  const state = it.connector?.health?.state ?? "unchecked";
  const s = HEALTH_STYLE[state] ?? HEALTH_STYLE.unchecked;

  async function recheck() {
    if (busy) return;
    setBusy(true);
    try {
      const data = await fetch(`/api/integrations/${it.id}/connector/health`, { method: "POST" }).then((r) => r.json());
      if (data.ok) onChange(data.health);
    } catch {
      // leave prior state; the badge stays honest
    }
    setBusy(false);
  }

  return (
    <button
      onClick={recheck}
      disabled={busy}
      title="Re-verify this connector now"
      className="inline-flex items-center gap-1.5 font-mono text-[0.62rem] uppercase tracking-wider px-2 py-1 rounded-lg"
      style={{ color: s.color, border: `1px solid color-mix(in srgb, ${s.color} 40%, transparent)` }}
    >
      <span className={`dot ${s.pulse ? "pulse-dot" : ""}`} style={{ width: 7, height: 7, background: s.color }} />
      {busy ? "checking..." : s.label}
    </button>
  );
}

export function IntegrationsList({ initial }: { initial: Integration[] }) {
  const [items, setItems] = useState(initial);
  const now = Date.now();

  async function remove(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await fetch(`/api/integrations/${id}`, { method: "DELETE" }).catch(() => {});
  }

  function setHealth(id: string, health: NonNullable<Integration["connector"]>["health"]) {
    setItems((prev) => prev.map((i) => (i.id === id && i.connector ? { ...i, connector: { ...i.connector, health } } : i)));
  }

  if (items.length === 0) {
    return (
      <div className="card p-12 text-center wires">
        <p className="font-mono text-sm mb-4" style={{ color: "var(--color-muted)" }}>
          No integrations yet.
        </p>
        <Link href="/" className="btn btn-signal inline-flex">
          Dispatch the swarm
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {items.map((it, i) => (
        <div key={it.id} className="card p-4 sm:p-5 rise" style={{ animationDelay: `${i * 40}ms` }}>
          <div className="flex flex-wrap items-center gap-4">
            <Link href={`/run/${it.id}`} className="flex-1 min-w-[200px] group">
              <div className="flex items-center gap-3">
                <span
                  className="dot"
                  style={{ width: 10, height: 10, background: it.mode === "ai" ? "var(--color-live)" : "var(--color-line-2)" }}
                />
                <div>
                  <div className="font-display font-bold text-lg leading-tight group-hover:underline decoration-dotted">
                    {it.appName}
                  </div>
                  <div className="font-mono text-xs" style={{ color: "var(--color-muted)" }}>
                    {it.discovery?.category ?? "queued"} {it.plan ? `· ${it.plan.pathLabel}` : ""}
                  </div>
                </div>
              </div>
            </Link>

            <div className="hidden sm:flex flex-col items-end gap-1">
              <span className="font-mono text-xs" style={{ color: "var(--color-muted)" }}>
                {it.wire ? (it.wire.bidirectional ? "bidirectional" : "outbound only") : "not wired"}
              </span>
              <span className="font-mono text-[0.66rem]" style={{ color: "var(--color-muted)" }}>
                {timeAgo(it.updatedAt, now)}
              </span>
            </div>

            {it.connector?.verified && <HealthBadge it={it} onChange={(h) => setHealth(it.id, h)} />}

            <StatusChip status={it.status} />

            <button
              onClick={() => remove(it.id)}
              aria-label={`Delete ${it.appName}`}
              className="font-mono text-xs px-2.5 py-1.5 rounded-lg transition-colors"
              style={{ color: "var(--color-muted)", border: "1px solid var(--color-line)" }}
            >
              remove
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
