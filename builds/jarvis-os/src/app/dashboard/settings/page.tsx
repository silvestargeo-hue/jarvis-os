"use client";

import { useQuery } from "convex/react";
import { Bot, Check, Palette, RotateCcw, ShieldCheck, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import { ConvexGate } from "@/components/ConvexGate";
import { DEFAULT_PERSONA, getPersona, setPersona, type Persona, type PersonaLength, type PersonaStyle } from "@/lib/ai/persona";

const ACCENTS: Array<{ name: string; rgb: string }> = [
  { name: "CYAN", rgb: "34 211 238" },
  { name: "AMBER", rgb: "251 191 36" },
  { name: "EMERALD", rgb: "52 211 153" },
  { name: "VIOLET", rgb: "167 139 250" },
  { name: "ROSE", rgb: "251 113 133" },
];

export default function SettingsPage() {
  return (
    <ConvexGate module="SYSTEM CONFIG">
      <SettingsApp />
    </ConvexGate>
  );
}

const STYLE_OPTS: PersonaStyle[] = ["concise", "friendly", "detailed", "witty"];
const LENGTH_OPTS: PersonaLength[] = ["brief", "balanced", "in-depth"];

function PersonaPanel() {
  const [persona, setP] = useState<Persona>(DEFAULT_PERSONA);
  useEffect(() => setP(getPersona()), []);

  const save = (patch: Partial<Persona>) => {
    const next = { ...persona, ...patch };
    setP(next);
    setPersona(next);
  };

  const chip = (active: boolean) =>
    `rounded-md border px-3 py-1.5 font-mono text-[10px] tracking-wider transition ${
      active ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100" : "border-cyan-400/15 text-cyan-300/60 hover:bg-cyan-400/5"
    }`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="font-mono text-[11px] text-cyan-500/70" htmlFor="persona-name">
          ASSISTANT NAME
        </label>
        <input
          id="persona-name"
          value={persona.name}
          onChange={(e) => save({ name: e.target.value.slice(0, 24) })}
          className="w-40 rounded-lg border border-cyan-400/30 bg-slate-950/60 px-3 py-1.5 font-mono text-xs uppercase tracking-widest text-cyan-100 outline-none focus:ring-1 focus:ring-cyan-400/60"
          placeholder="JARVIS"
        />
      </div>

      <div>
        <p className="mb-1.5 font-mono text-[10px] text-cyan-500/70">STYLE</p>
        <div className="flex flex-wrap gap-1.5">
          {STYLE_OPTS.map((s) => (
            <button key={s} onClick={() => save({ style: s })} className={chip(persona.style === s)}>
              {s.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 font-mono text-[10px] text-cyan-500/70">ANSWER LENGTH</p>
        <div className="flex flex-wrap gap-1.5">
          {LENGTH_OPTS.map((l) => (
            <button key={l} onClick={() => save({ length: l })} className={chip(persona.length === l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1 font-mono text-[10px] text-cyan-500/70">
            VOICE RATE · {persona.rate.toFixed(2)}×
          </p>
          <input
            type="range"
            min={0.6}
            max={1.6}
            step={0.05}
            value={persona.rate}
            onChange={(e) => save({ rate: Number(e.target.value) })}
            className="w-full accent-cyan-400"
          />
        </div>
        <div>
          <p className="mb-1 font-mono text-[10px] text-cyan-500/70">
            VOICE PITCH · {persona.pitch.toFixed(2)}
          </p>
          <input
            type="range"
            min={0.5}
            max={1.5}
            step={0.05}
            value={persona.pitch}
            onChange={(e) => save({ pitch: Number(e.target.value) })}
            className="w-full accent-cyan-400"
          />
        </div>
      </div>

      <button
        onClick={() => {
          setP(DEFAULT_PERSONA);
          setPersona(DEFAULT_PERSONA);
        }}
        className="hud-btn !px-3 !py-1.5 text-[10px]"
      >
        <RotateCcw size={11} /> RESET PERSONA
      </button>
      <p className="font-mono text-[10px] leading-relaxed text-cyan-500/60">
        Persona shapes every AI answer (style + length) and the spoken voice (rate + pitch) —
        applies across cloud, free, Groq and offline engines instantly.
      </p>
    </div>
  );
}

function SoundToggle() {
  const [on, setOn] = useState(true);
  useEffect(() => setOn(localStorage.getItem("jarvis.sounds") !== "0"), []);
  return (
    <button
      onClick={() => {
        const next = !on;
        setOn(next);
        localStorage.setItem("jarvis.sounds", next ? "1" : "0");
      }}
      className={`hud-btn text-[10px] ${on ? "!text-emerald-300" : "!text-slate-500"}`}
    >
      {on ? "SOUNDS ON — BLIPS & CHIMES ENABLED" : "SOUNDS OFF — SILENT INTERFACE"}
    </button>
  );
}

function SettingsApp() {
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  useEffect(() => setSessionToken(localStorage.getItem("jarvis.sessionToken")), []);

  const auditList = useQuery(
    api.audit.list,
    sessionToken ? { sessionToken, limit: 20 } : "skip"
  ) as
    | Array<{ _id: string; actorId: string; action: string; createdAt: number }>
    | undefined;

  const [saved, setSaved] = useState(false);
  const [accent, setAccent] = useState("34 211 238");
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("jarvis.accent");
    if (stored) setAccent(stored);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--hud-accent", accent);
  }, [accent]);

  useEffect(() => {
    setRole(localStorage.getItem("jarvis.role") ?? (localStorage.getItem("jarvis.userId") ? "member" : "guest"));
  }, []);

  const pick = (rgb: string) => {
    setAccent(rgb);
    localStorage.setItem("jarvis.accent", rgb);
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  return (
    <main className="min-h-screen">
      <div className="flex items-center justify-between border-b border-cyan-400/15 bg-slate-950/40 px-5 py-3">
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="hud-btn !py-1 text-[10px]">◂ DECK</a>
          <p className="hud-label">SYSTEM CONFIG // ADMIN</p>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-400/70">
          role: {role ?? "…"}
        </span>
      </div>

      <div className="mx-auto max-w-2xl space-y-4 p-5">
        {/* theme engine */}
        <section className="hud-panel hud-corner p-5">
          <p className="hud-label mb-4 flex items-center gap-2">
            <Palette size={12} /> ACCENT THEME ENGINE
            {saved && <span className="text-emerald-300">✓ saved</span>}
          </p>
          <div className="flex flex-wrap gap-3">
            {ACCENTS.map(({ name, rgb }) => (
              <button
                key={name}
                onClick={() => pick(rgb)}
                className={`flex items-center gap-2 rounded-lg border px-4 py-3 font-mono text-[11px] transition ${
                  accent === rgb
                    ? "border-cyan-400/60 bg-cyan-400/10 text-cyan-100"
                    : "border-cyan-400/15 text-cyan-300/70 hover:bg-cyan-400/5"
                }`}
              >
                <span className="h-4 w-4 rounded-full" style={{ background: `rgb(${rgb})` }} />
                {name}
                {accent === rgb && <Check size={12} />}
              </button>
            ))}
          </div>
          <p className="mt-3 font-mono text-[10px] text-cyan-500/60">
            Accent drives the entire HUD (panels, glows, scanline) via CSS var — persists per device.
          </p>
        </section>

        {/* security status */}
        <section className="hud-panel hud-corner p-5">
          <p className="hud-label mb-4 flex items-center gap-2">
            <ShieldCheck size={12} /> SECURITY POSTURE
          </p>
          <div className="space-y-2 font-mono text-[11px]">
            {[
              ["E2EE chat", "AES-GCM 256, sealed client-side"],
              ["Master PIN", "PBKDF2-SHA256 · 310k iterations · server-side verify"],
              ["OTP codes", "SHA-256 stored · 10-min TTL · 30s cooldown"],
              ["Audit trail", "PIN events + privileged actions logged"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <span className="text-cyan-500/70">{k}</span>
                <span className="text-cyan-100">{v}</span>
              </div>
            ))}
          </div>
        </section>

        {/* AI persona */}
        <section className="hud-panel hud-corner p-5">
          <p className="hud-label mb-4 flex items-center gap-2">
            <Bot size={12} /> AI PERSONA
          </p>
          <PersonaPanel />
        </section>

        {/* interface sounds */}
        <section className="hud-panel hud-corner p-5">
          <p className="hud-label mb-4 flex items-center gap-2">
            <Volume2 size={12} /> INTERFACE SOUNDS
          </p>
          <SoundToggle />
        </section>

        {/* audit trail */}
        <section className="hud-panel hud-corner p-5">
          <p className="hud-label mb-4">AUDIT TRAIL (LATEST 20)</p>
          <div className="space-y-1.5 font-mono text-[11px]">
            {(auditList ?? []).map((a) => (
              <div key={a._id} className="flex justify-between gap-3 text-cyan-300/80">
                <span>{a.action}</span>
                <span className="text-cyan-500/60">{new Date(a.createdAt).toISOString().slice(11, 19)} UTC</span>
              </div>
            ))}
            {auditList && auditList.length === 0 && (
              <p className="text-cyan-500/50">No events yet — verify your PIN once to populate.</p>
            )}
            {!auditList && <p className="animate-pulse text-cyan-500/50">loading…</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
