// Chladni figures: vibration of thin plates, D ∇⁴w = ρh ω² w.
// Pure math. No DOM, no Three.js.
//
// Square plate, free edges: Ritz method with products of free-free beam
// functions (Warburton 1954, Leissa 1969). The basis is split by symmetry so
// every mode gets a clean (m, n)± label.
// Circular plate, clamped or free edge: exact Bessel-function solutions.
// Frequencies are given as the dimensionless Ω = ω a² √(ρh/D).

// ---------------------------------------------------------------------------
// Plate material (steel, 1 mm thick). Used to turn Ω into hertz.
// ---------------------------------------------------------------------------
export const STEEL = { E: 200e9, nu: 0.3, rho: 7850, h: 1e-3 };
/** Square side and circle radius, metres. */
export const SQUARE_SIDE = 0.24;
export const CIRCLE_RADIUS = 0.12;

export function flexuralRigidity(E: number, h: number, nu: number): number {
  return (E * h * h * h) / (12 * (1 - nu * nu));
}

/** Hertz per unit Ω for a plate of length scale a (side or radius). */
export function hzPerOmega(a: number, mat = STEEL): number {
  const D = flexuralRigidity(mat.E, mat.h, mat.nu);
  return Math.sqrt(D / (mat.rho * mat.h)) / (2 * Math.PI * a * a);
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------
/** Seeded PRNG (mulberry32), returns [0, 1). */
export function rng32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cyclic Jacobi eigen-solver for a symmetric n×n matrix (row-major, destroyed). */
export function jacobiEigen(A: Float64Array, n: number): { values: Float64Array; vectors: Float64Array } {
  const V = new Float64Array(n * n);
  for (let i = 0; i < n; i++) V[i * n + i] = 1;
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p * n + q] ** 2;
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = A[p * n + q];
        if (Math.abs(apq) < 1e-300) continue;
        const app = A[p * n + p];
        const aqq = A[q * n + q];
        const th = (aqq - app) / (2 * apq);
        const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = A[k * n + p];
          const akq = A[k * n + q];
          A[k * n + p] = c * akp - s * akq;
          A[k * n + q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p * n + k];
          const aqk = A[q * n + k];
          A[p * n + k] = c * apk - s * aqk;
          A[q * n + k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k * n + p];
          const vkq = V[k * n + q];
          V[k * n + p] = c * vkp - s * vkq;
          V[k * n + q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const values = new Float64Array(n);
  for (let i = 0; i < n; i++) values[i] = A[i * n + i];
  // vectors: column i is eigenvector i
  return { values, vectors: V };
}

/** Gauss–Legendre nodes and weights on [-1, 1]. */
export function gaussLegendre(n: number): { x: Float64Array; w: Float64Array } {
  const x = new Float64Array(n);
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let z = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5));
    let dp = 0;
    for (let it = 0; it < 100; it++) {
      let p0 = 1;
      let p1 = z;
      for (let k = 2; k <= n; k++) {
        const p2 = ((2 * k - 1) * z * p1 - (k - 1) * p0) / k;
        p0 = p1;
        p1 = p2;
      }
      dp = (n * (z * p1 - p0)) / (z * z - 1);
      const dz = p1 / dp;
      z -= dz;
      if (Math.abs(dz) < 1e-15) break;
    }
    x[i] = z;
    w[i] = 2 / ((1 - z * z) * dp * dp);
  }
  return { x, w };
}

// ---------------------------------------------------------------------------
// Bessel functions (power series, fine for |x| < 25)
// ---------------------------------------------------------------------------
function besselSeries(n: number, x: number, sign: number): number {
  const h = x / 2;
  let term = 1;
  for (let k = 1; k <= n; k++) term *= h / k;
  let sum = term;
  const h2 = h * h;
  for (let k = 1; k < 200; k++) {
    term *= (sign * h2) / (k * (k + n));
    sum += term;
    if (Math.abs(term) < 1e-17 * Math.abs(sum) && k > 3) break;
  }
  return sum;
}
export const besselJ = (n: number, x: number) => besselSeries(n, x, -1);
export const besselI = (n: number, x: number) => besselSeries(n, x, 1);
export const besselJp = (n: number, x: number) => (n === 0 ? -besselJ(1, x) : 0.5 * (besselJ(n - 1, x) - besselJ(n + 1, x)));
export const besselIp = (n: number, x: number) => (n === 0 ? besselI(1, x) : 0.5 * (besselI(n - 1, x) + besselI(n + 1, x)));

