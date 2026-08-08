// POST /api/escalate  <- agent server tool `escalate`
// Called when the user asks for a human (or Manuel can't resolve the issue). Records the
// escalation to the on-device log and returns a confirmation + the admin contact so the
// agent can speak it. NOTE: opening the user's phone dialer is inherently client-side —
// that stays in the `escalate` client tool (tel: gag). This endpoint is the server-side
// record/confirm half, so escalations are logged and callable through a webhook tool.
// Always 200 with a typed body; never throws to the agent.

import { NextResponse } from "next/server";
import { logEvent } from "@/lib/logger";

export const runtime = "nodejs";

// Non-secret admin number the summary refers to (also used by the client tel: gag).
const ADMIN_TEL =
  process.env.NEXT_PUBLIC_ADMIN_TEL || process.env.ADMIN_TEL || "+971508888888";

export async function POST(req: Request) {
  const startedAt = Date.now();
  try {
    const body = (await req.json().catch(() => ({}))) as {
      device?: unknown;
      problem?: unknown;
      stepsAttempted?: unknown;
      outcomes?: unknown;
      sessionId?: unknown;
    };
    const device = s(body.device);
    const problem = s(body.problem);
    const stepsAttempted = Array.isArray(body.stepsAttempted)
      ? body.stepsAttempted.filter((x): x is string => typeof x === "string")
      : [];
    const outcomes = s(body.outcomes) || undefined;
    const sessionId = s(body.sessionId) || undefined;

    await logEvent({
      source: "server",
      type: "escalation",
      tool: "escalate",
      sessionId,
      device,
      problem,
      stepsAttempted,
      outcomes,
      adminTel: ADMIN_TEL,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json({
      escalated: true,
      adminTel: ADMIN_TEL,
      spokenMessage:
        "Okay — I'm escalating this to a family member now, and getting them on the phone for you.",
    });
  } catch (err) {
    console.error("[api/escalate] failed", err);
    return NextResponse.json({ escalated: false });
  }
}

function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
