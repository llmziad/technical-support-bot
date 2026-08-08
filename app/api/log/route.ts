// app/api/log/route.ts — receives client-side events (session lifecycle, client-tool
// calls) and appends them to the on-device JSONL log via lib/logger. Always 200; a
// logging failure must never surface to the browser.

import { NextResponse } from "next/server";
import { logEvent, type LogEvent } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<LogEvent>;
    if (body && typeof body.type === "string") {
      await logEvent({ source: "client", ...body, type: body.type });
    }
  } catch (err) {
    console.error("[api/log] failed", err);
  }
  return NextResponse.json({ ok: true });
}
