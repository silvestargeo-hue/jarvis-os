/* ============================================================
   JARVIS OS — Tour (tour.js)
   First launch: JARVIS bubble greeting + optional guided tour
   with a spotlight that highlights each app in the dock.
   ============================================================ */

"use strict";

const Tour = {
  steps: [
    { sel: '.dock-btn[data-app="chat"]',     say: "This is AI Chat — ask me anything, no key needed. Type /image to paint." },
    { sel: '.dock-btn[data-app="library"]',  say: "The Library is your private RAG memory. Add documents; ask them questions with citations." },
    { sel: '.dock-btn[data-app="mesh"]',     say: "Mesh is end-to-end encrypted chat. Same room and passphrase joins your other devices." },
    { sel: '.dock-btn[data-app="terminal"]', say: "A real shell. Try: ai hello, img neon city, pin 1234." },
    { sel: '.dock-btn[data-app="files"]',    say: "Files stores your paintings and voice memos, right in this browser." },
    { sel: '#btn-palette',                   say: "And Ctrl+K opens the command palette — the fastest way around. Welcome aboard, operator." },
  ],

  maybe() {
    if (OS.get("tour-done", false)) return;
    setTimeout(() => this.bubble(), 1200);
  },

  bubble() {
    if (document.getElementById("jarvis-bubble")) return;
    const b = el("div");
    b.id = "jarvis-bubble";
    b.style.cssText = "position:fixed;left:22px;bottom:96px;z-index:960;max-width:300px;padding:14px 16px;border-radius:14px;border:1px solid rgba(56,189,248,.4);background:rgba(6,13,29,.96);box-shadow:0 12px 40px rgba(0,0,0,.5),0 0 30px rgba(56,189,248,.12);font-size:14.5px;color:var(--text-0)";
    b.innerHTML = `<b style="color:var(--cyan-soft);font-family:var(--font-display);letter-spacing:1px">JARVIS:</b>
      Welcome, operator. I run keyless — no account, no API key. Want the 30-second tour?`;
    const row = el("div", "app-toolbar");
    row.style.marginTop = "10px";
    const yes = el("button", "app-btn", "Tour me ▸");
    yes.onclick = () => { this.dismiss(); this.start(); };
    const no = el("button", "app-btn ghost", "Skip");
    no.onclick = () => this.dismiss();
    row.append(yes, no);
    b.appendChild(row);
    document.body.appendChild(b);
    AICore.speak("Welcome, operator. All systems online. Would you like the tour?");
  },

  dismiss() {
    document.getElementById("jarvis-bubble")?.remove();
    OS.set("tour-done", true);
  },

  start() {
    let i = 0;
    const spot = el("div");
    spot.id = "tour-spot";
    spot.style.cssText = "position:fixed;z-index:965;pointer-events:none;border:2px solid rgba(56,189,248,.8);border-radius:16px;box-shadow:0 0 0 9999px rgba(2,6,14,.62),0 0 30px rgba(56,189,248,.25);transition:all .35s ease";
    const tip = el("div");
    tip.id = "tour-tip";
    tip.style.cssText = "position:fixed;z-index:970;max-width:280px;padding:12px 14px;border-radius:12px;border:1px solid rgba(56,189,248,.4);background:rgba(6,13,29,.97);font-size:14px;color:var(--text-0)";
    document.body.append(spot, tip);
    AICore.speak("Starting tour.");

    const place = () => {
      const step = this.steps[i];
      const target = document.querySelector(step.sel);
      if (!target) { next(); return; }
      const r = target.getBoundingClientRect();
      spot.style.cssText += `;left:${r.left - 8}px;top:${r.top - 8}px;width:${r.width + 16}px;height:${r.height + 16}px`;
      const above = r.top > 200;
      tip.style.left = Math.max(10, Math.min(innerWidth - 300, r.left - 60)) + "px";
      tip.style.top = (above ? r.top - 86 : r.bottom + 12) + "px";
      tip.innerHTML = `<span class="diag">Step ${i + 1}/${this.steps.length}</span><br>${step.say}`;
      const btnRow = el("div", "app-toolbar");
      btnRow.style.marginTop = "8px";
      const nextB = el("button", "app-btn", i === this.steps.length - 1 ? "Finish ✓" : "Next ▸");
      nextB.onclick = () => next();
      btnRow.appendChild(nextB);
      tip.appendChild(btnRow);
      if (i < this.steps.length - 1) {
        const skip = el("button", "app-btn ghost", "Skip");
        skip.onclick = () => end();
        btnRow.appendChild(skip);
      }
      AICore.speak(step.say);
    };

    const next = () => {
      i++;
      if (i >= this.steps.length) { end(); return; }
      place();
    };
    const end = () => {
      spot.remove(); tip.remove();
      OS.set("tour-done", true);
      if (window.Achievements) Achievements.flag("tour-done-flag");
      OS.toast("Tour complete — the OS is yours", "ok");
    };
    place();
  },
};

setTimeout(() => { if (document.getElementById("desktop") && !document.getElementById("desktop").hidden) Tour.maybe(); }, 400);
