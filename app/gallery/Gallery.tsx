"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { NODES, WORMS, CATEGORY_COLOR, CATEGORY_LABEL, monogram, type Node, type NodeCategory, type Worm } from "@/lib/catalog";
import { WormComposer } from "./WormComposer";

export interface MyWorm {
  id: string;
  from: string;
  to: string;
  status: string;
}

// The categories present in the pond, in a stable display order.
const CATS: NodeCategory[] = ["messaging", "productivity", "dev", "finance", "crm", "commerce", "scheduling", "storage", "marketing"];

export function Gallery({ myWorms = [] }: { myWorms?: MyWorm[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<NodeCategory | "all">("all");
  const [castingWorm, setCastingWorm] = useState<string | null>(null);
  const [castingNode, setCastingNode] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      NODES.filter(
        (n) =>
          (cat === "all" || n.category === cat) &&
          (!q || n.name.toLowerCase().includes(q) || CATEGORY_LABEL[n.category].includes(q)),
      ),
    [q, cat],
  );
  // Exact-ish match check drives whether "go fish" is offered for the typed name.
  const hasExact = q.length > 0 && NODES.some((n) => n.name.toLowerCase() === q);

  // Cast a worm: the plain-language prompt becomes a real bridge via the NL engine.
  async function castWorm(w: Worm) {
    if (castingWorm) return;
    setCastingWorm(w.prompt);
    setErr(null);
    try {
      const res = await fetch("/api/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: w.prompt }),
      });
      const data = await res.json();
      if (data.redirect) {
        router.push(data.redirect);
        return;
      }
      setErr(data.error ?? "Couldn't cast that worm.");
    } catch {
      setErr("Couldn't cast that worm.");
    }
    setCastingWorm(null);
  }

  // Catch a node: stand up a single-app connection. Works for a listed node OR any
  // app name you "go fish" for (NodeWorm finds the method for whatever you catch).
  async function catchNode(name: string) {
    if (castingNode) return;
    setCastingNode(name);
    setErr(null);
    try {
      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ app: name }),
      });
      const data = await res.json();
      if (data.integration?.id) {
        router.push(`/run/${data.integration.id}`);
        return;
      }
      setErr(data.error ?? "Line snapped. Try again.");
    } catch {
      setErr("Line snapped. Try again.");
    }
    setCastingNode(null);
  }

  return (
    <div className="mx-auto max-w-6xl px-5 pb-24">
      {/* Hero */}
      <section className="pt-16 pb-10">
        <div className="kicker rise mb-4">The tackle box</div>
        <h1 className="display-xl rise text-[clamp(2.4rem,5.5vw,4rem)] max-w-3xl" style={{ animationDelay: "40ms" }}>
          Cast a worm.{" "}
          <span className="gradient-text">Catch any node.</span>
        </h1>
        <p className="rise mt-5 text-lg max-w-2xl" style={{ animationDelay: "90ms", color: "var(--color-ink-soft)" }}>
          Every app is a <b style={{ color: "var(--color-ink)" }}>node</b>. Every automation is a{" "}
          <b style={{ color: "var(--color-ink)" }}>worm</b> that hooks two nodes together. Start from a ready-made worm
          below, or reel in any app from the pond. Not in the pond? Go fish, NodeWorm finds a way to land it.
        </p>
      </section>

      {err && (
        <div className="mb-6 rounded-lg px-4 py-2.5 text-sm rise" style={{ border: "1px solid var(--color-signal-2)", color: "var(--color-ink-soft)", background: "var(--color-paper-2)" }}>
          {err}
        </div>
      )}

      {/* YOUR WORMS: bridges already cast */}
      {myWorms.length > 0 && (
        <section className="mb-14">
          <div className="flex items-baseline justify-between mb-5">
            <SectionLabel n="~">Worms on the line</SectionLabel>
            <span className="font-mono text-[0.66rem]" style={{ color: "var(--color-muted)" }}>
              {myWorms.length} cast
            </span>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {myWorms.map((w, i) => (
              <MyWormCard key={w.id} worm={w} delay={i * 40} />
            ))}
          </div>
        </section>
      )}

      {/* BUILD-A-WORM composer */}
      <section className="mb-14">
        <div className="flex items-baseline justify-between mb-5">
          <SectionLabel n="~">Build a worm</SectionLabel>
          <span className="font-mono text-[0.66rem]" style={{ color: "var(--color-muted)" }}>
            any node → any node, in your words
          </span>
        </div>
        <WormComposer />
      </section>

      {/* WORMS */}
      <section className="mb-16">
        <div className="flex items-baseline justify-between mb-5">
          <SectionLabel n="~">Or start from a ready-made worm</SectionLabel>
          <span className="font-mono text-[0.66rem]" style={{ color: "var(--color-muted)" }}>
            one click stands up a real bridge
          </span>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {WORMS.map((w, i) => (
            <WormCard key={w.prompt} worm={w} delay={i * 45} busy={castingWorm === w.prompt} onCast={() => castWorm(w)} wide={i % 5 === 0} />
          ))}
        </div>
      </section>

      {/* NODES */}
      <section>
        <div className="flex items-baseline justify-between mb-5">
          <SectionLabel n="#">The pond</SectionLabel>
          <span className="font-mono text-[0.66rem]" style={{ color: "var(--color-muted)" }}>
            {NODES.length}+ nodes, and any app you can name
          </span>
        </div>

        {/* Category filters */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          <CatChip label="all" active={cat === "all"} onClick={() => setCat("all")} />
          {CATS.map((c) => (
            <CatChip key={c} label={CATEGORY_LABEL[c]} color={CATEGORY_COLOR[c]} active={cat === c} onClick={() => setCat(cat === c ? "all" : c)} />
          ))}
        </div>

        <div className="relative mb-6 max-w-md">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search the pond, or type any app…"
            className="w-full bg-transparent outline-none text-sm px-4 py-3 rounded-xl"
            style={{ border: "1px solid var(--color-line-2)", color: "var(--color-ink)" }}
            aria-label="Search apps"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-xs" style={{ color: "var(--color-muted)" }}>
            {filtered.length}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filtered.map((n, i) => (
            <NodeTile key={n.name} node={n} delay={Math.min(i, 12) * 30} busy={castingNode === n.name} onCatch={() => catchNode(n.name)} />
          ))}
          {/* Go fish: always available, and the star of the show when nothing matches. */}
          {q && !hasExact && (
            <GoFishTile query={query.trim()} busy={castingNode === query.trim()} onCatch={() => catchNode(query.trim())} highlight={filtered.length === 0} />
          )}
        </div>

        {!q && (
          <div className="mt-6 rounded-xl p-4 flex flex-wrap items-center gap-3 rise" style={{ border: "1px dashed var(--color-line-2)", background: "var(--color-paper-2)" }}>
            <span className="text-sm" style={{ color: "var(--color-ink-soft)" }}>
              Don&apos;t see your app? It doesn&apos;t have to be in the pond, that&apos;s the whole point.
            </span>
            <span className="flex-1" />
            <span className="font-mono text-[0.66rem]" style={{ color: "var(--color-muted)" }}>
              type its name above → Go fish
            </span>
          </div>
        )}
      </section>
    </div>
  );
}

