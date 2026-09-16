"use client";

/**
 * In-website "Install app" experience.
 *
 * - Chromium (Android/desktop Chrome/Edge): uses the native beforeinstallprompt
 *   flow, captured at module load so we never miss the event.
 * - iOS/iPadOS Safari: Apple exposes no install prompt API, so we show the
 *   exact Add-to-Home-Screen steps instead.
 * - Already installed (standalone display mode): renders nothing.
 *
 * <InstallButton /> is the floating pill in the root layout (site-wide);
 * <InstallSection /> is the richer card for the landing page. Both share the
 * platform detection and prompt logic below.
 */

import { useEffect, useState } from "react";

type Platform = "android" | "ios" | "desktop" | "unknown";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let capturedPrompt: BeforeInstallPromptEvent | null = null;

// Module-level capture: the event can fire before React hydrates.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    capturedPrompt = e as BeforeInstallPromptEvent;
    window.dispatchEvent(new Event("jarvis:install-available"));
  });
  window.addEventListener("appinstalled", () => {
    capturedPrompt = null;
    window.dispatchEvent(new Event("jarvis:install-done"));
  });
}

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) {
    return "ios";
  }
  if (/Android/i.test(ua)) return "android";
  if (/Win|Mac|Linux|CrOS/i.test(ua)) return "desktop";
  return "unknown";
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function useInstallState() {
  const [available, setAvailable] = useState(false);
  const [installed, setInstalled] = useState(true); // assume yes until measured (avoids flash)
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [showIosSteps, setShowIosSteps] = useState(false);
  const [status, setStatus] = useState<"idle" | "installing" | "installed">("idle");

  useEffect(() => {
    const standalone = isStandalone();
    setInstalled(standalone);
    setPlatform(detectPlatform());
    setAvailable(capturedPrompt !== null);

    const onAvailable = () => {
      setAvailable(true);
      setStatus("idle");
    };
    const onDone = () => {
      setInstalled(true);
      setStatus("installed");
    };
    window.addEventListener("jarvis:install-available", onAvailable);
    window.addEventListener("jarvis:install-done", onDone);
    return () => {
      window.removeEventListener("jarvis:install-available", onAvailable);
      window.removeEventListener("jarvis:install-done", onDone);
    };
  }, []);

  async function install(): Promise<"accepted" | "dismissed" | "ios" | "unavailable"> {
    if (capturedPrompt) {
      setStatus("installing");
      await capturedPrompt.prompt();
      const { outcome } = await capturedPrompt.userChoice;
      if (outcome === "accepted") setStatus("installed");
      else setStatus("idle");
      capturedPrompt = null;
      setAvailable(false);
      return outcome;
    }
    if (platform === "ios") {
      setShowIosSteps(true);
      return "ios";
    }
    return "unavailable";
  }

  return { available, installed, platform, showIosSteps, setShowIosSteps, status, install };
}

const IOS_STEPS = [
  "Tap the Share button (□↑) at the bottom of Safari",
  "Scroll down and tap “Add to Home Screen”",
  "Tap “Add” — JARVIS appears on your Home Screen",
];

function IosSteps({ onClose }: { onClose: () => void }) {
  return (
    <div className="mt-3 rounded-lg border border-cyan-400/30 bg-slate-900/90 p-4 text-left text-xs font-mono text-cyan-100/90">
      <div className="mb-2 flex items-center justify-between">
        <span className="hud-label">Install on iPhone / iPad</span>
        <button onClick={onClose} className="text-cyan-400/60 hover:text-cyan-200" aria-label="close">
          ✕
        </button>
      </div>
      <ol className="list-decimal space-y-1.5 pl-4">
        {IOS_STEPS.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
    </div>
  );
}

/** Floating install pill — rendered site-wide from the root layout. */
export function InstallButton() {
  const { available, installed, platform, showIosSteps, setShowIosSteps, status, install } = useInstallState();
  const [dismissed, setDismissed] = useState(false);

  if (installed || dismissed) return null;

  // No native prompt and not iOS → nothing to offer (e.g. Firefox).
  if (!available && platform !== "ios") return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 max-w-[calc(100vw-2.5rem)]">
      {showIosSteps && <IosSteps onClose={() => setShowIosSteps(false)} />}
      <div className="mt-2 flex items-center gap-2 rounded-full border border-cyan-400/40 bg-slate-900/95 px-4 py-2 shadow-[0_0_24px_rgba(34,211,238,0.25)] backdrop-blur">
        <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
        <span className="font-mono text-xs tracking-wider text-cyan-100">
          {status === "installed" ? "APP INSTALLED" : "GET THE APP"}
        </span>
        <button
          onClick={() => install()}
          disabled={status === "installing"}
          className="hud-btn !px-3 !py-1 text-[11px] disabled:opacity-50"
        >
          {status === "installing" ? "…" : "INSTALL"}
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="px-1 text-cyan-400/50 hover:text-cyan-200"
          aria-label="Dismiss install prompt"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

/** Landing-page install card with per-platform copy. */
export function InstallSection() {
  const { installed, platform, showIosSteps, setShowIosSteps, status, install } = useInstallState();

  const platformCopy: Record<Platform, string> = {
    android: "Installs like a Play Store app — launcher icon, full screen, offline support.",
    ios: "Adds to your Home Screen — runs full-screen like a native app.",
    desktop: "Installs from Chrome or Edge — taskbar/dock icon, own window, offline support.",
    unknown: "Use Chrome, Edge, or Safari to install as an app.",
  };

  return (
    <div className="hud-panel relative z-10 w-full max-w-3xl p-8 text-center">
      <p className="hud-label mb-2">INSTALL JARVIS OS</p>
      <h2 className="font-hud text-2xl font-bold tracking-widest text-cyan-100">USE IT LIKE A NORMAL APP</h2>
      <p className="mx-auto mt-3 max-w-xl font-mono text-xs leading-relaxed text-cyan-200/70">
        {platformCopy[platform]} No store required, no APK to sideload — and the website
        keeps working in the browser too. Free on Android, iPhone, Windows, Mac, and Linux.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button onClick={() => install()} disabled={status === "installing"} className="hud-btn text-sm disabled:opacity-50">
          {installed ? "✓ INSTALLED" : status === "installing" ? "INSTALLING…" : "INSTALL APP ▸"}
        </button>
        <a href="/dashboard" className="font-mono text-xs text-cyan-300/80 underline-offset-4 hover:underline">
          or continue in the browser →
        </a>
      </div>

      {showIosSteps && <div className="text-left"><IosSteps onClose={() => setShowIosSteps(false)} /></div>}

      <div className="mt-6 grid grid-cols-2 gap-2 font-mono text-[10px] uppercase tracking-wider text-cyan-200/50 sm:grid-cols-4">
        {["ANDROID ✓", "IPHONE ✓", "WINDOWS ✓", "MAC ✓"].map((t) => (
          <div key={t} className="rounded border border-cyan-400/20 px-2 py-1.5">{t}</div>
        ))}
      </div>
    </div>
  );
}
