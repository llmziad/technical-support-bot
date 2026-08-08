# Manuel — a manual that talks back

Manuel is a voice-first web app that helps a non-technical person fix a device by *talking* to it. You open a link, tap once, say what's wrong in plain words, and Manuel identifies the device, reads the **real** manufacturer manual, and walks you through the fix **one spoken step at a time** — waiting for you to confirm before moving on. Nothing to install. It's built for someone 55+ with low tech confidence, hands and eyes occupied (device in one hand, phone in the other) — it exists to replace "call your son."

🔗 **Live:** https://manuel-seven.vercel.app

## Architecture (what talks to what)

One Next.js page + a few server routes on Vercel. The browser mounts the **ElevenLabs** voice agent (realtime audio); the agent drives the conversation and calls our tools. The key one, `POST /api/resolve-procedure`, is the **step engine**: it finds the real manual (a committed seed map, else **context.dev** web search ranked best-first), scrapes it to clean markdown (**context.dev**, PDF-aware), and uses **Gemini** structured output to turn it into an ordered, atomic step list — each step traceable to the manual. Secrets live only in the server routes; the page just renders the current step. If no manual is found, it falls back to safe, clearly-labelled generic guidance.

```
Browser (page + @elevenlabs/react)
  │  tap → GET /api/signed-url   (mic gesture; ELEVENLABS_API_KEY stays server-side)
  │  realtime audio  ⇄  ElevenLabs agent
  ▼
ElevenLabs agent ──calls──▶ POST /api/resolve-procedure  (step engine)
  │                              ├─▶ context.dev  (search + scrape markdown, PDF-aware)
  │                              └─▶ Gemini  (responseSchema → ordered atomic steps)
  └─ client tools (in browser) ─▶ showStep (render) · escalate (tel: dialer) · identifyDevice (photo)
```

## Setup (clean machine)

**Prerequisites:** Node.js 18+ and npm.

1. **Clone + install**
   ```bash
   git clone https://github.com/llmziad/technical-support-bot.git
   cd technical-support-bot
   npm install
   ```

2. **Environment** — copy the example and fill in the values (all secrets are server-side):
   ```bash
   cp .env.local.example .env.local
   ```

   | Var | For |
   |---|---|
   | `ELEVENLABS_API_KEY` | ElevenLabs voice (`/api/signed-url`) |
   | `ELEVENLABS_AGENT_ID` | the "Manuel" agent |
   | `CONTEXT_DEV_API_KEY` | manual search + scrape |
   | `GEMINI_API_KEY` | manual → step list (and vision) |
   | `NEXT_PUBLIC_APP_URL` | app base URL (e.g. `http://localhost:3000`) |
   | `NEXT_PUBLIC_ADMIN_TEL` | escalation `tel:` number (optional; defaults to `+971508888888`) |

3. **Run**
   ```bash
   npm run dev     # http://localhost:3000 — mic works on localhost; tap to start (iOS needs a user tap)
   ```

Test the step engine directly, without the voice layer:
```bash
curl -X POST http://localhost:3000/api/resolve-procedure -H 'content-type: application/json' \
  -d '{"brand":"TP-Link","category":"wifi router","model":"Archer AX55","symptom":"no internet"}'
```
