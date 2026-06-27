export function Mark({ size = 30 }: { size?: number }) {
  // A node-graph glyph: a hub wiring out to satellites. The "swarm".
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <line x1="16" y1="16" x2="6" y2="6" stroke="var(--color-ink)" strokeWidth="1.6" />
      <line x1="16" y1="16" x2="27" y2="9" stroke="var(--color-ink)" strokeWidth="1.6" />
      <line x1="16" y1="16" x2="8" y2="26" stroke="var(--color-ink)" strokeWidth="1.6" />
      <line x1="16" y1="16" x2="26" y2="25" stroke="var(--color-ink)" strokeWidth="1.6" />
      <circle cx="6" cy="6" r="3" fill="var(--color-teal)" />
      <circle cx="27" cy="9" r="2.4" fill="var(--color-ink)" />
      <circle cx="8" cy="26" r="2.4" fill="var(--color-ink)" />
      <circle cx="26" cy="25" r="3" fill="var(--color-live)" />
      <circle cx="16" cy="16" r="5" fill="var(--color-signal)" />
      <circle cx="16" cy="16" r="5" stroke="var(--color-ink)" strokeWidth="1.2" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      <Mark />
      <span className="font-display font-extrabold text-[1.32rem] tracking-tight">
        nodeworm
        <span style={{ color: "var(--color-signal)" }}>.</span>
      </span>
    </span>
  );
}
