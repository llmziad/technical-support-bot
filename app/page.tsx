"use client";

// app/page.tsx — the one page. Mounts the ElevenLabs agent (via TalkButton) and
// renders the current step + source link and the escalation echo. All
// conversational behaviour lives in the ElevenLabs agent config, not here.
// See docs/ui-design.md and docs/architecture.md.

import { useCallback, useState } from "react";
import TalkButton from "@/components/TalkButton";
import StepCard from "@/components/StepCard";
import EscalationCard from "@/components/EscalationCard";
import ActivityBanner from "@/components/ActivityBanner";
import type { StepView } from "@/lib/procedure";
import {
  ADMIN_TEL,
  activityFor,
  type EscalationView,
  type ActivityView,
} from "@/lib/clientTools";

export default function Home() {
  const [step, setStep] = useState<StepView | null>(null);
  const [escalating, setEscalating] = useState(false);
  // What Manuel is doing right now — shown for the whole session (null when idle
  // and no call is active, so the banner only appears once a session starts).
  const [activity, setActivity] = useState<ActivityView | null>(null);

  const handleStep = useCallback((next: StepView) => {
    setStep(next);
  }, []);

  const handleEscalate = useCallback((_view: EscalationView) => {
    setEscalating(true);
  }, []);

  const handleActivity = useCallback((next: ActivityView) => {
    setActivity(next);
  }, []);

  const handleSessionStart = useCallback(() => {
    setStep(null);
    setEscalating(false);
    setActivity(activityFor("idle"));
  }, []);

  const handleSessionEnd = useCallback(() => {
    // Keep the last step on screen after the call ends as a quiet record.
    setActivity(null);
  }, []);

  return (
    <main className="app">
      <header>
        <p className="wordmark">Manuel</p>
      </header>

      <TalkButton
        onStep={handleStep}
        onEscalate={handleEscalate}
        onActivity={handleActivity}
        onSessionStart={handleSessionStart}
        onSessionEnd={handleSessionEnd}
      />

      {activity ? <ActivityBanner activity={activity} /> : null}
      {step ? <StepCard step={step} /> : null}
      {escalating ? <EscalationCard tel={ADMIN_TEL} /> : null}
    </main>
  );
}
