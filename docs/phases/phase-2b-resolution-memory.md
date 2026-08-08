# Phase 2b — Resolution Memory

> Give Manuel a memory of what it has already fixed, consulted *before* documentation, offered as a shortcut but never silently substituted for the manual. **Timeline:** Phase 1 plus 4 weeks, running as a parallel workstream to Phase 2a. **Platform:** Web. **Device ID method:** solved-case knowledge base over past sessions (keyed by device identity + canonical symptom).

## Goal
Phase 2b is where Manuel starts to *compound*. Today every session re-derives the fix from the manual; here the system persists every resolved session as a **case** and, on the next session, **queries that memory before touching documentation**. A confident match short-circuits retrieval and is **offered as a shortcut** ("last time, unplugging it for 30 seconds fixed it — shall we try that first?"), while the documented procedure stays loaded as a fallback. Done right, this turns operational history into an asset that improves with every household and every session — and, via an opt-in **global anonymised case base (FR-40)**, into a genuine network effect that underpins the Phase 4 commercial thesis. Done carelessly, a mislabeled "solved" case poisons the base and sends the next user down a dead end — so the data-quality design here is as important as the retrieval.

## Scope (in this phase)
- **Case persistence** — every resolved session written as a structured case record.
- **Symptom canonicalisation** — raw utterance → structured symptom, used as the retrieval key.
- **Case-first retrieval** — query the case base before document retrieval; short-circuit on a confident match.
- **Shortcut, not substitution** — retrieved cases offered aloud, never silently replacing the manual.
- **Negative cases** — unresolved/escalated sessions recorded with which steps failed.
- **Moving confidence** — per-case confidence that starts low and updates on delayed no-recurrence, repeated failure, and recurrence.
- **Per-device document index (RAG)** — manuals chunked + embedded for semantic retrieval within a long manual (store #2).
- **Multi-tenancy from day one** — case schema designed tenant-aware while it costs nothing.
- **Administration & privacy** — household review/correct/delete; scrubbing before any cross-household use; opt-in global contribution.

## Requirements satisfied

| BRD ID | Requirement | Priority |
| --- | --- | --- |
| FR-34 | Every resolved session persisted as a case: device identity, canonical symptom, procedure followed, the step that produced the fix, outcome | Must |
| FR-35 | Raw utterance canonicalised into a structured symptom (category, symptom class, observable signals) before embedding; canonical form is the retrieval key | Must |
| FR-36 | On a new session, the case base is queried before document retrieval; a sufficiently confident match short-circuits retrieval | Must |
| FR-37 | A retrieved case is OFFERED as a shortcut, never silently substituted for the documented procedure | Must |
| FR-38 | Sessions ending unresolved/escalated persisted as NEGATIVE cases, recording which steps failed | Should |
| FR-39 | Each case carries a confidence score derived from confirmed successes, subsequent failures, and recurrence of the same symptom on the same device | Must |
| FR-40 | Cases scoped to household by default, with an opt-in path to contribute anonymised cases to a global case base | Should |
| FR-41 | Case records scrubbed of identifying content (names, network names, addresses, credentials) before any cross-household use | Must |
| FR-42 | Manual documentation chunked and embedded per device so retrieval within a long manual is semantic, not whole-document stuffing | Should |
| FR-43 | Administrator can review, correct, and delete cases in the household case base | Should |
| FR-44 | Cases expire or are demoted when underlying device firmware, ISP, or documentation version changes, where detectable | Could |

## Components introduced
Versus Phase 1's single document cache:
- **Vector store** — holds both the **case base embeddings** (retrieval over operational history) and the **document index** (RAG over vendor docs, FR-42). These are separate collections even when co-located.
- **Relational case records** — the structured case (FR-34): device identity, canonical symptom, procedure followed, fix step, outcome, confidence, tenant/household scope.
- **Symptom-canonicalisation step** — LLM structured output (`claude-sonnet-5`) mapping a raw utterance to `{ category, symptom class, observable signals }` (FR-35).
- **Confidence-scoring / decay job** — a background job that moves confidence over time on the no-recurrence, repeated-failure, and recurrence signals (FR-39, FR-44).
- **Administration surface** — household review/correct/delete of cases (FR-43).
- **Scrub-before-promotion pipeline** — strips identifying content prior to any cross-household use (FR-41), gated by opt-in (FR-40).

## Design notes & decisions
The most consequential decisions in the roadmap live here — six points, each a trap if ignored.

1. **Three stores, not one.** The **document cache** (FR-15, a TTL cache of raw manual markdown), the **document index** (FR-42, RAG over vendor docs), and the **case base** (FR-34, retrieval over your *own* operational history) are three different things with three different lifecycles. Keep them separate or they fight — conflating cached raw text, embedded manual chunks, and solved-case records produces a store that is wrong for all three jobs.

2. **Precedence: a solved case is higher SIGNAL but lower TRUST than a manual section.** A case worked *in this house, on this device, for this person* — that's strong signal. But it might be coincidence, politeness, or dependent on state that no longer holds — that's low trust. So: **rank the case first, keep the documented procedure loaded as fallback, and fall through the moment the shortcut fails.** Never let the case base be the only thing in context.

3. **The retrieval key is the hard part.** "The box has a red light," "the internet is angry," and "no wifi" are three utterances for one symptom. Embedding the *raw* utterance produces a case base that almost never hits. **Canonicalisation (FR-35) is the difference between a KB that compounds and one that silently returns nothing** — canonicalise first, then embed the canonical form.

4. **What counts as "solved" decides asset vs. poison.** Signals, by strength:
   - **Strongest (but delayed):** the user does not reopen a session for the same device + symptom within 30 days.
   - **Middle:** the session ended without escalation.
   - **Weakest (most tempting):** the user verbally confirmed the fix.
   Therefore **write the case immediately with LOW confidence and upgrade it on the delayed no-recurrence signal.** Confidence is a field that **moves, not a boolean set at write time** (FR-39).

5. **Negative cases are underrated (FR-38).** Knowing that power-cycling did *not* fix this symptom lets the agent **skip to step four** next time — often a bigger latency win than the positive case, and effectively free to capture from escalated/unresolved sessions.

6. **Cold start & compounding.** Value is near-zero on day one and becomes the moat by month six. The single-household ceiling is modest; the interesting version is **FR-40 — a global anonymised case base where every household's fix speeds the next household's session.** That network effect is the strongest argument for the [Phase 4](./phase-4-commercial.md) commercial thesis, so **design the case schema for multi-tenancy now, while it costs nothing** — retrofitting tenancy later is expensive.

## External dependencies
- **Vector store** — for case-base and document-index embeddings; must support metadata filtering by household/tenant for scoping and isolation.
- **Relational store** — for structured case records and confidence fields.
- **Claude `claude-sonnet-5`** — symptom canonicalisation via structured output (FR-35). *Gotcha:* canonicalisation quality directly determines hit rate (R-11); treat its schema as a first-class artifact.
- **Embedding model** — for both collections. *Gotcha:* keep case-base and document-index embedding spaces conceptually distinct even if the same model is used.
- **Background job runner** — for the confidence-scoring / decay job and the delayed 30-day no-recurrence upgrade.

## Risks & mitigations

| BRD ID | Risk | Impact | Mitigation |
| --- | --- | --- | --- |
| R-9 | A case marked solved but not actually solved poisons the base | Future users sent down a dead end | Start confidence low; upgrade only on the delayed no-recurrence signal; do not offer sub-threshold cases as shortcuts |
| R-10 | A previously valid fix goes stale after a firmware/ISP/hardware change | Confidently outdated guidance | Confidence decay over time; demote on repeated failure; fall through to documentation (FR-44) |
| R-11 | Symptom retrieval never hits because utterances vary too widely | Case base silently returns nothing; no compounding | Canonicalise before embedding (FR-35); monitor case-base hit rate as a first-class metric |
| R-12 | Cross-household case sharing leaks personal detail | Privacy breach; blocks the global-base thesis | Scrub before promotion (FR-41); store only canonical symptom + procedure; opt-in only (FR-40) |

## Success metrics
- **Case base hit rate on repeat symptoms ≥ 50%** by month three.
- **Case precision (retrieved case actually resolves) ≥ 70%.**
- **Time to first actionable step on a case hit < 8s.**
- **Stale case rate < 10%.**

## Exit criteria
- Every resolved session **writes a case record** with the FR-34 fields, at **low initial confidence**.
- Raw utterances are **canonicalised before embedding**, and the canonical form is the retrieval key (FR-35).
- A new session **queries the case base before documentation** and short-circuits on a confident match (FR-36).
- A retrieved case is **offered aloud as a shortcut** with the documented procedure retained as fallback (FR-37).
- The system **falls through to documentation the moment a shortcut fails.**
- Unresolved/escalated sessions **write negative cases** recording failed steps (FR-38).
- Confidence **moves over time** on the no-recurrence, repeated-failure, and recurrence signals (FR-39).
- The case schema is **tenant-aware**, and the scrub-before-promotion + opt-in path exists (FR-40, FR-41).
- An administrator can **review, correct, and delete** household cases (FR-43).
- **Case-base hit rate is instrumented** as a first-class metric.

## Cross-links
- [Architecture](../architecture.md)
- Prior phase: [Phase 1 — Family Beta](./phase-1-family-beta.md) (document cache, store #1)
- Parallel workstream: [Phase 2a — Vision](./phase-2a-vision.md)
- Builds toward: [Phase 3 — Home Profile](./phase-3-home-profile.md) (known device identity keys both the cache and the case base) · [Phase 4 — Commercial](./phase-4-commercial.md) (multi-tenant global case base)
- BRD IDs: FR-15 (context), FR-34–FR-44; risks R-9, R-10, R-11, R-12.
