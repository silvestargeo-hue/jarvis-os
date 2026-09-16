import { db } from "../db";
import { OPS } from "./ops";
import { syncEngine } from "./engine";
import type { OpPayloadMap, OpName } from "./types";

/**
 * Typed enqueuers — the ONLY way app code touches the sync layer.
 *
 * Usage (works identically online and offline):
 *   await sendMessage({ roomId, senderId, ciphertext, iv, kind: "text", ... })
 *
 * Online: lands on Convex within ~a second. Offline: durable in IndexedDB,
 * pushes automatically on reconnect. UI never branches on connectivity.
 */

function uuid(): string {
  // Cast to a custom shape — avoids lib-dom narrowing to `never` in the fallback branch.
  const c = crypto as {
    randomUUID?: () => string;
    getRandomValues: (a: Uint8Array) => Uint8Array;
  };
  if (typeof c.randomUUID === "function") return c.randomUUID();
  // Fallback for older browsers: RFC4122 v4 via getRandomValues
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function enqueue<T extends OpName>(
  name: T,
  payload: OpPayloadMap[T]
): Promise<string> {
  const opId = uuid();

  // Atomic optimistic-apply + durable enqueue across all mirrored tables.
  await db.transaction(
    "rw",
    [db.outbox, db.messages, db.rooms, db.aiMessages],
    async () => {
      // 1. Optimistic local mirror FIRST so the UI renders immediately.
      await OPS[name].localApply(payload);
      // 2. Persist the durable op (payload already encrypted where applicable).
      await db.outbox.add({
        opId,
        name,
        payloadJson: JSON.stringify(payload),
        createdAt: Date.now(),
        attempts: 0,
        status: "queued",
      });
    }
  );

  // 3. Fire-and-forget flush attempt (engine no-ops when offline).
  void syncEngine.drain();
  return opId;
}

export const sendMessage = (p: OpPayloadMap["message.send"]) =>
  enqueue("message.send", p);

export const editMessage = (p: OpPayloadMap["message.edit"]) =>
  enqueue("message.edit", p);

export const deleteMessage = (p: OpPayloadMap["message.delete"]) =>
  enqueue("message.delete", p);

export const markMessageRead = (p: OpPayloadMap["message.read"]) =>
  enqueue("message.read", p);

export const appendAiMessage = (p: OpPayloadMap["ai.message.append"]) =>
  enqueue("ai.message.append", p);

export const createRoom = (p: OpPayloadMap["room.create"]) =>
  enqueue("room.create", p);

export const upsertDocumentMeta = (p: OpPayloadMap["document.upsertMeta"]) =>
  enqueue("document.upsertMeta", p);
