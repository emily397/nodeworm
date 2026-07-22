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
import { Constellation, HomeHero } from "./components/HomeHero";
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
      {/* Hero: the composer IS the product. Type it, watch it build itself. */}
      <section className="pt-14 pb-12 grid lg:grid-cols-[1.1fr_0.9fr] gap-10 items-center">
        <div>
          <div className="kicker rise mb-5" style={{ animationDelay: "0ms" }}>
            Automation that builds itself
          </div>
          <h1 className="display-xl rise text-[clamp(3rem,6.8vw,5.2rem)]" style={{ animationDelay: "40ms" }}>
            Your apps.
            <br />
            <span className="gradient-text">On autopilot.</span>
          </h1>
          <p className="rise mt-5 text-lg max-w-xl" style={{ animationDelay: "90ms", color: "var(--color-ink-soft)" }}>
            Say what you want in plain English. NodeWorm connects the apps, wires the steps and keeps it
            running, even the apps other tools can&apos;t reach.
          </p>

          <div className="rise mt-7" style={{ animationDelay: "140ms" }}>
            <HomeHero />
          </div>

          <div
            className="rise mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs"
            style={{ animationDelay: "260ms", color: "var(--color-muted)" }}
          >
            <span className="flex items-center gap-1.5">
              <span className="dot" style={{ background: "var(--color-live)" }} />
              No code, ever
            </span>
            <span className="flex items-center gap-1.5">
              <span className="dot" style={{ background: "var(--color-aqua)" }} />
              Connects apps others can&apos;t
            </span>
            <span className="flex items-center gap-1.5">
              <span className="dot" style={{ background: "var(--color-amber)" }} />
              Runs survive anything
            </span>
          </div>
        </div>

        <div className="rise hidden lg:block" style={{ animationDelay: "180ms" }}>
          <Constellation />
        </div>
      </section>

      {/* Real logos: the apps NodeWorm connects. */}
      <Reveal as="section" className="pt-2 pb-12">
        <p className="text-center text-xs uppercase tracking-[0.2em] mb-5" style={{ color: "var(--color-muted)" }}>
          Works with the apps you already use, and any it has never seen
        </p>
        <LogoCloud />
      </Reveal>

      {/* How it works: three moves, zero jargon. */}
      <Reveal as="section" className="py-12">
        <SectionLabel n="01">How it works</SectionLabel>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { t: "Say it", d: "Type what should happen, the way you'd tell a colleague. No flowchart homework.", c: "var(--color-signal)" },
            { t: "Watch it assemble", d: "NodeWorm picks the apps, signs you in with one click each, and wires every step.", c: "var(--color-berry)" },
            { t: "Forget about it", d: "It runs on autopilot, retries failures, survives crashes, and tells you if anything needs you.", c: "var(--color-teal)" },
          ].map((s, i) => (
            <div
              key={s.t}
              className="card card-pop p-6 rise"
              style={{ animationDelay: `${i * 90}ms`, background: `linear-gradient(180deg, color-mix(in srgb, ${s.c} 8%, var(--color-card)), var(--color-card))` }}
            >
              <div className="font-display font-extrabold text-3xl mb-2" style={{ color: s.c }}>
                {i + 1}
              </div>
              <div className="font-display font-bold text-xl">{s.t}</div>
              <p className="mt-2 text-sm leading-snug" style={{ color: "var(--color-ink-soft)" }}>
                {s.d}
              </p>
            </div>
          ))}
        </div>
      </Reveal>

      {/* Stat band: honest numbers, popped in. */}
      <Reveal as="section" className="py-10">
        <div className="card overflow-hidden p-8 sm:p-10" style={{ background: "linear-gradient(120deg, color-mix(in srgb, var(--color-signal) 10%, var(--color-paper-2)), var(--color-paper-2))" }}>
          <div className="grid sm:grid-cols-4 gap-8 text-center">
            {[
              { n: "19", l: "built-in connectors" },
              { n: "ANY", l: "app via live discovery" },
              { n: "8", l: "step types incl. AI + branching" },
              { n: "24/7", l: "self-healing runs" },
            ].map((s, i) => (
              <div key={s.l} className="stat-pop" style={{ animationDelay: `${i * 110}ms` }}>
                <div className="font-display font-extrabold text-[2.6rem] leading-none gradient-text">{s.n}</div>
                <div className="mt-2 text-xs uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>
                  {s.l}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      {/* Gallery teaser */}
      <Reveal>
        <GalleryTeaser />
      </Reveal>

      {/* Why NodeWorm: the honest edge over the big names. */}
      <Reveal as="section" className="py-12">
        <SectionLabel n="02">Why not just use the big guys?</SectionLabel>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            {
              t: "They make you build. We build for you.",
              d: "Elsewhere you drag boxes and read docs. Here you describe the outcome and edit what appears.",
              c: "var(--color-signal)",
            },
            {
              t: "They stop at their catalog. We don't.",
              d: "If an app isn't on the list, NodeWorm scouts its real surface live and builds the connection anyway.",
              c: "var(--color-aqua)",
            },
            {
              t: "They shrug at failures. We don't.",
              d: "Runs pick up where they left off after crashes, retry with backoff, and never fake a success.",
              c: "var(--color-berry)",
            },
          ].map((s, i) => (
            <div key={s.t} className="card p-6 rise" style={{ animationDelay: `${i * 90}ms`, borderTop: `3px solid ${s.c}` }}>
              <div className="font-display font-bold text-lg leading-snug">{s.t}</div>
              <p className="mt-2 text-sm leading-snug" style={{ color: "var(--color-ink-soft)" }}>
                {s.d}
              </p>
            </div>
          ))}
        </div>
      </Reveal>

      {/* Power tier: name any app, dispatch the swarm. */}
      <Reveal as="section" className="py-12">
        <SectionLabel n="03">Under the hood: name any app</SectionLabel>
        <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-10 items-center">
          <div>
            <p className="text-base max-w-xl mb-6" style={{ color: "var(--color-ink-soft)" }}>
              The engine underneath: five agents scout an app&apos;s real integration surface, run genuine
              OAuth, and stand up a live connection, even for apps with no public API.
            </p>
            <BridgeConsole />
            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-xs" style={{ color: "var(--color-muted)" }}>
              <span>5 agents</span>
              <span className="opacity-40">/</span>
              <span>{KNOWLEDGE.length} apps in the knowledge base</span>
              <span className="opacity-40">/</span>
              <span>{isLlmEnabled() ? "live discovery on" : "zero config, no keys needed"}</span>
            </div>
          </div>
          <DecisionTree />
        </div>
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

      {/* Final CTA */}
      <Reveal as="section" className="py-16">
        <div
          className="card overflow-hidden text-center px-6 py-14"
          style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--color-signal) 14%, var(--color-paper-2)), color-mix(in srgb, var(--color-berry) 10%, var(--color-paper-2)))" }}
        >
          <h2 className="font-display font-extrabold text-[clamp(2rem,4.5vw,3.2rem)] leading-tight">
            Stop doing your apps&apos; homework<span className="gradient-text">.</span>
          </h2>
          <p className="mt-3 text-base max-w-md mx-auto" style={{ color: "var(--color-ink-soft)" }}>
            Describe one thing you do by hand every week. NodeWorm takes it from there.
          </p>
          <div className="mt-7 flex items-center justify-center gap-3 flex-wrap">
            <Link href="/flows" className="btn btn-signal btn-shimmer text-base px-7 py-3.5">
              Put it on autopilot →
            </Link>
            <Link href="/gallery" className="btn btn-ghost text-base px-6 py-3.5">
              Browse the apps
            </Link>
          </div>
        </div>
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
