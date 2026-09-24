// Dark energy: FLRW with matter, curvature and a w0-wa (CPL) fluid, supernova distances,
// synthetic type Ia data, a chi-squared grid fit, and a(t) by RK4.
// Pure math, no DOM. Units: time in Gyr, distance in Mpc, H0 in km/s/Mpc.
// The Friedmann integrator is adapted from the cosmic-expansion topic.

/** Speed of light in km/s. */
export const C_KMS = 299792.458;
/** One megaparsec in km. */
export const MPC_KM = 3.0856775814913673e19;
/** One gigayear (Julian) in s. */
export const GYR_S = 3.15576e16;
/** Hubble time 1/H0 in Gyr is HUBBLE_GYR / H0, with H0 in km/s/Mpc. About 977.8. */
export const HUBBLE_GYR = MPC_KM / GYR_S;
/** Hubble constant used for the synthetic sky. Supernova fits marginalise over it. */
export const H0_DEFAULT = 70;

export interface Model {
  /** Matter density today, in units of the critical density. */
  Om: number;
  /** Dark energy density today. */
  Ode: number;
  /** Equation of state today. */
  w0: number;
  /** Rate of change: w(a) = w0 + wa (1 − a). */
  wa: number;
}

export const lcdm = (Om: number, Ode: number): Model => ({ Om, Ode, w0: -1, wa: 0 });

/** Curvature share, fixed by requiring the Ω's to sum to one. Positive means open. */
export const omegaK = (m: Model) => 1 - m.Om - m.Ode;

/** CPL equation of state w(a) = w0 + wa (1 − a). */
export const wOf = (m: Model, a: number) => m.w0 + m.wa * (1 - a);

/**
 * Dark energy density relative to today, from the continuity equation
 * dρ/da = −3(1 + w)ρ/a. For CPL: ρ(a)/ρ0 = a^{−3(1+w0+wa)} exp(−3 wa (1 − a)).
 * For constant w this is a^{−3(1+w)}.
 */
export function deDensity(m: Model, a: number): number {
  return Math.pow(a, -3 * (1 + m.w0 + m.wa)) * Math.exp(-3 * m.wa * (1 - a));
}

/** E(a)² = H²/H0² = Ω_m a⁻³ + Ω_k a⁻² + Ω_DE ρ_DE(a)/ρ_DE0. Radiation is neglected. */
export function E2(m: Model, a: number): number {
  return m.Om / (a * a * a) + omegaK(m) / (a * a) + m.Ode * deDensity(m, a);
}

/**
 * ä/H0² from the second Friedmann equation, ä/a = −(4πG/3)(ρ + 3p/c²):
 * ä/H0² = a · [ −Ω_m a⁻³/2 − Ω_DE f(a)(1 + 3w(a))/2 ].
 */
export function accel(m: Model, a: number): number {
  return a * (-0.5 * m.Om / (a * a * a) - 0.5 * m.Ode * deDensity(m, a) * (1 + 3 * wOf(m, a)));
}

/** Deceleration parameter q = −ä a / ȧ². Negative means the expansion speeds up. */
export function decel(m: Model, a: number): number {
  return (-accel(m, a) * a) / (a * a * E2(m, a));
}

/** q today: Ω_m/2 + Ω_DE (1 + 3w0)/2. */
export const q0 = (m: Model) => 0.5 * m.Om + 0.5 * m.Ode * (1 + 3 * m.w0);

/** True if E² goes negative somewhere in (0, 1]: going back, such a universe bounces. No Big Bang. */
export function hasBounce(m: Model): boolean {
  for (let i = 0; i <= 600; i++) {
    const a = 10 ** (-4 + (4 * i) / 600);
    if (E2(m, a) < 0) return true;
  }
  return false;
}

// ---------------------------------------------------------------- distances

/** Distance modulus μ = 5 log10(d_L / 10 pc), with d_L in Mpc. */
export const distanceModulus = (dLMpc: number) => 5 * Math.log10(dLMpc) + 25;

/** Hubble distance c/H0 in Mpc. */
export const hubbleDistance = (H0: number) => C_KMS / H0;

