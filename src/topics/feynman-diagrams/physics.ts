// Tree-level QED cross sections. Pure functions, no DOM.
// Natural units (hbar = c = 1). Energies in GeV for e+e- processes.
// Compton scattering uses k = E_gamma / (m_e c^2) in the electron rest frame.

export const ALPHA = 1 / 137.035999084;
/** (hbar c)^2 = 0.3893794 GeV^2 mb, expressed in GeV^2 nb. */
export const GEV2_NB = 0.3893794e6;
export const ME_MEV = 0.51099895;
/** Classical electron radius r_e = 2.8179403262 fm, squared, in barn (1 b = 1e-28 m^2). */
export const RE2_BARN = 2.8179403262e-15 ** 2 / 1e-28;
export const THOMSON_BARN = ((8 * Math.PI) / 3) * RE2_BARN;
/** Angular acceptance for Bhabha and Moller: 10 deg < theta < 170 deg, since the forward peak diverges. */
export const THETA_CUT = (10 * Math.PI) / 180;

export type Process = 'mumu' | 'bhabha' | 'moller' | 'compton';

export interface Channels {
  /** First diagram on (s for mumu and Bhabha, t for Moller). */
  a: boolean;
  /** Second diagram on (t for Bhabha, u for Moller). */
  b: boolean;
}

/** Squared-amplitude pieces |M1|^2, |M2|^2 and the interference 2 Re(M1 M2*), in process units. */
export interface Parts {
  a: number;
  b: number;
  i: number;
}

/** Massless Mandelstam t and u in units of s, at scattering angle cos(theta) = c. */
export function tu(c: number): [number, number] {
  return [-(1 - c) / 2, -(1 + c) / 2];
}

/**
 * Dimensionless bracket X so that d(sigma)/d(Omega) = alpha^2/(2s) * X.
 * Bhabha: X = (s^2+u^2)/t^2 + 2u^2/(s t) + (t^2+u^2)/s^2, with s = 1.
 * Moller: X = (s^2+u^2)/t^2 + (s^2+t^2)/u^2 + 2 s^2/(t u).
 * Muon pairs: the Bhabha s-channel piece alone, (t^2+u^2)/s^2 = (1+c^2)/2.
 */
export function parts(proc: Process, c: number, k = 1): Parts {
  if (proc === 'compton') return { a: kleinNishina(c, k), b: 0, i: 0 };
  const [t, u] = tu(c);
  if (proc === 'mumu') return { a: t * t + u * u, b: 0, i: 0 };
  if (proc === 'bhabha') return { a: t * t + u * u, b: (1 + u * u) / (t * t), i: (2 * u * u) / t };
  return { a: (1 + u * u) / (t * t), b: (1 + t * t) / (u * u), i: 2 / (t * u) };
}

export function combine(p: Parts, ch: Channels): number {
  return (ch.a ? p.a : 0) + (ch.b ? p.b : 0) + (ch.a && ch.b ? p.i : 0);
}

/**
 * d(sigma)/d(Omega). For e+e- processes E is sqrt(s) in GeV and the result is nb/sr.
 * For Compton, E is k = E_gamma/m_e and the result is barn/sr (lab frame, photon angle).
 */
export function dsdo(proc: Process, c: number, E: number, ch: Channels = { a: true, b: true }): number {
  if (proc === 'compton') return kleinNishina(c, E);
  const s = E * E;
  return ((ALPHA * ALPHA) / (2 * s)) * combine(parts(proc, c), ch) * GEV2_NB;
}

/** Closed form sigma(e+e- -> mu+mu-) = 4 pi alpha^2 / (3 s), in nb. */
export function sigmaMuMu(sqrtS: number): number {
  return ((4 * Math.PI * ALPHA * ALPHA) / (3 * sqrtS * sqrtS)) * GEV2_NB;
}

/** Klein-Nishina d(sigma)/d(Omega) in barn/sr. P = E'/E = 1/(1 + k(1 - cos theta)). */
export function kleinNishina(c: number, k: number): number {
  const P = 1 / (1 + k * (1 - c));
  return 0.5 * RE2_BARN * P * P * (P + 1 / P - (1 - c * c));
}

/** Energy ratio E'/E of the scattered photon. */
export function comptonRatio(c: number, k: number): number {
  return 1 / (1 + k * (1 - c));
}

