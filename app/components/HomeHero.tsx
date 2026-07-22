"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BrandLogo } from "./BrandLogo";

const EXAMPLES = [
  "When a Stripe payment lands, add it to Notion and tell the team in Slack",
  "Every morning, summarise yesterday's Shopify orders with AI",
  "When a Typeform response arrives, open a GitHub issue",
];

// The hero IS the product: type what you want, NodeWorm builds the automation
// and drops you straight into it. Same endpoint the /flows composer uses.
export function HomeHero() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function build() {
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
      setNotice(data.clarify?.question ?? data.unmappable ?? data.error ?? "Try describing it a little differently.");
    } catch {
      setNotice("Something hiccuped; try again.");
    }
    setBusy(false);
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && build()}
          placeholder="When a payment comes in on Stripe, add a row to Notion..."
          aria-label="Describe your automation"
          className="flex-1 rounded-2xl px-5 py-4 text-base outline-none"
          style={{ background: "var(--color-card)", border: "2px solid var(--color-line-2)", color: "var(--color-ink)", boxShadow: "var(--shadow-soft)" }}
        />
        <button onClick={build} disabled={busy || !prompt.trim()} className="btn btn-signal btn-shimmer text-base px-6 py-4 whitespace-nowrap">
          {busy ? "building..." : "Build it free →"}
        </button>
      </div>
      {notice && (
        <p className="mt-3 text-sm rounded-xl px-4 py-2.5" style={{ border: "1px solid color-mix(in srgb, var(--color-amber) 45%, transparent)", color: "var(--color-ink-soft)" }}>
          {notice}
        </p>
      )}
      <div className="mt-4 flex flex-col gap-1.5">
        {EXAMPLES.map((ex, i) => (
          <button
            key={ex}
            onClick={() => setPrompt(ex)}
            className="rise text-left text-[0.82rem] px-1 py-0.5 w-fit hover:underline decoration-dotted"
            style={{ color: "var(--color-muted)", animationDelay: `${240 + i * 70}ms` }}
          >
            &ldquo;{ex}&rdquo;
          </button>
        ))}
      </div>
    </div>
  );
}

// Real app logos wired into the NodeWorm hub, pulses riding the wires. Pure
// CSS/SVG motion, reduced-motion safe, zero external assets.
const ORBIT: Array<{ name: string; x: number; y: number; size: number; delay: number }> = [
  { name: "Stripe", x: 6, y: 12, size: 44, delay: 0 },
  { name: "Slack", x: 78, y: 4, size: 40, delay: 0.6 },
  { name: "Notion", x: 88, y: 44, size: 46, delay: 1.2 },
  { name: "Gmail", x: 8, y: 62, size: 40, delay: 1.8 },
  { name: "Shopify", x: 30, y: 88, size: 42, delay: 0.9 },
  { name: "GitHub", x: 74, y: 84, size: 40, delay: 1.5 },
  { name: "Airtable", x: 34, y: 2, size: 36, delay: 2.1 },
];

// Wires from each logo (percent coords) into the hub at 50,47.
const WIRES = ORBIT.map((o) => {
  const x1 = o.x + 4;
  const y1 = o.y + 6;
  const mx = (x1 + 50) / 2 + (y1 < 47 ? 6 : -6);
  const my = (y1 + 47) / 2 + (x1 < 50 ? -5 : 5);
  return { d: `M ${x1} ${y1} Q ${mx} ${my} 50 47`, delay: o.delay };
});

export function Constellation() {
  return (
    <div className="relative w-full" style={{ aspectRatio: "1.06" }} aria-hidden>
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {WIRES.map((w, i) => (
          <path key={i} className="constellation-wire" d={w.d} style={{ animationDelay: `${w.delay * -1}s` }} vectorEffect="non-scaling-stroke" />
        ))}
        {/* Pulses ride the wires via SMIL so they stay in viewBox coordinates at any
            container size. The whole group hides under prefers-reduced-motion. */}
        <g className="motion-only">
          {WIRES.map((w, i) => (
            <circle key={`p${i}`} r="1.4" fill="var(--color-signal)">
              <animateMotion dur="3.2s" repeatCount="indefinite" begin={`${w.delay}s`} path={w.d} />
            </circle>
          ))}
        </g>
      </svg>
      {ORBIT.map((o) => (
        <span key={o.name} className="absolute logo-float" style={{ left: `${o.x}%`, top: `${o.y}%`, animationDelay: `${o.delay}s` }}>
          <BrandLogo name={o.name} size={o.size} />
        </span>
      ))}
      <div
        className="hub-glow absolute grid place-items-center rounded-3xl font-display font-extrabold"
        style={{
          left: "50%",
          top: "47%",
          transform: "translate(-50%, -50%)",
          width: 92,
          height: 92,
          background: "linear-gradient(135deg, var(--color-signal), var(--color-berry))",
          color: "#fff",
          fontSize: 15,
          letterSpacing: "-0.02em",
        }}
      >
        worm
      </div>
    </div>
  );
}
