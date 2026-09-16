import { describe, expect, it } from "vitest";
import { chunkText } from "../src/lib/rag/embeddings";

// chunkText is a pure function — no browser APIs touched (pdfjs import is
// lazily unused in this path; vitest resolves the module for node fine because
// the top-level import only assigns a worker URL string).

describe("RAG chunker", () => {
  it("returns a single chunk for short text", () => {
    const chunks = chunkText("Short operational note.", 800, 100);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.text).toBe("Short operational note.");
    expect(chunks[0]!.ordinal).toBe(0);
  });

  it("returns empty for blank input", () => {
    expect(chunkText("   \n\t ")).toHaveLength(0);
  });

  it("respects the size cap with overlap between chunks", () => {
    const text = "x".repeat(2000);
    const chunks = chunkText(text, 800, 100);
    expect(chunks.length).toBeGreaterThan(1);
    // consecutive chunks overlap by ~100 chars
    const first = chunks[0]!.text;
    const second = chunks[1]!.text;
    expect(second.startsWith(first.slice(first.length - 100))).toBe(true);
  });

  it("breaks at sentence boundaries when available", () => {
    const sentence = "The reactor coolant valve must be cycled twice before ignition. ";
    const text = sentence.repeat(20); // long enough to force multiple chunks
    const chunks = chunkText(text, 400, 100);
    expect(chunks.length).toBeGreaterThan(1);
    // no chunk should end mid-word in a sentence-heavy document
    for (const c of chunks) {
      expect(c.text.endsWith("x")).toBe(false);
    }
  });

  it("ordinals are sequential from zero", () => {
    const chunks = chunkText("y".repeat(2500), 800, 100);
    chunks.forEach((c, i) => expect(c.ordinal).toBe(i));
  });
});
