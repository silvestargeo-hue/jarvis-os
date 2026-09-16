"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { hashPin } from "@/lib/crypto";
import { confirm as confirmSound } from "@/lib/os/sounds";

type Stage = "email" | "code" | "pin";

export default function AuthGate() {
  // NEXT_PUBLIC_ vars are inlined at build time: with no Convex configured,
  // the hooks-based flow never renders (safe prerender, clean demo UX).
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    return (
      <main className="relative flex min-h-screen items-center justify-center p-6">
        <div className="hud-panel hud-corner w-full max-w-md p-8">
          <p className="hud-label mb-2">IDENTITY MODULE // OFFLINE</p>
          <p className="font-mono text-xs text-cyan-200/80">
            Authentication needs the Convex backend. Configure{" "}
            <code>NEXT_PUBLIC_CONVEX_URL</code> and redeploy to enable it.
          </p>
          <a href="/dashboard" className="hud-btn mt-5">CONTINUE IN DEMO MODE ▸</a>
        </div>
      </main>
    );
  }
  return <AuthFlow />;
}

function AuthFlow() {
  const router = useRouter();
  const verifyOtp = useMutation(api.users.verifyOtp);
  const ensureGuest = useMutation(api.users.ensureGuest);
  const savePinMutation = useMutation(api.users.setPin);

  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<{ userId: string; displayName: string } | null>(null);

  const guard = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const request = () =>
    guard(async () => {
      const res = (await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, purpose: "register" }),
      }).then((r) => r.json())) as {
        sent?: boolean;
        demoCode?: string;
        error?: string;
      };
      if (res.error) throw new Error(res.error);
      setDemoCode(res.demoCode ?? null);
      setStage("code");
    });

  // Returning user with a live session → straight to the deck (auto-login).
  useEffect(() => {
    const token = localStorage.getItem("jarvis.sessionToken");
    const userId = localStorage.getItem("jarvis.userId");
    if (token && userId) router.replace("/dashboard");
  }, [router]);

  const verify = () =>
    guard(async () => {
      const res = await verifyOtp({ email, code, purpose: "register" });
      confirmSound();
      localStorage.setItem("jarvis.sessionToken", res.sessionToken);
      localStorage.setItem("jarvis.role", res.role);
      localStorage.setItem("jarvis.email", email.trim().toLowerCase());
      setSession({ userId: res.userId, displayName: res.displayName });
      setStage("pin");
    });

  const savePin = (p: string | null) =>
    guard(async () => {
      const token = localStorage.getItem("jarvis.sessionToken");
      if (p !== null && session) {
        if (p.length < 4) throw new Error("PIN must be at least 4 digits");
        if (p !== pin2) throw new Error("PINs do not match");
        if (!token) throw new Error("session missing — log in again");
        const { hash, salt, iterations } = await hashPin(p);
        await savePinMutation({ sessionToken: token, pinHash: hash, pinSalt: salt, pinIterations: iterations });
      }
      if (session) {
        localStorage.setItem("jarvis.userId", session.userId);
        localStorage.setItem("jarvis.displayName", session.displayName);
      }
      router.push("/dashboard");
    });

  const guest = () =>
    guard(async () => {
      const name = (localStorage.getItem("jarvis.displayName") ?? "OPERATOR").toUpperCase();
      const res = await ensureGuest({ displayName: name });
      localStorage.setItem("jarvis.sessionToken", res.sessionToken);
      localStorage.setItem("jarvis.userId", res.userId);
      localStorage.setItem("jarvis.role", "guest");
      localStorage.setItem("jarvis.guest", "1");
      router.push("/dashboard");
    });

  return (
    <main className="relative flex min-h-screen items-center justify-center p-6">
      <div className="scan-line" aria-hidden />
      <div className="hud-panel hud-corner relative z-10 w-full max-w-md p-8">
        <p className="hud-label mb-1">JARVIS OS // IDENTITY MODULE</p>
        <h1 className="font-hud text-2xl tracking-widest text-cyan-100">
          {stage === "email" ? "AUTHENTICATE" : stage === "code" ? "VERIFY CODE" : "MASTER PIN"}
        </h1>

        {stage === "email" && (
          <div className="mt-6 space-y-4">
            <input
              className="w-full rounded-lg border border-cyan-400/30 bg-slate-950/60 px-4 py-3 font-mono text-sm text-cyan-100 outline-none focus:ring-1 focus:ring-cyan-400/60"
              placeholder="operator@domain.com"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="hud-btn w-full justify-center" disabled={busy || !email} onClick={request}>
              {busy ? "TRANSMITTING…" : "SEND ACCESS CODE ▸"}
            </button>
            <button className="hud-btn w-full justify-center opacity-70" onClick={guest}>
              CONTINUE AS GUEST ▸
            </button>
          </div>
        )}

        {stage === "code" && (
          <div className="mt-6 space-y-4">
            {demoCode === null && (
              <p className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-3 font-mono text-xs text-emerald-200">
                ✉ Access code sent to <b>{email}</b> — check your inbox (and spam).
              </p>
            )}
            {demoCode !== null && (
              <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 font-mono text-xs text-amber-200">
                ⚠ Email delivery unavailable — use this code: <b className="tracking-[0.3em]">{demoCode}</b>
              </p>
            )}
            <input
              className="w-full rounded-lg border border-cyan-400/30 bg-slate-950/60 px-4 py-3 text-center font-mono text-xl tracking-[0.5em] text-cyan-100 outline-none focus:ring-1 focus:ring-cyan-400/60"
              placeholder="••••••"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            <button className="hud-btn w-full justify-center" disabled={busy || code.length !== 6} onClick={verify}>
              {busy ? "VALIDATING…" : "VERIFY ▸"}
            </button>
          </div>
        )}

        {stage === "pin" && (
          <div className="mt-6 space-y-4">
            <p className="font-mono text-xs text-cyan-300/70">
              Optional — the Master PIN locks the OS (`/lock`). Stored only as a PBKDF2 hash.
            </p>
            <input
              className="w-full rounded-lg border border-cyan-400/30 bg-slate-950/60 px-4 py-3 text-center font-mono text-xl tracking-[0.5em] text-cyan-100 outline-none focus:ring-1 focus:ring-cyan-400/60"
              placeholder="PIN"
              inputMode="numeric"
              type="password"
              maxLength={8}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            />
            <input
              className="w-full rounded-lg border border-cyan-400/30 bg-slate-950/60 px-4 py-3 text-center font-mono text-xl tracking-[0.5em] text-cyan-100 outline-none focus:ring-1 focus:ring-cyan-400/60"
              placeholder="CONFIRM PIN"
              inputMode="numeric"
              type="password"
              maxLength={8}
              value={pin2}
              onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))}
            />
            <button className="hud-btn w-full justify-center" disabled={busy} onClick={() => savePin(pin || null)}>
              {busy ? "SECURING…" : pin ? "SET PIN & ENTER OS ▸" : "SKIP & ENTER OS ▸"}
            </button>
          </div>
        )}

        {error && <p className="mt-4 font-mono text-xs text-red-400">⚠ {error}</p>}
      </div>
    </main>
  );
}
