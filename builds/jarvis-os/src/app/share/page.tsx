"use client";

/**
 * /share — PWA Share Target receiver.
 *
 * Android's share sheet can send links/text (GET with ?title&text&url) or
 * files (POST multipart, since share_target.method POST is registered with
 * a files param in the installed manifest). Text/links land in the AI
 * terminal; files are queued for the Private Vault and processed on the
 * Library page. Auth-aware: guests are routed through /auth first.
 */

import { useEffect, useState } from "react";
import { Share2, Sparkles } from "lucide-react";

export default function SharePage() {
  const [msg, setMsg] = useState("Receiving shared content…");

  useEffect(() => {
    const token = localStorage.getItem("jarvis.sessionToken");
    if (!token) {
      // Preserve the share payload, deliver after login.
      const params = new URLSearchParams(window.location.search);
      if (params.toString()) {
        sessionStorage.setItem("jarvis.shareQueue", params.toString());
      }
      window.location.href = "/auth";
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const title = params.get("title") ?? "";
    const text = params.get("text") ?? "";
    const url = params.get("url") ?? "";

    if (title || text || url) {
      const q = [title, text, url].filter(Boolean).join("\n\n");
      sessionStorage.setItem("jarvis.shareQueue", "text:" + q);
      window.location.href = "/dashboard/ai?q=" + encodeURIComponent(q.slice(0, 800));
      return;
    }

    // POST share (files) — the payload already hit this page as a request;
    // mark the vault pickup and let the Library ingest it.
    setMsg("Files received — routing to your Private Vault…");
    sessionStorage.setItem("jarvis.shareQueue", "files:1");
    setTimeout(() => {
      window.location.href = "/dashboard/library?scope=vault";
    }, 900);
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="hud-panel hud-corner w-full max-w-md p-8 text-center">
        <Share2 size={32} className="mx-auto mb-3 animate-pulse text-cyan-300" />
        <p className="hud-label mb-2">SHARE RECEIVER</p>
        <p className="font-mono text-xs text-cyan-200/80">{msg}</p>
        <p className="mt-4 flex items-center justify-center gap-1.5 font-mono text-[10px] text-cyan-500/60">
          <Sparkles size={10} /> JARVIS OS — installed app integration
        </p>
      </div>
    </main>
  );
}
