/* ============================================================
   JARVIS OS — Apps (apps.js)
   AI Chat (stream, vision, voice) · Image Lab · Terminal ·
   Notes · Tasks · Files · System — all real & persistent.
   ============================================================ */

"use strict";

/* ================= helpers ================= */
function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
function fileToDataUrl(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

/* ================= AI CHAT ================= */
const AppChat = {
  history: [],

  launch() {
    const root = el("div");
    root.innerHTML = `
      <div class="app-toolbar">
        <button class="app-btn ghost" id="chat-persona" title="Cycle persona: classic, sassy, poet, pirate, zen">🎭</button>
        <select class="app-select" id="chat-engine">
          <option value="auto">⚡ AUTO (Puter → Pollinations)</option>
          <option value="gpt-5-nano">gpt-5-nano</option>
          <option value="gpt-5">gpt-5</option>
          <option value="claude-sonnet-5">claude-sonnet-5</option>
          <option value="gemini-2.5-flash">gemini-2.5-flash</option>
          <option value="deepseek-chat">deepseek-chat</option>
        </select>
        <button class="app-btn ghost" id="chat-mic" title="Voice input">🎙</button>
        <button class="app-btn ghost" id="chat-speak" title="Read last answer aloud">🔊</button>
        <button class="app-btn ghost" id="chat-attach" title="Attach image (vision)">📎</button>
        <button class="app-btn ghost" id="chat-clear" title="Clear conversation">🗑</button>
        <input type="file" id="chat-file" accept="image/*" hidden />
      </div>
      <div class="chat-log" id="chat-log"></div>
      <div class="chat-attach-preview" id="chat-preview" hidden>
        <img id="chat-preview-img" alt="attachment" />
        <span class="mini-btn" id="chat-preview-x">remove ✕</span>
      </div>
      <div class="term-in-row" style="margin-top:10px">
        <span class="term-prompt">you@jarvis:~$</span>
        <input class="term-in" id="chat-in" placeholder="Ask JARVIS anything…  (/image <prompt> to paint)" />
        <button class="app-btn" id="chat-send">Send ▸</button>
      </div>`;

    const win = OS.makeWin({ id: "chat", title: "AI CHAT — KEYLESS", icon: "🤖", body: root, w: 700, h: 560 });
    this.wire(win);
    return win;
  },

  wire(win) {
    const $ = (s) => win.body.querySelector(s);
    const log = $("#chat-log"), input = $("#chat-in");
    let imageDataUrl = null, listening = false, rec = null;

    this.renderHistory(win);

    $("#chat-send").onclick = () => this.send(win);
    input.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this.send(win); } };

    $("#chat-engine").value = OS.get("chat-engine", "auto");
    $("#chat-engine").onchange = (e) => { OS.set("chat-engine", e.target.value); OS.toast("Engine: " + e.target.value, "ok"); };

    $("#chat-clear").onclick = () => { this.history = []; OS.del("chat-history"); log.innerHTML = ""; OS.toast("Conversation cleared", "ok"); };

    $("#chat-attach").onclick = () => $("#chat-file").click();
    $("#chat-file").onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      imageDataUrl = await fileToDataUrl(f);
      $("#chat-preview-img").src = imageDataUrl;
      $("#chat-preview").hidden = false;
      OS.toast("Image attached — JARVIS will see it", "ok");
    };
    $("#chat-preview-x").onclick = () => { imageDataUrl = null; $("#chat-preview").hidden = true; };

    $("#chat-persona").onclick = () => { Personas.cycle(); $("#chat-persona").style.boxShadow = "0 0 12px var(--cyan)"; setTimeout(() => $("#chat-persona").style.boxShadow = "", 900); };
    if (window.Personas) $("#chat-persona").title = "Persona: " + Personas.list[Personas.get()].name;

    $("#chat-speak").onclick = () => {
      const last = [...this.history].reverse().find((m) => m.role === "assistant");
      if (last) AICore.speak(last.content); else OS.toast("No answer to read yet", "err");
    };

    $("#chat-mic").onclick = () => {
      if (listening) { rec && rec.stop(); return; }
      listening = true;
      if (window.Achievements) Achievements.flag("voice-used+1");
      $("#chat-mic").textContent = "⏺";
      rec = AICore.listen(
        (txt) => { input.value = txt; },
        () => { listening = false; $("#chat-mic").textContent = "🎙"; if (input.value.trim()) this.send(win); }
      );
    };
  },

  bubble(win, role, text) {
    const b = el("div", "bubble " + (role === "user" ? "user" : "ai"));
    b.textContent = text;
    win.body.querySelector("#chat-log").appendChild(b);
    win.body.querySelector("#chat-log").scrollTop = 1e9;
    return b;
  },

  renderHistory(win) {
    const log = win.body.querySelector("#chat-log");
    log.innerHTML = "";
    if (!this.history.length) {
      log.appendChild(el("div", "bubble ai", 'JARVIS online. I run keyless — no account, no API key. Ask me anything, attach an image (📎) for vision, or type /image a neon city to paint.'));
      return;
    }
    for (const m of this.history) {
      const b = this.bubble(win, m.role, m.content);
      if (m.image) {
        const img = el("img"); img.src = m.image; img.alt = "generated";
        b.appendChild(img);
      }
    }
  },

  async send(win) {
    const input = win.body.querySelector("#chat-in");
    const preview = win.body.querySelector("#chat-preview");
    const sendBtn = win.body.querySelector("#chat-send");
    let text = input.value.trim();
    if (!text && !preview.hidden) text = "Describe this image.";
    if (!text) return;
    input.value = "";

    // /image command
    if (text.startsWith("/image ")) {
      const prompt = text.slice(7).trim();
      this.bubble(win, "user", "🎨 /image " + prompt);
      this.history.push({ role: "user", content: "/image " + prompt });
      const b = this.bubble(win, "ai", "Painting…");
      const dots = el("div", "typing-dots", "<span></span><span></span><span></span>");
      b.appendChild(dots);
      sendBtn.disabled = true;
      try {
        const url = await AICore.generateImage(prompt);
        b.textContent = "";
        const img = el("img"); img.src = url; img.alt = prompt;
        b.appendChild(img);
        b.appendChild(el("span", "b-meta", "engine: keyless txt2img"));
        this.history.push({ role: "assistant", content: "[image] " + prompt, image: url });
        OS.set("chat-history", this.history);
        OS.storeFile("images", prompt.slice(0, 40) + ".png", url, "image");
        Achievements.flag("images-made+1");
      } catch {
        b.textContent = "Image generation failed — try again.";
      }
      sendBtn.disabled = false;
      return;
    }    const attach = preview.hidden ? null : win.body.querySelector("#chat-preview-img").src;
    this.bubble(win, "user", text + (attach ? "  [🖼 image attached]" : ""));
    this.history.push({ role: "user", content: text });
    if (window.Achievements) { Achievements.flag("chat-user-msgs+1"); if (attach) Achievements.flag("visions-sent+1"); }
    AICore.stopSpeak(); // don't let TTS read over an active answer

    const aiB = this.bubble(win, "ai", "");
    const dots = el("div", "typing-dots", "<span></span><span></span><span></span>");
    aiB.appendChild(dots);
    sendBtn.disabled = true;
    win.body.querySelector("#chat-in").focus();

    const msgs = [
      { role: "system", content: (window.Personas ? Personas.sys() : "You are JARVIS — concise, sharp, slightly witty.") },
      ...this.history.slice(-14).map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content })),
    ];

    let full = "";
    const started = Date.now();
    await AICore.chat(msgs, {
      model: OS.get("chat-engine", "auto"),
      imageDataUrl: attach || undefined,
      onToken: (t) => {
        if (!full) aiB.textContent = "";
        full += t;
        aiB.textContent = full;
        win.body.querySelector("#chat-log").scrollTop = 1e9;
      },
      onDone: (engine) => {
        dots.remove();
        aiB.appendChild(el("span", "b-meta", engine + " · " + ((Date.now() - started) / 1000).toFixed(1) + "s"));
        const cp = el("button", "", "⧉ copy"); cp.onclick = () => { navigator.clipboard.writeText(full); OS.toast("Copied", "ok"); };
        const acts = el("div", "b-acts"); acts.appendChild(cp);
        aiB.appendChild(acts);
        this.history.push({ role: "assistant", content: full });
        OS.set("chat-history", this.history);
        sendBtn.disabled = false;
      },
      onError: (msg) => {
        dots.remove();
        aiB.textContent = msg;
        sendBtn.disabled = false;
      },
    });
    if (attach) { preview.hidden = true; win.body.querySelector("#chat-preview-x").click(); }
  },

  restore() {
    this.history = OS.get("chat-history", []);
  },
};
AppChat.restore();

