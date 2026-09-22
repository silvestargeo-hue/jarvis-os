/* ============================================================
   JARVIS OS — Extras 1 (extras1.js)
   Calculator (safe evaluator) · Unit Converter ·
   Clock/Pomodoro/Timer · Weather (real Open-Meteo API)
   ============================================================ */

"use strict";

/* ---------- CALCULATOR — tokenized safe evaluator (no eval) ---------- */
const AppCalc = {
  evaluate(expr) {
    const tokens = String(expr).match(/(\d+\.?\d*|[+\-*/%()])/g);
    if (!tokens) return null;
    let pos = 0;
    const peek = () => tokens[pos];
    const next = () => tokens[pos++];
    function parseExpr() {
      let v = parseTerm();
      while (peek() === "+" || peek() === "-") { const op = next(); const r = parseTerm(); v = op === "+" ? v + r : v - r; }
      return v;
    }
    function parseTerm() {
      let v = parseFactor();
      while (peek() === "*" || peek() === "/" || peek() === "%") {
        const op = next(); const r = parseFactor();
        if ((op === "/" || op === "%") && r === 0) throw new Error("divide by zero");
        v = op === "*" ? v * r : op === "/" ? v / r : v % r;
      }
      return v;
    }
    function parseFactor() {
      if (peek() === "-") { next(); return -parseFactor(); }
      if (peek() === "(") { next(); const v = parseExpr(); if (next() !== ")") throw new Error("bad parens"); return v; }
      const t = next();
      if (t === undefined || !/[\d.]/.test(t)) throw new Error("bad token");
      return parseFloat(t);
    }
    const out = parseExpr();
    if (pos !== tokens.length || !isFinite(out)) throw new Error("invalid");
    return out;
  },

  launch() {
    const root = el("div");
    const keys = ["7","8","9","/","4","5","6","*","1","2","3","-","0",".","(","+","%","C","⌫",")"];
    root.innerHTML = `
      <input class="app-input" id="calc-display" readonly placeholder="0" style="width:100%;font-family:var(--font-mono);font-size:22px;text-align:right;margin-bottom:10px" />
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px" id="calc-pad"></div>
      <button class="app-btn" id="calc-eq" style="width:100%;margin-top:8px">= &nbsp;Calculate</button>
      <div class="diag" id="calc-hist" style="margin-top:10px"></div>`;
    const win = OS.makeWin({ id: "calc", title: "CALCULATOR", icon: "🧮", body: root, w: 320, h: 420 });
    const $ = (s) => win.body.querySelector("#" + s);
    const pad = $("calc-pad");
    let expr = "";
    const hist = [];
    const draw = () => { $("calc-display").value = expr; };
    keys.forEach((k) => {
      const b = el("button", "app-btn ghost", k);
      b.style.padding = "10px 0";
      b.onclick = () => {
        SFX.play("click");
        if (k === "C") expr = "";
        else if (k === "⌫") expr = expr.slice(0, -1);
        else expr += k;
        draw();
      };
      pad.appendChild(b);
    });
    const eq = () => {
      if (!expr.trim()) return;
      try {
        const v = this.evaluate(expr);
        hist.unshift(expr + " = " + v);
        $("calc-hist").innerHTML = hist.slice(0, 6).map((h) => "· " + h.replace(/</g, "&lt;")).join("<br>");
        expr = String(v);
      } catch (e) { OS.toast("Invalid expression", "err"); }
      draw();
    };
    $("calc-eq").onclick = eq;
    return win;
  },
};

