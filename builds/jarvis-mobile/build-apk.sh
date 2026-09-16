#!/usr/bin/env bash
# JARVIS OS — one-shot Android release builder (APK + Play Store AAB).
# Bootstraps a project-local Android SDK + JDK (if missing), generates a
# signing keystore, and produces a signed release APK **and** AAB.
set -euo pipefail
cd "$(dirname "$0")"

SDK="${ANDROID_SDK_ROOT:-$HOME/tools/android-sdk}"
JDK="${JAVA_HOME:-$HOME/tools/jdk17}"
# Keystore password: env var > gitignored .keystore/pass.txt.
KS_PASS="${JARVIS_KS_PASS:-$(cat .keystore/pass.txt 2>/dev/null || true)}"
export KS_PASS
export ANDROID_HOME="$SDK"
export JAVA_HOME="$JDK"
export PATH="$JDK/bin:$SDK/cmdline-tools/latest/bin:$SDK/platform-tools:$PATH"

echo "── [1/5] JDK + SDK sanity ──────────────────────────"
java -version 2>&1 | head -1
sdkmanager --version | sed 's/^/sdkmanager: /'

echo "── [2/5] Signing keystore ──────────────────────────"
mkdir -p .keystore
KS=".keystore/jarvis.keystore"
if [ ! -f "$KS" ]; then
  # Fresh machine: derive a random password and store it locally (gitignored).
  if [ -z "$KS_PASS" ]; then
    KS_PASS="$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)"
    printf '%s' "$KS_PASS" > .keystore/pass.txt
    chmod 600 .keystore/pass.txt
    echo "generated random keystore password -> .keystore/pass.txt (BACK IT UP!)"
  fi
  keytool -genkeypair -v \
    -keystore "$KS" -alias jarvis \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$KS_PASS" -keypass "$KS_PASS" \
    -dname "CN=JARVIS OS, OU=Personal, O=JARVIS, L=Earth, S=Grid, C=US"
  echo "keystore created (KEEP .keystore/ to sign future updates!)"
else
  [ -n "$KS_PASS" ] || { echo "ERROR: keystore exists but no password found. Set JARVIS_KS_PASS or create .keystore/pass.txt" >&2; exit 1; }
fi

echo "── [3/5] Gradle assembleRelease (APK) ──────────────"
cd android
echo "sdk.dir=$SDK" > local.properties
chmod +x gradlew
./gradlew assembleRelease --no-daemon -q

echo "── [4/5] Gradle bundleRelease (Play Store AAB) ─────"
./gradlew bundleRelease --no-daemon -q

echo "── [5/5] Output ────────────────────────────────────"
cd ..
mkdir -p dist
ls -lh android/app/build/outputs/apk/release/*.apk
ls -lh android/app/build/outputs/bundle/release/*.aab

# APK is zipalign + apksigner-signed (v1+v2 schemes).
APK_UNSIGNED="android/app/build/outputs/apk/release/app-release-unsigned.apk"
if [ -f "$APK_UNSIGNED" ]; then
  # Probe for a build-tools dir whose zipalign actually runs (on aarch64 hosts
  # some SDK copies ship x86 binaries that fail with "required file not found").
  BUILD_TOOLS=""
  for d in "$SDK"/build-tools/* "$HOME/tools/sdk-tools-aarch64/android-sdk"/build-tools/*; do
    [ -x "$d/zipalign" ] || continue
    out="$("$d/zipalign" 2>&1 | head -1 || true)" # zipalign exits 1 on no-args; banner goes to stderr
    case "$out" in
      *"Zip alignment"*) BUILD_TOOLS="$d"; break ;;
    esac
  done
  [ -n "$BUILD_TOOLS" ] || { echo "ERROR: no working build-tools/zipalign found" >&2; exit 1; }
  echo "using build-tools: $BUILD_TOOLS"
  "$BUILD_TOOLS/zipalign" -f -p 4 "$APK_UNSIGNED" dist/JARVIS-OS-v1.0.0-aligned.apk
  "$BUILD_TOOLS/apksigner" sign \
    --ks "$KS" --ks-pass "pass:$KS_PASS" --key-pass "pass:$KS_PASS" \
    --out dist/JARVIS-OS-v1.0.0.apk dist/JARVIS-OS-v1.0.0-aligned.apk
  rm -f dist/JARVIS-OS-v1.0.0-aligned.apk
fi

# AAB is signed with jarsigner (Play re-signs with its own key anyway).
AAB="android/app/build/outputs/bundle/release/app-release.aab"
if [ -f "$AAB" ]; then
  cp "$AAB" dist/JARVIS-OS-v1.0.0.aab
  jarsigner -keystore "$KS" -storepass "$KS_PASS" \
    -keypass "$KS_PASS" dist/JARVIS-OS-v1.0.0.aab jarvis
  jarsigner -verify dist/JARVIS-OS-v1.0.0.aab >/dev/null && echo "AAB signature: OK"
fi

echo
ls -lh dist/