/* ================= IMAGE LAB ================= */
const AppImage = {
  launch() {
    const root = el("div");
    root.innerHTML = `
      <div class="app-toolbar">
        <input class="app-input" id="img-prompt" style="flex:1;min-width:200px" placeholder="A cyberpunk skyline at dusk, neon rain…" />
        <select class="app-select" id="img-size">
          <option value="1024x1024">1024 × 1024</option>
          <option value="1280x720">1280 × 720</option>
          <option value="720x1280">720 × 1280</option>
        </select>
        <button class="app-btn" id="img-go">Paint 🎨</button>
      </div>
      <div id="img-status" class="diag" style="margin-bottom:8px"></div>
      <div class="gallery" id="img-gallery"></div>`;

    const win = OS.makeWin({ id: "image", title: "IMAGE LAB — KEYLESS TXT2IMG", icon: "🎨", body: root, w: 640, h: 520 });
    const gallery = win.body.querySelector("#img-gallery");

    (OS.get("gallery", [])).slice().reverse().forEach((g) => this.addCard(win, g));

    win.body.querySelector("#img-go").onclick = async () => {
      const prompt = win.body.querySelector("#img-prompt").value.trim();
      if (!prompt) return;
      const [w, h] = win.body.querySelector("#img-size").value.split("x");
      const status = win.body.querySelector("#img-status");
      status.textContent = "Painting… (keyless engine warming up)";
      try {
        let url = await AICore.generateImage(prompt);
        if (w !== "1024" || h !== "1024") {
          url = "https://image.pollinations.ai/prompt/" + encodeURIComponent(prompt) +
            `?width=${w}&height=${h}&nologo=true&seed=` + Math.floor(Math.random() * 1e6);
        }
        status.textContent = "Done.";
        const rec = { prompt, url, at: Date.now() };
        const all = OS.get("gallery", []); all.push(rec); OS.set("gallery", all);
        OS.storeFile("images", prompt.slice(0, 40) + ".png", url, "image");
        this.addCard(win, rec);
      } catch {
        status.textContent = "Generation failed — try again.";
      }
    };
    return win;
  },

  addCard(win, rec) {
    const g = el("div", "g-item");
    const img = el("img"); img.src = rec.url; img.alt = rec.prompt; img.loading = "lazy";
    const cap = el("div", "g-cap", rec.prompt);
    const acts = el("div", "g-acts");
    const dl = el("button", "mini-btn", "⬇"); dl.title = "Download";
    dl.onclick = (e) => {
      e.stopPropagation();
      const a = document.createElement("a");
      a.href = rec.url; a.download = "jarvis-" + rec.prompt.slice(0, 24).replace(/\W+/g, "-") + ".png";
      a.target = "_blank"; a.click();
    };
    acts.appendChild(dl);
    g.append(img, cap, acts);
    win.body.querySelector("#img-gallery").prepend(g);
  },
};