// ---------------------------------------------------------------------------
// Circular plate (radius 1)
// ---------------------------------------------------------------------------
export type Edge = 'clamped' | 'free';

/** Frequency determinant for w = A J_n(kr) + C I_n(kr). Zero at eigenvalues k = λ. */
export function circleDet(edge: Edge, n: number, k: number, nu: number): number {
  const J = besselJ(n, k);
  const I = besselI(n, k);
  const Jp = besselJp(n, k);
  const Ip = besselIp(n, k);
  if (edge === 'clamped') return J * Ip - I * Jp;
  const [mJ, vJ, mI, vI] = freeRows(n, k, nu, J, Jp, I, Ip);
  // Scale by 1/I to keep the numbers modest.
  return (mJ * vI - mI * vJ) / I;
}

function freeRows(n: number, k: number, nu: number, J: number, Jp: number, I: number, Ip: number): [number, number, number, number] {
  const n2 = n * n;
  // Radial derivatives at r = 1 of R = J_n(kr) and R = I_n(kr).
  const RJ1 = k * Jp;
  const RJ2 = k * k * (-Jp / k - (1 - n2 / (k * k)) * J);
  const RI1 = k * Ip;
  const RI2 = k * k * (-Ip / k + (1 + n2 / (k * k)) * I);
  // Bending moment M_r ∝ R'' + ν (R' − n² R)
  const mJ = RJ2 + nu * (RJ1 - n2 * J);
  const mI = RI2 + nu * (RI1 - n2 * I);
  // Kirchhoff shear V_r ∝ (∇²R)' − (1−ν) n² (R' − R)
  const vJ = -k * k * RJ1 - (1 - nu) * n2 * (RJ1 - J);
  const vI = k * k * RI1 - (1 - nu) * n2 * (RI1 - I);
  return [mJ, vJ, mI, vI];
}

/** First `count` roots k of the frequency equation for n nodal diameters. */
export function circleRoots(edge: Edge, n: number, count: number, nu = 0.3, kMax = 22): number[] {
  const roots: number[] = [];
  const dk = 0.01;
  let k0 = 0.3;
  let f0 = circleDet(edge, n, k0, nu);
  for (let k1 = k0 + dk; k1 < kMax && roots.length < count; k1 += dk) {
    const f1 = circleDet(edge, n, k1, nu);
    if (f0 === 0 || f0 * f1 < 0) {
      let a = k0;
      let b = k1;
      let fa = f0;
      for (let it = 0; it < 80; it++) {
        const m = 0.5 * (a + b);
        const fm = circleDet(edge, n, m, nu);
        if (fa * fm <= 0) b = m;
        else {
          a = m;
          fa = fm;
        }
      }
      roots.push(0.5 * (a + b));
    }
    k0 = k1;
    f0 = f1;
  }
  return roots;
}

export interface CircleMode {
  kind: 'circle';
  edge: Edge;
  /** Nodal diameters. */
  n: number;
  /** Interior nodal circles. */
  s: number;
  /** Root of the frequency equation. Ω = k². */
  k: number;
  Omega: number;
  /** w = (J_n(kr) + C I_n(kr)) cos nθ / norm */
  C: number;
  norm: number;
  label: string;
}

export function circleRadial(m: CircleMode, r: number): number {
  return (besselJ(m.n, m.k * r) + m.C * besselI(m.n, m.k * r)) / m.norm;
}

