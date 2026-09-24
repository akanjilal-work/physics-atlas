// Least action, Fermat's principle and a toy Feynman path sum. Pure math, no DOM.
//
// Projectile model: mass m in uniform gravity g, launched at t = 0 from height 0
// and landing at height 0 at t = T, moving sideways at a constant speed vx.
// The height y(t) carries all the interesting physics. The sideways motion only
// adds the constant m vx^2 T / 2 to the action.

export const G = 9.81; // m/s^2
export const M = 1; // kg
export const T_FLIGHT = 1.4; // s
export const X_RANGE = 6; // m
export const VX = X_RANGE / T_FLIGHT; // m/s

/** Classical height at time t: y = (g/2) t (T - t). */
export function classicalY(t: number, T = T_FLIGHT, g = G): number {
  return 0.5 * g * t * (T - t);
}

/** Classical vertical speed at time t. */
export function classicalVy(t: number, T = T_FLIGHT, g = G): number {
  return g * (0.5 * T - t);
}

/** Continuous action of the classical path: S = m vx^2 T / 2 - m g^2 T^3 / 24. */
export function classicalAction(m = M, vx = VX, g = G, T = T_FLIGHT): number {
  return 0.5 * m * vx * vx * T - (m * g * g * T * T * T) / 24;
}

/**
 * Discretised action of a path given by heights ys at equally spaced times
 * t_i = i dt. Kinetic energy uses the finite difference on each segment and
 * the potential m g y uses the trapezoid rule, so
 *   S = sum_i [ m/2 ((y_{i+1}-y_i)/dt)^2 + m/2 vx^2 - m g (y_i + y_{i+1})/2 ] dt.
 */
export function discreteAction(ys: ArrayLike<number>, dt: number, m = M, g = G, vx = VX): number {
  let s = 0;
  for (let i = 0; i + 1 < ys.length; i++) {
    const v = (ys[i + 1] - ys[i]) / dt;
    s += (0.5 * m * (v * v + vx * vx) - m * g * 0.5 * (ys[i] + ys[i + 1])) * dt;
  }
  return s;
}

/**
 * Gradient of the discrete action with respect to the interior heights.
 * dS/dy_i = m (2 y_i - y_{i-1} - y_{i+1}) / dt - m g dt. Endpoints are fixed (gradient 0).
 * Returns the Euclidean norm of the gradient.
 */
export function actionGradient(ys: ArrayLike<number>, dt: number, out: Float64Array, m = M, g = G): number {
  const n = ys.length;
  out[0] = 0;
  out[n - 1] = 0;
  let norm = 0;
  for (let i = 1; i < n - 1; i++) {
    const gi = (m * (2 * ys[i] - ys[i - 1] - ys[i + 1])) / dt - m * g * dt;
    out[i] = gi;
    norm += gi * gi;
  }
  return Math.sqrt(norm);
}

/** Largest stable gradient-descent step for the discrete action (Hessian norm < 4m/dt). */
export function safeStep(dt: number, m = M): number {
  return (0.45 * dt) / m;
}

/** One plain gradient-descent step in place. Returns the gradient norm before the step. */
export function descendStep(ys: Float64Array, dt: number, grad: Float64Array, eta: number, m = M, g = G): number {
  const norm = actionGradient(ys, dt, grad, m, g);
  for (let i = 1; i < ys.length - 1; i++) ys[i] -= eta * grad[i];
  return norm;
}

/**
 * Natural cubic spline through equally spaced knots ks (first and last are the
 * fixed endpoints), sampled onto out.length equally spaced nodes over the same span.
 * scratch must hold at least 3 * ks.length numbers.
 */
