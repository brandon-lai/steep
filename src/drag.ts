// Drags along a path. The scoop, kettle and pot each travel a fixed route from where they
// rest to where they pour; the visitor's pointer only decides how far along it they are.
// That keeps mouse, touch and keyboard on one code path and makes the motion impossible
// to fumble: you can't drop the kettle on the floor.

export interface Vec {
  x: number;
  y: number;
}

/**
 * How far along the route (0..1) a pointer has dragged, given where the press started,
 * where the pointer is now, and the route's start and end in the same units.
 */
export function dragProgress(pressAt: Vec, pointer: Vec, from: Vec, to: Vec, startProgress = 0): number {
  const rx = to.x - from.x;
  const ry = to.y - from.y;
  const len2 = rx * rx + ry * ry;
  if (len2 === 0) return 1;
  const along = ((pointer.x - pressAt.x) * rx + (pointer.y - pressAt.y) * ry) / len2;
  return Math.min(1, Math.max(0, startProgress + along));
}

/**
 * Moves `current` toward `target` with an exponential ease. Frame-rate independent:
 * `rate` is roughly how many times per second the gap closes by ~63%.
 */
export function approach(current: number, target: number, dt: number, rate: number): number {
  return target + (current - target) * Math.exp(-dt * rate);
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
/** Slow in, slow out. */
export const easeInOut = (t: number) => {
  const c = clamp01(t);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
};
/** Maps t from [a, b] to [0, 1], clamped. */
export const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
