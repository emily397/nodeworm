"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Wordmark } from "./Wordmark";
import { AccountMenu } from "./AccountMenu";

export function TopBar() {
  const pathname = usePathname();
  const [mode, setMode] = useState<"ai" | "heuristic" | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setMode(d.mode))
      .catch(() => setMode("heuristic"));
  }, []);

  const nav = [
    { href: "/", label: "Launch" },
    { href: "/integrations", label: "Integrations" },
  ];

  return (
    <header className="sticky top-0 z-50">
      <div
        className="border-b hairline backdrop-blur-md"
        style={{ background: "color-mix(in srgb, var(--color-paper) 82%, transparent)" }}
      >
        <div className="mx-auto max-w-6xl px-5 h-16 flex items-center justify-between">
          <Link href="/" aria-label="NodeWorm home">
            <Wordmark />
          </Link>

          <nav className="flex items-center gap-1">
            {nav.map((n) => {
              const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className="px-3.5 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{
                    color: active ? "var(--color-ink)" : "var(--color-muted)",
                    background: active ? "var(--color-paper-2)" : "transparent",
                  }}
                >
                  {n.label}
                </Link>
              );
            })}
            <div className="ml-2 flex items-center gap-2">
              <ModePill mode={mode} />
              <AccountMenu />
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
}

function ModePill({ mode }: { mode: "ai" | "heuristic" | null }) {
  if (!mode) return null;
  const ai = mode === "ai";
  return (
    <span
      className="chip"
      title={
        ai
          ? "AI key detected (Groq / OpenRouter). Unknown apps get live LLM discovery."
          : "Running on the curated knowledge base + live probe + decision-tree heuristics. Set GROQ_API_KEY or OPENROUTER_API_KEY for live discovery."
      }
    >
      <span
        className="dot"
        style={{ background: ai ? "var(--color-live)" : "var(--color-line-2)" }}
      />
      {ai ? "AI scout" : "Heuristic mode"}
    </span>
  );
}
