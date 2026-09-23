// Quantum harmonic oscillator in units hbar = m = omega = 1.
// Pure maths: no DOM, no Three.js.
//
// Eigenstates psi_n are Hermite functions built with the stable three-term recurrence.
// Any state is stored as coefficients c_n in that basis, and time evolution is exact:
// c_n(t) = c_n e^{-i E_n t} with E_n = n + 1/2.

export const XL = 12; // grid half-width
export const NX = 1201; // grid points
export const NMAX = 80; // highest basis state kept

export type StateKind = 'eigen' | 'super' | 'coherent' | 'squeezed';

export interface StateParams {
  kind: StateKind;
  /** Level for an eigenstate, first level of a superposition. */
  n: number;
  /** Second level of a two-level superposition. */
  m: number;
  /** Coherent amplitude |alpha| and phase (radians). Also the displacement of a squeezed state. */
  alpha: number;
  phi: number;
  /** Squeeze parameter r. Delta x = e^{-r}/sqrt2 at t = 0. */
  r: number;
}

export const energy = (n: number): number => n + 0.5;

/** Fill out[0..nmax] with psi_0(x) .. psi_nmax(x). */
export function hermiteFunctions(x: number, nmax: number, out: Float64Array): void {
  const p0 = Math.PI ** -0.25 * Math.exp(-0.5 * x * x);
  out[0] = p0;
  if (nmax < 1) return;
  out[1] = Math.SQRT2 * x * p0;
  for (let n = 1; n < nmax; n++) {
    out[n + 1] = Math.sqrt(2 / (n + 1)) * x * out[n] - Math.sqrt(n / (n + 1)) * out[n - 1];
  }
}

/** A single eigenfunction value. Allocates, so keep it out of hot loops. */
export function psiN(n: number, x: number): number {
  const b = new Float64Array(n + 1);
  hermiteFunctions(x, n, b);
  return b[n];
}

/** Grid plus a table of all eigenfunctions on it. tab[n * NX + i] = psi_n(x_i). */
export class Basis {
  readonly x = new Float64Array(NX);
  readonly dx = (2 * XL) / (NX - 1);
  readonly tab = new Float64Array((NMAX + 1) * NX);
  constructor() {
    const col = new Float64Array(NMAX + 1);
    for (let i = 0; i < NX; i++) {
      const x = -XL + i * this.dx;
      this.x[i] = x;
      hermiteFunctions(x, NMAX, col);
      for (let n = 0; n <= NMAX; n++) this.tab[n * NX + i] = col[n];
    }
  }
}

/** Coefficients of the state at t = 0 in the eigenbasis. */
export function coefficients(p: StateParams, basis: Basis, re: Float64Array, im: Float64Array): void {
  re.fill(0);
  im.fill(0);
  if (p.kind === 'eigen') {
    re[p.n] = 1;
  } else if (p.kind === 'super') {
    if (p.n === p.m) re[p.n] = 1;
    else {
      re[p.n] = Math.SQRT1_2;
      re[p.m] = Math.SQRT1_2;
    }
  } else if (p.kind === 'coherent') {
    // Poisson weights: c_n = e^{-|a|^2/2} a^n / sqrt(n!)
    const ar = p.alpha * Math.cos(p.phi);
    const ai = p.alpha * Math.sin(p.phi);
    let cr = Math.exp(-0.5 * p.alpha * p.alpha);
    let ci = 0;
    re[0] = cr;
    for (let n = 1; n <= NMAX; n++) {
      const s = 1 / Math.sqrt(n);
      const nr = (cr * ar - ci * ai) * s;
      const ni = (cr * ai + ci * ar) * s;
      cr = nr;
      ci = ni;
      re[n] = cr;
      im[n] = ci;
    }
  } else {
    // Displaced squeezed Gaussian, projected on the basis numerically.
    const x0 = Math.SQRT2 * p.alpha * Math.cos(p.phi);
    const p0 = Math.SQRT2 * p.alpha * Math.sin(p.phi);
    const e2r = Math.exp(2 * p.r);
    const amp = (Math.exp(p.r) / Math.PI) ** 0.25;
    const { x, tab, dx } = basis;
    const gr = new Float64Array(NX);
    const gi = new Float64Array(NX);
    for (let i = 0; i < NX; i++) {
      const u = x[i] - x0;
      const a = amp * Math.exp(-0.5 * e2r * u * u);
      gr[i] = a * Math.cos(p0 * x[i]);
      gi[i] = a * Math.sin(p0 * x[i]);
    }
    let norm = 0;
    for (let n = 0; n <= NMAX; n++) {
      let sr = 0;
      let si = 0;
      const o = n * NX;
      for (let i = 0; i < NX; i++) {
        sr += tab[o + i] * gr[i];
        si += tab[o + i] * gi[i];
      }
      re[n] = sr * dx;
      im[n] = si * dx;
      norm += re[n] * re[n] + im[n] * im[n];
    }
    // The truncation loses less than 1e-4 of the norm for the slider ranges. Renormalise that away.
    const s = 1 / Math.sqrt(norm);
    for (let n = 0; n <= NMAX; n++) {
      re[n] *= s;
      im[n] *= s;
    }
  }
}

