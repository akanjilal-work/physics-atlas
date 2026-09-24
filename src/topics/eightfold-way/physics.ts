// SU(3) flavour quark model with u, d, s. Pure data and arithmetic, no DOM.
//
// Quark codes: 'u' 'd' 's' are quarks, 'U' 'D' 'S' their antiquarks.
// Masses are PDG 2024 central values in MeV. The Δ(1232) charge states are
// quoted by the PDG as a common Breit–Wigner mass of 1232 ± 2 MeV.

export type Flavour = 'u' | 'd' | 's';
export type QuarkCode = Flavour | 'U' | 'D' | 'S';
export type Multiplet = 'meson' | 'octet' | 'decuplet';

export interface QN {
  /** Electric charge in units of e. */
  Q: number;
  /** Third component of isospin. */
  I3: number;
  /** Strangeness (an s quark carries S = −1). */
  S: number;
  /** Baryon number. */
  B: number;
  /** Hypercharge Y = B + S. */
  Y: number;
}

interface QuarkData { Q: number; I3: number; S: number; B: number }
const Q_DATA: Record<Flavour, QuarkData> = {
  u: { Q: 2 / 3, I3: 0.5, S: 0, B: 1 / 3 },
  d: { Q: -1 / 3, I3: -0.5, S: 0, B: 1 / 3 },
  s: { Q: -1 / 3, I3: 0, S: -1, B: 1 / 3 },
};

export const isAnti = (c: QuarkCode) => c === 'U' || c === 'D' || c === 'S';
export const flavourOf = (c: QuarkCode) => c.toLowerCase() as Flavour;

export function quarkQN(c: QuarkCode): QN {
  const d = Q_DATA[flavourOf(c)];
  const k = isAnti(c) ? -1 : 1;
  const B = k * d.B;
  const S = k * d.S;
  return { Q: k * d.Q, I3: k * d.I3, S, B, Y: B + S };
}

/** Additive quantum numbers of a set of quarks. Rounded to kill float fuzz. */
export function contentQN(codes: readonly QuarkCode[]): QN {
  let Q = 0, I3 = 0, S = 0, B = 0;
  for (const c of codes) {
    const q = quarkQN(c);
    Q += q.Q; I3 += q.I3; S += q.S; B += q.B;
  }
  const r = (x: number) => Math.round(x * 6) / 6;
  return { Q: r(Q), I3: r(I3), S: r(S), B: r(B), Y: r(B + S) };
}

/** Gell-Mann–Nishijima residual: Q − (I3 + Y/2). Zero for every hadron. */
export const gmnResidual = (q: QN) => q.Q - (q.I3 + q.Y / 2);

export interface Hadron {
  id: string;
  sym: string;
  name: string;
  multiplet: Multiplet;
  /** Representative quark content. For neutral mixtures, one component. */
  q: QuarkCode[];
  /** Full flavour wavefunction when the state is a mixture. */
  mix?: string;
  /** Measured charge (independent of q, used to cross-check the quark model). */
  charge: number;
  /** PDG mass, MeV. */
  mass: number;
  massText: string;
  spin: string;
}

const H = (id: string, sym: string, name: string, multiplet: Multiplet, q: string, charge: number, mass: number, massText: string, mix?: string): Hadron => ({
  id, sym, name, multiplet, q: q.split('') as QuarkCode[], charge, mass, massText, mix,
  spin: multiplet === 'meson' ? '0⁻' : multiplet === 'octet' ? '½⁺' : '3/2⁺',
});

