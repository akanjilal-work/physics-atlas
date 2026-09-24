// Slow-roll inflation. Pure math, no DOM.
//
// Units: reduced Planck units, M_p = (8πG)^(-1/2) = 1, ħ = c = 1.
// Friedmann: H² = (φ̇²/2 + V + ρ_r)/3.  Field: φ̈ + 3Hφ̇ + V'(φ) = 0.
// Each potential is written with its overall scale set to one (m = 1 for m²φ²/2,
// V₀ = 1 for the Starobinsky plateau). The true scale only rescales time, so it
// cannot change N, ε, η, n_s or r. It is fixed afterwards by the measured
// amplitude of the fluctuations (calibrate()).

export type PotId = 'starobinsky' | 'quadratic';

export const SQ23 = Math.sqrt(2 / 3);
/** Reduced Planck mass in GeV. */
export const MP_GEV = 2.435e18;
/** Planck 2018 scalar amplitude A_s (ln(10¹⁰A_s) = 3.044). */
export const AS = 2.1e-9;
/** Planck 2018 (TT,TE,EE+lowE+lensing) spectral index and 1σ error. */
export const NS_PLANCK = 0.9649;
export const NS_SIGMA = 0.0042;
/** BICEP/Keck 2021 (BK18) 95% upper limit on r at k = 0.05 Mpc⁻¹. */
export const R_BOUND = 0.036;
/** H₀ = 67.4 km/s/Mpc expressed in GeV (100 km/s/Mpc = 2.1332e-42 GeV). */
export const H0_KMS = 67.4;
export const H0_GEV = 2.1332e-42 * (H0_KMS / 100);
export const OMEGA_R = 9.2e-5;
export const OMEGA_M = 0.315;
export const OMEGA_L = 1 - OMEGA_M - OMEGA_R;
/** Pivot scale k★ = 0.05 Mpc⁻¹ in units of today's a₀H₀ = H₀/c. */
export const K_PIVOT = 0.05 / (H0_KMS / 299792.458);
/** A galaxy-cluster sized scale, k = 1 Mpc⁻¹, in units of a₀H₀. */
export const K_GALAXY = 1 / (H0_KMS / 299792.458);

export interface Potential {
  id: PotId;
  V(phi: number): number;
  dV(phi: number): number;
  d2V(phi: number): number;
  /** Field value where the slow-roll ε_V reaches 1. */
  phiEnd: number;
  /** Slow-roll e-folds from phi down to phiEnd: N = ∫ V/V' dφ. */
  Nsr(phi: number): number;
  /** Inverse of Nsr: the field value N e-folds before the end. */
  phiAtN(N: number): number;
  /** Mass of oscillations about the minimum, √V''(min). */
  mass: number;
}

const quadratic: Potential = {
  id: 'quadratic',
  V: (p) => 0.5 * p * p,
  dV: (p) => p,
  d2V: () => 1,
  phiEnd: Math.SQRT2,
  Nsr: (p) => (p * p - 2) / 4,
  phiAtN: (N) => Math.sqrt(4 * N + 2),
  mass: 1,
};

// Starobinsky (R + R²) in the Einstein frame: V = V₀(1 − e^{−√(2/3)φ})².
const X_END = Math.log(1 + 2 / Math.sqrt(3));
const G_END = Math.exp(X_END) - X_END;
const starobinsky: Potential = {
  id: 'starobinsky',
  V: (p) => {
    const w = 1 - Math.exp(-SQ23 * p);
    return w * w;
  },
  dV: (p) => {
    const u = Math.exp(-SQ23 * p);
    return 2 * SQ23 * (1 - u) * u;
  },
  d2V: (p) => {
    const u = Math.exp(-SQ23 * p);
    return (4 / 3) * u * (2 * u - 1);
  },
  phiEnd: X_END / SQ23,
  Nsr: (p) => {
    const x = SQ23 * p;
    return 0.75 * (Math.exp(x) - x - G_END);
  },
  phiAtN: (N) => {
    const C = (4 / 3) * N + G_END;
    let x = Math.log(C + Math.log(Math.max(1.0001, C)));
    for (let i = 0; i < 40; i++) {
      const ex = Math.exp(x);
      const dx = (ex - x - C) / (ex - 1);
      x -= dx;
      if (Math.abs(dx) < 1e-14) break;
    }
    return x / SQ23;
  },
  mass: Math.sqrt(4 / 3),
};

export const POTENTIALS: Record<PotId, Potential> = { quadratic, starobinsky };

