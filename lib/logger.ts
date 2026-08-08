// lib/logger.ts — on-device structured event log (server-side only).
// Appends one JSON object per line (JSONL) to logs/manuel-events.jsonl so a "call"
// can be reconstructed: session start/end, every tool used, inputs, outcomes, timing.
// Logging must NEVER break a request — every failure is swallowed and logged to stderr.
// (On serverless hosts the project dir is read-only; there we fall back to /tmp.)

import { appendFile, mkdir } from "fs/promises";
import path from "path";

export interface LogEvent {
  ts?: string; // ISO timestamp — filled in here if absent
  source?: "client" | "server";
  sessionId?: string;
  type: string; // "session_start" | "session_end" | "session_error" | "tool_call" | "session_auth"
  [key: string]: unknown;
}

// Prefer a writable project-local dir; fall back to /tmp on read-only hosts.
const PRIMARY_DIR = path.join(process.cwd(), "logs");
const FALLBACK_DIR = path.join("/tmp", "manuel-logs");
const FILE_NAME = "manuel-events.jsonl";

let resolvedFile: string | null = null;

async function ensureFile(): Promise<string> {
  if (resolvedFile) return resolvedFile;
  for (const dir of [PRIMARY_DIR, FALLBACK_DIR]) {
    try {
      await mkdir(dir, { recursive: true });
      resolvedFile = path.join(dir, FILE_NAME);
      return resolvedFile;
    } catch {
      // try the next candidate
    }
  }
  // Last resort: /tmp root (always writable in practice).
  resolvedFile = path.join("/tmp", FILE_NAME);
  return resolvedFile;
}

/** Append a structured event to the on-device log. Fire-and-forget safe. */
export async function logEvent(event: LogEvent): Promise<void> {
  try {
    const record = { ts: new Date().toISOString(), ...event };
    const file = await ensureFile();
    await appendFile(file, JSON.stringify(record) + "\n", "utf8");
  } catch (err) {
    console.error("[logger] append failed", err);
  }
}
