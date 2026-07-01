"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import type { ExecuteTask, ExecutionPlan, SignedPlanEnvelope } from "@/lib/engine/execute/types";

type Phase = "checking" | "not-installed" | "preview" | "running" | "done" | "error";
type StepState = { status?: string; title?: string; detail?: string; output?: string; qr?: string; humanPrompt?: string };

const AGENT_WS = "ws://localhost:39742";

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
  const [copied, setCopied] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const installCmd = 'powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://abie-three.vercel.app/agent/install.ps1 | iex"';

  function connectAgent(onResult: (ws: WebSocket | null) => void) {
    let done = false;
    let ws: WebSocket;
    try { ws = new WebSocket(AGENT_WS); } catch { onResult(null); return; }
    const timeout = setTimeout(() => { if (!done) { done = true; ws.close(); onResult(null); } }, 2500);
    ws.addEventListener("open", () => { ws.send(JSON.stringify({ type: "nw_ping" })); });
    ws.addEventListener("message", (e) => {
      try {
        const m = JSON.parse(e.data as string);
        if (m.type === "nw_pong" && !done) { done = true; clearTimeout(timeout); onResult(ws); }
      } catch (_) {}
    });
    const fail = () => { if (!done) { done = true; clearTimeout(timeout); onResult(null); } };
    ws.addEventListener("error", fail);
    ws.addEventListener("close", fail);
  }

  function recheck() {
    setPhase("checking");
    connectAgent((ws) => {
      if (ws) { wsRef.current = ws; void loadPlan(); }
      else {
        setMsg("Still can't reach the NodeWorm Agent. Make sure you ran the installer and it started in the background.");
        setPhase("not-installed");
      }
    });
  }

  useEffect(() => {
    connectAgent((ws) => {
      if (ws) { wsRef.current = ws; void loadPlan(); }
      else setPhase("not-installed");
    });
    return () => { wsRef.current?.close(); wsRef.current = null; };
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
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setMsg("Agent disconnected. Click re-check and try again.");
      setPhase("error");
      return;
    }
    setPhase("running");
    let gotFirst = false;
    const timeout = setTimeout(() => {
      if (!gotFirst) {
        setMsg("The NodeWorm Agent didn't respond. Restart your machine and try again.");
        setPhase("error");
      }
    }, 8000);
    ws.addEventListener("message", function onMsg(e) {
      let ev: Record<string, unknown>;
      try { ev = JSON.parse(e.data as string); } catch { return; }
      if (!gotFirst) { gotFirst = true; clearTimeout(timeout); }
      if (ev.type === "nw_done") ws.removeEventListener("message", onMsg);
      handleEvent(ev);
    });
    ws.send(JSON.stringify({ type: "nw_execute", envelope }));
  }

  function handleEvent(ev: Record<string, unknown>) {
    const n = ev.n as number | undefined;
    if (ev.type === "nw_step" && n != null) {
      setSteps((s) => ({ ...s, [n]: { ...s[n], status: ev.status as string, title: (ev.title as string) ?? s[n]?.title, detail: ev.detail as string, humanPrompt: ev.humanPrompt as string } }));
    } else if (ev.type === "nw_output" && n != null) {
      setSteps((s) => ({ ...s, [n]: { ...s[n], output: ((s[n]?.output ?? "") + (ev.line as string)).slice(-2000) } }));
    } else if (ev.type === "nw_qr" && n != null) {
      const uri = (ev.linkUri as string) ?? (ev.qrDataUrl as string);
      if (ev.qrDataUrl) {
        setSteps((s) => ({ ...s, [n]: { ...s[n], qr: ev.qrDataUrl as string } }));
      } else if (uri) {
        QRCode.toDataURL(uri, { width: 220, margin: 2 }).then((dataUrl) =>
          setSteps((s) => ({ ...s, [n]: { ...s[n], qr: dataUrl } }))
        ).catch(() => {});
      }
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
    wsRef.current?.send(JSON.stringify({ type: "nw_abort" }));
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
              {[
                <span key="open">Press <b>Win</b>, type <b>PowerShell</b>, open it.</span>,
                <div key="cmd" className="space-y-1.5">
                  <span>Paste this line, press Enter (installs in seconds, no admin):</span>
                  <div className="rounded p-2 font-mono text-[0.58rem] break-all relative" style={{ background: "var(--color-ink)", color: "var(--color-paper)" }}>
                    {installCmd}
                    <button
                      onClick={() => { navigator.clipboard.writeText(installCmd); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                      className="absolute top-1 right-1 font-mono text-[0.52rem] uppercase px-1.5 py-0.5 rounded"
                      style={{ background: "var(--color-signal)", color: "var(--color-ink)" }}
                    >
                      {copied ? "copied" : "copy"}
                    </button>
                  </div>
                </div>,
                <span key="done">Come back here and click re-check below.</span>,
              ].map((node, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span
                    className="font-mono text-[0.62rem] shrink-0 grid place-items-center rounded-full mt-0.5"
                    style={{ width: 18, height: 18, color: "var(--color-live)", border: "1px solid var(--color-live)" }}
                  >
                    {i + 1}
                  </span>
                  <div className="flex-1 text-[0.78rem]" style={{ color: "var(--color-ink-soft)" }}>{node}</div>
                </li>
              ))}
            </ol>
            {msg && <p className="text-[0.66rem]" style={{ color: "var(--color-signal-2)" }}>{msg}</p>}
            <button onClick={recheck} className="btn btn-ink text-sm w-full justify-center">I installed it, re-check</button>
            <p className="text-[0.6rem]" style={{ color: "var(--color-muted)" }}>
              Needs Docker Desktop running. macOS/Linux:{" "}
              <a href="/agent/install.command" download className="underline">installer</a>. Remove anytime:{" "}
              <a href="/agent/uninstall.cmd" download className="underline">uninstall</a>.
            </p>
          </div>
        )}

        {phase === "preview" && plan && (
          <div className="space-y-3">
            <p className="text-sm" style={{ color: "var(--color-ink-soft)" }}>{plan.summary}</p>
            {cmds.length > 0 ? (
              <div>
                <div className="font-mono text-[0.56rem] uppercase tracking-wider mb-1" style={{ color: "var(--color-muted)" }}>commands NodeWorm will run</div>
                <div className="rounded p-3 font-mono text-[0.62rem] space-y-1" style={{ background: "var(--color-ink)", color: "var(--color-paper)" }}>
                  {cmds.map((t: ExecuteTask) => (
                    <div key={t.n}>$ {(t.command ?? []).join(" ")}</div>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <div className="font-mono text-[0.56rem] uppercase tracking-wider mb-1" style={{ color: "var(--color-muted)" }}>what NodeWorm will do</div>
                <ol className="text-[0.72rem] list-decimal pl-4 space-y-0.5" style={{ color: "var(--color-ink-soft)" }}>
                  {plan.tasks.map((t: ExecuteTask) => <li key={t.n}>{t.title}</li>)}
                </ol>
              </div>
            )}
            <div>
              <div className="font-mono text-[0.56rem] uppercase tracking-wider mb-1" style={{ color: "var(--color-muted)" }}>what you&apos;ll be asked to do</div>
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
