# Manuel — a manual that talks back

**Manuel** is a voice-first web app that helps a non-technical person fix a device by *talking* to it. You open a link, tap one button, say what's wrong in plain language, and Manuel identifies the device, reads the **real** manufacturer manual, and walks you through the fix **one spoken step at a time** — waiting for you to confirm before moving on. Nothing to install.

It's built for someone 55+ with low tech confidence, hands and eyes occupied (device in one hand, phone in the other). Manuel exists to replace "call your son."

🔗 **Live version:** https://manuel-seven.vercel.app/

## How it works

- **One page** mounts the ElevenLabs voice agent and shows the current step + a link to its source in the manual.
- The agent calls a server route, `resolve_procedure`, which searches for and scrapes the real manual, then uses Gemini to turn it into an ordered, atomic step list.
- Every step is traceable to the actual manual for the actual model. Manuel never invents steps.

For the full picture see [`CLAUDE.md`](CLAUDE.md) and [`docs/architecture.md`](docs/architecture.md).

## Running it for the first time

**Prerequisites:** Node.js 18+ and npm.

1. **Clone and install**
   ```bash
   git clone https://github.com/llmziad/technical-support-bot.git
   cd technical-support-bot
   npm install
   ```

2. **Set up environment variables**
   ```bash
   cp .env.local.example .env.local
   ```
   Then open `.env.local` and fill in the values. All secrets are server-side only:

   | Var | What it's for |
   |---|---|
   | `ELEVENLABS_API_KEY` | ElevenLabs voice layer (`/api/signed-url`) |
   | `ELEVENLABS_AGENT_ID` | The "Manuel" conversation agent |
   | `CONTEXT_DEV_API_KEY` | Manual retrieval / scraping |
   | `GEMINI_API_KEY` | Turning the manual into a step list |
   | `NEXT_PUBLIC_APP_URL` | Your app's base URL (e.g. `http://localhost:3000` locally) |
   | `NEXT_PUBLIC_ADMIN_TEL` | Escalation `tel:` number (optional; defaults to `+971508888888`) |

3. **Run the dev server**
   ```bash
   npm run dev
   ```
   Open http://localhost:3000. The microphone works on `localhost` — tap the button to start (iOS Safari needs a user tap to enable the mic).

## Other commands

```bash
npm run build && npm start   # production build
npm run lint                 # lint
npm run typecheck            # type-check

# exercise the step engine directly:
curl -X POST "http://localhost:3000/api/resolve-procedure" \
  -H 'content-type: application/json' \
  -d '{"brand":"Netgear","category":"wifi router","model":"R7000","symptom":"no internet, red light"}'
```

## Deploying

Push to `origin` and Vercel auto-deploys (HTTPS is automatic — required for the mic). Set the same environment variables in your Vercel project settings.
