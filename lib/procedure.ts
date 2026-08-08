// lib/procedure.ts — THE SINGLE SOURCE OF TRUTH for the procedure/step types.
// The Gemini responseSchema (lib/extraction.ts) and the ElevenLabs tool schemas
// (docs/agent-config.md) MIRROR these types. Change a type -> change both mirrors
// in the same commit. See docs/api-contracts.md.

export type ProcedureResult =
  | { status: "resolved"; procedure: Procedure }
  | NoDocumentationResult // FR-17, FR-33
  | SafetyRefusalResult; // FR-30 (whole-request refusal)

export interface Procedure {
  device: DeviceIdentity;
  source: SourceDoc;
  totalSteps: number;
  summary: string; // one-line plain-language description the agent speaks on confirm
  steps: Step[];
}

export interface DeviceIdentity {
  brand: string;
  category: string; // "wifi router", "washing machine"
  model: string | null; // null when only brand+category are known
  identity: "device_specific" | "generic"; // FR-6 rollup
}

export interface SourceDoc {
  url: string; // resolved manual URL
  title: string;
  isOfficial: boolean; // manufacturer/official domain vs third-party
}

export interface Step {
  stepNumber: number; // 1-based, contiguous
  text: string; // EXACTLY ONE physical action, phrased for speech
  successCheck: string | null; // observable the user confirms before advancing
  sourceAnchor: SourceAnchor; // FR-23
  destructive: boolean; // FR-31 — needs explicit spoken "yes"
  safety: "none" | "caution" | "refuse"; // FR-30, FR-32
  labeling: "device_specific" | "generic"; // FR-6 per-step
  branches: Branch[]; // FR-22
}

export interface SourceAnchor {
  sectionTitle: string; // nearest heading in the manual
  anchorUrl: string; // source.url + "#fragment" when available, else source.url
  quote: string; // short verbatim snippet (<=160 chars) — grounding + audit
}

export interface Branch {
  condition: string; // natural-language observable ("it's blinking now")
  goTo: number | "resolved" | "escalate";
}

export interface NoDocumentationResult {
  status: "no_documentation";
  device: DeviceIdentity;
  spokenMessage: string; // what the agent says verbatim
  next: "escalate" | "ask_for_model";
}

export interface SafetyRefusalResult {
  status: "safety_refusal";
  device: DeviceIdentity;
  hazard: "mains_electrical" | "gas" | "sealed_enclosure" | "other";
  spokenMessage: string; // refusal + redirect
}

// Request shape for POST /api/resolve-procedure (agent server tool resolve_procedure).
export interface ResolveProcedureRequest {
  brand: string;
  category: string;
  model?: string;
  symptom: string;
}

// Args the `showStep` client tool receives from the ElevenLabs agent, and the
// shape <StepCard/> renders. Mirrors the showStep tool params in docs/agent-config.md.
export interface StepView {
  stepNumber: number;
  totalSteps: number;
  text: string;
  sourceUrl: string;
}
