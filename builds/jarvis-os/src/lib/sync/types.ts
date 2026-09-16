/**
 * Offline-sync type contracts.
 *
 * Every write in JARVIS OS is expressed as a *typed operation* that can be:
 *   1. applied locally (optimistic, into Dexie)  → instant UI
 *   2. pushed remotely (Convex mutation)         → reactive fan-out
 *   3. confirmed locally (server result merge)   → consistency
 *
 * Encryption happens BEFORE an operation is enqueued: payloads for
 * `message.send` already contain ciphertext, so the outbox on disk never
 * holds plaintext.
 */

export type OpName =
  | "message.send"
  | "message.edit"
  | "message.delete"
  | "message.read"
  | "ai.message.append"
  | "room.create"
  | "document.upsertMeta";

/** Per-op payload unions. Keep narrow and exhaustive — the registry (ops.ts)
 *  maps each name to exactly one local applier + one Convex mutation name. */
export type OpPayloadMap = {
  "message.send": {
    sessionToken: string;
    roomId: string;
    senderId: string;
    /** Already-sealed client-side. */
    ciphertext: string;
    iv: string;
    wrappedKey?: string;
    kind:
      | "text"
      | "callOffer"
      | "callAnswer"
      | "callIce"
      | "callEnd"
      | "system";
    clientMsgId: string;
    clientCreatedAt: number;
    replyToId?: string;
  };
  "message.edit": {
    sessionToken: string;
    messageId: string;
    ciphertext: string;
    iv: string;
    clientMsgId: string;
  };
  "message.delete": {
    sessionToken: string;
    messageId: string;
    clientMsgId: string;
  };
  "message.read": {
    sessionToken: string;
    messageId: string;
    userId: string;
    clientMsgId: string;
  };
  "ai.message.append": {
    sessionToken: string;
    sessionId: string;
    role: "user" | "assistant" | "system";
    content: string;
    engine?: "openrouter" | "puter" | "pollinations" | "groq" | "webllm";
    latencyMs?: number;
    clientMsgId: string;
  };
  "room.create": {
    sessionToken: string;
    name: string;
    type: "direct" | "group";
    memberIds: string[];
    directKey?: string;
    wrappedKeys?: Record<string, string>;
    createdById: string;
    /** Client-generated room id so offline-created rooms have a stable local id. */
    clientRoomId: string;
  };
  "document.upsertMeta": {
    sessionToken: string;
    title: string;
    mimeType: string;
    sizeBytes: number;
    checksum: string;
    ownerId: string;
  };
};

export type OpName_ = keyof OpPayloadMap;
export type OpPayload<T extends OpName_> = OpPayloadMap[T];

/* * NOTE: every payload carries `sessionToken` — the sync engine pushes it to
 * Convex, where requireUser validates it. Tokens persist in the outbox for
 * offline replay; they expire server-side (30d), which cleanly kills stale
 * queued ops.
 *
 * A single unit of offline work, persisted in Dexie `outbox`. */
export interface OutboxOp<T extends OpName_ = OpName_> {
  /** Client-generated UUID — also the idempotency key sent to Convex. */
  id: string;
  name: T;
  payload: OpPayload<T>;
  /** Monotonic sequence for strict FIFO ordering. */
  seq: number;
  createdAt: number;
  attempts: number;
  lastAttemptAt?: number;
  lastError?: string;
  nextAttemptAt?: number;
  status: "queued" | "sending" | "failed" | "done";
}

/** Server ack returned by Convex mutations for outbox reconciliation. */
export interface OpAck {
  clientOpId: string;
  /** Server-assigned real ids for client-temporary ids (e.g. clientRoomId). */
  idMap?: Record<string, string>;
}
