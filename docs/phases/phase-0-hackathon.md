# Phase 0 — Hackathon Demo

> Ship a voice-only Manuel that identifies a device from speech, reads the real manual, and walks the user through the fix one step at a time — from a public URL on a phone, no install. **Timeline:** 8 August 2026 (today). **Platform:** responsive web app over HTTPS. **Device ID method:** spoken device name.

## Goal
Phase 0 proves the core thesis on stage: **grounded, paced, patient guidance.** A judge (or a frustrated 55-year-old) opens a link on a phone, taps once, says "the internet box has a red light," and Manuel confirms the device, reads the actual manufacturer manual, and delivers the fix **one spoken step at a time**, waiting for confirmation. The on-screen step + source link make the grounding *visible* — proof this isn't a chatbot with a nice voice. It also demonstrates the guardrails (a safety refusal) and the human safety-net (escalation that literally phones the family admin). This is the buildable phase; Phases 1–4 are roadmap.

## Scope (in this phase)
- **Voice session** — one tap starts a session; ElevenLabs owns STT/TTS/turn-taking/barge-in.
- **Spoken device identification** — brand/category/model extracted from speech, confirmed aloud.
- **Grounded retrieval** — seed map for demo devices, live `context.dev` search+scrape (PDF-aware) for the rest.
- **The step engine** — manual markdown → ordered, atomic steps via Gemini; one step per turn.
- **On-screen grounding** — current step + source manual link, in sync with the voice (FR-3b).
- **Safety** — refuse mains/gas/sealed-enclosure work; gate destructive steps; never ask for secrets.
- **No-documentation path** — when nothing is found, say so honestly and offer escalation; never invent.
- **Escalation gag** — the `escalate` client tool shows a summary card and opens the dialer via `tel:+971508888888` ("Manuel calls the son").

## Requirements satisfied

| BRD ID | Requirement | Priority |
| --- | --- | --- |
| FR-1 | Start a session with a single tap; no menu, no login, no install | Must |
| FR-2 | Agent opens with a short, plain-language "what's wrong?" prompt | Must |
| FR-3 | Mic permission preceded by a plain-language on-screen explanation | Must |
| FR-3a | Served over HTTPS at a stable, bookmarkable URL | Must |
| FR-3b | Current step + source doc link shown on screen alongside the spoken guidance | Should |
| FR-4 | Extract brand, category, model from the spoken description | Must |
| FR-5 | At most two grounded clarifying questions (answerable by looking, not by knowing specs) | Must |
| FR-6 | Accept "I don't know" and proceed on category with clearly-labelled generic guidance | Must |
| FR-7 | Confirm device understanding aloud before searching | Should |
| FR-11 | Locate candidate official documentation URLs for the device | Must |
| FR-12 | Retrieve page content as clean, LLM-ready text via context.dev | Must |
| FR-13 | Prioritise manufacturer domains over aggregators/forums | Should |
| FR-17 | When no official docs found, say so and offer generic troubleshooting | Must |
| FR-18 | Convert docs into an ordered, atomic step list held as session state | Must |
| FR-19 | Deliver exactly one step per turn; never read the full list | Must |
| FR-20 | Wait for user confirmation before advancing | Must |
| FR-21 | Handle "repeat", "go back", "slower", "I don't see it" without losing place | Must |
| FR-22 | Interpret a non-literal confirmation as confirmation + new signal; may branch | Should |
| FR-23 | Each step internally linked to its source document section | Must |
| FR-24 | Support barge-in (user interrupts, agent stops) | Must |
| FR-25 | On resolution, confirm the fix and close warmly | Should |
| FR-30 | Refuse mains-electrical, gas, or sealed-enclosure instructions; redirect | Must |
| FR-31 | Before any destructive action, state the consequence and require explicit confirmation | Must |
| FR-32 | Never ask the user to read out passwords, card numbers, or one-time codes | Must |
| FR-33 | Never invent steps; if the docs don't cover it, say so | Must |
| NFR-2 | Emit a natural holding utterance when a tool call is slow (no silence) | Must |
| NFR-4 | Speech rate configurable and defaulting slower than the ElevenLabs standard | Must |
| NFR-6 | No unexplained jargon; define in physical terms | Must |
| NFR-8 | Works at speakerphone-equivalent audio levels (phone held away from face) | Must |
| NFR-8a | Supported browsers: mobile Safari (iOS) and Chrome (Android), current + one prior | Must |
| NFR-9 | Graceful degradation: if retrieval fails, still conduct a useful generic conversation | Must |

## Components introduced
The whole system is introduced here (greenfield). See [`architecture.md`](../architecture.md).
- **The page** — Next.js, `@elevenlabs/react` `useConversation`; the `TalkButton`, `StepCard`, `MicExplainer`, `EscalationCard` components ([`ui-design.md`](../ui-design.md)).
- **`GET /api/signed-url`** — mints the ElevenLabs signed URL server-side.
- **`POST /api/resolve-procedure`** — the step engine: seed map → context.dev search → context.dev scrape (PDF-aware) → Gemini (`@google/genai`) structured output → `ProcedureResult`.
- **`showStep` + `escalate` client tools** — `showStep` renders the on-screen step + source in sync with the voice; `escalate` shows the summary card and opens the `tel:` dialer (gag).
- **Seed map** (`lib/seed-map.ts`) — 5 committed demo devices so retrieval never misses on stage.
- **One ElevenLabs agent** (Manuel) — config in [`agent-config.md`](../agent-config.md).

