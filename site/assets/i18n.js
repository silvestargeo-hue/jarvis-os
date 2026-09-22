/* ============================================================
   JARVIS OS — i18n (i18n.js)
   English · नेपाली · हिन्दी. Translates boot, lock, topbar,
   dock, hello panel. Loaded BEFORE os.js.
   ============================================================ */

"use strict";

const I18N = {
  locale: "en",
  dicts: {
    en: { name: "English", voice: "en-US",
      boot: ["JARVIS OS v2.5 — browser kernel", "[OK]   mount /localStorage ................ done", "[OK]   engine stack: puter → pollinations .. armed", "[OK]   vision pipeline ..................... ready", "[OK]   voice i/o (mic + tts) ............... ready", "[OK]   window manager ...................... up", "[OK]   command palette [ctrl+k] ............ bound", "", "\"Good day, operator. All systems nominal.\""],
      greet: "Good day, operator. All systems nominal.",
      welcome: "Your own AI operating system — unlimited, keyless, un-gatekept. Live in your browser.",
      tagline: "Open AI Chat", greetBtn: "🎙 Greet me", search: "⌘ Search",
      operator: "Operator", secure: "JARVIS OS · Secure Session", pinPh: "PIN (default 0000)", unlock: "Unlock", denied: "ACCESS DENIED — wrong PIN", pinHint: "First time? Any PIN you set becomes your PIN.",
      online: "● ONLINE", offline: "◌ OFFLINE", ai: "AI: —", apps: {
        chat: "AI Chat", library: "Library", mesh: "Mesh", image: "Image Lab", terminal: "Terminal", notes: "Notes", tasks: "Tasks", files: "Files", code: "Code Studio", achievements: "Awards", about: "System" },
      vcmds: { open: "open", ask: "ask", say: "say", paint: "paint", note: "note", task: "task", lock: "lock", theme: "theme", help: "help" } },

    ne: { name: "नेपाली", voice: "ne-NP",
      boot: ["JARVIS OS v2.5 — ब्राउजर कर्नेल", "[OK]   भण्डारण माउन्ट ...................... भयो", "[OK]   इन्जिन स्ट्याक ...................... तयार", "[OK]   भिजन पाइपलाइन ...................... तयार", "[OK]   आवाज इनपुट/आउटपुट .................. तयार", "[OK]   विन्डो प्रबन्धक ..................... चलिरहेको", "[OK]   कमाण्ड प्यालेट [ctrl+k] ............. बाँधियो", "", "\"नमस्कार अपरेटर। सबै प्रणाली सामान्य।\""],
      greet: "नमस्कार अपरेटर। सबै प्रणाली सामान्य।",
      welcome: "तपाईंको आफ्नै AI अपरेटिङ सिस्टम — असीमित, किलरहित, अबाधित। ब्राउजरमै जिउँदो।",
      tagline: "AI च्याट खोल्नुहोस्", greetBtn: "🎙 अभिवादन", search: "⌘ खोज्नुहोस्",
      operator: "अपरेटर", secure: "JARVIS OS · सुरक्षित सेसन", pinPh: "PIN (पहिलो पटक 0000)", unlock: "खोल्नुहोस्", denied: "पहुँच अस्वीकृत — PIN मिलेन", pinHint: "पहिलो पटक? तपाईंले राखेको PIN नै तपाईंको PIN हुन्छ।",
      online: "● अनलाइन", offline: "◌ अफलाइन", ai: "AI: —", apps: {
        chat: "AI च्याट", library: "पुस्तकालय", mesh: "मेश", image: "इमेज ल्याब", terminal: "टर्मिनल", notes: "नोट", tasks: "काम", files: "फाइल", code: "कोड स्टुडियो", achievements: "पदक", about: "सिस्टम" },
      vcmds: { open: "खोल", ask: "सोध", say: "भन", paint: "चित्र", note: "नोट", task: "काम", lock: "बन्द", theme: "रङ", help: "मद्दत" } },

    hi: { name: "हिन्दी", voice: "hi-IN",
      boot: ["JARVIS OS v2.5 — ब्राउज़र कर्नेल", "[OK]   स्टोरेज माउंट ...................... पूर्ण", "[OK]   इंजन स्टैक ......................... तैयार", "[OK]   विज़न पाइपलाइन ..................... तैयार", "[OK]   वॉइस इनपुट/आउटपुट .................. तैयार", "[OK]   विंडो मैनेजर ....................... चालू", "[OK]   कमांड पैलेट [ctrl+k] ............... बंधा", "", "\"नमस्ते ऑपरेटर। सभी सिस्टम सामान्य।\""],
      greet: "नमस्ते ऑपरेटर। सभी सिस्टम सामान्य।",
      welcome: "आपका अपना AI ऑपरेटिंग सिस्टम — असीमित, कीलेस, अनगेटकेप्ट। ब्राउज़र में जीवंत।",
      tagline: "AI चैट खोलें", greetBtn: "🎙 अभिवादन", search: "⌘ खोजें",
      operator: "ऑपरेटर", secure: "JARVIS OS · सुरक्षित सेशन", pinPh: "PIN (पहली बार 0000)", unlock: "खोलें", denied: "पहुँच अस्वीकृत — PIN गलत", pinHint: "पहली बार? आपका रखा PIN ही आपका PIN है।",
      online: "● ऑनलाइन", offline: "◌ ऑफ़लाइन", ai: "AI: —", apps: {
        chat: "AI चैट", library: "लाइब्रेरी", mesh: "मेश", image: "इमेज लैब", terminal: "टर्मिनल", notes: "नोट्स", tasks: "काम", files: "फ़ाइलें", code: "कोड स्टूडियो", achievements: "पदक", about: "सिस्टम" },
      vcmds: { open: "खोलो", ask: "पूछो", say: "बोलो", paint: "चित्र", note: "नोट", task: "काम", lock: "लॉक", theme: "थीम", help: "मदद" } },
  },

  t(key) {
    const d = this.dicts[this.locale] || this.dicts.en;
    return d[key] != null ? d[key] : (this.dicts.en[key] != null ? this.dicts.en[key] : key);
  },

  set(loc, silent) {
    if (!this.dicts[loc]) return;
    this.locale = loc;
    OS.set("locale", loc);
    this.apply();
    if (!silent) {
      OS.toast("भाषा: " + this.dicts[loc].name, "ok");
      try { speechSynthesis.cancel(); } catch {}
      const u = new SpeechSynthesisUtterance(this.dicts[loc].greet);
      u.lang = this.dicts[loc].voice;
      speechSynthesis.speak(u);
    }
  },

  cycle() {
    const keys = Object.keys(this.dicts);
    this.set(keys[(keys.indexOf(this.locale) + 1) % keys.length]);
  },

  apply() {
    const d = this.dicts[this.locale] || this.dicts.en;
    // boot lines (if boot screen still present)
    const log = document.getElementById("boot-log");
    if (log) log.innerHTML = d.boot.map((l) => `<span class="${l.startsWith("[OK]") ? "ok" : l.startsWith('"') ? "hl" : ""}">${l || "&nbsp;"}</span>`).join("\n");
    // lock screen
    const pin = document.getElementById("lock-pin");
    if (pin) pin.placeholder = d.pinPh;
    const lb = document.getElementById("lock-btn");
    if (lb) lb.textContent = d.unlock;
    const ln = document.querySelector(".lock-name");
    if (ln) ln.textContent = d.operator;
    const ls = document.querySelector(".lock-sub");
    if (ls) ls.textContent = d.secure;
    const lh = document.querySelector(".lock-hint");
    if (lh) lh.textContent = d.pinHint;
    // topbar
    const tb = document.getElementById("btn-palette");
    if (tb) tb.textContent = d.search;
    const chip = document.getElementById("tb-engine");
    if (chip) chip.textContent = d.ai;
    const net = document.getElementById("tb-net");
    if (net) net.textContent = navigator.onLine ? d.online : d.offline;
    // hello panel
    const p = document.querySelector(".desk-hello p");
    if (p) p.textContent = d.welcome;
    const hl = document.querySelector('[data-launch="chat"]');
    if (hl) hl.textContent = "▲ " + d.tagline;
    const gb = document.getElementById("hello-voice");
    if (gb) gb.textContent = d.greetBtn;
    // dock labels
    document.querySelectorAll(".dock-btn").forEach((b) => {
      const id = b.dataset.app;
      const lbl = d.apps[id];
      if (lbl) b.querySelector(".dn").textContent = lbl;
    });
    // greet speech uses localized line
    const gv = document.getElementById("hello-voice");
    if (gv) gv.dataset.speak = d.greet;
  },
};
