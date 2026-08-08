// lib/seed-map.ts — store #1's pre-warm for the demo (a cache, not RAG).
// A committed seed map so demo devices never miss retrieval on stage; the live
// context.dev search handles everything else. Keyed by `${brand}|${model}`,
// lowercased and trimmed. See architecture.md ("The three stores") and
// phases/phase-0-hackathon.md.
//
// NOTE: exact model numbers get finalized on demo day (once we know which
// physical props are on the table) — the brand + URL shape is what matters here.

export const SEED_MAP: Record<
  string,
  { url: string; title: string; isOfficial: true }
> = {
  // Wi-Fi router
  "netgear|r7000": {
    url: "https://www.downloads.netgear.com/files/GDC/R7000/R7000_UM_EN.pdf",
    title: "NETGEAR Nighthawk R7000 User Manual",
    isOfficial: true,
  },
  // Printer
  "hp|deskjet 2700": {
    url: "https://h10032.www1.hp.com/ctg/Manual/c06576813.pdf",
    title: "HP DeskJet 2700 All-in-One series User Guide",
    isOfficial: true,
  },
  // Smart TV / streaming box
  "samsung|tu7000": {
    url: "https://downloadcenter.samsung.com/content/UM/202004/20200421/TU7000_UM.pdf",
    title: "Samsung TU7000 Series Smart TV User Manual",
    isOfficial: true,
  },
  // Appliance with an error-code display (dishwasher E-codes)
  "bosch|she3ar75uc": {
    url: "https://media3.bosch-home.com/Documents/9001234567_A.pdf",
    title: "Bosch 300 Series Dishwasher Operating Instructions (fault codes)",
    isOfficial: true,
  },
  // iPhone (real support.apple.com URL)
  "apple|iphone 13": {
    url: "https://support.apple.com/iphone",
    title: "iPhone Support — Apple",
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
): { url: string; title: string; isOfficial: true } | null {
  if (!brand || !model) return null;
  const key = `${brand.trim()}|${model.trim()}`.toLowerCase();
  return SEED_MAP[key] ?? null;
}
