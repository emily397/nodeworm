"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

// The brand payoff: when an app connects, NodeWorm reels it in. A fishing line
// drops, the app's logo bites, NodeWorm reels it into the esky, confetti pops,
// then offers to cast for another node. Fires only on a real connected event.

function hostOf(appName: string, appUrl?: string): string {
  if (appUrl) return appUrl.replace(/^https?:\/\//, "").split("/")[0];
  return `${appName.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com`;
}

export function ReelItIn({ appName, appUrl, onDone }: { appName: string; appUrl?: string; onDone: () => void }) {
  const reduce = useReducedMotion();
  const [hookImg, setHookImg] = useState(true);
  const [mounted, setMounted] = useState(false);
  // Portal to <body> so the fixed overlay escapes any transformed ancestor
  // (the report panel animates transform, which would otherwise trap it).
  useEffect(() => setMounted(true), []);
  const favicon = `https://www.google.com/s2/favicons?domain=${hostOf(appName, appUrl)}&sz=64`;
  const letter = appName.trim().charAt(0).toUpperCase() || "?";

  const catchT = reduce ? 0 : 1.05; // when the catch lands in the esky

  const Logo = (
    <span
      className="grid place-items-center rounded-lg overflow-hidden shrink-0"
      style={{ width: 38, height: 38, background: "#fff", border: "1px solid var(--color-line-2)", boxShadow: "var(--shadow-soft)" }}
    >
      {hookImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={favicon} alt="" width={26} height={26} onError={() => setHookImg(false)} />
      ) : (
        <span className="font-display font-extrabold text-lg" style={{ color: "var(--color-signal)" }}>
          {letter}
        </span>
      )}
    </span>
  );

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 grid place-items-center px-4"
        style={{ background: "color-mix(in srgb, var(--color-ink) 55%, transparent)", backdropFilter: "blur(3px)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onDone}
      >
        <motion.div
          className="card relative overflow-hidden w-full max-w-md text-center"
          style={{ boxShadow: "var(--shadow-lift)", background: "var(--color-paper)" }}
          initial={{ scale: reduce ? 1 : 0.9, y: reduce ? 0 : 16, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 240, damping: 22 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="wires px-6 pt-7 pb-5" style={{ background: "var(--color-paper-2)" }}>
            {/* Scene */}
            <div className="relative mx-auto" style={{ width: 220, height: 150 }}>
              {/* fishing line */}
              {!reduce && (
                <motion.div
                  className="absolute left-1/2 top-0"
                  style={{ width: 2, background: "var(--color-ink-soft)", transformOrigin: "top" }}
                  initial={{ height: 0 }}
                  animate={{ height: [0, 86, 70, 70] }}
                  transition={{ duration: catchT, times: [0, 0.45, 0.7, 1], ease: "easeInOut" }}
                />
              )}

              {/* the catch on the hook -> reels into the esky */}
              <motion.div
                className="absolute left-1/2"
                style={{ x: "-50%" }}
                initial={reduce ? { top: 96, opacity: 1 } : { top: -44, opacity: 0 }}
                animate={
                  reduce
                    ? { top: 96, opacity: 1 }
                    : { top: [-44, 74, 60, 96], opacity: [0, 1, 1, 1], rotate: [0, -8, 8, 0], scale: [0.9, 1, 1, 0.6] }
                }
                transition={{ duration: catchT, times: [0, 0.45, 0.7, 1], ease: "easeInOut" }}
              >
                {Logo}
              </motion.div>

              {/* the esky / cooler */}
              <div className="absolute left-1/2 bottom-0" style={{ transform: "translateX(-50%)" }}>
                <Esky />
              </div>

              {/* NodeWorm mascot with rod */}
              <div className="absolute" style={{ left: -6, bottom: 4 }}>
                <Worm />
              </div>

              {/* confetti */}
              {!reduce && <Confetti delay={catchT} />}
            </div>
          </div>

          <div className="px-6 pb-6 pt-4">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduce ? 0 : catchT + 0.15 }}
            >
              <div className="kicker mb-2" style={{ color: "var(--color-live)" }}>
                on the line
              </div>
              <h2 className="font-display font-extrabold text-2xl leading-tight">
                {appName} took the worm!
              </h2>
              <p className="mt-2 text-sm" style={{ color: "var(--color-ink-soft)" }}>
                Genuine OAuth consent complete. The token is reeled in and held masked. Time to catch another node.
              </p>
              <div className="mt-5 flex flex-col sm:flex-row gap-2 justify-center">
                <Link href="/" className="btn btn-signal text-sm justify-center">
                  Cast another worm
                </Link>
                <button onClick={onDone} className="btn btn-ghost text-sm justify-center">
                  Stay here
                </button>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

function Esky() {
  return (
    <svg width="86" height="58" viewBox="0 0 86 58" fill="none" aria-hidden>
      <rect x="4" y="16" width="78" height="38" rx="6" fill="var(--color-teal)" />
      <rect x="4" y="16" width="78" height="38" rx="6" fill="#000" opacity="0.06" />
      <rect x="0" y="8" width="86" height="14" rx="5" fill="var(--color-ink)" />
      <rect x="34" y="2" width="18" height="8" rx="3" fill="var(--color-ink)" />
      <rect x="10" y="30" width="66" height="3" rx="1.5" fill="#fff" opacity="0.5" />
    </svg>
  );
}

function Worm() {
  return (
    <svg width="78" height="92" viewBox="0 0 78 92" fill="none" aria-hidden>
      {/* rod */}
      <path d="M30 64 L70 6" stroke="var(--color-ink-soft)" strokeWidth="2.5" strokeLinecap="round" />
      {/* body segments */}
      <circle cx="20" cy="78" r="11" fill="var(--color-signal)" />
      <circle cx="30" cy="70" r="10" fill="#ff9a5c" />
      <circle cx="40" cy="66" r="9" fill="var(--color-signal)" />
      {/* cap */}
      <path d="M11 73c1-6 7-10 13-8" stroke="var(--color-ink)" strokeWidth="3" strokeLinecap="round" />
      {/* eyes */}
      <circle cx="17" cy="76" r="2.1" fill="#fff" />
      <circle cx="24" cy="75" r="2.1" fill="#fff" />
      <circle cx="17.4" cy="76.3" r="1" fill="var(--color-ink)" />
      <circle cx="24.4" cy="75.3" r="1" fill="var(--color-ink)" />
      {/* smile */}
      <path d="M16 81q5 4 10 0" stroke="var(--color-ink)" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function Confetti({ delay }: { delay: number }) {
  const bits = [
    { x: -60, c: "var(--color-signal)" },
    { x: -30, c: "var(--color-teal)" },
    { x: 0, c: "var(--color-live)" },
    { x: 30, c: "var(--color-signal)" },
    { x: 60, c: "var(--color-teal)" },
    { x: 15, c: "var(--color-live)" },
    { x: -45, c: "var(--color-teal)" },
  ];
  return (
    <>
      {bits.map((b, i) => (
        <motion.span
          key={i}
          className="absolute left-1/2 bottom-7 rounded-sm"
          style={{ width: 6, height: 6, background: b.c }}
          initial={{ opacity: 0, x: 0, y: 0 }}
          animate={{ opacity: [0, 1, 0], x: b.x, y: [0, -54 - (i % 3) * 14, -30] }}
          transition={{ duration: 0.9, delay: delay + (i % 4) * 0.04, ease: "easeOut" }}
        />
      ))}
    </>
  );
}