## Design notes & decisions
- **The step engine is the actual product.** A model that answers well but dumps eight instructions in one breath fails this user every time. The procedure is a **structured object** (steps array, source anchors, branch conditions) the agent reads from — which also makes "go back" and "repeat" trivial instead of a memory problem. See the schema in [`api-contracts.md`](../api-contracts.md).
- **Tool-return granularity: ship v1 (whole procedure) + a hard prompt constraint; pivot to v2 (`get_next_step`) only if the agent dumps steps.** The exact pivot test is in [`demo-runbook.md`](../demo-runbook.md). Types are identical across v1/v2, so the pivot is bounded.
- **Doc discovery: seed map first, live search second.** `context.dev` has its own `/web/search`, so the BRD's "architectural gap" (context.dev isn't a search engine) is closed without a separate search API. Seeding the demo devices makes live retrieval the "and it handles ones we've never seen" moment rather than a single point of demo failure.
- **FR-3b contradicts "zero reading" on purpose, and that's fine.** The on-screen step + manual link aren't for the primary persona — they're the visible proof of grounding for a judge or the family administrator. The screen stays fully optional to the spoken flow.
- **Grounded clarifying questions only (FR-5).** Never "what is the model number"; instead "is there a small sticker on the bottom, can you read me the letters?" This is the difference between a demo that works and one that stalls.
- **Escalation is a demo gag.** When Manuel can't help, it *calls the son* — the exact human it's replacing — via a `tel:+971508888888` link, with the summary shown on screen. No Twilio, no server route, no second agent (deliberately kept lightweight for the demo). Detail in [`agent-config.md`](../agent-config.md) and [`api-contracts.md`](../api-contracts.md).
- **Safety and no-doc are structural, not vibes.** The schema has first-class `safety_refusal` and `no_documentation` outcomes; the extractor is instructed to refuse to invent. The agent always has something safe to say (NFR-9).

## External dependencies
- **ElevenLabs Agents** — mandated voice layer. *Gotchas:* mic needs HTTPS + a tap gesture (iOS Safari); verify web SDK behaviour on mobile Safari early; confirm tool calls don't cut off speech.
- **context.dev** — URL→clean markdown, `/web/search`, PDF-at-URL auto-parse. *Gotcha:* JS-heavy vendor portals vary; validate the seed URLs resolve.
- **Gemini (`@google/genai`)** — structured-output step construction via `config.responseMimeType: "application/json"` + `config.responseSchema`. *Gotcha:* `response.text` is the raw JSON string → `JSON.parse` and guard it; anchors produced into the schema. Reads `GEMINI_API_KEY` server-side.
- **Escalation** — none. A client-side `tel:+971508888888` link (demo gag); no Twilio, no external account.
- **Vercel + HTTPS from hour one** — mic is blocked on non-secure origins; deploy before building features.

## Risks & mitigations

| BRD ID | Risk | Impact | Mitigation |
| --- | --- | --- | --- |
| R-1 | Device ID resolves to the wrong model → confidently wrong steps | High | Confirm identity aloud before proceeding (FR-7); label generic guidance as generic (FR-6) |
| R-2 | Manual is a PDF or behind a JS-heavy portal; retrieval returns nothing usable | High | Validate retrieval against the demo device list; seed known URLs; PDF-at-URL auto-parsed |
| R-3 | Latency breaks the conversation; the user talks over the agent | High | Holding utterance before the tool call (NFR-2); pre-warm; parallel retrieval |
| R-4 | Agent hallucinates plausible steps when documentation is thin | High | Per-step source traceability (FR-23); explicit `no_documentation` path (FR-17, FR-33) |
| R-7 | Rate limits throttle the demo | Medium | Pro tier removes the quota risk; still pre-warm the seed devices |
| R-13 | Mobile browser blocks/drops the mic | High | HTTPS from hour one; permission explainer (FR-3); test on the real demo iPhone/Safari |
| R-15 | Acoustic echo: agent interrupts itself hearing its own voice | Medium | Rely on SDK echo cancellation; verify at speakerphone volume; use headphones in dev |

## Success metrics (§13.1 — demo)
- Runs from a public HTTPS URL opened on a phone browser, no install.
- End-to-end resolution on **≥3 devices**, **≥1 not pre-seeded**.
- **No dead air longer than 3s** in any turn.
- **One demonstrated safety refusal.**
- **One demonstrated escalation summary** (the phone rings, Manuel reads it).
- On-screen step + source manual link visible throughout (evidence of grounding).

## Exit criteria
- Public HTTPS URL opens and starts a voice session on a real iPhone (Safari) with one tap.
- `POST /api/resolve-procedure` returns atomic steps with contiguous `stepNumber` and non-empty `sourceAnchor.quote` for each seed device; `no_documentation` for a garbage device; `safety_refusal` for a mains-wiring symptom.
- A full spoken walkthrough delivers **one step per turn** with `<StepCard/>` in sync and a working source link.
- The pacing pivot test passes (or v2 is switched in).
- Triggering escalation shows the summary card and **opens the dialer to `tel:+971508888888`** (the gag lands).

## Cross-links
- [Architecture](../architecture.md) · [API contracts](../api-contracts.md) · [Agent config](../agent-config.md) · [UI design](../ui-design.md) · [Demo runbook](../demo-runbook.md)
- Next phase: [Phase 1 — Family Beta](./phase-1-family-beta.md)
- BRD IDs: FR-1–FR-7, FR-11–FR-13, FR-17–FR-25, FR-30–FR-33; NFR-2, NFR-4, NFR-6, NFR-8/8a, NFR-9; risks R-1–R-4, R-7, R-13, R-15; constraints C-1, C-4.
