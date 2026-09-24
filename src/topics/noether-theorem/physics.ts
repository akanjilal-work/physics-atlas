// Noether's theorem, made numerical: 2 to 4 bodies in a plane with pairwise
// forces, plus three optional symmetry-breaking terms.
//
//   H = sum_i |p_i|^2 / 2 m_i  +  f(t) [ sum_{i<j} U_ij(q_i - q_j)  +  sum_i W_i(q_i) ]
//
//   pulse  -> f(t) = 1 + A sin(Omega t)    breaks time translation   -> E drifts
//   field  -> W_i = fixed well at origin    breaks space translation  -> P drifts
//   aniso  -> squash the y axis in U and W  breaks rotation           -> L drifts
//
// Pure module. No DOM, no Three.js.

export const MAX_BODIES = 4;

/** Pulse amplitude and angular frequency of f(t). */
export const PULSE_A = 0.3;
export const PULSE_OMEGA = 1.1;
/** Pair law: U = K m_i m_j (sqrt(rho^2 + a^2) - a). Pull grows to a constant K m_i m_j at long range. */
export const PAIR_K = 1;
export const PAIR_A = 0.4;
/** Well at the origin: W = WELL m (sqrt(x^2 + s y^2 + b^2) - b). Its pull levels off at WELL m far away. */
export const WELL = 1.2;
export const WELL_B = 0.7;
/** Anisotropy factor s applied to y^2 when rotation symmetry is broken. */
export const ANISO_S = 0.35;
/** Fixed integrator step. */
export const STEP = 2e-3;

export interface Params {
  pulse: boolean;
  field: boolean;
  aniso: boolean;
}

export interface Sys {
  n: number;
  m: Float64Array;
  /** Positions, interleaved x, y. */
  x: Float64Array;
  /** Velocities, interleaved vx, vy. */
  v: Float64Array;
  /** Scratch accelerations. */
  a: Float64Array;
  t: number;
}

export function createSys(): Sys {
  return {
    n: 3,
    m: new Float64Array(MAX_BODIES),
    x: new Float64Array(MAX_BODIES * 2),
    v: new Float64Array(MAX_BODIES * 2),
    a: new Float64Array(MAX_BODIES * 2),
    t: 0,
  };
}

export function copySys(dst: Sys, src: Sys): void {
  dst.n = src.n;
  dst.m.set(src.m);
  dst.x.set(src.x);
  dst.v.set(src.v);
  dst.t = src.t;
}

/** Strength multiplier f(t) of every potential term. */
export function strength(t: number, p: Params): number {
  return p.pulse ? 1 + PULSE_A * Math.sin(PULSE_OMEGA * t) : 1;
}

/** df/dt, used for the energy budget dE/dt = f'(t) V(q). */
export function strengthRate(t: number, p: Params): number {
  return p.pulse ? PULSE_A * PULSE_OMEGA * Math.cos(PULSE_OMEGA * t) : 0;
}

/** Time-independent potential V(q), so that the full potential is f(t) V(q). */
export function potential(s: Sys, p: Params): number {
  const sy = p.aniso ? ANISO_S : 1;
  let V = 0;
  for (let i = 0; i < s.n; i++) {
    const xi = s.x[2 * i];
    const yi = s.x[2 * i + 1];
    for (let j = i + 1; j < s.n; j++) {
      const dx = xi - s.x[2 * j];
      const dy = yi - s.x[2 * j + 1];
      V += PAIR_K * s.m[i] * s.m[j] * (Math.sqrt(dx * dx + sy * dy * dy + PAIR_A * PAIR_A) - PAIR_A);
    }
    if (p.field) V += WELL * s.m[i] * (Math.sqrt(xi * xi + sy * yi * yi + WELL_B * WELL_B) - WELL_B);
  }
  return V;
}

export function kinetic(s: Sys): number {
  let K = 0;
  for (let i = 0; i < s.n; i++) {
    const vx = s.v[2 * i];
    const vy = s.v[2 * i + 1];
    K += 0.5 * s.m[i] * (vx * vx + vy * vy);
  }
  return K;
}

/** The Hamiltonian E = K + f(t) V. Conserved only when f is constant. */
export function energy(s: Sys, p: Params): number {
  return kinetic(s) + strength(s.t, p) * potential(s, p);
}

/** Total linear momentum into out[0..1]. */
export function momentum(s: Sys, out: Float64Array): Float64Array {
  let px = 0;
  let py = 0;
  for (let i = 0; i < s.n; i++) {
    px += s.m[i] * s.v[2 * i];
    py += s.m[i] * s.v[2 * i + 1];
  }
  out[0] = px;
  out[1] = py;
  return out;
}

