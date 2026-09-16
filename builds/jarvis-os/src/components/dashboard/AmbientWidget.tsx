"use client";

/**
 * AMBIENT ENGINE — synthesized focus ambience, generated live with WebAudio.
 * RAIN (filtered noise + droplet LFO), ENGINE (low sawtooth drone),
 * REACTOR (hum + slow pulse). Zero assets, works offline, pure Stark tech.
 */

import { Power, Waves } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Preset = "off" | "rain" | "engine" | "reactor";

const PRESETS: Array<{ id: Preset; label: string }> = [
  { id: "off", label: "OFF" },
  { id: "rain", label: "RAIN" },
  { id: "engine", label: "ENGINE" },
  { id: "reactor", label: "REACTOR" },
];

export function AmbientWidget() {
  const [preset, setPreset] = useState<Preset>("off");
  const [level, setLevel] = useState(0);
  const nodesRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    nodesRef.current?.stop();
    nodesRef.current = null;
    if (preset === "off") {
      setLevel(0);
      return;
    }
    try {
      const AC: typeof AudioContext =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      void ctx.resume();
      const master = ctx.createGain();
      master.gain.value = 0.0001;
      master.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 1.2);
      master.connect(ctx.destination);
      const nodes: Array<AudioNode | OscillatorNode> = [master];
      const timers: number[] = [];

      if (preset === "rain" || preset === "engine") {
        // Filtered white-noise bed
        const len = ctx.sampleRate * 2;
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource();
        noise.buffer = buf;
        noise.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = preset === "rain" ? "bandpass" : "lowpass";
        filter.frequency.value = preset === "rain" ? 1400 : 220;
        filter.Q.value = preset === "rain" ? 0.6 : 0.4;
        noise.connect(filter).connect(master);
        noise.start();
        nodes.push(noise, filter);
        if (preset === "rain") {
          // Slow swell so it breathes like a real storm
          const lfo = ctx.createOscillator();
          const lfoGain = ctx.createGain();
          lfo.frequency.value = 0.09;
          lfoGain.gain.value = 300;
          lfo.connect(lfoGain).connect(filter.frequency);
          lfo.start();
          nodes.push(lfo, lfoGain);
        }
      }
      if (preset === "engine" || preset === "reactor") {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = preset === "engine" ? 46 : 60;
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = preset === "engine" ? 140 : 200;
        osc.connect(lp).connect(master);
        osc.start();
        nodes.push(osc, lp);
        if (preset === "reactor") {
          // Arc-reactor pulse: gain LFO at ~0.5Hz
          const pulse = ctx.createOscillator();
          const pulseGain = ctx.createGain();
          pulse.frequency.value = 0.5;
          pulseGain.gain.value = 0.06;
          pulse.connect(pulseGain).connect(master.gain);
          pulse.start();
          nodes.push(pulse, pulseGain);
        }
      }
      if (preset === "rain") {
        // Random droplet blips
        timers.push(
          window.setInterval(() => {
            try {
              const o = ctx.createOscillator();
              const g = ctx.createGain();
              o.type = "sine";
              o.frequency.value = 2200 + Math.random() * 1800;
              const t = ctx.currentTime;
              g.gain.setValueAtTime(0.015, t);
              g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
              o.connect(g).connect(master);
              o.start(t);
              o.stop(t + 0.08);
            } catch { /* ignore */ }
          }, 420)
        );
      }

      setLevel(preset === "rain" ? 0.7 : preset === "engine" ? 0.5 : 0.85);
      nodesRef.current = {
        stop: () => {
          timers.forEach((t) => clearInterval(t));
          try {
            master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
            setTimeout(() => void ctx.close().catch(() => undefined), 600);
          } catch { /* ignore */ }
        },
      };
      return () => {
        nodesRef.current?.stop();
        nodesRef.current = null;
      };
    } catch {
      setLevel(0);
    }
  }, [preset]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between font-mono text-[11px] text-cyan-300/80">
        <span className="inline-flex items-center gap-1.5">
          <Waves size={12} className="text-cyan-300" /> {preset.toUpperCase()}
        </span>
        <span className="text-[9px] tracking-[0.2em] text-cyan-500/70">
          {preset === "off" ? "SILENT" : "GENERATING · WEB AUDIO"}
        </span>
      </div>
      {/* live waveform bars */}
      <div className="flex h-10 items-end justify-center gap-1" aria-hidden>
        {[...Array(16)].map((_, i) => (
          <div
            key={i}
            className="w-1.5 rounded-sm bg-cyan-400/50 transition-all duration-300"
            style={{
              height: preset === "off" ? 3 : `${8 + Math.abs(Math.sin(i * 1.7 + level * 9)) * level * 30}px`,
              animation: preset === "off" ? undefined : `pulse-ring 1.6s ease-in-out ${i * 0.08}s infinite`,
            }}
          />
        ))}
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPreset(p.id)}
            className={`rounded-md border px-1 py-1.5 font-mono text-[9px] tracking-wider transition ${
              preset === p.id
                ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100"
                : "border-cyan-400/15 text-cyan-300/60 hover:bg-cyan-400/5"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <p className="flex items-center gap-1.5 border-t border-cyan-400/15 pt-2 font-mono text-[10px] text-cyan-500/60">
        <Power size={10} /> synthesized live — zero assets, works offline
      </p>
    </div>
  );
}
