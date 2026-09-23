// Lorenz (1963) system. Pure math: no DOM, no Three.js.
//   dx/dt = σ (y − x)
//   dy/dt = x (ρ − z) − y
//   dz/dt = x y − β z

export interface LorenzParams {
  sigma: number;
  rho: number;
  beta: number;
}

export const CLASSIC: LorenzParams = { sigma: 10, rho: 28, beta: 8 / 3 };

/** Published largest Lyapunov exponent at the classic parameters (e.g. Sprott, Chaos and Time-Series Analysis). */
export const LYAPUNOV_CLASSIC = 0.9056;

/** Default fixed integrator step (Lorenz time units). */
export const H = 0.005;

/** Velocity field at (x, y, z), written into out[o..o+2]. */
export function deriv(x: number, y: number, z: number, p: LorenzParams, out: Float64Array, o = 0): void {
  out[o] = p.sigma * (y - x);
  out[o + 1] = x * (p.rho - z) - y;
  out[o + 2] = x * y - p.beta * z;
}

/** Speed |f(x)| of the flow at a point. */
export function speed(x: number, y: number, z: number, p: LorenzParams): number {
  const a = p.sigma * (y - x);
  const b = x * (p.rho - z) - y;
  const c = x * y - p.beta * z;
  return Math.sqrt(a * a + b * b + c * c);
}

/**
 * One classical RK4 step, in place, for the point stored at buf[o..o+2].
 * Scalar temporaries only, so it allocates nothing and can run over thousands of points per frame.
 */
export function rk4InPlace(buf: Float64Array, o: number, p: LorenzParams, h: number): void {
  const { sigma: s, rho: r, beta: b } = p;
  const x = buf[o];
  const y = buf[o + 1];
  const z = buf[o + 2];
  const k1x = s * (y - x);
  const k1y = x * (r - z) - y;
  const k1z = x * y - b * z;
  let ax = x + 0.5 * h * k1x;
  let ay = y + 0.5 * h * k1y;
  let az = z + 0.5 * h * k1z;
  const k2x = s * (ay - ax);
  const k2y = ax * (r - az) - ay;
  const k2z = ax * ay - b * az;
  ax = x + 0.5 * h * k2x;
  ay = y + 0.5 * h * k2y;
  az = z + 0.5 * h * k2z;
  const k3x = s * (ay - ax);
  const k3y = ax * (r - az) - ay;
  const k3z = ax * ay - b * az;
  ax = x + h * k3x;
  ay = y + h * k3y;
  az = z + h * k3z;
  const k4x = s * (ay - ax);
  const k4y = ax * (r - az) - ay;
  const k4z = ax * ay - b * az;
  const h6 = h / 6;
  buf[o] = x + h6 * (k1x + 2 * k2x + 2 * k3x + k4x);
  buf[o + 1] = y + h6 * (k1y + 2 * k2y + 2 * k3y + k4y);
  buf[o + 2] = z + h6 * (k1z + 2 * k2z + 2 * k3z + k4z);
}

/** Advance n points packed as [x0,y0,z0,x1,...] by one RK4 step each. */
export function rk4Many(buf: Float64Array, n: number, p: LorenzParams, h: number): void {
  for (let i = 0; i < n; i++) rk4InPlace(buf, i * 3, p, h);
}

/** Convenience wrapper that returns a new state. Used by tests. */
export function rk4(s: [number, number, number], p: LorenzParams, h: number): [number, number, number] {
  const b = new Float64Array(s);
  rk4InPlace(b, 0, p, h);
  return [b[0], b[1], b[2]];
}

// ---------------------------------------------------------------------------
// Fixed points, Jacobian and stability

export type Vec3 = [number, number, number];

/** Origin always. C± = (±√(β(ρ−1)), ±√(β(ρ−1)), ρ−1) only when ρ > 1. */
export function fixedPoints(p: LorenzParams): Vec3[] {
  const pts: Vec3[] = [[0, 0, 0]];
  if (p.rho > 1) {
    const a = Math.sqrt(p.beta * (p.rho - 1));
    pts.push([a, a, p.rho - 1], [-a, -a, p.rho - 1]);
  }
  return pts;
}

