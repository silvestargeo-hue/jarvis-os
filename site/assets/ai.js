/* ============================================================
   JARVIS OS — AI Core (ai.js)
   Real keyless AI: Puter.js (500+ models, no API key) with
   Pollinations open endpoint as fallback. Streaming, vision.
   ============================================================ */

"use strict";

const AICore = {
  model: "auto",

  /* ---- Tier 0: WebLLM (fully offline, opt-in; model streams into browser cache) ---- */
  webllm: { ready: false, loading: false, engine: null, progress: 0 },

  async webllmEnable(onProgress) {
    if (this.webllm.ready) return true;
    if (this.webllm.loading) return false;
    this.webllm.loading = true;
    try {
      if (!window.WebLLM) {
        await new Promise((res, rej) => {
          const s = document.createElement("script");
          s.type = "module";
          s.textContent = `import * as WebLLM from "https://esm.run/@mlc-ai/web-llm"; window.WebLLM = WebLLM; document.dispatchEvent(new Event("webllm-loaded"));`;
          document.addEventListener("webllm-loaded", res, { once: true });
          s.onerror = () => rej(new Error("webllm cdn failed"));
          document.head.appendChild(s);
        });
      }
      const W = window.WebLLM;
      this.webllm.engine = await W.CreateMLCEngine("Llama-3.2-1B-Instruct-q4f16_1-MLC", {
        initProgressCallback: (p) => {
          this.webllm.progress = p.progress || 0;
          onProgress && onProgress(p.progress || 0, p.text || "");
        },
      });
      this.webllm.ready = true;
      OS.set("webllm-on", true);
      OS.toast("🧠 Offline AI ready — works with zero internet", "ok");
      return true;
    } catch (e) {
      console.warn("[AI] webllm enable failed:", e?.message || e);
      OS.toast("Offline AI unavailable: " + (e?.message || "unknown"), "err");
      return false;
    } finally { this.webllm.loading = false; }
  },

  webllmDisable() {
    this.webllm.ready = false;
    OS.set("webllm-on", false);
    OS.toast("Offline AI off — cloud engines active", "ok");
  },

  async webllmChat(messages, onToken) {
    const eng = this.webllm.engine;
    const chunks = await eng.chat.completions.create({
      messages,
      stream: true,
      max_tokens: 512,
    });
    let got = false;
    for await (const c of chunks) {
      const t = c.choices?.[0]?.delta?.content || "";
      if (t) { got = true; onToken(t); }
    }
    return got;
  },

  offlinePreferred() { return OS.get("webllm-on", false) && this.webllm.ready; },

  /* ---- cancellation: Stop button support across all tiers ---- */
  _cancelled: false, _activeCtl: null,

  cancelActive() {
    this._cancelled = true;
    try { this._activeCtl && this._activeCtl.abort(); } catch {}
    try { this.webllm.engine && this.webllm.engine.interruptGenerate && this.webllm.engine.interruptGenerate(); } catch {}
  },

  /* ---- conversation memory: rolling summary of old turns ---- */
  async summarize(text) {
    return this.complete(text, "Compress this conversation into a factual memory note (max 80 words). Preserve names, decisions, and open questions. Output only the note.");
  },

  puterReady() {
    return typeof puter !== "undefined" && puter && puter.ai && puter.ai.chat;
  },

  /* Main streaming chat. opts: { model, imageDataUrl, onToken, onDone, onError, onCancelled } */
  async chat(messages, opts = {}) {
    const onToken = opts.onToken || (() => {});
    if (this._cancelled) { this._cancelled = false; opts.onCancelled && opts.onCancelled(); return; }
    this._cancelled = false;
    // Tier 0: offline WebLLM (if user enabled it) — internet optional
    if (this.offlinePreferred()) {
      try {
        const cloudMsgs = messages.filter((m) => !String(m.content || "").startsWith("data:image"));
        const got = await this.webllmChat(cloudMsgs, onToken);
        if (got) { opts.onDone && opts.onDone("webllm-offline"); return; }
      } catch (e) {
        console.warn("[AI] webllm failed, falling back to cloud:", e?.message || e);
      }
    }
    // Tier 1: Puter.js (keyless, user-pays platform)
    if (this.puterReady()) {
      try {
        let model = opts.model && opts.model !== "auto" ? opts.model : undefined;
        let msgParam;
        if (opts.imageDataUrl) {
          msgParam = [{ role: "user", content: [
            { type: "text", text: messages[messages.length - 1].content },
            { type: "file", puter_path: false, dataURL: opts.imageDataUrl },
          ]}];
        } else {
          msgParam = messages;
        }
        const resp = await puter.ai.chat(msgParam, { model, stream: true });
        let got = false;
        for await (const part of resp) {
          if (this._cancelled) break;
          const t = part?.text ?? part?.message?.content ?? "";
          if (t) { got = true; onToken(t); }
        }
        if (this._cancelled) { opts.onCancelled && opts.onCancelled(); return; }
        if (got) { opts.onDone && opts.onDone("puter"); return; }
        throw new Error("empty puter stream");
      } catch (e) {
        console.warn("[AI] puter failed, falling back:", e?.message || e);
      }
    }

    // Tier 2: Pollinations (open endpoint, keyless)
    try {
      const sys = messages.find((m) => m.role === "system");
      const rest = messages.filter((m) => m.role !== "system");
      const body = {
        model: "openai",
        messages: [
          ...(sys ? [{ role: "system", content: sys.content }] : []),
          ...rest,
        ],
        stream: true,
      };
      const ctl = new AbortController();
      this._activeCtl = ctl;
      // silence watchdog: abort only if NO bytes arrive for 25s (not total duration)
      let kill = setTimeout(() => ctl.abort(), 25000);
      const kick = () => { clearTimeout(kill); kill = setTimeout(() => ctl.abort(), 25000); };
      const r = await fetch("https://text.pollinations.ai/openai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });
      if (!r.ok || !r.body) throw new Error("pollinations HTTP " + r.status);
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "", got = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        kick(); // bytes arrived — reset watchdog
        if (this._cancelled) { ctl.abort(); break; }
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          const s = line.trim();
          if (!s.startsWith("data:")) continue;
          const payload = s.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const j = JSON.parse(payload);
            const t = j.choices?.[0]?.delta?.content || "";
            if (t) { got = true; onToken(t); }
          } catch {}
        }
      }
      clearTimeout(kill);
      if (this._cancelled) { opts.onCancelled && opts.onCancelled(); return; }
      if (got) { opts.onDone && opts.onDone("pollinations"); return; }
      throw new Error("empty pollinations stream");
    } catch (e) {
      console.warn("[AI] pollinations stream failed:", e?.message || e);
    }

    // Tier 3: Pollinations GET (simple, verified keyless — works even without SSE)
    try {
      const last = messages[messages.length - 1].content;
      const sys = messages.find((m) => m.role === "system");
      const url = "https://text.pollinations.ai/" + encodeURIComponent(String(last).slice(0, 500)) +
        "?model=openai" + (sys ? "&system=" + encodeURIComponent(String(sys.content).slice(0, 200)) : "");
      const ctl = new AbortController();
      this._activeCtl = ctl;
      const kill = setTimeout(() => ctl.abort(), 40000); // single-shot: give reasoning models room
      const r = await fetch(url, { signal: ctl.signal });
      clearTimeout(kill);
      if (this._cancelled) { opts.onCancelled && opts.onCancelled(); return; }
      if (!r.ok) throw new Error("get HTTP " + r.status);
      const txt = await r.text();
      if (txt && txt.trim() && !/^\s*</.test(txt)) {
        onToken(txt);
        opts.onDone && opts.onDone("pollinations-get");
        return;
      }
      throw new Error("empty get response");
    } catch (e) {
      console.warn("[AI] all engines failed:", e?.message || e);
      opts.onError && opts.onError("All AI engines failed. Check your connection and try again.");
    }
  },

  /* One-shot completion (no stream) — used by terminal + tasks AI */
  async complete(prompt, sysPrompt) {
    // Puter first
    if (this.puterReady()) {
      try {
        const r = await puter.ai.chat(sysPrompt ? [sysPrompt, prompt].join("\n\n") : prompt);
        const t = typeof r === "string" ? r : (r?.message?.content ?? r?.text ?? "");
        if (t) return t;
      } catch {}
    }
    // Pollinations POST (40s watchdog — reasoning models can be slow)
    try {
      const ctl = new AbortController();
      const kill = setTimeout(() => ctl.abort(), 40000);
      const body = {
        model: "openai",
        messages: [
          { role: "system", content: sysPrompt || "You are JARVIS, a concise AI assistant." },
          { role: "user", content: prompt },
        ],
      };
      const r = await fetch("https://text.pollinations.ai/openai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });
      clearTimeout(kill);
      const j = await r.json();
      const t = j.choices?.[0]?.message?.content || "";
      if (t) return t;
    } catch {}
    // Tier 3 GET retry (different code path, often less loaded)
    try {
      const url = "https://text.pollinations.ai/" + encodeURIComponent(String(prompt).slice(0, 500)) +
        "?model=openai" + (sysPrompt ? "&system=" + encodeURIComponent(String(sysPrompt).slice(0, 200)) : "");
      const ctl = new AbortController();
      const kill = setTimeout(() => ctl.abort(), 40000);
      const r = await fetch(url, { signal: ctl.signal });
      clearTimeout(kill);
      const txt = await r.text();
      if (txt && txt.trim() && !/^\s*</.test(txt)) return txt;
    } catch {}
    return "";
  },

  /* Keyless image generation: Puter txt2img → Pollinations */
  async generateImage(prompt) {
    if (this.puterReady()) {
      try {
        const img = await puter.ai.txt2img(prompt);
        if (img && img.src) return img.src;
        if (typeof img === "string") return img;
      } catch (e) { console.warn("[IMG] puter txt2img failed:", e?.message || e); }
    }
    // Pollinations image endpoint
    return "https://image.pollinations.ai/prompt/" + encodeURIComponent(prompt) +
      "?width=1024&height=1024&nologo=true&seed=" + Math.floor(Math.random() * 1e6);
  },

  /* Text to speech */
  speak(text) {
    if (!("speechSynthesis" in window)) { OS.toast("TTS not supported in this browser", "err"); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.slice(0, 1200));
    u.rate = 1.02; u.pitch = 0.9;
    const vs = speechSynthesis.getVoices();
    const v = vs.find((x) => /daniel|uk english male|en-GB/i.test(x.name + x.lang)) ||
              vs.find((x) => /en/i.test(x.lang));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  },

  stopSpeak() { try { speechSynthesis.cancel(); } catch {} },

  /* Microphone transcription via Web Speech API (Chrome/Edge) */
  listen(onResult, onEnd) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { OS.toast("Voice input needs Chrome/Edge (Web Speech API)", "err"); onEnd && onEnd(false); return null; }
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    let finalTxt = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalTxt += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      onResult(finalTxt || interim, !!finalTxt);
    };
    rec.onend = () => onEnd && onEnd(true);
    rec.onerror = (e) => { OS.toast("Mic error: " + e.error, "err"); onEnd && onEnd(false); };
    rec.start();
    return rec;
  },
};
