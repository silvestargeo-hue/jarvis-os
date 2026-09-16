"use client";

import { AnimatePresence } from "framer-motion";
import { Plus, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Panel, type PanelPosition } from "@/components/dashboard/Panel";
import { ClockWidget, IdentityWidget, ModulesWidget, SystemWidget } from "@/components/dashboard/widgets";
import { BriefingWidget } from "@/components/dashboard/BriefingWidget";
import { AmbientWidget } from "@/components/dashboard/AmbientWidget";

interface PanelState {
  id: string;
  title: string;
  width: number;
  position: PanelPosition;
}

const STORAGE_KEY = "jarvis.dashboard.panels.v1";

const DEFAULT_PANELS: PanelState[] = [
  { id: "clock", title: "CHRONO", width: 280, position: { x: 40, y: 90 } },
  { id: "system", title: "SYSTEM STATUS", width: 300, position: { x: 360, y: 60 } },
  { id: "identity", title: "OPERATOR", width: 260, position: { x: 700, y: 100 } },
  { id: "modules", title: "MODULES", width: 280, position: { x: 260, y: 330 } },
];

/** Existing users keep their saved layout — new default panels slot in once. */
function ensurePanel(list: PanelState[], id: string): PanelState[] {
  if (list.some((p) => p.id === id)) return list;
  const added: Record<string, PanelState> = {
    briefing: { id: "briefing", title: "BRIEFING", width: 340, position: { x: 560, y: 360 } },
    ambient: { id: "ambient", title: "AMBIENT ENGINE", width: 280, position: { x: 940, y: 90 } },
  };
  return added[id] ? [...list, added[id]] : list;
}

function loadPanels(): PanelState[] {
  if (typeof window === "undefined") return DEFAULT_PANELS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return ensurePanel(ensurePanel(DEFAULT_PANELS, "briefing"), "ambient");
    const saved = JSON.parse(raw) as Record<string, PanelPosition>;
    const merged = DEFAULT_PANELS.map((p) => ({ ...p, position: saved[p.id] ?? p.position }));
    return ensurePanel(ensurePanel(merged, "briefing"), "ambient");
  } catch {
    return ensurePanel(ensurePanel(DEFAULT_PANELS, "briefing"), "ambient");
  }
}

/** Phone-sized screens get a stacked deck instead of the drag canvas. */
function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return mobile;
}

const WIDGETS: Record<string, () => React.ReactNode> = {
  clock: () => <ClockWidget />,
  system: () => <SystemWidget />,
  identity: () => <IdentityWidget />,
  modules: () => <ModulesWidget />,
  briefing: () => <BriefingWidget />,
  ambient: () => <AmbientWidget />,
};

export function DashboardClient() {
  const constraintsRef = useRef<HTMLDivElement>(null);
  const [panels, setPanels] = useState<PanelState[]>(DEFAULT_PANELS);
  const [zCounter, setZCounter] = useState(10);
  const [zIndexMap, setZIndexMap] = useState<Record<string, number>>({});
  const [mounted, setMounted] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    setPanels(loadPanels());
    setMounted(true);
  }, []);

  const handleMove = useCallback((id: string, pos: PanelPosition) => {
    setPanels((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, position: pos } : p));
      try {
        const map = Object.fromEntries(next.map((p) => [p.id, p.position]));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
      } catch {
        /* storage full/blocked — drag still works this session */
      }
      return next;
    });
  }, []);

  const handleFocus = useCallback((id: string) => {
    setZCounter((z) => {
      setZIndexMap((m) => ({ ...m, [id]: z }));
      return z + 1;
    });
  }, []);

  const resetLayout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setPanels(loadPanels());
    setZIndexMap({});
  };

  const renderWidget = (id: string) => {
    const widget = WIDGETS[id];
    if (widget) return widget();
    if (id.startsWith("panel-")) {
      return (
        <p className="font-mono text-[11px] text-cyan-300/60">
          Custom module slot — content arrives in build phases #3–#5.
        </p>
      );
    }
    return null;
  };

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="scan-line" aria-hidden />

      {/* Top bar */}
      <div className="relative z-20 flex items-center justify-between gap-2 border-b border-cyan-400/15 bg-slate-950/40 px-4 py-3 backdrop-blur-sm sm:px-5">
        <p className="hud-label truncate">JARVIS OS // COMMAND DECK</p>
        <div className="flex shrink-0 gap-2">
          {!isMobile && (
            <button className="hud-btn !py-1.5 text-[10px]" onClick={resetLayout}>
              <RotateCcw size={11} /> RESET LAYOUT
            </button>
          )}
          {!isMobile && (
            <button
              className="hud-btn !py-1.5 text-[10px]"
              onClick={() => {
                const id = `panel-${Date.now().toString(36)}`;
                setPanels((prev) => [
                  ...prev,
                  {
                    id,
                    title: "NEW MODULE",
                    width: 260,
                    position: { x: 120 + prev.length * 40, y: 120 + prev.length * 30 },
                  },
                ]);
              }}
            >
              <Plus size={11} /> ADD PANEL
            </button>
          )}
        </div>
      </div>

      {isMobile ? (
        /* ── MOBILE: stacked, readable, zero overlap ─────────────────────── */
        <div className="relative z-10 space-y-3 p-3 pb-10">
          {panels.map((p) => (
            <section key={p.id} className="hud-panel hud-corner rise-in w-full">
              <div className="border-b border-cyan-400/20 px-3 py-2">
                <span className="hud-label !tracking-[0.2em]">{p.title}</span>
              </div>
              <div className="p-4">{renderWidget(p.id)}</div>
            </section>
          ))}
        </div>
      ) : (
        /* ── DESKTOP: free-drag HUD canvas ───────────────────────────────── */
        <div ref={constraintsRef} className="relative z-10 h-[calc(100vh-49px)] w-full">
          <AnimatePresence>
            {mounted &&
              panels.map((p) => (
                <Panel
                  key={p.id}
                  id={p.id}
                  title={p.title}
                  position={p.position}
                  width={p.width}
                  zIndex={zIndexMap[p.id] ?? 10}
                  constraintsRef={constraintsRef}
                  onFocus={handleFocus}
                  onMove={handleMove}
                  onClose={p.id.startsWith("panel-") ? (id) => setPanels((prev) => prev.filter((x) => x.id !== id)) : undefined}
                >
                  {renderWidget(p.id)}
                </Panel>
              ))}
          </AnimatePresence>

          {!mounted && (
            <div className="flex h-full items-center justify-center">
              <p className="hud-label animate-pulse">INITIALIZING DECK…</p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
