import Link from "next/link";
import { NODES } from "@/lib/catalog";
import { NightHero, Arrow } from "./components/NightHero";
import { Check, Compass, Globe, Lightning, Plane, Plugs, Refresh, Search, Shield } from "./components/NightIcons";

export const dynamic = "force-dynamic";

// Landing page, implementing the home-vibrant design from the Claude Design
// handoff bundle (nocturne token set, animated node motifs). Dark, saturated,
// and motion-led; the rest of the app keeps its parchment system. All styling
// lives under .nw-night in globals.css.

const PAD = "45px 90px";
const APP_TAGS = ["Stripe", "Notion", "Slack", "GitHub", "Shopify", "Gmail", "HubSpot", "Airtable", "Google Calendar", "Discord", "Linear", "Figma", "Salesforce", "Typeform", "Calendly", "Zoom"];

const STEPS = [
  { n: "01", c: "#38c6e8", t: "Say it", d: "Type what should happen, the way you'd tell a coworker. No flowchart homework." },
  { n: "02", c: "#ff5ea0", t: "Watch it assemble", d: "NodeWorm picks the apps, signs you in with one click each, and wires every step." },
  { n: "03", c: "#ffa03d", t: "Forget about it", d: "It runs on autopilot, retries failures, and only interrupts you when it truly needs you." },
];

const STATS = [
  { v: "19", c: "#38c6e8", rgb: "56,198,232", l: "ready-made connectors" },
  { v: "Any", c: "#ff5ea0", rgb: "255,94,160", l: "app, found live, no waiting on a catalog" },
  { v: "8", c: "#ffa03d", rgb: "255,160,61", l: "kinds of steps, including AI and branching" },
  { v: "24/7", c: "#ffd23f", rgb: "255,210,63", l: "self-healing, unattended runs" },
];

const WORM_CARDS = [
  { k: "Stripe → Slack", c: "#38c6e8", t: "New payment", d: "When a payment lands, post it to the team channel." },
  { k: "Calendly → Google Calendar", c: "#ff5ea0", t: "Meeting booked", d: "When a meeting's booked, add the event." },
  { k: "GitHub → Linear", c: "#ffa03d", t: "Issue opened", d: "When an issue opens, create a linked ticket." },
  { k: "Shopify → Google Sheets", c: "#a7d94b", t: "New order", d: "When an order comes in, add a row." },
];

const COMPARE = [
  { left: "You build the automation, box by box.", right: "You describe it. NodeWorm builds it." },
  { left: "Stuck if your app isn't in the catalog.", right: "Scouts any app's real integration surface, live." },
  { left: "Fails quietly. You find out later.", right: "Retries, heals, and flags the one thing it needs from you." },
];

const AGENTS = [
  { i: Search, c: "#38c6e8", t: "01 · Scout", d: "Finds the way in. Searches docs, registries and developer portals." },
  { i: Compass, c: "#ff5ea0", t: "02 · Architect", d: "Chooses the safest path, hosted, custom, or guided sign-in. Never a bare API key." },
  { i: Plugs, c: "#ffa03d", t: "03 · Wire", d: "Builds the connection, live events, polling, or mirrored records." },
  { i: Shield, c: "#a7d94b", t: "04 · Auditor", d: "Proves it works, tests the login, a real write, and event delivery." },
  { i: Plane, c: "#b39cff", t: "05 · Relay", d: "Hands it back, what's live, and the one thing left for you." },
];

function Kicker({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <h6 className="nw-h6" style={{ color, margin: "0 0 5.6px" }}>
      {children}
    </h6>
  );
}

