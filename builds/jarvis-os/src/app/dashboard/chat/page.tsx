"use client";

import { useMutation, useQuery } from "convex/react";
import { Phone, PhoneOff, Plus, Send, Video } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { db } from "@/lib/db";
import { ConvexGate } from "@/components/ConvexGate";
import { sendMessage, createRoom } from "@/lib/sync/queue";
import {
  open,
  seal,
  generateRoomKey,
  exportRoomKeyB64,
  importRoomKeyB64,
  getOrCreateIdentity,
  wrapRoomKeyForDevices,
  unwrapRoomKey,
  deriveWrapKey,
  type SealedPayload,
} from "@/lib/crypto";
import type { PersistedIdentity } from "@/lib/crypto";

type MessageRow = {
  _id: string;
  roomId: string;
  senderId: string;
  ciphertext: string;
  iv: string;
  kind: string;
  clientMsgId: string | null;
  clientCreatedAt?: number;
  _creationTime: number;
  senderName?: string; // enriched client-side
};

const ICE_SERVERS: RTCIceServer[] = (() => {
  const urls: string | string[] | undefined =
    process.env.NEXT_PUBLIC_TURN_URLS || undefined;
  const servers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
  if (urls) {
    const list = Array.isArray(urls) ? urls : urls.split(",").map((u) => u.trim()).filter(Boolean);
    if (list.length)
      servers.push({
        urls: list,
        username: process.env.NEXT_PUBLIC_TURN_USERNAME,
        credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
      });
  }
  return servers;
})();

export default function ChatPage() {
  return (
    <ConvexGate module="E2EE COMMS">
      <ChatApp />
    </ConvexGate>
  );
}