/** Klein-Nishina total cross section in barn. */
export function kleinNishinaTotal(k: number): number {
  if (k < 1e-4) return THOMSON_BARN * (1 - 2 * k + 5.2 * k * k);
  const L = Math.log(1 + 2 * k);
  const a = ((1 + k) / (k * k)) * ((2 * (1 + k)) / (1 + 2 * k) - L / k);
  const b = L / (2 * k) - (1 + 3 * k) / ((1 + 2 * k) * (1 + 2 * k));
  return 2 * Math.PI * RE2_BARN * (a + b);
}

/** Angular range of cos(theta) that the detector sees for each process. */
export function cosRange(proc: Process): [number, number] {
  if (proc === 'bhabha' || proc === 'moller') return [-Math.cos(THETA_CUT), Math.cos(THETA_CUT)];
  return [-1, 1];
}

/** Integrate a function of cos(theta) with composite Simpson on [a, b] (n even). */
export function simpson(f: (c: number) => number, a: number, b: number, n = 400): number {
  const m = n % 2 === 0 ? n : n + 1;
  const h = (b - a) / m;
  let s = f(a) + f(b);
  for (let i = 1; i < m; i++) s += f(a + i * h) * (i % 2 ? 4 : 2);
  return (s * h) / 3;
}

/**
 * Numerically integrated cross section over the acceptance: 2 pi * integral of d(sigma)/d(Omega) d(cos theta).
 * Moller has identical particles in the final state, so the full solid angle double counts: factor 1/2.
 * Returns nb for e+e- processes and barn for Compton.
 */
export function sigmaNumeric(proc: Process, E: number, ch: Channels = { a: true, b: true }, n = 800): number {
  const [lo, hi] = cosRange(proc);
  const v = 2 * Math.PI * simpson((c) => dsdo(proc, c, E, ch), lo, hi, n);
  return proc === 'moller' ? v / 2 : v;
}

/** Share of the accepted cross section coming from interference, i.e. integral(2 Re M1 M2*) / integral(|M1+M2|^2). */
export function interferenceShare(proc: Process, ch: Channels): number {
  if (proc === 'mumu' || proc === 'compton' || !(ch.a && ch.b)) return 0;
  const [lo, hi] = cosRange(proc);
  const I = simpson((c) => parts(proc, c).i, lo, hi, 800);
  const T = simpson((c) => combine(parts(proc, c), ch), lo, hi, 800);
  return I / T;
}

/** Virtuality q^2 of the exchanged line, in GeV^2 (e+e-) or in m_e^2 units relative to mass shell (Compton: p^2 - m^2). */
export function virtuality(proc: Process, which: 'a' | 'b', c: number, E: number): number {
  if (proc === 'compton') {
    // s-channel electron: p^2 - m^2 = s - m^2 = 2 m E. u-channel: p^2 - m^2 = u - m^2 = -2 m E'.
    return which === 'a' ? 2 * E : -2 * E * comptonRatio(c, E);
  }
  const s = E * E;
  const [t, u] = tu(c);
  if (proc === 'mumu') return s;
  if (proc === 'bhabha') return which === 'a' ? s : t * s;
  return which === 'a' ? t * s : u * s;
}

/** Centre-of-mass energy for Compton, in MeV, from k = E_gamma/m_e: s = m^2 (1 + 2k). */
export function comptonSqrtS(k: number): number {
  return ME_MEV * Math.sqrt(1 + 2 * k);
}

/** Size of each extra loop in QED, roughly (alpha/pi)^n. */
export function loopFactor(n: number): number {
  return (ALPHA / Math.PI) ** n;
}

/** Quark electric charges in units of e. */
export const QUARKS: { name: string; q: number; threshold: number }[] = [
  { name: 'u', q: 2 / 3, threshold: 0 },
  { name: 'd', q: -1 / 3, threshold: 0 },
  { name: 's', q: -1 / 3, threshold: 0 },
  // Open-flavour thresholds: D D-bar pair about 3.73 GeV, B B-bar pair about 10.56 GeV.
  { name: 'c', q: 2 / 3, threshold: 3.73 },
  { name: 'b', q: -1 / 3, threshold: 10.56 },
  { name: 't', q: 2 / 3, threshold: 346 },
];

/** Parton-model R = sigma(hadrons)/sigma(mu mu) = N_c * sum of q^2 over the first n quarks. */
export function rRatio(n: number, colours = 3): number {
  let s = 0;
  for (let i = 0; i < Math.min(n, QUARKS.length); i++) s += QUARKS[i].q * QUARKS[i].q;
  return colours * s;
}

/** Number of quark flavours light enough to pair-produce at sqrt(s) (naive step thresholds). */
export function activeQuarks(sqrtS: number): number {
  let n = 0;
  for (const q of QUARKS) if (sqrtS > q.threshold) n++;
  return n;
}