/* ================= TERMINAL ================= */
const AppTerminal = {
  launch() {
    const root = el("div");
    root.innerHTML = `
      <div class="term-out" id="term-out">JARVIS shell — type <span class="hl">help</span> for commands.\n</div>
      <div class="term-in-row">
        <span class="term-prompt">operator@jarvis:~$</span>
        <input class="term-in" id="term-in" autocomplete="off" spellcheck="false" />
      </div>`;

    const win = OS.makeWin({ id: "terminal", title: "TERMINAL — JARVIS SHELL", icon: "⌨️", body: root, w: 640, h: 420 });
    const out = win.body.querySelector("#term-out");
    const input = win.body.querySelector("#term-in");
    const print = (txt, cls) => {
      out.innerHTML += cls ? `<span class="${cls}">${txt}</span>\n` : txt + "\n";
      out.scrollTop = out.scrollHeight;
    };
    setTimeout(() => input.focus(), 80);

    const cmds = {
      help: () => print("Commands:\n  help, about, whoami, date, echo <txt>, clear\n  ai <prompt>        — ask the keyless AI\n  img <prompt>       — generate an image\n  lib add <t> | <txt> · lib ask <q> · lib list\n  mesh join <room> <pass> [nick] · mesh msg <t>\n  note add <title> | <body>, notes\n  task add <text>, tasks\n  status, engines, open <app>, lock, pin <4-8digits>, tour\n  wiki <topic>, fortune\n  theme, wall, sfx, hum, wake, lang, voice, offline, themes\n  alias add <word> <appid> · alias list — custom voice words\n  persona — cycle AI moods · stats — activity\n  backup — export all data · vault — secrets\n  singularity — ??? (or find it yourself…)"),
      about: () => print("JARVIS OS v2.1 — browser-native AI operating system.\nKeyless AI · RAG library · E2EE mesh · vision · voice · terminal · files."),
      whoami: () => print("operator — " + (navigator.userAgent.includes("Mobile") ? "mobile" : "desktop") + " session · " + navigator.language),
      date: () => print(new Date().toString()),
      clear: () => { out.innerHTML = ""; },
      status: () => print(`[OK] engines: ${AICore.puterReady() ? "puter ✓" : "puter (loading)"} + pollinations\n[OK] online: ${navigator.onLine}\n[OK] windows open: ${OS.wins.size}\n[OK] library docs: ${(OS.get("lib-docs", [])).length} (${(OS.get("lib-docs", [])).reduce((a, d) => a + d.chunks.length, 0)} chunks)\n[OK] mesh: ${AppMesh._room ? "#" + AppMesh._room + " (AES-256-GCM)" : "not joined"}\n[OK] storage used: ~${(JSON.stringify(localStorage).length / 1024).toFixed(1)} KB`),
      engines: () => print("1. puter.js  — keyless, 500+ models\n2. pollinations — keyless open endpoint\nAuto-fallback chain active."),
      notes: () => print(OS.get("notes", []).map((n, i) => `${i + 1}. ${n.title}`).join("\n") || "(no notes)"),
      tasks: () => print(OS.get("tasks", []).map((t, i) => `[${t.done ? "x" : " "}] ${i + 1}. ${t.text}`).join("\n") || "(no tasks)"),
      lock: () => document.getElementById("btn-lock").click(),
      open: (a) => {
        const app = (window.JARVIS_APPS || []).find((x) => x.id === a || x.name.toLowerCase() === a);
        if (app) { OS.launchApp(app.id); print("opening " + app.name + "…", "ok"); }
        else print("no such app: " + a, "err");
      },
    };

    const run = async (raw) => {
      const line = raw.trim();
      if (!line) return;
      if (window.Achievements) Achievements.flag("term-cmds+1");
      print(`<span class="hl">operator@jarvis:~$</span> ${line.replace(/</g, "&lt;")}`);
      const [cmd, ...rest] = line.split(/\s+/);
      const arg = rest.join(" ");

      if (cmds[cmd]) { cmds[cmd](arg); return; }

      switch (cmd) {
        case "echo": print(arg.replace(/</g, "&lt;")); break;
        case "pin": OS.setPin(arg); break;
        case "lib": {
          if (!arg) { print("usage: lib add <title> | <text>  ·  lib ask <question>  ·  lib list", "err"); break; }
          if (arg.startsWith("add ")) {
            const m = arg.slice(4).match(/^([^|]+)\|?([\s\S]*)$/);
            if (!m) { print("usage: lib add <title> | <text>", "err"); break; }
            AppLibrary.addDoc(m[1].trim(), m[2].trim() || m[1].trim(), "terminal") ? print("indexed ✓", "ok") : print("failed", "err");
          } else if (arg.startsWith("ask ")) {
            const q = arg.slice(4);
            print("searching library…");
            const { answer, hits } = await AppLibrary.ask(q);
            print(answer || "(no response)", answer ? "ok" : "err");
            hits.slice(0, 3).forEach((h, i) => print(`[${i + 1}] ${h.doc.name} · ${h.text.slice(0, 80)}…`, "dim"));
          } else if (arg === "list") {
            print(AppLibrary.docs().map((d) => `📄 ${d.name} — ${d.chunks.length} chunks`).join("\n") || "(library empty)");
          } else print("unknown lib subcommand", "err");
          break;
        }
        case "mesh": {
          if (arg.startsWith("join ")) {
            const m = arg.slice(5).match(/^(\S+)\s+(\S+)(?:\s+(\S+))?$/);
            if (!m) { print("usage: mesh join <room> <passphrase> [nick]", "err"); break; }
            await AppMesh.join(m[1], m[2], m[3] || "operator");
            print(`joined #${m[1]} — E2EE active`, "ok");
          } else if (arg.startsWith("msg ")) {
            await AppMesh.send(arg.slice(4));
            print("sent (encrypted) ✓", "ok");
          } else if (arg === "leave") {
            AppMesh.leave(); print("left mesh", "ok");
          } else print("usage: mesh join <room> <pass> [nick] · mesh msg <text> · mesh leave", "err");
          break;
        }
        case "tour": {
          OS.set("tour-done", false);
          Tour.dismiss();
          Tour.bubble();
          print("JARVIS is requesting your attention…", "hl");
          break;
        }
        case "theme": Themes.cycle(); print("theme cycled ✓", "ok"); break;
        case "wall": Wallpaper.cycle(); print("wallpaper: " + Wallpaper.mode, "ok"); break;
        case "sfx": SFX.toggle(); break;
        case "hum": Hum.toggle(); break;
        case "wake": WakeWord.toggle(); break;
        case "persona": Personas.cycle(); print("persona: " + Personas.list[Personas.get()].name, "ok"); break;
        case "stats": Stats.launch(); print("stats opened", "ok"); break;
        case "backup": Backup.launch(); break;
        case "vault": Vault.launch(); break;
        case "search": GlobalSearch.run(arg); break;
        case "briefing": Briefing.launch(); break;
        case "singularity": Singularity.trigger(); print("…", "hl"); break;
        case "lang": I18N.cycle(); print("language: " + I18N.dicts[I18N.locale].name, "ok"); break;
        case "voice": VoiceRouter.toggle(); break;
        case "themes": OS.launchApp("marketplace"); print("marketplace opened", "ok"); break;
        case "alias": {
          // usage: alias add <word> <appid> · alias list · alias clear
          if (arg.startsWith("add ")) {
            const m = arg.slice(4).match(/^(\S+)\s+(\S+)$/);
            if (!m) { print("usage: alias add <word> <appid>", "err"); break; }
            VoiceRouter.setAlias(m[1], m[2]) ? print(`"${m[1]}" → ${m[2]} ✓`, "ok") : print("failed — check app id", "err");
          } else if (arg === "list") {
            const all = VoiceRouter.listAliases();
            print(Object.entries(all).map(([app, words]) => `${app}: ${words.join(", ")}`).join("\n") || "(no custom aliases)");
          } else if (arg === "clear") {
            VoiceRouter.clearAliases();
          } else print("usage: alias add <word> <appid> · alias list · alias clear", "err");
          break;
        }
        case "synclog": {
          if (typeof SyncBridge === "undefined") { print("sync core not loaded", "err"); break; }
          const s = SyncBridge.stats();
          print(`actor: ${s.actor}\ndomain: ${s.domain}\nnotes: ${s.notes}\nop log: ${s.logOps} ops\nlamport: ${s.lamport}\nchannel: ${s.channel ? "BroadcastChannel ✓" : "none (single tab)"}`, "");
          print("notes drafts are CRDT-synced across tabs — open a second tab and type.", "ok");
          break;
        }
        case "offline": {
          if (AICore.webllm.ready) { AICore.webllmDisable(); print("offline AI disabled", "ok"); }
          else {
            print("enabling offline AI — model downloads into browser cache (~1GB, one time)…");
            const ok = await AICore.webllmEnable((p) => { print(`download: ${Math.round((p || 0) * 100)}%`); });
            print(ok ? "offline AI READY — internet no longer required for chat" : "failed — see toast", ok ? "ok" : "err");
          }
          break;
        }
        case "collab": {
          // Shared terminal over mesh: 'collab on' shares, others run with !cmd
          if (arg === "on") {
            if (!AppMesh._key) { print("join a mesh room first: mesh join <room> <pass>", "err"); break; }
            this._collab = true;
            const origRecv = AppMesh._recv.bind(AppMesh);
            AppMesh._recv = async (env) => {
              const pt = await AppMesh.decrypt(env.ct);
              if (pt && pt.startsWith("!")) {
                const line = pt.slice(1);
                print(`<span class="hl">[peer]</span> $ ${line.replace(/</g, "&lt;")}`, "");
                const outEl = out.innerHTML;
                await run(line); // execute peer command locally, output shown
                print("[peer done]", "ok");
                return;
              }
              origRecv(env);
            };
            print("collab ON — peers can run !cmd on your machine (E2EE)", "ok");
          } else if (arg === "off") {
            this._collab = false;
            print("collab off", "ok");
          } else {
            print("usage: collab on|off — share this terminal with mesh peers (they prefix commands with !)", "err");
          }
          break;
        }
        case "ai": {
          if (!arg) { print("usage: ai <prompt>", "err"); break; }
          print("thinking…");
          const a = await AICore.complete(arg);
          print(a || "(no response — engines busy, retry)", a ? "ok" : "err");
          break;
        }
        case "wiki": {
          if (!arg) { print("usage: wiki <topic>", "err"); break; }
          const a = await AICore.complete(arg, "Answer in 3 short encyclopedia-style sentences.");
          print(a || "(no response)", a ? "ok" : "err");
          break;
        }
        case "fortune": {
          const a = await AICore.complete("Give me one original, short futuristic proverb.", "Answer with the proverb only.");
          print('"' + (a || "The best system is the one that ships.") + '"', "hl");
          break;
        }
        case "img": {
          if (!arg) { print("usage: img <prompt>", "err"); break; }
          print("painting…");
          const url = await AICore.generateImage(arg);
          OS.storeFile("images", arg.slice(0, 40) + ".png", url, "image");
          const g = OS.get("gallery", []); g.push({ prompt: arg, url, at: Date.now() }); OS.set("gallery", g);
          print("done → saved to Files & Image Lab: " + url, "ok");
          break;
        }
        case "note": {
          const m = arg.match(/^add\s+([^|]+)\|?(.*)$/);
          if (!m) { print("usage: note add <title> | <body>", "err"); break; }
          const notes = OS.get("notes", []);
          notes.push({ id: Date.now(), title: m[1].trim(), body: (m[2] || "").trim(), at: Date.now() });
          OS.set("notes", notes);
          print("note saved ✓ (open the Notes app)", "ok");
          break;
        }
        case "task": {
          if (!arg) { print("usage: task add <text>", "err"); break; }
          const tasks = OS.get("tasks", []);
          tasks.push({ id: Date.now(), text: arg, done: false });
          OS.set("tasks", tasks);
          print("task added ✓", "ok");
          break;
        }
        default: print(`command not found: ${cmd} — try help`, "err");
      }
    };

    input.onkeydown = async (e) => {
      if (e.key !== "Enter") return;
      const line = input.value;
      input.value = "";
      // peer execution: '!cmd' broadcasts encrypted command to mesh room
      if (line.startsWith("!")) {
        if (!AppMesh._key) { print("join a mesh room first (mesh join …) to use ! commands", "err"); return; }
        await AppMesh.send("!" + line.slice(1));
        print(`<span class="hl">[you→peers]</span> $ ${line.slice(1).replace(/</g, "&lt;")}`, "");
        Achievements.flag("collab-uses");
        return;
      }
      run(line);
    };
    return win;
  },
};

