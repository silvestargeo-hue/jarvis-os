import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * JARVIS OS — Convex schema
 *
 * Security model
 * --------------
 * - `users.role` drives RBAC ("admin" | "member" | "guest"). Admin-only mutations
 *   MUST re-verify the caller's role server-side via `ctx.auth` — never trust the client.
 * - Master PIN: client hashes with PBKDF2-SHA256 (per-user random salt, high iteration
 *   count) and stores ONLY `pinHash` + `pinSalt` here. Plaintext never leaves the device.
 * - E2EE chat: every message payload is encrypted client-side (AES-GCM via Web Crypto).
 *   Convex only ever sees `ciphertext`, `iv`, and the wrapped content key — no plaintext
 *   or raw key material ever touches the backend.
 * - Documents: extracted text is chunked and embedded server-side; the *embedding vectors*
 *   are stored for vector search, while `contentCiphertext` (optional E2EE mode) keeps
 *   raw doc content opaque to the server when private.
 */
export default defineSchema({
  // ─────────────────────────────────────────────────────────────
  // Identity & RBAC
  // ─────────────────────────────────────────────────────────────
  users: defineTable({
    email: v.string(),
    displayName: v.string(),
    role: v.union(v.literal("admin"), v.literal("member"), v.literal("guest")),
    avatarUrl: v.optional(v.string()),

    // Master PIN (PBKDF2). Server never sees the PIN itself.
    pinHash: v.optional(v.string()),
    pinSalt: v.optional(v.string()),
    pinIterations: v.optional(v.number()), // e.g. 310_000 (OWASP 2023 recommendation)
    pinSetupAt: v.optional(v.number()),

    // Per-user asymmetric public key for E2EE group chats (e.g. ECDH P-256 SPKI, base64).
    // Private keys stay in the user's IndexedDB / non-extractable CryptoKey.
    publicKey: v.optional(v.string()),

    // Whether this user runs the offline WebLLM path by default
    prefersLocalAI: v.optional(v.boolean()),

    // Auth identity linkage (Convex Auth / Clerk / custom OTP — userId from provider)
    externalId: v.optional(v.string()),

    lastSeenAt: v.optional(v.number()),

    // Dormancy: a user who deactivates (or whose email bounces) is marked
    // dormant — never deleted. Logging in again with the same email (OTP
    // proof) reactivates automatically. Admin can also set/clear this.
    dormant: v.optional(v.boolean()),
    dormantAt: v.optional(v.number()),

    createdAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_externalId", ["externalId"])
    .index("by_role", ["role"]),

  // Server-side sessions. The raw token is shown ONCE to the client at login;
  // only its SHA-256 lives here. All sensitive functions validate against this.
  sessions: defineTable({
    userId: v.id("users"),
    tokenHash: v.string(), // SHA-256 hex of the raw bearer token
    role: v.union(v.literal("admin"), v.literal("member"), v.literal("guest")),
    expiresAt: v.number(),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_user", ["userId"]),

  // E2EE device registry: one ECDH P-256 public key per physical device.
  // Room keys are wrapped per device public key — the server stays blind.
  devices: defineTable({
    userId: v.id("users"),
    deviceId: v.string(), // client-generated stable UUID (stored in IndexedDB)
    publicKey: v.string(), // ECDH P-256 SPKI, base64
    name: v.optional(v.string()),
    createdAt: v.number(),
    lastSeenAt: v.optional(v.number()),
  })
    .index("by_deviceId", ["deviceId"])
    .index("by_user", ["userId"]),

  // Email OTP codes for /auth. Short TTL, single-use, constant-time compare on check.
  otpCodes: defineTable({
    email: v.string(),
    codeHash: v.string(), // SHA-256 of the 6-digit code (NOT plaintext)
    purpose: v.union(
      v.literal("login"),
      v.literal("register"),
      v.literal("pinReset")
    ),
    expiresAt: v.number(), // Date.now() + 10 * 60 * 1000
    consumedAt: v.optional(v.number()),
    attempts: v.optional(v.number()), // rate-limit brute force (max 5)
    createdAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_email_purpose", ["email", "purpose"]),

  // ─────────────────────────────────────────────────────────────
  // Chat (E2EE) & WebRTC signaling
  // ─────────────────────────────────────────────────────────────
  chatRooms: defineTable({
    name: v.string(),
    type: v.union(v.literal("direct"), v.literal("group")),

    // For direct rooms: sorted "userAId|userBId" composite for uniqueness lookup.
    directKey: v.optional(v.string()),

    memberIds: v.array(v.id("users")),

    // Group session key, wrapped (AES-KW / ECDH) per member so the server can store
    // it but never unwrap. Map shape: { [userId]: wrappedKeyBase64 }
    wrappedKeys: v.optional(v.any()),

    // Per-device wrapped room keys for multi-device E2EE.
    // Map shape: { [deviceId]: wrappedKeyBase64 } — server stores blobs, blind.
    deviceKeys: v.optional(v.any()),

    createdById: v.id("users"),
    createdAt: v.number(),
    lastMessageAt: v.optional(v.number()),
  })
    .index("by_directKey", ["directKey"])
    .index("by_lastMessageAt", ["lastMessageAt"]),

  messages: defineTable({
    roomId: v.id("chatRooms"),
    senderId: v.id("users"),

    // Client-side AES-GCM sealed payload (base64). Server is blind.
    ciphertext: v.string(),
    iv: v.string(), // base64 12-byte nonce
    // Optional per-message wrapped content key when using per-message keys
    wrappedKey: v.optional(v.string()),

    kind: v.union(
      v.literal("text"),
      v.literal("callOffer"), // SDP offer  (E2EE payload inside ciphertext)
      v.literal("callAnswer"), // SDP answer
      v.literal("callIce"), // ICE candidate
      v.literal("callEnd"),
      v.literal("system")
    ),

    // Offline-sync linkage: idempotency key from the Dexie outbox (client-generated UUID).
    // Unique per sender — used by the sync engine to dedupe replays.
    clientMsgId: v.optional(v.string()),
    // Original local timestamp captured offline; server also stamps _creationTime.
    clientCreatedAt: v.optional(v.number()),

    replyToId: v.optional(v.id("messages")),
    editedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()), // soft delete (tombstone keeps ordering)

    readBy: v.optional(v.array(v.id("users"))),
  })
    .index("by_room", ["roomId"])
    .index("by_room_time", ["roomId", "clientCreatedAt"])
    .index("by_clientMsgId", ["senderId", "clientMsgId"]),

  // ─────────────────────────────────────────────────────────────
  // Document library + RAG (vector search)
  // ─────────────────────────────────────────────────────────────
  documents: defineTable({
    title: v.string(),
    ownerId: v.id("users"),
    mimeType: v.string(), // application/pdf, text/plain, docx…
    sizeBytes: v.number(),

    // Library scope: "central" = admin-curated CENTRAL ARCHIVE (readable by
    // every signed-in user; only admins upload/manage). "private" = the
    // user's own PRIVATE VAULT (owner-only content; admin has metadata
    // oversight but never reads vault content). Default: private.
    visibility: v.optional(v.union(v.literal("central"), v.literal("private"))),

    // Storage id from Convex file storage (ctx.storage).
    storageId: v.optional(v.id("_storage")),

    // When E2EE doc mode is on, raw content is encrypted at rest; embeddings are
    // computed server-side from the plaintext BEFORE encryption (privacy trade-off
    // documented in docs/ARCHITECTURE.md) or client-side when fully local.
    contentCiphertext: v.optional(v.string()),

    status: v.union(
      v.literal("uploading"),
      v.literal("processing"), // chunking + embedding
      v.literal("ready"),
      v.literal("failed")
    ),
    error: v.optional(v.string()),

    pageCount: v.optional(v.number()),
    chunkCount: v.optional(v.number()),
    checksum: v.optional(v.string()), // dedupe / integrity

    // Large-file support: ordered parts reassembled on download.
    storageIds: v.optional(v.array(v.id("_storage"))),
    partSize: v.optional(v.number()),

    // ── Library organization (tags · folders · favorites · trash) ──
    // Tags: lowercased, trimmed, max 12 per doc — user-defined labels for
    // filtering in the ARCHIVE / VAULT views.
    tags: v.optional(v.array(v.string())),
    // Folder: single optional virtual folder name (display grouping only).
    folder: v.optional(v.string()),
    // Favorite: operator-starred document (quick "STARRED" filter).
    favorite: v.optional(v.boolean()),
    // Trash: soft delete — hidden from the default views, restorable.
    trashed: v.optional(v.boolean()),
    trashedAt: v.optional(v.number()),

    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_status", ["status"])
    .index("by_visibility", ["visibility"]),

  documentChunks: defineTable({
    documentId: v.id("documents"),
    ordinal: v.number(), // chunk order for reassembly / citation context
    text: v.string(), // plaintext chunk used for embedding (see note on documents)
    embedding: v.array(v.number()), // float32 → number[] (see vectorIndex dims)
    embeddingModel: v.string(), // e.g. "text-embedding-3-small" or local model id
    tokens: v.optional(v.number()),
  })
    // Vector search: filter by documentId, order by embedding similarity.
    // 384 dims = all-MiniLM-L6-v2 computed CLIENT-SIDE via transformers.js —
    // keyless and free-forever (no embedding API required).
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 384,
      filterFields: ["documentId"],
    })
    .index("by_document", ["documentId"]),

  // ─────────────────────────────────────────────────────────────
  // Jarvis AI sessions (dual-mode: OpenRouter cloud / WebLLM offline)
  // ─────────────────────────────────────────────────────────────
  aiSessions: defineTable({
    userId: v.id("users"),
    // Client-generated id so offline-created sessions dedupe on reconnect
    clientSessionId: v.optional(v.string()),
    title: v.optional(v.string()),
    mode: v.union(v.literal("cloud"), v.literal("offline")),

    // Model id actually used (OpenRouter slug or WebLLM model id)
    model: v.optional(v.string()),

    systemPrompt: v.optional(v.string()),
    // RAG grounding for this session (document ids the user attached)
    documentIds: v.optional(v.array(v.id("documents"))),

    // Rolling token accounting for budgeting
    totalPromptTokens: v.optional(v.number()),
    totalCompletionTokens: v.optional(v.number()),

    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
    archived: v.optional(v.boolean()),
  })
    .index("by_user", ["userId"])
    .index("by_user_updated", ["userId", "updatedAt"]),

  aiMessages: defineTable({
    sessionId: v.id("aiSessions"),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),

    // AI terminal content may contain RAG citations; keep plaintext here by default
    // (it is the user's own query/answer). Set contentCiphertext for private mode.
    content: v.string(),
    contentCiphertext: v.optional(v.string()),

    // RAG provenance: which chunks grounded this answer
    citations: v.optional(
      v.array(
        v.object({
          documentId: v.id("documents"),
          chunkOrdinals: v.array(v.number()),
          score: v.number(),
          // Library organization snapshot at answer time (tags only — folder/favorite
          // state changes over time and would make old citations stale).
          documentTags: v.optional(v.array(v.string())),
        })
      )
    ),

    // Which engine answered: "openrouter" | "webllm"
    engine: v.optional(v.string()),
    latencyMs: v.optional(v.number()),

    // Offline-sync linkage (same outbox dedupe pattern as chat messages)
    clientMsgId: v.optional(v.string()),

    // Terminal extras (speech input transcript, TTS state, etc.)
    meta: v.optional(v.any()),
  })
    .index("by_session", ["sessionId"])
    .index("by_clientMsgId", ["sessionId", "clientMsgId"]),

  // ─────────────────────────────────────────────────────────────
  // System settings (admin-only via RBAC)
  // ─────────────────────────────────────────────────────────────
  systemSettings: defineTable({
    // Singleton row: key === "global". All settings live in one document so the
    // dashboard reads them in a single reactive subscription.
    key: v.literal("global"),

    theme: v.optional(
      v.object({
        accent: v.optional(v.string()), // e.g. "#22d3ee"
        mode: v.optional(v.union(v.literal("dark"), v.literal("hud"))),
        scanlineIntensity: v.optional(v.number()),
        panelOpacity: v.optional(v.number()),
      })
    ),

    ai: v.optional(
      v.object({
        defaultMode: v.optional(v.union(v.literal("cloud"), v.literal("offline"))),
        defaultModel: v.optional(v.string()),
        ragTopK: v.optional(v.number()), // chunks per retrieval
        allowGuestAI: v.optional(v.boolean()),
      })
    ),

    security: v.optional(
      v.object({
        requirePin: v.optional(v.boolean()), // force /lock for all users
        pinLockTimeoutMs: v.optional(v.number()), // auto-lock idle timeout
        allowGuestMode: v.optional(v.boolean()),
        e2eeRequired: v.optional(v.boolean()), // refuse plaintext fallback
      })
    ),

    updatedById: v.id("users"),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  // ─────────────────────────────────────────────────────────────
  // Ops: calls & audit trail
  // ─────────────────────────────────────────────────────────────
  // Active WebRTC calls (signaling itself flows through messages with kind=call*)
  calls: defineTable({
    roomId: v.id("chatRooms"),
    initiatorId: v.id("users"),
    participantIds: v.array(v.id("users")),
    media: v.union(v.literal("audio"), v.literal("video")),
    status: v.union(
      v.literal("ringing"),
      v.literal("active"),
      v.literal("ended"),
      v.literal("missed")
    ),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
  })
    .index("by_room", ["roomId"])
    .index("by_status", ["status"]),

  // Immutable-ish audit log — append-only, admin-readable. Record every
  // privileged action: settings change, role change, PIN reset, doc deletion.
  auditLog: defineTable({
    actorId: v.id("users"),
    action: v.string(), // e.g. "settings.update", "user.roleChange", "pin.reset"
    targetType: v.optional(v.string()),
    targetId: v.optional(v.string()),
    // Never log secrets — only metadata (which field changed, not old/new values).
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  }).index("by_actor", ["actorId"]),
});