/** All circular-plate modes with Ω up to OmegaMax, sorted by frequency. */
export function circleModes(edge: Edge, nu: number, OmegaMax: number, nMax = 10): CircleMode[] {
  const out: CircleMode[] = [];
  const kMax = Math.sqrt(OmegaMax) + 0.05;
  for (let n = 0; n <= nMax; n++) {
    const ks = circleRoots(edge, n, 6, nu, kMax);
    for (const k of ks) {
      const J = besselJ(n, k);
      const I = besselI(n, k);
      let C: number;
      if (edge === 'clamped') C = -J / I;
      else {
        const [mJ, , mI] = freeRows(n, k, nu, J, besselJp(n, k), I, besselIp(n, k));
        C = -mJ / mI;
      }
      // Normalise so that the mean of w² over the disc is 1.
      const NR = 400;
      let integ = 0;
      for (let i = 0; i < NR; i++) {
        const r = (i + 0.5) / NR;
        const R = besselJ(n, k * r) + C * besselI(n, k * r);
        integ += R * R * r;
      }
      integ /= NR;
      const theta = n === 0 ? 2 * Math.PI : Math.PI;
      const norm = Math.sqrt((integ * theta) / Math.PI);
      const mode: CircleMode = { kind: 'circle', edge, n, s: 0, k, Omega: k * k, C, norm, label: '' };
      mode.s = countRadialNodes(mode);
      mode.label = `(${n}, ${mode.s})`;
      out.push(mode);
    }
  }
  out.sort((a, b) => a.Omega - b.Omega);
  return out;
}

function countRadialNodes(m: CircleMode): number {
  let count = 0;
  let prev = circleRadial(m, 1e-4);
  const N = 2000;
  for (let i = 1; i <= N; i++) {
    const r = (i / N) * 0.995;
    const v = circleRadial(m, r);
    if (prev * v < 0) count++;
    if (v !== 0) prev = v;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Free-free beam functions on [0, 1]
// ---------------------------------------------------------------------------
/** Roots of cos β cosh β = 1 (free-free beam), β₁ ≈ 4.7300. */
export function beamRoots(count: number): number[] {
  const out: number[] = [];
  for (let r = 1; r <= count; r++) {
    let b = ((2 * r + 1) * Math.PI) / 2;
    for (let it = 0; it < 60; it++) {
      const f = Math.cos(b) * Math.cosh(b) - 1;
      const df = -Math.sin(b) * Math.cosh(b) + Math.cos(b) * Math.sinh(b);
      const db = f / df;
      b -= db;
      if (Math.abs(db) < 1e-14) break;
    }
    out.push(b);
  }
  return out;
}

/**
 * Evaluate beam function i (0 = rigid translation, 1 = rigid rotation,
 * i ≥ 2 elastic) and its first two derivatives at x. Unnormalised for i ≥ 2.
 */
export function beamEval(i: number, x: number, betas: number[], out: Float64Array): void {
  if (i === 0) {
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    return;
  }
  if (i === 1) {
    out[0] = Math.sqrt(3) * (2 * x - 1);
    out[1] = 2 * Math.sqrt(3);
    out[2] = 0;
    return;
  }
  const b = betas[i - 2];
  const sb = Math.sinh(b) - Math.sin(b);
  const eps = (Math.cos(b) - Math.sin(b) - Math.exp(-b)) / sb; // 1 − σ, computed without cancellation
  const sig = 1 - eps;
  // cosh βx − σ sinh βx = ½[(1−σ)e^{βx} + (1+σ)e^{−βx}], stable for large β.
  const E = eps * Math.exp(b * x);
  const Em = (1 + sig) * Math.exp(-b * x);
  const c = Math.cos(b * x);
  const s = Math.sin(b * x);
  out[0] = 0.5 * (E + Em) + c - sig * s;
  out[1] = b * (0.5 * (E - Em) - s - sig * c);
  out[2] = b * b * (0.5 * (E + Em) - c + sig * s);
}

export interface Basis1D {
  N: number;
  betas: number[];
  /** Normalisation factors so that ∫X² dx = 1. */
  scale: Float64Array;
  /** 1D integrals, N×N row-major. A = ∫XX, B = ∫X''X'', C = ∫X''X, E = ∫X'X'. */
  A: Float64Array;
  B: Float64Array;
  C: Float64Array;
  E: Float64Array;
}

export function beamBasis(N: number): Basis1D {
  const betas = beamRoots(Math.max(1, N - 2));
  const gl = gaussLegendre(12);
  const panels = 32;
  const pts: number[] = [];
  const wts: number[] = [];
  for (let p = 0; p < panels; p++) {
    for (let q = 0; q < gl.x.length; q++) {
      pts.push((p + 0.5 + 0.5 * gl.x[q]) / panels);
      wts.push((0.5 * gl.w[q]) / panels);
    }
  }
  const Q = pts.length;
  const v = new Float64Array(N * Q);
  const d1 = new Float64Array(N * Q);
  const d2 = new Float64Array(N * Q);
  const tmp = new Float64Array(3);
  for (let i = 0; i < N; i++) {
    for (let q = 0; q < Q; q++) {
      beamEval(i, pts[q], betas, tmp);
      v[i * Q + q] = tmp[0];
      d1[i * Q + q] = tmp[1];
      d2[i * Q + q] = tmp[2];
    }
  }
  const scale = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let q = 0; q < Q; q++) s += wts[q] * v[i * Q + q] ** 2;
    scale[i] = 1 / Math.sqrt(s);
  }
  const A = new Float64Array(N * N);
  const B = new Float64Array(N * N);
  const C = new Float64Array(N * N);
  const E = new Float64Array(N * N);
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < N; k++) {
      let a = 0;
      let bb = 0;
      let c = 0;
      let e = 0;
      for (let q = 0; q < Q; q++) {
        const w = wts[q];
        a += w * v[i * Q + q] * v[k * Q + q];
        bb += w * d2[i * Q + q] * d2[k * Q + q];
        c += w * d2[i * Q + q] * v[k * Q + q];
        e += w * d1[i * Q + q] * d1[k * Q + q];
      }
      const f = scale[i] * scale[k];
      A[i * N + k] = a * f;
      B[i * N + k] = bb * f;
      C[i * N + k] = c * f;
      E[i * N + k] = e * f;
    }
  }
  return { N, betas, scale, A, B, C, E };
}