/** Jacobian of the Lorenz field at (x, y, z), row-major 3×3. */
export function jacobian(x: number, y: number, z: number, p: LorenzParams): number[] {
  return [
    -p.sigma, p.sigma, 0,
    p.rho - z, -1, -x,
    y, x, -p.beta,
  ];
}

/** Divergence of the flow, the trace of the Jacobian. It is the same everywhere: −(σ + 1 + β). */
export function divergence(p: LorenzParams): number {
  return -(p.sigma + 1 + p.beta);
}

export interface Complex {
  re: number;
  im: number;
}

/** Roots of λ³ + a λ² + b λ + c = 0 (real coefficients). */
export function cubicRoots(a: number, b: number, c: number): Complex[] {
  // Depressed cubic t³ + P t + Q with λ = t − a/3.
  const P = b - (a * a) / 3;
  const Q = (2 * a * a * a) / 27 - (a * b) / 3 + c;
  const shift = -a / 3;
  const D = (Q * Q) / 4 + (P * P * P) / 27;
  if (D > 0) {
    const sq = Math.sqrt(D);
    const u = Math.cbrt(-Q / 2 + sq);
    const v = Math.cbrt(-Q / 2 - sq);
    const re = -(u + v) / 2 + shift;
    const im = (Math.sqrt(3) / 2) * (u - v);
    return [{ re: u + v + shift, im: 0 }, { re, im }, { re, im: -im }];
  }
  // Three real roots (trigonometric form).
  const m = 2 * Math.sqrt(Math.max(0, -P / 3));
  if (m === 0) return [{ re: shift, im: 0 }, { re: shift, im: 0 }, { re: shift, im: 0 }];
  const arg = Math.max(-1, Math.min(1, (3 * Q) / (P * m)));
  const th = Math.acos(arg) / 3;
  return [0, 1, 2].map((k) => ({ re: m * Math.cos(th - (2 * Math.PI * k) / 3) + shift, im: 0 }));
}

/** Eigenvalues of a real 3×3 matrix (row-major) via its characteristic polynomial. */
export function eigen3(J: number[]): Complex[] {
  const tr = J[0] + J[4] + J[8];
  const minors = J[0] * J[4] - J[1] * J[3] + J[0] * J[8] - J[2] * J[6] + J[4] * J[8] - J[5] * J[7];
  const det = J[0] * (J[4] * J[8] - J[5] * J[7]) - J[1] * (J[3] * J[8] - J[5] * J[6]) + J[2] * (J[3] * J[7] - J[4] * J[6]);
  // det(λI − J) = λ³ − tr λ² + minors λ − det
  return cubicRoots(-tr, minors, -det);
}

/** Largest real part of the Jacobian eigenvalues at a point. Negative means linearly stable. */
export function maxRealEig(pt: Vec3, p: LorenzParams): number {
  return Math.max(...eigen3(jacobian(pt[0], pt[1], pt[2], p)).map((e) => e.re));
}

/** Hopf point where C± lose stability: ρ_H = σ(σ + β + 3)/(σ − β − 1). Needs σ > β + 1. */
export function hopfRho(sigma: number, beta: number): number {
  return (sigma * (sigma + beta + 3)) / (sigma - beta - 1);
}

// ---------------------------------------------------------------------------
// Largest Lyapunov exponent by renormalizing a nearby trajectory (Benettin et al.)

export class LyapunovEstimator {
  /** [ref x,y,z, twin x,y,z] */
  readonly s = new Float64Array(6);
  sumLog = 0;
  T = 0;
  private sinceRenorm = 0;
  readonly d0: number;
  readonly renormEvery: number;

  constructor(d0 = 1e-8, renormEvery = 0.05) {
    this.d0 = d0;
    this.renormEvery = renormEvery;
  }

