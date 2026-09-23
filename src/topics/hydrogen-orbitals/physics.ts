// Hydrogen atom, non-relativistic and spinless. Units: a0 = 1 (Bohr radius).
// Pure math only: no DOM, no Three.js.

export type Basis = 'real' | 'complex';

export const RYDBERG_EV = 13.6057; // hc R_inf in eV (infinitely heavy nucleus)
export const R_INF = 10973731.56816; // Rydberg constant, m^-1
export const ME_OVER_MP = 1 / 1836.15267343; // electron to proton mass ratio
export const HC_EV_NM = 1239.841984; // hc in eV nm
export const A0_NM = 0.0529177210903; // Bohr radius in nm
export const N_MAX = 6;

const LETTERS = ['s', 'p', 'd', 'f', 'g', 'h'];

const FACT: number[] = [1];
for (let i = 1; i <= 40; i++) FACT[i] = FACT[i - 1] * i;
export const factorial = (k: number): number => FACT[k];

/** Generalised (associated) Laguerre polynomial L_k^alpha(x), modern convention: L_k^alpha(0) = C(k+alpha, k). */
export function laguerre(k: number, alpha: number, x: number): number {
  if (k === 0) return 1;
  let a = 1;
  let b = 1 + alpha - x;
  for (let j = 1; j < k; j++) {
    const c = ((2 * j + 1 + alpha - x) * b - (j + alpha) * a) / (j + 1);
    a = b;
    b = c;
  }
  return b;
}

/** Normalisation of R_nl so that the integral of r^2 R^2 dr is 1. */
export function radialNorm(n: number, l: number): number {
  return Math.sqrt((2 / n) ** 3 * factorial(n - l - 1) / (2 * n * factorial(n + l)));
}

/** Exact hydrogen radial function R_nl(r), r in units of a0. */
export function radial(n: number, l: number, r: number): number {
  const rho = (2 * r) / n;
  return radialNorm(n, l) * Math.exp(-rho / 2) * rho ** l * laguerre(n - l - 1, 2 * l + 1, rho);
}

/** Radial probability density P(r) = r^2 R_nl(r)^2. */
export function radialProb(n: number, l: number, r: number): number {
  const R = radial(n, l, r);
  return r * r * R * R;
}

/** Associated Legendre P_l^m(x) for m >= 0, WITHOUT the Condon-Shortley phase. */
export function legendre(l: number, m: number, x: number): number {
  const s = Math.sqrt(Math.max(0, 1 - x * x));
  let pmm = 1;
  for (let i = 1; i <= m; i++) pmm *= (2 * i - 1) * s;
  if (l === m) return pmm;
  let pm1 = x * (2 * m + 1) * pmm;
  if (l === m + 1) return pm1;
  let pl = 0;
  for (let ll = m + 2; ll <= l; ll++) {
    pl = ((2 * ll - 1) * x * pm1 - (ll + m - 1) * pmm) / (ll - m);
    pmm = pm1;
    pm1 = pl;
  }
  return pl;
}

/** sqrt((2l+1)/(4 pi) (l-|m|)!/(l+|m|)!) */
export function ylmNorm(l: number, m: number): number {
  const am = Math.abs(m);
  return Math.sqrt(((2 * l + 1) / (4 * Math.PI)) * (factorial(l - am) / factorial(l + am)));
}

/**
 * Complex spherical harmonic Y_l^m(theta, phi), Condon-Shortley convention.
 * Writes [Re, Im] into out.
 */
export function ylmComplex(l: number, m: number, cosT: number, phi: number, out: number[] | Float64Array): void {
  const am = Math.abs(m);
  let v = ylmNorm(l, m) * legendre(l, am, cosT);
  if (m > 0 && am % 2 === 1) v = -v; // (-1)^m for m > 0
  out[0] = v * Math.cos(m * phi);
  out[1] = v * Math.sin(m * phi);
}

