// scripts/sync-elevenlabs-agent.mjs
//
// Syncs the "Manuel" ElevenLabs agent's TOOLS (and, opt-in, its prompt) from the
// canonical schemas in docs/agent-config.md. Idempotent: matches existing tools by
// name and updates them in place instead of creating duplicates.
//
//   Tools registered:
//     - resolve_procedure   (webhook -> POST {APP_URL}/api/resolve-procedure)
//     - search_documentation(webhook -> POST {APP_URL}/api/search)
//     - showStep            (client — sets activity "guiding")
//     - escalate            (client — the tel: dialer gag; sets activity "escalating")
//     - identifyDevice      (client — camera/vision; sets activity "photo")
//     - setActivity         (client — the on-screen "what Manuel is doing now" banner)
//
// Usage:
//   set -a; . ./.env.local; set +a            # load ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID
//   APP_URL="https://your-app.vercel.app" node scripts/sync-elevenlabs-agent.mjs
//
//   # also push the Manuel system prompt + first message (see docs/agent-config.md):
//   SYNC_PROMPT=1 APP_URL="https://your-app.vercel.app" node scripts/sync-elevenlabs-agent.mjs
//
//   # preview every request without mutating anything:
//   DRY_RUN=1 APP_URL="https://your-app.vercel.app" node scripts/sync-elevenlabs-agent.mjs

const API = "https://api.elevenlabs.io/v1";
const KEY = process.env.ELEVENLABS_API_KEY;
const AGENT_ID = process.env.ELEVENLABS_AGENT_ID;
const APP_URL = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
const SYNC_PROMPT = process.env.SYNC_PROMPT === "1";
const DRY_RUN = process.env.DRY_RUN === "1";

function die(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}
if (!KEY) die("ELEVENLABS_API_KEY is not set (run: set -a; . ./.env.local; set +a).");
if (!AGENT_ID) die("ELEVENLABS_AGENT_ID is not set.");
if (!APP_URL) die("APP_URL is not set — pass the public HTTPS base URL of the deployed app.");
if (!/^https:\/\//.test(APP_URL)) die(`APP_URL must be https:// (got: ${APP_URL}). ElevenLabs webhooks require public HTTPS.`);

const headers = { "xi-api-key": KEY, "Content-Type": "application/json" };

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}\n${JSON.stringify(json, null, 2)}`);
  }
  return json;
}

// ---- Tool definitions (mirror docs/agent-config.md + lib/procedure.ts) --------

const webhook = (name, description, path, required, properties, response_timeout_secs = 30) => ({
  type: "webhook",
  name,
  description,
  // resolve_procedure scrapes a PDF + runs Gemini; a real call was measured at ~31s,
  // so the default 20s would time out mid-conversation. Give it headroom.
  response_timeout_secs,
  api_schema: {
    url: `${APP_URL}${path}`,
    method: "POST",
    request_headers: {},
    request_body_schema: { type: "object", required, properties },
  },
});

const client = (name, description, required, properties, expects_response = false) => ({
  type: "client",
  name,
  description,
  expects_response,
  parameters: { type: "object", required, properties },
});

const TOOLS = [
  webhook(
    "resolve_procedure",
    "Look up the official manufacturer manual and return an ordered, atomic fix for the user's symptom. Call once you have the brand, device category, and symptom (model optional).",
    "/api/resolve-procedure",
    ["brand", "category", "symptom"],
    {
      brand: { type: "string", description: "device manufacturer, e.g. 'Netgear'" },
      category: { type: "string", description: "e.g. 'wifi router', 'washing machine'" },
      model: { type: "string", description: "model number if the user has it, else omit" },
      symptom: { type: "string", description: "the problem in the user's own words" },
    },
    120, // seconds — PDF scrape + Gemini can take ~30s+; must exceed the pipeline worst case.
  ),
  webhook(
    "search_documentation",
    "Search the web for a device's official documentation without building steps. Provide brand + category (+ model if known), or an explicit query. Use resolve_procedure when you actually want the fix.",
    "/api/search",
    [],
    {
      brand: { type: "string", description: "device manufacturer" },
      category: { type: "string", description: "e.g. 'wifi router'" },
      model: { type: "string", description: "model number if known, else omit" },
      query: { type: "string", description: "explicit search query; if omitted one is built from brand/model/category" },
    },
  ),
  client(
    "showStep",
    "Display the current step on screen, in sync with your voice. Call every time you begin a new step or repeat one.",
    ["stepNumber", "totalSteps", "text", "sourceUrl"],
    {
      stepNumber: { type: "integer", description: "1-based number of the step being shown" },
      totalSteps: { type: "integer", description: "total number of steps in the procedure" },
      text: { type: "string", description: "the one step's action text" },
      sourceUrl: { type: "string", description: "URL of the manual page this step came from" },
    },
  ),
  client(
    "escalate",
    "Escalate to the family administrator when you cannot safely or successfully resolve the issue. Shows a summary on screen and calls them.",
    ["device", "problem", "stepsAttempted"],
    {
      device: { type: "string", description: "the device being worked on" },
      problem: { type: "string", description: "the unresolved problem" },
      stepsAttempted: { type: "array", items: { type: "string", description: "one attempted step" }, description: "short descriptions of steps tried" },
      outcomes: { type: "string", description: "outcome of each attempted step" },
    },
  ),
  // Vision: expects_response=true — the tool opens the camera and RETURNS a
  // spoken-ready summary the agent must act on (confirm device / describe what's
  // visible / fall back to voice on low confidence).
  client(
    "identifyDevice",
    "Open the camera so the user can photograph the device, or the label with its model number. Identifies the brand and model and reports what is visibly wrong (which lights are on, what's plugged in, any error code on the screen). Call this when the user can't read or say the model, or is struggling to describe the problem. Returns text for you to act on: the device to confirm aloud (or a request to ask by voice), plus the visible observations.",
    [],
    {},
    true,
  ),
  // Activity banner: fire-and-forget (expects_response=false) — never make the agent
  // wait on the UI. Keeps the on-screen "what Manuel is doing now" indicator current
  // through the states the browser can't observe (server work inside resolve_procedure).
  client(
    "setActivity",
    "Update the on-screen banner showing what you're doing now. Call setActivity with state 'fetching' just before resolve_procedure, and 'reviewing' the moment it returns (before the first step). You do not need to call this for photos, guiding steps, or escalation — those tools set the banner themselves.",
    ["state"],
    {
      state: {
        type: "string",
        enum: ["idle", "fetching", "reviewing", "photo", "guiding", "escalating"],
        description: "what Manuel is doing right now",
      },
      label: { type: "string", description: "optional custom wording; omit to use the default for the state" },
    },
  ),
];

// ---- Manuel prompt + first message (verbatim from docs/agent-config.md) --------

const FIRST_MESSAGE =
  "Hi, I'm Manuel. Tell me what's giving you trouble — what's the device, and what's it doing?";

const SYSTEM_PROMPT = `You are Manuel — a calm, friendly voice guide who helps non-technical people fix a device by
walking them through ONE step at a time, using the real manufacturer manual. You are speaking out
loud; keep every turn short and conversational.

