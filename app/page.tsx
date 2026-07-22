import Link from "next/link";
import { WORMS } from "@/lib/catalog";
import { Reveal } from "./components/Reveal";
import { BrandLogo } from "./components/BrandLogo";
import { Constellation, HomeHero } from "./components/HomeHero";
import { FlowShowcase } from "./components/FlowShowcase";
import { LogoCloud } from "./components/LogoCloud";

export const dynamic = "force-dynamic";

// The five agents, in plain English. The engine's own names stay as flavor; the
// descriptions carry no jargon.
const AGENTS = [
  { n: "01", agent: "Scout", label: "Finds the way in", desc: "Works out how an app can connect, even when it comes with no instructions.", color: "var(--color-aqua)" },
  { n: "02", agent: "Architect", label: "Handles sign-in", desc: "Picks the safest route. You click sign in once; your keys stay sealed away.", color: "var(--color-signal)" },
  { n: "03", agent: "Wire", label: "Connects the dots", desc: "Hooks up both directions: things that happen, and things to do about them.", color: "var(--color-berry)" },
  { n: "04", agent: "Auditor", label: "Proves it works", desc: "Tests everything for real. Nothing gets called connected until it is.", color: "var(--color-amber)" },
  { n: "05", agent: "Relay", label: "Hands it over", desc: "Shows you what works and the one thing left to click, if there is one.", color: "var(--color-teal)" },
];

function H2({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  return (
    <div className="mb-7">
      <div className="text-xs uppercase tracking-[0.2em] mb-2" style={{ color: "var(--color-signal)" }}>
        {eyebrow}
      </div>
      <h2 className="font-display font-extrabold text-[clamp(1.7rem,3.6vw,2.5rem)] leading-tight">{children}</h2>
    </div>
  );
}

export default function Home() {
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

          <div className="rise mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs" style={{ animationDelay: "260ms", color: "var(--color-muted)" }}>
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

      {/* Watch one run: the product's output, not its internals. */}
      <Reveal as="section" className="py-12">
        <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-10 items-center">
          <div>
            <H2 eyebrow="See it work">
              This ran while you
              <br />
              read this sentence<span className="gradient-text">.</span>
            </H2>
            <p className="text-base max-w-md" style={{ color: "var(--color-ink-soft)" }}>
              One sentence built this whole thing: the trigger, the rule, the AI touch, the message. It has
              been running itself ever since.
            </p>
            <ul className="mt-5 space-y-2.5 text-sm" style={{ color: "var(--color-ink-soft)" }}>
              {["Every step shows exactly what happened, in plain words", "Failures retry themselves, then tell you honestly", "Change anything by clicking it, not by reading docs"].map((t) => (
                <li key={t} className="flex items-start gap-2.5">
                  <span className="dot mt-1.5 shrink-0" style={{ background: "var(--color-live)" }} />
                  {t}
                </li>
              ))}
            </ul>
            <Link href="/flows" className="btn btn-signal btn-shimmer text-sm mt-7 inline-flex">
              Build yours in 30 seconds →
            </Link>
          </div>
          <FlowShowcase />
        </div>
      </Reveal>

      {/* How it works: three moves, zero jargon. */}
      <Reveal as="section" className="py-12">
        <H2 eyebrow="How it works">Three moves, and the busywork is gone</H2>
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
            {[
              { n: "19", l: "ready-made connectors" },
              { n: "ANY", l: "app, found live" },
              { n: "8", l: "step types incl. AI" },
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

      {/* Popular automations, with real logos. */}
      <Reveal as="section" className="py-12">
        <div className="card overflow-hidden" style={{ background: "var(--color-paper-2)" }}>
          <div className="p-6 sm:p-8 grid lg:grid-cols-[1fr_1.1fr] gap-8 items-center">
            <div>
              <H2 eyebrow="Start in one click">
                Steal one of these<span className="gradient-text">.</span>
              </H2>
              <p className="text-base max-w-md" style={{ color: "var(--color-ink-soft)" }}>
                The most popular automations, ready to go. Pick one, sign in to the two apps, done. Or type
                something nobody has ever automated before; NodeWorm will figure it out.
              </p>
              <Link href="/flows" className="btn btn-signal text-sm mt-6 inline-flex">
                Browse all templates →
              </Link>
            </div>
            <div className="grid sm:grid-cols-2 gap-2.5">
              {WORMS.slice(0, 6).map((w, i) => (
                <Link
                  key={w.prompt}
                  href="/flows"
                  className="card p-3.5 flex items-center gap-2.5 rise transition-transform hover:-translate-y-1"
                  style={{ background: "var(--color-paper)", animationDelay: `${i * 60}ms` }}
                >
                  <BrandLogo name={w.from} size={32} />
                  <span style={{ color: "var(--color-signal)" }}>→</span>
                  <BrandLogo name={w.to} size={32} />
                  <span className="text-[0.8rem] leading-tight ml-1 font-medium" style={{ color: "var(--color-ink-soft)" }}>
                    {w.trigger}, {w.action}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </Reveal>

      {/* Why NodeWorm: the honest edge over the big names. */}
      <Reveal as="section" className="py-12">
        <H2 eyebrow="The honest comparison">Why not just use the big guys?</H2>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { t: "They make you build. We build for you.", d: "Elsewhere you drag boxes and read docs. Here you describe the outcome and edit what appears.", c: "var(--color-signal)" },
            { t: "They stop at their catalog. We don't.", d: "If an app isn't on the list, NodeWorm scouts its real surface live and builds the connection anyway.", c: "var(--color-aqua)" },
            { t: "They shrug at failures. We don't.", d: "Runs pick up where they left off after crashes, retry with backoff, and never fake a success.", c: "var(--color-berry)" },
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

      {/* The five agents, softened: visual candy with plain words. */}
      <Reveal as="section" className="py-12">
        <H2 eyebrow="Meet the crew">Five little robots do the boring part</H2>
        <div className="grid md:grid-cols-5 gap-3">
          {AGENTS.map((a, i) => (
            <div key={a.agent} className="relative">
              {i < AGENTS.length - 1 && (
                <span className="pipe-arrow hidden md:block absolute top-7 -right-2 z-10" style={{ color: "var(--color-line-2)", animationDelay: `${i}s` }}>
                  <Connector />
                </span>
              )}
              <div
                className="card card-pop h-full p-5 rise"
                style={{ animationDelay: `${i * 70}ms`, background: `linear-gradient(180deg, color-mix(in srgb, ${a.color} 9%, var(--color-card)), var(--color-card))` }}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="font-display font-extrabold text-xl leading-none" style={{ color: a.color }}>
                    {a.n}
                  </span>
                  <span className="dot stage-dot" style={{ background: a.color, color: a.color, width: 9, height: 9, animationDelay: `${i}s` }} />
                </div>
                <div className="font-display font-bold text-lg leading-none">{a.agent}</div>
                <div className="text-[0.7rem] font-semibold mt-1 mb-3" style={{ color: a.color }}>
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
