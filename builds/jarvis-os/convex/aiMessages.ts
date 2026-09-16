import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";

/**
 * AI messages — the terminal transcript, persisted per session.
 * Append is idempotent on (sessionId, clientMsgId) so the offline outbox
 * can replay safely after lost acks.
 */

export const append = mutation({
  args: {
    sessionToken: v.string(),
    sessionId: v.id("aiSessions"),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    content: v.string(),
    engine: v.optional(v.string()),
    latencyMs: v.optional(v.number()),
    clientMsgId: v.optional(v.string()),
    citations: v.optional(
      v.array(
        v.object({
          documentId: v.id("documents"),
          chunkOrdinals: v.array(v.number()),
          score: v.number(),
          documentTags: v.optional(v.array(v.string())),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);

    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("ai session not found");
    if (session.userId !== user.userId) throw new Error("forbidden: not owner");

    if (args.clientMsgId) {
      const dup = await ctx.db
        .query("aiMessages")
        .withIndex("by_clientMsgId", (q: any) =>
          q.eq("sessionId", args.sessionId).eq("clientMsgId", args.clientMsgId)
        )
        .unique();
      if (dup) return { aiMessageId: dup._id, deduped: true };
    }

    const id = await ctx.db.insert("aiMessages", {
      sessionId: args.sessionId,
      role: args.role,
      content: args.content,
      engine: args.engine,
      latencyMs: args.latencyMs,
      clientMsgId: args.clientMsgId,
      citations: args.citations,
    });
    await ctx.db.patch(args.sessionId, { updatedAt: Date.now() });
    return { aiMessageId: id, deduped: false };
  },
});

/** Transcript for one session (owner-only, newest last, capped). */
export const list = query({
  args: { sessionToken: v.string(), sessionId: v.id("aiSessions"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("ai session not found");
    if (session.userId !== user.userId) throw new Error("forbidden: not owner");

    const msgs = await ctx.db
      .query("aiMessages")
      .withIndex("by_session", (q: any) => q.eq("sessionId", args.sessionId))
      .collect();
    return msgs
      .sort((a, b) => a._creationTime - b._creationTime)
      .slice(-Math.min(args.limit ?? 200, 500));
  },
});

/** Delete one message (owner-only) — used by the UI's "purge turn". */
export const remove = mutation({
  args: { sessionToken: v.string(), aiMessageId: v.id("aiMessages") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const m = await ctx.db.get(args.aiMessageId);
    if (!m) throw new Error("ai message not found");
    const session = await ctx.db.get(m.sessionId);
    if (!session || session.userId !== user.userId) throw new Error("forbidden: not owner");
    await ctx.db.delete(args.aiMessageId);
    return { ok: true };
  },
});