/**
 * Real ("chemistry") spherical harmonic. m > 0 goes with cos(m phi), m < 0 with sin(|m| phi).
 * Signs chosen so p_x is positive along +x, d_xy positive where xy > 0, and so on.
 */
export function ylmReal(l: number, m: number, cosT: number, phi: number): number {
  const am = Math.abs(m);
  const base = ylmNorm(l, m) * legendre(l, am, cosT);
  if (m === 0) return base;
  return Math.SQRT2 * base * (m > 0 ? Math.cos(am * phi) : Math.sin(am * phi));
}

const REAL_LABELS: Record<number, Record<number, string>> = {
  0: { 0: '' },
  1: { 0: 'z', 1: 'x', [-1]: 'y' },
  2: { 0: 'z2', 1: 'xz', [-1]: 'yz', 2: 'x2-y2', [-2]: 'xy' },
  3: { 0: 'z3', 1: 'xz2', [-1]: 'yz2', 2: 'z(x2-y2)', [-2]: 'xyz', 3: 'x(x2-3y2)', [-3]: 'y(3x2-y2)' },
  4: { 0: 'z4', 1: 'xz3', [-1]: 'yz3', 2: 'z2(x2-y2)', [-2]: 'xyz2', 3: 'xz(x2-3y2)', [-3]: 'yz(3x2-y2)', 4: 'x4+y4', [-4]: 'xy(x2-y2)' },
};

/** ASCII orbital name, e.g. "1s", "3d_xz", "3d_z2", "2p(m=+1)". */
export function orbitalName(n: number, l: number, m: number, basis: Basis = 'real'): string {
  const head = `${n}${LETTERS[l]}`;
  if (l === 0) return head;
  if (basis === 'complex' || !REAL_LABELS[l]) return `${head}(m=${m > 0 ? '+' : ''}${m})`;
  return `${head}_${REAL_LABELS[l][m]}`;
}

/** Display version with superscripts, e.g. "3d z²". */
export function prettyName(name: string): string {
  return name
    .replace('_', ' ')
    .replace(/([a-z)])2/g, '$1²')
    .replace(/([a-z)])3/g, '$1³')
    .replace(/([a-z)])4/g, '$1⁴')
    .replace(/-(?=\d|y)/g, '−')
    .replace('=-', '=−');
}

export const energyEv = (n: number): number => -RYDBERG_EV / (n * n);
export const meanRadius = (n: number, l: number): number => (3 * n * n - l * (l + 1)) / 2;
export const radialNodes = (n: number, l: number): number => n - l - 1;
export const angularNodes = (l: number): number => l;
/** Spinless degeneracy of level n. With spin it doubles to 2n^2. */
export const degeneracy = (n: number): number => n * n;

// --- Transitions

export function rydbergConstant(reducedMass = true): number {
  return reducedMass ? R_INF / (1 + ME_OVER_MP) : R_INF;
}

/** Vacuum wavelength in nm of the photon emitted in nUpper -> nLower. */
export function transitionWavelengthNm(nUpper: number, nLower: number, reducedMass = true): number {
  const inv = rydbergConstant(reducedMass) * (1 / (nLower * nLower) - 1 / (nUpper * nUpper));
  return 1e9 / inv;
}

/** Photon energy in eV for nUpper -> nLower. */
export function transitionEnergyEv(nUpper: number, nLower: number, reducedMass = true): number {
  const f = reducedMass ? 1 / (1 + ME_OVER_MP) : 1;
  return RYDBERG_EV * f * (1 / (nLower * nLower) - 1 / (nUpper * nUpper));
}

/** Refractive index of standard dry air (Edlén 1966). Valid roughly from 200 nm to 2 um. */
export function airIndex(vacNm: number): number {
  const s2 = (1000 / vacNm) ** 2; // (1/um)^2
  return 1 + 1e-8 * (8342.54 + 2406147 / (130 - s2) + 15998 / (38.9 - s2));
}

/** Wavelength measured in air, which is how spectroscopists quote visible lines (H alpha = 656.28 nm). */
export function airWavelengthNm(vacNm: number): number {
  return vacNm < 200 ? vacNm : vacNm / airIndex(vacNm);
}

