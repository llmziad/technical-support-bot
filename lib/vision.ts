// lib/vision.ts — the Gemini VISION stage (Phase 2a device identification, FR-8).
// A photo of the device or its rating label -> { brand, model, category, confidence }
// PLUS a grounded visual read (which lights are on, what's cabled, visible faults).
// The responseSchema below MIRRORS DeviceIdentification in lib/procedure.ts — change
// one, change both (see docs/api-contracts.md, docs/agent-config.md).
//
// SDK facts (@google/genai), same as extraction.ts:
//  - Shared lazy client from lib/gemini.ts (reads GEMINI_API_KEY server-side).
//  - Multimodal input: contents = [{ inlineData: { data, mimeType } }, promptText].
//  - Structured output: config.responseMimeType "application/json" + config.responseSchema
//    (OpenAPI-subset via the `Type` enum). systemInstruction is passed in `config`.
//  - response.text is the raw JSON string — always JSON.parse and guard it.
// ALWAYS resolves to a valid DeviceIdentification; any failure degrades to a low-
// confidence, empty result so the route never throws to the agent (NFR-9).

import { Type, type Schema } from "@google/genai";
import { z } from "zod";

import { getGeminiClient } from "./gemini";
import { VISION_MODEL } from "./config";
import type { DeviceIdentification } from "./procedure";

// The vision system prompt — two jobs (identify + observe), both strictly grounded.
export const VISION_SYSTEM = `You look at ONE photo of a household device (or its rating/label sticker) for a voice assistant that helps a non-technical person fix it. You have two jobs.

1) IDENTIFY the device:
- brand, model, and category ("wifi router", "printer", "washing machine", ...).
- The rating/label sticker is higher-signal than the chassis — model numbers live on the sticker. When a label is visible, prefer it.
- confidence: "high" only when brand AND model are clearly legible; "medium" when the brand/type is clear but the model is uncertain; "low" when you are guessing. NEVER invent a model number — set it to null instead of guessing.

2) OBSERVE the device's visible state (a grounded visual diagnosis):
- observations: short, plain, spoken-style notes on what is ACTUALLY VISIBLE — indicator/LED lights and their colour and on/off state; cables and which ports are or are not plugged in; on-screen error codes or messages; physical damage; switch/dial positions.
- possibleIssues: the subset of the above that looks WRONG or misconfigured (an empty internet/WAN port, an unplugged cable, an amber or off status light, a cracked screen, a fault code on the display).

HARD RULES:
- Report ONLY what is visible in THIS photo. Never infer a fault you cannot see, never guess a fix, never describe a light or cable that isn't shown. If nothing looks wrong, return an empty possibleIssues array.
- Phrase every observation for the EAR: short, plain, second person where natural, no jargon.
- spokenName: how the assistant should say the device back ("Netgear R7000", or "your router" if the model is unknown). Never empty.
- If the image is unusable (too blurry/dark, not a device), return confidence "low", null brand/model/category, spokenName "the device", and empty arrays.`;

export const VISION_USER_PROMPT =
  "Identify this device and report its visible state. Return a single JSON object matching the provided schema. Use null for any of brand/model/category you cannot read; never guess a model number.";

// ---- Gemini responseSchema mirroring DeviceIdentification ----------------

const SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    brand: { type: Type.STRING, nullable: true },
    model: { type: Type.STRING, nullable: true },
    category: { type: Type.STRING, nullable: true },
    confidence: { type: Type.STRING, enum: ["high", "medium", "low"] },
    spokenName: { type: Type.STRING },
    observations: { type: Type.ARRAY, items: { type: Type.STRING } },
    possibleIssues: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    "brand",
    "model",
    "category",
    "confidence",
    "spokenName",
    "observations",
    "possibleIssues",
  ],
  propertyOrdering: [
    "brand",
    "model",
    "category",
    "confidence",
    "spokenName",
    "observations",
    "possibleIssues",
  ],
};

// ---- zod schema validating/coercing the parsed JSON ----------------------

const DeviceIdentificationSchema = z.object({
  brand: z.string().nullable(),
  model: z.string().nullable(),
  category: z.string().nullable(),
  confidence: z.enum(["high", "medium", "low"]),
  spokenName: z.string(),
  observations: z.array(z.string()),
  possibleIssues: z.array(z.string()),
});

// A safe, non-throwing fallback the route can always hand back to the agent.
const UNIDENTIFIED: DeviceIdentification = {
  brand: null,
  model: null,
  category: null,
  confidence: "low",
  spokenName: "the device",
  observations: [],
  possibleIssues: [],
};

/**
 * Identify a device (and read its visible state) from an image. `imageBase64` is the
 * raw base64 payload (no data: URI prefix). Always resolves to a valid
 * DeviceIdentification — any failure degrades to a low-confidence empty result.
 */
export async function identifyDevice(
  imageBase64: string,
  mimeType: string,
): Promise<DeviceIdentification> {
  if (!imageBase64) return UNIDENTIFIED;

  try {
    const response = await getGeminiClient().models.generateContent({
      model: VISION_MODEL,
      contents: [
        { inlineData: { data: imageBase64, mimeType: mimeType || "image/jpeg" } },
        { text: VISION_USER_PROMPT },
      ],
      config: {
        systemInstruction: VISION_SYSTEM,
        responseMimeType: "application/json",
        responseSchema: SCHEMA,
      },
    });

    const raw = response.text;
    if (!raw || !raw.trim()) return UNIDENTIFIED;

    const parsed = DeviceIdentificationSchema.parse(JSON.parse(raw));
    return normalize(parsed);
  } catch (err) {
    console.error("[vision.identifyDevice] failed", err);
    return UNIDENTIFIED;
  }
}

// Trim/clean the model's output into a tidy DeviceIdentification.
function normalize(parsed: DeviceIdentification): DeviceIdentification {
  const clean = (s: string): string => s.trim();
  const cleanArr = (a: string[]): string[] => a.map(clean).filter(Boolean);
  const nullable = (s: string | null): string | null => {
    const v = (s ?? "").trim();
    return v ? v : null;
  };
  return {
    brand: nullable(parsed.brand),
    model: nullable(parsed.model),
    category: nullable(parsed.category),
    confidence: parsed.confidence,
    spokenName: parsed.spokenName.trim() || "the device",
    observations: cleanArr(parsed.observations),
    possibleIssues: cleanArr(parsed.possibleIssues),
  };
}
