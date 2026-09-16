# JARVIS OS

Personal, futuristic OS-style platform — **your own AI operating system: unlimited, keyless, un-gatekept.**

| Build | Path | What it is |
|---|---|---|
| **Web app** | [`builds/jarvis-os`](builds/jarvis-os) | Next.js + Convex + Electron host: 5-tier keyless AI (Puter → Pollinations → Groq → WebLLM offline), E2EE mesh chat, RAG document library, PWA |
| **Desktop** | [`builds/jarvis-os/electron`](builds/jarvis-os/electron) | Electron 33 shell embedding the standalone Next server; auto-update via GitHub Releases |
| **Android** | [`builds/jarvis-mobile`](builds/jarvis-mobile) | Capacitor 6 shell → production web app; signed APK + Play Store AAB via `./build-apk.sh` |
| **Chat (zero-build)** | [`builds/jarvis-chat`](builds/jarvis-chat) | Standalone single-file Puter.js chat app — no build step, HTTP-served |

## Repo layout

Only the `builds/` trees are tracked. Secrets and heavy artifacts are ignored by design:

- `builds/jarvis-chat/config.local.js` — local API keys (never commit)
- `builds/jarvis-mobile/.keystore/` — release keystore + password file (never commit; **back it up** — losing it means you can never update the installed app)
- `node_modules/`, `.next/`, `dist/`, gradle/`build/` output — regenerable

## CI

`.github/workflows/desktop.yml` (inside `builds/jarvis-os/`) builds on `v*` tags:

- macOS DMG + zip, Windows NSIS + portable → published to **GitHub Releases** (feeds desktop auto-update)
- Signed Android APK (artifact) — needs repo secrets `JARVIS_KEYSTORE_B64` + `JARVIS_KEYSTORE_PASS` (see [`builds/jarvis-mobile/CI-SECRETS.md`](builds/jarvis-mobile/CI-SECRETS.md))

## Quick start (web)

```bash
cd builds/jarvis-os
pnpm install
pnpm dev            # Next.js dev server
npx convex dev      # Convex backend (separate terminal)
```

## Release (Android)

```bash
cd builds/jarvis-mobile
./build-apk.sh      # signed APK + AAB into dist/
```

See [`builds/AUDIT.md`](builds/AUDIT.md) for the full feature inventory, infrastructure map, and security audit.
