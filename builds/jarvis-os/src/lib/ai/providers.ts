/**
 * Dual-engine AI layer for the Jarvis terminal — streaming edition.
 *
 *   CLOUD   — OpenRouter API (operator's key, stored in localStorage) [premium]
 *   FREE    — Pollinations text API: keyless, no account, generous limits [default]
 *   GROQ    — Groq free tier (operator's free key, blazing fast) [backup]
 *   OFFLINE — @mlc-ai/web-llm on WebGPU (keyless, model cached in browser) [unlimited]
 *
 * Every engine streams token deltas through onDelta callbacks so the UI can
 * render the answer live, GPT/Gemini-style. `generateAnswer` keeps the old
 * non-streaming signature for compatibility.
 *
 * TTS: speak()/stopSpeaking() use the Web Speech API — the assistant talks
 * back, and speakStream can be fed sentence-by-sentence during streaming.
 */

// ── Shared types ─────────────────────────────────────────────────────────────

export interface ChatTurn {
  role: "system" | "user" | "assistant";
  content: string;
  /** Vision support: data-URLs or https URLs attached to this turn. */
  images?: string[];
}

export interface StreamHandlers {
  onDelta: (fullText: string) => void;
  signal?: AbortSignal;
}

export interface Answer {
  text: string;
  engine: "openrouter" | "puter" | "pollinations" | "groq" | "webllm";
  model: string;
}

// ── Engine priority (operator-selectable) ───────────────────────────────────

const ENGINE_PREF_STORE = "jarvis.enginePref";
export type EnginePref = "auto" | "puter" | "openrouter" | "pollinations" | "groq" | "webllm";

export function getEnginePreference(): EnginePref {
  if (typeof window === "undefined") return "auto";
  return (localStorage.getItem(ENGINE_PREF_STORE) as EnginePref) || "auto";
}

export function setEnginePreference(pref: EnginePref): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ENGINE_PREF_STORE, pref);
}

// ── Backup: Groq free tier (closes the no-WebGPU device gap) ─────────────────

const GROQ_KEY_STORE = "jarvis.groqKey";
const DEFAULT_GROQ_MODEL = "llama-3.1-8b-instant";

export function getGroqKey(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(GROQ_KEY_STORE);
}

export function setGroqKey(key: string | null): void {
  if (typeof window === "undefined") return;
  if (key) localStorage.setItem(GROQ_KEY_STORE, key);
  else localStorage.removeItem(GROQ_KEY_STORE);
}

async function groqStream(messages: ChatTurn[], { onDelta, signal }: StreamHandlers): Promise<string> {
  const key = getGroqKey()!;
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    signal,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: DEFAULT_GROQ_MODEL,
      messages,
      temperature: 0.6,
      max_tokens: 2048,
      stream: true,
    }),
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(`groq ${res.status}: ${body.slice(0, 160)}`);
  }
  return consumeSse(res.body, (payload) => {
    const content = payload?.choices?.[0]?.delta?.content;
    return typeof content === "string" ? content : "";
  }, onDelta);
}

// ── Puter.js: keyless premium gateway (500+ models, user-pays) ──────────────

export const PUTER_MODEL_STORE = "jarvis.puterModel";
export const DEFAULT_PUTER_MODEL = "gpt-5-nano";

export function getPuterModel(): string {
  if (typeof window === "undefined") return DEFAULT_PUTER_MODEL;
  return localStorage.getItem(PUTER_MODEL_STORE) || DEFAULT_PUTER_MODEL;
}

export function setPuterModel(model: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PUTER_MODEL_STORE, model);
}

export function puterAvailable(): boolean {
  return typeof window !== "undefined" && !!(window as { puter?: unknown }).puter;
}