  reset(x: number, y: number, z: number): void {
    this.s[0] = x;
    this.s[1] = y;
    this.s[2] = z;
    const e = this.d0 / Math.sqrt(3);
    this.s[3] = x + e;
    this.s[4] = y + e;
    this.s[5] = z + e;
    this.sumLog = 0;
    this.T = 0;
    this.sinceRenorm = 0;
  }

  /** Throw away the running average but keep the current position (after a transient). */
  restartAverage(): void {
    this.sumLog = 0;
    this.T = 0;
  }

  /** Advance both trajectories by one step and renormalize the gap when due. */
  step(p: LorenzParams, h: number): void {
    rk4InPlace(this.s, 0, p, h);
    rk4InPlace(this.s, 3, p, h);
    this.T += h;
    this.sinceRenorm += h;
    if (this.sinceRenorm >= this.renormEvery - 1e-12) {
      this.sinceRenorm = 0;
      const dx = this.s[3] - this.s[0];
      const dy = this.s[4] - this.s[1];
      const dz = this.s[5] - this.s[2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > 0) {
        this.sumLog += Math.log(d / this.d0);
        const k = this.d0 / d;
        this.s[3] = this.s[0] + dx * k;
        this.s[4] = this.s[1] + dy * k;
        this.s[5] = this.s[2] + dz * k;
      }
    }
  }

  get value(): number {
    return this.T > 0 ? this.sumLog / this.T : NaN;
  }
}

/** Full estimate: discard a transient, then average over T time units. */
export function lyapunov(p: LorenzParams, T = 500, h = H, start: Vec3 = [1, 1, 20], transient = 20): number {
  const est = new LyapunovEstimator();
  est.reset(start[0], start[1], start[2]);
  const nT = Math.round(transient / h);
  for (let i = 0; i < nT; i++) est.step(p, h);
  est.reset(est.s[0], est.s[1], est.s[2]);
  const n = Math.round(T / h);
  for (let i = 0; i < n; i++) est.step(p, h);
  return est.value;
}

// ---------------------------------------------------------------------------
// Lorenz map: successive maxima of z

/**
 * Detects local maxima of z(t) from successive samples and refines each one with a parabola through three samples.
 * Call push(z) after every step. It returns the refined maximum, or NaN when there is none.
 */
export class MaxTracker {
  private z0 = NaN;
  private z1 = NaN;

  reset(): void {
    this.z0 = NaN;
    this.z1 = NaN;
  }

  push(z2: number): number {
    const a = this.z0;
    const b = this.z1;
    this.z0 = b;
    this.z1 = z2;
    if (!(b > a && b >= z2)) return NaN;
    const den = a - 2 * b + z2;
    if (den >= 0) return b;
    const u = (0.5 * (a - z2)) / den;
    return b - 0.25 * (a - z2) * u;
  }
}

/** Successive z maxima after a transient. */
export function zMaxima(p: LorenzParams, count: number, h = H, start: Vec3 = [1, 1, 20], transient = 50): number[] {
  const b = new Float64Array(start);
  const nT = Math.round(transient / h);
  for (let i = 0; i < nT; i++) rk4InPlace(b, 0, p, h);
  const tr = new MaxTracker();
  const out: number[] = [];
  let guard = 0;
  while (out.length < count && guard++ < 1e7) {
    rk4InPlace(b, 0, p, h);
    const m = tr.push(b[2]);
    if (!Number.isNaN(m)) out.push(m);
  }
  return out;
}

/**
 * Number of distinct values in a list, merging values closer than tol.
 * A periodic orbit gives a small count. Chaos gives nearly as many as there are samples.
 */
export function distinctCount(vals: ArrayLike<number>, n: number, tol: number): number {
  const reps: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = vals[i];
    let found = false;
    for (const r of reps) {
      if (Math.abs(r - v) < tol) {
        found = true;
        break;
      }
    }
    if (!found) reps.push(v);
  }
  return reps.length;
}
