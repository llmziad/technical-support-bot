# Architecture

Manuel's Phase 0 system is deliberately small: **one page + a few server routes.** The expensive, undifferentiated parts (real-time audio, turn-taking, barge-in) are bought from ElevenLabs. The effort concentrates where the product actually lives: the **step engine and grounding**.

## Data flow

```
 ┌─────────────────────────── Browser (Next.js page, HTTPS) ───────────────────────────┐
 │  ( Talk to Manuel )  state ring ──tap──▶ startSession(signedUrl)  (mic gesture HERE)  │
 │  useConversation(@elevenlabs/react)                                                    │
 │    client tool  showStep({n,total,text,sourceUrl}) ─▶ setState ─▶ <StepCard/> (FR-3b)  │
 └───────────────▲───────────────────────────────────────────────────┬──────────────────┘
                 │ signed_url                                          │ agent calls tools
     GET /api/signed-url                                              ▼
     (ELEVENLABS_API_KEY)                          ┌──────── ElevenLabs "Manuel" agent ────────┐
                                                   │ system prompt = pacing + safety + identity │
                                                   │ server tool: resolve_procedure             │
                                                   │ client tools: showStep, escalate           │
                                                   └───────┬───────────────────────┬────────────┘
                                                           ▼                       ▼
                                    POST /api/resolve-procedure         escalate (client tool)
                                    seed-map ▸ context.dev search ▸      EscalationCard +
                                    context.dev scrape(md, PDF) ▸        tel:+971508888888
                                    Gemini → Procedure JSON             (demo gag — no server)
```

## The two deliverables (and why the surface is this small)

Under constraint **C-1** (ElevenLabs owns the conversation loop) and **C-4** (web only), everything that is a "conversation feature" — one step at a time, waits for confirmation, barge-in, holding utterances, safety refusals — is **agent configuration**, not code we write. So the application is:

1. **The page** — mounts the agent, renders the start control, displays the current step + source link.
2. **The server routes** — the tools the agent calls. These exist because the `context.dev`, Gemini, and ElevenLabs secrets cannot live in the browser.

This is why the estimating trap (treating conversational behaviour as app features) is avoided: our real surface is a page and a handful of routes. See [`phases/phase-0-hackathon.md`](phases/phase-0-hackathon.md).

## Components

| Layer | Responsibility | Phase 0 component |
|---|---|---|
| Delivery | Landing page, session control, on-screen step + source, agent mount | Next.js app over HTTPS (Vercel) |
| Voice interface | STT, TTS, turn-taking, barge-in, audio transport | ElevenLabs Agents (mandated, C-1) |
| Orchestration | Session state, step engine, tool routing, escalation | The agent + server routes |
| Device identification | Brand/category/model from speech | The agent (LLM), confirmed aloud |
| Document discovery | Device identity → candidate URL | Seed map, then `context.dev /web/search` |
| Document retrieval | URL → clean structured text (PDF-aware) | `context.dev /web/scrape/markdown` |
| Procedure construction | Manual markdown → ordered atomic steps | Gemini (`@google/genai`) structured output |
| On-screen grounding | Show the current step + source, in sync | `showStep` client tool → React state |
| Escalation | Summarise + reach a human | `escalate` client tool → `EscalationCard` + `tel:` dialer (demo gag) |

## The retrieval pipeline (`/api/resolve-procedure`)

1. **Discover the URL.** Check the committed **seed map** first (`lib/seed-map.ts`) — reliable for demo devices. Miss → `context.dev` `POST /web/search` for the manufacturer manual. Still nothing → return `no_documentation` (the agent says so; never invents).
2. **Retrieve.** `context.dev` `GET /web/scrape/markdown?url=…` returns clean markdown. **PDF-at-URL is parsed automatically** (`pdf.shouldParse` defaults true) — this closes the "manual is a PDF" open question. Failed context.dev calls are not billed.
3. **Construct.** Gemini with `config.responseMimeType: "application/json"` + `config.responseSchema` (JSON schema) turns messy markdown into an **ordered, atomic** step list — one physical action per step, each carrying its source anchor, with destructive/safety tagging and branch conditions. It is instructed to **refuse to invent** steps not in the doc.
4. **Return** the structured `ProcedureResult` (see [`api-contracts.md`](api-contracts.md)).

**Retrieval is a tool call, not pre-stuffed context** — this keeps the conversation responsive, allows mid-session re-retrieval when the problem turns out different from first described, and keeps token cost proportional to need.

## The three stores (mostly future — Phase 2b)

Kept **separate** by design; conflating them is a known trap.

1. **Document cache** (FR-15, Phase 1) — raw manual markdown keyed by device identity. A cache with a TTL. *Not* RAG. In Phase 0 the committed seed content is effectively a pre-warmed cache.
2. **Document index** (FR-42, Phase 2b) — the manual chunked and embedded. RAG over vendor documentation, for "the answer is on page 61 of a 90-page manual."
3. **Case base** (FR-34, Phase 2b) — past solved/failed sessions, embedded on a *canonical symptom*. Retrieval over our own operational history: high signal (it worked in this house) but low trust (sample size one). See [`phases/phase-2b-resolution-memory.md`](phases/phase-2b-resolution-memory.md).

## External APIs — facts and gotchas

- **ElevenLabs Agents:** frontend `@elevenlabs/react` `useConversation`; session via **signed URL** minted server-side. **Client tools** run in-browser (can update React state); **server/webhook tools** hold secrets. Mic requires **HTTPS + a tap gesture** (iOS Safari).
- **context.dev:** base `https://api.context.dev/v1`, `Authorization: Bearer ctxt_secret_…`. `GET /web/scrape/markdown?url=` → `{success, markdown, …}`, PDF-aware. `POST /web/search {query}` → result URLs. Secret is server-side only.
- **Gemini (`@google/genai`):** structured output via `config.responseMimeType: "application/json"` + `config.responseSchema` (OpenAPI-subset via the `Type` enum). `systemInstruction` is passed in `config`. `response.text` is the raw JSON string → `JSON.parse` and guard it. No `temperature`/`top_p`/prefill restrictions. Source anchors are produced *into the schema* by the model. Reads `GEMINI_API_KEY` server-side.
- **Escalation:** no external API — the `escalate` client tool renders the `EscalationCard` and opens `tel:+971508888888` (demo gag). No Twilio, no outbound-call endpoint.

## The vendor-isolation boundary (R-16)

ElevenLabs is a single-vendor dependency for the entire conversation layer — accepted under C-1. The mitigation is architectural: the **step engine and retrieval tool are vendor-agnostic behind a clean tool interface**. The tools take plain JSON (`{brand, category, model, symptom}` in, a structured procedure out) and know nothing about ElevenLabs. If the voice layer ever needs replacing, it is the *only* thing that changes. This boundary also enables the Phase 4 multi-tenant commercial product.

## Cross-links

- Contracts & schema: [`api-contracts.md`](api-contracts.md)
- Agent prompts & tools: [`agent-config.md`](agent-config.md)
- Phase specs: [`phases/`](phases/)
- BRD constraints referenced: C-1, C-4, FR-11–18, FR-15, FR-42, FR-34, R-16.
