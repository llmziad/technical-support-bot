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
import { identifyImageFile } from "@/lib/visionClient";
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
  const [uploading, setUploading] = useState(false);
  // Hidden file input for the USER-triggered upload button (one tap → picker).
  const photoInputRef = useRef<HTMLInputElement | null>(null);

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

  const handlePrimaryTap = useCallback(async () => {
    if (phase === "active") {
      void conversation.endSession();
      return;
    }
    // If the browser already granted mic permission, skip the explainer and start
    // directly — this tap is still the user gesture, and no OS prompt will fire. The
    // explainer only exists to precede that prompt (FR-3). Best-effort: the Permissions
    // API (or the "microphone" name) is unsupported on some browsers (Firefox/older
    // Safari) — there we fall back to showing the explainer.
    try {
      const perm = await navigator.permissions?.query({
        name: "microphone" as PermissionName,
      });
      if (perm?.state === "granted") {
        void start();
        return;
      }
    } catch {
      // Permissions API/name unsupported — fall through to the explainer.
    }
    setPhase("explainer");
  }, [phase, conversation, start]);

  // USER-triggered upload button. The tap opens the photo picker IMMEDIATELY (the tap
  // is the user gesture) — no intermediate "are you sure?" card. When a photo is chosen
  // we identify it and PUSH the result into the live conversation: the grounded facts as
  // a contextual update, then a short user message so Manuel reacts (confirm the device
  // aloud, use the observations). Works with no ElevenLabs dashboard tool configured.
  const openPhotoPicker = useCallback(() => {
    photoInputRef.current?.click();
  }, []);

  const handleUserPhotoFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ""; // allow re-picking the same file
      if (!file) return; // picker dismissed — nothing to do.
      setUploading(true);
      try {
        const id = await identifyImageFile(file);
        if (!id) return;
        conversation.sendContextualUpdate(formatIdentificationForAgent(id));
        conversation.sendUserMessage(
          "I've taken a photo of my device — can you take a look?",
        );
      } catch (err) {
        console.error("[TalkButton] failed to send photo result to Manuel", err);
      } finally {
        setUploading(false);
      }
    },
    [conversation],
  );

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
        <>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleUserPhotoFile}
            hidden
          />
          <button
            className="show-device-button"
            type="button"
            onClick={openPhotoPicker}
            disabled={uploading}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2l1.3-1.9a1 1 0 0 1 .82-.43h6.76a1 1 0 0 1 .82.43L17.5 7h2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
              <circle cx="12" cy="12.75" r="3.25" />
            </svg>
            <span>{uploading ? "Reading your photo…" : "Show Manuel the device"}</span>
          </button>
        </>
      ) : null}

      {capturePending ? <CameraPrompt onResolve={resolvePhoto} /> : null}
    </div>
  );
}
