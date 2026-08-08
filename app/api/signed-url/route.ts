// GET /api/signed-url — mint a short-lived ElevenLabs signed URL server-side so
// ELEVENLABS_API_KEY never reaches the client. Fetch this at tap time, not on
// mount (the URL expires ~15 min). See docs/api-contracts.md.

import { NextResponse } from "next/server";
import { ELEVENLABS_BASE_URL } from "@/lib/config";
import { logEvent } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;

  if (!apiKey || !agentId) {
    console.error("[signed-url] missing ELEVENLABS_API_KEY or ELEVENLABS_AGENT_ID");
    return NextResponse.json({ error: "voice_unconfigured" }, { status: 500 });
  }

  try {
    const res = await fetch(
      `${ELEVENLABS_BASE_URL}/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
      { headers: { "xi-api-key": apiKey } },
    );

    if (!res.ok) {
      console.error("[signed-url] ElevenLabs returned", res.status);
      return NextResponse.json({ error: "voice_unavailable" }, { status: 502 });
    }

    const data = (await res.json()) as { signed_url?: string };
    if (!data.signed_url) {
      return NextResponse.json({ error: "voice_unavailable" }, { status: 502 });
    }

    await logEvent({ source: "server", type: "session_auth", tool: "signed_url", ok: true });
    return NextResponse.json({ signed_url: data.signed_url });
  } catch (err) {
    console.error("[signed-url] failed", err);
    return NextResponse.json({ error: "voice_unavailable" }, { status: 502 });
  }
}
