# ARCHITECTURE-10X — Elite Upgrade Blueprint
**Scope:** platform-wide re-engineering, 9 modules · **Date:** 2026-09-21
**Baseline:** JARVIS OS v2.9+ (client-only, keyless, zero-dependency, offline-first)
**North star:** every module gets (1) a paradigm, (2) a UX bar, (3) a native AI layer — no placeholders, all buildable.

**Core law kept from v1:** every feature must work fully offline-first. The backend is an *accelerator*, never a dependency. Anything that dies without network is a bug.

---

## 0. Current → 10x gap map

| Module | Today | 10x target |
|---|---|---|
| Core infra | Single HTML shell, localStorage, 26-test jsdom suite | Edge-rendered shell + CRDT state core + OTel telemetry |
| Design system | CSS-var theme engine, marketplace presets | Token pipeline, motion grammar, spatial/dark modes |
| Library | TF-IDF + bigram hybrid, flat doc list | Vector + lexical hybrid, collections graph, faceted metadata |
| Upload/Books | Direct Files app import | Streaming ingest pipeline → parsed, indexed, compressed shards |
| Archive | Vault (AES-GCM localStorage) | Content-addressed cold store, tiering, one-command recovery |
| My Books | Notes/Tasks apps | Reader with annotations, positions, reading analytics |
| Chat/Mesh | SSE streaming, E2EE BroadcastChannel/KV mesh | Transport-adaptive rooms, CRDT presence, RAG-native composer |
| Conference | — (absent) | Multi-party data-channel rooms + live transcription |
| Reference | Library citations (n=1) | Cross-document analysis, citation graph, semantic search |

---

## 1. Core Infrastructure — Backend, Frontend, State

### 1.1 The 10x Architectural Paradigm
**Pattern: "Local-first core, edge-synced shell."**

- **Client core stays dependency-free.** The existing zero-dependency OS is a *strength*; keep it. What changes is the state layer: replace ad-hoc `localStorage` keys with a **versioned, namespaced document store** — one `os.state` facade, schema-versioned migrations (v1→vN chain, like a DB migration folder), and per-domain stores (`chat`, `library`, `books`, `archive`, `settings`).
- **State = CRDT-first.** Adopt a tiny CRDT core (hand-rolled LWW-element-set + RGA for text is ~400 lines, no deps; or Yjs via one lazy ESM import if weight is acceptable). Every state mutation becomes an *operation*, not a value overwrite. This one decision unlocks: multi-device sync, offline merge, conference collaboration, shared annotations — all from the same primitive.
- **Backend = edge functions only.** No server. Cloudflare Workers (or Deno Deploy) at ~200 POPs: 3 endpoints max —
  1. `POST /sync` — CRDT op exchange (binary-encoded, ~10KB/op batches)
  2. `POST /relay` — WebRTC signaling + ephemeral E2EE room keys (see §7)
  3. `GET /cold/*` — R2-backed content-addressed blobs for archive tiers
  Auth: **passkeys** (WebAuthn) — no passwords, keyless-feeling, phishing-proof. Ops identity = a keypair generated on device; server never sees content (all payloads encrypted client-side).
- **Delivery:** the site is static (already is — GitHub Pages). Add `Cache-Control: immutable` + content-hashed filenames via a 20-line build step; SW handles runtime. Result: sub-100ms repeat loads globally, zero origin traffic.
- **Scalability math:** static shell + edge sync means "scaling" is R2/Workers billing, not servers. 10 users or 10M users — same architecture. That is the 10x claim, and it's real.

### 1.2 The 10x Interface & UX
- **Instant-paint boot:** inline-critical-CSS the shell (<14KB), `content-visibility: auto` on every app body, `@starting-style` entry animations — apps *materialize* rather than open.
- **One global command plane:** ⌘K becomes the OS (you have this) — 10x it with **fuzzy-matched ranking + recency scoring + "did you mean"** across apps, docs, notes, and *chat history*. A launcher that finds things is the OS.
- **State visibility:** a subtle "sync" atom in the topbar (◦ local only → ⟳ syncing → ✓ synced, tap = op log drawer). Users trust what they can see.
- **Perf budget as UI:** a `perf` command rendering a live FPS/heap/long-task flame strip. Elite products show their health.

