/**
 * Auto-title AI sessions from their first exchange — ChatGPT-style.
 *
 * Deterministic, free, instant: no extra model round-trip. If the model's
 * answer opens with a markdown heading, that heading is usually the best
 * possible title; otherwise we build a short keyword phrase from the question.
 */

const STOP = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "else", "for", "of", "to", "in", "on",
  "at", "by", "with", "from", "is", "are", "was", "were", "be", "been", "being", "it", "its",
  "this", "that", "these", "those", "i", "me", "my", "we", "our", "you", "your", "he", "she",
  "they", "them", "what", "which", "who", "whom", "how", "when", "where", "why", "can", "could",
  "should", "would", "will", "shall", "do", "does", "did", "please", "jarvis", "hey", "hi",
  "hello", "tell", "give", "make", "write", "about", "as", "so", "just", "some", "any",
]);

function titleCase(s: string): string {
  return s
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function clean(s: string): string {
  return s.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
}

/** Build a session title from the first user question + assistant answer. */
export function titleFromExchange(question: string, answer: string): string | null {
  // 1. Prefer the model's own first markdown heading (often a perfect title).
  const heading = answer.match(/^\s{0,3}#{1,3}\s+(.{4,64})$/m);
  if (heading) {
    const t = clean(heading[1]).replace(/[:.!?]+$/, "").slice(0, 60);
    if (t.length >= 4) return t;
  }

  // 2. Fall back to a keyword phrase from the question.
  const q = clean(question)
    .replace(/^[^a-z0-9]+/i, "")
    .replace(/[?!.]+$/, "");
  const words = q.split(" ").filter((w) => w.length > 2 && !STOP.has(w.toLowerCase()));
  const phrase = words.slice(0, 6).join(" ");
  if (phrase.length >= 4) return titleCase(phrase.slice(0, 48));

  // 3. Last resort: first few words of the raw question.
  const raw = q.slice(0, 40);
  return raw.length >= 4 ? titleCase(raw) : null;
}
