# API Contracts

The shared types and the request/response shape of every route. **`lib/procedure.ts` is the single source of truth** — the Gemini `responseSchema` and the ElevenLabs tool schemas mirror it (see [`code-conventions.md`](code-conventions.md)).

## Procedure schema — `lib/procedure.ts`

```ts
export type ProcedureResult =
  | { status: "resolved"; procedure: Procedure }
  | NoDocumentationResult          // FR-17, FR-33
  | SafetyRefusalResult;           // FR-30 (whole-request refusal)

export interface Procedure {
  device: DeviceIdentity;
  source: SourceDoc;
  totalSteps: number;
  summary: string;                  // one-line plain-language description the agent speaks on confirm
  steps: Step[];
}

export interface DeviceIdentity {
  brand: string;
  category: string;                 // "wifi router", "washing machine"
  model: string | null;             // null when only brand+category are known
  identity: "device_specific" | "generic";   // FR-6 rollup
}

export interface SourceDoc {
  url: string;                      // resolved manual URL
  title: string;
  isOfficial: boolean;              // manufacturer/official domain vs third-party
}

export interface Step {
  stepNumber: number;               // 1-based, contiguous
  text: string;                     // EXACTLY ONE physical action, phrased for speech
  successCheck: string | null;      // observable the user confirms before advancing
  sourceAnchor: SourceAnchor;       // FR-23
  destructive: boolean;             // FR-31 — needs explicit spoken "yes"
  safety: "none" | "caution" | "refuse";      // FR-30, FR-32
  labeling: "device_specific" | "generic";    // FR-6 per-step
  branches: Branch[];               // FR-22
}

export interface SourceAnchor {
  sectionTitle: string;             // nearest heading in the manual
  anchorUrl: string;                // source.url + "#fragment" when available, else source.url
  quote: string;                    // short verbatim snippet (≤160 chars) — grounding + audit
}

export interface Branch {
  condition: string;                // natural-language observable ("it's blinking now")
  goTo: number | "resolved" | "escalate";
}

export interface NoDocumentationResult {
  status: "no_documentation";
  device: DeviceIdentity;
  spokenMessage: string;            // what the agent says verbatim
  next: "escalate" | "ask_for_model";
}

export interface SafetyRefusalResult {
  status: "safety_refusal";
  device: DeviceIdentity;
  hazard: "mains_electrical" | "gas" | "sealed_enclosure" | "other";
  spokenMessage: string;            // refusal + redirect
}
```

**Design rationale**
- **Atomicity** enforced twice: the `text` contract *and* splitting the confirm into `successCheck` so a step never smuggles a second action.
- **Provenance on every step** (`sourceAnchor.quote` + `anchorUrl`), never only at procedure level — this is the on-stage proof of grounding and what `showStep`'s `sourceUrl` binds to.
- **Safety at two levels:** a whole-request `SafetyRefusalResult` (the entire fix is unsafe) and a per-step `safety: "refuse"` (one step in an otherwise fine procedure).
- **Generic vs device-specific** at both procedure and step granularity (a device-specific manual can contain a generic sub-step).
- **`no_documentation` is first-class** — the agent has a ready-to-speak message and a recovery route, so it never hallucinates when retrieval fails.

## Tool-return granularity — v1 now, v2 ready

**v1 (ship):** `/api/resolve-procedure` returns the **whole** `ProcedureResult`; pacing is enforced by the agent's system prompt. One round-trip, no server session store, degrades gracefully.

**Pivot test (rehearsal):** across 8 scripted seed-device dialogues, count any turn where the agent voices step *n+1* before the user confirms step *n* (or lists multiple steps). **If it happens in ≥2 of 8 dialogues, or twice in any one → pivot to v2.**

**v2 (fallback, pre-designed):** split into two stateful tools; the server can only ever hand back one step, so pacing is structurally guaranteed.

```ts
// lib/session-store.ts (v2 only) — module-level Map is fine for the demo; Upstash KV if needed
interface SessionState {
  procedure: Procedure;
  cursor: number;                   // next stepNumber to serve, 1-based
  createdAt: number;
  status: "active" | "resolved" | "escalated";
}
```
```
start_procedure({ brand, category, model?, symptom })
  -> { status, session_id, device, source, totalSteps, summary }   // computes + caches, NO steps

get_next_step({ session_id, action })
  action ∈ "confirm_success" | "repeat" | "back" | "branch"
  branch also carries { observation: string }
  -> { done: false, step: Step } | { done: true, outcome: "resolved" | "escalate" }
```
The `Procedure`/`Step` types are identical across v1/v2, so migration only changes the route surface and the agent's tool list.

## Vision identification schema — `lib/procedure.ts` (Phase 2a)

```ts
export interface DeviceIdentification {
  brand: string | null;
  model: string | null;             // null when not legible — never guessed
  category: string | null;          // "wifi router", "printer", …
  confidence: "high" | "medium" | "low";   // FR-9 gate: "low" → fall back to voice
  spokenName: string;               // how the agent says it back ("Netgear R7000")
  observations: string[];           // GROUNDED visible state: lights, cables, error codes
  possibleIssues: string[];         // the subset that looks wrong ("internet port empty")
}
```
Produced by `lib/vision.ts` (Gemini multimodal, `responseSchema` mirrors this type) and returned to
the agent by the `identifyDevice` client tool. `observations`/`possibleIssues` are strictly what is
visible in the photo — never inferred (same "never invent" rule as the extractor).

## Routes

