"use client";

import Link from "next/link";
import { useState } from "react";
import type { Integration } from "@/lib/engine/types";
import { StatusChip } from "@/app/components/ui";
import { BrandLogo } from "@/app/components/BrandLogo";
import { timeAgo } from "@/app/components/status";

// Live connector health, surfaced from the Phase 4 monitor. A verified connector
// shows its rolling state; clicking re-verifies it on demand.
const LIVE = new Set(["connected", "connected-via-session", "connected-via-connector"]);

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
      <div className="card card-pop p-14 text-center wires">
        <div className="flex justify-center gap-2 mb-5">
          {["Stripe", "Slack", "Notion", "GitHub"].map((n, i) => (
            <span key={n} className="logo-float" style={{ animationDelay: `${i * 0.35}s` }}>
              <BrandLogo name={n} size={44} />
            </span>
          ))}
        </div>
        <h3 className="font-display font-extrabold text-2xl mb-2">Nothing hooked yet.</h3>
        <p className="text-sm mb-6 max-w-sm mx-auto" style={{ color: "var(--color-ink-soft)" }}>
          Name any app and NodeWorm works out how to connect it, then holds the sign-in for you.
        </p>
        <Link href="/" className="btn btn-signal btn-shimmer inline-flex">
          Connect your first app →
        </Link>
      </div>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 gap-3.5">
      {items.map((it, i) => {
        const live = LIVE.has(it.status);
        const accent = live ? "var(--color-live)" : it.status === "blocked" ? "var(--color-blocked)" : "var(--color-berry)";
        return (
          <div
            key={it.id}
            className="card p-5 rise relative overflow-hidden"
            style={{ animationDelay: `${i * 50}ms`, borderColor: `color-mix(in srgb, ${accent} 28%, var(--color-line))` }}
          >
            {/* Accent edge, coloured by how the connection is actually doing. */}
            <span aria-hidden className="absolute inset-x-0 top-0" style={{ height: 3, background: `linear-gradient(90deg, ${accent}, transparent 85%)` }} />

            <div className="flex items-start gap-3.5">
              <span className="relative shrink-0">
                <BrandLogo name={it.appName} size={46} />
                {live && (
                  <span
                    className="absolute -right-1 -bottom-1 dot pulse-dot"
                    style={{ width: 12, height: 12, background: "var(--color-live)", boxShadow: "0 0 0 2px var(--color-card)" }}
                  />
                )}
              </span>
              <Link href={`/run/${it.id}`} className="min-w-0 flex-1 group">
                <div className="font-display font-bold text-xl leading-tight group-hover:underline decoration-dotted truncate">
                  {it.appName}
                </div>
                <div className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                  {it.discovery?.category ?? "just added"} · {it.wire ? (it.wire.bidirectional ? "two-way sync" : "sends only") : "not wired yet"}
                </div>
              </Link>
              <StatusChip status={it.status} />
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-4">
              {it.connector?.verified && <HealthBadge it={it} onChange={(h) => setHealth(it.id, h)} />}
              <span className="text-[0.7rem]" style={{ color: "var(--color-muted)" }}>
                updated {timeAgo(it.updatedAt, now)}
              </span>
              <span className="flex-1" />
              <Link href={`/run/${it.id}`} className="text-xs font-semibold" style={{ color: "var(--color-signal)" }}>
                Open →
              </Link>
              <button
                onClick={() => remove(it.id)}
                aria-label={`Delete ${it.appName}`}
                className="text-xs px-2 py-1 rounded-lg transition-colors"
                style={{ color: "var(--color-muted)", border: "1px solid var(--color-line)" }}
              >
                remove
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
