// FLRW cosmology: the Friedmann equation, a(t) by RK4, and distances.
// Pure math, no DOM. Units: time in Gyr, distance in Mpc, H0 in km/s/Mpc.

/** Speed of light in km/s. */
export const C_KMS = 299792.458;
/** One megaparsec in km. */
export const MPC_KM = 3.0856775814913673e19;
/** One gigayear (Julian) in s. */
export const GYR_S = 3.15576e16;
/** Hubble time 1/H0 in Gyr is HUBBLE_GYR / H0, with H0 in km/s/Mpc. About 977.8. */
export const HUBBLE_GYR = MPC_KM / GYR_S;
/** Speed of light in Mpc per Gyr (about 306.6). */
export const C_MPC_GYR = (C_KMS * GYR_S) / MPC_KM;
/** Megaparsecs in one billion light years (light travels this far in a Julian Gyr). */
export const MPC_PER_GLY = C_MPC_GYR;
/** Photons plus three massless neutrino species: Ω_r h² for T_CMB = 2.7255 K, N_eff = 3.046. */
export const OMEGA_R_H2 = 4.18e-5;

export interface Cosmo {
  /** Hubble constant today, km/s/Mpc. */
  H0: number;
  /** Matter density today, in units of the critical density. */
  Om: number;
  /** Dark energy (cosmological constant) density today. */
  Ol: number;
  /** Radiation density today. */
  Or: number;
}

export const omegaR = (H0: number) => OMEGA_R_H2 / (H0 / 100) ** 2;
/** Curvature term, fixed by requiring the Ω's to sum to one. Positive means open, negative closed. */
export const omegaK = (c: Cosmo) => 1 - c.Om - c.Ol - c.Or;
/** H0 in 1/Gyr. */
export const h0Gyr = (H0: number) => H0 / HUBBLE_GYR;
/** Hubble distance c/H0 in Mpc. */
export const hubbleDistance = (H0: number) => C_KMS / H0;

/** E(a)² = H(a)²/H0² = Ω_r a⁻⁴ + Ω_m a⁻³ + Ω_k a⁻² + Ω_Λ. */
export function E2(c: Cosmo, a: number): number {
  const Ok = omegaK(c);
  return c.Or / (a * a * a * a) + c.Om / (a * a * a) + Ok / (a * a) + c.Ol;
}

/** H(a) in km/s/Mpc (expanding branch). */
export const hubble = (c: Cosmo, a: number) => c.H0 * Math.sqrt(Math.max(0, E2(c, a)));

/** Deceleration parameter q = −ä a / ȧ². */
export function decel(c: Cosmo, a: number): number {
  const num = c.Or / a ** 4 + c.Om / (2 * a ** 3) - c.Ol;
  return num / E2(c, a);
}

/** Acceleration ä/H0² as a function of a (from the second Friedmann equation). */
export const accel = (c: Cosmo, a: number) => -c.Or / (a * a * a) - c.Om / (2 * a * a) + c.Ol * a;

/** Simpson's rule on [lo, hi] with n (even) panels. */
function simpson(f: (x: number) => number, lo: number, hi: number, n = 2000): number {
  const h = (hi - lo) / n;
  let s = f(lo) + f(hi);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(lo + i * h);
  return (s * h) / 3;
}

/**
 * True if E² goes negative somewhere in (0, 1]: such a universe has no Big Bang.
 * Going back in time it would bounce at a finite size instead.
 */
export function hasBounce(c: Cosmo): boolean {
  for (let i = 0; i <= 600; i++) {
    const a = 10 ** (-5 + (5 * i) / 600);
    if (E2(c, a) < 0) return true;
  }
  return false;
}

/** Scale factor where a recollapsing universe stops expanding, or Infinity if it never does. */
export function turnaroundA(c: Cosmo): number {
  let prev = 1;
  for (let i = 1; i <= 800; i++) {
    const a = 10 ** ((4 * i) / 800);
    if (E2(c, a) < 0) {
      let lo = prev;
      let hi = a;
      for (let k = 0; k < 60; k++) {
        const m = 0.5 * (lo + hi);
        if (E2(c, m) < 0) hi = m;
        else lo = m;
      }
      return 0.5 * (lo + hi);
    }
    prev = a;
  }
  return Infinity;
}

