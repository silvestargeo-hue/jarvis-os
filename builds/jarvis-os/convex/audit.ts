import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";

/**
 * Append-only audit trail. Privileged actions (PIN verify, later: settings
 * changes, role changes) write here. Metadata only — never secrets.
 */
export const log = mutation({
  args: {
    actorId: v.optional(v.id("users")),
    action: v.string(),
    targetType: v.optional(v.string()),
    targetId: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    if (!args.actorId) return { ok: true };
    await ctx.db.insert("auditLog", {
      actorId: args.actorId,
      action: args.action,
      targetType: args.targetType,
      targetId: args.targetId,
      metadata: args.metadata,
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});

/** Session-holder readable trail (admin RBAC tightens further with roles). */
export const list = query({
  args: { sessionToken: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const all = await ctx.db.query("auditLog").order("desc").take(Math.min(args.limit ?? 50, 200));
    return all.filter((a) => a.actorId === user.userId);
  },
});
