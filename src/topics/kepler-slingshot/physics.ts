// Kepler orbits, Hohmann transfers and gravity assists.
// Units: G = 1, Sun mass = 1, planet orbit radius = 1, so the planet's circular
// speed is about 1 and its period is about 2π.
// Pure module: no DOM, no Three.js. The step functions allocate nothing.

export const TAU = 2 * Math.PI;

// ---------------------------------------------------------------------------
// Closed forms

/** Vis-viva: orbital speed at distance r on an orbit of semi-major axis a (a < 0 for a hyperbola). */
export function visViva(mu: number, r: number, a: number): number {
  return Math.sqrt(mu * (2 / r - 1 / a));
}

/** Kepler's third law: T = 2π √(a³/μ). */
export function keplerPeriod(mu: number, a: number): number {
  return TAU * Math.sqrt((a * a * a) / mu);
}

export interface Hohmann {
  /** First burn, at the inner orbit. */
  dv1: number;
  /** Second burn, at the outer orbit. */
  dv2: number;
  total: number;
  /** Semi-major axis of the transfer ellipse. */
  aT: number;
  /** Half the transfer ellipse period. */
  tTransfer: number;
  /** Angle the target must lead the probe by at the first burn. */
  phase: number;
}

/** Hohmann transfer between circular orbits r1 < r2 around mass μ. */
export function hohmann(mu: number, r1: number, r2: number): Hohmann {
  const aT = (r1 + r2) / 2;
  const v1 = Math.sqrt(mu / r1);
  const v2 = Math.sqrt(mu / r2);
  const dv1 = v1 * (Math.sqrt((2 * r2) / (r1 + r2)) - 1);
  const dv2 = v2 * (1 - Math.sqrt((2 * r1) / (r1 + r2)));
  const tTransfer = Math.PI * Math.sqrt((aT * aT * aT) / mu);
  const n2 = Math.sqrt(mu / (r2 * r2 * r2));
  let phase = Math.PI - n2 * tTransfer;
  phase = ((phase % TAU) + TAU) % TAU;
  return { dv1, dv2, total: dv1 + dv2, aT, tTransfer, phase };
}

export interface Flyby {
  /** Hyperbola eccentricity, e = 1 + rp v∞² / μ. */
  e: number;
  /** Turning angle, sin(δ/2) = 1/e. */
  delta: number;
  /** Impact parameter b = rp √(1 + 2μ/(rp v∞²)). */
  b: number;
  /** Speed at periapsis. */
  vPeri: number;
}

/** Hyperbolic flyby of a body with gravitational parameter μ at periapsis rp and excess speed v∞. */
export function flybyTurn(mu: number, vInf: number, rp: number): Flyby {
  const e = 1 + (rp * vInf * vInf) / mu;
  const delta = 2 * Math.asin(1 / e);
  const b = rp * Math.sqrt(1 + (2 * mu) / (rp * vInf * vInf));
  const vPeri = Math.sqrt(vInf * vInf + (2 * mu) / rp);
  return { e, delta, b, vPeri };
}

export interface Elements {
  a: number;
  e: number;
  /** Specific orbital energy v²/2 − μ/r. */
  energy: number;
  /** Specific angular momentum (z component). */
  h: number;
  /** Argument of periapsis (angle of the eccentricity vector). */
  omega: number;
}

/** Planar orbital elements from a state vector around a fixed mass μ at the origin. */
export function elements(mu: number, x: number, y: number, vx: number, vy: number, out: Elements): Elements {
  const r = Math.hypot(x, y);
  const v2 = vx * vx + vy * vy;
  const h = x * vy - y * vx;
  const energy = v2 / 2 - mu / r;
  // Eccentricity vector: (v × h)/μ − r̂
  const ex = (vy * h) / mu - x / r;
  const ey = (-vx * h) / mu - y / r;
  out.e = Math.hypot(ex, ey);
  out.a = -mu / (2 * energy);
  out.energy = energy;
  out.h = h;
  out.omega = Math.atan2(ey, ex);
  return out;
}

/** Solve Kepler's equation M = E − e sin E for the eccentric anomaly (elliptic orbits). */
export function eccentricAnomaly(M: number, e: number): number {
  let E = e < 0.8 ? M : Math.PI * Math.sign(Math.sin(M) || 1);
  for (let i = 0; i < 50; i++) {
    const f = E - e * Math.sin(E) - M;
    const d = f / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-14) break;
  }
  return E;
}

