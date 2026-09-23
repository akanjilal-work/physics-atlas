// Supersymmetry toy physics: one-loop gauge coupling running (SM and MSSM),
// the stop-loop fine-tuning estimate, and a toy superpartner spectrum.
// Pure functions, no DOM. Masses in GeV unless stated.

export const MZ = 91.1876; // GeV, PDG
export const MH = 125.2; // GeV, Higgs boson mass (PDG average, rounded)
export const MT = 172.6; // GeV, top quark pole mass (PDG average, rounded)
export const YT = 0.94; // top Yukawa near the top mass, MS-bar
export const NC = 3; // colours
export const M_PLANCK = 1.22e19; // GeV

export type Model = 'SM' | 'MSSM';
export type Triple = [number, number, number];

/**
 * Inverse couplings at M_Z from measured inputs, with alpha_1 in GUT normalisation (alpha_1 = 5/3 alpha_Y).
 * Defaults: 1/alpha_em(M_Z) = 127.95 (MS-bar), sin^2 theta_W = 0.23122, alpha_s = 0.1180.
 */
export function inverseCouplingsAtMZ(alphaEmInv = 127.95, sin2w = 0.23122, alphaS = 0.118): Triple {
  const aYInv = alphaEmInv * (1 - sin2w);
  return [(3 / 5) * aYInv, alphaEmInv * sin2w, 1 / alphaS];
}

export const ALPHA_INV_MZ: Triple = inverseCouplingsAtMZ();

/**
 * One-loop beta coefficients b_i, with d(1/alpha_i)/d ln mu = -b_i / 2pi.
 * SM: gauge part (0, -22/3, -11), each generation adds 4/3, each Higgs doublet adds (1/10, 1/6, 0).
 */
export function betaSM(nGen = 3, nHiggs = 1): Triple {
  const g = (4 / 3) * nGen;
  return [g + nHiggs / 10, -22 / 3 + g + nHiggs / 6, -11 + g];
}

/** MSSM: gauge plus gaugino part (0, -6, -9), each generation adds 2, each Higgs doublet (with higgsino) adds (3/10, 1/2, 0). */
export function betaMSSM(nGen = 3, nHiggs = 2): Triple {
  const g = 2 * nGen;
  return [g + (3 * nHiggs) / 10, -6 + g + nHiggs / 2, -9 + g];
}

export const B_SM: Triple = betaSM();
export const B_MSSM: Triple = betaMSSM();

/** One-loop running of a single inverse coupling: 1/alpha(mu) = 1/alpha(mu0) - b/(2 pi) ln(mu/mu0). */
export function runOneLoop(aInv0: number, b: number, mu0: number, mu: number): number {
  return aInv0 - (b / (2 * Math.PI)) * Math.log(mu / mu0);
}

/**
 * The three inverse couplings at scale mu, written into out.
 * SM: SM running all the way. MSSM: SM running up to msusy, MSSM running above (a single step threshold).
 */
export function couplingsAt(mu: number, model: Model, msusy: number, out: Triple = [0, 0, 0]): Triple {
  const ms = Math.max(MZ, msusy);
  for (let i = 0; i < 3; i++) {
    if (model === 'SM' || mu <= ms) {
      out[i] = runOneLoop(ALPHA_INV_MZ[i], B_SM[i], MZ, mu);
    } else {
      const atMs = runOneLoop(ALPHA_INV_MZ[i], B_SM[i], MZ, ms);
      out[i] = runOneLoop(atMs, B_MSSM[i], ms, mu);
    }
  }
  return out;
}

