import { v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { api } from "./_generated/api";
import { requireUser, requireUserInAction } from "./lib/auth";

/**
 * Document metadata upsert — used by the library upload pipeline (sync op).
 * Deduped by checksum; owner enforced from the session (never trusted from args).
 *
 * visibility: "central" (admin-curated CENTRAL ARCHIVE — admin-only upload,
 * everyone reads) or "private" (the user's PRIVATE VAULT — owner-only).
 */
export const upsertMeta = mutation({
  args: {
    sessionToken: v.string(),
    title: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
    checksum: v.string(),
    visibility: v.optional(v.union(v.literal("central"), v.literal("private"))),
    clientOpId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, sessionTokenCheck(args));
    const visibility = args.visibility ?? "private";
    if (visibility === "central" && user.role !== "admin") {
      throw new Error("forbidden: only admins publish to the CENTRAL ARCHIVE");
    }

    const existing = await ctx.db
      .query("documents")
      .filter((q: any) => q.eq(q.field("checksum"), args.checksum))
      .first();
    if (existing) {
      if (existing.ownerId !== user.userId) throw new Error("forbidden: not owner");
      await ctx.db.patch(existing._id, { updatedAt: Date.now(), visibility });
      return { clientOpId: args.clientOpId, documentId: existing._id };
    }

    const id = await ctx.db.insert("documents", {
      title: args.title,
      ownerId: user.userId as any,
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
      checksum: args.checksum,
      visibility,
      status: "processing",
      createdAt: Date.now(),
    });
    return { clientOpId: args.clientOpId, documentId: id };
  },
});

function sessionTokenCheck(args: { sessionToken: string }): string {
  return args.sessionToken;
}

/**
 * Canonical Convex browser upload: client POSTs the raw file to the returned
 * URL and receives a storageId (no server-side file handling needed).
 */
export const createUploadUrl = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx, args.sessionToken);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Library listing scoped by visibility:
 *   CENTRAL ARCHIVE — admin-published documents, readable by everyone.
 *   PRIVATE VAULT   — the session user's own documents only.
 * Admins additionally see their own uploads inline (they own them).
 */
export const list = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const all = await ctx.db.query("documents").order("desc").take(2000);
    return all.filter(
      (d) => d.ownerId === user.userId || (d.visibility ?? "private") === "central"
    );
  },
});

/** Shared access rule: owner, admin (except vault content), or central doc. */
function canRead(
  doc: { ownerId: string; visibility?: string },
  user: { userId: string; role: string }
): boolean {
  if (doc.ownerId === user.userId) return true;
  if ((doc.visibility ?? "private") === "central") return true;
  // Admins oversee metadata but NEVER read private vault content.
  return false;
}

