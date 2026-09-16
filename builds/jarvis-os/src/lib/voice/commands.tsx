"use client";

/**
 * JARVIS global voice commands — "Jarvis, open library" → navigates.
 *
 * Wake word ("jarvis" / "hey jarvis") followed by a routed phrase:
 *   open library / documents      → /dashboard/library
 *   open chat / messages          → /dashboard/chat
 *   open ai / terminal            → /dashboard/ai
 *   open menu / dashboard / deck  → /dashboard
 *   open settings                 → /dashboard/settings
 *   stop / quiet                  → stop speaking + generation
 *   go back / go home             → browser back / site root
 *
 * The listener is always-on while the tab is open (continuous recognition),
 * with auto-restart on silence, plus a floating HUD button for manual control.
 * A distinct two-tone chirp tells the user the wake word was heard.
 */

import { useEffect, useState } from "react";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: any) => void) | null;
};

export type VoiceCommandHud = {
  listening: boolean;
  supported: boolean;
  lastCommand: string | null;
};

const WAKE = /\b(jarvis|hey jarvis|ok jarvis)\b/i;

// ── Pause gate ───────────────────────────────────────────────────────────────
// Live Voice Mode (AI terminal) owns the mic when active — the global wake-word
// listener stands down so two recognizers never fight over one microphone.
let voiceCommandsPaused = false;
export const VOICE_PAUSE_EVENT = "jarvis:voice-pause";

export function setVoiceCommandsPaused(paused: boolean): void {
  voiceCommandsPaused = paused;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(VOICE_PAUSE_EVENT, { detail: paused }));
  }
}

function stripWake(text: string): string {
  return text.replace(WAKE, "").replace(/^[,\s]+|[,\s]+$/g, "").toLowerCase();
}

function routeFor(phrase: string): string | null {
  const p = phrase.toLowerCase();
  if (/\b(library|documents?|archive|files?)\b/.test(p)) return "/dashboard/library";
  if (/\b(chat|messages?|talk)\b/.test(p)) return "/dashboard/chat";
  if (/\b(ai|terminal|assistant)\b/.test(p)) return "/dashboard/ai";
  if (/\b(settings?|preferences?|config)\b/.test(p)) return "/dashboard/settings";
  if (/\b(menu|dashboard|deck|home screen|main screen)\b/.test(p)) return "/dashboard";
  if (/\bsite root|landing\b/.test(p)) return "/";
  return null;
}

/** Audible confirmation that the wake word was captured. */
function chirp(): void {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const gain = ctx.createGain();
    gain.gain.value = 0.045;
    gain.connect(ctx.destination);
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(ctx.currentTime + i * 0.09);
      osc.stop(ctx.currentTime + i * 0.09 + 0.07);
    });
    setTimeout(() => void ctx.close(), 600);
  } catch {
    /* audio unavailable — silent */
  }
}

function speakShort(text: string): void {
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.05;
  window.speechSynthesis.speak(u);
}

export function useVoiceCommands(): VoiceCommandHud {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [lastCommand, setLastCommand] = useState<string | null>(null);

  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: unknown;
      webkitSpeechRecognition?: unknown;
    };
    const Ctor = (w.SpeechRecognition || w.webkitSpeechRecognition) as
      | (new () => SpeechRecognitionLike)
      | undefined;
    setSupported(Boolean(Ctor));
    if (!Ctor) return;

    let rec: SpeechRecognitionLike | null = null;
    let killed = false;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;

    const onPause = (e: Event) => {
      const paused = (e as CustomEvent).detail === true;
      if (paused) {
        try {
          rec?.abort();
        } catch {
          /* already stopped */
        }
        setListening(false);
      } else if (!killed) {
        try {
          rec?.start();
          setListening(true);
        } catch {
          /* race — onend retries */
        }
      }
    };
    window.addEventListener(VOICE_PAUSE_EVENT, onPause);

    const spawn = (): SpeechRecognitionLike => {
      const r = new Ctor();
      r.lang = "en-US";
      r.continuous = true;
      r.interimResults = true; // improves wake-word latency
      r.maxAlternatives = 1;

      r.onresult = (e: any) => {
        if (voiceCommandsPaused) return;
        const res = e.results[e.results.length - 1];
        const text: string = res?.[0]?.transcript ?? "";
        if (!text) return;

        if (!WAKE.test(text)) {
          // Some engines only emit final results after wake+phrase together.
          return;
        }
        chirp();
        const phrase = stripWake(text);
        setLastCommand(phrase || "…");

        if (!phrase || /^\b(stop|quiet|enough)\b$/.test(phrase)) {
          window.speechSynthesis?.cancel();
          return;
        }
        const target = routeFor(phrase);
        if (target) {
          speakShort(`Opening ${target.split("/").pop()}`);
          // Small delay so the confirmation chirp/voice isn't clipped by nav.
          setTimeout(() => {
            window.location.href = target;
          }, 350);
        } else if (/\b(go back|back)\b/.test(phrase)) {
          window.history.back();
        } else if (/\b(go home|home)\b/.test(phrase)) {
          window.location.href = "/";
        }
      };

      r.onend = () => {
        if (killed || voiceCommandsPaused) return;
        // Chrome ends continuous sessions periodically; restart with backoff.
        restartTimer = setTimeout(() => {
          try {
            r.start();
            setListening(true);
          } catch {
            /* already started */
          }
        }, 600);
      };

      r.onerror = (e: any) => {
        // "no-speech" is normal in continuous mode; "not-allowed" = mic denied.
        if (e?.error === "not-allowed" || e?.error === "service-not-allowed") {
          killed = true;
          setListening(false);
        }
      };

      try {
        r.start();
        setListening(true);
      } catch {
        /* start races are harmless; onend will retry */
      }
      return r;
    };

    rec = spawn();

    return () => {
      killed = true;
      window.removeEventListener(VOICE_PAUSE_EVENT, onPause);
      if (restartTimer) clearTimeout(restartTimer);
      try {
        rec?.abort();
      } catch {
        /* already stopped */
      }
    };
  }, []);

  return { listening, supported, lastCommand };
}

/**
 * Floating always-on mic indicator. Hidden on /auth and /lock where
 * ambient listening would be inappropriate.
 */
export function VoiceCommandHud() {
  const { listening, supported, lastCommand } = useVoiceCommands();
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(["/auth", "/lock"].includes(window.location.pathname));
  }, []);

  if (!supported || hidden) return null;

  return (
    <div className="fixed bottom-5 left-5 z-40 flex items-center gap-2">
      <div
        className={`flex items-center gap-2 rounded-full border px-3 py-1.5 backdrop-blur transition ${
          listening
            ? "border-cyan-400/40 bg-slate-900/90 shadow-[0_0_18px_rgba(34,211,238,0.25)]"
            : "border-slate-600/40 bg-slate-900/70"
        }`}
        title={supported ? "Say “Jarvis, open library”" : "Voice commands unavailable"}
      >
        <span className={`h-2 w-2 rounded-full ${listening ? "animate-pulse bg-cyan-400" : "bg-slate-500"}`} />
        <span className="font-mono text-[10px] tracking-wider text-cyan-100/80">
          {listening ? "VOICE READY — SAY “JARVIS …”" : "VOICE OFF"}
        </span>
        {lastCommand && (
          <span className="max-w-[180px] truncate font-mono text-[10px] text-cyan-400/70">“{lastCommand}”</span>
        )}
      </div>
    </div>
  );
}
