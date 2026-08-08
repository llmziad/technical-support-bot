# Phase 4 — Commercial

> Turn Manuel's grounded-voice-agent pattern into a multi-tenant, brand-scoped product sold as support deflection, monetizing the Phase 2b network effect. **Timeline:** TBD. **Platform:** Web plus an embeddable widget. **Device ID method:** multi-tenant, brand-scoped knowledge.

## Goal
Phase 4 realizes **business goal BG-3**: prove that Manuel's reusable grounded-voice-agent pattern can be **sold as support deflection** to retailers, ISPs, and appliance manufacturers. The customer here is a new persona — the **Enterprise Buyer**, a support operations lead who wants to cut IVR/hold-time/call-center load. The technical shape is multi-tenancy: each tenant (a brand, retailer, or ISP) gets **brand-scoped, isolated knowledge** — its own manuals and cases — plus a drop-in **embeddable widget** for its own site. Crucially, this is where the [Phase 2b](./phase-2b-resolution-memory.md) network effect monetizes: the opt-in **global anonymised case base (FR-40)** means every household's fix speeds the next session, across tenants — with scrubbing (FR-41) as the load-bearing privacy control. Because the Phase 2b case schema was designed tenant-aware from the start, this phase is an activation, not a retrofit.

## Scope (in this phase)
- **Multi-tenant architecture** — tenant = brand / retailer / ISP; strict data isolation between tenants.
- **Brand-scoped knowledge bases** — each tenant's manuals + cases isolated to that tenant.
- **Embeddable widget** — a drop-in component a brand hosts on its own site.
- **Global anonymised case base** — the cross-tenant network-effect asset (FR-40), gated by scrubbing (FR-41).
- **Support-deflection positioning** — reduce a brand's IVR / hold-time / call-center load.

## Requirements satisfied

| BRD ID | Requirement | Priority |
| --- | --- | --- |
| BG-3 | Prove a reusable grounded-voice-agent pattern sellable as support deflection to retailers, ISPs, and manufacturers | Must (business goal) |
| FR-40 | Cases scoped to household by default, with an opt-in path to contribute anonymised cases to a global case base | Should |
| FR-41 | Case records scrubbed of identifying content before any cross-household use | Must |
| — | Multi-tenant architecture (tenant = brand/retailer/ISP); each tenant's knowledge isolated | Must (scope) |
| — | Embeddable widget — drop-in on a brand's own site | Must (scope) |

## Components introduced
Versus the household-scoped phases:
- **Tenant layer** — a tenancy model over all knowledge (manuals, document index, case base), enforcing isolation by tenant. Activates the tenant-aware case schema designed in Phase 2b.
- **Brand-scoped knowledge bases** — per-tenant document cache, document index, and case base, isolated so no tenant sees another's manuals or cases.
- **Embeddable widget** — a self-contained, drop-in web component for a brand's own site, wrapping the same ElevenLabs voice layer + step engine.
- **Global anonymised case base** — a cross-tenant collection populated only via the FR-41 scrub-before-promotion pipeline and FR-40 opt-in; stores only canonical symptom + procedure.
- **Tenant administration / provisioning** — onboarding a brand, its manuals, and its scoping and retention policy.

The **step engine and retrieval tool stay vendor-agnostic behind the clean tool interface**, so the ElevenLabs voice layer remains the only single-vendor, replaceable dependency (see R-16).

## Design notes & decisions
- **This is where the Phase 2b network effect monetizes.** Every household's fix speeds the next household's session; sold as deflection, that reduces a brand's IVR / hold-time / call-center load. The commercial value is the compounding case base, not the voice UI alone.
- **The Phase 2b schema decision pays off here.** The reason to design the case schema tenant-aware in Phase 2b — *while it costs nothing* — was precisely to enable this phase **without a retrofit**. If that work was skipped, Phase 4 becomes a costly migration.
- **Privacy/scrubbing is load-bearing, not a feature.** The global anonymised case base only works if cross-tenant records carry **only canonical symptom + procedure**, scrubbed of names, network names, addresses, and credentials (FR-41), and only via **opt-in** (FR-40). A single leak undermines the entire cross-tenant proposition.
- **Open questions carried from the BRD:**
  - Does the Phase 4 business case change any **Phase 1 architecture decisions** around multi-tenancy? **Answer: design the schema tenant-aware early** — already reflected in Phase 2b.
  - **Who owns a case** contributed to the global base?
  - What is the **retention / expiry policy** for global cases?
- **Vendor-dependency discipline matters more commercially.** For a multi-tenant product, being locked to a single conversation vendor is a real business risk; keeping the step engine and retrieval behind a clean tool interface keeps that risk contained (R-16).

## External dependencies
- **ElevenLabs Agents** — still the mandated voice layer; for a commercial product, contract terms, per-tenant cost, and multi-tenant usage limits must be validated. Kept behind the tool interface so it remains the single replaceable part (R-16).
- **Multi-tenant data infrastructure** — the vector + relational stores from Phase 2b operated with per-tenant isolation and metadata scoping.
- **Widget hosting / embedding** — CSP, cross-origin, and per-tenant configuration for a drop-in on brand sites.
- **Tenant contracts & data-processing agreements** — ownership of contributed global cases and retention/expiry policy must be settled with each enterprise buyer.

## Risks & mitigations

| BRD ID | Risk | Impact | Mitigation |
| --- | --- | --- | --- |
| R-12 | Cross-household / cross-tenant leakage of personal detail | Privacy breach; destroys the global-base and commercial thesis | Scrub before promotion (FR-41); opt-in only (FR-40); store only canonical symptom + procedure |
| R-16 | Single-vendor dependency on ElevenLabs for the conversation layer | A commercial product hostage to one vendor's terms/availability | Keep the step engine and retrieval tool vendor-agnostic behind a clean tool interface, so the voice layer is the only replaceable part — especially important for a multi-tenant product |

## Success metrics
No Phase 4-specific numeric targets are defined in the BRD. Commercial success is framed by **BG-3** (a proven, sellable support-deflection pattern) and the **Enterprise Buyer's** deflection goal — measured by reduction in a tenant's IVR / hold-time / call-center load. The cross-tenant global case base is expected to lift the Phase 2b metrics (hit rate, case precision, time-to-first-step on a hit) beyond single-household ceilings.

## Exit criteria
- **Multiple tenants** can be provisioned with **isolated, brand-scoped knowledge** (manuals + cases); no tenant can access another's data.
- A brand can embed the **drop-in widget** on its own site and run a full grounded-voice session.
- The **global anonymised case base** is populated **only** through the scrub-before-promotion pipeline (FR-41) under **opt-in** (FR-40), and demonstrably improves cross-tenant sessions.
- The **step engine + retrieval remain vendor-agnostic** behind the tool interface, with ElevenLabs the only single-vendor dependency (R-16).
- **Case ownership and global-case retention/expiry policy** are documented and reflected in tenant agreements.

## Cross-links
- [Architecture](../architecture.md)
- Foundational to this phase: [Phase 2b — Resolution Memory](./phase-2b-resolution-memory.md) (tenant-aware case schema, global anonymised case base)
- Prior phases: [Phase 1 — Family Beta](./phase-1-family-beta.md) · [Phase 2a — Vision](./phase-2a-vision.md) · [Phase 3 — Home Profile](./phase-3-home-profile.md)
- BRD IDs: BG-3, FR-40, FR-41; risks R-12, R-16.
