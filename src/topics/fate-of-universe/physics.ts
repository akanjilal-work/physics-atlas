// The future of an FLRW universe with matter, radiation, curvature and dark energy
// whose equation of state is w(a) = w0 + wa (1 − a) (the CPL form used by DESI).
// Pure math, no DOM. Units: time in Gyr, distance in Gly (so c = 1), H0 in km/s/Mpc.
// The RK4 integration of the second Friedmann equation follows src/topics/cosmic-expansion.

/** Hubble time 1/H0 in Gyr is HUBBLE_GYR / H0 with H0 in km/s/Mpc (Mpc in km over a Julian Gyr in s). */
export const HUBBLE_GYR = 3.0856775814913673e19 / 3.15576e16;
/** Photons plus three neutrino species: Ω_r h² for T_CMB = 2.7255 K, N_eff = 3.046. */
export const OMEGA_R_H2 = 4.18e-5;
export const T_CMB = 2.7255;
export const omegaR = (H0: number) => OMEGA_R_H2 / (H0 / 100) ** 2;
/** H0 in 1/Gyr. */
export const h0Gyr = (H0: number) => H0 / HUBBLE_GYR;

export interface Model {
  /** Hubble constant today, km/s/Mpc. */
  H0: number;
  /** Matter density today, in units of the critical density. */
  Om: number;
  /** Radiation density today. */
  Or: number;
  /** Dark energy density today (negative for a negative cosmological constant). */
  Ode: number;
  /** Dark energy equation of state today. */
  w0: number;
  /** Rate of change of w: w(a) = w0 + wa (1 − a). */
  wa: number;
}

/** Curvature term, fixed by requiring the Ω's to sum to one. Negative means closed. */
export const omegaK = (m: Model) => 1 - m.Om - m.Or - m.Ode;
export const wOf = (m: Model, a: number) => m.w0 + m.wa * (1 - a);

/** ln of ρ_DE(a)/ρ_DE(today) for the CPL equation of state. */
export function lnDE(m: Model, N: number): number {
  const a = Math.exp(Math.min(N, 700));
  return -3 * (1 + m.w0 + m.wa) * N - 3 * m.wa * (1 - a);
}

/** E² = H²/H0² at scale factor a (direct form, fine for moderate a). */
export function E2(m: Model, a: number): number {
  const Ok = omegaK(m);
  const de = m.Ode === 0 ? 0 : m.Ode * Math.exp(lnDE(m, Math.log(a)));
  return m.Or / (a * a * a * a) + m.Om / (a * a * a) + Ok / (a * a) + de;
}

/**
 * ln E² at N = ln a, evaluated in log space so a can be astronomically large.
 * Returns NaN when E² ≤ 0 (no expanding solution there).
 */
export function lnE2(m: Model, N: number): number {
  const Ok = omegaK(m);
  let M = -Infinity;
  const L0 = m.Or > 0 ? Math.log(m.Or) - 4 * N : -Infinity;
  const L1 = m.Om > 0 ? Math.log(m.Om) - 3 * N : -Infinity;
  const L2 = Ok !== 0 ? Math.log(Math.abs(Ok)) - 2 * N : -Infinity;
  const L3 = m.Ode !== 0 ? Math.log(Math.abs(m.Ode)) + lnDE(m, N) : -Infinity;
  M = Math.max(L0, L1, L2, L3);
  if (!Number.isFinite(M)) return M === Infinity ? Infinity : NaN;
  let s = 0;
  if (L0 > -Infinity) s += Math.exp(L0 - M);
  if (L1 > -Infinity) s += Math.exp(L1 - M);
  if (L2 > -Infinity) s += Math.sign(Ok) * Math.exp(L2 - M);
  if (L3 > -Infinity) s += Math.sign(m.Ode) * Math.exp(L3 - M);
  if (!(s > 1e-300)) return NaN;
  return M + Math.log(s);
}

/**
 * Second Friedmann equation: ä/a = −(4πG/3)(ρ + 3p/c²), in units of H0².
 * Radiation has p = ρc²/3, matter p = 0, dark energy p = wρc².
 */
