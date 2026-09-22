# ARCHITECTURE-ENTERPRISE — The Two-Plane Blueprint (v3 spec)
**Date:** 2026-09-21 · **Author role:** Principal Architect review + completion of the enterprise blueprint
**Companion to:** `ARCHITECTURE-10X.md` (client plane). This document completes and reconciles the server-tier blueprint.

---

## 0. Architect's review of the submitted blueprint

| Submitted | Verdict | Correction / refinement |
|---|---|---|
| Rust (**"Axact"**/Tokio) | ✅ right call, wrong name | **Axum** (tokio-native). Axum + sqlx + Tokio for the hot path: parsing, ingest, sync, WS gateways |
| FastAPI for AI orchestration | ✅ | Keep Python **out of the request path** — FastAPI owns agents/RAG/transcription workers; talks to Axum via Redis Streams (jobs) and gRPC (streaming) |
| PostgreSQL + TimescaleDB + pgvector | ✅ | Add: pgvector **HNSW** index (not IVFFlat), bge-m3 embeddings, bge-reranker cross-encoder for rerank. TimescaleDB for events/audit/transcripts |
| Redis Enterprise | ✅ | Also: Redis **Streams** as the job queue (not just pub/sub), presence, rate-limits |
| Next.js App Router + RSC, edge-rendered | ✅ for the platform | ⚠️ **SDUI conflicts with offline-first.** Use RSC for showcase/admin/platform pages; the OS shell stays local-first vanilla. Do not put the OS behind a server render |
| Zustand + TanStack Query v5 | ✅ | Scope it to the Next.js platform app. The OS shell keeps its zero-dep state facade; both speak the same **CRDT op format** |
| View Transitions + Framer Motion springs | ✅ | Complete: spring spec `stiffness 320 / damping 28 / mass 1`; FLIP for layout; `prefers-reduced-motion` collapses all springs to 0ms |

**The core tension, resolved:** the submitted stack makes the server a *dependency*; the existing OS makes the server *not exist*. Enterprises need audit, multi-tenancy, SSO, and shared state — so we build both planes and make them degrade gracefully:

```
┌─────────────────── EDGE PLANE (today's build) ───────────────────┐
│ JARVIS OS: vanilla ES2022, zero deps, works 100% offline,        │
│ keyless AI (Puter/Pollinations/WebLLM), local CRDT op log        │
└──────────────┬───────────────────────────────────────────────────┘
               │  /sync (encrypted CRDT ops, passkey auth)
               │  graceful: offline → plane keeps running
┌──────────────▼────────── CONTROL PLANE (new) ────────────────────┐
│ Cloudflare edge (static + Workers)                               │
│ Axum/Tokio services: ingest · sync · ws-gateway · archive        │
│ FastAPI agents: RAG · transcription · research · metadata        │
│ Postgres (+Timescale, +pgvector) · Redis Enterprise · R2 blobs   │
│ LiveKit SFU (conference) · passkey/SSO auth · OTel everywhere    │
└──────────────────────────────────────────────────────────────────┘
```

Signed-in users get multi-device sync, shared libraries, conference rooms, audit — **anonymous users keep the full offline OS with zero accounts.** That is the 10x differentiator no competitor offers.

---

## 1. Core Infrastructure — completed spec

### 1.1 Paradigm (final)
- **Axum/Tokio micro-kernel** (`ingest-rs`, `sync-rs`, `gateway-rs`, `archive-rs`): content-addressed storage (blake3), epub/pdf parsing, CRDT op validation/fanout, WS terminations. Targets: p99 < 40ms for sync ops, 25k concurrent WS per node.
- **FastAPI agent plane:** LangGraph-style agent runtime, faster-whisper workers, embedding/rerank services. Scale independently on GPU pods (Replicate/Fly GPU).
- **Postgres** (Neon or self-hosted): row-level security for multi-tenancy, `tsvector` GIN for lexical, pgvector HNSW for semantic, Timescale hypertables for `events`, `audit_log` (immutable, append-only), `transcript_segments`.
- **Redis Enterprise:** Streams job queue, pub/sub fanout, presence TTLs, token-bucket rate limits per key/passkey.
- **R2:** content-addressed blobs (zero egress), lifecycle → cold tier.
- **Edge:** Cloudflare Workers (static, signed-URL minting, /sync geo-router), HTTP/3, brotli.
- **Auth:** WebAuthn **passkeys** primary; OIDC/SAML via Authentik or WorkOS for enterprise SSO; SCIM provisioning; RBAC claims in signed tokens.
- **State:** Zustand slices per domain + TanStack Query v5 (stale-while-revalidate, optimistic mutations with rollback) in the Next.js plane; the OS shell keeps its local store — both serialize to the same op envelope `{v, actor, lamport, type, payload}`.

