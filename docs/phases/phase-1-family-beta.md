# Phase 1 — Family Beta

> Turn the hackathon prototype into a resilient, bilingual, installable app a real family can use unsupervised, with escalation as the headline feature. **Timeline:** 4–6 weeks post-hackathon. **Platform:** Web, installable as a PWA. **Device ID method:** spoken device name plus saved devices.

## Goal
Phase 1 hardens Manuel from a demo into something a 55+ non-technical user can actually rely on when no one is around to help. It adds the two languages the persona needs (**Arabic and English**), makes the session survive the messy reality of a phone in a hand at speakerphone distance (screen lock, backgrounding, dropped mic), caches the manufacturer manuals so repeat use is fast and cheap, and — most importantly — formalizes **escalation**: when Manuel can't fix it, it hands the family administrator a complete summary instead of leaving the user stranded. This is the phase that proves the core thesis (grounded, paced, patient guidance that "replaces call your son") holds up outside a controlled stage.

## Scope (in this phase)
- **Bilingual voice** — Arabic + English, language detected from the user's first utterance and held for the whole session.
- **PWA install** — add-to-home-screen, app-like entry with no app store.
- **Session resilience** — survive screen lock / tab losing focus, or fail loudly and recover.
- **Document caching** — retrieved manuals cached and keyed by device identity (store #1).
- **PDF retrieval** — extract manual content where the only source is a PDF.
- **Support-section crawl** — reach the actual troubleshooting page, not just the vendor landing page.
- **Real escalation channel** — proactive offer after repeated failures, on-demand at any time, with a structured summary to the family administrator.
- **Manufacturer support hand-off** — offer official vendor contact for hardware/warranty issues.
- **Saved devices** — remember a household's devices to speed device ID.
- **Cost instrumentation** — per-session cost tracked and budgeted across voice, LLM, and retrieval.

## Requirements satisfied

| BRD ID | Requirement | Priority |
| --- | --- | --- |
| NFR-5 | Support Arabic and English; language detected from the user's first utterance and held for the session | Must |
| NFR-7 | All primary actions one tap; min touch target 60pt; high contrast | Must |
| NFR-8b | Session survives screen lock / tab losing focus, or fails loudly and recovers rather than dying silently | Must |
| NFR-8c | Installable to home screen as a PWA — app-like entry without an app store | Must |
| FR-14 | Crawl a manufacturer support section to find the troubleshooting page, not only the landing page | Should |
| FR-15 | Retrieved documents cached and keyed by device identity so a repeat query does not re-fetch | Must |
| FR-16 | Extract PDF manual content where docs are only PDF | Must |
| FR-26 | After a configurable number of failed steps, proactively offer to contact the family administrator | Must |
| FR-27 | User can request escalation at any point | Must |
| FR-28 | Escalation sends the administrator a summary: device, reported problem, steps attempted, outcome of each | Must |
| FR-29 | Offer manufacturer's official support contact for hardware/warranty issues | Should |
| NFR-10 | Session audio not retained beyond session unless consented; transcripts retained for escalation only | Must |
| NFR-12 | Per-session cost tracked and budgeted across voice, LLM, retrieval | Must |

## Components introduced
Building on the Phase 0 single page + server API routes:
- **Document cache (store #1)** — raw manual markdown keyed by device identity, a cache with TTL. Fed by [context.dev](../architecture.md) (URL→clean markdown, `/web/search`, auto-parses PDF-at-URL, satisfying FR-16 and supporting FR-14). This is **not** RAG — do not conflate it with the Phase 2b document index.
- **Saved devices store** — lightweight per-household record of previously resolved devices, used to disambiguate spoken names.
- **Escalation service / route** — assembles the FR-28 summary and delivers it to the family administrator; channel TBD (see dependencies).
- **Cost instrumentation** — per-session metering across ElevenLabs (voice), Gemini (procedure construction), and context.dev (retrieval).
- **PWA shell** — manifest, service worker, install prompt; keep-awake handling for session resilience.
- **Localization layer** — Arabic voice selection in the ElevenLabs agent config plus RTL/bilingual UI. Note conversational behaviour stays in **agent config, not app code**.

## Design notes & decisions
- **FR-28 (the escalation summary) is the highest-leverage feature and the cheapest to demo.** It converts a 15-minute diagnostic phone call into a 30-second glance: the administrator sees the device, the reported problem, every step attempted, and the outcome of each. Prioritize it. In Phase 0 escalation is a **demo gag — a `tel:` link that opens the dialer** with the summary on screen; Phase 1 formalizes a real delivery channel. **Open question:** delivery mechanism — push / WhatsApp / SMS / email. Pick based on where the family administrator actually lives; WhatsApp is regionally strong for the Arabic-first persona.
- **Document caching (FR-15) is store #1 — a cache with TTL, keyed by device identity.** It is deliberately distinct from the later RAG document index and the case base. Keeping them separate now avoids a painful conflation in Phase 2b.
- **Arabic is not a toggle — it changes voice selection and demo impact significantly.** Detect language from the first utterance and hold it for the session (NFR-5); switching mid-session is out of scope. Arabic TTS voice quality and RTL layout are first-class, not afterthoughts.
- **Resilience must fail loudly, not silently (NFR-8b).** The trap is a session that dies quietly while the user keeps talking to a dead app. Keep the screen awake during an active session and, when audio is suspended, recover or surface a clear, recoverable error.
- **Escalation is proactive and on-demand.** FR-26 triggers after a *configurable* number of failed steps; FR-27 lets the user bail to a human at any moment. Both routes produce the same FR-28 summary.
- **Privacy posture (NFR-10):** session audio is discarded at session end unless the user consents; transcripts are kept only to support escalation.

## External dependencies
- **ElevenLabs Agents (Conversational AI)** — mandated voice layer (STT/TTS/turn-taking/barge-in/audio transport). *Gotcha:* Arabic voice selection and quality must be validated early; the agent config owns all conversational behaviour.
- **context.dev** — URL→clean markdown, `/web/search`, auto-parses PDF-at-URL (FR-14, FR-16). *Gotcha:* manufacturer support sites vary wildly; crawling to the actual troubleshooting page is a Should, not guaranteed.
- **Gemini (`@google/genai`)** — structured-output procedure construction. *Gotcha:* cost per session must stay inside the NFR-12 budget.
- **Escalation channel provider** — push/WhatsApp/SMS/email (undecided). *Gotcha:* WhatsApp Business and SMS both carry onboarding/approval overhead; scope the chosen one early.
- **HTTPS everywhere from hour one** — required for mic permission on mobile browsers (see R-13).

## Risks & mitigations

| BRD ID | Risk | Impact | Mitigation |
| --- | --- | --- | --- |
| R-13 | Mobile browser blocks or drops the mic | No voice = no product | HTTPS from hour one, an explicit permission explanation, and testing on the actual device/browser the persona uses |
| R-14 | Screen lock / backgrounding suspends audio mid-session | Session dies silently, user abandoned | Keep the screen awake during an active session; recover rather than fail silently (NFR-8b) |
| R-6 | The device under repair is the internet connection itself | Can't fetch the manual when it's needed most | Cache last-known documents (store #1); ship an offline generic router flow |

## Success metrics
Targets apply from Phase 1 onward:
- **Unassisted resolution rate ≥ 60%**
- **Escalation rate ≤ 25%**
- **Time to first actionable step < 30s**
- **Repeat requests per session < 1.5**
- **Wrong-device rate < 5%**
- **Reduction in direct calls to the family administrator ≥ 50%**

## Exit criteria
- A user can complete a full session in **Arabic and in English**, with language correctly detected from the first utterance and held.
- The app **installs to the home screen** as a PWA and launches app-like.
- A session **survives a screen lock and a backgrounding event**, or recovers with a clear error — verified on the real target device/browser.
- A repeat query for a known device is served **from the document cache** with no re-fetch (FR-15).
- A PDF-only manual is successfully **parsed and used** in a session (FR-16).
- Escalation fires **both proactively (FR-26) and on demand (FR-27)**, delivering a complete **FR-28 summary** to the family administrator.
- Per-session cost is **tracked and reported** across voice, LLM, and retrieval (NFR-12).

## Cross-links
- [Architecture](../architecture.md)
- Prior phase: Phase 0 (foundation)
- Next / parallel: [Phase 2a — Vision](./phase-2a-vision.md) · [Phase 2b — Resolution Memory](./phase-2b-resolution-memory.md)
- Later: [Phase 3 — Home Profile](./phase-3-home-profile.md) · [Phase 4 — Commercial](./phase-4-commercial.md)
- BRD IDs: NFR-5, NFR-7, NFR-8b, NFR-8c, FR-14, FR-15, FR-16, FR-26, FR-27, FR-28, FR-29, NFR-10, NFR-12; risks R-6, R-13, R-14.