/**
 * Position and velocity on an ellipse with the focus at the origin and periapsis on +x,
 * at time t after periapsis. Writes [x, y, vx, vy] into out.
 */
export function keplerState(mu: number, a: number, e: number, t: number, out: Float64Array): Float64Array {
  const n = Math.sqrt(mu / (a * a * a));
  const E = eccentricAnomaly(n * t, e);
  const c = Math.cos(E);
  const s = Math.sin(E);
  const q = Math.sqrt(1 - e * e);
  const r = a * (1 - e * c);
  out[0] = a * (c - e);
  out[1] = a * q * s;
  const edot = (n * a) / r;
  out[2] = -a * s * edot;
  out[3] = a * q * c * edot;
  return out;
}

// ---------------------------------------------------------------------------
// Two-body integrator (fixed Sun), used by the Kepler and Hohmann views.

// Yoshida (1990) fourth-order symplectic coefficients.
const CBRT2 = Math.cbrt(2);
const W1 = 1 / (2 - CBRT2);
const W0 = -CBRT2 / (2 - CBRT2);
const YC = [W1 / 2, (W0 + W1) / 2, (W0 + W1) / 2, W1 / 2];
const YD = [W1, W0, W1];

/** One Yoshida step for s = [x, y, vx, vy] around a fixed mass μ at the origin. */
export function step2B(s: Float64Array, mu: number, h: number): void {
  for (let k = 0; k < 4; k++) {
    s[0] += YC[k] * h * s[2];
    s[1] += YC[k] * h * s[3];
    if (k === 3) break;
    const r2 = s[0] * s[0] + s[1] * s[1];
    const f = (-mu * YD[k] * h) / (r2 * Math.sqrt(r2));
    s[2] += f * s[0];
    s[3] += f * s[1];
  }
}

export function energy2B(s: Float64Array, mu: number): number {
  return (s[2] * s[2] + s[3] * s[3]) / 2 - mu / Math.hypot(s[0], s[1]);
}

/** Area of the triangle fan from the origin through consecutive points (x0,y0,x1,y1,...). */
export function fanArea(pts: Float64Array, from: number, to: number): number {
  let A = 0;
  for (let k = from; k < to; k++) {
    const i = k * 2;
    A += 0.5 * (pts[i] * pts[i + 3] - pts[i + 2] * pts[i + 1]);
  }
  return Math.abs(A);
}

/**
 * Integrate one full Kepler orbit numerically, sampled at n equal time intervals
 * (n + 1 points), starting half a slice before periapsis. Returns the sample
 * positions and the energy drift over the orbit.
 */
export function sampleOrbit(mu: number, a: number, e: number, n: number, sub: number, slices: number, pts: Float64Array): number {
  const T = keplerPeriod(mu, a);
  const s = keplerState(mu, a, e, -T / (2 * slices), new Float64Array(4));
  const E0 = energy2B(s, mu);
  const h = T / (n * sub);
  pts[0] = s[0];
  pts[1] = s[1];
  for (let i = 1; i <= n; i++) {
    for (let k = 0; k < sub; k++) step2B(s, mu, h);
    pts[i * 2] = s[0];
    pts[i * 2 + 1] = s[1];
  }
  return Math.abs((energy2B(s, mu) - E0) / E0);
}

// ---------------------------------------------------------------------------
// Sun + planet + probe (restricted three-body), for the gravity assist.

export interface FlySys {
  /** Planet/Sun mass ratio. The probe is massless. */
  q: number;
  /** Positions: sun x,y, planet x,y, probe x,y. */
  x: Float64Array;
  v: Float64Array;
  a: Float64Array;
  t: number;
}

export function createFly(q: number): FlySys {
  return { q, x: new Float64Array(6), v: new Float64Array(6), a: new Float64Array(6), t: 0 };
}