/** Set pipeline status after processing/failure (owner-only). */
export const setStatus = mutation({
  args: {
    sessionToken: v.string(),
    documentId: v.id("documents"),
    status: v.union(
      v.literal("uploading"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("failed")
    ),
    error: v.optional(v.string()),
    pageCount: v.optional(v.number()),
    chunkCount: v.optional(v.number()),
    storageId: v.optional(v.id("_storage")),
    storageIds: v.optional(v.array(v.id("_storage"))),
    partSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("document not found");
    if (doc.ownerId !== user.userId) throw new Error("forbidden: not owner");
    const { sessionToken, documentId, ...patch } = args;
    await ctx.db.patch(documentId, { ...patch, updatedAt: Date.now() });
    return { ok: true };
  },
});

/**
 * Large-file chunked upload: after each part POST, register its storageId on
 * the document. Owner-only (admins own their central uploads).
 */
export const addStoragePart = mutation({
  args: {
    sessionToken: v.string(),
    documentId: v.id("documents"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("document not found");
    if (doc.ownerId !== user.userId) throw new Error("forbidden: not owner");
    const parts = [...(doc.storageIds ?? []), args.storageId];
    await ctx.db.patch(args.documentId, { storageIds: parts, updatedAt: Date.now() });
    return { ok: true, parts: parts.length };
  },
});

/** Store one embedded chunk (idempotent per document+ordinal, owner-only). */
export const insertChunk = mutation({
  args: {
    sessionToken: v.string(),
    documentId: v.id("documents"),
    ordinal: v.number(),
    text: v.string(),
    embedding: v.array(v.number()),
    embeddingModel: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("document not found");
    if (doc.ownerId !== user.userId) throw new Error("forbidden: not owner");

    const existing = await ctx.db
      .query("documentChunks")
      .withIndex("by_document", (q: any) => q.eq("documentId", args.documentId))
      .collect();
    const dup = existing.find((c) => c.ordinal === args.ordinal);
    if (dup) {
      await ctx.db.patch(dup._id, { text: args.text, embedding: args.embedding });
      return { chunkId: dup._id };
    }
    const chunkId = await ctx.db.insert("documentChunks", {
      documentId: args.documentId,
      ordinal: args.ordinal,
      text: args.text,
      embedding: args.embedding,
      embeddingModel: args.embeddingModel,
    });
    return { chunkId };
  },
});

/** Reset chunks before re-processing a document (owner-only). */
export const clearChunks = mutation({
  args: { sessionToken: v.string(), documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("document not found");
    if (doc.ownerId !== user.userId) throw new Error("forbidden: not owner");
    const chunks = await ctx.db
      .query("documentChunks")
      .withIndex("by_document", (q: any) => q.eq("documentId", args.documentId))
      .collect();
    for (const c of chunks) await ctx.db.delete(c._id);
    return { ok: true };
  },
});

/**
 * Real deletion: owner-only. Removes the row, all embedded chunks, and the
 * stored file blob. Convex storage deletion is best-effort (already-gone is ok).
 */
export const remove = mutation({
  args: { sessionToken: v.string(), documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const doc = await ctx.db.get(args.documentId);
    if (!doc) return { ok: true, deleted: false };
    // Owner deletes their own; admins may also manage (curate) the archive.
    if (doc.ownerId !== user.userId && user.role !== "admin") {
      throw new Error("forbidden: not owner");
    }

    const chunks = await ctx.db
      .query("documentChunks")
      .withIndex("by_document", (q: any) => q.eq("documentId", args.documentId))
      .collect();
    for (const c of chunks) await ctx.db.delete(c._id);

    if (doc.storageId) {
      try {
        await ctx.storage.delete(doc.storageId);
      } catch {
        /* blob already gone */
      }
    }
    for (const pid of doc.storageIds ?? []) {
      try {
        await ctx.storage.delete(pid);
      } catch {
        /* blob already gone */
      }
    }
    await ctx.db.delete(args.documentId);
    return { ok: true, deleted: true, chunksRemoved: chunks.length };
  },
});

/**
 * Semantic search over the 384-dim vector index.
 * NOTE: ctx.vectorSearch is only available in ACTIONS (non-deterministic),
 * so this is an action — call it via useAction or POST /api/action.
 */
export const search = action({
  args: {
    sessionToken: v.string(),
    embedding: v.array(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUserInAction(ctx, args.sessionToken);
    const requested = Math.min(args.limit ?? 8, 25);
    // Fetch extra so we can filter to the caller's own documents, then trim.
    const hits = await (ctx as any).vectorSearch("documentChunks", "by_embedding", {
      vector: args.embedding,
      limit: requested * 3,
    });
    const ids = hits.map((h: any) => h._id);
    const ownership = (await ctx.runQuery(api.documents.chunkOwnership, {
      sessionToken: args.sessionToken,
      ids,
    })) as Array<{ chunkId: string; ownerId: string; visible: boolean }>;
    const visible = new Set(
      ownership.filter((o) => o.visible).map((o) => o.chunkId)
    );
    return hits.filter((h: any) => visible.has(h._id)).slice(0, requested);
  },
});

/** Ownership + visibility lookup for vector-search hits (from the search action). */
export const chunkOwnership = query({
  args: { sessionToken: v.string(), ids: v.array(v.id("documentChunks")) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const out: Array<{ chunkId: string; documentId: string; ownerId: string; visible: boolean }> = [];
    for (const id of args.ids.slice(0, 75)) {
      const chunk = await ctx.db.get(id);
      if (!chunk) continue;
      const doc = await ctx.db.get(chunk.documentId);
      if (!doc) continue;
      out.push({
        chunkId: chunk._id,
        documentId: chunk.documentId,
        ownerId: doc.ownerId,
        visible: doc.ownerId === user.userId || (doc.visibility ?? "private") === "central",
      });
    }
    return out;
  },
});

/** Chunk text + parent doc for a set of search result chunk ids. */
export const chunksById = query({
  args: { sessionToken: v.string(), ids: v.array(v.id("documentChunks")) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const out = [];
    for (const id of args.ids.slice(0, 25)) {
      const chunk = await ctx.db.get(id);
      if (!chunk) continue;
      const doc = await ctx.db.get(chunk.documentId);
      if (!doc) continue;
      // Vault docs: owner-only. Central docs: everyone. Admin ≠ vault access.
      if (doc.ownerId !== user.userId && (doc.visibility ?? "private") !== "central") continue;
      out.push({
        chunkId: chunk._id,
        ordinal: chunk.ordinal,
        text: chunk.text,
        documentId: chunk.documentId,
        documentTitle: doc?.title ?? "unknown",
        documentStorageId: doc?.storageId ?? null,
        documentTags: ((doc as any).tags ?? []) as string[],
        visibility: (doc.visibility ?? "private") as "central" | "private",
      });
    }
    return out;
  },
});

/** Temporary URL for viewing/exporting a stored file part (access-checked). */
export const storageUrl = query({
  args: { sessionToken: v.string(), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    // Find the doc that references this blob to enforce the access rule.
    const docs = await ctx.db.query("documents").take(2000);
    const doc = docs.find(
      (d) => d.storageId === args.storageId || (d.storageIds ?? []).includes(args.storageId)
    );
    if (!doc) return null;
    if (doc.ownerId !== user.userId && (doc.visibility ?? "private") !== "central") {
      throw new Error("forbidden: private vault document");
    }
    return await ctx.storage.getUrl(args.storageId);
  },
});

/**
 * Reassemble the full extracted text of a document from its chunks
 * (ordinal order) — powers "download as text/markdown" from the library.
 */
export const fullText = query({
  args: { sessionToken: v.string(), documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const doc = await ctx.db.get(args.documentId);
    if (!doc) throw new Error("document not found");
    if (doc.ownerId !== user.userId && (doc.visibility ?? "private") !== "central") {
      throw new Error("forbidden: private vault document");
    }
    const chunks = await ctx.db
      .query("documentChunks")
      .withIndex("by_document", (q: any) => q.eq("documentId", args.documentId))
      .collect();
    chunks.sort((a, b) => a.ordinal - b.ordinal);
    return {
      title: doc.title,
      mimeType: doc.mimeType,
      chunkCount: chunks.length,
      text: chunks.map((c) => c.text).join("\n\n"),
    };
  },
});

/** Library stats for the session user, split by scope. */
export const stats = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const all = await ctx.db.query("documents").order("desc").take(2000);
    const central = all.filter((d) => (d.visibility ?? "private") === "central");
    const vault = all.filter((d) => d.ownerId === user.userId);
    const bytes = (rows: typeof all) => rows.reduce((sum, d) => sum + (d.sizeBytes ?? 0), 0);
    return {
      centralDocs: central.length,
      centralBytes: bytes(central),
      vaultDocs: vault.length,
      vaultBytes: bytes(vault),
      totalBytes: bytes(all),
      totalChunks: all.reduce((sum, d) => sum + (d.chunkCount ?? 0), 0),
    };
  },
});

