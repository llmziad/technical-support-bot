# Phase 2a — Vision

> Let the user identify a device by pointing the camera at it (or its rating label) instead of naming it aloud, with a confidence gate and voice fallback. **Timeline:** Phase 1 plus 4 weeks. **Platform:** Web (camera via browser). **Device ID method:** photo of device or rating label, identified by Google Gemini.

## Goal
Phase 2a removes the hardest thing to say out loud: the exact brand and model. The persona is holding a broken device — the model number is usually printed on a sticker they can barely read. Letting them **photograph the device or its rating label** and having Gemini extract brand + model is a faster, lower-error path to a correct device identity than spelling it out. Because a wrong identity produces confidently wrong steps, vision is deliberately built as an *assist* on top of the voice flow, not a replacement: below a confidence threshold it **falls back to voice**, and it always **confirms the identity aloud** before proceeding. This is an independent workstream from Phase 2b and can ship in either order.

## Scope (in this phase)
- **Camera-based device identification** — capture a photo of the device or its rating/label and identify brand + model via Gemini.
- **Confidence-gated fallback** — below threshold, hand off to the Phase 1 voice identification flow.
- **Spoken confirmation** — the identified device is confirmed aloud before any procedure begins.
- **Photo privacy** — photos deleted immediately after identification completes.

## Requirements satisfied

| BRD ID | Requirement | Priority |
| --- | --- | --- |
| FR-8 | User can photograph the device or its rating label; system identifies brand and model from the image | Must |
| FR-9 | Vision identification falls back to the voice flow when confidence is below threshold | Must |
| NFR-11 | Photos captured for device identification are deleted after identification completes | Must |
| C-3 | Gemini provides vision-based device identification (constraint) | Must |

## Components introduced
Versus Phase 1 (spoken name + saved devices):
- **Camera capture UI** — browser `getUserMedia`/file-capture, styled for the 55+ persona (large shutter target, one-tap, works at arm's length).
- **Vision identification service (Gemini)** — image → `{ brand, model, confidence }`, with the rating-label path treated as higher-signal than the device photo.
- **Confidence gate** — routes to the procedure flow on a confident hit, or to the Phase 1 voice identification flow below threshold (FR-9).
- **Ephemeral photo handling** — images held only long enough to identify, then deleted (NFR-11); nothing persisted to the document cache, index, or case base.

The identified device identity feeds the **same device-identity key** used by the Phase 1 document cache and (later) the Phase 2b case base — vision changes *how* identity is obtained, not what identity means downstream.

## Design notes & decisions
- **Independent workstream from Phase 2b — ships in either order.** No dependency between vision and resolution memory; sequence by team capacity.
- **The rating/label photo is often higher-signal than the device photo.** Model numbers live on the sticker, not the chassis. Encourage the label shot; when both are available, weight the label.
- **Confidence-threshold gating is essential — this is the whole design.** A wrong-model identification produces *confidently wrong steps*, which is worse than no identification. This ties directly to **R-1**. Below threshold, do not guess: fall back to voice.
- **Vision must still confirm aloud and fall back below threshold.** Even a confident vision hit is spoken back ("This looks like a *Netgear R7000* — is that right?") before proceeding, preserving the paced, patient contract of the voice product.
- **Privacy is a hard requirement, not a nicety (NFR-11).** Photos are deleted the moment identification completes. They are for identity only and never enter any of the three data stores.

## External dependencies
- **Google Gemini (C-3)** — mandated vision provider for brand/model identification. *Gotchas:* per-image latency and cost must fit the "time to first actionable step" budget; must return a usable confidence signal to drive FR-9; label OCR quality varies with lighting and glare on the sticker.
- **Browser camera access** — requires HTTPS and a camera permission grant; behaviour and constraints vary across mobile browsers (reuse the Phase 1 R-13 permission-explanation pattern).

## Risks & mitigations

| BRD ID | Risk | Impact | Mitigation |
| --- | --- | --- | --- |
| R-1 | Device ID fails or resolves to the wrong model | Confidently wrong steps sent to a vulnerable user | Confirm identity aloud before proceeding; label generic guidance as generic; gate on a confidence threshold and fall back to the voice flow below it (FR-9) |

## Success metrics
No vision-specific targets are defined in the BRD for this phase. Vision is expected to move the shared Phase 1 metrics — primarily **wrong-device rate < 5%** and **time to first actionable step < 30s** — by making device identity faster and more accurate. Track vision hit rate and fallback rate as supporting indicators.

## Exit criteria
- A user can **photograph a device or its rating label** and receive a correct brand + model identification (FR-8).
- Below the confidence threshold, the flow **falls back to voice identification** cleanly (FR-9).
- The identified device is **confirmed aloud** before any procedure starts.
- Captured photos are **verifiably deleted** after identification completes (NFR-11).
- Vision-derived identity correctly **keys into the document cache** (and, if 2b has shipped, the case base) with no separate identity concept.

## Cross-links
- [Architecture](../architecture.md)
- Prior phase: [Phase 1 — Family Beta](./phase-1-family-beta.md)
- Parallel workstream: [Phase 2b — Resolution Memory](./phase-2b-resolution-memory.md)
- Next: [Phase 3 — Home Profile](./phase-3-home-profile.md) · [Phase 4 — Commercial](./phase-4-commercial.md)
- BRD IDs: FR-8, FR-9, NFR-11, C-3; risk R-1.