/** Lines in t = ln(mu/MZ) above the threshold: aInv_i(t) = c_i - s_i t, valid for the upper segment. */
function upperLines(model: Model, msusy: number): { c: Triple; s: Triple; t0: number } {
  const ms = Math.max(MZ, msusy);
  const t0 = model === 'SM' ? 0 : Math.log(ms / MZ);
  const b = model === 'SM' ? B_SM : B_MSSM;
  const c: Triple = [0, 0, 0];
  const s: Triple = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const at0 = runOneLoop(ALPHA_INV_MZ[i], B_SM[i], MZ, MZ * Math.exp(t0));
    s[i] = b[i] / (2 * Math.PI);
    c[i] = at0 + s[i] * t0;
  }
  return { c, s, t0 };
}

export interface Crossing {
  /** log10(mu / GeV) where lines i and j cross (NaN if they never do above the threshold). */
  log10mu: number;
  aInv: number;
}

/** Pairwise crossings of the three running lines above the threshold: order (1,2), (2,3), (1,3). */
export function pairCrossings(model: Model, msusy: number): [Crossing, Crossing, Crossing] {
  const { c, s, t0 } = upperLines(model, msusy);
  const pairs: [number, number][] = [[0, 1], [1, 2], [0, 2]];
  return pairs.map(([i, j]) => {
    const ds = s[i] - s[j];
    const t = Math.abs(ds) < 1e-12 ? NaN : (c[i] - c[j]) / ds;
    if (!(t >= t0)) return { log10mu: NaN, aInv: NaN };
    return { log10mu: Math.log10(MZ) + t / Math.LN10, aInv: c[i] - s[i] * t };
  }) as [Crossing, Crossing, Crossing];
}

export interface Unification {
  /** Scale of closest approach, log10(mu/GeV). */
  log10mu: number;
  /** max - min of the three inverse couplings there. */
  spread: number;
  /** Mean inverse coupling at closest approach. */
  aInv: number;
}

const tmp: Triple = [0, 0, 0];

function spreadAt(mu: number, model: Model, msusy: number): number {
  couplingsAt(mu, model, msusy, tmp);
  return Math.max(tmp[0], tmp[1], tmp[2]) - Math.min(tmp[0], tmp[1], tmp[2]);
}

/**
 * Closest approach of the three lines between M_Z and the Planck mass.
 * The spread is piecewise linear in ln(mu), so its minimum sits at a pairwise crossing, the threshold, or an end point.
 */
export function unification(model: Model, msusy: number): Unification {
  const cands: number[] = [MZ, M_PLANCK];
  if (model === 'MSSM') cands.push(Math.max(MZ, msusy));
  // Crossings of the lower (SM) segment, valid only below the threshold in MSSM mode.
  const lower = pairCrossings('SM', MZ);
  const ms = model === 'MSSM' ? Math.max(MZ, msusy) : Infinity;
  for (const x of lower) if (Number.isFinite(x.log10mu) && 10 ** x.log10mu <= ms) cands.push(10 ** x.log10mu);
  if (model === 'MSSM') for (const x of pairCrossings('MSSM', msusy)) if (Number.isFinite(x.log10mu)) cands.push(10 ** x.log10mu);
  let best = cands[0];
  let bestS = Infinity;
  for (const mu of cands) {
    if (mu < MZ || mu > M_PLANCK) continue;
    const sp = spreadAt(mu, model, msusy);
    if (sp < bestS) {
      bestS = sp;
      best = mu;
    }
  }
  couplingsAt(best, model, msusy, tmp);
  return { log10mu: Math.log10(best), spread: bestS, aInv: (tmp[0] + tmp[1] + tmp[2]) / 3 };
}

// ---------------------------------------------------------------------------
// Hierarchy problem
// ---------------------------------------------------------------------------

/** Coefficient 3 y_t^2 / (8 pi^2) that multiplies every top-sector loop correction to m_H^2. */
export const topLoopCoeff = (yt = YT) => (NC * yt * yt) / (8 * Math.PI * Math.PI);

/**
 * Quadratically divergent pieces with hard cutoff L (GeV^2).
 * Top loop: -(3 y_t^2/8 pi^2) L^2. Two stop scalars with quartic lambda: +(3 lambda/8 pi^2) L^2.
 * Supersymmetry sets lambda = y_t^2, so the sum vanishes for any L.
 */
