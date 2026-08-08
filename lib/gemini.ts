// lib/gemini.ts — the single lazy GoogleGenAI client, shared by every server-side
// Gemini caller (lib/extraction.ts, lib/vision.ts). Constructed at request time, not
// module load, so a build with no GEMINI_API_KEY set stays quiet and the key is read
// fresh when actually needed. Secret (GEMINI_API_KEY) never leaves the server.

import { GoogleGenAI } from "@google/genai";

let _ai: GoogleGenAI | null = null;

/** Lazy singleton GoogleGenAI client (reads GEMINI_API_KEY from the environment). */
export function getGeminiClient(): GoogleGenAI {
  if (!_ai) _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return _ai;
}
