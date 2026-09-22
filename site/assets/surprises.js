/* ============================================================
   JARVIS OS — Surprises part 1 (surprises.js)
   SFX synth · ambient hum · theme engine · konami singularity ·
   screensaver · animated wallpapers.
   ============================================================ */

"use strict";

/* ============ 1. SYNTH SFX (zero assets, WebAudio) ============ */
const SFX = {
  ctx: null,
  enabled: OS.get("sfx", true),
  _ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  },
  play(type) {
    if (!this.enabled) return;
    const ctx = this._ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    const cfg = {
      open:  [520, 880, 0.12, "sine"],      // window open — rising
      close: [440, 180, 0.10, "sine"],      // window close — falling
      click: [880, 880, 0.03, "triangle"],  // dock click — tick
      boot:  [220, 660, 0.55, "sawtooth"],  // boot — reactor rise
      lock:  [300, 150, 0.22, "square"],    // lock — thud
      ok:    [660, 990, 0.14, "sine"],      // success chime
      err:   [200, 140, 0.25, "square"],    // error buzz
      send:  [740, 980, 0.07, "sine"],      // message sent
      recv:  [520, 700, 0.09, "sine"],      // message received
      sing:  [110, 880, 1.20, "sawtooth"],  // singularity — deep rise
    }[type] || [600, 600, 0.05, "sine"];
    o.type = cfg[3];
    o.frequency.setValueAtTime(cfg[0], t);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, cfg[1]), t + cfg[2]);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + cfg[2] + 0.05);
    o.start(t); o.stop(t + cfg[2] + 0.08);
  },
  toggle() {
    this.enabled = !this.enabled;
    OS.set("sfx", this.enabled);
    OS.toast("SFX " + (this.enabled ? "ON" : "OFF"), "ok");
  },
};

/* ============ 2. AMBIENT REACTOR HUM ============ */
const Hum = {
  on: false, ctx: null, nodes: [],
  toggle() {
    if (this.on) return this.stop();
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = this.ctx || new AC();
    const ctx = this.ctx;
    if (ctx.state === "suspended") ctx.resume();
    // layered drone: 50Hz + 100.7Hz + slow LFO on filter
    const g = ctx.createGain(); g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.035, ctx.currentTime + 2);
    const filt = ctx.createBiquadFilter(); filt.type = "lowpass"; filt.frequency.value = 240;
    const o1 = ctx.createOscillator(); o1.frequency.value = 50;  o1.type = "sine";
    const o2 = ctx.createOscillator(); o2.frequency.value = 100.7; o2.type = "sine";
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.1;
    const lfoG = ctx.createGain(); lfoG.gain.value = 60;
    lfo.connect(lfoG); lfoG.connect(filt.frequency);
    o1.connect(filt); o2.connect(filt); filt.connect(g); g.connect(ctx.destination);
    [o1, o2, lfo].forEach((o) => o.start());
    g.__osc = [o1, o2, lfo];
    this.nodes = [g];
    this.on = true;
    OS.toast("Reactor hum ON — ambient mode", "ok");
  },
  stop() {
    if (!this.on) return;
    const g = this.nodes[0];
    if (g) {
      g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.6);
      setTimeout(() => (g.__osc || []).forEach((o) => { try { o.stop(); } catch {} }), 700);
    }
    this.nodes = []; this.on = false;
    OS.toast("Reactor hum OFF", "ok");
  },
};

