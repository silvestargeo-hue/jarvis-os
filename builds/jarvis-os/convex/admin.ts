import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/auth";

/**
 * Admin control plane — every function requires the admin role server-side.
 * Covers: user directory, role management, session revocation, audit trail,
 * and platform-wide stats. The UI lives at /dashboard/admin.
 */

/** Full user directory (admin-only). Includes PIN state + activity stamps. */
export const listUsers = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.sessionToken);
    const users = await ctx.db.query("users").order("desc").take(500);
    return users.map((u) => ({
      _id: u._id,
      email: u.email,
      displayName: u.displayName,
      role: u.role,
      hasPin: Boolean(u.pinHash),
      createdAt: u.createdAt,
      lastSeenAt: u.lastSeenAt ?? null,
      prefersLocalAI: u.prefersLocalAI ?? null,
      dormant: u.dormant ?? false,
    }));
  },
});

/** Change a user's role (admin-only, audited). Admins cannot demote themselves. */
export const setUserRole = mutation({
  args: {
    sessionToken: v.string(),
    userId: v.id("users"),
    role: v.union(v.literal("admin"), v.literal("member"), v.literal("guest")),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.sessionToken);
    if (args.userId === admin.userId && args.role !== "admin") {
      throw new Error("you cannot demote your own admin account");
    }
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("user not found");
    await ctx.db.patch(args.userId, { role: args.role });
    await ctx.db.insert("auditLog", {
      actorId: admin.userId as any,
      action: "user.roleChange",
      targetType: "users",
      targetId: args.userId,
      metadata: { to: args.role, email: target.email },
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});

/** Delete a user account entirely (admin-only, audited). Cascades data. */
export const deleteUser = mutation({
  args: { sessionToken: v.string(), userId: v.id("users") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.sessionToken);
    if (args.userId === admin.userId) throw new Error("you cannot delete your own account");
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("user not found");

    // Cascade: sessions, devices, documents (+chunks+blobs), AI sessions/messages.
    for (const s of await ctx.db.query("sessions").withIndex("by_user", (q: any) => q.eq("userId", args.userId)).collect()) {
      await ctx.db.delete(s._id);
    }
    for (const d of await ctx.db.query("devices").withIndex("by_user", (q: any) => q.eq("userId", args.userId)).collect()) {
      await ctx.db.delete(d._id);
    }
    for (const doc of await ctx.db.query("documents").withIndex("by_owner", (q: any) => q.eq("ownerId", args.userId)).collect()) {
      for (const c of await ctx.db.query("documentChunks").withIndex("by_document", (q: any) => q.eq("documentId", doc._id)).collect()) {
        await ctx.db.delete(c._id);
      }
      if (doc.storageId) {
        try { await ctx.storage.delete(doc.storageId); } catch { /* gone */ }
      }
      await ctx.db.delete(doc._id);
    }
    for (const sess of await ctx.db.query("aiSessions").withIndex("by_user", (q: any) => q.eq("userId", args.userId)).collect()) {
      for (const m of await ctx.db.query("aiMessages").withIndex("by_session", (q: any) => q.eq("sessionId", sess._id)).collect()) {
        await ctx.db.delete(m._id);
      }
      await ctx.db.delete(sess._id);
    }
    await ctx.db.delete(args.userId);
    await ctx.db.insert("auditLog", {
      actorId: admin.userId as any,
      action: "user.delete",
      targetType: "users",
      targetId: args.userId,
      metadata: { email: target.email },
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});

/** Active sessions with user emails (admin-only). */
export const listSessions = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.sessionToken);
    const sessions = await ctx.db.query("sessions").order("desc").take(300);
    const out = [];
    for (const s of sessions) {
      const u = await ctx.db.get(s.userId);
      out.push({
        _id: s._id,
        email: u?.email ?? "unknown",
        role: s.role,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        lastUsedAt: s.lastUsedAt ?? null,
        expired: Date.now() > s.expiresAt,
      });
    }
    return out;
  },
});

