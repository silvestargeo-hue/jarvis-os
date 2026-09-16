"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUp,
  Check,
  Cloud,
  Copy,
  Cpu,
  Download,
  FileDown,
  Image as ImageIcon,
  Loader2,
  Mic,
  MicOff,
  Paperclip,
  Radio,
  Search,
  Settings2,
  Square,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { appendAiMessage } from "@/lib/sync/queue";
import { retrieveContext, type RagHit } from "@/lib/rag/retrieve";
import {
  DEFAULT_WEBLLM_MODEL,
  generateAnswerStream,
  generateImage,
  getEnginePreference,
  getGroqKey,
  getPuterModel,
  getOpenRouterKey,
  getOpenRouterModel,
  getWebLlmModel,
  loadWebLlm,
  setEnginePreference,
  setGroqKey,
  setOpenRouterKey,
  setOpenRouterModel,
  setPuterModel,
  setWebLlmModel,
  type EnginePref,
  speak,
  stopGeneration,
  stopSpeaking,
  ttsSupported,
  webLlmSupported,
  type ChatTurn,
  type WebLlmStatus,
} from "@/lib/ai/providers";
import { EXPORT_FORMATS, exportDocument, type ExportFormat } from "@/lib/docs/exporters";
import { setVoiceCommandsPaused } from "@/lib/voice/commands";
import { runSkillsForMessage, type SkillRun } from "@/lib/skills/runner";
import { titleFromExchange } from "@/lib/ai/title";
import { quickCompletion } from "@/lib/ai/providers";
import { blip } from "@/lib/os/sounds";

interface UiMsg {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  engine?: string;
  latencyMs?: number;
  citations?: Array<{ documentId: string; ordinal: number; score: number; tags?: string[] }>;
}

function uuid(): string {
  const c = crypto as { randomUUID?: () => string; getRandomValues: (a: Uint8Array) => Uint8Array };
  if (typeof c.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const ENGINE_LABEL: Record<string, string> = {
  openrouter: "☁ CLOUD+",
  puter: "◆ PUTER PREMIUM",
  pollinations: "☁ FREE CLOUD",
  groq: "⚡ GROQ BACKUP",
  webllm: "◈ OFFLINE",
};

/**
 * Live conversation recognition — the Gemini Live-style loop:
 * continuous listening with silence-based turn detection. Each finalized
 * utterance is handed to onUtterance; the caller drives the conversation.
 */
function useLiveRecognition(active: boolean, onUtterance: (text: string) => void) {
  const [level, setLevel] = useState(0); // fake VU 0..1 for the HUD
  const [supported, setSupported] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef = useRef<any>(null);
  const onUtteranceRef = useRef(onUtterance);
  onUtteranceRef.current = onUtterance;
  const bufferRef = useRef("");

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    const Ctor = (w.SpeechRecognition || w.webkitSpeechRecognition) as (new () => any) | undefined;
    setSupported(Boolean(Ctor));
    if (!Ctor) return;

    if (!active) {
      try {
        recRef.current?.stop?.();
      } catch { /* not started */ }
      recRef.current = null;
      setLevel(0);
      return;
    }

    let killed = false;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;

    const spawn = () => {
      if (killed) return;
      const rec = new Ctor();
      rec.lang = "en-US";
      rec.continuous = true;
      rec.interimResults = true;

      rec.onresult = (e: any) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) {
            bufferRef.current += r[0].transcript + " ";
          } else {
            interim += r[0].transcript;
          }
        }
        const finals = bufferRef.current.trim();
        // Emit whenever we have a complete finalized clause.
        if (finals && /[.?!]$|\b(jarvis|please|thanks)\b/i.test(finals) === false && finals.split(/\s+/).length >= 1) {
          // sentence-ish: emit on final result regardless (turn detection)
        }
        if (finals) {
          bufferRef.current = "";
          const text = finals.trim();
          if (text.length > 1) onUtteranceRef.current(text);
        } else if (interim) {
          setLevel(Math.min(1, interim.length / 40));
        }
      };

      rec.onend = () => {
        setLevel(0);
        if (killed) return;
        restartTimer = setTimeout(() => {
          try { rec.start(); } catch { /* race */ }
        }, 400);
      };

      rec.onerror = (e: any) => {
        if (e?.error === "not-allowed" || e?.error === "service-not-allowed") killed = true;
      };

      try { rec.start(); } catch { /* race — onend retries */ }
      recRef.current = rec;
    };

    spawn();
    return () => {
      killed = true;
      if (restartTimer) clearTimeout(restartTimer);
      try { recRef.current?.stop?.(); } catch { /* already stopped */ }
      recRef.current = null;
      setLevel(0);
    };
  }, [active]);

  return { supported, level };
}

