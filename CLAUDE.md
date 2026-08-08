# CLAUDE.md — Manuel

> Read this first. It's the entry point for any Claude Code session or developer working in this repo.

## What Manuel is

**Manuel** is a voice-first web app that helps a non-technical person fix a device by *talking* to it — "a manual that talks back." The user opens a link, taps one button, says what's wrong in plain language, and Manuel identifies the device, reads the **real** manufacturer manual, and walks them through the fix **one spoken step at a time**, waiting for confirmation before advancing. Nothing to install.

**The core bet is not "an LLM that knows about routers."** It is *grounded, paced, patient* guidance: every instruction traceable to the actual manual for the actual model, delivered at the speed of someone holding the device in their hand. Manuel exists to replace "call your son."

Primary user: 55+, low tech confidence, hands and eyes occupied (device in one hand, phone in the other). They will not scroll, will not type a model number, will not read a PDF.

## The build shape

Under the mandated constraints (ElevenLabs owns all voice/turn-taking/barge-in; web only), the app reduces to:

1. **One page** that mounts the ElevenLabs agent and renders the current step + source link.
2. **A few server routes** the agent calls as tools (secrets can't live in the browser).

**Everything conversational — pacing, safety refusals, holding utterances — is ElevenLabs _agent configuration_, not application code.** When a requirement describes how Manuel *talks*, it's a prompt/tool/voice setting (see `docs/agent-config.md`), not a code change.

## Architecture in 8 lines

- Browser: Next.js page, `@elevenlabs/react` `useConversation` (SDK, not the widget → we own the UI).
- Session auth: `GET /api/signed-url` mints an ElevenLabs signed URL server-side.
- The agent calls a **server tool** `resolve_procedure` (the step engine).
- The agent calls **client tools** `showStep(...)` (renders the on-screen step + source link **in sync with the voice**) and `escalate(...)` (the phone-dialer gag).
- `POST /api/resolve-procedure`: seed-map → context.dev search → context.dev scrape (PDF-aware) → `claude-sonnet-5` structured output → an ordered, atomic step list.
- `escalate` **client tool**: shows the on-screen `EscalationCard` and opens the phone dialer via a `tel:+971508888888` link — a demo gag ("Manuel calls the son"). No server route, no Twilio.
- The step engine + retrieval sit behind a **clean tool interface** so the voice layer is the only single-vendor dependency.

Full detail: [`docs/architecture.md`](docs/architecture.md).

## Commands

```bash
npm install
npm run dev            # local dev (mic works on http://localhost)
npm run build && npm start
# deploy: push to origin → Vercel auto-deploys (HTTPS automatic)

# exercise the step engine directly:
curl -X POST "$APP_URL/api/resolve-procedure" \
  -H 'content-type: application/json' \
  -d '{"brand":"Netgear","category":"wifi router","model":"R7000","symptom":"no internet, red light"}'
```

## Environment variables (names only — never commit secrets)

All are **server-side**. Nothing sensitive is ever `NEXT_PUBLIC_`.

| Var | Used by |
|---|---|
| `ELEVENLABS_API_KEY` | `/api/signed-url` |
| `ELEVENLABS_AGENT_ID` | the "Manuel" conversation agent |
| `CONTEXT_DEV_API_KEY` | `/api/resolve-procedure` |
| `ANTHROPIC_API_KEY` | `/api/resolve-procedure` (`claude-sonnet-5`) |
| `NEXT_PUBLIC_APP_URL` | webhook tool base URL (non-secret) |
| `NEXT_PUBLIC_ADMIN_TEL` | escalation `tel:` number (non-secret; defaults to `+971508888888`) |

`.env.local` is git-ignored; `.env.local.example` is committed.

## External services + the one gotcha each

- **ElevenLabs Agents** — voice layer (mandated). Mic needs **HTTPS + a user-gesture tap** (iOS Safari).
- **context.dev** — URL→clean markdown; also `/web/search`; auto-parses PDF-at-URL. Secret is **server-side only**.
- **Anthropic `claude-sonnet-5`** — structured output via `output_config.format`. **Rejects `temperature`/`top_p` and assistant prefill.** No Citations API with structured output.
- **Escalation** — no external service; a client-side `tel:+971508888888` link (demo gag).

## Guardrails / non-negotiables

1. **Secrets server-side only.** Never put an API key in a client tool or `NEXT_PUBLIC_`.
2. **`startSession` only from a tap handler** (never on mount / in `useEffect`) — iOS Safari requires a user gesture for mic + audio.
3. **One step per turn.** Manuel never reads more than one step at a time. This is the product.
4. **Never invent steps.** If the manual doesn't cover it, say so (`no_documentation`). Every step carries its source.
5. **`lib/procedure.ts` is the single source of truth** for shared types. The Claude JSON schema and the ElevenLabs tool schemas *mirror* it — change the type, change both.

## Where things live

- Page & UI: `app/page.tsx`, `components/` — see [`docs/ui-design.md`](docs/ui-design.md).
- Server routes: `app/api/*` — contracts in [`docs/api-contracts.md`](docs/api-contracts.md).
- Shared types / clients / prompts: `lib/` (`procedure.ts`, `contextdev.ts`, `extraction.ts`, `seed-map.ts`, `clientTools.ts`).
- Agent config (lives in the ElevenLabs dashboard; committed reference): [`docs/agent-config.md`](docs/agent-config.md).
- Roadmap: [`docs/phases/`](docs/phases/) — one doc per phase (0 → 4).
- Demo: [`docs/demo-runbook.md`](docs/demo-runbook.md).
- Conventions: [`docs/code-conventions.md`](docs/code-conventions.md).

## Working principles (how we build here)

- **Reuse over rewrite.** Before adding code, look for an existing util, type, or pattern and use it. Don't re-author what already exists.
- **Question your edits.** State *why* a change is needed and what it touches before making it. Prefer the smallest change that works.
- **Always review what you did.** After any change, re-read the diff, confirm it does what was intended, and check nothing else regressed.