function CatChip({ label, color, active, onClick }: { label: string; color?: string; active: boolean; onClick: () => void }) {
  const c = color ?? "var(--color-ink)";
  return (
    <button
      onClick={onClick}
      className="font-mono text-[0.62rem] uppercase tracking-wider px-2.5 py-1 rounded-full transition-colors"
      style={{
        color: active ? "var(--color-paper)" : c,
        background: active ? c : "transparent",
        border: `1px solid color-mix(in srgb, ${c} ${active ? "100" : "40"}%, transparent)`,
      }}
    >
      {label}
    </button>
  );
}

function statusColor(s: string): string {
  return s === "connected"
    ? "var(--color-live)"
    : s === "blocked"
      ? "var(--color-blocked)"
      : s === "running"
        ? "var(--color-signal)"
        : "var(--color-teal)";
}

function MyWormCard({ worm, delay }: { worm: MyWorm; delay: number }) {
  const from = NODES.find((n) => n.name.toLowerCase() === worm.from.toLowerCase());
  const to = NODES.find((n) => n.name.toLowerCase() === worm.to.toLowerCase());
  return (
    <Link href={`/bridge/${worm.id}`} className="worm-card group card p-4 rise transition-transform block" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center gap-2">
        {from ? <Chip name={from.name} category={from.category} /> : <Chip name={worm.from} category="productivity" />}
        <span className="relative flex-1 h-[34px] grid place-items-center" aria-hidden>
          <span className="block w-full h-px" style={{ background: "repeating-linear-gradient(90deg, var(--color-line-2) 0 5px, transparent 5px 9px)" }} />
          <span className="worm-dot absolute left-1/2 -translate-x-1/2 rounded-full" style={{ width: 8, height: 8, background: statusColor(worm.status) }} />
        </span>
        {to ? <Chip name={to.name} category={to.category} /> : <Chip name={worm.to} category="productivity" />}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold truncate">
          {worm.from} → {worm.to}
        </span>
        <span className="chip shrink-0" style={{ borderColor: statusColor(worm.status) }}>
          <span className="dot" style={{ background: statusColor(worm.status) }} />
          {worm.status}
        </span>
      </div>
    </Link>
  );
}

function SectionLabel({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="font-mono text-sm" style={{ color: "var(--color-signal)" }}>
        {n}
      </span>
      <span className="font-display font-bold text-xl">{children}</span>
    </div>
  );
}