/** Revoke one session (kick a device). */
export const revokeSession = mutation({
  args: { sessionToken: v.string(), sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.sessionToken);
    await ctx.db.delete(args.sessionId);
    await ctx.db.insert("auditLog", {
      actorId: admin.userId as any,
      action: "session.revoke",
      targetType: "sessions",
      targetId: args.sessionId,
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});

/** Kick every session of one user (admin-only, audited). */
export const revokeUserSessions = mutation({
  args: { sessionToken: v.string(), userId: v.id("users") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.sessionToken);
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
      .collect();
    for (const s of sessions) await ctx.db.delete(s._id);
    await ctx.db.insert("auditLog", {
      actorId: admin.userId as any,
      action: "session.revokeAll",
      targetType: "users",
      targetId: args.userId,
      metadata: { count: sessions.length },
      createdAt: Date.now(),
    });
    return { ok: true, revoked: sessions.length };
  },
});

/** Recent audit trail (admin-only) — logins, PIN events, role changes, etc. */
export const recentAudit = query({
  args: { sessionToken: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.sessionToken);
    const rows = await ctx.db.query("auditLog").order("desc").take(Math.min(args.limit ?? 100, 300));
    const out = [];
    for (const r of rows) {
      const actor = await ctx.db.get(r.actorId);
      out.push({
        _id: r._id,
        actorEmail: actor?.email ?? "unknown",
        action: r.action,
        targetType: r.targetType ?? null,
        targetId: r.targetId ?? null,
        metadata: r.metadata ?? null,
        createdAt: r.createdAt,
      });
    }
    return out;
  },
});

/** Admin: reactivate or re-dormant any account. */
/** Full library oversight — every document in ARCHIVE + all VAULTs. */
export const oversight = query({
  args: { sessionToken: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.sessionToken);
    const all = await ctx.db.query("documents").collect();
    const sorted = all.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).slice(0, args.limit ?? 200);
    return Promise.all(
      sorted.map(async (d) => {
        const owner = await ctx.db.get(d.ownerId);
        return {
          _id: d._id,
          title: d.title,
          visibility: d.visibility ?? "private",
          sizeBytes: d.sizeBytes,
          status: d.status,
          mimeType: d.mimeType,
          ownerId: d.ownerId,
          ownerEmail: owner?.email ?? null,
          trashed: (d as any).trashed ?? false,
          createdAt: d.createdAt ?? 0,
        };
      })
    );
  },
});

export const setDormant = mutation({
  args: {
    sessionToken: v.string(),
    userId: v.id("users"),
    dormant: v.boolean(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.sessionToken);
    if (args.userId === admin.userId && args.dormant) {
      throw new Error("you cannot dormant your own admin account");
    }
    await ctx.db.patch(args.userId, {
      dormant: args.dormant,
      dormantAt: args.dormant ? Date.now() : undefined,
    });
    if (args.dormant) {
      const sessions = await ctx.db
        .query("sessions")
        .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
        .collect();
      for (const s of sessions) await ctx.db.delete(s._id);
    }
    await ctx.db.insert("auditLog", {
      actorId: admin.userId as any,
      action: args.dormant ? "user.dormant" : "user.reactivate",
      targetType: "users",
      targetId: args.userId,
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});

/** Platform-wide stats (admin-only): users, docs, storage, messages. */
export const systemStats = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.sessionToken);
    const [users, docs, sessions, aiSessions, chatRooms] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("documents").collect(),
      ctx.db.query("sessions").collect(),
      ctx.db.query("aiSessions").collect(),
      ctx.db.query("chatRooms").collect(),
    ]);
    const totalBytes = docs.reduce((sum, d) => sum + (d.sizeBytes ?? 0), 0);
    return {
      users: users.length,
      admins: users.filter((u) => u.role === "admin").length,
      guests: users.filter((u) => u.role === "guest").length,
      dormant: users.filter((u) => u.dormant).length,
      documents: docs.length,
      storageBytes: totalBytes,
      trashedDocs: docs.filter((d) => (d as any).trashed).length,
      centralDocs: docs.filter((d) => (d.visibility ?? "private") === "central").length,
      centralBytes: docs
        .filter((d) => (d.visibility ?? "private") === "central")
        .reduce((sum, d) => sum + (d.sizeBytes ?? 0), 0),
      vaultDocs: docs.filter((d) => (d.visibility ?? "private") === "private").length,
      failedDocs: docs.filter((d) => d.status === "failed").length,
      activeSessions: sessions.filter((s) => Date.now() < s.expiresAt).length,
      aiSessions: aiSessions.length,
      chatRooms: chatRooms.length,
    };
  },
});

