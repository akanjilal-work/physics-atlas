// Big Bang nucleosynthesis: freeze-out, neutron decay, the deuterium bottleneck
// and a small reaction network for n, p, D, ³H, ³He, ⁴He, ⁷Li and ⁷Be.
// Pure math, no DOM. Temperatures in MeV unless the name says T9 (10⁹ K).
//
// The network is a simplified version of the Wagoner / Kawano codes:
//  * 16 reactions (plus their reverses where they matter), not the ~90 of a full code.
//  * Rate fits: n ↔ p weak rates from Kawano's NUC123 fit; nuclear rates from
//    Serpico et al. (2004), Coc et al. (2015, tabulated), Cyburt et al. (2008),
//    Caughlan & Fowler (1988), Wagoner (1969), Ando et al. (2006) and NACRE (1999),
//    as compiled in the open-source AlterBBN code.
//  * Instantaneous neutrino decoupling, no QED plasma corrections, no Coulomb or
//    finite-mass corrections to the weak rates.
// It lands within a few percent of full codes for Y_p and within about 10% for D/H.

export const Q_NP = 1.293; // m_n − m_p, MeV
export const B_D = 2.2246; // deuteron binding energy, MeV
export const M_E = 0.511; // electron mass, MeV
export const M_N = 939.0; // nucleon mass, MeV
export const TAU_N = 878.4; // PDG 2024 mean neutron lifetime, s
export const T9_PER_MEV = 11.6045; // 1 MeV = 1.16045e10 K
const M_PL = 1.22089e22; // Planck mass, MeV
const HBAR = 6.582119e-22; // MeV s

// ---- Observations (for the Schramm plot and challenges) ---------------------
/** Planck 2018 (TT,TE,EE+lowE+lensing): Ω_b h² = 0.02237 ± 0.00015, η₁₀ = 273.9 Ω_b h². */
export const ETA_PLANCK = 6.13e-10;
export const ETA_PLANCK_SIG = 0.04e-10;
/** Cooke, Pettini & Steidel (2018): D/H = (2.527 ± 0.030) × 10⁻⁵. */
export const DH_OBS = 2.527e-5;
export const DH_OBS_SIG = 0.03e-5;
/** PDG review: Y_p = 0.245 ± 0.003 from metal-poor H II regions. */
export const YP_OBS = 0.245;
export const YP_OBS_SIG = 0.003;
/** Spite plateau, Sbordone et al. (2010): Li/H = (1.6 ± 0.3) × 10⁻¹⁰. */
export const LI_OBS = 1.6e-10;
export const LI_OBS_SIG = 0.3e-10;

// ---- Simple closed forms ----------------------------------------------------
/** Equilibrium neutron-to-proton ratio at temperature T (MeV). */
export function npEquilibrium(T: number): number {
  return Math.exp(-Q_NP / T);
}

/** Helium mass fraction if every surviving neutron ends up in ⁴He. */
export function heliumFromNP(np: number): number {
  return (2 * np) / (1 + np);
}

/** n/p after free neutron decay for time t (s), starting from np0. */
export function npAfterDecay(np0: number, t: number, tau = TAU_N): number {
  const n = np0 * Math.exp(-t / tau);
  const p = 1 + np0 - n;
  return n / p;
}

/**
 * Temperature (MeV) at which the Saha ratio X_D/(X_n X_p) reaches one:
 * 8.14 η (T/m_N)^{3/2} e^{B_D/T} = 1. Solved by bisection.
 */
