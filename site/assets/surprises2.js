/* ============================================================
   JARVIS OS — Surprises part 2 (surprises2.js)
   Voice wake word · daily briefing · global search ·
   backup/restore · stats dashboard · vault · persona modes.
   ============================================================ */

"use strict";

/* ============ 7. VOICE WAKE WORD ("jarvis") ============ */
const WakeWord = {
  on: false, rec: null,
  toggle() {
    if (this.on) {
      try { this.rec.stop(); } catch {}
      this.on = false;
      OS.toast("Wake word OFF", "ok");
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { OS.toast("Needs Chrome/Edge", "err"); return; }
    this.rec = new SR();
    this.rec.continuous = true;
    this.rec.interimResults = true;
    this.rec.lang = "en-US";
    this.rec.onresult = (e) => {
      const txt = Array.from(e.results).map((r) => r[0].transcript).join(" ").toLowerCase();
      if (/\b(jarvis|hey jarvis)\b/.test(txt)) {
        this.rec.stop(); // triggers onend → restart
        OS.launchApp("chat");
        OS.toast('🎙 "Jarvis" detected — listening…', "ok");
        SFX.play("recv");
      }
    };
    this.rec.onend = () => { if (this.on) { try { this.rec.start(); } catch {} } };
    this.rec.onerror = () => {};
    try { this.rec.start(); this.on = true; OS.toast('Say "Jarvis" anywhere — I will open chat', "ok"); if (window.Achievements) Achievements.flag("wake-armed+1"); }
    catch { OS.toast("Mic busy — close other voice apps", "err"); }
  },
};

/* ============ 8. DAILY BRIEFING (keyless weather + AI) ============ */
const Briefing = {
  async run(win) {
    const out = win ? win.body.querySelector("#brf-out") : null;
    const put = (t) => { if (out) out.textContent = t; else OS.toast(t, ""); };
    put("Locating…");
    let place = "your area", wline = "";
    try {
      const g = await (await fetch("https://get.geojs.io/v1/ip/geo.json")).json();
      place = `${g.city || g.region || "somewhere"}, ${g.country || ""}`;
      put(`Weather for ${place}…`);
      const w = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${g.latitude}&longitude=${g.longitude}&current_weather=true`)).json();
      const cw = w.current_weather;
      const dirs = ["N","NE","E","SE","S","SW","W","NW"];
      wline = `${cw.temperature}°C, wind ${Math.round(cw.windspeed)} km/h ${dirs[Math.round(cw.winddirection / 45) % 8]}`;
    } catch { wline = "weather unavailable"; }
    put("JARVIS is composing your briefing…");
    const a = await AICore.complete(
      `My location: ${place}. Weather: ${wline}. Time: ${new Date().toLocaleString()}. ` +
      `Write a 4-line morning briefing: weather line, one practical suggestion, one focus tip, one witty sign-off. No headings.`
    );
    put(a || `${place}: ${wline}. Have a great day, operator.`);
    if (window.AICore) AICore.speak((a || "").slice(0, 300));
  },
  launch() {
    const root = el("div");
    root.innerHTML = `<div class="app-toolbar"><button class="app-btn" id="brf-run">Generate briefing</button></div><pre id="brf-out" class="diag" style="white-space:pre-wrap;font-size:15px;line-height:1.7"></pre>`;
    const win = OS.makeWin({ id: "briefing", title: "DAILY BRIEFING", icon: "🌅", body: root, w: 520, h: 360 });
    win.body.querySelector("#brf-run").onclick = () => this.run(win);
    setTimeout(() => this.run(win), 300);
    return win;
  },
};

/* ============ 9. GLOBAL SEARCH (everything at once) ============ */
const GlobalSearch = {
  run(q) {
    if (!q) return;
    const hits = [];
    (OS.get("notes", [])).forEach((n) => { if ((n.title + " " + (n.body || "")).toLowerCase().includes(q)) hits.push(["📝 Note", n.title]); });
    (OS.get("tasks", [])).forEach((t) => { if (t.text.toLowerCase().includes(q)) hits.push(["✅ Task", t.text]); });
    AppLibrary.docs().forEach((d) => d.chunks.forEach((c, i) => {
      if (c.toLowerCase().includes(q)) hits.push(["📚 Library", `${d.name} · chunk ${i + 1}: ${c.slice(0, 70)}…`]);
    }));
    (OS.get("files", [])).forEach((f) => { if (f.name.toLowerCase().includes(q)) hits.push(["🗂 File", f.name]); });
    (OS.get("chat-history", [])).forEach((m) => { if ((m.content || "").toLowerCase().includes(q)) hits.push(["🤖 Chat", (m.content || "").slice(0, 70)]); });
    (OS.get("gallery", [])).forEach((g) => { if (g.prompt.toLowerCase().includes(q)) hits.push(["🎨 Image", g.prompt]); });

    const root = el("div");
    root.innerHTML = `<div class="diag" style="margin-bottom:10px">Results for "<b>${q.replace(/</g, "&lt;")}</b>" — ${hits.length} found</div>`;
    if (!hits.length) root.innerHTML += '<div class="diag">Nothing found. Try the AI Chat for open-ended questions.</div>';
    hits.slice(0, 50).forEach(([kind, text]) => {
      const item = el("div", "note-item", `<div class="n-title">${kind}<span class="n-body">${String(text).replace(/</g, "&lt;")}</span></div>`);
      root.appendChild(item);
    });
    OS.makeWin({ id: "gsearch", title: "GLOBAL SEARCH", icon: "🔎", body: root, w: 560, h: 420 });
  },
  launch(q) {
    const root = el("div");
    root.innerHTML = `
      <div class="app-toolbar"><input class="app-input" id="gs-in" style="flex:1" placeholder="Search notes, tasks, docs, chat, files, images…" /><button class="app-btn" id="gs-go">Search</button></div>
      <div class="diag">Indexes: notes · tasks · library chunks · files · chat history · image prompts.</div>`;
    const win = OS.makeWin({ id: "gsearch", title: "GLOBAL SEARCH", icon: "🔎", body: root, w: 560, h: 300 });
    const go = () => { const v = win.body.querySelector("#gs-in").value.trim(); if (v) GlobalSearch.run(v); };
    win.body.querySelector("#gs-go").onclick = go;
    win.body.querySelector("#gs-in").onkeydown = (e) => { if (e.key === "Enter") go(); };
    return win;
  },
};

/* ============ 10. BACKUP / RESTORE (portable JSON) ============ */
const Backup = {
  /** Gather every jarvis.* key — including the CRDT sync op log — into one payload. */
  collect() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("jarvis.")) data[k] = localStorage.getItem(k);
    }
    return data;
  },
  exportAll() {
    const data = Backup.collect();
    const blob = new Blob([JSON.stringify({ app: "JARVIS-OS", version: 2, at: Date.now(), data }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "jarvis-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    OS.toast("Backup downloaded", "ok");
    if (window.Achievements) Achievements.flag("backups-made+1");
    SFX.play("ok");
  },
  importFile(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const j = JSON.parse(r.result);
        if (!j.data || j.app !== "JARVIS-OS") throw new Error("not a JARVIS backup");
        Object.entries(j.data).forEach(([k, v]) => { if (k.startsWith("jarvis.")) localStorage.setItem(k, v); });
        OS.toast("Restored — reloading…", "ok");
        setTimeout(() => location.reload(), 900);
      } catch (e) { OS.toast("Invalid backup: " + e.message, "err"); }
    };
    r.readAsText(file);
  },
  launch() {
    const root = el("div");
    root.innerHTML = `
      <div class="diag" style="margin-bottom:12px">Export everything — notes, tasks, chat, library, files, settings — as one JSON file. Import restores it on any device.</div>
      <div class="app-toolbar">
        <button class="app-btn" id="bk-exp">⬇ Export backup</button>
        <button class="app-btn ghost" id="bk-imp">⬆ Import backup</button>
        <input type="file" id="bk-file" accept=".json" hidden />
      </div>`;
    const win = OS.makeWin({ id: "backup", title: "BACKUP & RESTORE", icon: "💾", body: root, w: 480, h: 260 });
    win.body.querySelector("#bk-exp").onclick = () => this.exportAll();
    win.body.querySelector("#bk-imp").onclick = () => win.body.querySelector("#bk-file").click();
    win.body.querySelector("#bk-file").onchange = (e) => { const f = e.target.files[0]; if (f) this.importFile(f); };
    return win;
  },
};

/* ============ 11. STATS DASHBOARD ============ */
const Stats = {
  launch() {
    const notes = (OS.get("notes", [])).length;
    const tasks = OS.get("tasks", []);
    const done = tasks.filter((t) => t.done).length;
    const docs = AppLibrary.docs();
    const chunks = docs.reduce((a, d) => a + d.chunks.length, 0);
    const files = (OS.get("files", [])).length;
    const msgs = (OS.get("chat-history", [])).filter((m) => m.role === "user").length;
    const kb = (JSON.stringify(localStorage).length / 1024).toFixed(1);
    const bars = (n, max) => "█".repeat(Math.max(0, Math.min(20, Math.round((n / Math.max(1, max)) * 20))));
    const root = el("div");
    root.innerHTML = `
      <div class="diag" style="line-height:2">
        <b>OPERATOR ACTIVITY</b><br>
        Notes created ....... ${bars(notes, 20)} ${notes}<br>
        Tasks done .......... ${bars(done, Math.max(1, tasks.length))} ${done}/${tasks.length}<br>
        Chat messages ....... ${bars(msgs, 60)} ${msgs}<br>
        Library docs ........ ${bars(docs.length, 12)} ${docs.length} (${chunks} chunks)<br>
        Files stored ........ ${bars(files, 30)} ${files}<br><br>
        <b>SYSTEM</b><br>
        localStorage ........ ${kb} KB used<br>
        Theme ............... ${OS.get("theme", "arc")}<br>
        Wallpaper ........... ${OS.get("wallpaper", "stars")}<br>
        SFX ................. ${SFX.enabled ? "on" : "off"} · Hum ${Hum.on ? "on" : "off"}<br>
        Uptime .............. ${Math.floor(performance.now() / 60000)} min<br>
        Boot count .......... ${OS.get("boot-count", 0)}
      </div>`;
    const win = OS.makeWin({ id: "stats", title: "SYSTEM STATS", icon: "📊", body: root, w: 500, h: 420 });
    return win;
  },
};

/* ============ 12. VAULT (PIN-gated private notes) ============ */
const Vault = {
  unlock() {
    const pin = OS.get("vault-pin", null);
    if (!pin) {
      const p = prompt("Set a vault PIN (4-8 digits):");
      if (!p || !/^\d{4,8}$/.test(p)) return OS.toast("Vault PIN required", "err");
      OS.set("vault-pin", p);
      OS.toast("Vault PIN set", "ok");
      return this.open();
    }
    const g = prompt("Vault PIN:");
    if (g === String(pin)) this.open();
    else OS.toast("ACCESS DENIED", "err");
  },
  open() {
    const items = OS.get("vault-items", []);
    const root = el("div");
    root.innerHTML = `
      <div class="app-toolbar"><input class="app-input" id="v-in" style="flex:1" placeholder="Secret note — stored behind your vault PIN" /><button class="app-btn" id="v-add">Seal it</button></div>
      <div id="v-list"></div>`;
    const win = OS.makeWin({ id: "vault", title: "VAULT — PRIVATE", icon: "🔐", body: root, w: 520, h: 400 });
    const render = () => {
      const list = win.body.querySelector("#v-list");
      const items = OS.get("vault-items", []);
      list.innerHTML = items.length ? "" : '<div class="diag">Empty. Sealed notes only appear here after the correct PIN.</div>';
      items.forEach((v) => {
        const item = el("div", "note-item", `<div class="n-title">${String(v.text).replace(/</g, "&lt;")}<span class="n-body">${new Date(v.at).toLocaleString()}</span></div>`);
        const del = el("button", "mini-btn danger", "✕");
        del.onclick = () => { OS.set("vault-items", OS.get("vault-items", []).filter((x) => x.id !== v.id)); render(); };
        item.appendChild(del);
        list.appendChild(item);
      });
    };
    win.body.querySelector("#v-add").onclick = () => {
      const t = win.body.querySelector("#v-in").value.trim();
      if (!t) return;
      const items = OS.get("vault-items", []);
      items.unshift({ id: Date.now(), text: t, at: Date.now() });
      OS.set("vault-items", items);
      render();
    };
    render();
    return win;
  },
  launch() { this.unlock(); return null; },
};

/* ============ 13. PERSONA MODES (chat moods) ============ */
const Personas = {
  list: {
    classic: { name: "Classic JARVIS", desc: "Concise, sharp, slightly witty", sys: "You are JARVIS — concise, sharp, slightly witty, like a film butler for a genius." },
    sassy:   { name: "Sassy",   desc: "Sarcastic but helpful", sys: "You are JARVIS with a heavy dose of sarcasm. Still helpful, always roasting lightly." },
    poet:    { name: "Poet",    desc: "Answers in verse", sys: "You are JARVIS the poet. Answer everything in short rhyming verse, max 8 lines." },
    pirate:  { name: "Pirate",  desc: "Arr-r-guably useful", sys: "You are JARVIS as a pirate captain. Speak in pirate dialect while remaining technically correct." },
    zen:     { name: "Zen",     desc: "Calm, minimal wisdom", sys: "You are JARVIS in zen mode. Calm, minimal, occasionally koan-like, but always useful." },
  },
  get() { return OS.get("persona", "classic"); },
  set(key) {
    if (!this.list[key]) return;
    OS.set("persona", key);
    OS.toast("Persona: " + this.list[key].name, "ok");
    SFX.play("ok");
  },
  cycle() {
    const keys = Object.keys(this.list);
    this.set(keys[(keys.indexOf(this.get()) + 1) % keys.length]);
  },
  sys() { return this.list[this.get()].sys; },
};
