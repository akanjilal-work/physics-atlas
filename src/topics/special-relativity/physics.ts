// Special relativity in units with c = 1. Events are (t, x, y).
// Boosts are along x. Pure module: no DOM, no Three.js.

/** A spacetime event. Mutable so hot loops can reuse one object. */
export interface Event3 {
  t: number;
  x: number;
  y: number;
}

export const event = (t = 0, x = 0, y = 0): Event3 => ({ t, x, y });

/** Lorentz factor γ = 1 / sqrt(1 − β²). */
export function gamma(beta: number): number {
  return 1 / Math.sqrt(1 - beta * beta);
}

/** Rapidity η = atanh(β). Rapidities add under collinear boosts. */
export function rapidity(beta: number): number {
  return Math.atanh(beta);
}

/**
 * Coordinates of event (t, x, y) in a frame moving at velocity β along +x.
 * t' = γ(t − βx), x' = γ(x − βt), y' = y. Writes into `out` (allocates if omitted).
 */
export function boost(t: number, x: number, y: number, beta: number, out: Event3 = event()): Event3 {
  const g = gamma(beta);
  const tp = g * (t - beta * x);
  const xp = g * (x - beta * t);
  out.t = tp;
  out.x = xp;
  out.y = y;
  return out;
}

/** Inverse boost: from the moving frame's coordinates back to the rest frame. */
export function inverseBoost(tp: number, xp: number, yp: number, beta: number, out: Event3 = event()): Event3 {
  return boost(tp, xp, yp, -beta, out);
}

/** Squared interval s² = Δt² − Δx² − Δy². Positive: timelike. Zero: lightlike. */
export function interval(dt: number, dx: number, dy: number): number {
  return dt * dt - dx * dx - dy * dy;
}

export function intervalBetween(a: Event3, b: Event3): number {
  return interval(b.t - a.t, b.x - a.x, b.y - a.y);
}

/** Velocity of an object moving at u in a frame that itself moves at v (collinear). */
export function addVelocities(u: number, v: number): number {
  return (u + v) / (1 + u * v);
}

/** Velocity of an object moving at u, seen from a frame moving at v. */
export function relativeVelocity(u: number, v: number): number {
  return (u - v) / (1 - u * v);
}

/** Proper time elapsed on an inertial clock moving at β while coordinate time t passes. */
export function properTimeInertial(t: number, beta: number): number {
  return t / gamma(beta);
}

/**
 * Proper time along a worldline given as a list of events (piecewise straight).
 * Each segment must be timelike or lightlike.
 */
export function properTime(path: Event3[]): number {
  let tau = 0;
  for (let i = 1; i < path.length; i++) {
    const s2 = intervalBetween(path[i - 1], path[i]);
    if (s2 < -1e-12) throw new Error('spacelike segment on a worldline');
    tau += Math.sqrt(Math.max(0, s2));
  }
  return tau;
}

/** Length of a rod moving at β, as a fraction of its rest length. */
export function contraction(beta: number): number {
  return 1 / gamma(beta);
}

/**
 * Rest-frame time t of the moving frame's plane of simultaneity t' = tPrime, at position x.
 * From t' = γ(t − βx): t = βx + t'/γ. The plane does not depend on y.
 */
export function simultaneityT(x: number, beta: number, tPrime: number): number {
  return beta * x + tPrime / gamma(beta);
}

/** Slope dt/dx of the moving frame's plane of simultaneity, drawn in the rest frame. */
export function simultaneitySlope(beta: number): number {
  return beta;
}

/**
 * Two events simultaneous in the rest frame, separated by Δx along x.
 * Returns Δt' = t'_B − t'_A in a frame moving at β, where B sits at larger x.
 * Negative means B (the front event) happens first for the moving observer.
 */
export function simultaneityGap(dx: number, beta: number): number {
  return -gamma(beta) * beta * dx;
}

/** Row-major 3×3 matrix acting on (t, x, y), for composition tests. */
export function boostMatrix(beta: number): number[] {
  const g = gamma(beta);
  return [g, -g * beta, 0, -g * beta, g, 0, 0, 0, 1];
}

export function matMul3(a: number[], b: number[]): number[] {
  const r = new Array<number>(9).fill(0);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += a[i * 3 + k] * b[k * 3 + j];
      r[i * 3 + j] = s;
    }
  return r;
}