function accelFly(s: FlySys): void {
  const { x, a, q } = s;
  // Sun <-> planet
  let dx = x[2] - x[0];
  let dy = x[3] - x[1];
  let r2 = dx * dx + dy * dy;
  let inv = 1 / (r2 * Math.sqrt(r2));
  a[0] = q * inv * dx;
  a[1] = q * inv * dy;
  a[2] = -inv * dx;
  a[3] = -inv * dy;
  // Probe feels both
  dx = x[0] - x[4];
  dy = x[1] - x[5];
  r2 = dx * dx + dy * dy;
  inv = 1 / (r2 * Math.sqrt(r2));
  a[4] = inv * dx;
  a[5] = inv * dy;
  dx = x[2] - x[4];
  dy = x[3] - x[5];
  r2 = dx * dx + dy * dy;
  inv = q / (r2 * Math.sqrt(r2));
  a[4] += inv * dx;
  a[5] += inv * dy;
}

/** One Yoshida fourth-order step of the three-body system (h may be negative). */
export function stepFly(s: FlySys, h: number): void {
  const { x, v, a } = s;
  for (let k = 0; k < 4; k++) {
    const c = YC[k] * h;
    for (let i = 0; i < 6; i++) x[i] += c * v[i];
    if (k === 3) break;
    accelFly(s);
    const d = YD[k] * h;
    for (let i = 0; i < 6; i++) v[i] += d * a[i];
  }
  s.t += h;
}

/** Step size: a small fraction of the local orbital time around the planet and the Sun. */
export function flyStepSize(s: FlySys, eta: number, hmax: number): number {
  const { x, q } = s;
  const dp = Math.hypot(x[4] - x[2], x[5] - x[3]);
  const ds = Math.hypot(x[4] - x[0], x[5] - x[1]);
  return Math.min(hmax, eta * Math.sqrt((dp * dp * dp) / q), eta * Math.sqrt(ds * ds * ds));
}

/** Probe distance from the planet. */
export function planetDist(s: FlySys): number {
  return Math.hypot(s.x[4] - s.x[2], s.x[5] - s.x[3]);
}

/** Probe speed relative to the Sun. */
export function helioSpeed(s: FlySys): number {
  return Math.hypot(s.v[4] - s.v[0], s.v[5] - s.v[1]);
}

/** Probe speed relative to the planet. */
export function planetSpeed(s: FlySys): number {
  return Math.hypot(s.v[4] - s.v[2], s.v[5] - s.v[3]);
}

/** Probe's heliocentric specific energy, v²/2 − 1/r, ignoring the planet. */
export function helioEnergy(s: FlySys): number {
  const vx = s.v[4] - s.v[0];
  const vy = s.v[5] - s.v[1];
  return (vx * vx + vy * vy) / 2 - 1 / Math.hypot(s.x[4] - s.x[0], s.x[5] - s.x[1]);
}

export interface FlybyParams {
  /** Planet/Sun mass ratio (Jupiter ≈ 9.5e-4). */
  q: number;
  /** Excess speed relative to the planet, in units of the planet's orbital speed. */
  vInf: number;
  /** Direction of the incoming v∞, measured from the planet's velocity (radians). */
  thetaIn: number;
  /** Periapsis distance (orbit-radius units). */
  rp: number;
  /** +1: the probe swings counter-clockwise around the planet. −1: clockwise. */
  turn: 1 | -1;
  /** Planet's orbital angle at the moment of closest approach. */
  phi: number;
}

export interface PatchedConic extends Flyby {
  /** +1: the probe turns counter-clockwise. */
  turn: number;
  /** Planet velocity relative to the Sun. */
  Vp: [number, number];
  vIn: [number, number];
  vOut: [number, number];
  /** Heliocentric velocity before and after. */
  VIn: [number, number];
  VOut: [number, number];
  /** Unit vector from planet to periapsis. */
  rHat: [number, number];
  /** Change in heliocentric energy, V_p · (v_out − v_in). */
  dE: number;
  /** Periapsis lies on the planet's trailing side. */
  behind: boolean;
}

const rot = (x: number, y: number, ang: number): [number, number] => {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return [c * x - s * y, s * x + c * y];
};

