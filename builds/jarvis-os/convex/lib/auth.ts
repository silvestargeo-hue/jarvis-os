import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { api } from "../_generated/api";

/**
 * Session authentication — the server-side gate.
 *
 * Clients pass their bearer token (issued once at login) as `sessionToken`.
 * We hash it and look up the session row; raw tokens are never stored or
 * logged. Expired/unknown tokens throw "unauthorized".
 *
 * ctx is typed loosely (any) on purpose: the placeholder _generated types
 * collapse per-table inference; codegen output will restore strict typing.
 */

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface AuthedUser {
  userId: string;
  role: "admin" | "member" | "guest";
  sessionId: string;
}

/** Validate a session token; throws on missing/expired/unknown. */
export async function requireUser(ctx: any, token: string | undefined): Promise<AuthedUser> {
  if (!token || token.length < 20) throw new Error("unauthorized: missing session token");
  const tokenHash = await sha256Hex(token);
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_tokenHash", (q: any) => q.eq("tokenHash", tokenHash))
    .unique();
  if (!session) throw new Error("unauthorized: invalid session");
  if (Date.now() > session.expiresAt) throw new Error("unauthorized: session expired");
  // Touch lastUsedAt only in writable contexts (queries are read-only in Convex).
  if (typeof (ctx.db as any).patch === "function") {
    await ctx.db.patch(session._id, { lastUsedAt: Date.now() });
  }
  return { userId: session.userId as string, role: session.role, sessionId: session._id as string };
}

/** Require an authenticated session with the admin role. */
export async function requireAdmin(ctx: any, token: string | undefined): Promise<AuthedUser> {
  const user = await requireUser(ctx, token);
  if (user.role !== "admin") throw new Error("forbidden: admin role required");
  return user;
}

/**
 * Action-context variant: actions have no ctx.db, so validation runs inside
 * an internal query. Any function that passes gets { userId, role }.
 */
export const validateSession = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_tokenHash", (q: any) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (!session) throw new Error("unauthorized: invalid session");
    if (Date.now() > session.expiresAt) throw new Error("unauthorized: session expired");
    return { userId: session.userId as string, role: session.role };
  },
});

export async function requireUserInAction(ctx: any, token: string | undefined): Promise<AuthedUser> {
  if (!token || token.length < 20) throw new Error("unauthorized: missing session token");
  const tokenHash = await sha256Hex(token);
  const authModule = (api as Record<string, any>)["lib/auth"];
  const user = (await ctx.runQuery(authModule.validateSession, { tokenHash })) as {
    userId: string;
    role: "admin" | "member" | "guest";
  };
  return { ...user, sessionId: "action" };
}
