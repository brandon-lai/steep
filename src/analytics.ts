// Privacy-friendly analytics for the PRD's success signals (completion, session length,
// lingering, return visits). Off unless the build sets VITE_ANALYTICS=1, so nothing is sent
// until the owner turns on Vercel Web Analytics. No cookies, no personal data, no IDs of ours.

import { inject, track as vercelTrack } from "@vercel/analytics";

const enabled = import.meta.env.VITE_ANALYTICS === "1";

if (enabled) inject({ mode: "production" });

export function track(event: "begin" | "tea" | "sit" | "another" | "linger", data?: Record<string, string | number>) {
  if (enabled) vercelTrack(event, data);
}
