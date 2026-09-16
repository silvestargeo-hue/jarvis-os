/**
 * Same-origin AI proxy — the free keyless cloud (Pollinations) called from the
 * browser can be blocked by COEP/CORS/UA policies depending on environment.
 * Routing through this server route makes the default engine work identically
 * on the web app, the desktop wrappers, and the Android wrapper.
 *
 * POST /api/ai/chat  body: OpenAI-compatible chat completion request.
 * Streams the upstream SSE body straight back.
 */
export const runtime = "nodejs";

const UPSTREAM = "https://text.pollinations.ai/openai";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const upstream = await fetch(UPSTREAM, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(body as Record<string, unknown>),
      referrer: "jarvis-os",
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return new Response(
      JSON.stringify({ error: `upstream ${upstream.status}`, detail: detail.slice(0, 200) }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
