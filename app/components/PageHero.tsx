// The landing page's headline treatment, reusable on inner pages so the whole
// site reads as one design: coloured kicker, big display headline with a
// gradient word, subtitle, and glowing stat figures.

export function PageHero({
  kicker,
  kickerColor = "var(--color-berry)",
  title,
  accent,
  tail,
  sub,
  children,
}: {
  kicker: string;
  kickerColor?: string;
  title: string;
  accent?: string;
  tail?: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden mb-9">
      {/* Warm bloom behind the headline, the hero glow scaled down. */}
      <span
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          left: "-8%",
          top: "-120%",
          width: "min(52vw,560px)",
          height: 460,
          borderRadius: "50%",
          background: "radial-gradient(circle, var(--color-signal), var(--color-berry) 66%, transparent 74%)",
          filter: "blur(90px)",
          opacity: 0.28,
        }}
      />
      <div className="relative">
        <div
          className="rise mb-3 text-xs font-semibold uppercase"
          style={{ letterSpacing: "0.14em", color: kickerColor }}
        >
          {kicker}
        </div>
        <h1 className="display-xl rise text-[clamp(2.4rem,5.4vw,4rem)]" style={{ animationDelay: "40ms" }}>
          {title} {accent && <span className="gradient-text">{accent}</span>}
          {tail ? ` ${tail}` : ""}
        </h1>
        {sub && (
          <p className="rise mt-4 max-w-xl text-base" style={{ animationDelay: "90ms", color: "var(--color-ink-soft)" }}>
            {sub}
          </p>
        )}
        {children && (
          <div className="rise mt-6" style={{ animationDelay: "140ms" }}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

// Big glowing figures, matching the landing page's stat band.
export function GlowStats({ stats }: { stats: Array<{ value: React.ReactNode; label: string; color: string; rgb: string }> }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
      {stats.map((s, i) => (
        <div key={s.label} className="stat-pop" style={{ animationDelay: `${i * 100}ms` }}>
          <div
            className="font-display font-extrabold leading-none"
            style={{ fontSize: 42, color: s.color, textShadow: `0 0 24px rgba(${s.rgb},.55)` }}
          >
            {s.value}
          </div>
          <div className="mt-1.5 text-xs" style={{ color: "var(--color-muted)" }}>
            {s.label}
          </div>
        </div>
      ))}
    </div>
  );
}