/**
 * Cosmic time since the Big Bang when the scale factor first reaches a, in Gyr.
 * t(a) = ∫₀ᵃ da′ / (a′ H(a′)), with a′ = u² to remove the endpoint singularity.
 */
export function ageAt(c: Cosmo, a: number, n = 2000): number {
  const H = h0Gyr(c.H0);
  const f = (u: number) => {
    if (u === 0) return 0;
    const aa = u * u;
    return 2 / (u * Math.sqrt(Math.max(1e-300, E2(c, aa))));
  };
  return simpson(f, 0, Math.sqrt(a), n) / H;
}

/** Age of the universe today (a = 1), in Gyr. */
export const ageToday = (c: Cosmo) => ageAt(c, 1);

/** Lookback time to redshift z, in Gyr. */
export const lookbackTime = (c: Cosmo, z: number) => ageAt(c, 1) - ageAt(c, 1 / (1 + z));

/** Line-of-sight comoving distance to redshift z, in Mpc: D_C = c ∫ dz/H(z). */
export function comovingDistance(c: Cosmo, z: number, n = 2000): number {
  const a0 = 1 / (1 + z);
  // Substitute a = u² so the integral from a0 = 0 (the particle horizon) is also smooth.
  const f = (u: number) => {
    if (u === 0) return c.Or > 0 ? 0 : c.Om > 0 ? 2 / Math.sqrt(c.Om) : 0;
    const aa = u * u;
    return 2 / (u * u * u * Math.sqrt(Math.max(1e-300, E2(c, aa))));
  };
  return hubbleDistance(c.H0) * simpson(f, Math.sqrt(a0), 1, n);
}

/** Particle horizon today: comoving distance to z = ∞, in Mpc. */
export const particleHorizon = (c: Cosmo) => comovingDistance(c, Infinity);

/** Transverse comoving distance D_M for a comoving line-of-sight distance chi, both in Mpc. */
export function transverse(c: Cosmo, chi: number): number {
  const Ok = omegaK(c);
  const DH = hubbleDistance(c.H0);
  if (Math.abs(Ok) < 1e-8) return chi;
  const s = Math.sqrt(Math.abs(Ok));
  return Ok > 0 ? (DH / s) * Math.sinh((s * chi) / DH) : (DH / s) * Math.sin((s * chi) / DH);
}

export const luminosityDistance = (c: Cosmo, z: number) => (1 + z) * transverse(c, comovingDistance(c, z));
export const angularDiameterDistance = (c: Cosmo, z: number) => transverse(c, comovingDistance(c, z)) / (1 + z);

/** Redshift where the expansion switched from slowing to speeding up (q = 0), or NaN. Searches the past only. */
export function accelerationRedshift(c: Cosmo): number {
  if (decel(c, 1) >= 0) return NaN;
  let lo = 1e-4;
  let hi = 1;
  if (decel(c, lo) <= 0) return NaN;
  for (let k = 0; k < 80; k++) {
    const m = Math.sqrt(lo * hi);
    if (decel(c, m) > 0) lo = m;
    else hi = m;
  }
  return 1 / hi - 1;
}

// ---------------------------------------------------------------- a(t) by RK4

export type Fate = 'forever' | 'crunch' | 'nobang';

export interface History {
  cosmo: Cosmo;
  fate: Fate;
  /** Samples of cosmic time (Gyr), scale factor, da/dt (1/Gyr), and conformal distance η = ∫c dt/a (Mpc). */
  t: Float64Array;
  a: Float64Array;
  adot: Float64Array;
  eta: Float64Array;
  n: number;
  /** Time at a = 1 on the expanding branch (Gyr), from the integration. */
  t0: number;
  /** η at a = 1 (Mpc): the particle horizon today. */
  eta0: number;
  /** Largest relative violation of the first Friedmann equation along the solution. */
  maxConstraint: number;
  /** Time at which a reaches its maximum (Gyr), or NaN. */
  tTurn: number;
}

export const A_START = 1e-4;

/**
 * Integrates the second Friedmann equation  ä = H0² (−Ω_r a⁻³ − Ω_m a⁻²/2 + Ω_Λ a)
 * with RK4 in cosmic time, together with dη/dt = c/a. The first Friedmann equation
 * only sets the starting speed, then serves as an accuracy check.
 * Using ä rather than ȧ = aH lets the solution turn around smoothly in a closed universe.
 */
