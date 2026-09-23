// Toy models for the string landscape. Pure math, no DOM.
// Everything here is in dimensionless "toy units". Nothing is a real string compactification.

// ---------------------------------------------------------------------------
// Random numbers
// ---------------------------------------------------------------------------

/** Small deterministic PRNG (mulberry32). Returns numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Toy landscape V(φ1, φ2): a soft bowl plus a sum of Gaussian wells
// ---------------------------------------------------------------------------

export interface Well {
  cx: number;
  cy: number;
  /** Depth (positive number, the well lowers V by up to A). */
  A: number;
  /** Width. */
  s: number;
}

export interface Landscape {
  wells: Well[];
  /** Constant offset. */
  v0: number;
  /** Bowl curvature: V gains bowl * (x² + y²). Keeps every minimum inside the box. */
  bowl: number;
  /** Half-width of the square field-space box [-L, L]². */
  L: number;
}

export const FIELD_L = 5;

/** Build a random landscape with n Gaussian wells. Deterministic in the seed. */
export function makeLandscape(seed: number, n: number): Landscape {
  const rnd = mulberry32(seed * 7919 + 17);
  const wells: Well[] = [];
  let guard = 0;
  while (wells.length < n && guard++ < 5000) {
    const r = 3.5 * Math.sqrt(rnd());
    const a = 2 * Math.PI * rnd();
    const cx = r * Math.cos(a);
    const cy = r * Math.sin(a);
    // Keep wells from sitting right on top of each other, so most of them make a separate valley.
    const minGap = guard < 2000 ? 1.35 : 0.7;
    if (wells.some((w) => Math.hypot(w.cx - cx, w.cy - cy) < minGap)) continue;
    wells.push({ cx, cy, A: 0.55 + 1.05 * rnd(), s: 0.42 + 0.3 * rnd() });
  }
  return { wells, v0: 0.72, bowl: 0.015, L: FIELD_L };
}

/** Potential V(x, y). */
export function potential(land: Landscape, x: number, y: number): number {
  let v = land.v0 + land.bowl * (x * x + y * y);
  for (const w of land.wells) {
    const dx = x - w.cx;
    const dy = y - w.cy;
    v -= w.A * Math.exp(-(dx * dx + dy * dy) / (2 * w.s * w.s));
  }
  return v;
}

/** Gradient and Hessian of V at (x, y), written into out = [gx, gy, hxx, hxy, hyy]. */
export function derivs(land: Landscape, x: number, y: number, out: Float64Array | number[] = new Float64Array(5)): Float64Array | number[] {
  let gx = 2 * land.bowl * x;
  let gy = 2 * land.bowl * y;
  let hxx = 2 * land.bowl;
  let hyy = 2 * land.bowl;
  let hxy = 0;
  for (const w of land.wells) {
    const dx = x - w.cx;
    const dy = y - w.cy;
    const s2 = w.s * w.s;
    const e = w.A * Math.exp(-(dx * dx + dy * dy) / (2 * s2));
    // V_k = -e,  ∂x V_k = e dx / s²,  ∂xx V_k = e (1/s² - dx²/s⁴)
    gx += (e * dx) / s2;
    gy += (e * dy) / s2;
    hxx += e * (1 / s2 - (dx * dx) / (s2 * s2));
    hyy += e * (1 / s2 - (dy * dy) / (s2 * s2));
    hxy += (-e * dx * dy) / (s2 * s2);
  }
  out[0] = gx;
  out[1] = gy;
  out[2] = hxx;
  out[3] = hxy;
  out[4] = hyy;
  return out;
}

export interface Minimum {
  x: number;
  y: number;
  V: number;
  /** |∇V| at the point after polishing. */
  grad: number;
  /** Hessian eigenvalues, lo ≤ hi. */
  eigLo: number;
  eigHi: number;
}

function eig2(a: number, b: number, c: number): [number, number] {
  const m = 0.5 * (a + c);
  const d = Math.sqrt(0.25 * (a - c) * (a - c) + b * b);
  return [m - d, m + d];
}

/**
 * Find all local minima of V inside the box. Gradient descent with backtracking from a grid
 * of starting points, then Newton polishing. Only points with |∇V| tiny and a positive
 * definite Hessian are kept. Sorted by V, highest first.
 */
