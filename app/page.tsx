"use client";

// app/page.tsx — the one page. Mounts the ElevenLabs agent (via TalkButton) and
// renders the current step + source link and the escalation echo. All
// conversational behaviour lives in the ElevenLabs agent config, not here.
// See docs/ui-design.md and docs/architecture.md.

import { useCallback, useState } from "react";
import TalkButton from "@/components/TalkButton";
import StepCard from "@/components/StepCard";
import EscalationCard from "@/components/EscalationCard";
import type { StepView } from "@/lib/procedure";
import { ADMIN_TEL, type EscalationView } from "@/lib/clientTools";

export default function Home() {
  const [step, setStep] = useState<StepView | null>(null);
  const [escalating, setEscalating] = useState(false);

  const handleStep = useCallback((next: StepView) => {
    setStep(next);
  }, []);

  const handleEscalate = useCallback((_view: EscalationView) => {
    setEscalating(true);
  }, []);

  const handleSessionStart = useCallback(() => {
    setStep(null);
    setEscalating(false);
  }, []);

  const handleSessionEnd = useCallback(() => {
    // Keep the last step on screen after the call ends as a quiet record.
  }, []);

  return (
    <main className="app">
      <header>
        <p className="wordmark">Manuel</p>
        <p className="tagline">
          A manual that talks back. Tap, say what&apos;s wrong, and I&apos;ll walk
          you through the fix — one step at a time.
        </p>
      </header>

      <TalkButton
        onStep={handleStep}
        onEscalate={handleEscalate}
        onSessionStart={handleSessionStart}
        onSessionEnd={handleSessionEnd}
      />

      {step ? <StepCard step={step} /> : null}
      {escalating ? <EscalationCard tel={ADMIN_TEL} /> : null}
    </main>
  );
}