export function quadraticPieces(L: number, yt = YT, lambdaStop = yt * yt): { top: number; stop: number; sum: number } {
  const top = -topLoopCoeff(yt) * L * L;
  const stop = ((NC * lambdaStop) / (8 * Math.PI * Math.PI)) * L * L;
  return { top, stop, sum: top + stop };
}

/**
 * Leading-log correction left over when supersymmetry is softly broken (GeV^2):
 * delta m_H^2 = -(3 y_t^2 / 8 pi^2) m_soft^2 ln(L^2 / m_stop^2), with m_soft^2 = m_stop^2 - m_t^2.
 * L is the scale where supersymmetry breaking is transmitted. It vanishes when m_stop = m_t (exact SUSY).
 */
export function stopLeftover(mStop: number, L: number, yt = YT): number {
  const soft = Math.max(0, mStop * mStop - MT * MT);
  const lg = Math.max(0, Math.log((L * L) / (mStop * mStop)));
  return -topLoopCoeff(yt) * soft * lg;
}

/** Fine-tuning measure Delta = |delta m_H^2| / (m_h^2 / 2). The tuning is 1/Delta. */
export function fineTuning(mStop: number, L: number, yt = YT): number {
  return Math.abs(stopLeftover(mStop, L, yt)) / ((MH * MH) / 2);
}

/** The same measure for the Standard Model alone with cutoff L: only the top loop, no cancellation. */
export function fineTuningNoSusy(L: number, yt = YT): number {
  return (topLoopCoeff(yt) * L * L) / ((MH * MH) / 2);
}

// ---------------------------------------------------------------------------
// Particles and toy superpartners
// ---------------------------------------------------------------------------

export type Family = 'lepton' | 'quark' | 'gauge' | 'higgs';

export interface Pair {
  sm: string;
  partner: string;
  partnerName: string;
  family: Family;
  /** Standard Model mass in GeV. 0 means massless or drawn at zero. */
  mass: number;
  spin: number;
  partnerSpin: number;
  /** Toy partner mass as a multiple of the SUSY scale. */
  ratio: number;
  coloured: boolean;
}

/** Spin of the partner: bosons get spin-1/2 partners, fermions get spin-0 partners. */
export const partnerSpin = (spin: number) => (spin === 0.5 ? 0 : spin === 1 ? 0.5 : 0.5);

const P = (sm: string, partner: string, partnerName: string, family: Family, mass: number, spin: number, ratio: number, coloured = false): Pair =>
  ({ sm, partner, partnerName, family, mass, spin, partnerSpin: partnerSpin(spin), ratio, coloured });

/** Ordered from the mirror outward. Masses from the PDG (rounded). The neutrino (under about 1 eV) is drawn at zero. */
export const PAIRS: Pair[] = [
  P('h', 'H̃', 'higgsino', 'higgs', MH, 0, 0.55),
  P('Z', 'Z̃', 'zino', 'gauge', MZ, 1, 0.42),
  P('W', 'W̃', 'wino', 'gauge', 80.37, 1, 0.4),
  P('γ', 'γ̃', 'photino', 'gauge', 0, 1, 0.22),
  P('g', 'g̃', 'gluino', 'gauge', 0, 1, 1.25, true),
  P('t', 't̃', 'stop', 'quark', MT, 0.5, 0.8, true),
  P('u', 'ũ', 'sup', 'quark', 0.00216, 0.5, 1.0, true),
  P('e', 'ẽ', 'selectron', 'lepton', 0.000511, 0.5, 0.38),
  P('ν', 'ν̃', 'sneutrino', 'lepton', 0, 0.5, 0.36),
];

/** Rough LHC lower limits (GeV) in simplified models with a light neutralino. */
export const LHC_GLUINO = 2200;
export const LHC_STOP = 1200;
