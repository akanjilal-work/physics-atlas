// Band structure physics. Pure functions, no DOM.
// Units: energy in eV, length in angstrom (Å), wavevector in 1/Å.
//
// Kronig–Penney cell: a well of width w = a − b (V = 0) on [0, w),
// then a barrier of width b (V = V0) on [w, a).
// The dispersion comes from the one-cell transfer matrix M acting on (ψ, ψ'):
//   cos(ka) = tr(M) / 2
// which for E < V0 is the full Kronig–Penney relation
//   cos(ka) = cos(αw) cosh(βb) + (β² − α²)/(2αβ) sin(αw) sinh(βb).

/** ħ² / (2 mₑ) in eV·Å². */
export const HB2M = 3.80998;
/** Boltzmann constant in eV/K. */
export const KB = 8.617333e-5;
/** ħ in eV·s. */
export const HBAR = 6.582119569e-16;
/** Number of Kronig–Penney bands the app tracks. */
export const NBANDS = 5;
/** Gap below which a filled band counts as touching the next (a semimetal or metal). */
export const GAP_ZERO = 0.01;
/** Conventional (fuzzy) line between semiconductor and insulator, in eV. */
export const GAP_INSULATOR = 4;

export interface KPParams {
  /** Barrier height, eV. */
  V0: number;
  /** Lattice constant (period), Å. */
  a: number;
  /** Barrier width, Å. */
  b: number;
}

/**
 * Transfer matrix for (ψ, ψ') across a flat region of length d where E − V = de.
 * Writes [m11, m12, m21, m22] into out at offset o.
 */
function region(de: number, d: number, out: Float64Array, o: number): void {
  if (de > 1e-12) {
    const q = Math.sqrt(de / HB2M);
    const c = Math.cos(q * d);
    const s = Math.sin(q * d);
    out[o] = c;
    out[o + 1] = s / q;
    out[o + 2] = -q * s;
    out[o + 3] = c;
  } else if (de < -1e-12) {
    const q = Math.sqrt(-de / HB2M);
    const c = Math.cosh(q * d);
    const s = Math.sinh(q * d);
    out[o] = c;
    out[o + 1] = s / q;
    out[o + 2] = q * s;
    out[o + 3] = c;
  } else {
    out[o] = 1;
    out[o + 1] = d;
    out[o + 2] = 0;
    out[o + 3] = 1;
  }
}

const tmp = new Float64Array(8);

/** One-cell transfer matrix M = B · W (well first, then barrier). */
export function cellMatrix(E: number, p: KPParams, out: Float64Array = new Float64Array(4)): Float64Array {
  const w = p.a - p.b;
  region(E, w, tmp, 0);
  region(E - p.V0, p.b, tmp, 4);
  const [w11, w12, w21, w22] = [tmp[0], tmp[1], tmp[2], tmp[3]];
  const [b11, b12, b21, b22] = [tmp[4], tmp[5], tmp[6], tmp[7]];
  out[0] = b11 * w11 + b12 * w21;
  out[1] = b11 * w12 + b12 * w22;
  out[2] = b21 * w11 + b22 * w21;
  out[3] = b21 * w12 + b22 * w22;
  return out;
}

const mScratch = new Float64Array(4);

/** Right-hand side of the Kronig–Penney relation: cos(ka) = D(E). Allowed bands have |D| ≤ 1. */
export function kpD(E: number, p: KPParams): number {
  const m = cellMatrix(E, p, mScratch);
  return 0.5 * (m[0] + m[3]);
}

/** The textbook closed form for E < V0 (used as a cross-check of the transfer matrix). */
export function kpClosedForm(E: number, p: KPParams): number {
  const w = p.a - p.b;
  const al = Math.sqrt(E / HB2M);
  if (E < p.V0) {
    const be = Math.sqrt((p.V0 - E) / HB2M);
    return Math.cos(al * w) * Math.cosh(be * p.b) + ((be * be - al * al) / (2 * al * be)) * Math.sin(al * w) * Math.sinh(be * p.b);
  }
  const ga = Math.sqrt((E - p.V0) / HB2M);
  return Math.cos(al * w) * Math.cos(ga * p.b) - ((al * al + ga * ga) / (2 * al * ga)) * Math.sin(al * w) * Math.sin(ga * p.b);
}