// ─────────────────────────────────────────────────────────────────
// ARCHIVE CURATION — publish/unpublish/curate + audited destroy
// Admins manage ARCHIVE visibility; private vault CONTENT stays blind to them.
// ─────────────────────────────────────────────────────────────────

/**
 * Admin visibility control on any document. Publishing only flips the
 * visibility flag — it never exposes private content to the admin (who
 * still cannot read vault docs; that rule is enforced in documents.ts).
 * Audited with the previous visibility for the audit trail.
 */
export const setDocVisibility = mutation({
  args: {
    sessionToken: v.string(),
    documentId: v.id("documents"),
    visibility: v.union(v.literal("central"), v.literal("private")),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.sessionToken);
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("document not found");
    const before = doc.visibility ?? "private";
    await ctx.db.patch(args.documentId, { visibility: args.visibility, updatedAt: Date.now() });
    await ctx.db.insert("auditLog", {
      actorId: admin.userId as any,
      action: args.visibility === "central" ? "archive.publish" : "archive.unpublish",
      targetType: "documents",
      targetId: args.documentId,
      metadata: { title: doc.title, from: before, to: args.visibility },
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});

/**
 * Per-user usage analytics (admin-only): document counts + storage bytes by
 * owner, plus a recent-activity sparkline (docs created per day, last 14d).
 * Pure metadata — never touches document content.
 */
export const usageByUser = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.sessionToken);
    const docs = await ctx.db.query("documents").collect();
    const users = await ctx.db.query("users").collect();

    const byOwner = new Map<string, { docs: number; bytes: number; central: number }>();
    for (const d of docs) {
      const entry = byOwner.get(d.ownerId) ?? { docs: 0, bytes: 0, central: 0 };
      entry.docs++;
      entry.bytes += d.sizeBytes ?? 0;
      if ((d.visibility ?? "private") === "central") entry.central++;
      byOwner.set(d.ownerId, entry);
    }

    const DAY = 86_400_000;
    const today = Math.floor(Date.now() / DAY) * DAY;
    const activity: Array<{ dayStart: number; count: number }> = [];
    for (let i = 13; i >= 0; i--) {
      const dayStart = today - i * DAY;
      activity.push({
        dayStart,
        count: docs.filter((d) => d.createdAt >= dayStart && d.createdAt < dayStart + DAY).length,
      });
    }

    const usersById = new Map<string, any>(users.map((u) => [u._id as string, u]));
    const rows = Array.from(byOwner.entries())
      .map(([ownerId, s]) => ({
        ownerId,
        email: usersById.get(ownerId as string)?.email ?? "(deleted user)",
        displayName: usersById.get(ownerId as string)?.displayName ?? "—",
        ...s,
      }))
      .sort((a, b) => b.bytes - a.bytes);

    return { rows, activity, totals: { docs: docs.length, bytes: docs.reduce((s, d) => s + (d.sizeBytes ?? 0), 0) } };
  },
});

/**
 * Admin: force-destroy any document (chunks + blobs + row), e.g. a DMCA or
 * malware report on an ARCHIVE item. Owner delete stays in documents.remove.
 * Audited with title + owner for traceability.
 */
export const adminDestroyDoc = mutation({
  args: { sessionToken: v.string(), documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx, args.sessionToken);
    const doc = await ctx.db.get(args.documentId);
    if (!doc) return { ok: true, deleted: false };
    const chunks = await ctx.db
      .query("documentChunks")
      .withIndex("by_document", (q: any) => q.eq("documentId", args.documentId))
      .collect();
    for (const c of chunks) await ctx.db.delete(c._id);
    if (doc.storageId) {
      try { await ctx.storage.delete(doc.storageId); } catch { /* gone */ }
    }
    for (const pid of doc.storageIds ?? []) {
      try { await ctx.storage.delete(pid); } catch { /* gone */ }
    }
    await ctx.db.delete(args.documentId);
    await ctx.db.insert("auditLog", {
      actorId: admin.userId as any,
      action: "archive.destroy",
      targetType: "documents",
      targetId: args.documentId,
      metadata: { title: doc.title, ownerId: doc.ownerId, chunksRemoved: chunks.length },
      createdAt: Date.now(),
    });
    return { ok: true, deleted: true, chunksRemoved: chunks.length };
  },
});
