// lib/contextdev.ts — thin server-side client for context.dev.
// Secret (CONTEXT_DEV_API_KEY) is read here and never leaves the server.
// URL -> clean markdown (PDF-at-URL auto-parsed) and /web/search. See architecture.md.

import { CONTEXT_DEV_BASE_URL } from "./config";

function authHeader(): Record<string, string> {
  const key = process.env.CONTEXT_DEV_API_KEY;
  if (!key) throw new Error("CONTEXT_DEV_API_KEY is not set");
  return { Authorization: `Bearer ${key}` };
}

export interface SearchResult {
  url: string;
  title?: string;
}

/**
 * POST /web/search — find candidate manufacturer manual URLs.
 * Returns [] on any failure (failed context.dev calls are not billed) so the
 * caller can fall through to no_documentation rather than throwing.
 */
export async function search(query: string): Promise<SearchResult[]> {
  try {
    const res = await fetch(`${CONTEXT_DEV_BASE_URL}/web/search`, {
      method: "POST",
      headers: { ...authHeader(), "content-type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    return normalizeSearch(data);
  } catch (err) {
    console.error("[contextdev.search] failed", err);
    return [];
  }
}

interface ScrapeResult {
  success: boolean;
  markdown: string;
  title?: string;
}

/**
 * GET /web/scrape/markdown?url= — clean, LLM-ready markdown. PDF-at-URL is
 * auto-parsed. Returns { success: false } on failure (unbilled) so the caller
 * degrades to no_documentation.
 */
export async function scrapeMarkdown(url: string): Promise<ScrapeResult> {
  try {
    const res = await fetch(
      `${CONTEXT_DEV_BASE_URL}/web/scrape/markdown?url=${encodeURIComponent(url)}`,
      { headers: authHeader() },
    );
    if (!res.ok) return { success: false, markdown: "" };
    const data = (await res.json()) as Partial<ScrapeResult>;
    return {
      success: Boolean(data.success) && typeof data.markdown === "string",
      markdown: typeof data.markdown === "string" ? data.markdown : "",
      title: data.title,
    };
  } catch (err) {
    console.error("[contextdev.scrapeMarkdown] failed", err);
    return { success: false, markdown: "" };
  }
}

/** Prefer an official manufacturer domain over aggregators/forums (FR-13). */
export function bestOfficial(results: SearchResult[]): SearchResult | null {
  if (results.length === 0) return null;
  const aggregators = [
    "manualslib",
    "manua.ls",
    "reddit",
    "youtube",
    "amazon",
    "ebay",
    "quora",
  ];
  const official = results.find(
    (r) => !aggregators.some((a) => r.url.toLowerCase().includes(a)),
  );
  return official ?? results[0];
}

function normalizeSearch(data: unknown): SearchResult[] {
  if (!data || typeof data !== "object") return [];
  const maybe = data as { results?: unknown };
  if (!Array.isArray(maybe.results)) return [];
  return maybe.results
    .map((r): SearchResult | null => {
      if (r && typeof r === "object" && typeof (r as { url?: unknown }).url === "string") {
        const rec = r as { url: string; title?: unknown };
        return { url: rec.url, title: typeof rec.title === "string" ? rec.title : undefined };
      }
      return null;
    })
    .filter((r): r is SearchResult => r !== null);
}
