import Dexie, { type Table } from "dexie";

/**
 * JARVIS OS — local-first Dexie database.
 *
 * Reads NEVER block on the network: UI subscribes to these mirror tables
 * (via dexie-react-hooks) and Convex subscriptions stream updates into them
 * when online. Writes go to the outbox and mirror optimistically.
 */

export type OutboxStatus = "queued" | "sending" | "failed" | "done";

export interface OutboxRecord {
  /** Auto-increment — FIFO ordering key. */
  id?: number;
  /** Client UUID, also the idempotency key for the Convex mutation. */
  opId: string;
  name: string;
  /** JSON-serialized OpPayload (already encrypted where applicable). */
  payloadJson: string;
  createdAt: number;
  attempts: number;
  lastAttemptAt?: number;
  lastError?: string;
  nextAttemptAt?: number;
  status: OutboxStatus;
}

/** Mirrors of server tables for offline reads. Minimal projection only. */
export interface MessageMirror {
  /** Convex message id once known; `client:{clientMsgId}` while pending. */
  id: string;
  roomId: string;
  senderId: string;
  /** Still sealed — decryption happens at render time with the room key. */
  ciphertext: string;
  iv: string;
  wrappedKey?: string;
  kind: string;
  clientMsgId: string;
  clientCreatedAt: number;
  /** true while the outbox copy is still unsent. */
  pending: 0 | 1;
  deletedAt?: number;
}

export interface RoomMirror {
  id: string;
  name: string;
  type: "direct" | "group";
  memberIds: string[];
  directKey?: string;
  createdAt: number;
}

export interface AiMessageMirror {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  engine?: string;
  clientMsgId: string;
  clientCreatedAt: number;
  pending: 0 | 1;
}

/** Key-value metadata: sync cursors, device keys, id-mapping table. */
export interface MetaRecord {
  key: string;
  value: unknown;
}

class JarvisDb extends Dexie {
  outbox!: Table<OutboxRecord, number>;
  messages!: Table<MessageMirror, string>;
  rooms!: Table<RoomMirror, string>;
  aiMessages!: Table<AiMessageMirror, string>;
  meta!: Table<MetaRecord, string>;

  constructor() {
    super("jarvis-os");
    this.version(1).stores({
      // NOTE: only indexed columns go in the schema string; full objects are stored anyway.
      outbox: "++id, opId, status, nextAttemptAt, createdAt",
      messages: "id, roomId, [roomId+clientCreatedAt], clientMsgId, pending",
      rooms: "id, type, directKey",
      aiMessages: "id, sessionId, [sessionId+clientCreatedAt], clientMsgId",
      meta: "key",
    });
  }
}

export const db = new JarvisDb();

/** Pending-op count for the HUD "SYNC" widget. */
export async function pendingOpCount(): Promise<number> {
  return db.outbox.where("status").anyOf(["queued", "failed"]).count();
}

/** Stable local id for entities created offline. */
export function clientTempId(uuid: string): string {
  return `client:${uuid}`;
}
