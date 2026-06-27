"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type {
  ArchitectPlan,
  AuditResult,
  Discovery,
  GuidedRecipe,
  Integration,
  ProbeEvidence,
  Report,
  ResearchMethod,
  ResearchResult,
  TelemetryLine,
  WireConfig,
} from "@/lib/engine/types";
import { StatusChip } from "@/app/components/ui";
import { PHASE_DOT } from "@/app/components/status";
import { ReelItIn } from "@/app/components/ReelItIn";
import { AgentExecutionModal } from "./AgentExecutionModal";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function SwarmConsole({ initial }: { initial: Integration }) {
  const [it, setIt] = useState<Integration>(initial);
  const [active, setActive] = useState<number>(-1);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function run() {
      let current = initial;
      if (current.currentPhase >= current.phases.length) return; // already complete
      while (current.currentPhase < current.phases.length) {
        const idx = current.currentPhase;
        setActive(idx);
        setIt((prev) => markPhase(prev, idx, "running"));
        await delay(720);
        try {
          const res = await fetch(`/api/integrations/${current.id}/advance`, { method: "POST" });
          const data = await res.json();
          current = data.integration as Integration;
          setIt(current);
        } catch {
          break;
        }
        await delay(180);
      }
      setActive(-1);
    }
    void run();
  }, [initial]);

  const online = it.phases.filter((p) => p.status === "done").length;
  const complete = it.currentPhase >= it.phases.length;

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <Link
            href="/integrations"
            className="font-mono text-xs inline-flex items-center gap-1.5 mb-3"
            style={{ color: "var(--color-muted)" }}
          >
            <span>&larr;</span> all integrations
          </Link>
          <h1 className="display-xl text-[clamp(2.1rem,5vw,3.4rem)]">
            {it.appName}
          </h1>
          <div className="flex items-center gap-3 mt-2">
            <StatusChip status={it.status} />
            <span className="chip">
              <span className="dot" style={{ background: it.mode === "ai" ? "var(--color-live)" : "var(--color-line-2)" }} />
              {it.mode === "ai" ? "live discovery" : "knowledge base"}
            </span>
            {it.appUrl && (
              <a
                href={it.appUrl}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs underline decoration-dotted"
                style={{ color: "var(--color-muted)" }}
              >
                {it.appUrl.replace(/^https?:\/\//, "")}
              </a>
            )}
          </div>
        </div>
        <ProgressMeter online={online} total={it.phases.length} />
      </div>

      {/* Phase lanes */}
      <div className="relative">
        {it.phases.map((phase, i) => (
          <PhaseLane
            key={phase.id}
            index={i}
            phase={phase}
            isActive={active === i}
            isLast={i === it.phases.length - 1}
            discovery={phase.id === "scout" ? it.discovery : undefined}
            plan={phase.id === "architect" ? it.plan : undefined}
            wire={phase.id === "wire" ? it.wire : undefined}
            audit={phase.id === "auditor" ? it.audit : undefined}
            report={phase.id === "present" ? it.report : undefined}
          />
        ))}
      </div>

      {/* Report + vault once complete */}
      {complete && it.report && (
        <ReportPanel integration={it} />
      )}
    </div>
  );
}

function ProgressMeter({ online, total }: { online: number; total: number }) {
  return (
    <div className="text-right">
      <div className="font-display font-extrabold text-3xl leading-none">
        {online}
        <span style={{ color: "var(--color-muted)" }}>/{total}</span>
      </div>
      <div className="font-mono text-[0.66rem] uppercase tracking-wider mt-1" style={{ color: "var(--color-muted)" }}>
        agents online
      </div>
    </div>
  );
}

function PhaseLane({
  index,
  phase,
  isActive,
  isLast,
  discovery,
  plan,
  wire,
  audit,
  report,
}: {
  index: number;
  phase: Integration["phases"][number];
  isActive: boolean;
  isLast: boolean;
  discovery?: Discovery;
  plan?: ArchitectPlan;
  wire?: WireConfig;
  audit?: AuditResult;
  report?: Report;
}) {
  const dot = PHASE_DOT[phase.status];
  const done = phase.status === "done";
  const telemetry =
    discovery?.telemetry ??
    plan?.telemetry ??
    wire?.telemetry ??
    audit?.telemetry ??
    (report ? reportTelemetry(report) : undefined);

  return (
    <div className="flex gap-4">
      {/* Rail */}
      <div className="flex flex-col items-center pt-5">
        <div
          className="relative grid place-items-center rounded-full"
          style={{
            width: 38,
            height: 38,
            background: done ? "var(--color-ink)" : "var(--color-card)",
            border: `1.5px solid ${done ? "var(--color-ink)" : "var(--color-line-2)"}`,
            color: done ? "var(--color-paper)" : "var(--color-muted)",
          }}
        >
          {isActive ? (
            <span className="dot pulse-dot" style={{ background: "var(--color-live)", width: 10, height: 10 }} />
          ) : (
            <span className="font-mono text-xs font-semibold">{phase.agent[0]}</span>
          )}
        </div>
        {!isLast && (
          <div className="w-px flex-1 my-1" style={{ background: done ? "var(--color-teal)" : "var(--color-line)" }} />
        )}
      </div>

      {/* Body */}
      <div className={`flex-1 pb-5 ${done || isActive ? "" : "opacity-55"}`}>
        <div className="flex items-center gap-2.5 pt-4">
          <span className="font-display font-bold text-lg">{phase.agent}</span>
          <span className="font-mono text-[0.66rem] uppercase tracking-wider" style={{ color: dot }}>
            {phase.label}
          </span>
          <span className="flex-1" />
          <span className="font-mono text-[0.66rem]" style={{ color: "var(--color-muted)" }}>
            {isActive ? "scanning..." : done ? "done" : "queued"}
          </span>
        </div>
        <p className="text-sm mt-0.5 mb-3" style={{ color: "var(--color-muted)" }}>
          {phase.tagline}
        </p>

        {(isActive || done) && telemetry && (
          <div
            className="relative card overflow-hidden mb-3"
            style={{ background: "#1b1812", borderColor: "#2c2820" }}
          >
            {isActive && <div className="scanline" />}
            <div className="telemetry p-4">
              {telemetry.map((t, j) => (
                <TelemetryRow key={j} line={t} delayMs={j * 90} />
              ))}
              {isActive && (
                <div className="cursor-blink" style={{ color: "#9fd80a" }} />
              )}
            </div>
          </div>
        )}

        {done && discovery && <DiscoveryResult d={discovery} />}
        {done && plan && <PlanResult plan={plan} />}
        {done && wire && <WireResult w={wire} />}
        {done && audit && <AuditResultView a={audit} />}
      </div>
    </div>
  );
}

function TelemetryRow({ line, delayMs }: { line: TelemetryLine; delayMs: number }) {
  const colorMap: Record<string, string> = {
    scan: "#7d756a",
    info: "#b8b0a2",
    ok: "#8fd14f",
    warn: "#ff7a47",
    action: "#f4eee1",
  };
  const prefix: Record<string, string> = { scan: "::", info: "  ", ok: "ok", warn: "!!", action: ">>" };
  return (
    <div className="fade flex gap-2" style={{ animationDelay: `${delayMs}ms`, color: colorMap[line.level] }}>
      <span style={{ opacity: 0.6 }}>{prefix[line.level]}</span>
      <span>{line.text}</span>
    </div>
  );
}

/* ---- Per-phase result strips ---- */

function Fact({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[0.6rem] uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>
        {k}
      </span>
      <span className="text-sm font-semibold" style={{ color: accent ? "var(--color-signal)" : "var(--color-ink)" }}>
        {v}
      </span>
    </div>
  );
}

function DiscoveryResult({ d }: { d: Discovery }) {
  return (
    <div className="card p-4">
      <p className="text-sm mb-3" style={{ color: "var(--color-ink-soft)" }}>
        {d.blurb}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Fact k="category" v={d.category} />
        <Fact k="public api" v={d.hasPublicApi ? d.apiType.toUpperCase() : "none"} accent={!d.hasPublicApi} />
        <Fact k="auth" v={authLabel(d.authType)} />
        <Fact
          k="hosted mcp"
          v={d.hasHostedMcp ? d.mcpName ?? "yes" : d.hostedMcp ? "official" : "none"}
          accent={Boolean(d.hostedMcp)}
        />
        <Fact k="webhooks" v={d.hasWebhooks ? "yes" : "no"} />
        <Fact k="confidence" v={`${Math.round(d.confidence * 100)}%`} />
        {d.entities.length > 0 && <Fact k="entities" v={d.entities.slice(0, 3).join(", ")} />}
        <Fact k="source" v={d.source.replace("-", " ")} />
      </div>
      {d.probe && <ReconResult p={d.probe} />}
    </div>
  );
}