/** Normalize any Puter chat result/stream part into plain text. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function puterPartText(part: any): string {
  if (!part) return "";
  if (typeof part === "string") return part;
  if (typeof part.text === "string") return part.text;
  const c = part.message?.content ?? part.delta?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c.map((b: { text?: unknown }) => (typeof b?.text === "string" ? b.text : "")).join("");
  }
  return "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function puterSdk(): any | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = (window as any).puter;
  return p?.ai?.chat ? p : null;
}

async function puterStream(messages: ChatTurn[], { onDelta, signal }: StreamHandlers): Promise<string> {
  const puter = puterSdk();
  if (!puter) throw new Error("puter.js not loaded (offline or script blocked)");
  const model = getPuterModel();
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const images = lastUser?.images ?? [];
  const opts = { model, stream: true, temperature: 0.6, max_tokens: 2048 };
  let full = "";
  if (images.length) {
    // Vision: prompt + media array (https URLs or data URLs).
    const stream = await puter.ai.chat(lastUser!.content, images, false, opts);
    for await (const part of stream) {
      if (signal?.aborted) break;
      const piece = puterPartText(part);
      if (piece) {
        full += piece;
        onDelta(full);
      }
    }
  } else {
    const stream = await puter.ai.chat(messages, false, opts);
    for await (const part of stream) {
      if (signal?.aborted) break;
      const piece = puterPartText(part);
      if (piece) {
        full += piece;
        onDelta(full);
      }
    }
  }
  if (!full.trim()) throw new Error("puter: empty completion");
  return full;
}

async function puterChat(messages: ChatTurn[]): Promise<string> {
  const puter = puterSdk();
  if (!puter) throw new Error("puter.js not loaded");
  const res = await puter.ai.chat(messages, false, {
    model: getPuterModel(),
    temperature: 0.6,
    max_tokens: 2048,
  });
  const text = puterPartText(res);
  if (!text) throw new Error("puter: empty completion");
  return text;
}

/**
 * Text→image via Puter (keyless). Resolves to a URL usable in <img src>.
 * The SDK may return a URL string, an <img> element, or an object with .src.
 */
export async function generateImage(prompt: string): Promise<string> {
  const puter = puterSdk();
  if (!puter?.ai?.txt2img) throw new Error("image engine unavailable (puter.js not loaded)");
  const out = await puter.ai.txt2img(prompt);
  if (typeof out === "string") return out;
  if (out?.src) return String(out.src);
  if (typeof HTMLImageElement !== "undefined" && out instanceof HTMLImageElement) return out.src;
  throw new Error("txt2img returned no image");
}

// ── Cloud: OpenRouter (premium, optional) ────────────────────────────────────

export const OPENROUTER_KEY_STORE = "jarvis.openrouterKey";
export const OPENROUTER_MODEL_STORE = "jarvis.openrouterModel";
export const DEFAULT_OPENROUTER_MODEL = "meta-llama/llama-3.2-3b-instruct:free";

export function getOpenRouterKey(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(OPENROUTER_KEY_STORE);
}

export function setOpenRouterKey(key: string | null): void {
  if (typeof window === "undefined") return;
  if (key) localStorage.setItem(OPENROUTER_KEY_STORE, key);
  else localStorage.removeItem(OPENROUTER_KEY_STORE);
}

export function getOpenRouterModel(): string {
  if (typeof window === "undefined") return DEFAULT_OPENROUTER_MODEL;
  return localStorage.getItem(OPENROUTER_MODEL_STORE) || DEFAULT_OPENROUTER_MODEL;
}

export function setOpenRouterModel(model: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(OPENROUTER_MODEL_STORE, model);
}

const OPENROUTER_ATTR_HEADERS = {
  "HTTP-Referer": typeof window !== "undefined" ? window.location.origin : "https://jarvis.local",
  "X-Title": "JARVIS OS",
};

async function openRouterStream(
  key: string,
  model: string,
  messages: ChatTurn[],
  { onDelta, signal }: StreamHandlers
): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...OPENROUTER_ATTR_HEADERS,
    },
    body: JSON.stringify({
      model,
      // Vision: user turns carrying images become OpenAI-style content arrays.
      messages: messages.map((m) => {
        if (m.role !== "user" || !m.images?.length) return m;
        return {
          role: m.role,
          content: [
            { type: "text", text: m.content },
            ...m.images.map((url) => ({ type: "image_url", image_url: { url } })),
          ],
        };
      }),
      temperature: 0.6,
      max_tokens: 2048,
      stream: true,
    }),
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(`openrouter ${res.status}: ${body.slice(0, 160)}`);
  }
  return consumeSse(res.body, (payload) => {
    const content = payload?.choices?.[0]?.delta?.content;
    return typeof content === "string" ? content : "";
  }, onDelta);
}

