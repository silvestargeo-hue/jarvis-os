/**
 * Client-side RAG engine — 100% keyless/free.
 *  - Embeddings: all-MiniLM-L6-v2 (384-dim) via transformers.js (WASM, quantized)
 *  - Chunking: ~800 chars with 100-char overlap, paragraph-aware splits
 *  - PDF text extraction via pdfjs-dist (worker served from /public)
 */
import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

let embedder: FeatureExtractionPipeline | null = null;

export async function getEmbedder(): Promise<FeatureExtractionPipeline> {
  if (!embedder) {
    embedder = (await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2",
      { dtype: "q8" }
    )) as FeatureExtractionPipeline;
  }
  return embedder;
}

/** 384-dim L2-normalized embedding (cosine-ready). */
export async function embed(text: string): Promise<number[]> {
  const extractor = await getEmbedder();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

export interface Chunk {
  ordinal: number;
  text: string;
}

export function chunkText(text: string, size = 800, overlap = 100): Chunk[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const chunks: Chunk[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);
    if (end < clean.length) {
      const brk = clean.lastIndexOf(". ", end - 1);
      if (brk > start + size * 0.5) end = brk + 1;
    }
    chunks.push({ ordinal: chunks.length, text: clean.slice(start, end) });
    if (end >= clean.length) break;
    start = end - overlap;
  }
  return chunks;
}

/** Extract text from PDF (page-aware) or plain text-ish files. */
export async function extractText(file: File): Promise<{ pages: string[]; pageCount: number }> {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((it: any) => ("str" in it ? it.str : "")).join(" "));
    }
    return { pages, pageCount: pdf.numPages };
  }
  const text = await file.text();
  return { pages: [text], pageCount: 1 };
}
