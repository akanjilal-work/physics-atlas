// Spontaneous symmetry breaking: the Mexican hat, a buckling column and the
// Kibble mechanism in a 2D XY model. Pure module: no DOM, no Three.js.
//
// Conventions for the hat. φ is a complex field with Lagrangian |∂φ|² − V(φ),
// V = −μ²|φ|² + λ|φ|⁴. Writing φ = (v + h + iπ)/√2 gives canonical real fields
// h (radial) and π (Goldstone). Then ⟨|φ|⟩ = √(μ²/2λ) = v/√2 with v = √(μ²/λ),
// m_h² = 2μ² and m_π² = 0. At finite temperature the leading high-T correction
// adds c T² |φ|², so μ² is replaced by μ²_eff = μ² − c T².

// ---------------------------------------------------------------------------
// Mexican hat

export interface HatParams {
  mu2: number;
  lambda: number;
  /** Temperature, in the same units as μ. */
  T: number;
  /** Coefficient of the thermal mass term c T² |φ|². */
  c: number;
}

/** Effective μ² at temperature T. */
export const mu2Eff = (p: HatParams) => p.mu2 - p.c * p.T * p.T;

/** Effective potential V_T(ρ) with ρ = |φ|. */
export const potentialT = (p: HatParams, rho: number) => {
  const r2 = rho * rho;
  return -mu2Eff(p) * r2 + p.lambda * r2 * r2;
};

/** Critical temperature where the curvature at φ = 0 changes sign: T_c = √(μ²/c). */
export const criticalT = (mu2: number, c: number) => (mu2 > 0 ? Math.sqrt(mu2 / c) : 0);

/** Radius of the vacuum ring, |φ|_min = √(μ²_eff / 2λ), or 0 in the symmetric phase. */
export const phiMin = (p: HatParams) => {
  const m = mu2Eff(p);
  return m > 0 ? Math.sqrt(m / (2 * p.lambda)) : 0;
};

/** Vacuum expectation value v = √2 |φ|_min = √(μ²_eff / λ). */
export const vev = (p: HatParams) => Math.SQRT2 * phiMin(p);

/** Depth of the potential at the ring, −μ⁴_eff / (4λ). */
export const vMin = (p: HatParams) => {
  const m = mu2Eff(p);
  return m > 0 ? -(m * m) / (4 * p.lambda) : 0;
};

/**
 * Masses of the radial and angular modes about the vacuum.
 * Broken phase: m_r² = 2μ²_eff, m_G = 0. Symmetric phase: both equal −μ²_eff.
 */
export function modeMasses(p: HatParams): { radial: number; goldstone: number } {
  const m = mu2Eff(p);
  if (m > 0) return { radial: Math.sqrt(2 * m), goldstone: 0 };
  const s = Math.sqrt(Math.max(0, -m));
  return { radial: s, goldstone: s };
}

/**
 * Mass-squared matrix ½ ∂²V/∂x_i∂x_j at the point φ = x + i y, projected on the
 * radial and angular directions. The ½ comes from the kinetic term |∂φ|², which
 * gives x and y a kinetic factor of 1 rather than ½. Computed by finite differences.
 */
export function curvatures(p: HatParams, x: number, y: number, h = 1e-4): { radial: number; angular: number } {
  const V = (a: number, b: number) => potentialT(p, Math.hypot(a, b));
  let ux = 1;
  let uy = 0;
  const r = Math.hypot(x, y);
  if (r > 1e-12) {
    ux = x / r;
    uy = y / r;
  }
  const dd = (dx: number, dy: number) => (V(x + h * dx, y + h * dy) - 2 * V(x, y) + V(x - h * dx, y - h * dy)) / (h * h);
  return { radial: 0.5 * dd(ux, uy), angular: 0.5 * dd(-uy, ux) };
}

/** Gradient of V with respect to x = Re φ and y = Im φ. */
export function gradV(p: HatParams, x: number, y: number, out: [number, number]): [number, number] {
  const r2 = x * x + y * y;
  const k = -2 * mu2Eff(p) + 4 * p.lambda * r2;
  out[0] = k * x;
  out[1] = k * y;
  return out;
}

/** Ball state on the hat: [x, y, vx, vy] with x = Re φ, y = Im φ. */
export type HatState = Float64Array;

const gTmp: [number, number] = [0, 0];
const k1 = new Float64Array(4);
const k2 = new Float64Array(4);
const k3 = new Float64Array(4);
const k4 = new Float64Array(4);
const sTmp = new Float64Array(4);

function hatDeriv(p: HatParams, gamma: number, s: Float64Array, out: Float64Array): void {
  gradV(p, s[0], s[1], gTmp);
  out[0] = s[2];
  out[1] = s[3];
  // Lagrangian ẋ² + ẏ² − V gives 2ẍ = −∂V/∂x.
  out[2] = -0.5 * gTmp[0] - gamma * s[2];
  out[3] = -0.5 * gTmp[1] - gamma * s[3];
}

