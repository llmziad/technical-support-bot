"use client";

// components/TalkButton.tsx — the one control on the screen. Owns the ElevenLabs
// `useConversation` session and the state ring. The mic explainer (FR-3) is shown
// before the OS prompt, and its button tap is the user gesture that starts the
// session (iOS Safari requires a gesture for mic + audio — never start on mount).
// See docs/ui-design.md and docs/agent-config.md.

import { useCallback, useMemo, useRef, useState } from "react";
import { useConversation } from "@elevenlabs/react";
import MicExplainer from "./MicExplainer";
import CameraPrompt from "./CameraPrompt";
import {
  buildClientTools,
  formatIdentificationForAgent,
  type EscalationView,
  type ActivityView,
} from "@/lib/clientTools";
import type { StepView, DeviceIdentification } from "@/lib/procedure";
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
  // Optional activity-banner setter; identifyDevice drives the "photo" state through it.
  onActivity?: (view: ActivityView) => void;
}

export default function TalkButton({
  onStep,
  onEscalate,
  onSessionStart,
  onSessionEnd,
  onActivity,
}: TalkButtonProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorText, setErrorText] = useState<string>("");
  const [capturePending, setCapturePending] = useState(false);

  // Bridge for the agent-triggered `identifyDevice` tool: requestPhoto() reveals the
  // camera prompt and returns a Promise that resolves when the user's photo has been
  // identified (or null if they skip / the call fails). The resolver is parked here.
  const pendingPhotoRef = useRef<
    ((id: DeviceIdentification | null) => void) | null
  >(null);

  const requestPhoto = useCallback((): Promise<DeviceIdentification | null> => {
    return new Promise((resolve) => {
      // Release any prior pending request before starting a new one.
      pendingPhotoRef.current?.(null);
      pendingPhotoRef.current = resolve;
      setCapturePending(true);
    });
  }, []);

  const resolvePhoto = useCallback((id: DeviceIdentification | null) => {
    setCapturePending(false);
    const resolve = pendingPhotoRef.current;
    pendingPhotoRef.current = null;
    resolve?.(id);
  }, []);

  // Stable activity emitter — no-op until the page wires an onActivity prop.
  const emitActivity = useCallback(
    (view: ActivityView) => onActivity?.(view),
    [onActivity],
  );

  const clientTools = useMemo(
    () => buildClientTools(onStep, onEscalate, requestPhoto, emitActivity),
    [onStep, onEscalate, requestPhoto, emitActivity],
  );

  const conversation = useConversation({
    clientTools,
    onConnect: () => setPhase("active"),
    onDisconnect: () => {
      logClient({ type: "session_end" });
      resolvePhoto(null); // release any in-flight photo request.
      setPhase("idle");
      onSessionEnd();
    },
    onError: (message: string) => {
      console.error("[conversation] error", message);
      logClient({ type: "session_error", message });
      resolvePhoto(null);
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

  // USER-triggered capture (the "Show Manuel the device" button). Unlike the agent's
  // identifyDevice tool — which returns the result as a tool response — a user-initiated
  // photo has no tool call to answer, so we PUSH the result into the live conversation:
  // the grounded facts go as a contextual update, then a short user message prompts
  // Manuel to react (confirm the device aloud, use the observations). Works with no
  // ElevenLabs dashboard tool configured. See docs/agent-config.md.
  const handleShowDevice = useCallback(async () => {
    const id = await requestPhoto();
    if (!id) return; // user tapped "Not now" or capture failed — nothing to send.
    try {
      conversation.sendContextualUpdate(formatIdentificationForAgent(id));
      conversation.sendUserMessage(
        "I've taken a photo of my device — can you take a look?",
      );
    } catch (err) {
      console.error("[TalkButton] failed to send photo result to Manuel", err);
    }
  }, [requestPhoto, conversation]);

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

      {phase === "active" && !capturePending ? (
        <button
          className="show-device-button"
          type="button"
          onClick={handleShowDevice}
        >
          📷 Show Manuel the device
        </button>
      ) : null}

      {capturePending ? <CameraPrompt onResolve={resolvePhoto} /> : null}
    </div>
  );
}
