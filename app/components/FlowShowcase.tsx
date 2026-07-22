import { BrandLogo } from "./BrandLogo";

// A demo automation running on a loop: four steps light up in sequence with a
// rainbow rail filling beside them. Pure CSS timing (globals.css demo-* rules),
// no JS, reduced-motion safe. This replaces the old terminal-style console as
// the landing page's "watch it run" moment.
const STEPS = [
  { app: "Stripe", title: "Payment received", detail: "$149.00 from amy@shopmail.com", color: "var(--color-signal)" },
  { app: "", title: "Only continue if it's over $100", detail: "149 > 100, keep going", color: "var(--color-amber)" },
  { app: "", title: "AI writes a thank-you note", detail: "“Amy, you legend. Order's on its way.”", color: "var(--color-grape)", ai: true },
  { app: "Slack", title: "Posted to #wins", detail: "Team notified, nobody lifted a finger", color: "var(--color-live)" },
];

export function FlowShowcase() {
  return (
    <div className="card-pop p-6 sm:p-8 relative overflow-hidden" style={{ background: "var(--color-paper-2)" }}>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <span className="dot" style={{ width: 10, height: 10, background: "var(--color-live)" }} />
          <span className="font-display font-bold">New payment, handled</span>
        </div>
        <span className="chip">
          <span className="dot" style={{ background: "var(--color-live)" }} />
          on
        </span>
      </div>

      <div className="relative pl-7">
        <span className="absolute left-[9px] top-2 bottom-2 w-[3px] rounded-full demo-rail" aria-hidden />
        <div className="space-y-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="demo-step card p-4 flex items-center gap-3.5" data-slot={i}>
              {s.app ? (
                <BrandLogo name={s.app} size={38} />
              ) : (
                <span
                  className="grid place-items-center rounded-xl shrink-0 font-display font-extrabold"
                  style={{ width: 38, height: 38, background: `color-mix(in srgb, ${s.color} 16%, var(--color-paper))`, color: s.color, fontSize: 17 }}
                >
                  {s.ai ? "AI" : "?"}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-[0.95rem] leading-tight">{s.title}</div>
                <div className="text-xs mt-0.5 truncate" style={{ color: "var(--color-muted)" }}>
                  {s.detail}
                </div>
              </div>
              <span className="demo-tick grid place-items-center rounded-full shrink-0" data-slot={i} style={{ width: 24, height: 24, background: s.color, color: "#fff" }} aria-hidden>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6.2 5 9l5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-5 text-xs text-center" style={{ color: "var(--color-muted)" }}>
        Built from one sentence. Runs forever. Tells you if it ever needs you.
      </p>
    </div>
  );
}
