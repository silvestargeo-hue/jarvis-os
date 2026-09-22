/* ============================================================
   Sync Bridge test suite — two-tab convergence in a live OS
   Run: node test/sync.test.js   (zero deps, pure Node)
   Simulates real tabs: isolated vm contexts, separate storage,
   and a BroadcastChannel bus that delivers messages cross-tab.
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const SRC = fs.readFileSync(path.join(ROOT, "assets", "state.js"), "utf8") +
            "\n;\n" +
            fs.readFileSync(path.join(ROOT, "assets", "sync-notes.js"), "utf8") +
            "\n;\nglobalThis.SyncBridge = SyncBridge; globalThis.OSNotesSync = OSNotesSync; globalThis.StateCore = StateCore;";

let pass = 0, fail = 0;
const failures = [];
function t(name, fn) {
  try { fn(); pass++; console.log("  PASS " + name); }
  catch (e) { fail++; failures.push(name); console.log("  FAIL " + name + " → " + e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || "eq") + `: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); }

/* FIFO message bus — mirrors real BroadcastChannel semantics (nothing lost) */
function mkbus() { const q = []; return { bus: (fn) => q.push(fn), flush: () => { while (q.length) q.shift()(); } }; }

/* Cross-tab channel registry — SHARED across all tabs (like a real browser) */
const GLOBAL_CHANNELS = new Set();

/* ---------- tab harness ---------- */
  const { bus, flush } = mkbus();
function makeTab(bus, storageSeed) {
  const store = new Map(Object.entries(storageSeed || {}));
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
  const sessionStorage = {
    _m: new Map(),
    getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
    setItem(k, v) { this._m.set(k, String(v)); },
  };
  const channels = { add: (ch) => GLOBAL_CHANNELS.add(ch) };
  class BroadcastChannel {
    constructor(name) { this.name = name; this.onmessage = null; channels.add(this); }
    postMessage(data) { bus(() => { for (const ch of GLOBAL_CHANNELS) if (ch !== this && ch.name === this.name && ch.onmessage) ch.onmessage({ data: JSON.parse(JSON.stringify(data)) }); }); }
    close() { GLOBAL_CHANNELS.delete(this); }
  }
  const ctx = { console, localStorage, sessionStorage, BroadcastChannel, setTimeout, clearTimeout };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: "sync-scope.js" });
  return { ctx, store, channels };
}

console.log("─ SYNC BRIDGE TESTS (two-tab convergence) ─");

t("bridge: basic typing flows to the other tab", () => {
  const { bus, flush } = mkbus();
  const A = makeTab(bus), B = makeTab(bus);

  A.ctx.SyncBridge.ensure("note1", "hello");
  B.ctx.SyncBridge.ensure("note1", "hello");
  A.ctx.SyncBridge.edit("note1", "hello world");
  flush();
  eq(B.ctx.SyncBridge.text("note1"), "hello world", "B received A's edit");
});

t("bridge: concurrent head+tail edits both survive (the CRDT payoff)", () => {
  const { bus, flush } = mkbus();
  const A = makeTab(bus), B = makeTab(bus);

  A.ctx.SyncBridge.ensure("doc", "mid");
  B.ctx.SyncBridge.ensure("doc", "mid");
  // both edit BEFORE any delivery (true concurrency)
  A.ctx.SyncBridge.edit("doc", "HEAD mid");        // insert at head
  B.ctx.SyncBridge.edit("doc", "mid TAIL");        // insert at tail
  flush(); // A's ops reach B
  flush(); // B's ops reach A
  eq(A.ctx.SyncBridge.text("doc"), B.ctx.SyncBridge.text("doc"), "converged");
  const txt = A.ctx.SyncBridge.text("doc");
  if (!(txt.startsWith("HEAD") && txt.endsWith("TAIL"))) throw new Error("lost concurrent edit: " + txt);
});

