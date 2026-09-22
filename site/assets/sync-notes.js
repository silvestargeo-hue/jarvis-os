/* ============================================================
   JARVIS OS — Sync Bridge (sync-notes.js)   v2.9.3
   Step 2 of the 10x rollout: live two-tab note sync using the
   CRDT state core. Notes become text fields on one SyncDoc
   ("os.notes"); the raw op log persists (NOT rendered text), so
   concurrent edits from two tabs merge without data loss.

   Flow:  type → diff vs mirror → char ops → op log (localStorage)
          → BroadcastChannel broadcast → remote tab applies ops
          → both tabs re-render from text CRDT → convergence.
   ============================================================ */

"use strict";

/* ---------- actor identity (persistent per browser profile) ---------- */
const SyncBridge = {
  CHANNEL: "jarvis-os-sync",
  STORE: "jarvis.ops.notes.v1",
  actor: null,
  doc: null,
  mirror: new Map(),   // field -> last rendered string (diff base)
  _chan: null,
  _saveTimer: null,
  _listeners: [],

  boot() {
    if (SyncBridge.doc) return;
    // persistent actor id (stable across reloads, unique per tab for THIS
    // session the actor is per-tab so two tabs converge as true peers)
    SyncBridge.actor = null;
    try {
      SyncBridge.actor = sessionStorage.getItem("jarvis.actor") ||
        ("tab-" + Math.random().toString(36).slice(2, 10));
      sessionStorage.setItem("jarvis.actor", SyncBridge.actor);
    } catch {
      SyncBridge.actor = "tab-" + Math.random().toString(36).slice(2, 10);
    }
    SyncBridge.doc = new StateCore.SyncDoc("os.notes", SyncBridge.actor);

    // 1. load persisted op log → rebuild doc state
    let log = [];
    try { log = JSON.parse(localStorage.getItem(SyncBridge.STORE) || "[]"); } catch { /* fresh */ }
    SyncBridge.doc.applyRemote(log);

    // 2. persist new ops as they are created (local edits)
    const origPending = SyncBridge.doc.pendingOps.bind(SyncBridge.doc);
    SyncBridge._persistFrom = log.length;
    SyncBridge.doc.pendingOps = function () { return origPending(); };

    // 3. cross-tab channel
    if (typeof BroadcastChannel !== "undefined") {
      SyncBridge._chan = new BroadcastChannel(SyncBridge.CHANNEL);
      SyncBridge._chan.onmessage = (e) => {
        const msg = e.data || {};
        if (msg.kind === "ops" && Array.isArray(msg.ops)) {
          SyncBridge.doc.applyRemote(msg.ops);
          SyncBridge._save(msg.ops); // persist remote ops too — logs converge
          const fields = new Set(msg.ops.map((o) => o.field).filter(Boolean));
          for (const f of fields) SyncBridge._mirror(f); // mirrors track remote state
          SyncBridge._emit();
        } else if (msg.kind === "hello") {
          // a new tab joined: it gets full state from log already, but
          // announce our log length so peers can reconcile if needed
          try { SyncBridge._chan.postMessage({ kind: "peers", actor: SyncBridge.actor }); } catch { /* closing */ }
        }
      };
    }
  },

  /* ---------- notes API (called by apps.js) ---------- */

  /** Ensure a note field exists with initial content. Idempotent. */
  ensure(field, initial) {
    SyncBridge.boot();
    // Idempotent: identical content → identical deterministic seed ids →
    // duplicates are deduped by _seen. No init marker, no dual-copy race.
    const ops = SyncBridge.doc.insertTextSeed(field, String(initial || ""));
    for (const op of ops) op.field = field;
    SyncBridge._mirror(field);
    if (ops.length) { SyncBridge._save(ops); SyncBridge._broadcast(ops); }
  },

  /** Current rendered text of a note field. */
  text(field) {
    SyncBridge.boot();
    return SyncBridge.doc.field(field).toString();
  },

  /**
   * Apply user typing: diff old vs new, emit minimal char ops.
   * Handles: pure insert, pure delete, replace (common prefix/suffix trim).
   */
  edit(field, newText) {
    SyncBridge.boot();
    newText = String(newText);
    const old = SyncBridge.mirror.has(field) ? SyncBridge.mirror.get(field) : SyncBridge.text(field);
    if (old === newText) return [];

    const rga = SyncBridge.doc.field(field);
    const live = rga.live();

    // common prefix / suffix
    let p = 0;
    while (p < old.length && p < newText.length && old[p] === newText[p]) p++;
    let sOld = old.length, sNew = newText.length;
    while (sOld > p && sNew > p && old[sOld - 1] === newText[sNew - 1]) { sOld--; sNew--; }

    const ops = [];
    // delete removed region (positions p..sOld-1) — delete by element id
    for (let i = sOld - 1; i >= p; i--) {
      if (live[i]) ops.push(SyncBridge.doc.deleteChar(field, live[i].id));
    }
    // insert added region after position p-1 (or head)
    let afterId = p > 0 && live[p - 1] ? live[p - 1].id : null;
    for (let i = p; i < sNew; i++) {
      const op = rga.insert(afterId, newText[i]);
      op.field = field;
      ops.push(op);
      afterId = op.id;
    }

    SyncBridge._mirror(field);
    SyncBridge._save(ops);
    SyncBridge._broadcast(ops);
    SyncBridge._emit();
    return ops;
  },

  /** Subscribe to remote changes (re-render callbacks). */
  onChange(fn) { SyncBridge._listeners.push(fn); },
  _emit() { for (const fn of SyncBridge._listeners) { try { fn(); } catch { /* listener bug isolated */ } } },

  /* ---------- internals ---------- */

  _mirror(field) { SyncBridge.mirror.set(field, SyncBridge.doc.field(field).toString()); },

  _save(newOps) {
    if (!newOps.length) return;
    try {
      const log = JSON.parse(localStorage.getItem(SyncBridge.STORE) || "[]");
      const seen = new Set(log.map((o) => o.id));
      for (const op of newOps) if (op && op.id && !seen.has(op.id)) log.push(op);
      // log compaction: hard cap (real fix = snapshot+truncate, on roadmap)
      if (log.length > 20000) log.splice(0, log.length - 20000);
      localStorage.setItem(SyncBridge.STORE, JSON.stringify(log));
    } catch { /* storage full — sync degrades to in-memory only */ }
  },

  _broadcast(ops) {
    if (!ops.length || !SyncBridge._chan) return;
    try { SyncBridge._chan.postMessage({ kind: "ops", from: SyncBridge.actor, ops }); }
    catch { /* channel closing */ }
  },

  stats() {
    SyncBridge.boot();
    let logLen = 0;
    try { logLen = JSON.parse(localStorage.getItem(SyncBridge.STORE) || "[]").length; } catch { /* ignore */ }
    return {
      actor: SyncBridge.actor,
      domain: SyncBridge.doc.domain,
      notes: SyncBridge.doc.map.keys().filter((k) => k.startsWith("init:")).length,
      logOps: logLen,
      lamport: StateCore.Lamport.now(),
      channel: !!SyncBridge._chan,
    };
  },
};

const OSNotesSync = {
  /** Open a textarea bound to a synced note field. Returns the element. */
  bind(field, textarea, initial) {
    SyncBridge.ensure(field, initial != null ? initial : "");
    textarea.value = SyncBridge.text(field);
    textarea.addEventListener("input", () => SyncBridge.edit(field, textarea.value));
    SyncBridge.onChange(() => {
      const t = SyncBridge.text(field);
      if (textarea.value !== t) {
        const atEnd = textarea.selectionStart === textarea.value.length;
        textarea.value = t;
        if (atEnd) textarea.selectionStart = textarea.selectionEnd = t.length;
      }
    });
    return textarea;
  },
};

if (typeof window !== "undefined") { window.SyncBridge = SyncBridge; window.OSNotesSync = OSNotesSync; }
if (typeof module !== "undefined" && module.exports) { module.exports = { SyncBridge, OSNotesSync }; }
