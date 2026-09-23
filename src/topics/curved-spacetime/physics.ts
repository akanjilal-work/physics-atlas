// Timelike equatorial geodesics of Schwarzschild spacetime, plus a Newtonian
// comparison orbit. Geometric units G = c = 1 with M = 1. Pure module: no DOM, no Three.js.

export const M = 1;
export const R_HORIZON = 2 * M;
export const R_PHOTON = 3 * M;
export const R_ISCO = 6 * M;
/** Below this radius the particle counts as swallowed. */
export const R_PLUNGE = 2.05 * M;
/** Smallest L that still has a stable circular orbit (the ISCO value). */
export const L_ISCO = Math.sqrt(12) * M;

/** GR state: [r, dr/dτ, φ, t, τ]. Integrated in proper time τ. */
export type GRState = Float64Array;
/** Newtonian state: [r, dr/dt, φ, t]. Integrated in coordinate time t. */
export type NState = Float64Array;

export const newGR = (): GRState => new Float64Array(5);
export const newN = (): NState => new Float64Array(4);

/** GR effective potential per unit mass: −M/r + L²/2r² − ML²/r³. */
export const vGR = (r: number, L: number) => -M / r + (L * L) / (2 * r * r) - (M * L * L) / (r * r * r);
/** Newtonian effective potential: −M/r + L²/2r². */
export const vN = (r: number, L: number) => -M / r + (L * L) / (2 * r * r);

/** Angular momentum of a circular geodesic at radius r (r > 3M): L² = M r²/(r − 3M). */
export const lCircular = (r: number) => Math.sqrt((M * r * r) / (r - 3 * M));
/** Newtonian circular angular momentum: L² = M r. */
export const lCircularN = (r: number) => Math.sqrt(M * r);

/**
 * Extrema of the GR potential for a given L. Returns [r_peak, r_min] (barrier top and well bottom),
 * or null when L < √12 M and there is no barrier at all.
 */
export function potentialExtrema(L: number): [number, number] | null {
  const L2 = L * L;
  const disc = L2 * L2 - 12 * M * M * L2;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  return [(L2 - s) / (2 * M), (L2 + s) / (2 * M)];
}

/** Specific energy E (per unit rest mass) of a particle at rest radially at r with angular momentum L. */
export const energyAtApsis = (r: number, L: number) => Math.sqrt((1 - (2 * M) / r) * (1 + (L * L) / (r * r)));

/** Conserved energy E from a GR state: E² = ṙ² + (1 − 2M/r)(1 + L²/r²). */
export function energyOf(s: GRState, L: number): number {
  const r = s[0];
  return Math.sqrt(s[1] * s[1] + (1 - (2 * M) / r) * (1 + (L * L) / (r * r)));
}

/** Newtonian specific energy ½ṙ² + V_N(r). */
export const energyN = (s: NState, L: number) => 0.5 * s[1] * s[1] + vN(s[0], L);

/**
 * The other turning points of a GR orbit that starts at rest radially at r0.
 * With u = 1/r the turning points solve 2ML²u³ − L²u² + 2Mu + (E² − 1) = 0.
 * Dividing out the known root u0 leaves a quadratic. Returns the radii in increasing order.
 */
export function otherTurningPoints(r0: number, L: number): number[] {
  const A = 2 * M * L * L;
  const B = -L * L;
  const C = 2 * M;
  const u0 = 1 / r0;
  const b = B + A * u0;
  const c = C + b * u0;
  const disc = b * b - 4 * A * c;
  if (disc < 0) return [];
  const s = Math.sqrt(disc);
  const out: number[] = [];
  for (const u of [(-b + s) / (2 * A), (-b - s) / (2 * A)]) if (u > 0) out.push(1 / u);
  return out.sort((x, y) => x - y);
}

/**
 * Classify a GR orbit launched at rest radially from r0.
 * Returns periapsis and apoapsis for a bound orbit, or null when it plunges or escapes.
 */
export function grApsides(r0: number, L: number): { rp: number; ra: number } | null {
  const E = energyAtApsis(r0, L);
  const ext = potentialExtrema(L);
  const level = (E * E - 1) / 2;
  if (!ext) return null;
  const [rPeak, rMin] = ext;
  if (r0 <= rPeak) return null;
  if (level >= vGR(rPeak, L)) return null;
  if (level >= 0) return null;
  if (Math.abs(r0 - rMin) < 1e-9) return { rp: r0, ra: r0 };
  const other = otherTurningPoints(r0, L).filter((x) => x > rPeak && Math.abs(x - r0) > 1e-9 * r0);
  if (other.length === 0) return { rp: r0, ra: r0 };
  const o = other[other.length - 1];
  return { rp: Math.min(r0, o), ra: Math.max(r0, o) };
}

/** L for a GR orbit with the given apoapsis and periapsis (from V(ra) = V(rp)). */
export function lForApsides(ra: number, rp: number): number {
  const num = M * (1 / ra - 1 / rp);
  const den = 0.5 * (1 / (ra * ra) - 1 / (rp * rp)) - M * (1 / ra ** 3 - 1 / rp ** 3);
  return Math.sqrt(num / den);
}

