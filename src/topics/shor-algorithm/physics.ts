// Shor's order-finding algorithm for small N. Pure math, no DOM.
// Classical side: modular exponentiation, the order r, and the gcd step.
// Quantum side: the n-qubit counting register as a complex statevector,
// the periodic comb left after measuring the work register, the QFT,
// the exact peak distribution, and continued fractions.

export const N_OPTIONS = [15, 21, 33, 35, 39] as const;
export const MIN_QUBITS = 4;
export const MAX_QUBITS = 11;

export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

/** b^e mod m by square-and-multiply. Exact for m below 2^26. */
export function modPow(b: number, e: number, m: number): number {
  if (m === 1) return 0;
  let r = 1;
  b %= m;
  while (e > 0) {
    if (e & 1) r = (r * b) % m;
    b = (b * b) % m;
    e = Math.floor(e / 2);
  }
  return r;
}

/** a^x mod N for x = 0 .. len-1. */
export function modexpSequence(a: number, N: number, len: number): number[] {
  const out: number[] = [];
  let v = 1 % N;
  for (let x = 0; x < len; x++) {
    out.push(v);
    v = (v * a) % N;
  }
  return out;
}

/** Multiplicative order of a mod N: the smallest r > 0 with a^r = 1 (mod N). 0 if gcd(a, N) > 1. */
export function order(a: number, N: number): number {
  if (gcd(a, N) !== 1) return 0;
  let v = a % N;
  let r = 1;
  while (v !== 1) {
    v = (v * a) % N;
    r++;
    if (r > N) return 0;
  }
  return r;
}

/** Bases 2 .. N-1 coprime to N. */
export function coprimeBases(N: number): number[] {
  const out: number[] = [];
  for (let a = 2; a < N; a++) if (gcd(a, N) === 1) out.push(a);
  return out;
}

/** Smallest n with 2^n >= N^2, the size Shor's analysis asks for. */
export function recommendedQubits(N: number): number {
  let n = 0;
  while (2 ** n < N * N) n++;
  return n;
}

export type FactorKind = 'ok' | 'odd' | 'minus-one' | 'trivial' | 'not-a-period';

export interface FactorResult {
  kind: FactorKind;
  /** a^(r/2) mod N, or -1 when r is odd or not a period. */
  half: number;
  p: number;
  q: number;
}

/** The classical post-processing: gcd(a^(r/2) ± 1, N), with every way it can fail. */
export function factorFromOrder(a: number, N: number, r: number): FactorResult {
  if (r <= 0 || modPow(a, r, N) !== 1) return { kind: 'not-a-period', half: -1, p: 0, q: 0 };
  if (r % 2 === 1) return { kind: 'odd', half: -1, p: 0, q: 0 };
  const half = modPow(a, r / 2, N);
  if (half === N - 1) return { kind: 'minus-one', half, p: 0, q: 0 };
  // half = 1 can only happen when r is a multiple of the true order.
  if (half === 1) return { kind: 'trivial', half, p: 0, q: 0 };
  return { kind: 'ok', half, p: gcd(half - 1, N), q: gcd(half + 1, N) };
}

/** Number of x in [0, Q) with x = x0 (mod r). */
export function combCount(Q: number, r: number, x0: number): number {
  return x0 >= Q ? 0 : Math.floor((Q - 1 - x0) / r) + 1;
}

/** Counting register after the work register reads a^x0: equal amplitudes on x0, x0+r, x0+2r, ... */
export function combState(n: number, r: number, x0: number, re: Float64Array, im: Float64Array): void {
  const Q = 1 << n;
  const amp = 1 / Math.sqrt(combCount(Q, r, x0));
  for (let x = 0; x < Q; x++) {
    re[x] = x >= x0 && (x - x0) % r === 0 ? amp : 0;
    im[x] = 0;
  }
}

/**
 * In-place quantum Fourier transform on the first Q = 2^n entries:
 * |x> -> (1/sqrt Q) sum_k exp(+2 pi i x k / Q) |k>.
 */
export function qft(re: Float64Array, im: Float64Array, n: number): void {
  const Q = 1 << n;
  for (let i = 1, j = 0; i < Q; i++) {
    let bit = Q >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= Q; len <<= 1) {
    const half = len >> 1;
    const ang = (2 * Math.PI) / len;
    for (let m = 0; m < half; m++) {
      const wr = Math.cos(ang * m);
      const wi = Math.sin(ang * m);
      for (let s = m; s < Q; s += len) {
        const t = s + half;
        const xr = re[t] * wr - im[t] * wi;
        const xi = re[t] * wi + im[t] * wr;
        re[t] = re[s] - xr;
        im[t] = im[s] - xi;
        re[s] += xr;
        im[s] += xi;
      }
    }
  }
  const s = 1 / Math.sqrt(Q);
  for (let i = 0; i < Q; i++) {
    re[i] *= s;
    im[i] *= s;
  }
}

/** Dense QFT matrix (row k, column x), for tests on small n. */
export function qftMatrix(n: number): { re: Float64Array; im: Float64Array } {
  const Q = 1 << n;
  const re = new Float64Array(Q * Q);
  const im = new Float64Array(Q * Q);
  const s = 1 / Math.sqrt(Q);
  for (let k = 0; k < Q; k++)
    for (let x = 0; x < Q; x++) {
      const ph = (2 * Math.PI * ((x * k) % Q)) / Q;
      re[k * Q + x] = s * Math.cos(ph);
      im[k * Q + x] = s * Math.sin(ph);
    }
  return { re, im };
}

