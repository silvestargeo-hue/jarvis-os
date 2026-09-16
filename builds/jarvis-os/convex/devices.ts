import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";

/**
 * Device registry for multi-device E2EE key distribution.
 * Devices register their ECDH P-256 public key; room creators wrap the room
 * key per device. The server stores public keys and wrapped blobs only —
 * it can never derive or unwrap anything.
 */

const MAX_DEVICES_PER_USER = 12;

/** Register (or refresh) this device's public key. Idempotent on deviceId. */
export const register = mutation({
  args: {
    sessionToken: v.string(),
    deviceId: v.string(),
    publicKey: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);

    const existing = await ctx.db
      .query("devices")
      .withIndex("by_deviceId", (q: any) => q.eq("deviceId", args.deviceId))
      .unique();

    if (existing) {
      if (existing.userId !== user.userId) throw new Error("forbidden: not device owner");
      await ctx.db.patch(existing._id, { publicKey: args.publicKey, lastSeenAt: Date.now() });
      return { deviceId: args.deviceId, created: false };
    }

    const mine = await ctx.db
      .query("devices")
      .withIndex("by_user", (q: any) => q.eq("userId", user.userId))
      .collect();
    if (mine.length >= MAX_DEVICES_PER_USER) {
      throw new Error(`device limit reached (${MAX_DEVICES_PER_USER})`);
    }

    await ctx.db.insert("devices", {
      userId: user.userId as any,
      deviceId: args.deviceId,
      publicKey: args.publicKey,
      name: args.name ?? "device",
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
    });
    return { deviceId: args.deviceId, created: true };
  },
});

/** Public keys of all registered devices for a set of users (room members). */
export const listForUsers = query({
  args: { sessionToken: v.string(), userIds: v.array(v.id("users")) },
  handler: async (ctx, args) => {
    await requireUser(ctx, args.sessionToken);
    const out: Array<{ deviceId: string; userId: string; publicKey: string }> = [];
    for (const uid of args.userIds.slice(0, 50)) {
      const devices = await ctx.db
        .query("devices")
        .withIndex("by_user", (q: any) => q.eq("userId", uid))
        .collect();
      for (const d of devices) {
        out.push({ deviceId: d.deviceId, userId: d.userId, publicKey: d.publicKey });
      }
    }
    return out;
  },
});

/** Remove a device (owner-only) — e.g. lost phone. Its wrapped keys die with it. */
export const remove = mutation({
  args: { sessionToken: v.string(), deviceId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const device = await ctx.db
      .query("devices")
      .withIndex("by_deviceId", (q: any) => q.eq("deviceId", args.deviceId))
      .unique();
    if (!device) return { ok: true };
    if (device.userId !== user.userId) throw new Error("forbidden: not device owner");
    await ctx.db.delete(device._id);
    return { ok: true };
  },
});
