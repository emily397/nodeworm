import Link from "next/link";
import { listBridges, listIntegrations } from "@/lib/store";
import { isLlmEnabled } from "@/lib/engine/llm";
import { KNOWLEDGE } from "@/lib/engine/knowledge";
import { BridgeConsole } from "./components/BridgeConsole";
import { StatusChip, SectionLabel } from "./components/ui";
import { timeAgo } from "./components/status";
import { WORMS } from "@/lib/catalog";
import { Reveal } from "./components/Reveal";
import { BrandLogo } from "./components/BrandLogo";
import { LogoCloud } from "./components/LogoCloud";

export const dynamic = "force-dynamic";

const AGENTS = [
  {
    n: "01",
    agent: "Scout",
    label: "Discovery",
    desc: "Searches API docs, MCP registries and developer portals to map the integration surface.",
    color: "var(--color-aqua)",
  },
  {
    n: "02",
    agent: "Architect",
    label: "Credentials",
    desc: "Picks the path: hosted MCP, a custom MCP build, or a browser fallback. Always OAuth, never an API key.",
    color: "var(--color-signal)",
  },
  {
    n: "03",
    agent: "Wire",
    label: "Sync",
    desc: "Designs bidirectional sync: outbound tools plus webhooks, polling or entity mirroring.",
    color: "var(--color-berry)",
  },
  {
    n: "04",
    agent: "Auditor",
    label: "Verify",
    desc: "Tests connectivity, auth persistence, write round-trips and inbound delivery.",
    color: "var(--color-amber)",
  },
  {
    n: "05",
    agent: "Relay",
    label: "Handoff",
    desc: "Reports what works and surfaces the one action you still need to take.",
    color: "var(--color-teal)",
  },
];

