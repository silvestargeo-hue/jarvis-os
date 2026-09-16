"use client";

import { useMutation, useQuery } from "convex/react";
import {
  AlertTriangle,
  CheckSquare,
  Download,
  FileText,
  FileDown,
  FolderUp,
  HardDrive,
  Loader2,
  RotateCcw,
  Search,
  Square,
  Star,
  Tags,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { chunkText, embed, extractText } from "@/lib/rag/embeddings";
import { ConvexGate } from "@/components/ConvexGate";
import { confirm as confirmSound, error as errorSound } from "@/lib/os/sounds";
import { jsPDF } from "jspdf";

type Doc = {
  _id: string;
  title: string;
  status: string;
  pageCount?: number;
  chunkCount?: number;
  sizeBytes: number;
  mimeType: string;
  storageId?: string;
  storageIds?: string[];
  partSize?: number;
  visibility?: "central" | "private";
  ownerId?: string;
  error?: string;
  tags?: string[];
  folder?: string;
  favorite?: boolean;
  trashed?: boolean;
  trashedAt?: number;
};

type Stats = {
  centralDocs: number;
  centralBytes: number;
  vaultDocs: number;
  vaultBytes: number;
  totalBytes: number;
  totalChunks: number;
};

type SearchHit = {
  chunkId: string;
  text: string;
  ordinal: number;
  documentId: string;
  documentTitle: string;
  documentStorageId: string | null;
  _score: number;
};

type JobState = { name: string; phase: "waiting" | "extracting" | "uploading" | "embedding" | "done" | "failed"; detail?: string };

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function LibraryPage() {
  return (
    <ConvexGate module="DOCUMENT LIBRARY">
      <LibraryApp />
    </ConvexGate>
  );
}

const PART_SIZE = 8 * 1024 * 1024; // 8 MB parts — no total file size limit

function LibraryApp() {
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [tab, setTab] = useState<"central" | "vault">("vault");
  useEffect(() => {
    setSessionToken(localStorage.getItem("jarvis.sessionToken"));
    setRole(localStorage.getItem("jarvis.role"));
  }, []);
  const isAdmin = role === "admin";

  const docs = useQuery(
    api.documents.list,
    sessionToken ? { sessionToken } : "skip"
  ) as Doc[] | undefined;
  const stats = useQuery(
    api.documents.stats,
    sessionToken ? { sessionToken } : "skip"
  ) as Stats | undefined;
  const upsertMeta = useMutation(api.documents.upsertMeta);
  const setStatus = useMutation(api.documents.setStatus);
  const insertChunk = useMutation(api.documents.insertChunk);
  const clearChunks = useMutation(api.documents.clearChunks);
  const createUploadUrl = useMutation(api.documents.createUploadUrl);
  const addPart = useMutation(api.documents.addStoragePart);
  const removeDocument = useMutation(api.documents.remove);
  const setTags = useMutation(api.documents.setTags);
  const toggleFavorite = useMutation(api.documents.toggleFavorite);
  const trashDocument = useMutation(api.documents.trashDocument);
  const restoreDocument = useMutation(api.documents.restoreDocument);
  const bulkOp = useMutation(api.documents.bulkOp);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [jobs, setJobs] = useState<JobState[]>([]);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);

  // PWA share-target pickup: a file share queued at /share is announced to
  // the operator; real files should be dropped on the drop zone (or use the
  // upload buttons) — the share sheet hands off small payloads only.
  useEffect(() => {
    const queued = sessionStorage.getItem("jarvis.shareQueue");
    if (!queued) return;
    sessionStorage.removeItem("jarvis.shareQueue");
    if (queued.startsWith("files:")) {
      setNotice("⬇ Shared files handed off — drop them on the upload zone or pick a scope above to index");
    }
  }, []);
  const [notice, setNotice] = useState<string | null>(null);

  const CONCURRENCY = 3; // parallel pipeline workers

  // ── upload + processing pipeline ───────────────────────────────
  const processFile = useCallback(
    async (file: File, scope: "central" | "vault", updateJob: (patch: Partial<JobState>) => void): Promise<"ok" | "failed"> => {
      try {
        updateJob({ phase: "extracting", detail: "reading text" });

        // 0. ensure identity (session token gates every server call)
        const sessionToken = localStorage.getItem("jarvis.sessionToken");
        if (!sessionToken) throw new Error("No session — open /auth first");
        const userId = localStorage.getItem("jarvis.userId");
        if (!userId) throw new Error("No user id — open /auth first");

        // 1. extract text (no size limit — chunked upload for large files)
        const { pages, pageCount } = await extractText(file);
        const fullText = pages.join("\n\n");

        // 2. metadata row (deduped by checksum server-side)
        const checksum = await sha256Hex(await file.arrayBuffer());
        const meta = (await upsertMeta({
          sessionToken,
          title: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          checksum,
          visibility: scope === "central" ? "central" : "private",
        })) as { documentId: string };

        // 3. canonical binary storage — chunked for large files (600MB+ ok)
        updateJob({ phase: "uploading", detail: formatBytes(file.size) });
        if (file.size <= PART_SIZE) {
          const uploadUrl = await createUploadUrl({ sessionToken });
          const put = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": file.type || "application/octet-stream" },
            body: file,
          });
          const { storageId } = (await put.json()) as { storageId: string };
          await setStatus({ sessionToken, documentId: meta.documentId as Id<"documents">, status: "processing", storageId: storageId as Id<"_storage"> });
        } else {
          const parts: Id<"_storage">[] = [];
          const totalParts = Math.ceil(file.size / PART_SIZE);
          for (let offset = 0, part = 0; offset < file.size; offset += PART_SIZE, part++) {
            const slice = file.slice(offset, offset + PART_SIZE);
            const uploadUrl = await createUploadUrl({ sessionToken });
            const put = await fetch(uploadUrl, {
              method: "POST",
              headers: { "Content-Type": "application/octet-stream" },
              body: slice,
            });
            const { storageId } = (await put.json()) as { storageId: string };
            await addPart({ sessionToken, documentId: meta.documentId as Id<"documents">, storageId: storageId as Id<"_storage"> });
            parts.push(storageId as Id<"_storage">);
            updateJob({ phase: "uploading", detail: `part ${part + 1}/${totalParts}` });
          }
          await setStatus({ sessionToken, documentId: meta.documentId as Id<"documents">, status: "processing", storageIds: parts, partSize: PART_SIZE });
        }

        // 4. chunk + embed locally (keyless)
        await clearChunks({ sessionToken, documentId: meta.documentId as Id<"documents"> });
        const chunks = chunkText(fullText);
        let done = 0;
        for (const c of chunks) {
          const vector = await embed(c.text);
          await insertChunk({
            sessionToken,
            documentId: meta.documentId as Id<"documents">,
            ordinal: c.ordinal,
            text: c.text,
            embedding: vector,
            embeddingModel: "Xenova/all-MiniLM-L6-v2",
          });
          done++;
          updateJob({ phase: "embedding", detail: `${done}/${chunks.length}` });
        }

        await setStatus({
          sessionToken,
          documentId: meta.documentId as Id<"documents">,
          status: "ready",
          pageCount,
          chunkCount: chunks.length,
        });
        updateJob({ phase: "done", detail: `${chunks.length} chunks` });
        return "ok";
      } catch (e) {
        updateJob({ phase: "failed", detail: e instanceof Error ? e.message : String(e) });
        return "failed";
      }
    },
    [upsertMeta, setStatus, insertChunk, clearChunks, createUploadUrl]
  );

  const onFiles = useCallback(
    (files: File[], scope: "central" | "vault") => {
      if (!files.length) return;
      if (scope === "central" && !isAdmin) {
        setNotice("⚠ Only admins can publish to the CENTRAL ARCHIVE");
        return;
      }
      setNotice(null);
      const list = files.map((f) => ({ name: f.name, phase: "waiting" as const }));
      setJobs(list);

      void (async () => {
        let ok = 0;
        let failed = 0;
        let cursor = 0;
        const update = (name: string, patch: Partial<JobState>) =>
          setJobs((prev) => prev.map((j) => (j.name === name ? { ...j, ...patch } : j)));

        async function worker() {
          for (;;) {
            const i = cursor++;
            if (i >= files.length) return;
            const f = files[i];
            const result = await processFile(f, scope, (patch) => update(f.name, patch));
            if (result === "ok") confirmSound();
            if (result === "ok") ok++;
            else failed++;
          }
        }
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));

        setNotice(
          `✅ Indexed ${ok} document${ok === 1 ? "" : "s"} into ${scope === "central" ? "CENTRAL ARCHIVE" : "PRIVATE VAULT"}${failed ? ` · ${failed} failed` : ""} — corpus is searchable`
        );
        if (failed > 0) errorSound();
        setTimeout(() => setJobs([]), 4000);
      })();
    },
    [processFile, isAdmin]
  );

  // ── drag & drop (files AND folders) ─────────────────────────────
  useEffect(() => {
    const zone = dropZoneRef.current;
    if (!zone) return;
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      setDragOver(true);
    };
    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      if (!zone.contains(e.relatedTarget as Node)) setDragOver(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const items = Array.from(e.dataTransfer?.items ?? []);
      const collected: File[] = [];
      let pending = items.length;
      const scope: "central" | "vault" = tab === "central" && isAdmin ? "central" : "vault";
      if (pending === 0) {
        // Plain file drop fallback.
        collected.push(...Array.from(e.dataTransfer?.files ?? []));
        onFiles(collected, scope);
        return;
      }
      items.forEach((item) => {
        const entry = (item as any).webkitGetAsEntry?.() as any;
        if (entry?.isDirectory) {
          walkDirectory(entry, collected, () => {
            if (--pending === 0) onFiles(collected, scope);
          });
        } else {
          const f = item.getAsFile();
          if (f) collected.push(f);
          if (--pending === 0) onFiles(collected, scope);
        }
      });
    };
    zone.addEventListener("dragover", onDragOver);
    zone.addEventListener("dragleave", onDragLeave);
    zone.addEventListener("drop", onDrop);
    return () => {
      zone.removeEventListener("dragover", onDragOver);
      zone.removeEventListener("dragleave", onDragLeave);
      zone.removeEventListener("drop", onDrop);
    };
  }, [onFiles, tab, isAdmin]);

  // ── semantic search ───────────────────────────────────────────────
  const doSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    setNotice(null);
    try {
      const vector = await embed(query);
      // search is an ACTION (vectorSearch is action-only) → /api/action
      const token = localStorage.getItem("jarvis.sessionToken");
      if (!token) throw new Error("No session");
      const res = await fetch(process.env.NEXT_PUBLIC_CONVEX_URL! + "/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: "documents:search",
          args: { sessionToken: token, embedding: vector, limit: 8 },
          format: "json",
        }),
      });
      const json = (await res.json()) as { status: string; value: Array<{ _id: string; _score: number }> };
      if (json.status !== "success") throw new Error("search failed");
      const ids = json.value.map((v) => v._id as Id<"documentChunks">);
      const scoreById = new Map(json.value.map((v) => [v._id, v._score]));

      // hydrate chunk+doc info (token already validated above)
      const res2 = await fetch(process.env.NEXT_PUBLIC_CONVEX_URL! + "/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "documents:chunksById", args: { sessionToken: token, ids }, format: "json" }),
      });
      const json2 = (await res2.json()) as { status: string; value: Array<Omit<SearchHit, "_score">> };
      if (json2.status !== "success") throw new Error("hydrate failed");

      setHits(
        json2.value.map((h) => ({ ...h, _score: scoreById.get(h.chunkId) ?? 0 }))
      );
    } catch (e) {
      setNotice(`⚠ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSearching(false);
    }
  }, [query]);

  // ── PDF viewing / downloading originals ───────────────────────────
  const getStorageUrl = useCallback(async (storageId: string): Promise<string | null> => {
    const token = localStorage.getItem("jarvis.sessionToken");
    if (!token) return null;
    const res = await fetch(process.env.NEXT_PUBLIC_CONVEX_URL! + "/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "documents:storageUrl",
        args: { sessionToken: token, storageId },
        format: "json",
      }),
    });
    const json = (await res.json()) as { status: string; value: string | null };
    return json.status === "success" ? json.value : null;
  }, []);

  const viewDoc = useCallback(
    async (doc: Doc) => {
      if (!doc.storageId) return;
      const url = await getStorageUrl(doc.storageId);
      if (url) window.open(url, "_blank");
    },
    [getStorageUrl]
  );

  const downloadOriginal = useCallback(
    async (doc: Doc) => {
      if (!doc.storageId) return;
      setNotice(`⇣ fetching ${doc.title}…`);
      try {
        const url = await getStorageUrl(doc.storageId);
        if (!url) throw new Error("no stored copy");
        const res = await fetch(url);
        const blob = await res.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = doc.title;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        setNotice(null);
      } catch (e) {
        setNotice(`⚠ download failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [getStorageUrl]
  );

  /** Reassemble a chunked (large) original from its stored parts. */
  const downloadChunked = useCallback(
    async (doc: Doc) => {
      const parts = doc.storageIds ?? [];
      if (!parts.length) return;
      setNotice(`⇣ reassembling ${doc.title} (${parts.length} parts)…`);
      try {
        const blobs: Blob[] = [];
        for (const pid of parts) {
          const url = await getStorageUrl(pid as string);
          if (!url) throw new Error("part URL unavailable");
          blobs.push(await (await fetch(url)).blob());
        }
        const blob = new Blob(blobs, { type: doc.mimeType || "application/octet-stream" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = doc.title;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        setNotice(null);
      } catch (e) {
        setNotice(`⚠ reassembly failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [getStorageUrl]
  );

  const downloadExtracted = useCallback(
    async (doc: Doc) => {
      const token = localStorage.getItem("jarvis.sessionToken");
      if (!token) return;
      setNotice(`⇣ reassembling text of ${doc.title}…`);
      try {
        const res = await fetch(process.env.NEXT_PUBLIC_CONVEX_URL! + "/api/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: "documents:fullText",
            args: { sessionToken: token, documentId: doc._id },
            format: "json",
          }),
        });
        const json = (await res.json()) as { status: string; value: { title: string; text: string } };
        if (json.status !== "success") throw new Error("export failed");
        const blob = new Blob([json.value.text], { type: "text/plain;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = doc.title.replace(/\.[^.]+$/, "") + ".txt";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        setNotice(null);
      } catch (e) {
        setNotice(`⚠ export failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    []
  );

  const exportSummary = useCallback(
    (docTitle: string, hitsToExport: SearchHit[]) => {
      const pdf = new jsPDF({ unit: "pt", format: "a4" });
      const margin = 48;
      const width = pdf.internal.pageSize.getWidth() - margin * 2;
      let y = margin;

      pdf.setFont("courier", "bold");
      pdf.setFontSize(14);
      pdf.text("JARVIS OS // RAG DOSSIER", margin, y);
      y += 22;
      pdf.setFontSize(10);
      pdf.text(`Query: ${query}`, margin, y);
      y += 16;
      pdf.text(`Generated: ${new Date().toISOString()}`, margin, y);
      y += 28;

      for (const hit of hitsToExport) {
        pdf.setFont("courier", "bold");
        pdf.setFontSize(9);
        const header = `${hit.documentTitle} · chunk #${hit.ordinal} · score ${hit._score.toFixed(3)}`;
        if (y > pdf.internal.pageSize.getHeight() - 100) {
          pdf.addPage();
          y = margin;
        }
        pdf.setTextColor(0, 100, 120);
        pdf.text(pdf.splitTextToSize(header, width), margin, y);
        y += 14;
        pdf.setFont("courier", "normal");
        pdf.setTextColor(30, 30, 30);
        const lines = pdf.splitTextToSize(hit.text, width) as string[];
        for (const line of lines) {
          if (y > pdf.internal.pageSize.getHeight() - margin) {
            pdf.addPage();
            y = margin;
          }
          pdf.text(line, margin, y);
          y += 12;
        }
        y += 10;
      }

      pdf.save(`jarvis-rag-${query.slice(0, 24).replace(/[^a-z0-9]/gi, "-") || "dossier"}.pdf`);
    },
    [query]
  );

  const deleteDoc = useCallback(
    async (doc: Doc) => {
      const token = localStorage.getItem("jarvis.sessionToken");
      if (!token) return;
      await removeDocument({ sessionToken: token, documentId: doc._id as Id<"documents"> });
    },
    [removeDocument]
  );

  // ── LIBRARY ORGANIZATION: selection · filters · bulk ops · trash ──
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | "starred" | "trash" | "tag" | "folder">("all");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [tagEditorId, setTagEditorId] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [bulkTagDraft, setBulkTagDraft] = useState("");
  const [bulkFolderDraft, setBulkFolderDraft] = useState("");

  const folders = useQuery(
    api.documents.listFolders,
    sessionToken ? { sessionToken } : "skip"
  ) as string[] | undefined;
  const tagCloudData = useQuery(
    api.documents.tagCloud,
    sessionToken ? { sessionToken } : "skip"
  ) as Array<{ tag: string; count: number }> | undefined;

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const visibleDocsRef = useRef<Doc[]>([]);

  const runBulk = useCallback(
    async (op: "trash" | "restore" | "favorite" | "unfavorite" | "addTags" | "removeTags" | "setFolder" | "deleteForever", extra?: { tags?: string[]; folder?: string }) => {
      const token = localStorage.getItem("jarvis.sessionToken");
      if (!token || selected.size === 0) return;
      if (op === "deleteForever" && !confirm(`Permanently delete ${selected.size} document(s)? This cannot be undone.`)) return;
      try {
        const res = (await bulkOp({
          sessionToken: token,
          documentIds: Array.from(selected) as Id<"documents">[],
          op,
          tags: extra?.tags,
          folder: extra?.folder,
        })) as { okCount: number };
        setNotice(`✅ ${op} applied to ${res.okCount} document(s)`);
        setSelected(new Set());
        setBulkTagDraft("");
        setBulkFolderDraft("");
      } catch (e) {
        setNotice(`⚠ ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [selected, bulkOp]
  );

  const saveTags = useCallback(
    async (doc: Doc) => {
      const token = localStorage.getItem("jarvis.sessionToken");
      if (!token) return;
      const tags = tagDraft.split(/[,;]/).map((t) => t.trim()).filter(Boolean);
      const folderRaw = doc.folder ?? "";
      try {
        await setTags({ sessionToken: token, documentId: doc._id as Id<"documents">, tags, folder: folderRaw || null });
        setTagEditorId(null);
        setTagDraft("");
      } catch (e) {
        setNotice(`⚠ ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [tagDraft, setTags]
  );

  const visibleDocs = (docs ?? [])
    .filter((d) => d.status !== "failed")
    .filter((d) => (tab === "central" ? (d.visibility ?? "private") === "central" : d.ownerId !== undefined && (d.visibility ?? "private") === "private"))
    .filter((d) => (filter === "trash" ? d.trashed === true : d.trashed !== true))
    .filter((d) => (filter === "starred" ? d.favorite === true : true))
    .filter((d) => (filter === "tag" && activeTag ? (d.tags ?? []).includes(activeTag) : true))
    .filter((d) => (filter === "folder" && activeFolder ? d.folder === activeFolder : true));
  visibleDocsRef.current = visibleDocs;

  const selectAllVisible = useCallback(() => {
    setSelected((prev) => (prev.size >= visibleDocsRef.current.length ? new Set() : new Set(visibleDocsRef.current.map((d) => d._id))));
  }, []);

  // ── KEYBOARD LAYER — arrow-key cursor + single-key action hotkeys ──
  // ←→↑↓ move the card cursor (grid: 1/2/3 columns); Enter opens the original;
  // s star · t tag editor · space select · Del trash/restore · Shift+Del destroy
  // A select-all · / focus search · ? toggle this help · Esc clear cursor/selection.
  // Disabled while typing in inputs or a tag editor is open.
  const [cursor, setCursor] = useState<number | null>(null);
  const [hotkeyHelp, setHotkeyHelp] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const actOnCursor = useCallback(
    async (action: "star" | "tag" | "select" | "trash" | "restore" | "destroy" | "open") => {
      if (cursor === null) return;
      const doc = visibleDocsRef.current[cursor];
      if (!doc) return;
      const token = localStorage.getItem("jarvis.sessionToken");
      if (!token) return;
      switch (action) {
        case "star":
          await toggleFavorite({ sessionToken: token, documentId: doc._id as Id<"documents"> });
          break;
        case "select":
          toggleSelect(doc._id);
          break;
        case "tag":
          setTagEditorId(tagEditorId === doc._id ? null : doc._id);
          setTagDraft((doc.tags ?? []).join(", "));
          break;
        case "trash":
          if (!doc.trashed) await trashDocument({ sessionToken: token, documentId: doc._id as Id<"documents"> });
          break;
        case "restore":
          if (doc.trashed) await restoreDocument({ sessionToken: token, documentId: doc._id as Id<"documents"> });
          break;
        case "destroy":
          if (confirm(`Permanently delete "${doc.title}"? This cannot be undone.`)) {
            await removeDocument({ sessionToken: token, documentId: doc._id as Id<"documents"> });
          }
          break;
        case "open":
          if (doc.storageId) void viewDoc(doc);
          break;
      }
    },
    [cursor, tagEditorId, toggleFavorite, trashDocument, restoreDocument, removeDocument, toggleSelect, viewDoc]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === "/" && (!t || (t.tagName !== "INPUT" && t.tagName !== "TEXTAREA"))) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (e.key === "?" && (!t || (t.tagName !== "INPUT" && t.tagName !== "TEXTAREA"))) {
        setHotkeyHelp((v) => !v);
        return;
      }
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (tagEditorId !== null) {
        if (e.key === "Escape") setTagEditorId(null);
        return; // typing a tag — don't hijack keys
      }
      const cols = window.innerWidth >= 1024 ? 3 : window.innerWidth >= 640 ? 2 : 1;
      const len = visibleDocsRef.current.length;
      if (!len) return;
      const move = (delta: number) => {
        e.preventDefault();
        setCursor((c) => {
          const base = c === null ? (delta > 0 ? -1 : 0) : c;
          return Math.max(0, Math.min(len - 1, base + delta));
        });
      };
      switch (e.key) {
        case "ArrowRight": move(1); break;
        case "ArrowLeft": move(-1); break;
        case "ArrowDown": move(cols); break;
        case "ArrowUp": move(-cols); break;
        case "Enter":
          e.preventDefault();
          void actOnCursor("open");
          break;
        case "s": case "S": void actOnCursor("star"); break;
        case "t": case "T": void actOnCursor("tag"); break;
        case " ": e.preventDefault(); void actOnCursor("select"); break;
        case "Delete":
          e.preventDefault();
          void actOnCursor(e.shiftKey ? "destroy" : "restore");
          break;
        case "Backspace": e.preventDefault(); void actOnCursor("trash"); break;
        case "a": case "A": if (e.ctrlKey || e.metaKey) { e.preventDefault(); selectAllVisible(); } break;
        case "Escape":
          setCursor(null);
          setSelected(new Set());
          setHotkeyHelp(false);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actOnCursor, tagEditorId, selectAllVisible]);

  // keep the cursor anchored when the visible list shrinks
  useEffect(() => {
    setCursor((c) => (c !== null && c >= visibleDocsRef.current.length ? null : c));
  }, [visibleDocs.length]);

  return (
    <main className="flex h-screen flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cyan-400/15 bg-slate-950/40 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="hud-btn !py-1 text-[10px]">◂ DECK</a>
          <p className="hud-label">LIBRARY // RAG CORE</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {stats && (
            <span className="hidden items-center gap-1 font-mono text-[10px] text-cyan-300/70 sm:flex" title="Unlimited storage — free backend">
              <HardDrive size={11} /> {formatBytes(stats.totalBytes)} · {stats.centralDocs + stats.vaultDocs} docs
            </span>
          )}
          {isAdmin && tab === "central" && (
            <button className="hud-btn !py-1 text-[10px] !text-amber-300" onClick={() => fileInputRef.current?.click()} title="Publish to the shared archive (all users can read)">
              <Upload size={11} /> PUBLISH TO ARCHIVE
            </button>
          )}
          {tab === "vault" && (
            <>
              <button className="hud-btn !py-1 text-[10px]" onClick={() => fileInputRef.current?.click()}>
                <Upload size={11} /> UPLOAD FILES
              </button>
              <button className="hud-btn !py-1 text-[10px]" onClick={() => folderInputRef.current?.click()} title="Upload an entire folder (subfolders included)">
                <FolderUp size={11} /> UPLOAD FOLDER
              </button>
            </>
          )}
        </div>
        {/* plain multi-file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            onFiles(Array.from(e.target.files ?? []), tab === "central" && isAdmin ? "central" : "vault");
            e.target.value = "";
          }}
        />
        {/* folder input — webkitdirectory picks up entire trees */}
        <input
          ref={folderInputRef}
          type="file"
          multiple
          // @ts-expect-error — non-standard but supported in Chromium/WebKit
          webkitdirectory="true"
          directory=""
          className="hidden"
          onChange={(e) => {
            onFiles(Array.from(e.target.files ?? []), tab === "central" && isAdmin ? "central" : "vault");
            e.target.value = "";
          }}
        />
      </div>

      {/* scope tabs + drop zone + search */}
      <div ref={dropZoneRef} className={`border-b border-cyan-400/15 p-4 transition ${dragOver ? "bg-cyan-400/10" : ""}`}>
        <div className="mb-3 flex items-center gap-2">
          <button
            onClick={() => setTab("vault")}
            className={`hud-btn !px-4 !py-1 text-[10px] ${tab === "vault" ? "!border-cyan-300 !text-cyan-200" : "!text-slate-400"}`}
          >
            🔒 PRIVATE VAULT{stats ? ` · ${stats.vaultDocs}` : ""}
          </button>
          <button
            onClick={() => setTab("central")}
            className={`hud-btn !px-4 !py-1 text-[10px] ${tab === "central" ? "!border-amber-300 !text-amber-200" : "!text-slate-400"}`}
          >
            🏛 CENTRAL ARCHIVE{stats ? ` · ${stats.centralDocs}` : ""}
          </button>
          <span className="ml-auto hidden font-mono text-[9px] text-slate-500 sm:block">
            {tab === "vault" ? "your documents — only you (and the AI, on your command)" : "admin-curated — everyone reads"}
          </span>
        </div>
        {dragOver && (
          <p className="mb-2 text-center font-mono text-[11px] text-cyan-200">
            ⬇ drop files or whole folders — I&apos;ll index everything into {tab === "central" ? "the ARCHIVE" : "your VAULT"}
          </p>
        )}
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-cyan-400/30 bg-slate-950/60 px-4 py-2 font-mono text-sm text-cyan-100 outline-none focus:ring-1 focus:ring-cyan-400/60"
            placeholder="Semantic search — ask anything about your documents…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void doSearch()}
            ref={searchInputRef}
          />
          <button className="hud-btn !px-4" disabled={searching || !query.trim()} onClick={() => void doSearch()}>
            {searching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
            SEARCH
          </button>
          {hits && hits.length > 0 && (
            <button className="hud-btn !px-3" onClick={() => exportSummary(query, hits)} title="Export results as PDF dossier">
              <FileDown size={13} /> DOSSIER
            </button>
          )}
        </div>

        {/* ORGANIZATION BAR — filters (all / starred / trash), tag cloud, folders, select-all */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {(["all", "starred", "trash"] as const).map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setActiveTag(null); setActiveFolder(null); }}
              className={`hud-btn !px-2.5 !py-0.5 text-[9px] ${filter === f ? "!border-cyan-300 !text-cyan-200" : "!text-slate-400"}`}
            >
              {f === "all" ? "ALL" : f === "starred" ? "★ STARRED" : "🗑 TRASH"}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-cyan-400/20" />
          <button onClick={selectAllVisible} className="hud-btn !px-2.5 !py-0.5 text-[9px]" title="Select all shown / clear selection">
            <CheckSquare size={10} /> SELECT
          </button>
          {(tagCloudData ?? []).slice(0, 14).map(({ tag, count }) => (
            <button
              key={tag}
              onClick={() => { setFilter("tag"); setActiveTag(activeTag === tag ? null : tag); }}
              className={`rounded-full border px-2 py-0.5 font-mono text-[9px] ${filter === "tag" && activeTag === tag ? "border-violet-300 bg-violet-400/15 text-violet-200" : "border-cyan-400/25 text-cyan-300/80 hover:bg-cyan-400/10"}`}
            >
              #{tag} <span className="text-slate-500">{count}</span>
            </button>
          ))}
          {(folders ?? []).map((f) => (
            <button
              key={f}
              onClick={() => { setFilter("folder"); setActiveFolder(activeFolder === f ? null : f); }}
              className={`rounded border px-2 py-0.5 font-mono text-[9px] ${filter === "folder" && activeFolder === f ? "border-amber-300 bg-amber-400/15 text-amber-200" : "border-cyan-400/25 text-cyan-300/80 hover:bg-cyan-400/10"}`}
            >
              ▤ {f}
            </button>
          ))}
        </div>

        {/* BULK TOOLBAR — appears when documents are selected */}
        {selected.size > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded border border-cyan-400/30 bg-cyan-400/5 p-2">
            <span className="font-mono text-[10px] text-cyan-200">{selected.size} SELECTED</span>
            <span className="mx-1 h-4 w-px bg-cyan-400/20" />
            <input
              value={bulkTagDraft}
              onChange={(e) => setBulkTagDraft(e.target.value)}
              placeholder="tags, comma-sep"
              className="w-40 rounded border border-cyan-400/30 bg-slate-950/60 px-2 py-1 font-mono text-[10px] text-cyan-100 outline-none"
            />
            <button className="hud-btn !px-2 !py-0.5 text-[9px]" onClick={() => void runBulk("addTags", { tags: bulkTagDraft.split(/[,;]/).map((t) => t.trim()).filter(Boolean) })}>+TAGS</button>
            <button className="hud-btn !px-2 !py-0.5 text-[9px]" onClick={() => void runBulk("removeTags", { tags: bulkTagDraft.split(/[,;]/).map((t) => t.trim()).filter(Boolean) })}>−TAGS</button>
            <input
              value={bulkFolderDraft}
              onChange={(e) => setBulkFolderDraft(e.target.value)}
              placeholder="folder name"
              className="w-32 rounded border border-cyan-400/30 bg-slate-950/60 px-2 py-1 font-mono text-[10px] text-cyan-100 outline-none"
            />
            <button className="hud-btn !px-2 !py-0.5 text-[9px]" onClick={() => void runBulk("setFolder", { folder: bulkFolderDraft })}>▸FOLDER</button>
            <span className="mx-1 h-4 w-px bg-cyan-400/20" />
            <button className="hud-btn !px-2 !py-0.5 text-[9px] !text-amber-300" onClick={() => void runBulk("favorite")} title="Star selected"><Star size={10} /> STAR</button>
            <button className="hud-btn !px-2 !py-0.5 text-[9px]" onClick={() => void runBulk("unfavorite")}>UNSTAR</button>
            {filter === "trash" ? (
              <button className="hud-btn !px-2 !py-0.5 text-[9px]" onClick={() => void runBulk("restore")}><RotateCcw size={10} /> RESTORE</button>
            ) : (
              <button className="hud-btn !px-2 !py-0.5 text-[9px]" onClick={() => void runBulk("trash")}><Trash2 size={10} /> TRASH</button>
            )}
            {filter === "trash" && (
              <button className="hud-btn !px-2 !py-0.5 text-[9px] !text-rose-300" onClick={() => void runBulk("deleteForever")}>DELETE FOREVER</button>
            )}
          </div>
        )}
        {jobs.length > 0 && (
          <div className="mt-2 max-h-28 space-y-1 overflow-y-auto rounded border border-cyan-400/20 p-2">
            {jobs.map((j) => (
              <p key={j.name} className="flex items-center gap-2 font-mono text-[10px]">
                {j.phase === "done" ? (
                  <span className="text-emerald-400">✓</span>
                ) : j.phase === "failed" ? (
                  <AlertTriangle size={11} className="text-rose-400" />
                ) : (
                  <Loader2 size={11} className="animate-spin text-cyan-300" />
                )}
                <span className="max-w-[240px] truncate text-cyan-100">{j.name}</span>
                <span className={j.phase === "failed" ? "text-rose-400" : "text-cyan-400/70"}>
                  {j.phase}
                  {j.detail ? ` · ${j.detail}` : ""}
                </span>
              </p>
            ))}
          </div>
        )}
        {notice && <p className="mt-2 font-mono text-[11px] text-cyan-200/90">{notice}</p>}
        <p className="mt-1 text-right">
          <button onClick={() => setHotkeyHelp((v) => !v)} className="font-mono text-[9px] text-slate-500 hover:text-cyan-300" title="Keyboard shortcuts">? shortcuts</button>
        </p>
      </div>

      {hotkeyHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" onClick={() => setHotkeyHelp(false)}>
          <div className="hud-panel hud-corner max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <p className="hud-label mb-3">LIBRARY KEYBOARD SHORTCUTS</p>
            <div className="grid grid-cols-1 gap-1.5 font-mono text-[11px] text-cyan-100/90">
              <p><span className="text-cyan-400">← → ↑ ↓</span> move cursor between cards</p>
              <p><span className="text-cyan-400">Enter</span> open original file</p>
              <p><span className="text-cyan-400">S</span> star / unstar · <span className="text-cyan-400">T</span> edit tags</p>
              <p><span className="text-cyan-400">Space</span> select card · <span className="text-cyan-400">A</span> (Ctrl/⌘) select all</p>
              <p><span className="text-cyan-400">Backspace</span> move to trash · <span className="text-cyan-400">Del</span> restore (in trash)</p>
              <p><span className="text-cyan-400">Shift+Del</span> delete forever</p>
              <p><span className="text-cyan-400">/</span> focus search · <span className="text-cyan-400">?</span> toggle help</p>
              <p><span className="text-cyan-400">Esc</span> clear cursor &amp; selection</p>
            </div>
            <button className="hud-btn mt-4 !py-1 text-[10px]" onClick={() => setHotkeyHelp(false)}>GOT IT</button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {/* search results */}
        {hits && hits.length > 0 && (
          <div className="mb-6 space-y-2">
            <p className="hud-label">SEMANTIC HITS ({hits.length})</p>
            {hits.map((h) => (
              <div key={h.chunkId} className="hud-panel p-3">
                <div className="mb-1 flex items-center justify-between font-mono text-[10px] tracking-[0.15em] text-cyan-400/80">
                  <span>{h.documentTitle} · CHUNK #{h.ordinal}</span>
                  <span>SCORE {h._score.toFixed(3)}</span>
                </div>
                <p className="font-mono text-xs leading-relaxed text-cyan-50/90">{h.text}</p>
              </div>
            ))}
          </div>
        )}

        {/* document list */}
        <p className="hud-label mb-2">ARCHIVE ({visibleDocs.length})</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {visibleDocs.map((d, idx) => (
            <div key={d._id} className={`hud-panel hud-corner p-4 ${selected.has(d._id) ? "!border-cyan-300/70" : ""} ${d.trashed ? "opacity-60" : ""}`}>
              <div
                ref={(el) => {
                  if (visibleDocs[idx]?._id === d._id && cursor === idx && el) {
                    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
                  }
                }}
                className={`flex items-start justify-between gap-2 rounded ${cursor === idx ? "cursor-ring" : ""}`}
              >
                <button className="mt-0.5 shrink-0 text-cyan-300/70 hover:text-cyan-200" title="Select" onClick={() => toggleSelect(d._id)}>
                  {selected.has(d._id) ? <CheckSquare size={15} className="text-cyan-300" /> : <Square size={15} />}
                </button>
                <FileText size={18} className="mt-0.5 shrink-0 text-cyan-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs text-cyan-100">{d.title}</p>
                  <p className="mt-1 font-mono text-[10px] text-cyan-400/70">
                    {d.status === "ready" && `READY · ${d.chunkCount ?? 0} chunks · ${formatBytes(d.sizeBytes)}`}
                    {d.status === "processing" && "EMBEDDING…"}
                    {d.status === "uploading" && "UPLOADING…"}
                    {d.status === "failed" && (d.error ?? "failed")}
                  </p>
                  {((d.tags?.length ?? 0) > 0 || d.folder) && (
                    <p className="mt-1 flex flex-wrap gap-1">
                      {d.folder && <span className="rounded border border-amber-400/30 px-1.5 py-0.5 font-mono text-[8px] text-amber-300">▤ {d.folder}</span>}
                      {(d.tags ?? []).map((t) => (
                        <span key={t} className="rounded-full border border-violet-400/30 px-1.5 py-0.5 font-mono text-[8px] text-violet-300">#{t}</span>
                      ))}
                    </p>
                  )}
                  {tagEditorId === d._id && (
                    <div className="mt-2 flex items-center gap-1">
                      <input
                        autoFocus
                        value={tagDraft}
                        onChange={(e) => setTagDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void saveTags(d);
                          if (e.key === "Escape") setTagEditorId(null);
                        }}
                        placeholder="tag1, tag2 — Enter to save"
                        className="w-full rounded border border-cyan-400/40 bg-slate-950/70 px-2 py-1 font-mono text-[10px] text-cyan-100 outline-none"
                      />
                      <button className="rounded p-1 text-emerald-300/80 hover:bg-emerald-400/10" title="Save tags" onClick={() => void saveTags(d)}><CheckSquare size={12} /></button>
                      <button className="rounded p-1 text-slate-400 hover:bg-slate-400/10" title="Cancel" onClick={() => setTagEditorId(null)}><X size={12} /></button>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    className="rounded p-1 hover:bg-amber-400/10"
                    title={d.favorite ? "Unstar" : "Star"}
                    onClick={() => void (async () => {
                      const token = localStorage.getItem("jarvis.sessionToken");
                      if (token) await toggleFavorite({ sessionToken: token, documentId: d._id as Id<"documents"> });
                    })()}
                  >
                    <Star size={13} className={d.favorite ? "fill-amber-300 text-amber-300" : "text-cyan-300/50"} />
                  </button>
                  <button
                    className="rounded p-1 text-violet-300/70 hover:bg-violet-400/10"
                    title="Edit tags"
                    onClick={() => {
                      setTagEditorId(tagEditorId === d._id ? null : d._id);
                      setTagDraft((d.tags ?? []).join(", "));
                    }}
                  >
                    <Tags size={13} />
                  </button>
                  {d.trashed ? (
                    <button
                      className="rounded p-1 text-emerald-300/70 hover:bg-emerald-400/10"
                      title="Restore from trash"
                      onClick={() => void (async () => {
                        const token = localStorage.getItem("jarvis.sessionToken");
                        if (token) await restoreDocument({ sessionToken: token, documentId: d._id as Id<"documents"> });
                      })()}
                    >
                      <RotateCcw size={13} />
                    </button>
                  ) : (
                    <button
                      className="rounded p-1 text-rose-300/70 hover:bg-rose-400/10"
                      title="Move to trash"
                      onClick={() => void (async () => {
                        const token = localStorage.getItem("jarvis.sessionToken");
                        if (token) await trashDocument({ sessionToken: token, documentId: d._id as Id<"documents"> });
                      })()}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                  {d.storageId && (
                    <button className="rounded p-1 text-cyan-300/70 hover:bg-cyan-400/10" title="View original" onClick={() => void viewDoc(d)}>
                      <FileText size={13} />
                    </button>
                  )}
                  {d.storageId && (
                    <button className="rounded p-1 text-cyan-300/70 hover:bg-cyan-400/10" title="Download original file" onClick={() => void downloadOriginal(d)}>
                      <FileDown size={13} />
                    </button>
                  )}
                  {!d.storageId && (d.storageIds?.length ?? 0) > 0 && (
                    <button className="rounded p-1 text-cyan-300/70 hover:bg-cyan-400/10" title="Download original (reassembled from parts)" onClick={() => void downloadChunked(d)}>
                      <FileDown size={13} />
                    </button>
                  )}
                  {d.status === "ready" && (
                    <button className="rounded p-1 text-cyan-300/70 hover:bg-cyan-400/10" title="Download extracted text (.txt)" onClick={() => void downloadExtracted(d)}>
                      <Download size={13} />
                    </button>
                  )}
                  <button className="rounded p-1 text-red-300/70 hover:bg-red-400/10" title="Remove" onClick={() => void deleteDoc(d)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        {visibleDocs.length === 0 && jobs.length === 0 && (
          <div className="mt-10 text-center">
            <p className="font-mono text-[11px] text-cyan-500/60">
              ARCHIVE EMPTY — upload PDFs or text files (single, multiple, or whole folders).
              They are chunked and embedded on-device (MiniLM, 384-dim) then made semantically
              searchable. Download originals or extracted text anytime.
            </p>
            <button className="hud-btn mt-4 text-xs" onClick={() => fileInputRef.current?.click()}>
              <Upload size={11} /> UPLOAD YOUR FIRST DOCUMENTS
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

/** Recursively collect files from a dropped directory entry. */
function walkDirectory(entry: any, out: File[], done: () => void): void {
  const reader = entry.createReader();
  const readBatch = () => {
    reader.readEntries((entries: any[]) => {
      if (!entries.length) {
        done();
        return;
      }
      let pending = entries.length;
      entries.forEach((e) => {
        if (e.isDirectory) {
          walkDirectory(e, out, () => {
            if (--pending === 0) readBatch();
          });
        } else {
          e.file((f: File) => {
            // Preserve a readable path in the name for context.
            const named = f.name !== e.fullPath ? f : new File([f], e.fullPath.replace(/^\//, ""), { type: f.type });
            out.push(named);
            if (--pending === 0) readBatch();
          });
        }
      });
    }, done);
  };
  readBatch();
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, "0")).join("");
}
