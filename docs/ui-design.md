# UI Design

**Direction: clean, simple, minimal — with purposeful color where it earns its place.** Legibility and reassurance come first; ornament never. The interface is calm because the user is not.

The screen is **not the interface** — the voice is. The screen exists to (a) make the grounding *visible* (the current step + a link to the real manual — this is the cheapest thing that separates Manuel from a chatbot with a nice voice), and (b) show what Manuel is doing so silence never reads as "it froze." The primary user (55+, frustrated, device in one hand) should be able to use Manuel with the screen face-down.

## Principles

- **Zero reading required to _use_ it.** Everything essential is spoken. The screen is proof and reassurance, not instructions to read.
- **One focal action per screen.** There is one thing to look at at a time.
- **Show the mechanics.** Listening, speaking, looking in the manual — each has a distinct, unmistakable state.
- **Restraint.** Generous whitespace, few elements, no decoration that doesn't carry meaning.
- **Legible at arm's length.** Designed to be read with the phone held away from the face, on speakerphone.

## Color — functional, not decorative

A neutral base with **one calm primary accent**, plus **semantic colors that appear only when they carry meaning**. Color communicates state; it is not spread around for style. (Values are a starting point; tune for contrast.)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--surface` | `#FAFAFA` | `#0E0F11` | Page background |
| `--text` | `#141518` | `#F4F5F7` | Primary text |
| `--muted` | `#6B7078` | `#9AA0A8` | Secondary text, labels |
| `--hairline` | `#E6E7EA` | `#23262B` | Dividers, card borders |
| `--accent` (primary) | `#2F6BFF` | `#5B87FF` | Listening state, links, focus ring |
| `--speaking` (amber) | `#E08600` | `#F0A22E` | Agent speaking / "looking in the manual" |
| `--danger` (red) | `#D22D2D` | `#F0554F` | Safety refusal, destructive-step warning, live-mic dot, muted-mic toggle |
| `--success` (green) | `#1E9E5A` | `#3FBE7A` | Resolved / fix confirmed |

Rules:
- **Red only means danger or "live."** Never use it decoratively.
- **Green only means resolved.** It appears once, at the end.
- Most of the screen is neutral most of the time. The accent/state color is the one thing drawing the eye.
- Support light and dark; ensure ≥ 4.5:1 contrast for text, ≥ 3:1 for large text and the state ring.

## Typography

- **One clean, highly legible sans** — system UI stack / Inter. No display or novelty faces.
- **Large throughout**, because of the 55+ persona (NFR-6/7). Suggested scale (mobile-first):

| Role | Size / weight |
|---|---|
| Step text (the thing being read) | 24–28px / 600, line-height 1.4 |
| Step counter (`1 / 5`) | 40–56px / 700 |
| Section labels | 14px / 600, `--muted`, uppercase tracking |
| Source link | 18px / 500, `--accent`, underlined |
| Helper / mic explainer | 18–20px / 400 |

Never go below 16px for anything a user is meant to read.

## Layout

- **Single column, mobile-first.** Content centered, comfortable max width.
- Grid-aligned, flat: **no drop shadows as decoration**, no skeuomorphism. At most hairline dividers (`--hairline`) and soft rounded corners (12–16px).
- One clear vertical rhythm; lots of breathing room around the focal element.

## The "Talk to Manuel" control

One **large circular button**, centered — the only thing on the idle screen besides a one-line prompt. Around it, a **soft pulsing ring** encodes state via the semantic colors:

| State | Ring | Center | Note |
|---|---|---|---|
| Idle | Neutral, still | "Talk to Manuel" | The only CTA. Min 96px diameter, ≥ 60pt tap target. |
| Connecting | Neutral sweep | small spinner | Right after tap, before audio. |
| Listening | `--accent`, slow breathing | mic glyph + small `--danger` dot | Mic is hot; the red dot means "live." |
| Agent speaking | `--speaking` (amber) pulse | sound glyph | Pulses roughly with speech. |
| Looking in the manual | `--speaking` slow rotate | — | Companion to the spoken holding line (NFR-2). |
| Resolved | `--success` ring, settle | check glyph | Brief, warm. |
| Error / recover | `--danger` hairline | retry affordance | Recover, don't die silently (NFR-8b). |

## Components

- **`TalkButton`** — the control above; owns the `useConversation` session and the state ring. During an active call it also shows two small controls:
  - a round **mute** toggle (mic glyph) that flips the controlled `micMuted` prop on `useConversation` so Manuel stops hearing the user. Neutral by default, **`--danger` (red) when muted**, with a struck-through mic glyph. Pure client UI — not an agent tool.
  - a **"Show Manuel the device"** button (camera glyph) — the user-initiated photo path. **One tap opens the photo picker** (the tap is the required gesture; no confirmation card), the image is identified, and the result is pushed into the live conversation. Shows "Reading your photo…" while it works.
- **`StepCard`** — appears when `showStep` fires. Big **counter** (`1 / 5`), large **step text**, and a tap-friendly **source link** ("From the official Netgear manual ›"). When the step is **generic** (no manual — empty `sourceUrl`), the link is replaced by a muted line **"General guidance — not from your device's manual"** so the screen stays honest (FR-6). When the step is destructive or a safety caution, a `--danger`/`--speaking` inline marker. This card is the visible proof of grounding (FR-3b, FR-23).
- **`MicExplainer`** — a plain-language panel shown **before** the OS mic prompt (FR-3): "Manuel needs your microphone so you can talk to it. Nothing is recorded after you're done." One button to continue. **Skipped** when the browser already reports microphone permission `granted` (the session starts straight from the tap); it remains the fallback when permission is prompt/denied or the Permissions API is unsupported.
- **`EscalationCard` / calling state** — when `escalate` fires: "I'm getting [admin] on the phone for you now," with a calling indicator. The phone call is the artifact; the card is the on-screen echo.
- **"Looking in the manual…" state** — the visual companion to the holding utterance, so a slow tool call never looks frozen.

## States to design (the full journey)

```
idle → mic-explainer → connecting → listening → agent-speaking → looking-up
     → step(n/total) → [branch / repeat / back] → resolved
                                               ↘ escalated / calling
     (any) → error → recover
```

## Accessibility (NFR-7, NFR-8)

- **Minimum touch target 60pt.** The primary control is far larger.
- **High contrast** in both themes; the monochrome-leaning base helps.
- **One-tap primary action** — no menus, no navigation to reach "start."
- Readable at **speakerphone distance**; audio design assumes the phone is held away from the face.
- Respect `prefers-reduced-motion`: replace pulsing/rotating rings with a simple static state indicator.
- Source link is a large, obvious tap target — not tiny inline text.

## What we are NOT doing

No dashboards, no settings screens, no chat transcript wall, no branding flourishes, no dot-matrix/retro styling. If an element doesn't help the user act or reassure them that Manuel is grounded, it doesn't belong on the screen.

*When implementing, load the `frontend-design` skill before finalizing the visual specifics.*

## Cross-links

- Components wire to the agent via [`agent-config.md`](agent-config.md) (the `showStep` / `escalate` tools).
- On-screen requirements: FR-3, FR-3b, FR-23; accessibility: NFR-6, NFR-7, NFR-8.
