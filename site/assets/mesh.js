/* ============================================================
   JARVIS OS — Mesh (mesh.js)
   E2EE mesh chat. Room passphrase → PBKDF2-SHA256 (150k iters)
   → AES-GCM-256 key. Every message encrypted in your browser;
   relays never see plaintext. Transport: BroadcastChannel (same
   device) + optional Puter KV (cross-device, still E2EE).
   ============================================================ */

"use strict";

const AppMesh = {
  _key: null, _room: null, _bc: null, _seen: new Set(), _poll: null, _nick: null,
  peers: new Map(), _hbTimer: null, _gcTimer: null,

  /* ---------- crypto ---------- */
  async deriveKey(room, pass) {
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: enc.encode("jarvis-os-mesh:" + room), iterations: 150000, hash: "SHA-256" },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  },

  async encrypt(plaintext) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, this._key, new TextEncoder().encode(plaintext));
    const out = new Uint8Array(iv.length + ct.byteLength);
    out.set(iv); out.set(new Uint8Array(ct), iv.length);
    return btoa(String.fromCharCode(...out));
  },

  async decrypt(b64) {
    try {
      const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const iv = raw.slice(0, 12), ct = raw.slice(12);
      const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, this._key, ct);
      return new TextDecoder().decode(pt);
    } catch { return null; }
  },

  async join(room, pass, nick) {
    this._key = await this.deriveKey(room, pass);
    this._room = room;
    this._nick = nick || "operator";
    OS.set("mesh-last", { room, nick: this._nick });

    // same-device transport
    try { this._bc?.close(); } catch {}
    this._bc = new BroadcastChannel("jarvis-mesh-" + room);
    this._bc.onmessage = (e) => this._recv(e.data);

    // optional cross-device relay via Puter KV (still E2EE)
    if (typeof puter !== "undefined" && puter.kv) {
      try {
        this._kv = puter.kv;
        this._startPolling();
      } catch {}
    }
    OS.toast("Joined #" + room + " — end-to-end encrypted", "ok");
    if (window.Achievements) Achievements.flag("mesh-joins+1");
    this._startHeartbeat();
  },

  /* ---------- presence: encrypted heartbeats every 8s, GC after 25s silence ---------- */
  _startHeartbeat() {
    clearInterval(this._hbTimer);
    clearInterval(this._gcTimer);
    this.peers.clear();
    const beat = async () => {
      if (!this._key) return;
      const env = { id: crypto.randomUUID(), ts: Date.now(), ct: await this.encrypt(JSON.stringify({ presence: true, nick: this._nick, at: Date.now() })) };
      try { this._bc?.postMessage(env); } catch {}
      if (this._kv) { try { await this._kv.set("jarvis-mesh-hb-" + this._room, JSON.stringify(env)); } catch {} }
    };
    beat();
    this._hbTimer = setInterval(beat, 8000);
    // cross-device: read the shared heartbeat slot
    this._poll = this._poll || setInterval(() => {}, 2500); // keep legacy poll alive if set
    if (this._kv && !this._hbRemote) {
      this._hbRemote = setInterval(async () => {
        if (!this._key || !this._kv) return;
        try {
          const raw = await this._kv.get("jarvis-mesh-hb-" + this._room);
          if (raw) this._recv(JSON.parse(raw));
        } catch {}
      }, 9000);
    }
    this._gcTimer = setInterval(() => {
      const now = Date.now();
      for (const [nick, p] of this.peers) if (now - p.at > 25000) this.peers.delete(nick);
      this._renderPeers();
    }, 5000);
  },

  _renderPeers() {
    const chip = document.querySelector("#mesh-chip");
    if (!chip) return;
    const names = [...this.peers.keys()];
    chip.textContent = "ROOM: #" + this._room + " · AES-256-GCM · " + (names.length ? (names.length + " peer" + (names.length > 1 ? "s" : "") + ": " + names.slice(0, 3).join(",")) : "solo");
  },

  _startPolling() {
    clearInterval(this._poll);
    let lastTs = 0;
    this._poll = setInterval(async () => {
      if (!this._kv || !this._room) return;
      try {
        const raw = await this._kv.get("jarvis-mesh-" + this._room);
        if (!raw) return;
        const list = JSON.parse(raw);
        for (const env of list) {
          if (env.ts > lastTs) {
            lastTs = env.ts;
            this._recv(env);
          }
        }
      } catch {}
    }, 2500);
  },

  async _recv(env) {
    if (!env || env.id && this._seen.has(env.id)) return;
    if (env.id) this._seen.add(env.id);
    if (this._seen.size > 800) this._seen = new Set([...this._seen].slice(-400));
    const pt = await this.decrypt(env.ct);
    if (pt == null) {
      this._append("🔒 encrypted packet (different key)", "sys");
      return;
    }
    let msg;
    try { msg = JSON.parse(pt); } catch { return; }
    if (msg.presence) {
      if (msg.nick && msg.nick !== this._nick) {
        const known = this.peers.get(msg.nick);
        this.peers.set(msg.nick, { at: msg.at || Date.now() });
        if (!known) { this._append(null, msg.nick + " is online", "sys"); SFX.play("recv"); }
        this._renderPeers();
      }
      return;
    }
    this._append(msg.nick, msg.text);
    if (msg.nick !== this._nick) {
      SFX.play("recv");
      AICore.speak(`New mesh message from ${msg.nick}`);
    }
  },

  async send(text) {
    if (!this._key) { OS.toast("Join a room first", "err"); return; }
    const env = {
      id: crypto.randomUUID(),
      ts: Date.now(),
      ct: await this.encrypt(JSON.stringify({ nick: this._nick, text, at: Date.now() })),
    };
    this._recv(env); // echo locally
    try { this._bc?.postMessage(env); } catch {}
    if (this._kv) {
      try {
        const raw = await this._kv.get("jarvis-mesh-" + this._room) || "[]";
        const list = JSON.parse(raw);
        list.push(env);
        await this._kv.set("jarvis-mesh-" + this._room, JSON.stringify(list.slice(-200)));
      } catch {}
    }
  },

  leave() {
    try { this._bc?.close(); } catch {}
    clearInterval(this._poll);
    clearInterval(this._hbTimer);
    clearInterval(this._gcTimer);
    clearInterval(this._hbRemote);
    this.peers.clear();
    this._key = null; this._room = null; this._kv = null;
    OS.toast("Left mesh", "ok");
  },

  /* ================= UI ================= */
  launch() {
    const root = el("div");
    root.innerHTML = `
      <div id="mesh-gate">
        <div class="app-toolbar">
          <input class="app-input" id="mesh-room" style="flex:1;min-width:120px" placeholder="room name" />
          <input class="app-input" id="mesh-pass" style="flex:1;min-width:120px" type="password" placeholder="passphrase" />
          <input class="app-input" id="mesh-nick" style="max-width:110px" placeholder="nickname" />
        </div>
        <div class="app-toolbar">
          <button class="app-btn" id="mesh-join">Join room 🔐</button>
          <span class="diag">Same room + same passphrase = same messages. The passphrase never leaves this device.</span>
        </div>
      </div>
      <div id="mesh-live" style="display:none">
        <div class="app-toolbar">
          <span class="tb-chip" id="mesh-chip">ROOM: —</span>
          <button class="app-btn ghost" id="mesh-leave">Leave</button>
        </div>
        <div id="mesh-log" style="height:260px;overflow:auto;display:flex;flex-direction:column;gap:8px;padding:6px;border:1px solid rgba(56,189,248,.15);border-radius:10px;background:rgba(2,8,18,.5)"></div>
        <div class="term-in-row" style="margin-top:10px">
          <span class="term-prompt" id="mesh-prompt">you:</span>
          <input class="term-in" id="mesh-in" placeholder="Encrypted message…" />
          <button class="app-btn" id="mesh-send">Send ⬱</button>
        </div>
      </div>`;

    const win = OS.makeWin({ id: "mesh", title: "MESH — E2EE CHAT", icon: "🛡", body: root, w: 620, h: 500 });

    win.onClose = () => this.leave();
    // note: closing keeps key (rejoin instant) — leave only clears transport

    win.body.querySelector("#mesh-join").onclick = async () => {
      const room = win.body.querySelector("#mesh-room").value.trim();
      const pass = win.body.querySelector("#mesh-pass").value;
      const nick = win.body.querySelector("#mesh-nick").value.trim() || "operator";
      if (!room || !pass) { OS.toast("Room and passphrase required", "err"); return; }
      await this.join(room, pass, nick);
      win.body.querySelector("#mesh-gate").style.display = "none";
      win.body.querySelector("#mesh-live").style.display = "block";
      win.body.querySelector("#mesh-chip").textContent = "ROOM: #" + room + " · AES-256-GCM";
      win.body.querySelector("#mesh-prompt").textContent = nick + ":";
      this._append(null, "Joined #" + room + ". All traffic encrypted before it leaves your browser.", "sys");
      win.body.querySelector("#mesh-in").focus();
    };

    const send = () => {
      const inp = win.body.querySelector("#mesh-in");
      const t = inp.value.trim();
      if (!t) return;
      inp.value = "";
      this.send(t);
    };
    win.body.querySelector("#mesh-send").onclick = send;
    win.body.querySelector("#mesh-in").onkeydown = (e) => { if (e.key === "Enter") send(); };

    win.body.querySelector("#mesh-leave").onclick = () => {
      this.leave();
      win.body.querySelector("#mesh-live").style.display = "none";
      win.body.querySelector("#mesh-gate").style.display = "block";
    };

    return win;
  },

  _append(nick, text, kind) {
    const log = document.querySelector("#mesh-log");
    if (!log) return;
    const b = el("div", "bubble " + (kind === "sys" ? "ai" : nick === this._nick ? "user" : "ai"));
    b.innerHTML = kind === "sys"
      ? `<span style="color:var(--text-2)">— ${text} —</span>`
      : `<b style="color:var(--cyan-soft)">${nick.replace(/</g, "&lt;")}</b><br>${text.replace(/</g, "&lt;")}`;
    log.appendChild(b);
    log.scrollTop = 1e9;
  },
};