export function splineSample(ks: ArrayLike<number>, out: Float64Array, scratch: Float64Array): void {
  const n = ks.length;
  const h = 1 / (n - 1);
  const M2 = scratch.subarray(0, n); // second derivatives
  const c = scratch.subarray(n, 2 * n);
  const d = scratch.subarray(2 * n, 3 * n);
  // Solve the tridiagonal system for interior second derivatives (Thomas algorithm).
  M2[0] = 0;
  M2[n - 1] = 0;
  if (n > 2) {
    for (let i = 1; i < n - 1; i++) {
      const rhs = (6 / (h * h)) * (ks[i + 1] - 2 * ks[i] + ks[i - 1]);
      // a = 1, b = 4, c = 1
      if (i === 1) {
        c[i] = 1 / 4;
        d[i] = rhs / 4;
      } else {
        const den = 4 - c[i - 1];
        c[i] = 1 / den;
        d[i] = (rhs - d[i - 1]) / den;
      }
    }
    M2[n - 2] = d[n - 2];
    for (let i = n - 3; i >= 1; i--) M2[i] = d[i] - c[i] * M2[i + 1];
  }
  const N = out.length;
  for (let j = 0; j < N; j++) {
    const u = j / (N - 1);
    let k = Math.min(n - 2, Math.floor(u / h));
    if (k < 0) k = 0;
    const a = (k + 1) * h - u;
    const b = u - k * h;
    out[j] =
      (M2[k] * a * a * a + M2[k + 1] * b * b * b) / (6 * h) +
      (ks[k] / h - (M2[k] * h) / 6) * a +
      (ks[k + 1] / h - (M2[k + 1] * h) / 6) * b;
  }
}

// ---------------------------------------------------------------------------
// Fermat's principle: light from A (in medium 1, y > 0) to B (in medium 2, y < 0)
// crossing the flat boundary y = 0 at x.

export const C_LIGHT = 299792458; // m/s

export interface FermatGeom {
  xa: number;
  ya: number;
  xb: number;
  yb: number;
  n1: number;
  n2: number;
}

/** Travel time in seconds for the broken ray A -> (x, 0) -> B. */
export function travelTime(x: number, g: FermatGeom): number {
  const l1 = Math.hypot(x - g.xa, g.ya);
  const l2 = Math.hypot(g.xb - x, g.yb);
  return (g.n1 * l1 + g.n2 * l2) / C_LIGHT;
}

/** d(travel time)/dx. Strictly increasing in x, so the minimum is unique. */
export function travelTimeSlope(x: number, g: FermatGeom): number {
  const l1 = Math.hypot(x - g.xa, g.ya);
  const l2 = Math.hypot(g.xb - x, g.yb);
  return (g.n1 * (x - g.xa)) / l1 / C_LIGHT - (g.n2 * (g.xb - x)) / l2 / C_LIGHT;
}

/** Crossing point of least time, found by bisection on the slope. */
export function fermatMinimum(g: FermatGeom): number {
  let lo = Math.min(g.xa, g.xb);
  let hi = Math.max(g.xa, g.xb);
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (travelTimeSlope(mid, g) > 0) hi = mid;
    else lo = mid;
  }
  return 0.5 * (lo + hi);
}

/** Angles of incidence and refraction (radians from the normal) for crossing x. */
export function rayAngles(x: number, g: FermatGeom): [number, number] {
  return [Math.atan2(Math.abs(x - g.xa), Math.abs(g.ya)), Math.atan2(Math.abs(g.xb - x), Math.abs(g.yb))];
}

/** Refraction angle that Snell's law predicts for incidence theta1. NaN beyond the critical angle. */
export function snellTheta2(theta1: number, n1: number, n2: number): number {
  const s = (n1 * Math.sin(theta1)) / n2;
  return Math.abs(s) > 1 ? NaN : Math.asin(s);
}

// ---------------------------------------------------------------------------
// Toy Feynman path sum. Each path is the classical projectile path plus a
// wiggle delta(t) in height y and sideways z that vanishes at both ends:
//   delta(t) = sum_k c_k sin(k pi t / T).
// Because the potential m g y is linear, the action splits exactly:
//   S[path] = S_cl + (m/2) \int |delta'(t)|^2 dt = S_cl + (m pi^2 / 4T) sum_k k^2 |c_k|^2.
// Paths are drawn so that sqrt(dS) is spread evenly (with random jitter) from 0 to
// sqrt(dSmax). The wiggle shapes are random.

export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(rnd: () => number): number {
  const u = Math.max(1e-12, rnd());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
}

export const MODES = 5;

export interface Ensemble {
  n: number;
  /** Mode amplitudes, n * MODES each, in metres. */
  cy: Float64Array;
  cz: Float64Array;
  /** Normalised distance from the classical path, sqrt(dS / dSmax), sorted ascending. */
  rho: Float64Array;
  /** Excess action S - S_cl of each path (J s). */
  dS: Float64Array;
}