export const HADRONS: Hadron[] = [
  // Pseudoscalar mesons: octet plus singlet (J^P = 0⁻)
  H('pi+', 'π⁺', 'pion', 'meson', 'uD', 1, 139.57039, '139.57039(18)'),
  H('pi0', 'π⁰', 'pion', 'meson', 'uU', 0, 134.9768, '134.9768(5)', '(uū − dd̄)/√2'),
  H('pi-', 'π⁻', 'pion', 'meson', 'dU', -1, 139.57039, '139.57039(18)'),
  H('K+', 'K⁺', 'kaon', 'meson', 'uS', 1, 493.677, '493.677(15)'),
  H('K0', 'K⁰', 'kaon', 'meson', 'dS', 0, 497.611, '497.611(13)'),
  H('K-', 'K⁻', 'kaon', 'meson', 'sU', -1, 493.677, '493.677(15)'),
  H('K0bar', 'K̄⁰', 'antikaon', 'meson', 'sD', 0, 497.611, '497.611(13)'),
  H('eta', 'η', 'eta', 'meson', 'uU', 0, 547.862, '547.862(17)', '≈ (uū + dd̄ − 2ss̄)/√6'),
  H('etap', 'η′', 'eta prime', 'meson', 'uU', 0, 957.78, '957.78(6)', '≈ (uū + dd̄ + ss̄)/√3'),
  // Baryon octet (J^P = ½⁺)
  H('p', 'p', 'proton', 'octet', 'uud', 1, 938.27209, '938.27209'),
  H('n', 'n', 'neutron', 'octet', 'udd', 0, 939.56542, '939.56542'),
  H('Lambda', 'Λ', 'lambda', 'octet', 'uds', 0, 1115.683, '1115.683(6)'),
  H('Sigma+', 'Σ⁺', 'sigma', 'octet', 'uus', 1, 1189.37, '1189.37(7)'),
  H('Sigma0', 'Σ⁰', 'sigma', 'octet', 'uds', 0, 1192.642, '1192.642(24)'),
  H('Sigma-', 'Σ⁻', 'sigma', 'octet', 'dds', -1, 1197.449, '1197.449(30)'),
  H('Xi0', 'Ξ⁰', 'xi (cascade)', 'octet', 'uss', 0, 1314.86, '1314.86(20)'),
  H('Xi-', 'Ξ⁻', 'xi (cascade)', 'octet', 'dss', -1, 1321.71, '1321.71(7)'),
  // Baryon decuplet (J^P = 3/2⁺)
  H('Delta++', 'Δ⁺⁺', 'delta', 'decuplet', 'uuu', 2, 1232, '1232(2)'),
  H('Delta+', 'Δ⁺', 'delta', 'decuplet', 'uud', 1, 1232, '1232(2)'),
  H('Delta0', 'Δ⁰', 'delta', 'decuplet', 'udd', 0, 1232, '1232(2)'),
  H('Delta-', 'Δ⁻', 'delta', 'decuplet', 'ddd', -1, 1232, '1232(2)'),
  H('Sigma*+', 'Σ*⁺', 'sigma star', 'decuplet', 'uus', 1, 1382.8, '1382.80(35)'),
  H('Sigma*0', 'Σ*⁰', 'sigma star', 'decuplet', 'uds', 0, 1383.7, '1383.7(10)'),
  H('Sigma*-', 'Σ*⁻', 'sigma star', 'decuplet', 'dds', -1, 1387.2, '1387.2(5)'),
  H('Xi*0', 'Ξ*⁰', 'xi star', 'decuplet', 'uss', 0, 1531.8, '1531.80(32)'),
  H('Xi*-', 'Ξ*⁻', 'xi star', 'decuplet', 'dss', -1, 1535.0, '1535.0(6)'),
  H('Omega-', 'Ω⁻', 'omega', 'decuplet', 'sss', -1, 1672.45, '1672.45(29)'),
];

export const OMEGA_MASS = 1672.45;
export const byId = (id: string) => HADRONS.find((h) => h.id === id);
export const inMultiplet = (m: Multiplet) => HADRONS.filter((h) => h.multiplet === m);

export function qn(h: Hadron): QN {
  return contentQN(h.q);
}

/** Largest |Q − I3 − Y/2| over all listed hadrons, plus a check that the quark charge equals the measured one. */
export function gmnAudit(): { maxResidual: number; chargeMismatches: string[] } {
  let maxResidual = 0;
  const chargeMismatches: string[] = [];
  for (const h of HADRONS) {
    const n = qn(h);
    maxResidual = Math.max(maxResidual, Math.abs(gmnResidual(n)));
    if (Math.abs(n.Q - h.charge) > 1e-9) chargeMismatches.push(h.id);
  }
  return { maxResidual, chargeMismatches };
}

/** Canonical key for a quark set: sorted quarks, then sorted antiquarks. */
export function contentKey(codes: readonly QuarkCode[]): string {
  const order = 'udsUDS';
  return [...codes].sort((a, b) => order.indexOf(a) - order.indexOf(b)).join('');
}