/** Normalised beam function value at x. */
export function beamValue(basis: Basis1D, i: number, x: number, tmp: Float64Array): number {
  beamEval(i, x, basis.betas, tmp);
  return tmp[0] * basis.scale[i];
}

// ---------------------------------------------------------------------------
// Square plate with free edges: Ritz
// ---------------------------------------------------------------------------
export interface SquareMode {
  kind: 'square';
  /** Nodal-line counts of the dominant beam-function pair (m ≤ n). */
  m: number;
  n: number;
  /** +1 for X_m(x)X_n(y) + X_n(x)X_m(y), −1 for minus, 0 when m = n. */
  sign: number;
  Omega: number;
  /** Coefficients c[a·N + b] of X_a(x) X_b(y). Σc² = 1. */
  c: Float64Array;
  /** Share of the dominant pair in the mode, 0..1. */
  purity: number;
  label: string;
}

export interface SquareSolution {
  basis: Basis1D;
  nu: number;
  modes: SquareMode[];
}

export function squareLabel(m: number, n: number, sign: number): string {
  return sign === 0 ? `(${m}, ${n})` : `(${m}, ${n})${sign > 0 ? '+' : '−'}`;
}

/**
 * Ritz solution of the free square plate (side 1). Returns elastic modes with
 * Ω below OmegaMax, sorted by frequency. Rigid-body modes are dropped.
 */