/** Transverse comoving distance in units of c/H0, for line-of-sight comoving distance chi (same units). */
export function transverse(m: Model, chi: number): number {
  const Ok = omegaK(m);
  if (Math.abs(Ok) < 1e-8) return chi;
  const s = Math.sqrt(Math.abs(Ok));
  return Ok > 0 ? Math.sinh(s * chi) / s : Math.sin(s * chi) / s;
}

/**
 * Fills out[i] with the comoving distance (units c/H0) at z = i·zmax/n, by Simpson's rule
 * on each step with a midpoint. Returns false if E² ≤ 0 anywhere on the way (no such universe).
 */
export function comovingTable(m: Model, zmax: number, n: number, out: Float64Array): boolean {
  const h = zmax / n;
  out[0] = 0;
  let fPrev = 1; // 1/E at z = 0 is 1 since E²(1) = 1
  for (let i = 1; i <= n; i++) {
    const zm = (i - 0.5) * h;
    const z1 = i * h;
    const e2m = E2(m, 1 / (1 + zm));
    const e21 = E2(m, 1 / (1 + z1));
    if (!(e2m > 0) || !(e21 > 0)) return false;
    const fm = 1 / Math.sqrt(e2m);
    const f1 = 1 / Math.sqrt(e21);
    out[i] = out[i - 1] + (h / 6) * (fPrev + 4 * fm + f1);
    fPrev = f1;
  }
  return true;
}

/** Luminosity distance in Mpc, by direct Simpson integration. NaN if E² ≤ 0 on the way. */
export function luminosityDistance(m: Model, z: number, H0 = H0_DEFAULT, n = 400): number {
  const tab = new Float64Array(n + 1);
  if (!comovingTable(m, z, n, tab)) return NaN;
  const dm = transverse(m, tab[n]);
  if (!(dm > 0)) return NaN;
  return (1 + z) * dm * hubbleDistance(H0);
}

export const muOf = (m: Model, z: number, H0 = H0_DEFAULT) => distanceModulus(luminosityDistance(m, z, H0));

/** Evaluates μ(z) for many redshifts from one comoving table. Returns false if the model is invalid. */
export function muFromTable(m: Model, tab: Float64Array, zmax: number, n: number, zs: Float64Array, count: number, H0: number, out: Float64Array): boolean {
  const DH = hubbleDistance(H0);
  for (let i = 0; i < count; i++) {
    const z = zs[i];
    const x = (z / zmax) * n;
    const k = Math.min(n - 1, Math.floor(x));
    const f = x - k;
    // cubic Hermite-free linear interp is fine on a fine table: error ~ h² f''/8
    const chi = tab[k] + f * (tab[k + 1] - tab[k]);
    const dm = transverse(m, chi);
    if (!(dm > 0)) return false;
    out[i] = 5 * Math.log10((1 + z) * dm * DH) + 25;
  }
  return true;
}

// ---------------------------------------------------------------- synthetic supernovae

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SNData {
  n: number;
  z: Float64Array;
  mu: Float64Array;
  sigma: Float64Array;
  /** Noise-free μ of the generating model. */
  muTrue: Float64Array;
}

export const Z_MAX_DATA = 1.5;

/**
 * Draws n type Ia supernovae. A quarter sit at low redshift (0.015 to 0.1), the rest spread
 * to z = 1.4, roughly like the mix of nearby and deep surveys. Each gets Gaussian scatter σ in μ.
 */
export function generateSN(m: Model, n: number, scatter: number, seed: number, H0 = H0_DEFAULT): SNData {
  const r = rng(seed);
  const z = new Float64Array(n);
  const mu = new Float64Array(n);
  const sigma = new Float64Array(n);
  const muTrue = new Float64Array(n);
  const nLow = Math.round(n * 0.25);
  for (let i = 0; i < n; i++) {
    z[i] = i < nLow ? 0.015 + 0.085 * r() : 0.1 + 1.3 * Math.pow(r(), 0.8);
  }
  const NT = 600;
  const tab = new Float64Array(NT + 1);
  const ok = comovingTable(m, Z_MAX_DATA, NT, tab) && muFromTable(m, tab, Z_MAX_DATA, NT, z, n, H0, muTrue);
  for (let i = 0; i < n; i++) {
    // Box-Muller
    const u1 = Math.max(1e-12, r());
    const u2 = r();
    const g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    sigma[i] = scatter;
    if (!ok) muTrue[i] = NaN;
    mu[i] = muTrue[i] + scatter * g;
  }
  return { n, z, mu, sigma, muTrue };
}