/** Weak-field perihelion advance per orbit: Δφ ≈ 6πM / (a(1 − e²)). In radians. */
export function weakFieldPrecession(rp: number, ra: number): number {
  const a = (rp + ra) / 2;
  const e = (ra - rp) / (ra + rp);
  return (6 * Math.PI * M) / (a * (1 - e * e));
}

// --- Integrators. In place, no allocation: scratch buffers live at module level.
const k1 = new Float64Array(5);
const k2 = new Float64Array(5);
const k3 = new Float64Array(5);
const k4 = new Float64Array(5);
const tmp = new Float64Array(5);

function derivGR(s: Float64Array, L: number, E: number, out: Float64Array): void {
  const r = s[0];
  const L2 = L * L;
  out[0] = s[1];
  out[1] = -M / (r * r) + L2 / (r * r * r) - (3 * M * L2) / (r * r * r * r);
  out[2] = L / (r * r);
  out[3] = E / (1 - (2 * M) / r);
  out[4] = 1;
}

function derivN(s: Float64Array, L: number, _E: number, out: Float64Array): void {
  const r = s[0];
  out[0] = s[1];
  out[1] = -M / (r * r) + (L * L) / (r * r * r);
  out[2] = L / (r * r);
  out[3] = 1;
}

function rk4(
  s: Float64Array,
  n: number,
  L: number,
  E: number,
  h: number,
  f: (s: Float64Array, L: number, E: number, out: Float64Array) => void,
): void {
  f(s, L, E, k1);
  for (let i = 0; i < n; i++) tmp[i] = s[i] + 0.5 * h * k1[i];
  f(tmp, L, E, k2);
  for (let i = 0; i < n; i++) tmp[i] = s[i] + 0.5 * h * k2[i];
  f(tmp, L, E, k3);
  for (let i = 0; i < n; i++) tmp[i] = s[i] + h * k3[i];
  f(tmp, L, E, k4);
  for (let i = 0; i < n; i++) s[i] += (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
}

/** One RK4 step of proper time h for the GR geodesic. Mutates s. */
export const stepGR = (s: GRState, L: number, E: number, h: number) => rk4(s, 5, L, E, h, derivGR);
/** One RK4 step of coordinate time h for the Newtonian orbit. Mutates s. */
export const stepN = (s: NState, L: number, h: number) => rk4(s, 4, L, 0, h, derivN);

/** Initialise a GR state at rest radially at r0. Returns the conserved E. */
export function initGR(s: GRState, r0: number, L: number): number {
  s[0] = r0;
  s[1] = 0;
  s[2] = 0;
  s[3] = 0;
  s[4] = 0;
  return energyAtApsis(r0, L);
}

export function initN(s: NState, r0: number): void {
  s[0] = r0;
  s[1] = 0;
  s[2] = 0;
  s[3] = 0;
}

/** Time dilation of the orbiting clock against a distant clock: dτ/dt = (1 − 2M/r)/E. */
export const timeDilation = (r: number, E: number) => (1 - (2 * M) / r) / E;

/**
 * Tracks periapsis passages (dr changes sign from − to +) and measures the
 * advance of periapsis per radial orbit. Linear interpolation in the step.
 */
export class PeriapsisTracker {
  count = 0;
  lastPhi = NaN;
  /** Latest measured advance per orbit, radians. NaN until two periapses. */
  precession = NaN;
  /** Radius and angle of the latest periapsis. */
  lastR = NaN;
  private prevR = NaN;
  private prevPr = NaN;
  private prevPhi = NaN;

  reset(): void {
    this.count = 0;
    this.lastPhi = NaN;
    this.precession = NaN;
    this.lastR = NaN;
    this.prevR = NaN;
    this.prevPr = NaN;
    this.prevPhi = NaN;
  }

  /** Feed the state after each step. Returns true when a periapsis was just passed. */
  update(r: number, pr: number, phi: number, minSwing: number): boolean {
    let hit = false;
    if (this.prevPr < 0 && pr >= 0 && minSwing > 0) {
      const f = this.prevPr / (this.prevPr - pr);
      const phiP = this.prevPhi + f * (phi - this.prevPhi);
      const rP = this.prevR + f * (r - this.prevR);
      if (this.count > 0) this.precession = phiP - this.lastPhi - 2 * Math.PI;
      this.lastPhi = phiP;
      this.lastR = rP;
      this.count++;
      hit = true;
    }
    this.prevR = r;
    this.prevPr = pr;
    this.prevPhi = phi;
    return hit;
  }
}

/**
 * Integrate a GR orbit for a fixed number of periapsis passages and return the mean
 * measured precession per orbit (radians). Used by the tests and by nothing hot.
 */
export function measurePrecession(r0: number, L: number, orbits: number, h: number): { prec: number; drift: number } {
  const s = newGR();
  const E = initGR(s, r0, L);
  const tr = new PeriapsisTracker();
  let first = NaN;
  let steps = 0;
  while (tr.count < orbits + 1 && steps < 5e7) {
    stepGR(s, L, E, h);
    steps++;
    if (s[0] < R_PLUNGE) break;
    if (tr.update(s[0], s[1], s[2], 1) && tr.count === 1) first = tr.lastPhi;
  }
  const prec = (tr.lastPhi - first) / (tr.count - 1) - 2 * Math.PI;
  return { prec, drift: Math.abs(energyOf(s, L) - E) / E };
}