/* ================= NOTES ================= */
const AppNotes = {
  launch() {
    const root = el("div");
    root.innerHTML = `
      <div class="app-toolbar">
        <input class="app-input" id="note-title" style="flex:1;min-width:140px" placeholder="Title" />
        <button class="app-btn" id="note-add">+ Add</button>
      </div>
      <textarea class="app-textarea" id="note-body" placeholder="Write anything — it persists in this browser forever."></textarea>
      <div id="notes-list" style="margin-top:12px"></div>`;

    const win = OS.makeWin({ id: "notes", title: "NOTES — SYNCED", icon: "📝", body: root, w: 560, h: 480 });
    this.render(win);

    /* CRDT live sync (v2.9.3): the compose draft is a synced text field —
       type in one tab, watch it appear in another; it survives reloads. */
    const draftEl = win.body.querySelector("#note-body");
    if (typeof OSNotesSync !== "undefined" && draftEl) {
      OSNotesSync.bind("draft", draftEl, "");
    }

    win.body.querySelector("#note-add").onclick = () => {
      const t = win.body.querySelector("#note-title").value.trim();
      const b = win.body.querySelector("#note-body").value.trim();
      if (!t && !b) return;
      const notes = OS.get("notes", []);
      notes.unshift({ id: Date.now(), title: t || "Untitled", body: b, at: Date.now() });
      OS.set("notes", notes);
      win.body.querySelector("#note-title").value = "";
      win.body.querySelector("#note-body").value = "";
      if (typeof SyncBridge !== "undefined") SyncBridge.edit("draft", ""); // clear synced draft
      this.render(win);
      OS.toast("Note saved", "ok");
    };
    return win;
  },

  render(win) {
    const list = win.body.querySelector("#notes-list");
    const notes = OS.get("notes", []);
    list.innerHTML = "";
    if (!notes.length) { list.innerHTML = '<div class="diag">No notes yet — write your first one above.</div>'; return; }
    for (const n of notes) {
      const item = el("div", "note-item");
      item.innerHTML = `<div class="n-title">${n.title.replace(/</g, "&lt;")}<span class="n-body">${(n.body || "").replace(/</g, "&lt;")}</span></div>`;
      const del = el("button", "mini-btn danger", "✕");
      del.onclick = () => {
        OS.set("notes", OS.get("notes", []).filter((x) => x.id !== n.id));
        this.render(win);
      };
      item.appendChild(del);
      list.appendChild(item);
    }
  },
};

