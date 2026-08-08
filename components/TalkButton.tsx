"use client";

// components/TalkButton.tsx — the one control on the screen. Owns the ElevenLabs
// `useConversation` session and the state ring. The mic explainer (FR-3) is shown
// before the OS prompt, and its button tap is the user gesture that starts the
// session (iOS Safari requires a gesture for mic + audio — never start on mount).
// See docs/ui-design.md and docs/agent-config.md.

import { useCallback, useMemo, useState } from "react";
import { useConversation } from "@elevenlabs/react";
import MicExplainer from "./MicExplainer";
import { buildClientTools, type EscalationView } from "@/lib/clientTools";
import type { StepView } from "@/lib/procedure";
import { newSessionId, setLogSession, logClient } from "@/lib/clientLog";

type Phase = "idle" | "explainer" | "connecting" | "active" | "error";
type RingState =
  | "idle"
  | "connecting"
  | "listening"
  | "speaking"
  | "looking"
  | "resolved"
  | "error";

interface TalkButtonProps {
  onStep: (step: StepView) => void;
  onEscalate: (view: EscalationView) => void;
  onSessionStart: () => void;
  onSessionEnd: () => void;
}

export default function TalkButton({
  onStep,
  onEscalate,
  onSessionStart,
  onSessionEnd,
}: TalkButtonProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorText, setErrorText] = useState<string>("");

  const clientTools = useMemo(
    () => buildClientTools(onStep, onEscalate),
    [onStep, onEscalate],
  );

  const conversation = useConversation({
    clientTools,
    onConnect: () => setPhase("active"),
    onDisconnect: () => {
      logClient({ type: "session_end" });
      setPhase("idle");
      onSessionEnd();
    },
    onError: (message: string) => {
      console.error("[conversation] error", message);
      logClient({ type: "session_error", message });
      setErrorText("Something interrupted the call. Tap to try again.");
      setPhase("error");
    },
  });

  const start = useCallback(async () => {
    setPhase("connecting");
    setErrorText("");
    setLogSession(newSessionId());
    onSessionStart();
    try {
      const res = await fetch("/api/signed-url");
      if (!res.ok) throw new Error(`signed-url ${res.status}`);
      const { signed_url } = (await res.json()) as { signed_url?: string };
      if (!signed_url) throw new Error("no signed_url");
      const conversationId = await conversation.startSession({ signedUrl: signed_url });
      logClient({ type: "session_start", conversationId });
      // onConnect flips to "active".
    } catch (err) {
      console.error("[TalkButton] start failed", err);
      logClient({ type: "session_error", where: "start", message: String(err) });
      setErrorText("Couldn't reach Manuel. Check your connection and tap to retry.");
      setPhase("error");
    }
  }, [conversation, onSessionStart]);

  const ringState: RingState = useMemo(() => {
    if (phase === "error") return "error";
    if (phase === "connecting") return "connecting";
    if (phase === "active") {
      return conversation.status === "connected" && conversation.isSpeaking
        ? "speaking"
        : "listening";
    }
    return "idle";
  }, [phase, conversation.status, conversation.isSpeaking]);

  const statusLine = useMemo(() => {
    switch (ringState) {
      case "connecting":
        return "Connecting…";
      case "listening":
        return "Listening — tell me what's wrong.";
      case "speaking":
        return "Manuel is talking…";
      case "error":
        return errorText;
      default:
        return "Tap to start, then just talk.";
    }
  }, [ringState, errorText]);

  const handlePrimaryTap = useCallback(() => {
    if (phase === "active") {
      void conversation.endSession();
      return;
    }
    // idle or error -> show the mic explainer first (FR-3).
    setPhase("explainer");
  }, [phase, conversation]);

  if (phase === "explainer") {
    return <MicExplainer onContinue={start} busy={false} />;
  }

  const label =
    phase === "active"
      ? "Tap to stop"
      : phase === "connecting"
        ? "…"
        : "Talk to Manuel";

  return (
    <div className={`talk state-${ringState}`}>
      <button
        className="talk-button"
        type="button"
        onClick={handlePrimaryTap}
        disabled={phase === "connecting"}
        aria-label={label}
      >
        <span className="talk-ring" aria-hidden="true" />
        <span className="talk-center">
          {ringState === "listening" ? (
            <span className="live-dot" aria-hidden="true" />
          ) : null}
          <span>{label}</span>
        </span>
      </button>
      <p className="status-line">{statusLine}</p>
    </div>
  );
}
