// Inside the proton: a schematic parton model with exact sum rules.
// Pure math. No DOM, no Three.js.
//
// Shapes at every Q² are simple Beta-type forms
//   x u_v = A_u x^a (1-x)^b        (∫u_v dx = 2)
//   x d_v = A_d x^a (1-x)^(b+1)    (∫d_v dx = 1, a little softer than u_v)
//   x S   = A_S x^(-λ) (1-x)^7     (all sea quarks and antiquarks together)
//   x g   = A_g x^(-λ) (1-x)^5
// The momentum carried by each group is not free. It follows the exact
// leading-order QCD evolution of the second Mellin moments (n = 2), started
// from typical global-fit values at Q0² = 4 GeV². The small-x slope λ(Q²) is
// the H1 fit to F2 at small x. The result is schematic in shape but exact in
// its sum rules.

// ---------------------------------------------------------------------------
// Constants

export const M_PROTON = 938.272; // MeV (PDG / CODATA)
export const M_NEUTRON = 939.565; // MeV
export const M_UP = 2.16; // MeV, MS-bar at 2 GeV (PDG)
export const M_DOWN = 4.70; // MeV, MS-bar at 2 GeV (PDG)
export const HBARC = 0.1973269804; // GeV·fm

export const NF = 4;
export const BETA0 = 11 - (2 * NF) / 3; // 25/3
export const Q0SQ = 4; // GeV², reference scale μ = 2 GeV
export const ALPHA_Q0 = 0.3; // α_s at μ = 2 GeV (approximate)

/** Momentum fractions at Q0² = 4 GeV². Round numbers typical of global fits. */
export const REF = { valence: 0.43, quarks: 0.59 } as const;

/** LO anomalous dimensions of the n = 2 moments, in units where d = γ / (2β0). */
export const GAMMA_NS = 32 / 9; // (8/3) C_F
export const GAMMA_SINGLET = 32 / 9 + (2 * NF) / 3; // nonzero singlet eigenvalue
export const QUARK_ASYMPTOTIC = (3 * NF) / (16 + 3 * NF); // 3/7 for nf = 4

export const VALENCE_A = 0.6;
export const SEA_B = 7;
export const GLUON_B = 5;

// ---------------------------------------------------------------------------
// Special functions

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

export function lgamma(z: number): number {
  if (z < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * z))) - lgamma(1 - z);
  z -= 1;
  let x = 0.99999999999980993;
  for (let i = 0; i < 8; i++) x += LANCZOS[i] / (z + i + 1);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/** Euler Beta function B(p, q) = ∫₀¹ x^(p-1) (1-x)^(q-1) dx. */
export function betaFn(p: number, q: number): number {
  return Math.exp(lgamma(p) + lgamma(q) - lgamma(p + q));
}

// ---------------------------------------------------------------------------
// Running coupling and moment evolution

/** One-loop α_s with nf = 4, anchored at α_s(4 GeV²) = 0.30. */
export function alphaS(Q2: number): number {
  return 1 / (1 / ALPHA_Q0 + (BETA0 / (4 * Math.PI)) * Math.log(Q2 / Q0SQ));
}

export interface Moments {
  /** Momentum fraction of valence quarks (u_v + d_v). */
  valence: number;
  /** Momentum fraction of sea quarks and antiquarks. */
  sea: number;
  /** Momentum fraction of gluons. */
  gluon: number;
  /** All quarks and antiquarks: valence + sea. */
  quarks: number;
}

/** Exact LO evolution of the n = 2 moments from Q0² to Q². Sums to 1 by construction. */
export function moments(Q2: number, out: Moments = { valence: 0, sea: 0, gluon: 0, quarks: 0 }): Moments {
  return evolveMoments(alphaS(Q2) / ALPHA_Q0, out);
}