/** Dirac-comb limit: cos(ka) = cos(αa) + (m V0 b / ħ² α) sin(αa). */
export function deltaCombD(E: number, a: number, V0b: number): number {
  const al = Math.sqrt(E / HB2M);
  return Math.cos(al * a) + (V0b / (2 * HB2M * al)) * Math.sin(al * a);
}

const EDGE_EPS = 1e-7;
const SCAN = 40000;

/**
 * Band edges [bottom₁, top₁, bottom₂, top₂, …] for the first nBands bands.
 * Scans in √E (finer at low energy) for crossings of D = ±(1 − ε), then bisects.
 */
export function bandEdges(p: KPParams, nBands = NBANDS): number[] {
  // E_n(k) ≤ E_n^free(k) + V0, so this upper limit always contains nBands bands.
  const Emax = HB2M * Math.pow(((nBands + 0.3) * Math.PI) / p.a, 2) + p.V0 + 1;
  const sMax = Math.sqrt(Emax);
  const roots: number[] = [];
  const lim = 1 - EDGE_EPS;
  const f = (E: number) => {
    const d = kpD(E, p);
    // piecewise: distance outside the allowed strip, signed
    return Math.abs(d) - lim;
  };
  let sPrev = 1e-6;
  let fPrev = f(sPrev * sPrev);
  for (let i = 1; i <= SCAN && roots.length < 2 * nBands; i++) {
    const s = (i / SCAN) * sMax;
    const fv = f(s * s);
    if ((fPrev > 0) !== (fv > 0)) {
      let lo = sPrev, hi = s, flo = fPrev;
      for (let it = 0; it < 60; it++) {
        const mid = 0.5 * (lo + hi);
        const fm = f(mid * mid);
        if ((fm > 0) === (flo > 0)) { lo = mid; flo = fm; } else hi = mid;
      }
      roots.push(0.25 * (lo + hi) * (lo + hi));
    }
    sPrev = s;
    fPrev = fv;
  }
  // Starting inside a band (V0 = 0 exactly): the first edge is E = 0.
  if (f(1e-12) <= 0) roots.unshift(0);
  return roots.slice(0, 2 * nBands);
}

/** Reduce k to the first Brillouin zone [−π/a, π/a]. */
export function reduceK(k: number, a: number): number {
  const G = (2 * Math.PI) / a;
  let r = k - G * Math.round(k / G);
  if (r > Math.PI / a) r -= G;
  return r;
}

