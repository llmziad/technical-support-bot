# Demo-Day Runbook

Everything needed to make Phase 0 land on stage. Read this the day before, not the hour of.

## The demo devices

Five real devices on the table; **seed the manuals** for the reliable path, and reserve **one un-seeded** device for the live-retrieval "and it handles anything" moment (§13.1 wants ≥3 devices, ≥1 not pre-seeded).

| Device | Role | Seed? |
|---|---|---|
| Wi-Fi router | Hero scenario (red light, no internet) | ✅ seed |
| Printer | Offline / won't connect | ✅ seed |
| Smart TV / streaming box | No signal / wrong input | ✅ seed |
| Appliance with error code | "Read me the code on the screen" flow | ✅ seed |
| iPhone | Live retrieval (`support.apple.com` scrapes cleanly) | ⛔ leave un-seeded |

Fill exact model numbers into `lib/seed-map.ts` once the devices are in hand.

## Pre-warm (do this ~30 min before)

1. **Run each seed device once** through `/api/resolve-procedure`. This (a) caches the scrape, (b) warms the Gemini extraction path, and (c) confirms every seed URL still resolves.
2. **Refresh the page** right before presenting so the ElevenLabs signed URL is fetched fresh at tap time (it expires ~15 min).
3. **Test the escalation call** to your own phone end-to-end (see below) — hours before, never live.
4. On the demo phone: **pre-grant microphone permission** to the domain; set volume up; use the actual device+browser you'll present on.

> Pro-tier on all services, so credits/rate-limits are not a blocker — pre-warm is purely for **latency and confidence**, not quota.

## Top failure modes → mitigation

1. **Mic on mobile Safari needs a tap gesture + HTTPS.** `startSession` fires only from the button's `onClick`, never on mount / in `useEffect`. Vercel provides HTTPS. Test on a real iPhone in Safari, not just desktop Chrome.
2. **Signed URL expires (15 min).** Fetch it **inside** `start()` at tap time; if `startSession` errors, refetch once and retry.
3. **Latency dead-air (>3s reads as "frozen").** The mandatory holding utterance ("Let me look that up, one sec.") is spoken **before** the tool call; plus a subtle on-screen "Looking in the manual…" state. Dead air > 3s in any turn fails a §13.1 criterion.
4. **Agent dumps multiple steps.** The single biggest UX risk. The non-negotiable pacing block is in the system prompt; run the pivot test below; keep the v2 `get_next_step` interface ready ([`api-contracts.md`](api-contracts.md)).
5. **Retrieval whiffs on an off-script device from the audience.** The `no_documentation` path is a **rehearsed, honest outcome** — the agent says so and offers escalation, inventing nothing. Optionally steer the live-retrieval moment to the iPhone (known-good).
6. **Safety question asked live** ("how do I rewire the plug?"). The `safety_refusal` / per-step `refuse` paths redirect to a professional — demonstrating the guardrail on purpose is a strength.
7. **Escalation `tel:` doesn't auto-dial.** On some browsers `window.location.href = "tel:…"` is blocked without a direct user gesture. The `EscalationCard` shows a large "Call [admin]" button as the fallback — tap it live. Confirm `tel:` opens the dialer on the actual demo phone beforehand.

## The pacing pivot test (run during rehearsal)

Run **8 scripted dialogues** across the seed devices. Count any turn where the agent voices step *n+1* before the user confirms step *n*, or lists/counts multiple steps. **If it happens in ≥2 of 8 dialogues, or twice in any single dialogue → pivot from v1 (whole-procedure) to v2 (`get_next_step`)** so the tool boundary enforces pacing. A one-off slip can be re-tuned in the prompt; a reproducible pattern means pivot.

## Escalation gag — pre-demo checklist

- [ ] `NEXT_PUBLIC_ADMIN_TEL` set (defaults to `+971508888888`).
- [ ] Tapping the `EscalationCard` "Call [admin]" button opens the native dialer on the demo phone.
- [ ] The agent calls `escalate` and speaks the hand-off line ("I'm getting Ziad on the phone for you now").

## §13.1 demo scorecard

- [ ] Runs from a public HTTPS URL opened on a phone browser — no install.
- [ ] End-to-end resolution on **≥3 devices**, **≥1 not pre-seeded**.
- [ ] **No dead air longer than 3s** in any turn.
- [ ] **One safety refusal** demonstrated.
- [ ] **One escalation** demonstrated (summary on screen + the dialer opens to call the admin).
- [ ] On-screen **step + source manual link** visible throughout (proof of grounding).

## Cross-links

- Flows to drive: [`api-contracts.md`](api-contracts.md) · Agent behaviour: [`agent-config.md`](agent-config.md) · Phase spec: [`phases/phase-0-hackathon.md`](phases/phase-0-hackathon.md)