/**
 * χ² of data against model predictions muTh, minimised analytically over a constant offset.
 * The offset absorbs the unknown absolute magnitude M and H0, which are degenerate for supernovae.
 */
export function chi2Offset(d: SNData, muTh: Float64Array): { chi2: number; offset: number } {
  let sw = 0;
  let swr = 0;
  for (let i = 0; i < d.n; i++) {
    const w = 1 / (d.sigma[i] * d.sigma[i]);
    sw += w;
    swr += w * (d.mu[i] - muTh[i]);
  }
  const off = swr / sw;
  let c = 0;
  for (let i = 0; i < d.n; i++) {
    const r = (d.mu[i] - muTh[i] - off) / d.sigma[i];
    c += r * r;
  }
  return { chi2: c, offset: off };
}

/** χ² of one model against the data (offset marginalised). Infinity if the model is invalid. */
export function chi2Model(d: SNData, m: Model, scratch?: { tab: Float64Array; mu: Float64Array }): number {
  const NT = 300;
  const tab = scratch?.tab ?? new Float64Array(NT + 1);
  const mu = scratch?.mu ?? new Float64Array(d.n);
  if (!comovingTable(m, Z_MAX_DATA, NT, tab)) return Infinity;
  if (!muFromTable(m, tab, Z_MAX_DATA, NT, d.z, d.n, H0_DEFAULT, mu)) return Infinity;
  return chi2Offset(d, mu).chi2;
}

export interface GridSpec {
  omMin: number;
  omMax: number;
  nx: number;
  olMin: number;
  olMax: number;
  ny: number;
}

export const GRID: GridSpec = { omMin: 0, omMax: 2.5, nx: 81, olMin: -1, olMax: 3, ny: 129 };

export interface GridFit {
  spec: GridSpec;
  /** χ² at (ix, iy), index iy * nx + ix. Infinity where the model is invalid. */
  chi2: Float64Array;
  bestOm: number;
  bestOl: number;
  chi2Min: number;
  /** Smallest Δχ² anywhere with Ω_Λ ≤ 0. */
  dchiNoLambda: number;
}

export const gridOm = (s: GridSpec, ix: number) => s.omMin + ((s.omMax - s.omMin) * ix) / (s.nx - 1);
export const gridOl = (s: GridSpec, iy: number) => s.olMin + ((s.olMax - s.olMin) * iy) / (s.ny - 1);

/**
 * Scans χ²(Ω_m, Ω_Λ) with w = −1 over the grid and refines the minimum with a parabola.
 * This is the analysis behind the classic 1998 confidence plot.
 */
export function fitGrid(d: SNData, spec: GridSpec = GRID, w0 = -1, wa = 0): GridFit {
  const NT = 300;
  const tab = new Float64Array(NT + 1);
  const mu = new Float64Array(d.n);
  const chi2 = new Float64Array(spec.nx * spec.ny);
  const m: Model = { Om: 0, Ode: 0, w0, wa };
  let best = Infinity;
  let bi = 0;
  for (let iy = 0; iy < spec.ny; iy++) {
    m.Ode = gridOl(spec, iy);
    for (let ix = 0; ix < spec.nx; ix++) {
      m.Om = gridOm(spec, ix);
      let c = Infinity;
      if (comovingTable(m, Z_MAX_DATA, NT, tab) && muFromTable(m, tab, Z_MAX_DATA, NT, d.z, d.n, H0_DEFAULT, mu)) c = chi2Offset(d, mu).chi2;
      const k = iy * spec.nx + ix;
      chi2[k] = c;
      if (c < best) {
        best = c;
        bi = k;
      }
    }
  }
  const ix = bi % spec.nx;
  const iy = Math.floor(bi / spec.nx);
  const para = (cm: number, c0: number, cp: number) => {
    const den = cm - 2 * c0 + cp;
    if (!Number.isFinite(den) || den <= 0) return 0;
    return Math.max(-0.5, Math.min(0.5, (0.5 * (cm - cp)) / den));
  };
  const at = (x: number, y: number) => chi2[y * spec.nx + x];
  const fx = ix > 0 && ix < spec.nx - 1 ? para(at(ix - 1, iy), best, at(ix + 1, iy)) : 0;
  const fy = iy > 0 && iy < spec.ny - 1 ? para(at(ix, iy - 1), best, at(ix, iy + 1)) : 0;
  const dOm = (spec.omMax - spec.omMin) / (spec.nx - 1);
  const dOl = (spec.olMax - spec.olMin) / (spec.ny - 1);
  let noL = Infinity;
  for (let y = 0; y < spec.ny; y++) {
    if (gridOl(spec, y) > 1e-9) break;
    for (let x = 0; x < spec.nx; x++) noL = Math.min(noL, at(x, y) - best);
  }
  return { spec, chi2, bestOm: gridOm(spec, ix) + fx * dOm, bestOl: gridOl(spec, iy) + fy * dOl, chi2Min: best, dchiNoLambda: noL };
}