export function solveSquareFree(N = 12, nu = 0.3, OmegaMax = 400): SquareSolution {
  const basis = beamBasis(N);
  const { A, B, C, E } = basis;
  // Full stiffness in the product basis.
  const K = (a: number, b: number, c: number, d: number) =>
    B[a * N + c] * A[b * N + d] + A[a * N + c] * B[b * N + d] + nu * (C[a * N + c] * C[d * N + b] + C[c * N + a] * C[b * N + d]) + 2 * (1 - nu) * E[a * N + c] * E[b * N + d];
  // Symmetry-adapted basis: pairs (i ≤ j) with sign ±, split by parity class.
  type Fn = { i: number; j: number; sg: number };
  const blocks: Fn[][] = [];
  for (const sg of [1, -1]) {
    for (const cls of ['ee', 'oo', 'eo']) {
      const list: Fn[] = [];
      for (let i = 0; i < N; i++) {
        for (let j = i; j < N; j++) {
          if (sg < 0 && i === j) continue;
          const pi = i % 2;
          const pj = j % 2;
          const c = pi === pj ? (pi === 0 ? 'ee' : 'oo') : 'eo';
          if (c === cls) list.push({ i, j, sg });
        }
      }
      if (list.length) blocks.push(list);
    }
  }
  // Components of a symmetric-basis function in the product basis.
  const comps = (f: Fn): [number, number, number][] =>
    f.i === f.j ? [[f.i, f.i, 1]] : [[f.i, f.j, Math.SQRT1_2], [f.j, f.i, f.sg * Math.SQRT1_2]];
  const modes: SquareMode[] = [];
  for (const list of blocks) {
    const n = list.length;
    const M = new Float64Array(n * n);
    for (let p = 0; p < n; p++) {
      const cp = comps(list[p]);
      for (let q = p; q < n; q++) {
        const cq = comps(list[q]);
        let s = 0;
        for (const [a, b, wa] of cp) for (const [c, d, wc] of cq) s += wa * wc * K(a, b, c, d);
        M[p * n + q] = s;
        M[q * n + p] = s;
      }
    }
    const { values, vectors } = jacobiEigen(M, n);
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => values[a] - values[b]);
    const taken = new Set<number>();
    for (const e of order) {
      const lam = values[e];
      // Greedy label: dominant symmetric-basis function not yet used in this block.
      let best = -1;
      let bestW = -1;
      let tot = 0;
      for (let p = 0; p < n; p++) {
        const w = vectors[p * n + e] ** 2;
        tot += w;
        if (!taken.has(p) && w > bestW) {
          bestW = w;
          best = p;
        }
      }
      taken.add(best);
      if (lam < 1) continue; // rigid body
      const Omega = Math.sqrt(lam);
      if (Omega > OmegaMax) continue;
      const c = new Float64Array(N * N);
      for (let p = 0; p < n; p++) {
        const cf = vectors[p * n + e];
        for (const [a, b, w] of comps(list[p])) c[a * N + b] += cf * w;
      }
      const f = list[best];
      const sign = f.i === f.j ? 0 : f.sg;
      modes.push({ kind: 'square', m: f.i, n: f.j, sign, Omega, c, purity: bestW / tot, label: squareLabel(f.i, f.j, sign) });
    }
  }
  modes.sort((a, b) => a.Omega - b.Omega);
  return { basis, nu, modes };
}

/** Tabulate the normalised beam functions at G evenly spaced points on [0, 1]. */
export function beamTable(basis: Basis1D, G: number): Float64Array {
  const N = basis.N;
  const out = new Float64Array(N * G);
  const tmp = new Float64Array(3);
  for (let i = 0; i < N; i++) for (let g = 0; g < G; g++) out[i * G + g] = beamValue(basis, i, g / (G - 1), tmp);
  return out;
}

/** Square mode on a G×G grid, index [i·G + j] for x = i/(G−1), y = j/(G−1). */
export function squareModeGrid(mode: SquareMode, basis: Basis1D, table: Float64Array, G: number, out: Float32Array): void {
  const N = basis.N;
  const T = new Float64Array(N * G); // T[a, j] = Σ_b c[a,b] X_b(y_j)
  for (let a = 0; a < N; a++) {
    for (let j = 0; j < G; j++) {
      let s = 0;
      for (let b = 0; b < N; b++) s += mode.c[a * N + b] * table[b * G + j];
      T[a * G + j] = s;
    }
  }
  for (let i = 0; i < G; i++) {
    for (let j = 0; j < G; j++) {
      let s = 0;
      for (let a = 0; a < N; a++) s += table[a * G + i] * T[a * G + j];
      out[i * G + j] = s;
    }
  }
}

