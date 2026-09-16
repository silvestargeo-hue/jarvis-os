"use client";

import type { ReactNode } from "react";

/**
 * Renders children only when a Convex backend is configured (NEXT_PUBLIC_ vars
 * are inlined at build time). Keeps hook-using pages prerender-safe and gives
 * a clean HUD panel in demo mode.
 */
export function ConvexGate({ module, children }: { module: string; children: ReactNode }) {
  if (process.env.NEXT_PUBLIC_CONVEX_URL) return <>{children}</>;
  return (
    <main className="relative flex min-h-screen items-center justify-center p-6">
      <div className="hud-panel hud-corner w-full max-w-md p-8">
        <p className="hud-label mb-2">{module} // BACKEND REQUIRED</p>
        <p className="font-mono text-xs text-cyan-200/80">
          This module needs the Convex backend. Configure{" "}
          <code>NEXT_PUBLIC_CONVEX_URL</code> at build time to enable it.
        </p>
        <a href="/dashboard" className="hud-btn mt-5">◂ BACK TO DECK</a>
      </div>
    </main>
  );
}
