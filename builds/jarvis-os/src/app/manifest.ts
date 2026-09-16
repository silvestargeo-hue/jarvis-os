import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "JARVIS OS",
    short_name: "JARVIS",
    description:
      "Personal AI operating system — E2EE comms, offline AI terminal, document intelligence.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#020617",
    theme_color: "#020617",
    orientation: "any",
    // Android share sheet: share links & text INTO JARVIS → /share routes
    // them to the AI terminal. (File shares need POST + SW interception;
    // text/link GET sharing is the universally supported form.)
    share_target: {
      action: "/share",
      method: "GET",
      enctype: "application/x-www-form-urlencoded",
      params: { title: "title", text: "text", url: "url" },
    },
    categories: ["productivity", "utilities"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        // Android adaptive launcher icon — full-bleed with safe-zone padding.
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        // SVG keeps crisp rendering where supported (desktop Chrome/Edge).
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
    shortcuts: [
      {
        name: "Jarvis AI Terminal",
        short_name: "AI",
        url: "/dashboard/ai",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Secure Chat",
        short_name: "Chat",
        url: "/dashboard/chat",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Document Library",
        short_name: "Library",
        url: "/dashboard/library",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