/** Energy of band n (1-based) at wavevector k, by bisection inside the band. */
export function bandEnergy(p: KPParams, edges: number[], n: number, k: number): number {
  const lo0 = edges[2 * n - 2];
  const hi0 = edges[2 * n - 1];
  if (lo0 === undefined || hi0 === undefined) return NaN;
  const lim = 1 - EDGE_EPS;
  const c = Math.max(-lim, Math.min(lim, Math.cos(k * p.a)));
  let lo = lo0, hi = hi0;
  // Inside a band D runs monotonically from ±1 at the bottom to ∓1 at the top.
  const s = kpD(lo0, p) > 0 ? 1 : -1;
  for (let it = 0; it < 70; it++) {
    const mid = 0.5 * (lo + hi);
    if (s * (kpD(mid, p) - c) > 0) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/**
 * Bloch wavefunction ψ(x) of energy E and wavevector k at positions xs (Å).
 * Built from the eigenvector of the cell transfer matrix with eigenvalue e^{ika}.
 * Normalised so max |ψ| = 1 over the given points. Returns the dispersion residual |D(E) − cos ka|.
 */
export function blochWave(p: KPParams, E: number, k: number, xs: ArrayLike<number>, re: Float64Array, im: Float64Array, count = xs.length): number {
  const M = cellMatrix(E, p, new Float64Array(4));
  const lr = Math.cos(k * p.a);
  const li = Math.sin(k * p.a);
  // Two candidate eigenvectors of M for λ = lr + i li. Pick the better conditioned one.
  // v1 = (m12, λ − m11), v2 = (λ − m22, m21)
  const n1 = M[1] * M[1] + (lr - M[0]) ** 2 + li * li;
  const n2 = (lr - M[3]) ** 2 + li * li + M[2] * M[2];
  let v0r: number, v0i: number, v1r: number, v1i: number;
  if (n1 >= n2) { v0r = M[1]; v0i = 0; v1r = lr - M[0]; v1i = li; } else { v0r = lr - M[3]; v0i = li; v1r = M[2]; v1i = 0; }
  // Fix the global phase so ψ(0) is real and positive.
  const m0 = Math.hypot(v0r, v0i);
  if (m0 > 1e-12) {
    const cr = v0r / m0, ci = -v0i / m0;
    const a0 = v0r * cr - v0i * ci, a1 = v1r * cr - v1i * ci, b1 = v1r * ci + v1i * cr;
    v0r = a0; v0i = 0; v1r = a1; v1i = b1;
  }
  const w = p.a - p.b;
  const P = new Float64Array(8);
  let maxAbs = 0;
  for (let j = 0; j < count; j++) {
    const x = xs[j];
    const m = Math.floor(x / p.a);
    const xi = x - m * p.a;
    let r0: number, i0: number;
    if (xi < w) {
      region(E, xi, P, 0);
      r0 = P[0] * v0r + P[1] * v1r;
      i0 = P[0] * v0i + P[1] * v1i;
    } else {
      region(E, w, P, 0);
      region(E - p.V0, xi - w, P, 4);
      const ur = P[0] * v0r + P[1] * v1r, ui = P[0] * v0i + P[1] * v1i;
      const dr = P[2] * v0r + P[3] * v1r, di = P[2] * v0i + P[3] * v1i;
      r0 = P[4] * ur + P[5] * dr;
      i0 = P[4] * ui + P[5] * di;
    }
    // multiply by λ^m = e^{ikam}
    const ph = k * p.a * m;
    const c = Math.cos(ph), s = Math.sin(ph);
    re[j] = r0 * c - i0 * s;
    im[j] = r0 * s + i0 * c;
    const ab = Math.hypot(re[j], im[j]);
    if (ab > maxAbs) maxAbs = ab;
  }
  if (maxAbs > 0) for (let j = 0; j < count; j++) { re[j] /= maxAbs; im[j] /= maxAbs; }
  return Math.abs(0.5 * (M[0] + M[3]) - Math.cos(k * p.a));
}

/** Effective mass m*ₑ ratio (m* over mₑ) from the band curvature d²E/dk² (eV·Å²). */
export function effMassFromCurvature(d2E: number): number {
  return (2 * HB2M) / d2E;
}

/** Curvature d²E/dk² of band n at k by central differences. */
export function bandCurvature(p: KPParams, edges: number[], n: number, k: number, h = 1e-3): number {
  const e0 = bandEnergy(p, edges, n, k);
  const ep = bandEnergy(p, edges, n, k + h);
  const em = bandEnergy(p, edges, n, k - h);
  return (ep - 2 * e0 + em) / (h * h);
}

/** Group velocity (m/s) of band n at k: v = (1/ħ) dE/dk. */
export function groupVelocity(p: KPParams, edges: number[], n: number, k: number, h = 1e-4): number {
  const dE = (bandEnergy(p, edges, n, k + h) - bandEnergy(p, edges, n, k - h)) / (2 * h); // eV·Å
  return (dE * 1e-10) / HBAR;
}

// --- Tight binding

/** 1D tight-binding chain: E(k) = ε − 2t cos(ka). */
export function tbChain(k: number, eps: number, t: number, a: number): number {
  return eps - 2 * t * Math.cos(k * a);
}

/** Effective mass at the bottom of the tight-binding band, m*ₑ ratio (m* over mₑ) = ħ²/(2ta²) / mₑ. */
export function tbEffMass(t: number, a: number): number {
  return HB2M / (t * a * a);
}

/** 2D square lattice: E = ε − 2t (cos kx a + cos ky a). */
export function square2D(kx: number, ky: number, eps: number, t: number, a: number): number {
  return eps - 2 * t * (Math.cos(kx * a) + Math.cos(ky * a));
}

/** Graphene carbon–carbon distance and lattice constant (Å), and hopping (eV). */
export const GRAPHENE = { acc: 1.42, a: 1.42 * Math.sqrt(3), t: 2.7 };

/**
 * Graphene nearest-neighbour tight binding, upper band E₊ = t |1 + e^{ik·a₁} + e^{ik·a₂}|,
 * with a₁ = a(1/2, √3/2), a₂ = a(−1/2, √3/2). The lower band is −E₊.
 */
export function grapheneE(kx: number, ky: number, t = GRAPHENE.t, a = GRAPHENE.a): number {
  const p1 = a * (0.5 * kx + (Math.sqrt(3) / 2) * ky);
  const p2 = a * (-0.5 * kx + (Math.sqrt(3) / 2) * ky);
  const re = 1 + Math.cos(p1) + Math.cos(p2);
  const im = Math.sin(p1) + Math.sin(p2);
  return t * Math.hypot(re, im);
}

/** Dirac point K on the kx axis: (4π / 3a, 0). */
export function diracK(a = GRAPHENE.a): number {
  return (4 * Math.PI) / (3 * a);
}

// --- Filling

export type MaterialClass = 'metal' | 'semiconductor' | 'insulator';

export interface Filling {
  /** Highest band holding electrons (1-based). */
  band: number;
  /** True when that band is only partly filled. */
  partial: boolean;
  /** Fermi level at T = 0 (mid-gap for a filled band), eV. */
  EF: number;
  /** Gap above the highest occupied band, eV (0 for a partly filled band). */
  gap: number;
  cls: MaterialClass;
}

/**
 * Fill bands with N electrons per cell (two per band, for spin).
 * A partly filled band holds its electrons in |k| < kF (or the mirror near π/a), and for a
 * half-filled band kF = π/2a whichever end the band bottom sits.
 */
export function fill(p: KPParams, edges: number[], N: number): Filling {
  const band = Math.max(1, Math.ceil(N / 2));
  const partial = N % 2 === 1;
  if (partial) {
    const EF = bandEnergy(p, edges, band, Math.PI / (2 * p.a));
    return { band, partial, EF, gap: 0, cls: 'metal' };
  }
  const top = edges[2 * band - 1];
  const next = edges[2 * band];
  const gap = Math.max(0, next - top);
  const EF = 0.5 * (top + next);
  const cls: MaterialClass = gap < GAP_ZERO ? 'metal' : gap <= GAP_INSULATOR ? 'semiconductor' : 'insulator';
  return { band, partial, EF, gap, cls };
}

/** Fermi–Dirac occupation. */
export function fermi(E: number, EF: number, T: number): number {
  if (T <= 0) return E < EF ? 1 : E > EF ? 0 : 0.5;
  const x = (E - EF) / (KB * T);
  if (x > 60) return 0;
  if (x < -60) return 1;
  return 1 / (1 + Math.exp(x));
}

/**
 * Rough intrinsic carrier density (cm⁻³) using silicon's effective densities of states,
 * n ≈ √(Nc Nv) (T/300)^{3/2} e^{−Eg / 2kT}. Only an order-of-magnitude guide for other gaps.
 */
export function intrinsicCarriers(gap: number, T: number): number {
  if (T <= 0) return 0;
  const NcNv = Math.sqrt(2.8e19 * 1.04e19);
  return NcNv * Math.pow(T / 300, 1.5) * Math.exp(-gap / (2 * KB * T));
}
