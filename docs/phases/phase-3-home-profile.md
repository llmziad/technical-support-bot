# Phase 3 — Home Profile

> Register a household's devices once so the device is known before a session even starts, skipping identification entirely for known devices. **Timeline:** TBD. **Platform:** Web (native evaluated). **Device ID method:** pre-registered household device registry.

## Goal
Phase 3 attacks the slowest and riskiest part of every session — figuring out *which device* — by removing it for devices the household already owns. The family administrator registers the household's devices once, producing a **device registry** that makes identity **deterministic** for known devices. That is the single biggest win available on both **time to first actionable step** and **wrong-device rate**, and it compounds with everything already built: a known device identity is the exact key the [document cache](./phase-1-family-beta.md) and the [case base](./phase-2b-resolution-memory.md) are organized around. This phase also formally re-evaluates whether web remains the right platform.

## Scope (in this phase)
- **Household device registry** — persistent record of a household's devices, reused across sessions.
- **Proactive setup** — the family administrator registers devices once, ahead of any problem.
- **Reuse across sessions** — a session for a registered device **skips identification** entirely.
- **Native evaluation** — assess a native app; web remains primary.

## Requirements satisfied

| BRD ID | Requirement | Priority |
| --- | --- | --- |
| FR-10 | Resolved devices saved to a household registry for reuse in later sessions | Should |
| NFR-13 | Document cache hit rate above 70% in steady state for a household with a stable device set | Must |

## Components introduced
Building on Phase 1's saved devices and Phase 2b's resolution memory:
- **Household device registry** — a first-class, pre-registered store of household devices (an evolution of Phase 1's lighter "saved devices"), holding a stable device identity per device.
- **Proactive setup flow** — an administrator-facing UI to register devices once, before any session.
- **Registry-first identification** — when a session starts for a registered device, identification is skipped and the known identity is used directly to key the document cache and case base.

The registry does **not** introduce a new data store type — it produces the **device identity key** already consumed by store #1 (document cache) and the case base, making both more effective.

## Design notes & decisions
- **A pre-registered registry means the device is known before the session starts.** For known devices, identification is skipped entirely — the **biggest latency and wrong-device-rate win** in the roadmap, because it removes the step most likely to be slow or wrong.
- **Proactive setup shifts the work to the right person at the right time.** The family administrator registers the household's devices once, calmly, rather than the 55+ user identifying a device under stress mid-failure.
- **It compounds with Phase 2b.** A known device identity is the shared key for both the document cache and the case base — registration makes every downstream retrieval more likely to hit, directly supporting the **NFR-13 ≥ 70% cache-hit-rate** target for a stable device set.
- **Native is evaluated here, not adopted.** The BRD keeps **web as primary** but flags evaluating a native app at this phase. **No native app is planned in phases 0–2** — this is the first point where native is even on the table, and the default remains web.

## External dependencies
- **Persistent household/registry storage** — extends the Phase 1 saved-devices store; no new third-party vendor required.
- Reuses the existing stack: ElevenLabs (voice), context.dev (retrieval into the document cache), Gemini (procedure construction). No new external service is mandated by this phase.

## Risks & mitigations

| BRD ID | Risk | Impact | Mitigation |
| --- | --- | --- | --- |
| R-1 | Device ID fails or resolves to the wrong model | Confidently wrong steps | The registry makes identity **deterministic for known devices**, removing the identification step and materially reducing this risk |
| (ties to NFR-13) | Cache hit rate stays low for an unstable/unregistered device set | Slow, costly repeat sessions | Proactive registration builds a stable device set, driving the document cache toward the ≥ 70% steady-state hit-rate target |

## Success metrics
- **NFR-13: document cache hit rate above 70%** in steady state for a household with a stable device set.
- Expected improvement in the shared Phase 1 metrics for registered households — primarily **time to first actionable step** and **wrong-device rate** — via skipped identification.

## Exit criteria
- A family administrator can **register household devices once**, ahead of any session (FR-10).
- A session for a **registered device skips identification** and proceeds directly to the problem.
- Registered device identity **correctly keys** both the document cache and the case base.
- **Document cache hit rate ≥ 70%** is demonstrated for a household with a stable, registered device set (NFR-13).
- A **native-vs-web evaluation** is documented, with web retained as primary unless the evaluation concludes otherwise.

## Cross-links
- [Architecture](../architecture.md)
- Prior phases: [Phase 1 — Family Beta](./phase-1-family-beta.md) (saved devices) · [Phase 2b — Resolution Memory](./phase-2b-resolution-memory.md) (shared device-identity key)
- Related: [Phase 2a — Vision](./phase-2a-vision.md) (alternative identification path for unregistered devices)
- Next: [Phase 4 — Commercial](./phase-4-commercial.md)
- BRD IDs: FR-10, NFR-13; risk R-1.
