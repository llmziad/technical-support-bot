# Code Conventions

These are binding for all code in this repo. They exist to keep a hackathon-speed build coherent, and to keep a future Claude Code session on the rails.

## Working principles (first — they govern everything else)

1. **Reuse over rewrite.** Before adding anything, check for an existing util, type, client, or pattern and use it. Do **not** re-author what already exists. A new helper is justified only when nothing suitable is already here.
2. **Question your edits.** Before making a change, be able to state *why* it's needed and *what* it touches. Prefer the smallest change that works over a sweeping one. If a change grows beyond its stated purpose, stop and reconsider.
3. **Always review what you did.** After any change, re-read the diff. Confirm it does what was intended, that it matches the contracts in [`api-contracts.md`](api-contracts.md), and that nothing unrelated regressed. Reviewing your own work is part of the task, not optional.

## TypeScript & Next.js

- **App Router.** Server Components by default. Add `"use client"` **only** where interactivity is required — in practice the `TalkButton` subtree that uses `useConversation`. Keep the client bundle small.
- **API routes** are async handlers returning `NextResponse.json(...)`. They validate input, do the work, and return typed results — see errors below.
- **Strict TypeScript.** No `any` in shared types. `unknown` + a narrow is fine at boundaries (e.g. parsing a model's JSON output), immediately validated into a known type.
- **Async/await** everywhere; no floating promises. Wrap external calls (`context.dev`, Anthropic, ElevenLabs) in `try/catch` and degrade gracefully.

## Shared types are the contract

- **`lib/procedure.ts` is the single source of truth** for the procedure/step types.
- The **Claude JSON schema** (`lib/extraction.ts`) and the **ElevenLabs tool parameter schemas** (`docs/agent-config.md`) **mirror** these types. If you change a type, change both mirrors in the same commit. A drift between them is a bug even if it compiles.
- Validate model output **in TypeScript after parse** (contiguous `stepNumber`, coerced `goTo`) — never trust the shape blindly.

## Secrets & configuration

- Secrets are **server-side only**. Never reference an API key from a client component or a `NEXT_PUBLIC_` var. If a value is `NEXT_PUBLIC_`, it is public — treat it that way.
- `.env.local` is git-ignored. `.env.local.example` (names only, no values) is committed and kept in sync when a new var is introduced.
- Model ids and service base URLs are centralised (a `lib/config.ts` or top-of-client constant), not sprinkled through the code.

## Errors & graceful degradation

- Routes **never throw raw to the client.** `/api/resolve-procedure` returns a typed `ProcedureResult` — including the `no_documentation` and `safety_refusal` outcomes — so the agent always has something safe to say (NFR-9). Log the real error server-side.
- A failed `context.dev` call (not billed) → fall through to `no_documentation`, not a 500.
- Escalation is a client-side gag (opens `tel:+971508888888`); it never throws — the `EscalationCard` shows a "Call [admin]" button as a fallback if auto-dial is blocked.

## AI-application specifics

- **Prompts live in committed files** (`lib/extraction.ts` for the extractor; `docs/agent-config.md` for the agent) — never inlined ad hoc or hand-tweaked in the dashboard without updating the committed reference.
- **Structured output only** for the extractor: `output_config.format` with a JSON schema. Remember `claude-sonnet-5` rejects `temperature`/`top_p` and assistant prefill.
- Keep the **tool interface vendor-agnostic**: the routes take/return plain JSON and know nothing about ElevenLabs (see the R-16 boundary in [`architecture.md`](architecture.md)).

## Naming & structure

- Components: `PascalCase.tsx`, one component per file, in `components/`.
- Library modules: `kebab-case.ts` in `lib/`. Thin API clients live here (`contextdev.ts`), never `fetch` logic inside a component.
- Routes: `app/api/<name>/route.ts`.
- Types shared across the boundary: `lib/procedure.ts`. Types local to one module stay in that module.

## Formatting, linting, commits

- Prettier + ESLint (Next.js config). Run before committing.
- Small, focused commits with clear messages. One logical change per commit.
- Do not commit generated files, `.env.local`, or secrets.

## Git & PRs

- Work on a branch, not directly on `main`, for anything non-trivial.
- A change to product source has a runtime surface — exercise it (curl the route, drive the flow) before calling it done; don't rely on typecheck alone. See [`demo-runbook.md`](demo-runbook.md) for how to drive each flow.