t("bridge: non-overlapping middle edits both survive", () => {
  const { bus, flush } = mkbus();
  const A = makeTab(bus), B = makeTab(bus);
  A.ctx.SyncBridge.ensure("d", "one two three");
  B.ctx.SyncBridge.ensure("d", "one two three");
  A.ctx.SyncBridge.edit("d", "one TWO three");   // edit early region
  B.ctx.SyncBridge.edit("d", "one two THREE");   // edit late region
  flush(); flush();
  const txt = A.ctx.SyncBridge.text("d");
  if (txt !== "one TWO THREE" && txt !== "one two THREE") throw new Error("unexpected merge: " + txt);
  eq(A.ctx.SyncBridge.text("d"), B.ctx.SyncBridge.text("d"), "converged");
});

t("bridge: reload restores full text from persisted op log", () => {
  const { bus, flush } = mkbus();
  const A = makeTab(bus);
  A.ctx.SyncBridge.ensure("persist", "chapter one");
  A.ctx.SyncBridge.edit("persist", "chapter one: the beginning");
  // brand-new tab, same localStorage (a reload)
  const seed = {};
  for (const [k, v] of A.store) seed[k] = v;
  const A2 = makeTab(bus, seed);
  eq(A2.ctx.SyncBridge.text("persist"), "chapter one: the beginning", "op log replays");
});

t("bridge: bind() drives a textarea end-to-end (input → sync → remote)", () => {
  const { bus, flush } = mkbus();
  const A = makeTab(bus), B = makeTab(bus);

  function fakeTextarea() {
    const el = { value: "", listeners: {}, selectionStart: 0, selectionEnd: 0,
      addEventListener(ev, fn) { (el.listeners[ev] = el.listeners[ev] || []).push(fn); },
      dispatch(ev) { for (const fn of el.listeners[ev] || []) fn({ target: el }); } };
    return el;
  }
  const taA = fakeTextarea(), taB = fakeTextarea();
  A.ctx.OSNotesSync.bind("bound", taA, "start");
  B.ctx.OSNotesSync.bind("bound", taB, "start");

  taA.value = "start + typed in A"; taA.selectionStart = taA.value.length;
  taA.dispatch("input");
  flush();
  eq(taB.value, "start + typed in A", "remote textarea updated");
});

t("bridge: three tabs, interleaved typing, all converge", () => {
  const { bus, flush } = mkbus();
  const A = makeTab(bus), B = makeTab(bus), C = makeTab(bus);
  A.ctx.SyncBridge.ensure("t3", "x");
  B.ctx.SyncBridge.ensure("t3", "x");
  C.ctx.SyncBridge.ensure("t3", "x");
  A.ctx.SyncBridge.edit("t3", "xA");
  B.ctx.SyncBridge.edit("t3", "xB");
  C.ctx.SyncBridge.edit("t3", "xC");
  flush(); flush(); flush(); flush(); flush(); flush();
  const a = A.ctx.SyncBridge.text("t3"), b = B.ctx.SyncBridge.text("t3"), c = C.ctx.SyncBridge.text("t3");
  eq(a, b, "A==B"); eq(b, c, "B==C");
  if (!(a.includes("A") && a.includes("B") && a.includes("C"))) throw new Error("lost a tab's edit: " + a);
});

t("bridge: stats report sane values", () => {
  const { bus, flush } = mkbus();
  const A = makeTab(bus);
  A.ctx.SyncBridge.ensure("s", "data");
  const st = A.ctx.SyncBridge.stats();
  if (st.logOps < 4) throw new Error("op log suspiciously small: " + st.logOps);
  eq(st.domain, "os.notes");
  if (!st.channel) throw new Error("channel missing");
});

console.log("");
console.log(`=== SYNC BRIDGE: ${pass} passed, ${fail} failed ===`);
if (fail > 0) { console.log("Failed: " + failures.join(", ")); process.exit(1); }