/** c_n(t) = c_n(0) e^{-i E_n t}. */
export function evolveCoeffs(re0: Float64Array, im0: Float64Array, t: number, re: Float64Array, im: Float64Array): void {
  for (let n = 0; n < re0.length; n++) {
    const a = re0[n];
    const b = im0[n];
    if (a === 0 && b === 0) {
      re[n] = 0;
      im[n] = 0;
      continue;
    }
    const th = -energy(n) * t;
    const c = Math.cos(th);
    const s = Math.sin(th);
    re[n] = a * c - b * s;
    im[n] = a * s + b * c;
  }
}

/** Indices of coefficients that matter. */
export function activeLevels(re: Float64Array, im: Float64Array, tol = 1e-9): Int32Array {
  const out: number[] = [];
  for (let n = 0; n < re.length; n++) if (re[n] * re[n] + im[n] * im[n] > tol * tol) out.push(n);
  return Int32Array.from(out);
}

/** psi(x_i) = sum_n c_n psi_n(x_i), restricted to grid indices [i0, i1). */
export function reconstruct(
  basis: Basis, re: Float64Array, im: Float64Array, active: Int32Array,
  psiRe: Float64Array, psiIm: Float64Array, i0 = 0, i1 = NX,
): void {
  const { tab } = basis;
  for (let i = i0; i < i1; i++) {
    psiRe[i] = 0;
    psiIm[i] = 0;
  }
  for (let k = 0; k < active.length; k++) {
    const n = active[k];
    const a = re[n];
    const b = im[n];
    const o = n * NX;
    for (let i = i0; i < i1; i++) {
      const v = tab[o + i];
      psiRe[i] += a * v;
      psiIm[i] += b * v;
    }
  }
}

export interface Moments {
  x: number;
  p: number;
  dx: number;
  dp: number;
  E: number;
  nbar: number;
  norm: number;
}

/** Exact moments from the coefficients using ladder operators. x = (a + a+)/sqrt2, p = i(a+ - a)/sqrt2. */
export function moments(re: Float64Array, im: Float64Array, out: Moments): Moments {
  let norm = 0, nbar = 0, ar = 0, ai = 0, a2r = 0;
  for (let n = 0; n < re.length; n++) {
    const w = re[n] * re[n] + im[n] * im[n];
    norm += w;
    nbar += n * w;
    if (n >= 1) {
      // <a> += sqrt(n) conj(c_{n-1}) c_n
      const s = Math.sqrt(n);
      ar += s * (re[n - 1] * re[n] + im[n - 1] * im[n]);
      ai += s * (re[n - 1] * im[n] - im[n - 1] * re[n]);
    }
    if (n >= 2) {
      const s = Math.sqrt(n * (n - 1));
      a2r += s * (re[n - 2] * re[n] + im[n - 2] * im[n]);
    }
  }
  const x = Math.SQRT2 * ar;
  const p = Math.SQRT2 * ai;
  const x2 = a2r + nbar + 0.5 * norm;
  const p2 = -a2r + nbar + 0.5 * norm;
  out.x = x;
  out.p = p;
  out.dx = Math.sqrt(Math.max(0, x2 - x * x));
  out.dp = Math.sqrt(Math.max(0, p2 - p * p));
  out.nbar = nbar;
  out.E = nbar + 0.5 * norm;
  out.norm = norm;
  return out;
}

