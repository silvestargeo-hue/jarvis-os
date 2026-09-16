"use client";

import { useSyncStatus } from "@/app/providers";
import {
  BookOpen,
  Command,
  Cloud,
  CloudOff,
  Cpu,
  Database,
  LayoutGrid,
  Lock,
  LogOut,
  MessageSquare,
  Puzzle,
  Settings,
  Shield,
  Terminal,
} from "lucide-react";
import { useEffect, useState } from "react";

/** Shared mounted-flag hook — avoids SSR/localStorage hydration mismatches. */
function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

export function SystemWidget() {
  const mounted = useMounted();
  const { online, queueDepth } = useSyncStatus();
  const convexHost = process.env.NEXT_PUBLIC_CONVEX_URL
    ? new URL(process.env.NEXT_PUBLIC_CONVEX_URL).host
    : null;

  const rows: Array<[string, React.ReactNode]> = [
    [
      "UPLINK",
      mounted ? (
        <span className={online ? "text-emerald-300" : "text-red-400"}>
          {online ? "● ONLINE" : "○ OFFLINE"}
        </span>
      ) : (
        "…"
      ),
    ],
    [
      "OUTBOX QUEUE",
      <span className={queueDepth > 0 ? "text-amber-300" : "text-cyan-200"}>
        {mounted ? `${queueDepth} op${queueDepth === 1 ? "" : "s"}` : "…"}
      </span>,
    ],
    [
      "BACKEND",
      convexHost ? (
        <span className="inline-flex items-center gap-1 text-cyan-200">
          <Database size={11} /> {convexHost}
        </span>
      ) : (
        <span className="text-amber-300">not configured</span>
      ),
    ],
    ["LOCAL LLM", <span className="text-cyan-300/60">standby (WebGPU)</span>],
  ];

  return (
    <div className="space-y-2.5 font-mono text-[11px]">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-3">
          <span className="text-cyan-500/70">{k}</span>
          {v}
        </div>
      ))}
      <div className="mt-3 flex items-center gap-2 border-t border-cyan-400/15 pt-2 text-[10px] text-cyan-500/60">
        {online ? <Cloud size={12} /> : <CloudOff size={12} />}
        offline writes queue in Dexie and flush automatically
      </div>
    </div>
  );
}

export function IdentityWidget() {
  const mounted = useMounted();
  const [name, setName] = useState("OPERATOR");
  const [guest, setGuest] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("jarvis.displayName");
    setName((stored ?? (localStorage.getItem("jarvis.guest") ? "GUEST" : "OPERATOR")).toUpperCase());
    setGuest(Boolean(localStorage.getItem("jarvis.guest")));
  }, []);

  return (
    <div className="space-y-3">
      <div className="font-mono text-[11px]">
        <div className="text-cyan-500/70">OPERATOR</div>
        <div className="mt-0.5 text-base tracking-[0.15em] text-cyan-100">{mounted ? name : "…"}</div>
        <div className="mt-0.5 text-cyan-300/70">{guest ? "session: guest (local only)" : "session: authenticated"}</div>
      </div>
      <div className="flex gap-2">
        <a href="/lock" className="hud-btn flex-1 justify-center !px-2 !py-1.5 text-[10px]">
          <Lock size={11} /> LOCK
        </a>
        <a href="/auth" className="hud-btn flex-1 justify-center !px-2 !py-1.5 text-[10px]">
          <LogOut size={11} /> SWITCH
        </a>
      </div>
    </div>
  );
}

const MODULES = [
  { id: "ai", label: "AI TERMINAL", icon: Terminal, href: "/dashboard/ai", status: "LIVE", adminOnly: false },
  { id: "comms", label: "E2EE COMMS", icon: MessageSquare, href: "/dashboard/chat", status: "LIVE", adminOnly: false },
  { id: "library", label: "DOC LIBRARY", icon: BookOpen, href: "/dashboard/library", status: "LIVE", adminOnly: false },
  { id: "skills", label: "SKILLS · AI TOOLBELT", icon: Puzzle, href: "/dashboard/skills", status: "NEW", adminOnly: false },
  { id: "admin", label: "ADMIN CONTROL", icon: Shield, href: "/dashboard/admin", status: "ROOT", adminOnly: true },
  { id: "settings", label: "SYSTEM CFG", icon: Settings, href: "/dashboard/settings", status: "LIVE", adminOnly: false },
];

const MODULES_ORDER_KEY = "jarvis.modules.order.v1";

/**
 * Rearrangeable module launcher. Every user can reorder their own launcher
 * (persisted locally). The ADMIN CONTROL tile is admin-only and stays pinned
 * at its position — non-admins never see it, so it can't be moved or hidden.
 */