export function findMinima(land: Landscape, grid = 22): Minimum[] {
  const L = land.L;
  const d = new Float64Array(5);
  const found: Minimum[] = [];
  for (let i = 0; i < grid; i++) {
    for (let j = 0; j < grid; j++) {
      let x = -L + (2 * L * (i + 0.5)) / grid;
      let y = -L + (2 * L * (j + 0.5)) / grid;
      let v = potential(land, x, y);
      // Descent: a Newton step where the Hessian is positive definite and the step lowers V,
      // otherwise a gradient step with Armijo backtracking.
      for (let it = 0; it < 300; it++) {
        derivs(land, x, y, d);
        const g2 = d[0] * d[0] + d[1] * d[1];
        if (g2 < 1e-16) break;
        const det = d[2] * d[4] - d[3] * d[3];
        if (d[2] > 0 && det > 0) {
          const sx = (d[4] * d[0] - d[3] * d[1]) / det;
          const sy = (-d[3] * d[0] + d[2] * d[1]) / det;
          if (sx * sx + sy * sy < 1) {
            const nvN = potential(land, x - sx, y - sy);
            if (nvN <= v) {
              x -= sx;
              y -= sy;
              v = nvN;
              continue;
            }
          }
        }
        let step = 1;
        let nx = x - step * d[0];
        let ny = y - step * d[1];
        let nv = potential(land, nx, ny);
        while (nv > v - 0.3 * step * g2 && step > 1e-8) {
          step *= 0.5;
          nx = x - step * d[0];
          ny = y - step * d[1];
          nv = potential(land, nx, ny);
        }
        x = nx;
        y = ny;
        v = nv;
      }
      // Newton polish (only where the Hessian is positive definite).
      for (let it = 0; it < 30; it++) {
        derivs(land, x, y, d);
        const [lo] = eig2(d[2], d[3], d[4]);
        if (lo <= 0) break;
        const det = d[2] * d[4] - d[3] * d[3];
        const sx = (d[4] * d[0] - d[3] * d[1]) / det;
        const sy = (-d[3] * d[0] + d[2] * d[1]) / det;
        x -= sx;
        y -= sy;
        if (sx * sx + sy * sy < 1e-30) break;
      }
      if (Math.abs(x) > L - 0.05 || Math.abs(y) > L - 0.05) continue;
      derivs(land, x, y, d);
      const grad = Math.hypot(d[0], d[1]);
      const [lo, hi] = eig2(d[2], d[3], d[4]);
      if (grad > 1e-9 || lo <= 1e-6) continue;
      if (found.some((m) => Math.hypot(m.x - x, m.y - y) < 1e-3)) continue;
      found.push({ x, y, V: potential(land, x, y), grad, eigLo: lo, eigHi: hi });
    }
  }
  found.sort((a, b) => b.V - a.V);
  return found;
}

