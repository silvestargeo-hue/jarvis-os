"use client";

/**
 * Morning Briefing — JARVIS greets the operator once a day, by voice,
 * with time-of-day awareness and a one-tap route to the full spoken briefing
 * (time · weather via skills · library stats). Auto-dismisses its voice
 * politely if the browser blocks autoplay speech until first interaction.
 */

import { Sparkles, Volume2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { speak, ttsSupported } from "@/lib/ai/providers";

function greetingWord(h: number): string {
  if (h < 5) return "Burning the midnight oil";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 22) return "Good evening";
  return "Good night";
}

function buildGreeting(name: string): string {
  const now = new Date();
  const h = now.getHours();
  const date = now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const core = `${greetingWord(h)}, ${name}. It's ${date}.`;
  const tail =
    h < 12 ? "Systems are nominal and your archives are standing by."
    : h < 17 ? "All modules operational. How can I assist?"
    : "Wrapping up the day? I can summarize anything before you go.";
  return `${core} ${tail}`;
}

const BRIEFING_Q =
  "Give me my morning briefing: current time and date, today's weather in my area, one interesting fact, and a quick summary of what's in my document library.";

export function BriefingWidget() {
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState("Operator");
  const [voiceBlocked, setVoiceBlocked] = useState(false);

  const text = useMemo(() => buildGreeting(name), [name]);

  useEffect(() => {
    setMounted(true);
    const stored =
      localStorage.getItem("jarvis.displayName") ??
      localStorage.getItem("jarvis.email")?.split("@")[0];
    if (stored) setName(stored);

    // Spoken at most once per day, per device. Browsers may block speech
    // before any user gesture — detect that and fall back to silent mode.
    const key = "jarvis.briefing.lastSpoken";
    const today = new Date().toISOString().slice(0, 10);
    if (ttsSupported() && localStorage.getItem(key) !== today) {
      const t = setTimeout(() => {
        try {
          let ended = false;
          speak(text, () => {
            ended = true;
          });
          localStorage.setItem(key, today);
          setTimeout(() => setVoiceBlocked((v) => (ended ? v : true)), 2500);
        } catch {
          setVoiceBlocked(true);
        }
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [text]);

  if (!mounted) return null;

  return (
    <div className="rounded-xl border border-violet-400/25 bg-gradient-to-br from-violet-500/10 via-cyan-500/5 to-transparent p-4">
      <div className="flex items-start gap-3">
        <Sparkles size={18} className="mt-0.5 shrink-0 text-violet-300" />
        <div className="min-w-0 flex-1">
          <div className="hud-label text-violet-300/80">MORNING BRIEFING</div>
          <p className="mt-1 text-sm leading-relaxed text-cyan-100">{text}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              href={`/dashboard/ai?q=${encodeURIComponent(BRIEFING_Q)}`}
              className="hud-btn !px-3 !py-1.5 text-[10px]"
            >
              <Volume2 size={11} className="mr-1 inline" /> FULL SPOKEN BRIEFING
            </Link>
            {voiceBlocked && (
              <span className="text-[10px] text-slate-500">
                (voice muted until you interact — tap the button to hear it)
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
