// lib/extraction.ts — the Gemini extraction stage (the grounding layer).
// gemini-2.5-flash turns messy manual markdown into an ORDERED, ATOMIC step list.
// The responseSchema below MIRRORS ProcedureResult/Procedure/Step in lib/procedure.ts —
// change one, change both (see docs/api-contracts.md, docs/code-conventions.md).
//
// SDK facts (@google/genai), do not violate:
//  - Client reads the API key from process.env.GEMINI_API_KEY.
//  - Structured output: config.responseMimeType "application/json" + config.responseSchema
//    (OpenAPI-subset via the `Type` enum). systemInstruction is passed in `config`.
//  - response.text is the raw JSON string — always JSON.parse and guard it.
//  - Step.branches[].goTo is a number|"resolved"|"escalate" union Gemini schemas can't
//    express cleanly, so it's a STRING in the schema and coerced in TS after parse.

import { GoogleGenAI, Type, type Schema } from "@google/genai";
import { z } from "zod";

import { EXTRACTOR_MODEL } from "./config";
import type {
  ProcedureResult,
  ResolveProcedureRequest,
  DeviceIdentity,
  Step,
  Branch,
} from "./procedure";

// Lazy singleton — constructed at request time, not module load, so a build with
// no GEMINI_API_KEY set stays quiet and the key is read fresh when actually needed.
let _ai: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!_ai) _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return _ai;
}

// The extractor's "essence" — the 9 HARD RULES from docs/agent-config.md.
export const EXTRACTION_SYSTEM = `Convert a device's official manual into an ORDERED, ATOMIC troubleshooting procedure for ONE symptom.
You are the grounding layer of a voice assistant that reads steps aloud, one at a time, to a non-technical person.

HARD RULES:
1. Use ONLY instructions present in the manual text below. Never invent, infer, or fill gaps from general knowledge. If the manual contains no procedure for this symptom, return status "no_documentation".
2. ATOMICITY: exactly one physical action per step. Split every compound instruction into separate steps. Anything the user should confirm or observe goes in successCheck, never bundled into the action text.
3. Phrase for the EAR: short, plain, second person, no jargon, no figure or page references ("see Fig. 3"), no URLs read aloud.
4. PROVENANCE on EVERY step: sourceAnchor.sectionTitle = the nearest heading in the manual; sourceAnchor.quote = a verbatim snippet of 160 characters or fewer; sourceAnchor.anchorUrl = the source url plus "#fragment" when an anchor exists, otherwise the plain source url.
5. DESTRUCTIVE = true for any step that erases data or configuration (factory reset, firmware flash, wiping settings).
6. SAFETY: "refuse" for mains/line-voltage wiring, gas, or opening a sealed enclosure — include the step as a one-line hazard with NO how-to instructions; "caution" for a step that needs a spoken warning first; otherwise "none".
7. LABELING: mark each step "device_specific" or "generic", and roll the overall procedure up into device.identity.
8. BRANCHES: encode the manual's conditionals as { condition, goTo } where goTo is a 1-based step number, "resolved", or "escalate".
9. Use the MINIMUM number of steps, and end with a successCheck that confirms the symptom is actually resolved.

OUTCOMES:
- If you can build a grounded procedure, return status "resolved".
- If the whole request is unsafe (mains, gas, sealed enclosure), return status "safety_refusal" with the hazard and a spoken refusal that redirects to a qualified professional.
- If the manual does not document this symptom, return status "no_documentation" with a spoken message and next = "escalate" or "ask_for_model". Never invent steps to avoid this outcome.`;

/** Build the per-request user prompt fed to the extractor. */
export function buildUserPrompt(
  req: ResolveProcedureRequest,
  source: { url: string; title: string; isOfficial: boolean },
  markdown: string,
): string {
  return [
    `DEVICE: brand=${req.brand ?? ""}; category=${req.category ?? ""}; model=${req.model ?? "(unknown)"}`,
    `SYMPTOM (user's own words): ${req.symptom ?? ""}`,
    `SOURCE: title=${source.title}; url=${source.url}; official=${source.isOfficial}`,
    "",
    "MANUAL MARKDOWN — the ONLY permitted source of steps:",
    "<<<MANUAL",
    markdown,
    "MANUAL",
    "",
    "Return a single JSON object matching the provided schema. Set device.model to null if the model is unknown. Use the source url above for anchorUrl.",
  ].join("\n");
}

// ---- Gemini responseSchema mirroring ProcedureResult --------------------
// Flat, discriminated-ish object: `status` discriminates. Resolved fields
// (source/summary/totalSteps/steps), no_documentation fields (spokenMessage/next),
// and safety_refusal fields (hazard/spokenMessage) are all `nullable: true` so the
// structured-output schema stays valid (full `required`, no partial objects).
// `goTo` is a STRING here (number-as-string | "resolved" | "escalate") and coerced in TS.

const SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    status: {
      type: Type.STRING,
      enum: ["resolved", "no_documentation", "safety_refusal"],
    },
    device: {
      type: Type.OBJECT,
      properties: {
        brand: { type: Type.STRING },
        category: { type: Type.STRING },
        model: { type: Type.STRING, nullable: true },
        identity: { type: Type.STRING, enum: ["device_specific", "generic"] },
      },
      required: ["brand", "category", "model", "identity"],
      propertyOrdering: ["brand", "category", "model", "identity"],
    },
    // resolved
    source: {
      type: Type.OBJECT,
      nullable: true,
      properties: {
        url: { type: Type.STRING },
        title: { type: Type.STRING },
        isOfficial: { type: Type.BOOLEAN },
      },
      required: ["url", "title", "isOfficial"],
      propertyOrdering: ["url", "title", "isOfficial"],
    },
    summary: { type: Type.STRING, nullable: true },
    totalSteps: { type: Type.NUMBER, nullable: true },
    steps: {
      type: Type.ARRAY,
      nullable: true,
      items: {
        type: Type.OBJECT,
        properties: {
          stepNumber: { type: Type.NUMBER },
          text: { type: Type.STRING },
          successCheck: { type: Type.STRING, nullable: true },
          sourceAnchor: {
            type: Type.OBJECT,
            properties: {
              sectionTitle: { type: Type.STRING },
              quote: { type: Type.STRING },
              anchorUrl: { type: Type.STRING },
            },
            required: ["sectionTitle", "quote", "anchorUrl"],
            propertyOrdering: ["sectionTitle", "quote", "anchorUrl"],
          },
          destructive: { type: Type.BOOLEAN },
          safety: { type: Type.STRING, enum: ["none", "caution", "refuse"] },
          labeling: {
            type: Type.STRING,
            enum: ["device_specific", "generic"],
          },
          branches: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                condition: { type: Type.STRING },
                // number-as-string | "resolved" | "escalate"; coerced in TS.
                goTo: { type: Type.STRING },
              },
              required: ["condition", "goTo"],
              propertyOrdering: ["condition", "goTo"],
            },
          },
        },
        required: [
          "stepNumber",
          "text",
          "successCheck",
          "sourceAnchor",
          "destructive",
          "safety",
          "labeling",
          "branches",
        ],
        propertyOrdering: [
          "stepNumber",
          "text",
          "successCheck",
          "sourceAnchor",
          "destructive",
          "safety",
          "labeling",
          "branches",
        ],
      },
    },
    // no_documentation
    spokenMessage: { type: Type.STRING, nullable: true },
    next: {
      type: Type.STRING,
      enum: ["escalate", "ask_for_model"],
      nullable: true,
    },
    // safety_refusal
    hazard: {
      type: Type.STRING,
      enum: ["mains_electrical", "gas", "sealed_enclosure", "other"],
      nullable: true,
    },
  },
  required: [
    "status",
    "device",
    "source",
    "summary",
    "totalSteps",
    "steps",
    "spokenMessage",
    "next",
    "hazard",
  ],
  propertyOrdering: [
    "status",
    "device",
    "source",
    "summary",
    "totalSteps",
    "steps",
    "spokenMessage",
    "next",
    "hazard",
  ],
};

// ---- zod schema validating/coercing the parsed JSON ---------------------
// Mirrors SCHEMA above. goTo is a plain string here (coerced against the final
// step count in coerceGoTo after renumbering).

const DeviceSchema = z.object({
  brand: z.string(),
  category: z.string(),
  model: z.string().nullable(),
  identity: z.enum(["device_specific", "generic"]),
});

const SourceSchema = z.object({
  url: z.string(),
  title: z.string(),
  isOfficial: z.boolean(),
});

const BranchSchema = z.object({
  condition: z.string(),
  // Leaf union coerced/validated in TS after parse (out-of-range -> "escalate").
  goTo: z.string(),
});

const StepSchema = z.object({
  stepNumber: z.number(),
  text: z.string(),
  successCheck: z.string().nullable(),
  sourceAnchor: z.object({
    sectionTitle: z.string(),
    quote: z.string(),
    anchorUrl: z.string(),
  }),
  destructive: z.boolean(),
  safety: z.enum(["none", "caution", "refuse"]),
  labeling: z.enum(["device_specific", "generic"]),
  branches: z.array(BranchSchema),
});

const ProcedureResultSchema = z.object({
  status: z.enum(["resolved", "no_documentation", "safety_refusal"]),
  device: DeviceSchema,
  // resolved
  source: SourceSchema.nullable(),
  summary: z.string().nullable(),
  totalSteps: z.number().nullable(),
  steps: z.array(StepSchema).nullable(),
  // no_documentation
  spokenMessage: z.string().nullable(),
  next: z.enum(["escalate", "ask_for_model"]).nullable(),
  // safety_refusal
  hazard: z
    .enum(["mains_electrical", "gas", "sealed_enclosure", "other"])
    .nullable(),
});

type ParsedResult = z.infer<typeof ProcedureResultSchema>;

