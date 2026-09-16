"use client";

/**
 * OS-level cinematic FX:
 *  - BootSequence: cold-boot terminal log on first visit (session-scoped)
 *  - ElectronStorm: Konami-code easter egg — the whole OS "surges"
 *
 * Both mount once in the root layout and are fail-silent.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

const BOOT_LINES = [
  "JARVIS BIOS v9.4.1 — MARK II",
  "› memory check .......... 640K OK (extended: unlimited)",
  "› arc reactor ........... STABLE",
  "› neural core ........... ONLINE",
  "› skills toolbelt ....... MOUNTED",
  "› library index ......... SYNCED",
  "› voice interface ....... CALIBRATED",
  "› encryption ............ AES-256-GCM VERIFIED",
  "",
  "SYSTEM READY. WELCOME BACK, OPERATOR.",
];

export function BootSequence() {
  const [visible, setVisible] = useState(false);
  const [shown, setShown] = useState(0);
  const [returning, setReturning] = useState(false);

  useEffect(() => {
    // Once per browser session — returning users skip it entirely.
    if (sessionStorage.getItem("jarvis.booted")) return;
    sessionStorage.setItem("jarvis.booted", "1");
    // First-ever visit gets the full cinematic log; repeat visits get a
    // quicker pass (they've seen the show).
    try {
      const n = Number(localStorage.getItem("jarvis.bootCount") ?? "0") + 1;
      localStorage.setItem("jarvis.bootCount", String(n));
      setReturning(n > 1);
    } catch {
      /* private mode — treat as first visit */
    }
    setVisible(true);
  }, []);

  useEffect(() => {
    if (!visible) return;
    if (shown < BOOT_LINES.length) {
      const t = setTimeout(() => setShown((s) => s + 1), returning ? 55 : 110);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setVisible(false), returning ? 500 : 900);
    return () => clearTimeout(t);
  }, [visible, shown, returning]);

  // Skippable: any key or click dismisses instantly.
  useEffect(() => {
    if (!visible) return;
    const skip = () => setVisible(false);
    window.addEventListener("keydown", skip);
    window.addEventListener("mousedown", skip);
    return () => {
      window.removeEventListener("keydown", skip);
      window.removeEventListener("mousedown", skip);
    };
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.5 } }}
          onClick={() => setVisible(false)}
        >
          <div className="w-full max-w-md px-8 font-mono text-[12px] leading-6 text-cyan-300">
            {BOOT_LINES.slice(0, shown).map((line, i) => (
              <motion.p key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.12 }}>
                {line}
              </motion.p>
            ))}
            {shown < BOOT_LINES.length && <span className="animate-pulse text-cyan-500">▊</span>}
            <p className="mt-6 text-center text-[10px] tracking-[0.2em] text-cyan-500/60">
              PRESS ANY KEY TO SKIP
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];

/** Konami code (↑↑↓↓←→←→BA) triggers a full-screen arc-reactor surge. */
export function ElectronStorm() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    let progress = 0;
    const onKey = (e: KeyboardEvent) => {
      const expected = KONAMI[progress];
      const hit = e.key === expected || e.key.toLowerCase() === expected;
      if (hit) {
        progress += 1;
        if (progress === KONAMI.length) {
          progress = 0;
          setActive(true);
          setTimeout(() => setActive(false), 4200);
        }
      } else {
        progress = e.key === KONAMI[0] ? 1 : 0;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          className="pointer-events-none fixed inset-0 z-[150]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 1.2 } }}
        >
          <motion.div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 50% 50%, rgba(34,211,238,0.35) 0%, rgba(56,189,248,0.12) 30%, transparent 62%)",
            }}
            animate={{ scale: [0.6, 1.6, 1.1, 1.8], opacity: [0.4, 1, 0.7, 1] }}
            transition={{ duration: 3.2, times: [0, 0.35, 0.6, 1] }}
          />
          {[...Array(14)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute h-px w-40 bg-cyan-300/70"
              style={{ top: `${8 + i * 6.4}%`, left: "-15%" }}
              animate={{ left: ["-15%", "115%"] }}
              transition={{ duration: 0.9 + (i % 5) * 0.22, delay: i * 0.12, ease: "linear" }}
            />
          ))}
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            animate={{ opacity: [0, 1, 1, 0], scale: [0.9, 1, 1, 1.05] }}
            transition={{ duration: 3.4 }}
          >
            <p className="font-hud text-3xl tracking-[0.4em] text-cyan-100 [text-shadow:0_0_40px_rgba(34,211,238,0.9)]">
              ELECTRON STORM
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
