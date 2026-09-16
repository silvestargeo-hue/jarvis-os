import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser, sha256Hex } from "./lib/auth";

/**
 * Auth server functions: email OTP + guest sessions + Master PIN.
 *
 * Sessions: verifyOtp/ensureGuest issue a bearer token ONCE (64 hex chars);
 * only its SHA-256 is stored. Every sensitive function requires the token.
 */

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function newSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256HexLocal(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function issueSession(
  ctx: { db: any },
  userId: string,
  role: "admin" | "member" | "guest"
): Promise<string> {
  const token = newSessionToken();
  await ctx.db.insert("sessions", {
    userId,
    tokenHash: await sha256Hex(token),
    role,
    expiresAt: Date.now() + SESSION_TTL_MS,
    createdAt: Date.now(),
  });
  return token;
}

/**
 * Public hash-storing mutation used by the Vercel /api/auth/request-otp route.
 * Only the SHA-256 of the code crosses the network — plaintext never stored.
 * Enforces a 30s cooldown per (email, purpose) as rate limiting.
 */
export const storeOtpHash = mutation({
  args: {
    email: v.string(),
    codeHash: v.string(),
    purpose: v.union(v.literal("login"), v.literal("register")),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const recent = await ctx.db
      .query("otpCodes")
      .withIndex("by_email_purpose", (q: any) =>
        q.eq("email", email).eq("purpose", args.purpose)
      )
      .order("desc")
      .first();
    if (recent && Date.now() - recent.createdAt < 30_000) {
      throw new Error("Please wait 30 seconds before requesting another code");
    }
    await ctx.db.insert("otpCodes", {
      email,
      codeHash: args.codeHash,
      purpose: args.purpose,
      expiresAt: Date.now() + 10 * 60 * 1000,
      attempts: 0,
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});

export const verifyOtp = mutation({
  args: {
    email: v.string(),
    code: v.string(),
    purpose: v.union(v.literal("login"), v.literal("register"), v.literal("pinReset")),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();

    const otp = await ctx.db
      .query("otpCodes")
      .withIndex("by_email_purpose", (q: any) =>
        q.eq("email", email).eq("purpose", args.purpose)
      )
      .order("desc")
      .first();

    if (!otp) throw new Error("No code requested — go back and request one");
    if (otp.consumedAt) throw new Error("Code already used");
    if (Date.now() > otp.expiresAt) throw new Error("Code expired — request a new one");
    if ((otp.attempts ?? 0) >= 5) throw new Error("Too many attempts — request a new code");

    if ((await sha256HexLocal(args.code)) !== otp.codeHash) {
      await ctx.db.patch(otp._id, { attempts: (otp.attempts ?? 0) + 1 });
      throw new Error("Incorrect code");
    }

    await ctx.db.patch(otp._id, { consumedAt: Date.now() });

    // pinReset flow: verify the email code, wipe the PIN, done. The user then
    // sets a fresh PIN from settings (or logs in again, which re-prompts).
    if (args.purpose === "pinReset") {
      const target = await ctx.db
        .query("users")
        .withIndex("by_email", (q: any) => q.eq("email", email))
        .unique();
      if (!target) throw new Error("no account for that email");
      await ctx.db.patch(target._id, { pinHash: undefined, pinSalt: undefined, pinIterations: undefined, pinSetupAt: undefined });
      const token = await issueSession(ctx, target._id, target.role);
      return { sessionToken: token, userId: target._id, role: target.role, pinCleared: true, displayName: target.displayName, hasPin: false };
    }

    // Create-or-get the user
    let user = await ctx.db
      .query("users")
      .withIndex("by_email", (q: any) => q.eq("email", email))
      .unique();

    if (!user) {
      const userId = await ctx.db.insert("users", {
        email,
        displayName: email.split("@")[0]!,
        role: "member",
        createdAt: Date.now(),
        lastSeenAt: Date.now(),
      });
      user = await ctx.db.get(userId);
    } else if (user.dormant) {
      // One profile per email: a dormant account reactivates on OTP login.
      await ctx.db.patch(user._id, { dormant: false, dormantAt: undefined, lastSeenAt: Date.now() });
    } else {
      await ctx.db.patch(user._id, { lastSeenAt: Date.now() });
    }

    // Role assignment on login:
    // 1. The owner account is always admin (hardcoded safety net).
    // 2. Otherwise the first registered user becomes admin (RBAC bootstrap).
    const OWNER_EMAIL = "silvestargeo@gmail.com";
    let role = user!.role;
    if (role !== "admin") {
      const isOwner = email === OWNER_EMAIL;
      const anyAdmin = await ctx.db
        .query("users")
        .withIndex("by_role", (q: any) => q.eq("role", "admin"))
        .first();
      if (isOwner || !anyAdmin) {
        await ctx.db.patch(user!._id, { role: "admin" });
        role = "admin";
      }
    }

    const token = await issueSession(ctx, user!._id, role);

    return {
      sessionToken: token,
      userId: user!._id,
      role,
      displayName: user!.displayName,
      hasPin: Boolean(user!.pinHash),
    };
  },
});

/**
 * Provision a guest user (role:"guest") + session for keyless participation.
 */
export const ensureGuest = mutation({
  args: { displayName: v.string() },
  handler: async (ctx, args) => {
    const userId = await ctx.db.insert("users", {
      email: `guest-${Date.now().toString(36)}@local`,
      displayName: args.displayName.slice(0, 40),
      role: "guest",
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
    });
    const token = await issueSession(ctx, userId, "guest");
    return { sessionToken: token, userId };
  },
});

/** Logout: delete the caller's session server-side. */
export const logout = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const tokenHash = await sha256Hex(args.sessionToken);
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_tokenHash", (q: any) => q.eq("tokenHash", tokenHash))
      .unique();
    if (session) await ctx.db.delete(session._id);
    return { ok: true };
  },
});

export const setPin = mutation({
  args: {
    sessionToken: v.string(),
    pinHash: v.string(),
    pinSalt: v.string(),
    pinIterations: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    // Only the session owner can set their own PIN.
    await ctx.db.patch(user.userId as any, {
      pinHash: args.pinHash,
      pinSalt: args.pinSalt,
      pinIterations: args.pinIterations,
      pinSetupAt: Date.now(),
    });
    return { ok: true };
  },
});

/**
 * Profile WITHOUT pin material (SECURITY FIX: pinHash/pinSalt must never be
 * publicly readable). /lock uses getPinChallenge + verifyPinHash instead.
 */
export const getById = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const u = (await ctx.db.get(user.userId as any)) as any;
    if (!u) return null;
    return {
      userId: u._id,
      email: u.email,
      displayName: u.displayName,
      role: u.role,
      hasPin: Boolean(u.pinHash),
    };
  },
});

