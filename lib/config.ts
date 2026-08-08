// lib/config.ts — centralised model ids and service base URLs.
// Per code-conventions.md: model ids and base URLs live here, not sprinkled in code.

// Procedure construction inside /api/resolve-procedure. Locked project decision.
// Gemini 2.5 Flash — latency-sensitive structured extraction. Swap to
// "gemini-2.5-pro" for higher quality at the cost of latency.
export const EXTRACTOR_MODEL = "gemini-3.6-flash";

// context.dev — URL -> clean markdown, /web/search, PDF-at-URL auto-parse.
export const CONTEXT_DEV_BASE_URL = "https://api.context.dev/v1";

// ElevenLabs API.
export const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";

// Non-secret webhook base URL used to build absolute tool URLs when needed.
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";
