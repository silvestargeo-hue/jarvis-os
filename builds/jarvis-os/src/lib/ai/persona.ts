/**
 * AI Persona — per-user personality for JARVIS.
 *
 * Controls the assistant's name, answer style/length, and the TTS voice
 * rate/pitch. Persisted per device in localStorage. The persona is injected
 * into every cloud/groq/webllm system prompt by providers.generateAnswerStream.
 */

export type PersonaStyle = "concise" | "friendly" | "detailed" | "witty";
export type PersonaLength = "brief" | "balanced" | "in-depth";

export interface Persona {
  name: string;
  style: PersonaStyle;
  length: PersonaLength;
  /** Speech rate (0.5–2, Web Speech API). */
  rate: number;
  /** Voice pitch (0–2, Web Speech API). */
  pitch: number;
}

export const DEFAULT_PERSONA: Persona = {
  name: "JARVIS",
  style: "concise",
  length: "balanced",
  rate: 1.04,
  pitch: 1,
};

const STORE = "jarvis.persona";

const STYLE_DIRECTIVE: Record<PersonaStyle, string> = {
  concise: "Be precise and to the point — no filler, no small talk.",
  friendly: "Be warm and personable, like a trusted colleague.",
  detailed: "Be thorough: explain reasoning, include examples and edge cases.",
  witty: "Be sharp and playful — dry humor is welcome, accuracy still first.",
};

const LENGTH_DIRECTIVE: Record<PersonaLength, string> = {
  brief: "Keep answers under ~120 words unless the user asks for more.",
  balanced: "Aim for a focused answer of a few short paragraphs.",
  "in-depth": "Give complete, well-structured answers with headings and lists where useful.",
};

export function getPersona(): Persona {
  if (typeof window === "undefined") return DEFAULT_PERSONA;
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return DEFAULT_PERSONA;
    const p = JSON.parse(raw) as Partial<Persona>;
    return {
      name: (p.name || DEFAULT_PERSONA.name).trim().slice(0, 24) || DEFAULT_PERSONA.name,
      style: p.style ?? DEFAULT_PERSONA.style,
      length: p.length ?? DEFAULT_PERSONA.length,
      rate: clamp(Number(p.rate ?? DEFAULT_PERSONA.rate), 0.5, 2),
      pitch: clamp(Number(p.pitch ?? DEFAULT_PERSONA.pitch), 0, 2),
    };
  } catch {
    return DEFAULT_PERSONA;
  }
}

export function setPersona(p: Persona): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(p));
  } catch {
    /* private mode */
  }
}

/**
 * Merge persona directives into a system prompt. The persona line is appended
 * (never replaces) so RAG/tool instructions stay intact.
 */
export function systemPromptFor(base: string): string {
  const p = getPersona();
  const name = p.name.toUpperCase();
  return [
    base,
    `PERSONA: answer as "${name}" — ${STYLE_DIRECTIVE[p.style]} ${LENGTH_DIRECTIVE[p.length]}`,
  ].join("\n");
}

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}