/* ---------- UNIT CONVERTER ---------- */
const AppConvert = {
  units: {
    length: { label: "Length", u: { m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, yd: 0.9144, ft: 0.3048, in: 0.0254 } },
    mass:   { label: "Mass", u: { kg: 1, g: 0.001, t: 1000, lb: 0.45359237, oz: 0.028349523 } },
    data:   { label: "Data", u: { B: 1, KB: 1024, MB: 1048576, GB: 1073741824, TB: 1099511627776 } },
    time:   { label: "Time", u: { s: 1, min: 60, h: 3600, day: 86400, week: 604800 } },
    temp:   { label: "Temp", special: "temp", u: ["C", "F", "K"] },
  },
  conv(v, from, to, cat) {
    if (cat === "temp") {
      let c = from === "C" ? v : from === "F" ? (v - 32) * 5 / 9 : v - 273.15;
      return to === "C" ? c : to === "F" ? c * 9 / 5 + 32 : c + 273.15;
    }
    const u = this.units[cat].u;
    return v * u[from] / u[to];
  },
  launch() {
    const root = el("div");
    const cats = Object.keys(this.units);
    root.innerHTML = `
      <div class="app-toolbar">
        <select class="app-select" id="cv-cat">${cats.map((c) => `<option value="${c}">${this.units[c].label}</option>`).join("")}</select>
        <input class="app-input" id="cv-val" type="number" value="1" style="width:110px" />
        <select class="app-select" id="cv-from"></select>
        <span class="diag">→</span>
        <select class="app-select" id="cv-to"></select>
      </div>
      <div id="cv-out" class="bubble ai" style="max-width:100%;font-size:20px;font-family:var(--font-mono)"></div>
      <div class="diag" style="margin-top:10px">Also supports: kg↔lb, m↔ft, °C↔°F, KB↔MB… — offline, instant.</div>`;
    const win = OS.makeWin({ id: "convert", title: "UNIT CONVERTER", icon: "📐", body: root, w: 560, h: 260 });
    const $ = (s) => win.body.querySelector("#" + s);
    const fill = () => {
      const cat = $("cv-cat").value;
      const us = this.units[cat].u;
      const keys = Array.isArray(us) ? us : Object.keys(us);
      $("cv-from").innerHTML = keys.map((k) => `<option>${k}</option>`).join("");
      $("cv-to").innerHTML = keys.map((k, i) => `<option ${i === 1 ? "selected" : ""}>${k}</option>`).join("");
      this.go();
    };
    $("cv-cat").onchange = fill;
    const go = () => this.go && this.go();
    $("cv-from").onchange = () => this.go2(win);
    $("cv-to").onchange = () => this.go2(win);
    $("cv-val").oninput = () => this.go2(win);
    fill();
    win._go = () => this.go2(win);
    return win;
  },
  go2(win) {
    const $ = (s) => win.body.querySelector("#" + s);
    const v = parseFloat($("cv-val").value) || 0;
    const out = this.conv(v, $("cv-from").value, $("cv-to").value, $("cv-cat").value);
    $("cv-out").innerHTML = `${v} ${$("cv-from").value} = <b style="color:var(--cyan)">${out.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${$("cv-to").value}</b>`;
  },
};

