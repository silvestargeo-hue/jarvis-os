/**
 * RAG retrieval — the bridge between the library corpus and the AI terminal.
 *
 *   question ──► embed (MiniLM, 384-dim, in-browser) ──► Convex vectorSearch
 *            ──► top chunks + parent doc titles ──► grounded prompt context
 *
 * Everything is session-gated server-side; nothing leaves the user's corpus.
 */
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { embed } from "./embeddings";

export interface RagHit {
  chunkId: string;
  text: string;
  documentId: string;
  documentTitle: string;
  documentTags: string[];
  ordinal: number;
  score: number;
}

export interface RagResult {
  hits: RagHit[];
  /** Ready-to-paste grounded context block, or "" when no hits. */
  contextBlock: string;
  embedded: boolean;
}

let client: ConvexHttpClient | null = null;

function getClient(): ConvexHttpClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) throw new Error("backend offline");
    client = new ConvexHttpClient(url);
  }
  return client;
}

/**
 * Retrieve the most relevant chunks for a question.
 * Falls back gracefully: if embedding or search fails, returns empty hits
 * so the terminal can still answer un-grounded.
 */
export async function retrieveContext(
  sessionToken: string,
  question: string,
  limit = 6
): Promise<RagResult> {
  try {
    const convex = getClient();
    const embedding = await embed(question);

    const rawHits = (await convex.action(api.documents.search, {
      sessionToken,
      embedding,
      limit,
    })) as Array<{ _id: string; _score: number }>;

    if (!rawHits.length) return { hits: [], contextBlock: "", embedded: true };

    const chunks = (await convex.query(api.documents.chunksById, {
      sessionToken,
      ids: rawHits.map((h) => h._id as any),
    })) as Array<{
      chunkId: string;
      ordinal: number;
      text: string;
      documentId: string;
      documentTitle: string;
      documentTags?: string[];
    }>;

    const scoreById = new Map(rawHits.map((h) => [h._id, h._score]));
    const hits: RagHit[] = chunks
      .map((c) => ({
        chunkId: c.chunkId,
        text: c.text,
        documentId: c.documentId,
        documentTitle: c.documentTitle,
        documentTags: c.documentTags ?? [],
        ordinal: c.ordinal,
        score: scoreById.get(c.chunkId) ?? 0,
      }))
      // vectorSearch may return hits whose rows were deleted between calls
      .filter((h) => h.text);

    return { hits, contextBlock: buildContextBlock(hits), embedded: true };
  } catch {
    return { hits: [], contextBlock: "", embedded: false };
  }
}

/** Numbered, title-attributed context block for the system/user prompt. */
export function buildContextBlock(hits: RagHit[]): string {
  if (!hits.length) return "";
  const parts = hits.map((h, i) => {
    const t = h.text.length > 1200 ? h.text.slice(0, 1200) + "…" : h.text;
    const tags = h.documentTags?.length ? ` · tags: ${h.documentTags.join(", ")}` : "";
    return `[${i + 1}] ${h.documentTitle} (chunk ${h.ordinal})${tags}\n${t}`;
  });
  return `You are grounded in the following excerpts from the operator's document library. Cite them inline as [n] when you use them. If the excerpts don't contain the answer, say so plainly.\n\n${parts.join("\n\n")}`;
}
