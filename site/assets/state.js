/* ============================================================
   JARVIS OS — State Core (state.js)   v2.9.2
   Zero-dependency CRDT state core. Foundation for sync, multi-device,
   annotations, mesh, and the enterprise control plane (ARCHITECTURE-*.md).

   Op envelope (the contract between edge plane and control plane):
     { v: 1, id, actor, seq, lamport, type, key, value }

   Structures:
     • LWWMap  — last-writer-wins map (Lamport clock, actor tiebreak)
     • RGA     — replicated growable array for text (insert after origin)
     • Anchors — content-hash-stable positions (survive re-flow/edits)

   Guarantees tested by test/state.test.js:
     • Convergence: any permutation/ordering/duplication of ops → same state
     • Commutativity, associativity, idempotency
     • Causal correctness via Lamport clocks
     • Anchor stability under text edits
   ============================================================ */

"use strict";

/* ---------- Lamport clock ---------- */
const Lamport = {
  clock: 0,
  tick() { return ++Lamport.clock; },
  observe(l) { if (l > Lamport.clock) Lamport.clock = l; }, // merge remote time
  now() { return Lamport.clock; },
  serialize() { return Lamport.clock; },
  load(c) { if (c > Lamport.clock) Lamport.clock = c; },
};

/* ---------- Op envelope factory ---------- */
let _seq = 0;
function makeOp(type, key, value, actor) {
  _seq += 1;
  return {
    v: 1,
    id: actor + ":" + _seq + ":" + Lamport.tick(),
    actor: actor,
    seq: _seq,
    lamport: Lamport.now(),
    type, key, value,
  };
}

/* ============================================================
   LWW-Map — last-writer-wins key/value store
   ============================================================ */
class LWWMap {
  constructor(actor) {
    this.actor = actor;
    this.entries = new Map(); // key -> { value, lamport, actor, tombstone }
    this.ops = [];            // full op log (for sync/replay/audit)
  }

  set(key, value) {
    const op = makeOp("set", key, value, this.actor);
    this._apply(op);
    return op;
  }

  delete(key) {
    const prev = this.entries.get(key);
    const op = makeOp("del", key, prev ? prev.value : null, this.actor);
    op.tombstone = true;
    this._apply(op);
    return op;
  }

  _apply(op) {
    this.ops.push(op);
    Lamport.observe(op.lamport);
    const cur = this.entries.get(op.key);
    if (!cur) {
      this.entries.set(op.key, { value: op.value, lamport: op.lamport, actor: op.actor, tombstone: !!op.tombstone });
      return;
    }
    // LWW: higher lamport wins; tie broken by actor id (total order)
    if (op.lamport > cur.lamport || (op.lamport === cur.lamport && op.actor > cur.actor)) {
      cur.value = op.value;
      cur.lamport = op.lamport;
      cur.actor = op.actor;
      cur.tombstone = !!op.tombstone;
    }
  }

  /** Merge remote op(s). Idempotent by op.id dedupe. */
  merge(ops) {
    for (const op of [].concat(ops)) {
      if (!op || !op.id || this._seen.has(op.id)) continue;
      this._seen.add(op.id);
      this._apply(op);
    }
  }
  get _seen() {
    if (!this.__seen) this.__seen = new Set(this.ops.map((o) => o.id));
    return this.__seen;
  }

  get(key) { const e = this.entries.get(key); return e && !e.tombstone ? e.value : undefined; }
  has(key) { const e = this.entries.get(key); return !!e && !e.tombstone; }
  keys() { return [...this.entries.keys()].filter((k) => this.has(k)); }
  /** Deterministic: sorted keys, so identical states stringify identically everywhere. */
  snapshot() {
    const out = {};
    for (const k of [...this.entries.keys()].sort()) {
      const e = this.entries.get(k);
      if (!e.tombstone) out[k] = e.value;
    }
    return out;
  }
}

/* ============================================================
   RGA — replicated growable array (text CRDT)
   Inserts are (afterId, id) pairs; order = RGA traversal.
   Deletion is a tombstone on the element (never a position).
   ============================================================ */
class RGA {
  constructor(actor) {
    this.actor = actor;
    this.elems = new Map(); // id -> { id, after, ch, del }
    this.ops = [];
    // virtual root so inserts at head have an anchor
    this.elems.set("\u0000ROOT", { id: "\u0000ROOT", after: null, ch: null, del: true });
  }

