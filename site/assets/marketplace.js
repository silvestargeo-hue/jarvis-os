/* ============================================================
   JARVIS OS — Themes Marketplace (marketplace.js)
   Curated presets + community shelf. Live preview, one-click
   apply, share codes (~120 chars), optional cloud publish via
   Puter KV — keyless, E2E-free (themes are just 4 colors).
   ============================================================ */

"use strict";

const AppMarketplace = {
  presets: [
    { id: "sunset",   name: "Solar Flare",    accent: "#fb923c", violet: "#f43f5e", bg: "#0f0703" },
    { id: "sakura",   name: "Sakura Ops",     accent: "#f9a8d4", violet: "#c084fc", bg: "#120711" },
    { id: "emerald",  name: "Emerald Bay",    accent: "#34d399", violet: "#0ea5e9", bg: "#03120c" },
    { id: "vapor",    name: "Vaporwave",      accent: "#f0abfc", violet: "#22d3ee", bg: "#0d0616" },
    { id: "carbon",   name: "Carbon",         accent: "#94a3b8", violet: "#64748b", bg: "#07090c" },
    { id: "inferno",  name: "Inferno",        accent: "#ef4444", violet: "#f97316", bg: "#100404" },
    { id: "mantis",   name: "Mantis",         accent: "#a3e635", violet: "#22c55e", bg: "#0a1203" },
    { id: "abyss",    name: "Abyss",          accent: "#38bdf8", violet: "#6366f1", bg: "#020617" },
    { id: "royal",    name: "Royal Purple",   accent: "#c084fc", violet: "#8b5cf6", bg: "#0b0614" },
    { id: "gt",       name: "Gold Terminal",  accent: "#fbbf24", violet: "#a16207", bg: "#0a0803" },
  ],

  launch() {
    const root = el("div");
    root.innerHTML = `
      <div class="app-toolbar">
        <span class="diag"><b>Theme Marketplace</b> — preview, apply, share. Built-ins + community.</span>
      </div>

      <div class="app-toolbar">
        <button class="app-btn ghost" id="mk-import">📥 Import share code</button>
        <button class="app-btn ghost" id="mk-share">📤 Share current theme</button>
        <button class="app-btn ghost" id="mk-shelf">🌐 Community shelf</button>
      </div>

      <div id="mk-import-row" style="display:none" class="app-toolbar">
        <input class="app-input" id="mk-code" style="flex:1" placeholder="Paste theme code (e.g. eyJuYW1lIjoi…)" />
        <button class="app-btn" id="mk-code-go">Apply</button>
      </div>

      <div id="mk-preview" class="bubble ai" style="max-width:100%;display:none;margin-bottom:10px"></div>

      <div class="app-toolbar"><span class="diag"><b>Curated</b></span></div>
      <div class="gallery" id="mk-grid" style="grid-template-columns:repeat(auto-fill,minmax(120px,1fr))"></div>
      <div class="app-toolbar" style="margin-top:12px"><span class="diag"><b>Installed (custom)</b></span></div>
      <div id="mk-mine" class="gallery" style="grid-template-columns:repeat(auto-fill,minmax(120px,1fr))"></div>`;

    const win = OS.makeWin({ id: "marketplace", title: "THEMES MARKETPLACE", icon: "🎨", body: root, w: 700, h: 560 });
    const $ = (s) => win.body.querySelector("#" + s);

    /* ---------- curated grid ---------- */
    const grid = $("mk-grid");
    this.presets.forEach((p) => grid.appendChild(this.card(p, win)));
    this.renderMine(win);

    /* ---------- preview + apply ---------- */
    win._preview = (p) => {
      const box = $("mk-preview");
      box.style.display = "block";
      box.innerHTML = `
        <b style="color:${p.accent}">${p.name}</b><br>
        <span style="color:${p.violet}">accent secondary · violet</span><br>
        <small style="color:var(--text-2)">bg ${p.bg} — preview text over your current bg</small>`;
      // live preview: temporarily apply without saving
      const r = document.documentElement.style;
      r.setProperty("--cyan", p.accent);
      r.setProperty("--cyan-soft", p.accent);
      r.setProperty("--violet", p.violet);
      box.dataset.previewing = "1";
    };

    /* ---------- import / share ---------- */
    $("mk-import").onclick = () => {
      $("mk-import-row").style.display = "flex";
      $("mk-code").focus();
    };
    $("mk-code-go").onclick = () => {
      const t = Themes.fromShareCode($("mk-code").value.trim());
      if (!t) return OS.toast("Invalid theme code", "err");
      const id = Themes.applyPreset(t);
      OS.toast("Installed: " + t.name, "ok");
      SFX.play("ok");
      this.renderMine(win);
    };
    $("mk-share").onclick = () => {
      const cur = OS.get("theme", "arc");
      const code = Themes.shareCode(cur);
      if (!code) return OS.toast("Nothing to share", "err");
      const short = code.length > 60 ? code.slice(0, 57) + "…" : code;
      const full = prompt("Your share code (copy it):\n\n" + code, code);
      OS.toast("Share code: " + short, "ok");
    };
    $("mk-share").title = "Copy a ~120-char code anyone can import";

    /* ---------- community shelf ---------- */
    $("mk-shelf").onclick = () => this.shelf(win);

    // restore saved theme on close of preview state
    win.onClose = () => { if ($("mk-preview").dataset.previewing) Themes.restore(); };
    return win;
  },

  card(p, win, removable) {
    const c = el("div", "g-item");
    c.style.cursor = "pointer";
    c.innerHTML = `
      <div style="height:64px;background:linear-gradient(135deg,${p.accent},${p.violet})"></div>
      <div class="g-cap" title="${p.name}">${p.name}</div>`;
    c.onclick = () => {
      const applied = Themes.apply(p.id) || Themes.applyPreset(p, p.id);
      OS.toast("Theme: " + p.name, "ok");
      SFX.play("ok");
      if (window.Achievements) Achievements.flag("theme-changes+1");
      win._preview(p);
    };
    if (removable) {
      const del = el("button", "mini-btn danger", "✕");
      del.style.position = "absolute"; del.style.top = "4px"; del.style.left = "4px";
      del.onclick = (e) => {
        e.stopPropagation();
        const all = Themes.custom();
        delete all[p.id];
        OS.set("themes-custom", all);
        delete Themes.list[p.id];
        this.renderMine(win);
        OS.toast("Removed " + p.name, "ok");
      };
      c.appendChild(del);
    }
    return c;
  },

  renderMine(win) {
    const mine = win.body.querySelector("#mk-mine");
    mine.innerHTML = "";
    const customs = Themes.custom();
    const keys = Object.keys(customs);
    if (!keys.length) {
      mine.innerHTML = '<div class="diag" style="grid-column:1/-1">No custom themes yet — import a code or click a curated one to install.</div>';
      return;
    }
    keys.forEach((id) => {
      const p = { ...customs[id], id };
      mine.appendChild(this.card(p, win, true));
    });
  },

  /* ---------- community shelf: publish + fetch via Puter KV (keyless) ---------- */
  async shelf(win) {
    OS.toast("Community shelf: connecting…", "");
    try {
      if (typeof puter === "undefined" || !puter.kv) throw new Error("Puter KV unavailable — try again once Puter loads");
      const KEY = "jarvis-marketplace-themes";
      const mine = Themes.custom();
      const cur = OS.get("theme", "arc");
      const current = Themes.list[cur] || mine[cur];
      if (current) {
        // publish current theme (dedupe by name)
        const raw = await puter.kv.get(KEY) || "[]";
        let list = [];
        try { list = JSON.parse(raw); } catch {}
        list = list.filter((t) => t.name !== current.name);
        list.push({ name: current.name, accent: current.accent, violet: current.violet, bg: current.bg, by: "operator", at: Date.now() });
        await puter.kv.set(KEY, JSON.stringify(list.slice(-60)));
      }
      const raw2 = await puter.kv.get(KEY) || "[]";
      let list2 = [];
      try { list2 = JSON.parse(raw2); } catch {}
      OS.toast(`Shelf has ${list2.length} community theme(s)`, "ok");
      if (!list2.length) return;
      const pick = prompt("Community themes:\n" + list2.map((t, i) => `${i + 1}. ${t.name}`).join("\n") + "\n\nNumber to install (cancel to skip):");
      const n = parseInt(pick, 10);
      if (!n || !list2[n - 1]) return;
      const t = list2[n - 1];
      Themes.applyPreset({ name: t.name, accent: t.accent, violet: t.violet, bg: t.bg });
      this.renderMine(win);
      OS.toast("Installed from shelf: " + t.name, "ok");
      SFX.play("ok");
    } catch (e) {
      OS.toast(e.message || "Shelf unavailable", "err");
    }
  },
};
