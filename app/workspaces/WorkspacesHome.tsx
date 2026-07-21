"use client";

import { useCallback, useEffect, useState } from "react";

interface WsRef {
  id: string;
  name: string;
  role: "owner" | "member";
}

interface WsDetail {
  role: "owner" | "member";
  members: Array<{ userId: string; email: string; role: string }>;
  invites: string[];
}

const inputStyle: React.CSSProperties = {
  background: "var(--color-paper-2)",
  border: "1px solid var(--color-line-2)",
  color: "var(--color-ink)",
};

export function WorkspacesHome() {
  const [state, setState] = useState<{ available: boolean; signedIn?: boolean; userId?: string; workspaces: WsRef[] } | null>(null);
  const [details, setDetails] = useState<Record<string, WsDetail>>({});
  const [name, setName] = useState("");
  const [inviteEmail, setInviteEmail] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const d = await fetch("/api/workspaces")
      .then((r) => r.json())
      .catch(() => null);
    if (d) setState(d);
    if (d?.workspaces?.length) {
      for (const w of d.workspaces as WsRef[]) {
        fetch(`/api/workspaces/${w.id}`)
          .then((r) => r.json())
          .then((det) => det.members && setDetails((p) => ({ ...p, [w.id]: det })))
          .catch(() => {});
      }
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true);
    await fetch("/api/workspaces", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) }).catch(() => {});
    setName("");
    await refresh();
    setBusy(false);
  }

  async function act(wsId: string, body: Record<string, string>) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const d = await fetch(`/api/workspaces/${wsId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then((r) => r.json())
      .catch(() => null);
    if (d?.error) setNotice(d.error);
    if (d?.status === "invited") setNotice("Invite saved. It activates the moment they sign up with that email.");
    await refresh();
    setBusy(false);
  }

  async function remove(wsId: string) {
    if (busy) return;
    setBusy(true);
    await fetch(`/api/workspaces/${wsId}`, { method: "DELETE" }).catch(() => {});
    await refresh();
    setBusy(false);
  }

  if (!state) {
    return (
      <p className="font-mono text-sm" style={{ color: "var(--color-muted)" }}>
        loading...
      </p>
    );
  }

  if (!state.available) {
    return (
      <div className="card p-8">
        <p className="font-mono text-sm" style={{ color: "var(--color-muted)" }}>
          Workspaces need accounts, which are not enabled on this deployment (DATABASE_URL + AUTH_SECRET).
        </p>
      </div>
    );
  }

  if (!state.signedIn) {
    return (
      <div className="card p-8">
        <p className="font-mono text-sm" style={{ color: "var(--color-muted)" }}>
          Sign in (top right) to create a workspace and invite your team.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card-pop p-5 flex flex-col sm:flex-row gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder="New workspace name"
          className="flex-1 rounded-xl px-4 py-3 text-sm outline-none"
          style={inputStyle}
        />
        <button onClick={create} disabled={busy || !name.trim()} className="btn btn-signal whitespace-nowrap">
          Create workspace
        </button>
      </div>

      {notice && (
        <div className="rounded-xl px-4 py-3 font-mono text-xs" style={{ border: "1px solid color-mix(in srgb, var(--color-amber) 45%, transparent)", color: "var(--color-ink-soft)" }}>
          {notice}
        </div>
      )}

      {state.workspaces.length === 0 ? (
        <div className="card p-10 text-center wires">
          <p className="font-mono text-sm" style={{ color: "var(--color-muted)" }}>
            No workspaces yet. Create one, invite by email, then share flows and connections into it.
          </p>
        </div>
      ) : (
        state.workspaces.map((w, i) => {
          const det = details[w.id];
          return (
            <div key={w.id} className="card p-5 rise" style={{ animationDelay: `${i * 40}ms` }}>
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <span className="font-display font-bold text-lg">{w.name}</span>
                <span className="chip">
                  <span className="dot" style={{ background: w.role === "owner" ? "var(--color-signal)" : "var(--color-aqua)" }} />
                  {w.role}
                </span>
                <span className="flex-1" />
                {w.role === "owner" && (
                  <button onClick={() => remove(w.id)} className="font-mono text-xs px-2.5 py-1.5 rounded-lg" style={{ color: "var(--color-blocked)", border: "1px solid var(--color-line)" }}>
                    delete
                  </button>
                )}
              </div>

              <div className="space-y-1.5 mb-4">
                {(det?.members ?? []).map((m) => (
                  <div key={m.userId} className="flex items-center gap-2 font-mono text-xs" style={{ color: "var(--color-ink-soft)" }}>
                    <span className="dot" style={{ width: 7, height: 7, background: m.role === "owner" ? "var(--color-signal)" : "var(--color-aqua)" }} />
                    <span className="flex-1">
                      {m.email} <span style={{ color: "var(--color-muted)" }}>· {m.role}</span>
                    </span>
                    {w.role === "owner" && m.role !== "owner" && (
                      <button onClick={() => act(w.id, { removeUserId: m.userId })} className="px-1.5 rounded" style={{ color: "var(--color-blocked)" }} aria-label={`Remove ${m.email}`}>
                        ×
                      </button>
                    )}
                  </div>
                ))}
                {(det?.invites ?? []).map((e) => (
                  <div key={e} className="flex items-center gap-2 font-mono text-xs" style={{ color: "var(--color-muted)" }}>
                    <span className="dot pulse-dot" style={{ width: 7, height: 7, background: "var(--color-amber)" }} />
                    <span className="flex-1">{e} · invited, not signed up yet</span>
                    {w.role === "owner" && (
                      <button onClick={() => act(w.id, { cancelEmail: e })} className="px-1.5 rounded" style={{ color: "var(--color-blocked)" }} aria-label={`Cancel invite for ${e}`}>
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  value={inviteEmail[w.id] ?? ""}
                  onChange={(e) => setInviteEmail((p) => ({ ...p, [w.id]: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && inviteEmail[w.id]?.trim() && act(w.id, { email: inviteEmail[w.id] })}
                  placeholder="teammate@company.com"
                  className="flex-1 rounded-lg px-3 py-2 font-mono text-xs outline-none"
                  style={inputStyle}
                />
                <button onClick={() => act(w.id, { email: inviteEmail[w.id] ?? "" })} disabled={busy || !(inviteEmail[w.id] ?? "").trim()} className="btn btn-ghost text-xs">
                  invite
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