/** The same evolution written in terms of r = α_s(Q²)/α_s(Q0²). r → 0 is Q² → ∞. */
export function evolveMoments(r: number, out: Moments = { valence: 0, sea: 0, gluon: 0, quarks: 0 }): Moments {
  const valence = REF.valence * Math.pow(r, GAMMA_NS / (2 * BETA0));
  const quarks = QUARK_ASYMPTOTIC + (REF.quarks - QUARK_ASYMPTOTIC) * Math.pow(r, GAMMA_SINGLET / (2 * BETA0));
  out.valence = valence;
  out.quarks = quarks;
  out.sea = quarks - valence;
  out.gluon = 1 - quarks;
  return out;
}

/** H1 fit to the small-x rise of F2: λ = a ln(Q²/Λ²), a = 0.0481, Λ = 0.292 GeV. */
export function smallXSlope(Q2: number): number {
  return Math.max(0.05, 0.0481 * Math.log(Q2 / (0.292 * 0.292)));
}

// ---------------------------------------------------------------------------
// Parton distributions

export interface PDFParams {
  Q2: number;
  a: number;
  b: number;
  Au: number;
  Ad: number;
  lambda: number;
  As: number;
  Ag: number;
  m: Moments;
}

/** Valence momentum for large-x power b: 2a/(a+b+1) + a/(a+b+2). */
function valenceMomentum(a: number, b: number): number {
  return (2 * a) / (a + b + 1) + a / (a + b + 2);
}

export function pdfParams(Q2: number, out?: PDFParams): PDFParams {
  const m = moments(Q2, out?.m);
  const a = VALENCE_A;
  // Solve valenceMomentum(a, b) = m.valence for b by bisection (monotone in b).
  let lo = 0;
  let hi = 30;
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi);
    if (valenceMomentum(a, mid) > m.valence) lo = mid;
    else hi = mid;
  }
  const b = 0.5 * (lo + hi);
  const lambda = smallXSlope(Q2);
  const p = out ?? ({} as PDFParams);
  p.Q2 = Q2;
  p.a = a;
  p.b = b;
  p.Au = 2 / betaFn(a, b + 1);
  p.Ad = 1 / betaFn(a, b + 2);
  p.lambda = lambda;
  p.As = m.sea / betaFn(1 - lambda, SEA_B + 1);
  p.Ag = m.gluon / betaFn(1 - lambda, GLUON_B + 1);
  p.m = m;
  return p;
}

export type Nucleon = 'proton' | 'neutron';

export interface XPDF {
  /** x times the valence u distribution (in the chosen nucleon). */
  uv: number;
  dv: number;
  sea: number;
  g: number;
}

/**
 * x·f(x) for each parton group. For the neutron, isospin symmetry swaps u and d.
 */
export function xpdf(x: number, p: PDFParams, nucleon: Nucleon = 'proton', out: XPDF = { uv: 0, dv: 0, sea: 0, g: 0 }): XPDF {
  const om = 1 - x;
  const big = p.Au * Math.pow(x, p.a) * Math.pow(om, p.b);
  const small = p.Ad * Math.pow(x, p.a) * Math.pow(om, p.b + 1);
  if (nucleon === 'proton') {
    out.uv = big;
    out.dv = small;
  } else {
    out.uv = small;
    out.dv = big;
  }
  const xl = Math.pow(x, -p.lambda);
  out.sea = p.As * xl * Math.pow(om, SEA_B);
  out.g = p.Ag * xl * Math.pow(om, GLUON_B);
  return out;
}

/**
 * ∫_{x0}^{1} F(x) dx with the substitution x = u⁴, which tames the integrable
 * x^(-1/2) and x^(-λ) end-point behaviour. Composite Simpson in u.
 */
export function integrate(F: (x: number) => number, x0 = 0, n = 4000): number {
  const u0 = Math.pow(x0, 0.25);
  const h = (1 - u0) / n;
  let s = 0;
  for (let i = 0; i <= n; i++) {
    const u = u0 + i * h;
    const x = u * u * u * u;
    const w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2;
    const val = x === 0 ? 0 : F(x) * 4 * u * u * u;
    s += w * (Number.isFinite(val) ? val : 0);
  }
  return (s * h) / 3;
}