/** Grid integrals of the density: norm, <x> and Delta x. Independent of the ladder-operator formulas. */
export function gridStats(basis: Basis, psiRe: Float64Array, psiIm: Float64Array): { norm: number; x: number; dx: number } {
  let s0 = 0, s1 = 0, s2 = 0;
  for (let i = 0; i < NX; i++) {
    const r = psiRe[i] * psiRe[i] + psiIm[i] * psiIm[i];
    const x = basis.x[i];
    s0 += r;
    s1 += r * x;
    s2 += r * x * x;
  }
  s0 *= basis.dx;
  s1 *= basis.dx;
  s2 *= basis.dx;
  const mx = s1 / s0;
  return { norm: s0, x: mx, dx: Math.sqrt(Math.max(0, s2 / s0 - mx * mx)) };
}

/** <H> by second-order finite differences on the grid: integral of conj(psi) (-psi''/2 + x^2 psi/2). */
export function energyFD(basis: Basis, psiRe: Float64Array, psiIm: Float64Array): number {
  const h = basis.dx;
  let e = 0;
  for (let i = 1; i < NX - 1; i++) {
    const lr = (psiRe[i + 1] - 2 * psiRe[i] + psiRe[i - 1]) / (h * h);
    const li = (psiIm[i + 1] - 2 * psiIm[i] + psiIm[i - 1]) / (h * h);
    const x = basis.x[i];
    const hr = -0.5 * lr + 0.5 * x * x * psiRe[i];
    const hi = -0.5 * li + 0.5 * x * x * psiIm[i];
    e += psiRe[i] * hr + psiIm[i] * hi;
  }
  return e * h;
}

/** Count nodes: local minima of |psi|^2 that drop below a small fraction of the peak. */
export function countNodes(rho: ArrayLike<number>, i0: number, i1: number, frac = 0.02): number {
  let max = 0;
  for (let i = i0; i < i1; i++) if (rho[i] > max) max = rho[i];
  const thr = max * frac;
  let nodes = 0;
  for (let i = i0 + 1; i < i1 - 1; i++) {
    if (rho[i] < thr && rho[i] < rho[i - 1] && rho[i] <= rho[i + 1]) nodes++;
  }
  return nodes;
}

/** Classical probability density of a particle with amplitude A: 1 / (pi sqrt(A^2 - x^2)). */
export function classicalDensity(A: number, x: number): number {
  const d = A * A - x * x;
  return d > 0 ? 1 / (Math.PI * Math.sqrt(d)) : 0;
}

/**
 * How well the quantum density matches the classical one, coarse-grained into bins across
 * [-A, A]. Returns 1 - total variation distance, so 1 is a perfect match.
 */
export function classicalMatch(basis: Basis, rho: ArrayLike<number>, A: number, bins = 8): number {
  const q = new Float64Array(bins);
  let out = 0;
  for (let i = 0; i < NX; i++) {
    const x = basis.x[i];
    const w = rho[i] * basis.dx;
    if (x <= -A || x >= A) {
      out += w;
      continue;
    }
    const b = Math.min(bins - 1, Math.floor(((x + A) / (2 * A)) * bins));
    q[b] += w;
  }
  let tv = out;
  for (let b = 0; b < bins; b++) {
    const lo = -A + (2 * A * b) / bins;
    const hi = lo + (2 * A) / bins;
    const pc = (Math.asin(Math.min(1, hi / A)) - Math.asin(Math.max(-1, lo / A))) / Math.PI;
    tv += Math.abs(q[b] - pc);
  }
  return 1 - 0.5 * tv;
}

// ------------------------------------------------------------------ Wigner functions

/** Generalised Laguerre polynomial L_n^{(k)}(u) by recurrence. */
export function laguerre(n: number, k: number, u: number): number {
  if (n === 0) return 1;
  let l0 = 1;
  let l1 = 1 + k - u;
  for (let j = 1; j < n; j++) {
    const l2 = ((2 * j + 1 + k - u) * l1 - (j + k) * l0) / (j + 1);
    l0 = l1;
    l1 = l2;
  }
  return l1;
}

