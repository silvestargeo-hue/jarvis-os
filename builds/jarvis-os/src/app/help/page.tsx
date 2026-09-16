"use client";

/**
 * HELP & SHORTCUTS — the JARVIS OS field manual.
 * Documents the command palette, voice commands, easter eggs, and every
 * power-user affordance in the system. Linked from the ⌘K palette.
 */

import {
  Command,
  Keyboard,
  Mic,
  MousePointerClick,
  Puzzle,
  Sparkles,
  Volume2,
  Zap,
} from "lucide-react";

const PALETTE_KEYS = [
  ["⌘ K / Ctrl K", "Open the command palette — anywhere, on any page"],
  ["↑ ↓", "Move through results"],
  ["↵ Enter", "Run the highlighted item"],
  ["Esc", "Close the palette"],
  ["Type any question", "“Ask JARVIS …” appears — sends it straight to the AI terminal"],
];

const VOICE_COMMANDS = [
  ["“Jarvis, open library”", "Opens the Document Library (Central Archive)"],
  ["“Jarvis, open chat”", "Opens E2EE messaging"],
  ["“Jarvis, open AI”", "Opens the AI terminal"],
  ["“Jarvis, open menu”", "Returns to the command deck"],
  ["“Jarvis, open settings”", "Opens system configuration"],
  ["“Jarvis, stop”", "Silences the assistant immediately"],
  ["“Jarvis, go back / go home”", "Browser back · site landing page"],
];

const AI_TERMINAL = [
  ["AI Persona", "Settings → AI Persona: name, style, answer length, voice rate & pitch — applies to every engine"],
  ["Live Voice Mode", "Mic stays open — talk, JARVIS answers aloud, listens again. Press stop to end."],
  ["Type a directive", "Enter sends · Shift+Enter new line · every keystroke gets a soft blip"],
  ["Answer toolbar", "Every answer exports as PDF · Word · Excel · Markdown · Text"],
  ["Engine fallback", "Cloud key → free keyless AI → Groq backup → on-device WebGPU (unlimited)"],
  ["Session titles", "Conversations name themselves from your first exchange"],
];

const OS_FEATURES = [
  ["Morning Briefing", "The deck greets you by voice once a day — time, weather, status"],
  ["Ambient Engine", "Synthesized rain / engine / reactor focus sounds — zero assets, offline"],
  ["Boot Sequence", "Cinematic cold-boot log; press any key to skip, faster after first visit"],
  ["Interface sounds", "Blips & chimes on actions — toggle in Settings → Interface Sounds"],
  ["Share into JARVIS", "Android share sheet → share any link or text to JARVIS — it lands in the AI terminal"],
  ["Phone layout", "On phones the command deck stacks into a clean scroll — drag panels are desktop-only"],
  ["Install as app", "Install button inside the site — Android, iPhone, Windows, Mac"],
  ["Skills", "Install from GitHub or paste JSON — JARVIS auto-uses them when relevant"],
  ["Command deck panels", "Drag panels, reorder modules ▲▼, layout is saved per device"],
];

const SECRETS = [
  ["↑ ↑ ↓ ↓ ← → ← → B A", "Electron Storm — the arc reactor surges through the whole OS"],
  ["⌘ K → “Help”", "You are here — the field manual is palette-reachable"],
];

function Section({
  icon,
  title,
  rows,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  rows: string[][];
  accent: string;
}) {
  return (
    <section className="hud-panel hud-corner rise-in p-5">
      <p className={`hud-label mb-4 flex items-center gap-2 ${accent}`}>
        {icon} {title}
      </p>
      <div className="space-y-2.5 font-mono text-[11px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-4">
            <span className="shrink-0 text-cyan-200 sm:w-64">{k}</span>
            <span className="text-cyan-300/70">{v}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function HelpPage() {
  return (
    <main className="min-h-screen">
      <div className="flex items-center justify-between border-b border-cyan-400/15 bg-slate-950/40 px-5 py-3">
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="hud-btn !py-1 text-[10px]">
            ◂ DECK
          </a>
          <p className="hud-label">JARVIS OS // FIELD MANUAL</p>
        </div>
        <span className="font-mono text-[10px] tracking-[0.2em] text-cyan-500/70">v0.1.0</span>
      </div>

      <div className="mx-auto max-w-3xl space-y-4 p-5">
        <div className="rise-in rounded-xl border border-violet-400/25 bg-gradient-to-br from-violet-500/10 via-cyan-500/5 to-transparent p-5">
          <h1 className="font-hud text-2xl tracking-[0.15em] text-cyan-100">FIELD MANUAL</h1>
          <p className="mt-1 font-mono text-xs text-cyan-300/70">
            Every shortcut, voice command, and hidden feature in JARVIS OS — one page.
          </p>
        </div>

        <Section icon={<Command size={12} />} title="COMMAND PALETTE (⌘K)" rows={PALETTE_KEYS} accent="text-violet-300/80" />
        <Section icon={<Mic size={12} />} title="VOICE COMMANDS" rows={VOICE_COMMANDS} accent="text-cyan-300/80" />
        <Section icon={<Zap size={12} />} title="AI TERMINAL" rows={AI_TERMINAL} accent="text-cyan-300/80" />
        <Section icon={<Sparkles size={12} />} title="OS FEATURES" rows={OS_FEATURES} accent="text-cyan-300/80" />
        <Section
          icon={<Keyboard size={12} />}
          title="SECRET PROTOCOLS"
          rows={SECRETS}
          accent="text-emerald-300/80"
        />

        <p className="pb-6 text-center font-mono text-[10px] text-cyan-500/50">
          Tip: say “Jarvis, open menu”, hit ⌘K, and try the Konami code — this OS rewards the curious.
        </p>
      </div>
    </main>
  );
}