export function ModulesWidget() {
  const mounted = useMounted();
  const [order, setOrder] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setOrder(JSON.parse(localStorage.getItem(MODULES_ORDER_KEY) ?? "[]"));
    setIsAdmin(localStorage.getItem("jarvis.role") === "admin");
  }, []);

  const visible = MODULES.filter((m) => !m.adminOnly || isAdmin);
  const sorted = [...visible].sort((a, b) => {
    const ia = order.indexOf(a.id);
    const ib = order.indexOf(b.id);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  const move = (id: string, dir: -1 | 1) => {
    const ids = sorted.map((m) => m.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setOrder(ids);
    localStorage.setItem(MODULES_ORDER_KEY, JSON.stringify(ids));
  };

  return (
    <div className="space-y-2">
      {sorted.map(({ id, label, icon: Icon, href, status }, idx) => {
        const inner = (
          <div className="flex items-center justify-between rounded-lg border border-cyan-400/20 bg-cyan-400/5 px-3 py-2 font-mono text-[11px] text-cyan-100 transition hover:bg-cyan-400/15">
            <span className="inline-flex items-center gap-2">
              <Icon size={13} className="text-cyan-300" /> {label}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-[9px] tracking-[0.2em] text-cyan-500/80">{status}</span>
              <span
                className="flex flex-col leading-none"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    move(id, -1);
                  }}
                  className={`px-0.5 text-[8px] ${idx === 0 ? "opacity-20" : "text-cyan-400/70 hover:text-cyan-200"}`}
                  title="Move up"
                >
                  ▲
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    move(id, 1);
                  }}
                  className={`px-0.5 text-[8px] ${idx === sorted.length - 1 ? "opacity-20" : "text-cyan-400/70 hover:text-cyan-200"}`}
                  title="Move down"
                >
                  ▼
                </button>
              </span>
            </span>
          </div>
        );
        return href ? (
          <a key={id} href={href} className="block">
            {inner}
          </a>
        ) : (
          <div key={id} className="cursor-not-allowed opacity-70">
            {inner}
          </div>
        );
      })}
      {mounted && isAdmin && (
        <a href="/dashboard/admin" className="block">
          <div className="flex items-center justify-between rounded-lg border border-emerald-400/25 bg-emerald-400/5 px-3 py-2 font-mono text-[11px] text-emerald-100 transition hover:bg-emerald-400/15">
            <span className="inline-flex items-center gap-2">
              <Shield size={13} className="text-emerald-300" /> ROOT CONSOLE
            </span>
            <span className="text-[9px] tracking-[0.2em] text-emerald-400/80">ADMIN</span>
          </div>
        </a>
      )}
      <a href="/" className="block">
        <div className="flex items-center justify-between rounded-lg border border-cyan-400/20 bg-cyan-400/5 px-3 py-2 font-mono text-[11px] text-cyan-100 transition hover:bg-cyan-400/15">
          <span className="inline-flex items-center gap-2">
            <LayoutGrid size={13} className="text-cyan-300" /> LANDING
          </span>
          <span className="text-[9px] tracking-[0.2em] text-cyan-500/80">LIVE</span>
        </div>
      </a>
      <button
        onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
        className="block w-full text-left"
        title="Open the command palette"
      >
        <div className="flex items-center justify-between rounded-lg border border-violet-400/25 bg-violet-400/5 px-3 py-2 font-mono text-[11px] text-violet-100 transition hover:bg-violet-400/15">
          <span className="inline-flex items-center gap-2">
            <Command size={13} className="text-violet-300" /> COMMAND PALETTE
          </span>
          <span className="text-[9px] tracking-[0.2em] text-violet-400/80">⌘K</span>
        </div>
      </button>
    </div>
  );
}

export function ClockWidget() {
  const mounted = useMounted();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const hhmmss = now
    ? now.toISOString().slice(11, 19)
    : "--:--:--";
  const date = now
    ? now.toISOString().slice(0, 10)
    : "----.--.--";

  return (
    <div className="text-center">
      <div className="font-mono text-3xl tracking-[0.2em] text-cyan-100 [text-shadow:0_0_18px_rgba(34,211,238,0.5)]">
        {mounted ? hhmmss : "--:--:--"}
      </div>
      <div className="hud-label mt-1">UTC · {date}</div>
      <div className="mt-4 flex items-end justify-center gap-1" aria-hidden>
        {[38, 62, 45, 80, 30, 66, 52, 72, 40, 58].map((h, i) => (
          <div
            key={i}
            className="w-2 animate-pulse-ring rounded-sm bg-cyan-400/40"
            style={{ height: h, animationDelay: `${i * 0.12}s` }}
          />
        ))}
      </div>
      <div className="hud-label mt-2 flex items-center justify-center gap-1">
        <Cpu size={10} /> SYS LOAD (SIM)
      </div>
    </div>
  );
}