/** Angular momentum about the origin (the z component, the only one in 2D). */
export function angularMomentum(s: Sys): number {
  let L = 0;
  for (let i = 0; i < s.n; i++) {
    L += s.m[i] * (s.x[2 * i] * s.v[2 * i + 1] - s.x[2 * i + 1] * s.v[2 * i]);
  }
  return L;
}

/** Accelerations at time t into s.a. */
export function accel(s: Sys, p: Params, t: number): void {
  const f = strength(t, p);
  const sy = p.aniso ? ANISO_S : 1;
  const a = s.a;
  for (let k = 0; k < 2 * s.n; k++) a[k] = 0;
  for (let i = 0; i < s.n; i++) {
    const xi = s.x[2 * i];
    const yi = s.x[2 * i + 1];
    for (let j = i + 1; j < s.n; j++) {
      const dx = xi - s.x[2 * j];
      const dy = yi - s.x[2 * j + 1];
      const rho = Math.sqrt(dx * dx + sy * dy * dy + PAIR_A * PAIR_A);
      // Force on i is -f dU/dq_i. The same vector, reversed, acts on j.
      const c = (f * PAIR_K * s.m[i] * s.m[j]) / rho;
      const fx = -c * dx;
      const fy = -c * sy * dy;
      a[2 * i] += fx / s.m[i];
      a[2 * i + 1] += fy / s.m[i];
      a[2 * j] -= fx / s.m[j];
      a[2 * j + 1] -= fy / s.m[j];
    }
    if (p.field) {
      const u = xi * xi + sy * yi * yi + WELL_B * WELL_B;
      const c = (f * WELL) / Math.sqrt(u); // per unit mass
      a[2 * i] -= c * xi;
      a[2 * i + 1] -= c * sy * yi;
    }
  }
}

// Yoshida (1990) fourth-order symplectic composition of leapfrog.
const CBRT2 = Math.cbrt(2);
const W1 = 1 / (2 - CBRT2);
const W0 = -CBRT2 * W1;
const C = [W1 / 2, (W0 + W1) / 2, (W0 + W1) / 2, W1 / 2];
const D = [W1, W0, W1];

function drift(s: Sys, h: number): void {
  for (let k = 0; k < 2 * s.n; k++) s.x[k] += h * s.v[k];
  s.t += h;
}

function kick(s: Sys, p: Params, h: number): void {
  accel(s, p, s.t);
  for (let k = 0; k < 2 * s.n; k++) s.v[k] += h * s.a[k];
}

/**
 * One Yoshida step. Time is treated as an extra coordinate that advances in
 * the drift stages, so the scheme stays symplectic when f depends on t.
 * Every stage is a pure drift or a kick by pairwise-equal-and-opposite
 * forces, so P and L are kept to round-off whenever their symmetry holds.
 */
export function yoshidaStep(s: Sys, p: Params, h: number): void {
  drift(s, C[0] * h);
  kick(s, p, D[0] * h);
  drift(s, C[1] * h);
  kick(s, p, D[1] * h);
  drift(s, C[2] * h);
  kick(s, p, D[2] * h);
  drift(s, C[3] * h);
}

/** Plain kick-drift-kick leapfrog (second order), for comparison in tests. */
export function leapfrogStep(s: Sys, p: Params, h: number): void {
  kick(s, p, h / 2);
  drift(s, h);
  kick(s, p, h / 2);
}

export const MASSES = [1.0, 0.8, 1.25, 0.9];
const ANGLES: Record<number, number[]> = {
  2: [0.3, 0.3 + Math.PI],
  3: [0.2, 2.35, 4.25],
  4: [0.1, 1.75, 3.3, 4.75],
};
const RADII = [0.95, 0.75, 1.1, 0.85];
/** Where the system starts: off-centre, so a well at the origin pulls on it. */
export const START_CENTRE = [-1.3, 0.45];

/**
 * Build the starting state for n bodies. It is the same whatever the toggles,
 * so switching a symmetry off changes the law and nothing else.
 * Total momentum starts at zero and the centre of mass sits at START_CENTRE.
 */
