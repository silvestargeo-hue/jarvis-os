"use client";

import { useEffect, useState } from "react";

/**
 * Loads https://js.puter.com/v2/ once after first paint. Puter.js gives the
 * whole OS a keyless premium AI gateway (500+ models, user-pays model) plus
 * free image generation (puter.ai.txt2img). Vision + txt2img degrade silently
 * when the SDK is absent (offline/desktop without network).
 */
export function PuterProvider() {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if ((window as { puter?: unknown }).puter) {
      setLoaded(true);
      return;
    }
    const s = document.createElement("script");
    s.src = "https://js.puter.com/v2/";
    s.async = true;
    s.onload = () => setLoaded(true);
    s.onerror = () => setLoaded(false);
    document.head.appendChild(s);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    // Warm a one-time system notice into the command palette log (optional).
    (window as { __jarvisPuterReady?: boolean }).__jarvisPuterReady = true;
  }, [loaded]);

  return null;
}
