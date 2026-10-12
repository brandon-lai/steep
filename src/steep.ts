// The steep timer. Measured from wall-clock time, never from frame counts, so it stays
// right when the tab is in the background or the phone dims (PRD, tech notes).

export interface SteepClock {
  /** Date.now() when the water went in. */
  startedAt: number;
  durationMs: number;
}

/** `pace` > 1 speeds time up for development (`?pace=30`); it is 1 for visitors. */
export function startSteep(now: number, steepSeconds: number, pace = 1): SteepClock {
  return { startedAt: now, durationMs: (steepSeconds * 1000) / Math.max(1, pace) };
}

export function steepProgress(clock: SteepClock, now: number): number {
  return Math.min(1, Math.max(0, (now - clock.startedAt) / clock.durationMs));
}

/** Seconds left, in visitor time (pace already applied to the duration). */
export function steepRemaining(clock: SteepClock, now: number, pace = 1): number {
  return (Math.max(0, clock.startedAt + clock.durationMs - now) / 1000) * Math.max(1, pace);
}

/**
 * How much colour the water has taken, 0..1. Tea gives up most of its colour early and
 * then deepens slowly, so this rises fast and flattens: 1 - e^(-3t), normalised to end at 1.
 */
export function liquorStrength(progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  return (1 - Math.exp(-3 * p)) / (1 - Math.exp(-3));
}
