// Spin and statistics: exchange symmetry for two particles in a box, quantum
// occupation numbers, simple Aufbau filling, and the Hong–Ou–Mandel dip.
// Pure math. No DOM, no Three.js.

export type Kind = 'dist' | 'boson' | 'fermion';

// ------------------------------------------------------------ two particles in a 1D box (L = 1)

/** Normalised infinite-well eigenfunction on [0, 1]. */
export function phi(n: number, x: number): number {
  return Math.SQRT2 * Math.sin(n * Math.PI * x);
}

/**
 * Two-particle wavefunction with particle 1 in state a and particle 2 in state b.
 * dist: plain product. boson / fermion: (anti)symmetrised and normalised.
 * For a = b the boson state is the product itself and the fermion state is zero.
 */
export function psi(kind: Kind, a: number, b: number, x1: number, x2: number): number {
  const p = phi(a, x1) * phi(b, x2);
  if (kind === 'dist') return p;
  if (a === b) return kind === 'boson' ? p : 0;
  const q = phi(b, x1) * phi(a, x2);
  return kind === 'boson' ? (p + q) * Math.SQRT1_2 : (p - q) * Math.SQRT1_2;
}

export function density(kind: Kind, a: number, b: number, x1: number, x2: number): number {
  const v = psi(kind, a, b, x1, x2);
  return v * v;
}

/** Matrix element <a|x|b> on [0, 1]. Used in the exchange-force calculation in Griffiths, Introduction to Quantum Mechanics. */
export function xAB(a: number, b: number): number {
  if (a === b) return 0.5;
  if ((a + b) % 2 === 0) return 0;
  return (-8 * a * b) / (Math.PI ** 2 * (a * a - b * b) ** 2);
}

/** <x^2> in state n on [0, 1]. */
export const x2n = (n: number): number => 1 / 3 - 1 / (2 * n * n * Math.PI * Math.PI);

/**
 * Analytic <(x1 - x2)^2>. Distinguishable: <x²>a + <x²>b - 2<x>a<x>b.
 * Symmetric (bosons) subtracts 2|<a|x|b>|², antisymmetric (fermions) adds it.
 */
export function sep2Analytic(kind: Kind, a: number, b: number): number {
  const d = x2n(a) + x2n(b) - 2 * 0.25;
  if (kind === 'dist' || a === b) return kind === 'fermion' && a === b ? NaN : d;
  const x = xAB(a, b);
  return kind === 'boson' ? d - 2 * x * x : d + 2 * x * x;
}

export interface PairStats {
  norm: number;
  /** <(x1 - x2)^2> from the grid. */
  sep2: number;
  /** Probability that |x1 - x2| < 0.1 (the particles are "close"). */
  pClose: number;
}

/** Midpoint-rule integrals of the joint density on an M x M grid. */
export function pairStats(kind: Kind, a: number, b: number, M = 240): PairStats {
  let norm = 0, s2 = 0, pc = 0;
  const h = 1 / M;
  for (let i = 0; i < M; i++) {
    const x1 = (i + 0.5) * h;
    for (let j = 0; j < M; j++) {
      const x2 = (j + 0.5) * h;
      const d = density(kind, a, b, x1, x2) * h * h;
      norm += d;
      const r = x1 - x2;
      s2 += d * r * r;
      if (Math.abs(r) < 0.1) pc += d;
    }
  }
  return { norm, sep2: norm > 0 ? s2 / norm : NaN, pClose: norm > 0 ? pc / norm : NaN };
}

/** Density on the diagonal relative to distinguishable particles in the same pair of states. */
export function diagonalRatio(kind: Kind, a: number, b: number, x: number): number {
  const d = density('dist', a, b, x, x);
  return d > 0 ? density(kind, a, b, x, x) / d : NaN;
}

// ------------------------------------------------------------ occupation numbers