### 1.2 Interface & UX (completed — resume where the draft cut off)
- **Micro-interactions:** Framer Motion with spring dynamics (`stiffness 320, damping 28`), `layoutId` shared-element transitions between list→detail, staggered children (40ms), drag-to-reorder with elastic overscroll, `whileTap` 0.97 scale.
- **View Transitions API** for route morphs (document-level cross-fade + shared-element for doc opens); pre-fetch on intent (pointerdown + 80ms hover) so transitions hit < 50ms.
- **Skeleton discipline:** shimmer only past 300ms; never layout-shift (reserved dimensions); instant paint from RSC payloads.
- **Command plane parity:** ⌘K in the platform app mirrors the OS palette — same fuzzy ranking, same tool registry. One muscle memory across both planes.
- **Density modes:** comfortable/compact toggle persisted per user; token-driven (`--j-density`), affects tables, lists, library grids.

### 1.3 AI integration
- **Predictive prefetch:** server-side per-user sequence model (Markov over route/event stream in Timescale) → `prefetch-manifest` served with the page → RSC + route chunks prefetched. Client-side, the OS keeps its own on-device model for app pre-warming.
- **Self-healing tier routing:** Redis-cached engine health (latency, error rates) feeds both planes' AI router (cloud model → keyless fallback → offline WebLLM).
- **Tool registry as a product surface:** every AI action = a registered tool with JSON schema, exposed to palette, voice, terminal, and agents. Audited in `audit_log` with actor + args hash.

---

## 2. Interface & Design System (platform plane)

- **Stack:** Next.js App Router + Tailwind + Radix primitives (headless, a11y-complete) + Style Dictionary token pipeline emitting CSS/JS/JSON (the marketplace share-code format is a superset). Storybook 8 with visual regression (Chromatic) as the design-system CI gate.
- **Motion grammar:** identical tokens to the OS plane (120/200/320ms, two easings, FLIP from dock origin). Framer `MotionConfig reducedMotion="user"` globally.
- **Tenancy-aware theming:** enterprise customers get token overrides (accent/logo/font) resolved server-side per domain — white-label in one CSS variable payload.
- **AI:** generative covers/palettes (as in 10X §2.3), plus **layout intent** — the SDUI subset: marketing/admin surfaces can accept a server-sent layout JSON (validated against a strict schema) for A/B and per-tenant tweaks, while user surfaces stay client-owned.

## 3. Library Section (server-backed)

- **Paradigm:** Postgres as the library DB: `documents`, `chunks(chunk, tsv tsvector, embedding vector(1024))`, `facets` (JSONB + GIN). Hybrid search = `tsvector` BM25-ish ranking **⊕ pgvector cosine** fused with **Reciprocal Rank Fusion** in one SQL CTE; optional Meilisearch for typo-tolerant instant search at >1M chunks.
- **UX:** TanStack Virtual for 100k-row lists; grid/list/graph (sigma.js force graph from embedding kNN edges); faceted rail with live counts (materialized counters); URL-persisted filters; selection + batch ops.
- **AI:** ingest-time metadata agent (FastAPI queue → cheap model → title/author/topics/summary/flashcard seeds written back); "cluster my library" (k-means over vectors, nightly), contradiction scan between docs; smart collections = saved SQL+vector queries re-executed on ingest via LISTEN/NOTIFY.

## 4. Upload & Download Books

- **Paradigm:** resumable everything. Client hashes (SHA-256 WebCrypto) → `POST /upload/init` → **S3 multipart presigned to R2** (tus-compatible wrapper for browsers) → `ingest-rs` job on Redis Streams: parse (epub crate / pdfium / Tesseract OCR fallback) → clean → chunk (512 tok, 15% overlap) → embed (bge-m3) → dedupe (blake3 exact + cosine>0.97 near) → commit. Progress via SSE; per-stage resumability; all parsing off the request path.
- **Delivery:** signed URLs + range requests + CDN; exports streamed (no memory blowups); brotli for text, HTTP/3.
- **AI:** TL;DR cards at ingest (cached on the doc), auto-dedupe with "merge?" UX, language detection → i18n routing of the reader.

## 5. Archive (Cold Storage)

- **Paradigm:** blake3 content addresses; tiers: `hot` (Postgres+R2 standard) → `warm` (R2 Infrequent Access) → `cold` (R2 + client-side AES-GCM envelope, keys wrapped by passkey-derived KEK; server stores ciphertext). Lifecycle rules + access-frequency policy from Timescale events. `archive verify` = scheduled hash-audit worker with signed reports; **quarterly restore drills** as a first-class workflow with completion badges.
- **UX:** tier badges, "last verified" dates, thaw-restore progress with chime, storage sunburst, monthly archivist report card.
- **AI:** predictive demotion from access patterns; semantic search over cold metadata + retained embeddings (restore only the winner); auto-archivist monthly narrative.

## 6. Users' Own Books (Personal)