### 1.3 The 10x AI Integration
- **Predictive prefetch agent:** a 1KB Markov-ish model over your own command/app-launch sequence (persisted, self-updating) pre-warms app modules (dynamic `import()`) before you click. First-open latency → ~0.
- **OS copilot upgrades:** the existing ⌘K palette gains an *intent* mode — type natural language ("clean up my notes, then paint a nebula") → planner executes tool calls against app APIs. You already have tool-callable apps; formalize them as a JSON tool registry (name, schema, handler) shared by palette, voice, and terminal.
- **Self-healing:** AICore failure patterns (engine timeouts, network class) feed a tiny heuristic that pre-selects the best tier *before* the first token (offline→WebLLM, metered→GET tier, good net→SSE). Predictive, not reactive.

---

## 2. Interface & Design System

### 2.1 Paradigm
**"Design tokens as a compiled artifact."**
- Current CSS vars → a formal **token schema** (`--j-color-accent`, `--j-space-3`, `--j-motion-fast`, `--j-z-window`…) with a build step that emits: CSS, JS (`OS.tokens`), and the marketplace share-code format (already exists — becomes a superset).
- **Motion grammar:** every transition derives from 3 tokens (fast 120ms / base 200ms / slow 320ms) with two easings only (`ease-out-quint` for enter, `ease-in-quart` for exit). One rule: *windows scale+fade from their dock icon origin* (FLIP). Feels expensive; costs ~60 lines.
- **Layers:** formalize z-index into 6 named layers (desktop < window < drawer < modal < toast < boot). Eliminates all z-index guessing forever.

### 2.2 Interface & UX bar
- **Micro-interactions inventory (implement all):** dock icon magnification on hover-proximity; window title-bar progress shimmer during AI streaming; button press = 0.97 scale + haptic (`navigator.vibrate(4)` on mobile); toasts slide from their origin app; skeleton shimmer only >300ms loads; focus-visible rings on every interactive element (a11y = premium).
- **Responsiveness tiers:** watch (<300px: notifications + voice only), phone (grid dock — done in v2.7.2), tablet (split view: two windows snap 60/40), desktop (full), TV/10-foot (dock focus-navigation with D-pad). The OS spans five device classes from one codebase.
- **Reduced-motion + high-contrast:** honor `prefers-reduced-motion` globally and add a "Terminal raw" theme — accessibility as a flagship feature, not a checkbox.

### 2.3 AI Integration
- **Adaptive interface:** an interface-learned ranking — apps you use at 9am differ from 11pm (your night-owl surprise already knows). Surface a "For now" dock section that reorders by time-of-day usage patterns (on-device, private, <2KB model).
- **AI theming:** "Paint my theme" — describe a mood; image model generates a wallpaper + the LLM extracts a 5-color palette from it → instant custom preset → one click into the marketplace share-code flow. Generative branding, end to end, keyless.

---

## 3. Library Section

### 3.1 Paradigm
**"The Library is a database, not a list."**
- **Storage:** docs become `{ id, hash(content), meta, chunks[], vectors[] }` records in IndexedDB (via a 150-line IDB wrapper — no deps) with an in-memory index hydrated at boot in <50ms.
- **Hybrid retrieval 2.0:** current TF-IDF+bigram is promoted to the *lexical* arm; add a **local embedding arm** — quantized MiniLM via transformers.js (lazy CDN load, cached in SW) producing 384-dim vectors, stored int8 (~400B/chunk). Fusion = Reciprocal Rank Fusion over both arms. This beats either alone and runs fully offline.
- **Scale:** chunk at ~512 tokens with 15% overlap; IVF-lite ANN (k-means over centroids at index time) keeps nearest-neighbor search O(√N) — instant at 100k chunks.

### 3.2 Interface & UX
- **Three view modes:** Grid (cover cards), List (density + sort), **Graph** — a force-directed map of doc similarity (vectors ⇒ edges), pannable/zoomable. Nobody expects a reading library to be navigable as a constellation.
- **Facets rail:** author, tag, length, source, date — multi-select, live counts, URL-persisted (`#f=author:Tolstoy;tag:war`). Shareable filtered views.
- **Metadata editing:** inline, undo-able, batch (select 20 → retag). Cover thumbnails generated from doc title + palette (deterministic generative covers — no assets).
- **Command-grade search:** `/` focuses search; results show *why* (matched chunk snippet highlighted); search-as-you-type debounced 120ms with stale-response cancellation.

### 3.3 AI Integration
- **Auto-metadata agent:** on ingest, one LLM pass extracts title/author/topics/summary/3 flashcard seeds → written back as metadata (this is the 10x: the library catalogs *itself*).
- **AI librarian:** "Find docs that contradict each other," "Cluster my library," "What should I read next given my notes?" — all = vector ops + one LLM synthesis call.
- **Smart collections:** saved *queries* as living folders ("everything mentioning black holes, auto-refreshing"). The library re-organizes as you add.

