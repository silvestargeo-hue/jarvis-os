/* ============================================================
   JARVIS OS — Help Overlay (help.js)
   Press "?" (or F1) anywhere on the desktop: full keyboard map,
   terminal commands, voice phrases. Keyboard-navigable.
   ============================================================ */

"use strict";

const HelpOverlay = {
  open: false,

  toggle() { this.open ? this.close() : this.show(); },

  close() {
    document.getElementById("help-overlay")?.remove();
    this.open = false;
  },

  show() {
    if (this.open) return;
    this.open = true;
    const ov = el("div");
    ov.id = "help-overlay";
    ov.style.cssText = "position:fixed;inset:0;z-index:970;background:rgba(2,6,14,.72);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;padding:18px";
    ov.innerHTML = `
      <div style="width:min(860px,96vw);max-height:88vh;overflow:auto;border:1px solid rgba(56,189,248,.35);border-radius:14px;background:rgba(6,13,29,.98);box-shadow:0 30px 90px rgba(0,0,0,.7)">
        <div style="display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid rgba(56,189,248,.18)">
          <span style="font-family:var(--font-display);letter-spacing:2px;color:var(--cyan-soft)">JARVIS OS — FIELD MANUAL</span>
          <span style="flex:1"></span>
          <span class="kbd">esc</span><span class="diag">to close</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:14px;padding:18px">
          <div>
            <div class="diag"><b>KEYBOARD</b></div>
            <ul class="clean" style="font-size:13.5px">
              <li><span class="kbd">Ctrl+K</span> command palette</li>
              <li><span class="kbd">?</span> / <span class="kbd">F1</span> this manual</li>
              <li><span class="kbd">↑↓</span> + <span class="kbd">↵</span> navigate palette</li>
              <li><span class="kbd">Esc</span> close overlay / palette</li>
              <li>Drag window → <b>top</b> edge: maximize</li>
              <li>Drag window → <b>left/right</b> edge: snap half</li>
            </ul>
          </div>
          <div>
            <div class="diag"><b>VOICE (say…)</b></div>
            <ul class="clean" style="font-size:13.5px">
              <li>"open chat / terminal / library…"</li>
              <li>"ask <i>anything</i>" — AI answers in chat</li>
              <li>"paint a neon waterfall" — image gen</li>
              <li>"note buy milk" · "task ship demo"</li>
              <li>"theme" — cycle skins · "lock" — lock OS</li>
              <li>EN · नेपाली · हिन्दी — all work</li>
            </ul>
          </div>
          <div>
            <div class="diag"><b>TERMINAL (type…)</b></div>
            <ul class="clean" style="font-size:13.5px">
              <li><code>ai</code> <code>img</code> <code>wiki</code> <code>fortune</code></li>
              <li><code>lib ask</code> <code>mesh join</code> <code>collab on</code></li>
              <li><code>offline</code> <code>themes</code> <code>briefing</code></li>
              <li><code>alias add &lt;word&gt; &lt;app&gt;</code></li>
              <li><code>stats</code> <code>backup</code> <code>vault</code> <code>tour</code></li>
              <li><code>help</code> — full command list</li>
            </ul>
          </div>
          <div>
            <div class="diag"><b>SECRETS &amp; LIFE</b></div>
            <ul class="clean" style="font-size:13.5px">
              <li><span class="kbd">↑↑↓↓←→←→BA</span> singularity</li>
              <li>Say <b>"Jarvis"</b> (wake word, ⌘K to arm)</li>
              <li>Idle 90s → hyperspace screensaver</li>
              <li>Share text from any app → JARVIS ingests it</li>
              <li>Settings → Offline AI → chat with no internet</li>
              <li>Awards 🏆 track everything you do (5 secret)</li>
            </ul>
          </div>
        </div>
      </div>`;

    ov.addEventListener("pointerdown", (e) => { if (e.target === ov) this.close(); });
    document.body.appendChild(ov);
  },
};

/* "?" and F1 bindings — desktop only, never while typing in an input */
document.addEventListener("keydown", (e) => {
  if (e.key === "F1") { e.preventDefault(); HelpOverlay.toggle(); return; }
  if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const t = e.target;
    const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
    if (!typing && document.getElementById("desktop") && !document.getElementById("desktop").hidden) {
      e.preventDefault();
      HelpOverlay.toggle();
    }
  }
  if (e.key === "Escape" && HelpOverlay.open) HelpOverlay.close();
});
