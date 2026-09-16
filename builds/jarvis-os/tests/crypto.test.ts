import { describe, expect, it } from "vitest";
import {
  hashPin,
  derivePinHash,
  verifyPin,
  generateRoomKey,
  seal,
  open,
  exportRoomKeyB64,
  importRoomKeyB64,
  createIdentity,
  wrapRoomKeyForDevices,
  unwrapRoomKey,
  deriveWrapKey,
} from "../src/lib/crypto";

// Web Crypto is available in vitest's node environment (Node ≥ 20 exposes
// crypto.subtle globally) — the same primitives run in the browser.

describe("Master PIN (PBKDF2)", () => {
  it("produces a stable hash for the same pin+salt", async () => {
    const a = await hashPin("1234", "AAAAAAAAAAAAAAAAAAAAAA==");
    const b = await hashPin("1234", "AAAAAAAAAAAAAAAAAAAAAA==");
    expect(a.hash).toBe(b.hash);
  });

  it("produces different hashes for different salts (unique per user)", async () => {
    const a = await hashPin("1234");
    const b = await hashPin("1234");
    expect(a.hash).not.toBe(b.hash);
    expect(a.salt).not.toBe(b.salt);
  });

  it("verifies correct pin and rejects wrong pin", async () => {
    const { hash, salt } = await hashPin("987654");
    expect(await verifyPin("987654", hash, salt)).toBe(true);
    expect(await verifyPin("111111", hash, salt)).toBe(false);
  });

  it("derivePinHash matches hashPin given the stored challenge", async () => {
    const { hash, salt, iterations } = await hashPin("424242");
    expect(await derivePinHash("424242", salt, iterations)).toBe(hash);
  });
});

describe("Room key seal/open (AES-GCM)", () => {
  it("round-trips plaintext through seal → open", async () => {
    const key = await generateRoomKey();
    const secret = "MEET AT THE DOCK AT 0300 // bring the drive";
    const payload = await seal(secret, key);
    expect(payload.ciphertext).not.toContain(secret);
    const plain = await open(payload, key);
    expect(plain).toBe(secret);
  });

  it("cannot decrypt with the wrong key", async () => {
    const k1 = await generateRoomKey();
    const k2 = await generateRoomKey();
    const payload = await seal("classified", k1);
    await expect(open(payload, k2)).rejects.toThrow();
  });

  it("produces a different ciphertext each seal (fresh IV)", async () => {
    const key = await generateRoomKey();
    const a = await seal("same text", key);
    const b = await seal("same text", key);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
  });

  it("export/import round-trips the raw key material", async () => {
    const key = await generateRoomKey();
    const b64 = await exportRoomKeyB64(key);
    const restored = await importRoomKeyB64(b64);
    const payload = await seal("carry over", restored);
    expect(await open(payload, key)).toBe("carry over");
  });
});

describe("Device identity & multi-device key wrapping (ECDH + AES-KW)", () => {
  // createIdentity() is pure Web Crypto (no IndexedDB), so the wrap/unwrap
  // math is testable in Node; persistence itself is browser-only by design.
  const mkDevice = async (label: string) => {
    const id = await createIdentity();
    return { deviceId: `test-${label}`, keyPair: id.keyPair, publicKeyB64: id.publicKeyB64 };
  };

  it("wraps a room key to another device and unwraps it there", async () => {
    const deviceA = await mkDevice("a");
    const deviceB = await mkDevice("b");

    const roomKey = await generateRoomKey();
    const wrapped = await wrapRoomKeyForDevices(deviceA, roomKey, [
      { deviceId: deviceB.deviceId, publicKey: deviceB.publicKeyB64 },
    ]);
    expect(wrapped[deviceB.deviceId]).toBeTruthy();

    // On device B: derive the pairwise key from ITS identity + A's public key
    const pairwise = await deriveWrapKey(deviceB.keyPair, deviceA.publicKeyB64);
    const unwrapped = await unwrapRoomKey(wrapped[deviceB.deviceId]!, pairwise);
    const payload = await seal("multi device secret", unwrapped);
    expect(await open(payload, roomKey)).toBe("multi device secret");
  });

  it("skips its own device when distributing", async () => {
    const deviceA = await mkDevice("self");
    const roomKey = await generateRoomKey();
    const wrapped = await wrapRoomKeyForDevices(deviceA, roomKey, [
      { deviceId: deviceA.deviceId, publicKey: deviceA.publicKeyB64 },
    ]);
    expect(Object.keys(wrapped)).toHaveLength(0);
  });

  it("skips devices with malformed public keys instead of throwing", async () => {
    const deviceA = await mkDevice("x");
    const roomKey = await generateRoomKey();
    const wrapped = await wrapRoomKeyForDevices(deviceA, roomKey, [
      { deviceId: "broken", publicKey: "not-a-real-key" },
    ]);
    expect(Object.keys(wrapped)).toHaveLength(0);
  });
});