export function sahaDeuteriumT(eta: number): number {
  const f = (T: number) => Math.log(8.14 * eta) + 1.5 * Math.log(T / M_N) + B_D / T;
  let lo = 0.01;
  let hi = 1;
  for (let i = 0; i < 80; i++) {
    const mid = 0.5 * (lo + hi);
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

// ---- Thermal history --------------------------------------------------------
// e± energy density and pressure for g = 4, as multiples of T⁴.
function epm(x: number): { rho: number; P: number } {
  const N = 240;
  const umax = 40;
  const h = umax / N;
  let sr = 0;
  let sp = 0;
  for (let i = 0; i <= N; i++) {
    const u = i * h;
    const E = Math.sqrt(u * u + x * x);
    const fd = 1 / (Math.exp(E) + 1);
    const w = i === 0 || i === N ? 1 : i % 2 ? 4 : 2;
    sr += w * u * u * E * fd;
    sp += w * (E > 0 ? (u ** 4 / E) * fd : 0);
  }
  sr *= h / 3;
  sp *= h / 3;
  return { rho: (2 / Math.PI ** 2) * sr, P: (2 / (3 * Math.PI ** 2)) * sp };
}

export interface Cosmology {
  Nnu: number;
  /** Time since the bang (s) at photon temperature T (MeV). */
  tOfT(T: number): number;
  /** Photon temperature (MeV) at time t (s). */
  TofT(t: number): number;
  /** Entropy degrees of freedom of photons + e± (2 today, 5.5 when hot). */
  gs(T: number): number;
  /** Neutrino temperature (MeV). */
  Tnu(T: number): number;
  /** Hubble rate (1/s). */
  H(T: number): number;
}

const cosmoCache = new Map<number, Cosmology>();

/** Radiation-era thermal history with Nν neutrino species (instant decoupling). */
export function cosmology(Nnu: number): Cosmology {
  const hit = cosmoCache.get(Nnu);
  if (hit) return hit;
  const NT = 400;
  const lnHi = Math.log(20);
  const lnLo = Math.log(1e-3);
  const lnT = new Float64Array(NT);
  const gsA = new Float64Array(NT);
  const rhoA = new Float64Array(NT);
  const tA = new Float64Array(NT);
  const g = (x: number) => {
    const e = epm(x);
    return { gs: 2 + (e.rho + e.P) / ((2 * Math.PI ** 2) / 45) / 1, rhoE: e.rho };
  };
  for (let i = 0; i < NT; i++) {
    lnT[i] = lnHi + ((lnLo - lnHi) * i) / (NT - 1);
    const T = Math.exp(lnT[i]);
    const r = g(M_E / T);
    gsA[i] = r.gs;
    const tnu = T * Math.cbrt(r.gs / 5.5);
    const rho = ((Math.PI ** 2) / 30) * 2 * T ** 4 + r.rhoE * T ** 4 + Nnu * (7 / 8) * 2 * ((Math.PI ** 2) / 30) * tnu ** 4;
    rhoA[i] = rho;
  }
  const Hof = (rho: number) => Math.sqrt((8 * Math.PI * rho) / 3) / M_PL / HBAR;
  tA[0] = 1 / (2 * Hof(rhoA[0]));
  for (let i = 1; i < NT; i++) {
    // ln a = −ln T − ⅓ ln g_s + const
    const dlna = -(lnT[i] - lnT[i - 1]) - (Math.log(gsA[i]) - Math.log(gsA[i - 1])) / 3;
    const Hm = 0.5 * (Hof(rhoA[i]) + Hof(rhoA[i - 1]));
    tA[i] = tA[i - 1] + dlna / Hm;
  }
  const lnt = Array.from(tA, Math.log);
  const interp = (xs: ArrayLike<number>, ys: ArrayLike<number>, x: number, asc: boolean): number => {
    const n = xs.length;
    if (asc ? x <= xs[0] : x >= xs[0]) return ys[0];
    if (asc ? x >= xs[n - 1] : x <= xs[n - 1]) return ys[n - 1];
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (asc ? xs[m] <= x : xs[m] >= x) lo = m;
      else hi = m;
    }
    const u = (x - xs[lo]) / (xs[hi] - xs[lo]);
    return ys[lo] + u * (ys[hi] - ys[lo]);
  };
  const c: Cosmology = {
    Nnu,
    tOfT: (T) => {
      const l = Math.log(T);
      if (l > lnHi) return tA[0] * Math.exp(2 * (lnHi - l));
      if (l < lnLo) return tA[NT - 1] * Math.exp(2 * (lnLo - l));
      return Math.exp(interp(lnT, lnt, l, false));
    },
    TofT: (t) => {
      const l = Math.log(t);
      if (l < lnt[0]) return Math.exp(lnHi - 0.5 * (l - lnt[0]));
      if (l > lnt[NT - 1]) return Math.exp(lnLo - 0.5 * (l - lnt[NT - 1]));
      return Math.exp(interp(lnt, lnT, l, true));
    },
    gs: (T) => interp(lnT, gsA, Math.log(Math.min(20, Math.max(1e-3, T))), false),
    Tnu: (T) => T * Math.cbrt(c.gs(T) / 5.5),
    H: (T) => Hof(Math.exp(interp(lnT, Array.from(rhoA, Math.log), Math.log(T), false))),
  };
  cosmoCache.set(Nnu, c);
  return c;
}

/** Baryon density (g/cm³) at photon temperature T9 for today's baryon-to-photon ratio η. */
export function rhoBaryon(eta: number, T9: number, gs: number): number {
  return 3.3683e4 * eta * T9 ** 3 * (gs / 2);
}

// ---- Weak rates (Kawano NUC123 fit, finite electron mass) ---------------------
const WA = [0.15735, 0.4617e1, -0.4052e2, 0.13875e3, -0.59898e2, 0.66752e2, -0.16705e2, 0.38071e1, -0.3914, 0.2359e-1, -0.83696e-4, -0.42095e-4, 0.17675e-5];
const WB = [0.22211e2, -0.72798e2, 0.11571e3, -0.11763e2, 0.45521e2, -0.37973e1, 0.41266, -0.2621e-1, 0.87934e-3, -0.12016e-4];

/** n → p rate (1/s), including free decay. Tends to 1/τ_n at low temperature. */
export function lambdaNP(T9: number, tau = TAU_N): number {
  const z = 5.929862 / T9;
  let s = 1;
  let zi = 1;
  for (let i = 0; i < 13; i++) {
    zi /= z;
    s += WA[i] * zi;
  }
  return (s * Math.exp(-0.33979 / z)) / tau;
}

/** p → n rate (1/s). */
export function lambdaPN(T9: number, tau = TAU_N): number {
  const z = 5.929862 / T9;
  if (z >= 5.10999) return 0;
  let s = -0.62173;
  let zi = 1;
  for (let i = 0; i < 10; i++) {
    zi /= z;
    s += WB[i] * zi;
  }
  return (s * Math.exp(-2.8602 * z)) / tau;
}

// ---- Nuclear rates N_A<σv> (cm³ mol⁻¹ s⁻¹) ------------------------------------
const pw = Math.pow;
const ex = Math.exp;

// Coc et al. (2015) tabulations as in AlterBBN, log-log interpolated. T9 nodes shared.
const TAB_T9 = [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1, 0.12, 0.14, 0.16, 0.18, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10];
const TAB_DP = [1.506e-3, 3.659e-2, 0.1701, 0.4476, 0.8915, 1.51, 2.302, 3.265, 4.392, 5.676, 8.685, 12.24, 16.28, 20.76, 25.65, 39.41, 55.05, 72.25, 90.76, 110.4, 131, 174.8, 221.2, 270, 320.7, 372.9, 509.3, 652.2, 800, 951.7, 1265, 1587, 1914, 2244, 2905, 3557, 4194, 4812, 5410, 5988];
const TAB_DDN = [24.24, 931, 5301, 15680, 33690, 60130, 95270, 1.39e5, 1.912e5, 2.513e5, 3.938e5, 5.631e5, 7.559e5, 9.691e5, 1.2e6, 1.842e6, 2.555e6, 3.318e6, 4.119e6, 4.946e6, 5.792e6, 7.517e6, 9.26e6, 1.1e7, 1.272e7, 1.442e7, 1.85e7, 2.235e7, 2.595e7, 2.932e7, 3.546e7, 4.093e7, 4.585e7, 5.031e7, 5.816e7, 6.488e7, 7.072e7, 7.583e7, 8.037e7, 8.437e7];
const TAB_DDP = [24.58, 934.3, 5276, 15490, 33070, 58680, 92460, 1.343e5, 1.837e5, 2.404e5, 3.737e5, 5.304e5, 7.072e5, 9.011e5, 1.11e6, 1.682e6, 2.309e6, 2.974e6, 3.663e6, 4.371e6, 5.089e6, 6.543e6, 8.001e6, 9.448e6, 1.087e7, 1.228e7, 1.565e7, 1.88e7, 2.181e7, 2.461e7, 2.976e7, 3.44e7, 3.863e7, 4.251e7, 4.946e7, 5.552e7, 6.077e7, 6.529e7, 6.912e7, 7.228e7];
const LT = TAB_T9.map(Math.log);
const tabInterp = (tab: number[], T9: number): number => {
  const l = Math.log(Math.min(10, Math.max(0.01, T9)));
  let i = 0;
  while (i < LT.length - 2 && LT[i + 1] < l) i++;
  const u = (l - LT[i]) / (LT[i + 1] - LT[i]);
  return Math.exp(Math.log(tab[i]) + u * (Math.log(tab[i + 1]) - Math.log(tab[i])));
};

export const RATE = {
  /** p(n,γ)d, Ando et al. 2006. */
  npg: (T: number) =>
    T <= 1.5
      ? (44216 * (1 + 3.75191 * T + 1.92934 * T * T + 0.746503 * T ** 3 + 0.0197023 * T ** 4 + 3.00491e-6 * T ** 5)) /
        (1 + 5.4678 * T + 5.62395 * T * T + 0.489312 * T ** 3 + 0.00747806 * T ** 4)
      : (1 - Math.sqrt(T) * 0.8504 + T * 0.4895 - pw(T, 1.5) * 0.09623 + T * T * 0.008471 - T * 2.8e-4 * pw(T, 1.5)) * 47420,
  /** d(n,γ)t, Wagoner 1969. */
  dng: (T: number) => (T * 18.9 + 1) * 66.2,
  /** ³He(n,γ)⁴He, Wagoner 1969. */
  hng: (T: number) => (T * 905 + 1) * 6.62,
  /** ³He(n,p)t, Serpico et al. 2004. */
  hnp: (T: number) =>
    T < 2.5
      ? 7.064935e8 + 6.733213571736319e8 * T + 1.7181155480346258e9 * T * T - 4.5367658146835446e8 * T ** 3 - 1.2216728981712557e8 * T ** 4 -
        4.92736677238425e8 * Math.sqrt(T) - 1.3659670893994067e9 * pw(T, 1.5) - 6.629932739639357e8 * pw(T, 2.5) + 4.834951929033479e8 * pw(T, 3.5)
      : 4.81732e8,
  /** ⁷Be(n,p)⁷Li, Serpico et al. 2004. */
  benp: (T: number) =>
    T < 2.5
      ? 6.8423032e9 + 1.7674863e10 * T + 2.6622006e9 * T * T - 3.3561608e8 * T ** 3 - 5.9309139e6 * T ** 4 - 1.4987996e10 * Math.sqrt(T) -
        1.0576906e10 * pw(T, 1.5) + 2.7447598e8 * pw(T, 2.5) + 7.6425157e7 * pw(T, 3.5) - (2.282944e7 * pw(T, -1.5)) / ex(0.050351813 / T)
      : 1.28039e9,
  /** d(p,γ)³He, Coc et al. 2015 table. */
  dpg: (T: number) => tabInterp(TAB_DP, T),
  /** t(p,γ)⁴He, Caughlan & Fowler 1988. */
  tpg: (T: number) =>
    pw(T, -2 / 3) * 2.2e4 * ex(-3.869 / pw(T, 1 / 3)) * (1 + 0.108 * pw(T, 1 / 3) + 1.68 * pw(T, 2 / 3) + 1.26 * T + 0.551 * pw(T, 4 / 3) + 1.06 * pw(T, 5 / 3)),
  /** ⁷Li(p,α)⁴He, Serpico et al. 2004. */
  lipa: (T: number) =>
    T < 2.5
      ? ((-8.9654123e7 - 2.5851582e8 * T - 2.6831252e7 * T * T + 3.8691673e8 * pw(T, 1 / 3) + 4.9721269e8 * pw(T, 2 / 3) + 2.6444808e7 * pw(T, 4 / 3) -
          1.2946419e6 * pw(T, 5 / 3) - 1.0941088e8 * pw(T, 7 / 3) + 9.9899564e7 * pw(T, 8 / 3)) *
          pw(T, -2 / 3)) /
          ex(7.73389632 * pw(T, -1 / 3)) +
        ex(-1.137519 * T * T - 8.6256687 * pw(T, -1 / 3)) *
          (3.0014189e7 - 1.8366119e8 * T + 1.7688138e9 * T * T - 8.4772261e9 * T ** 3 + 2.0237351e10 * T ** 4 - 1.9650068e10 * T ** 5 + 7.9452762e8 * T ** 6 +
            1.3132468e10 * T ** 7 - 8.209351e9 * T ** 8 - 9.1099236e8 * T ** 9 + 2.7814079e9 * T ** 10 - 1.0785293e9 * T ** 11 + 1.3993392e8 * T ** 12) *
          pw(T, -2 / 3)
      : 1.53403e6 + 84516.7,
  /** t(α,γ)⁷Li, Serpico et al. 2004. */
  tag: (T: number) =>
    T < 2.5
      ? ((0.094614248 - 4.9273133 * T + 99.358965 * T * T - 989.81236 * T ** 3 + 4368.45 * T ** 4 + 931.93597 * T ** 5 - 391.07855 * T ** 6 + 159.23101 * T ** 7 -
          34.407594 * T ** 8 + 3.3919004 * T ** 9 + 0.017556217 * T ** 10 - 0.036253427 * T ** 11 + 0.0031118827 * T ** 12 - 0.00008714468 * T ** 13) *
          pw(T, -0.5)) /
        (ex(8.4e-7 * T) * pw(1 + 1.78616593 * T, 3))
      : 807.406,
  /** ³He(α,γ)⁷Be, Cyburt & Davids 2008. */
  hag: (T: number) =>
    ex(15.609867 - 12.82707707 / pw(T, 1 / 3) - (2 / 3) * Math.log(T)) *
    ((1 - 0.020478 * pw(T, 2 / 3) + 0.211995 * pw(T, 4 / 3)) / (1 + 0.255059 * pw(T, 2 / 3) + 0.338573 * pw(T, 4 / 3))),
  /** d(d,n)³He, Coc et al. 2015 table. */
  ddn: (T: number) => tabInterp(TAB_DDN, T),
  /** d(d,p)t, Coc et al. 2015 table. */
  ddp: (T: number) => tabInterp(TAB_DDP, T),
  /** t(d,n)⁴He, Serpico et al. 2004. */
  tdn: (T: number) =>
    T < 2.5
      ? 6.2265733e8 / (ex(0.49711597 / T) * pw(T, 0.56785403)) +
        ex(-0.23309803 * T * T - 1.342742 * pw(T, -1 / 3)) *
          (-8.1144927e7 + 2.2315324e9 * T - 2.9439669e9 * T * T + 1.8764462e9 * T ** 3 - 6.0511612e8 * T ** 4 + 9.5196576e7 * T ** 5 - 5.2901086e6 * T ** 6) *
          pw(T, -2 / 3)
      : 3.40249e8,
  /** ³He(d,p)⁴He, Serpico et al. 2004. */
  hdp: (T: number) =>
    T < 2.5
      ? 3.1038385e8 / (ex(1.6190981 / T) * pw(T, 0.12159455)) +
        ex(-0.0062340825 * T * T - 1.4540617 * pw(T, -1 / 3)) *
          (-3.1335916e7 - 6.2051071e8 * T - 1.8782248e9 * T * T + 6.5642773e8 * T ** 3 + 1.530887e8 * T ** 4 - 4.9542138e8 * pw(T, 10 / 3) -
            1.770285e8 * pw(T, 11 / 3) + 1.14185e8 * pw(T, 1 / 3) - 2.516526e7 * pw(T, 13 / 3) + 1.7500204e8 * pw(T, 2 / 3) - 1.7513362e9 * pw(T, 4 / 3) +
            5.2792247e9 * pw(T, 5 / 3) - 3.32382e9 * pw(T, 7 / 3) + 2.0346284e9 * pw(T, 8 / 3)) *
          pw(T, -2 / 3)
      : 1.55167e8,
  /** ³He(³He,2p)⁴He, NACRE 1999. */
  hhe: (T: number) => 5.59e10 * pw(T, -2 / 3) * ex(-12.277 / pw(T, 1 / 3)) * (1 - 0.135 * T + 2.54e-2 * T * T - 1.29e-3 * T ** 3),
};

// ---- Network ------------------------------------------------------------------
export const SPECIES = ['n', 'p', 'D', '³H', '³He', '⁴He', '⁷Li', '⁷Be'] as const;
export const A_NUC = [1, 1, 2, 3, 3, 4, 7, 7];
export const NSP = 8;
const [N, P, D, T3, H3, A4, L7, B7] = [0, 1, 2, 3, 4, 5, 6, 7];

type RateKey = keyof typeof RATE;
interface Reaction {
  in: number[];
  out: number[];
  /** Forward rate key; 'weakNP' / 'weakPN' for the weak processes. */
  key: RateKey | 'weakNP' | 'weakPN';
  /** Reverse reaction: photodisintegration ('gamma', factor · 0.987e10 T9^1.5 e^{-q/T9}) or two-body ('two', factor · e^{-q/T9}). */
  rev?: { kind: 'gamma' | 'two'; c: number; q: number };
}

const REACTIONS: Reaction[] = [
  { in: [N], out: [P], key: 'weakNP' },
  { in: [P], out: [N], key: 'weakPN' },
  { in: [N, P], out: [D], key: 'npg', rev: { kind: 'gamma', c: 0.477, q: 25.815 } },
  { in: [D, N], out: [T3], key: 'dng', rev: { kind: 'gamma', c: 1.65, q: 72.612 } },
  { in: [H3, N], out: [A4], key: 'hng', rev: { kind: 'gamma', c: 2.63, q: 238.794 } },
  { in: [H3, N], out: [P, T3], key: 'hnp', rev: { kind: 'two', c: 1.001, q: 8.863 } },
  { in: [B7, N], out: [P, L7], key: 'benp', rev: { kind: 'two', c: 1.001, q: 19.08 } },
  { in: [D, P], out: [H3], key: 'dpg', rev: { kind: 'gamma', c: 1.65, q: 63.749 } },
  { in: [T3, P], out: [A4], key: 'tpg', rev: { kind: 'gamma', c: 2.63, q: 229.931 } },
  { in: [L7, P], out: [A4, A4], key: 'lipa' },
  { in: [T3, A4], out: [L7], key: 'tag', rev: { kind: 'gamma', c: 1.13, q: 28.629 } },
  { in: [H3, A4], out: [B7], key: 'hag', rev: { kind: 'gamma', c: 1.13, q: 18.412 } },
  { in: [D, D], out: [N, H3], key: 'ddn', rev: { kind: 'two', c: 1.73, q: 37.934 } },
  { in: [D, D], out: [P, T3], key: 'ddp', rev: { kind: 'two', c: 1.73, q: 46.798 } },
  { in: [T3, D], out: [N, A4], key: 'tdn', rev: { kind: 'two', c: 5.51, q: 204.116 } },
  { in: [H3, D], out: [P, A4], key: 'hdp', rev: { kind: 'two', c: 5.51, q: 212.979 } },
  { in: [H3, H3], out: [P, P, A4], key: 'hhe' },
];

// Expanded list including reverse reactions, flattened into typed arrays.
// Each flow has one or two reactants (fa, fb) and up to three products.
const FLOW_LIST: { in: number[]; out: number[]; g: (T9: number) => number; rho: boolean; weak: boolean }[] = [];
for (const r of REACTIONS) {
  if (r.key === 'weakNP' || r.key === 'weakPN') {
    const fn = r.key === 'weakNP' ? lambdaNP : lambdaPN;
    FLOW_LIST.push({ in: r.in, out: r.out, g: (T9) => fn(T9, 1), rho: false, weak: true });
    continue;
  }
  const rate = RATE[r.key];
  const sym = r.in.length === 2 && r.in[0] === r.in[1] ? 0.5 : 1;
  const base = (T9: number) => Math.max(1e-300, rate(Math.min(T9, 10)));
  FLOW_LIST.push({ in: r.in, out: r.out, g: (T9) => sym * base(T9), rho: true, weak: false });
  const rv = r.rev;
  if (rv) {
    if (rv.kind === 'gamma') FLOW_LIST.push({ in: r.out, out: r.in, g: (T9) => rv.c * 0.987e10 * T9 ** 1.5 * Math.exp(-rv.q / T9) * base(T9), rho: false, weak: false });
    else FLOW_LIST.push({ in: r.out, out: r.in, g: (T9) => rv.c * Math.exp(-rv.q / T9) * base(T9), rho: true, weak: false });
  }
}
const NF = FLOW_LIST.length;
const FA = Int8Array.from(FLOW_LIST, (f) => f.in[0]);
const FB = Int8Array.from(FLOW_LIST, (f) => (f.in.length > 1 ? f.in[1] : -1));
const FO = new Int8Array(NF * 3).fill(-1);
FLOW_LIST.forEach((f, i) => f.out.forEach((s, j) => (FO[i * 3 + j] = s)));
const FRHO = Uint8Array.from(FLOW_LIST, (f) => (f.rho ? 1 : 0));
const FWEAK = Uint8Array.from(FLOW_LIST, (f) => (f.weak ? 1 : 0));

// ln of each flow's temperature factor on a uniform ln T9 grid, built once.
const NG = 1400;
const LG0 = Math.log(0.005);
const LG1 = Math.log(40);
const DLG = (LG1 - LG0) / (NG - 1);
const GTAB = new Float64Array(NF * NG);
for (let k = 0; k < NG; k++) {
  const T9 = Math.exp(LG0 + k * DLG);
  for (let f = 0; f < NF; f++) {
    const v = FLOW_LIST[f].g(T9);
    GTAB[f * NG + k] = v > 0 ? Math.log(v) : -745;
  }
}

export const NUM_REACTIONS = REACTIONS.length;

export interface BBNParams {
  eta: number;
  Nnu: number;
  tau: number;
}

export interface BBNResult {
  params: BBNParams;
  /** Final abundances by number relative to all baryons. */
  Y: Float64Array;
  Yp: number;
  DH: number;
  He3H: number;
  Li7H: number;
  /** n/p when the weak interactions have frozen (T = 0.25 MeV). */
  npFreeze: number;
  /** Total (free + bound) n/p when half the neutrons are locked in nuclei. */
  npNuc: number;
  /** Time (s) when half the neutrons are locked in nuclei. */
  tNuc: number;
  /** Photon temperature (MeV) at tNuc. */
  TNuc: number;
  /** max |Σ A_i Y_i − 1| during the run. */
  baryonErr: number;
  /** Recorded history at the requested times: mass fractions X[k*NSP + i]. */
  hist?: { t: Float64Array; T: Float64Array; X: Float64Array };
  steps: number;
}

const T9_START = 30;
const T9_END = 0.008;
const REL_TOL = 0.01;
const DLNT_MAX = 0.03;

/** Default recording times (s): log-spaced from 0.1 s to 20 min. */
export function recordTimes(n = 160, t0 = 0.1, t1 = 1200): Float64Array {
  const a = new Float64Array(n);
  for (let i = 0; i < n; i++) a[i] = t0 * Math.pow(t1 / t0, i / (n - 1));
  return a;
}

// Scratch arrays reused between runs (no allocation inside the step loop).
const kc = new Float64Array(NF);
const Fv = new Float64Array(NSP);
const Jm = new Float64Array(NSP * NSP);
const M = new Float64Array(NSP * NSP);
const rhs = new Float64Array(NSP);

function coefficients(T9: number, rho: number, tau: number): void {
  let x = (Math.log(T9) - LG0) / DLG;
  if (x < 0) x = 0;
  if (x > NG - 1.000001) x = NG - 1.000001;
  const k = Math.floor(x);
  const u = x - k;
  for (let f = 0; f < NF; f++) {
    const o = f * NG + k;
    let v = Math.exp(GTAB[o] + u * (GTAB[o + 1] - GTAB[o]));
    if (FRHO[f]) v *= rho;
    if (FWEAK[f]) v /= tau;
    kc[f] = v;
  }
}

function derivs(Y: Float64Array, F: Float64Array, J: Float64Array | null): void {
  F.fill(0);
  if (J) J.fill(0);
  for (let f = 0; f < NF; f++) {
    const k = kc[f];
    if (k < 1e-280) continue;
    const a = FA[f];
    const b = FB[f];
    let R: number;
    let dRa: number;
    let dRb = 0;
    if (b < 0) {
      R = k * Y[a];
      dRa = k;
    } else {
      R = k * Y[a] * Y[b];
      dRa = k * Y[b];
      dRb = k * Y[a];
    }
    F[a] -= R;
    if (b >= 0) F[b] -= R;
    for (let j = 0; j < 3; j++) {
      const s = FO[f * 3 + j];
      if (s >= 0) F[s] += R;
    }
    if (J) {
      J[a * NSP + a] -= dRa;
      if (b >= 0) {
        J[a * NSP + b] -= dRb;
        J[b * NSP + a] -= dRa;
        J[b * NSP + b] -= dRb;
      }
      for (let j = 0; j < 3; j++) {
        const s = FO[f * 3 + j];
        if (s < 0) continue;
        J[s * NSP + a] += dRa;
        if (b >= 0) J[s * NSP + b] += dRb;
      }
    }
  }
}

// Solve M x = rhs in place (Gaussian elimination with partial pivoting).
function solve(): boolean {
  const n = NSP;
  for (let c = 0; c < n; c++) {
    let pr = c;
    let pv = Math.abs(M[c * n + c]);
    for (let r = c + 1; r < n; r++) {
      const v = Math.abs(M[r * n + c]);
      if (v > pv) {
        pv = v;
        pr = r;
      }
    }
    if (pv === 0) return false;
    if (pr !== c) {
      for (let k = 0; k < n; k++) {
        const tmp = M[c * n + k];
        M[c * n + k] = M[pr * n + k];
        M[pr * n + k] = tmp;
      }
      const tr = rhs[c];
      rhs[c] = rhs[pr];
      rhs[pr] = tr;
    }
    const d = M[c * n + c];
    for (let r = c + 1; r < n; r++) {
      const m = M[r * n + c] / d;
      if (m === 0) continue;
      for (let k = c; k < n; k++) M[r * n + k] -= m * M[c * n + k];
      rhs[r] -= m * rhs[c];
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    let s = rhs[r];
    for (let k = r + 1; k < n; k++) s -= M[r * n + k] * rhs[k];
    rhs[r] = s / M[r * n + r];
  }
  return true;
}

/**
 * Solve out − base − h·F(out) = 0 by Newton iteration, starting from `guess`.
 * With base = Y(t) this is backward Euler. The BDF2 step below also uses it.
 */
function implicitStep(Y: Float64Array, h: number, out: Float64Array, guess: Float64Array = Y): boolean {
  out.set(guess);
  for (let it = 0; it < 12; it++) {
    derivs(out, Fv, Jm);
    let maxd = 0;
    for (let i = 0; i < NSP; i++) {
      rhs[i] = -(out[i] - Y[i] - h * Fv[i]);
      for (let j = 0; j < NSP; j++) M[i * NSP + j] = (i === j ? 1 : 0) - h * Jm[i * NSP + j];
    }
    if (!solve()) return false;
    for (let i = 0; i < NSP; i++) {
      out[i] += rhs[i];
      const sc = Math.max(Math.abs(out[i]), 1e-20);
      maxd = Math.max(maxd, Math.abs(rhs[i]) / sc);
    }
    if (maxd < 1e-8) break;
    if (it === 11 && maxd > 1e-4) return false;
  }
  for (let i = 0; i < NSP; i++) if (out[i] < 0) out[i] = 1e-40;
  return true;
}

/**
 * Integrate the network from T = 2.6 MeV (T9 = 30) to T9 = 0.008 (about 6 hours).
 * If `rec` is given, mass fractions are recorded at exactly those times.
 */
export function runBBN(p: BBNParams, rec?: Float64Array): BBNResult {
  const cos = cosmology(p.Nnu);
  const Y = new Float64Array(NSP);
  const Yn = new Float64Array(NSP);
  const Yprev = new Float64Array(NSP);
  const base = new Float64Array(NSP);
  let hPrev = 0;
  let t = cos.tOfT(T9_START / T9_PER_MEV);
  const tEnd = cos.tOfT(T9_END / T9_PER_MEV);
  // Initial state: n/p in weak equilibrium, D in Saha equilibrium, the rest ~0.
  const T0 = T9_START / T9_PER_MEV;
  Y[N] = 1 / (1 + Math.exp(Q_NP / T0));
  Y[P] = 1 - Y[N];
  const rho0 = rhoBaryon(p.eta, T9_START, cos.gs(T0));
  Y[D] = (Y[N] * Y[P] * rho0 * Math.exp(25.815 / T9_START)) / (T9_START ** 1.5 * 4.71e9);
  for (let i = 3; i < NSP; i++) Y[i] = 1e-30;
  Y[P] -= 2 * Y[D];

  const nrec = rec ? rec.length : 0;
  const hist = rec ? { t: rec, T: new Float64Array(nrec), X: new Float64Array(nrec * NSP) } : undefined;
  let ri = 0;
  while (hist && ri < nrec && rec![ri] < t) {
    // Before the start the composition is n/p equilibrium.
    const T = cos.TofT(rec![ri]);
    hist.T[ri] = T;
    const xn = 1 / (1 + Math.exp(Q_NP / T));
    hist.X[ri * NSP + N] = xn;
    hist.X[ri * NSP + P] = 1 - xn;
    ri++;
  }

  let h = t * 1e-3;
  let baryonErr = 0;
  let npFreeze = NaN;
  let npNuc = NaN;
  let tNuc = NaN;
  let TNuc = NaN;
  let steps = 0;
  while (t < tEnd && steps < 20000) {
    let hTry = Math.min(h, tEnd - t);
    let recHit = false;
    if (hist && ri < nrec && t + hTry >= rec![ri]) {
      hTry = rec![ri] - t;
      recHit = true;
    }
    const tn = t + hTry;
    const Tm = cos.TofT(tn);
    const T9 = Tm * T9_PER_MEV;
    coefficients(T9, rhoBaryon(p.eta, T9, cos.gs(Tm)), p.tau);
    // Variable-step BDF2 (second order, L-stable). The first step is backward Euler.
    let ok: boolean;
    if (hPrev > 0) {
      const w = hTry / hPrev;
      const c1 = ((1 + w) * (1 + w)) / (1 + 2 * w);
      const c2 = (w * w) / (1 + 2 * w);
      for (let i = 0; i < NSP; i++) base[i] = c1 * Y[i] - c2 * Yprev[i];
      ok = implicitStep(base, (hTry * (1 + w)) / (1 + 2 * w), Yn, Y);
    } else {
      ok = implicitStep(Y, hTry, Yn);
    }
    // Error estimate: distance between the BDF2 result and a linear predictor,
    // relative to each abundance above 1e-12 (the ⁷Li scale is 1e-10).
    let rel = 0;
    if (ok) {
      const w = hPrev > 0 ? hTry / hPrev : 0;
      for (let i = 0; i < NSP; i++) {
        const pred = Y[i] + (Y[i] - Yprev[i]) * w;
        const sc = Math.max(Y[i], Yn[i], 1e-12);
        rel = Math.max(rel, Math.abs(Yn[i] - (hPrev > 0 ? pred : Y[i])) / sc);
      }
      if (hPrev > 0) rel /= 3;
    }
    if (!ok || (rel > 2 * REL_TOL && hTry > t * 1e-7)) {
      h = hTry * 0.4;
      continue;
    }
    Yprev.set(Y);
    Y.set(Yn);
    hPrev = hTry;
    t = tn;
    steps++;
    let sum = 0;
    for (let i = 0; i < NSP; i++) sum += A_NUC[i] * Y[i];
    baryonErr = Math.max(baryonErr, Math.abs(sum - 1));
    if (Number.isNaN(npFreeze) && Tm <= 0.25) npFreeze = Y[N] / Y[P];
    if (Number.isNaN(tNuc)) {
      const nTot = Y[N] + Y[D] + 2 * Y[T3] + Y[H3] + 2 * Y[A4] + 4 * Y[L7] + 3 * Y[B7];
      if (Y[N] < 0.5 * nTot) {
        tNuc = t;
        TNuc = Tm;
        npNuc = nTot / (1 - nTot);
      }
    }
    if (recHit && hist) {
      hist.T[ri] = Tm;
      for (let i = 0; i < NSP; i++) hist.X[ri * NSP + i] = A_NUC[i] * Y[i];
      ri++;
    }
    if (!recHit) h = hTry * Math.min(2, Math.max(0.5, rel > 0 ? 0.9 * Math.cbrt(REL_TOL / rel) : 2));
    h = Math.min(h, t * DLNT_MAX);
  }
  const Yf = Float64Array.from(Y);
  const hyd = Yf[P];
  return {
    params: { ...p },
    Y: Yf,
    Yp: 4 * Yf[A4],
    DH: Yf[D] / hyd,
    He3H: (Yf[H3] + Yf[T3]) / hyd,
    Li7H: (Yf[L7] + Yf[B7]) / hyd,
    npFreeze,
    npNuc,
    tNuc,
    TNuc,
    baryonErr,
    hist,
    steps,
  };
}

/** Log-spaced η grid for the Schramm plot. */
export function etaGrid(n = 28, lo = 1e-10, hi = 1e-9): Float64Array {
  const a = new Float64Array(n);
  for (let i = 0; i < n; i++) a[i] = lo * Math.pow(hi / lo, i / (n - 1));
  return a;
}

export interface Schramm {
  eta: Float64Array;
  Yp: Float64Array;
  DH: Float64Array;
  He3H: Float64Array;
  Li7H: Float64Array;
}

/** Run the network across an η grid. */
export function schramm(Nnu: number, tau: number, eta = etaGrid()): Schramm {
  const n = eta.length;
  const s: Schramm = { eta, Yp: new Float64Array(n), DH: new Float64Array(n), He3H: new Float64Array(n), Li7H: new Float64Array(n) };
  for (let i = 0; i < n; i++) {
    const r = runBBN({ eta: eta[i], Nnu, tau });
    s.Yp[i] = r.Yp;
    s.DH[i] = r.DH;
    s.He3H[i] = r.He3H;
    s.Li7H[i] = r.Li7H;
  }
  return s;
}

/** Log-log interpolation of a Schramm curve at η. */
export function interpCurve(etaArr: Float64Array, ys: Float64Array, eta: number, logY = true): number {
  const n = etaArr.length;
  const x = Math.log(eta);
  let i = 0;
  while (i < n - 2 && Math.log(etaArr[i + 1]) < x) i++;
  const x0 = Math.log(etaArr[i]);
  const x1 = Math.log(etaArr[i + 1]);
  const u = (x - x0) / (x1 - x0);
  if (logY) return Math.exp(Math.log(ys[i]) + u * (Math.log(ys[i + 1]) - Math.log(ys[i])));
  return ys[i] + u * (ys[i + 1] - ys[i]);
}
