// lib/visionClient.ts — browser-side helpers for the vision capture flow.
// Downscales a chosen image in-browser and POSTs it to /api/identify-device, returning
// the DeviceIdentification (or null on failure). Shared by the user-triggered upload
// button (components/TalkButton) and the agent-triggered card (components/CameraPrompt).
// The image is held only in memory and never persisted (NFR-11).

import type { DeviceIdentification } from "./procedure";

/** Upload + identify a chosen image file. Returns null on any failure. */
export async function identifyImageFile(
  file: File,
): Promise<DeviceIdentification | null> {
  try {
    const { base64, mimeType } = await fileToDownscaledBase64(file);
    const res = await fetch("/api/identify-device", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageBase64: base64, mimeType }),
    });
    if (!res.ok) throw new Error(`identify-device ${res.status}`);
    return (await res.json()) as DeviceIdentification;
  } catch (err) {
    console.error("[visionClient.identifyImageFile] failed", err);
    return null;
  }
}

/**
 * Read a File, downscale its longest side to <= maxDim, and return raw base64 JPEG
 * (no data: prefix) + mime type. Keeps payload/latency down and the image in memory
 * only. Falls back to the original bytes if canvas is unavailable.
 */
export async function fileToDownscaledBase64(
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
