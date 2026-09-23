// Circular restricted three-body problem (CR3BP) in the rotating frame.
// Units: the primaries are 1 apart, their total mass is 1, G = 1, so the
// frame turns at angular speed 1 and one orbit of the primaries takes 2π.
// The heavy primary (mass 1 − μ) sits at (−μ, 0), the light one (mass μ) at (1 − μ, 0).
// Pure math: no DOM, no Three.js.

/** Routh's critical mass ratio: L4 and L5 are linearly stable only for μ below it. */
export const ROUTH_MU = (1 - Math.sqrt(23 / 27)) / 2;

/** One orbital period of the primaries in these units. */
export const PERIOD = 2 * Math.PI;

export type LName = 'L1' | 'L2' | 'L3' | 'L4' | 'L5';
export const L_NAMES: LName[] = ['L1', 'L2', 'L3', 'L4', 'L5'];

/** Particle state [x, y, vx, vy] in the rotating frame. */
export type State = Float64Array;

/** Effective potential Ω = (x² + y²)/2 + (1 − μ)/r1 + μ/r2. */
export function omega(mu: number, x: number, y: number): number {
  const r1 = Math.hypot(x + mu, y);
  const r2 = Math.hypot(x - 1 + mu, y);
  return 0.5 * (x * x + y * y) + (1 - mu) / r1 + mu / r2;
}

/** Gradient of Ω, written into out[0], out[1]. */
export function gradOmega(mu: number, x: number, y: number, out: Float64Array | number[]): void {
  const dx1 = x + mu;
  const dx2 = x - 1 + mu;
  const r1s = dx1 * dx1 + y * y;
  const r2s = dx2 * dx2 + y * y;
  const a = (1 - mu) / (r1s * Math.sqrt(r1s));
  const b = mu / (r2s * Math.sqrt(r2s));
  out[0] = x - a * dx1 - b * dx2;
  out[1] = y - a * y - b * y;
}

/** Second derivatives of Ω: [Ωxx, Ωyy, Ωxy]. */
export function hessOmega(mu: number, x: number, y: number): [number, number, number] {
  const dx1 = x + mu;
  const dx2 = x - 1 + mu;
  const r1s = dx1 * dx1 + y * y;
  const r2s = dx2 * dx2 + y * y;
  const r13 = r1s * Math.sqrt(r1s);
  const r23 = r2s * Math.sqrt(r2s);
  const r15 = r13 * r1s;
  const r25 = r23 * r2s;
  const m1 = 1 - mu;
  const oxx = 1 - m1 / r13 - mu / r23 + (3 * m1 * dx1 * dx1) / r15 + (3 * mu * dx2 * dx2) / r25;
  const oyy = 1 - m1 / r13 - mu / r23 + (3 * m1 * y * y) / r15 + (3 * mu * y * y) / r25;
  const oxy = (3 * m1 * dx1 * y) / r15 + (3 * mu * dx2 * y) / r25;
  return [oxx, oyy, oxy];
}

/** Jacobi constant C = 2Ω − v². Conserved along every orbit in the rotating frame. */
export function jacobi(mu: number, s: ArrayLike<number>): number {
  return 2 * omega(mu, s[0], s[1]) - (s[2] * s[2] + s[3] * s[3]);
}

/** ∂Ω/∂x on the x axis. Its zeros are the collinear points L1, L2, L3. */
function omegaXAxis(mu: number, x: number): number {
  const d1 = x + mu;
  const d2 = x - 1 + mu;
  return x - ((1 - mu) * d1) / Math.abs(d1 * d1 * d1) - (mu * d2) / Math.abs(d2 * d2 * d2);
}

/** Bisection then polish. f changes sign on (a, b) and is continuous there. */
function root(mu: number, a: number, b: number): number {
  let fa = omegaXAxis(mu, a);
  for (let i = 0; i < 200; i++) {
    const m = 0.5 * (a + b);
    const fm = omegaXAxis(mu, m);
    if (fm === 0 || b - a < 1e-15) return m;
    if (Math.sign(fm) === Math.sign(fa)) {
      a = m;
      fa = fm;
    } else {
      b = m;
    }
  }
  return 0.5 * (a + b);
}

/** Positions of the five Lagrange points for mass ratio μ (0 < μ ≤ 0.5). */
export function lagrangePoints(mu: number): Record<LName, [number, number]> {
  const eps = 1e-12;
  const x1 = root(mu, -mu + eps, 1 - mu - eps);
  const x2 = root(mu, 1 - mu + eps, 3);
  const x3 = root(mu, -3, -mu - eps);
  const h = Math.sqrt(3) / 2;
  return {
    L1: [x1, 0],
    L2: [x2, 0],
    L3: [x3, 0],
    L4: [0.5 - mu, h],
    L5: [0.5 - mu, -h],
  };
}

/**
 * Linearised motion about an equilibrium: λ⁴ + bλ² + c = 0 with
 * b = 4 − Ωxx − Ωyy and c = ΩxxΩyy − Ωxy². Stable (pure imaginary λ) iff
 * b > 0, c > 0 and b² − 4c ≥ 0. growth is the largest real part of λ.
 */
