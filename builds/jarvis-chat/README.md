# JARVIS Chat — Puter.js

Standalone, **zero-build** AI chat app. Pure HTML/JS served over HTTP.

## Engines
- **Puter.js (primary)** — keyless, no signup required in code. 500+ models (GPT, Claude, Gemini, DeepSeek…). On the first AI call a Puter sign-in popup may appear; the user's Puter account covers usage (user-pays model).
- **OpenRouter (fallback)** — used automatically if Puter fails. The key is read from `config.local.js` (gitignored) or entered at runtime via ⚙ SETTINGS.

## Run

Puter.js requires an HTTP origin (not `file://`):

```bash
cd builds/jarvis-chat
python3 -m http.server 8787
# open http://localhost:8787
```

## Files
| File | Purpose |
|---|---|
| `index.html` | The entire app: HUD UI, streaming chat, engine fallback, settings |
| `config.local.js` | Local secrets (`window.JARVIS_CONFIG`) — **gitignored**, never commit |
| `.gitignore` | Keeps `config.local.js` out of version control |

## Notes
- History (last 60 turns) persists in `localStorage` under `jarvis.chat.*`.
- Streaming works for both engines (SSE for OpenRouter, async-iterable chunks for Puter).
- Stop button aborts generation mid-stream and keeps partial output.
- Required attribution: footer links to <https://developer.puter.com> ("Powered by Puter").
- ⚠️ The OpenRouter key was shared in chat — treat it as compromised and rotate it at <https://openrouter.ai/keys> when convenient.