export function buildHistory(c: Cosmo, opts: { aEnd?: number; tMax?: number; eps?: number } = {}): History {
  const aEnd = opts.aEnd ?? 8;
  const eps = opts.eps ?? 0.004;
  if (hasBounce(c)) {
    return { cosmo: c, fate: 'nobang', t: new Float64Array(0), a: new Float64Array(0), adot: new Float64Array(0), eta: new Float64Array(0), n: 0, t0: NaN, eta0: NaN, maxConstraint: 0, tTurn: NaN };
  }
  const H = h0Gyr(c.H0);
  const H2 = H * H;
  const willCrunch = Number.isFinite(turnaroundA(c));
  const tMax = opts.tMax ?? (willCrunch ? 1e4 : Math.max(3 * ageToday(c), ageToday(c) + 25));

  const T: number[] = [];
  const A: number[] = [];
  const V: number[] = [];
  const N: number[] = [];

  // Start deep in the radiation or matter era, where the quadratures are accurate.
  let a = A_START;
  let v = a * H * Math.sqrt(E2(c, a));
  let t = ageAt(c, a, 400);
  let eta = a * comovingDistanceFromZero(c, a);
  let maxC = 0;
  let tTurn = NaN;
  let fate: Fate = 'forever';

  const fa = (x: number) => H2 * accel(c, x);
  const push = () => {
    T.push(t);
    A.push(a);
    V.push(v);
    N.push(eta);
  };
  push();
  for (let guard = 0; guard < 200000; guard++) {
    const acc = Math.abs(fa(a));
    const h = (eps * a) / (Math.abs(v) + Math.sqrt(acc * a) + 1e-12);
    // RK4 on (a, v, η)
    const k1a = v;
    const k1v = fa(a);
    const k1n = C_MPC_GYR / a;
    const a2 = a + 0.5 * h * k1a;
    const k2a = v + 0.5 * h * k1v;
    const k2v = fa(a2);
    const k2n = C_MPC_GYR / a2;
    const a3 = a + 0.5 * h * k2a;
    const k3a = v + 0.5 * h * k2v;
    const k3v = fa(a3);
    const k3n = C_MPC_GYR / a3;
    const a4 = a + h * k3a;
    const k4a = v + h * k3v;
    const k4v = fa(a4);
    const k4n = C_MPC_GYR / a4;
    const vOld = v;
    a += (h / 6) * (k1a + 2 * k2a + 2 * k3a + k4a);
    v += (h / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
    eta += (h / 6) * (k1n + 2 * k2n + 2 * k3n + k4n);
    t += h;
    if (vOld > 0 && v <= 0) tTurn = t - (h * v) / (v - vOld);
    // Friedmann constraint: (ȧ/a)²/H0² should equal E²(a).
    const e2 = E2(c, a);
    const lhs = (v * v) / (a * a * H2);
    const scale = Math.max(e2, lhs, Math.abs(c.Om / a ** 3), Math.abs(c.Ol), 1e-6);
    maxC = Math.max(maxC, Math.abs(lhs - e2) / scale);
    if (a < A_START) {
      fate = 'crunch';
      break;
    }
    push();
    if (a >= aEnd || t >= tMax) break;
  }
  if (willCrunch && fate !== 'crunch' && Number.isFinite(tTurn)) fate = 'crunch';
  if (willCrunch && !Number.isFinite(tTurn)) fate = 'crunch'; // turns around beyond the plotted range

  const n = T.length;
  const hist: History = {
    cosmo: c,
    fate,
    t: Float64Array.from(T),
    a: Float64Array.from(A),
    adot: Float64Array.from(V),
    eta: Float64Array.from(N),
    n,
    t0: NaN,
    eta0: NaN,
    maxConstraint: maxC,
    tTurn,
  };
  // a = 1 on the expanding branch
  for (let i = 1; i < n; i++) {
    if (hist.a[i - 1] <= 1 && hist.a[i] >= 1 && hist.adot[i] > 0) {
      const f = (1 - hist.a[i - 1]) / (hist.a[i] - hist.a[i - 1]);
      hist.t0 = hist.t[i - 1] + f * (hist.t[i] - hist.t[i - 1]);
      hist.eta0 = hist.eta[i - 1] + f * (hist.eta[i] - hist.eta[i - 1]);
      break;
    }
  }
  return hist;
}

/** ∫₀ᵃ c da′/(a′² H) divided by a: small-a helper for the starting conformal distance. */
function comovingDistanceFromZero(c: Cosmo, a: number): number {
  const H = h0Gyr(c.H0);
  const f = (u: number) => {
    if (u === 0) return c.Or > 0 ? 0 : c.Om > 0 ? 2 / Math.sqrt(c.Om) : 0;
    const aa = u * u;
    return 2 / (u * u * u * Math.sqrt(Math.max(1e-300, E2(c, aa))));
  };
  return (C_MPC_GYR / H) * simpson(f, 0, Math.sqrt(a), 400) / a;
}

/** Index i with arr[i] <= x < arr[i+1] for a monotonic increasing array (clamped). */
function bracket(arr: Float64Array, n: number, x: number): number {
  if (x <= arr[0]) return 0;
  if (x >= arr[n - 1]) return n - 2;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (arr[m] <= x) lo = m;
    else hi = m;
  }
  return lo;
}