/** Mean occupation of one single-particle state, with x = (E - mu) / kT. */
export const fd = (x: number): number => (x > 0 ? Math.exp(-x) / (1 + Math.exp(-x)) : 1 / (Math.exp(x) + 1));
export const be = (x: number): number => (x > 0 ? 1 / Math.expm1(x) : Infinity);
export const mb = (x: number): number => Math.exp(-x);

export function occ(kind: Kind, x: number): number {
  return kind === 'fermion' ? fd(x) : kind === 'boson' ? be(x) : mb(x);
}

// ------------------------------------------------------------ toy atomic level scheme

export interface Subshell {
  name: string;
  n: number;
  l: number;
  /** Schematic energy in units of eps. Only the ordering and rough gaps matter. */
  E: number;
  /** Number of spatial orbitals, 2l + 1. */
  orbitals: number;
  /** Row of the periodic table this subshell is filled in (1s = 1, 2s2p = 2, ...). */
  period: number;
}

/**
 * Subshells in Madelung (n + l, then n) order up to 4p. Energies are a toy
 * spectrum chosen to keep that order, not measured atomic values.
 */
export const SUBSHELLS: Subshell[] = [
  { name: '1s', n: 1, l: 0, E: 0, orbitals: 1, period: 1 },
  { name: '2s', n: 2, l: 0, E: 4.0, orbitals: 1, period: 2 },
  { name: '2p', n: 2, l: 1, E: 4.6, orbitals: 3, period: 2 },
  { name: '3s', n: 3, l: 0, E: 7.0, orbitals: 1, period: 3 },
  { name: '3p', n: 3, l: 1, E: 7.5, orbitals: 3, period: 3 },
  { name: '4s', n: 4, l: 0, E: 8.6, orbitals: 1, period: 4 },
  { name: '3d', n: 3, l: 2, E: 9.4, orbitals: 5, period: 4 },
  { name: '4p', n: 4, l: 1, E: 10.0, orbitals: 3, period: 4 },
];

/** Spin states per orbital: 2 for spin-1/2 fermions, 1 for spin-0 bosons and spinless labelled particles. */
export const spinDeg = (kind: Kind): number => (kind === 'fermion' ? 2 : 1);

/** Capacity of each period's block of subshells for spin-1/2 fermions: 2, 8, 8, 18. */
export function periodCapacity(period: number): number {
  let c = 0;
  for (const s of SUBSHELLS) if (s.period === period) c += 2 * (2 * s.l + 1);
  return c;
}

function total(kind: Kind, mu: number, kT: number): number {
  const g = spinDeg(kind);
  let N = 0;
  for (const s of SUBSHELLS) N += g * s.orbitals * occ(kind, (s.E - mu) / kT);
  return N;
}

/** Chemical potential that puts N particles into the level scheme at temperature kT (units of eps). */
export function solveMu(kind: Kind, N: number, kT: number): number {
  const E0 = SUBSHELLS[0].E;
  if (kind === 'dist') {
    let Z = 0;
    for (const s of SUBSHELLS) Z += s.orbitals * Math.exp(-(s.E - E0) / kT);
    return E0 + kT * Math.log(N / Z);
  }
  if (kind === 'boson') {
    // mu = E0 - kT u with u > 0. Bisect on log u.
    let lo = Math.log(1e-14), hi = Math.log(800);
    for (let k = 0; k < 200; k++) {
      const m = 0.5 * (lo + hi);
      if (total('boson', E0 - kT * Math.exp(m), kT) > N) lo = m;
      else hi = m;
    }
    return E0 - kT * Math.exp(0.5 * (lo + hi));
  }
  let lo = E0 - 60 * kT - 60, hi = SUBSHELLS[SUBSHELLS.length - 1].E + 60 * kT + 60;
  for (let k = 0; k < 200; k++) {
    const m = 0.5 * (lo + hi);
    if (total('fermion', m, kT) > N) hi = m;
    else lo = m;
  }
  return 0.5 * (lo + hi);
}