/** Point value of a square mode. */
export function squareModeAt(mode: SquareMode, basis: Basis1D, x: number, y: number): number {
  const N = basis.N;
  const tmp = new Float64Array(3);
  const X = new Float64Array(N);
  const Y = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    X[i] = beamValue(basis, i, x, tmp);
    Y[i] = beamValue(basis, i, y, tmp);
  }
  let s = 0;
  for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) s += mode.c[a * N + b] * X[a] * Y[b];
  return s;
}

// ---------------------------------------------------------------------------
// Chladni's classic approximation for the square
// ---------------------------------------------------------------------------
/** w ≈ cos(nπx)cos(mπy) ± cos(mπx)cos(nπy) on the unit square. */
export function chladniApprox(n: number, m: number, sign: number, x: number, y: number): number {
  const a = Math.cos(n * Math.PI * x) * Math.cos(m * Math.PI * y);
  const b = Math.cos(m * Math.PI * x) * Math.cos(n * Math.PI * y);
  return sign === 0 ? a : a + sign * b;
}

/** ∇⁴ eigenvalue of the approximation: Ω = π²(n² + m²). */
export const approxOmega = (n: number, m: number) => Math.PI * Math.PI * (n * n + m * m);

// ---------------------------------------------------------------------------
// Driven response
// ---------------------------------------------------------------------------
/**
 * Complex modal amplitudes for harmonic forcing at angular frequency w.
 * a_k = F_k / (ω_k² − ω² + 2iζω_kω). Writes into re, im.
 */
export function modalResponse(omegas: ArrayLike<number>, forces: ArrayLike<number>, w: number, zeta: number, re: Float64Array, im: Float64Array): void {
  for (let k = 0; k < omegas.length; k++) {
    const wk = omegas[k];
    const dr = wk * wk - w * w;
    const di = 2 * zeta * wk * w;
    const den = dr * dr + di * di;
    re[k] = (forces[k] * dr) / den;
    im[k] = (-forces[k] * di) / den;
  }
}

// ---------------------------------------------------------------------------
// Sand
// ---------------------------------------------------------------------------
/** Bilinear lookup of a G×G grid at (u, v) ∈ [0,1]². */
export function bilinear(grid: ArrayLike<number>, G: number, u: number, v: number): number {
  const x = Math.min(G - 1.000001, Math.max(0, u * (G - 1)));
  const y = Math.min(G - 1.000001, Math.max(0, v * (G - 1)));
  const i = x | 0;
  const j = y | 0;
  const fx = x - i;
  const fy = y - j;
  const o = i * G + j;
  return (grid[o] * (1 - fx) + grid[o + G] * fx) * (1 - fy) + (grid[o + 1] * (1 - fx) + grid[o + G + 1] * fx) * fy;
}

/**
 * One hop for every grain. `hop` holds the plate acceleration divided by the
 * hop threshold g. Where hop > 1 the plate throws the grain up, and it lands a
 * random distance away proportional to the local amplitude. Where hop ≤ 1 the
 * grain cannot take off, but while the plate is ringing it still rattles and
 * slides a little, by `creep` times the same amplitude-proportional step.
 * With creep = 0 grains below the threshold never move. Returns how many
 * grains left the plate this step.
 */
