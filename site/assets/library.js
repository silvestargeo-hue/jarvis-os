/* ============================================================
   JARVIS OS — Library (library.js)
   Real on-device RAG: document ingestion → chunking → TF-IDF
   retrieval → cited AI answers. Nothing leaves your browser
   except the question + retrieved chunks sent to the AI engine.
   ============================================================ */

"use strict";

const AppLibrary = {
  /* ---------- document store ---------- */
  docs() { return OS.get("lib-docs", []); },
  saveDocs(d) { OS.set("lib-docs", d); },

  chunkText(text, size = 700, overlap = 120) {
    const clean = String(text).replace(/\s+/g, " ").trim();
    if (clean.length <= size) return clean ? [clean] : [];
    const chunks = [];
    let i = 0;
    while (i < clean.length) {
      let end = Math.min(clean.length, i + size);
      if (end < clean.length) {
        const dot = clean.lastIndexOf(". ", end);
        const sp = clean.lastIndexOf(" ", end);
        if (dot > i + size * 0.5) end = dot + 1;
        else if (sp > i + size * 0.5) end = sp;
      }
      chunks.push(clean.slice(i, end).trim());
      i = end - overlap;
      if (i < 0) i = 0;
      if (chunks.length > 400) break; // hard cap
    }
    return chunks;
  },

  addDoc(name, text, source) {
    const chunks = this.chunkText(text);
    if (!chunks.length) { OS.toast("No extractable text found", "err"); return false; }
    const docs = this.docs();
    docs.push({ id: Date.now(), name, source: source || "manual", size: text.length, chunks, at: Date.now() });
    this.saveDocs(docs);
    OS.toast(`Indexed "${name}" — ${chunks.length} chunks`, "ok");
    if (window.Achievements) Achievements.flag("docs-added+1");
  },

  removeDoc(id) {
    this.saveDocs(this.docs().filter((d) => d.id !== id));
  },

  /* ---------- TF-IDF retrieval ---------- */
  tokenize(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9\u0900-\u097F\u4e00-\u9fff ]/gi, " ")
      .split(/\s+/).filter((t) => t.length > 2);
  },

  search(query, topK = 4) {
    const docs = this.docs();
    if (!docs.length) return [];
    const qTerms = [...new Set(this.tokenize(query))];
    if (!qTerms.length) return [];
    // hybrid: adjacent query token bigrams boost exact-phrase recall
    const toks = this.tokenize(query);
    const qBigrams = new Set();
    for (let i = 0; i < toks.length - 1; i++) qBigrams.add(toks[i] + " " + toks[i + 1]);

    // build corpus stats
    const all = [];
    docs.forEach((d) => d.chunks.forEach((c, ci) => all.push({ doc: d, ci, text: c })));
    const N = all.length;
    const df = new Map();
    const tfs = all.map((c) => {
      const tf = new Map();
      const ct = this.tokenize(c.text);
      ct.forEach((t) => tf.set(t, (tf.get(t) || 0) + 1));
      // chunk bigram counts (adjacent pairs, order preserved)
      const bf = new Map();
      for (let i = 0; i < ct.length - 1; i++) {
        const bg = ct[i] + " " + ct[i + 1];
        bf.set(bg, (bf.get(bg) || 0) + 1);
      }
      new Set(tf.keys()).forEach((t) => df.set(t, (df.get(t) || 0) + 1));
      return { tf, bf };
    });

    const scored = all.map((c, i) => {
      const { tf, bf } = tfs[i];
      let score = 0;
      for (const t of qTerms) {
        const f = tf.get(t) || 0;
        if (!f) continue;
        const idf = Math.log(1 + N / (1 + (df.get(t) || 0)));
        score += (f / tf.size) * idf;
      }
      // phrase boost: a matching bigram is strong evidence — weight 2.5x a unigram hit
      for (const bg of qBigrams) {
        const f = bf.get(bg) || 0;
        if (f) score += 2.5 * (f / tf.size) * Math.log(1 + N / 2);
      }
      return { doc: c.doc, ci: c.ci, text: c.text, score };
    });
    return scored.filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  },

  /* ---------- cited answer ---------- */
  async ask(question, onStatus) {
    onStatus && onStatus("Searching your library…");
    const hits = this.search(question);
    let answer = "", engine = "";
    const ctx = hits.map((h, i) => `[${i + 1}] (from ${h.doc.name}) ${h.text}`).join("\n\n");
    const sys = "You are JARVIS with a retrieval library. Answer ONLY from the provided context. " +
      "Cite sources inline like [1], [2] matching the bracketed numbers. If the context is insufficient, say so plainly.";
    const prompt = ctx ? `CONTEXT:\n${ctx}\n\nQUESTION: ${question}` : question;
    onStatus && onStatus(hits.length ? `Found ${hits.length} passages — asking JARVIS…` : "No passages found — asking JARVIS without context…");
    await AICore.chat(
      [{ role: "system", content: sys }, { role: "user", content: prompt }],
      { onToken: (t) => { answer += t; }, onDone: (e) => { engine = e; }, onError: (m) => { answer = ""; } }
    );
    return { answer, engine, hits };
  },

  /* ---------- file extraction (txt/md/json/csv native; pdf via pdf.js CDN) ---------- */
  async extractFile(file) {
    const name = file.name;
    if (/\.(txt|md|json|csv|log|srt|vtt|html?)$/i.test(name)) {
      return await file.text();
    }
    if (/\.pdf$/i.test(name)) {
      onStatus && 0;
      if (!window.pdfjsLib) {
        await new Promise((res, rej) => {
          const s = document.createElement("script");
          s.src = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js";
          s.onload = res; s.onerror = rej;
          document.head.appendChild(s);
        });
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
      }
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      let out = "";
      const pages = Math.min(pdf.numPages, 120);
      for (let p = 1; p <= pages; p++) {
        const page = await pdf.getPage(p);
        const tc = await page.getTextContent();
        out += tc.items.map((it) => it.str).join(" ") + "\n";
      }
      return out;
    }
    throw new Error("unsupported file type (use txt, md, csv, json or pdf)");
  },

  /* ================= UI ================= */
  launch() {
    const root = el("div");
    root.innerHTML = `
      <div class="app-toolbar">
        <input class="app-input" id="lib-q" style="flex:1;min-width:200px" placeholder="Ask your documents anything…" />
        <button class="app-btn" id="lib-ask">Ask ▸</button>
      </div>
      <div id="lib-status" class="diag" style="margin-bottom:8px"></div>
      <div id="lib-answer" class="bubble ai" style="max-width:100%;display:none"></div>
      <div class="app-toolbar" style="margin-top:14px">
        <button class="app-btn ghost" id="lib-add-text">✍ Paste text</button>
        <button class="app-btn ghost" id="lib-add-file">📄 Add file</button>
        <span class="diag" id="lib-count"></span>
        <input type="file" id="lib-file" accept=".txt,.md,.json,.csv,.log,.pdf,.html,.htm" hidden />
      </div>
      <textarea class="app-textarea" id="lib-paste" placeholder="Paste any text to index — knowledge stays on your device." style="display:none"></textarea>
      <div id="lib-list" style="margin-top:10px"></div>`;

    const win = OS.makeWin({ id: "library", title: "LIBRARY — RAG KNOWLEDGE", icon: "📚", body: root, w: 660, h: 560 });
    this.renderList(win);

    const ask = async () => {
      const q = win.body.querySelector("#lib-q").value.trim();
      if (!q) return;
      const st = win.body.querySelector("#lib-status");
      const ansBox = win.body.querySelector("#lib-answer");
      ansBox.style.display = "block";
      ansBox.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span>';
      win.body.querySelector("#lib-ask").disabled = true;
      const { answer, engine, hits } = await this.ask(q, (s) => { st.textContent = s; });
    if (window.Achievements) Achievements.flag("rag-asks+1");
      win.body.querySelector("#lib-ask").disabled = false;
      ansBox.textContent = "";
      if (!answer) { ansBox.textContent = "AI engines unavailable — try again."; st.textContent = ""; return; }
      ansBox.textContent = answer;
      const meta = el("span", "b-meta", (engine || "ai") + " · " + hits.length + " citations");
      ansBox.appendChild(meta);
      hits.forEach((h, i) => {
        const c = el("div", "citation", `[${i + 1}] ${h.doc.name} · chunk ${h.ci + 1} · score ${h.score.toFixed(2)}<br>${h.text.slice(0, 160)}…`);
        ansBox.appendChild(c);
      });
      st.textContent = "";
      this.renderList(win);
    };
    win.body.querySelector("#lib-ask").onclick = ask;
    win.body.querySelector("#lib-q").onkeydown = (e) => { if (e.key === "Enter") ask(); };

    win.body.querySelector("#lib-add-text").onclick = () => {
      const ta = win.body.querySelector("#lib-paste");
      ta.style.display = ta.style.display === "none" ? "block" : "none";
      if (ta.style.display === "block") ta.focus();
    };
    win.body.querySelector("#lib-paste").addEventListener("change", () => {});
    // save button appears with the textarea
    const saveBtn = el("button", "app-btn", "Index it");
    saveBtn.style.display = "none";
    win.body.querySelector("#lib-paste").after(saveBtn);
    win.body.querySelector("#lib-paste").addEventListener("input", () => { saveBtn.style.display = "block"; });
    saveBtn.onclick = () => {
      const t = win.body.querySelector("#lib-paste").value.trim();
      if (!t) return;
      if (this.addDoc("Pasted note " + new Date().toLocaleDateString(), t, "paste")) {
        win.body.querySelector("#lib-paste").value = "";
        saveBtn.style.display = "none";
        this.renderList(win);
      }
    };

    win.body.querySelector("#lib-add-file").onclick = () => win.body.querySelector("#lib-file").click();
    win.body.querySelector("#lib-file").onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const st = win.body.querySelector("#lib-status");
      st.textContent = "Extracting " + f.name + "…";
      try {
        const text = await this.extractFile(f);
        this.addDoc(f.name, text, "file");
        st.textContent = "";
      } catch (err) {
        st.textContent = "";
        OS.toast(err.message || "Extraction failed", "err");
      }
      e.target.value = "";
    };

    return win;
  },

  renderList(win) {
    const list = win.body.querySelector("#lib-list");
    const docs = this.docs();
    win.body.querySelector("#lib-count").textContent = docs.length + " doc(s) indexed";
    list.innerHTML = "";
    for (const d of docs.slice().reverse()) {
      const item = el("div", "note-item");
      item.innerHTML = `<div class="n-title">📄 ${d.name.replace(/</g, "&lt;")}<span class="n-body">${d.chunks.length} chunks · ${d.size.toLocaleString()} chars · ${d.source}</span></div>`;
      const del = el("button", "mini-btn danger", "✕");
      del.onclick = () => { this.removeDoc(d.id); this.renderList(win); };
      item.appendChild(del);
      list.appendChild(item);
    }
  },
};
