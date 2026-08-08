// POST /api/resolve-procedure  <- agent server tool `resolve_procedure`
// The step engine. Pipeline: seed map -> context.dev search -> context.dev scrape
// (PDF-aware) -> gemini-2.5-flash structured output (lib/extraction) -> ProcedureResult.
// ALWAYS returns HTTP 200 with a typed body; failures become no_documentation, never
// a raw 500, so the agent always has something safe to say (NFR-9). See api-contracts.md.

import { NextResponse } from "next/server";

import { seedLookup } from "@/lib/seed-map";
import { search, scrapeMarkdown, bestOfficial } from "@/lib/contextdev";
import { extractProcedure } from "@/lib/extraction";
import { logEvent } from "@/lib/logger";
import type {
  ProcedureResult,
  ResolveProcedureRequest,
  DeviceIdentity,
} from "@/lib/procedure";

// The Gemini (@google/genai) + context.dev clients need the Node runtime, not edge.
export const runtime = "nodejs";

export async function POST(req: Request) {
  const startedAt = Date.now();
  try {
    // Parse the body best-effort; missing fields still proceed.
    let body: ResolveProcedureRequest;
    try {
      body = (await req.json()) as ResolveProcedureRequest;
    } catch {
      body = {} as ResolveProcedureRequest;
    }

    const brand = str(body.brand);
    const category = str(body.category);
    const model = body.model ? str(body.model) : undefined;
    const symptom = str(body.symptom);
    const device = deviceFrom(brand, category, model);
    // Correlate with the browser session if the agent forwards it (optional).
    const sessionId = str((body as { sessionId?: unknown }).sessionId) || undefined;

    // LOG: the agent identified/mentioned a device and asked us to fetch its manual.
    await logEvent({
      source: "server",
      type: "device_mentioned",
      tool: "resolve_procedure",
      sessionId,
      device: { brand, category, model: model ?? null },
      symptom,
    });

    // 1. Discover the URL: committed seed map first, then live search.
    const seed = seedLookup(brand, model);
    const via: "seed" | "search" = seed ? "seed" : "search";
    let source: { url: string; title: string; isOfficial: boolean } | null = seed
      ? { url: seed.url, title: seed.title, isOfficial: true }
      : null;

    if (!source) {
      const results = await search(
        `${brand} ${model ?? ""} ${category} manual pdf`.replace(/\s+/g, " ").trim(),
      );
      const best = bestOfficial(results);
      if (!best) {
        await logEvent({
          source: "server",
          type: "manual_download_failed",
          reason: "no_url_found",
          sessionId,
          device: { brand, category, model: model ?? null },
        });
        return NextResponse.json(noDoc(device, model ? "escalate" : "ask_for_model"));
      }
      source = {
        url: best.url,
        title: best.title ?? "Manufacturer documentation",
        isOfficial: true,
      };
    }

    // 2. Retrieve clean markdown (PDF auto-parsed). Failure -> no_documentation.
    const downloadStart = Date.now();
    const scrape = await scrapeMarkdown(source.url);
    if (!scrape.success || !scrape.markdown) {
      await logEvent({
        source: "server",
        type: "manual_download_failed",
        reason: "scrape_empty",
        sessionId,
        url: source.url,
        via,
        device: { brand, category, model: model ?? null },
      });
      return NextResponse.json(noDoc(device, model ? "escalate" : "ask_for_model"));
    }
    if (scrape.title) source = { ...source, title: scrape.title };

    // LOG: the manual for this device was downloaded (via seed map or live search).
    await logEvent({
      source: "server",
      type: "manual_downloaded",
      sessionId,
      url: source.url,
      title: source.title,
      via,
      contentLength: scrape.markdown.length,
      downloadMs: Date.now() - downloadStart,
      device: { brand, category, model: model ?? null },
    });

    // 3. Construct + validate the procedure with the extraction stage.
    const result = await extractProcedure(body, source, scrape.markdown);

    // LOG: the resolve_procedure tool call completed.
    await logEvent({
      source: "server",
      type: "tool_call",
      tool: "resolve_procedure",
      sessionId,
      status: result.status,
      via,
      stepCount: result.status === "resolved" ? result.procedure.steps.length : 0,
      durationMs: Date.now() - startedAt,
      device: { brand, category, model: model ?? null },
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[resolve-procedure] unexpected failure", err);
    await logEvent({
      source: "server",
      type: "tool_call",
      tool: "resolve_procedure",
      status: "error",
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(noDoc(deviceFrom("", "", undefined), "escalate"));
  }
}

// ---- helpers -------------------------------------------------------------

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function deviceFrom(
  brand: string,
  category: string,
  model?: string,
): DeviceIdentity {
  return {
    brand,
    category,
    model: model ?? null,
    identity: "generic",
  };
}

function noDoc(
  device: DeviceIdentity,
  next: "escalate" | "ask_for_model",
): ProcedureResult {
  return {
    status: "no_documentation",
    device,
    next,
    spokenMessage:
      next === "ask_for_model"
        ? "I couldn't find the manual for that yet. If there's a model number on a sticker, that would help me find it."
        : "I couldn't find an official manual for that. I can get a family member on the phone to help, if you'd like.",
  };
}