/**
 * PBKDF2 challenge: salt + iteration count are public by design (standard
 * PBKDF2 parameters); the derived hash itself never leaves the server.
 */
export const getPinChallenge = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const u = (await ctx.db.get(user.userId as any)) as any;
    if (!u || !u.pinHash) return { hasPin: false as const };
    return { hasPin: true as const, pinSalt: u.pinSalt!, pinIterations: u.pinIterations ?? 310_000 };
  },
});

function b64ToBytes(b64: string): number[] {
  const bin = atob(b64);
  const out = new Array<number>(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Manual constant-time compare (V8 runtime has no crypto.timingSafeEqual). */
function constantTimeEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/**
 * Verify a client-derived PIN hash. Rate-limited: ≥5 failures within 60s
 * (from the audit trail) lock verification for that user.
 */
export const verifyPinHash = mutation({
  args: {
    sessionToken: v.string(),
    candidateHash: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    const u = (await ctx.db.get(user.userId as any)) as any;
    if (!u || !u.pinHash) return { ok: false, error: "no pin set" };

    // Rate limit from recent failures
    const recentFails = await ctx.db
      .query("auditLog")
      .withIndex("by_actor", (q: any) => q.eq("actorId", user.userId))
      .order("desc")
      .take(8);
    const failsInWindow = recentFails.filter(
      (a) => a.action === "pin.verify.fail" && Date.now() - a.createdAt < 60_000
    ).length;
    if (failsInWindow >= 5) {
      return { ok: false, error: "locked for 60s — too many attempts" };
    }

    const ok = constantTimeEqual(b64ToBytes(args.candidateHash), b64ToBytes(u.pinHash));

    await ctx.db.insert("auditLog", {
      actorId: user.userId as any,
      action: ok ? "pin.verify.success" : "pin.verify.fail",
      targetType: "users",
      targetId: user.userId,
      createdAt: Date.now(),
    });

    return ok ? { ok: true } : { ok: false, error: "incorrect pin" };
  },
});

/**
 * Forgot-PIN recovery: verify an emailed 6-digit code (purpose=pinReset),
 * then wipe the user's PIN material. Returns a fresh session so the operator
 * lands directly in the OS to set a new PIN.
 */
export const clearPin = mutation({
  args: { email: v.string(), code: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const otp = await ctx.db
      .query("otpCodes")
      .withIndex("by_email_purpose", (q: any) =>
        q.eq("email", email).eq("purpose", "pinReset")
      )
      .order("desc")
      .first();

    if (!otp) throw new Error("No recovery code requested");
    if (otp.consumedAt) throw new Error("Code already used");
    if (Date.now() > otp.expiresAt) throw new Error("Code expired — request a new one");
    if ((otp.attempts ?? 0) >= 5) throw new Error("Too many attempts — request a new code");

    if ((await sha256HexLocal(args.code)) !== otp.codeHash) {
      await ctx.db.patch(otp._id, { attempts: (otp.attempts ?? 0) + 1 });
      throw new Error("Incorrect code");
    }
    await ctx.db.patch(otp._id, { consumedAt: Date.now() });

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q: any) => q.eq("email", email))
      .unique();
    if (!user) throw new Error("no account for that email");

    await ctx.db.patch(user._id, {
      pinHash: undefined,
      pinSalt: undefined,
      pinIterations: undefined,
      pinSetupAt: undefined,
    });

    await ctx.db.insert("auditLog", {
      actorId: user._id,
      action: "pin.reset",
      targetType: "users",
      targetId: user._id,
      metadata: { via: "email-otp" },
      createdAt: Date.now(),
    });

    const token = await issueSession(ctx, user._id, user.role);
    return {
      sessionToken: token,
      userId: user._id,
      role: user.role,
      displayName: user.displayName,
      pinCleared: true,
    };
  },
});