---

## 4. Upload & Download Books

### 4.1 Paradigm
**"Ingest is a pipeline, delivery is a stream."**
- **Ingest pipeline (all client-side):** detect type → parse (`.txt`/`.md` native; `.epub` = ZIP+XHTML via a 300-line extractor using `DecompressionStream`; `.pdf` = lazy pdf.js) → clean → chunk → embed → hash → store. Progress = real stages, cancellable, resumable (per-file op log).
- **Compression:** content-defined chunking (like rsync) + stored once by hash (dedupe re-imports); gzip via CompressionStream for cold copies.
- **Delivery/Download:** exports are streamed Blobs (no 100MB string in memory) — `new Blob(chunks)` + `URL.createObjectURL`, so a 1GB export works on a phone. Remote fetches (URL import) go through the edge worker with range requests + SW caching — "lightning-fast" = streamed from POP, cached offline.
- **Workers:** parsing moves into a Web Worker; the UI never drops a frame during a 50MB import.

### 4.2 Interface & UX
- **Drag-anywhere ingest:** drop files anywhere on the desktop → a receipt-style tray slides up (queued → parsing → indexed, per-file). Paste a URL → same tray.
- **Ingest theater:** for large books, show live stats (words/sec, chunks formed) — the machine visibly working is premium.
- **Download UX:** every doc/menu → "Export" with format choices (.md, .txt, .json with metadata+annotations, .epub if you add the writer); share sheet integration on mobile.

### 4.3 AI Integration
- **Instant comprehension:** on ingest completion, the AI pre-generates a "TL;DR card" (3 bullets + 5 key terms) cached on the doc — so every book in your library opens *already summarized*.
- **Smart dedupe:** near-duplicate detection via vector cosine >0.97 — "This looks like 'War and Peace (v2)' you imported Tuesday. Merge?" The library refuses to bloat.

---

## 5. Archive Book Section (Cold Storage)

### 5.1 Paradigm
**"Content-addressed, tiered, and provably recoverable."**
- **Addressing:** everything archived gets `sha-256(content)` as its ID (SubtleCrypto — already used for mesh E2EE). Identical content = identical address = free dedupe across the whole archive.
- **Tiers:** `hot` (IndexedDB, instant) → `warm` (OPFS — Origin Private File System, huge + fast) → `cold` (edge/R2, encrypted client-side before upload — the server stores ciphertext it cannot read). A `tier` command moves items; automatic policy: untouched >30 days → warm, >180 → cold (configurable).
- **Recovery:** `archive verify` recomputes hashes for every stored item and diffs — integrity proof you can run anytime. Restore = fetch ciphertext → decrypt → write back hot. **Quarterly-restore drill built in:** the OS reminds you to prove your archive works (real enterprises do this; yours will too).
- **Smart categorization:** hash-prefix buckets + metadata taxonomy; archived items keep their Library facets so cold storage is *searchable* without being *loaded*.

### 5.2 Interface & UX
- **The Vault gets a new room:** an "Archive" tab — deep-blue palette shift, items shown as frosty slabs with tier badges (HOT/WARM/COLD) and "last verified" dates. Restoring feels like de-thawing: a progress arc + thaw chime (your synth SFX engine).
- **Capacity meter:** a storage sunburst (hot/warm/cold segments) in System + Settings. Numbers, honest and visible.
- **One-gesture triage:** swipe/arrow through "Archive candidates" review queue (the AI nominates; you confirm) — cold storage managed in 30 seconds a month.

### 5.3 AI Integration
- **Predictive tiering:** access-frequency model decides what to demote *before* the policy date ("You haven't opened these 12 docs since June — archive?").
- **Semantic archive search:** embeddings stay hot even when blobs go cold → "find anything I've ever saved about X" hits cold storage instantly, restoring only the winner.
- **Auto-archivist:** end-of-month agent report — "I archived 9, verified 214, saved 62MB, deduped 3 duplicates." Your cold storage narrates itself.

---

## 6. Users' Own Books Section (Personal Library)

### 6.1 Paradigm
**"A reader, not a folder."**
- **The Reader (new flagship app):** paginated/reflowable reading view with saved *positions* (per-doc byte offsets in state store), typography controls (serif/sans, size, measure, line-height — all tokens), and a progress spine. Reading happens *inside* the OS now.
- **Annotations as CRDTs:** highlights + margin notes are RGA text ops anchored to content hashes (not byte offsets — survive re-flow and edits). Because they're ops, they sync across devices and are *shareable* (see Conference).
- **Private by construction:** personal books + annotations live in the encrypted store (same AES-GCM primitives as the vault); sync payloads are E2EE like mesh. The edge sees zeros and ones, never sentences.
- **Reading analytics (on-device):** sessions, words/min, streaks, per-book heat — computed locally, summarized by AI on request, never uploaded raw.