export default async function Home() {
  const [allBridges, allRuns] = await Promise.all([listBridges(), listIntegrations()]);
  const bridges = allBridges.slice(0, 6);
  const recent = allRuns.slice(0, 6);
  const now = Date.now();

  return (
    <div className="mx-auto max-w-6xl px-5">
      {/* Hero */}
      <section className="pt-16 pb-12 grid lg:grid-cols-[1.05fr_0.95fr] gap-12 items-center">
        <div>
          <div className="kicker rise mb-5" style={{ animationDelay: "0ms" }}>
            Autonomous bidirectional integration engine
          </div>
          <h1 className="display-xl rise text-[clamp(2.9rem,6.4vw,5rem)]" style={{ animationDelay: "40ms" }}>
            Name two apps.
            <br />
            The swarm{" "}
            <span className="gradient-text">bridges them.</span>
          </h1>

          {/* Signature moment: a live wire, node to node, with a worm traveling it. */}
          <div className="rise mt-6 max-w-xs" style={{ animationDelay: "70ms" }} aria-hidden>
            <div className="livewire">
              <span className="pulse" />
            </div>
          </div>
          <p
            className="rise mt-6 text-lg max-w-xl"
            style={{ animationDelay: "90ms", color: "var(--color-ink-soft)" }}
          >
            Connect any app to any other. Five agents scout both APIs, run genuine OAuth on
            each side, map the entities across, and stand up a real bidirectional bridge.
            Name one app alone and they wire just that endpoint.
          </p>

          <div className="mt-8">
            <BridgeConsole />
          </div>

          <div
            className="rise mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-xs"
            style={{ animationDelay: "200ms", color: "var(--color-muted)" }}
          >
            <span>5 agents</span>
            <span className="opacity-40">/</span>
            <span>{KNOWLEDGE.length} apps in the knowledge base</span>
            <span className="opacity-40">/</span>
            <span>{isLlmEnabled() ? "live LLM discovery on" : "zero config, no keys needed"}</span>
          </div>
        </div>

        {/* Decision tree */}
        <div className="rise" style={{ animationDelay: "150ms" }}>
          <DecisionTree />
        </div>
      </section>

      {/* Real logos: the apps NodeWorm connects. */}
      <Reveal as="section" className="pt-2 pb-10">
        <p className="text-center text-xs uppercase tracking-[0.2em] mb-5" style={{ color: "var(--color-muted)" }}>
          Works with the apps you already use
        </p>
        <LogoCloud />
      </Reveal>

      {/* Gallery teaser */}
      <Reveal>
        <GalleryTeaser />
      </Reveal>

      {/* Pipeline */}
      <Reveal as="section" className="py-14">
        <SectionLabel n="//">The five-agent pipeline</SectionLabel>
        <div className="grid md:grid-cols-5 gap-3">
          {AGENTS.map((a, i) => (
            <div key={a.agent} className="relative">
              {i < AGENTS.length - 1 && (
                <span
                  className="pipe-arrow hidden md:block absolute top-7 -right-2 z-10"
                  style={{ color: "var(--color-line-2)", animationDelay: `${i}s` }}
                >
                  <Connector />
                </span>
              )}
              <div
                className="card card-pop h-full p-5 rise"
                style={{
                  animationDelay: `${i * 70}ms`,
                  background: `linear-gradient(180deg, color-mix(in srgb, ${a.color} 9%, var(--color-card)), var(--color-card))`,
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <span
                    className="font-display font-extrabold text-xl leading-none"
                    style={{ color: a.color }}
                  >
                    {a.n}
                  </span>
                  <span className="dot stage-dot" style={{ background: a.color, color: a.color, width: 9, height: 9, animationDelay: `${i}s` }} />
                </div>
                <div className="font-display font-bold text-lg leading-none">{a.agent}</div>
                <div
                  className="font-mono text-[0.68rem] uppercase tracking-wider mt-1 mb-3"
                  style={{ color: a.color }}
                >
                  {a.label}
                </div>
                <p className="text-sm leading-snug" style={{ color: "var(--color-ink-soft)" }}>
                  {a.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Reveal>

      {/* Recent bridges */}
      {bridges.length > 0 && (
        <Reveal as="section" className="py-10">
          <SectionLabel n="//">Recent bridges</SectionLabel>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {bridges.map((b) => (
              <Link key={b.id} href={`/bridge/${b.id}`} className="group">
                <div className="card p-5 h-full transition-transform group-hover:-translate-y-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-display font-bold text-base leading-tight flex items-center gap-2 flex-wrap">
                      <BrandLogo name={b.sourceName} size={28} />
                      <span style={{ color: "var(--color-signal)" }}>
                        {b.flow?.direction === "bidirectional" ? "⇄" : b.flow?.direction === "b-to-a" ? "←" : "→"}
                      </span>
                      <BrandLogo name={b.targetName} size={28} />
                      <span className="ml-1">
                        {b.sourceName} to {b.targetName}
                      </span>
                    </div>
                    <StatusChip status={b.status} />
                  </div>
                  <div className="mt-4 flex items-center justify-between font-mono text-xs" style={{ color: "var(--color-muted)" }}>
                    <span>{b.flow && b.flow.direction !== "none" ? `${b.flow.mappings.length} entity pairs` : "no path"}</span>
                    <span>{timeAgo(b.updatedAt, now)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Reveal>
      )}

      {/* Recent runs */}
      <Reveal as="section" className="py-10">
        <SectionLabel n="//">Recent endpoints</SectionLabel>
        {recent.length === 0 ? (
          <div className="card p-10 text-center wires" style={{ color: "var(--color-muted)" }}>
            <p className="font-mono text-sm">
              No connections yet. Name an app above to dispatch the swarm.
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {recent.map((it) => (
              <Link key={it.id} href={`/run/${it.id}`} className="group">
                <div className="card p-5 h-full transition-transform group-hover:-translate-y-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <BrandLogo name={it.appName} size={38} />
                      <div className="min-w-0">
                        <div className="font-display font-bold text-lg leading-tight truncate">{it.appName}</div>
                        <div className="font-mono text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
                          {it.discovery?.category ?? "queued"}
                        </div>
                      </div>
                    </div>
                    <StatusChip status={it.status} />
                  </div>
                  <div
                    className="mt-4 flex items-center justify-between font-mono text-xs"
                    style={{ color: "var(--color-muted)" }}
                  >
                    <span>{it.plan?.pathLabel ?? "not scouted"}</span>
                    <span>{timeAgo(it.updatedAt, now)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Reveal>
    </div>
  );
}

function Connector() {
  return (
    <svg width="20" height="16" viewBox="0 0 20 16" fill="none" aria-hidden>
      <path d="M1 8h15M12 4l5 4-5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Landing teaser that hits with the breadth: nodes + worms + go-fish, one link away.
function GalleryTeaser() {
  const picks = WORMS.slice(0, 4);
  return (
    <section className="py-14">
      <div className="card overflow-hidden" style={{ background: "var(--color-paper-2)" }}>
        <div className="p-6 sm:p-8 grid lg:grid-cols-[1fr_1.1fr] gap-8 items-center">
          <div>
            <div className="kicker mb-3">The tackle box</div>
            <h2 className="font-display font-extrabold text-[clamp(1.7rem,3.6vw,2.5rem)] leading-tight">
              Cast a worm.{" "}
              <span className="marker" style={{ color: "var(--color-signal)" }}>Catch any node.</span>
            </h2>
            <p className="mt-3 text-base max-w-md" style={{ color: "var(--color-ink-soft)" }}>
              Every app is a node. Every automation is a worm that hooks two nodes together. Start from a ready-made
              worm, build your own, or go fish for any app that isn&apos;t in the pond yet.
            </p>
            <Link href="/gallery" className="btn btn-signal text-sm mt-5 inline-flex">
              Open the gallery ↗
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 gap-2.5">
            {picks.map((w) => (
              <Link
                key={w.prompt}
                href="/gallery"
                className="card p-3 flex items-center gap-2 transition-transform hover:-translate-y-1"
                style={{ background: "var(--color-paper)" }}
              >
                <BrandLogo name={w.from} size={30} />
                <span className="text-[0.7rem]" style={{ color: "var(--color-signal)" }}>→</span>
                <BrandLogo name={w.to} size={30} />
                <span className="text-[0.75rem] leading-tight ml-1 font-medium" style={{ color: "var(--color-ink-soft)" }}>
                  {w.from} to {w.to}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function DecisionTree() {
  const node = (label: string, sub: string, color: string) => (
    <div
      className="card px-4 py-3 flex-1"
      style={{ borderColor: "color-mix(in srgb, " + color + " 35%, var(--color-line))" }}
    >
      <div className="text-sm font-semibold leading-tight">{label}</div>
      <div className="font-mono text-[0.66rem] mt-0.5" style={{ color }}>
        {sub}
      </div>
    </div>
  );
  const branch = (label: string) => (
    <span
      className="font-mono text-[0.62rem] px-2 py-1 rounded-full whitespace-nowrap"
      style={{ color: "var(--color-muted)", border: "1px solid var(--color-line-2)" }}
    >
      {label}
    </span>
  );

  return (
    <div className="card p-6 wires" style={{ boxShadow: "var(--shadow-soft)" }}>
      <div className="kicker mb-4">decision tree</div>
      <div className="flex flex-col gap-2.5">
        {node("App name or URL", "scout maps the surface", "var(--color-ink)")}
        <span className="ml-4 h-3 w-px" style={{ background: "var(--color-line-2)" }} />
        <div className="flex items-center gap-2 tree-row p-0.5" style={{ animationDelay: "0s" }}>
          {branch("hosted MCP")}
          {node("Wire MCP + authorize", "fastest path", "var(--color-teal)")}
        </div>
        <div className="flex items-center gap-2 tree-row p-0.5" style={{ animationDelay: "1.5s" }}>
          {branch("has API")}
          {node("Custom MCP + OAuth", "build + deploy", "var(--color-signal)")}
        </div>
        <div className="flex items-center gap-2 tree-row p-0.5" style={{ animationDelay: "3s" }}>
          {branch("no API")}
          {node("Browser + OAuth/SSO", "headless fallback", "var(--color-ink)")}
        </div>
        <div className="flex items-center gap-2 tree-row p-0.5" style={{ animationDelay: "4.5s" }}>
          {branch("dead end")}
          {node("No path found", "flagged honestly", "var(--color-blocked)")}
        </div>
      </div>
    </div>
  );
}