export function accelTerm(m: Model, a: number): number {
  const de = m.Ode === 0 ? 0 : m.Ode * Math.exp(lnDE(m, Math.log(a)));
  return -0.5 * ((2 * m.Or) / (a * a * a * a) + m.Om / (a * a * a) + (1 + 3 * wOf(m, a)) * de);
}

/** Deceleration parameter q = −ä a/ȧ². Negative means accelerating. */
export const decel = (m: Model, a: number) => -accelTerm(m, a) / E2(m, a);

/** The sum ρ + 3p/c² today, in units of the critical density. Its sign decides deceleration. */
export const rhoPlus3p = (m: Model) => 2 * m.Or + m.Om + (1 + 3 * m.w0) * m.Ode;

/** Simpson's rule on [lo, hi] with n (even) panels. */
function simpson(f: (x: number) => number, lo: number, hi: number, n = 2000): number {
  const h = (hi - lo) / n;
  let s = f(lo) + f(hi);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(lo + i * h);
  return (s * h) / 3;
}

/** Cosmic time (Gyr) when the scale factor first reaches a: ∫₀ᵃ da/(aH), with a = u². */
export function ageAt(m: Model, a: number, n = 2000): number {
  const f = (u: number) => (u === 0 ? 0 : 2 / (u * Math.sqrt(Math.max(1e-300, E2(m, u * u)))));
  return simpson(f, 0, Math.sqrt(a), n) / h0Gyr(m.H0);
}

/** Conformal time η(a) = ∫₀ᵃ c da/(a²H) in Gly: the comoving distance light has covered since the Big Bang. */
export function etaAt(m: Model, a: number, n = 2000): number {
  const f = (u: number) => {
    if (u === 0) return m.Or > 0 ? 2 / Math.sqrt(m.Or) : m.Om > 0 ? 2 / Math.sqrt(m.Om) : 0;
    const aa = u * u;
    return 2 / (u * u * u * Math.sqrt(Math.max(1e-300, E2(m, aa))));
  };
  return simpson(f, 0, Math.sqrt(a), n) / h0Gyr(m.H0);
}

/** True if E² goes negative somewhere in (0, 1]: such a universe had no Big Bang. */
export function hasBounce(m: Model): boolean {
  for (let i = 0; i <= 800; i++) {
    const a = 10 ** (-6 + (6 * i) / 800);
    if (!(E2(m, a) > 0)) return true;
  }
  return false;
}

/** ln a at which expansion stops (E² = 0) in the future, or Infinity if it never does. */
export function turnaroundN(m: Model): number {
  let prev = 0;
  const step = 0.005;
  for (let N = step; N <= 60; N += step) {
    if (Number.isNaN(lnE2(m, N))) {
      let lo = prev;
      let hi = N;
      for (let k = 0; k < 80; k++) {
        const mid = 0.5 * (lo + hi);
        if (Number.isNaN(lnE2(m, mid))) hi = mid;
        else lo = mid;
      }
      return lo;
    }
    prev = N;
  }
  return Infinity;
}

/** Local slope k = d ln H / d ln a. Positive k in the far future means H blows up: a Big Rip. */
export function slopeLnH(m: Model, N: number): number {
  const d = 1e-3 * Math.max(1, Math.abs(N));
  return 0.25 * (lnE2(m, N + d) - lnE2(m, N - d)) / d;
}

export type Fate = 'freeze' | 'rip' | 'crunch' | 'nobang';

export function classify(m: Model): Fate {
  if (hasBounce(m)) return 'nobang';
  if (Number.isFinite(turnaroundN(m))) return 'crunch';
  if (m.Ode > 0 && slopeLnH(m, 60) > 1e-9) return 'rip';
  return 'freeze';
}

/** Caldwell, Kamionkowski and Weinberg (2003): t_rip − t0 ≈ (2/3)|1+w|⁻¹ H0⁻¹ (1 − Ω_m)^(−1/2), in Gyr. */
export function ripTimeFormula(H0: number, w: number, Om: number): number {
  return ((2 / 3) / Math.abs(1 + w)) / h0Gyr(H0) / Math.sqrt(1 - Om);
}

/**
 * Lead time before the Rip at which a bound system of orbital period P comes apart (CKW 2003):
 * the repulsion −(4π/3)(ρ + 3p)R³ matches the binding mass when t_rip − t = P √(2|1+3w|) / (6π|1+w|).
 */
