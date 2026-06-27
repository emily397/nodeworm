"use client";

import { useEffect, useRef, useState } from "react";

// Optional accounts: signing in scopes connected OAuth clients to you and reuses
// them across your connections. Anonymous use stays fully functional, so this is
// a quiet chip, not a gate. Hidden entirely when accounts aren't provisioned.
export function AccountMenu() {
  const [state, setState] = useState<{ accounts: boolean; email?: string } | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setState({ accounts: Boolean(d.accounts), email: d.user?.email }))
      .catch(() => setState({ accounts: false }));
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (!state?.accounts) return null;

  async function signout() {
    await fetch("/api/auth/signout", { method: "POST" });
    window.location.reload();
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="chip" style={{ cursor: "pointer" }} aria-label="Account">
        <span className="dot" style={{ background: state.email ? "var(--color-live)" : "var(--color-line-2)" }} />
        {state.email ? state.email.split("@")[0] : "sign in"}
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-72 card p-4 rise"
          style={{ boxShadow: "var(--shadow-lift)", background: "var(--color-paper)" }}
        >
          {state.email ? (
            <div>
              <div className="font-mono text-[0.58rem] uppercase tracking-wider mb-1" style={{ color: "var(--color-muted)" }}>
                signed in
              </div>
              <div className="text-sm font-semibold truncate mb-3">{state.email}</div>
              <p className="text-xs mb-3" style={{ color: "var(--color-muted)" }}>
                Connected apps are saved to you and reused across your connections.
              </p>
              <PinSection />
              <button onClick={signout} className="btn btn-ghost text-sm w-full justify-center">
                Sign out
              </button>
            </div>
          ) : (
            <AuthForm onDone={() => window.location.reload()} />
          )}
        </div>
      )}
    </div>
  );
}

// The vault PIN: a quick lock on a stolen session, set/changed from the account
// popover. Honest copy makes clear it is not encryption.
function PinSection() {
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    fetch("/api/auth/pin")
      .then((r) => r.json())
      .then((d) => setHasPin(Boolean(d.hasPin)))
      .catch(() => setHasPin(false));
  }, []);

  if (hasPin === null) return null;

  return (
    <div className="mb-3 pb-3" style={{ borderBottom: "1px solid var(--color-line-2)" }}>
      <div className="flex items-center justify-between mb-2">
        <div className="font-mono text-[0.58rem] uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>
          vault PIN
        </div>
        <span className="font-mono text-[0.58rem]" style={{ color: hasPin ? "var(--color-live)" : "var(--color-muted)" }}>
          {hasPin ? "set" : "not set"}
        </span>
      </div>
      {editing ? (
        <PinForm
          hasPin={hasPin}
          onDone={() => {
            setEditing(false);
            setHasPin(true);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <button onClick={() => setEditing(true)} className="btn btn-ghost text-xs w-full justify-center">
          {hasPin ? "Change PIN" : "Set a PIN"}
        </button>
      )}
      <p className="text-[0.6rem] mt-2" style={{ color: "var(--color-muted)" }}>
        A 4-digit PIN is a quick lock on a stolen session, not an encryption password. It cannot protect your credentials if the
        server itself is compromised.
      </p>
    </div>
  );
}

function PinForm({ hasPin, onDone, onCancel }: { hasPin: boolean; onDone: () => void; onCancel: () => void }) {
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const onlyDigits = (s: string) => s.replace(/\D/g, "").slice(0, 4);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || newPin.length !== 4) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/auth/pin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ newPin, currentPin: hasPin ? currentPin : undefined }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      onDone();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Failed");
      setBusy(false);
    }
  }

  const inputCls = "w-full bg-transparent outline-none text-sm px-2.5 py-2 rounded tracking-[0.4em] font-mono";
  const inputStyle = { border: "1px solid var(--color-line-2)" } as const;

  return (
    <form onSubmit={submit} className="space-y-2">
      {hasPin && (
        <input
          type="password"
          inputMode="numeric"
          value={currentPin}
          onChange={(e) => setCurrentPin(onlyDigits(e.target.value))}
          placeholder="current PIN"
          className={inputCls}
          style={inputStyle}
          aria-label="Current PIN"
        />
      )}
      <input
        type="password"
        inputMode="numeric"
        value={newPin}
        onChange={(e) => setNewPin(onlyDigits(e.target.value))}
        placeholder="new 4-digit PIN"
        autoFocus
        className={inputCls}
        style={inputStyle}
        aria-label="New PIN"
      />
      <div className="flex gap-2">
        <button type="submit" disabled={busy || newPin.length !== 4} className="btn btn-ink text-xs flex-1 justify-center">
          {busy ? "..." : "Save PIN"}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-ghost text-xs">
          Cancel
        </button>
      </div>
      {err && (
        <p className="font-mono text-[0.62rem]" style={{ color: "var(--color-blocked)" }}>
          !! {err}
        </p>
      )}
    </form>
  );
}

function AuthForm({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/auth/${mode === "signin" ? "signin" : "signup"}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      onDone();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="font-mono text-[0.58rem] uppercase tracking-wider mb-2" style={{ color: "var(--color-signal)" }}>
        {mode === "signin" ? "sign in" : "create account"}
      </div>
      <p className="text-xs mb-3" style={{ color: "var(--color-muted)" }}>
        Optional. NodeWorm works anonymously; an account just keeps your connected app clients yours and reusable.
      </p>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="email"
        autoComplete="email"
        className="w-full bg-transparent outline-none text-sm px-2.5 py-2 rounded mb-2"
        style={{ border: "1px solid var(--color-line-2)" }}
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="password (8+ characters)"
        autoComplete={mode === "signin" ? "current-password" : "new-password"}
        className="w-full bg-transparent outline-none text-sm px-2.5 py-2 rounded mb-3"
        style={{ border: "1px solid var(--color-line-2)" }}
      />
      <button type="submit" disabled={busy} className="btn btn-ink text-sm w-full justify-center mb-2">
        {busy ? "..." : mode === "signin" ? "Sign in" : "Create account"}
      </button>
      {err && (
        <p className="font-mono text-[0.66rem] mb-2" style={{ color: "var(--color-blocked)" }}>
          !! {err}
        </p>
      )}
      <button
        type="button"
        onClick={() => {
          setMode((m) => (m === "signin" ? "signup" : "signin"));
          setErr(null);
        }}
        className="text-xs w-full text-center"
        style={{ color: "var(--color-muted)" }}
      >
        {mode === "signin" ? "No account? Create one" : "Have an account? Sign in"}
      </button>
    </form>
  );
}
