"use client";

import { useEffect } from "react";

/** Registers the JARVIS OS service worker (production only). */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* offline shell is a progressive enhancement */
    });
  }, []);
  return null;
}
