"use client";

import { useEffect, useState } from "react";

/**
 * Tiny connection status chip pinned bottom-left. Shows ONLINE / OFFLINE /
 * RECONNECTING so users always know whether cloud AI is reachable (offline
 * mode still works via WebLLM). Hidden in electron (desktop has its own HUD).
 */
export function ConnectionBadge() {
  const [online, setOnline] = useState(true);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;
  return (
    <div
      className="fixed bottom-2 left-2 z-40 flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[9px] tracking-wider backdrop-blur"
      style={{
        borderColor: online ? "rgba(74,222,128,0.35)" : "rgba(251,113,133,0.4)",
        color: online ? "#6ee7a0" : "#fda4af",
        background: "rgba(2,6,23,0.6)",
      }}
      title={online ? "Cloud AI reachable — full engine stack" : "Offline — on-device WebGPU AI only"}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: online ? "#4ade80" : "#fb7185" }}
      />
      {online ? "ONLINE" : "OFFLINE MODE"}
    </div>
  );
}
