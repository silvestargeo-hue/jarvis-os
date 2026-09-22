/* ============================================================
   JARVIS OS — Settings (settings.js)
   One drawer for every preference: language, theme, wallpaper,
   SFX, hum, wake word, voice control, persona, PIN, backup,
   reset. Every control exercised by the runtime test suite.
   ============================================================ */

"use strict";

const AppSettings = {
  launch() {
    const root = el("div");
    root.innerHTML = `
      <div class="app-toolbar"><span class="diag"><b>Preferences</b> — saved instantly to this device.</span></div>

      <div class="app-toolbar">
        <span class="diag" style="min-width:130px">🌐 Language</span>
        <select class="app-select" id="st-lang">
          <option value="en">English</option>
          <option value="ne">नेपाली</option>
          <option value="hi">हिन्दी</option>
        </select>
        <span class="diag" style="min-width:110px">🎭 Persona</span>
        <select class="app-select" id="st-persona">
          <option value="classic">Classic JARVIS</option>
          <option value="sassy">Sassy</option>
          <option value="poet">Poet</option>
          <option value="pirate">Pirate</option>
          <option value="zen">Zen</option>
        </select>
      </div>

      <div class="app-toolbar">
        <span class="diag" style="min-width:130px">🎨 Theme</span>
        <select class="app-select" id="st-theme">
          <option value="arc">Arc Reactor</option>
          <option value="gold">Mark XLII</option>
          <option value="matrix">Matrix</option>
          <option value="blood">Mark III</option>
          <option value="ice">Ice</option>
        </select>
        <span class="diag" style="min-width:110px">🌌 Wallpaper</span>
        <select class="app-select" id="st-wall">
          <option value="stars">Stars</option>
          <option value="nebula">Nebula</option>
          <option value="warp">Warp</option>
        </select>
      </div>

      <div class="app-toolbar">
        <button class="app-btn ghost" id="st-sfx">🔊 SFX: —</button>
        <button class="app-btn ghost" id="st-hum">🎛 Hum: —</button>
        <button class="app-btn ghost" id="st-wake">👂 Wake word</button>
        <button class="app-btn ghost" id="st-voice">🗣 Voice control</button>
      </div>

      <div class="app-toolbar">
        <button class="app-btn ghost" id="st-offline">🧠 Offline AI: —</button>
      </div>
      <div class="diag" id="st-offline-status" style="margin-bottom:8px">Offline AI downloads a ~1GB model into browser cache once, then chat works with zero internet (WebLLM, WebGPU).</div>

      <div class="app-toolbar">
        <button class="app-btn ghost" id="st-pin">🔐 Set lock PIN</button>
        <button class="app-btn ghost" id="st-backup">💾 Backup</button>
        <button class="app-btn danger" id="st-reset">⌦ Factory reset</button>
      </div>

      <div class="diag" style="margin-top:14px">
        <b>Engine stack:</b> Puter.js → Pollinations stream → Pollinations GET — all keyless, auto-fallback.<br>
        <b>Privacy:</b> everything stays in this browser. AI calls go straight from your device to the model endpoints.
      </div>`;

    const win = OS.makeWin({ id: "settings", title: "SETTINGS", icon: "⚙️", body: root, w: 620, h: 470 });

    const $ = (s) => win.body.querySelector("#" + s);

    // language
    $("st-lang").value = OS.get("locale", "en");
    $("st-lang").onchange = (e) => I18N.set(e.target.value);

    // persona
    $("st-persona").value = Personas.get();
    $("st-persona").onchange = (e) => Personas.set(e.target.value);

    // theme
    $("st-theme").value = OS.get("theme", "arc");
    $("st-theme").onchange = (e) => { Themes.apply(e.target.value); OS.toast("Theme: " + Themes.list[e.target.value].name, "ok"); };

    // wallpaper
    $("st-wall").value = OS.get("wallpaper", "stars");
    $("st-wall").onchange = (e) => Wallpaper.set(e.target.value);

    // toggles with live labels
    const syncToggles = () => {
      $("st-sfx").textContent = "🔊 SFX: " + (SFX.enabled ? "ON" : "OFF");
      $("st-hum").textContent = "🎛 Hum: " + (Hum.on ? "ON" : "OFF");
      $("st-wake").textContent = "👂 Wake: " + (WakeWord.on ? "ON" : "OFF");
      $("st-voice").textContent = "🗣 Voice: " + (VoiceRouter.on ? "ON" : "OFF");
      $("st-offline").textContent = "🧠 Offline AI: " + (AICore.webllm.ready ? "READY" : OS.get("webllm-on", false) ? "PENDING" : "OFF");
    };
    syncToggles();
    $("st-sfx").onclick = () => { SFX.toggle(); syncToggles(); };
    $("st-hum").onclick = () => { Hum.toggle(); syncToggles(); };
    $("st-wake").onclick = () => { WakeWord.toggle(); syncToggles(); };
    $("st-voice").onclick = () => { VoiceRouter.toggle(); syncToggles(); };
    $("st-offline").onclick = async () => {
      if (AICore.webllm.ready) { AICore.webllmDisable(); syncToggles(); return; }
      const st = $("st-offline-status");
      const ok = await AICore.webllmEnable((p, txt) => {
        st.textContent = `Downloading model… ${Math.round((p || 0) * 100)}% — ${(txt || "").slice(0, 70)}`;
      });
      syncToggles();
      if (ok) st.textContent = "Offline AI ready — chat now works with zero internet.";
    };

    // pin
    $("st-pin").onclick = () => {
      const p = prompt("New PIN (4–8 digits):");
      if (p) OS.setPin(p);
    };

    // backup
    $("st-backup").onclick = () => Backup.exportAll();

    // factory reset
    $("st-reset").onclick = () => {
      if (confirm("Erase ALL JARVIS data in this browser?")) {
        Object.keys(localStorage).filter((k) => k.startsWith("jarvis.")).forEach((k) => localStorage.removeItem(k));
        location.reload();
      }
    };

    return win;
  },
};