/** Index of the nearest minimum (in field space) with strictly lower V, or -1 if none. */
export function nearestLower(mins: Minimum[], k: number): number {
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < mins.length; i++) {
    if (mins[i].V >= mins[k].V - 1e-9) continue;
    const dd = Math.hypot(mins[i].x - mins[k].x, mins[i].y - mins[k].y);
    if (dd < bd) {
      bd = dd;
      best = i;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Thin-wall tunnelling (Coleman 1977, gravity switched off)
// ---------------------------------------------------------------------------

/** Euclidean action of an O(4) bubble of radius R: B(R) = -½π² ε R⁴ + 2π² σ R³. */
export function bubbleAction(R: number, sigma: number, eps: number): number {
  return -0.5 * Math.PI * Math.PI * eps * R ** 4 + 2 * Math.PI * Math.PI * sigma * R ** 3;
}

/** Critical bubble radius R₀ = 3σ/ε, where B(R) is stationary. */
export function criticalRadius(sigma: number, eps: number): number {
  return (3 * sigma) / eps;
}

/** Thin-wall bounce action B = 27π²σ⁴ / (2ε³). */
export function thinWallB(sigma: number, eps: number): number {
  return (27 * Math.PI * Math.PI * sigma ** 4) / (2 * eps ** 3);
}

/** log10 of the rate per unit volume, Γ ≈ e^{-B}, with the prefactor set to 1 toy unit. */
export function log10Rate(B: number): number {
  return -B / Math.LN10;
}

/** Wall radius after nucleation (flat space, c = 1): the hyperbola r² − t² = R₀². */
export function wallRadius(R0: number, t: number): number {
  return Math.sqrt(R0 * R0 + t * t);
}

/** Wall speed dr/dt = t / √(R₀² + t²). Approaches 1 (the speed of light). */
export function wallSpeed(R0: number, t: number): number {
  return t / Math.sqrt(R0 * R0 + t * t);
}

// ---------------------------------------------------------------------------
// Bousso–Polchinski flux discretuum
// ---------------------------------------------------------------------------

export interface FluxParams {
  /** Number of fluxes J. */
  J: number;
  /** Charges q_i, length ≥ J. */
  q: number[];
  /** Bare cosmological constant Λ₀ (negative). */
  lam0: number;
  /** Each n_i runs over -N..N. */
  N: number;
}

/** Default toy Λ₀. */
export const LAMBDA0 = -2;
/** Flux range n_i ∈ {-2, …, 2}. */
export const FLUX_N = 2;
/** "Near zero" window used for the fraction. */
export const NEAR_ZERO = 0.1;

/** Charges q_i = scale × c_i with c_i spread over [0.7, 1.3], fixed by the seed so they are incommensurate. */
export function makeCharges(seed: number, scale: number, count = 8): number[] {
  const rnd = mulberry32(seed * 104729 + 3);
  const q: number[] = [];
  for (let i = 0; i < count; i++) q.push(scale * (0.7 + 0.6 * rnd()));
  return q;
}

/** Λ(n) = Λ₀ + ½ Σ n_i² q_i². */
export function fluxLambda(n: ArrayLike<number>, p: FluxParams): number {
  let s = 0;
  for (let i = 0; i < p.J; i++) s += n[i] * n[i] * p.q[i] * p.q[i];
  return p.lam0 + 0.5 * s;
}

export function vacuumCount(p: FluxParams): number {
  return (2 * p.N + 1) ** p.J;
}

/**
 * Visit every flux vector n ∈ {-N..N}^J in odometer order.
 * The callback gets the running index, the vector (reused buffer) and Λ.
 */
export function forEachVacuum(p: FluxParams, fn: (idx: number, n: Int8Array, lam: number) => void): void {
  const n = new Int8Array(p.J).fill(-p.N);
  const total = vacuumCount(p);
  for (let idx = 0; idx < total; idx++) {
    fn(idx, n, fluxLambda(n, p));
    for (let i = 0; i < p.J; i++) {
      if (n[i] < p.N) {
        n[i]++;
        break;
      }
      n[i] = -p.N;
    }
  }
}

export interface Histogram {
  lo: number;
  hi: number;
  counts: number[];
}

export function histRange(p: FluxParams): [number, number] {
  let top = 0;
  for (let i = 0; i < p.J; i++) top += 0.5 * p.N * p.N * p.q[i] * p.q[i];
  return [p.lam0, p.lam0 + top];
}

function binOf(lam: number, lo: number, hi: number, bins: number): number {
  const b = Math.floor(((lam - lo) / (hi - lo)) * bins);
  return Math.max(0, Math.min(bins - 1, b));
}

/** Histogram of Λ by brute force over all (2N+1)^J flux vectors. */
export function histogramBrute(p: FluxParams, bins: number, lo: number, hi: number): Histogram {
  const counts = new Array<number>(bins).fill(0);
  forEachVacuum(p, (_i, _n, lam) => counts[binOf(lam, lo, hi, bins)]++);
  return { lo, hi, counts };
}

/**
 * Same histogram, computed a different way: Λ depends only on k_i = n_i² ∈ {0, 1, …, N²}.
 * k = 0 comes from one n, every other k from two (±n). Enumerate the (N+1)^J choices of k
 * and weight each by 2^(number of non-zero k).
 */
export function histogramFast(p: FluxParams, bins: number, lo: number, hi: number): Histogram {
  const counts = new Array<number>(bins).fill(0);
  const m = new Int8Array(p.J);
  const total = (p.N + 1) ** p.J;
  for (let idx = 0; idx < total; idx++) {
    let s = 0;
    let w = 1;
    for (let i = 0; i < p.J; i++) {
      s += m[i] * m[i] * p.q[i] * p.q[i];
      if (m[i] !== 0) w *= 2;
    }
    counts[binOf(p.lam0 + 0.5 * s, lo, hi, bins)] += w;
    for (let i = 0; i < p.J; i++) {
      if (m[i] < p.N) {
        m[i]++;
        break;
      }
      m[i] = 0;
    }
  }
  return { lo, hi, counts };
}

/** Number of vacua with |Λ| < eps, via the weighted k enumeration. */
export function countNearZero(p: FluxParams, eps: number): number {
  const m = new Int8Array(p.J);
  const total = (p.N + 1) ** p.J;
  let c = 0;
  for (let idx = 0; idx < total; idx++) {
    let s = 0;
    let w = 1;
    for (let i = 0; i < p.J; i++) {
      s += m[i] * m[i] * p.q[i] * p.q[i];
      if (m[i] !== 0) w *= 2;
    }
    if (Math.abs(p.lam0 + 0.5 * s) < eps) c += w;
    for (let i = 0; i < p.J; i++) {
      if (m[i] < p.N) {
        m[i]++;
        break;
      }
      m[i] = 0;
    }
  }
  return c;
}

export function fractionNearZero(p: FluxParams, eps: number): number {
  return countNearZero(p, eps) / vacuumCount(p);
}

/** Radius of the Λ = 0 shell in flux space: Σ n_i² q_i² = 2|Λ₀|. */
export function shellRadius(lam0: number): number {
  return Math.sqrt(-2 * lam0);
}

/**
 * Fixed unit directions for projecting a J-dimensional flux vector into 3D.
 * The first three are the x, y, z axes, so J ≤ 3 is drawn exactly.
 */
export function projectionAxes(count = 8): [number, number, number][] {
  const axes: [number, number, number][] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 3; i < count; i++) {
    const k = i - 3;
    const y = 1 - (2 * (k + 0.5)) / (count - 3);
    const r = Math.sqrt(1 - y * y);
    const th = 0.9 + k * golden;
    axes.push([r * Math.cos(th), y, r * Math.sin(th)]);
  }
  return axes;
}