export function AiTerminal() {
  // ── session bootstrap ────────────────────────────────────────────────────
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  // Read the token and decide about redirecting in ONE effect — two effects
  // raced here: the redirect ran on first mount while state was still null,
  // bouncing signed-in users to /auth before localStorage was ever read.
  useEffect(() => {
    const t = localStorage.getItem("jarvis.sessionToken");
    setSessionToken(t);
    if (!t) window.location.href = "/auth";
  }, []);

  const sessions = useQuery(
    api.aiSessions.list,
    sessionToken ? ({ sessionToken } as never) : "skip"
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  useEffect(() => {
    if (!activeId && sessions && sessions.length > 0) setActiveId(sessions[0]._id as string);
  }, [sessions, activeId]);

  const activeSession = useMemo(
    () => sessions?.find((s) => s._id === activeId) ?? null,
    [sessions, activeId]
  );

  const transcript = useQuery(
    api.aiMessages.list,
    sessionToken && activeId ? ({ sessionToken, sessionId: activeId } as never) : "skip"
  );

  const createSession = useMutation(api.aiSessions.create);
  const updateSession = useMutation(api.aiSessions.update);
  const appendRemote = useMutation(api.aiMessages.append);

  // ── engines & settings ───────────────────────────────────────────────────
  const [settingsOpen, setSettingsOpen] = useState(false);
  const hasCloudKey = useMemo(() => Boolean(getOpenRouterKey()), [settingsOpen]);
  const [keyInput, setKeyInput] = useState("");
  const [modelInput, setModelInput] = useState("");
  const [groqInput, setGroqInput] = useState("");
  const [offlineStatus, setOfflineStatus] = useState<WebLlmStatus>({ state: "idle" });
  const [ragEnabled, setRagEnabled] = useState(true);
  const [voiceOut, setVoiceOut] = useState<boolean>(false);
  // ── SURPRISE PACK states ────────────────────────────────────────────────
  const [enginePref, setEnginePref] = useState<EnginePref>("auto");
  const [puterModelInput, setPuterModelInput] = useState("");
  const [sessionQuery, setSessionQuery] = useState("");
  const [attachImage, setAttachImage] = useState<string | null>(null); // data URL
  const [imgBusy, setImgBusy] = useState(false);

  useEffect(() => {
    setModelInput(getOpenRouterModel());
    setPuterModelInput(getPuterModel());
    setEnginePref(getEnginePreference());
    setVoiceOut(localStorage.getItem("jarvis.voiceOut") === "1");
    if (!webLlmSupported()) {
      setOfflineStatus({ state: "error", message: "WebGPU unavailable on this device" });
    }
  }, []);

  const toggleVoiceOut = useCallback(() => {
    setVoiceOut((v) => {
      const next = !v;
      localStorage.setItem("jarvis.voiceOut", next ? "1" : "0");
      if (!next) stopSpeaking();
      return next;
    });
  }, []);

  // ── composer + streaming state ───────────────────────────────────────────
  const [draft, setDraft] = useState("");
  const [streamText, setStreamText] = useState<string | null>(null);
  const [engineNote, setEngineNote] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const streaming = streamText !== null;

  // ── LIVE CONVERSATION MODE (Gemini Live-style) ──────────────────────────
  // One toggle: mic stays open, JARVIS speaks answers, listens again when
  // done speaking — full duplex voice interaction until stopped.
  const [liveMode, setLiveMode] = useState(false);
  const liveModeRef = useRef(liveMode);
  liveModeRef.current = liveMode;
  const busyRef = useRef(false); // true while generating or speaking
  const [liveStatus, setLiveStatus] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");

  // ── actions ──────────────────────────────────────────────────────────────
  const newSession = useCallback(async () => {
    if (!sessionToken) return;
    const res = (await createSession({
      sessionToken,
      clientSessionId: uuid(),
      title: "New session",
      mode: "cloud",
    } as never)) as { aiSessionId: string };
    setActiveId(res.aiSessionId);
  }, [sessionToken, createSession]);

  /** Create a session on demand (used by /image and first-run sends). */
  const ensureSession = useCallback(async (): Promise<string | null> => {
    if (activeId) return activeId;
    if (!sessionToken) return null;
    try {
      const res = (await createSession({
        sessionToken,
        clientSessionId: uuid(),
        title: "New session",
        mode: "cloud",
      } as never)) as { aiSessionId: string };
      setActiveId(res.aiSessionId);
      return res.aiSessionId;
    } catch {
      return null;
    }
  }, [activeId, sessionToken, createSession]);

  const send = useCallback(
    async (rawQuestion: string, opts?: { fromVoice?: boolean }) => {
      const question = rawQuestion.trim();
      if (!question || busyRef.current || !sessionToken) return;

      // ── /image COMMAND — keyless AI image generation (Puter txt2img) ──
      if (question.toLowerCase().startsWith("/image ")) {
        const prompt = question.slice(7).trim();
        if (!prompt) return;
        setDraft("");
        setImgBusy(true);
        setEngineNote("🎨 painting your imagination…");
        try {
          const url = await generateImage(prompt);
          const content = `🎨 **Generated image**\n\nPrompt: "${prompt}"\n\n![${prompt}](${url})\n\n[open full size](${url})`;
          const imgSessionId = activeId ?? (await ensureSession());
          if (!imgSessionId) {
            setEngineNote("✗ backend unreachable — image not saved");
            setImgBusy(false);
            return;
          }
          await appendAiMessage({
            sessionToken,
            sessionId: imgSessionId,
            role: "assistant",
            content,
            engine: "puter",
            clientMsgId: uuid(),
          });
          setEngineNote("🎨 image ready — click to open full size");
        } catch (e) {
          setEngineNote(`✗ image: ${e instanceof Error ? e.message : "failed"}`);
        } finally {
          setImgBusy(false);
        }
        return;
      }

      busyRef.current = true;
      if (liveModeRef.current) setLiveStatus("thinking");
      setDraft("");
      setStreamText("");
      setEngineNote(null);
      const started = Date.now();

      // First-run UX: a fresh operator has no session yet — create one on the
      // fly instead of silently swallowing the message (old behavior).
      let targetId = activeId;
      try {
        if (!targetId) {
          const res = (await createSession({
            sessionToken,
            clientSessionId: uuid(),
            title: "New session",
            mode: "cloud",
          } as never)) as { aiSessionId: string };
          targetId = res.aiSessionId;
          setActiveId(targetId);
        }
      } catch {
        busyRef.current = false;
        setStreamText(null);
        setEngineNote("✗ backend unreachable — session not created");
        return;
      }

      await appendAiMessage({
        sessionToken,
        sessionId: targetId,
        role: "user",
        content: question,
        clientMsgId: uuid(),
      });

      // 1. RAG grounding
      let contextBlock = "";
      let hits: RagHit[] = [];
      if (ragEnabled) {
        const rag = await retrieveContext(sessionToken, question, 6);
        contextBlock = rag.contextBlock;
        hits = rag.hits;
      }

      // 1b. SKILLS — auto-detect + execute tools for this request
      let skillRuns: SkillRun[] = [];
      try {
        const skillPass = await runSkillsForMessage(question, (msgs) => quickCompletion(msgs));
        skillRuns = skillPass.runs;
        if (skillPass.contextBlock) {
          contextBlock = contextBlock
            ? `${contextBlock}\n\n${skillPass.contextBlock}`
            : skillPass.contextBlock;
        }
      } catch {
        /* skills are enhancement-only — never block the answer */
      }

      // 2. conversation for the model
      const history: ChatTurn[] = (transcript ?? [])
        .filter((m) => m.role !== "system")
        .slice(-12)
        .map((m) => ({ role: m.role as ChatTurn["role"], content: m.content }));

      const messages: ChatTurn[] = [
        {
          role: "system",
          content:
            "You are JARVIS, a precise AI operator assistant inside a personal OS. Be concise and technical. Cite document excerpts as [n] when grounded context is provided. When the user asks for a document, book, notes, report or file, write the full content in clean markdown (with headings, lists, tables where useful) so it can be exported directly as PDF, Word or Excel.",
        },
        ...(contextBlock ? [{ role: "system" as const, content: contextBlock }] : []),
        ...history,
        {
          role: "user",
          content: question,
          ...(attachImage ? { images: [attachImage] } : {}),
        },
      ];
      if (attachImage) setAttachImage(null); // vision attachment consumed

      // 3. STREAM the answer (cloud key → puter keyless → free keyless → offline WebGPU)
      try {
        const answer = await generateAnswerStream(messages, {
          onDelta: (full) => setStreamText(full),
        });
        const latencyMs = Date.now() - started;
        const assistantMsgId = uuid();

        await appendAiMessage({
          sessionToken,
          sessionId: targetId,
          role: "assistant",
          content: answer.text,
          engine: answer.engine,
          latencyMs,
          clientMsgId: assistantMsgId,
        });

        // AUTO-TITLE: name the session from its first exchange (ChatGPT-style)
        if (activeSession && activeSession.title === "New session") {
          const autoTitle = titleFromExchange(question, answer.text);
          if (autoTitle) {
            void updateSession({ sessionToken, aiSessionId: targetId, title: autoTitle } as never).catch(
              () => undefined
            );
          }
        }

        if (hits.length) {
          await appendRemote({
            sessionToken,
            sessionId: targetId,
            role: "assistant",
            content: answer.text,
            engine: answer.engine,
            latencyMs,
            clientMsgId: assistantMsgId,
            citations: hits.map((h) => ({
              documentId: h.documentId,
              chunkOrdinals: [h.ordinal],
              score: h.score,
              documentTags: h.documentTags,
            })),
          } as never).catch(() => undefined);
        }

        const usedSkills = skillRuns.filter((r) => r.ok);
        setEngineNote(
          `${ENGINE_LABEL[answer.engine] ?? answer.engine} · ${answer.model} · ${(latencyMs / 1000).toFixed(1)}s` +
            (usedSkills.length ? ` · ⚡skills: ${usedSkills.map((r) => r.skillName).join(", ")}` : "")
        );

        // 4. VOICE TURN-TAKING: speak the whole answer; when finished,
        // the live listener picks up automatically (loop continues).
        const shouldSpeak = voiceOut || liveModeRef.current;
        if (shouldSpeak) {
          if (liveModeRef.current) setLiveStatus("speaking");
          await new Promise<void>((resolve) => {
            // Speak first sentence quickly, then the rest, then resolve on end.
            speak(answer.text, () => resolve());
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "generation failed";
        setEngineNote(`✗ ${msg}`);
      } finally {
        setStreamText(null);
        busyRef.current = false;
        if (liveModeRef.current) setLiveStatus("listening");
      }
    },
    [sessionToken, activeId, transcript, activeSession, ragEnabled, voiceOut, attachImage, ensureSession, appendRemote, updateSession, createSession]
  );

  // Command-palette handoff: /dashboard/ai?q=… sends that question once the
  // session is ready; ?live=1 boots straight into Live Voice Mode. Params are
  // stripped immediately so a refresh never re-sends them.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pending = params.get("q");
    const wantLive = params.get("live") === "1";
    if (!pending && !wantLive) return;
    params.delete("q");
    params.delete("live");
    const qs = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    if (wantLive) setLiveMode(true);
    if (pending && sessionToken && activeId && !busyRef.current) void send(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionToken, activeId]);

  const live = useLiveRecognition(liveMode && !streaming, (text) => {
    if (!busyRef.current) void send(text, { fromVoice: true });
  });

  // While Live Voice is active, this page owns the mic — pause the global
  // wake-word listener so the two recognizers never contend.
  useEffect(() => {
    setVoiceCommandsPaused(liveMode);
    return () => setVoiceCommandsPaused(false);
  }, [liveMode]);

  const toggleLive = useCallback(() => {
    setLiveMode((v) => {
      const next = !v;
      if (next) {
        stopSpeaking();
        setLiveStatus("listening");
      } else {
        setLiveStatus("idle");
        stopSpeaking();
        stopGeneration();
      }
      return next;
    });
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [transcript?.length, streamText]);

  const stopStreaming = useCallback(() => {
    stopGeneration();
    setStreamText(null);
    busyRef.current = false;
  }, []);

  // Keyboard shortcuts: ESC stops generation · Ctrl+Shift+S toggles settings.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && busyRef.current) stopStreaming();
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        setSettingsOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stopStreaming]);

  /** Attach an image for vision-aware answering (stored as data URL). */
  const onPickImage = useCallback((file: File | null) => {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setEngineNote("✗ image too large (max 4MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAttachImage(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  }, []);

  const loadOfflineNow = useCallback(async () => {
    try {
      await loadWebLlm((s) => setOfflineStatus(s));
    } catch (e) {
      setOfflineStatus({
        state: "error",
        message: e instanceof Error ? e.message : "load failed",
      });
    }
  }, []);

  // ── transcript rendering ─────────────────────────────────────────────────
  const uiMessages: UiMsg[] = useMemo(
    () =>
      (transcript ?? []).map((m) => ({
        id: m._id,
        role: m.role as UiMsg["role"],
        content: m.content,
        engine: m.engine ?? undefined,
        latencyMs: m.latencyMs ?? undefined,
        citations: m.citations?.flatMap((c) =>
          c.chunkOrdinals.map((o) => ({ documentId: c.documentId, ordinal: o, score: c.score, tags: (c as any).documentTags }))
        ),
      })),
    [transcript]
  );

  const activeTitle = activeSession?.title ?? "JARVIS TERMINAL";
  const liveStatusLabel =
    liveStatus === "listening" ? "LISTENING — SPEAK ANYTIME"
    : liveStatus === "thinking" ? "PROCESSING…"
    : liveStatus === "speaking" ? "SPEAKING — JUST TALK OVER ME"
    : "LIVE VOICE";

  return (
    <main className="relative flex h-screen flex-col overflow-hidden">
      {/* header */}
      <header className="flex items-center gap-3 border-b border-cyan-500/20 px-4 py-3">
        <a href="/dashboard" className="hud-btn !px-2 !py-1 text-xs">◂</a>
        <Radio size={16} className="text-cyan-300" />
        <h1 className="hud-label truncate">{activeTitle}</h1>
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          {/* SURPRISE: engine priority selector — user chooses which AI leads */}
          <select
            value={enginePref}
            onChange={(e) => {
              const p = e.target.value as EnginePref;
              setEnginePref(p);
              setEnginePreference(p);
              setEngineNote(
                p === "auto"
                  ? "ENGINE: AUTO — your key → puter keyless → free → groq → offline WebGPU"
                  : `ENGINE: ${p.toUpperCase()} pinned as primary`
              );
            }}
            className="hud-input !w-auto !py-1 text-[10px]"
            title="Pick which AI engine answers first"
          >
            <option value="auto">⚡ AUTO</option>
            <option value="puter">◆ PUTER (keyless)</option>
            <option value="openrouter">☁ YOUR KEY</option>
            <option value="pollinations">☁ FREE</option>
            <option value="groq">⚡ GROQ</option>
            <option value="webllm">◈ OFFLINE</option>
          </select>
          <button
            onClick={() => setRagEnabled((v) => !v)}
            className={`hud-btn !px-2 !py-1 text-[10px] ${ragEnabled ? "!text-cyan-300" : "!text-slate-500"}`}
            title="Ground answers in your document library (RAG)"
          >
            RAG {ragEnabled ? "ON" : "OFF"}
          </button>
          <button
            onClick={toggleVoiceOut}
            className={`hud-btn !px-2 !py-1 ${voiceOut ? "!text-emerald-300" : "!text-slate-500"}`}
            title={voiceOut ? "Voice output ON" : "Voice output muted"}
          >
            {voiceOut ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
          <button onClick={() => setSettingsOpen(true)} className="hud-btn !px-2 !py-1">
            <Settings2 size={14} />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* session rail */}
        <aside className="hidden w-56 shrink-0 flex-col border-r border-cyan-500/20 p-3 md:flex">
          <button onClick={() => void newSession()} className="hud-btn mb-3 w-full text-xs">+ NEW SESSION</button>
          {/* SURPRISE: session search — filter sessions live */}
          <div className="relative mb-2">
            <Search size={11} className="absolute left-2 top-2 text-slate-500" />
            <input
              value={sessionQuery}
              onChange={(e) => setSessionQuery(e.target.value)}
              placeholder="search sessions…"
              className="hud-input !py-1 pl-6 text-[10px]"
            />
          </div>
          <div className="flex-1 space-y-1 overflow-y-auto">
            {sessions
              ?.filter((s) =>
                sessionQuery.trim()
                  ? (s.title ?? "").toLowerCase().includes(sessionQuery.toLowerCase())
                  : true
              )
              .map((s) => (
              <button
                key={s._id}
                onClick={() => setActiveId(s._id as string)}
                className={`block w-full truncate rounded px-2 py-1.5 text-left font-mono text-[11px] transition ${
                  s._id === activeId
                    ? "bg-cyan-500/15 text-cyan-200"
                    : "text-slate-400 hover:bg-cyan-500/5 hover:text-cyan-200/80"
                }`}
              >
                {s.title ?? "session"}
                <span className="ml-1 text-[9px] text-slate-600">{s.mode}</span>
              </button>
            ))}
          </div>
          {offlineStatus.state === "ready" && (
            <p className="mt-2 font-mono text-[9px] text-emerald-400/80">● OFFLINE LLM READY</p>
          )}
          <p className="mt-2 font-mono text-[9px] leading-relaxed text-slate-600">
            UNLIMITED ACCESS — keyless free cloud, auto-fallback to on-device WebGPU AI. No quota, no account.
          </p>
        </aside>

        {/* transcript */}
        <section className="flex min-w-0 flex-1 flex-col">
          {/* live conversation bar */}
          <div
            className={`flex items-center justify-between gap-2 border-b px-4 py-2 transition ${
              liveMode ? "border-emerald-400/30 bg-emerald-400/5" : "border-transparent"
            }`}
          >
            <div className="flex items-center gap-2">
              {liveMode && (
                <>
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  </span>
                  <span className="font-mono text-[10px] tracking-wider text-emerald-300">
                    {liveStatusLabel}
                  </span>
                  {!live.supported && (
                    <span className="font-mono text-[10px] text-rose-400">(mic unsupported here)</span>
                  )}
                </>
              )}
            </div>
            <button
              onClick={toggleLive}
              className={`hud-btn !px-3 !py-1 text-[10px] ${
                liveMode ? "!border-emerald-400/60 !text-emerald-300" : ""
              }`}
              title="Full voice conversation: JARVIS listens, answers aloud, and waits for you — hands-free until you stop it"
            >
              {liveMode ? <MicOff size={12} /> : <Mic size={12} />}
              {liveMode ? "STOP LIVE VOICE" : "LIVE VOICE MODE"}
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {uiMessages.length === 0 && !streaming && (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <Cpu className="mx-auto mb-3 text-cyan-500/40" size={40} />
                  <p className="hud-label">JARVIS ONLINE</p>
                  <p className="mt-1 font-mono text-[11px] text-slate-500">
                    Unlimited AI · streams live · grounded in your library
                  </p>
                  <p className="mt-3 font-mono text-[10px] text-cyan-500/60">
                    Tap LIVE VOICE MODE and just talk — JARVIS answers out loud and waits for you.
                  </p>
                </div>
              </div>
            )}
            <AnimatePresence initial={false}>
              {uiMessages.map((m) => (
                <ChatBubble key={m.id} m={m} />
              ))}
            </AnimatePresence>

            {streaming && (
              <div className="max-w-[85%] rounded-lg border border-cyan-500/40 bg-slate-800/40 px-3 py-2 font-mono text-xs leading-relaxed text-slate-200 shadow-[0_0_18px_rgba(34,211,238,0.12)]">
                {streamText ? (
                  <p className="typing-caret whitespace-pre-wrap">
                    {streamText}
                    <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-cyan-400 align-middle" />
                  </p>
                ) : (
                  <p className="flex items-center gap-2 text-cyan-300/70">
                    <Loader2 size={12} className="animate-spin" /> thinking…
                  </p>
                )}
              </div>
            )}
          </div>

          {engineNote && (
            <p className="truncate border-t border-cyan-500/10 px-4 py-1 font-mono text-[10px] text-slate-500">
              {engineNote}
            </p>
          )}

          {/* composer */}
          <div className="border-t border-cyan-500/20 p-3">
            {/* SURPRISE: image attachment chip + hidden file input (vision) */}
            {attachImage && (
              <div className="mb-2 flex items-center gap-2 rounded border border-cyan-500/30 bg-cyan-500/5 px-2 py-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={attachImage} alt="attachment" className="h-8 w-8 rounded object-cover" />
                <span className="font-mono text-[10px] text-cyan-300/80">image attached — vision mode</span>
                <button
                  onClick={() => setAttachImage(null)}
                  className="ml-auto text-slate-400 hover:text-rose-400"
                  title="Remove attachment"
                >
                  <X size={12} />
                </button>
              </div>
            )}
            {imgBusy && (
              <div className="mb-2 flex items-center gap-2 rounded border border-fuchsia-500/30 bg-fuchsia-500/5 px-2 py-1">
                <Loader2 size={12} className="animate-spin text-fuchsia-300" />
                <span className="font-mono text-[10px] text-fuchsia-300">painting…</span>
              </div>
            )}
            <div className="flex items-end gap-2">
              {/* SURPRISE: attach-image button (vision) */}
              <label className="hud-btn cursor-pointer !px-2 !py-2" title="Attach image for vision AI">
                <Paperclip size={14} />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    onPickImage(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
              </label>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(draft);
                  } else {
                    blip();
                  }
                }}
                rows={1}
                placeholder='Type a directive — try "/image neon city at night" — or LIVE VOICE MODE'
                className="hud-input max-h-32 min-h-[38px] flex-1 resize-none font-mono text-xs"
              />
              {streaming || imgBusy ? (
                <button
                  onClick={stopStreaming}
                  className="hud-btn !px-3 !py-2 !text-rose-300"
                  title="Stop"
                >
                  <Square size={14} />
</button>
              ) : (
                <button
                  onClick={() => void send(draft)}
                  disabled={!draft.trim()}
                  className="hud-btn !px-3 !py-2 disabled:opacity-30"
                >
                  <ArrowUp size={14} />
                </button>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* settings drawer */}
      <AnimatePresence>
        {settingsOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex justify-end bg-black/60"
            onClick={() => setSettingsOpen(false)}
          >
            <motion.div
              initial={{ x: 320 }}
              animate={{ x: 0 }}
              exit={{ x: 320 }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="hud-panel h-full w-80 max-w-full overflow-y-auto border-l border-cyan-500/30 p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <p className="hud-label">ENGINE CONFIG</p>
                <button onClick={() => setSettingsOpen(false)} className="hud-btn !px-2 !py-1">
                  <X size={14} />
                </button>
              </div>

              <div className="mb-6 rounded-lg border border-emerald-400/25 bg-emerald-400/5 p-3">
                <p className="mb-1 flex items-center gap-1 font-mono text-[10px] tracking-wider text-emerald-300">
                  <Zap size={11} /> UNLIMITED ACCESS ACTIVE
                </p>
                <p className="font-mono text-[9px] leading-relaxed text-slate-400">
                  Default: keyless free cloud AI → falls back to on-device WebGPU AI. No account,
                  no quota. Add an OpenRouter key below only if you want premium models.
                </p>
              </div>

              {/* cloud (optional premium) */}
              <div className="mb-6">
                <p className="hud-label mb-2 text-[10px]">
                  <Cloud size={11} className="mr-1 inline" /> OPENROUTER (OPTIONAL PREMIUM)
                </p>
                <input
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder={hasCloudKey ? "•••• key stored — paste to replace" : "sk-or-v1-…"}
                  className="hud-input mb-2 font-mono text-[11px]"
                  type="password"
                />
                <input
                  value={modelInput}
                  onChange={(e) => setModelInput(e.target.value)}
                  className="hud-input mb-2 font-mono text-[10px]"
                />
                <button
                  onClick={() => {
                    if (keyInput.trim()) setOpenRouterKey(keyInput.trim());
                    setOpenRouterModel(modelInput.trim() || getOpenRouterModel());
                    setKeyInput("");
                    setSettingsOpen(false);
                  }}
                  className="hud-btn w-full text-xs"
                >
                  SAVE CLOUD CONFIG
                </button>
                {hasCloudKey && (
                  <button
                    onClick={() => {
                      setOpenRouterKey(null);
                      setSettingsOpen(false);
                    }}
                    className="mt-1 w-full py-1 font-mono text-[10px] text-slate-500 hover:text-rose-400"
                  >
                    remove key (back to unlimited defaults)
                  </button>
                )}
              </div>

              {/* groq backup */}
              <div className="mb-6">
                <p className="hud-label mb-2 text-[10px]">
                  <Zap size={11} className="mr-1 inline" /> GROQ BACKUP (FREE KEY — RECOMMENDED ON IPHONE)
                </p>
                <input
                  value={groqInput}
                  onChange={(e) => setGroqInput(e.target.value)}
                  placeholder={getGroqKey() ? "•••• groq key stored — paste to replace" : "gsk_… (free from console.groq.com)"}
                  className="hud-input mb-2 font-mono text-[11px]"
                  type="password"
                />
                <button
                  onClick={() => {
                    if (groqInput.trim()) setGroqKey(groqInput.trim());
                    setGroqInput("");
                    setSettingsOpen(false);
                  }}
                  className="hud-btn w-full text-xs"
                >
                  SAVE GROQ BACKUP
                </button>
                <p className="mt-2 font-mono text-[9px] leading-relaxed text-slate-500">
                  Get a free key in 60s at console.groq.com (no card needed). Used automatically
                  when the free cloud tier is busy — keeps “unlimited” true on any device.
                </p>
              </div>

              {/* SURPRISE: Puter premium keyless model config */}
              <div className="mb-6">
                <p className="hud-label mb-2 text-[10px]">
                  ◆ PUTER PREMIUM (KEYLESS · 500+ MODELS)
                </p>
                <input
                  value={puterModelInput}
                  onChange={(e) => setPuterModelInput(e.target.value)}
                  placeholder="gpt-5-nano / claude-sonnet-5 / gemini-2.5-flash …"
                  className="hud-input mb-2 font-mono text-[10px]"
                />
                <button
                  onClick={() => {
                    setPuterModel(puterModelInput.trim() || getPuterModel());
                    setPuterModelInput("");
                    setSettingsOpen(false);
                    setEngineNote("◆ Puter model saved — keyless, no account needed");
                  }}
                className="hud-btn w-full text-xs"
                >
                  SAVE PUTER MODEL
                </button>
                <p className="mt-2 font-mono text-[9px] leading-relaxed text-slate-500">
                  Default gpt-5-nano. Browse all 500+ at developer.puter.com/ai/models —
                  GPT, Claude, Gemini, DeepSeek, Grok, Llama and more. Vision models see attached
                  images; /image command paints pictures. Powered by Puter (user-pays model).
                </p>
              </div>

              {/* offline */}
              <div>
                <p className="hud-label mb-2 text-[10px]">
                  <Cpu size={11} className="mr-1 inline" /> WEBLLM (OFFLINE · UNLIMITED)
                </p>
                {!webLlmSupported() ? (
                  <p className="font-mono text-[10px] text-rose-400/80">
                    ✗ WebGPU unavailable — offline mode disabled
                  </p>
                ) : (
                  <>
                    <select
                      value={getWebLlmModel()}
                      onChange={(e) => setWebLlmModel(e.target.value)}
                      className="hud-input mb-2 font-mono text-[10px]"
                    >
                      <option value={DEFAULT_WEBLLM_MODEL}>Llama 3.2 1B (fast, ~880MB)</option>
                      <option value="Llama-3.2-3B-Instruct-q4f16_1-MLC">Llama 3.2 3B (~1.7GB)</option>
                      <option value="Qwen2.5-1.5B-Instruct-q4f16_1-MLC">Qwen 2.5 1.5B (~990MB)</option>
                    </select>
                    {offlineStatus.state === "ready" ? (
                      <p className="mb-2 font-mono text-[10px] text-emerald-400">● model loaded</p>
                    ) : offlineStatus.state === "loading" ? (
                      <div className="mb-2">
                        <div className="h-1 w-full overflow-hidden rounded bg-slate-700">
                          <div
                            className="h-full bg-cyan-400 transition-all"
                            style={{ width: `${Math.round(offlineStatus.progress * 100)}%` }}
                          />
                        </div>
                        <p className="mt-1 truncate font-mono text-[9px] text-slate-500">
                          {offlineStatus.text}
                        </p>
                      </div>
                    ) : (
                      <button onClick={loadOfflineNow} className="hud-btn w-full text-xs">
                        PRE-DOWNLOAD OFFLINE MODEL
                      </button>
                    )}
                  </>
                )}
                <p className="mt-3 font-mono text-[9px] leading-relaxed text-slate-600">
                  LIVE VOICE MODE: JARVIS listens continuously, answers out loud, then waits for
                  your reply — true hands-free conversation until you stop it. Voice commands like
                  “Jarvis, open library” work on every page.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

/** Escape HTML for the mini-markdown renderer. */
function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * SURPRISE: mini-markdown renderer for assistant bubbles — headings, bold,
 * inline code, links and generated images render richly while keeping the
 * terminal aesthetic. Falls back to plain text for user bubbles.
 */
function renderMiniMarkdown(s: string): string {
  const e = escHtml(s);
  return (
    e
      // images ![alt](url)
      .replace(/!\[([^\]]*)\]\((https?:[^)\s]+)\)/g, '<img src="$2" alt="$1" class="my-2 max-h-72 rounded-lg border border-cyan-500/30" />')
      // links [text](url)
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="text-cyan-300 underline decoration-dotted">$1</a>')
      // bold **text**
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
      // inline code `code`
      .replace(/`([^`\n]+)`/g, '<code class="rounded bg-cyan-500/10 px-1 py-0.5 text-[11px] text-cyan-200">$1</code>')
      // headings #, ##, ###
      .replace(/^### (.*)$/gm, '<span class="font-bold text-cyan-200">$1</span>')
      .replace(/^## (.*)$/gm, '<span class="font-bold text-cyan-100">$1</span>')
      .replace(/^# (.*)$/gm, '<span class="font-bold tracking-wide text-cyan-100">$1</span>')
  );
}

/** One transcript bubble with export + speak actions on assistant messages. */
function ChatBubble({ m }: { m: UiMsg }) {
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [spoken, setSpoken] = useState(false);
  const [copied, setCopied] = useState(false);
  if (m.role === "system") return null;

  const isUser = m.role === "user";
  const exportTitle =
    m.content.replace(/[#>*`]/g, "").trim().split("\n")[0]?.slice(0, 48) || "jarvis-document";

  async function doExport(fmt: ExportFormat) {
    setExporting(fmt);
    try {
      await exportDocument(m.content, exportTitle, fmt);
    } finally {
      setExporting(null);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`max-w-[85%] rounded-lg border px-3 py-2 font-mono text-xs leading-relaxed ${
        isUser
          ? "ml-auto border-cyan-500/30 bg-cyan-500/10 text-cyan-100"
          : "border-slate-600/40 bg-slate-800/40 text-slate-200"
      }`}
    >
      {/* SURPRISE: rich rendering for assistant messages */}
      {isUser ? (
        <p className="whitespace-pre-wrap">{m.content}</p>
      ) : (
        <div
          className="whitespace-pre-wrap break-words"
          dangerouslySetInnerHTML={{ __html: renderMiniMarkdown(m.content) }}
        />
      )}

      {!isUser && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-600/30 pt-1.5">
          {/* SURPRISE: one-tap copy button */}
          <button
            onClick={() => {
              void navigator.clipboard.writeText(m.content).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
            className="flex items-center gap-1 rounded border border-slate-600/40 px-1.5 py-0.5 text-[9px] text-slate-300 transition hover:border-cyan-400/50 hover:text-cyan-200"
            title="Copy full answer"
          >
            {copied ? <Check size={9} className="text-emerald-400" /> : <Copy size={9} />}
            {copied ? "copied" : "copy"}
          </button>
          {EXPORT_FORMATS.map((f) => (
            <button
              key={f.id}
              onClick={() => void doExport(f.id)}
              disabled={exporting !== null}
              className="flex items-center gap-1 rounded border border-slate-600/40 px-1.5 py-0.5 text-[9px] text-slate-300 transition hover:border-cyan-400/50 hover:text-cyan-200 disabled:opacity-40"
              title={`Download as ${f.label}`}
            >
              {exporting === f.id ? <Loader2 size={9} className="animate-spin" /> : <Download size={9} />}
              {f.label}
            </button>
          ))}
          {ttsSupported() && (
            <button
              onClick={() => {
                if (spoken) {
                  stopSpeaking();
                  setSpoken(false);
                } else {
                  speak(m.content);
                  setSpoken(true);
                }
              }}
              className={`ml-auto rounded px-1.5 py-0.5 text-[9px] transition ${
                spoken ? "text-emerald-300" : "text-slate-400 hover:text-cyan-200"
              }`}
              title={spoken ? "Stop speaking" : "Read aloud"}
            >
              {spoken ? "◼ speaking" : "▶ read aloud"}
            </button>
          )}
        </div>
      )}

      {m.citations && m.citations.length > 0 && (
        <p className="mt-1 text-[9px] text-cyan-500/70">
          <FileDown size={9} className="mr-1 inline" />
          {m.citations.length} doc citation{m.citations.length > 1 ? "s" : ""}
          {(() => {
            const tagSet = new Set<string>();
            for (const c of m.citations) for (const t of c.tags ?? []) tagSet.add(t);
            if (!tagSet.size) return null;
            return (
              <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                {Array.from(tagSet).map((t) => (
                  <span key={t} className="rounded-full border border-violet-400/40 px-1.5 py-0.5 text-[8px] text-violet-300">#{t}</span>
                ))}
              </span>
            );
          })()}
        </p>
      )}
      {m.engine && (
        <p className="mt-1 text-[9px] text-slate-500">
          {ENGINE_LABEL[m.engine] ?? m.engine} · {m.latencyMs ?? "?"}ms
        </p>
      )}
    </motion.div>
  );
}
