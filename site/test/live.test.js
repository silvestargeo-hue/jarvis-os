/* LIVE network test — validates the REAL keyless AI engines the OS depends on.
 * Run: node test/live.test.js   (requires internet) */
const fs = require("fs");
const path = require("path");
const jsdom = require(path.join("/mnt", "node_modules", "jsdom"));
const { JSDOM, VirtualConsole } = jsdom;

const ROOT = "/mnt/jarvis-os-site";
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

const vc = new VirtualConsole();
const dom = new JSDOM(html, { url: "http://localhost:4173/", runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: vc });
const { window } = dom;

/* minimal env stubs (NOT AI stubs — fetch stays real) */
window.matchMedia = (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} });
window.HTMLElement.prototype.scrollIntoView = function () {};
const store = {};
Object.defineProperty(window, "localStorage", { value: {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
  key: (i) => Object.keys(store)[i],
  get length() { return Object.keys(store).length; },
}, configurable: true });
window.HTMLCanvasElement.prototype.getContext = function () {
  return new Proxy({}, { get: (t, p) => (p === "createRadialGradient" || p === "createLinearGradient") ? (() => ({ addColorStop() {} })) : (typeof p === "string" ? () => {} : undefined) });
};
window.speechSynthesis = { getVoices: () => [], speak() {}, cancel() {} };
window.SpeechSynthesisUtterance = function (t) { this.text = t; };
window.BroadcastChannel = function () { this.postMessage = () => {}; this.close = () => {}; };
Object.defineProperty(window, "crypto", { value: require("crypto").webcrypto, configurable: true });
// NOTE: puter intentionally NOT stubbed — exercises the real Pollinations tiers
// NOTE: fetch intentionally left as jsdom default? jsdom lacks fetch — provide NODE's real fetch
window.fetch = (url, opts) => fetch(url, opts); // node 18+ real network fetch
window.AbortController = AbortController;
window.TextDecoder = TextDecoder;
window.TextEncoder = TextEncoder;

const scripts = ["assets/state.js", "assets/i18n.js", "assets/os.js", "assets/ai.js", "assets/library.js", "assets/mesh.js", "assets/apps.js", "assets/surprises.js", "assets/surprises2.js", "assets/voice.js", "assets/achievements.js", "assets/code.js", "assets/tour.js"];
const inline = [...window.document.querySelectorAll("script:not([src])")].map((n) => n.textContent).join("\n");
const combined = scripts.map((s) => fs.readFileSync(path.join(ROOT, s), "utf8")).join("\n;\n") + "\n" + inline + `
;window.__exports = { OS, AICore, AppLibrary, AppChat };`;
try { window.eval(combined); } catch (e) { console.error("LOAD FAIL:", e.message); process.exit(1); }
const X = window.__exports;

(async () => {
  console.log("─ LIVE AI ENGINE TESTS (real network) ─");

  // 1. streaming chat via Pollinations (no puter installed → tier 2/3)
  let streamed = "", engine = "";
  await X.AICore.chat(
    [{ role: "system", content: "You are JARVIS. Reply in exactly 3 words." }, { role: "user", content: "Confirm systems online" }],
    { onToken: (t) => { streamed += t; }, onDone: (e) => { engine = e; } }
  );
  console.log(`chat stream → engine=${engine} reply="${streamed.trim().slice(0, 60)}"`);
  if (!streamed.trim()) { console.log("FAIL  live streaming chat"); process.exit(1); }
  console.log("PASS  live streaming chat");

  // 2. one-shot completion
  const c = await X.AICore.complete("Say CONFIRMED in one word.");
  console.log(`complete → "${String(c).trim().slice(0, 40)}"`);
  if (!String(c).trim()) { console.log("FAIL  live completion"); process.exit(1); }
  console.log("PASS  live completion");

  // 3. image generation URL (verify endpoint returns an image)
  const url = await X.AICore.generateImage("a tiny red cube on white background");
  const imgResp = await fetch(url);
  const type = imgResp.headers.get("content-type") || "";
  const buf = await imgResp.arrayBuffer();
  console.log(`image → ${imgResp.status} · ${type} · ${buf.byteLength} bytes`);
  if (imgResp.status !== 200 || !/image\//.test(type) || buf.byteLength < 1000) { console.log("FAIL  live image gen"); process.exit(1); }
  console.log("PASS  live image generation");

  // 4. RAG with real AI: index doc, ask, expect answer + citations
  X.AppLibrary.addDoc("Propulsion Manual", "The ion thruster accelerates xenon ions between charged grids to produce thrust. Specific impulse exceeds 3000 seconds.", "test");
  const { answer, hits } = await X.AppLibrary.ask("How does the ion thruster produce thrust?");
  console.log(`rag → ${hits.length} citations · answer="${String(answer).trim().slice(0, 60)}…"`);
  if (!hits.length) { console.log("FAIL  rag retrieval"); process.exit(1); }
  if (!String(answer).trim()) { console.log("FAIL  rag answer"); process.exit(1); }
  console.log("PASS  live RAG with cited answer");

  console.log("\n=== ALL LIVE AI TESTS PASSED (real keyless engines) ===");
  process.exit(0);
})().catch((e) => { console.error("LIVE TEST CRASH:", e.message); process.exit(1); });