function probeHost(u: string): string {
  return u.replace(/^https?:\/\//, "").split("/")[0];
}

// Live reconnaissance readout: the real endpoints NodeWorm reverse-engineered
// from the target. Styled like the telemetry stream (dark, mono) to signal
// machine evidence, distinct from the parchment curated facts above. Every row
// carries the real HTTP status so nothing here reads as fabricated.
function ReconResult({ p }: { p: ProbeEvidence }) {
  const finds: { label: string; value: string; accent: string }[] = [];
  if (p.oauthAuthorizeUrl) finds.push({ label: "oauth", value: probeHost(p.oauthAuthorizeUrl), accent: "var(--color-live)" });
  if (p.oauthScopes?.length) finds.push({ label: "scopes", value: String(p.oauthScopes.length), accent: "var(--color-live)" });
  if (p.hasHostedMcp) finds.push({ label: "mcp", value: p.mcpTransport ?? "http", accent: "#5bd6c0" });
  if (p.aiEndpoints.length) finds.push({ label: "ai", value: `${p.aiEndpoints.length}${p.aiOpenAiCompatible ? " · openai" : ""}`, accent: "#8fd14f" });
  if (p.openApiUrl) finds.push({ label: "openapi", value: `${p.pathCount ?? 0} paths`, accent: "#b8b0a2" });
  if (p.hasWebhooks) finds.push({ label: "webhooks", value: "yes", accent: "#5bd6c0" });

  const trail = p.hits.filter((h) => h.detail).slice(0, 6);
  if (!finds.length && !trail.length) return null;

  const statusColor = (s: number) =>
    s === 0 ? "#7d756a" : s < 300 ? "#8fd14f" : s < 400 ? "#b8b0a2" : s < 500 ? "#ff7a47" : "#ff5a4f";

  return (
    <div className="mt-3 rounded-lg overflow-hidden" style={{ background: "#1b1812", border: "1px solid #2c2820" }}>
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <span className="dot" style={{ background: "var(--color-live)", width: 7, height: 7 }} />
        <span className="font-mono text-[0.6rem] uppercase tracking-wider" style={{ color: "#9fd80a" }}>
          reverse-engineered surface
        </span>
        <span className="font-mono text-[0.6rem]" style={{ color: "#7d756a" }}>
          {p.origins.length} origin{p.origins.length === 1 ? "" : "s"} probed
        </span>
      </div>

      {finds.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-3">
          {finds.map((f) => (
            <span
              key={f.label}
              className="font-mono text-[0.64rem] px-2 py-0.5 rounded inline-flex items-center gap-1.5"
              style={{ background: "#241f17", border: "1px solid #34302600" }}
            >
              <span style={{ color: f.accent }}>{f.label}</span>
              <span style={{ color: "#d8cfbe" }}>{f.value}</span>
            </span>
          ))}
        </div>
      )}

      {trail.length > 0 && (
        <div className="telemetry px-4 pb-3 pt-1" style={{ borderTop: "1px solid #241f17" }}>
          {trail.map((h, i) => (
            <div key={i} className="flex gap-2 items-baseline" style={{ color: "#b8b0a2" }}>
              <span style={{ color: "#7d756a", minWidth: "5.5rem" }}>{h.kind}</span>
              <span className="truncate" style={{ color: "#9a9082" }}>
                {probeHost(h.url)}
              </span>
              <span style={{ color: statusColor(h.status) }}>{h.status === 0 ? "err" : h.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlanResult({ plan }: { plan: ArchitectPlan }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="font-display font-bold text-base">{plan.pathLabel}</span>
      </div>
      <p className="text-sm mb-4" style={{ color: "var(--color-ink-soft)" }}>
        {plan.pathReason}
      </p>
      <ol className="space-y-2">
        {plan.credentialSteps.map((s) => (
          <li key={s.n} className="flex gap-3 items-start">
            <span
              className="font-mono text-[0.62rem] mt-0.5 px-1.5 py-0.5 rounded"
              style={{
                background: s.actor === "user" ? "var(--color-signal)" : "var(--color-paper-2)",
                color: s.actor === "user" ? "#fff" : "var(--color-muted)",
                border: s.actor === "user" ? "none" : "1px solid var(--color-line-2)",
              }}
            >
              {s.actor === "user" ? "you" : "agent"}
            </span>
            <div>
              <span className="text-sm font-semibold">{s.title}.</span>{" "}
              <span className="text-sm" style={{ color: "var(--color-ink-soft)" }}>
                {s.detail}
              </span>
            </div>
          </li>
        ))}
      </ol>
      {plan.scopes.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {plan.scopes.map((s) => (
            <span key={s} className="font-mono text-[0.64rem] px-2 py-0.5 rounded-full" style={{ background: "var(--color-paper-2)", border: "1px solid var(--color-line-2)" }}>
              {s}
            </span>
          ))}
        </div>
      )}
      {plan.customMcpSpec && (
        <div className="mt-4 font-mono text-xs p-3 rounded-lg" style={{ background: "var(--color-paper-2)", color: "var(--color-ink-soft)" }}>
          <span style={{ color: "var(--color-teal)" }}>build</span> {plan.customMcpSpec.framework} ({plan.customMcpSpec.language}) &rarr; {plan.customMcpSpec.deployTarget}
        </div>
      )}
    </div>
  );
}

function WireResult({ w }: { w: WireConfig }) {
  return (
    <div className="card p-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <div className="font-mono text-[0.6rem] uppercase tracking-wider mb-2" style={{ color: "var(--color-muted)" }}>
            outbound &middot; {w.outboundTools.length} tools
          </div>
          <div className="flex flex-wrap gap-1.5">
            {w.outboundTools.slice(0, 8).map((t) => (
              <span key={t.name} className="font-mono text-[0.64rem] px-2 py-0.5 rounded" style={{ background: "var(--color-paper-2)", border: "1px solid var(--color-line-2)" }}>
                {t.name}
              </span>
            ))}
          </div>
        </div>
        <div>
          <div className="font-mono text-[0.6rem] uppercase tracking-wider mb-2" style={{ color: "var(--color-muted)" }}>
            inbound &middot; {w.inboundMethod}
          </div>
          <p className="text-sm" style={{ color: "var(--color-ink-soft)" }}>
            {w.inboundReason}
          </p>
        </div>
      </div>
      {w.entityMappings.length > 0 && (
        <div className="mt-4 pt-4 border-t hairline">
          <div className="font-mono text-[0.6rem] uppercase tracking-wider mb-2" style={{ color: "var(--color-muted)" }}>
            entity mapping
          </div>
          {w.entityMappings.map((m) => (
            <div key={m.from} className="font-mono text-xs mb-1">
              <span style={{ color: "var(--color-signal)" }}>{m.from}</span>
              <span style={{ color: "var(--color-muted)" }}> &rarr; </span>
              <span style={{ color: "var(--color-teal)" }}>{m.to}</span>
              <span style={{ color: "var(--color-muted)" }}>
                {"  "}[{m.fields.map((f) => `${f.source}:${f.target}`).join(", ")}]
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3">
        <span
          className="chip"
          style={{ borderColor: w.bidirectional ? "var(--color-teal)" : "var(--color-line-2)" }}
        >
          <span className="dot" style={{ background: w.bidirectional ? "var(--color-teal)" : "var(--color-muted)" }} />
          {w.bidirectional ? "bidirectional" : "outbound only"}
        </span>
      </div>
    </div>
  );
}

function AuditResultView({ a }: { a: AuditResult }) {
  const icon: Record<string, { ch: string; color: string }> = {
    pass: { ch: "ok", color: "var(--color-teal)" },
    fail: { ch: "x", color: "var(--color-blocked)" },
    skip: { ch: "..", color: "var(--color-muted)" },
  };
  return (
    <div className="card p-4">
      <div className="flex gap-4 mb-3 font-mono text-xs">
        <span style={{ color: "var(--color-teal)" }}>{a.passed} verified</span>
        <span style={{ color: "var(--color-muted)" }}>{a.skipped} deferred</span>
        {a.failed > 0 && <span style={{ color: "var(--color-blocked)" }}>{a.failed} blocked</span>}
      </div>
      <div className="space-y-1.5">
        {a.tests.map((t) => (
          <div key={t.name} className="flex items-start gap-2.5">
            <span className="font-mono text-[0.7rem] mt-0.5 w-5" style={{ color: icon[t.status].color }}>
              [{icon[t.status].ch}]
            </span>
            <div className="flex-1 flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-medium">{t.name}</span>
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                {t.detail}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---- Report + vault ---- */

// Tiny clipboard helper: a mono code line with a copy button that flips to a
// confirmation for a moment. Used by the hosted-MCP banner so a non-technical user
// copies the exact config / command with one click, no typing.
function CopyLine({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked; the text is visible to copy manually */
    }
  }
  return (
    <div>
      <div className="font-mono text-[0.56rem] uppercase tracking-wider mb-1" style={{ color: "var(--color-muted)" }}>
        {label}
      </div>
      <div className="flex items-stretch gap-2">
        <pre
          className="flex-1 font-mono text-[0.7rem] leading-relaxed overflow-x-auto rounded-md p-2.5 m-0"
          style={{ background: "#1b1812", color: "#d8cfbe", border: "1px solid #2c2820" }}
        >
          {value}
        </pre>
        <button
          onClick={copy}
          className="shrink-0 font-mono text-[0.62rem] px-3 rounded-md"
          style={{
            background: copied ? "var(--color-teal)" : "var(--color-ink)",
            color: copied ? "var(--color-ink)" : "var(--color-paper)",
            border: "none",
          }}
          aria-label={`Copy ${label}`}
        >
          {copied ? "copied ✓" : "copy"}
        </button>
      </div>
    </div>
  );
}

// Preferred path: the app's OFFICIAL hosted MCP (resolved from the MCP registry).
// Shown at the very top of the report as the fastest, zero-setup, Claude-native way
// to connect, with copy-paste config + CLI. Does not replace the connection flow
// below; it leads it. Rendered only when discovery resolved a hosted MCP.
function HostedMcpBanner({ mcp, appName }: { mcp: NonNullable<Discovery["hostedMcp"]>; appName: string }) {
  const slug = appName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "app";
  const json = `{
  "mcpServers": {
    "${slug}": { "url": "${mcp.url}" }
  }
}`;
  const cli = `claude mcp add --transport ${mcp.transport} ${slug} ${mcp.url}`;
  return (
    <div
      className="p-6 sm:p-8"
      style={{ background: "var(--color-paper)", borderBottom: "1px solid var(--color-line-2)" }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="dot" style={{ background: "var(--color-teal)" }} />
        <span className="font-mono text-[0.58rem] uppercase tracking-wider" style={{ color: "var(--color-teal)" }}>
          official hosted mcp · fastest path · zero setup
        </span>
      </div>
      <h3 className="font-display font-bold text-xl leading-tight">
        {appName} speaks MCP natively.
      </h3>
      <p className="mt-1.5 mb-4 text-sm max-w-2xl" style={{ color: "var(--color-ink-soft)" }}>
        {appName} publishes an official hosted MCP server at{" "}
        <a href={mcp.url} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted" style={{ color: "var(--color-teal)" }}>
          {mcp.url.replace(/^https?:\/\//, "")}
        </a>
        . Add it to any MCP client (Claude included) and you are connected. Nothing to build, no server to
        run; you authorize once inside your client. This is the quickest way to connect {appName}.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        <CopyLine label="MCP client config" value={json} />
        <CopyLine label="Claude Code (one command)" value={cli} />
      </div>
    </div>
  );
}

function ReportPanel({ integration }: { integration: Integration }) {
  const r = integration.report!;
  const hostedMcp = integration.discovery?.hostedMcp;
  return (
    <div className="mt-10 rise">
      <div className="card overflow-hidden" style={{ boxShadow: "var(--shadow-lift)" }}>
        <div className="p-6 sm:p-8 wires" style={{ background: "var(--color-paper-2)" }}>
          <div className="kicker mb-3">integration report</div>
          <h2 className="font-display font-extrabold text-[clamp(1.6rem,3.5vw,2.4rem)] leading-tight max-w-2xl">
            {r.headline}
          </h2>
          <p className="mt-3 text-base max-w-2xl" style={{ color: "var(--color-ink-soft)" }}>
            {r.summary}
          </p>
        </div>

        {hostedMcp && <HostedMcpBanner mcp={hostedMcp} appName={integration.appName} />}

        <div className="p-6 sm:p-8 grid lg:grid-cols-2 gap-8">
          <div>
            <div className="font-mono text-[0.6rem] uppercase tracking-wider mb-3" style={{ color: "var(--color-muted)" }}>
              what you can now do
            </div>
            <ul className="space-y-2.5">
              {r.capabilities.map((c, i) => (
                <li key={i} className="flex gap-2.5 text-sm">
                  <span style={{ color: "var(--color-teal)" }}>&#10003;</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
            {r.warnings.length > 0 && (
              <div className="mt-5">
                <div className="font-mono text-[0.6rem] uppercase tracking-wider mb-2" style={{ color: "var(--color-muted)" }}>
                  watch for
                </div>
                <ul className="space-y-1.5">
                  {r.warnings.map((w, i) => (
                    <li key={i} className="flex gap-2 text-xs" style={{ color: "var(--color-ink-soft)" }}>
                      <span style={{ color: "var(--color-signal-2)" }}>!</span>
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div>
            <div className="font-mono text-[0.6rem] uppercase tracking-wider mb-3" style={{ color: "var(--color-muted)" }}>
              next steps
            </div>
            <div className="space-y-2.5">
              {r.nextSteps.map((s, i) => (
                <div key={i} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{s.label}</div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
                        {s.detail}
                      </div>
                    </div>
                    <span
                      className="font-mono text-[0.58rem] px-2 py-0.5 rounded-full uppercase"
                      style={{ background: "var(--color-paper-2)", border: "1px solid var(--color-line-2)", color: "var(--color-muted)" }}
                    >
                      {s.kind}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <Vault integration={integration} />
          </div>
        </div>
      </div>
    </div>
  );
}

type OAuthStatus =
  | { kind: "connected" }
  | { kind: "error"; reason: string }
  | { kind: "blocked"; reason: string };

function Vault({ integration }: { integration: Integration }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<OAuthStatus | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const connected = integration.secrets.length > 0;
  const recipe = integration.recovery;
  // "blocked" is now structurally unreachable for a login-able app; kept as a
  // last-resort guard only.
  const blocked = integration.status === "blocked";
  // No API / OAuth (e.g. Signal): connect via a managed browser session instead.
  const managed = integration.report?.connectMethod === "managed-session";
  const sessionVerified = Boolean(integration.managedSession?.verified);
  // The Pathfinder found a real connector (self-host wrapper, community node, CLI).
  const researched = integration.report?.connectMethod === "researched-connector";
  // NodeWorm hosts the connector itself: the user only links once (scans a QR).
  const hosted = integration.report?.connectMethod === "hosted-connector";
  const research = integration.research;
  const connectorVerified = Boolean(integration.connector?.verified);
  // PIN unlock modal: opened by ?pin=required (from oauth/start) or by a child
  // card hitting a 403 pin:required. `after` runs once the vault is unlocked.
  const [pinModal, setPinModal] = useState<{ after: () => void } | null>(null);
  const requestUnlock = (after: () => void) => setPinModal({ after });

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const oauth = p.get("oauth");
    const recover = p.get("recover");
    const pin = p.get("pin");
    if (oauth === "connected") {
      setStatus({ kind: "connected" });
      setCelebrate(true);
    } else if (oauth === "blocked") {
      setStatus({ kind: "blocked", reason: p.get("reason") ?? "No genuine OAuth path is available." });
    } else if (oauth === "error") {
      setStatus({ kind: "error", reason: p.get("reason") ?? "The authorization did not complete." });
    } else if (pin === "required") {
      setPinModal({ after: () => { window.location.href = `/api/integrations/${integration.id}/oauth/start`; } });
    }
    // Strip the query so a refresh does not replay the banner / celebration.
    if (oauth || recover || pin) window.history.replaceState({}, "", window.location.pathname);
  }, [integration.id]);

  function authorize() {
    setBusy(true);
    // Hand off to the resolver: it either runs the genuine consent (creds in hand)
    // or comes back with the guided recovery card to register a client.
    window.location.href = `/api/integrations/${integration.id}/oauth/start`;
  }

  return (
    <>
      {celebrate && (
        <ReelItIn appName={integration.appName} appUrl={integration.appUrl} onDone={() => setCelebrate(false)} />
      )}
      {pinModal && (
        <PinUnlockModal
          onClose={() => setPinModal(null)}
          onUnlocked={() => {
            const after = pinModal.after;
            setPinModal(null);
            after();
          }}
        />
      )}
      <div className="mt-5 card p-4" style={{ background: "var(--color-paper-2)" }}>
        <div className="font-mono text-[0.6rem] uppercase tracking-wider mb-2" style={{ color: "var(--color-muted)" }}>
          oauth connection
        </div>

        {status?.kind === "connected" && (
          <StatusBanner accent="var(--color-teal)" title="On the line">
            Genuine consent complete. NodeWorm exchanged the code for live tokens, stored them encrypted, and holds a masked reference.
          </StatusBanner>
        )}
        {status?.kind === "error" && (
          <StatusBanner accent="var(--color-signal-2)" title="Authorization failed">
            {status.reason}
          </StatusBanner>
        )}
        {blocked && status?.kind === "blocked" && (
          <StatusBanner accent="var(--color-signal-2)" title="No path">
            {status.reason}
          </StatusBanner>
        )}

        {managed && sessionVerified && (
          <StatusBanner accent="var(--color-live)" title="Connected via managed session">
            NodeWorm holds a live authenticated browser session to {integration.appName}
            {integration.managedSession?.verifiedDetail ? ` (${integration.managedSession.verifiedDetail})` : ""}. Re-open and log
            in again if the session ever expires.
          </StatusBanner>
        )}

        {connectorVerified && (
          <StatusBanner accent="var(--color-live)" title="Connected via connector">
            NodeWorm reached your {integration.connector?.methodName ?? "connector"}
            {integration.connector?.verifiedDetail ? ` (${integration.connector.verifiedDetail})` : ""} and verified one real read.
            {integration.connector?.registeredHint ? ` Your connector reports: ${integration.connector.registeredHint}.` : ""} Write
            actions and two-way sync are verified the first time you use them.
          </StatusBanner>
        )}

        {!managed && connected && (
          <div className="mb-3 space-y-1">
            {integration.secrets.map((s) => (
              <div key={s.name} className="flex items-center justify-between font-mono text-xs">
                <span>{s.name}</span>
                <span style={{ color: "var(--color-teal)" }}>{s.maskedValue} &#10003;</span>
              </div>
            ))}
          </div>
        )}

        {/* Primary autonomous path: sign in once, NodeWorm drives everything else. */}
        {managed && !sessionVerified && !connectorVerified && !blocked && (
          <ManagedSessionCard integration={integration} />
        )}

        {/* No browser login, but NodeWorm HOSTS the connector: the user only links
            once (scans a QR); NodeWorm runs and drives the bridge. */}
        {hosted && !connectorVerified && !blocked && (
          <HostedConnectorCard integration={integration} requestUnlock={requestUnlock} />
        )}

        {/* Rare genuine no-web-UI app (pure CLI/desktop tool): a self-hosted
            connector is the only path, so it is the primary card here. */}
        {researched && research?.best && !connected && !connectorVerified && (
          <ResearchedMethodCard integration={integration} research={research} requestUnlock={requestUnlock} />
        )}

        {/* Optional advanced alternative, collapsed so a non-technical user never
            faces it. Only offered when a managed session is the primary path. */}
        {managed && research?.best && !sessionVerified && !connectorVerified && !blocked && (
          <details className="mt-3">
            <summary
              className="cursor-pointer select-none font-mono text-[0.6rem] uppercase tracking-wider"
              style={{ color: "var(--color-muted)" }}
            >
              Advanced: self-host a connector instead
            </summary>
            <div className="mt-2">
              <p className="text-[0.66rem] mb-2" style={{ color: "var(--color-muted)" }}>
                Optional, not required. If you would rather run your own connector than use the managed
                browser session above, NodeWorm can talk to it. This needs technical setup; the managed
                session needs only your sign-in.
              </p>
              <ResearchedMethodCard integration={integration} research={research} requestUnlock={requestUnlock} />
            </div>
          </details>
        )}

        {!managed && !researched && !hosted && !connected && !blocked && recipe && (
          <RecoveryCard integration={integration} recipe={recipe} requestUnlock={requestUnlock} />
        )}

        {!managed && !researched && !hosted && !connected && !blocked && !recipe && (
          <button onClick={authorize} className="btn btn-ink text-sm w-full" disabled={busy}>
            {busy ? "Resolving..." : `Authorize ${integration.appName} via OAuth`}
          </button>
        )}

        <p className="mt-2 text-[0.66rem]" style={{ color: "var(--color-muted)" }}>
          {hosted
            ? `${integration.appName} has no browser login, so NodeWorm hosts the connector itself. Your only step is to scan a QR once to link your account; NodeWorm runs and drives the bridge, holding the link encrypted. A hosted bridge can read and send on your account, so it asks for your consent first.`
            : researched
              ? `${integration.appName} has no web interface NodeWorm can drive, so the Pathfinder researched real, documented connectors. This one needs a technical setup step; NodeWorm then talks to it. Nothing is shared that should not be.`
              : managed
                ? "You authenticate to the app once (a login or a QR scan) in a managed browser NodeWorm controls. NodeWorm holds the live session and drives everything else itself, never your password. You do nothing beyond that one sign-in."
                : "NodeWorm connects only through a genuine OAuth 2.0 consent (Authorization Code, PKCE where supported). It never asks for a password or an API key, and the access and refresh tokens are stored encrypted, never returned to the browser."}
        </p>

        {/* Self-repair: if this method is not working, advance to the next viable one. */}
        {!connected && !blocked && (integration.report?.fallbacks?.length ?? 0) > 0 && (
          <RepairAction integration={integration} />
        )}
      </div>
    </>
  );
}

// Surfaces the decision tree's plan B: when the current method is not working, one
// click re-architects to the next viable connect method (POST /repair).
function RepairAction({ integration }: { integration: Integration }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const next = integration.report?.fallbacks?.[0];
  if (!next) return null;

  async function tryAnother() {
    if (busy) return;
    setBusy(true);
    setMsg("Switching method…");
    try {
      const res = await fetch(`/api/integrations/${integration.id}/repair`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        window.location.href = `/run/${integration.id}`;
        return;
      }
      setMsg(data.error ?? "No other method to try.");
    } catch {
      setMsg("Could not switch method.");
    }
    setBusy(false);
  }

  return (
    <div className="mt-3 pt-3" style={{ borderTop: "1px dashed var(--color-line-2)" }}>
      <button
        onClick={tryAnother}
        disabled={busy}
        className="text-[0.7rem] underline"
        style={{ color: "var(--color-muted)" }}
      >
        {busy ? "Switching…" : `Not working? Try another way: ${next.label}`}
      </button>
      {msg && (
        <p className="font-mono text-[0.6rem] mt-1" style={{ color: "var(--color-muted)" }}>
          {msg}
        </p>
      )}
    </div>
  );
}

// Managed browser session (R6 floor): for apps with no API/OAuth, open a hosted
// browser at the app, the user logs into the app's own UI, NodeWorm holds the
// live session. One real read verifies it before "connected via session".
function ManagedSessionCard({ integration }: { integration: Integration }) {
  const [liveView, setLiveView] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Once the hosted browser is open NodeWorm watches the session in the background
  // and connects the moment the user finishes signing in, so the ONLY user action
  // is the auth itself. `watching` drives the live indicator; the refs guard against
  // overlapping verifies and let us stop the loop on unmount / success.
  const [watching, setWatching] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const checkingRef = useRef(false);

  function stopWatching() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setWatching(false);
  }

  // One verify attempt. manual=true is the user pressing "Connect now" (shows
  // feedback); manual=false is a silent background poll.
  async function check(manual: boolean) {
    if (checkingRef.current) return;
    checkingRef.current = true;
    if (manual) {
      setBusy(true);
      setMsg("Checking the session…");
    }
    try {
      const res = await fetch(`/api/integrations/${integration.id}/session/confirm`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        stopWatching();
        window.location.href = `/run/${integration.id}?oauth=connected`;
        return;
      }
      if (manual) setMsg(data.error ?? "Not connected yet. Finish signing in, then try again.");
    } catch {
      if (manual) setMsg("Verification failed. Try again once you are signed in.");
    } finally {
      checkingRef.current = false;
      if (manual) setBusy(false);
    }
  }

  async function open() {
    if (busy) return;
    setBusy(true);
    setMsg(`Spinning up a hosted browser at ${integration.appName}…`);
    try {
      const res = await fetch(`/api/integrations/${integration.id}/session/open`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const { liveViewUrl } = await res.json();
      setLiveView(liveViewUrl);
      if (liveViewUrl) window.open(liveViewUrl, "_blank", "noopener");
      setMsg(
        `Hosted browser opened in a new tab. Just sign into ${integration.appName} there (log in or scan the QR code). NodeWorm is watching and connects the moment you are in. You can leave this page and come back.`,
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to start the hosted browser");
    }
    setBusy(false);
  }

  // Background watcher: poll the verifier every 6s once the hosted browser is open,
  // up to ~8 min, so the user never has to click "confirm".
  useEffect(() => {
    if (!liveView) return;
    setWatching(true);
    let attempts = 0;
    pollRef.current = setInterval(() => {
      attempts += 1;
      if (attempts > 80) {
        stopWatching();
        setMsg("Still not signed in. Finish signing in, then press Connect now.");
        return;
      }
      void check(false);
    }, 6000);
    return () => stopWatching();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveView]);

  return (
    <div className="rounded-lg p-4 mb-3" style={{ border: "1px solid var(--color-line-2)", background: "var(--color-paper)" }}>
      <div className="flex items-center gap-2 mb-2">
        <span className="dot" style={{ background: "var(--color-live)" }} />
        <span className="font-mono text-[0.58rem] uppercase tracking-wider" style={{ color: "var(--color-live)" }}>
          managed browser session
        </span>
      </div>
      <p className="text-sm mb-3" style={{ color: "var(--color-ink-soft)" }}>
        {integration.appName} has no API or OAuth, so NodeWorm connects it for you by driving its own web UI.
        Your only step is to sign in once (a login or a QR scan) in a hosted browser. NodeWorm watches for your
        sign-in and connects automatically. It never sees your password.
      </p>
      {!liveView ? (
        <button onClick={open} disabled={busy} className="btn btn-signal text-sm w-full justify-center">
          {busy ? "Starting…" : `Connect ${integration.appName} (you just sign in)`}
        </button>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-wider" style={{ color: "var(--color-live)" }}>
            <span className={`dot${watching ? " animate-pulse" : ""}`} style={{ background: "var(--color-live)" }} />
            {watching ? "watching for your sign-in" : "paused"}
          </div>
          <button onClick={() => check(true)} disabled={busy} className="btn btn-ink text-sm w-full justify-center">
            {busy ? "Checking…" : "Connect now"}
          </button>
          <button
            onClick={() => liveView && window.open(liveView, "_blank", "noopener")}
            className="text-[0.62rem] underline w-full text-center"
            style={{ color: "var(--color-muted)" }}
          >
            Reopen the hosted browser
          </button>
        </div>
      )}
      {msg && (
        <p className="font-mono text-[0.62rem] mt-2" style={{ color: "var(--color-muted)" }}>
          {msg}
        </p>
      )}
    </div>
  );
}

// NodeWorm-hosted connector: the app has no browser login, but NodeWorm runs the
// connector itself (e.g. a Signal bridge). The user's ONLY step is to consent, then
// scan the device-link QR once. NodeWorm watches the bridge in the background and
// connects the moment the link completes. Inert-until-keyed: rendered only when the
// architect resolved connectMethod === "hosted-connector" (a bridge endpoint is set).
function HostedConnectorCard({
  integration,
  requestUnlock,
}: {
  integration: Integration;
  requestUnlock: (after: () => void) => void;
}) {
  const [consented, setConsented] = useState(integration.connectorConsent?.app === integration.appName);
  const [qr, setQr] = useState<{ dataUrl?: string; uri?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const checkingRef = useRef(false);

  function stopWatching() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setWatching(false);
  }

  async function start() {
    if (busy) return;
    setBusy(true);
    setMsg("Opening a device link on the hosted bridge…");
    try {
      const res = await fetch(`/api/integrations/${integration.id}/hosted-connector/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ consent: true }),
      });
      const data = await res.json();
      if (!data.ok) {
        setMsg(data.error ?? "Couldn't start the link.");
        setBusy(false);
        return;
      }
      setQr({ dataUrl: data.qrDataUrl, uri: data.qrUri });
      setMsg(`Scan this QR in ${integration.appName} > Linked devices. NodeWorm is watching and connects the moment you link.`);
    } catch {
      setMsg("Couldn't reach the hosted bridge.");
    }
    setBusy(false);
  }

  // manual=true is the user pressing "Check now"; manual=false is a silent poll.
  async function check(manual: boolean) {
    if (checkingRef.current) return;
    checkingRef.current = true;
    if (manual) {
      setBusy(true);
      setMsg("Checking the link…");
    }
    try {
      const res = await fetch(`/api/integrations/${integration.id}/hosted-connector/verify`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        stopWatching();
        window.location.href = `/run/${integration.id}?oauth=connected`;
        return;
      }
      if (data.pin === "required") {
        stopWatching();
        if (manual) {
          setBusy(false);
          requestUnlock(() => check(true));
        } else {
          setMsg("Unlock your vault with your PIN, then press Check now.");
        }
        return;
      }
      if (manual) setMsg(data.error ?? "Not linked yet. Scan the QR, then try again.");
    } catch {
      if (manual) setMsg("Verification failed. Try again once you have scanned the QR.");
    } finally {
      checkingRef.current = false;
      if (manual) setBusy(false);
    }
  }

  // Background watcher: once the QR is showing, poll for link completion every 5s
  // (up to ~7 min) so the user only has to scan.
  useEffect(() => {
    if (!qr) return;
    setWatching(true);
    let attempts = 0;
    pollRef.current = setInterval(() => {
      attempts += 1;
      if (attempts > 84) {
        stopWatching();
        setMsg("Still not linked. Scan the QR, then press Check now.");
        return;
      }
      void check(false);
    }, 5000);
    return () => stopWatching();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qr]);

  return (
    <div className="rounded-lg p-4 mb-3" style={{ border: "1px solid var(--color-line-2)", background: "var(--color-paper)" }}>
      <div className="flex items-center gap-2 mb-2">
        <span className="dot" style={{ background: "var(--color-live)" }} />
        <span className="font-mono text-[0.58rem] uppercase tracking-wider" style={{ color: "var(--color-live)" }}>
          nodeworm-hosted bridge
        </span>
      </div>
      <p className="text-sm mb-3" style={{ color: "var(--color-ink-soft)" }}>
        {integration.appName} has no browser login, so NodeWorm runs the connector for you. Your only step is to
        scan a QR once to link your account. NodeWorm holds the link encrypted and drives it; you install nothing.
      </p>

      {!qr ? (
        <>
          <label className="flex items-start gap-2 mb-3 cursor-pointer text-[0.72rem]" style={{ color: "var(--color-ink-soft)" }}>
            <input type="checkbox" checked={consented} onChange={(e) => setConsented(e.target.checked)} className="mt-0.5 shrink-0" />
            <span>
              I understand NodeWorm will link a device to my {integration.appName} account through a bridge it hosts,
              and can read and send on my account for the actions I connect.
            </span>
          </label>
          <button onClick={start} disabled={busy || !consented} className="btn btn-signal text-sm w-full justify-center">
            {busy ? "Starting…" : `Link ${integration.appName} (scan one QR)`}
          </button>
        </>
      ) : (
        <div className="space-y-3">
          {qr.dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qr.dataUrl}
              alt={`${integration.appName} device-link QR`}
              className="mx-auto rounded bg-white p-2"
              style={{ width: 200, height: 200 }}
            />
          ) : qr.uri ? (
            <p className="font-mono text-[0.6rem] break-all rounded p-2" style={{ background: "var(--color-paper-2)", color: "var(--color-muted)" }}>
              {qr.uri}
            </p>
          ) : null}
          <div className="flex items-center gap-2 font-mono text-[0.6rem] uppercase tracking-wider" style={{ color: "var(--color-live)" }}>
            <span className={`dot${watching ? " animate-pulse" : ""}`} style={{ background: "var(--color-live)" }} />
            {watching ? "watching for the link" : "paused"}
          </div>
          <button onClick={() => check(true)} disabled={busy} className="btn btn-ink text-sm w-full justify-center">
            {busy ? "Checking…" : "Check now"}
          </button>
        </div>
      )}
      {msg && (
        <p className="font-mono text-[0.62rem] mt-2" style={{ color: "var(--color-muted)" }}>
          {msg}
        </p>
      )}
    </div>
  );
}

// Pathfinder result: the app has no API/OAuth, so NodeWorm researched real,
// documented connectors (self-host wrappers, community nodes, CLIs). Surfaces the
// recommended method with its repo + setup steps, and the ranked fallbacks. Honest:
// model-researched, the user stands the connector up; NodeWorm does not fake it live.
const KIND_LABEL: Record<ResearchMethod["kind"], string> = {
  "web-client": "web client",
  "mcp-server": "MCP server",
  "rest-wrapper": "REST wrapper",
  cli: "CLI",
  "desktop-bot": "desktop bot",
  "community-node": "community node",
  "unofficial-api": "unofficial API",
  "official-api": "official API",
  "export-import": "export / import",
  "reverse-api-capture": "network capture",
};

function relColor(r: ResearchMethod["reliability"]): string {
  return r === "high" ? "var(--color-live)" : r === "medium" ? "var(--color-signal)" : "var(--color-muted)";
}

function riskColor(r: "low" | "medium" | "high" | "blocked"): string {
  return r === "low" ? "var(--color-teal)" : r === "medium" ? "var(--color-signal)" : r === "high" ? "var(--color-signal-2)" : "var(--color-muted)";
}

function MethodChip({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="font-mono text-[0.56rem] uppercase tracking-wider px-1.5 py-0.5 rounded"
      style={{ color, border: `1px solid ${color}`, opacity: 0.9 }}
    >
      {label}
    </span>
  );
}

function ResearchedMethodCard({
  integration,
  research,
  requestUnlock,
}: {
  integration: Integration;
  research: ResearchResult;
  requestUnlock: (after: () => void) => void;
}) {
  const best = research.best!;
  const others = research.ranked.filter((m) => m !== best);
  const [url, setUrl] = useState("");
  const [healthPath, setHealthPath] = useState(best.kind === "rest-wrapper" ? "/v1/about" : "/health");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [needsExtension, setNeedsExtension] = useState(false);
  const [verifyingLocal, setVerifyingLocal] = useState(false);
  // Agentic execution: does the cloud offer a signed setup plan for this app?
  const [execAvailable, setExecAvailable] = useState(false);
  const [showAgent, setShowAgent] = useState(false);

  useEffect(() => {
    fetch(`/api/integrations/${integration.id}/execute/check`)
      .then((r) => r.json())
      .then((d) => setExecAvailable(Boolean(d.available)))
      .catch(() => {});
  }, [integration.id]);

  // Listen for the extension's verify-local result posted back by content-nodeworm.js.
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.data?.type !== "nw_verify_local_result") return;
      setVerifyingLocal(false);
      if (e.data.ok) {
        window.location.href = `/run/${integration.id}?oauth=connected`;
      } else {
        setMsg(e.data.error ?? "Extension could not reach the connector.");
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [integration.id]);

  async function connect() {
    const u = url.trim();
    if (!u || busy) return;
    setBusy(true);
    setNeedsExtension(false);
    setMsg(`Reaching your ${best.name}…`);
    try {
      const res = await fetch(`/api/integrations/${integration.id}/connector/connect`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: u, token: token.trim() || undefined, healthPath: healthPath.trim() || undefined }),
      });
      const data = await res.json();
      if (data.ok) {
        window.location.href = `/run/${integration.id}?oauth=connected`;
        return;
      }
      if (data.pin === "required") {
        setBusy(false);
        requestUnlock(() => connect());
        return;
      }
      if (data.needsExtension) {
        setNeedsExtension(true);
        setMsg(null);
        setBusy(false);
        return;
      }
      setMsg(data.error ?? "Couldn't reach the connector.");
    } catch {
      setMsg("Couldn't reach the connector. Check the URL and that it is running.");
    }
    setBusy(false);
  }

  function verifyViaExtension() {
    setVerifyingLocal(true);
    setMsg("Asking the Helper to check your connector…");
    window.postMessage(
      { type: "nw_verify_local", id: integration.id, url: url.trim(), token: token.trim() || undefined, healthPath: healthPath.trim() || undefined },
      window.location.origin,
    );
  }

  const inputCls = "w-full bg-transparent outline-none font-mono text-xs px-2.5 py-2 rounded placeholder:opacity-40";
  const inputStyle = { border: "1px solid var(--color-line-2)", color: "var(--color-ink)" } as const;

  return (
    <div className="rounded-lg p-4 mb-3" style={{ border: "1px solid var(--color-live)", background: "var(--color-paper)" }}>
      <div className="flex items-center gap-2 mb-2">
        <span className="dot" style={{ background: "var(--color-live)" }} />
        <span className="font-mono text-[0.58rem] uppercase tracking-wider" style={{ color: "var(--color-live)" }}>
          pathfinder · researched connector
        </span>
      </div>
      <p className="text-sm mb-3" style={{ color: "var(--color-ink-soft)" }}>
        {integration.appName} has no API or OAuth NodeWorm can call directly. The Pathfinder found{" "}
        {research.ranked.length} real way{research.ranked.length === 1 ? "" : "s"} to connect it. Recommended:
      </p>

      <div className="rounded-md p-3 mb-3" style={{ background: "var(--color-paper-2)", border: "1px solid var(--color-line-2)" }}>
        <div className="flex flex-wrap items-center gap-2 mb-1.5">
          <span className="font-semibold text-base" style={{ color: "var(--color-ink)" }}>
            {best.name}
          </span>
          <MethodChip label={KIND_LABEL[best.kind]} color="var(--color-teal)" />
          <MethodChip label={`${best.reliability} reliability`} color={relColor(best.reliability)} />
          <MethodChip label={`${best.difficulty} setup`} color="var(--color-muted)" />
          {best.selfHostable && <MethodChip label="self-hostable" color="var(--color-live)" />}
        </div>
        <p className="text-sm mb-3" style={{ color: "var(--color-ink-soft)" }}>
          {best.summary}
        </p>

        {execAvailable && (
          <div className="mb-3">
            <button onClick={() => setShowAgent(true)} className="btn btn-signal text-sm w-full justify-center">
              ⚡ Set this up for me
            </button>
            <p className="text-[0.62rem] mt-1.5" style={{ color: "var(--color-muted)" }}>
              The NodeWorm Agent runs the setup on your machine in Docker. You approve the exact commands, then only
              scan the QR. Or do the steps yourself below.
            </p>
          </div>
        )}

        {showAgent && (
          <AgentExecutionModal integrationId={integration.id} appName={integration.appName} onClose={() => setShowAgent(false)} />
        )}

        {best.setupSteps.length > 0 && (
          <ol className="space-y-1.5 mb-3">
            {best.setupSteps.map((s, i) => (
              <li key={i} className="flex gap-2.5 text-[0.8rem]" style={{ color: "var(--color-ink-soft)" }}>
                <span
                  className="font-mono text-[0.62rem] shrink-0 grid place-items-center rounded-full"
                  style={{ width: 16, height: 16, marginTop: 1, color: "var(--color-live)", border: "1px solid var(--color-live)" }}
                >
                  {i + 1}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        )}

        {best.url && (
          <a href={best.url} target="_blank" rel="noopener noreferrer" className="btn btn-signal text-sm w-full justify-center">
            {best.kind === "web-client"
              ? `Open ${best.name}`
              : /github\.com/i.test(best.url)
                ? `View project on GitHub`
                : `Open ${best.name}`}
            {" "}<ExternalArrow />
          </a>
        )}
      </div>

      {/* Once it is set up, point NodeWorm at it. One real GET verifies it is live. */}
      <div className="rounded-md p-3 mb-3" style={{ background: "var(--color-paper)", border: "1px solid var(--color-line)" }}>
        <div className="font-mono text-[0.56rem] uppercase tracking-wider mb-2" style={{ color: "var(--color-live)" }}>
          set it up, then point NodeWorm at it
        </div>
        <div className="space-y-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy}
            placeholder={`your ${best.name} URL (e.g. https://signal.yourdomain.com)`}
            className={inputCls}
            style={inputStyle}
            aria-label="Connector URL"
          />
          <div className="flex gap-2">
            <input
              value={healthPath}
              onChange={(e) => setHealthPath(e.target.value)}
              disabled={busy}
              placeholder="/health"
              className={`${inputCls} w-32`}
              style={inputStyle}
              aria-label="Health path (optional)"
            />
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              disabled={busy}
              type="password"
              placeholder="access token (optional)"
              className={`${inputCls} flex-1`}
              style={inputStyle}
              aria-label="Connector access token (optional)"
            />
          </div>
        </div>
        {needsExtension ? (
          <div className="mt-2.5 rounded-md p-3" style={{ background: "var(--color-paper-2)", border: "1px solid var(--color-signal)" }}>
            <div className="font-mono text-[0.56rem] uppercase tracking-wider mb-1.5" style={{ color: "var(--color-signal)" }}>
              local address, cloud can't reach it
            </div>
            <p className="text-xs mb-2" style={{ color: "var(--color-ink-soft)" }}>
              That URL is on your local network. The NodeWorm Helper extension can verify it from your machine directly, with no
              tunnel needed.
            </p>
            <button
              onClick={verifyViaExtension}
              disabled={verifyingLocal}
              className="btn btn-ink text-sm w-full justify-center"
            >
              {verifyingLocal ? "Asking Helper…" : "Verify with NodeWorm Helper"}
            </button>
            <p className="font-mono text-[0.56rem] mt-1.5" style={{ color: "var(--color-muted)" }}>
              No Helper installed? Expose the connector over https (Cloudflare Tunnel or Tailscale Funnel) and re-enter the public
              URL above.
            </p>
          </div>
        ) : (
          <button onClick={connect} disabled={busy || !url.trim()} className="btn btn-ink text-sm w-full justify-center mt-2.5">
            {busy ? "Connecting…" : "Connect to my connector"}
          </button>
        )}
        <p className="font-mono text-[0.58rem] mt-2" style={{ color: "var(--color-muted)" }}>
          NodeWorm makes one real GET to verify it is reachable, then holds the URL (and the token you set on YOUR OWN connector, if
          any) encrypted. Never your {integration.appName} password or API key.
        </p>
        {msg && (
          <p className="font-mono text-[0.62rem] mt-2" style={{ color: needsExtension ? "var(--color-ink-soft)" : "var(--color-signal)" }}>
            {msg}
          </p>
        )}
      </div>

      {others.length > 0 && (
        <details>
          <summary
            className="font-mono text-[0.62rem] cursor-pointer select-none"
            style={{ color: "var(--color-muted)" }}
          >
            + {others.length} more method{others.length === 1 ? "" : "s"} as a fallback
          </summary>
          <div className="mt-2 space-y-1.5">
            {others.map((m) => (
              <div
                key={m.name}
                className="flex items-center gap-2 rounded px-2.5 py-1.5"
                style={{ background: "var(--color-paper-2)", border: "1px solid var(--color-line-2)" }}
              >
                <span className="text-[0.8rem] font-medium" style={{ color: "var(--color-ink)" }}>
                  {m.name}
                </span>
                <MethodChip label={KIND_LABEL[m.kind]} color="var(--color-muted)" />
                <span className="font-mono text-[0.56rem]" style={{ color: relColor(m.reliability) }}>
                  {m.reliability}
                </span>
                <span className="flex-1" />
                {m.url && (
                  <a
                    href={m.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[0.62rem] inline-flex items-center gap-1 hover:opacity-70"
                    style={{ color: "var(--color-teal)" }}
                  >
                    open <ExternalArrow />
                  </a>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      <p className="font-mono text-[0.6rem] mt-3" style={{ color: "var(--color-muted)" }}>
        Researched by the model. Verify the project and link before relying on it.
      </p>
    </div>
  );
}

function ExternalArrow() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden className="inline-block">
      <path d="M6 3h7v7M13 3 4 12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// The "crack it" recovery card: when no OAuth client exists, walk the user
// through registering one on the provider's portal, then capture the pasted-back
// client id/secret and run the real consent. The user does only the portal clicks.
function RecoveryCard({
  integration,
  recipe,
  requestUnlock,
}: {
  integration: Integration;
  recipe: GuidedRecipe;
  requestUnlock: (after: () => void) => void;
}) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [cbAvailable, setCbAvailable] = useState(false);
  const [liveView, setLiveView] = useState<string | null>(null);
  const [cbBusy, setCbBusy] = useState(false);
  const [cbMsg, setCbMsg] = useState<string | null>(null);
  // Background auto-capture: once the hosted browser is open, NodeWorm polls for the
  // client id/secret the user is creating and continues to consent automatically, so
  // the only manual step is creating + authorizing the app in the portal.
  const [cbWatching, setCbWatching] = useState(false);
  const cbPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cbCheckingRef = useRef(false);

  // AI browser agent (Browser Use / Skyvern): the preferred path. NodeWorm runs an
  // agent that registers the OAuth app on the portal itself; the live browser is
  // embedded in this card so the user signs in inside it (no new tab, no URL), and
  // the agent reads back the keys and runs the consent. This supersedes the older
  // DOM-scrape cobrowse path whenever the agent driver is configured.
  const [agentAvailable, setAgentAvailable] = useState(false);
  const [agentLive, setAgentLive] = useState<string | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentMsg, setAgentMsg] = useState<string | null>(null);
  const [agentStep, setAgentStep] = useState<string | null>(null);
  const agentPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const agentCheckingRef = useRef(false);

  // Gated-portal consent: a portal above low risk needs explicit, recorded consent
  // to the accurate ToS/account-risk caveat before NodeWorm automates it.
  const pa = recipe.portalAutomation;
  const needsConsent = Boolean(pa && pa.allowAutomation !== false && pa.risk !== "low");
  const [consented, setConsented] = useState(integration.portalConsent?.app === integration.appName);
  const consentSatisfied = !needsConsent || consented;

  async function grantConsent(next: boolean) {
    setConsented(next);
    if (!next || !needsConsent || integration.portalConsent?.app === integration.appName) return;
    try {
      await fetch(`/api/integrations/${integration.id}/portal/consent`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ surface: "cobrowse" }),
      });
    } catch {
      /* server re-checks consent on open/capture, so a failed record just re-prompts */
    }
  }

  useEffect(() => {
    // The hosted-browser registration is the default for EVERY app (not just an
    // allowlist), so the user only ever signs in. Load availability unconditionally.
    fetch("/api/cobrowse/status")
      .then((r) => r.json())
      .then((d) => setCbAvailable(Boolean(d.available)))
      .catch(() => {});
    fetch("/api/agent-driver/status")
      .then((r) => r.json())
      .then((d) => setAgentAvailable(Boolean(d.available)))
      .catch(() => {});
  }, []);

  function stopAgentWatching() {
    if (agentPollRef.current) {
      clearInterval(agentPollRef.current);
      agentPollRef.current = null;
    }
  }

  // Launch the AI agent and embed its live browser. The agent works on its own; the
  // user only signs in inside the embedded frame if a login wall appears.
  async function startAgent() {
    if (agentBusy || !consentSatisfied) return;
    setAgentBusy(true);
    setAgentMsg("Starting the AI agent…");
    try {
      const res = await fetch(`/api/integrations/${integration.id}/oauth/agent/start`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start the agent");
      setAgentLive(data.liveViewUrl);
      setAgentMsg("The agent is registering the app. Sign in inside the window if it asks; do nothing else.");
    } catch (e) {
      setAgentMsg(e instanceof Error ? e.message : "Failed to start the AI agent");
    }
    setAgentBusy(false);
  }

  // Poll the agent. While it works we show its last step; when it has the keys we
  // store them (prompting for the PIN once) and run the genuine consent.
  async function pollAgent() {
    if (agentCheckingRef.current) return;
    agentCheckingRef.current = true;
    try {
      const res = await fetch(`/api/integrations/${integration.id}/oauth/agent/poll`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        stopAgentWatching();
        window.location.href = `/api/integrations/${integration.id}/oauth/start`;
        return;
      }
      if (data.pin === "required") {
        stopAgentWatching();
        setAgentMsg("Found the app keys. Unlock your vault with your PIN to finish.");
        requestUnlock(() => {
          // Re-poll once unlocked: the run's output is still readable, so this captures.
          void pollAgent();
        });
        return;
      }
      if (data.step) setAgentStep(data.step);
      if (data.state === "needs_login") {
        setAgentMsg(`Sign into ${integration.appName} in the window above; the agent will continue automatically.`);
      } else if (data.state === "blocked") {
        stopAgentWatching();
        setAgentLive(null);
        setAgentMsg(data.note ?? `${integration.appName} requires a manual review NodeWorm can't pass. Use the manual steps below.`);
      } else if (data.state === "failed") {
        stopAgentWatching();
        setAgentLive(null);
        setAgentMsg(data.note ? `The agent stopped: ${data.note}. You can retry or use the manual steps below.` : "The agent stopped before finishing. Retry or use the manual steps below.");
      }
    } catch {
      /* transient: the loop will retry on the next tick */
    } finally {
      agentCheckingRef.current = false;
    }
  }

  // Run the poll loop while the agent's live browser is embedded.
  useEffect(() => {
    if (!agentLive) return;
    let attempts = 0;
    agentPollRef.current = setInterval(() => {
      attempts += 1;
      if (attempts > 120) {
        stopAgentWatching();
        return;
      }
      void pollAgent();
    }, 5000);
    return () => stopAgentWatching();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentLive]);

  async function openHosted() {
    if (cbBusy || !consentSatisfied) return;
    setCbBusy(true);
    setCbMsg("Spinning up a hosted browser…");
    try {
      const res = await fetch(`/api/integrations/${integration.id}/oauth/cobrowse`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      const { liveViewUrl } = await res.json();
      setLiveView(liveViewUrl);
      if (liveViewUrl) window.open(liveViewUrl, "_blank", "noopener");
      setCbMsg("Hosted browser opened in a new tab. Log in, create the app, then capture.");
    } catch (e) {
      setCbMsg(e instanceof Error ? e.message : "Failed to start hosted browser");
    }
    setCbBusy(false);
  }

  function stopCbWatching() {
    if (cbPollRef.current) {
      clearInterval(cbPollRef.current);
      cbPollRef.current = null;
    }
    setCbWatching(false);
  }

  // manual=true is the user pressing the capture button (shows feedback, handles the
  // PIN modal); manual=false is a silent background poll.
  async function runCapture(manual: boolean) {
    if (cbCheckingRef.current) return;
    cbCheckingRef.current = true;
    if (manual) {
      setCbBusy(true);
      setCbMsg("Reading the client id/secret from the hosted browser…");
    }
    try {
      const res = await fetch(`/api/integrations/${integration.id}/oauth/cobrowse/capture`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        stopCbWatching();
        window.location.href = `/api/integrations/${integration.id}/oauth/start`;
        return;
      }
      if (data.pin === "required") {
        // Stop the silent loop and ask once; spamming the PIN modal would be hostile.
        stopCbWatching();
        if (manual) {
          setCbBusy(false);
          requestUnlock(() => runCapture(true));
        } else {
          setCbMsg("Unlock your vault with your PIN, then press capture.");
        }
        return;
      }
      // A partial scrape means the keys are showing but not both readable: stop the
      // loop, prefill what we got, and let the user finish via the manual fields.
      if (data.clientId || data.clientSecret) {
        stopCbWatching();
        if (data.clientId) setClientId(data.clientId);
        if (data.clientSecret) setClientSecret(data.clientSecret);
        setCbMsg("Found the keys. Check the fields below, then Save & run the consent.");
      } else if (manual) {
        setCbMsg("No keys visible yet. Create the app in the hosted browser, then capture.");
      }
    } catch {
      if (manual) setCbMsg("Capture failed. Paste the values below instead.");
    } finally {
      cbCheckingRef.current = false;
      if (manual) setCbBusy(false);
    }
  }

  const captureHosted = () => runCapture(true);

  // Watch for the created app's keys in the background so the user does not have to
  // press capture: poll every 7s for ~7 min once the hosted browser is open.
  useEffect(() => {
    if (!liveView) return;
    setCbWatching(true);
    let attempts = 0;
    cbPollRef.current = setInterval(() => {
      attempts += 1;
      if (attempts > 60) {
        stopCbWatching();
        return;
      }
      void runCapture(false);
    }, 7000);
    return () => stopCbWatching();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveView]);

  async function submit() {
    if (!clientId.trim() || !clientSecret.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/integrations/${integration.id}/oauth/client`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId: clientId.trim(), clientSecret: clientSecret.trim() }),
      });
      if (!res.ok) {
        const e = await res.json();
        if (e.pin === "required") {
          setBusy(false);
          requestUnlock(() => submit());
          return;
        }
        throw new Error(e.error ?? "Failed to save credentials.");
      }
      // Stored encrypted: now run the genuine consent.
      window.location.href = `/api/integrations/${integration.id}/oauth/start`;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  }

  function copyRedirect() {
    navigator.clipboard?.writeText(recipe.redirectUri);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="rounded-lg p-4 mb-3" style={{ border: "1px solid var(--color-line-2)", background: "var(--color-paper)" }}>
      {/* Non-secret handoff the NodeWorm Helper extension reads to drive the
          portal. No token: it posts to the same per-user-scoped paste-back route
          authenticated by your session, identical security to typing it here. */}
      <div
        hidden
        data-nodeworm-handoff={JSON.stringify({
          id: integration.id,
          appName: integration.appName,
          portalUrl: recipe.portalUrl,
          redirectUri: recipe.redirectUri,
          scopes: recipe.scopes,
          automatable: Boolean(recipe.automatable) && consentSatisfied,
          portalAutomation: recipe.portalAutomation ?? null,
          consentGranted: consented,
        })}
      />
      <div className="flex items-center gap-2 mb-2">
        <span className="dot" style={{ background: "var(--color-signal)" }} />
        <span className="font-mono text-[0.58rem] uppercase tracking-wider" style={{ color: "var(--color-signal)" }}>
          register an OAuth app once
        </span>
        {recipe.aiResearched && (
          <span
            className="font-mono text-[0.54rem] uppercase tracking-wider px-1.5 py-0.5 rounded inline-flex items-center gap-1"
            style={{ background: "var(--color-paper-2)", border: "1px solid var(--color-line-2)", color: "var(--color-live)" }}
          >
            <span className="dot" style={{ background: "var(--color-live)", width: 5, height: 5 }} />
            ai-researched
          </span>
        )}
      </div>
      <p className="text-sm mb-3" style={{ color: "var(--color-ink-soft)" }}>
        {integration.appName} needs a one-time app registration. NodeWorm does it for you in a secure browser it controls:
        you just sign into {integration.appName} when it asks, and NodeWorm handles the rest and runs the consent. You never
        leave NodeWorm and never copy-paste anything.
      </p>

      {agentAvailable && pa?.risk !== "blocked" && (
        <div className="mb-3 rounded-lg p-3" style={{ border: "1px solid var(--color-teal)", background: "var(--color-paper-2)" }}>
          <div className="font-mono text-[0.56rem] uppercase tracking-wider mb-1.5 flex items-center gap-1.5" style={{ color: "var(--color-teal)" }}>
            <span className="dot" style={{ background: "var(--color-teal)" }} /> nodeworm does it for you
          </div>
          <p className="text-xs mb-2" style={{ color: "var(--color-ink-soft)" }}>
            NodeWorm&apos;s AI registers the {integration.appName} app inside the window below: it navigates, creates the app, sets
            the redirect URI and scopes, and reads back the keys. You only sign into {integration.appName} in the window if it asks.
            Nothing else.
          </p>
          {pa && (
            <div className="mb-2.5 rounded px-2.5 py-2" style={{ border: `1px solid ${riskColor(pa.risk)}`, background: "var(--color-paper)" }}>
              <span
                className="font-mono text-[0.54rem] uppercase tracking-wider px-1.5 py-0.5 rounded inline-block mb-1.5"
                style={{ color: riskColor(pa.risk), border: `1px solid ${riskColor(pa.risk)}` }}
              >
                {pa.risk} risk
              </span>
              <p className="text-[0.7rem]" style={{ color: "var(--color-ink-soft)" }}>
                {pa.caveat}
              </p>
              {needsConsent && (
                <label className="flex items-start gap-2 mt-2 cursor-pointer text-[0.7rem]" style={{ color: "var(--color-ink-soft)" }}>
                  <input type="checkbox" checked={consented} onChange={(e) => grantConsent(e.target.checked)} className="mt-0.5 shrink-0" />
                  <span>I understand this is unsupported and accept the account risk on my own account.</span>
                </label>
              )}
            </div>
          )}
          {!agentLive ? (
            <button onClick={startAgent} disabled={agentBusy || !consentSatisfied} className="btn btn-signal text-sm w-full justify-center">
              {agentBusy ? "Starting the agent…" : "Let NodeWorm connect it for me"}
            </button>
          ) : (
            <div className="space-y-2">
              <div
                className="rounded-lg overflow-hidden"
                style={{ border: "1px solid var(--color-line-2)", background: "var(--color-ink)" }}
              >
                <iframe
                  src={agentLive}
                  title={`${integration.appName} registration`}
                  className="w-full"
                  style={{ height: 420, border: "none", display: "block" }}
                  allow="clipboard-read; clipboard-write"
                />
              </div>
              <div className="flex items-center gap-2 font-mono text-[0.58rem] uppercase tracking-wider" style={{ color: "var(--color-teal)" }}>
                <span className="dot animate-pulse" style={{ background: "var(--color-teal)" }} />
                agent working
              </div>
              {agentStep && (
                <p className="font-mono text-[0.62rem]" style={{ color: "var(--color-muted)" }}>
                  {agentStep}
                </p>
              )}
            </div>
          )}
          {agentMsg && (
            <p className="font-mono text-[0.62rem] mt-2" style={{ color: "var(--color-muted)" }}>
              {agentMsg}
            </p>
          )}
        </div>
      )}

      {!agentAvailable && cbAvailable && pa?.risk !== "blocked" && (
        <div className="mb-3 rounded-lg p-3" style={{ border: "1px solid var(--color-teal)", background: "var(--color-paper-2)" }}>
          <div className="font-mono text-[0.56rem] uppercase tracking-wider mb-1.5 flex items-center gap-1.5" style={{ color: "var(--color-teal)" }}>
            <span className="dot" style={{ background: "var(--color-teal)" }} /> connect automatically
          </div>
          <p className="text-xs mb-2" style={{ color: "var(--color-ink-soft)" }}>
            NodeWorm opens a hosted browser, you log into {integration.appName}, and it fills the redirect URI and captures the keys
            for you. No copy-pasting.
          </p>
          {pa && (
            <div className="mb-2.5 rounded px-2.5 py-2" style={{ border: `1px solid ${riskColor(pa.risk)}`, background: "var(--color-paper)" }}>
              <span
                className="font-mono text-[0.54rem] uppercase tracking-wider px-1.5 py-0.5 rounded inline-block mb-1.5"
                style={{ color: riskColor(pa.risk), border: `1px solid ${riskColor(pa.risk)}` }}
              >
                {pa.risk} risk
              </span>
              <p className="text-[0.7rem]" style={{ color: "var(--color-ink-soft)" }}>
                {pa.caveat}
              </p>
              {needsConsent && (
                <label className="flex items-start gap-2 mt-2 cursor-pointer text-[0.7rem]" style={{ color: "var(--color-ink-soft)" }}>
                  <input type="checkbox" checked={consented} onChange={(e) => grantConsent(e.target.checked)} className="mt-0.5 shrink-0" />
                  <span>I understand this is unsupported and accept the account risk on my own account.</span>
                </label>
              )}
            </div>
          )}
          {!liveView ? (
            <button onClick={openHosted} disabled={cbBusy || !consentSatisfied} className="btn btn-signal text-sm w-full justify-center">
              {cbBusy ? "Starting…" : "Connect automatically (hosted browser)"}
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 font-mono text-[0.58rem] uppercase tracking-wider" style={{ color: "var(--color-teal)" }}>
                <span className={`dot${cbWatching ? " animate-pulse" : ""}`} style={{ background: "var(--color-teal)" }} />
                {cbWatching ? "watching for the app keys" : "paused"}
              </div>
              <button onClick={captureHosted} disabled={cbBusy} className="btn btn-ink text-sm w-full justify-center">
                {cbBusy ? "Capturing…" : "Capture now"}
              </button>
            </div>
          )}
          {cbMsg && (
            <p className="font-mono text-[0.62rem] mt-2" style={{ color: "var(--color-muted)" }}>
              {cbMsg}
            </p>
          )}
          <p className="text-[0.6rem] mt-2 flex items-center gap-2" style={{ color: "var(--color-muted)" }}>
            <span>Prefer your own browser?</span>
            <a
              href={process.env.NEXT_PUBLIC_EXTENSION_URL || "/agent/nodeworm-helper.zip"}
              target="_blank"
              rel="noopener noreferrer"
              download={process.env.NEXT_PUBLIC_EXTENSION_URL ? undefined : ""}
              className="underline"
              style={{ color: "var(--color-live)" }}
            >
              {process.env.NEXT_PUBLIC_EXTENSION_URL ? "Add the NodeWorm Helper to Chrome" : "Get the NodeWorm Helper"}
            </a>
          </p>
        </div>
      )}

      {pa?.risk === "blocked" && (
        <div
          className="mb-3 rounded-lg p-3"
          style={{ border: "1px solid var(--color-line-2)", background: "var(--color-paper-2)" }}
        >
          <div className="font-mono text-[0.56rem] uppercase tracking-wider mb-1.5" style={{ color: "var(--color-muted)" }}>
            automation unavailable
          </div>
          <p className="text-xs" style={{ color: "var(--color-ink-soft)" }}>
            {pa.caveat}
          </p>
        </div>
      )}

      {!agentAvailable && !cbAvailable && (
        <p className="text-[0.72rem] mb-3" style={{ color: "var(--color-muted)" }}>
          The hosted browser is not configured right now. The manual steps below are a temporary fallback; normally NodeWorm
          does this for you.
        </p>
      )}

      <details open={!agentAvailable && !cbAvailable && pa?.risk !== "blocked"}>
        <summary className="font-mono text-[0.58rem] uppercase tracking-wider cursor-pointer mb-3" style={{ color: "var(--color-muted)" }}>
          do it manually instead
        </summary>

      {recipe.portalUrl && (
        <a
          href={recipe.portalUrl}
          target="_blank"
          rel="noreferrer"
          className="btn btn-ghost text-sm w-full justify-center mb-3"
        >
          Open {integration.appName}&apos;s developer portal &#8599;
        </a>
      )}

      <ol className="space-y-1.5 mb-3">
        {recipe.steps.map((s, i) => (
          <li key={i} className="flex gap-2 text-sm">
            <span className="font-mono text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
              {i + 1}.
            </span>
            <span style={{ color: "var(--color-ink-soft)" }}>{s}</span>
          </li>
        ))}
      </ol>

      <div className="mb-3">
        <div className="font-mono text-[0.56rem] uppercase tracking-wider mb-1" style={{ color: "var(--color-muted)" }}>
          redirect / callback URL
        </div>
        <div className="flex items-center gap-2">
          <code
            className="flex-1 font-mono text-[0.62rem] px-2 py-1.5 rounded truncate"
            style={{ background: "var(--color-paper-2)", border: "1px solid var(--color-line-2)" }}
          >
            {recipe.redirectUri}
          </code>
          <button type="button" onClick={copyRedirect} className="btn btn-ghost text-xs shrink-0">
            {copied ? "copied" : "copy"}
          </button>
        </div>
      </div>

      {recipe.scopes.length > 0 && (
        <div className="mb-3">
          <div className="font-mono text-[0.56rem] uppercase tracking-wider mb-1" style={{ color: "var(--color-muted)" }}>
            scopes
          </div>
          <div className="flex flex-wrap gap-1.5">
            {recipe.scopes.map((sc) => (
              <code
                key={sc}
                className="font-mono text-[0.6rem] px-1.5 py-0.5 rounded"
                style={{ background: "var(--color-paper-2)", border: "1px solid var(--color-line-2)" }}
              >
                {sc}
              </code>
            ))}
          </div>
        </div>
      )}

      {recipe.notes.length > 0 && (
        <ul className="mb-3 space-y-1">
          {recipe.notes.map((n, i) => (
            <li key={i} className="font-mono text-[0.62rem] flex gap-1.5" style={{ color: "var(--color-muted)" }}>
              <span style={{ color: "var(--color-signal)" }}>!</span>
              <span>{n}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2 pt-3 border-t hairline">
        <input
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="paste Client ID"
          className="w-full bg-transparent outline-none font-mono text-sm px-2 py-1.5 rounded"
          style={{ border: "1px solid var(--color-line-2)" }}
          aria-label="Client ID"
        />
        <input
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          placeholder="paste Client Secret"
          className="w-full bg-transparent outline-none font-mono text-sm px-2 py-1.5 rounded"
          style={{ border: "1px solid var(--color-line-2)" }}
          aria-label="Client Secret"
        />
        <button onClick={submit} disabled={busy} className="btn btn-ink text-sm w-full justify-center">
          {busy ? "Reeling in..." : "Save & run the consent"}
        </button>
        {err && (
          <p className="font-mono text-xs" style={{ color: "var(--color-blocked)" }}>
            !! {err}
          </p>
        )}
      </div>
      </details>
    </div>
  );
}

function formatLock(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.ceil(seconds / 3600)}h`;
  return `${Math.ceil(seconds / 86400)}d`;
}

// Unlock the per-user vault with the 4-digit PIN. Opened by ?pin=required (from a
// gated /oauth/start) or by a card hitting a 403 pin:required. On success the
// short-lived grant cookie is set and the original action retries.
function PinUnlockModal({ onClose, onUnlocked }: { onClose: () => void; onUnlocked: () => void }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || pin.length !== 4) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/auth/pin/unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        onUnlocked();
        return;
      }
      setErr(data.lockedFor ? `Too many attempts. Try again in ${formatLock(data.lockedFor)}.` : data.error ?? "Incorrect PIN.");
    } catch {
      setErr("Something went wrong.");
    }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center px-4" style={{ background: "rgba(20,16,12,0.45)" }} onClick={onClose}>
      <div
        className="card p-5 w-full max-w-xs rise"
        style={{ background: "var(--color-paper)", boxShadow: "var(--shadow-lift)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-mono text-[0.58rem] uppercase tracking-wider mb-2" style={{ color: "var(--color-signal)" }}>
          unlock your vault
        </div>
        <p className="text-xs mb-3" style={{ color: "var(--color-muted)" }}>
          Enter your 4-digit PIN to use your saved credentials.
        </p>
        <form onSubmit={submit}>
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="0000"
            className="w-full bg-transparent outline-none text-lg text-center tracking-[0.6em] font-mono px-2.5 py-2 rounded"
            style={{ border: "1px solid var(--color-line-2)" }}
            aria-label="PIN"
          />
          <div className="flex gap-2 mt-3">
            <button type="submit" disabled={busy || pin.length !== 4} className="btn btn-ink text-sm flex-1 justify-center">
              {busy ? "..." : "Unlock"}
            </button>
            <button type="button" onClick={onClose} className="btn btn-ghost text-sm">
              Cancel
            </button>
          </div>
          {err && (
            <p className="font-mono text-[0.62rem] mt-2" style={{ color: "var(--color-blocked)" }}>
              !! {err}
            </p>
          )}
        </form>
        <p className="text-[0.58rem] mt-3" style={{ color: "var(--color-muted)" }}>
          Forgot it? Open the account menu to reset it with your password.
        </p>
      </div>
    </div>
  );
}

function StatusBanner({ accent, title, children }: { accent: string; title: string; children: ReactNode }) {
  return (
    <div
      className="mb-3 rounded px-3 py-2.5 text-xs"
      style={{ borderLeft: `2px solid ${accent}`, background: "var(--color-paper)", color: "var(--color-ink-soft)" }}
    >
      <div className="font-mono text-[0.58rem] uppercase tracking-wider mb-1" style={{ color: accent }}>
        {title}
      </div>
      {children}
    </div>
  );
}

/* ---- helpers ---- */

function markPhase(it: Integration, idx: number, status: Integration["phases"][number]["status"]): Integration {
  const phases = it.phases.map((p, i) => (i === idx ? { ...p, status } : p));
  return { ...it, phases };
}

function authLabel(a: string): string {
  switch (a) {
    case "oauth2":
      return "OAuth 2.0";
    case "apikey":
      return "API key";
    case "browser":
      return "browser session";
    case "none":
      return "none";
    default:
      return "unknown";
  }
}

function reportTelemetry(r: Report): TelemetryLine[] {
  return [
    { level: "info", text: "compiling integration report..." },
    { level: r.status === "blocked" ? "warn" : "ok", text: r.headline },
    { level: "action", text: `status: ${r.status}` },
  ];
}