### 6.2 Interface & UX
- **Reading flow:** open a book → immersive mode (chrome fades after 2s idle, returns on pointer move); tap margins to page; a bottom "spine" scrubber previews pages while dragging.
- **Annotation UX:** select text → floating ribbon (highlight 5 colors / note / ask-JARVIS / flashcard); margin gutter shows note glyphs; click to open threaded notes.
- **Analytics surface:** "Reading" dashboard — streak flame, weekly minutes ring, per-book progress bars, and an honest "words read" counter. Make progress *visible* and people finish books.

### 6.3 AI Integration
- **Socratic reader:** "ask JARVIS" on any selection → answer *grounded in this book* (RAG scope = current doc, citations = paragraph anchors). Explaining Tolstoy with Tolstoy.
- **Auto-flashcards:** highlights → spaced-repetition cards in one tap, fed into the Flashcards app (SM-2 scheduling already specced) — reading converts to memory automatically.
- **Next-read agent:** "You're 80% through X and your notes lean toward Y themes — want 'Doctor Zhivago'?" — recommendations from *your* vectors + notes, private.

---

## 7. Chat & Messaging

### 7.1 Paradigm
**"Transport-adaptive, E2EE, RAG-native rooms."**
- **Three transports, one API (mesh upgrade):**
  1. `BroadcastChannel` — same-device tabs (instant, free) — have it
  2. **WebRTC DataChannels** — device-to-device P2P over LAN/internet, signaling via the 200-line edge relay, DTLS-secured + your own AES-GCM payload layer on top — the real 10x (true P2P, no server sees content *or metadata*)
  3. KV slot — async relay fallback (have it)
  Transport selection automatic; rooms negotiate per-peer.
- **Message format v2:** `{ id, room, ts, author, body(op), attachments[], cites[], thread? }` — threads, citations to Library docs, and attachment hashes are first-class.
- **Presence 2.0:** typing indicators, read receipts (per-peer ack ops), heartbeat roster (have it) — all as CRDT ops, all E2EE.
- **History:** local-first; rooms keep full encrypted op logs; joining a room = replay from a snapshot + tail ops (fast sync).

### 7.2 Interface & UX
- **Rich rendering:** the markdown renderer (v3.0) extended with inline citations — `[1]` chips hover-preview the cited Library chunk; code blocks get copy + "run in Code Studio" buttons.
- **Composer:** slash-commands (`/img`, `/ask`, `/lib`, `/paint`), attachment drag-in, draft-per-room persistence, send = optimistic render with delivery-state glyph (sending → sent → read).
- **Micro-interactions:** new-message dock-badge bounce; peer-cursor presence in shared views; reaction taps with pop physics; day-divider timestamps.
- **Room UX:** room switcher with live previews, per-room notification rules, "quiet hours" (ties into night-owl).

### 7.3 AI Integration
- **The room agent (flagship):** JARVIS sits in every room as a peer — it *reads context* (rolling summary, already specced v3.0) and can: answer grounded in Library ("what did doc 3 say about thrust?" — cited), summarize since-you-were-away, extract action items → Tasks app, and generate images inline.
- **Semantic recall:** "What did we decide about the launch date?" → vector search across the room's history with quoted answers. Chat becomes searchable institutional memory.
- **Tone assist (opt-in):** rewrite-my-message (softer/firmer/concise) before send.

---

## 8. Conference Room

### 8.1 Paradigm
**"SFU-less mesh for small rooms, E2EE by default."**
- **Media:** WebRTC `getUserMedia` (cam/mic) mesh — 4–6 participants P2P is proven territory; audio uses Opus via `RTCRtpSender`; `insertable streams` for end-to-end media encryption where supported.
- **Data plane:** the same DataChannel mesh from §7 carries whiteboard strokes, pointers, and control — one mesh, many rooms (media room + collab room share presence).
- **Turn-taking:** a floor-control token (single-writer op) prevents whiteboard storms; moderation = role ops (host can mute/eject — enforced by clients honoring signed role claims).
- **Transcription:** on-device Web Speech API where available; otherwise local WebLLM whisper-class model (lazy, cached) → transcript ops streamed into the room log. Auto-notes without a cloud.