/* ============ 3. THEME ENGINE (5 skins + custom presets) ============ */
const Themes = {
  list: {
    arc:    { name: "Arc Reactor",  accent: "#22d3ee", violet: "#8b5cf6", bg: "#030711" },
    gold:   { name: "Mark XLII",    accent: "#fbbf24", violet: "#f59e0b", bg: "#0d0703" },
    matrix: { name: "Matrix",       accent: "#34d399", violet: "#10b981", bg: "#020a04" },
    blood:  { name: "Mark III",     accent: "#f87171", violet: "#ef4444", bg: "#0c0304" },
    ice:    { name: "Ice",          accent: "#a5b4fc", violet: "#818cf8", bg: "#050714" },
  },
  /* custom presets (marketplace) live alongside built-ins */
  custom() { return OS.get("themes-custom", {}); },

  apply(key) {
    const t = this.list[key] || this.custom()[key];
    if (!t) return false;
    const r = document.documentElement.style;
    r.setProperty("--cyan", t.accent);
    r.setProperty("--cyan-soft", t.accent);
    r.setProperty("--violet", t.violet);
    r.setProperty("--bg-0", t.bg);
    r.setProperty("--glow", `0 0 24px ${t.accent}59`);
    OS.set("theme", key);
    return true;
  },

  applyPreset(preset, key) {
    if (!preset || !preset.accent) return false;
    const id = key || ("custom-" + Date.now().toString(36));
    const all = this.custom();
    all[id] = preset;
    OS.set("themes-custom", all);
    this.list[id] = preset;           // visible to cycle()
    this.apply(id);
    return id;
  },

  restoreCustom() {
    Object.assign(this.list, this.custom());
  },

  cycle() {
    const keys = Object.keys(this.list);
    const cur = OS.get("theme", "arc");
    const next = keys[(keys.indexOf(cur) + 1) % keys.length];
    this.apply(next);
    OS.toast("Theme: " + (this.list[next] || this.custom()[next] || {}).name, "ok");
    SFX.play("ok");
  },

  restore() {
    this.restoreCustom();
    this.apply(OS.get("theme", "arc"));
  },

  /* share code: base64 JSON, ~120 chars — paste anywhere */
  shareCode(key) {
    const t = this.list[key] || this.custom()[key];
    if (!t) return null;
    const slim = { name: t.name, accent: t.accent, violet: t.violet, bg: t.bg };
    return btoa(JSON.stringify(slim)).replace(/=+$/, "");
  },

  fromShareCode(code) {
    try {
      const json = atob(code.replace(/\s/g, ""));
      const t = JSON.parse(json);
      if (!t.accent || !t.bg) return null;
      return { name: t.name || "Shared", accent: t.accent, violet: t.violet || t.accent, bg: t.bg };
    } catch { return null; }
  },
};

/* ============ 4. KONAMI → SINGULARITY MODE ============ */
const Singularity = {
  code: ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","b","a"],
  idx: 0,
  active: false,
  handle(e) {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    this.idx = (k === this.code[this.idx]) ? this.idx + 1 : (k === this.code[0] ? 1 : 0);
    if (this.idx === this.code.length) { this.idx = 0; this.trigger(); }
  },
  trigger() {
    this.active = !this.active;
    document.body.classList.toggle("singularity", this.active);
    if (this.active) {
      OS.toast("🕳 SINGULARITY MODE — reality bends", "ok");
      AICore.speak("Singularity mode engaged. Brace yourself.");
      SFX.play("sing");
      if (window.Achievements) Achievements.flag("singularity-on+1");
    } else {
      OS.toast("Reality restored", "ok");
    }
  },
};

/* ============ 5. STARFIELD SCREENSAVER (idle 90s) ============ */
const Screensaver = {
  delay: 90000, timer: null, layer: null, raf: null,
  arm() {
    ["pointermove", "keydown", "pointerdown"].forEach((ev) =>
      addEventListener(ev, () => { this.wake(); this.arm(); }, { passive: true }));
    this.arm();
  },
  armOnce() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.show(), this.delay);
  },
  wake() {
    if (this.layer) this.hide();
    this.armOnce();
  },
  show() {
    if (this.layer || document.hidden) return this.armOnce();
    this.layer = el("div");
    this.layer.style.cssText = "position:fixed;inset:0;z-index:990;background:#020409;transition:opacity 1.2s;opacity:0";
    const cv = document.createElement("canvas");
    cv.style.cssText = "width:100%;height:100%";
    this.layer.appendChild(cv);
    document.body.appendChild(this.layer);
    requestAnimationFrame(() => (this.layer.style.opacity = "1"));
    // hyperspace streaks
    const ctx = cv.getContext("2d");
    let W, H, stars = [];
    const size = () => { W = cv.width = innerWidth; H = cv.height = innerHeight; };
    size();
    this._rs = size;
    addEventListener("resize", size);
    for (let i = 0; i < 320; i++) stars.push({ x: (Math.random() - 0.5), y: (Math.random() - 0.5), z: Math.random() });
    const frame = () => {
      ctx.fillStyle = "rgba(2,4,9,0.28)";
      ctx.fillRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2;
      for (const s of stars) {
        s.z -= 0.006;
        if (s.z <= 0.01) { s.x = Math.random() - 0.5; s.y = Math.random() - 0.5; s.z = 1; }
        const px = cx + (s.x / s.z) * cx * 0.9;
        const py = cy + (s.y / s.z) * cy * 0.9;
        const r = (1 - s.z) * 2.4;
        ctx.fillStyle = `rgba(103,232,249,${1 - s.z})`;
        ctx.fillRect(px, py, r, r);
      }
      this.raf = requestAnimationFrame(frame);
    };
    frame();
    this.armOnce();
  },
  hide() {
    if (!this.layer) return;
    cancelAnimationFrame(this.raf);
    removeEventListener("resize", this._rs);
    this.layer.style.opacity = "0";
    const l = this.layer;
    setTimeout(() => l.remove(), 1200);
    this.layer = null;
  },
};

