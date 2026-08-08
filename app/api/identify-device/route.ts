// POST /api/identify-device  <- browser (via the `identifyDevice` client tool)
// Vision device identification (Phase 2a, FR-8). Takes a base64 image, runs the Gemini
// vision stage (lib/vision), and returns a DeviceIdentification: brand/model/category +
// confidence + a grounded visual read (lights, cables, faults). ALWAYS returns HTTP 200
// with a typed body; failures degrade to a low-confidence empty result, never a raw 500.
//
// PRIVACY (NFR-11): the image is processed in memory and never persisted. We log ONLY
// the identification RESULT (brand/model/confidence) — never the image bytes.

import { NextResponse } from "next/server";

import { identifyDevice } from "@/lib/vision";
import { logEvent } from "@/lib/logger";
import type { DeviceIdentification } from "@/lib/procedure";

// The Gemini client (@google/genai) needs the Node runtime, not edge.
export const runtime = "nodejs";

const UNIDENTIFIED: DeviceIdentification = {
  brand: null,
  model: null,
  category: null,
  confidence: "low",
  spokenName: "the device",
  observations: [],
  possibleIssues: [],
};

export async function POST(req: Request) {
  const startedAt = Date.now();
  try {
    let body: { imageBase64?: unknown; mimeType?: unknown; sessionId?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      body = {};
    }

    const imageBase64 = str(body.imageBase64);
    const mimeType = str(body.mimeType) || "image/jpeg";
    const sessionId = str(body.sessionId) || undefined;

    if (!imageBase64) {
      return NextResponse.json(UNIDENTIFIED);
    }

    const result = await identifyDevice(imageBase64, mimeType);

    // LOG the RESULT only — never the image (NFR-11).
    await logEvent({
      source: "server",
      type: "tool_call",
      tool: "identify_device",
      sessionId,
      confidence: result.confidence,
      device: { brand: result.brand, model: result.model, category: result.category },
      observationCount: result.observations.length,
      possibleIssueCount: result.possibleIssues.length,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[identify-device] unexpected failure", err);
    await logEvent({
      source: "server",
      type: "tool_call",
      tool: "identify_device",
      status: "error",
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(UNIDENTIFIED);
  }
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
