// The kettle, as numbers. Holding heats; letting go near the target finishes the step.
// There is no way to get it wrong: too cool and you hold again, too hot and it cools
// down to the target by itself.

export const ROOM_C = 20;
export const BOIL_C = 100;
/** °C per second while held. 20 → 100 takes about 6½ seconds: slow enough to feel. */
export const HEAT_RATE = 12;
/** Releasing this far below the target still counts. */
export const UNDER_TOLERANCE = 4;
/** Releasing more than this far above the target means waiting for it to cool. */
export const OVER_TOLERANCE = 2;
/** Cooling time constant, seconds. Much faster than a real kettle, which would take minutes. */
const COOL_TAU = 1.4;

export type KettlePhase = "idle" | "heating" | "cooling" | "ready";

export interface Kettle {
  tempC: number;
  phase: KettlePhase;
}

export const freshKettle = (): Kettle => ({ tempC: ROOM_C, phase: "idle" });

/** Where a release at `tempC` leads, for target `targetC`. */
export function judgeRelease(tempC: number, targetC: number): KettlePhase {
  if (tempC < targetC - UNDER_TOLERANCE) return "idle";
  if (tempC > targetC + OVER_TOLERANCE) return "cooling";
  return "ready";
}

/**
 * Advance the kettle by `dt` seconds. `holding` is whether a finger, mouse button or key
 * is down on it right now.
 */
export function stepKettle(k: Kettle, dt: number, holding: boolean, targetC: number): Kettle {
  if (k.phase === "ready") return k;

  if (holding) {
    // Picking it up again mid-cooling is fine: it just heats again.
    return { tempC: Math.min(BOIL_C, k.tempC + HEAT_RATE * dt), phase: "heating" };
  }

  if (k.phase === "heating") {
    return { tempC: k.tempC, phase: judgeRelease(k.tempC, targetC) };
  }

  if (k.phase === "cooling") {
    const tempC = targetC + (k.tempC - targetC) * Math.exp(-dt / COOL_TAU);
    return tempC <= targetC + 0.5 ? { tempC: targetC, phase: "ready" } : { tempC, phase: "cooling" };
  }

  return k;
}

/** 0 at room temperature, 1 at a boil. Drives the gauge, the rumble and the steam. */
export function heatFraction(tempC: number): number {
  return Math.min(1, Math.max(0, (tempC - ROOM_C) / (BOIL_C - ROOM_C)));
}