  insert(afterId, ch) {
    if (typeof ch !== "string" || ch.length !== 1) throw new Error("RGA.insert: single char required");
    if (afterId !== null && !this.elems.has(afterId)) throw new Error("RGA.insert: unknown origin " + afterId);
    const op = makeOp("ins", afterId || "\u0000ROOT", { ch }, this.actor);
    this._apply(op);
    return op;
  }

  /** Insert a whole string efficiently: chain of single-char ops sharing one causal batch. */
  insertText(afterId, text) {
    const ops = [];
    let cur = afterId;
    for (const ch of text) { const op = this.insert(cur, ch); ops.push(op); cur = op.id; }
    return ops;
  }

  /**
   * Deterministic seed: inserts text using content-derived op ids so that two
   * replicas seeding the SAME field with the SAME text produce IDENTICAL ops —
   * seeding becomes idempotent (no dual-copy race on simultaneous open).
   */
  insertTextSeed(field, text) {
    let h = 5381;
    const s = field + "\u0000" + text;
    for (let i = 0; i < s.length; i++) { h = ((h << 5) + h + s.charCodeAt(i)) | 0; }
    const base = "seed-" + (h >>> 0).toString(36);
    const ops = [];
    let cur = "\u0000ROOT";
    for (let i = 0; i < text.length; i++) {
      const op = makeOp("ins", cur, { ch: text[i] }, this.actor);
      op.id = base + ":" + i;   // deterministic id overrides random
      this._apply(op);          // applied exactly once, under that id
      ops.push(op);
      cur = op.id;
    }
    return ops;
  }

  markDeleted(id) {
    if (!this.elems.has(id)) throw new Error("RGA.markDeleted: unknown elem " + id);
    const op = makeOp("del", id, null, this.actor);
    this._apply(op);
    return op;
  }

  _apply(op) {
    this.ops.push(op);
    Lamport.observe(op.lamport);
    if (op.type === "ins") {
      if (this.elems.has(op.id)) return; // idempotent apply (deterministic seed ids, dup delivery)
      // a tombstone may have arrived before its element (disordered delivery)
      const preDel = this.__pendingDel && this.__pendingDel.has(op.id);
      const el = { id: op.id, after: op.key === "\u0000ROOT" ? null : op.key, ch: op.value.ch, del: !!preDel };
      if (preDel) this.__pendingDel.delete(op.id);
      this.elems.set(op.id, el);
    } else if (op.type === "del") {
      const el = this.elems.get(op.key);
      if (el) el.del = true;
      else {
        // element not yet known — remember the tombstone, apply on arrival
        if (!this.__pendingDel) this.__pendingDel = new Set();
        this.__pendingDel.add(op.key);
      }
    }
  }

  merge(ops) {
    for (const op of [].concat(ops)) {
      if (!op || !op.id || this._seen.has(op.id)) continue;
      this._seen.add(op.id);
      // delay application if origin unknown (causal delivery violation) — buffer
      if (op.type === "ins" && op.key !== "\u0000ROOT" && !this.elems.has(op.key)) {
        this._buffer.push(op);
        continue;
      }
      this._apply(op);
      this._drain();
    }
  }
  get _buffer() { if (!this.__buf) this.__buf = []; return this.__buf; }
  get _seen() { if (!this.__seen) this.__seen = new Set(this.ops.map((o) => o.id)); return this.__seen; }
  _drain() {
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (let i = 0; i < this._buffer.length; i++) {
        const op = this._buffer[i];
        if (op.key === "\u0000ROOT" || this.elems.has(op.key)) {
          this._buffer.splice(i, 1);
          this._apply(op);
          progressed = true;
          i--;
        }
      }
    }
  }

  /**
   * Ordered live element ids (iterative DFS — safe for 100k-char texts).
   * Concurrent inserts at the same origin: higher op.id first (RGA rule).
   * The virtual ROOT is excluded from its own child list (no cycles).
   */
  _order() {
    const ROOT = "\u0000ROOT";
    const children = new Map(); // afterId -> [ids]
    for (const el of this.elems.values()) {
      if (el.id === ROOT) continue;
      const k = el.after === null ? ROOT : el.after;
      if (!children.has(k)) children.set(k, []);
      children.get(k).push(el.id);
    }
    for (const list of children.values()) list.sort((a, b) => (a < b ? 1 : -1));
    const order = [];
    const stack = [ROOT];
    while (stack.length) {
      const id = stack.pop();
      order.push(id);
      const kids = children.get(id);
      if (kids) for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
    }
    return order;
  }

  /** Traverse to current text. */
  toString() {
    let out = "";
    for (const id of this._order()) {
      const el = this.elems.get(id);
      if (el && !el.del && el.ch) out += el.ch;
    }
    return out;
  }

  /** Live elements in order: [{id, ch}] — used for anchors and cursors. */
  live() {
    const out = [];
    for (const id of this._order()) {
      const el = this.elems.get(id);
      if (el && !el.del && el.ch) out.push({ id, ch: el.ch });
    }
    return out;
  }

  get length() { return this.live().length; }
}