/** Patched-conic prediction: rotate v∞ by δ in the planet frame, then add the planet's velocity. */
export function patchedConic(p: FlybyParams): PatchedConic {
  const mu = p.q;
  const fb = flybyTurn(mu, p.vInf, p.rp);
  const Vs = Math.sqrt(1 + p.q); // planet speed relative to the Sun on a circular orbit of separation 1
  const w: [number, number] = [-Math.sin(p.phi), Math.cos(p.phi)];
  const Vp: [number, number] = [Vs * w[0], Vs * w[1]];
  const uIn = rot(w[0], w[1], p.thetaIn);
  const turn = p.turn;
  const uOut = rot(uIn[0], uIn[1], turn * fb.delta);
  let rx = uIn[0] - uOut[0];
  let ry = uIn[1] - uOut[1];
  const L = Math.hypot(rx, ry);
  rx /= L;
  ry /= L;
  const vIn: [number, number] = [p.vInf * uIn[0], p.vInf * uIn[1]];
  const vOut: [number, number] = [p.vInf * uOut[0], p.vInf * uOut[1]];
  const VIn: [number, number] = [Vp[0] + vIn[0], Vp[1] + vIn[1]];
  const VOut: [number, number] = [Vp[0] + vOut[0], Vp[1] + vOut[1]];
  const dE = Vp[0] * (vOut[0] - vIn[0]) + Vp[1] * (vOut[1] - vIn[1]);
  const behind = rx * w[0] + ry * w[1] < 0;
  return { ...fb, turn, Vp, vIn, vOut, VIn, VOut, rHat: [rx, ry], dE, behind };
}

/**
 * Put the system at the moment of closest approach: Sun and planet on a circular
 * orbit about their barycentre, the probe at periapsis of the planet-frame hyperbola.
 */
export function flybyAtPeriapsis(s: FlySys, p: FlybyParams, pc: PatchedConic): void {
  const q = p.q;
  const M = 1 + q;
  const om = Math.sqrt(M); // separation 1
  const c = Math.cos(p.phi);
  const sn = Math.sin(p.phi);
  const fs = -q / M;
  const fp = 1 / M;
  s.q = q;
  s.x[0] = fs * c;
  s.x[1] = fs * sn;
  s.x[2] = fp * c;
  s.x[3] = fp * sn;
  s.v[0] = fs * om * -sn;
  s.v[1] = fs * om * c;
  s.v[2] = fp * om * -sn;
  s.v[3] = fp * om * c;
  const [rx, ry] = pc.rHat;
  const [tx, ty] = rot(rx, ry, (pc.turn * Math.PI) / 2);
  s.x[4] = s.x[2] + p.rp * rx;
  s.x[5] = s.x[3] + p.rp * ry;
  s.v[4] = s.v[2] + pc.vPeri * tx;
  s.v[5] = s.v[3] + pc.vPeri * ty;
  s.t = 0;
}

/** Advance s to time tEnd (either direction) with adaptive steps. Calls onStep after each step. Returns steps taken. */
export function runFly(s: FlySys, tEnd: number, eta: number, hmax: number, onStep?: (s: FlySys) => void): number {
  const dir = tEnd >= s.t ? 1 : -1;
  let n = 0;
  while (dir * (tEnd - s.t) > 1e-12 && n < 5e6) {
    const h = Math.min(flyStepSize(s, eta, hmax), dir * (tEnd - s.t));
    stepFly(s, dir * h);
    n++;
    if (onStep) onStep(s);
  }
  return n;
}

export interface FlybyRun {
  /** Heliocentric energy at start and end. */
  E0: number;
  E1: number;
  /** Equivalent speed at the planet's orbital radius, before and after (vis-viva at r = 1). */
  V0: number;
  V1: number;
  /** Planet-frame speed at start and end. */
  u0: number;
  u1: number;
  steps: number;
}

/** Heliocentric speed a probe with specific energy E would have at r = 1. */
export const speedAtOrbit = (E: number): number => Math.sqrt(Math.max(0, 2 * (E + 1)));

/** Build the start state (τ before periapsis) by integrating backwards from periapsis. */
export function flybyStart(s: FlySys, p: FlybyParams, pc: PatchedConic, tau: number, eta: number, hmax: number): void {
  flybyAtPeriapsis(s, p, pc);
  runFly(s, -tau, eta, hmax);
}

/** Full numerical flyby from −τ to +τ. */
export function simulateFlyby(p: FlybyParams, tau: number, eta = 0.01, hmax = 2e-3): FlybyRun {
  const pc = patchedConic(p);
  const s = createFly(p.q);
  flybyStart(s, p, pc, tau, eta, hmax);
  const E0 = helioEnergy(s);
  const u0 = planetSpeed(s);
  const steps = runFly(s, tau, eta, hmax);
  const E1 = helioEnergy(s);
  return { E0, E1, V0: speedAtOrbit(E0), V1: speedAtOrbit(E1), u0, u1: planetSpeed(s), steps };
}