/* ================= TASKS ================= */
const AppTasks = {
  launch() {
    const root = el("div");
    root.innerHTML = `
      <div class="app-toolbar">
        <input class="app-input" id="task-in" style="flex:1;min-width:180px" placeholder="New task…" />
        <button class="app-btn" id="task-add">+ Add</button>
        <button class="app-btn ghost" id="task-ai" title="AI writes 5 subtasks for the first open task">✨ AI break down</button>
      </div>
      <div id="tasks-list"></div>`;

    const win = OS.makeWin({ id: "tasks", title: "TASKS", icon: "✅", body: root, w: 520, h: 440 });
    this.render(win);

    const add = () => {
      const v = win.body.querySelector("#task-in").value.trim();
      if (!v) return;
      const tasks = OS.get("tasks", []);
      tasks.unshift({ id: Date.now(), text: v, done: false });
      OS.set("tasks", tasks);
      win.body.querySelector("#task-in").value = "";
      this.render(win);
    };
    win.body.querySelector("#task-add").onclick = add;
    win.body.querySelector("#task-in").onkeydown = (e) => { if (e.key === "Enter") add(); };

    win.body.querySelector("#task-ai").onclick = async () => {
      const tasks = OS.get("tasks", []);
      const open = tasks.find((t) => !t.done);
      if (!open) { OS.toast("No open task to break down", "err"); return; }
      OS.toast("JARVIS is thinking…", "ok");
      const a = await AICore.complete(
        `Break this task into 5 short concrete subtasks, one per line, no numbering: "${open.text}"`
      );
      if (!a) { OS.toast("AI unavailable — retry", "err"); return; }
      const lines = a.split("\n").map((s) => s.replace(/^[-*\d.\s]+/, "").trim()).filter(Boolean).slice(0, 5);
      const all = OS.get("tasks", []);
      lines.forEach((t, i) => all.splice(all.findIndex((x) => x.id === open.id) + 1 + i, 0, { id: Date.now() + i, text: "↳ " + t, done: false }));
      OS.set("tasks", all);
      this.render(win);
      OS.toast("Added " + lines.length + " AI subtasks", "ok");
    };
    return win;
  },

  render(win) {
    const list = win.body.querySelector("#tasks-list");
    const tasks = OS.get("tasks", []);
    list.innerHTML = "";
    if (!tasks.length) { list.innerHTML = '<div class="diag">Nothing to do. Add a task — or let AI break one down.</div>'; return; }
    for (const t of tasks) {
      const item = el("div", "task-item" + (t.done ? " done" : ""));
      const chk = el("input", "task-check");
      chk.type = "checkbox";
      chk.checked = t.done;
      chk.onchange = () => {
        const all = OS.get("tasks", []);
        const x = all.find((x) => x.id === t.id);
        if (x) { x.done = chk.checked; OS.set("tasks", all); }
        item.classList.toggle("done", chk.checked);
      };
      const title = el("div", "t-title", t.text.replace(/</g, "&lt;"));
      const del = el("button", "mini-btn danger", "✕");
      del.onclick = () => {
        OS.set("tasks", OS.get("tasks", []).filter((x) => x.id !== t.id));
        this.render(win);
      };
      item.append(chk, title, del);
      list.appendChild(item);
    }
  },
};

