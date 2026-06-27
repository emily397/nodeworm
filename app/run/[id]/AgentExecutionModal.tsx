"use client";

import { useEffect, useRef, useState } from "react";
import type { ExecuteTask, ExecutionPlan, SignedPlanEnvelope } from "@/lib/engine/execute/types";

type Phase = "checking" | "not-installed" | "preview" | "running" | "done" | "error";
type StepState = { status?: string; title?: string; detail?: string; output?: string; qr?: string; humanPrompt?: string };

// The agentic-execution surface: pings the locally-installed NodeWorm Agent, shows
// the EXACT signed commands for approval, then streams the Agent's step-by-step
// progress as it sets the connector up hands-off. The user only scans the QR.
export function AgentExecutionModal({
  integrationId,
  appName,
  onClose,
}: {
  integrationId: string;
  appName: string;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [plan, setPlan] = useState<ExecutionPlan | null>(null);
  const [envelope, setEnvelope] = useState<SignedPlanEnvelope | null>(null);
  const [steps, setSteps] = useState<Record<number, StepState>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const execListener = useRef<((e: MessageEvent) => void) | null>(null);
  const gotEvent = useRef(false);
  const execTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  // Ping the locally-installed Agent: post nw_agent_ping, resolve on the pong (or a
  // 1.8s timeout = not installed / extension not reloaded).
  function pingAgent(onResult: (installed: boolean) => void) {
    let done = false;
    const onMsg = (e: MessageEvent) => {
      if (e.source !== window || !e.data || e.data.type !== "nw_agent_pong") return;
      done = true;
      window.removeEventListener("message", onMsg);
      onResult(Boolean(e.data.installed));
    };
    window.addEventListener("message", onMsg);
    window.postMessage({ type: "nw_agent_ping" }, origin);
    setTimeout(() => { if (!done) { window.removeEventListener("message", onMsg); onResult(false); } }, 1800);
  }

  // Re-check after the user installs / reloads. Only proceeds to the plan when the
  // Agent actually answers, so we never sit on a plan the Agent can't run.
  function recheck() {
    setPhase("checking");
    pingAgent((installed) => {
      if (installed) void loadPlan();
      else {
        setMsg("Still can't reach the NodeWorm Agent. Make sure you ran the installer and restarted your browser. If the extension isn't visible in Chrome, go to chrome://extensions and check it is enabled.");
        setPhase("not-installed");
      }
    });
  }

  useEffect(() => {
    pingAgent((installed) => { if (installed) void loadPlan(); else setPhase("not-installed"); });
    return () => {
      if (execListener.current) window.removeEventListener("message", execListener.current);
      if (execTimeout.current) clearTimeout(execTimeout.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPlan() {
    setPhase("checking");
    try {
      const res = await fetch(`/api/integrations/${integrationId}/execute/plan`, { method: "POST" });
      const data = await res.json();
      if (!data.ok) { setMsg(data.error ?? "Could not build a setup plan."); setPhase("error"); return; }
      setPlan(data.plan);
      setEnvelope(data.envelope);
      setPhase("preview");
    } catch {
      setMsg("Could not reach NodeWorm to build the plan.");
      setPhase("error");
    }
  }

  function approve() {
    if (!envelope) return;
    setPhase("running");
    gotEvent.current = false;
    const onMsg = (e: MessageEvent) => {
      if (e.source !== window || !e.data || e.data.type !== "nw_agent_event") return;
      if (!gotEvent.current) {
        gotEvent.current = true;
        if (execTimeout.current) clearTimeout(execTimeout.current);
      }
      handleEvent(e.data.event);
    };
    execListener.current = onMsg;
    window.addEventListener("message", onMsg);
    window.postMessage({ type: "nw_agent_execute", envelope }, origin);
    // If the Agent sends nothing, it is not actually connected (extension not
    // reloaded, or host not registered). Fail loudly instead of hanging on QUEUED.
    execTimeout.current = setTimeout(() => {
      if (!gotEvent.current) {
        setMsg("The NodeWorm Agent didn't respond. Restart your browser to ensure the extension is fully loaded, then try again.");
        setPhase("error");
      }
    }, 8000);
  }

  function handleEvent(ev: Record<string, unknown>) {
    const n = ev.n as number | undefined;
    if (ev.type === "nw_step" && n != null) {
      setSteps((s) => ({ ...s, [n]: { ...s[n], status: ev.status as string, title: (ev.title as string) ?? s[n]?.title, detail: ev.detail as string, humanPrompt: ev.humanPrompt as string } }));
    } else if (ev.type === "nw_output" && n != null) {
      setSteps((s) => ({ ...s, [n]: { ...s[n], output: ((s[n]?.output ?? "") + (ev.line as string)).slice(-2000) } }));
    } else if (ev.type === "nw_qr" && n != null) {
      setSteps((s) => ({ ...s, [n]: { ...s[n], qr: ev.qrDataUrl as string } }));
    } else if (ev.type === "nw_done") {
      if (ev.ok) {
        setMsg(ev.callbackOk ? "Connected." : "Setup complete, finishing up…");
        setPhase("done");
        setTimeout(() => { window.location.href = `/run/${integrationId}?oauth=connected`; }, 1300);
      } else {
        setMsg((ev.detail as string) ?? "Setup did not complete.");
        setPhase("error");
      }
    }
  }

  function abort() {
    window.postMessage({ type: "nw_agent_control", control: { type: "abort" } }, origin);
    setMsg("Aborted.");
    setPhase("error");
  }

  const cmds = (plan?.tasks ?? []).filter((t: ExecuteTask) => t.command && t.command.length);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(20,16,10,0.6)", backdropFilter: "blur(3px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[88vh] overflow-auto card p-5"
        style={{ background: "var(--color-paper)", border: "1px solid var(--color-line-2)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="font-mono text-[0.6rem] uppercase tracking-wider" style={{ color: "var(--color-live)" }}>
            nodeworm agent · set up {appName}
          </div>
          <button onClick={onClose} className="text-sm" style={{ color: "var(--color-muted)" }}>✕</button>
        </div>

        {phase === "checking" && <p className="text-sm" style={{ color: "var(--color-ink-soft)" }}>Checking for the NodeWorm Agent…</p>}

        {phase === "not-installed" && (
          <div className="space-y-3">
            <p className="text-sm" style={{ color: "var(--color-ink-soft)" }}>
              One-time setup, no command line. The NodeWorm Agent runs setup on your machine in Docker, only after you
              approve the exact commands. It never types your password.
            </p>
            <ol className="space-y-2.5">
              {(process.env.NEXT_PUBLIC_EXTENSION_URL ? [
                // Chrome Web Store path: installer + manual "Add to Chrome" + restart
                <a key="dl" href="/api/agent/installer" download="NodeWorm-Agent-Installer.cmd" className="btn btn-signal text-sm w-full justify-center">
                  1-click: download the Agent installer
                </a>,
                <span key="run">Double-click <b>NodeWorm-Agent-Installer.cmd</b> (installs in seconds, no admin). If Windows warns, choose More info, Run anyway.</span>,
                <a key="ext" href={process.env.NEXT_PUBLIC_EXTENSION_URL} target="_blank" rel="noopener noreferrer" className="btn btn-signal text-sm w-full justify-center">
                  Add NodeWorm Helper to Chrome
                </a>,
                <span key="restart">Restart your browser, then click re-check below.</span>,
              ] : [
                // Pre-CWS path: installer auto-installs the extension via policy on restart
                <a key="dl" href="/api/agent/installer" download="NodeWorm-Agent-Installer.cmd" className="btn btn-signal text-sm w-full justify-center">
                  1-click: download the Agent installer
                </a>,
                <span key="run">Double-click <b>NodeWorm-Agent-Installer.cmd</b> (installs in seconds, no admin). If Windows warns, choose More info, Run anyway.</span>,
                <span key="restart">Restart Chrome or Edge. The NodeWorm Helper extension installs itself automatically.</span>,
              ]).map((node, i) => (
                <li key={i} className="flex items-center gap-2.5">
                  <span
                    className="font-mono text-[0.62rem] shrink-0 grid place-items-center rounded-full"
                    style={{ width: 18, height: 18, color: "var(--color-live)", border: "1px solid var(--color-live)" }}
                  >
                    {i + 1}
                  </span>
                  <div className="flex-1 text-[0.78rem]" style={{ color: "var(--color-ink-soft)" }}>{node}</div>
                </li>
              ))}
            </ol>
            <button onClick={recheck} className="btn btn-ink text-sm w-full justify-center">I installed it, re-check</button>
            <p className="text-[0.6rem]" style={{ color: "var(--color-muted)" }}>
              Needs Docker Desktop running. This local route is only for self-hosting on your own machine; connecting an
              app for someone else needs no install at all. macOS/Linux:{" "}
              <a href="/agent/install.command" download className="underline">installer</a>. Remove anytime:{" "}
              <a href="/agent/uninstall.cmd" download className="underline">uninstall</a>.
            </p>
          </div>
        )}

        {phase === "preview" && plan && (
          <div className="space-y-3">
            <p className="text-sm" style={{ color: "var(--color-ink-soft)" }}>{plan.summary}</p>
            <div>
              <div className="font-mono text-[0.56rem] uppercase tracking-wider mb-1" style={{ color: "var(--color-muted)" }}>commands NodeWorm will run (in Docker)</div>
              <div className="rounded p-3 font-mono text-[0.62rem] space-y-1" style={{ background: "var(--color-ink)", color: "var(--color-paper)" }}>
                {cmds.map((t: ExecuteTask) => (
                  <div key={t.n}>$ {(t.command ?? []).join(" ")}</div>
                ))}
              </div>
            </div>
            <div>
              <div className="font-mono text-[0.56rem] uppercase tracking-wider mb-1" style={{ color: "var(--color-muted)" }}>what you’ll be asked to do</div>
              <ul className="text-[0.72rem] list-disc pl-4 space-y-0.5" style={{ color: "var(--color-ink-soft)" }}>
                {plan.humanActions.map((h: string, i: number) => <li key={i}>{h}</li>)}
              </ul>
            </div>
            {plan.warnings.map((w: string, i: number) => (
              <p key={i} className="text-[0.66rem]" style={{ color: "var(--color-muted)" }}>{w}</p>
            ))}
            <div className="flex gap-2">
              <button onClick={onClose} className="btn text-sm flex-1 justify-center" style={{ border: "1px solid var(--color-line-2)" }}>Cancel</button>
              <button onClick={approve} className="btn btn-signal text-sm flex-1 justify-center">Approve &amp; run</button>
            </div>
          </div>
        )}

        {(phase === "running" || phase === "done" || phase === "error") && plan && (
          <div className="space-y-2">
            {plan.tasks.map((t: ExecuteTask) => {
              const st = steps[t.n] ?? {};
              const dot = st.status === "done" ? "var(--color-live)" : st.status === "error" ? "var(--color-signal-2)" : st.status === "running" || st.status === "waiting" ? "var(--color-signal)" : "var(--color-muted)";
              return (
                <div key={t.n} className="rounded p-2" style={{ background: "var(--color-paper-2)" }}>
                  <div className="flex items-center gap-2">
                    <span className={`dot${st.status === "running" || st.status === "waiting" ? " animate-pulse" : ""}`} style={{ background: dot }} />
                    <span className="text-[0.72rem]" style={{ color: "var(--color-ink-soft)" }}>{t.title}</span>
                    <span className="ml-auto font-mono text-[0.54rem] uppercase" style={{ color: dot }}>{st.status ?? "queued"}</span>
                  </div>
                  {st.humanPrompt && st.status === "waiting" && (
                    <p className="text-[0.66rem] mt-1" style={{ color: "var(--color-signal)" }}>{st.humanPrompt}</p>
                  )}
                  {st.qr && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={st.qr} alt="device link QR" className="mx-auto my-2 rounded bg-white p-2" style={{ width: 180, height: 180 }} />
                  )}
                  {st.output && (
                    <pre className="mt-1 font-mono text-[0.56rem] whitespace-pre-wrap break-all max-h-24 overflow-auto" style={{ color: "var(--color-muted)" }}>{st.output}</pre>
                  )}
                </div>
              );
            })}
            {msg && <p className="font-mono text-[0.64rem] mt-1" style={{ color: phase === "error" ? "var(--color-signal-2)" : "var(--color-live)" }}>{msg}</p>}
            {phase === "running" && (
              <button onClick={abort} className="btn text-sm w-full justify-center" style={{ border: "1px solid var(--color-signal-2)", color: "var(--color-signal-2)" }}>Abort</button>
            )}
          </div>
        )}

        {phase === "error" && !plan && (
          <div className="space-y-3">
            <p className="text-sm" style={{ color: "var(--color-signal-2)" }}>{msg}</p>
            <button onClick={onClose} className="btn btn-ink text-sm w-full justify-center">Close</button>
          </div>
        )}
      </div>
    </div>
  );
}
