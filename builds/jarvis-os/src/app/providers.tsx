"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { syncEngine } from "@/lib/sync/engine";
import { pendingOpCount } from "@/lib/db";

/**
 * App-wide providers:
 *  - ConvexReactClient for reactive server subscriptions
 *  - SyncEngine attachment: one drain loop, network-aware, replays the
 *    IndexedDB outbox from previous sessions on mount.
 *  - Global connectivity + queue-depth context consumed by HUD widgets.
 */

const ConvexContext = ({ children }: { children: ReactNode }) => {
  const [convex] = useState(() => {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) return null;
    return new ConvexReactClient(url);
  });

  const [online, setOnline] = useState(true);
  const [queueDepth, setQueueDepth] = useState(0);

  useEffect(() => {
    if (!convex) return;
    syncEngine.attach(convex);

    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const tick = setInterval(() => void pendingOpCount().then(setQueueDepth), 2000);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      clearInterval(tick);
    };
  }, [convex]);

  if (!convex) {
    // Graceful degraded mode: the HUD shell and static routes still render;
    // backend-driven features show their own "backend not configured" states.
    return (
      <>
        <SyncStatusContext.Provider value={{ online: false, queueDepth: 0 }}>
          {children}
          <div className="fixed bottom-3 right-3 z-50">
            <div className="hud-panel px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-amber-300/90">
              ⚠ BACKEND OFFLINE — DEMO MODE
            </div>
          </div>
        </SyncStatusContext.Provider>
      </>
    );
  }

  return (
    <ConvexProvider client={convex}>
      <SyncStatusContext.Provider value={{ online, queueDepth }}>
        {children}
      </SyncStatusContext.Provider>
    </ConvexProvider>
  );
};

export const SyncStatusContext = createContext<{ online: boolean; queueDepth: number }>({
  online: true,
  queueDepth: 0,
});
export const useSyncStatus = () => useContext(SyncStatusContext);

export function Providers({ children }: { children: ReactNode }) {
  return <ConvexContext>{children}</ConvexContext>;
}
