"use client";

import Link from "next/link";
import { useState } from "react";
import type { Integration } from "@/lib/engine/types";
import { StatusChip } from "@/app/components/ui";
import { timeAgo } from "@/app/components/status";

export function IntegrationsList({ initial }: { initial: Integration[] }) {
  const [items, setItems] = useState(initial);
  const now = Date.now();

  async function remove(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await fetch(`/api/integrations/${id}`, { method: "DELETE" }).catch(() => {});
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
