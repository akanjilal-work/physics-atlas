// Semi-empirical mass formula (Bethe–Weizsäcker liquid drop) and helpers.
// Pure math, no DOM. Energies in MeV, lengths in fm.

/**
 * Coefficients: "least-squares fit (1)" as tabulated in the Wikipedia article
 * "Semi-empirical mass formula". Pairing δ = a_P / A^{1/2}.
 * Rohlf's textbook fit (15.75, 17.8, 0.711, 23.7, 11.18) is almost identical.
 */
export const COEF = { aV: 15.8, aS: 18.3, aC: 0.714, aA: 23.2, aP: 12 };

export interface Terms {
  volume: boolean;
  surface: boolean;
  coulomb: boolean;
  asymmetry: boolean;
  pairing: boolean;
}
export const ALL_ON: Terms = { volume: true, surface: true, coulomb: true, asymmetry: true, pairing: true };

/** m_n − m(¹H) in MeV: the atomic mass cost of turning a hydrogen atom into a neutron. */
export const DELTA_NH = 0.782347;
/** Measured binding energy of ⁴He (AME2020), MeV. */
export const B_HE4 = 28.29566;
export const R0 = 1.2;
export const MAGIC = [2, 8, 20, 28, 50, 82, 126];

export interface Breakdown {
  V: number;
  S: number;
  C: number;
  A: number;
  P: number;
  B: number;
}

/** Signed contributions of each term to B(Z, N). Switched-off terms are zero. */
export function terms(Z: number, N: number, t: Terms = ALL_ON, out?: Breakdown): Breakdown {
  const o = out ?? { V: 0, S: 0, C: 0, A: 0, P: 0, B: 0 };
  const A = Z + N;
  if (A <= 0) {
    o.V = o.S = o.C = o.A = o.P = o.B = 0;
    return o;
  }
  const c = Math.cbrt(A);
  o.V = t.volume ? COEF.aV * A : 0;
  o.S = t.surface ? -COEF.aS * c * c : 0;
  o.C = t.coulomb ? (-COEF.aC * Z * (Z - 1)) / c : 0;
  o.A = t.asymmetry ? (-COEF.aA * (A - 2 * Z) * (A - 2 * Z)) / A : 0;
  let p = 0;
  if (t.pairing && Number.isInteger(Z) && Number.isInteger(N)) {
    const d = COEF.aP / Math.sqrt(A);
    if (Z % 2 === 0 && N % 2 === 0) p = d;
    else if (Z % 2 === 1 && N % 2 === 1) p = -d;
  }
  o.P = p;
  o.B = o.V + o.S + o.C + o.A + o.P;
  return o;
}

const scratch: Breakdown = { V: 0, S: 0, C: 0, A: 0, P: 0, B: 0 };
/** Total binding energy B(Z, N) in MeV. */
export function binding(Z: number, N: number, t: Terms = ALL_ON): number {
  return terms(Z, N, t, scratch).B;
}
export function bindingPerA(Z: number, N: number, t: Terms = ALL_ON): number {
  const A = Z + N;
  return A > 0 ? binding(Z, N, t) / A : 0;
}

/**
 * Valley of stability: the (continuous) Z that minimises the atomic mass
 * M = Z m_H + N m_n − B at fixed A. From dM/dZ = 0 with the Z(Z−1) Coulomb form:
 * Z₀ = (Δ + a_C A^{-1/3} + 4a_A) / (2a_C A^{-1/3} + 8a_A/A).
 */
export function valleyZ(A: number, t: Terms = ALL_ON): number {
  const c = Math.cbrt(A);
  const aC = t.coulomb ? COEF.aC : 0;
  const aA = t.asymmetry ? COEF.aA : 0;
  const den = (2 * aC) / c + (8 * aA) / A;
  if (den <= 0) return A / 2;
  return (DELTA_NH + aC / c + 4 * aA) / den;
}

/** Atomic mass relative to A free neutrons: M − A m_n = −Z Δ − B. */
export function massOffset(Z: number, A: number, t: Terms = ALL_ON): number {
  return -Z * DELTA_NH - binding(Z, A - Z, t);
}

/** Integer Z with the lowest atomic mass at fixed A (search 0..A). */
export function argminZ(A: number, t: Terms = ALL_ON): number {
  let best = 0;
  let bm = Infinity;
  for (let Z = 0; Z <= A; Z++) {
    const m = massOffset(Z, A, t);
    if (m < bm) {
      bm = m;
      best = Z;
    }
  }
  return best;
}

