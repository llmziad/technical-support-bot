"use client";

// components/CameraPrompt.tsx — the camera capture card (Phase 2a, FR-8). Shown when
// the agent calls the `identifyDevice` client tool. A big "Take a photo" button whose
// TAP is the user gesture that opens the rear camera / file picker (iOS Safari requires
// a gesture — same rule as the mic in TalkButton). The chosen image is downscaled and
// base64-encoded IN THE BROWSER, POSTed to /api/identify-device, and the result handed
// back via onResolve. The image is held only in memory and never persisted (NFR-11).
// See docs/ui-design.md and docs/agent-config.md.

import { useCallback, useRef, useState } from "react";
import type { DeviceIdentification } from "@/lib/procedure";

interface CameraPromptProps {
  // Called exactly once with the vision result, or null if the user skips / it fails.
  onResolve: (id: DeviceIdentification | null) => void;
}

export default function CameraPrompt({ onResolve }: CameraPromptProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [working, setWorking] = useState(false);

  const openCamera = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Reset the input so re-picking the same file still fires change.
      e.target.value = "";
      if (!file) return; // dialog dismissed — stay on the prompt.

      setWorking(true);
      try {
        const { base64, mimeType } = await fileToDownscaledBase64(file);
        const res = await fetch("/api/identify-device", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ imageBase64: base64, mimeType }),
        });
        if (!res.ok) throw new Error(`identify-device ${res.status}`);
        const id = (await res.json()) as DeviceIdentification;
        onResolve(id);
      } catch (err) {
        console.error("[CameraPrompt] identify failed", err);
        onResolve(null); // let the agent fall back to voice (FR-9).
      }
    },
    [onResolve],
  );

  return (
    <section className="card camera-prompt" aria-live="polite">
      <p className="explainer-text">
        {working
          ? "Looking at your photo…"
          : "Point your camera at the device, or the label with the model number, and take a photo."}
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        hidden
      />

      <button
        className="primary-button"
        type="button"
        onClick={openCamera}
        disabled={working}
      >
        {working ? (
          "Reading…"
        ) : (
          <span className="btn-content">
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
            Take a photo
          </span>
        )}
      </button>

      {!working ? (
        <button
          className="text-button"
          type="button"
          onClick={() => onResolve(null)}
        >
          Not now — I&apos;ll say it instead
        </button>
      ) : null}
    </section>
  );
}

/**
 * Read a File, downscale its longest side to <= maxDim, and return raw base64 JPEG
 * (no data: prefix) + mime type. Keeps payload/latency down and the image in memory
 * only. Falls back to the original bytes if canvas is unavailable.
 */
async function fileToDownscaledBase64(
  file: File,
  maxDim = 1024,
): Promise<{ base64: string; mimeType: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });

  const strip = (u: string) => u.split(",")[1] ?? "";

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("image decode failed"));
      i.src = dataUrl;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { base64: strip(dataUrl), mimeType: file.type || "image/jpeg" };
    ctx.drawImage(img, 0, 0, w, h);
    const out = canvas.toDataURL("image/jpeg", 0.85);
    return { base64: strip(out), mimeType: "image/jpeg" };
  } catch {
    // Couldn't decode/redraw — send the original bytes.
    return { base64: strip(dataUrl), mimeType: file.type || "image/jpeg" };
  }
}
