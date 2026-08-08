// components/StepCard.tsx — the visible proof of grounding (FR-3b, FR-23).
// Big counter, large step text, and a tap-friendly source link. Appears when the
// `showStep` client tool fires. See docs/ui-design.md.

import type { StepView } from "@/lib/procedure";

interface StepCardProps {
  step: StepView;
  // Optional inline safety marker; the agent voices the warning, this echoes it.
  marker?: "caution" | "danger";
  markerText?: string;
}

export default function StepCard({ step, marker, markerText }: StepCardProps) {
  return (
    <section className="card" aria-live="polite">
      <div className="step-counter">
        {step.stepNumber} <span className="total">/ {step.totalSteps}</span>
      </div>

      {marker ? (
        <p className={`step-marker ${marker}`}>
          {markerText ?? (marker === "danger" ? "This step can't be undone" : "Careful with this step")}
        </p>
      ) : null}

      <p className="step-text">{step.text}</p>

      {step.sourceUrl ? (
        <a
          className="source-link"
          href={step.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          From the official manual ›
        </a>
      ) : (
        // No manual URL -> this is generic guidance (FR-6). Stay honest on-screen.
        <p className="source-generic">General guidance — not from your device&apos;s manual</p>
      )}
    </section>
  );
}