export const qBetaMinus = (Z: number, N: number, t: Terms = ALL_ON) => binding(Z + 1, N - 1, t) - binding(Z, N, t) + DELTA_NH;
/** Q for electron capture (β⁺ needs 1.022 MeV more). */
export const qEC = (Z: number, N: number, t: Terms = ALL_ON) => binding(Z - 1, N + 1, t) - binding(Z, N, t) - DELTA_NH;
export const qAlpha = (Z: number, N: number, t: Terms = ALL_ON) => (Z > 2 && N > 2 ? binding(Z - 2, N - 2, t) + B_HE4 - binding(Z, N, t) : -1);

/** Viola–Seaborg systematics (Sobiczewski et al. 1989 constants): log10 T½(s) for α decay. */
export function logTAlpha(Z: number, Q: number): number {
  if (Q <= 0) return Infinity;
  return (1.66175 * Z - 8.5166) / Math.sqrt(Q) - 0.20228 * Z - 33.9069;
}
/** Rough β half-life from Sargent's rule with log ft ≈ 5: log10 T½(s) ≈ 6.5 − 5 log10 Q. */
export function logTBeta(Q: number): number {
  if (Q <= 0) return Infinity;
  return 6.5 - 5 * Math.log10(Math.max(Q, 1e-3));
}

export type Mode = 'stable' | 'beta-' | 'beta+' | 'alpha' | 'fission' | 'unbound';

/** Fissility x = E_C / (2 E_S) using Z²/A. Liquid-drop fission barrier vanishes at x = 1. */
export function fissility(Z: number, A: number, t: Terms = ALL_ON): number {
  if (!t.coulomb || !t.surface) return 0;
  return (COEF.aC * Z * Z) / (2 * COEF.aS * A);
}

/**
 * Approximate dominant decay mode from the formula alone.
 * Fission when fissility > 0.76 (Z²/A ≳ 39). Otherwise the fastest of β⁻, EC/β⁺
 * and α by the rough half-life rules above. "Stable" if nothing is faster than 10²² s.
 */
export function decayMode(Z: number, N: number, t: Terms = ALL_ON): Mode {
  const A = Z + N;
  if (A < 1 || binding(Z, N, t) <= 0) return 'unbound';
  if (fissility(Z, A, t) > 0.76) return 'fission';
  const tbm = N > 0 ? logTBeta(qBetaMinus(Z, N, t)) : Infinity;
  const tbp = Z > 0 ? logTBeta(qEC(Z, N, t)) : Infinity;
  const ta = logTAlpha(Z, qAlpha(Z, N, t));
  const m = Math.min(tbm, tbp, ta);
  if (m > 22) return 'stable';
  if (m === ta) return 'alpha';
  return m === tbm ? 'beta-' : 'beta+';
}

/** Fission of the compound nucleus (Z, N+1) formed by neutron capture on (Z, N). */
export interface Fission {
  Z1: number;
  N1: number;
  Z2: number;
  N2: number;
  Q: number;
}
/**
 * Target (Z, N) absorbs a slow neutron, then splits into two fragments with
 * mass fraction `ratio` for the lighter one. Fragments keep the parent's Z/A
 * (unchanged charge density), rounded to integers. No prompt neutrons.
 * Q = B₁ + B₂ − B(target): the incoming neutron is free and has no binding.
 */
export function fission(Z: number, N: number, ratio: number, t: Terms = ALL_ON): Fission {
  const Ac = Z + N + 1;
  const A1 = Math.max(1, Math.min(Ac - 1, Math.round(ratio * Ac)));
  const A2 = Ac - A1;
  const Z1 = Math.max(0, Math.min(Z, Math.round((Z * A1) / Ac)));
  const Z2 = Z - Z1;
  const N1 = A1 - Z1;
  const N2 = A2 - Z2;
  const Q = binding(Z1, N1, t) + binding(Z2, N2, t) - binding(Z, N, t);
  return { Z1, N1, Z2, N2, Q };
}

/** Energy released when two identical (Z, N) nuclei fuse into (2Z, 2N). */
export function fusionQ(Z: number, N: number, t: Terms = ALL_ON): number {
  return binding(2 * Z, 2 * N, t) - 2 * binding(Z, N, t);
}

/** Nuclear radius R = r₀ A^{1/3}. */
export const radius = (A: number) => R0 * Math.cbrt(A);

