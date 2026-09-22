# JARVIS OS — Live Site (`builds/jarvis-site`)

The browser-native face of **JARVIS OS**: a real, working AI operating system that runs entirely client-side. No build step, no framework, no API keys. Deployed via GitHub Pages from this folder.

**Launch:** `index.html` → boot → lock → desktop. **Live URL:** `https://silvestargeo-hue.github.io/jarvis-os/`

---

## What it is

A single-page OS shell (`index.html`) plus 6 static showcase pages, a window manager, a 4-tier keyless AI core, 12 apps, an achievements engine, and a trilingual UI — in ~6,500 lines of dependency-free vanilla JS/CSS.

## Architecture

```
jarvis-site/
├── index.html            OS shell: boot, lock, desktop, dock, palette, windows
├── features/downloads/docs/lore/404.html   showcase + error pages
├── manifest.webmanifest  PWA: installable, shortcuts, share_target
├── sw.js                 service worker: offline shell (network-first nav/JS)
├── assets/
│   ├── i18n.js     EN/नेपाली/हिन्दी dictionaries — boot, lock, dock, voice grammar
│   ├── os.js       kernel: boot, lock/PIN, window manager (drag+snap), dock,
│   │               Ctrl+K palette, toasts, starfield/wallpapers, share-target
│   ├── ai.js       4-tier keyless AI: WebLLM (offline) → Puter.js →
│   │               Pollinations SSE → Pollinations GET. Silence-watchdog timeouts.
│   ├── library.js  RAG: chunking, TF-IDF retrieval, cited streaming answers,
│   │               txt/md/csv/pdf ingestion (pdf.js lazy CDN)
│   ├── mesh.js     E2EE chat: PBKDF2-SHA256(150k) → AES-GCM-256,
│   │               BroadcastChannel + Puter KV relay; terminal collab (!cmd)
│   ├── apps.js     AI Chat (vision/voice/personas), Image Lab, Terminal (30+
│   │               cmds), Notes, Tasks (AI subtasks), Files (memos), System
│   ├── code.js     AI Code Studio: sandboxed preview, AI build/explain
│   ├── voice.js    universal voice router: open/ask/paint/note/task/lock/theme
│   ├── surprises.js SFX synth, reactor hum, 5 themes, singularity (konami),
│   │               screensaver, nebula/warp wallpapers
│   ├── surprises2.js wake word, daily briefing (geo+weather+AI), global search,
│   │               backup/restore, stats, vault, 5 personas
│   ├── achievements.js 25 achievements (5 secret) on real usage stats
│   ├── settings.js every preference in one drawer (incl. offline AI toggle)
│   └── tour.js     first-launch greeting + 6-step spotlight tour
├── tools/make-og.js      regenerates assets/og-image.png (pure Node PNG writer)
├── test/
│   ├── runtime.test.js   20 headless tests: boots the whole OS in jsdom
│   └── live.test.js      4 REAL-network tests against the keyless AI engines
└── DEMO.md               60-second demo video script
```

## The AI engine stack (why it works keyless)

| Tier | Engine | Needs | Used for |
|---|---|---|---|
| 0 | WebLLM (in-browser Llama, WebGPU) | one-time ~1GB download | chat with **zero internet** (opt-in) |
| 1 | Puter.js | nothing (platform user-pays) | chat, vision, txt2img, 500+ models |
| 2 | Pollinations `POST /openai` (SSE) | nothing | streaming chat fallback |
| 3 | Pollinations `GET` | nothing | last-resort completion |

Selection is automatic with per-tier fallback; streaming uses a **silence watchdog** (25s no-byte abort), not a total-time cap, so slow reasoning models don't get killed mid-answer.

## Persistence & privacy

- Everything lives in `localStorage` under `jarvis.*` (notes, tasks, chat, library chunks, files, PIN, prefs, achievements).
- AI requests go browser → model endpoint directly; no JARVIS server exists.
- Mesh messages are encrypted **before** leaving the page; relays see ciphertext only.
- `Backup` exports/imports the whole OS as one JSON file.

## Tests

```bash
# full OS simulation (no network needed)
node test/runtime.test.js     # 20 PASS expected

# real keyless engines (needs internet)
node test/live.test.js        # 4 PASS expected — proves the AI is real
```

The runtime suite boots the actual OS in jsdom: launch/close all 12 apps, streaming chat, terminal exec, RAG retrieval + cited answer, AES-GCM roundtrip, achievements, themes, i18n switching, voice grammar. (jsdom canvas/speech/crypto are stubbed; the AI is stubbed there too — `live.test.js` covers the real engines.)

## Deploy

GitHub Actions (`.github/workflows/site.yml`) publishes this folder to Pages on every push touching it. One-time: **Settings → Pages → Source: GitHub Actions**. Then:

`https://silvestargeo-hue.github.io/jarvis-os/`

Local: `node server.js` → `http://localhost:4173` (zero dependencies).

## Keyboard / voice quick reference

- `Ctrl+K` palette · drag windows to edges to snap · `↑↑↓↓←→←→BA` singularity
- Voice: "open chat" · "paint a sunset" · "note buy milk" · "theme" (EN/नेपाली/हिन्दी)
- Terminal: `help`, `ai`, `img`, `lib ask`, `mesh join`, `offline`, `backup`, `vault`