### `GET /api/signed-url`
Mints a short-lived ElevenLabs signed URL server-side (keeps `ELEVENLABS_API_KEY` off the client).
- **Response:** `{ signed_url: string }` (expires ~15 min; fetch it at tap time, not on mount).

### `POST /api/resolve-procedure`  ← agent server tool `resolve_procedure`
- **Request:** `{ brand: string; category: string; model?: string; symptom: string }`
- **Response:** `ProcedureResult` (always 200 with a typed body; failures become `no_documentation`, never a raw 500). A `resolved` result may be **generic** — built from general knowledge when no manual yielded a fix (`device.identity: "generic"`, an empty `source.url`, every step `labeling: "generic"`). This is gated by `ALLOW_GENERIC_FALLBACK` (`lib/config.ts`, default true); with it off, the same case returns `no_documentation`.
- **Pipeline:** seed map → `context.dev /web/search` **ranked best-first** → iterate the top `MAX_MANUAL_CANDIDATES` (=3): `context.dev /web/scrape/markdown` (PDF-aware) → Gemini (`@google/genai`) structured output → return the first grounded fix; else safe generic fallback → validate (coerce `goTo`, assert contiguous `stepNumber`).

```
1. candidates = SEED_MAP[`${brand}|${model}`]           // single candidate if present
        ?? rankCandidates(contextdev.search(`${brand} ${model??""} ${category} manual`),
                          { model }).slice(0, MAX_MANUAL_CANDIDATES)   // ranked best-first; aggregators kept
2. for cand in candidates:                              // try each in rank order
     { markdown } = contextdev.scrapeMarkdown(cand.url) // PDF auto-parsed; !success/looksUseful → skip (unbilled)
     result = extractProcedure(body, cand, markdown)    // Gemini structured output
     if result.status in {"resolved","safety_refusal"}: return result   // safety short-circuits
     // "no_documentation" → try the next candidate
3. // no candidate grounded a fix:
   if ALLOW_GENERIC_FALLBACK: return extractGenericProcedure(body)   // safe generic, device.identity="generic"
   else: return no_documentation
```
Each `extract*` step parses → coerces `goTo` → validates before the route returns `NextResponse.json(result)`.

### `escalate`  ← agent **client tool** (no server route)
A demo gag: Manuel "calls the son." The browser callback renders the `EscalationCard` with the summary and opens the phone dialer. No Twilio, no server route, no second agent.
- **Params (from the agent):** `{ device: string; problem: string; stepsAttempted: string[]; outcomes?: string }`
- **Returns to the agent:** `"escalating"` (so the agent can say "I'm getting Ziad on the phone for you now.")
```ts
escalate: ({ device, problem, stepsAttempted, outcomes }) => {
  setEscalation({ device, problem, stepsAttempted, outcomes });   // -> <EscalationCard/>
  const tel = process.env.NEXT_PUBLIC_ADMIN_TEL ?? "+971508888888";
  window.location.href = `tel:${tel}`;                            // opens the dialer (gag)
  return "escalating";
}
```
On mobile, `tel:` opens the native dialer. `EscalationCard` also shows a large "Call [admin]" button as a fallback if the auto-dial is blocked.

### `POST /api/identify-device`  ← browser (via the `identifyDevice` client tool)
Vision device identification + visual check (Phase 2a, FR-8). The browser downscales the photo and
sends it here; the route runs Gemini vision (`lib/vision.ts`) and returns the identity + observations.
- **Request:** `{ imageBase64: string; mimeType: string; sessionId?: string }` (raw base64, no `data:` prefix).
- **Response:** `DeviceIdentification` (always 200; any failure degrades to a low-confidence empty result).
- **Privacy (NFR-11):** the image is processed in memory and never persisted; the log records only the
  RESULT (brand/model/confidence + observation counts), never the image bytes.

### `identifyDevice`  ← agent **client tool**
Reveals `<CameraPrompt/>`; the user's tap on "📷 Take a photo" is the gesture that opens the camera
(iOS Safari requires a gesture — same rule as `startSession`). On capture it POSTs to
`/api/identify-device`, then returns a spoken-ready **string** to the agent.
- **Params (from the agent):** none — `{}`.
- **Returns to the agent:** identity + "confirm aloud" directive (or, when confidence is low / no
  brand / the user skips, a "ask by voice" fallback, FR-9), followed by the visible observations and
  possible issues so the agent can narrate them and fold faults into the symptom.
```ts
identifyDevice: async () => {
  const id = await requestPhoto();            // shows CameraPrompt, awaits photo → DeviceIdentification | null
  return formatIdentificationForAgent(id);    // lib/clientTools.ts
}
```

## Gemini `responseSchema` (mirrors `Procedure`/`Step`)

Passed as `config.responseSchema` (OpenAPI-subset via the `Type` enum). Every object has full `required` and `propertyOrdering`. `goTo` is left as a schema string and coerced in TS after parse (`"resolved" | "escalate" | integer`), since a leaf union is awkward under structured output. `spokenMessage`, `next`, and `hazard` are nullable top-level fields used by the `no_documentation` / `safety_refusal` results. Full schema lives in `lib/extraction.ts` alongside `EXTRACTION_SYSTEM` and `buildUserPrompt()`.

## Cross-links

- Extractor prompt & agent prompts: [`agent-config.md`](agent-config.md)
- Pipeline & stores: [`architecture.md`](architecture.md)
- BRD IDs: FR-6, FR-17, FR-18, FR-22, FR-23, FR-30, FR-31, FR-32, FR-33.
