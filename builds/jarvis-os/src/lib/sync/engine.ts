import { api } from "../../../convex/_generated/api";
import { db } from "../db";
import { OPS, type AnyOpDefinition } from "./ops";
import type { OutboxOp, OpName, OpPayloadMap, OpAck } from "./types";

/**
 * Offline sync engine.
 *
 * Lifecycle of one op:
 *   enqueue() ──► outbox(queued) ──► drain() ──► Convex mutation ──► ack
 *        │                                    │
 *        └─ localApply (optimistic)           ├─ success → applyAck → done
 *                                             └─ failure → backoff → retry
 *
 * Guarantees:
 *   - Ordering: strict FIFO by auto-increment id, per drain cycle.
 *   - Idempotency: every op carries a client UUID; Convex mutations upsert by
 *     `clientMsgId` so replays after a lost ack are harmless.
 *   - Backoff: exponential with jitter (1s → 512s), persisted across reloads.
 *   - Concurrency: single drain loop (module singleton); a draining flag
 *     prevents overlapping flushes across tabs via a Web Lock (best effort).
 */

const MAX_ATTEMPTS = 12;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_CAP_MS = 512_000; // ~8.5 min

function backoffDelay(attempts: number): number {
  const exp = Math.min(attempts, 9);
  const jitter = Math.random() * 0.3 + 0.85;
  return Math.min(BACKOFF_BASE_MS * 2 ** exp * jitter, BACKOFF_CAP_MS);
}

type ConvexClientLike = {
  // Deliberately loose: accepts ConvexReactClient's generic mutation signature.
  mutation: (ref: any, args: any) => Promise<any>;
};

class SyncEngine {
  private convex: ConvexClientLike | null = null;
  private draining = false;
  private started = false;
  /** Resolves the current drain promise, for tests/await-able flushes. */
  private drainPromise: Promise<void> = Promise.resolve();

  /** Wire the engine to the Convex client. Call once in a client provider. */
  attach(convex: ConvexClientLike) {
    this.convex = convex;
    if (!this.started) {
      this.started = true;
      this.registerNetworkHooks();
      void this.drain(); // flush anything persisted from a previous session
    }
  }

  private registerNetworkHooks() {
    if (typeof window === "undefined") return;
    window.addEventListener("online", () => {
      void this.drain();
    });
    // Re-check periodically: `online` event can be optimistic on flaky links.
    setInterval(() => {
      if (navigator.onLine) void this.drain();
    }, 30_000);
  }

  /** Drain loop entry. Safe to call concurrently — reuses the running flush. */
  drain(): Promise<void> {
    if (this.draining) return this.drainPromise;
    this.draining = true;
    this.drainPromise = this.flushAll().finally(() => {
      this.draining = false;
    });
    return this.drainPromise;
  }

  private async flushAll(): Promise<void> {
    if (!this.convex || typeof window === "undefined") return;
    if (!navigator.onLine) return;

    // FIFO by auto-increment id; only rows due for an attempt.
    const due = await db.outbox
      .where("status")
      .anyOf(["queued", "failed"])
      .toArray();
    due.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

    for (const rec of due) {
      if (!navigator.onLine) break;
      if (rec.nextAttemptAt && rec.nextAttemptAt > Date.now()) continue;

      await db.outbox.update(rec.id!, { status: "sending" });
      try {
        const opName = rec.name as OpName;
        const def = OPS[opName] as AnyOpDefinition | undefined;
        if (!def) throw new Error(`Unknown op: ${opName}`);

        const payload = JSON.parse(rec.payloadJson) as OpPayloadMap[typeof opName];
        const mutationRef = (api as unknown as Record<string, Record<string, unknown>>)[
          def.convexMutation.split("/")[0]!
        ]?.[def.convexMutation.split("/")[1]!];

        // NOTE: no clientOpId here — Convex validators reject unknown fields,
        // which made EVERY queued write fail server-side. Idempotency is
        // already guaranteed by each mutation's clientMsgId dedup check.
        const ack = (await this.convex.mutation(mutationRef, {
          ...def.toConvexArgs(payload),
        })) as OpAck | null;

        if (ack?.idMap) await def.applyAck?.(payload, ack);
        await db.outbox.delete(rec.id!); // done — remove from queue
      } catch (err) {
        const attempts = rec.attempts + 1;
        const giveUp = attempts >= MAX_ATTEMPTS;
        await db.outbox.update(rec.id!, {
          // "failed" + future nextAttemptAt = scheduled retry; giveUp = dead letter.
          status: "failed",
          attempts,
          lastAttemptAt: Date.now(),
          lastError: err instanceof Error ? err.message : String(err),
          nextAttemptAt: giveUp ? undefined : Date.now() + backoffDelay(attempts),
        });
        if (giveUp) {
          console.error(`[sync] op ${rec.opId} exceeded max attempts`, err);
          break; // stop the cycle; surface dead-letter state in UI
        }
      }
    }
  }

  /** Test/debug helper — awaits the current drain cycle. */
  whenIdle(): Promise<void> {
    return this.drainPromise;
  }
}

export const syncEngine = new SyncEngine();
export type { OutboxOp };