/** Potential slow-roll parameter ε_V = ½(V'/V)². */
export function epsV(p: Potential, phi: number): number {
  const r = p.dV(phi) / p.V(phi);
  return 0.5 * r * r;
}
/** Potential slow-roll parameter η_V = V''/V. */
export function etaV(p: Potential, phi: number): number {
  return p.d2V(phi) / p.V(phi);
}

export interface SRObs {
  phi: number;
  eps: number;
  eta: number;
  ns: number;
  r: number;
}

/** First-order slow-roll predictions for the mode that left the horizon N e-folds before the end. */
export function srObs(p: Potential, N: number): SRObs {
  const phi = p.phiAtN(N);
  const eps = epsV(p, phi);
  const eta = etaV(p, phi);
  return { phi, eps, eta, ns: 1 - 6 * eps + 2 * eta, r: 16 * eps };
}

/** Curvature power P_R = V/(24π² ε) in units where V is in M_p⁴. */
export function powerR(p: Potential, lam: number, phi: number): number {
  return (lam * p.V(phi)) / (24 * Math.PI * Math.PI * epsV(p, phi));
}

export interface Calib {
  /** Overall scale: V_true = lam × V_model (in M_p⁴). */
  lam: number;
  /** e-folds before the end when today's Hubble scale left the horizon. */
  Nneed: number;
  /** e-folds before the end when the pivot k★ = 0.05 Mpc⁻¹ left. */
  Nstar: number;
  phiStar: number;
  eps: number;
  eta: number;
  ns: number;
  r: number;
  /** Energy scale V★^{1/4} in GeV. */
  Vq: number;
  /** H at the end of inflation, in GeV. */
  HendGeV: number;
  /** Scale factor at the end of inflation (today a = 1). */
  aEnd: number;
}

/**
 * Fix the true height of the potential from A_s, then find how many e-folds are
 * needed. Assumes instant reheating into radiation and ignores changes in the
 * number of particle species. Those shift N by about one.
 */
export function calibrate(p: Potential): Calib {
  let Nstar = 55;
  let Nneed = 60;
  let lam = 1;
  let HendGeV = 0;
  let aEnd = 0;
  for (let it = 0; it < 8; it++) {
    const phiS = p.phiAtN(Nstar);
    lam = (AS * 24 * Math.PI * Math.PI * epsV(p, phiS)) / p.V(phiS);
    // At the end, ε_H = 1 means φ̇² = V, so ρ = 3V/2 and H² = V/2.
    HendGeV = Math.sqrt((lam * 1.5 * p.V(p.phiEnd)) / 3) * MP_GEV;
    // Radiation from then on: H = H₀ √Ω_r a⁻², matched at the end.
    aEnd = Math.sqrt((H0_GEV * Math.sqrt(OMEGA_R)) / HendGeV);
    const phiK = p.phiAtN(Nneed);
    const HkGeV = Math.sqrt((lam * p.V(phiK)) / 3) * MP_GEV;
    // Mode k = a₀H₀ exits when a_k H_k = a₀H₀, and N = ln(a_end/a_k).
    Nneed = Math.log((aEnd * HkGeV) / H0_GEV);
    Nstar = Nneed - Math.log(K_PIVOT);
  }
  const o = srObs(p, Nstar);
  return {
    lam, Nneed, Nstar, phiStar: o.phi, eps: o.eps, eta: o.eta, ns: o.ns, r: o.r,
    Vq: Math.pow(lam * p.V(o.phi), 0.25) * MP_GEV, HendGeV, aEnd,
  };
}

/** e-folds needed for the mode k = a₀H₀ at a given energy scale (GeV), instant reheating, V_k ≈ ρ_end. */
export function efoldsForScale(rhoQuarterGeV: number): number {
  const H = Math.sqrt(rhoQuarterGeV ** 4 / 3) / MP_GEV;
  const aEnd = Math.sqrt((H0_GEV * Math.sqrt(OMEGA_R)) / H);
  return Math.log((aEnd * H) / H0_GEV);
}

export interface Run {
  pot: PotId;
  n: number;
  dt: number;
  t: Float64Array;
  phi: Float64Array;
  dphi: Float64Array;
  N: Float64Array;
  H: Float64Array;
  rhoR: Float64Array;
  /** Index of the first sample after inflation ended (ε_H ≥ 1). */
  iEnd: number;
  tEnd: number;
  NEnd: number;
  phiEndNum: number;
  tMax: number;
}

export interface SolveOpts {
  dt?: number;
  /** Decay rate of the inflaton into radiation, in units of its mass, switched on after inflation. */
  gamma?: number;
  /** Oscillation periods to follow after inflation ends. */
  periodsAfter?: number;
  maxSteps?: number;
}

