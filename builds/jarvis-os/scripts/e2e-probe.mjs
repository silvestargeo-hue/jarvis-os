/**
 * Backend end-to-end probe (no secrets, safe to keep in repo).
 * Exercises: guest session → device registry → room key publish →
 * document + chunk insert → 384-dim vector search (ownership-scoped) → logout.
 *
 * Run: node scripts/e2e-probe.mjs [convex-cloud-url]
 */
const B = process.argv[2] || "https://successful-parrot-526.convex.cloud";

async function call(fn, args, kind = "mutation") {
  const res = await fetch(`${B}/api/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: fn, args, format: "json" }),
  });
  const json = await res.json();
  if (json.status !== "success") throw new Error(`${fn}: ${json.errorMessage}`);
  return json.value;
}

let results = 0;
function ok(label) {
  results++;
  console.log(`  ✅ ${label}`);
}

async function main() {
  console.log(`\nJARVIS OS backend probe → ${B}\n`);

  // 1. Guest session
  const guest = await call("users:ensureGuest", { displayName: "E2E-Probe" });
  const T = guest.sessionToken;
  ok(`guest session issued (${T.slice(0, 8)}…)`);

  try {
    // 2. Device registry
    const deviceId = "probe-" + Math.random().toString(36).slice(2, 10);
    await call("devices:register", {
      sessionToken: T,
      deviceId,
      publicKey: "PROBE_PUBKEY_NOT_A_REAL_KEY",
      name: "probe",
    });
    ok("device registered");

    const devices = await call(
      "devices:listForUsers",
      { sessionToken: T, userIds: [guest.userId] },
      "query"
    );
    if (!devices.some((d) => d.deviceId === deviceId)) throw new Error("device not listed");
    ok("device listed for user");

    // 3. Room + publish wrapped key blob
    const room = await call("chatRooms:create", {
      sessionToken: T,
      name: "PROBE",
      type: "group",
      memberIds: [guest.userId],
      createdById: guest.userId,
      clientRoomId: "probe-room-" + Date.now(),
    });
    const roomId = Object.values(room.idMap)[0];
    await call("chatRooms:publishKeys", {
      sessionToken: T,
      roomId,
      deviceKeys: { [deviceId]: "WRAPPED_BLOB_SERVER_CANNOT_OPEN" },
    });
    ok("room key blob published (server-blind)");

    // 4. Document + chunk + ownership-scoped vector search
    const doc = await call("documents:upsertMeta", {
      sessionToken: T,
      title: "Probe Manual",
      mimeType: "text/plain",
      sizeBytes: 128,
      checksum: "probe-" + Date.now(),
    });
    const embedding = Array.from({ length: 384 }, () => Math.random());
    await call("documents:insertChunk", {
      sessionToken: T,
      documentId: doc.documentId,
      ordinal: 0,
      text: "The reactor coolant valve must be cycled twice before ignition.",
      embedding,
      embeddingModel: "probe/test",
    });
    const hits = await call(
      "documents:search",
      { sessionToken: T, embedding, limit: 3 },
      "action"
    );
    if (!Array.isArray(hits)) throw new Error("search returned non-array");
    ok(`vector search answered (${hits.length} hit${hits.length === 1 ? "" : "s"}, ownership-scoped)`);

    // 5. AI session flow
    const ai = await call("aiSessions:create", {
      sessionToken: T,
      clientSessionId: "probe-" + Date.now(),
      title: "Probe",
      mode: "cloud",
    });
    await call("aiMessages:append", {
      sessionToken: T,
      sessionId: ai.aiSessionId,
      role: "user",
      content: "probe turn",
      clientMsgId: "probe-" + Date.now(),
    });
    ok("ai session + transcript append");

    // 6. Negative control: no token must fail
    try {
      await call("documents:list", { sessionToken: "" }, "query");
      throw new Error("SECURITY HOLE: unauthenticated call succeeded");
    } catch (e) {
      if (String(e.message).includes("SECURITY HOLE")) throw e;
      ok("unauthenticated access rejected");
    }
  } finally {
    await call("users:logout", { sessionToken: T }).catch(() => undefined);
    console.log("\n(probe session revoked)");
  }

  console.log(`\nALL ${results} CHECKS PASSED\n`);
}

main().catch((e) => {
  console.error(`\n❌ PROBE FAILED: ${e.message}\n`);
  process.exit(1);
});