/** AME2020 binding energy per nucleon (keV → MeV) for the check nuclei. */
export interface Measured {
  Z: number;
  N: number;
  name: string;
  ba: number;
}
export const AME2020: Measured[] = [
  { Z: 1, N: 1, name: '²H', ba: 1.1122831 },
  { Z: 2, N: 2, name: '⁴He', ba: 7.0739156 },
  { Z: 6, N: 6, name: '¹²C', ba: 7.6801446 },
  { Z: 26, N: 30, name: '⁵⁶Fe', ba: 8.7903557 },
  { Z: 28, N: 34, name: '⁶²Ni', ba: 8.7945551 },
  { Z: 92, N: 146, name: '²³⁸U', ba: 7.5701262 },
];
export const measured = (Z: number, N: number) => AME2020.find((m) => m.Z === Z && m.N === N);

/**
 * Stable nuclides (no decay ever observed), listed as mass numbers per Z.
 * 251 entries in all when the long-lived isomer ¹⁸⁰ᵐTa is counted, as is usual.
 * ¹⁸⁰ᵐTa is not a ground state, so it is left out here (250 ground states).
 */
export const STABLE: Record<number, number[]> = {
  1: [1, 2], 2: [3, 4], 3: [6, 7], 4: [9], 5: [10, 11], 6: [12, 13], 7: [14, 15], 8: [16, 17, 18], 9: [19], 10: [20, 21, 22],
  11: [23], 12: [24, 25, 26], 13: [27], 14: [28, 29, 30], 15: [31], 16: [32, 33, 34, 36], 17: [35, 37], 18: [36, 38, 40], 19: [39, 41], 20: [40, 42, 43, 44, 46],
  21: [45], 22: [46, 47, 48, 49, 50], 23: [51], 24: [50, 52, 53, 54], 25: [55], 26: [54, 56, 57, 58], 27: [59], 28: [58, 60, 61, 62, 64], 29: [63, 65], 30: [64, 66, 67, 68, 70],
  31: [69, 71], 32: [70, 72, 73, 74], 33: [75], 34: [74, 76, 77, 78, 80], 35: [79, 81], 36: [80, 82, 83, 84, 86], 37: [85], 38: [84, 86, 87, 88], 39: [89], 40: [90, 91, 92, 94],
  41: [93], 42: [92, 94, 95, 96, 97, 98], 44: [96, 98, 99, 100, 101, 102, 104], 45: [103], 46: [102, 104, 105, 106, 108, 110], 47: [107, 109], 48: [106, 108, 110, 111, 112, 114], 49: [113],
  50: [112, 114, 115, 116, 117, 118, 119, 120, 122, 124], 51: [121, 123], 52: [120, 122, 123, 124, 125, 126], 53: [127], 54: [126, 128, 129, 130, 131, 132, 134], 55: [133], 56: [132, 134, 135, 136, 137, 138],
  57: [139], 58: [136, 138, 140, 142], 59: [141], 60: [142, 143, 145, 146, 148], 62: [144, 149, 150, 152, 154], 63: [153], 64: [154, 155, 156, 157, 158, 160], 65: [159],
  66: [156, 158, 160, 161, 162, 163, 164], 67: [165], 68: [162, 164, 166, 167, 168, 170], 69: [169], 70: [168, 170, 171, 172, 173, 174, 176], 71: [175], 72: [176, 177, 178, 179, 180],
  73: [181], 74: [182, 183, 184, 186], 75: [185], 76: [187, 188, 189, 190, 192], 77: [191, 193], 78: [192, 194, 195, 196, 198], 79: [197], 80: [196, 198, 199, 200, 201, 202, 204],
  81: [203, 205], 82: [204, 206, 207, 208],
};

export function stableList(): { Z: number; N: number }[] {
  const out: { Z: number; N: number }[] = [];
  for (const [z, as] of Object.entries(STABLE)) for (const a of as) out.push({ Z: Number(z), N: a - Number(z) });
  return out;
}

/** Maximum of B/A along the valley floor (integer nuclides, best Z per A). */
export function peakBA(t: Terms = ALL_ON, Amax = 300): { A: number; Z: number; ba: number } {
  let best = { A: 0, Z: 0, ba: -Infinity };
  for (let A = 2; A <= Amax; A++) {
    const z0 = Math.round(valleyZ(A, t));
    for (let Z = Math.max(0, z0 - 3); Z <= Math.min(A, z0 + 3); Z++) {
      const ba = bindingPerA(Z, A - Z, t);
      if (ba > best.ba) best = { A, Z, ba };
    }
  }
  return best;
}

export const isMagic = (n: number) => MAGIC.includes(n);

const ELEMENTS = 'n H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og'.split(' ');
export const elementSymbol = (Z: number) => ELEMENTS[Z] ?? `Z${Z}`;
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
export const nuclideName = (Z: number, N: number) => `${String(Z + N).split('').map((d) => SUP[Number(d)]).join('')}${elementSymbol(Z)}`;