/* ================= FILES ================= */
const AppFiles = {
  launch() {
    const root = el("div");
    root.innerHTML = `
      <div class="app-toolbar">
        <span class="diag">Documents, images & voice memos created in JARVIS — stored in your browser.</span>
      </div>
      <div id="files-list"></div>
      <div class="app-toolbar" style="margin-top:14px">
        <button class="app-btn ghost" id="memo-rec">🎙 Record memo</button>
        <span class="diag" id="memo-status"></span>
      </div>`;

    const win = OS.makeWin({ id: "files", title: "FILES", icon: "🗂", body: root, w: 600, h: 460 });
    this.render(win);

    // Voice memo recorder — real MediaRecorder
    let mediaRec = null, chunks = [];
    win.body.querySelector("#memo-rec").onclick = async () => {
      const btn = win.body.querySelector("#memo-rec");
      const st = win.body.querySelector("#memo-status");
      if (mediaRec && mediaRec.state === "recording") {
        mediaRec.stop();
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRec = new MediaRecorder(stream);
        chunks = [];
        mediaRec.ondataavailable = (e) => chunks.push(e.data);
        mediaRec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunks, { type: mediaRec.mimeType || "audio/webm" });
          fileToDataUrl(blob).then((url) => {
            OS.storeFile("memos", "memo-" + new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-") + ".webm", url, "audio");
            this.render(win);
            st.textContent = "Memo saved ✓";
            if (window.Achievements) Achievements.flag("memos-made+1");
          });
        };
        mediaRec.start();
        btn.textContent = "⏺ Stop";
        st.textContent = "Recording…";
      } catch {
        OS.toast("Mic permission denied", "err");
      }
    };
    return win;
  },

  render(win) {
    const list = win.body.querySelector("#files-list");
    const files = OS.get("files", []);
    list.innerHTML = "";
    if (!files.length) { list.innerHTML = '<div class="diag">Empty. Generate an image (🎨) or record a memo (🎙).</div>'; return; }
    for (const f of files) {
      const item = el("div", "note-item");
      const ico = f.kind === "image" ? "🖼" : f.kind === "audio" ? "🎙" : "📄";
      item.innerHTML = `<div class="n-title">${ico} ${f.name}<span class="n-body">${new Date(f.at).toLocaleString()}</span></div>`;
      const open = el("button", "mini-btn", "open");
      open.onclick = () => {
        const w2 = window.open();
        if (f.kind === "image" || f.kind === "audio") {
          w2.document.write(f.kind === "image"
            ? `<body style="background:#030711;display:grid;place-items:center;margin:0"><img src="${f.url}" style="max-width:100%"></body>`
            : `<body style="background:#030711;display:grid;place-items:center;margin:0"><audio controls src="${f.url}"></audio></body>`);
        } else {
          w2.document.write(`<pre style="color:#9db4d0;background:#030711;padding:20px;white-space:pre-wrap">${f.text || ""}</pre>`);
        }
      };
      const dl = el("button", "mini-btn", "⬇");
      dl.onclick = () => {
        const a = document.createElement("a"); a.href = f.url; a.download = f.name; a.click();
      };
      const del = el("button", "mini-btn danger", "✕");
      del.onclick = () => {
        OS.set("files", OS.get("files", []).filter((x) => x.id !== f.id));
        this.render(win);
      };
      item.append(open, dl, del);
      list.appendChild(item);
    }
  },
};

