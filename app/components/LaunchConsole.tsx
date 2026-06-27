"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

const SUGGESTIONS = ["Stripe", "Notion", "TickTick", "Plaud", "Slack", "linear.app"];

export function LaunchConsole() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function launch(app: string) {
    const target = app.trim();
    if (!target || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ app: target }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const { integration } = await res.json();
      router.push(`/run/${integration.id}`);
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
          void launch(value);
        }}
        className="card overflow-hidden"
        style={{ boxShadow: "var(--shadow-lift)" }}
      >
        <div
          className="flex items-center gap-2 px-4 h-10 border-b hairline"
          style={{ background: "var(--color-paper-2)" }}
        >
          <span className="dot" style={{ background: "var(--color-signal)" }} />
          <span className="dot" style={{ background: "var(--color-line-2)" }} />
          <span className="dot" style={{ background: "var(--color-line-2)" }} />
          <span className="font-mono text-[0.7rem] ml-2" style={{ color: "var(--color-muted)" }}>
            nodeworm://new-connection
          </span>
        </div>

        <div className="flex items-center gap-3 px-5 py-5">
          <span className="font-mono text-lg" style={{ color: "var(--color-signal)" }}>
            connect
          </span>
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={busy}
            autoFocus
            placeholder="an app name or URL..."
            className="flex-1 bg-transparent outline-none font-mono text-lg placeholder:opacity-40"
            style={{ color: "var(--color-ink)" }}
            aria-label="App name or URL"
          />
          <button type="submit" className="btn btn-signal" disabled={busy}>
            {busy ? "Dispatching swarm..." : "Run the swarm"}
            {!busy && <Arrow />}
          </button>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <span className="font-mono text-xs" style={{ color: "var(--color-muted)" }}>
          try:
        </span>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy}
            onClick={() => {
              setValue(s);
              void launch(s);
            }}
            className="font-mono text-xs px-3 py-1.5 rounded-full border transition-all hover:-translate-y-0.5"
            style={{ borderColor: "var(--color-line-2)", background: "var(--color-card)" }}
          >
            {s}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-3 font-mono text-xs" style={{ color: "var(--color-blocked)" }}>
          !! {error}
        </p>
      )}
    </div>
  );
}

function Arrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 8h9M8 4l4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
