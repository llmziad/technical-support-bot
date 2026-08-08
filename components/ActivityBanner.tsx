// components/ActivityBanner.tsx — the persistent "what Manuel is doing right now"
// indicator. Shown for the whole session so the user always has a reference for the
// current activity: finding the manual, reading it, waiting for a photo, guiding.
// Driven by the activity client tools (see lib/clientTools.ts and docs/agent-config.md).

import type { ActivityView } from "@/lib/clientTools";

interface ActivityBannerProps {
  activity: ActivityView;
}

export default function ActivityBanner({ activity }: ActivityBannerProps) {
  // "idle" is a calm resting state; everything else is active work, shown with a dot.
  const working = activity.state !== "idle";
  return (
    <div className={`activity activity-${activity.state}`} aria-live="polite">
      <span
        className={`activity-dot ${working ? "is-working" : ""}`}
        aria-hidden="true"
      />
      <span className="activity-label">{activity.label}</span>
    </div>
  );
}