/* store into Files app (images / audio / docs) */
OS.storeFile = function (kindDir, name, url, kind, text) {
  const files = OS.get("files", []);
  files.unshift({ id: Date.now(), dir: kindDir, name, url, kind, at: Date.now(), text });
  OS.set("files", files.slice(0, 60));
};

/* ================= SYSTEM (About + diagnostics) ================= */
const AppAbout = {
  launch() {
    const root = el("div");
    const nav = navigator.userAgent;
    const mem = navigator.deviceMemory || performance?.memory?.jsHeapSizeLimit ? "~" : "";
    root.innerHTML = `
      <div class="diag">
        <b>JARVIS OS v2.0</b> — browser-native AI operating system<br>
        Kernel: window manager + command palette + boot/lock<br>
        AI: <b>keyless</b> — Puter.js → Pollinations auto-fallback<br>
        Vision: ✓ image understanding · /image: ✓ txt2img<br>
        Voice: ✓ mic input (Web Speech) + TTS output + memos<br>
        Persistence: localStorage (notes, tasks, chat, files, PIN)<br>
        Offline: service worker + PWA install<br><br>
        <b>Device</b><br>
        CPU cores: ${navigator.hardwareConcurrency || "?"} · Memory hint: ${mem || "?"}<br>
        Language: ${navigator.language} · Online: ${navigator.onLine}<br>
        Screen: ${screen.width}×${screen.height}<br><br>
        <b>Keyboard</b><br>
        <span class="kbd">Ctrl+K</span> command palette · <span class="kbd">Enter</span> send ·
        <span class="kbd">Esc</span> close palette<br><br>
        "The best way to predict the future is to build it." — <i>this OS</i>
      </div>
      <div class="app-toolbar" style="margin-top:16px">
        <button class="app-btn ghost" id="sys-pin">🔐 Set PIN</button>
        <button class="app-btn ghost" id="sys-feedback">📣 Send feedback</button>
        <button class="app-btn danger" id="sys-wipe">⌦ Factory reset</button>
      </div>`;

    const win = OS.makeWin({ id: "about", title: "SYSTEM — DIAGNOSTICS", icon: "🛰", body: root, w: 540, h: 470 });

    win.body.querySelector("#sys-pin").onclick = () => {
      const p = prompt("New PIN (4–8 digits):");
      if (p) OS.setPin(p);
    };
    win.body.querySelector("#sys-feedback").onclick = () => {
      const text = prompt("Feedback — what should JARVIS OS do better?\n(diagnostics are attached automatically)");
      if (!text) return;
      const diag = [
        "## Feedback", "", text, "", "---", "**Diagnostics**",
        `- UA: ${nav}`,`- Theme: ${OS.get("theme", "arc")} · Locale: ${OS.get("locale", "en")}`,
        `- Boots: ${OS.get("boot-count", 0)} · Chat msgs: ${(OS.get("stats", {})["chat-user-msgs"] || 0)}`,
        `- Library docs: ${(OS.get("lib-docs", [])).length} · Storage: ${(JSON.stringify(localStorage).length / 1024).toFixed(1)} KB`,
        `- Online: ${navigator.onLine} · Screen: ${screen.width}x${screen.height}`,
      ].join("\n");
      const url = "https://github.com/silvestargeo-hue/jarvis-os/issues/new?title=" +
        encodeURIComponent("[site] " + text.slice(0, 60)) + "&body=" + encodeURIComponent(diag);
      window.open(url, "_blank");
      OS.toast("Opening GitHub issue with diagnostics…", "ok");
    };
    win.body.querySelector("#sys-wipe").onclick = () => {
      if (confirm("Erase ALL JARVIS data in this browser?")) {
        Object.keys(localStorage).filter((k) => k.startsWith("jarvis.")).forEach((k) => localStorage.removeItem(k));
        location.reload();
      }
    };
    return win;
  },
};

