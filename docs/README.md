# Manuel — Documentation

Manuel is a voice-first web app that walks a non-technical person through fixing a device, one spoken step at a time, grounded in the real manufacturer manual. Start with the root [`CLAUDE.md`](../CLAUDE.md) for the quickest orientation.

## Doc index

| Doc | What it covers |
|---|---|
| [`../CLAUDE.md`](../CLAUDE.md) | Project entry point: what Manuel is, build shape, commands, env, guardrails |
| [`../TECH-SPEC.md`](../TECH-SPEC.md) | The technical spec: problem, architecture, tool rationale, six-hour feasibility, v2 roadmap |
| [`architecture.md`](architecture.md) | System design, data flow, external APIs and their gotchas, the three-store model |
| [`code-conventions.md`](code-conventions.md) | TypeScript/Next.js conventions and the working principles |
| [`ui-design.md`](ui-design.md) | The design system: clean/minimal, purposeful color, components, states, accessibility |
| [`agent-config.md`](agent-config.md) | ElevenLabs agent prompts, tool definitions, voice/turn-taking (source of truth) |
| [`api-contracts.md`](api-contracts.md) | The procedure schema and every route's request/response contract |
| [`demo-runbook.md`](demo-runbook.md) | Pre-warm, failure modes, on-stage checklist, the §13.1 scorecard |
| [`phases/`](phases/) | One doc per phase (0 → 4) — Phase 0 is buildable now; 1–4 record the roadmap |

## How the docs relate

- **Building Phase 0?** Read `CLAUDE.md` → `architecture.md` → `api-contracts.md` → `agent-config.md` → `phases/phase-0-hackathon.md`, and `ui-design.md` for the page.
- **Writing code?** `code-conventions.md` is binding; `api-contracts.md` holds the shared types that are the single source of truth.
- **Presenting the demo?** `demo-runbook.md`.
- **Planning later work?** `phases/phase-1..4` capture decisions and rationale so architecture choices made now (e.g. multi-tenant-ready case schema) are grounded.

## Phase map

| Phase | Name | Status |
|---|---|---|
| 0 | Hackathon demo | **Building now** |
| 1 | Family beta (Arabic, PWA, caching, real escalation) | Roadmap |
| 2a | Vision device ID (Gemini) | Roadmap |
| 2b | Resolution memory (case base) | Roadmap |
| 3 | Home profile (device registry) | Roadmap |
| 4 | Commercial (multi-tenant deflection) | Roadmap |
