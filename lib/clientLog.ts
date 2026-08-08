// lib/clientLog.ts — fire-and-forget client-side event logging.
// Browser (client) tools can't write files, so they POST events to /api/log, which
// appends them to the same on-device JSONL log as the server. Uses sendBeacon so the
// event survives page navigation — important because `escalate` navigates to a tel: URI.
// Logging must NEVER break the app; all failures are swallowed.

let currentSessionId = "";

/** Generate a correlation id for one voice "call" (browser session). */
export function newSessionId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    // fall through
  }
  return `s_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

/** Set the active session id so subsequent logClient() calls are correlated. */
export function setLogSession(id: string): void {
  currentSessionId = id;
}

/** Post a structured event to /api/log. Never throws. */
export function logClient(event: Record<string, unknown>): void {
  try {
    if (typeof window === "undefined") return;
    const payload = JSON.stringify({
      source: "client",
      sessionId: currentSessionId,
      ...event,
    });
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon("/api/log", new Blob([payload], { type: "application/json" }));
    } else {
      void fetch("/api/log", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
        keepalive: true,
      });
    }
  } catch {
    // logging must never break the app
  }
}