/* ---------- CLOCK / POMODORO / TIMER ---------- */
const AppClock = {
  timers: [],
  launch() {
    const root = el("div");
    root.innerHTML = `
      <div id="ck-now" style="font-family:var(--font-display);font-size:44px;color:var(--cyan-soft);text-align:center;letter-spacing:3px"></div>
      <div class="diag" style="text-align:center;margin-bottom:12px" id="ck-date"></div>
      <div class="app-toolbar" style="justify-content:center">
        <button class="app-btn ghost" id="ck-pomo">🍅 Pomodoro 25m</button>
        <button class="app-btn ghost" id="ck-t5">⏱ 5 min</button>
        <button class="app-btn ghost" id="ck-t1">⏱ 1 min</button>
        <button class="app-btn danger" id="ck-stop">■ Stop</button>
      </div>
      <div id="ck-timer" style="font-family:var(--font-mono);font-size:30px;text-align:center;color:var(--cyan)"></div>
      <div class="diag" style="text-align:center">Pomodoro cycles: <b id="ck-pomo-n">0</b></div>`;
    const win = OS.makeWin({ id: "clock", title: "CLOCK & TIMERS", icon: "⏰", body: root, w: 420, h: 320 });
    const $ = (s) => win.body.querySelector("#" + s);
    let left = 0, iv = null, pomos = OS.get("pomos", 0);
    $("ck-pomo-n").textContent = pomos;
    win._iv = setInterval(() => {
      const d = new Date();
      $("ck-now").textContent = d.toLocaleTimeString([], { hour12: false });
      $("ck-date").textContent = d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
      if (left > 0) {
        left--;
        const m = Math.floor(left / 60), s = left % 60;
        $("ck-timer").textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
        if (left === 0) {
          SFX.play("ok"); AICore.speak("Time is up, operator.");
          if (win.dataset.mode === "pomo") { pomos++; OS.set("pomos", pomos); $("ck-pomo-n").textContent = pomos; OS.toast("🍅 Pomodoro complete — take 5", "ok"); }
          else OS.toast("Timer finished", "ok");
          $("ck-timer").textContent = "";
        }
      }
    }, 1000);
    const start = (secs, mode) => {
      left = secs; win.dataset.mode = mode || "";
      SFX.play("click");
    };
    $("ck-pomo").onclick = () => start(25 * 60, "pomo");
    $("ck-t5").onclick = () => start(300);
    $("ck-t1").onclick = () => start(60);
    $("ck-stop").onclick = () => { left = 0; $("ck-timer").textContent = ""; };
    win.onClose = () => clearInterval(win._iv);
    return win;
  },
};

/* ---------- WEATHER (real API, keyless) ---------- */
const AppWeather = {
  async fetch() {
    const g = await (await fetch("https://get.geojs.io/v1/ip/geo.json")).json();
    const w = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${g.latitude}&longitude=${g.longitude}&current_weather=true&hourly=temperature_2m,weathercode&forecast_days=1`)).json();
    return { place: `${g.city || g.region || "?"}, ${g.country || ""}`, cw: w.current_weather };
  },
  desc(code) {
    const m = { 0: "Clear ☀️", 1: "Mostly clear 🌤", 2: "Partly cloudy ⛅", 3: "Overcast ☁️", 45: "Fog 🌫", 48: "Icy fog 🌫", 51: "Drizzle 🌦", 61: "Rain 🌧", 63: "Rain 🌧", 65: "Heavy rain 🌧", 71: "Snow ❄️", 75: "Heavy snow ❄️", 80: "Showers 🌦", 95: "Thunderstorm ⛈", 96: "Storm + hail ⛈" };
    return m[code] || "Weather " + code;
  },
  launch() {
    const root = el("div");
    root.innerHTML = `<div id="wx-out" class="diag">Locating via IP…</div>`;
    const win = OS.makeWin({ id: "weather", title: "WEATHER — LIVE", icon: "🌤", body: root, w: 460, h: 300 });
    this.fetch().then(({ place, cw }) => {
      win.body.querySelector("#wx-out").innerHTML = `
        <b style="font-size:17px">${place}</b><br><br>
        <span style="font-size:44px">${this.desc(cw.weathercode).match(/[\u2190-\u2BFF\u2600-\u27BF]/) ? this.desc(cw.weathercode).slice(-2) : "🌡"}</span>
        <span style="font-family:var(--font-mono);font-size:34px;color:var(--cyan)"> ${cw.temperature}°C</span><br><br>
        ${this.desc(cw.weathercode)} · wind ${Math.round(cw.windspeed)} km/h<br>
        <span style="color:var(--text-2)">via Open-Meteo · live at ${new Date().toLocaleTimeString()}</span>`;
      if (window.Achievements) Achievements.flag("weather-checked");
    }).catch(() => {
      win.body.querySelector("#wx-out").textContent = "Weather unavailable — check connection.";
    });
    return win;
  },
};