- **Paradigm:** reader = Next.js client island embedding **foliate-js** (epub) with the OS Reader sharing the same annotation op format. Annotations = CRDT ops anchored to content hashes, synced via `/sync`, stored encrypted (Postgres RLS + envelope encryption; private keys never leave device). Reading analytics = client-session events → Timescale; per-book heatmaps, streaks, WPM.
- **UX:** immersive mode, margin-gutter notes, floating selection ribbon (highlight/note/ask/flashcard), spine scrubber, typography tokens, sync atom in the header.
- **AI:** per-book-scoped RAG with paragraph citations; highlights → SM-2 flashcards; private next-read recommendations from local vectors + notes.

## 7. Chat & Messaging

- **Paradigm:** `gateway-rs` (Axum WS) + Redis pub/sub fanout; rooms are **MLS (RFC 9420) via OpenMLS** — group E2EE with forward secrecy and efficient member changes (the real upgrade over pairwise AES-GCM). Message format v2 (threads, citations, attachment hashes) as encrypted op logs; server stores ciphertext only; client-side search index for E2EE rooms. WebRTC DataChannel mesh retained for LAN/P2P.
- **UX:** Lexical or Tiptap composer (rich text, slash-commands, citation chips linked to Library chunks), optimistic send with delivery glyphs, reactions, threads, quiet hours, presence roster.
- **AI:** room agent (peer) with tool-calling into the registry: grounded answers with `[n]` citation chips, since-you-were-away digests, action items → Tasks, semantic recall over (client-decrypted, on-device indexed) history; opt-in tone assist.

## 8. Conference Room

- **Paradigm:** **LiveKit SFU** (self-host or cloud) — E2EE media via insertable streams, 4–6 mesh small rooms or SFU at scale; data channels carry whiteboard ops. Whiteboard = **tldraw or Excalidraw + Yjs** provider over LiveKit data / y-websocket. Floor-control token for turn-taking; signed role claims enforce host moderation. Transcription = faster-whisper streaming workers + pyannote diarization → `transcript_segments` (Timescale).
- **UX:** active-speaker stage + rail (AnalyserNode voice levels), speaking rings, hand-raise floats, join/leave chimes, per-peer quality bars, "End session" artifact packet (transcript + board snapshot + citations + action items → Notes).
- **AI:** live copilot (jargon definitions as heard), decision tracking, instant minutes → Tasks, agenda timeboxing overlays.

## 9. Reference Room

- **Paradigm:** citation graph in Postgres — typed edges (`cites|supports|contradicts|derives-from`) via adjacency tables + recursive CTEs (Apache AGE only past ~10M edges). Multi-doc analysis = centroid intersections (shared themes), outlier chunks (unique claims), **NLI contradiction scoring** (DeBERTa-MNLI) with LLM adjudication. Hybrid search + **bge-reranker** cross-encoder rerank; answers carry multi-source citations with confidence badges.
- **UX:** three-pane research desk (sources · synthesis canvas · evidence inspector); claim → source highlight linking; comparison view with agreement/disagreement bands; citation constellation graph; exports via **citeproc-js** (APA/MLA/BibTeX/CSL).
- **AI:** the **research agent** — plans, queries Library (+opt-in keyless web), reads, returns structured briefs (answer/confidence/sources/contradictions/open questions); platform-wide **claim ledger**: every AI statement in both planes renders a provenance chip. Consistent trust UX everywhere.

---

## 10. Cross-cutting, SLOs, rollout

- **Observability:** OpenTelemetry from both planes → Grafana stack (Tempo traces, Loki logs, Mimir metrics); Sentry for exceptions; SLOs: API p99 < 250ms, sync op p99 < 40ms, 99.95% availability, error budget policy enforced in CI.
- **Audit & compliance:** append-only `audit_log` (Timescale), exportable; per-tenant encryption envelopes; GDPR erasure = crypto-shredding of per-user KEKs.
- **Testing:** unit (Vitest) + property tests for CRDT merges + Playwright E2E + k6 load profiles (sync storm, ingest burst, 500-room WS) in CI; contract tests between planes (op envelope schema).
- **Cost envelope (ballpark, monthly):** Workers+Pages ~$0–20 · Neon Postgres $25–69 · Redis Enterprise $15+ · Fly.io (2×Axum + FastAPI) $20–50 · R2 ~$0.015/GB · LiveKit self-host $20+ (cloud usage-based) → **~$100–200/mo at pilot scale**, linear at growth.
- **Rollout (dependency-correct):**
  1. `sync-rs` + passkey auth + op envelope (the bridge) — 1–2 wks
  2. Postgres library + ingest pipeline + R2 — 2–3 wks
  3. Platform shell (Next.js: auth, library, reader) — 3–4 wks
  4. Archive tiers + verify drills — 1–2 wks
  5. `gateway-rs` + MLS rooms → LiveKit conference — 3–4 wks
  6. Reference Room + research agent — 2–3 wks
- **Definition of done:** anonymous users keep full offline OS · signed-in features degrade to local-only on network loss · every AI claim carries provenance · p99/SLO dashboards green · audit exportable.
