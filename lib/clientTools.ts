// lib/clientTools.ts — the browser-side client tool(s) the ElevenLabs agent calls.
// A client tool runs in-browser and can update React state. `showStep` renders the
// current step + source link in sync with the voice (FR-3b); `escalate` shows the
// EscalationCard and opens the phone dialer (the "Manuel calls the son" gag).
// See docs/agent-config.md and docs/api-contracts.md.

import type { StepView } from "./procedure";
import { logClient } from "./clientLog";

// The number the escalation gag dials. Non-secret (NEXT_PUBLIC_); inlined at build.
export const ADMIN_TEL = process.env.NEXT_PUBLIC_ADMIN_TEL || "+971508888888";

// The ElevenLabs client-tool callback receives loosely-typed params; we narrow
// them at the boundary (code-conventions: unknown + narrow).
export type ShowStepParams = Record<string, unknown>;
export type EscalateParams = Record<string, unknown>;

// What the agent passes to `escalate`, narrowed and rendered by EscalationCard.
export interface EscalationView {
  device: string;
  problem: string;
  stepsAttempted: string[];
  outcomes?: string;
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function asNumber(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

/** Coerce raw client-tool params into a StepView. */
export function toStepView(params: ShowStepParams): StepView {
  return {
    stepNumber: asNumber(params.stepNumber),
    totalSteps: asNumber(params.totalSteps),
    text: asString(params.text),
    sourceUrl: asString(params.sourceUrl),
  };
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  if (typeof v === "string" && v.trim()) return [v];
  return [];
}

/** Coerce raw client-tool params into an EscalationView. */
export function toEscalationView(params: EscalateParams): EscalationView {
  const outcomes = asString(params.outcomes);
  return {
    device: asString(params.device),
    problem: asString(params.problem),
    stepsAttempted: asStringArray(params.stepsAttempted),
    outcomes: outcomes || undefined,
  };
}

/**
 * Build the `clientTools` map passed to useConversation.
 * - `showStep` sets the on-screen step (FR-3b).
 * - `escalate` shows the EscalationCard AND opens the phone dialer (the gag).
 * Each returns a short string the agent can continue from.
 */
export function buildClientTools(
  onShowStep: (step: StepView) => void,
  onEscalate: (view: EscalationView) => void,
) {
  return {
    showStep: (params: ShowStepParams): string => {
      const view = toStepView(params);
      onShowStep(view);
      logClient({
        type: "tool_call",
        tool: "showStep",
        stepNumber: view.stepNumber,
        totalSteps: view.totalSteps,
      });
      return "shown";
    },
    escalate: (params: EscalateParams): string => {
      const view = toEscalationView(params);
      onEscalate(view);
      logClient({
        type: "tool_call",
        tool: "escalate",
        device: view.device,
        problem: view.problem,
        stepsAttempted: view.stepsAttempted,
      });
      // Demo gag: open the native dialer to "call the son". Guarded for SSR/tests;
      // if the browser blocks auto-dial, the EscalationCard shows a Call button.
      if (typeof window !== "undefined") {
        window.location.href = `tel:${ADMIN_TEL}`;
      }
      return "escalating";
    },
  };
}
