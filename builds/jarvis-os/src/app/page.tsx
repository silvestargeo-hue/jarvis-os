import { InstallSection } from "@/components/pwa/InstallApp";

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-8 overflow-hidden p-6">
      <div className="scan-line" aria-hidden />

      {/* HUD frame */}
      <div className="hud-panel hud-corner relative z-10 w-full max-w-3xl p-10 text-center animate-flicker">
        <p className="hud-label mb-4">SYSTEM ONLINE // BUILD 0.1.0</p>
        <h1 className="font-hud text-6xl font-bold tracking-[0.2em] text-cyan-100 [text-shadow:0_0_32px_rgba(34,211,238,0.6)]">
          JARVIS
        </h1>
        <p className="mt-3 font-mono text-sm uppercase tracking-[0.4em] text-cyan-400/70">
          Just A Rather Very Intelligent System
        </p>

        <div className="mx-auto my-8 h-px w-2/3 bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />

        <div className="grid grid-cols-2 gap-3 font-mono text-xs text-cyan-200/80 sm:grid-cols-4">
          {["E2EE MESH", "P2P VIDEO", "RAG LIBRARY", "DUAL-MODE AI"].map((t) => (
            <div key={t} className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 px-2 py-3">
              {t}
            </div>
          ))}
        </div>

        <a href="/auth" className="hud-btn mt-10 text-sm">
          INITIALIZE SYSTEM ▸
        </a>
      </div>

      <InstallSection />
    </main>
  );
}