/** Δχ² levels enclosing 68.3%, 95.4% and 99.73% for two fitted parameters. */
export const DCHI2_LEVELS = [2.30, 6.18, 11.83];

/** Upper-tail probability of the χ² distribution with k degrees of freedom (Wilson-Hilferty). */
export function chi2Pvalue(chi2: number, k: number): number {
  if (!Number.isFinite(chi2)) return 0;
  const x = (Math.cbrt(chi2 / k) - (1 - 2 / (9 * k))) / Math.sqrt(2 / (9 * k));
  return 0.5 * erfc(x / Math.SQRT2);
}

/** Complementary error function (Numerical Recipes erfcc, relative error < 1.2e-7). */
export function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}

// ---------------------------------------------------------------- a(t) by RK4

export interface History {
  model: Model;
  /** Samples ordered in time. t is Gyr from today (negative = past). */
  t: Float64Array;
  a: Float64Array;
  adot: Float64Array;
  n: number;
  /** Age since the Big Bang in Gyr, or Infinity if the past integration ran out of time first. */
  age: number;
  /** True if, going back, the expansion reverses before a reaches zero. */
  bounce: boolean;
  /** Largest relative violation of the first Friedmann equation along the solution. */
  maxConstraint: number;
  /** Scale factor where ä last changed from negative to positive, or NaN. */
  aAcc: number;
  /** Time (Gyr from now) of that switch, or NaN. */
  tAcc: number;
}

export const h0Gyr = (H0: number) => H0 / HUBBLE_GYR;

/**
 * Integrates the second Friedmann equation ä = H0² a[−Ω_m a⁻³/2 − Ω_DE f(a)(1 + 3w)/2]
 * with RK4 in cosmic time, starting today (a = 1, ȧ = H0) and running both into the past and the future.
 * The step is a fixed small fraction eps of the local expansion time. The first Friedmann equation is
 * then used only as an accuracy check.
 */
