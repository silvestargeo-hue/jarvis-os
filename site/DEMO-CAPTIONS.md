# 🎬 Demo Captions — shot-by-shot with on-screen text overlays

Pair with `DEMO.md`. Captions are burn-in text (lower third, HUD style — cyan `#67e8f9`, mono font, subtle glow).
Record 2–3s of pad either side of each cut; captions snap on cut points.

| # | Time | Shot / action | On-screen caption (burn-in) |
|---|------|---------------|------------------------------|
| 1 | 0:00–0:06 | Boot sequence types itself; desktop unlocks | `JARVIS OS — an OS that lives in your browser` |
| 2 | 0:06–0:10 | Click 🎙 Greet me → JARVIS speaks; tour starts | `It talks back.` |
| 3 | 0:10–0:18 | AI Chat streams a real answer token-by-token | `Keyless AI. No account. No API key.` |
| 4 | 0:18–0:24 | `/image a neon city in the rain` paints | `And it paints.` |
| 5 | 0:24–0:30 | 📎 photo attached → vision describes it | `It sees.` |
| 6 | 0:30–0:38 | Library: paste text → index → cited answer | `Your documents, remembered. With citations.` |
| 7 | 0:38–0:44 | 🗣 "paint a waterfall at sunset" — hands-free | `Voice control. Just ask.` |
| 8 | 0:44–0:48 | 🌐 → नेपाली → हिन्दी — whole OS switches | `It speaks your language.` |
| 9 | 0:48–0:52 | ↑↑↓↓←→←→BA → singularity warp | `…and it hides secrets.` |
| 10 | 0:52–0:56 | ⌘K theme → gold; reactor hum on | `25 achievements. 14 surprises.` |
| 11 | 0:56–1:00 | Settings → Backup → jarvis-backup.json lands | `One file. Your whole OS. Yours.` |
| 12 | 1:00–1:05 | End card: logo ring over starfield | `JARVIS OS — unlimited · keyless · un-gatekept` + URL |

## End card spec
- Background: starfield canvas, ring logo centered (reuse og-image.png art at 2x)
- Text: `JARVIS OS` (display font, 72px) / `unlimited · keyless · un-gatekept` (mono, 20px) / live URL (18px)
- Hold 5s; fade audio (reactor hum + final boot chime) over 1s

## Caption CSS (paste into your recorder overlay / OBS as browser source)
```css
.caption {
  position: fixed; left: 50%; bottom: 8%; transform: translateX(-50%);
  font-family: "JetBrains Mono", monospace; font-size: 26px; letter-spacing: 1px;
  color: #67e8f9; text-shadow: 0 0 18px rgba(34,211,238,.55);
  background: rgba(3,7,17,.55); border: 1px solid rgba(56,189,248,.35);
  padding: 10px 22px; border-radius: 10px; white-space: nowrap;
}
```

## Audio plan
- 0:00 boot chime (SFX "boot") · OS TTS greets at 0:06
- Bed: reactor hum at -24dB from 0:48 to end
- Outro: SFX "ok" chime under end card
