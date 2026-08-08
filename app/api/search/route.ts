// POST /api/search  <- agent server tool `search_documentation`
// Lets the agent explicitly search the web for a device's official documentation via
// context.dev /web/search (lib/contextdev). Returns candidate pages (url, title) plus a
// best-official pick. Distinct from resolve_procedure, which also scrapes + builds steps.
// Always 200 with a typed body; logs the search for observability.

import { NextResponse } from "next/server";
import { search, bestOfficial } from "@/lib/contextdev";
import { logEvent } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const startedAt = Date.now();
  try {
    const body = (await req.json().catch(() => ({}))) as {
      brand?: unknown;
      category?: unknown;
      model?: unknown;
      query?: unknown;
      sessionId?: unknown;
    };
    const brand = s(body.brand);
    const category = s(body.category);
    const model = s(body.model);
    const sessionId = s(body.sessionId) || undefined;

    // Use an explicit query if given, else build one from the device fields.
    const query =
      s(body.query) ||
      `${brand} ${model} ${category} manual troubleshooting support`
        .replace(/\s+/g, " ")
        .trim();

    const results = await search(query);
    const best = bestOfficial(results);

    await logEvent({
      source: "server",
      type: "tool_call",
      tool: "search_documentation",
      sessionId,
      query,
      resultCount: results.length,
      best: best?.url ?? null,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json({
      query,
      results: results.slice(0, 5),
      best,
    });
  } catch (err) {
    console.error("[api/search] failed", err);
    return NextResponse.json({ query: "", results: [], best: null });
  }
}

function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