/** Mean number of particles in each subshell (summed over orbitals and spin). */
export function subshellOcc(kind: Kind, N: number, kT: number, out: number[] = []): { mu: number; occ: number[] } {
  const mu = solveMu(kind, N, kT);
  const g = spinDeg(kind);
  SUBSHELLS.forEach((s, i) => (out[i] = g * s.orbitals * occ(kind, (s.E - mu) / kT)));
  out.length = SUBSHELLS.length;
  return { mu, occ: out };
}

/** Ground-state (T = 0) Aufbau filling for Z electrons in Madelung order. */
export function aufbau(Z: number): number[] {
  const out: number[] = [];
  let left = Z;
  for (const s of SUBSHELLS) {
    const cap = 2 * s.orbitals;
    const k = Math.min(cap, Math.max(0, left));
    out.push(k);
    left -= k;
  }
  return out;
}

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = (k: number): string => String(k).split('').map((c) => SUP[Number(c)]).join('');

/** Electron configuration string, e.g. "1s² 2s² 2p⁶". */
export function configString(fill: number[]): string {
  return SUBSHELLS.map((s, i) => (fill[i] > 0 ? `${s.name}${sup(fill[i])}` : '')).filter(Boolean).join(' ');
}

/**
 * Hund-style slot order within a subshell: spin up in each orbital first, then spin down.
 * Returns how full slot k is (0..1) when the subshell holds n electrons.
 */
export function slotFill(n: number, k: number): number {
  return Math.max(0, Math.min(1, n - k));
}

export const ELEMENTS: [string, string][] = [
  ['H', 'hydrogen'], ['He', 'helium'], ['Li', 'lithium'], ['Be', 'beryllium'], ['B', 'boron'],
  ['C', 'carbon'], ['N', 'nitrogen'], ['O', 'oxygen'], ['F', 'fluorine'], ['Ne', 'neon'],
  ['Na', 'sodium'], ['Mg', 'magnesium'], ['Al', 'aluminium'], ['Si', 'silicon'], ['P', 'phosphorus'],
  ['S', 'sulfur'], ['Cl', 'chlorine'], ['Ar', 'argon'], ['K', 'potassium'], ['Ca', 'calcium'],
];

// ------------------------------------------------------------ Hong–Ou–Mandel

/**
 * Coincidence probability at a lossless 50:50 beam splitter for two single photons
 * (or particles) with Gaussian wave packets, delay tau in units of the coherence time.
 * P_c = (1 - s V exp(-tau²)) / 2 with s = +1 bosons, -1 fermions, V = 0 distinguishable.
 */
export function homCoincidence(kind: Kind, tau: number): number {
  const s = kind === 'boson' ? 1 : kind === 'fermion' ? -1 : 0;
  return 0.5 * (1 - s * Math.exp(-tau * tau));
}

/** Dip visibility (C_far - C_0) / C_far. 1 for identical bosons, 0 distinguishable, -1 fermions (a peak). */
export function homVisibility(kind: Kind): number {
  const far = homCoincidence(kind, 50);
  return (far - homCoincidence(kind, 0)) / far;
}

/**
 * Independent operator check. Beam splitter: a† -> (c† + d†)/√2, b† -> (c† - d†)/√2.
 * Then a†b†|0> -> ½(c†c† - d†d† - c†d† + d†c†)|0>. With d†c† = s c†d† (s = +1 bosons,
 * -1 fermions) the coincidence amplitude is ½(s - 1). A second particle with overlap o
 * splits into an identical part (weight o²) and an orthogonal part that exits at random.
 */
export function homFromOperators(kind: Kind, overlap: number): number {
  if (kind === 'dist') return 0.5;
  const s = kind === 'boson' ? 1 : -1;
  const amp = 0.5 * (s - 1);
  const o2 = overlap * overlap;
  return o2 * amp * amp + (1 - o2) * 0.5;
}

/** Overlap |<a|b>| of two identical Gaussian packets offset by tau coherence times. */
export const packetOverlap = (tau: number): number => Math.exp(-0.5 * tau * tau);

/** Small deterministic PRNG for the photon-counting animation. */
export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
