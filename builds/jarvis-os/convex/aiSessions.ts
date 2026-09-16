import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";

/**
 * AI sessions — every conversation with the Jarvis terminal.
 * All functions session-gated; sessions are strictly per-user.
 */

/** Create a session (idempotent on clientSessionId via per-user scan). */
export const create = mutation({
  args: {
    sessionToken: v.string(),
    clientSessionId: v.string(),
    title: v.optional(v.string()),
    mode: v.union(v.literal("cloud"), v.literal("offline")),
    model: v.optional(v.string()),
    documentIds: v.optional(v.array(v.id("documents"))),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);

    const mine = await ctx.db
      .query("aiSessions")
      .withIndex("by_user", (q: any) => q.eq("userId", user.userId))
      .collect();
    const existing = mine.find((s) => s.clientSessionId === args.clientSessionId);
    if (existing) return { aiSessionId: existing._id };

    const id = await ctx.db.insert("aiSessions", {
      userId: user.userId as any,
      clientSessionId: args.clientSessionId,
      title: args.title ?? "New session",
      mode: args.mode,
      model: args.model,
      documentIds: args.documentIds,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      archived: false,
    });
    return { aiSessionId: id };
  },
});

/** The caller's sessions, newest-first. */
export const list = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const all = await ctx.db
      .query("aiSessions")
      .withIndex("by_user", (q: any) => q.eq("userId", user.userId))
      .collect();
    return all
      .filter((s) => !s.archived)
      .sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt))
      .slice(0, 100);
  },
});

/** Update title / mode / grounding docs / token accounting (owner-only). */
export const update = mutation({
  args: {
    sessionToken: v.string(),
    aiSessionId: v.id("aiSessions"),
    title: v.optional(v.string()),
    mode: v.optional(v.union(v.literal("cloud"), v.literal("offline"))),
    model: v.optional(v.string()),
    documentIds: v.optional(v.array(v.id("documents"))),
    addPromptTokens: v.optional(v.number()),
    addCompletionTokens: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const s = await ctx.db.get(args.aiSessionId);
    if (!s) throw new Error("ai session not found");
    if (s.userId !== user.userId) throw new Error("forbidden: not owner");

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = args.title;
    if (args.mode !== undefined) patch.mode = args.mode;
    if (args.model !== undefined) patch.model = args.model;
    if (args.documentIds !== undefined) patch.documentIds = args.documentIds;
    if (args.addPromptTokens)
      patch.totalPromptTokens = (s.totalPromptTokens ?? 0) + args.addPromptTokens;
    if (args.addCompletionTokens)
      patch.totalCompletionTokens = (s.totalCompletionTokens ?? 0) + args.addCompletionTokens;
    await ctx.db.patch(args.aiSessionId, patch);
    return { ok: true };
  },
});

/** Soft-archive (owner-only). */
export const archive = mutation({
  args: { sessionToken: v.string(), aiSessionId: v.id("aiSessions") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const s = await ctx.db.get(args.aiSessionId);
    if (!s) throw new Error("ai session not found");
    if (s.userId !== user.userId) throw new Error("forbidden: not owner");
    await ctx.db.patch(args.aiSessionId, { archived: true, updatedAt: Date.now() });
    return { ok: true };
  },
});
