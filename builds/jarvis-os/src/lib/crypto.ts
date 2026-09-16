/**
 * E2EE primitives (Web Crypto API only — no node crypto).
 *
 * Layered model:
 *   1. Device identity: ECDH P-256 keypair, private key non-extractable,
 *      persisted in IndexedDB.
 *   2. Room keys: AES-GCM-256 symmetric keys, shared with members by wrapping
 *      under an ECDH-derived pairwise key (server stores wrapped blobs only).
 *   3. Messages: sealed with the room key (AES-GCM, random 12-byte IV).
 *   4. Master PIN: PBKDF2-SHA256 (310k iterations default), salt stored per user.
 */

const PBKDF2_ITERATIONS = 310_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

// ── utils ────────────────────────────────────────────────────────────

export function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

// ── Master PIN (PBKDF2) ──────────────────────────────────────────────

export async function hashPin(
  pin: string,
  saltB64?: string
): Promise<{ hash: string; salt: string; iterations: number }> {
  const salt = saltB64 ? fromB64(saltB64) : randomBytes(16);
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS },
    baseKey,
    256
  );
  return { hash: toB64(bits), salt: toB64(salt), iterations: PBKDF2_ITERATIONS };
}

/** Derive a PIN hash against an existing server-stored challenge (salt + iterations). */
export async function derivePinHash(
  pin: string,
  saltB64: string,
  iterations: number
): Promise<string> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: fromB64(saltB64) as BufferSource, iterations },
    baseKey,
    256
  );
  return toB64(bits);
}

export async function verifyPin(
  pin: string,
  hashB64: string,
  saltB64: string
): Promise<boolean> {
  const { hash } = await hashPin(pin, saltB64);
  // Constant-time-ish compare
  const a = fromB64(hash);
  const b = fromB64(hashB64);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

// ── Device identity (ECDH P-256) ─────────────────────────────────────

export interface DeviceIdentity {
  keyPair: CryptoKeyPair;
  publicKeyB64: string; // SPKI format, exported to server
}

export async function createIdentity(): Promise<DeviceIdentity> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    false, // private key non-extractable
    ["deriveKey"]
  );
  const pubRaw = await crypto.subtle.exportKey("spki", keyPair.publicKey);
  return { keyPair, publicKeyB64: toB64(pubRaw) };
}

/** Derive a pairwise AES-KW key for wrapping room keys to a member. */
export async function deriveWrapKey(
  identity: CryptoKeyPair,
  memberPublicKeyB64: string
): Promise<CryptoKey> {
  const memberPub = await crypto.subtle.importKey(
    "spki",
    fromB64(memberPublicKeyB64) as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: memberPub },
    identity.privateKey,
    { name: "AES-KW", length: 256 },
    false,
    ["wrapKey", "unwrapKey"]
  );
}

// ── Room keys (AES-GCM 256) ──────────────────────────────────────────

export async function generateRoomKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function exportRoomKeyB64(key: CryptoKey): Promise<string> {
  return toB64(await crypto.subtle.exportKey("raw", key));
}

export async function importRoomKeyB64(rawB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    fromB64(rawB64) as BufferSource,
    { name: "AES-GCM" },
    true,
    ["encrypt", "decrypt"]
  );
}

/** Wrap a room key under a member's pairwise key (AES-KW). */
export async function wrapRoomKey(
  roomKey: CryptoKey,
  wrapKey: CryptoKey
): Promise<string> {
  return toB64(await crypto.subtle.wrapKey("raw", roomKey, wrapKey, "AES-KW"));
}

export async function unwrapRoomKey(
  wrappedB64: string,
  wrapKey: CryptoKey
): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    "raw",
    fromB64(wrappedB64) as BufferSource,
    wrapKey,
    "AES-KW",
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

// ── Message sealing (AES-GCM) ────────────────────────────────────────

export interface SealedPayload {
  ciphertext: string;
  iv: string;
}

export async function seal(
  plaintext: string,
  key: CryptoKey
): Promise<SealedPayload> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    enc.encode(plaintext) as BufferSource
  );
  return { ciphertext: toB64(ct), iv: toB64(iv) };
}

export async function open(
  payload: SealedPayload,
  key: CryptoKey
): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(payload.iv) as BufferSource },
    key,
    fromB64(payload.ciphertext) as BufferSource
  );
  return dec.decode(pt);
}

// ── Device identity persistence (IndexedDB — holds non-extractable CryptoKeys) ──

const IDB_NAME = "jarvis-identity";
const IDB_STORE = "keys";

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const d = await idb();
  return new Promise((resolve, reject) => {
    const req = d.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key: string, value: unknown): Promise<void> {
  const d = await idb();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export interface PersistedIdentity {
  deviceId: string;
  keyPair: CryptoKeyPair;
  publicKeyB64: string;
}

/**
 * This device's stable ECDH identity — created once, stored in IndexedDB
 * (IndexedDB can persist non-extractable CryptoKey objects directly).
 * The same identity wraps/unwraps room keys for THIS device across all rooms.
 */
export async function getOrCreateIdentity(): Promise<PersistedIdentity> {
  const existing = await idbGet<PersistedIdentity>("identity");
  if (existing) return existing;
  const identity = await createIdentity();
  const persisted: PersistedIdentity = {
    deviceId: uuidLocal(),
    keyPair: identity.keyPair,
    publicKeyB64: identity.publicKeyB64,
  };
  await idbPut("identity", persisted);
  return persisted;
}

function uuidLocal(): string {
  const c = crypto as { randomUUID?: () => string; getRandomValues: (a: Uint8Array) => Uint8Array };
  if (typeof c.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Distribute a room key to every registered device of the room's members
 * (except this device): ECDH-derived pairwise wrap per device public key.
 * Returns the { deviceId → wrappedKeyB64 } map for the server.
 */
export async function wrapRoomKeyForDevices(
  identity: PersistedIdentity,
  roomKey: CryptoKey,
  targetDevices: Array<{ deviceId: string; publicKey: string }>
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const d of targetDevices) {
    if (d.deviceId === identity.deviceId) continue;
    try {
      const wrapKey = await deriveWrapKey(identity.keyPair, d.publicKey);
      out[d.deviceId] = await wrapRoomKey(roomKey, wrapKey);
    } catch {
      /* skip devices whose public key is malformed — they stay locked out */
    }
  }
  return out;
}