const SERIES = ['', 'Lyman', 'Balmer', 'Paschen', 'Brackett', 'Pfund', 'Humphreys'];
const GREEK = ['α', 'β', 'γ', 'δ', 'ε', 'ζ'];

export const seriesName = (nLower: number): string => SERIES[nLower] ?? `n=${nLower}`;

/** Conventional line name, e.g. "Hα" for Balmer 3 -> 2, "Lyman α" for 2 -> 1. */
export function lineName(nUpper: number, nLower: number): string {
  const g = GREEK[nUpper - nLower - 1] ?? '';
  if (nLower === 2) return `H${g}`;
  return `${seriesName(nLower)} ${g}`;
}

/** Approximate sRGB colour (0..1) of a wavelength. Returns null outside 380-750 nm. */
export function wavelengthToRGB(nm: number): [number, number, number] | null {
  if (nm < 380 || nm > 750) return null;
  let r = 0, g = 0, b = 0;
  if (nm < 440) { r = -(nm - 440) / 60; b = 1; }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
  else r = 1;
  let f = 1;
  if (nm < 420) f = 0.3 + (0.7 * (nm - 380)) / 40;
  else if (nm > 700) f = 0.3 + (0.7 * (750 - nm)) / 50;
  return [r * f, g * f, b * f];
}

// --- Radial grid, CDF and sampler

export interface RadialTable {
  r: Float64Array;
  cdf: Float64Array;
  rMax: number;
}

const radialCache = new Map<number, RadialTable>();
const RGRID = 6000;

/** Outer radius that holds all but a negligible tail of the density. */
export const radialExtent = (n: number): number => n * (n + 14);

export function radialTable(n: number, l: number): RadialTable {
  const key = n * 16 + l;
  const hit = radialCache.get(key);
  if (hit) return hit;
  const rMax = radialExtent(n);
  const r = new Float64Array(RGRID);
  const cdf = new Float64Array(RGRID);
  const dr = rMax / (RGRID - 1);
  let prev = 0;
  for (let i = 0; i < RGRID; i++) {
    r[i] = i * dr;
    const p = radialProb(n, l, r[i]);
    if (i > 0) cdf[i] = cdf[i - 1] + 0.5 * (p + prev) * dr;
    prev = p;
  }
  const tot = cdf[RGRID - 1];
  for (let i = 0; i < RGRID; i++) cdf[i] /= tot;
  const t = { r, cdf, rMax };
  radialCache.set(key, t);
  return t;
}

/** Radius r such that the probability of finding the electron inside r is q. */
export function radiusQuantile(n: number, l: number, q: number): number {
  const { r, cdf } = radialTable(n, l);
  let lo = 0;
  let hi = cdf.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cdf[mid] < q) lo = mid;
    else hi = mid;
  }
  const span = cdf[hi] - cdf[lo];
  const f = span > 0 ? (q - cdf[lo]) / span : 0;
  return r[lo] + f * (r[hi] - r[lo]);
}

const ymaxCache = new Map<string, number>();
const cpx = new Float64Array(2);

/** Maximum of |Y|^2 over the sphere, found on a grid and padded a little. */
export function angularMax(l: number, m: number, basis: Basis): number {
  const key = `${l},${m},${basis}`;
  const hit = ymaxCache.get(key);
  if (hit !== undefined) return hit;
  let mx = 0;
  const NT = 241;
  const NP = basis === 'real' && m !== 0 ? 181 : 1;
  for (let i = 0; i < NT; i++) {
    const c = -1 + (2 * i) / (NT - 1);
    for (let j = 0; j < NP; j++) {
      const phi = (Math.PI * 2 * j) / Math.max(1, NP - 1);
      let v: number;
      if (basis === 'real') v = ylmReal(l, m, c, phi) ** 2;
      else {
        ylmComplex(l, m, c, phi, cpx);
        v = cpx[0] * cpx[0] + cpx[1] * cpx[1];
      }
      if (v > mx) mx = v;
    }
  }
  mx *= 1.04;
  ymaxCache.set(key, mx);
  return mx;
}