/**
 * Coefficients c_m(t) with F^t = sum_{m=0..3} c_m(t) F^m, where F is the QFT (F^4 = I).
 * F^t = sum over eigenvalues lambda = i^j (j = 0, 1, 2, -1) of lambda^t times its projector.
 * It is unitary for every t, equals I at t = 0 and F at t = 1. The scene uses it to morph.
 */
const EIG = [0, 1, 2, -1];
export function fracCoeffs(t: number, cRe: Float64Array, cIm: Float64Array): void {
  for (let m = 0; m < 4; m++) {
    let sr = 0;
    let si = 0;
    for (let e = 0; e < 4; e++) {
      const j = EIG[e];
      const ph = (Math.PI / 2) * j * (t - m);
      sr += Math.cos(ph);
      si += Math.sin(ph);
    }
    cRe[m] = sr / 4;
    cIm[m] = si / 4;
  }
}

/**
 * Exact probability of reading k from the counting register after the QFT,
 * averaged over the work-register outcome:
 * P(k) = (1/Q^2) sum_{x0<r} |sum_{j<M(x0)} e^{2 pi i j r k / Q}|^2.
 */
export function peakDistribution(n: number, r: number, out?: Float64Array): Float64Array {
  const Q = 1 << n;
  const P = out && out.length >= Q ? out : new Float64Array(Q);
  const Q2 = Q * Q;
  const x0max = Math.min(r, Q);
  for (let k = 0; k < Q; k++) {
    const rk = (r * k) % Q;
    let s = 0;
    for (let x0 = 0; x0 < x0max; x0++) {
      const M = combCount(Q, r, x0);
      if (rk === 0) s += M * M;
      else {
        const num = Math.sin((Math.PI * ((M * rk) % Q)) / Q);
        const den = Math.sin((Math.PI * rk) / Q);
        s += (num * num) / (den * den);
      }
    }
    P[k] = s / Q2;
  }
  return P;
}

/** Simple continued fraction terms of p/q. */
export function continuedFraction(p: number, q: number): number[] {
  const out: number[] = [];
  while (q !== 0) {
    const a = Math.floor(p / q);
    out.push(a);
    const t = p - a * q;
    p = q;
    q = t;
  }
  return out;
}

/** Convergents h_i/k_i of a continued fraction. */
export function convergents(terms: number[]): { p: number; q: number }[] {
  const out: { p: number; q: number }[] = [];
  let h1 = 1, h2 = 0, k1 = 0, k2 = 1;
  for (const a of terms) {
    const h = a * h1 + h2;
    const k = a * k1 + k2;
    out.push({ p: h, q: k });
    h2 = h1; h1 = h;
    k2 = k1; k1 = k;
  }
  return out;
}

export interface OrderGuess {
  ok: boolean;
  /** Recovered period, or 0. */
  r: number;
  terms: number[];
  convs: { p: number; q: number }[];
  /** The convergent used, or the last one with denominator below N. */
  chosen: { p: number; q: number } | null;
  reason: string;
}

/** Continued-fraction step: find the first convergent s/q of k/Q with q < N and a^q = 1 (mod N). */
export function recoverOrder(k: number, Q: number, a: number, N: number): OrderGuess {
  const terms = continuedFraction(k, Q);
  const convs = convergents(terms);
  if (k === 0) return { ok: false, r: 0, terms, convs, chosen: { p: 0, q: 1 }, reason: 'k = 0 carries no information' };
  let chosen: { p: number; q: number } | null = null;
  for (const c of convs) {
    if (c.q >= N) break;
    chosen = c;
    if (c.q > 1 && modPow(a, c.q, N) === 1) return { ok: true, r: c.q, terms, convs, chosen: c, reason: '' };
  }
  const reason = chosen ? `a^${chosen.q} ≢ 1, so ${chosen.q} is not the period` : 'no convergent with q < N';
  return { ok: false, r: 0, terms, convs, chosen, reason };
}

/** Exact chance that one run of the circuit plus continued fractions returns a period. */
export function cfSuccessProbability(n: number, a: number, N: number, P?: Float64Array): number {
  const Q = 1 << n;
  const r = order(a, N);
  const dist = P ?? peakDistribution(n, r);
  let s = 0;
  for (let k = 0; k < Q; k++) if (dist[k] > 0 && recoverOrder(k, Q, a, N).ok) s += dist[k];
  return s;
}

/** Index drawn from a discrete distribution p[0..len) with a uniform number u. */
export function sampleIndex(p: Float64Array, u: number, len = p.length): number {
  let c = 0;
  for (let i = 0; i < len; i++) {
    c += p[i];
    if (u < c) return i;
  }
  for (let i = len - 1; i >= 0; i--) if (p[i] > 0) return i;
  return 0;
}

export function norm2(re: Float64Array, im: Float64Array, len: number): number {
  let s = 0;
  for (let i = 0; i < len; i++) s += re[i] * re[i] + im[i] * im[i];
  return s;
}

/** Small seeded PRNG for tests. */
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