### 8.2 Interface & UX
- **Stage + rail layout:** active speaker large (voice-level detection via AnalyserNode), others in a rail; screen-share pin; speaker view morphs with a 200ms FLIP.
- **The whiteboard:** infinite canvas (pan/zoom), pen/eraser/shapes/text, **crdt strokes** so everyone draws simultaneously with cursors + name flags; export as PNG into Files.
- **Session artifacts:** "End session" produces a packet — transcript, whiteboard snapshot, shared citations, action items — into Notes, one artifact per meeting. Meetings that file themselves.
- **Micro-interactions:** speaking ring pulses on the active tile; hand-raise emoji floats; join/leave chimes (your synth engine); connection-quality bars per peer.

### 8.3 AI Integration
- **Live copilot:** real-time transcript → JARVIS offers definitions of jargon as it hears it, tracks decisions, and raises "action item detected" toasts.
- **Instant minutes:** at end, one LLM pass over the transcript op-log → decisions/owners/dates → straight into Tasks. Attendance to action in 5 seconds.
- **Cold-start facilitator:** room agenda from the invite note; JARVIS timeboxes topics with gentle timer overlays.

---

## 9. Reference Room

### 9.1 Paradigm
**"A citation graph database with a research agent."**
- **Model:** nodes = docs/chunks/annotations; edges = cites, derives-from, contradicts, supports (typed edges, stored as ops). The graph lives in the same op-store — syncable and shareable like everything else.
- **Multi-document analysis engine:** select N docs → vector map of *inter*-document overlap: shared themes (centroid intersections), unique claims (outlier chunks), contradictions (embedding distance between opposing-stance chunks + LLM adjudication). This is the killer feature: the machine reads five papers and tells you where they agree and fight.
- **Semantic search 2.0:** query → hybrid (lexical+vector) → answer with *multi-source citations*, each citation a chip opening the exact chunk with highlight. Confidence + source-count badges on answers.

### 9.2 Interface & UX
- **The reference desk:** a three-pane workspace — sources (left), synthesis canvas (center), evidence inspector (right). Every AI claim shows its evidence chain; click claim → sources highlight.
- **Citation exports:** select sources → generate .md/BibTeX/APA/MLA strings from metadata. Students/researchers share the link.
- **Visual graph mode:** the citation constellation — nodes sized by in-degree, colored by cluster, edges labeled by relation type. Hover a node → its TL;DR card.
- **Comparison view:** two docs side-by-side with AI-annotated agreement/disagreement bands between them.

### 9.3 AI Integration
- **The research agent (crown jewel):** give it a question → it plans searches, queries the Library (and, opt-in, keyless web engines), fetches, reads, and returns a structured brief: *answer, confidence, sources, contradictions found, open questions*. A junior researcher that lives in your OS.
- **Claim ledger:** every AI statement across the whole OS (chat, reference, reader) gets a citation chip — **one consistent provenance UX platform-wide.** That consistency is what makes people trust the AI.
- **Reading-list synthesis:** "Merge these 8 docs into one study guide" → outline + sectioned digest with anchors back to originals.

---

## 10. Cross-cutting: quality, telemetry, rollout

- **Test strategy scales with scope:** keep the jsdom OS-simulation suite as the spine (26 tests); add per-module suites (ingest pipeline fixtures, CRDT merge property tests, archive verify roundtrip, mesh negotiation). Gate on CI (site-tests.yml exists — extend matrix).
- **Telemetry = OTel-shaped, privacy-preserving:** client emits anonymous counters (app launches, engine latencies, ingest throughput) to a worker you control; no content ever. A `metrics` terminal command renders local dashboards.
- **Feature flags via marketplace-style codes** (`flags` command) → staged rollout of the big modules (Reader, Conference, Reference) without redeploys.
- **Rollout order (dependency-correct):**
  1. State/CRDT core + IDB store (§1) — everything stands on it
  2. Library DB + embeddings (§3) → ingest pipeline (§4)
  3. Reader + annotations (§6) — first user-visible 10x
  4. Archive tiers (§5) — safe, self-contained
  5. Mesh v2 (§7) → Conference (§8) — reuses one mesh
  6. Reference Room (§9) — reuses everything above
- **Tech stack summary (zero-debt):** vanilla ES2022 + Web Workers + IndexedDB + OPFS + WebRTC + WebAssembly-class lazy CDN libs (transformers.js, pdf.js, optional Yjs) + Cloudflare Workers/R2/passkeys at the edge. The client stays dependency-free; heavies load lazily, cached by SW, and *never block the shell*.

**Definition of done per module:** works offline · covered by tests · on-device AI where feasible · zero new runtime deps in the shell · documented in README + AUDIT.