export function buildHistory(m: Model, opts: { H0?: number; tPast?: number; tFuture?: number; aMax?: number; eps?: number } = {}): History {
  const H = h0Gyr(opts.H0 ?? H0_DEFAULT);
  const H2 = H * H;
  const tPast = opts.tPast ?? 40;
  const tFuture = opts.tFuture ?? 30;
  const aMax = opts.aMax ?? 6;
  const eps = opts.eps ?? 0.004;
  const A_MIN = 1e-3;
  let maxC = 0;
  let bounce = false;
  let age = Infinity;

  const run = (dir: 1 | -1, T: number[], A: number[], V: number[]) => {
    let a = 1;
    let v = H;
    let t = 0;
    for (let guard = 0; guard < 400000; guard++) {
      const acc = H2 * accel(m, a);
      const h = (dir * eps * a) / (Math.abs(v) + Math.sqrt(Math.abs(acc) * a) + 1e-9);
      const k1a = v;
      const k1v = acc;
      const a2 = a + 0.5 * h * k1a;
      const k2a = v + 0.5 * h * k1v;
      const k2v = H2 * accel(m, a2);
      const a3 = a + 0.5 * h * k2a;
      const k3a = v + 0.5 * h * k2v;
      const k3v = H2 * accel(m, a3);
      const a4 = a + h * k3a;
      const k4a = v + h * k3v;
      const k4v = H2 * accel(m, a4);
      a += (h / 6) * (k1a + 2 * k2a + 2 * k3a + k4a);
      v += (h / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
      t += h;
      if (!(a > 0) || !Number.isFinite(v)) break;
      const e2 = E2(m, a);
      const lhs = (v * v) / (a * a * H2);
      const scale = Math.max(Math.abs(e2), lhs, m.Om / (a * a * a), Math.abs(m.Ode * deDensity(m, a)), 1e-6);
      maxC = Math.max(maxC, Math.abs(lhs - e2) / scale);
      T.push(t);
      A.push(a);
      V.push(v);
      if (dir < 0) {
        if (v <= 0) {
          bounce = true;
          break;
        }
        if (a < A_MIN) {
          // Remaining time to a = 0 for a power law a ∝ t^p, with p = 1/(1 + q).
          const q = (-H2 * accel(m, a) * a) / (v * v);
          age = -t + a / (v * (1 + q));
          break;
        }
        if (-t >= tPast) break;
      } else {
        if (a < A_MIN || a > aMax || t >= tFuture) break;
      }
    }
  };
  const Tp: number[] = [];
  const Ap: number[] = [];
  const Vp: number[] = [];
  const Tf: number[] = [];
  const Af: number[] = [];
  const Vf: number[] = [];
  run(-1, Tp, Ap, Vp);
  run(1, Tf, Af, Vf);
  const n = Tp.length + 1 + Tf.length;
  const t = new Float64Array(n);
  const a = new Float64Array(n);
  const adot = new Float64Array(n);
  let k = 0;
  for (let i = Tp.length - 1; i >= 0; i--, k++) {
    t[k] = Tp[i];
    a[k] = Ap[i];
    adot[k] = Vp[i];
  }
  t[k] = 0;
  a[k] = 1;
  adot[k] = H;
  k++;
  for (let i = 0; i < Tf.length; i++, k++) {
    t[k] = Tf[i];
    a[k] = Af[i];
    adot[k] = Vf[i];
  }
  // Onset of acceleration: last sign change of ä from − to + on the expanding branch.
  let aAcc = NaN;
  let tAcc = NaN;
  let prev = accel(m, a[0]);
  for (let i = 1; i < n; i++) {
    const cur = accel(m, a[i]);
    if (prev < 0 && cur >= 0 && adot[i] > 0) {
      const f = prev / (prev - cur);
      aAcc = a[i - 1] + f * (a[i] - a[i - 1]);
      tAcc = t[i - 1] + f * (t[i] - t[i - 1]);
    }
    prev = cur;
  }
  return { model: m, t, a, adot, n, age: bounce ? NaN : age, bounce, maxConstraint: maxC, aAcc, tAcc };
}

/** Linear interpolation of a(t) on a history (clamped to its ends). */
export function aAtTime(h: History, t: number): number {
  if (t <= h.t[0]) return h.a[0];
  if (t >= h.t[h.n - 1]) return h.a[h.n - 1];
  let lo = 0;
  let hi = h.n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (h.t[mid] <= t) lo = mid;
    else hi = mid;
  }
  const f = (t - h.t[lo]) / (h.t[hi] - h.t[lo]);
  return h.a[lo] + f * (h.a[hi] - h.a[lo]);
}

/** Lookback time (Gyr) to redshift z from the integrated past branch, or NaN if out of range. */
export function lookbackFromHistory(h: History, z: number): number {
  const target = 1 / (1 + z);
  // Past branch: a increases with t up to today.
  let i = 0;
  while (i < h.n && h.t[i] < 0) i++;
  if (target < h.a[0]) return NaN;
  for (let k = 1; k <= i; k++) {
    if (h.a[k] >= target) {
      const f = (target - h.a[k - 1]) / (h.a[k] - h.a[k - 1]);
      return -(h.t[k - 1] + f * (h.t[k] - h.t[k - 1]));
    }
  }
  return 0;
}

/** Lookback time by quadrature, t_L = ∫₀^z dz' / ((1+z') H(z')), in Gyr. For tests and axes. */
export function lookbackTime(m: Model, z: number, H0 = H0_DEFAULT, n = 2000): number {
  const f = (x: number) => 1 / ((1 + x) * Math.sqrt(Math.max(1e-300, E2(m, 1 / (1 + x)))));
  const h = z / n;
  let s = f(0) + f(z);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(i * h);
  return (s * h) / 3 / h0Gyr(H0);
}