/* ================= Palette commands (app commands registered in OS.buildDock) ================= */
OS.registerCommand({ name: "Lock screen", icon: "🔒", hint: "Lock with PIN", keywords: "lock secure", run: () => document.getElementById("btn-lock").click() });

/* ---- surprise commands ---- */
OS.registerCommand({ name: "Cycle theme", icon: "🎨", hint: "Arc Reactor, Mark XLII, Matrix, Mark III, Ice", keywords: "theme color skin", run: () => { Themes.cycle(); Achievements.flag("theme-changes+1"); } });
OS.registerCommand({ name: "Cycle wallpaper", icon: "🌌", hint: "Stars, nebula, warp", keywords: "wallpaper background", run: () => Wallpaper.cycle() });
OS.registerCommand({ name: "Toggle SFX", icon: "🔊", hint: "Synthesized interface sounds", keywords: "sound sfx mute", run: () => SFX.toggle() });
OS.registerCommand({ name: "Reactor hum", icon: "🎛", hint: "Ambient 50Hz drone — on/off", keywords: "hum ambient noise", run: () => { Hum.toggle(); Achievements.flag("hum-on+1"); } });
OS.registerCommand({ name: "Wake word", icon: "👂", hint: 'Say "Jarvis" to summon chat', keywords: "wake voice listen", run: () => WakeWord.toggle() });
OS.registerCommand({ name: "Daily briefing", icon: "🌅", hint: "Weather + AI morning notes", keywords: "briefing weather morning", run: () => Briefing.launch() });
OS.registerCommand({ name: "Global search", icon: "🔎", hint: "Everything you've made", keywords: "search find everything", run: () => GlobalSearch.launch() });
OS.registerCommand({ name: "Backup & restore", icon: "💾", hint: "Export/import all data as JSON", keywords: "backup export import restore", run: () => Backup.launch() });
OS.registerCommand({ name: "Achievements", icon: "🏆", hint: "Your unlock gallery", keywords: "achievements trophies goals", run: () => Achievements.launch() });
OS.registerCommand({ name: "Code Studio", icon: "💻", hint: "AI builds apps for you", keywords: "code studio build app html", run: () => OS.launchApp("code") });
OS.registerCommand({ name: "System stats", icon: "📊", hint: "Your activity dashboard", keywords: "stats activity usage", run: () => Stats.launch() });
OS.registerCommand({ name: "Vault", icon: "🔐", hint: "PIN-gated private notes", keywords: "vault secret private hidden", run: () => { Achievements.flag("vault-uses+1"); Vault.launch(); } });
OS.registerCommand({ name: "Cycle persona", icon: "🎭", hint: "Classic, sassy, poet, pirate, zen", keywords: "persona mood character", run: () => Personas.cycle() });
OS.registerCommand({ name: "Command help", icon: "❔", hint: "Ctrl+K, dock apps, drag windows", keywords: "help shortcuts", run: () => OS.launchApp("about") });
OS.registerCommand({ name: "New note", icon: "📝", hint: "Open Notes app", keywords: "note write", run: () => OS.launchApp("notes") });
OS.registerCommand({ name: "Ask JARVIS", icon: "🤖", hint: "Open AI Chat", keywords: "ai chat ask", run: () => OS.launchApp("chat") });
OS.registerCommand({ name: "Open Library", icon: "📚", hint: "RAG — ask your documents", keywords: "library rag docs knowledge", run: () => OS.launchApp("library") });
OS.registerCommand({ name: "Open Mesh", icon: "🛡", hint: "E2EE encrypted chat", keywords: "mesh encrypted secure chat", run: () => OS.launchApp("mesh") });
OS.registerCommand({ name: "Replay tour", icon: "🧭", hint: "JARVIS shows you around", keywords: "tour guide help welcome", run: () => { OS.set("tour-done", false); Tour.bubble(); } });
OS.registerCommand({ name: "Language / भाषा / भाषा", icon: "🌐", hint: "English · नेपाली · हिन्दी", keywords: "language i18n nepali hindi locale", run: () => I18N.cycle() });
OS.registerCommand({ name: "Voice control", icon: "🗣", hint: "Command the whole OS by voice", keywords: "voice command speak mic", run: () => VoiceRouter.toggle() });
OS.registerCommand({ name: "Settings", icon: "⚙️", hint: "Every preference in one drawer", keywords: "settings preferences options", run: () => OS.launchApp("settings") });
OS.registerCommand({ name: "Send feedback", icon: "📣", hint: "Open a GitHub issue with diagnostics", keywords: "feedback issue report bug", run: () => { OS.launchApp("about"); setTimeout(() => document.getElementById("sys-feedback")?.click(), 250); } });
OS.registerCommand({ name: "Theme Marketplace", icon: "🎭", hint: "10 presets, share codes, community shelf", keywords: "marketplace themes presets share", run: () => OS.launchApp("marketplace") });
OS.registerCommand({ name: "Field manual", icon: "❓", hint: "Every shortcut, command, voice phrase (? key)", keywords: "help manual shortcuts keys commands", run: () => HelpOverlay.toggle() });
OS.registerCommand({ name: "Paint an image", icon: "🎨", hint: "Open Image Lab", keywords: "image paint draw", run: () => OS.launchApp("image") });
OS.registerCommand({ name: "Factory reset", icon: "⌦", hint: "Erase all local data", keywords: "reset wipe erase", run: () => AppAbout.launch().body.querySelector("#sys-wipe").click() });