export function sandStep(
  u: Float32Array, v: Float32Array, count: number, hop: ArrayLike<number>, G: number,
  circle: boolean, stepScale: number, rand: () => number, creep = 0,
): number {
  let moved = 0;
  for (let i = 0; i < count; i++) {
    const h = bilinear(hop, G, u[i], v[i]);
    let s: number;
    if (h > 1) {
      moved++;
      s = Math.min(0.06, stepScale * h);
    } else {
      if (creep <= 0) continue;
      s = creep * stepScale * h;
    }
    let x = u[i] + s * (rand() * 2 - 1);
    let y = v[i] + s * (rand() * 2 - 1);
    if (circle) {
      let dx = x * 2 - 1;
      let dy = y * 2 - 1;
      const r = Math.hypot(dx, dy);
      if (r > 0.995) {
        const rr = Math.max(0, 1.99 - r);
        dx *= rr / r;
        dy *= rr / r;
        x = (dx + 1) / 2;
        y = (dy + 1) / 2;
      }
    } else {
      if (x < 0.002) x = 0.004 - x;
      if (x > 0.998) x = 1.996 - x;
      if (y < 0.002) y = 0.004 - y;
      if (y > 0.998) y = 1.996 - y;
    }
    u[i] = x;
    v[i] = y;
  }
  return moved;
}

/**
 * Node concentration: the fraction of grains sitting where |W| < frac·max,
 * divided by the fraction of plate area there. 1 for uniform sand, large when
 * the sand has gathered on nodal lines.
 */
export function nodeConcentration(
  u: Float32Array, v: Float32Array, count: number, absW: ArrayLike<number>, G: number,
  mask: ArrayLike<number> | null, frac = 0.2,
): number {
  let mx = 0;
  let cells = 0;
  for (let k = 0; k < G * G; k++) {
    if (mask && !mask[k]) continue;
    mx = Math.max(mx, absW[k]);
    cells++;
  }
  if (mx <= 0 || count === 0) return 1;
  const thr = frac * mx;
  let low = 0;
  for (let k = 0; k < G * G; k++) if ((!mask || mask[k]) && absW[k] < thr) low++;
  const areaFrac = low / cells;
  let g = 0;
  for (let i = 0; i < count; i++) if (bilinear(absW, G, u[i], v[i]) < thr) g++;
  return areaFrac > 0 ? g / count / areaFrac : 1;
}

// ---------------------------------------------------------------------------
// Nodal lines (marching squares on a G×G grid)
// ---------------------------------------------------------------------------
/** Writes segments as (u0, v0, u1, v1) quadruples. Returns segment count. */
export function zeroContour(grid: ArrayLike<number>, G: number, mask: ArrayLike<number> | null, out: Float32Array): number {
  const cap = out.length / 4;
  let seg = 0;
  const h = 1 / (G - 1);
  const px = [0, 0, 0, 0];
  const py = [0, 0, 0, 0];
  for (let i = 0; i < G - 1; i++) {
    for (let j = 0; j < G - 1; j++) {
      if (mask && !(mask[i * G + j] && mask[(i + 1) * G + j] && mask[i * G + j + 1] && mask[(i + 1) * G + j + 1])) continue;
      const f00 = grid[i * G + j];
      const f10 = grid[(i + 1) * G + j];
      const f01 = grid[i * G + j + 1];
      const f11 = grid[(i + 1) * G + j + 1];
      let np = 0;
      const u0 = i * h;
      const v0 = j * h;
      const edge = (fa: number, fb: number, ua: number, va: number, ub: number, vb: number) => {
        if (fa > 0 === fb > 0) return;
        const t = fa / (fa - fb);
        px[np] = ua + (ub - ua) * t;
        py[np] = va + (vb - va) * t;
        np++;
      };
      edge(f00, f10, u0, v0, u0 + h, v0);
      edge(f10, f11, u0 + h, v0, u0 + h, v0 + h);
      edge(f11, f01, u0 + h, v0 + h, u0, v0 + h);
      edge(f01, f00, u0, v0 + h, u0, v0);
      for (let k = 0; k + 1 < np && seg < cap; k += 2) {
        out[seg * 4] = px[k];
        out[seg * 4 + 1] = py[k];
        out[seg * 4 + 2] = px[k + 1];
        out[seg * 4 + 3] = py[k + 1];
        seg++;
      }
    }
  }
  return seg;
}
