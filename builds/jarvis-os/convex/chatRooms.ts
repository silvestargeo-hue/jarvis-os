import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";

/** Recent rooms for the chat sidebar (client filters membership). */
export const list = query({
  args: { sessionToken: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireUser(ctx, args.sessionToken);
    return await ctx.db
      .query("chatRooms")
      .withIndex("by_lastMessageAt")
      .order("desc")
      .take(Math.min(args.limit ?? 50, 200));
  },
});

/**
 * Room creation — idempotent on directKey (direct rooms) or via the
 * clientRoomId mapping returned in the ack (group rooms created offline).
 */
export const create = mutation({
  args: {
    sessionToken: v.string(),
    name: v.string(),
    type: v.union(v.literal("direct"), v.literal("group")),
    memberIds: v.array(v.id("users")),
    createdById: v.id("users"),
    directKey: v.optional(v.string()),
    wrappedKeys: v.optional(v.any()),
    clientRoomId: v.string(),
    clientOpId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    if (user.userId !== args.createdById) throw new Error("forbidden: not room creator");

    // Direct rooms: deterministic dedupe key.
    if (args.type === "direct" && args.directKey) {
      const existing = await ctx.db
        .query("chatRooms")
        .withIndex("by_directKey", (q: any) => q.eq("directKey", args.directKey!))
        .unique();
      if (existing) {
        return {
          clientOpId: args.clientOpId,
          idMap: { [args.clientRoomId]: existing._id },
        };
      }
    }

    const roomId = await ctx.db.insert("chatRooms", {
      name: args.name,
      type: args.type,
      memberIds: args.memberIds,
      directKey: args.directKey,
      wrappedKeys: args.wrappedKeys,
      createdById: args.createdById,
      createdAt: Date.now(),
    });

    return { clientOpId: args.clientOpId, idMap: { [args.clientRoomId]: roomId } };
  },
});

/**
 * Multi-device key distribution: a device that holds the room key wraps it
 * per registered device of the room's members and publishes the blob map.
 * Owner-only (must be a room member). Server stores blobs — it is blind.
 */
export const publishKeys = mutation({
  args: {
    sessionToken: v.string(),
    roomId: v.id("chatRooms"),
    deviceKeys: v.record(v.string(), v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const room = await ctx.db.get(args.roomId);
    if (!room) throw new Error("room not found");
    if (!room.memberIds.some((m) => m === (user.userId as any))) {
      throw new Error("forbidden: not a room member");
    }
    const merged = { ...(room.deviceKeys ?? {}), ...args.deviceKeys };
    await ctx.db.patch(args.roomId, { deviceKeys: merged });
    return { published: Object.keys(args.deviceKeys).length, total: Object.keys(merged).length };
  },
});
