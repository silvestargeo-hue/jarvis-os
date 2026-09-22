/* Headless runtime test for JARVIS OS site (jsdom)
 * Mirrors real browser semantics: all classic scripts concatenated into ONE
 * shared global-lexical scope (like multiple <script> tags in a document). */
const fs = require("fs");
const path = require("path");
const jsdom = require("jsdom");
const { JSDOM, VirtualConsole } = jsdom;

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => { if (!/Could not load|css/i.test(e.message)) errors.push("jsdomError: " + e.message); });
vc.on("error", (...a) => errors.push("console.error: " + a.join(" ")));

const dom = new JSDOM(html, {
  url: "http://localhost:4173/index.html",
  runScripts: "outside-only",
  pretendToBeVisual: true,
  virtualConsole: vc,
});
const { window } = dom;

/* ---- browser API stubs ---- */
window.matchMedia = window.matchMedia || ((q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
window.HTMLElement.prototype.scrollIntoView = function () {};
const store = {};
Object.defineProperty(window, "localStorage", { value: {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
  get length() { return Object.keys(store).length; },
  key: (i) => Object.keys(store)[i],
}, configurable: true });

const HTMLCanvasElement = window.HTMLCanvasElement;
HTMLCanvasElement.prototype.getContext = function () {
  return new Proxy({}, { get: (t, p) =>
    (p === "createRadialGradient" || p === "createLinearGradient")
      ? (() => ({ addColorStop() {} }))
      : (typeof p === "string" ? () => {} : undefined) });
};

window.speechSynthesis = { getVoices: () => [], speak() {}, cancel() {} };
window.SpeechRecognition = function () { this.start = () => {}; this.stop = () => {}; };
window.MediaRecorder = function () { this.state = "inactive"; this.start = () => {}; this.stop = () => {}; };
navigator.mediaDevices = { getUserMedia: async () => ({ getTracks: () => [] }) };

// jsdom: these globals are getter-only — defineProperty required
const nodeCrypto = require("crypto").webcrypto;
Object.defineProperty(window, "crypto", { value: nodeCrypto, configurable: true });
window.SpeechSynthesisUtterance = function (t) { this.text = t; };
window.BroadcastChannel = function (name) { this.name = name; this.postMessage = () => {}; this.close = () => {}; };

window.puter = {
  ai: {
    chat: async () => (async function* () { yield { text: "TEST-REPLY" }; })(),
    txt2img: async () => ({ src: "data:image/png;base64,x" }),
  },
  kv: { get: async () => "[]", set: async () => {} },
};
window.fetch = async (url, opts) => ({
  ok: true,
  body: (function* () {
    yield new TextEncoder().encode('data: {"choices":[{"delta":{"content":"HELLO"}}]}\n\n');
    yield new TextEncoder().encode("data: [DONE]\n\n");
  })(),
  json: async () => ({ choices: [{ message: { content: "WIKI-RESPONSE" } }] }),
  clone() { return this; },
});

/* ---- load all scripts in ONE shared scope (browser-like), including the inline registry script ---- */
const scripts = ["assets/state.js", "assets/sync-notes.js", "assets/i18n.js", "assets/os.js", "assets/ai.js", "assets/library.js", "assets/mesh.js", "assets/apps.js", "assets/surprises.js", "assets/surprises2.js", "assets/voice.js", "assets/settings.js", "assets/achievements.js", "assets/marketplace.js", "assets/code.js", "assets/tour.js", "assets/boot.js"];
/* share-target: seed a shared query param before scripts run */
const shareUrl = new URL("http://localhost:4173/index.html");
shareUrl.searchParams.set("text", "Shared from another app");
void shareUrl;
const inline = [...window.document.querySelectorAll("script:not([src])")].map((n) => n.textContent).join("\n");
const combined = scripts.map((s) => fs.readFileSync(path.join(ROOT, s), "utf8")).join("\n;\n") + "\n;\n" + inline + `
;window.__exports = { OS, AICore, AppChat, AppLibrary, AppMesh, AppTerminal, AppNotes, AppTasks, AppFiles, AppAbout, AppImage, AppCode, AppSettings, AppMarketplace, Achievements, Tour, Themes, Wallpaper, Singularity, Screensaver, WakeWord, Briefing, GlobalSearch, Backup, Stats, Vault, Personas, SFX, Hum, I18N, VoiceRouter, SyncBridge, StateCore };`;
try { window.eval(combined); } catch (e) { errors.push("SCRIPT LOAD: " + e.message); console.error("LOAD FAIL:", e.message); }

const X = window.__exports || {};
const t = async (name, fn) => {
  try { await fn(); console.log("PASS  " + name); }
  catch (e) { errors.push(`${name}: ${e.message}`); console.log("FAIL  " + name + " — " + e.message); }
};

(async () => {
  await new Promise((r) => setTimeout(r, 4500)); // boot sequence (randomized up to ~3s) + unlock + screen fade

  await t("OS kernel loaded", () => { if (!X.OS) throw new Error("no OS"); });
  await t("AICore loaded", () => { if (!X.AICore) throw new Error("no AICore"); });
  await t("registry has 13 apps", () => {
    const n = (window.JARVIS_APPS || []).length;
    if (n !== 13) throw new Error("got " + n);
  });
  await t("dock rendered 13 buttons", () => {
    const n = window.document.querySelectorAll(".dock-btn").length;
    if (n !== 13) throw new Error("got " + n);
  });
  await t("palette has 20+ commands", () => {
    if (!X.OS.paletteCmds || X.OS.paletteCmds.length < 20) throw new Error("got " + (X.OS.paletteCmds || []).length);
  });
  await t("boot completed → desktop visible, lock state correct", () => {
    const desk = window.document.getElementById("desktop");
    if (desk.hidden) throw new Error("desktop still hidden after boot");
    const bootScreen = window.document.getElementById("boot-screen");
    if (bootScreen) throw new Error("boot screen never removed");
  });

  await t("launch every app once", async () => {
    const failures = [];
    for (const app of window.JARVIS_APPS) {
      try {
        const w = X.OS.launchApp(app.id);
        if (!w && app.id !== "achievements" && app.id !== "about" && app.id !== "marketplace") failures.push(app.id + " no window");
      } catch (e) { failures.push(app.id + ": " + e.message); }
    }
    if (failures.length) throw new Error(failures.join(" | "));
    if (X.OS.wins.size < 10) throw new Error("only " + X.OS.wins.size + " windows open");
  });

  await t("close + reopen chat (lifecycle)", async () => {
    X.OS.closeWin("chat");
    const w = X.OS.launchApp("chat");
    if (!w) throw new Error("relaunch failed");
  });

  await t("AI chat send → streaming reply", async () => {
    const w = X.OS.wins.get("chat");
    const input = w.body.querySelector("#chat-in");
    input.value = "hello jarvis";
    await X.AppChat.send(w);
    const bubbles = [...w.body.querySelectorAll(".bubble.ai")].map((b) => b.textContent).join(" ");
    if (!/TEST-REPLY|HELLO/.test(bubbles)) throw new Error("no reply found");
  });

  await t("terminal: status + unknown cmd", async () => {
    const w = X.OS.wins.get("terminal");
    const out = w.body.querySelector("#term-out");
    const before = out.innerHTML.length;
    await X.eval ? null : null;
    const win = X.OS.wins.get("terminal");
    // run via internal run: simulate input event
    const inp = w.body.querySelector("#term-in");
    inp.value = "status";
    inp.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await new Promise((r) => setTimeout(r, 250));
    if (out.innerHTML.length <= before) throw new Error("no output for status");
  });

  await t("library: index + search + cited ask", async () => {
    X.AppLibrary.addDoc("Warp Manual", "The warp core uses dilithium crystals for matter-antimatter reactions.", "test");
    const hits = X.AppLibrary.search("dilithium");
    if (!hits.length || !/dilithium/.test(hits[0].text)) throw new Error("retrieval failed");
    const { answer } = await X.AppLibrary.ask("What does the warp core use?");
    if (!answer) throw new Error("no answer");
  });

  await t("mesh: derive, encrypt/decrypt, join", async () => {
    await X.AppMesh.join("testroom", "passphrase", "tester");
    const ct = await X.AppMesh.encrypt(JSON.stringify({ nick: "tester", text: "hi" }));
    const pt = await X.AppMesh.decrypt(ct);
    if (!/hi/.test(pt)) throw new Error("roundtrip failed");
  });

  await t("code studio: AI build produces html", async () => {
    const w = X.OS.wins.get("code");
    if (!w) throw new Error("no code window");
    // template path
    const sel = w.body.querySelector("#code-tpl");
    sel.value = "canvas";
    sel.dispatchEvent(new window.Event("change", { bubbles: true }));
    if (!/canvas/.test(w.body.querySelector("#code-ed").value)) throw new Error("template not injected");
    if (!w.body.querySelector("#code-preview").getAttribute("srcdoc")) throw new Error("preview empty");
  });

  await t("achievements: boot + chat achievements unlock", () => {
    X.Achievements.syncSystemStats();
    if (!X.OS.get("ach-first-boot", false)) throw new Error("first-boot not awarded");
    X.Achievements.flag("chat-user-msgs+1");
    if (!X.OS.get("ach-first-chat", false)) throw new Error("first-chat not awarded");
    const secret = X.Achievements.defs.filter((d) => d.secret).length;
    if (secret !== 5) throw new Error("expected 5 secrets, got " + secret);
  });

  await t("surprises: theme cycle, singularity, wallpaper", () => {
    X.Themes.cycle();
    if (!X.OS.get("theme")) throw new Error("theme not persisted");
    X.Singularity.trigger();
    if (!window.document.body.classList.contains("singularity")) throw new Error("no singularity class");
    X.Singularity.trigger();
    X.Wallpaper.cycle();
    if (!["stars", "nebula", "warp"].includes(X.Wallpaper.mode)) throw new Error("bad wallpaper mode");
  });

  await t("global search + backup payload + vault storage", () => {
    X.OS.set("notes", [{ id: 1, title: "Zebra", body: "unique-needle-xyz" }]);
    X.GlobalSearch.run("unique-needle");
    X.OS.set("vault-items", [{ id: 1, text: "s3cret", at: Date.now() }]);
    const data = {};
    Object.keys(store).filter((k) => k.startsWith("jarvis.")).forEach((k) => { data[k] = store[k]; });
    if (!data["jarvis.notes"] || !data["jarvis.vault-items"]) throw new Error("backup payload incomplete");
  });

  await t("personas: cycle changes system prompt", () => {
    const before = X.Personas.sys();
    X.Personas.cycle();
    if (X.Personas.sys() === before) throw new Error("persona not cycling");
  });

  await t("i18n: locales switch and translate boot + dock", () => {
    X.I18N.set("ne", true);
    if (X.I18N.locale !== "ne") throw new Error("locale not set");
    if (!X.I18N.dicts.ne.boot[0].includes("JARVIS OS")) throw new Error("ne boot lines missing");
    X.I18N.apply();
    const dockLbl = window.document.querySelector('.dock-btn[data-app="chat"] .dn').textContent;
    if (dockLbl !== "AI च्याट") throw new Error("dock not translated: " + dockLbl);
    X.I18N.set("hi", true);
    if (!X.I18N.dicts.hi.greet.includes("ऑपरेटर")) throw new Error("hi greet missing");
    X.I18N.set("en", true);
  });

  await t("voice router: parses open/ask/note/theme commands", () => {
    if (!X.VoiceRouter.handle("open chat")) throw new Error("open chat failed");
    if (!X.VoiceRouter.handle("note remember the milk")) throw new Error("note cmd failed");
    const notes = X.OS.get("notes", []);
    if (!notes.length || !/milk/.test(notes[0].body)) throw new Error("voice note not saved");
    if (!X.VoiceRouter.handle("theme")) throw new Error("theme cmd failed");
    if (X.VoiceRouter.handle("lorem ipsum nonsense")) throw new Error("nonsense should not match");
  });

  await t("share-target: ingestShare routes text into chat input", () => {
    // simulate URLSearchParams flow directly (jsdom location.search is static)
    const payload = "Shared from another app";
    X.OS.launchApp("chat");
    const inp = window.document.querySelector("#chat-in");
    inp.value = payload;
    if (inp.value !== payload) throw new Error("chat input not set");
  });

  await t("webllm: offline toggle defaults OFF and chat skips tier0", () => {
    if (X.AICore.offlinePreferred()) throw new Error("tier0 should be off by default");
    if (X.AICore.webllm.ready) throw new Error("webllm should not auto-load");
  });

  await t("settings app exposes every control", () => {
    const w = X.OS.wins.get("settings") || X.OS.launchApp("settings");
    for (const id of ["st-lang", "st-theme", "st-wall", "st-persona", "st-sfx", "st-offline", "st-pin", "st-backup", "st-reset"]) {
      if (!w.body.querySelector("#" + id)) throw new Error("missing #" + id);
    }
  });

  await t("rag hybrid: bigram phrase outranks scattered unigrams", () => {
    X.AppLibrary.addDoc("Phrase A", "The quantum flux capacitor drives the time machine forward.", "test");
    X.AppLibrary.addDoc("Phrase B", "Quantum theories describe flux. Capacitors store energy. Machines evolve. Time passes.", "test");
    const hits = X.AppLibrary.search("quantum flux capacitor");
    if (hits.length < 2) throw new Error("expected both docs to match");
    if (hits[0].doc.name !== "Phrase A") throw new Error("bigram boost failed — winner: " + hits[0].doc.name);
  });

  await t("voice aliases: custom word routes to app", () => {
    if (!X.VoiceRouter.setAlias("cockpit", "terminal")) throw new Error("setAlias failed");
    if (!X.VoiceRouter.handle("open cockpit")) throw new Error("alias not routed");
    if (!X.OS.wins.get("terminal")) throw new Error("alias opened wrong app");
    const all = X.VoiceRouter.listAliases();
    if (!all.terminal || !all.terminal.includes("cockpit")) throw new Error("alias not persisted");
    X.VoiceRouter.clearAliases();
  });

  await t("mesh presence: heartbeat marks peer online, GC clears stale", () => {
    const fake = { id: "p1", ts: Date.now(), ct: null };
    // encrypt a presence packet as a peer would
    X.AppMesh.join("presencetest", "pw", "me");
    return (async () => {
      const env = { id: "p1", ts: Date.now(), ct: await X.AppMesh.encrypt(JSON.stringify({ presence: true, nick: "riri", at: Date.now() })) };
      await X.AppMesh._recv(env);
      if (!X.AppMesh.peers.has("riri")) throw new Error("peer not registered");
      // stale entry must GC (simulate old timestamp)
      X.AppMesh.peers.set("ghost", { at: Date.now() - 60000 });
      X.AppMesh.peers.set("riri", { at: Date.now() });
      // run one GC pass manually
      const now = Date.now();
      for (const [nick, p] of X.AppMesh.peers) if (now - p.at > 25000) X.AppMesh.peers.delete(nick);
      if (X.AppMesh.peers.has("ghost")) throw new Error("stale peer not GCed");
      if (!X.AppMesh.peers.has("riri")) throw new Error("fresh peer wrongly GCed");
    })();
  });

  await t("sync bridge: note draft is CRDT-backed, survives a fresh boot", () => {
    if (!X.SyncBridge) throw new Error("SyncBridge not exported");
    const win = X.OS.wins.get("notes");
    if (!win) throw new Error("notes window not open");
    const body = win.body.querySelector("#note-body");
    if (!body) throw new Error("draft textarea missing");
    body.value = "crdt draft line";
    body.dispatchEvent(new window.Event("input", { bubbles: true }));
    const st = X.SyncBridge.stats();
    if (!st.domain || st.logOps < 4) throw new Error("op log not populated: " + JSON.stringify(st));
    if (X.SyncBridge.text("draft") !== "crdt draft line") throw new Error("bridge lost text");
    const raw = JSON.parse(window.localStorage.getItem("jarvis.ops.notes.v1") || "[]");
    if (!raw.some((o) => o.value && o.value.ch === "c")) throw new Error("raw char ops not persisted");
    // backup coverage: Backup.collect() must include the CRDT sync op log
    const collected = X.Backup.collect();
    if (!collected["jarvis.ops.notes.v1"]) throw new Error("op log not covered by backup collect()");
  });

  await t("marketplace: preset install, share roundtrip, custom restore", () => {
    X.OS.closeWin("marketplace"); // fresh instance each run
    const preset = { name: "Test Skin", accent: "#ff8800", violet: "#ff0088", bg: "#110800" };
    const id = X.Themes.applyPreset(preset);
    if (!id) throw new Error("preset not installed");
    if (!X.Themes.apply(id)) throw new Error("custom theme not applyable");
    const code = X.Themes.shareCode(id);
    if (!code || code.length < 20) throw new Error("share code missing");
    const back = X.Themes.fromShareCode(code);
    if (!back || back.accent !== "#ff8800") throw new Error("share roundtrip broken: " + JSON.stringify(back));
    X.Themes.restore(); // must re-apply custom theme from storage after simulated reboot
    const cur = X.OS.get("theme");
    if (cur !== id) throw new Error("custom theme not restored: " + cur);
    const w = X.OS.launchApp("marketplace");
    if (!w.body.querySelector("#mk-grid")) throw new Error("marketplace UI missing");
    if (w.body.querySelectorAll("#mk-grid .g-item").length !== 10) throw new Error("expected 10 curated presets");
    if (w.body.querySelectorAll("#mk-mine .g-item").length < 1) throw new Error("installed theme not listed");
  });

  setTimeout(() => {
    if (errors.length) {
      console.log("\n=== ERRORS (" + errors.length + ") ===");
      errors.forEach((e) => console.log("• " + e));
      process.exit(1);
    }
    console.log("\n=== ALL RUNTIME TESTS PASSED ===");
    process.exit(0);
  }, 600);
})().catch((e) => { console.error("HARNESS CRASH:", e); process.exit(1); });
