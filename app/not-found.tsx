import Link from "next/link";

export const metadata = { title: "Lost the line · NodeWorm" };

// Branded 404. The default Next page is stark white and jars against the dark
// app; this keeps the night theme and the fishing motif, with a worm that
// drifted off the hook.
export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-24 text-center">
      <div className="relative mx-auto mb-8" style={{ width: 220, height: 150 }} aria-hidden>
        {/* a slack line and a worm that wandered off it */}
        <svg viewBox="0 0 220 150" className="absolute inset-0 w-full h-full" style={{ overflow: "visible" }}>
          <path
            d="M10,30 Q 90,70 130,58"
            fill="none"
            stroke="var(--color-line-2)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="6 7"
          />
          <circle cx="10" cy="30" r="5" fill="var(--color-amber)" />
        </svg>
        <span className="logo-float absolute" style={{ left: 128, top: 40 }}>
          <svg width="72" height="72" viewBox="0 0 48 48" aria-hidden>
            <circle cx="16" cy="26" r="9" fill="var(--color-aqua)" />
            <circle cx="26" cy="22" r="10" fill="var(--color-aqua)" />
            <circle cx="36" cy="26" r="12" fill="var(--color-aqua)" />
            <circle cx="36" cy="30" r="6" fill="#eaf7fb" />
            <circle cx="40" cy="21" r="3.6" fill="#fff" />
            <circle cx="41" cy="21" r="1.7" fill="var(--color-ink)" />
            <path d="M38,31 Q43,35 47,29" fill="none" stroke="var(--color-ink)" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
      </div>

      <div className="kicker mb-3">404</div>
      <h1 className="display-xl text-[clamp(2.2rem,5vw,3.4rem)] mb-3">
        This worm <span className="gradient-text">wriggled off.</span>
      </h1>
      <p className="text-base max-w-md mx-auto mb-8" style={{ color: "var(--color-ink-soft)" }}>
        The page you were after is not on the line. It may have been moved, or never existed. Let&apos;s reel you back
        to something real.
      </p>

      <div className="flex items-center justify-center gap-3 flex-wrap">
        <Link href="/" className="btn btn-signal btn-shimmer">
          Back to NodeWorm
        </Link>
        <Link href="/flows" className="btn btn-ghost">
          Your automations
        </Link>
      </div>
    </div>
  );
}
