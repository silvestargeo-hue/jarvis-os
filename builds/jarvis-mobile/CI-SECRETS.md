# JARVIS OS — GitHub CI Secrets Setup

Target repo: `silvestargeo-hue/jarvis-os` → **Settings → Secrets and variables → Actions → New repository secret**

CI consumes these in `builds/jarvis-os/.github/workflows/desktop.yml` (job `android-apk`, step *Sign APK*):
- `JARVIS_KEYSTORE_B64` — base64 of the release keystore
- `JARVIS_KEYSTORE_PASS` — keystore password

---

## Secret 1: `JARVIS_KEYSTORE_B64`

Generate the value locally (run in `builds/jarvis-mobile/`) and paste the **entire single-line output** into the secret field:

```bash
# macOS — copies straight to clipboard:
base64 -w0 .keystore/jarvis.keystore | pbcopy

# Linux — writes to a temp file, copy from it, then shred it:
base64 -w0 .keystore/jarvis.keystore > /tmp/ks.b64 && echo "copied? paste it, then:" && shred -u /tmp/ks.b64
```

Sanity check (optional): decode it back and compare hashes —

```bash
base64 -d /tmp/ks.b64 | sha256sum
sha256sum .keystore/jarvis.keystore   # must match the line above
```

## Secret 2: `JARVIS_KEYSTORE_PASS`

Value: the keystore password you chose when the keystore was generated (used by `.keystore/jarvis.keystore` — alias `jarvis`).

The password is intentionally **not** written in this repo. It lives only in your password manager and in the GitHub secret. Locally, `build-apk.sh` reads it from the gitignored file `builds/jarvis-mobile/.keystore/pass.txt` (or falls back to the `JARVIS_KS_PASS` environment variable).

---

## Why base64?

GitHub Actions secrets are string-only; the keystore is binary. CI decodes it at sign time:

```yaml
echo "$KS_B64" | base64 -d > .keystore/jarvis.keystore
```

## ⚠️ Before doing any of this

1. **Rotate the GitHub PAT** that leaked into shell history — github.com/settings/tokens
2. **Rotate the OpenRouter key** — openrouter.ai/keys
3. When creating the repo, push with a **fresh** credential, not the leaked one.

## Release flow once secrets are in

```bash
git tag v1.0.1 && git push origin main --tags
```

CI then builds + publishes: macOS DMG/zip, Windows NSIS/portable (→ GitHub Releases, feeding desktop auto-update), and the signed APK (artifact). The macOS/Windows jobs need no extra secrets — they use the built-in `GITHUB_TOKEN`.
