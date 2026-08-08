// lib/seed-map.ts — store #1's pre-warm for the demo (a cache, not RAG).
// A committed seed map so demo devices never miss retrieval on stage; the live
// context.dev search handles everything else. Keyed by `${brand}|${model}`,
// lowercased and trimmed. See architecture.md ("The three stores") and
// phases/phase-0-hackathon.md.
//
// NOTE: exact model numbers get finalized on demo day (once we know which
// physical props are on the table) — the brand + URL shape is what matters here.
//
// Every URL below was verified 2026-08-08 by scraping it through context.dev and
// confirming it returns full English manual text (troubleshooting/reset/setup
// content), not a 403/empty/nav page. `isOfficial` reflects the actual host: the
// R7000 and TU7000 official PDFs 403 or are non-English, so those point at the
// reliable manualslib mirror of the same manufacturer manual.

export const SEED_MAP: Record<
  string,
  { url: string; title: string; isOfficial: boolean }
> = {
  // Wi-Fi router — official EN PDF 403s; manualslib mirrors the same NETGEAR manual.
  "netgear|r7000": {
    url: "https://www.manualslib.com/manual/582801/Netgear-Nighthawk-R7000.html",
    title: "NETGEAR Nighthawk R7000 User Manual",
    isOfficial: false,
  },
  // Printer — full DeskJet 2700 manual (procedural text: setup, copy, wireless, errors).
  "hp|deskjet 2700": {
    url: "https://manuals.plus/_hp/deskjet-2700-manual",
    title: "HP DeskJet 2700 All-in-One series User Guide",
    isOfficial: false,
  },
  // Smart TV — Samsung support model pages are JS-rendered/flaky; manualslib is stable.
  "samsung|tu7000": {
    url: "https://www.manualslib.com/manual/1802019/Samsung-Tu7000.html",
    title: "Samsung TU7000 Series Smart TV User Manual",
    isOfficial: false,
  },
  // Appliance with an error-code display (dishwasher E-codes) — official Bosch PDF.
  "bosch|she3ar75uc": {
    url: "https://media3.bosch-home.com/Documents/9001234567_A.pdf",
    title: "Bosch 300 Series Dishwasher Operating Instructions (fault codes)",
    isOfficial: true,
  },
  // iPhone — official Apple User Guide page for erasing/factory-resetting (has the
  // actual procedure; the guide's welcome page is only a table of contents).
  "apple|iphone 13": {
    url: "https://support.apple.com/guide/iphone/erase-all-content-and-settings-iph7a2a9399b/ios",
    title: "iPhone User Guide — Erase / Reset (Apple Support)",
    isOfficial: true,
  },
};

/**
 * Look up a seed manual URL by device identity. Normalizes the key
 * (`${brand}|${model}` lowercased/trimmed) and returns the entry or null.
 */
export function seedLookup(
  brand: string,
  model?: string | null,
): { url: string; title: string; isOfficial: boolean } | null {
  if (!brand || !model) return null;
  const key = `${brand.trim()}|${model.trim()}`.toLowerCase();
  return SEED_MAP[key] ?? null;
}