/* ============ 6. ANIMATED WALLPAPERS ============ */
const Wallpaper = {
  modes: ["stars", "nebula", "warp"],
  mode: OS.get("wallpaper", "stars"),
  cv: null, raf: null, t: 0, _sfxFrame: 0,
  init() {
    this.cv = document.getElementById("starfield");
    if (!this.cv) return;
    this.set(this.mode, true);
  },
  set(mode, silent) {
    this.mode = this.modes.includes(mode) ? mode : "stars";
    OS.set("wallpaper", this.mode);
    if (!silent) OS.toast("Wallpaper: " + this.mode, "ok");
  },
  cycle() {
    const i = this.modes.indexOf(this.mode);
    this.set(this.modes[(i + 1) % this.modes.length]);
  },
};

/* patch the existing starfield loop to honor wallpaper mode */
(function patchStarfield() {
  const origStart = OS.startStarfield.bind(OS);
  let warpStars = null;
  OS.startStarfield = function () {
    origStart();
    const cv = document.getElementById("starfield");
    const ctx = cv.getContext("2d");
    // overlay loop for nebula/warp modes drawn on top of base stars
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const loop = () => {
      const mode = OS.get("wallpaper", "stars");
      const W = cv.width, H = cv.height;
      if (mode === "nebula") {
        Wallpaper.t += 0.004;
        const hue = 190 + Math.sin(Wallpaper.t) * 40;
        const g1 = ctx.createRadialGradient(W * 0.7, H * 0.3, 0, W * 0.7, H * 0.3, W * 0.5);
        g1.addColorStop(0, `hsla(${hue},80%,60%,0.10)`);
        g1.addColorStop(1, "transparent");
        ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);
        const g2 = ctx.createRadialGradient(W * 0.2, H * 0.8, 0, W * 0.2, H * 0.8, W * 0.4);
        g2.addColorStop(0, `hsla(${hue + 60},70%,55%,0.08)`);
        g2.addColorStop(1, "transparent");
        ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
      } else if (mode === "warp") {
        if (!warpStars) {
          warpStars = [];
          for (let i = 0; i < 140; i++) warpStars.push({ a: Math.random() * Math.PI * 2, r: Math.random() });
        }
        ctx.fillStyle = "rgba(3,7,17,0.16)";
        ctx.fillRect(0, 0, W, H);
        const cx = W / 2, cy = H / 2;
        for (const s of warpStars) {
          s.r += 0.012;
          if (s.r > 1.4) { s.r = 0.02; s.a = Math.random() * Math.PI * 2; }
          const x1 = cx + Math.cos(s.a) * s.r * cx;
          const y1 = cy + Math.sin(s.a) * s.r * cy;
          const x2 = cx + Math.cos(s.a) * (s.r + 0.06) * cx;
          const y2 = cy + Math.sin(s.a) * (s.r + 0.06) * cy;
          ctx.strokeStyle = `rgba(103,232,249,${s.r * 0.5})`;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        }
      }
      Wallpaper.raf = requestAnimationFrame(loop);
    };
    loop();
  };
})();