/** Excess action of a wiggle with given mode amplitudes (exact). */
export function wiggleAction(cy: ArrayLike<number>, cz: ArrayLike<number>, off: number, K: number, m = M, T = T_FLIGHT): number {
  let s = 0;
  for (let k = 1; k <= K; k++) {
    const a = cy[off + k - 1];
    const b = cz[off + k - 1];
    s += k * k * (a * a + b * b);
  }
  return ((m * Math.PI * Math.PI) / (4 * T)) * s;
}

export function makeEnsemble(n: number, seed: number, dSmax: number, m = M, T = T_FLIGHT): Ensemble {
  const rnd = mulberry32(seed);
  const K = MODES;
  const cy = new Float64Array(n * K);
  const cz = new Float64Array(n * K);
  const rho = new Float64Array(n);
  const dS = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    rho[j] = (j + rnd()) / n;
    dS[j] = dSmax * rho[j] * rho[j];
    let norm = 0;
    for (let k = 1; k <= K; k++) {
      const a = gaussian(rnd) / k;
      const b = (0.8 * gaussian(rnd)) / k;
      cy[j * K + k - 1] = a;
      cz[j * K + k - 1] = b;
      norm += k * k * (a * a + b * b);
    }
    // Scale the shape so its excess action is exactly dS[j].
    const scale = Math.sqrt(dS[j] / (((m * Math.PI * Math.PI) / (4 * T)) * norm));
    for (let k = 0; k < K; k++) {
      cy[j * K + k] *= scale;
      cz[j * K + k] *= scale;
    }
  }
  return { n, cy, cz, rho, dS };
}

/** Wiggle of path j at time t, written into out[0] (y) and out[1] (z). */
export function wiggleAt(e: Ensemble, j: number, t: number, out: Float64Array, T = T_FLIGHT): void {
  let y = 0;
  let z = 0;
  for (let k = 1; k <= MODES; k++) {
    const s = Math.sin((k * Math.PI * t) / T);
    y += e.cy[j * MODES + k - 1] * s;
    z += e.cz[j * MODES + k - 1] * s;
  }
  out[0] = y;
  out[1] = z;
}

/**
 * Excess action accumulated from 0 to t along path j (exact up to the quadrature of the
 * kinetic integral): m vy_cl(t) delta_y(t) + (m/2) \int_0^t |delta'|^2.
 * The first term is the boundary term of the cross integral and vanishes at t = T.
 */
export function partialExcess(e: Ensemble, j: number, t: number, sub = 64, m = M, T = T_FLIGHT, g = G): number {
  let kin = 0;
  const h = t / sub;
  for (let i = 0; i < sub; i++) {
    const s = (i + 0.5) * h;
    let vy = 0;
    let vz = 0;
    for (let k = 1; k <= MODES; k++) {
      const w = (k * Math.PI) / T;
      const c = Math.cos(w * s) * w;
      vy += e.cy[j * MODES + k - 1] * c;
      vz += e.cz[j * MODES + k - 1] * c;
    }
    kin += (vy * vy + vz * vz) * h;
  }
  let dy = 0;
  for (let k = 1; k <= MODES; k++) dy += e.cy[j * MODES + k - 1] * Math.sin((k * Math.PI * t) / T);
  return m * classicalVy(t, T, g) * dy + 0.5 * m * kin;
}

/**
 * Cumulative phasor sum over paths in their stored order (closest first).
 * Writes partial sums into re/im (length n) and returns the index of the largest |partial sum|.
 */
export function phasorCumulative(dS: ArrayLike<number>, hbar: number, re: Float64Array, im: Float64Array): number {
  let x = 0;
  let y = 0;
  let best = 0;
  let bestI = 0;
  for (let j = 0; j < dS.length; j++) {
    const ph = dS[j] / hbar;
    x += Math.cos(ph);
    y += Math.sin(ph);
    re[j] = x;
    im[j] = y;
    const m2 = x * x + y * y;
    if (m2 > best) {
      best = m2;
      bestI = j;
    }
  }
  return bestI;
}

