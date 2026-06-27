"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const PAIRS: [string, string][] = [
  ["Stripe", "Notion"],
  ["GitHub", "Slack"],
  ["Shopify", "Airtable"],
  ["Calendly", "HubSpot"],
];

export function BridgeConsole() {
  const router = useRouter();
  const [source, setSource] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [desc, setDesc] = useState("");
  const [descBusy, setDescBusy] = useState(false);

  const pairMode = target.trim().length > 0;

  async function describe() {
    const prompt = desc.trim();
    if (!prompt || descBusy) return;
    setDescBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const { redirect } = await res.json();
      router.push(redirect);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setDescBusy(false);
    }
  }

  async function go() {
    const s = source.trim();
    const t = target.trim();
    if (!s || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (t) {
        const res = await fetch("/api/bridges", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ source: s, target: t }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
        const { bridge } = await res.json();
        router.push(`/bridge/${bridge.id}`);
      } else {
        const res = await fetch("/api/integrations", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ app: s, appUrl: sourceUrl.trim() || undefined }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
        const { integration } = await res.json();
        router.push(`/run/${integration.id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div className="rise" style={{ animationDelay: "120ms" }}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void go();
        }}
        className="card overflow-hidden"
        style={{ boxShadow: "var(--shadow-lift)" }}
      >
        <div className="flex items-center gap-2 px-4 h-10 border-b hairline" style={{ background: "var(--color-paper-2)" }}>
          <span className="dot" style={{ background: "var(--color-signal)" }} />
          <span className="dot" style={{ background: "var(--color-line-2)" }} />
          <span className="dot" style={{ background: "var(--color-line-2)" }} />
          <span className="font-mono text-[0.7rem] ml-2" style={{ color: "var(--color-muted)" }}>
            nodeworm://new-bridge
          </span>
          <span className="flex-1" />
          <span
            className="font-mono text-[0.6rem] uppercase tracking-wider px-2 py-0.5 rounded"
            style={{
              color: pairMode ? "var(--color-live)" : "var(--color-muted)",
              border: `1px solid ${pairMode ? "var(--color-live)" : "var(--color-line-2)"}`,
            }}
          >
            {pairMode ? "bridge mode" : "single app"}
          </span>
        </div>

        <div className="px-5 py-5">
          <div className="flex items-center gap-3">
            <span className="font-mono text-lg w-16 shrink-0" style={{ color: "var(--color-signal)" }}>
              connect
            </span>
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              disabled={busy}
              autoFocus
              placeholder="an app name or URL..."
              className="flex-1 min-w-0 bg-transparent outline-none font-mono text-lg placeholder:opacity-40"
              style={{ color: "var(--color-ink)" }}
              aria-label="Source app"
            />
          </div>

          {/* Optional site URL: pins WHICH app (same-named apps) + sharpens the
              autonomous research. Only relevant when connecting a single app. */}
          {!pairMode && (
            <div className="flex items-center gap-3 mt-2">
              <span className="font-mono text-xs w-16 shrink-0" style={{ color: "var(--color-muted)" }}>
                site url
              </span>
              <input
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                disabled={busy}
                placeholder="signal.org (optional, pins which app + sharpens research)"
                className="flex-1 min-w-0 bg-transparent outline-none font-mono text-xs placeholder:opacity-40"
                style={{ color: "var(--color-ink-soft)" }}
                aria-label="App public URL (optional)"
              />
            </div>
          )}

          <div className="flex items-center gap-3 my-2.5">
            <span className="w-16 shrink-0 grid place-items-center">
              <BridgeGlyph active={pairMode} />
            </span>
            <span className="flex-1 border-t hairline" />
          </div>

          <div className="flex items-center gap-3">
            <span className="font-mono text-lg w-16 shrink-0" style={{ color: "var(--color-teal)" }}>
              to
            </span>
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              disabled={busy}
              placeholder="another app (optional)..."
              className="flex-1 min-w-0 bg-transparent outline-none font-mono text-lg placeholder:opacity-40"
              style={{ color: "var(--color-ink)" }}
              aria-label="Target app"
            />
            <button type="submit" className="btn btn-signal shrink-0" disabled={busy}>
              {busy ? (pairMode ? "Bridging..." : "Dispatching...") : pairMode ? "Build the bridge" : "Run the swarm"}
              {!busy && <Arrow />}
            </button>
          </div>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <span className="font-mono text-xs" style={{ color: "var(--color-muted)" }}>
          try a bridge:
        </span>
        {PAIRS.map(([s, t]) => (
          <button
            key={s + t}
            type="button"
            disabled={busy}
            onClick={() => {
              setSource(s);
              setTarget(t);
            }}
            className="font-mono text-xs px-3 py-1.5 rounded-full border transition-all hover:-translate-y-0.5 inline-flex items-center gap-1.5"
            style={{ borderColor: "var(--color-line-2)", background: "var(--color-card)" }}
          >
            <span>{s}</span>
            <span style={{ color: "var(--color-signal)" }}>&#8644;</span>
            <span>{t}</span>
          </button>
        ))}
      </div>

      {/* Natural-language request: classify + route (bridge, export, migrate, build-mcp, connect). */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void describe();
        }}
        className="mt-4 flex items-center gap-2"
      >
        <span className="font-mono text-xs shrink-0" style={{ color: "var(--color-muted)" }}>
          or describe it:
        </span>
        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          disabled={descBusy}
          placeholder="export my Stripe customers into Notion, build an MCP for TickTick..."
          className="flex-1 min-w-0 bg-transparent outline-none font-mono text-xs px-2.5 py-2 rounded"
          style={{ border: "1px solid var(--color-line-2)", color: "var(--color-ink)" }}
          aria-label="Describe what you want"
        />
        <button type="submit" disabled={descBusy} className="btn btn-ghost text-xs shrink-0">
          {descBusy ? "routing..." : "go"}
        </button>
      </form>

      {error && (
        <p className="mt-3 font-mono text-xs" style={{ color: "var(--color-blocked)" }}>
          !! {error}
        </p>
      )}
    </div>
  );
}

function BridgeGlyph({ active }: { active: boolean }) {
  const c = active ? "var(--color-live)" : "var(--color-line-2)";
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden style={{ transition: "color 0.2s" }}>
      <path d="M3 6h12M11 3l4 3-4 3" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 12H3M7 15l-4-3 4-3" stroke={c} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Arrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 8h9M8 4l4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