/** Linear interpolation of column `col` at time t. */
export function atTime(h: History, col: Float64Array, t: number): number {
  const i = bracket(h.t, h.n, t);
  const f = (t - h.t[i]) / (h.t[i + 1] - h.t[i]);
  return col[i] + Math.max(0, Math.min(1, f)) * (col[i + 1] - col[i]);
}

/** Cosmic time at which η(t) = eta (η grows monotonically). Returns NaN before the start of the table. */
export function timeAtEta(h: History, eta: number): number {
  if (eta < h.eta[0]) return NaN;
  const i = bracket(h.eta, h.n, eta);
  const f = (eta - h.eta[i]) / (h.eta[i + 1] - h.eta[i]);
  return h.t[i] + f * (h.t[i + 1] - h.t[i]);
}

/** Time when a first reaches `a` on the expanding branch (linear scan by bisection over the rising part). */
export function timeAtA(h: History, a: number): number {
  let end = h.n - 1;
  for (let i = 1; i < h.n; i++) {
    if (h.adot[i] <= 0) {
      end = i;
      break;
    }
  }
  if (a <= h.a[0]) return h.t[0];
  if (a >= h.a[end]) return h.t[end];
  let lo = 0;
  let hi = end;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (h.a[m] <= a) lo = m;
    else hi = m;
  }
  const f = (a - h.a[lo]) / (h.a[hi] - h.a[lo]);
  return h.t[lo] + f * (h.t[hi] - h.t[lo]);
}

/**
 * Redshift seen at time t from a galaxy at comoving distance chi (Mpc, today's units).
 * Light arriving at t left when η = η(t) − chi. Returns NaN if that is before the table starts,
 * which means the galaxy lies beyond (or right at) the particle horizon.
 */
export function observedZ(h: History, t: number, chi: number): number {
  const etaNow = atTime(h, h.eta, t);
  const te = timeAtEta(h, etaNow - chi);
  if (!Number.isFinite(te)) return NaN;
  return atTime(h, h.a, t) / atTime(h, h.a, te) - 1;
}

/** Deceleration parameter from the integrated solution: q = −ä a / ȧ². */
export function decelFromHistory(h: History, t: number): number {
  const a = atTime(h, h.a, t);
  const v = atTime(h, h.adot, t);
  const H = h0Gyr(h.cosmo.H0);
  return (-H * H * accel(h.cosmo, a) * a) / (v * v);
}

/** Converts a wavelength in nm to an sRGB colour (0..1), dimming into the infrared and ultraviolet. */
export function wavelengthRGB(nm: number, out: [number, number, number]): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  if (nm < 380) {
    r = 0.4;
    g = 0.2;
    b = 0.9;
  } else if (nm < 440) {
    r = -(nm - 440) / 60;
    b = 1;
  } else if (nm < 490) {
    g = (nm - 440) / 50;
    b = 1;
  } else if (nm < 510) {
    g = 1;
    b = -(nm - 510) / 20;
  } else if (nm < 580) {
    r = (nm - 510) / 70;
    g = 1;
  } else if (nm < 645) {
    r = 1;
    g = -(nm - 645) / 65;
  } else {
    r = 1;
  }
  let k = 1;
  if (nm > 700) k = Math.max(0.28, 1 - (nm - 700) / 250);
  else if (nm < 420 && nm >= 380) k = 0.5 + (0.5 * (nm - 380)) / 40;
  out[0] = r * k;
  out[1] = g * k;
  out[2] = b * k;
  return out;
}