export function linearStability(mu: number, x: number, y: number): { b: number; c: number; disc: number; stable: boolean; growth: number } {
  const [oxx, oyy, oxy] = hessOmega(mu, x, y);
  const b = 4 - oxx - oyy;
  const c = oxx * oyy - oxy * oxy;
  const disc = b * b - 4 * c;
  const stable = b > 0 && c > 0 && disc >= 0;
  let growth = 0;
  if (disc >= 0) {
    // Real roots in λ² = z.
    const z1 = (-b + Math.sqrt(disc)) / 2;
    const z2 = (-b - Math.sqrt(disc)) / 2;
    growth = Math.sqrt(Math.max(0, z1, z2));
  } else {
    // Complex λ²: λ = ±(p ± iq). Re λ = sqrt((|z| + Re z) / 2).
    const re = -b / 2;
    const im = Math.sqrt(-disc) / 2;
    const mod = Math.hypot(re, im);
    growth = Math.sqrt((mod + re) / 2);
  }
  return { b, c, disc, stable, growth };
}

/** Right-hand side: ẍ = 2ẏ + Ωx, ÿ = −2ẋ + Ωy (Coriolis plus effective gravity). */
const g = new Float64Array(2);
export function deriv(mu: number, s: ArrayLike<number>, out: Float64Array): void {
  gradOmega(mu, s[0], s[1], g);
  out[0] = s[2];
  out[1] = s[3];
  out[2] = 2 * s[3] + g[0];
  out[3] = -2 * s[2] + g[1];
}

const k1 = new Float64Array(4);
const k2 = new Float64Array(4);
const k3 = new Float64Array(4);
const k4 = new Float64Array(4);
const tmp = new Float64Array(4);

/** One classical RK4 step of size h, in place. No allocation. */
export function rk4Step(mu: number, s: State, h: number): void {
  deriv(mu, s, k1);
  for (let i = 0; i < 4; i++) tmp[i] = s[i] + 0.5 * h * k1[i];
  deriv(mu, tmp, k2);
  for (let i = 0; i < 4; i++) tmp[i] = s[i] + 0.5 * h * k2[i];
  deriv(mu, tmp, k3);
  for (let i = 0; i < 4; i++) tmp[i] = s[i] + h * k3[i];
  deriv(mu, tmp, k4);
  for (let i = 0; i < 4; i++) s[i] += (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
}

/** Distance to the nearer primary. */
export function nearestPrimary(mu: number, x: number, y: number): number {
  return Math.min(Math.hypot(x + mu, y), Math.hypot(x - 1 + mu, y));
}

/** Default largest step. About 6300 steps per orbit of the primaries. */
export const H_MAX = 1e-3;

/**
 * Step size for the current position: H_MAX far from the masses, smaller on a close pass
 * so the step stays a small fraction of the local free-fall time.
 */
export function stepFor(mu: number, s: ArrayLike<number>, hmax = H_MAX): number {
  const r = nearestPrimary(mu, s[0], s[1]);
  return Math.min(hmax, 0.02 * r * Math.sqrt(r));
}

/** Initial state: at point (x, y) with rotating-frame velocity (vx, vy). */
export function makeState(x: number, y: number, vx: number, vy: number): State {
  return Float64Array.of(x, y, vx, vy);
}

/**
 * Launch state from a Lagrange point: shifted by dr along the outward radial
 * direction from the barycentre, and kicked by dv along the direction of orbital
 * motion (counter-clockwise tangent), both measured in the rotating frame.
 */
export function launchState(mu: number, which: LName, dr: number, dv: number, out: State): void {
  const [lx, ly] = lagrangePoints(mu)[which];
  const r = Math.hypot(lx, ly);
  const ux = lx / r;
  const uy = ly / r;
  out[0] = lx + dr * ux;
  out[1] = ly + dr * uy;
  // Tangent (−uy, ux) points along the direction the frame turns.
  out[2] = -dv * uy;
  out[3] = dv * ux;
}

/** Hill-sphere estimate of the L1 and L2 distance from the small mass, valid for μ ≪ 1. */
export function hillRadius(mu: number): number {
  return Math.cbrt(mu / 3);
}

/**
 * Marching squares for the level set f = level on a regular grid.
 * f has (nx+1)·(ny+1) samples, row-major in x. Segment endpoints go into out as
 * (x0, y0, x1, y1) in grid coordinates scaled to [x0, x1] × [y0, y1].
 * Returns the number of segments written (capped by out.length / 4).
 */
export function contourSegments(
  f: Float64Array | Float32Array,
  nx: number,
  ny: number,
  level: number,
  xmin: number,
  xmax: number,
  ymin: number,
  ymax: number,
  out: Float32Array,
): number {
  const dx = (xmax - xmin) / nx;
  const dy = (ymax - ymin) / ny;
  const cap = Math.floor(out.length / 4);
  let n = 0;
  const W = nx + 1;
  const push = (ax: number, ay: number, bx: number, by: number) => {
    if (n >= cap) return;
    const k = n * 4;
    out[k] = ax;
    out[k + 1] = ay;
    out[k + 2] = bx;
    out[k + 3] = by;
    n++;
  };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = f[j * W + i] - level; // (i, j)
      const b = f[j * W + i + 1] - level; // (i+1, j)
      const c = f[(j + 1) * W + i + 1] - level; // (i+1, j+1)
      const d = f[(j + 1) * W + i] - level; // (i, j+1)
      const idx = (a > 0 ? 1 : 0) | (b > 0 ? 2 : 0) | (c > 0 ? 4 : 0) | (d > 0 ? 8 : 0);
      if (idx === 0 || idx === 15) continue;
      const x0 = xmin + i * dx;
      const y0 = ymin + j * dy;
      // Edge crossings: bottom (a-b), right (b-c), top (d-c), left (a-d).
      const bx_ = x0 + (a / (a - b)) * dx;
      const ry = y0 + (b / (b - c)) * dy;
      const tx = x0 + (d / (d - c)) * dx;
      const ly = y0 + (a / (a - d)) * dy;
      const x1 = x0 + dx;
      const y1 = y0 + dy;
      switch (idx) {
        case 1: case 14: push(bx_, y0, x0, ly); break;
        case 2: case 13: push(bx_, y0, x1, ry); break;
        case 3: case 12: push(x0, ly, x1, ry); break;
        case 4: case 11: push(x1, ry, tx, y1); break;
        case 6: case 9: push(bx_, y0, tx, y1); break;
        case 7: case 8: push(x0, ly, tx, y1); break;
        case 5: push(bx_, y0, x0, ly); push(x1, ry, tx, y1); break;
        case 10: push(bx_, y0, x1, ry); push(x0, ly, tx, y1); break;
      }
    }
  }
  return n;
}