/** Wigner function of the Fock state |n>: (-1)^n / pi * e^{-(x^2+p^2)} L_n(2(x^2+p^2)). */
export function wignerFock(n: number, x: number, p: number): number {
  const r2 = x * x + p * p;
  const s = n % 2 === 0 ? 1 : -1;
  return (s / Math.PI) * Math.exp(-r2) * laguerre(n, 0, 2 * r2);
}

const cross = { re: 0, im: 0 };
/**
 * Wigner function of the operator |m><n| with n > m:
 * (-1)^m / pi * sqrt(m!/n!) * (sqrt2 (x + i p))^{n-m} e^{-r^2} L_m^{(n-m)}(2 r^2).
 * Result in the module scratch `cross` to avoid allocation.
 */
export function wignerCross(m: number, n: number, x: number, p: number): { re: number; im: number } {
  const k = n - m;
  const r2 = x * x + p * p;
  // sqrt(m!/n!) = 1 / sqrt((m+1)(m+2)...n)
  let f = 1;
  for (let j = m + 1; j <= n; j++) f /= Math.sqrt(j);
  const mag = Math.pow(2 * r2, k / 2);
  const th = k * Math.atan2(p, x);
  const s = m % 2 === 0 ? 1 : -1;
  const a = (s / Math.PI) * f * mag * Math.exp(-r2) * laguerre(m, k, 2 * r2);
  cross.re = a * Math.cos(th);
  cross.im = a * Math.sin(th);
  return cross;
}

/** Centre of a displaced state in phase space at t = 0. */
export function centre(p: StateParams): [number, number] {
  return [Math.SQRT2 * p.alpha * Math.cos(p.phi), Math.SQRT2 * p.alpha * Math.sin(p.phi)];
}

/** Wigner function at t = 0. */
export function wigner0(p: StateParams, x: number, q: number): number {
  if (p.kind === 'eigen') return wignerFock(p.n, x, q);
  if (p.kind === 'super') {
    if (p.n === p.m) return wignerFock(p.n, x, q);
    const a = Math.min(p.n, p.m);
    const b = Math.max(p.n, p.m);
    // |psi> = (|a> + |b>)/sqrt2, W = (W_aa + W_bb)/2 + Re W_{|a><b|}
    return 0.5 * (wignerFock(a, x, q) + wignerFock(b, x, q)) + wignerCross(a, b, x, q).re;
  }
  const [x0, p0] = centre(p);
  const r = p.kind === 'squeezed' ? p.r : 0;
  const u = x - x0;
  const v = q - p0;
  return Math.exp(-Math.exp(2 * r) * u * u - Math.exp(-2 * r) * v * v) / Math.PI;
}

/** Time evolution is a rigid clockwise rotation of phase space: W(x,p,t) = W0(R(t)(x,p)). */
export function wigner(p: StateParams, t: number, x: number, q: number): number {
  const c = Math.cos(t);
  const s = Math.sin(t);
  return wigner0(p, x * c - q * s, x * s + q * c);
}

/** Wigner function by direct quadrature of W = (1/pi) int conj(psi(x+y)) psi(x-y) e^{2ipy} dy on the grid. */
export function wignerNumeric(basis: Basis, psiRe: Float64Array, psiIm: Float64Array, xi: number, p: number): number {
  // xi is a grid index, y runs over grid steps so x +- y stay on the grid
  const h = basis.dx;
  let s = 0;
  for (let j = -NX; j <= NX; j++) {
    const a = xi + j;
    const b = xi - j;
    if (a < 0 || b < 0 || a >= NX || b >= NX) continue;
    // conj(psi_a) psi_b
    const rr = psiRe[a] * psiRe[b] + psiIm[a] * psiIm[b];
    const ri = psiRe[a] * psiIm[b] - psiIm[a] * psiRe[b];
    const ang = 2 * p * j * h;
    s += rr * Math.cos(ang) - ri * Math.sin(ang);
  }
  return (s * h) / Math.PI;
}