/* ============================================================
   Anchors — content-hash-stable positions.
   An anchor is {before, after}: the ids of the two live neighbors
   around a position. Insertions/deletions elsewhere never move it;
   if a neighbor is deleted, the anchor still resolves to a position
   by re-resolving through the live sequence.
   ============================================================ */
const Anchors = {
  /**
   * Capture an anchor at index i of rga's live sequence.
   */
  capture(rga, index) {
    const live = rga.live();
    const before = index > 0 ? live[index - 1].id : null;
    const after = index < live.length ? live[index].id : null;
    return { before, after };
  },

  /**
   * Resolve an anchor to a live index. Tries before-side first (stable for
   * typing at the anchor), then after-side. Returns -1 if sequence is empty
   * or both neighbors vanished (fully deleted region).
   */
  resolve(rga, anchor) {
    const live = rga.live();
    const ids = new Map(live.map((e, i) => [e.id, i]));
    if (anchor.before !== null && ids.has(anchor.before)) {
      // position after `before`
      return ids.get(anchor.before) + 1 <= live.length ? ids.get(anchor.before) + 1 : live.length;
    }
    if (anchor.after !== null && ids.has(anchor.after)) return ids.get(anchor.after);
    return anchor.before === null && anchor.after === null ? 0 : -1;
  },
};

/* ============================================================
   SyncDoc — one replicable document combining both structures.
   domain examples: "notes", "tasks", "chat:room1", "book:ann:hash3"
   ============================================================ */
class SyncDoc {
  constructor(domain, actor) {
    this.domain = domain;
    this.actor = actor;
    this.map = new LWWMap(actor);
    this.texts = new Map(); // field -> RGA
  }

  field(name) {
    if (!this.texts.has(name)) this.texts.set(name, new RGA(this.actor));
    return this.texts.get(name);
  }

  setKey(key, value) { return this.map.set(key, value); }
  delKey(key) { return this.map.delete(key); }

  insertText(field, afterId, text) {
    const ops = this.field(field).insertText(afterId, text);
    for (const op of ops) op.field = field;
    return ops;
  }

  /** Deterministic seed via the field's RGA (ids are content-derived). */
  insertTextSeed(field, text) {
    const ops = this.field(field).insertTextSeed(field, text);
    for (const op of ops) op.field = field;
    return ops;
  }

  deleteChar(field, id) {
    const op = this.field(field).markDeleted(id);
    op.field = field;
    op.charDel = true;
    return op;
  }

  /** All pending ops across map + fields (for sync transmission). */
  pendingOps() {
    const ops = [];
    for (const op of this.map.ops) ops.push(op);
    for (const rga of this.texts.values()) for (const op of rga.ops) ops.push(op);
    return ops;
  }

  /** Apply remote ops (any order; handles duplicates; routes by field tag). */
  applyRemote(ops) {
    for (const op of [].concat(ops)) {
      if (!op || !op.id) continue;
      if (op.field) {
        this.field(op.field).merge([op]);
      } else if (op.type === "set") {
        this.map.merge([op]);
      } else if (op.type === "del" && op.charDel) {
        for (const rga of this.texts.values()) {
          if (rga.elems.has(op.key)) { rga.merge([op]); break; }
        }
      } else if (op.type === "del") {
        this.map.merge([op]);
      } else if (op.type === "ins") {
        const first = this.texts.keys().next();
        if (!first.done) this.texts.get(first.value).merge([op]);
      }
    }
    return true;
  }

  snapshot() {
    const snap = { domain: this.domain, map: this.map.snapshot(), fields: {} };
    for (const name of [...this.texts.keys()].sort()) snap.fields[name] = this.texts.get(name).toString();
    return snap;
  }
}

/* ---------- Global export ---------- */
const StateCore = { Lamport, makeOp, LWWMap, RGA, Anchors, SyncDoc, version: "2.9.2" };
if (typeof window !== "undefined") window.StateCore = StateCore;
if (typeof module !== "undefined" && module.exports) module.exports = StateCore;
