/* ============================================================
   JARVIS OS — Voice Router (voice.js)
   Universal voice control for the whole OS. Locale-aware:
   EN ("open chat"), NE ("खोल च्याट"), HI ("खोलो चैट").
   Toggle from palette ("Voice control") or Terminal (`voice`).
   ============================================================ */

"use strict";

const VoiceRouter = {
  on: false, rec: null,

  appAliases() {
    const d = I18N.dicts[I18N.locale] || I18N.dicts.en;
    const en = { chat: ["chat","ai chat","jarvis chat"], library: ["library","documents","docs","rag"], mesh: ["mesh","mesh chat","encrypted chat"], image: ["image","image lab","paint","paint app"], terminal: ["terminal","shell","console"], notes: ["notes","note"], tasks: ["tasks","task"], files: ["files","file"], code: ["code","code studio","studio","editor"], achievements: ["achievements","awards","trophies"], about: ["system","about","diagnostics"] };
    const ne = { chat: ["च्याट","ए आई च्याट"], library: ["पुस्तकालय","लाइब्रेरी"], mesh: ["मेश"], image: ["इमेज","चित्र ल्याब"], terminal: ["टर्मिनल"], notes: ["नोट"], tasks: ["काम"], files: ["फाइल"], code: ["कोड"], achievements: ["पदक"], about: ["सिस्टम"] };
    const hi = { chat: ["चैट","ए आई चैट"], library: ["लाइब्रेरी"], mesh: ["मेश"], image: ["इमेज","चित्र लैब"], terminal: ["टर्मिनल"], notes: ["नोट्स"], tasks: ["काम"], files: ["फ़ाइल"], code: ["कोड"], achievements: ["पदक"], about: ["सिस्टम"] };
    let map = { en, ne, hi }[I18N.locale] || en;
    // merge user-defined aliases (stored per app id)
    const custom = OS.get("voice-aliases", {});
    const merged = {};
    for (const k of new Set([...Object.keys(map), ...Object.keys(custom)])) {
      merged[k] = [...(map[k] || []), ...(custom[k] || [])];
    }
    return { en, map: merged };
  },

  _matchApp(spoken, dict) {
    for (const [appId, aliases] of Object.entries(dict)) {
      for (const a of aliases) {
        if (spoken.includes(a)) return appId;
      }
    }
    return null;
  },

  handle(spokenRaw) {
    const spoken = (spokenRaw || "").toLowerCase().trim();
    if (!spoken) return;
    const d = I18N.dicts[I18N.locale] || I18N.dicts.en;
    const v = d.vcmds;
    const { map } = this.appAliases();
    const findApp = () => this._matchApp(spoken, map) || this._matchApp(spoken, this.appAliases().en);

    // open <app>
    const openWord = [v.open, "launch", "start", "show"].find((w) => spoken.startsWith(w));
    if (openWord) {
      const appId = findApp();
      if (appId) { OS.launchApp(appId); OS.toast("🗣 → " + (d.apps[appId] || appId), "ok"); SFX.play("ok"); return true; }
    }
    // bare app name = open
    const bare = findApp();
    if (bare && spoken.length <= (map[bare] ? Math.max(...map[bare].map(a=>a.length)) : 0) + 2) {
      OS.launchApp(bare); OS.toast("🗣 → " + (d.apps[bare] || bare), "ok"); return true;
    }
    // "ask/say <prompt>" → chat
    const askWord = [v.ask, v.say, "question"].find((w) => spoken.startsWith(w));
    if (askWord) {
      const q = spoken.slice(askWord.length).trim();
      OS.launchApp("chat");
      setTimeout(() => { const inp = document.querySelector("#chat-in"); if (inp) { inp.value = q; AppChat.send(OS.wins.get("chat")); } }, 350);
      return true;
    }
    // "paint <prompt>" → image
    if (spoken.startsWith(v.paint) || spoken.startsWith("draw") || spoken.startsWith("generate image")) {
      const q = spoken.replace(new RegExp("^(" + v.paint + "|draw|generate image)"), "").trim();
      OS.launchApp("image");
      setTimeout(() => { const inp = document.querySelector("#img-prompt"); if (inp) { inp.value = q; document.querySelector("#img-go")?.click(); } }, 350);
      return true;
    }
    // "note <text>"
    if (spoken.startsWith(v.note) || spoken.startsWith("remember")) {
      const t = spoken.replace(/^(note|remember|नोट)/, "").trim();
      const notes = OS.get("notes", []);
      notes.unshift({ id: Date.now(), title: t || "Voice note", body: "🎙 " + (spokenRaw || t), at: Date.now() });
      OS.set("notes", notes);
      OS.toast("🗣 note saved", "ok");
      return true;
    }
    // "task <text>"
    if (spoken.startsWith(v.task) || spoken.startsWith("remind")) {
      const t = spoken.replace(/^(task|remind|काम)/, "").trim();
      const tasks = OS.get("tasks", []);
      tasks.unshift({ id: Date.now(), text: t, done: false });
      OS.set("tasks", tasks);
      OS.toast("🗣 task added", "ok");
      return true;
    }
    // "lock"
    if (spoken.includes(v.lock) || spoken.includes("sécurité") === false && spoken.includes("lock now")) {
      document.getElementById("btn-lock").click();
      return true;
    }
    // "theme"
    if (spoken.includes(v.theme) || spoken.includes("theme")) {
      Themes.cycle();
      return true;
    }
    return false;
  },

  toggle() {
    if (this.on) {
      try { this.rec.stop(); } catch {}
      this.on = false;
      OS.toast("Voice control OFF", "ok");
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { OS.toast("Voice control needs Chrome/Edge", "err"); return; }
    this.rec = new SR();
    this.rec.continuous = true;
    this.rec.interimResults = false;
    this.rec.lang = (I18N.dicts[I18N.locale] || I18N.dicts.en).voice;
    this.rec.onresult = (e) => {
      const last = e.results[e.results.length - 1];
      const txt = last && last[0].transcript;
      if (last && last.isFinal && txt) {
        const handled = this.handle(txt);
        if (!handled) OS.toast('🗣 "' + txt.slice(0, 40) + '" — not a command', "");
      }
    };
    this.rec.onend = () => { if (this.on) { try { this.rec.start(); } catch {} } };
    this.rec.onerror = () => {};
    try {
      this.rec.start();
      this.on = true;
      const d = I18N.dicts[I18N.locale] || I18N.dicts.en;
      OS.toast("🗣 Voice control ON — try: " + d.vcmds.open + " " + d.apps.chat.toLowerCase(), "ok");
      Achievements.flag("voice-router-on");
    } catch { OS.toast("Mic busy — another voice app is active", "err"); }
  },

  /* user-defined aliases: setAlias("cockpit", "chat") → "open cockpit" works */
  setAlias(word, appId) {
    word = String(word || "").toLowerCase().trim();
    if (!word || !(window.JARVIS_APPS || []).some((a) => a.id === appId)) {
      OS.toast("alias needs a word + valid app id", "err");
      return false;
    }
    const all = OS.get("voice-aliases", {});
    (all[appId] = all[appId] || []).push(word);
    OS.set("voice-aliases", all);
    OS.toast(`🗣 "${word}" now opens ${appId}`, "ok");
    return true;
  },

  listAliases() {
    return OS.get("voice-aliases", {});
  },

  clearAliases() {
    OS.del("voice-aliases");
    OS.toast("Voice aliases cleared", "ok");
  },
};

/* topbar mic button injected after unlock */
document.addEventListener("DOMContentLoaded", () => {
  const tbRight = document.querySelector(".tb-right");
  if (!tbRight) return;
  const mic = document.createElement("button");
  mic.id = "btn-voice";
  mic.className = "tb-btn";
  mic.title = "Voice control (universal)";
  mic.textContent = "🗣";
  mic.onclick = () => VoiceRouter.toggle();
  tbRight.prepend(mic);

  const lang = document.createElement("button");
  lang.id = "btn-lang";
  lang.className = "tb-btn";
  lang.title = "Switch language EN/नेपाली/हिन्दी";
  lang.textContent = "🌐";
  lang.onclick = () => I18N.cycle();
  tbRight.prepend(lang);
});