/** Every listed hadron whose quark content matches (neutral mesons match any qq̄ of the same flavour-neutral kind). */
export function identify(codes: readonly QuarkCode[]): Hadron[] {
  const key = contentKey(codes);
  const quarks = codes.filter((c) => !isAnti(c)).length;
  const antis = codes.length - quarks;
  if (quarks === 1 && antis === 1) {
    // uū, dd̄ and ss̄ all mix into π⁰, η, η′.
    const [a, b] = key.split('');
    if (a.toUpperCase() === b) return HADRONS.filter((h) => h.multiplet === 'meson' && h.mix);
    return HADRONS.filter((h) => h.multiplet === 'meson' && contentKey(h.q) === key);
  }
  if (quarks === 3 && antis === 0) return HADRONS.filter((h) => h.multiplet !== 'meson' && contentKey(h.q) === key);
  return [];
}

/** Isospin-averaged mass of the hadrons in a multiplet with a given strangeness. */
export function levelMass(m: Multiplet, S: number): number {
  const hs = inMultiplet(m).filter((h) => qn(h).S === S);
  return hs.reduce((a, h) => a + h.mass, 0) / hs.length;
}

/** Decuplet mass levels at S = 0, −1, −2, −3 and the three gaps between them. */
export function decupletLevels(): { levels: number[]; gaps: number[]; mean: number } {
  const levels = [0, -1, -2, -3].map((S) => levelMass('decuplet', S));
  const gaps = [levels[1] - levels[0], levels[2] - levels[1], levels[3] - levels[2]];
  return { levels, gaps, mean: (levels[3] - levels[0]) / 3 };
}

/**
 * Gell-Mann–Okubo equal-spacing prediction of the Ω⁻ from the three lighter levels.
 * `step` repeats the last gap: m(Ω) = 2 m(Ξ*) − m(Σ*).
 * `fit` extrapolates the least-squares straight line through Δ, Σ*, Ξ*.
 */
export function predictOmega(): { step: number; fit: number } {
  const [d, s, x] = [0, -1, -2].map((S) => levelMass('decuplet', S));
  const step = 2 * x - s;
  const slope = (x - d) / 2; // MeV per unit of −S
  const fit = (d + s + x) / 3 + slope * 2; // from mean at S = −1 to S = −3
  return { step, fit };
}

/** Octet Gell-Mann–Okubo relation: 2(m_N + m_Ξ) = 3 m_Λ + m_Σ. Returns both sides. */
export function octetGMO(): { lhs: number; rhs: number; rel: number } {
  const avg = (ids: string[]) => ids.reduce((a, id) => a + byId(id)!.mass, 0) / ids.length;
  const N = avg(['p', 'n']);
  const Xi = avg(['Xi0', 'Xi-']);
  const L = byId('Lambda')!.mass;
  const Sg = avg(['Sigma+', 'Sigma0', 'Sigma-']);
  const lhs = 2 * (N + Xi);
  const rhs = 3 * L + Sg;
  return { lhs, rhs, rel: (rhs - lhs) / lhs };
}

/** Pretty quark content, e.g. "u u d" or "u s̄". */
export function quarkText(codes: readonly QuarkCode[]): string {
  return codes.map((c) => (isAnti(c) ? `${c.toLowerCase()}̄` : c)).join(' ');
}

/** Fraction formatting for quantum numbers: 0.5 → "+½", -1/3 → "−⅓". */
export function fmtFrac(x: number, signed = true): string {
  const sign = x > 1e-9 ? (signed ? '+' : '') : x < -1e-9 ? '−' : '';
  const a = Math.abs(x);
  const whole = Math.floor(a + 1e-9);
  const f = a - whole;
  const map: [number, string][] = [[1 / 2, '½'], [1 / 3, '⅓'], [2 / 3, '⅔'], [1 / 6, '⅙'], [5 / 6, '⅚']];
  let fs = '';
  for (const [v, s] of map) if (Math.abs(f - v) < 1e-6) fs = s;
  if (!fs) return `${sign}${Math.round(a)}`;
  if (fs === '½' && whole > 0) return `${sign}${2 * whole + 1}/2`;
  return `${sign}${whole > 0 ? whole : ''}${fs}`;
}
