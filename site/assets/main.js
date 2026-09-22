/* ============================================================
   JARVIS OS — Showcase Site Scripts
   Boot FX, boot-sequence terminal typing, scroll reveal, counters
   ============================================================ */

(function () {
  "use strict";

  /* ---------- Boot overlay (fast, once per session) ---------- */
  var boot = document.createElement("div");
  boot.id = "boot";
  boot.innerHTML =
    '<div class="boot-inner"><div class="ring"></div>' +
    '<div class="boot-text">INITIALIZING JARVIS OS…</div></div>';
  document.body.appendChild(boot);

  var seen = false;
  try { seen = sessionStorage.getItem("jarvis-booted") === "1"; } catch (e) {}

  function hideBoot() {
    boot.style.opacity = "0";
    setTimeout(function () { boot.remove(); }, 500);
  }
  if (seen) {
    setTimeout(hideBoot, 150);
  } else {
    setTimeout(hideBoot, 900);
    try { sessionStorage.setItem("jarvis-booted", "1"); } catch (e) {}
  }

  /* ---------- Active nav link ---------- */
  var path = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-links a").forEach(function (a) {
    var href = a.getAttribute("href");
    if (href === path) a.classList.add("active");
  });

  /* ---------- Scroll reveal ---------- */
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            en.target.classList.add("visible");
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("visible"); });
  }

  /* ---------- Boot-sequence terminal typing ---------- */
  var terminal = document.querySelector("[data-terminal]");
  if (terminal) {
    var body = terminal.querySelector(".terminal-body");
    var lines = [
      { t: "$ jarvis --boot", c: "hl" },
      { t: "[OK]   engine stack online — 5 tiers armed", c: "ok" },
      { t: "       puter → pollinations → groq → webllm", c: "dim" },
      { t: "[OK]   e2ee mesh: rooms synced, keys wrapped", c: "ok" },
      { t: "[OK]   rag library: 1,208 docs indexed", c: "ok" },
      { t: "[OK]   vision, /image, voice loop: ready", c: "ok" },
      { t: "[OK]   pwa installed · offline shell cached", c: "ok" },
      { t: "", c: "" },
      { t: 'JARVIS: "Good to see you again. Systems at 100%."', c: "hl" },
    ];

    var li = 0;
    function typeLine() {
      if (li >= lines.length) {
        var cur = document.createElement("span");
        cur.className = "cursor";
        body.appendChild(cur);
        return;
      }
      var el = document.createElement("span");
      el.className = "ln " + lines[li].c;
      body.appendChild(el);

      var text = lines[li].t;
      var ci = 0;
      var speed = lines[li].c === "hl" ? 34 : 8;

      var timer = setInterval(function () {
        el.textContent = text.slice(0, ++ci);
        if (ci >= text.length) {
          clearInterval(timer);
          li++;
          setTimeout(typeLine, 90);
        }
      }, speed);
    }
    typeLine();
  }

  /* ---------- Animated counters ---------- */
  var counters = document.querySelectorAll("[data-count]");
  function animateCounter(el) {
    var target = parseFloat(el.getAttribute("data-count"));
    var suffix = el.getAttribute("data-suffix") || "";
    var dur = 1400;
    var start = null;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased).toLocaleString() + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  if ("IntersectionObserver" in window && counters.length) {
    var cio = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            animateCounter(en.target);
            cio.unobserve(en.target);
          }
        });
      },
      { threshold: 0.4 }
    );
    counters.forEach(function (el) { cio.observe(el); });
  } else {
    counters.forEach(animateCounter);
  }

  /* ---------- Voice command easter egg ---------- */
  var voices = [];
  try { voices = window.speechSynthesis ? speechSynthesis.getVoices() : []; } catch (e) {}
  document.querySelectorAll("[data-speak]").forEach(function (el) {
    el.addEventListener("click", function () {
      if (!window.speechSynthesis) return;
      var u = new SpeechSynthesisUtterance(el.getAttribute("data-speak"));
      u.rate = 0.95;
      u.pitch = 0.85;
      if (voices.length) u.voice = voices.find(function (v) { return /en/i.test(v.lang); }) || voices[0];
      speechSynthesis.speak(u);
    });
  });
})();