export function initSystem(s: Sys, n: number): void {
  s.n = Math.max(2, Math.min(MAX_BODIES, Math.round(n)));
  s.t = 0;
  const ang = ANGLES[s.n];
  let M = 0;
  for (let i = 0; i < s.n; i++) {
    s.m[i] = MASSES[i];
    M += s.m[i];
    s.x[2 * i] = RADII[i] * Math.cos(ang[i]);
    s.x[2 * i + 1] = RADII[i] * Math.sin(ang[i]);
  }
  // Centre of mass to the origin for now.
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < s.n; i++) {
    cx += s.m[i] * s.x[2 * i];
    cy += s.m[i] * s.x[2 * i + 1];
  }
  cx /= M;
  cy /= M;
  for (let i = 0; i < s.n; i++) {
    s.x[2 * i] -= cx;
    s.x[2 * i + 1] -= cy;
  }
  // Tangential speeds from the free pair forces, 85% of the circular value, so the motion wanders.
  accel(s, { pulse: false, field: false, aniso: false }, 0);
  for (let i = 0; i < s.n; i++) {
    const x = s.x[2 * i];
    const y = s.x[2 * i + 1];
    const r = Math.hypot(x, y);
    const aIn = -(s.a[2 * i] * x + s.a[2 * i + 1] * y) / r;
    const v = 0.85 * Math.sqrt(Math.max(0, aIn) * r);
    s.v[2 * i] = (-v * y) / r;
    s.v[2 * i + 1] = (v * x) / r;
  }
  let px = 0;
  let py = 0;
  for (let i = 0; i < s.n; i++) {
    px += s.m[i] * s.v[2 * i];
    py += s.m[i] * s.v[2 * i + 1];
  }
  for (let i = 0; i < s.n; i++) {
    s.v[2 * i] -= px / M;
    s.v[2 * i + 1] -= py / M;
    s.x[2 * i] += START_CENTRE[0];
    s.x[2 * i + 1] += START_CENTRE[1];
  }
  for (let k = 2 * s.n; k < 2 * MAX_BODIES; k++) {
    s.x[k] = 0;
    s.v[k] = 0;
  }
}

/** Natural scales so drifts can be quoted as fractions. */
export function scales(s: Sys, p: Params): { E: number; P: number; L: number } {
  let P = 0;
  let L = 0;
  for (let i = 0; i < s.n; i++) {
    const sp = Math.hypot(s.v[2 * i], s.v[2 * i + 1]);
    P += s.m[i] * sp;
    L += s.m[i] * sp * Math.hypot(s.x[2 * i], s.x[2 * i + 1]);
  }
  const f = strength(s.t, p);
  return { E: kinetic(s) + Math.abs(f * potential(s, p)), P, L };
}

export type GhostMode = 'time' | 'space' | 'rotation';
/** Space shift of the ghost, and the display offset of the time ghost. */
export const GHOST_SHIFT = [2.6, 0];
/** The rotation ghost is turned a quarter turn (90 degrees) about the origin. */
/** Clock offset of the time ghost: a quarter of the pulse period. */
export const GHOST_DELAY = Math.PI / (2 * PULSE_OMEGA);

/** Apply the symmetry transformation T to a point (x, y) into out. */
export function transformPoint(mode: GhostMode, x: number, y: number, out: Float64Array): void {
  if (mode === 'space') {
    out[0] = x + GHOST_SHIFT[0];
    out[1] = y + GHOST_SHIFT[1];
  } else if (mode === 'rotation') {
    // A quarter turn, written exactly: (x, y) -> (-y, x). No rounding enters.
    out[0] = -y;
    out[1] = x;
  } else {
    out[0] = x;
    out[1] = y;
  }
}

/** Ghost = T(real): shifted, rotated, or started on a later clock. */
export function makeGhost(ghost: Sys, real: Sys, mode: GhostMode): void {
  copySys(ghost, real);
  const tmp = new Float64Array(2);
  for (let i = 0; i < real.n; i++) {
    transformPoint(mode, real.x[2 * i], real.x[2 * i + 1], tmp);
    ghost.x[2 * i] = tmp[0];
    ghost.x[2 * i + 1] = tmp[1];
    if (mode === 'rotation') {
      ghost.v[2 * i] = -real.v[2 * i + 1];
      ghost.v[2 * i + 1] = real.v[2 * i];
    }
  }
  if (mode === 'time') ghost.t = real.t + GHOST_DELAY;
}

/** Largest distance between a ghost body and where the symmetry says it should be, T(real). */
export function ghostGap(ghost: Sys, real: Sys, mode: GhostMode, tmp: Float64Array): number {
  let worst = 0;
  for (let i = 0; i < real.n; i++) {
    transformPoint(mode, real.x[2 * i], real.x[2 * i + 1], tmp);
    const d = Math.hypot(ghost.x[2 * i] - tmp[0], ghost.x[2 * i + 1] - tmp[1]);
    if (d > worst) worst = d;
  }
  return worst;
}

/** Which symmetries of the law hold for these toggles. */
export function symmetries(p: Params): { time: boolean; space: boolean; rotation: boolean } {
  return { time: !p.pulse, space: !p.field, rotation: !p.aniso };
}
