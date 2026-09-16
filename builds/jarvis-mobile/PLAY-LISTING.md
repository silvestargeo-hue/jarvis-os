# JARVIS OS — Play Store Listing Draft

Ready to paste into **Play Console → Create app → Store listing**. Package: `os.jarvis.app` · AAB: `builds/jarvis-mobile/dist/JARVIS-OS-v1.0.0.aab`

---

## App title (≤30 chars)
```
JARVIS OS — AI Assistant
```

## Short description (≤80 chars)
```
Your own AI OS: unlimited keyless chat, voice, vision, docs & E2EE sync.
```

## Full description (≤4000 chars)
```
JARVIS OS is a personal, futuristic AI operating system — unlimited, keyless and private by design.

◆ UNLIMITED AI, NO ACCOUNT NEEDED
Five-tier engine stack with automatic fallback: your own OpenRouter key → Puter (keyless, 500+ models) → Pollinations (keyless) → Groq → WebLLM fully offline on your device (WebGPU). No subscription, no quota, no gatekeeping. Pin any engine or leave it on AUTO.

◆ AI TERMINAL
Streaming answers with rich formatting, one-tap copy, `/image` AI painting, engine priority selector, session search, and keyboard shortcuts. Attach images and vision-capable models will see them.

◆ VOICE MODE
Continuous listen → speak → listen conversation loop, read-aloud for any answer, and voice commands on every screen.

◆ YOUR DOCUMENTS, YOUR KNOWLEDGE
Import PDF, Word and Excel files. JARVIS chunks, embeds and indexes them locally on your device, then answers with citations you can verify. Export any answer to PDF, Word, Excel, Markdown or plain text.

◆ PRIVATE BY ARCHITECTURE
End-to-end encrypted mesh chat rooms — keys live on your devices, never with us. Local-first sync keeps working offline and catches up when you're back. The optional offline engine means AI works with no internet at all.

◆ INSTALLABLE & EVERYWHERE
Add to home screen as a PWA, share into JARVIS from other apps, or run it on desktop. Small installer, big brain: model weights stream into your own browser cache on demand — you choose what to keep.

◆ MISSION
Your own AI operating system: unlimited, keyless, un-gatekept.
```

## Graphics checklist (Play Console uploads)
| Asset | Spec | Source |
|---|---|---|
| App icon | 512×512 PNG | `builds/jarvis-os/public` icon set (regenerate at 512) |
| Feature graphic | 1024×500 PNG/JPG | dark HUD screenshot or boot-screen art |
| Phone screenshots | ≥2, 16:9 or 9:16 | AI terminal, voice mode, doc library w/ citations, E2EE room |

## Attributes
- **Category:** Productivity · **Tags:** AI assistant, chat, offline AI, documents
- **Contains ads:** No · **In-app purchases:** No · **In-app billing:** No
- **Content rating questionnaire:** no user-generated sharing with strangers (rooms are invite/private), no violence/gambling/etc → expect **Everyone**
- **Target audience:** 13+ (AI content; not designed for children)
- **Default language:** en-US

## Data safety form (Play Console)
Declared basis: E2EE rooms + local-first architecture; the app itself collects nothing for the developer.

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **No** |
| Is all user data encrypted in transit? | n/a (No collection) — but yes in practice (HTTPS + E2EE) |
| Can users request data deletion? | n/a — data lives on-device; uninstall removes it |

**Disclose anyway (third-party processing initiated by the user):** prompts/attachments the user actively sends are processed by the chosen AI engine (OpenRouter/Puter/Pollinations/Groq or on-device WebLLM); optional cloud sync stores only end-to-end encrypted ciphertext via Convex; voice input is processed by the browser/OS speech service. Add a privacy policy URL covering this (a static page is fine — put it in `public/` and note the Vercel URL).

## Release
- **Release name:** 1.0.0 · **versionCode 1** (auto-bumped from tags going forward — see `android/app/build.gradle`)
- **Track:** start with *Internal testing* (fast approval), promote to Production when review passes
- Upload `dist/JARVIS-OS-v1.0.0.aab`; Play re-signs with its own key automatically
