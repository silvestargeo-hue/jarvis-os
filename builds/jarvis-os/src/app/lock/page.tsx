"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { derivePinHash } from "@/lib/crypto";
import { ConvexGate } from "@/components/ConvexGate";

export default function LockPage() {
  return (
    <ConvexGate module="LOCKSCREEN">
      <LockScreen />
    </ConvexGate>
  );
}

type Stage = "pin" | "forgot-email" | "forgot-code" | "forgot-done";

function LockScreen() {
  const router = useRouter();
  const verifyPinHash = useMutation(api.users.verifyPinHash);
  const clearPin = useMutation(api.users.clearPin);

  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [entry, setEntry] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const [unlocked, setUnlocked] = useState(false);
  const [trustDevice, setTrustDevice] = useState(true);
  const [stage, setStage] = useState<Stage>("pin");
  const [resetCode, setResetCode] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const failCount = useRef(0);

  // ── identity + auto-unlock (trusted device) ────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem("jarvis.sessionToken");
    setSessionToken(token ?? null);
    setEmail(localStorage.getItem("jarvis.email") ?? "");
    if (!token) router.replace("/auth");
  }, [router]);

  const challenge = useQuery(
    api.users.getPinChallenge,
    sessionToken ? { sessionToken } : "skip"
  ) as { hasPin: boolean; pinSalt?: string; pinIterations?: number } | undefined;

  const finishUnlock = useCallback(() => {
    if (trustDevice) localStorage.setItem("jarvis.trustedDevice", "1");
    setUnlocked(true);
    setTimeout(() => router.push("/dashboard"), 950);
  }, [trustDevice, router]);

  useEffect(() => {
    if (challenge && !challenge.hasPin) router.replace("/dashboard");
  }, [challenge, router]);

  // Returning trusted device: skip the PIN entirely (soft unlock).
  useEffect(() => {
    if (
      challenge?.hasPin &&
      typeof window !== "undefined" &&
      localStorage.getItem("jarvis.trustedDevice") === "1" &&
      failCount.current === 0 &&
      entry === "" &&
      !busy &&
      !unlocked
    ) {
      // One-shot soft bypass for this device.
      finishUnlock();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenge?.hasPin]);

  const attempt = useCallback(async () => {
    if (!sessionToken || !challenge?.hasPin || busy || entry.length < 4) return;
    setBusy(true);
    setError(null);
    try {
      const candidateHash = await derivePinHash(entry, challenge.pinSalt!, challenge.pinIterations ?? 310_000);
      const res = await verifyPinHash({ sessionToken, candidateHash });
      if (res.ok) {
        finishUnlock();
      } else {
        failCount.current += 1;
        setError(res.error ?? "ACCESS DENIED");
        setShake((s) => s + 1);
        setEntry("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "verification failed");
      setShake((s) => s + 1);
      setEntry("");
    } finally {
      setBusy(false);
    }
  }, [sessionToken, challenge, entry, busy, verifyPinHash, router, finishUnlock]);

  const press = (k: string) => {
    setError(null);
    if (k === "⌫") setEntry((e) => e.slice(0, -1));
    else if (k === "✓") void attempt();
    else if (entry.length < 8) setEntry((e) => e + k);
  };

  // Keyboard input support
  useEffect(() => {
    if (stage !== "pin") return;
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("⌫");
      else if (e.key === "Enter") press("✓");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, entry, busy]);

  // ── forgot-PIN flow (email OTP) ─────────────────────────────────────────
  const requestReset = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = (await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, purpose: "pinReset" }),
      }).then((r) => r.json())) as { sent?: boolean; demoCode?: string; error?: string };
      if (res.error) throw new Error(res.error);
      if (res.demoCode) sessionStorage.setItem("jarvis.resetDemoCode", res.demoCode);
      setResetSent(true);
      setStage("forgot-code");
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not send reset code");
    } finally {
      setBusy(false);
    }
  }, [email]);

  const confirmReset = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      // verifyOtp with purpose=pinReset clears the PIN server-side.
      await clearPin({ email: email.trim().toLowerCase(), code: resetCode });
      sessionStorage.removeItem("jarvis.resetDemoCode");
      setStage("forgot-done");
      // PIN is cleared; send the operator straight in.
      setTimeout(() => router.push("/dashboard"), 1400);
    } catch (e) {
      setError(e instanceof Error ? e.message : "reset failed");
      setShake((s) => s + 1);
    } finally {
      setBusy(false);
    }
  }, [email, resetCode, clearPin, router]);

  const clock = useClock();

  const dots = useMemo(() => Array.from({ length: 8 }, (_, i) => i < entry.length), [entry.length]);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-6">
      {/* ── ambient background ─────────────────────────────────────────── */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "linear-gradient(rgba(34,211,238,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.06) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
        animate={{ backgroundPosition: ["0px 0px", "44px 44px"] }}
        transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_35%,rgba(2,6,23,0.9)_100%)]" />
      {/* horizontal scan beam */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 h-24 bg-gradient-to-b from-transparent via-cyan-400/10 to-transparent"
        animate={{ top: ["-10%", "110%"] }}
        transition={{ duration: 6.5, repeat: Infinity, ease: "linear" }}
      />

      {/* ── arc-reactor core ───────────────────────────────────────────── */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <motion.div
          className="h-[540px] w-[540px] rounded-full border border-cyan-400/15"
          animate={{ rotate: 360 }}
          transition={{ duration: 26, repeat: Infinity, ease: "linear" }}
        >
          <div className="absolute inset-0 rounded-full border-t-2 border-cyan-300/40" />
        </motion.div>
        <motion.div
          className="absolute inset-10 rounded-full border border-cyan-400/20"
          animate={{ rotate: -360 }}
          transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
        >
          <div className="absolute inset-0 rounded-full border-l-2 border-cyan-300/30" />
          <div className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300 shadow-[0_0_14px_rgba(34,211,238,0.9)]" />
        </motion.div>
        <motion.div
          className="absolute inset-24 rounded-full border border-dashed border-cyan-400/25"
          animate={{ rotate: 360 }}
          transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          className="absolute inset-[190px] rounded-full bg-cyan-400/10 blur-2xl"
          animate={{ opacity: unlocked ? [0.6, 1] : [0.25, 0.5, 0.25], scale: unlocked ? [1, 1.35] : [1, 1.12, 1] }}
          transition={{ duration: unlocked ? 0.9 : 4.5, repeat: unlocked ? 0 : Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* ── success overlay ────────────────────────────────────────────── */}
      <AnimatePresence>
        {unlocked && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 flex items-center justify-center bg-cyan-400/5 backdrop-blur-[2px]"
          >
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", damping: 14 }}
              className="text-center"
            >
              <motion.div
                className="mx-auto mb-4 h-16 w-16 rounded-full border-2 border-cyan-300"
                animate={{ boxShadow: ["0 0 20px rgba(34,211,238,0.8)", "0 0 60px rgba(34,211,238,1)"] }}
                transition={{ duration: 0.9, repeat: Infinity, repeatType: "reverse" }}
              />
              <p className="font-hud text-2xl tracking-[0.35em] text-cyan-200">ACCESS GRANTED</p>
              <p className="mt-2 font-mono text-[11px] text-cyan-400/70">welcome back, operator</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── lock panel ─────────────────────────────────────────────────── */}
      <motion.div
        key={shake}
        initial={shake ? { x: 0 } : false}
        animate={shake ? { x: [0, -14, 12, -8, 6, 0] } : undefined}
        transition={{ duration: 0.45 }}
        className="hud-panel hud-corner relative z-20 w-full max-w-sm border border-cyan-400/25 bg-slate-950/70 p-8 text-center shadow-[0_0_80px_rgba(34,211,238,0.12)] backdrop-blur-xl"
      >
        {stage === "pin" && (
          <>
            {/* live clock */}
            <p className="font-hud text-4xl tracking-[0.18em] text-cyan-100 [text-shadow:0_0_24px_rgba(34,211,238,0.55)]">
              {clock.time}
            </p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.3em] text-cyan-400/70">{clock.date}</p>

            <motion.p
              className="hud-label mt-6"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2.4, repeat: Infinity }}
            >
              {busy ? "VERIFYING…" : "SYSTEM LOCKED"}
            </motion.p>

            {/* animated PIN dots */}
            <div className="mx-auto mt-5 flex items-center justify-center gap-3">
              {dots.map((filled, i) => (
                <motion.span
                  key={i}
                  animate={
                    filled
                      ? { scale: [1, 1.5, 1], boxShadow: "0 0 16px rgba(34,211,238,0.95)" }
                      : { scale: 1 }
                  }
                  transition={{ duration: 0.3 }}
                  className={`h-3.5 w-3.5 rounded-full border ${
                    filled ? "border-cyan-200 bg-cyan-300" : "border-cyan-400/30 bg-transparent"
                  }`}
                />
              ))}
              {Array.from({ length: 8 - dots.length }).map((_, i) => (
                <span key={`e${i}`} className="h-3.5 w-3.5 rounded-full border border-cyan-400/20" />
              ))}
            </div>

            {/* keypad */}
            <div className="mt-6 grid grid-cols-3 gap-3">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "✓"].map((k, idx) => (
                <motion.button
                  key={k}
                  whileTap={{ scale: 0.88 }}
                  whileHover={{ scale: 1.05 }}
                  onClick={() => press(k)}
                  disabled={busy}
                  className={`hud-btn justify-center py-3.5 text-base disabled:opacity-40 ${
                    k === "✓" ? "!border-emerald-400/50 !text-emerald-300" : ""
                  }`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 + idx * 0.025 }}
                >
                  {k}
                </motion.button>
              ))}
            </div>

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 font-mono text-xs text-red-400"
              >
                ⚠ {error}
              </motion.p>
            )}

            {/* trust + forgot controls */}
            <div className="mt-5 flex items-center justify-between font-mono text-[10px]">
              <button
                onClick={() => setTrustDevice((v) => !v)}
                className={`flex items-center gap-1.5 transition ${
                  trustDevice ? "text-emerald-300/90" : "text-slate-500"
                }`}
                title="Remember this device and skip the PIN next time"
              >
                <span
                  className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border ${
                    trustDevice ? "border-emerald-400/70 bg-emerald-400/20" : "border-slate-500/60"
                  }`}
                >
                  {trustDevice && <span className="text-[8px] leading-none text-emerald-300">✓</span>}
                </span>
                TRUST THIS DEVICE
              </button>
              <button onClick={() => setStage("forgot-email")} className="text-cyan-400/70 underline-offset-4 hover:text-cyan-200 hover:underline">
                FORGOT PIN?
              </button>
            </div>
          </>
        )}

        {stage === "forgot-email" && (
          <div className="text-left">
            <p className="hud-label mb-2">PIN RECOVERY</p>
            <p className="mb-4 font-mono text-[11px] leading-relaxed text-cyan-200/70">
              Enter your registered email — a 6-digit recovery code will be sent. Verifying it
              clears the old PIN instantly.
            </p>
            <input
              className="mb-3 w-full rounded-lg border border-cyan-400/30 bg-slate-950/60 px-4 py-3 font-mono text-sm text-cyan-100 outline-none focus:ring-1 focus:ring-cyan-400/60"
              placeholder={email || "operator@domain.com"}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button
              className="hud-btn w-full justify-center"
              disabled={busy || !email.includes("@")}
              onClick={() => void requestReset()}
            >
              {busy ? "TRANSMITTING…" : "SEND RECOVERY CODE ▸"}
            </button>
            <button
              onClick={() => setStage("pin")}
              className="mt-3 w-full py-1 font-mono text-[10px] text-slate-500 hover:text-cyan-300"
            >
              ← back to keypad
            </button>
          </div>
        )}

        {stage === "forgot-code" && (
          <div className="text-left">
            <p className="hud-label mb-2">ENTER RECOVERY CODE</p>
            {resetSent && (
              <p className="mb-3 rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-2.5 font-mono text-[10px] text-emerald-200">
                ✉ code sent to <b>{email}</b> — expires in 10 minutes
                {sessionStorage.getItem("jarvis.resetDemoCode") && (
                  <>
                    <br />
                    <span className="text-amber-300">
                      demo fallback code: {sessionStorage.getItem("jarvis.resetDemoCode")}
                    </span>
                  </>
                )}
              </p>
            )}
            <input
              className="mb-3 w-full rounded-lg border border-cyan-400/30 bg-slate-950/60 px-4 py-3 text-center font-mono text-xl tracking-[0.5em] text-cyan-100 outline-none focus:ring-1 focus:ring-cyan-400/60"
              placeholder="••••••"
              inputMode="numeric"
              maxLength={6}
              value={resetCode}
              onChange={(e) => setResetCode(e.target.value.replace(/\D/g, ""))}
            />
            <button
              className="hud-btn w-full justify-center"
              disabled={busy || resetCode.length !== 6}
              onClick={() => void confirmReset()}
            >
              {busy ? "VALIDATING…" : "VERIFY & CLEAR PIN ▸"}
            </button>
            {error && <p className="mt-3 font-mono text-xs text-red-400">⚠ {error}</p>}
          </div>
        )}

        {stage === "forgot-done" && (
          <div className="py-6 text-center">
            <motion.div
              className="mx-auto mb-4 h-14 w-14 rounded-full border-2 border-emerald-400"
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            >
              <span className="flex h-full w-full items-center justify-center text-2xl text-emerald-300">✓</span>
            </motion.div>
            <p className="font-hud text-xl tracking-[0.3em] text-emerald-200">PIN CLEARED</p>
            <p className="mt-2 font-mono text-[11px] text-cyan-300/70">
              Redirecting you to the OS — set a new PIN anytime from settings.
            </p>
          </div>
        )}
      </motion.div>

      <p className="absolute bottom-6 left-1/2 z-20 -translate-x-1/2 font-mono text-[9px] uppercase tracking-[0.4em] text-cyan-500/40">
        jarvis os · secure shell
      </p>
    </main>
  );
}

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!now) return { time: "--:--", date: "" };
  return {
    time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }),
    date: now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" }),
  };
}