export function hubble(p: Potential, phi: number, dphi: number, rhoR: number): number {
  return Math.sqrt(Math.max(0, (0.5 * dphi * dphi + p.V(phi) + rhoR) / 3));
}

/** ε_H = −Ḣ/H² = (φ̇² + 4ρ_r/3)/(2H²). Inflation (ä > 0) while ε_H < 1. */
export function epsH(p: Potential, phi: number, dphi: number, rhoR: number): number {
  const H = hubble(p, phi, dphi, rhoR);
  return (dphi * dphi + (4 / 3) * rhoR) / (2 * H * H);
}

/**
 * Integrate the full equations with fixed-step RK4 in cosmic time, starting on the
 * slow-roll attractor φ̇ = −V'/(3H). After ε_H first reaches 1, a decay term Γφ̇
 * (Γ = gamma × mass) feeds a radiation bath: a simple model of reheating.
 */
export function solve(p: Potential, phi0: number, opts: SolveOpts = {}): Run {
  const dt = opts.dt ?? 0.01;
  const gamma = (opts.gamma ?? 0.12) * p.mass;
  const periods = opts.periodsAfter ?? 7;
  const maxSteps = opts.maxSteps ?? 400000;
  const T: number[] = [];
  const P: number[] = [];
  const D: number[] = [];
  const NN: number[] = [];
  const HH: number[] = [];
  const RR: number[] = [];

  let phi = phi0;
  let dphi = -p.dV(phi0) / (3 * Math.sqrt(p.V(phi0) / 3));
  let N = 0;
  let rr = 0;
  let t = 0;
  let G = 0;
  let iEnd = -1;
  let tEnd = 0;
  let NEnd = 0;
  let phiEndNum = phi0;
  let tStop = Infinity;

  const f = (y0: number, y1: number, y3: number, out: number[]) => {
    const H = hubble(p, y0, y1, y3);
    out[0] = y1;
    out[1] = -(3 * H + G) * y1 - p.dV(y0);
    out[2] = H;
    out[3] = -4 * H * y3 + G * y1 * y1;
  };
  const k1 = [0, 0, 0, 0];
  const k2 = [0, 0, 0, 0];
  const k3 = [0, 0, 0, 0];
  const k4 = [0, 0, 0, 0];

  let prevEps = epsH(p, phi, dphi, rr);
  if (prevEps >= 1) {
    iEnd = 0;
    tStop = periods * ((2 * Math.PI) / p.mass);
    G = gamma;
  }
  for (let s = 0; s < maxSteps; s++) {
    T.push(t);
    P.push(phi);
    D.push(dphi);
    NN.push(N);
    HH.push(hubble(p, phi, dphi, rr));
    RR.push(rr);
    if (t >= tStop) break;
    f(phi, dphi, rr, k1);
    f(phi + 0.5 * dt * k1[0], dphi + 0.5 * dt * k1[1], rr + 0.5 * dt * k1[3], k2);
    f(phi + 0.5 * dt * k2[0], dphi + 0.5 * dt * k2[1], rr + 0.5 * dt * k2[3], k3);
    f(phi + dt * k3[0], dphi + dt * k3[1], rr + dt * k3[3], k4);
    const nphi = phi + (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    const ndphi = dphi + (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    const nN = N + (dt / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
    const nrr = Math.max(0, rr + (dt / 6) * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]));
    const nt = t + dt;
    if (iEnd < 0) {
      const e = epsH(p, nphi, ndphi, nrr);
      if (e >= 1) {
        const w = (1 - prevEps) / (e - prevEps);
        tEnd = t + w * dt;
        NEnd = N + w * (nN - N);
        phiEndNum = phi + w * (nphi - phi);
        iEnd = s + 1;
        tStop = tEnd + periods * ((2 * Math.PI) / p.mass);
        G = gamma;
      }
      prevEps = e;
    }
    phi = nphi;
    dphi = ndphi;
    N = nN;
    rr = nrr;
    t = nt;
  }
  if (iEnd < 0) {
    iEnd = T.length - 1;
    tEnd = t;
    NEnd = N;
    phiEndNum = phi;
  }
  return {
    pot: p.id,
    n: T.length,
    dt,
    t: Float64Array.from(T),
    phi: Float64Array.from(P),
    dphi: Float64Array.from(D),
    N: Float64Array.from(NN),
    H: Float64Array.from(HH),
    rhoR: Float64Array.from(RR),
    iEnd,
    tEnd,
    NEnd,
    phiEndNum,
    tMax: t,
  };
}

/** Fractional sample index at time t (clamped). */
export function idxAtT(run: Run, t: number): number {
  return Math.max(0, Math.min(run.n - 1.000001, t / run.dt));
}

/** Fractional sample index where N(t) = N (N is monotonic). */
export function idxAtN(run: Run, N: number): number {
  const a = run.N;
  if (N <= a[0]) return 0;
  if (N >= a[run.n - 1]) return run.n - 1.000001;
  let lo = 0;
  let hi = run.n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (a[m] <= N) lo = m;
    else hi = m;
  }
  return lo + (N - a[lo]) / (a[hi] - a[lo] || 1);
}