/** Numerical momentum sum ∫₀¹ x [u_v + d_v + S + g] dx. Should equal 1. */
export function momentumSum(Q2: number): number {
  const p = pdfParams(Q2);
  const tmp: XPDF = { uv: 0, dv: 0, sea: 0, g: 0 };
  return integrate((x) => {
    xpdf(x, p, 'proton', tmp);
    return tmp.uv + tmp.dv + tmp.sea + tmp.g;
  });
}

/** Number integrals ∫u_v dx and ∫d_v dx for the proton. Should be 2 and 1. */
export function valenceNumbers(Q2: number): { u: number; d: number } {
  const p = pdfParams(Q2);
  const tmp: XPDF = { uv: 0, dv: 0, sea: 0, g: 0 };
  const u = integrate((x) => xpdf(x, p, 'proton', tmp).uv / x);
  const d = integrate((x) => xpdf(x, p, 'proton', tmp).dv / x);
  return { u, d };
}

/** Number of partons of each kind with momentum fraction above xMin (for the scene). */
export function partonCounts(p: PDFParams, xMin: number): { valence: number; sea: number; gluon: number } {
  const tmp: XPDF = { uv: 0, dv: 0, sea: 0, g: 0 };
  const sea = integrate((x) => xpdf(x, p, 'proton', tmp).sea / x, xMin, 600);
  const gluon = integrate((x) => xpdf(x, p, 'proton', tmp).g / x, xMin, 600);
  const valence = integrate((x) => (xpdf(x, p, 'proton', tmp).uv + tmp.dv) / x, xMin, 600);
  return { valence, sea, gluon };
}

/** Largest x in [1e-4, 0.9] where the sea (x S) is at least the valence x(u_v + d_v). */
export function seaValenceCrossing(p: PDFParams): number {
  const tmp: XPDF = { uv: 0, dv: 0, sea: 0, g: 0 };
  const diff = (x: number) => {
    xpdf(x, p, 'proton', tmp);
    return tmp.sea - (tmp.uv + tmp.dv);
  };
  let lo = Math.log(1e-4);
  let hi = Math.log(0.9);
  if (diff(Math.exp(lo)) < 0) return 1e-4;
  if (diff(Math.exp(hi)) > 0) return 0.9;
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi);
    if (diff(Math.exp(mid)) > 0) lo = mid;
    else hi = mid;
  }
  return Math.exp(0.5 * (lo + hi));
}

// ---------------------------------------------------------------------------
// Charges and masses

export const QUARK_CHARGE = { u: 2 / 3, d: -1 / 3 } as const;
export type Flavour = keyof typeof QUARK_CHARGE;

export function valenceContent(n: Nucleon): Flavour[] {
  return n === 'proton' ? ['u', 'u', 'd'] : ['u', 'd', 'd'];
}

export function totalCharge(n: Nucleon): number {
  return valenceContent(n).reduce((s, f) => s + QUARK_CHARGE[f], 0);
}

export function nucleonMass(n: Nucleon): number {
  return n === 'proton' ? M_PROTON : M_NEUTRON;
}

/** Sum of the Higgs-given (current) masses of the valence quarks, MeV. */
export function valenceQuarkMass(n: Nucleon): number {
  return valenceContent(n).reduce((s, f) => s + (f === 'u' ? M_UP : M_DOWN), 0);
}

export function quarkMassFraction(n: Nucleon): number {
  return valenceQuarkMass(n) / nucleonMass(n);
}

/**
 * Lattice QCD proton mass decomposition, Yang et al., PRL 121, 212001 (2018),
 * MS-bar at 2 GeV. Central values in percent. They add to 102 because of
 * rounding and uncertainties of several percent on each piece.
 */
export const MASS_DECOMPOSITION = [
  { key: 'condensate', label: 'quark mass terms (u, d, s)', pct: 9, err: 2 },
  { key: 'quarkEnergy', label: 'quark kinetic + potential energy', pct: 33, err: 6 },
  { key: 'gluonEnergy', label: 'gluon field energy', pct: 37, err: 6 },
  { key: 'anomaly', label: 'trace anomaly', pct: 23, err: 1 },
] as const;

/** Resolution length ħc/Q in fm for Q² in GeV². */
export function resolutionFm(Q2: number): number {
  return HBARC / Math.sqrt(Q2);
}
