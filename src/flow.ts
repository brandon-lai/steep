// The eight steps, in order. Each waits for the visitor; none can be failed or skipped.

export const STEPS = ["arrive", "choose", "heat", "leaves", "pour", "steep", "cup", "sit"] as const;
export type Step = (typeof STEPS)[number];

export function nextStep(step: Step): Step {
  const i = STEPS.indexOf(step);
  return STEPS[Math.min(i + 1, STEPS.length - 1)]!;
}

/** "Make another" starts again at the tins; the room is already warm. */
export const AGAIN_STEP: Step = "choose";

/** 1-based position for screen readers ("Step 3 of 8"). */
export function stepNumber(step: Step): number {
  return STEPS.indexOf(step) + 1;
}

/** The closing lines. One per visit, never the same twice in a row. */
export const CLOSING_LINES = [
  "Nothing else needs doing right now.",
  "Here's your tea. Take your time.",
  "Stay as long as the steam does.",
  "The kettle can rest. So can you.",
  "This cup is just for you.",
  "No rush. It'll wait for you.",
] as const;

export const LAST_CLOSING_KEY = "steep.lastClosing";

/** Picks a closing line other than `last`. `rand` is injectable so tests are deterministic. */
export function pickClosingLine(last: number | null, rand: () => number = Math.random): number {
  const n = CLOSING_LINES.length;
  if (last === null || last < 0 || last >= n) return Math.floor(rand() * n);
  // Choose among the other n-1 lines, then skip over the last one.
  const i = Math.floor(rand() * (n - 1));
  return i >= last ? i + 1 : i;
}
