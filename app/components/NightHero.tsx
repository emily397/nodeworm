"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const EXAMPLES = [
  '"Add every new Shopify order to Google Sheets"',
  '"Summarise yesterday\'s orders with AI, every morning"',
  '"When a Typeform response arrives, open a GitHub issue"',
];

// The hero from home-vibrant: the angler casts a line that lands on the live
// headline word, a worm rides the line, a spark pops on the catch. The line is
// recomputed from the word's real measured position, so it stays hooked at any
// viewport size. The composer is real: it drafts a flow and opens the builder.
export function NightHero() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const lineRef = useRef<SVGPathElement>(null);
  const wormRef = useRef<SVGGElement>(null);
  const wordRef = useRef<HTMLSpanElement>(null);
  const sparkRef = useRef<SVGGElement>(null);

  const align = useCallback(() => {
    const svg = svgRef.current;
    const line = lineRef.current;
    const worm = wormRef.current;
    const word = wordRef.current;
    const spark = sparkRef.current;
    if (!svg || !line || !worm || !word || !svg.getScreenCTM) return;
    const m = svg.getScreenCTM();
    if (!m) return;
    const r = word.getBoundingClientRect();
    const p = svg.createSVGPoint();
    p.x = r.left + r.width * 0.5;
    p.y = r.top;
    const u = p.matrixTransform(m.inverse());
    u.y -= 14;
    // When the hero's aspect ratio differs sharply from the viewBox (narrow or
    // very tall viewports), "meet" letterboxes the art and the word maps far
    // outside the canvas. Keep the default decorative arc rather than draw a
    // line shooting off-screen.
    if (u.x < -200 || u.x > 1400 || u.y < -200 || u.y > 740) return;
    const tx = 986;
    const ty = 214;
    const mx = ((tx + u.x) / 2).toFixed(0);
    const ay = (Math.min(ty, u.y) - 150).toFixed(0);
    const d = `M${tx},${ty} Q ${mx},${ay} ${u.x.toFixed(0)},${u.y.toFixed(0)}`;
    line.setAttribute("d", d);
    worm.style.offsetPath = `path('${d}')`;
    if (spark) spark.setAttribute("transform", `translate(${(u.x - 246).toFixed(0)},${(u.y - 150).toFixed(0)})`);
  }, []);

  useEffect(() => {
    const timers = [0, 250, 700, 1500, 2600].map((t) => setTimeout(align, t));
    addEventListener("resize", align);
    return () => {
      timers.forEach(clearTimeout);
      removeEventListener("resize", align);
    };
  }, [align]);

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
    <section
      style={{
        position: "relative",
        overflow: "hidden",
        padding: "67px 90px 45px",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "17px",
        minHeight: 540,
      }}
    >
      <span style={{ position: "absolute", left: "40%", top: "12%", width: 9, height: 9, borderRadius: "50%", background: "#ff5ea0", boxShadow: "0 0 16px #ff5ea0", opacity: 0.9, animation: "nwBreathe 2.6s ease-in-out .6s infinite", zIndex: 1, pointerEvents: "none" }} />
      <span style={{ position: "absolute", left: "54%", top: "74%", width: 8, height: 8, borderRadius: "50%", background: "#38c6e8", boxShadow: "0 0 15px #38c6e8", opacity: 0.9, animation: "nwBreathe 3.4s ease-in-out .3s infinite", zIndex: 1, pointerEvents: "none" }} />
      <span style={{ position: "absolute", left: "16%", top: "80%", width: 7, height: 7, borderRadius: "50%", background: "#ffd23f", boxShadow: "0 0 14px #ffd23f", opacity: 0.85, animation: "nwBreathe 2.9s ease-in-out .9s infinite", zIndex: 1, pointerEvents: "none" }} />

      <div style={{ flex: "1 1 420px", maxWidth: 640, position: "relative", zIndex: 2, animation: "nwFadeUp 0.8s ease both" }}>
        <div style={{ marginBottom: 11.2, fontWeight: 600, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "#ffa03d", height: 16 }}>
          <span style={{ display: "inline-block", overflow: "hidden", whiteSpace: "nowrap", borderRight: "2px solid #ff5ea0", paddingRight: 2, animation: "nwType 6s steps(30,end) infinite, nwCaret 0.7s step-end infinite" }}>
            Automation that builds itself
          </span>
        </div>

        <h1 style={{ fontSize: "clamp(46px,6.2vw,78px)", margin: "8.4px 0 11.2px", lineHeight: 1.04, color: "var(--nw-n100)", fontWeight: 600, letterSpacing: "-0.015em" }}>
          Your{" "}
          <span
            ref={wordRef}
            style={{ display: "inline-block", background: "linear-gradient(100deg,#ff5ea0,#ffa03d 55%,#ffd23f)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", animation: "nwWordWiggle 4.5s ease-in-out 1.5s infinite" }}
          >
            apps.
          </span>
          <br />
          On autopilot.
        </h1>

        <p style={{ fontSize: "clamp(16px,1.6vw,18px)", maxWidth: 500, opacity: 0.82 }}>
          Describe what you want in plain English. NodeWorm finds the apps, wires every step, and keeps it running, even
          the ones other tools can&apos;t reach.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 5.6, margin: "17px 0 8.4px", maxWidth: 560 }}>
          <input
            className="nw-input"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && build()}
            placeholder="When a Stripe payment lands, tell the team in Slack"
            aria-label="Describe your automation"
            style={{ flex: "1 1 260px" }}
          />
          <button onClick={build} disabled={busy} className="nw-btn nw-btn-primary" style={{ flex: "none" }}>
            {busy ? "Building..." : "Build it free"} <Arrow />
          </button>
        </div>

        {notice && (
          <p style={{ maxWidth: 560, margin: "0 0 8px", fontSize: 13, color: "#ffd23f" }}>{notice}</p>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, maxWidth: 560 }}>
          {EXAMPLES.map((ex) => (
            <button key={ex} className="nw-tag" onClick={() => setPrompt(ex.replace(/^"|"$/g, ""))} style={{ cursor: "pointer", border: 0, font: "inherit", fontSize: 11 }}>
              {ex}
            </button>
          ))}
        </div>

        <p className="nw-muted" style={{ fontSize: 12, marginTop: 11.2 }}>
          No credit card. No code. Cancel anytime.
        </p>
      </div>

      <div style={{ flex: "1 1 360px", minWidth: 320, minHeight: 360 }} aria-hidden />

      <div
        style={{
          position: "absolute",
          right: "6%",
          top: "44%",
          width: "min(46vw,560px)",
          height: 560,
          transform: "translateY(-50%)",
          borderRadius: "50%",
          background: "radial-gradient(circle,#ff5ea0,#ffa03d 68%,transparent 75%)",
          filter: "blur(80px)",
          opacity: 0,
          animation: "nwGlowIn 1.2s ease-out 0.2s both, nwGlowBreathe 4s ease-in-out 1.4s infinite",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      <svg
        ref={svgRef}
        viewBox="0 0 1200 540"
        preserveAspectRatio="xMidYMid meet"
        className="nw-hero-art"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible", zIndex: 3 }}
        aria-hidden
      >
        <path
          ref={lineRef}
          d="M986,214 Q 590,20 250,150"
          fill="none"
          stroke="#ffd23f"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="1000"
          style={{ animation: "nwLineCast 4.5s ease-in-out 1.5s infinite" }}
        />

        {/* The angler */}
        <g transform="translate(720,150) scale(0.9)">
          <g style={{ animation: "nwSettle 1s ease-out 0.1s both" }}>
            <ellipse cx="88" cy="305" rx="26" ry="12" fill="var(--nw-n900)" />
            <ellipse cx="132" cy="308" rx="26" ry="12" fill="var(--nw-n900)" />
            <g style={{ animation: "nwBob 4s ease-in-out 1.2s infinite" }}>
              <circle cx="110" cy="250" r="50" fill="#7c6be0" />
              <circle cx="110" cy="176" r="44" fill="#ff5ea0" />
              <circle cx="80" cy="186" r="12" fill="#a7d94b" />
              <path d="M70,150 Q110,132 150,150" fill="none" stroke="#d6006c" strokeWidth="7" strokeLinecap="round" />
              <circle cx="112" cy="108" r="38" fill="#ffd9b0" />
              <circle cx="88" cy="118" r="9" fill="#ff5ea0" />
              <circle cx="136" cy="118" r="9" fill="#ff5ea0" />
              <circle cx="114" cy="114" r="6" fill="#f2bd8e" />
              <circle cx="100" cy="100" r="10" fill="var(--nw-n100)" />
              <circle cx="126" cy="100" r="10" fill="var(--nw-n100)" />
              <circle cx="103" cy="102" r="5" fill="var(--nw-n900)" />
              <circle cx="129" cy="102" r="5" fill="var(--nw-n900)" />
              <circle cx="105" cy="99" r="1.8" fill="var(--nw-n100)" />
              <circle cx="131" cy="99" r="1.8" fill="var(--nw-n100)" />
              <path d="M104,122 Q114,130 124,122" fill="none" stroke="var(--nw-n900)" strokeWidth="3" strokeLinecap="round" />
              <ellipse cx="112" cy="80" rx="52" ry="14" fill="#ffa03d" />
              <path d="M78,80 Q78,44 112,44 Q146,44 146,80 Z" fill="#ffa03d" />
              <path d="M78,74 Q112,64 146,74" fill="none" stroke="#ff5ea0" strokeWidth="7" strokeLinecap="round" />
              <ellipse cx="92" cy="164" rx="10" ry="17" fill="#ffffff" opacity="0.5" />
              <ellipse cx="98" cy="92" rx="7" ry="10" fill="#ffffff" opacity="0.45" />
              <ellipse cx="95" cy="58" rx="9" ry="5" fill="#ffffff" opacity="0.4" />
            </g>
            <g style={{ animation: "nwRodCast 4.5s ease-in-out 1.5s infinite", transformOrigin: "150px 150px", transformBox: "view-box" }}>
              <path d="M150,150 L300,72" fill="none" stroke="var(--nw-n400)" strokeWidth="5" strokeLinecap="round" />
              <circle cx="150" cy="150" r="9" fill="#ffd9b0" />
              <circle cx="168" cy="140" r="6" fill="var(--nw-n800)" />
            </g>
          </g>
        </g>

        {/* The worm, riding the cast line */}
        <g ref={wormRef} style={{ offsetPath: "path('M986,214 Q 590,20 250,150')", offsetRotate: "0deg", animation: "nwTravel 4.5s cubic-bezier(.34,1.3,.5,1) 1.5s infinite" }}>
          <path d="M2,-14 a8,8 0 1 1 -5,7" fill="none" stroke="var(--nw-n400)" strokeWidth="2.5" />
          <circle cx="-16" cy="-2" r="9" fill="#38c6e8" />
          <circle cx="-3" cy="-8" r="10" fill="#38c6e8" />
          <circle cx="14" cy="0" r="12" fill="#38c6e8" />
          <circle cx="14" cy="3" r="6" fill="#eaf7fb" />
          <circle cx="9" cy="-4" r="2.5" fill="#ffffff" />
          <circle cx="20" cy="-6" r="3.4" fill="var(--nw-n100)" />
          <circle cx="21" cy="-6" r="1.6" fill="var(--nw-n900)" />
          <path d="M16,3 Q22,7 27,2" fill="none" stroke="var(--nw-n900)" strokeWidth="2" strokeLinecap="round" />
        </g>

        {/* Catch spark */}
        <g ref={sparkRef}>
          <g style={{ animation: "nwSpark 4.5s ease-out 1.5s infinite", transformOrigin: "246px 150px", transformBox: "view-box" }} stroke="#ffd23f" strokeWidth="3" strokeLinecap="round">
            <line x1="246" y1="132" x2="246" y2="120" />
            <line x1="246" y1="168" x2="246" y2="180" />
            <line x1="228" y1="150" x2="216" y2="150" />
            <line x1="264" y1="150" x2="276" y2="150" stroke="#ff5ea0" />
            <line x1="232" y1="136" x2="223" y2="127" stroke="#38c6e8" />
            <line x1="260" y1="164" x2="269" y2="173" stroke="#ff5ea0" />
          </g>
        </g>

        {/* The peeker, bottom left */}
        <g style={{ animation: "nwSettle 1s ease-out 0.7s both, nwPeek 3.2s ease-in-out 1.8s infinite", transformOrigin: "150px 490px", transformBox: "view-box" }}>
          <path d="M96,506 Q104,470 132,470" fill="none" stroke="#ff5ea0" strokeWidth="20" strokeLinecap="round" />
          <circle cx="152" cy="472" r="22" fill="#ff5ea0" />
          <ellipse cx="145" cy="482" rx="8" ry="11" fill="#ffffff" opacity="0.4" />
          <circle cx="150" cy="468" r="5" fill="#ffffff" />
          <circle cx="161" cy="468" r="5" fill="#ffffff" />
          <circle cx="151" cy="468" r="2.4" fill="#241f1c" />
          <circle cx="162" cy="468" r="2.4" fill="#241f1c" />
          <path d="M148,478 Q156,485 165,478" fill="none" stroke="#241f1c" strokeWidth="2.4" strokeLinecap="round" />
          <line x1="152" y1="452" x2="152" y2="460" stroke="#ff5ea0" strokeWidth="3" strokeLinecap="round" />
          <circle cx="152" cy="448" r="4" fill="#ffd23f" />
        </g>
      </svg>
    </section>
  );
}

export function Arrow() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 8h9M9 4.5 12.5 8 9 11.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