export const leadFactor = (w: number) => Math.sqrt(2 * Math.abs(1 + 3 * w)) / (6 * Math.PI * Math.abs(1 + w));

/** Hawking lifetime (photon emission only, no greybody factors), in years, for a mass in solar masses. */
export function hawkingLifetimeYr(Msun: number): number {
  const G = 6.6743e-11;
  const hbar = 1.054571817e-34;
  const c = 299792458;
  const M = Msun * 1.98847e30;
  return (5120 * Math.PI * G * G * M * M * M) / (hbar * c ** 4) / 3.15576e7;
}

// ---------------------------------------------------------------- RK4 in cosmic time

export interface Orbit {
  /** Time relative to today (Gyr), scale factor and da/dt (1/Gyr). */
  t: Float64Array;
  a: Float64Array;
  adot: Float64Array;
  n: number;
  /** How the forward run ended. */
  end: 'time' | 'rip' | 'crunch';
  /** Estimated time of the singularity relative to today (Gyr), or NaN. */
  tEnd: number;
  /** Largest relative violation of the first Friedmann equation along the run. */
  maxConstraint: number;
  /** Time of maximum expansion relative to today, or NaN. */
  tTurn: number;
}

/**
 * Integrates ä = H0² a (ä/a) forward from a = 1, ȧ = H0 with adaptive-size RK4 steps.
 * The step is a fixed small fraction of the local expansion time, so it tracks both
 * a Big Rip (a → ∞) and a recollapse through turnaround. The first Friedmann equation
 * is then only a check. Near a rip the remaining time is closed with the local power law.
 */
