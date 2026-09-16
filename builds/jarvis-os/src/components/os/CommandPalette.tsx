"use client";

/**
 * ⌘K / Ctrl+K Command Palette — the signature OS feel.
 *
 * Fuzzy-filter over every module and action; free text becomes an instant
 * JARVIS prompt routed to the AI terminal (the terminal picks the ?q= up and
 * sends it automatically). Registered globally in the root layout so it works
 * on every page, like a real operating system.
 */

import { AnimatePresence, motion } from "framer-motion";
import { Command, Search, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface PaletteItem {
  id: string;
  label: string;
  hint: string;
  keywords: string;
  run: (router: ReturnType<typeof useRouter>) => void;
}

const ITEMS: PaletteItem[] = [
  { id: "dashboard", label: "Dashboard", hint: "Main deck", keywords: "home deck overview modules start", run: (r) => r.push("/dashboard") },
  { id: "ai", label: "AI Terminal", hint: "Chat with JARVIS", keywords: "chat assistant gpt talk ask", run: (r) => r.push("/dashboard/ai") },
  { id: "livevoice", label: "Live Voice Mode", hint: "Hands-free conversation", keywords: "voice speak listen siri gemini handsfree", run: (r) => r.push("/dashboard/ai?live=1") },
  { id: "briefing", label: "Morning briefing", hint: "Time · weather · library, spoken aloud", keywords: "briefing weather morning summary today greet", run: (r) => r.push("/dashboard/ai?q=" + encodeURIComponent("Good-morning briefing: what time is it, what's the weather right now, and what do I have in my library? Summarize briefly.")) },
  { id: "library", label: "Central Archive", hint: "Admin-curated library everyone can read", keywords: "library documents files books archive central upload", run: (r) => r.push("/dashboard/library") },
  { id: "vault", label: "Private Vault", hint: "Your own library", keywords: "vault private library personal files", run: (r) => r.push("/dashboard/library?scope=vault") },
  { id: "chat", label: "Secure Chat", hint: "E2EE messaging", keywords: "messages talk encrypted privacy", run: (r) => r.push("/dashboard/chat") },
  { id: "skills", label: "Skills Manager", hint: "Install & manage AI skills", keywords: "skills plugins addons extensions tools github import", run: (r) => r.push("/dashboard/skills") },
  { id: "settings", label: "Settings", hint: "Preferences & API keys", keywords: "config keys profile preferences", run: (r) => r.push("/dashboard/settings") },
  { id: "admin", label: "Admin Control", hint: "Full system oversight", keywords: "admin panel control users manage oversee", run: (r) => r.push("/dashboard/admin") },
  { id: "lock", label: "Lock Screen", hint: "Secure the OS", keywords: "lock secure pin logout", run: (r) => r.push("/lock") },
  { id: "help", label: "Help & Shortcuts", hint: "Field manual: palette, voice, secrets", keywords: "help shortcuts manual keys voice commands guide how", run: (r) => r.push("/help") },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global hotkey: ⌘K / Ctrl+K toggles, Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? ITEMS.filter((i) => `${i.label} ${i.hint} ${i.keywords}`.toLowerCase().includes(q))
      : ITEMS;
    if (!q) return matches;
    const ask: PaletteItem = {
      id: "ask",
      label: `Ask JARVIS: “${query.trim()}”`,
      hint: "Send straight to the AI terminal",
      keywords: "ask",
      run: (r) => r.push(`/dashboard/ai?q=${encodeURIComponent(query.trim())}`),
    };
    return [ask, ...matches];
  }, [query]);

  const runItem = useCallback(
    (item: PaletteItem) => {
      setOpen(false);
      item.run(router);
    },
    [router]
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = filtered[cursor];
      if (item) runItem(item);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-start justify-center bg-black/70 px-4 pt-[12vh] backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setOpen(false)}
        >
          <motion.div
            className="w-full max-w-xl overflow-hidden rounded-xl border border-cyan-400/30 bg-slate-950/95 shadow-[0_0_60px_rgba(34,211,238,0.25)]"
            initial={{ scale: 0.96, y: -8, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.96, y: -8, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-cyan-400/20 px-4 py-3">
              <Search size={16} className="shrink-0 text-cyan-300" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setCursor(0);
                }}
                onKeyDown={onKeyDown}
                placeholder="Search the OS… or type a question for JARVIS"
                className="w-full bg-transparent font-mono text-sm text-cyan-50 outline-none placeholder:text-slate-500"
              />
              <kbd className="rounded border border-cyan-400/30 px-1.5 py-0.5 text-[10px] text-cyan-300/80">ESC</kbd>
            </div>
            <ul className="max-h-[50vh] overflow-y-auto p-2">
              {filtered.map((item, idx) => (
                <li key={item.id}>
                  <button
                    onMouseEnter={() => setCursor(idx)}
                    onClick={() => runItem(item)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition ${
                      idx === cursor ? "bg-cyan-400/15 text-cyan-100" : "text-slate-300 hover:bg-cyan-400/5"
                    }`}
                  >
                    <Sparkles size={14} className={`shrink-0 ${idx === cursor ? "text-cyan-300" : "text-slate-500"}`} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{item.label}</span>
                      <span className="block truncate text-[11px] text-slate-500">{item.hint}</span>
                    </span>
                    {idx === cursor && <span className="ml-auto shrink-0 text-[10px] text-cyan-400/70">↵</span>}
                  </button>
                </li>
              ))}
              {!filtered.length && (
                <li className="px-3 py-6 text-center text-xs text-slate-500">
                  No matches — press Enter to ask JARVIS instead
                </li>
              )}
            </ul>
            <div className="flex items-center justify-between border-t border-cyan-400/20 px-4 py-2 text-[10px] text-slate-500">
              <span>↑↓ navigate · ↵ run · esc close</span>
              <span className="flex items-center gap-1">
                <Command size={10} /> K anywhere
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