export interface PathSumStats {
  /** |sum e^{i dS/hbar}| / n. 1 means all paths in step. */
  coherence: number;
  /** rho of the path where the running sum is largest: beyond it, paths mostly cancel. */
  zone: number;
  /** Share of the final amplitude given by paths with rho < 2 * zone (projection). */
  nearShare: number;
  /** |sum over paths with rho > rhoCut| / |total sum|. */
  tail: number;
}

export function pathSumStats(e: Ensemble, hbar: number, re: Float64Array, im: Float64Array, rhoCut = 0.5): PathSumStats {
  const n = e.n;
  const bi = phasorCumulative(e.dS, hbar, re, im);
  const X = re[n - 1];
  const Y = im[n - 1];
  const A2 = Math.max(1e-30, X * X + Y * Y);
  const zone = e.rho[bi];
  let jNear = n - 1;
  for (let j = 0; j < n; j++) {
    if (e.rho[j] >= Math.min(1, 2 * zone)) {
      jNear = j;
      break;
    }
  }
  const nearShare = (re[jNear] * X + im[jNear] * Y) / A2;
  let jCut = 0;
  while (jCut < n && e.rho[jCut] < rhoCut) jCut++;
  const tx = X - (jCut > 0 ? re[jCut - 1] : 0);
  const ty = Y - (jCut > 0 ? im[jCut - 1] : 0);
  return { coherence: Math.sqrt(A2) / n, zone, nearShare, tail: Math.hypot(tx, ty) / Math.sqrt(A2) };
}

// ---------------------------------------------------------------------------
// Two slits as a path sum at fixed energy. Every path runs straight from the
// source (x = -L1, y = 0) to a point y_s inside a slit and straight on to the
// screen point (x = L2, y = yP). Its phase is k (l1 + l2) with k = 2 pi / lambda.

export interface SlitGeom {
  L1: number;
  L2: number;
  /** Centre-to-centre slit separation. */
  d: number;
  /** Slit width. */
  w: number;
  lambda: number;
}

/**
 * Amplitude through one slit centred at yc, summed over `samples` evenly spaced paths.
 * Written into out[0] (re) and out[1] (im). Each path carries weight 1/samples.
 */
export function slitAmplitude(yP: number, yc: number, g: SlitGeom, samples: number, out: Float64Array): void {
  const k = (2 * Math.PI) / g.lambda;
  let re = 0;
  let im = 0;
  for (let i = 0; i < samples; i++) {
    const ys = yc + ((i + 0.5) / samples - 0.5) * g.w;
    const l = Math.hypot(g.L1, ys) + Math.hypot(g.L2, yP - ys);
    const ph = k * l;
    re += Math.cos(ph);
    im += Math.sin(ph);
  }
  out[0] = re / samples;
  out[1] = im / samples;
}

/** Enough samples per slit to resolve the phase change across it at screen point yP. */
export function slitSamples(yP: number, g: SlitGeom): number {
  const k = (2 * Math.PI) / g.lambda;
  const spread = k * g.w * ((Math.abs(yP) + g.d) / g.L2 + g.d / g.L1 + g.w / Math.min(g.L1, g.L2));
  return Math.max(24, Math.min(2000, Math.ceil(spread / 0.4)));
}

/** Two-slit intensity |A1 + A2|^2 at screen point yP. Each open slit alone gives at most 1. */
export function twoSlitIntensity(yP: number, g: SlitGeom, scratch: Float64Array): number {
  const n = slitSamples(yP, g);
  slitAmplitude(yP, g.d / 2, g, n, scratch);
  const r1 = scratch[0];
  const i1 = scratch[1];
  slitAmplitude(yP, -g.d / 2, g, n, scratch);
  const re = r1 + scratch[0];
  const im = i1 + scratch[1];
  return re * re + im * im;
}

/** Fringe-averaged intensity |A1|^2 + |A2|^2 (what you see when fringes are too fine to resolve). */
export function twoSlitIncoherent(yP: number, g: SlitGeom, scratch: Float64Array): number {
  const n = slitSamples(yP, g);
  slitAmplitude(yP, g.d / 2, g, n, scratch);
  const a = scratch[0] * scratch[0] + scratch[1] * scratch[1];
  slitAmplitude(yP, -g.d / 2, g, n, scratch);
  return a + scratch[0] * scratch[0] + scratch[1] * scratch[1];
}
