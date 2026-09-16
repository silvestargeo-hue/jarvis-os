import { createHash, randomInt } from "crypto";
import { NextResponse } from "next/server";

/**
 * OTP issuance endpoint (server-side, Vercel).
 *  - Generates the 6-digit code and keeps it in memory only.
 *  - Stores just the SHA-256 hash in Convex (public mutation — safe).
 *  - Sends the email via Resend (RESEND_API_KEY lives in Vercel env).
 *  - Falls back to returning the code for on-screen demo use if sending fails,
 *    so the auth flow never dead-ends.
 */

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;

async function convexMutate(path: string, args: Record<string, unknown>) {
  if (!CONVEX_URL) throw new Error("Convex not configured");
  const res = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, args, format: "json" }),
  });
  const json = (await res.json()) as
    | { status: "success"; value: unknown }
    | { status: "error"; errorMessage: string };
  if (json.status !== "success") throw new Error(json.errorMessage);
  return json.value;
}

async function sendEmail(to: string, code: string): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY not configured" };
  const from = process.env.RESEND_FROM ?? "JARVIS OS <onboarding@resend.dev>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `JARVIS OS access code: ${code}`,
      html: `
        <div style="font-family:monospace;background:#020617;color:#a5f3fc;padding:32px;border:1px solid #164e63;border-radius:12px">
          <p style="letter-spacing:0.3em;font-size:11px;color:#22d3ee;margin:0 0 16px">JARVIS OS // IDENTITY VERIFICATION</p>
          <p style="font-size:14px;color:#cffafe">Your access code:</p>
          <p style="font-size:36px;letter-spacing:0.4em;color:#67e8f9;margin:8px 0 16px"><b>${code}</b></p>
          <p style="font-size:12px;color:#67e8f9">Expires in 10 minutes. If you didn't request this, ignore this message.</p>
        </div>`,
    }),
  });
  if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${(await res.text()).slice(0, 150)}` };
  return { ok: true };
}

export async function POST(req: Request) {
  try {
    const { email, purpose } = (await req.json()) as {
      email?: string;
      purpose?: "login" | "register";
    };
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }

    const code = String(randomInt(100000, 1000000));
    const codeHash = createHash("sha256").update(code).digest("hex");

    // Rate limit + durable hash storage happen inside Convex.
    await convexMutate("users:storeOtpHash", {
      email: email.trim().toLowerCase(),
      codeHash,
      purpose: purpose ?? "register",
    });

    const mail = await sendEmail(email.trim().toLowerCase(), code);
    if (mail.ok) {
      return NextResponse.json({ sent: true, expiresInMs: 600_000 });
    }
    return NextResponse.json({
      sent: false,
      demoCode: code,
      sendError: mail.error,
      expiresInMs: 600_000,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error" },
      { status: 500 }
    );
  }
}