export default function Home() {
  const appCount = NODES.length;

  return (
    <div className="nw-night" style={{ minHeight: "100vh" }}>
      <NightHero />

      <div className="nw-hr" style={{ marginInline: 90 }} />

      {/* Three pillars + app tags */}
      <section style={{ padding: PAD }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 17 }}>
          <div className="nw-card nw-elev">
            <Lightning color="#ffd23f" />
            <div className="nw-card-title">No code, ever</div>
            <p className="nw-card-body">If you can say it, NodeWorm can build it.</p>
          </div>
          <div className="nw-card nw-elev">
            <Globe color="#38c6e8" />
            <div className="nw-card-title">Connects apps others can&apos;t</div>
            <p className="nw-card-body">Works with the tools you already use, and any app it&apos;s never seen before.</p>
          </div>
          <div className="nw-card nw-elev">
            <Refresh color="#ff5ea0" />
            <div className="nw-card-title">Runs survive anything</div>
            <p className="nw-card-body">Retries failures, heals itself, and tells you if it ever needs a hand.</p>
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 27 }}>
          {APP_TAGS.map((a) => (
            <span key={a} className="nw-tag">{a}</span>
          ))}
          <Link href="/gallery" className="nw-tag nw-tag-outline">
            +{appCount} more apps ↗
          </Link>
        </div>
      </section>

      {/* 01 How it works */}
      <section style={{ padding: PAD }}>
        <Kicker color="#ff5ea0">01 · How it works</Kicker>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 17, marginTop: 11.2 }}>
          {STEPS.map((s) => (
            <div key={s.n}>
              <div style={{ fontWeight: 600, fontSize: 13, color: s.c }}>{s.n}</div>
              <h4 style={{ margin: "6px 0 4px", fontSize: 20, fontWeight: 600, letterSpacing: "-0.015em" }}>{s.t}</h4>
              <p className="nw-muted" style={{ fontSize: 14, margin: 0 }}>{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section style={{ background: "radial-gradient(circle at 16% 28%, rgba(255,94,160,0.5), rgba(255,160,61,0.28) 38%, var(--nw-section) 72%)", padding: PAD }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 17 }}>
          {STATS.map((s) => (
            <div key={s.l}>
              <div style={{ fontWeight: 500, fontSize: 42, color: s.c, textShadow: `0 0 24px rgba(${s.rgb},.6)`, lineHeight: 1.1 }}>{s.v}</div>
              <p style={{ fontSize: 13, color: "var(--nw-n300)", marginTop: 6 }}>{s.l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 02 The tackle box */}
      <section style={{ padding: PAD }}>
        <Kicker color="#38c6e8">02 · The tackle box</Kicker>
        <h2 style={{ margin: "5.6px 0", maxWidth: 600, fontSize: 32, fontWeight: 600, letterSpacing: "-0.015em", lineHeight: 1.12 }}>Cast a worm. Catch any node.</h2>
        <p style={{ maxWidth: 560, opacity: 0.75 }}>
          Every app is a node. Every automation is a worm that hooks two of them together. Start from one that&apos;s
          ready to go, or describe your own.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 11.2, marginTop: 17 }}>
          {WORM_CARDS.map((w) => (
            <div key={w.k} className="nw-card">
              <div className="nw-card-kicker" style={{ color: w.c }}>{w.k}</div>
              <div className="nw-card-title">{w.t}</div>
              <p className="nw-card-body">{w.d}</p>
              <Link href="/flows" className="nw-btn nw-btn-ghost" style={{ paddingInline: 0, justifyContent: "flex-start" }}>
                Cast this worm <Arrow />
              </Link>
            </div>
          ))}
        </div>
        <Link href="/gallery" className="nw-btn nw-btn-secondary" style={{ marginTop: 17 }}>
          Open the full gallery, {appCount}+ apps ↗
        </Link>
      </section>

      <div className="nw-hr" style={{ marginInline: 90 }} />

      {/* 03 Why NodeWorm */}
      <section style={{ padding: PAD }}>
        <Kicker color="#ffa03d">03 · Why NodeWorm</Kicker>
        <h2 style={{ margin: "5.6px 0 0", maxWidth: 640, fontSize: 32, fontWeight: 600, letterSpacing: "-0.015em", lineHeight: 1.12 }}>
          They make you build it. NodeWorm builds it for you.
        </h2>
        <table className="nw-table" style={{ marginTop: 17 }}>
          <thead>
            <tr>
              <th>Everywhere else</th>
              <th>NodeWorm</th>
            </tr>
          </thead>
          <tbody>
            {COMPARE.map((r) => (
              <tr key={r.left}>
                <td className="nw-muted">{r.left}</td>
                <td>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <Check size={16} color="#a7d94b" />
                    {r.right}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* 04 Under the hood */}
      <section style={{ padding: PAD }}>
        <Kicker color="#b39cff">04 · Under the hood</Kicker>
        <h2 style={{ margin: "5.6px 0 0", maxWidth: 640, fontSize: 32, fontWeight: 600, letterSpacing: "-0.015em", lineHeight: 1.12 }}>Five agents, one connection</h2>
        <p style={{ maxWidth: 600, opacity: 0.75, marginTop: 5.6 }}>
          Behind every automation, a small team of specialist agents does the work you&apos;d otherwise do by hand,
          reading docs, weighing sign-in methods, testing that it actually works.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 8.4, marginTop: 17 }}>
          {AGENTS.map((a) => {
            const Icon = a.i;
            return (
              <div key={a.t} className="nw-card" style={{ gap: 6 }}>
                <Icon size={20} color={a.c} />
                <div className="nw-card-title" style={{ fontSize: 15 }}>{a.t}</div>
                <p className="nw-card-body" style={{ fontSize: 12 }}>{a.d}</p>
              </div>
            );
          })}
        </div>
        <p className="nw-muted" style={{ fontSize: 13, marginTop: 11.2 }}>
          Can&apos;t find a way in? NodeWorm says so, it never fakes a connection.
        </p>
      </section>

      {/* Closing CTA */}
      <section style={{ padding: "67px 90px" }}>
        <h2 style={{ maxWidth: 600, fontSize: 32, fontWeight: 600, letterSpacing: "-0.015em", lineHeight: 1.12 }}>Stop doing your apps&apos; homework.</h2>
        <p style={{ maxWidth: 480, opacity: 0.75 }}>
          Describe the one thing you do by hand every week. NodeWorm takes it from there.
        </p>
        <div style={{ display: "flex", gap: 8.4, marginTop: 11.2, flexWrap: "wrap" }}>
          <Link href="/flows" className="nw-btn nw-btn-primary">
            Build it free <Arrow />
          </Link>
          <Link href="/gallery" className="nw-btn nw-btn-secondary">Browse the gallery</Link>
        </div>
      </section>

      <footer style={{ padding: "17px 90px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 17, flexWrap: "wrap" }}>
        <div>
          <div className="nw-brand">nodeworm.</div>
          <p className="nw-muted" style={{ fontSize: 12, margin: "2px 0 0" }}>Automation that builds itself.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 17 }}>
          <Link href="/oss" className="nw-navlink nw-muted" style={{ fontSize: 12 }}>Open source</Link>
          <p className="nw-muted" style={{ fontSize: 12, margin: 0 }}>Scout · Architect · Wire · Auditor · Relay</p>
        </div>
      </footer>
    </div>
  );
}
