// components/EscalationCard.tsx — on-screen echo when escalation fires. The phone
// call is the artifact; this card is the reassurance ("I'm getting someone on the
// phone for you now"). See docs/ui-design.md.

interface EscalationCardProps {
  adminName?: string;
  tel?: string; // E.164; renders a fallback "Call" button if auto-dial is blocked
}

export default function EscalationCard({ adminName, tel }: EscalationCardProps) {
  return (
    <section className="card escalation" aria-live="polite">
      <p className="label">Getting help</p>
      <p className="step-text">
        <span className="calling-dot" aria-hidden="true" />
        I&apos;m getting {adminName ?? "a family member"} on the phone for you now.
      </p>
      {tel ? (
        <a
          className="call-button"
          href={`tel:${tel}`}
          style={{
            display: "inline-block",
            marginTop: "1rem",
            padding: "0.9rem 1.5rem",
            borderRadius: 14,
            background: "var(--danger, #d22d2d)",
            color: "#fff",
            fontSize: "1.15rem",
            fontWeight: 600,
            textDecoration: "none",
            minHeight: 60,
            lineHeight: "42px",
          }}
        >
          Call {adminName ?? "now"}
        </a>
      ) : null}
    </section>
  );
}
