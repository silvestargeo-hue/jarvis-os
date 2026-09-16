"use client";

import { Analytics } from "@vercel/analytics/react";
import { useEffect } from "react";

/**
 * Telemetry: opt-out-free, key-free analytics + optional Sentry.
 * Sentry activates only when NEXT_PUBLIC_SENTRY_DSN is set at build time;
 * without it this component is a cheap no-op.
 */
export function Telemetry() {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) return;
    void (async () => {
      try {
      // Sentinel string for bundlers; resolved only if Sentry is ever added.
      const mod = "@sentry/nextjs";
      const Sentry = await import(/* webpackIgnore: true */ mod);
      (Sentry as any).init({
        dsn,
        tracesSampleRate: 0.1,
        sendClientReports: true,
      });
      } catch {
        /* Sentry not installed — monitoring stays Analytics-only */
      }
    })();
  }, []);
  return <Analytics />;
}