/**
 * Self-service deactivation: marks the account dormant (never deleted). The
 * email keeps its single profile; logging in again with an OTP reactivates it.
 */
export const deactivateMe = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx, args.sessionToken);
    // Kill all sessions first (the caller's own token dies too).
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q: any) => q.eq("userId", user.userId))
      .collect();
    for (const s of sessions) await ctx.db.delete(s._id);
    await ctx.db.patch(user.userId as any, { dormant: true, dormantAt: Date.now() });
    await ctx.db.insert("auditLog", {
      actorId: user.userId as any,
      action: "user.deactivate",
      targetType: "users",
      targetId: user.userId,
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});

/**
 * One-time bootstrap: promote the owner account to admin if no admin exists
 * yet (or if the caller IS the owner). Unauthenticated by design — it can only
 * ever grant admin to the hardcoded owner email, never to anyone else.
 */
export const promoteOwnerAdmin = mutation({
  args: {},
  handler: async (ctx) => {
    const OWNER_EMAIL = "silvestargeo@gmail.com";
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q: any) => q.eq("email", OWNER_EMAIL))
      .unique();
    if (!user) return { ok: false, error: "owner account not registered yet" };
    if (user.role === "admin") return { ok: true, alreadyAdmin: true };
    await ctx.db.patch(user._id, { role: "admin" });
    return { ok: true, promoted: true };
  },
});