// A monogram chip for a node, used inside worm cards + the pond grid.
function Chip({ name, category, size = 34 }: { name: string; category: Node["category"]; size?: number }) {
  const c = CATEGORY_COLOR[category];
  return (
    <span
      className="grid place-items-center rounded-lg font-display font-bold shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        color: c,
        background: `color-mix(in srgb, ${c} 15%, var(--color-paper))`,
        border: `1px solid color-mix(in srgb, ${c} 40%, transparent)`,
      }}
    >
      {monogram(name)}
    </span>
  );
}

function WormCard({ worm, delay, busy, onCast, wide }: { worm: Worm; delay: number; busy: boolean; onCast: () => void; wide?: boolean }) {
  const from = NODES.find((n) => n.name === worm.from);
  const to = NODES.find((n) => n.name === worm.to);
  return (
    <button
      onClick={onCast}
      disabled={busy}
      className={`worm-card group text-left card p-4 rise transition-transform${wide ? " sm:col-span-2 lg:col-span-2" : ""}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center gap-2">
        {from && <Chip name={from.name} category={from.category} />}
        {/* the line + hook: a worm on the line between two nodes */}
        <span className="relative flex-1 h-[34px] grid place-items-center" aria-hidden>
          <span className="block w-full h-px" style={{ background: "repeating-linear-gradient(90deg, var(--color-line-2) 0 5px, transparent 5px 9px)" }} />
          <span
            className="worm-dot absolute left-1/2 -translate-x-1/2 rounded-full"
            style={{ width: 8, height: 8, background: "var(--color-signal)" }}
          />
        </span>
        {to && <Chip name={to.name} category={to.category} />}
      </div>
      <div className="mt-3 flex items-baseline gap-2 flex-wrap">
        <span className="font-semibold text-sm">{worm.from}</span>
        <span className="font-mono text-[0.62rem]" style={{ color: "var(--color-muted)" }}>→</span>
        <span className="font-semibold text-sm">{worm.to}</span>
      </div>
      <p className="mt-1 text-[0.8rem]" style={{ color: "var(--color-ink-soft)" }}>
        When <b style={{ color: "var(--color-ink)" }}>{worm.trigger}</b>, {worm.action}.
      </p>
      <div className="mt-3 flex items-center gap-2 font-mono text-[0.62rem] uppercase tracking-wider" style={{ color: busy ? "var(--color-signal)" : "var(--color-teal)" }}>
        <span className={`dot${busy ? " animate-pulse" : ""}`} style={{ background: busy ? "var(--color-signal)" : "var(--color-teal)" }} />
        {busy ? "casting…" : "cast this worm"}
        <span className="opacity-0 group-hover:opacity-100 transition-opacity">↗</span>
      </div>
    </button>
  );
}

function NodeTile({ node, delay, busy, onCatch }: { node: Node; delay: number; busy: boolean; onCatch: () => void }) {
  return (
    <button
      onClick={onCatch}
      disabled={busy}
      className="node-tile group card p-4 flex flex-col items-center gap-2.5 text-center rise transition-transform"
      style={{ animationDelay: `${delay}ms` }}
    >
      <Chip name={node.name} category={node.category} size={44} />
      <div>
        <div className="text-sm font-semibold leading-tight">{node.name}</div>
        <div className="font-mono text-[0.56rem] uppercase tracking-wider mt-0.5" style={{ color: "var(--color-muted)" }}>
          {busy ? "reeling in…" : CATEGORY_LABEL[node.category]}
        </div>
      </div>
    </button>
  );
}

function GoFishTile({ query, busy, onCatch, highlight }: { query: string; busy: boolean; onCatch: () => void; highlight: boolean }) {
  return (
    <button
      onClick={onCatch}
      disabled={busy}
      className="node-tile group card p-4 flex flex-col items-center gap-2.5 text-center rise transition-transform"
      style={{ borderColor: "var(--color-signal)", background: highlight ? "color-mix(in srgb, var(--color-signal) 8%, var(--color-paper))" : undefined }}
    >
      <span
        className="grid place-items-center rounded-lg text-xl shrink-0"
        style={{ width: 44, height: 44, background: "color-mix(in srgb, var(--color-signal) 16%, var(--color-paper))", border: "1px solid color-mix(in srgb, var(--color-signal) 45%, transparent)" }}
        aria-hidden
      >
        🪝
      </span>
      <div>
        <div className="text-sm font-semibold leading-tight" style={{ color: "var(--color-signal)" }}>
          {busy ? "casting…" : `Go fish: ${query}`}
        </div>
        <div className="font-mono text-[0.56rem] uppercase tracking-wider mt-0.5" style={{ color: "var(--color-muted)" }}>
          {busy ? "landing the node" : "cast a worm, land the node"}
        </div>
      </div>
    </button>
  );
}
