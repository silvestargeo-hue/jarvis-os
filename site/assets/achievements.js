/* ============================================================
   JARVIS OS — Achievements (achievements.js)
   20 real achievements tracking genuine OS usage. Unlocks fire
   a toast + chime; viewer shows locked/unlocked with progress.
   ============================================================ */

"use strict";

const Achievements = {
  defs: [
    { id: "first-boot",   icon: "⚡", name: "Ignition",          desc: "Boot JARVIS OS for the first time",          secret: false, test: (s) => s["boot-count"] >= 1 },
    { id: "loyal",        icon: "🔁", name: "Regular",           desc: "Boot the OS 5 times",                        secret: false, test: (s) => s["boot-count"] >= 5 },
    { id: "devoted",      icon: "🌟", name: "True Operator",     desc: "Boot the OS 20 times",                       secret: false, test: (s) => s["boot-count"] >= 20 },
    { id: "first-chat",   icon: "🤖", name: "Hello, JARVIS",     desc: "Send your first AI message",                 secret: false, test: (s) => s["chat-user-msgs"] >= 1 },
    { id: "chatty",       icon: "💬", name: "Chatty Operator",   desc: "Send 25 AI messages",                        secret: false, test: (s) => s["chat-user-msgs"] >= 25 },
    { id: "century",      icon: "💯", name: "Century",           desc: "Send 100 AI messages",                       secret: false, test: (s) => s["chat-user-msgs"] >= 100 },
    { id: "artist",       icon: "🎨", name: "Digital Artist",    desc: "Generate your first image",                  secret: false, test: (s) => s["images-made"] >= 1 },
    { id: "gallery",      icon: "🖼", name: "Curator",           desc: "Generate 10 images",                         secret: false, test: (s) => s["images-made"] >= 10 },
    { id: "visionary",    icon: "👁", name: "Visionary",         desc: "Attach an image for vision analysis",        secret: false, test: (s) => s["visions-sent"] >= 1 },
    { id: "voice",        icon: "🎙", name: "Speaking Terms",    desc: "Use voice input",                            secret: false, test: (s) => s["voice-used"] >= 1 },
    { id: "memo",         icon: "📼", name: "Archivist",         desc: "Record a voice memo",                        secret: false, test: (s) => s["memos-made"] >= 1 },
    { id: "librarian",    icon: "📚", name: "Librarian",         desc: "Index a document in the Library",            secret: false, test: (s) => s["docs-added"] >= 1 },
    { id: "scholar",      icon: "🎓", name: "Scholar",           desc: "Index 5 documents",                          secret: false, test: (s) => s["docs-added"] >= 5 },
    { id: "ragged",       icon: "🔍", name: "Cited",             desc: "Get an answer with citations",               secret: false, test: (s) => s["rag-asks"] >= 1 },
    { id: "cryptographer",icon: "🛡", name: "Cryptographer",     desc: "Join an E2EE mesh room",                     secret: false, test: (s) => s["mesh-joins"] >= 1 },
    { id: "operator",     icon: "⌨️", name: "Shell Access",      desc: "Run a terminal command",                     secret: false, test: (s) => s["term-cmds"] >= 1 },
    { id: "wizard",       icon: "🧙", name: "Terminal Wizard",   desc: "Run 30 terminal commands",                   secret: false, test: (s) => s["term-cmds"] >= 30 },
    { id: "tourist",      icon: "🧭", name: "Sightseer",         desc: "Complete the guided tour",                   secret: false, test: (s) => s["tour-done-flag"] >= 1 },
    { id: "backed-up",    icon: "💾", name: "Safe Keeper",       desc: "Export a backup",                            secret: false, test: (s) => s["backups-made"] >= 1 },
    /* secrets */
    { id: "night-owl",    icon: "🦉", name: "Night Owl",         desc: "???",                                        secret: true,  test: (s) => s["night-use"] >= 1 },
    { id: "theme-dj",     icon: "🎚", name: "Theme DJ",          desc: "???",                                        secret: true,  test: (s) => s["theme-changes"] >= 5 },
    { id: "warp-speed",   icon: "🕳", name: "Beyond the Event Horizon", desc: "???",                                 secret: true,  test: (s) => s["singularity-on"] >= 1 },
    { id: "hummer",       icon: "🎛", name: "Reactor Engineer",  desc: "???",                                        secret: true,  test: (s) => s["hum-on"] >= 1 },
    { id: "vaulted",      icon: "🔐", name: "Secret Keeper",     desc: "???",                                        secret: true,  test: (s) => s["vault-uses"] >= 1 },
  ],

  init() {
    this.defs.forEach((d) => {
      if (OS.get("ach-" + d.id, false)) return;
      try {
        if (d.test(OS._stats || {})) this.award(d.id, true);
      } catch {}
    });
  },

  award(id, silentInit) {
    const def = this.defs.find((d) => d.id === id);
    if (!def || OS.get("ach-" + id, false)) return;
    OS.set("ach-" + id, { at: Date.now() });
    if (!silentInit) {
      OS.toast(`${def.icon} ACHIEVEMENT UNLOCKED — ${def.name}`, "ok");
      SFX.play("ok");
      AICore.speak(`Achievement unlocked: ${def.name}`);
    }
  },

  stat(key, inc = 1) {
    const s = OS.get("stats", {});
    s[key] = (s[key] || 0) + inc;
    OS.set("stats", s);
    // check just-affected achievements
    this.defs.forEach((d) => {
      if (OS.get("ach-" + d.id, false)) return;
      try { if (d.test(s)) this.award(d.id); } catch {}
    });
  },

  flag(key) {
    // supports "key+1" increment syntax; plain key counts up by 1 too
    let k = key, inc = 1;
    const m = String(key).match(/^(.+?)\+(\d+)$/);
    if (m) { k = m[1]; inc = parseInt(m[2], 10); }
    const s = OS.get("stats", {});
    s[k] = (s[k] || 0) + inc;
    OS.set("stats", s);
    this.defs.forEach((d) => {
      if (OS.get("ach-" + d.id, false)) return;
      try { if (d.test(s)) this.award(d.id); } catch {}
    });
  },

  syncSystemStats() {
    const s = OS.get("stats", {});
    s["boot-count"] = OS.get("boot-count", 0);
    if (OS.get("tour-done", false)) s["tour-done-flag"] = 1;
    OS.set("stats", s);
    this.defs.forEach((d) => {
      if (OS.get("ach-" + d.id, false)) return;
      try { if (d.test(s)) this.award(d.id); } catch {}
    });
  },

  launch() {
    const unlocked = this.defs.filter((d) => OS.get("ach-" + d.id, false)).length;
    const root = el("div");
    root.innerHTML = `<div class="diag" style="margin-bottom:12px"><b>${unlocked} / ${this.defs.length}</b> unlocked — progress persists across sessions.</div><div id="ach-list"></div>`;
    const win = OS.makeWin({ id: "achievements", title: "ACHIEVEMENTS", icon: "🏆", body: root, w: 560, h: 500 });
    const list = win.body.querySelector("#ach-list");
    this.defs.forEach((d) => {
      const got = OS.get("ach-" + d.id, false);
      const hidden = d.secret && !got;
      const item = el("div", "note-item" + (got ? "" : " ach-locked"));
      item.innerHTML = `<div class="n-title">${hidden ? "❓" : d.icon} ${hidden ? "SECRET" : d.name}
        <span class="n-body">${hidden ? "Keep exploring…" : d.desc}${got ? ` · <b style="color:var(--cyan)">${new Date(got.at).toLocaleDateString()}</b>` : ""}</span></div>`;
      const badge = el("span", "mini-btn", got ? "✓" : "…");
      badge.style.borderColor = got ? "rgba(52,211,153,.5)" : "";
      item.appendChild(badge);
      list.appendChild(item);
    });
    return win;
  },
};