export function integrate(m: Model, opts: { tMax?: number; aMax?: number; aMin?: number; eps?: number; backward?: boolean } = {}): Orbit {
  const tMax = opts.tMax ?? 100;
  const aMax = opts.aMax ?? 1e12;
  const aMin = opts.aMin ?? 1e-3;
  const eps = opts.eps ?? 0.002;
  const dir = opts.backward ? -1 : 1;
  const H = h0Gyr(m.H0);
  const H2 = H * H;
  const f = (x: number) => H2 * x * accelTerm(m, x);
  let a = 1;
  let v = H * Math.sqrt(E2(m, 1));
  let t = 0;
  const T = [0];
  const A = [1];
  const V = [v];
  let maxC = 0;
  let tTurn = NaN;
  let end: Orbit['end'] = 'time';
  let tEnd = NaN;
  for (let guard = 0; guard < 400000; guard++) {
    const acc = Math.abs(f(a));
    const h = dir * (eps * a) / (Math.abs(v) + Math.sqrt(acc * a) + 1e-12);
    const k1a = v;
    const k1v = f(a);
    const k2a = v + 0.5 * h * k1v;
    const k2v = f(a + 0.5 * h * k1a);
    const k3a = v + 0.5 * h * k2v;
    const k3v = f(a + 0.5 * h * k2a);
    const k4a = v + h * k3v;
    const k4v = f(a + h * k3a);
    const vOld = v;
    a += (h / 6) * (k1a + 2 * k2a + 2 * k3a + k4a);
    v += (h / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
    t += h;
    if (vOld > 0 && v <= 0) tTurn = t - (h * v) / (v - vOld);
    if (!(a > 0)) {
      end = 'crunch';
      tEnd = t;
      break;
    }
    const e2 = E2(m, a);
    const lhs = (v * v) / (a * a * H2);
    const scale = Math.max(Math.abs(e2), lhs, Math.abs(m.Om / a ** 3), Math.abs(m.Ode), 1e-6);
    maxC = Math.max(maxC, Math.abs(lhs - e2) / scale);
    T.push(t);
    A.push(a);
    V.push(v);
    if (dir > 0 && v < 0 && a < aMin) {
      end = 'crunch';
      // Radiation or matter dominate near the crunch: a ∝ τ^(1/2) or τ^(2/3). Close the gap with ȧ.
      const Hn = v / a;
      const rad = (2 * m.Or) / a ** 4 > m.Om / a ** 3;
      tEnd = t + (rad ? 0.5 : 2 / 3) / Math.abs(Hn);
      break;
    }
    if (dir < 0 && (a < aMin || v <= 0)) break;
    if (a > aMax) {
      const k = slopeLnH(m, Math.log(a));
      if (k > 1e-9) {
        end = 'rip';
        tEnd = t + 1 / (k * (v / a));
      }
      break;
    }
    if (Math.abs(t) >= tMax) break;
  }
  return { t: Float64Array.from(T), a: Float64Array.from(A), adot: Float64Array.from(V), n: T.length, end, tEnd, maxConstraint: maxC, tTurn };
}

// ---------------------------------------------------------------- log-time tables

export interface Future {
  m: Model;
  fate: Fate;
  /** Age today, Gyr. */
  t0: number;
  /** Time of the Rip or Crunch since the Big Bang (Gyr), or Infinity. */
  tEnd: number;
  /** Rows ordered in time. N = ln a, t since the Big Bang (Gyr), τ = time left (Gyr), η = conformal time (Gly). */
  N: Float64Array;
  t: Float64Array;
  tau: Float64Array;
  eta: Float64Array;
  n: number;
  /** ln a at turnaround (crunch), else NaN. */
  Nturn: number;
  /** Conformal time at t → ∞ or at the Rip. Finite means there is an event horizon. */
  etaEnd: number;
  /** For a forever-expanding universe: true if it accelerates for ever. */
  accelForever: boolean;
}

const N_PAST = -9;
const N_CRUNCH_MIN = -28;
/** Freeze tables run until 10^111 years. */
const T_FAR = 1e102;

/**
 * Exact integral of g(x) = exp(l0 + (l1 − l0)(x − x0)/dx) over one step of length dx.
 * The integrands dt/dN = 1/H and dη/dN = 1/(aH) are close to exponentials in N,
 * so this is far more accurate than a trapezoid when steps are long.
 */
function expStep(l0: number, l1: number, dx: number): number {
  const b = l1 - l0;
  if (Math.abs(b) < 1e-8) return Math.exp(l0) * dx * (1 + b / 2);
  return (Math.exp(l1) - Math.exp(l0)) * (dx / b);
}

/** Builds the time tables used by the scrubber and the scene, from the Big Bang to the end. */
export function buildFuture(m: Model): Future {
  const fate = classify(m);
  const H = h0Gyr(m.H0);
  const lnH0 = Math.log(H);
  const empty = new Float64Array(0);
  if (fate === 'nobang') {
    return { m, fate, t0: NaN, tEnd: NaN, N: empty, t: empty, tau: empty, eta: empty, n: 0, Nturn: NaN, etaEnd: NaN, accelForever: false };
  }
  const t0 = ageAt(m, 1);
  const lnH = (N: number) => lnH0 + 0.5 * lnE2(m, N);
  const Ns: number[] = [];
  const Ts: number[] = [];
  const Es: number[] = [];

  if (fate === 'crunch') {
    const Nt = turnaroundN(m);
    // N = Nt − s² makes dt/ds = 2s/H finite at the turnaround where H = 0.
    const sMax = Math.sqrt(Nt - N_CRUNCH_MIN);
    const nS = 3000;
    // g = −dE²/dN at the turnaround, where E² ≈ g s².
    const g = (E2(m, Math.exp(Nt - 1e-5)) - E2(m, Math.exp(Nt))) / 1e-5;
    const dtds = (s: number) => {
      if (s < 1e-9) return g > 0 ? 2 / (H * Math.sqrt(g)) : 0;
      const N = Nt - s * s;
      return (2 * s) / Math.exp(lnH(N));
    };
    const detads = (s: number) => dtds(s) * Math.exp(-(Nt - s * s));
    let t = ageAt(m, Math.exp(N_CRUNCH_MIN), 400);
    let eta = etaAt(m, Math.exp(N_CRUNCH_MIN), 400);
    const ds = sMax / nS;
    for (let i = nS; i >= 0; i--) {
      const s = i * ds;
      Ns.push(Nt - s * s);
      Ts.push(t);
      Es.push(eta);
      if (i > 0) {
        // Simpson on the sub-interval [s − ds, s].
        const sm = s - 0.5 * ds;
        t += (ds / 6) * (dtds(s) + 4 * dtds(sm) + dtds(s - ds));
        eta += (ds / 6) * (detads(s) + 4 * detads(sm) + detads(s - ds));
      }
    }
    const nUp = Ns.length;
    const tT = Ts[nUp - 1];
    const eT = Es[nUp - 1];
    const n = 2 * nUp - 1;
    const N = new Float64Array(n);
    const tt = new Float64Array(n);
    const tau = new Float64Array(n);
    const et = new Float64Array(n);
    for (let i = 0; i < nUp; i++) {
      N[i] = Ns[i];
      tt[i] = Ts[i];
      tau[i] = 2 * tT - Ts[i];
      et[i] = Es[i];
      const j = n - 1 - i;
      N[j] = Ns[i];
      tt[j] = 2 * tT - Ts[i];
      tau[j] = Ts[i];
      et[j] = 2 * eT - Es[i];
    }
    return { m, fate, t0, tEnd: 2 * tT, N, t: tt, tau, eta: et, n, Nturn: Nt, etaEnd: 2 * eT, accelForever: false };
  }

  // Freeze or rip: N increases monotonically.
  let N = N_PAST;
  let t = ageAt(m, Math.exp(N), 400);
  let eta = etaAt(m, Math.exp(N), 400);
  let l = lnH(N);
  const Ls: number[] = [];
  for (let guard = 0; guard < 60000; guard++) {
    Ns.push(N);
    Ts.push(t);
    Es.push(eta);
    Ls.push(l);
    const k = slopeLnH(m, N);
    // Steps: a small change of H, and at most a 1.5% change of t (so log-time lookups stay smooth).
    let dN = Math.max(0.004, 0.015 * Math.max(1, t * Math.exp(l)));
    if (Math.abs(k) > 1e-12) dN = Math.min(dN, 0.015 / Math.abs(k) + 0.004);
    if (fate === 'rip') dN = Math.min(dN, 0.02 / Math.max(k, 1e-4));
    const N1 = N + dN;
    const l1 = lnH(N1);
    t += expStep(-l, -l1, dN);
    eta += expStep(-l - N, -l1 - N1, dN);
    N = N1;
    l = l1;
    if (fate === 'freeze' && t > T_FAR) break;
    // Stop once the remaining time 1/(kH) is below 10⁻²⁹ yr.
    if (fate === 'rip' && k > 0 && l + Math.log(k) > Math.log(1e38)) break;
  }
  Ns.push(N);
  Ts.push(t);
  Es.push(eta);
  Ls.push(l);
  const n = Ns.length;
  const Nf = Float64Array.from(Ns);
  const tf = Float64Array.from(Ts);
  const ef = Float64Array.from(Es);
  const tau = new Float64Array(n);
  let tEnd = Infinity;
  let etaEnd = Infinity;
  let accelForever = false;
  if (fate === 'rip') {
    // Integrate the time left backwards from the last row, so it never suffers from cancellation.
    const kL = slopeLnH(m, Nf[n - 1]);
    tau[n - 1] = 1 / (kL * Math.exp(Ls[n - 1]));
    for (let i = n - 2; i >= 0; i--) tau[i] = tau[i + 1] + expStep(-Ls[i], -Ls[i + 1], Nf[i + 1] - Nf[i]);
    tEnd = tf[0] + tau[0];
    // Beyond the table, η adds at most ∫ dN/(aH) ≈ τ/a.
    etaEnd = ef[n - 1] + tau[n - 1] * Math.exp(-Nf[n - 1]);
    // Use the backward sum for t too near the end, and make both agree at the start.
    for (let i = 0; i < n; i++) tf[i] = tEnd - tau[i];
  } else {
    tau.fill(Infinity);
    const qEnd = -1 - slopeLnH(m, Nf[n - 1]);
    accelForever = qEnd < -1e-6;
    if (accelForever) etaEnd = ef[n - 1];
  }
  return { m, fate, t0, tEnd, N: Nf, t: tf, tau, eta: ef, n, Nturn: NaN, etaEnd, accelForever };
}

/** Index i with arr[i] <= x < arr[i+1] for an increasing array (clamped). */
function bracketUp(arr: Float64Array, n: number, x: number): number {
  if (x <= arr[0]) return 0;
  if (x >= arr[n - 1]) return n - 2;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= x) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Index i with arr[i] >= x > arr[i+1] for a decreasing array (clamped). */
function bracketDown(arr: Float64Array, n: number, x: number): number {
  if (x >= arr[0]) return 0;
  if (x <= arr[n - 1]) return n - 2;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] >= x) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** ln a at cosmic time t (Gyr). Beyond the table the last expansion rate is extrapolated. */
