// lib/config.ts — centralised model ids and service base URLs.
// Per code-conventions.md: model ids and base URLs live here, not sprinkled in code.

// Procedure construction inside /api/resolve-procedure. Locked project decision.
// Gemini 3.6 Flash — latency-sensitive structured extraction. Swap to
// "gemini-3.6-pro" for higher quality at the cost of latency.
export const EXTRACTOR_MODEL = "gemini-3.6-flash";

// Vision device identification inside /api/identify-device (Phase 2a). Gemini 3.6
// Flash is multimodal (accepts inline images). Kept separate from EXTRACTOR_MODEL so
// the vision path can be tuned (e.g. to "gemini-3.6-pro") without touching extraction.
export const VISION_MODEL = "gemini-3.6-flash";

// context.dev — URL -> clean markdown, /web/search, PDF-at-URL auto-parse.
export const CONTEXT_DEV_BASE_URL = "https://api.context.dev/v1";

// ElevenLabs API.
export const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";

// Non-secret webhook base URL used to build absolute tool URLs when needed.
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";
