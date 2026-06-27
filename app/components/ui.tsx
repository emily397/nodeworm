import type { IntegrationStatus } from "@/lib/engine/types";
import { STATUS_META } from "./status";

export function StatusChip({ status }: { status: IntegrationStatus }) {
  const m = STATUS_META[status];
  return (
    <span className="chip" style={{ borderColor: "color-mix(in srgb, " + m.color + " 40%, var(--color-line-2))" }}>
      <span className={`dot ${m.dotClass}`} style={{ background: m.color }} />
      {m.label}
    </span>
  );
}

export function SectionLabel({ children, n }: { children: React.ReactNode; n?: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      {n && (
        <span
          className="font-mono text-xs px-2 py-0.5 rounded"
          style={{ background: "var(--color-ink)", color: "var(--color-paper)" }}
        >
          {n}
        </span>
      )}
      <span className="kicker">{children}</span>
      <span className="flex-1 border-t hairline" />
    </div>
  );
}
