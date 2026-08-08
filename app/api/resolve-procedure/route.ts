// POST /api/resolve-procedure  <- agent server tool `resolve_procedure`
// The step engine. Pipeline: seed map -> context.dev search -> context.dev scrape
// (PDF-aware) -> gemini-2.5-flash structured output (lib/extraction) -> ProcedureResult.
// ALWAYS returns HTTP 200 with a typed body; failures become no_documentation, never
// a raw 500, so the agent always has something safe to say (NFR-9). See api-contracts.md.

import { NextResponse } from "next/server";

import { seedLookup } from "@/lib/seed-map";
import { search, scrapeMarkdown, rankCandidates, isOfficialHost } from "@/lib/contextdev";
import { extractProcedure, extractGenericProcedure } from "@/lib/extraction";
import { ALLOW_GENERIC_FALLBACK, MAX_MANUAL_CANDIDATES } from "@/lib/config";
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

    // 1. Build an ordered list of candidate manual URLs: seed map first, else the
    //    RANKED search results (best-first by manual-likeness). We no longer pick one
    //    URL and hope — we try the top few.
    const seed = seedLookup(brand, model);
    let via: "seed" | "search" | "generic" = seed ? "seed" : "search";
    type Candidate = { url: string; title: string; isOfficial: boolean };
    let candidates: Candidate[] = [];

    if (seed) {
      candidates = [{ url: seed.url, title: seed.title, isOfficial: seed.isOfficial }];
    } else {
      const results = await search(
        `${brand} ${model ?? ""} ${category} manual`.replace(/\s+/g, " ").trim(),
      );
      candidates = rankCandidates(results, { model })
        .slice(0, MAX_MANUAL_CANDIDATES)
        .map((r) => ({
          url: r.url,
          title: r.title ?? "Manufacturer documentation",
          isOfficial: isOfficialHost(r.url),
        }));
    }

    // 2. Try each candidate in order: scrape -> extract -> return the FIRST grounded
    //    fix. A safety_refusal short-circuits (the symptom is unsafe regardless of
    //    source); a per-candidate no_documentation just moves on to the next URL.
    for (let rank = 0; rank < candidates.length; rank++) {
      const cand = candidates[rank];
      const downloadStart = Date.now();
      const scrape = await scrapeMarkdown(cand.url);
      if (!scrape.success || !scrape.markdown) {
        await logEvent({
          source: "server",
          type: "manual_download_failed",
          reason: "scrape_empty",
          sessionId,
          url: cand.url,
          via,
          rank,
          device: { brand, category, model: model ?? null },
        });
        continue;
      }
      const source = scrape.title ? { ...cand, title: scrape.title } : cand;

      await logEvent({
        source: "server",
        type: "manual_downloaded",
        sessionId,
        url: source.url,
        title: source.title,
        via,
        rank,
        contentLength: scrape.markdown.length,
        downloadMs: Date.now() - downloadStart,
        device: { brand, category, model: model ?? null },
      });

      const result = await extractProcedure(body, source, scrape.markdown);
      if (result.status === "resolved" || result.status === "safety_refusal") {
        await logEvent({
          source: "server",
          type: "tool_call",
          tool: "resolve_procedure",
          sessionId,
          status: result.status,
          via,
          rank,
          stepCount: result.status === "resolved" ? result.procedure.steps.length : 0,
          durationMs: Date.now() - startedAt,
          device: { brand, category, model: model ?? null },
        });
        return NextResponse.json(result);
      }
      // no_documentation from this candidate -> try the next one.
    }

    // 3. No manual yielded a grounded fix. Fall back to SAFE generic guidance
    //    (clearly labelled + disclosed) unless disabled; else no_documentation.
    if (ALLOW_GENERIC_FALLBACK) {
      via = "generic";
      const generic = await extractGenericProcedure(body);
      await logEvent({
        source: "server",
        type: "tool_call",
        tool: "resolve_procedure",
        sessionId,
        status: generic.status,
        via,
        stepCount:
          generic.status === "resolved" ? generic.procedure.steps.length : 0,
        durationMs: Date.now() - startedAt,
        device: { brand, category, model: model ?? null },
      });
      return NextResponse.json(generic);
    }

    await logEvent({
      source: "server",
      type: "manual_download_failed",
      reason: candidates.length ? "no_grounded_fix" : "no_url_found",
      sessionId,
      via,
      device: { brand, category, model: model ?? null },
    });
    return NextResponse.json(noDoc(device, model ? "escalate" : "ask_for_model"));
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
