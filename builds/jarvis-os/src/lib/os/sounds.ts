/**
 * WebAudio interface sounds — tiny synthesized blips, zero assets, no network.
 * All calls are fail-silent: audio is pure polish, never a blocker.
 */

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  try {
    if (typeof window === "undefined") return null;
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function soundEnabled(): boolean {
  try {
    return typeof window !== "undefined" && localStorage.getItem("jarvis.sounds") !== "0";
  } catch {
    return true;
  }
}

export function setSoundsEnabled(on: boolean): void {
  try {
    localStorage.setItem("jarvis.sounds", on ? "1" : "0");
  } catch {
    /* private mode */
  }
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, when = 0, slideTo?: number): void {
  const c = ac();
  if (!c || !soundEnabled()) return;
  try {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    const t0 = c.currentTime + when;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch {
    /* never block on audio */
  }
}

/** Tiny UI tick — keystrokes, hovers on command palette. */
export const blip = () => tone(1240, 0.05, "sine", 0.03);
/** Success chirp — messages sent, exports done. */
export const confirm = () => {
  tone(660, 0.09, "sine", 0.05);
  tone(990, 0.12, "sine", 0.05, 0.08);
};
/** Soft error buzz. */
export const error = () => tone(180, 0.18, "sawtooth", 0.04, 0, 120);
/** Two-tone boot chime (used by BootSequence's final line). */
export const boot = () => {
  tone(392, 0.16, "sine", 0.05);
  tone(587, 0.22, "sine", 0.05, 0.14);
  tone(784, 0.3, "sine", 0.04, 0.3);
};
/** Gentle descending-then-up cue: JARVIS finished speaking — your turn. */
export const answerDone = () => {
  tone(520, 0.1, "sine", 0.025);
  tone(780, 0.16, "sine", 0.02, 0.1);
};