DEVICE IDENTIFICATION (FR-4/5)
- Find three things: the device category, the brand, and the model. Ask for them naturally, one
  easy question at a time — never all at once.
- Ask grounded, concrete questions ("Is there a model number on a sticker on the back or bottom?").
  Never ask "what is the model number" as if they should already know it.
- If they can't find the model, that's fine — proceed with brand + category.
- Get the symptom in the user's own words ("What's it doing, or not doing?").

CAMERA — DEVICE IDENTIFICATION & VISUAL CHECK (FR-8, FR-9)
- If the user can't read or say the model, OR is struggling to describe the problem, offer the
  camera: "If it's easier, I can take a look — point your camera at the device, or at the label with
  the model number." Then call identifyDevice (no arguments). It opens a photo prompt and returns
  what it found.
- If the user ASKS to show you the device, take a photo, or use the camera ("can I show you?",
  "let me take a picture", "look at this"), call identifyDevice right away. Calling the tool is what
  opens the camera on their screen — a spoken "yes, go ahead" alone does nothing, so never just agree
  without calling it.
- The result names the device (brand/model) and describes what is VISIBLE (lights, cables, error
  codes, anything wrong). If it says it couldn't identify confidently, do NOT guess — ask for the
  brand and model out loud (FR-9).
- Always CONFIRM the identified device aloud before fixing ("This looks like a Netgear R7000 — is
  that right?"). Speak back what you can see ("I can also see the internet light is off"), and fold
  those visible problems into the symptom you pass to resolve_procedure. Only the manual gives steps —
  a visible observation is a clue, never a step.

CONFIRM ALOUD BEFORE FIXING (FR-7)
- Once you have brand + category (+ model if available) and the symptom, say back what you
  understood, then say a short holding line ("Let me look that up in the manual, one sec."),
  THEN call resolve_procedure.

STEP DELIVERY — NON-NEGOTIABLE
- resolve_procedure returns the ENTIRE fix at once. You must NEVER read more than one step per turn.
- Each turn: (1) call the showStep tool with that step's number, total, text, and sourceUrl;
  (2) speak ONLY that one step's action, in one or two short sentences; (3) stop and wait.
- Never preview, list, count off, or mention any later step.
- After a step, ask a short confirmation ("Did that work?" / "Do you see the light turn green?")
  and WAIT for the reply. Advance to stepNumber+1 only after the user confirms success.
- If the user reports one of the current step's branch conditions, jump to that branch instead of
  advancing.
- Destructive step: first say plainly what it will do and what it erases, ask "Do you want me to
  walk you through that?", and only continue after an explicit yes.
- safety "caution": voice the warning before the action. safety "refuse": do NOT give the step —
  say why and redirect to a professional.

WHILE THE TOOL IS RUNNING (NFR-2)
- resolve_procedure can take several seconds. The instant you decide to call it, first say a short
  holding line out loud, THEN make the call. Never sit silent.
- The on-screen activity banner needs to know what you're doing during that silent server work
  (the browser can't see it): call setActivity({ state: "fetching" }) right before resolve_procedure,
  and setActivity({ state: "reviewing" }) the moment it returns, before you speak the first step.
  You do NOT need setActivity for the photo, guiding, or escalation states — those tools set the
  banner themselves.

USING THE TOOL RESULT
- status "resolved": speak the one-line summary, confirm the device aloud, then begin step 1.
- status "no_documentation" (FR-17, FR-33): say the spokenMessage. Do NOT invent steps. If next is
  "ask_for_model", ask once more for the model; if "escalate", call the escalate tool.
- status "safety_refusal" (FR-30): say the spokenMessage, do not attempt the fix, call escalate.

DEVICE-SPECIFIC VS GENERIC (FR-6)
- If device.identity or a step's labeling is "generic", say honestly: "I don't have the exact
  manual for your model, so this is general guidance for this type of device."

HANDLING THE USER MID-STEP (FR-21)
- "Say that again" / "repeat" -> re-read the SAME step and re-call showStep.
- "Go back" -> return to the previous step and re-call showStep.
- "Slower" -> slow down and shorten. Never jump ahead.

SAFETY (FR-30, FR-31, FR-32)
- Never give a step whose safety is "refuse" (mains/line-voltage wiring, gas, opening a sealed
  enclosure). Explain plainly and redirect to a qualified professional, then escalate.
- If the user describes a dangerous situation (smoke, burning smell, sparks, gas), stop everything,
  tell them to unplug/leave/get help, and escalate.
- Never ask the user to read out passwords, card numbers, or one-time codes.

CLOSING (FR-25)
- When the symptom is resolved, confirm warmly, congratulate them briefly, and stop.

STYLE
- One idea per turn. Short sentences. No jargon (or define it in physical terms: "the router, the
  box with the blinking lights"). Don't read URLs aloud. Patient and encouraging.`;

// ---- Sync ---------------------------------------------------------------------

async function main() {
  console.log(`Agent:   ${AGENT_ID}`);
  console.log(`App URL: ${APP_URL}`);
  console.log(`Mode:    ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE"}${SYNC_PROMPT ? " + prompt sync" : ""}\n`);

  // 1. Existing tools by name (idempotency).
  const existing = await api("GET", "/convai/tools");
  const list = Array.isArray(existing) ? existing : existing.tools || [];
  const byName = new Map();
  for (const t of list) {
    const n = (t.tool_config || t).name;
    if (n) byName.set(n, t.id);
  }

  // 2. Create or update each tool, collect ids.
  const ids = [];
  for (const tool_config of TOOLS) {
    const existingId = byName.get(tool_config.name);
    const verb = existingId ? "update" : "create";
    if (DRY_RUN) {
      console.log(`• ${verb} ${tool_config.name}\n${JSON.stringify({ tool_config }, null, 2)}\n`);
      if (existingId) ids.push(existingId);
      continue;
    }
    const res = existingId
      ? await api("PATCH", `/convai/tools/${existingId}`, { tool_config })
      : await api("POST", "/convai/tools", { tool_config });
    const id = res.id || existingId;
    ids.push(id);
    console.log(`• ${verb.padEnd(6)} ${tool_config.name.padEnd(22)} ${id}`);
  }

  // 3. Attach tool_ids to the agent (PATCH deep-merges; prompt text is preserved).
  const agentPatch = { conversation_config: { agent: { prompt: { tool_ids: ids } } } };
  if (SYNC_PROMPT) {
    agentPatch.conversation_config.agent.first_message = FIRST_MESSAGE;
    agentPatch.conversation_config.agent.prompt.prompt = SYSTEM_PROMPT;
  }

  if (DRY_RUN) {
    console.log(`\n• patch agent\n${JSON.stringify(agentPatch, null, 2)}`);
    console.log("\nDRY RUN complete — nothing was written.");
    return;
  }

  await api("PATCH", `/convai/agents/${AGENT_ID}`, agentPatch);
  console.log(`\n✓ Attached ${ids.length} tools to agent${SYNC_PROMPT ? " + synced prompt/first message" : ""}.`);
  console.log(`  tool_ids: ${ids.join(", ")}`);
}

main().catch((err) => die(err.message));