/**
 * Run the extraction stage. Always resolves to a valid ProcedureResult —
 * any failure degrades to no_documentation so the agent has something safe to say.
 */
export async function extractProcedure(
  req: ResolveProcedureRequest,
  source: { url: string; title: string; isOfficial: boolean },
  markdown: string,
): Promise<ProcedureResult> {
  const device = deviceFrom(req);

  try {
    const response = await getAI().models.generateContent({
      model: EXTRACTOR_MODEL,
      contents: buildUserPrompt(req, source, markdown),
      config: {
        systemInstruction: EXTRACTION_SYSTEM,
        responseMimeType: "application/json",
        responseSchema: SCHEMA,
      },
    });

    const raw = response.text;
    if (!raw || !raw.trim()) return escalateNoDoc(device);

    const parsed = ProcedureResultSchema.parse(JSON.parse(raw));
    return toProcedureResult(parsed, req, source);
  } catch (err) {
    console.error("[extraction.extractProcedure] failed", err);
    return escalateNoDoc(device);
  }
}

// ---- mapping parsed -> ProcedureResult ----------------------------------

function toProcedureResult(
  parsed: ParsedResult,
  req: ResolveProcedureRequest,
  source: { url: string; title: string; isOfficial: boolean },
): ProcedureResult {
  const device = mergeDevice(parsed.device, req);

  if (parsed.status === "safety_refusal") {
    return {
      status: "safety_refusal",
      device,
      hazard: parsed.hazard ?? "other",
      spokenMessage:
        parsed.spokenMessage?.trim() ||
        "That involves work I can't safely walk you through. Please have a qualified professional take a look.",
    };
  }

  if (parsed.status === "resolved") {
    const rawSteps = parsed.steps ?? [];
    if (rawSteps.length > 0) {
      // Renumber to 1-based contiguous, then coerce goTo against the final count.
      const total = rawSteps.length;
      const steps: Step[] = rawSteps.map((s, i) => ({
        stepNumber: i + 1,
        text: s.text,
        successCheck: s.successCheck?.trim() ? s.successCheck.trim() : null,
        sourceAnchor: {
          sectionTitle: s.sourceAnchor.sectionTitle,
          anchorUrl: s.sourceAnchor.anchorUrl?.trim() || source.url,
          quote: (s.sourceAnchor.quote ?? "").slice(0, 160),
        },
        destructive: Boolean(s.destructive),
        safety: s.safety,
        labeling: s.labeling,
        branches: s.branches.map((b): Branch => ({
          condition: b.condition,
          goTo: coerceGoTo(b.goTo, total),
        })),
      }));

      return {
        status: "resolved",
        procedure: {
          device,
          // Source is authoritative from the route, not the model.
          source: { url: source.url, title: source.title, isOfficial: source.isOfficial },
          totalSteps: steps.length,
          summary:
            parsed.summary?.trim() ||
            `Steps to fix your ${device.category || "device"}.`,
          steps,
        },
      };
    }
    // "resolved" with no usable steps -> fall through to no_documentation.
  }

  // no_documentation (or degraded resolved/safety with nothing usable).
  const next = parsed.next === "ask_for_model" ? "ask_for_model" : "escalate";
  return {
    status: "no_documentation",
    device,
    next,
    spokenMessage:
      parsed.spokenMessage?.trim() ||
      "I couldn't find a fix for that in the manual. I can get a family member on the phone to help, if you'd like.",
  };
}

/**
 * goTo comes off the wire as a string. Keep "resolved"/"escalate"; a numeric
 * string must resolve to a valid 1-based index, otherwise default to "escalate".
 */
function coerceGoTo(
  goTo: string,
  total: number,
): number | "resolved" | "escalate" {
  const v = (goTo ?? "").trim();
  if (v === "resolved") return "resolved";
  if (v === "escalate") return "escalate";
  const n = Math.trunc(Number(v));
  if (Number.isFinite(n) && n >= 1 && n <= total) return n;
  return "escalate";
}

function deviceFrom(req: ResolveProcedureRequest): DeviceIdentity {
  return {
    brand: (req.brand ?? "").trim(),
    category: (req.category ?? "").trim(),
    model: req.model?.trim() ? req.model.trim() : null,
    identity: "generic",
  };
}

// Prefer the request's brand/category (authoritative); take identity/model from
// the model's read of the manual.
function mergeDevice(
  parsed: ParsedResult["device"],
  req: ResolveProcedureRequest,
): DeviceIdentity {
  return {
    brand: (req.brand ?? "").trim() || parsed.brand,
    category: (req.category ?? "").trim() || parsed.category,
    model: req.model?.trim() ? req.model.trim() : parsed.model ?? null,
    identity: parsed.identity === "device_specific" ? "device_specific" : "generic",
  };
}

function escalateNoDoc(device: DeviceIdentity): ProcedureResult {
  return {
    status: "no_documentation",
    device,
    next: "escalate",
    spokenMessage:
      "I'm having trouble reading that manual right now. Let me get a family member on the phone to help.",
  };
}