/** Linear interpolation of one run array at a fractional index. */
export function lerpAt(arr: Float64Array, fi: number): number {
  const i = Math.floor(fi);
  const f = fi - i;
  const j = Math.min(arr.length - 1, i + 1);
  return arr[i] + f * (arr[j] - arr[i]);
}

/**
 * log₁₀|Ω − 1| relative to its value at the start (taken as 1).
 * With fixed curvature, |Ω − 1| = |k|/(aH)², so it scales as (a₀H₀/aH)².
 */
export function log10Flatness(run: Run, fi: number): number {
  const N = lerpAt(run.N, fi);
  const H = lerpAt(run.H, fi);
  return (-2 * N) / Math.LN10 + 2 * Math.log10(run.H[0] / H);
}

/** Dimensionless Hubble rate today, E(a) = H/H₀, for flat ΛCDM with radiation. */
export function Ea(a: number): number {
  return Math.sqrt(OMEGA_R / (a * a * a * a) + OMEGA_M / (a * a * a) + OMEGA_L);
}

export interface HorizonCurve {
  /** log₁₀ a (today a = 1). */
  x: Float64Array;
  /** log₁₀ of the comoving Hubble radius (aH)⁻¹ in units of today's c/H₀. */
  y: Float64Array;
  /** Era of each point: 0 inflation, 1 radiation, 2 matter, 3 dark energy. */
  era: Uint8Array;
  /** Number of points in the inflation segment. */
  nInf: number;
}

/** Comoving Hubble radius from the start of inflation to a little past today. */
export function horizonCurve(run: Run, cal: Calib, nInf = 240, nPost = 260, xFuture = 0.6): HorizonCurve {
  const x: number[] = [];
  const y: number[] = [];
  const era: number[] = [];
  const HtoGeV = Math.sqrt(cal.lam) * MP_GEV;
  const lnAEnd = Math.log(cal.aEnd);
  const iMax = Math.max(1, run.iEnd);
  for (let k = 0; k < nInf; k++) {
    const i = Math.min(iMax, Math.round((k / (nInf - 1)) * iMax));
    const lnA = lnAEnd + (run.N[i] - run.NEnd);
    const H = run.H[i] * HtoGeV;
    x.push(lnA / Math.LN10);
    y.push(Math.log10(H0_GEV / (Math.exp(lnA) * H)));
    era.push(0);
  }
  const x0 = Math.log10(cal.aEnd);
  const aEq = OMEGA_R / OMEGA_M;
  const aL = Math.cbrt(OMEGA_M / OMEGA_L);
  for (let k = 1; k <= nPost; k++) {
    const lx = x0 + ((xFuture - x0) * k) / nPost;
    const a = 10 ** lx;
    x.push(lx);
    y.push(-Math.log10(a * Ea(a)));
    era.push(a < aEq ? 1 : a < aL ? 2 : 3);
  }
  return { x: Float64Array.from(x), y: Float64Array.from(y), era: Uint8Array.from(era), nInf };
}

/** Horizon exit (on the inflation branch) and re-entry (afterwards) of comoving scale k in units of a₀H₀. */
export function crossings(c: HorizonCurve, k: number): { exit: number; reentry: number; exitX: number; reentryX: number } {
  const yk = -Math.log10(k);
  let exit = -1;
  let reentry = -1;
  for (let i = 1; i < c.nInf; i++) {
    if (c.y[i - 1] >= yk && c.y[i] < yk) {
      exit = i - 1 + (c.y[i - 1] - yk) / (c.y[i - 1] - c.y[i]);
      break;
    }
  }
  for (let i = c.nInf; i < c.x.length; i++) {
    if (c.y[i - 1] < yk && c.y[i] >= yk) {
      reentry = i - 1 + (yk - c.y[i - 1]) / (c.y[i] - c.y[i - 1]);
      break;
    }
  }
  const xAt = (fi: number) => {
    if (fi < 0) return NaN;
    const i = Math.floor(fi);
    const j = Math.min(c.x.length - 1, i + 1);
    return c.x[i] + (fi - i) * (c.x[j] - c.x[i]);
  };
  return { exit, reentry, exitX: xAt(exit), reentryX: xAt(reentry) };
}
