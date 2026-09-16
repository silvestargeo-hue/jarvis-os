import type { Metadata, Viewport } from "next";
import { Orbitron, JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";
import { RegisterSW } from "@/components/pwa/RegisterSW";
import { InstallButton } from "@/components/pwa/InstallApp";
import { VoiceCommandHud } from "@/lib/voice/commands";
import { CommandPalette } from "@/components/os/CommandPalette";
import { BootSequence, ElectronStorm } from "@/components/os/OsFx";
import { Telemetry } from "@/components/monitoring/Telemetry";
import { PuterProvider } from "@/components/os/PuterProvider";
import { ConnectionBadge } from "@/components/os/ConnectionBadge";
import "./globals.css";

const orbitron = Orbitron({
  subsets: ["latin"],
  variable: "--font-orbitron",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "JARVIS OS",
  description:
    "Futuristic OS-style platform: E2EE messaging, P2P calls, RAG document library, and dual-mode Jarvis AI (cloud + offline WebGPU).",
  manifest: "/manifest.webmanifest",
  applicationName: "JARVIS",
  appleWebApp: {
    // Enables standalone (app-like) mode when saved to the iPhone Home Screen.
    capable: true,
    title: "JARVIS",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#020617",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${orbitron.variable} ${jetbrains.variable}`}>
      <body className="iris-in min-h-screen bg-hud-bg font-hud text-cyan-50 antialiased">
        <PuterProvider />
        <Providers>{children}</Providers>
        <BootSequence />
        <ElectronStorm />
        <ConnectionBadge />
        <InstallButton />
        <CommandPalette />
        <VoiceCommandHud />
        <RegisterSW />
        <Telemetry />
      </body>
    </html>
  );
}
