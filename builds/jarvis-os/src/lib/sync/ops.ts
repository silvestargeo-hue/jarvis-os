import { api } from "../../../convex/_generated/api";
import { db, clientTempId } from "../db";
import type { OpName, OpPayloadMap } from "./types";

/**
 * Op registry — the single source of truth binding each offline operation to:
 *   - localApply: optimistic write into Dexie mirror tables (instant UI)
 *   - convex:     the mutation name + arg mapper for the remote push
 *
 * Adding a new offline capability = one entry here. The engine (engine.ts)
 * stays generic.
 */
export interface OpDefinition<T extends OpName> {
  /** Optimistic local application. Runs inside the enqueue transaction path. */
  localApply: (payload: OpPayloadMap[T]) => Promise<void>;
  /** Convex mutation reference name under `api/`. */
  convexMutation: string;
  /** Map payload → mutation args (usually identity; strips local-only fields). */
  toConvexArgs: (payload: OpPayloadMap[T]) => Record<string, unknown>;
  /** Merge server ack back into local mirrors (id reconciliation). */
  applyAck?: (payload: OpPayloadMap[T], ack: { idMap?: Record<string, string> }) => Promise<void>;
}

/** Type-erased view used by the generic engine loop (which can't know T). */
export interface AnyOpDefinition {
  localApply: (payload: any) => Promise<void>;
  convexMutation: string;
  toConvexArgs: (payload: any) => Record<string, unknown>;
  applyAck?: (payload: any, ack: { idMap?: Record<string, string> }) => Promise<void>;
}

export const OPS: { [K in OpName]: OpDefinition<K> } = {
  "message.send": {
    async localApply(p) {
      await db.messages.put({
        id: clientTempId(p.clientMsgId),
        roomId: p.roomId,
        senderId: p.senderId,
        ciphertext: p.ciphertext,
        iv: p.iv,
        wrappedKey: p.wrappedKey,
        kind: p.kind,
        clientMsgId: p.clientMsgId,
        clientCreatedAt: p.clientCreatedAt,
        pending: 1,
      });
    },
    convexMutation: "messages/send",
    toConvexArgs: (p) => ({
      sessionToken: p.sessionToken,
      roomId: p.roomId,
      senderId: p.senderId,
      ciphertext: p.ciphertext,
      iv: p.iv,
      wrappedKey: p.wrappedKey,
      kind: p.kind,
      clientMsgId: p.clientMsgId,
      clientCreatedAt: p.clientCreatedAt,
      replyToId: p.replyToId,
    }),
    async applyAck(_p, ack) {
      const serverId = ack.idMap?.[_p.clientMsgId];
      if (!serverId) return;
      await db.messages.delete(clientTempId(_p.clientMsgId));
      // Server subscription will upsert the canonical record; nothing else to do.
    },
  },

  "message.edit": {
    async localApply(p) {
      const existing = await db.messages.get(p.messageId);
      if (existing) {
        await db.messages.put({ ...existing, ciphertext: p.ciphertext, iv: p.iv });
      }
    },
    convexMutation: "messages/edit",
    toConvexArgs: (p) => ({
      sessionToken: p.sessionToken,
      messageId: p.messageId,
      ciphertext: p.ciphertext,
      iv: p.iv,
      clientMsgId: p.clientMsgId,
    }),
  },

  "message.delete": {
    async localApply(p) {
      const existing = await db.messages.get(p.messageId);
      if (existing) await db.messages.put({ ...existing, deletedAt: Date.now() });
    },
    convexMutation: "messages/remove",
    toConvexArgs: (p) => ({ sessionToken: p.sessionToken, messageId: p.messageId, clientMsgId: p.clientMsgId }),
  },

  "message.read": {
    async localApply() {
      /* read receipts don't change local message content */
    },
    convexMutation: "messages/markRead",
    toConvexArgs: (p) => ({ sessionToken: p.sessionToken, messageId: p.messageId, userId: p.userId }),
  },

  "ai.message.append": {
    async localApply(p) {
      await db.aiMessages.put({
        id: clientTempId(p.clientMsgId),
        sessionId: p.sessionId,
        role: p.role,
        content: p.content,
        engine: p.engine,
        clientMsgId: p.clientMsgId,
        clientCreatedAt: Date.now(),
        pending: 1,
      });
    },
    convexMutation: "aiMessages/append",
    toConvexArgs: (p) => ({
      sessionToken: p.sessionToken,
      sessionId: p.sessionId,
      role: p.role,
      content: p.content,
      engine: p.engine,
      latencyMs: p.latencyMs,
      clientMsgId: p.clientMsgId,
    }),
  },

  "room.create": {
    async localApply(p) {
      await db.rooms.put({
        id: clientTempId(p.clientRoomId),
        name: p.name,
        type: p.type,
        memberIds: p.memberIds,
        directKey: p.directKey,
        createdAt: Date.now(),
      });
    },
    convexMutation: "chatRooms/create",
    toConvexArgs: (p) => ({
      sessionToken: p.sessionToken,
      name: p.name,
      type: p.type,
      memberIds: p.memberIds,
      directKey: p.directKey,
      wrappedKeys: p.wrappedKeys,
      clientRoomId: p.clientRoomId,
    }),
    async applyAck(p, ack) {
      const serverId = ack.idMap?.[p.clientRoomId];
      if (!serverId) return;
      await db.rooms.delete(clientTempId(p.clientRoomId));
    },
  },

  "document.upsertMeta": {
    async localApply() {
      /* doc meta is server-driven; local file bytes live outside Dexie */
    },
    convexMutation: "documents/upsertMeta",
    toConvexArgs: (p) => ({
      sessionToken: p.sessionToken,
      title: p.title,
      mimeType: p.mimeType,
      sizeBytes: p.sizeBytes,
      checksum: p.checksum,
      ownerId: p.ownerId,
    }),
  },
} as const;

/** Re-exported so the engine can reference the Convex api object dynamically. */
export const convexApi = api;
