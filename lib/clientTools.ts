// lib/clientTools.ts — the browser-side client tool(s) the ElevenLabs agent calls.
// A client tool runs in-browser and can update React state. `showStep` renders the
// current step + source link in sync with the voice (FR-3b); `escalate` shows the
// EscalationCard and opens the phone dialer (the "Manuel calls the son" gag).
// See docs/agent-config.md and docs/api-contracts.md.

import type { StepView, DeviceIdentification } from "./procedure";
import { logClient } from "./clientLog";

// The number the escalation gag dials. Non-secret (NEXT_PUBLIC_); inlined at build.
export const ADMIN_TEL = process.env.NEXT_PUBLIC_ADMIN_TEL || "+971508888888";

// The ElevenLabs client-tool callback receives loosely-typed params; we narrow
// them at the boundary (code-conventions: unknown + narrow).
export type ShowStepParams = Record<string, unknown>;
export type EscalateParams = Record<string, unknown>;
export type ActivityParams = Record<string, unknown>;

// The on-screen "what Manuel is doing right now" indicator (persistent activity
// banner). Some states are set automatically by the client tools below
// (`photo` from identifyDevice, `guiding` from showStep, `escalating` from
// escalate); `fetching`/`reviewing` happen inside the SERVER tool
// `resolve_procedure`, which the browser can't observe, so the agent announces
// them via the `setActivity` client tool. See docs/agent-config.md.
export type ActivityState =
  | "idle"
  | "fetching"
  | "reviewing"
  | "photo"
  | "guiding"
  | "escalating";

export interface ActivityView {
  state: ActivityState;
  label: string;
}

const ACTIVITY_STATES: readonly ActivityState[] = [
  "idle",
  "fetching",
  "reviewing",
  "photo",
  "guiding",
  "escalating",
];

// Canonical, persona-appropriate wording lives in code, not in the agent prompt,
// so the banner always reads calmly and consistently for the 55+ user.
const ACTIVITY_LABELS: Record<ActivityState, string> = {
  idle: "Ready when you are",
  fetching: "Finding the official manual…",
  reviewing: "Reading the manual for your device…",
  photo: "Waiting for your photo…",
  guiding: "Walking you through the fix",
  escalating: "Getting you more help…",
};

/** Build an ActivityView from a known state, with an optional label override. */
export function activityFor(state: ActivityState, label?: string): ActivityView {
  return { state, label: label || ACTIVITY_LABELS[state] };
}

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

/**
 * Turn a vision result (or null, when the user skips/cancels) into the STRING the
 * `identifyDevice` tool returns to the agent. Carries two halves: the identity plus
 * the FR-9 confidence gate, and the grounded visual observations. Kept plain and
 * imperative so the agent can act on it directly.
 */
export function formatIdentificationForAgent(
  id: DeviceIdentification | null,
): string {
  if (!id) {
    return "The user did not take a photo. Ask them to tell you the brand and model of the device out loud instead.";
  }

  const visual: string[] = [];
  if (id.observations.length) {
    visual.push(`What is visible in the photo: ${id.observations.join("; ")}.`);
  }
  if (id.possibleIssues.length) {
    visual.push(
      `What looks wrong: ${id.possibleIssues.join("; ")}. Fold these into the symptom you send to resolve_procedure, but only trust the manual for the actual fix.`,
    );
  }
  const visualLine = visual.length ? " " + visual.join(" ") : "";

  // FR-9 gate: a low-confidence identity (or no brand) must NOT be trusted — fall back
  // to spoken identification. The visual observations are still useful, so include them.
  if (id.confidence === "low" || !id.brand) {
    return (
      "I couldn't identify the device confidently from the photo. Ask the user to tell you the brand and model out loud." +
      visualLine
    );
  }

  const parts = [id.brand, id.model].filter(Boolean).join(" ");
  return (
    `From the photo this looks like ${id.spokenName} (${parts}${id.category ? `, a ${id.category}` : ""}), confidence ${id.confidence}. ` +
    "Confirm this device aloud with the user before continuing." +
    visualLine
  );
}

/** Coerce raw client-tool params into an ActivityView (state + optional label). */
export function toActivityView(params: ActivityParams): ActivityView {
  const raw = asString(params.state);
  const state = (ACTIVITY_STATES as readonly string[]).includes(raw)
    ? (raw as ActivityState)
    : "idle";
  return activityFor(state, asString(params.label) || undefined);
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
 * - `identifyDevice` reveals the camera prompt, awaits the user's photo, and returns
 *   the vision result (identity + visual observations) as a string (Phase 2a, FR-8/9).
 *   It also drives the "photo" activity state while waiting.
 * Each returns a string the agent can continue from.
 *
 * `onActivity` is the activity-banner setter ("what Manuel is doing right now"):
 * `identifyDevice` sets "photo" while capturing, `showStep` sets "guiding", and
 * `escalate` sets "escalating". The `fetching`/`reviewing` states happen inside the
 * SERVER tool `resolve_procedure`, invisible to the browser, so the agent announces
 * them via the `setActivity` client tool. See docs/agent-config.md.
 */
export function buildClientTools(
  onShowStep: (step: StepView) => void,
  onEscalate: (view: EscalationView) => void,
  requestPhoto: () => Promise<DeviceIdentification | null>,
  onActivity: (view: ActivityView) => void,
) {
  return {
    identifyDevice: async (): Promise<string> => {
      logClient({ type: "tool_call", tool: "identifyDevice", phase: "requested" });
      onActivity(activityFor("photo"));
      try {
        const id = await requestPhoto();
        logClient({
          type: "tool_call",
          tool: "identifyDevice",
          phase: "result",
          confidence: id?.confidence ?? "none",
          brand: id?.brand ?? null,
          model: id?.model ?? null,
          observationCount: id?.observations.length ?? 0,
        });
        return formatIdentificationForAgent(id);
      } finally {
        onActivity(activityFor("idle"));
      }
    },
    setActivity: (params: ActivityParams): string => {
      const view = toActivityView(params);
      onActivity(view);
      logClient({ type: "tool_call", tool: "setActivity", state: view.state });
      return "ok";
    },
    showStep: (params: ShowStepParams): string => {
      const view = toStepView(params);
      onShowStep(view);
      onActivity(activityFor("guiding"));
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
      onActivity(activityFor("escalating"));
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