export function NatTime(F: Future, t: number): number {
  const i = bracketUp(F.t, F.n, t);
  const f = (t - F.t[i]) / (F.t[i + 1] - F.t[i]);
  return F.N[i] + Math.max(0, Math.min(1, f)) * (F.N[i + 1] - F.N[i]);
}

/** ln a when the time left before the Rip or Crunch is τ (Gyr). Interpolates in ln τ. */
export function NatTau(F: Future, tau: number): number {
  const i = bracketDown(F.tau, F.n, tau);
  const x0 = Math.log(F.tau[i]);
  const x1 = Math.log(F.tau[i + 1]);
  const f = (Math.log(tau) - x0) / (x1 - x0);
  return F.N[i] + Math.max(0, Math.min(1, f)) * (F.N[i + 1] - F.N[i]);
}

/** Row position (fractional index) for a cosmic time, for looking up η. */
function rowAtTime(F: Future, t: number): number {
  const i = bracketUp(F.t, F.n, t);
  const f = (t - F.t[i]) / (F.t[i + 1] - F.t[i]);
  return i + Math.max(0, Math.min(1, f));
}
function rowAtTau(F: Future, tau: number): number {
  const i = bracketDown(F.tau, F.n, tau);
  const x0 = Math.log(F.tau[i]);
  const x1 = Math.log(F.tau[i + 1]);
  const f = (Math.log(tau) - x0) / (x1 - x0);
  return i + Math.max(0, Math.min(1, f));
}
/** Fractional row for a moment given as cosmic time (freeze) or time left (rip, crunch). */
export function rowAt(F: Future, tOrTau: number): number {
  return F.fate === 'freeze' ? rowAtTime(F, tOrTau) : rowAtTau(F, tOrTau);
}
export function colAt(F: Future, col: Float64Array, row: number): number {
  const i = Math.min(F.n - 2, Math.max(0, Math.floor(row)));
  const f = row - i;
  return col[i] + f * (col[i + 1] - col[i]);
}