/** ADMIN OVERSIGHT: platform-wide library view — metadata only, no content. */
export const adminOverview = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    if (user.role !== "admin") throw new Error("forbidden: admin role required");
    const all = await ctx.db.query("documents").order("desc").take(2000);
    return all.map((d) => ({
      _id: d._id,
      title: d.title,
      visibility: (d.visibility ?? "private") as "central" | "private",
      sizeBytes: d.sizeBytes,
      status: d.status,
      chunkCount: d.chunkCount ?? 0,
      createdAt: d.createdAt,
      ownerEmail: null as string | null, // hydrated client-side by ownership
      ownerId: d.ownerId,
    }));
  },
});

// ─────────────────────────────────────────────────────────────────
// LIBRARY ORGANIZATION — tags · folders · favorites · trash · bulk ops
// ─────────────────────────────────────────────────────────────────

/** Normalize a tag list: lowercase, trim, strip "#", dedupe, cap at 12. */
function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const t of raw) {
    if (typeof t !== "string") continue;
    const tag = t.trim().replace(/^#/, "").toLowerCase().slice(0, 32);
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length >= 12) break;
  }
  return out;
}

/** Owner-only guard that also blocks touching admin-published central docs. */
async function ownDocForOrganization(
  ctx: any,
  userId: string,
  documentId: string
): Promise<any> {
  const doc = await ctx.db.get(documentId);
  if (!doc) throw new Error("document not found");
  if (doc.ownerId !== userId) throw new Error("forbidden: not owner");
  return doc;
}

/**
 * Set / update tags + folder on a document (owner-only).
 * Central-archive docs keep their tags but only their owner may edit them.
 */
export const setTags = mutation({
  args: {
    sessionToken: v.string(),
    documentId: v.id("documents"),
    tags: v.array(v.string()),
    folder: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    await ownDocForOrganization(ctx, user.userId, args.documentId);
    const tags = normalizeTags(args.tags);
    await ctx.db.patch(args.documentId, {
      tags,
      ...(args.folder !== undefined ? { folder: args.folder ?? undefined } : {}),
      updatedAt: Date.now(),
    });
    return { ok: true, tags };
  },
});

/** Toggle the favorite (star) flag — owner-only. */
export const toggleFavorite = mutation({
  args: { sessionToken: v.string(), documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const doc = await ownDocForOrganization(ctx, user.userId, args.documentId);
    const favorite = !doc.favorite;
    await ctx.db.patch(args.documentId, { favorite, updatedAt: Date.now() });
    return { ok: true, favorite };
  },
});

