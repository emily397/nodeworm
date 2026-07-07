"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { NODES, CATEGORY_COLOR, monogram, type Node } from "@/lib/catalog";

// Build-your-own worm: pick a node + a trigger on the left, a node + an action on the
// right, and cast. It composes a plain-language request and hands it to the SAME NL
// engine the ready-made worms use (/api/request), so it stands up a real bridge. Both
// node pickers accept ANY app you type, not just the pond, so the composer is limitless.
export function WormComposer() {
  const router = useRouter();
  const [source, setSource] = useState("");
  const [trigger, setTrigger] = useState("");
  const [target, setTarget] = useState("");
  const [action, setAction] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const ready = source.trim() && target.trim() && (trigger.trim() || action.trim());

  async function cast() {
    if (!ready || busy) return;
    setBusy(true);
    setErr(null);
    const t = trigger.trim() || "something happens";
    const a = action.trim() || `do the matching action in ${target.trim()}`;
    const prompt = `When ${t} in ${source.trim()}, ${a} in ${target.trim()}.`;
    try {
      const res = await fetch("/api/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (data.redirect) {
        router.push(data.redirect);
        return;
      }
      setErr(data.error ?? "Couldn't cast that worm. Try naming the trigger and action more plainly.");
    } catch {
      setErr("Couldn't cast that worm.");
    }
    setBusy(false);
  }

  return (
    <div className="card p-5 sm:p-6 rise" style={{ background: "var(--color-paper-2)", boxShadow: "var(--shadow-lift)" }}>
      <div className="grid md:grid-cols-[1fr_auto_1fr] gap-4 md:gap-3 items-stretch">
        {/* WHEN side */}
        <Side
          kicker="when"
          kickerColor="var(--color-teal)"
          node={source}
          onNode={setSource}
          phrase={trigger}
          onPhrase={setTrigger}
          phrasePlaceholder="a new order comes in"
        />

        {/* the worm on the line */}
        <div className="hidden md:flex flex-col items-center justify-center px-1" aria-hidden>
          <div className="relative h-full min-h-[2.5rem] w-16 grid place-items-center">
            <span className="block w-full h-px" style={{ background: "repeating-linear-gradient(90deg, var(--color-line-2) 0 5px, transparent 5px 9px)" }} />
            <span className="absolute rounded-full worm-bob" style={{ width: 9, height: 9, background: "var(--color-signal)" }} />
          </div>
        </div>
        <div className="md:hidden flex items-center justify-center gap-2 font-mono text-[0.6rem] uppercase tracking-wider" style={{ color: "var(--color-signal)" }} aria-hidden>
          <span className="dot" style={{ background: "var(--color-signal)" }} /> then
        </div>

        {/* THEN side */}
        <Side
          kicker="then"
          kickerColor="var(--color-signal)"
          node={target}
          onNode={setTarget}
          phrase={action}
          onPhrase={setAction}
          phrasePlaceholder="post it to the channel"
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button onClick={cast} disabled={!ready || busy} className="btn btn-signal text-sm justify-center">
          {busy ? "Casting…" : "Cast this worm ↗"}
        </button>
        <span className="font-mono text-[0.66rem]" style={{ color: "var(--color-muted)" }}>
          {ready
            ? `when ${source.trim()} → ${target.trim()}`
            : "pick two nodes and describe the hook"}
        </span>
      </div>
      {err && (
        <p className="mt-2 text-[0.8rem]" style={{ color: "var(--color-signal-2)" }}>
          {err}
        </p>
      )}
    </div>
  );
}

function Side({
  kicker,
  kickerColor,
  node,
  onNode,
  phrase,
  onPhrase,
  phrasePlaceholder,
}: {
  kicker: string;
  kickerColor: string;
  node: string;
  onNode: (v: string) => void;
  phrase: string;
  onPhrase: (v: string) => void;
  phrasePlaceholder: string;
}) {
  return (
    <div className="rounded-xl p-3.5" style={{ background: "var(--color-paper)", border: "1px solid var(--color-line-2)" }}>
      <div className="font-mono text-[0.58rem] uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: kickerColor }}>
        <span className="dot" style={{ background: kickerColor }} /> {kicker}
      </div>
      <NodePicker value={node} onChange={onNode} />
      <input
        value={phrase}
        onChange={(e) => onPhrase(e.target.value)}
        placeholder={phrasePlaceholder}
        className="mt-2.5 w-full bg-transparent outline-none text-sm px-3 py-2 rounded-lg"
        style={{ border: "1px solid var(--color-line-2)", color: "var(--color-ink)" }}
        aria-label={`${kicker} detail`}
      />
    </div>
  );
}

// A combobox over the pond that also accepts any app you type (go-fish built in).
function NodePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const q = value.trim().toLowerCase();
  const known: Node | undefined = useMemo(() => NODES.find((n) => n.name.toLowerCase() === q), [q]);
  const matches = useMemo(
    () => (q ? NODES.filter((n) => n.name.toLowerCase().includes(q)).slice(0, 6) : NODES.slice(0, 6)),
    [q],
  );

  return (
    <div ref={boxRef} className="relative">
      <div className="flex items-center gap-2 rounded-lg px-2.5 py-2" style={{ border: "1px solid var(--color-line-2)", background: "var(--color-paper-2)" }}>
        {known ? <Mono name={known.name} category={known.category} /> : value.trim() ? <Mono name={value} /> : <span className="grid place-items-center rounded-md text-sm" style={{ width: 30, height: 30, background: "var(--color-paper)", border: "1px dashed var(--color-line-2)", color: "var(--color-muted)" }}>🪝</span>}
        <input
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (!open) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === "Enter" && matches[active]) { e.preventDefault(); onChange(matches[active].name); setOpen(false); }
            else if (e.key === "Escape") setOpen(false);
          }}
          placeholder="a node, or any app…"
          className="flex-1 bg-transparent outline-none text-sm font-semibold"
          style={{ color: "var(--color-ink)" }}
          aria-label="Node"
        />
      </div>
      {open && matches.length > 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-lg overflow-hidden" style={{ background: "var(--color-paper)", border: "1px solid var(--color-line-2)", boxShadow: "var(--shadow-lift)" }}>
          {matches.map((n, i) => (
            <button
              key={n.name}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onChange(n.name); setOpen(false); }}
              onMouseEnter={() => setActive(i)}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 text-left"
              style={{ background: i === active ? "var(--color-paper-2)" : "transparent" }}
            >
              <Mono name={n.name} category={n.category} size={26} />
              <span className="text-sm font-medium">{n.name}</span>
            </button>
          ))}
          {q && !known && (
            <div className="px-2.5 py-2 font-mono text-[0.6rem]" style={{ color: "var(--color-muted)", borderTop: "1px solid var(--color-line-2)" }}>
              or press cast to go fish for “{value.trim()}”
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Mono({ name, category, size = 30 }: { name: string; category?: Node["category"]; size?: number }) {
  const c = category ? CATEGORY_COLOR[category] : "var(--color-signal)";
  return (
    <span
      className="grid place-items-center rounded-md font-display font-bold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.42, color: c, background: `color-mix(in srgb, ${c} 15%, var(--color-paper))`, border: `1px solid color-mix(in srgb, ${c} 40%, transparent)` }}
    >
      {monogram(name)}
    </span>
  );
}
