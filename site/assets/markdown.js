/* ============================================================
   JARVIS OS — Markdown (markdown.js)
   Safe subset renderer: escape FIRST, then transform.
   Supports: **bold**, *italic*, `code`, ```blocks```,
   [links](url), headings (#), lists (-), line breaks.
   ============================================================ */

"use strict";

function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderMarkdown(src) {
  let s = escHtml(String(src || ""));

  // fenced code blocks
  s = s.replace(/```([\s\S]*?)```/g, (_, code) =>
    `<pre style="background:rgba(2,8,18,.85);border:1px solid rgba(56,189,248,.2);border-radius:8px;padding:10px;overflow:auto;font-family:var(--font-mono);font-size:12.5px;color:#d7f6ff">${code.trim()}</pre>`);

  // inline code
  s = s.replace(/`([^`\n]+)`/g, '<code style="background:rgba(56,189,248,.1);padding:1px 6px;border-radius:4px">$1</code>');

  // links [text](http...) — https only
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:var(--cyan-soft)">$1</a>');

  // bold / italic
  s = s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  s = s.replace(/(^|\s)\*([^*\n]+)\*/g, "$1<i>$2</i>");

  // headings (# .. ###)
  s = s.replace(/^### (.*)$/gm, '<b style="font-size:1.05em">$1</b>');
  s = s.replace(/^## (.*)$/gm, '<b style="font-size:1.15em">$1</b>');
  s = s.replace(/^# (.*)$/gm, '<b style="font-size:1.25em">$1</b>');

  // list items (- )
  s = s.replace(/^[-•] (.*)$/gm, '•&nbsp;$1');

  // line breaks
  s = s.replace(/\n/g, "<br>");

  return s;
}