/** Soft-delete to trash — owner-only. Hidden from default views, restorable. */
export const trashDocument = mutation({
  args: { sessionToken: v.string(), documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    await ownDocForOrganization(ctx, user.userId, args.documentId);
    await ctx.db.patch(args.documentId, {
      trashed: true,
      trashedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

/** Restore from trash — owner-only. */
export const restoreDocument = mutation({
  args: { sessionToken: v.string(), documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    await ownDocForOrganization(ctx, user.userId, args.documentId);
    await ctx.db.patch(args.documentId, {
      trashed: false,
      trashedAt: undefined,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

/**
 * BULK operations (owner-only, per doc): move to folder, add/remove tags,
 * star/unstar, trash, restore, or permanently delete.
 * Admins may additionally bulk-publish vault docs into the CENTRAL ARCHIVE
 * (visibility-only; they still cannot read private content).
 */
export const bulkOp = mutation({
  args: {
    sessionToken: v.string(),
    documentIds: v.array(v.id("documents")),
    op: v.union(
      v.literal("trash"),
      v.literal("restore"),
      v.literal("favorite"),
      v.literal("unfavorite"),
      v.literal("setFolder"),
      v.literal("addTags"),
      v.literal("removeTags"),
      v.literal("publish"),
      v.literal("unpublish"),
      v.literal("deleteForever")
    ),
    folder: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];

    for (const documentId of args.documentIds.slice(0, 200)) {
      try {
        const doc = await ctx.db.get(documentId);
        if (!doc) throw new Error("not found");
        const isOwner = doc.ownerId === user.userId;
        if (!isOwner && !(user.role === "admin" && (args.op === "publish" || args.op === "unpublish"))) {
          throw new Error("forbidden");
        }

        switch (args.op) {
          case "trash":
            await ctx.db.patch(documentId, { trashed: true, trashedAt: Date.now(), updatedAt: Date.now() });
            break;
          case "restore":
            await ctx.db.patch(documentId, { trashed: false, trashedAt: undefined, updatedAt: Date.now() });
            break;
          case "favorite":
            await ctx.db.patch(documentId, { favorite: true, updatedAt: Date.now() });
            break;
          case "unfavorite":
            await ctx.db.patch(documentId, { favorite: false, updatedAt: Date.now() });
            break;
          case "setFolder":
            await ctx.db.patch(documentId, { folder: args.folder ?? undefined, updatedAt: Date.now() });
            break;
          case "addTags": {
            const merged = normalizeTags([...(doc.tags ?? []), ...(args.tags ?? [])]);
            await ctx.db.patch(documentId, { tags: merged, updatedAt: Date.now() });
            break;
         }
          case "removeTags": {
            const remove = new Set(normalizeTags(args.tags ?? []));
            const kept = normalizeTags((doc.tags ?? []).filter((t: string) => !remove.has(t)));
            await ctx.db.patch(documentId, { tags: kept, updatedAt: Date.now() });
            break;
          }
          case "publish":
            await ctx.db.patch(documentId, { visibility: "central", updatedAt: Date.now() });
            break;
          case "unpublish":
            await ctx.db.patch(documentId, { visibility: "private", updatedAt: Date.now() });
            break;
          case "deleteForever": {
            const chunks = await ctx.db
              .query("documentChunks")
              .withIndex("by_document", (q: any) => q.eq("documentId", documentId))
              .collect();
            for (const c of chunks) await ctx.db.delete(c._id);
            if (doc.storageId) {
              try { await ctx.storage.delete(doc.storageId); } catch { /* gone */ }
            }
            for (const pid of doc.storageIds ?? []) {
              try { await ctx.storage.delete(pid); } catch { /* gone */ }
            }
            await ctx.db.delete(documentId);
            break;
          }
        }
        results.push({ id: documentId, ok: true });
      } catch (e) {
        results.push({ id: documentId, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return { results, okCount: results.filter((r) => r.ok).length };
  },
});

/** Distinct folder names across the caller's visible documents. */
export const listFolders = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const all = await ctx.db.query("documents").take(2000);
    const mine = all.filter(
      (d) => d.ownerId === user.userId || (d.visibility ?? "private") === "central"
    );
    const folders = new Set<string>();
    for (const d of mine) {
      const f = (d as any).folder as string | undefined;
      if (f) folders.add(f);
    }
    return Array.from(folders).sort();
  },
});

/** Distinct tag cloud across the caller's visible documents, with counts. */
export const tagCloud = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const all = await ctx.db.query("documents").take(2000);
    const mine = all.filter(
      (d) => d.ownerId === user.userId || (d.visibility ?? "private") === "central"
    );
    const counts = new Map<string, number>();
    for (const d of mine) {
      for (const t of (d as any).tags ?? []) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  },
});