/**
 * Classifies a trajectory launched from a Lagrange point, one step at a time.
 * Angles are measured about the barycentre with the light mass at 0°.
 * - tadpole: launched from L4 or L5, never crossed the x axis, stayed in the ring 0.7 < r < 1.3.
 * - horseshoe: stayed in the ring, never crossed the x axis on the planet side, and switched
 *   between the upper (y > 0.3) and lower (y < −0.3) half-planes twice (once from L3).
 */
export class OrbitTracker {
  from: LName = 'L4';
  homeX = 0;
  homeY = 0;
  dist = 0;
  maxDist = 0;
  rMin = Infinity;
  rMax = 0;
  thMin = Infinity;
  thMax = -Infinity;
  planetPass = false;
  sideKept = true;
  sideChanges = 0;
  horseshoe = false;
  /** Time up to which the orbit has been a clean tadpole. */
  tadpoleT = 0;
  private prevY = 0;
  private lastSide = 0;

  reset(mu: number, from: LName, s: ArrayLike<number>): void {
    const p = lagrangePoints(mu)[from];
    this.from = from;
    this.homeX = p[0];
    this.homeY = p[1];
    this.dist = this.maxDist = Math.hypot(s[0] - p[0], s[1] - p[1]);
    this.rMin = this.rMax = Math.hypot(s[0], s[1]);
    this.thMin = this.thMax = Math.atan2(s[1], s[0]);
    this.planetPass = false;
    this.sideKept = true;
    this.sideChanges = 0;
    this.horseshoe = false;
    this.tadpoleT = 0;
    this.prevY = s[1];
    this.lastSide = s[1] > 0.3 ? 1 : s[1] < -0.3 ? -1 : 0;
  }

  get triangular(): boolean {
    return this.from === 'L4' || this.from === 'L5';
  }

  get inRing(): boolean {
    return this.rMin > 0.7 && this.rMax < 1.3;
  }

  /** Swing in degrees of the angle about the barycentre since launch. */
  get swing(): number {
    return ((this.thMax - this.thMin) * 180) / Math.PI;
  }

  update(s: ArrayLike<number>, t: number): void {
    const x = s[0];
    const y = s[1];
    const r = Math.hypot(x, y);
    if (r < this.rMin) this.rMin = r;
    if (r > this.rMax) this.rMax = r;
    const th = Math.atan2(y, x);
    if (th < this.thMin) this.thMin = th;
    if (th > this.thMax) this.thMax = th;
    if (y * this.prevY < 0) {
      if (x > 0) this.planetPass = true;
      this.sideKept = false;
    }
    if (y !== 0) this.prevY = y;
    const side = y > 0.3 ? 1 : y < -0.3 ? -1 : 0;
    if (side !== 0 && side !== this.lastSide) {
      if (this.lastSide !== 0) this.sideChanges++;
      this.lastSide = side;
    }
    this.dist = Math.hypot(x - this.homeX, y - this.homeY);
    if (this.dist > this.maxDist) this.maxDist = this.dist;
    const ring = this.inRing;
    if (!this.horseshoe && !this.planetPass && ring && this.sideChanges >= (this.from === 'L3' ? 1 : 2)) this.horseshoe = true;
    if (this.sideKept && ring && this.triangular) this.tadpoleT = t;
  }
}