async function openRouterChat(key: string, model: string, messages: ChatTurn[]): Promise<{ text: string; model: string }> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...OPENROUTER_ATTR_HEADERS },
    body: JSON.stringify({ model, messages, temperature: 0.6, max_tokens: 2048 }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`openrouter ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const text: string | undefined = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("openrouter: empty completion");
  return { text, model: data?.model ?? model };
}

// ── Free tier: Pollinations (keyless, no signup) ─────────────────────────────

const POLLINATIONS_MODEL = "openai"; // fast generic model on the free endpoint

/**
 * Streams from the keyless Pollinations text endpoint. POST with stream:true
 * returns an SSE body identical in shape to OpenAI's chat completions.
 */
async function pollinationsStream(messages: ChatTurn[], { onDelta, signal }: StreamHandlers): Promise<string> {
  // Same-origin proxy first (immune to COEP/CORS/UA policies); direct call as
  // fallback so offline-PWA/desktop wrappers without the server keep trying.
  let res = await fetch("/api/ai/chat", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: POLLINATIONS_MODEL,
      messages,
      temperature: 0.6,
      max_tokens: 2048,
      stream: true,
    }),
  });
  if (!res.ok || !res.body) {
    res = await fetch("https://text.pollinations.ai/openai", {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: POLLINATIONS_MODEL,
        messages,
        temperature: 0.6,
        max_tokens: 2048,
        stream: true,
        referrer: "jarvis-os",
      }),
    });
  }
  if (!res.ok || !res.body) throw new Error(`pollinations ${res.status}`);
  return consumeSse(res.body, (payload) => {
    const content = payload?.choices?.[0]?.delta?.content;
    return typeof content === "string" ? content : "";
  }, onDelta);
}

async function pollinationsChat(messages: ChatTurn[]): Promise<string> {
  // Same-origin proxy first; direct fallback (see pollinationsStream).
  let res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: POLLINATIONS_MODEL, messages }),
  });
  if (!res.ok) {
    res = await fetch("https://text.pollinations.ai/openai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: POLLINATIONS_MODEL, messages, referrer: "jarvis-os" }),
    });
  }
  if (!res.ok) throw new Error(`pollinations ${res.status}`);
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text === "string" && text) return text;
  }
  const text = await res.text();
  if (!text) throw new Error("pollinations: empty completion");
  return text;
}

// ── SSE plumbing ─────────────────────────────────────────────────────────────

async function consumeSse(
  body: ReadableStream<Uint8Array>,
  extract: (payload: any) => string,
  onDelta: (fullText: string) => void
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const payload = JSON.parse(data);
        const piece = extract(payload);
        if (piece) {
          full += piece;
          onDelta(full);
        }
      } catch {
        /* keep-alive comments etc. */
      }
    }
  }
  if (!full) throw new Error("stream produced no content");
  return full;
}

// ── Offline: WebLLM (WebGPU — truly unlimited) ───────────────────────────────

export const WEBLLM_MODEL_STORE = "jarvis.webllmModel";
export const DEFAULT_WEBLLM_MODEL = "Llama-3.2-1B-Instruct-q4f16_1-MLC";

export function getWebLlmModel(): string {
  if (typeof window === "undefined") return DEFAULT_WEBLLM_MODEL;
  return localStorage.getItem(WEBLLM_MODEL_STORE) || DEFAULT_WEBLLM_MODEL;
}

export function setWebLlmModel(model: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(WEBLLM_MODEL_STORE, model);
}

export type WebLlmStatus =
  | { state: "idle" }
  | { state: "loading"; progress: number; text: string }
  | { state: "ready"; model: string }
  | { state: "error"; message: string };

type WebLlmEngine = {
  chat: {
    completions: {
      create: (opts: {
        messages: ChatTurn[];
        temperature?: number;
        max_tokens?: number;
        stream?: boolean;
      }) => Promise<any>;
    };
  };
  interruptGenerate?: () => void;
};

let webLlmEngine: WebLlmEngine | null = null;
let webLlmEngineModel: string | null = null;

export function webLlmSupported(): boolean {
  return typeof window !== "undefined" && "gpu" in navigator;
}

/** Load (or reuse) the offline engine; reports download/compile progress. */
export async function loadWebLlm(
  onProgress?: (s: WebLlmStatus) => void,
  modelId?: string
): Promise<WebLlmEngine> {
  const model = modelId || getWebLlmModel();
  if (webLlmEngine && webLlmEngineModel === model) {
    onProgress?.({ state: "ready", model });
    return webLlmEngine;
  }
  onProgress?.({ state: "loading", progress: 0, text: "initializing webgpu runtime" });
  const { CreateMLCEngine } = await import("@mlc-ai/web-llm");
  webLlmEngine = (await CreateMLCEngine(model, {
    initProgressCallback: (p: { progress: number; text: string }) =>
      onProgress?.({ state: "loading", progress: p.progress, text: p.text }),
  })) as unknown as WebLlmEngine;
  webLlmEngineModel = model;
  onProgress?.({ state: "ready", model });
  return webLlmEngine;
}

async function webLlmStream(messages: ChatTurn[], { onDelta, signal }: StreamHandlers): Promise<string> {
  if (!webLlmEngine) throw new Error("webllm engine not loaded");
  const chunks = await webLlmEngine.chat.completions.create({
    messages,
    temperature: 0.6,
    max_tokens: 2048,
    stream: true,
  });
  let full = "";
  for await (const chunk of chunks) {
    if (signal?.aborted) {
      webLlmEngine.interruptGenerate?.();
      break;
    }
    const piece = chunk?.choices?.[0]?.delta?.content ?? "";
    if (piece) {
      full += piece;
      onDelta(full);
    }
  }
  if (!full) throw new Error("webllm: empty completion");
  return full;
}

/** Abort control for the active generation (stop button). */
let activeAbort: AbortController | null = null;
export function stopGeneration(): void {
  activeAbort?.abort();
  activeAbort = null;
  stopSpeaking();
}

// ── Unified entry points ─────────────────────────────────────────────────────

function tierOrder(): Array<"cloud" | "puter" | "free" | "groq" | "offline"> {
  const tiers: Array<"cloud" | "puter" | "free" | "groq" | "offline"> = [];
  if (getOpenRouterKey()) tiers.push("cloud"); // operator's premium key first when present
  tiers.push("puter"); // keyless premium gateway — 500+ models, user-pays
  tiers.push("free");
  if (getGroqKey()) tiers.push("groq"); // backup before offline (free key beats local download)
  tiers.push("offline");
  // Operator-selected priority: float the preferred engine to the front.
  const pref = getEnginePreference();
  const alias = pref === "openrouter" ? "cloud" : pref === "pollinations" ? "free" : pref;
  if (alias !== "auto") {
    const i = tiers.indexOf(alias as (typeof tiers)[number]);
    if (i > 0) tiers.unshift(...tiers.splice(i, 1));
  }
  return tiers;
}

/**
 * STREAMING answer with graceful tier fallback:
 * cloud key (optional) → keyless free API → offline WebGPU.
 * onDelta receives the accumulated text on every token.
 */
export async function generateAnswerStream(
  messages: ChatTurn[],
  { onDelta, signal }: StreamHandlers
): Promise<Answer> {
  const abort = new AbortController();
  activeAbort = abort;
  // Link external signal (stop button) with our own.
  signal?.addEventListener("abort", () => abort.abort(), { once: true });

  // Persona: merge user personality directives into the leading system prompt
  // so every engine tier (cloud/free/groq/webllm) answers in the same voice.
  try {
    const { systemPromptFor } = await import("@/lib/ai/persona");
    const firstSystem = messages.findIndex((m) => m.role === "system");
    if (firstSystem !== -1) {
      messages = [
        ...messages.slice(0, firstSystem),
        { ...messages[firstSystem], content: systemPromptFor(messages[firstSystem].content) },
        ...messages.slice(firstSystem + 1),
      ];
    }
  } catch {
    /* persona is enhancement-only */
  }

  const pipe = (onDeltaLocal: (full: string) => void): StreamHandlers => ({
    onDelta: onDeltaLocal,
    signal: abort.signal,
  });

  for (const tier of tierOrder()) {
    try {
      if (tier === "cloud") {
        const key = getOpenRouterKey()!;
        const model = getOpenRouterModel();
        const text = await openRouterStream(key, model, messages, pipe(onDelta));
        return { text, engine: "openrouter", model };
      }
      if (tier === "puter") {
        const text = await puterStream(messages, pipe(onDelta));
        return { text, engine: "puter", model: getPuterModel() };
      }
      if (tier === "free") {
        const text = await pollinationsStream(messages, pipe(onDelta));
        return { text, engine: "pollinations", model: POLLINATIONS_MODEL };
      }
      if (tier === "groq") {
        const text = await groqStream(messages, pipe(onDelta));
        return { text, engine: "groq", model: DEFAULT_GROQ_MODEL };
      }
      if (webLlmSupported()) {
        await loadWebLlm();
        const text = await webLlmStream(messages, pipe(onDelta));
        return { text, engine: "webllm", model: webLlmEngineModel ?? "webllm" };
      }
    } catch (e) {
      if (abort.signal.aborted) throw new Error("generation stopped");
      /* fall through to next tier */
    }
  }
  throw new Error("all AI engines unavailable (cloud failed, free API unreachable, no WebGPU)");
}

/**
 * Small non-streaming completion for internal helpers (skill planner).
 * Uses the free keyless tier first; falls back to OpenRouter if present.
 */
export async function quickCompletion(messages: ChatTurn[]): Promise<string> {
  try {
    if (puterAvailable()) return await puterChat(messages);
  } catch {
    /* fall through */
  }
  try {
    return await pollinationsChat(messages);
  } catch {
    const key = getOpenRouterKey();
    if (key) {
      const r = await openRouterChat(key, getOpenRouterModel(), messages);
      return r.text;
    }
    throw new Error("no model available for planning");
  }
}

/** Compatibility wrapper — full answer without streaming. */
export async function generateAnswer(messages: ChatTurn[]): Promise<Answer> {
  return generateAnswerStream(messages, { onDelta: () => {} });
}

export { openRouterChat };

// ── Voice output (TTS) — Siri/Gemini-style speech-back ────────────────────────── 

let activeSettle: (() => void) | null = null;
// Bumped by stopSpeaking() so the completion chime only fires on NATURAL
// completion, never when the user cancels mid-sentence.
let speechCancelTick = 0;

export function ttsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * Speak a text block; replaces anything currently being spoken.
 *
 * Long answers are chunked at sentence boundaries (~180 chars) — Chrome
 * truncates single very long utterances. onEnd fires exactly once when the
 * whole block has been spoken OR when stopSpeaking() cancels it, so voice
 * conversation loops never hang on a cancelled utterance.
 */
export async function speak(text: string, onEnd?: () => void): Promise<void> {
  if (!ttsSupported() || !text.trim()) {
    onEnd?.();
    return;
  }
  stopSpeaking();

  const voices = window.speechSynthesis.getVoices();
  const voice = voices.find((v) => /en(-|_)(GB|US)/i.test(v.lang)) ?? voices[0] ?? null;

  const sentences = text.replace(/\s+/g, " ").match(/[^.!?]+[.!?]*\s*/g) ?? [text];
  const chunks: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if ((buf + s).length > 180) {
      if (buf.trim()) chunks.push(buf.trim());
      buf = s;
    } else {
      buf += s;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  if (!chunks.length) {
    onEnd?.();
    return;
  }

  // Voice character follows the user's persona (rate/pitch), with safe defaults.
  let rate = 1.04;
  let pitch = 1;
  try {
    const { getPersona } = await import("@/lib/ai/persona");
    const persona = getPersona();
    rate = persona.rate;
    pitch = persona.pitch;
  } catch {
    /* persona unavailable — defaults */
  }

  let done = 0;
  let settled = false;
  const myTick = speechCancelTick;
  const settle = () => {
    if (settled) return;
    settled = true;
    if (activeSettle === settle) activeSettle = null;
    onEnd?.();
  };
  activeSettle = settle;

  for (const piece of chunks) {
    const u = new SpeechSynthesisUtterance(piece);
    u.rate = rate;
    u.pitch = pitch;
    u.voice = voice;
    u.onend = () => {
      if (++done >= chunks.length) {
        // Subtle "answer complete" cue — only when not cancelled.
        if (myTick === speechCancelTick) {
          try {
            // Lazily imported to avoid a hard dependency cycle at module init.
            import("@/lib/os/sounds").then((m) => m.answerDone()).catch(() => undefined);
          } catch {
            /* polish only */
          }
        }
        settle();
      }
    };
    u.onerror = () => {
      if (++done >= chunks.length) settle();
    };
    window.speechSynthesis.speak(u);
  }
}

export function stopSpeaking(): void {
  const cb = activeSettle;
  activeSettle = null;
  speechCancelTick += 1;
  if (ttsSupported()) window.speechSynthesis.cancel();
  // Resolve any awaiter of a cancelled speak() so voice loops never deadlock.
  cb?.();
}

/**
 * Feed streaming output here — speaks sentence-by-sentence so the assistant
 * starts talking before the full answer exists (Gemini Live-style).
 */
export function speakStream(fullTextSoFar: string, state: { spokenUpTo: number }): void {
  if (!ttsSupported()) return;
  const pending = fullTextSoFar.slice(state.spokenUpTo);
  // Split on sentence enders; keep the tail (incomplete sentence) unspoken.
  const m = pending.match(/^[\s\S]*?[.!?](\s|$)/);
  if (!m) return;
  const sentence = m[0];
  state.spokenUpTo += sentence.length;
  const trimmed = sentence.trim();
  if (trimmed.length > 1) {
    const u = new SpeechSynthesisUtterance(trimmed);
    u.rate = 1.04;
    window.speechSynthesis.speak(u);
  }
}
