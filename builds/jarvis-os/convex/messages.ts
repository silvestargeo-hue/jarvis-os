import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";

/**
 * Chat mutations — every write is idempotent on (senderId, clientMsgId) so the
 * offline sync engine can replay safely after lost acks.
 */

/** Live read for the chat UI (newest 200, reversed to chronological). */
export const list = query({
  args: {
    sessionToken: v.string(),
    roomId: v.id("chatRooms"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx, args.sessionToken);
    const msgs = await ctx.db
      .query("messages")
      .withIndex("by_room", (q: any) => q.eq("roomId", args.roomId))
      .order("desc")
      .take(Math.min(args.limit ?? 50, 500));
    return msgs.reverse();
  },
});

/**
 * Cursor pagination: fetch messages older than `before` (a clientCreatedAt
 * epoch ms). Returns one page + the next cursor; empty page = history exhausted.
 */
export const listOlder = query({
  args: {
    sessionToken: v.string(),
    roomId: v.id("chatRooms"),
    before: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx, args.sessionToken);
    const pageSize = Math.min(args.limit ?? 50, 200);
    const page = await ctx.db
      .query("messages")
      .withIndex("by_room_time", (q: any) =>
        q.eq("roomId", args.roomId).lt("clientCreatedAt", args.before)
      )
      .order("desc")
      .take(pageSize);
    return {
      messages: page.reverse(),
      nextBefore: page.length ? page[0]!.clientCreatedAt ?? null : null,
      exhausted: page.length < pageSize,
    };
  },
});

export const send = mutation({
  args: {
    sessionToken: v.string(),
    roomId: v.id("chatRooms"),
    senderId: v.id("users"),
    ciphertext: v.string(),
    iv: v.string(),
    wrappedKey: v.optional(v.string()),
    kind: v.union(
      v.literal("text"),
      v.literal("callOffer"),
      v.literal("callAnswer"),
      v.literal("callIce"),
      v.literal("callEnd"),
      v.literal("system")
    ),
    clientMsgId: v.string(),
    clientCreatedAt: v.optional(v.number()),
    replyToId: v.optional(v.id("messages")),
    clientOpId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    if (user.userId !== args.senderId) throw new Error("forbidden: cannot send as another user");

    // Idempotency: replayed op after a lost ack → return the existing id.
    const existing = await ctx.db
      .query("messages")
      .withIndex("by_clientMsgId", (q: any) =>
        q.eq("senderId", args.senderId).eq("clientMsgId", args.clientMsgId)
      )
      .unique();
    if (existing) {
      return { clientOpId: args.clientOpId, idMap: { [args.clientMsgId]: existing._id } };
    }

    const messageId = await ctx.db.insert("messages", {
      roomId: args.roomId,
      senderId: args.senderId,
      ciphertext: args.ciphertext,
      iv: args.iv,
      wrappedKey: args.wrappedKey,
      kind: args.kind,
      clientMsgId: args.clientMsgId,
      clientCreatedAt: args.clientCreatedAt ?? Date.now(),
      replyToId: args.replyToId,
    });

    await ctx.db.patch(args.roomId, { lastMessageAt: Date.now() });

    return { clientOpId: args.clientOpId, idMap: { [args.clientMsgId]: messageId } };
  },
});

export const edit = mutation({
  args: {
    sessionToken: v.string(),
    messageId: v.id("messages"),
    ciphertext: v.string(),
    iv: v.string(),
    clientMsgId: v.string(),
    clientOpId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const msg = await ctx.db.get(args.messageId);
    if (!msg) throw new Error("message not found");
    if (msg.senderId !== user.userId) throw new Error("forbidden: not sender");
    await ctx.db.patch(args.messageId, {
      ciphertext: args.ciphertext,
      iv: args.iv,
      editedAt: Date.now(),
    });
    return { clientOpId: args.clientOpId };
  },
});

export const remove = mutation({
  args: {
    sessionToken: v.string(),
    messageId: v.id("messages"),
    clientMsgId: v.string(),
    clientOpId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const msg = await ctx.db.get(args.messageId);
    if (!msg) return { clientOpId: args.clientOpId }; // already gone → idempotent
    if (msg.senderId !== user.userId) throw new Error("forbidden: not sender");
    await ctx.db.patch(args.messageId, { deletedAt: Date.now() });
    return { clientOpId: args.clientOpId };
  },
});

export const markRead = mutation({
  args: {
    sessionToken: v.string(),
    messageId: v.id("messages"),
    userId: v.id("users"),
    clientOpId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const msg = await ctx.db.get(args.messageId);
    if (!msg) return { clientOpId: args.clientOpId };
    const readBy = msg.readBy ?? [];
    if (!readBy.some((id: string) => id === user.userId)) {
      await ctx.db.patch(args.messageId, { readBy: [...readBy, args.userId] });
    }
    return { clientOpId: args.clientOpId };
  },
});
