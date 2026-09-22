/* ============================================================
   JARVIS OS — Core (os.js)
   Boot, lock, window manager, dock, palette, starfield, storage
   ============================================================ */

"use strict";

/* ---------------- Storage ---------------- */
const OS = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem("jarvis." + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, val) {
    try { localStorage.setItem("jarvis." + key, JSON.stringify(val)); } catch {}
  },
  del(key) {
    try { localStorage.removeItem("jarvis." + key); } catch {}
  },

  /* ---------------- Toasts ---------------- */
  toast(msg, type) {
    const wrap = document.getElementById("toasts");
    if (!wrap) return;
    const t = document.createElement("div");
    t.className = "toast " + (type || "");
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .3s"; }, 3200);
    setTimeout(() => t.remove(), 3600);
  },

  /* ---------------- Boot ---------------- */
  boot() {
    if (window.I18N) I18N.locale = OS.get("locale", "en");
    const lines = (window.I18N && I18N.dicts[I18N.locale]) ? I18N.dicts[I18N.locale].boot : [
      "JARVIS OS v2.5 — browser kernel",
      "[OK]   mount /localStorage ................ done",
      "[OK]   engine stack: puter → pollinations .. armed",
      "[OK]   vision pipeline ..................... ready",
      "[OK]   voice i/o (mic + tts) ............... ready",
      "[OK]   window manager ...................... up",
      "[OK]   command palette [ctrl+k] ............ bound",
      "",
      '"Good day, operator. All systems nominal."',
    ];

    const scr = document.getElementById("boot-screen");
    const log = document.getElementById("boot-log");
    const bar = document.getElementById("boot-bar");
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

    const finish = () => {
      bar.style.width = "100%";
      setTimeout(() => {
        scr.style.opacity = "0";
        scr.style.transition = "opacity .5s ease";
        setTimeout(() => scr.remove(), 520);
        this.unlockFlow();
      }, 320);
    };

    if (reduce) { finish(); return; }

    let i = 0;
    const tick = () => {
      if (i >= lines.length) { finish(); return; }
      const cls = lines[i].startsWith("[OK]") ? "ok" : (lines[i].startsWith('"') ? "hl" : "");
      log.innerHTML += `<span class="${cls}">${lines[i] || "\u00a0"}</span>\n`;
      bar.style.width = Math.round(((i + 1) / lines.length) * 92) + "%";
      i++;
      setTimeout(tick, 110 + Math.random() * 160);
    };
    tick();
  },

  /* ---------------- Lock ---------------- */
  unlockFlow() {
    const pin = this.get("pin", null);
    const lock = document.getElementById("lock");
    const desk = document.getElementById("desktop");
    if (!pin) {
      // First run: set PIN silently (default 0000), go straight in
      desk.hidden = false;
      this.afterUnlock();
      return;
    }
    lock.hidden = false;
    const input = document.getElementById("lock-pin");
    setTimeout(() => input.focus(), 60);

    const attempt = () => {
      if (input.value === String(pin)) {
        lock.hidden = true;
        desk.hidden = false;
        this.afterUnlock();
      } else {
        document.getElementById("lock-err").textContent = "ACCESS DENIED — wrong PIN";
        input.value = "";
      }
    };
    document.getElementById("lock-btn").onclick = attempt;
    input.onkeydown = (e) => { if (e.key === "Enter") attempt(); };
  },

  setPin(pin) {
    if (!/^\d{4,8}$/.test(String(pin))) { this.toast("PIN must be 4–8 digits", "err"); return false; }
    this.set("pin", String(pin));
    this.toast("PIN saved — it will be asked on next boot", "ok");
    return true;
  },

  afterUnlock() {
    if (this._inited) return; // guard: no duplicate loops on re-lock
    this._inited = true;
    this.ingestShare();
    OS.set("boot-count", OS.get("boot-count", 0) + 1);
    if (window.Themes) Themes.restore();
    this.startClock();
    this.startStarfield();
    if (window.Wallpaper) Wallpaper.init();
    this.watchNetwork();
    this.registerSW();
    if (window.Screensaver) Screensaver.arm();
    if (window.I18N) I18N.apply();
    if (window.Achievements) {
      Achievements.syncSystemStats();
      const hr = new Date().getHours();
      if (hr >= 0 && hr < 5) Achievements.flag("night-use"); // secret: night owl
    }
    // Restore open windows from last session
    const open = this.get("windows-open", []);
    if (open.length) open.forEach((id) => this.launchApp(id));
  },

  /* PWA share-target: OS was given text/URL from another app → route into AI Chat */
  ingestShare() {
    try {
      const q = new URLSearchParams(location.search);
      const title = q.get("title") || "";
      const text = q.get("text") || "";
      const url = q.get("url") || "";
      if (!title && !text && !url) return;
      const payload = [title, text, url].filter(Boolean).join("\n").slice(0, 2000);
      history.replaceState(null, "", location.pathname); // clean the address bar
      setTimeout(() => {
        this.launchApp("chat");
        setTimeout(() => {
          const inp = document.querySelector("#chat-in");
          if (inp) {
            inp.value = payload;
            OS.toast("Shared content received → AI Chat", "ok");
            inp.focus();
          }
        }, 400);
      }, 300);
    } catch {}
  },

  startClock() {
    const el = document.getElementById("tb-clock");
    const upd = () => {
      const d = new Date();
      el.textContent = d.toLocaleTimeString([], { hour12: false }) + "  ·  " +
        d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
    };
    upd();
    setInterval(upd, 1000);
  },

  /* ---------------- Starfield ---------------- */
  startStarfield() {
    const cv = document.getElementById("starfield");
    const ctx = cv.getContext("2d");
    let W, H, stars = [];
    const N = 170;
    function size() {
      W = cv.width = innerWidth;
      H = cv.height = innerHeight;
    }
    size();
    addEventListener("resize", size);
    for (let i = 0; i < N; i++) {
      stars.push({ x: Math.random(), y: Math.random(), z: Math.random() * 0.9 + 0.1, tw: Math.random() * Math.PI * 2 });
    }
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let t = 0;
    (function frame() {
      t += 0.016;
      ctx.clearRect(0, 0, W, H);
      for (const s of stars) {
        const x = s.x * W, y = s.y * H;
        const tw = reduce ? 0.8 : (0.55 + 0.45 * Math.sin(t * 2 + s.tw));
        const r = s.z * 1.6;
        ctx.globalAlpha = tw * s.z;
        ctx.fillStyle = s.z > 0.75 ? "#67e8f9" : "#9db4d0";
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 7);
        ctx.fill();
        if (!reduce) {
          s.y += s.z * 0.00018;
          if (s.y > 1) s.y = 0;
        }
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(frame);
    })();
  },

  /* ---------------- Network ---------------- */
  watchNetwork() {
    const chip = document.getElementById("tb-net");
    const upd = () => {
      const on = navigator.onLine;
      chip.textContent = on ? "● ONLINE" : "◌ OFFLINE";
      chip.classList.toggle("off", !on);
    };
    addEventListener("online", upd);
    addEventListener("offline", upd);
    upd();
  },

  async registerSW() {
    if (!("serviceWorker" in navigator)) return;
    try { await navigator.serviceWorker.register("sw.js"); } catch {}
  },

  /* ---------------- Window manager ---------------- */
  wins: new Map(),
  zTop: 10,

  launchApp(id) {
    const app = (window.JARVIS_APPS || []).find((a) => a.id === id);
    if (!app) return;
    if (this.wins.has(id)) { this.focusWin(id); return app.win; }
    const w = app.launch();
    if (!w) return;
    this.wins.set(id, w);
    app.win = w;
    document.querySelector(`.dock-btn[data-app="${id}"]`)?.classList.add("running");
    this.persistOpen();
    this.focusWin(id);
    return w;
  },

  closeWin(id) {
    const w = this.wins.get(id);
    if (!w) return;
    try { w.onClose && w.onClose(); } catch {}
    w.el.classList.add("closing");
    setTimeout(() => w.el.remove(), 160);
    this.wins.delete(id);
    document.querySelector(`.dock-btn[data-app="${id}"]`)?.classList.remove("running");
    this.persistOpen();
  },

  focusWin(id) {
    const w = this.wins.get(id);
    if (!w) return;
    w.el.style.zIndex = ++this.zTop;
    this.wins.forEach((o) => o.el.classList.remove("focused"));
    w.el.classList.add("focused");
  },

  persistOpen() {
    this.set("windows-open", [...this.wins.keys()]);
  },

  makeWin({ id, title, icon, body, x, y, w, h }) {
    const desk = document.getElementById("windows");
    const el = document.createElement("div");
    el.className = "win";
    const vw = innerWidth, vh = innerHeight;
    if (vw < 640) {
      // phones: windows open near-fullscreen (drag still works, dock visible)
      w = vw - 12; h = vh - 138; x = 6; y = 56;
    } else {
      w = Math.min(w || 620, vw - 24);
      h = Math.min(h || 460, vh - 150);
      x = x != null ? x : Math.max(12, (vw - w) / 2 + (this.wins.size % 4) * 26 - 40);
      y = y != null ? y : Math.max(66, (vh - h) / 2 - 40 + (this.wins.size % 4) * 22);
    }

    el.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;`;
    el.innerHTML = `
      <div class="win-head">
        <span class="win-ico">${icon}</span>
        <span class="win-title">${title}</span>
        <div class="win-btns">
          <button class="win-btn max" title="Maximize">▢</button>
          <button class="win-btn close" title="Close">✕</button>
        </div>
      </div>
      <div class="win-body"></div>`;

    const bodyEl = el.querySelector(".win-body");
    if (typeof body === "string") bodyEl.innerHTML = body;
    else bodyEl.appendChild(body);

    desk.appendChild(el);

    const self = this;
    const win = { id, el, body: bodyEl };

    el.addEventListener("pointerdown", () => self.focusWin(id));
    el.querySelector(".close").onclick = (e) => { e.stopPropagation(); SFX.play("close"); self.closeWin(id); };
    el.querySelector(".max").onclick = (e) => {
      e.stopPropagation();
      if (el.dataset.maxed) {
        el.style.cssText = el.dataset.prev;
        delete el.dataset.maxed;
        el.classList.remove("win-max");
      } else {
        el.dataset.prev = el.style.cssText;
        el.dataset.maxed = "1";
        el.classList.add("win-max");
        el.style.cssText = "left:6px;top:56px;width:calc(100vw - 12px);height:calc(100vh - 130px);z-index:" + (++self.zTop);
      }
    };

    SFX.play("open");

    // Drag
    const head = el.querySelector(".win-head");
    head.addEventListener("pointerdown", (e) => {
      if (el.dataset.maxed) return;
      const sx = e.clientX, sy = e.clientY;
      const ox = el.offsetLeft, oy = el.offsetTop;
      let snapped = false;
      const move = (ev) => {
        let nx = Math.max(-w + 90, Math.min(innerWidth - 60, ox + ev.clientX - sx));
        let ny = Math.max(50, Math.min(innerHeight - 70, oy + ev.clientY - sy));
        // edge snapping: left/right half + top maximize hint
        if (ev.clientY < 58) { ny = 56; snapped = "top"; }
        else if (ev.clientX < 14) { nx = 6; snapped = "left"; }
        else if (ev.clientX > innerWidth - 14) { nx = innerWidth - w - 6; snapped = "right"; }
        else snapped = false;
        el.style.left = nx + "px";
        el.style.top = ny + "px";
      };
      const up = () => {
        removeEventListener("pointermove", move);
        removeEventListener("pointerup", up);
        if (snapped === "top") { el.dataset.prev = el.dataset.prev || el.style.cssText; el.querySelector(".max").click(); }
        if (snapped === "left") { el.style.cssText = `left:6px;top:56px;width:${Math.floor(innerWidth / 2) - 9}px;height:calc(100vh - 130px);z-index:${++self.zTop}`; }
        if (snapped === "right") { el.style.cssText = `left:${Math.floor(innerWidth / 2) + 3}px;top:56px;width:${Math.floor(innerWidth / 2) - 9}px;height:calc(100vh - 130px);z-index:${++self.zTop}`; }
        snapped = false;
      };
      addEventListener("pointermove", move);
      addEventListener("pointerup", up);
    });

    return win;
  },

  /* ---------------- Dock ---------------- */
  buildDock() {
    const dock = document.getElementById("dock");
    (window.JARVIS_APPS || []).forEach((app) => {
      const b = document.createElement("button");
      b.className = "dock-btn";
      b.dataset.app = app.id;
      b.title = app.hint;
      b.innerHTML = `<span class="di">${app.icon}</span><span class="dn">${app.name}</span>`;
      b.onclick = () => { SFX.play("click"); this.launchApp(app.id); };
      dock.appendChild(b);
      // Register palette command here too (JARVIS_APPS exists at this point)
      if (!this.paletteCmds.some((c) => c.id === "app-" + app.id)) {
        this.paletteCmds.push({ id: "app-" + app.id, name: "Open " + app.name, icon: app.icon, hint: app.hint, keywords: app.name + " app open", run: () => this.launchApp(app.id) });
      }
    });
  },

  /* ---------------- Command palette ---------------- */
  paletteCmds: [],

  registerCommand(cmd) {
    this.paletteCmds.push(cmd);
  },

  openPalette() {
    const pal = document.getElementById("palette");
    const inp = document.getElementById("palette-input");
    pal.hidden = false;
    inp.value = "";
    this.renderPalette("");
    setTimeout(() => inp.focus(), 30);
  },

  closePalette() {
    document.getElementById("palette").hidden = true;
  },

  renderPalette(q) {
    const list = document.getElementById("palette-list");
    const norm = (s) => (s || "").toLowerCase();
    const items = this.paletteCmds.filter((c) =>
      !q || norm(c.name).includes(q) || norm(c.keywords).includes(q));
    list.innerHTML = "";
    this._palItems = items;
    this._palSel = 0;
    items.forEach((c, i) => {
      const d = document.createElement("div");
      d.className = "palette-item" + (i === 0 ? " sel" : "");
      d.innerHTML = `<span class="pi-ico">${c.icon}</span><span><span class="pi-name">${c.name}</span> <span class="pi-hint">— ${c.hint}</span></span>`;
      d.onclick = () => { this.closePalette(); c.run(); };
      list.appendChild(d);
    });
    if (!items.length) list.innerHTML = '<div class="palette-item"><span class="pi-hint">No matching command</span></div>';
  },

  paletteKey(e) {
    const pal = document.getElementById("palette");
    if (pal.hidden) return;
    const items = this._palItems || [];
    if (e.key === "Escape") { this.closePalette(); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!items.length) return;
      this._palSel = (this._palSel + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length;
      [...document.querySelectorAll(".palette-item")].forEach((el, i) =>
        el.classList.toggle("sel", i === this._palSel));
      document.querySelectorAll(".palette-item")[this._palSel]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      const c = items[this._palSel];
      if (c) { this.closePalette(); c.run(); }
    }
  },
};

/* ---------------- Global listeners ---------------- */
document.getElementById("btn-lock").onclick = () => {
  OS.closeAllSound?.();
  document.getElementById("desktop").hidden = true;
  OS.unlockFlow._relock = true;
  // Show lock with stored pin required
  const pin = OS.get("pin", null);
  const lock = document.getElementById("lock");
  lock.hidden = false;
  const input = document.getElementById("lock-pin");
  input.value = "";
  document.getElementById("lock-err").textContent = "";
  setTimeout(() => input.focus(), 60);
  const attempt = () => {
    if (!pin || input.value === String(pin)) {
      lock.hidden = true;
      document.getElementById("desktop").hidden = false;
    } else {
      document.getElementById("lock-err").textContent = "ACCESS DENIED — wrong PIN";
      input.value = "";
    }
  };
  document.getElementById("lock-btn").onclick = attempt;
  input.onkeydown = (e) => { if (e.key === "Enter") attempt(); };
};

document.getElementById("btn-palette").onclick = () => OS.openPalette();
document.getElementById("palette").addEventListener("pointerdown", (e) => {
  if (e.target.id === "palette") OS.closePalette();
});
document.getElementById("palette-input").addEventListener("input", (e) => OS.renderPalette(e.target.value.trim().toLowerCase()));
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    const pal = document.getElementById("palette");
    pal.hidden ? OS.openPalette() : OS.closePalette();
  }
  OS.paletteKey(e);
});