/** One RK4 step of the damped ball. Allocation-free. */
export function stepHat(s: HatState, p: HatParams, gamma: number, h: number): void {
  hatDeriv(p, gamma, s, k1);
  for (let i = 0; i < 4; i++) sTmp[i] = s[i] + 0.5 * h * k1[i];
  hatDeriv(p, gamma, sTmp, k2);
  for (let i = 0; i < 4; i++) sTmp[i] = s[i] + 0.5 * h * k2[i];
  hatDeriv(p, gamma, sTmp, k3);
  for (let i = 0; i < 4; i++) sTmp[i] = s[i] + h * k3[i];
  hatDeriv(p, gamma, sTmp, k4);
  for (let i = 0; i < 4; i++) s[i] += (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
}

/** Mechanical energy ẋ² + ẏ² + V of the ball (conserved when γ = 0). */
export const hatEnergy = (s: HatState, p: HatParams) => s[2] * s[2] + s[3] * s[3] + potentialT(p, Math.hypot(s[0], s[1]));

/** Largest ρ ≤ rhoMax with V_T(ρ) ≤ cap, found by bisection. V_T grows for large ρ. */
export function radiusAtCap(p: HatParams, cap: number, rhoMax: number): number {
  if (potentialT(p, rhoMax) <= cap) return rhoMax;
  let lo = phiMin(p);
  let hi = rhoMax;
  for (let i = 0; i < 60; i++) {
    const m = 0.5 * (lo + hi);
    if (potentialT(p, m) <= cap) lo = m;
    else hi = m;
  }
  return lo;
}

// ---------------------------------------------------------------------------
// Random numbers (seeded, allocation-free)

export class Rng {
  private s: number;
  private spare = 0;
  private hasSpare = false;
  constructor(seed = 1) {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  normal(): number {
    if (this.hasSpare) {
      this.hasSpare = false;
      return this.spare;
    }
    let u = 0;
    while (u < 1e-12) u = this.next();
    const v = this.next();
    const r = Math.sqrt(-2 * Math.log(u));
    this.spare = r * Math.sin(2 * Math.PI * v);
    this.hasSpare = true;
    return r * Math.cos(2 * Math.PI * v);
  }
}

// ---------------------------------------------------------------------------
// Euler buckling (pinned-pinned elastica)

/** Complete elliptic integrals K(k) and E(k) by the arithmetic-geometric mean. */
export function ellipticKE(k: number): { K: number; E: number } {
  let a = 1;
  let b = Math.sqrt(Math.max(0, 1 - k * k));
  let c = k;
  let sum = 0.5 * c * c;
  let pow = 0.5;
  for (let i = 0; i < 40 && Math.abs(c) > 1e-16; i++) {
    const an = 0.5 * (a + b);
    const bn = Math.sqrt(a * b);
    c = 0.5 * (a - b);
    a = an;
    b = bn;
    pow *= 2;
    sum += pow * c * c;
  }
  const K = Math.PI / (2 * a);
  return { K, E: K * (1 - sum) };
}

/**
 * Load ratio P/P_c on the exact post-buckling branch with end slope α.
 * P/P_c = (2K(k)/π)² with k = sin(α/2). P_c = π²EI/L² is Euler's load.
 */
export function loadForSlope(alpha: number): number {
  const { K } = ellipticKE(Math.abs(Math.sin(alpha / 2)));
  const r = (2 * K) / Math.PI;
  return r * r;
}

/** End slope α on the buckled branch at load ratio p > 1 (inverse of loadForSlope). */
export function slopeForLoad(p: number): number {
  if (p <= 1) return 0;
  let lo = 0;
  let hi = Math.PI * 0.999;
  for (let i = 0; i < 60; i++) {
    const m = 0.5 * (lo + hi);
    if (loadForSlope(m) < p) lo = m;
    else hi = m;
  }
  return 0.5 * (lo + hi);
}

/** Exact elastica geometry for end slope α: mid-span deflection δ/L and end-to-end span/L. */
export function elasticaShape(alpha: number): { deflection: number; span: number } {
  const k = Math.sin(Math.abs(alpha) / 2);
  const { K, E } = ellipticKE(k);
  return { deflection: Math.sign(alpha) * (k / K), span: (2 * E) / K - 1 };
}

export interface RulerParams {
  /** Load ratio P/P_c. */
  p: number;
  /** Side bias, in units of the noise strength. */
  bias: number;
}

/** Ruler model constants: stiffness frequency, damping, noise and bias scale. */
export const RULER = { omega: 6, gamma: 4, sigma: 0.35, biasScale: 0.35 };

/**
 * Generalized force on the end slope α. Zero at α = 0 and on the exact elastica
 * branch p = g(α), so the equilibria are exact. The bias is a small side push.
 */
export function rulerForce(alpha: number, pr: RulerParams): number {
  const w2 = RULER.omega * RULER.omega;
  return -w2 * alpha * (loadForSlope(alpha) - pr.p) + RULER.biasScale * pr.bias;
}

/** Langevin step for the ruler: s = [α, α̇]. Semi-implicit Euler with noise. */
export function stepRuler(s: Float64Array, pr: RulerParams, h: number, rng: Rng): void {
  const f = rulerForce(s[0], pr) - RULER.gamma * s[1];
  s[1] += h * f + RULER.sigma * Math.sqrt(h) * rng.normal();
  s[0] += h * s[1];
  const lim = 2.4;
  if (s[0] > lim) { s[0] = lim; s[1] = 0; }
  if (s[0] < -lim) { s[0] = -lim; s[1] = 0; }
}

// ---------------------------------------------------------------------------
// 2D XY model, overdamped Langevin (model A) dynamics

const TWO_PI = 2 * Math.PI;
/** Wrap an angle difference into (−π, π]. */
export function wrapAngle(a: number): number {
  a = a % TWO_PI;
  if (a > Math.PI) a -= TWO_PI;
  else if (a <= -Math.PI) a += TWO_PI;
  return a;
}

/** Berezinskii–Kosterlitz–Thouless temperature of the square-lattice XY model, in units of J. */
export const T_BKT = 0.893;

export class XYLattice {
  readonly theta: Float64Array;
  private readonly force: Float64Array;
  readonly rng: Rng;
  readonly L: number;
  constructor(L: number, seed = 3) {
    this.L = L;
    this.theta = new Float64Array(L * L);
    this.force = new Float64Array(L * L);
    this.rng = new Rng(seed);
    this.randomize();
  }
  randomize(): void {
    for (let i = 0; i < this.theta.length; i++) this.theta[i] = (this.rng.next() * 2 - 1) * Math.PI;
  }
  /** dθ_i = J Σ_j sin(θ_j − θ_i) dt + √(2T dt) ξ, periodic boundaries, J = 1. */
  step(T: number, dt: number): void {
    const L = this.L;
    const th = this.theta;
    const f = this.force;
    for (let y = 0; y < L; y++) {
      const yu = ((y + 1) % L) * L;
      const yd = ((y + L - 1) % L) * L;
      const row = y * L;
      for (let x = 0; x < L; x++) {
        const i = row + x;
        const t = th[i];
        const xr = row + ((x + 1) % L);
        const xl = row + ((x + L - 1) % L);
        f[i] = Math.sin(th[xr] - t) + Math.sin(th[xl] - t) + Math.sin(th[yu + x] - t) + Math.sin(th[yd + x] - t);
      }
    }
    const amp = Math.sqrt(2 * Math.max(0, T) * dt);
    for (let i = 0; i < th.length; i++) {
      let t = th[i] + dt * f[i] + amp * this.rng.normal();
      if (t > Math.PI) t -= TWO_PI;
      else if (t < -Math.PI) t += TWO_PI;
      th[i] = t;
    }
  }
  /** Energy per site, −J Σ cos(θ_i − θ_j) / N over bonds. */
  energy(): number {
    const L = this.L;
    const th = this.theta;
    let e = 0;
    for (let y = 0; y < L; y++) {
      for (let x = 0; x < L; x++) {
        const t = th[y * L + x];
        e -= Math.cos(th[y * L + ((x + 1) % L)] - t) + Math.cos(th[((y + 1) % L) * L + x] - t);
      }
    }
    return e / (L * L);
  }
}

export interface VortexCount {
  plus: number;
  minus: number;
  /** Sum of all windings. Zero on a periodic lattice. */
  net: number;
}

/**
 * Count vortices by the winding of θ around each plaquette. The plaquette with
 * lower-left corner (x, y) gets charge q = Σ wrap(Δθ) / 2π, an integer.
 * If `charges` is given, it receives q for each plaquette (index y·L + x).
 * With periodic = false only the (L−1)² interior plaquettes are checked.
 */
export function countVortices(theta: Float64Array, L: number, periodic = true, charges?: Int8Array): VortexCount {
  let plus = 0;
  let minus = 0;
  let net = 0;
  const n = periodic ? L : L - 1;
  for (let y = 0; y < n; y++) {
    const y1 = (y + 1) % L;
    for (let x = 0; x < n; x++) {
      const x1 = (x + 1) % L;
      const a = theta[y * L + x];
      const b = theta[y * L + x1];
      const c = theta[y1 * L + x1];
      const d = theta[y1 * L + x];
      const w = wrapAngle(b - a) + wrapAngle(c - b) + wrapAngle(d - c) + wrapAngle(a - d);
      const q = Math.round(w / TWO_PI);
      if (charges) charges[y * L + x] = q;
      if (q > 0) plus += q;
      else if (q < 0) minus -= q;
      net += q;
    }
  }
  return { plus, minus, net };
}