function ChatApp() {
  // ── identity ──────────────────────────────────────────────────────
  const ensureGuest = useMutation(api.users.ensureGuest);
  const registerDevice = useMutation(api.devices.register);
  const publishKeys = useMutation(api.chatRooms.publishKeys);
  const [userId, setUserId] = useState<string | null>(null);
  const [myName, setMyName] = useState("OPERATOR");

  const [sessionToken, setSessionToken] = useState<string | null>(null);

  useEffect(() => {
    const boot = async () => {
      let token = localStorage.getItem("jarvis.sessionToken");
      let id = localStorage.getItem("jarvis.userId");
      if (!token) {
        // No session → provision a guest session (chat stays keyless-accessible).
        const name = (localStorage.getItem("jarvis.displayName") ?? "OPERATOR").toUpperCase();
        const res = await ensureGuest({ displayName: name });
        token = res.sessionToken;
        id = res.userId;
        localStorage.setItem("jarvis.sessionToken", token);
        localStorage.setItem("jarvis.userId", id);
        localStorage.setItem("jarvis.role", "guest");
      }
      setSessionToken(token);
      setUserId(id);
      setMyName((localStorage.getItem("jarvis.displayName") ?? "OPERATOR").toUpperCase());
    };
    void boot();
  }, [ensureGuest]);

  // ── rooms ─────────────────────────────────────────────────────────
  const rooms = useQuery(
    api.chatRooms.list,
    sessionToken ? { sessionToken } : "skip"
  ) as
    | Array<{
        _id: string;
        name: string;
        type: string;
        memberIds: string[];
        deviceKeys?: Record<string, string> | null;
      }>
    | undefined;
  const [roomId, setRoomId] = useState<string | null>(null);

  useEffect(() => {
    if (rooms && rooms.length > 0 && !roomId) setRoomId(rooms[0]!._id);
  }, [rooms, roomId]);

  const activeRoom = useMemo(
    () => rooms?.find((r) => r._id === roomId) ?? null,
    [rooms, roomId]
  );

  // Device public keys of all room members (for wrapping the room key per device).
  const listDevices = useQuery(
    api.devices.listForUsers,
    sessionToken && activeRoom ? ({ sessionToken, userIds: activeRoom.memberIds } as never) : "skip"
  ) as Array<{ deviceId: string; userId: string; publicKey: string }> | undefined;

  const newRoom = useCallback(async () => {
    if (!userId || !sessionToken) return;
    const clientRoomId = crypto.randomUUID();
    await createRoom({
      sessionToken,
      name: `CHANNEL-${Date.now().toString(36).toUpperCase()}`,
      type: "group",
      memberIds: [userId],
      createdById: userId,
      clientRoomId,
    });
  }, [userId, sessionToken]);

  // ── room key (E2EE) ───────────────────────────────────────────────
  const [identity, setIdentity] = useState<PersistedIdentity | null>(null);
  const [roomKey, setRoomKey] = useState<CryptoKey | null>(null);

  // Register this device once per session (best-effort).
  useEffect(() => {
    if (!sessionToken) return;
    void (async () => {
      try {
        const id = await getOrCreateIdentity();
        setIdentity(id);
        await registerDevice({
          sessionToken,
          deviceId: id.deviceId,
          publicKey: id.publicKeyB64,
          name: navigator.userAgent.includes("Mobile") ? "mobile" : "desktop",
        });
      } catch {
        /* single-device flow still works without registration */
      }
    })();
  }, [sessionToken, registerDevice]);

  const publishRoomKey = useCallback(
    async (rid: string, key: CryptoKey, id: PersistedIdentity) => {
      try {
        if (!listDevices || !listDevices.length) return;
        const map = await wrapRoomKeyForDevices(id, key, listDevices);
        if (Object.keys(map).length)
          await publishKeys({ sessionToken: sessionToken!, roomId: rid as any, deviceKeys: map });
      } catch {
        /* key distribution is best-effort */
      }
    },
    [listDevices, sessionToken, publishKeys]
  );

  useEffect(() => {
    if (!roomId || !identity) return;
    const boot = async () => {
      const storageKey = `jarvis.roomKey.${roomId}`;
      const existing = localStorage.getItem(storageKey);
      let key: CryptoKey;
      if (existing) {
        key = await importRoomKeyB64(existing);
      } else {
        // Try to unwrap a blob published by another device first.
        const room = rooms?.find((r) => r._id === roomId) as
          | { _id: string; deviceKeys?: Record<string, string> | null }
          | undefined;
        const wrapped = room?.deviceKeys?.[identity.deviceId];
        if (wrapped) {
          key = await unwrapRoomKey(wrapped, identity.keyPair.privateKey!);
          localStorage.setItem(storageKey, await exportRoomKeyB64(key));
        } else {
          key = await generateRoomKey();
          localStorage.setItem(storageKey, await exportRoomKeyB64(key));
          void publishRoomKey(roomId, key, identity);
        }
      }
      setRoomKey(key);
      // Idempotent re-publish so later-joining devices get the key too.
      void publishRoomKey(roomId, key, identity);
    };
    void boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, identity]);

  // ── messages: server (live) + Dexie pending (offline) merge ───────
  const serverMessages = useQuery(
    api.messages.list,
    roomId && sessionToken ? { sessionToken, roomId: roomId as Id<"chatRooms"> } : "skip"
  ) as MessageRow[] | undefined;

  const pendingMessages = useLiveQuery(
    async () => {
      if (!roomId) return [];
      return db.messages
        .where("roomId")
        .equals(roomId)
        .filter((m) => m.pending === 1)
        .toArray();
    },
    [roomId],
    [] as Array<{
      id: string;
      roomId: string;
      senderId: string;
      ciphertext: string;
      iv: string;
      kind: string;
      clientMsgId: string;
      clientCreatedAt: number;
    }>
  );

  const [decrypted, setDecrypted] = useState<Record<string, string>>({});
  const sealCache = useRef(new Map<string, SealedPayload>());

  useEffect(() => {
    if (!roomKey) return;
    const all: Array<{ key: string; payload: SealedPayload }> = [
      ...(serverMessages ?? []).map((m) => ({
        key: m._id,
        payload: { ciphertext: m.ciphertext, iv: m.iv } as SealedPayload,
      })),
      ...(pendingMessages ?? []).map((m) => ({
        key: m.id,
        payload: { ciphertext: m.ciphertext, iv: m.iv } as SealedPayload,
      })),
    ];
    void (async () => {
      const next: Record<string, string> = {};
      for (const { key, payload } of all) {
        const cacheKey = `${key}:${payload.iv}`;
        const cached = sealCache.current.get(cacheKey);
        if (cached) continue;
        try {
          next[key] = await open(payload, roomKey);
          sealCache.current.set(cacheKey, payload);
        } catch {
          next[key] = "🔒 unable to decrypt with this device key";
        }
      }
      if (Object.keys(next).length > 0) setDecrypted((prev) => ({ ...prev, ...next }));
    })();
  }, [serverMessages, pendingMessages, roomKey]);

  // ── history pagination ────────────────────────────────────────────
  const [olderPages, setOlderPages] = useState<MessageRow[][]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [historyExhausted, setHistoryExhausted] = useState(false);

  const loadOlder = useCallback(async () => {
    if (!roomId || !sessionToken || loadingOlder || historyExhausted) return;
    const oldestLocal = [
      ...olderPages.flat(),
      ...(serverMessages ?? []),
    ].sort((a, b) => (a.clientCreatedAt ?? 0) - (b.clientCreatedAt ?? 0))[0];
    const before = oldestLocal?.clientCreatedAt ?? Date.now();
    setLoadingOlder(true);
    try {
      const res = (await fetch(process.env.NEXT_PUBLIC_CONVEX_URL + "/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: "messages:listOlder",
          args: { sessionToken, roomId, before, limit: 50 },
        }),
      }).then((r) => r.json())) as {
        status: string;
        value?: { messages: MessageRow[]; nextBefore: number | null; exhausted: boolean };
        errorMessage?: string;
      };
      if (res.status !== "success" || !res.value) throw new Error(res.errorMessage ?? "query failed");
      if (res.value.messages.length) setOlderPages((p) => [...p, res.value!.messages]);
      if (res.value.exhausted) setHistoryExhausted(true);
    } catch {
      /* transient — button remains for retry */
    } finally {
      setLoadingOlder(false);
    }
  }, [roomId, sessionToken, loadingOlder, historyExhausted, olderPages, serverMessages]);

  // ── send (via offline-sync queue) ─────────────────────────────────
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const send = useCallback(
    async (kind: "text" | "callOffer" | "callAnswer" | "callIce" | "callEnd", body?: unknown) => {
      if (!roomId || !roomKey || !userId || !sessionToken) return;
      const text = kind === "text" ? draft.trim() : JSON.stringify(body);
      if (!text) return;
      setSending(true);
      try {
        const payload = await seal(text, roomKey);
        await sendMessage({
          sessionToken,
          roomId,
          senderId: userId,
          ciphertext: payload.ciphertext,
          iv: payload.iv,
          kind,
          clientMsgId: crypto.randomUUID(),
          clientCreatedAt: Date.now(),
        });
        if (kind === "text") setDraft("");
      } finally {
        setSending(false);
      }
    },
    [roomId, roomKey, userId, sessionToken, draft]
  );

  // ── WebRTC signaling over the E2EE message stream ─────────────────
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [inCall, setInCall] = useState(false);
  const [incoming, setIncoming] = useState<string | null>(null); // senderId of caller

  const setupPeer = useCallback(async (withMedia: boolean) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.onicecandidate = (e) => {
      if (e.candidate) void send("callIce", e.candidate.toJSON());
    };
    pc.ontrack = (e) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0]!;
    };
    if (withMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    }
    pcRef.current = pc;
    return pc;
  }, [send]);

  const startCall = useCallback(async (video: boolean) => {
    const pc = await setupPeer(video);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    setInCall(true);
    void send("callOffer", { sdp: pc.localDescription!.toJSON(), video });
  }, [setupPeer, send]);

  const answerCall = useCallback(async () => {
    if (!incomingOffer.current) return;
    const pc = await setupPeer(incomingOffer.current.video);
    await pc.setRemoteDescription(incomingOffer.current.sdp);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    setInCall(true);
    setIncoming(null);
    void send("callAnswer", { sdp: pc.localDescription!.toJSON() });
  }, [incoming, setupPeer, send]);

  const endCall = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    setInCall(false);
    void send("callEnd", {});
  }, [send]);

  const incomingOffer = useRef<{ sdp: RTCSessionDescriptionInit; video: boolean } | null>(null);

  // React to signaling messages as they stream in
  useEffect(() => {
    if (!serverMessages || !roomKey) return;
    void (async () => {
      for (const m of [...serverMessages].reverse()) {
        if (m.kind === "text") continue;
        let body: any;
        try {
          body = JSON.parse(decrypted[m._id] ?? "");
        } catch {
          continue;
        }
        if (m.kind === "callOffer" && !inCall) {
          incomingOffer.current = { sdp: body.sdp, video: Boolean(body.video) };
          setIncoming(m.senderId);
        } else if (m.kind === "callAnswer" && pcRef.current) {
          await pcRef.current.setRemoteDescription(body.sdp);
        } else if (m.kind === "callIce" && pcRef.current) {
          try {
            await pcRef.current.addIceCandidate(body);
          } catch {
            /* stale candidate */
          }
        } else if (m.kind === "callEnd") {
          pcRef.current?.close();
          pcRef.current = null;
          setInCall(false);
          setIncoming(null);
        }
      }
    })();
  }, [serverMessages, decrypted, roomKey, inCall]);

  // ── render ────────────────────────────────────────────────────────
  const merged: MessageRow[] = [
    ...olderPages.flat(),
    ...(serverMessages ?? []),
    ...(pendingMessages ?? []).map((m) => ({ ...m, _id: m.id, _creationTime: m.clientCreatedAt, clientMsgId: m.clientMsgId })),
  ]
    .filter((m, i, arr) => arr.findIndex((x) => x._id === m._id) === i) // dedupe across pages
    .sort((a, b) => (a.clientCreatedAt ?? a._creationTime) - (b.clientCreatedAt ?? b._creationTime));

  return (
    <main className="flex h-screen flex-col">
      {/* header */}
      <div className="flex items-center justify-between border-b border-cyan-400/15 bg-slate-950/40 px-5 py-3">
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="hud-btn !py-1 text-[10px]">◂ DECK</a>
          <p className="hud-label">E2EE COMMS // {rooms?.find((r) => r._id === roomId)?.name ?? "…"}</p>
        </div>
        <div className="flex gap-2">
          {!inCall ? (
            <>
              <button className="hud-btn !py-1 text-[10px]" onClick={() => void startCall(false)}>
                <Phone size={11} /> VOICE
              </button>
              <button className="hud-btn !py-1 text-[10px]" onClick={() => void startCall(true)}>
                <Video size={11} /> VIDEO
              </button>
            </>
          ) : (
            <button className="hud-btn !py-1 text-[10px] !text-red-300" onClick={endCall}>
              <PhoneOff size={11} /> END CALL
            </button>
          )}
        </div>
      </div>

      {/* call stage */}
      {(inCall || incoming) && (
        <div className="border-b border-cyan-400/20 bg-slate-950/60 p-3">
          {incoming && !inCall && (
            <div className="mb-2 flex items-center justify-between rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 font-mono text-[11px] text-amber-200">
              <span>⟐ INCOMING CALL…</span>
              <button className="hud-btn !py-1 text-[10px]" onClick={() => void answerCall()}>ANSWER</button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <video ref={localVideoRef} autoPlay muted playsInline className="h-40 w-full rounded-lg border border-cyan-400/20 bg-black/60 object-cover" />
            <video ref={remoteVideoRef} autoPlay playsInline className="h-40 w-full rounded-lg border border-cyan-400/20 bg-black/60 object-cover" />
          </div>
        </div>
      )}

      {/* messages */}
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {!historyExhausted && merged.length > 0 && (
          <button
            onClick={() => void loadOlder()}
            disabled={loadingOlder}
            className="mx-auto block rounded border border-cyan-400/20 px-3 py-1 font-mono text-[10px] text-cyan-300/80 hover:bg-cyan-400/10 disabled:opacity-40"
          >
            {loadingOlder ? "LOADING…" : "⌃ LOAD OLDER MESSAGES"}
          </button>
  		)}
        {merged.length === 0 && (
          <p className="mt-10 text-center font-mono text-[11px] text-cyan-500/60">
            CHANNEL EMPTY — messages are sealed with AES-GCM before leaving this device.
          </p>
        )}
        {merged.map((m) => {
          const mine = m.senderId === userId;
          const pending = "pending" in m && (m as any).pending === 1;
          const body = decrypted[m._id] ?? "…";
          return (
            <div key={m._id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] rounded-xl border px-3 py-2 font-mono text-xs ${
                  mine
                    ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-100"
                    : "border-slate-500/30 bg-slate-800/40 text-slate-200"
                } ${pending ? "opacity-60" : ""}`}
              >
                <div className="mb-0.5 flex items-center gap-2 text-[9px] tracking-[0.2em] opacity-70">
                  <span>{mine ? myName : m.senderId.slice(-8)}</span>
                  {pending && <span className="text-amber-300">◌ QUEUED (offline)</span>}
                </div>
                <div className="whitespace-pre-wrap break-words">{body}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* composer */}
      <div className="flex gap-2 border-t border-cyan-400/15 bg-slate-950/40 p-3">
        <button className="hud-btn !px-3" onClick={() => void newRoom()} title="New channel">
          <Plus size={13} />
        </button>
        <input
          className="flex-1 rounded-lg border border-cyan-400/30 bg-slate-950/60 px-4 py-2 font-mono text-sm text-cyan-100 outline-none focus:ring-1 focus:ring-cyan-400/60"
          placeholder="Type a message… (sealed client-side before transmit)"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !sending && void send("text")}
          disabled={!roomId}
        />
        <button className="hud-btn !px-4" disabled={sending || !draft.trim()} onClick={() => void send("text")}>
          <Send size={13} />
        </button>
      </div>
    </main>
  );
}
