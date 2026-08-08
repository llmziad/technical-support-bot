// components/MicExplainer.tsx — plain-language panel shown BEFORE the OS mic
// prompt (FR-3). One button to continue. The continue tap is the user gesture
// that lets startSession request the mic (iOS Safari requires a gesture).

interface MicExplainerProps {
  onContinue: () => void;
  busy?: boolean;
}

export default function MicExplainer({ onContinue, busy }: MicExplainerProps) {
  return (
    <section className="card" aria-live="polite">
      <p className="explainer-text">
        Manuel needs your microphone so you can talk to it. Nothing is recorded
        after you&apos;re done.
      </p>
      <button
        className="primary-button"
        type="button"
        onClick={onContinue}
        disabled={busy}
      >
        {busy ? "Starting…" : "Allow microphone & start"}
      </button>
    </section>
  );
}