export interface OrbitalSpec {
  n: number;
  l: number;
  m: number;
  basis: Basis;
}

/** Deterministic PRNG (mulberry32) for reproducible clouds and tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Draw N points from |psi_nlm|^2.
 * r comes from the inverse CDF of r^2 R^2 on a fine grid. The angles come from rejection sampling on |Y|^2.
 * pos receives x, y, z (a0 units, z is the quantisation axis). phase receives the wavefunction phase in radians:
 * 0 or pi in the real basis (the sign), and arg(psi) in the complex basis.
 * base, if given, holds 3 uniforms per point used for r and the first angular proposal, so resampling a new orbital
 * with the same base keeps each point's radial quantile. This makes morphs between orbitals smooth.
 */
export function sampleOrbital(
  o: OrbitalSpec, N: number, rng: () => number,
  pos: Float32Array, phase: Float32Array, base?: Float32Array,
): void {
  const { n, l, m, basis } = o;
  const { r: rg, cdf } = radialTable(n, l);
  const ymax = angularMax(l, m, basis);
  const last = cdf.length - 1;
  for (let i = 0; i < N; i++) {
    // radius by inverse CDF
    const u = base ? base[i * 3] : rng();
    let lo = 0;
    let hi = last;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < u) lo = mid;
      else hi = mid;
    }
    const span = cdf[hi] - cdf[lo];
    const r = rg[lo] + (span > 0 ? (u - cdf[lo]) / span : 0) * (rg[hi] - rg[lo]);
    // angles by rejection
    let c = 0, phi = 0, yv = 0, yi = 0;
    let first = !!base;
    for (let tries = 0; tries < 100000; tries++) {
      c = first ? 2 * base![i * 3 + 1] - 1 : 2 * rng() - 1;
      phi = first ? 2 * Math.PI * base![i * 3 + 2] : 2 * Math.PI * rng();
      first = false;
      let d: number;
      if (basis === 'real') {
        yv = ylmReal(l, m, c, phi);
        d = yv * yv;
      } else {
        ylmComplex(l, m, c, phi, cpx);
        yv = cpx[0];
        yi = cpx[1];
        d = yv * yv + yi * yi;
      }
      if (rng() * ymax <= d) break;
    }
    const s = Math.sqrt(Math.max(0, 1 - c * c));
    pos[i * 3] = r * s * Math.cos(phi);
    pos[i * 3 + 1] = r * s * Math.sin(phi);
    pos[i * 3 + 2] = r * c;
    const R = radial(n, l, r);
    if (basis === 'real') phase[i] = R * yv >= 0 ? 0 : Math.PI;
    else phase[i] = Math.atan2(R * yi, R * yv);
  }
}

/** psi at a Cartesian point (a0 units, z up). Writes [Re, Im] into out. In the real basis Im is 0. */
export function psiAt(o: OrbitalSpec, x: number, y: number, z: number, out: number[] | Float64Array): void {
  const r = Math.sqrt(x * x + y * y + z * z);
  const c = r > 0 ? z / r : 1;
  const phi = Math.atan2(y, x);
  const R = radial(o.n, o.l, r);
  if (o.basis === 'real') {
    out[0] = R * ylmReal(o.l, o.m, c, phi);
    out[1] = 0;
  } else {
    ylmComplex(o.l, o.m, c, phi, out);
    out[0] *= R;
    out[1] *= R;
  }
}

/** Simpson integral of f on [a, b] with an even number of intervals. */
export function simpson(f: (x: number) => number, a: number, b: number, intervals = 20000): number {
  const k = intervals % 2 === 0 ? intervals : intervals + 1;
  const h = (b - a) / k;
  let s = f(a) + f(b);
  for (let i = 1; i < k; i++) s += (i % 2 ? 4 : 2) * f(a + i * h);
  return (s * h) / 3;
}