/**
 * ln(1 + z) of light arriving at fractional row `row` from a comoving distance chi (Gly).
 * Light left when η = η(row) − chi. NaN means the galaxy is beyond the particle horizon.
 */
export function lnOnePlusZ(F: Future, row: number, chi: number): number {
  const eNow = colAt(F, F.eta, row);
  const eE = eNow - chi;
  if (eE < F.eta[0]) return NaN;
  const i = bracketUp(F.eta, F.n, eE);
  const f = (eE - F.eta[i]) / (F.eta[i + 1] - F.eta[i]);
  const Ne = F.N[i] + Math.max(0, Math.min(1, f)) * (F.N[i + 1] - F.N[i]);
  return colAt(F, F.N, row) - Ne;
}

/** Comoving distance to the event horizon (Gly) at a given row, or Infinity if there is none. */
export function eventHorizonChi(F: Future, row: number): number {
  if (!Number.isFinite(F.etaEnd)) return Infinity;
  return Math.max(0, F.etaEnd - colAt(F, F.eta, row));
}

/** Hubble rate H/H0 at ln a (expanding branch magnitude). */
export const EofN = (m: Model, N: number) => Math.exp(0.5 * lnE2(m, N));

/** Scale factor where the radiation temperature T_CMB/a reaches T (K). */
export const aAtTemp = (T: number) => T_CMB / T;

/** a at time t (relative to today) on an RK4 run, by cubic Hermite interpolation with ȧ. */
export function aAtTime(o: Orbit, t: number): number {
  const up = o.t[o.n - 1] > o.t[0];
  let i = 0;
  for (; i < o.n - 2; i++) if (up ? o.t[i + 1] >= t : o.t[i + 1] <= t) break;
  const h = o.t[i + 1] - o.t[i];
  const s = (t - o.t[i]) / h;
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * o.a[i] + (s3 - 2 * s2 + s) * h * o.adot[i] + (-2 * s3 + 3 * s2) * o.a[i + 1] + (s3 - s2) * h * o.adot[i + 1];
}
