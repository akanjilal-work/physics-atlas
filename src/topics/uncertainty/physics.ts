// Wave packets in 1D, their Fourier transforms, and the uncertainty product.
// Units: hbar = m = 1, so momentum p equals wave number k.
// Pure module: no DOM, no Three.js.

export type PacketKind = 'gauss' | 'square' | 'waves' | 'cat';

/** Grid used by the live scene. */
export const GRID_N = 4096;
export const GRID_L = 256;

/** Width of the long Gaussian envelope that makes each "plane wave" normalisable in build mode. */
export const WAVE_ENVELOPE = 8;
/** Edge softness of the square packet, as a fraction of its full width. */
export const SQUARE_EDGE = 1 / 16;
/** In build mode the N wave numbers span k0 +- WAVE_SPAN * sigma_k. */
export const WAVE_SPAN = 3;

export interface PacketParams {
  kind: PacketKind;
  /** Width parameter. Gaussian: the rms width. Square: full width sqrt(12) sigma. Build mode: the target width. Cat: each lump. */
  sigma: number;
  /** Mean wave number (momentum). */
  k0: number;
  /** Linear chirp: psi is multiplied by exp(i c x^2 / 2). */
  chirp: number;
  /** Number of plane waves in build mode. */
  nWaves: number;
  /** Distance between the two lumps of the cat state. */
  sep: number;
}

// ---------------------------------------------------------------- FFT

interface FFTPlan {
  cos: Float64Array;
  sin: Float64Array;
  rev: Uint32Array;
}
const plans = new Map<number, FFTPlan>();

function plan(n: number): FFTPlan {
  let p = plans.get(n);
  if (p) return p;
  if (n < 2 || (n & (n - 1)) !== 0) throw new Error(`FFT size ${n} is not a power of two`);
  const half = n >> 1;
  const cos = new Float64Array(half);
  const sin = new Float64Array(half);
  for (let j = 0; j < half; j++) {
    cos[j] = Math.cos((2 * Math.PI * j) / n);
    sin[j] = -Math.sin((2 * Math.PI * j) / n);
  }
  const bits = Math.log2(n);
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    rev[i] = r;
  }
  p = { cos, sin, rev };
  plans.set(n, p);
  return p;
}

/**
 * In-place iterative radix-2 complex FFT.
 * Forward: X_k = sum_j x_j e^{-2 pi i jk/n}. Inverse includes the 1/n factor.
 */
export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  const { cos, sin, rev } = plan(n);
  for (let i = 0; i < n; i++) {
    const j = rev[i];
    if (j > i) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  const sgn = inverse ? -1 : 1;
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = n / size;
    for (let start = 0; start < n; start += size) {
      for (let j = 0; j < half; j++) {
        const wr = cos[j * step];
        const wi = sgn * sin[j * step];
        const a = start + j;
        const b = a + half;
        const xr = re[b] * wr - im[b] * wi;
        const xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
      }
    }
  }
  if (inverse) {
    const s = 1 / n;
    for (let i = 0; i < n; i++) {
      re[i] *= s;
      im[i] *= s;
    }
  }
}

/** Naive O(n^2) DFT, used only to check the FFT. */
export function dft(re: Float64Array, im: Float64Array): [Float64Array, Float64Array] {
  const n = re.length;
  const or = new Float64Array(n);
  const oi = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let sr = 0;
    let si = 0;
    for (let j = 0; j < n; j++) {
      const ph = (-2 * Math.PI * j * k) / n;
      const c = Math.cos(ph);
      const s = Math.sin(ph);
      sr += re[j] * c - im[j] * s;
      si += re[j] * s + im[j] * c;
    }
    or[k] = sr;
    oi[k] = si;
  }
  return [or, oi];
}

// ---------------------------------------------------------------- statistics

export interface Moments {
  norm: number;
  mean: number;
  sd: number;
}

/** Norm, mean and standard deviation of |f|^2 sampled at coordinates c with spacing h. No allocation if `out` is given. */
export function moments(re: Float64Array, im: Float64Array, c: Float64Array, h: number, out: Moments = { norm: 0, mean: 0, sd: 0 }): Moments {
  let s0 = 0, s1 = 0, s2 = 0;
  for (let i = 0; i < re.length; i++) {
    const p = re[i] * re[i] + im[i] * im[i];
    s0 += p;
    s1 += p * c[i];
    s2 += p * c[i] * c[i];
  }
  const m = s1 / s0;
  out.norm = s0 * h;
  out.mean = m;
  out.sd = Math.sqrt(Math.max(0, s2 / s0 - m * m));
  return out;
}

// ---------------------------------------------------------------- the packet on a grid

/**
 * A wave packet on a periodic grid of n points over length L, centred on x = 0.
 * psi holds position space. phi holds momentum space in FFT order, with
 * phi(k) = (1/sqrt(2 pi)) integral psi(x) e^{-ikx} dx, so both are unit normalised.
 */
export class Packet {
  readonly n: number;
  readonly L: number;
  readonly dx: number;
  readonly dk: number;
  readonly x: Float64Array;
  /** Wave numbers in FFT order. */
  readonly k: Float64Array;
  readonly re: Float64Array;
  readonly im: Float64Array;
  /** Momentum wavefunction at t = 0 (FFT order). */
  readonly phi0Re: Float64Array;
  readonly phi0Im: Float64Array;
  /** Momentum wavefunction at the current time (FFT order). */
  readonly phiRe: Float64Array;
  readonly phiIm: Float64Array;
  t = 0;
  readonly mx: Moments = { norm: 1, mean: 0, sd: 0 };
  readonly mk: Moments = { norm: 1, mean: 0, sd: 0 };

  constructor(n = GRID_N, L = GRID_L) {
    this.n = n;
    this.L = L;
    this.dx = L / n;
    this.dk = (2 * Math.PI) / L;
    this.x = new Float64Array(n);
    this.k = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      this.x[i] = -L / 2 + i * this.dx;
      this.k[i] = (i < n / 2 ? i : i - n) * this.dk;
    }
    this.re = new Float64Array(n);
    this.im = new Float64Array(n);
    this.phi0Re = new Float64Array(n);
    this.phi0Im = new Float64Array(n);
    this.phiRe = new Float64Array(n);
    this.phiIm = new Float64Array(n);
  }

  /** Build psi(x, 0) for the given parameters, normalise it, and take its transform. */
  build(p: PacketParams): void {
    const { n, x, re, im } = this;
    const wk = buildWaveNumbers(p);
    for (let i = 0; i < n; i++) {
      const xi = x[i];
      let a = 0;
      let b = 0;
      if (p.kind === 'waves') {
        const env = Math.exp(-(xi * xi) / (4 * WAVE_ENVELOPE * WAVE_ENVELOPE));
        for (let j = 0; j < wk.k.length; j++) {
          a += wk.w[j] * Math.cos(wk.k[j] * xi);
          b += wk.w[j] * Math.sin(wk.k[j] * xi);
        }
        a *= env;
        b *= env;
      } else {
        const base = baseShape(p, xi);
        a = base * Math.cos(p.k0 * xi);
        b = base * Math.sin(p.k0 * xi);
      }
      const ph = 0.5 * p.chirp * xi * xi;
      const c = Math.cos(ph);
      const sn = Math.sin(ph);
      re[i] = a * c - b * sn;
      im[i] = a * sn + b * c;
    }
    let sum = 0;
    for (let i = 0; i < n; i++) sum += re[i] * re[i] + im[i] * im[i];
    const f = 1 / Math.sqrt(sum * this.dx);
    for (let i = 0; i < n; i++) {
      re[i] *= f;
      im[i] *= f;
    }
    this.toMomentum(this.phi0Re, this.phi0Im);
    this.phiRe.set(this.phi0Re);
    this.phiIm.set(this.phi0Im);
    this.t = 0;
    this.measure();
  }

  /** Fourier transform of the current psi into (outRe, outIm), FFT order, unit normalised. */
  toMomentum(outRe: Float64Array, outIm: Float64Array): void {
    outRe.set(this.re);
    outIm.set(this.im);
    fft(outRe, outIm, false);
    const s = this.dx / Math.sqrt(2 * Math.PI);
    for (let j = 0; j < this.n; j++) {
      // e^{-ik x_0} with x_0 = -L/2 gives (-1)^j on this grid
      const f = j & 1 ? -s : s;
      outRe[j] *= f;
      outIm[j] *= f;
    }
  }

  /**
   * Free evolution to time t, exact for a free particle:
   * phi(k, t) = phi(k, 0) e^{-i k^2 t / 2}, then psi = inverse transform.
   */
  evolve(t: number): void {
    const { n, k, phi0Re, phi0Im, phiRe, phiIm, re, im } = this;
    for (let j = 0; j < n; j++) {
      const ph = -0.5 * k[j] * k[j] * t;
      const c = Math.cos(ph);
      const s = Math.sin(ph);
      const a = phi0Re[j], b = phi0Im[j];
      phiRe[j] = a * c - b * s;
      phiIm[j] = a * s + b * c;
    }
    const f = Math.sqrt(2 * Math.PI) / this.dx;
    for (let j = 0; j < n; j++) {
      const g = j & 1 ? -f : f;
      re[j] = phiRe[j] * g;
      im[j] = phiIm[j] * g;
    }
    fft(re, im, true);
    this.t = t;
  }

  /** Recompute position and momentum moments. The momentum side uses a fresh FFT of psi, not the stored phi. */
  measure(scratchRe?: Float64Array, scratchIm?: Float64Array): void {
    moments(this.re, this.im, this.x, this.dx, this.mx);
    if (scratchRe && scratchIm) {
      this.toMomentum(scratchRe, scratchIm);
      moments(scratchRe, scratchIm, this.k, this.dk, this.mk);
    } else {
      moments(this.phiRe, this.phiIm, this.k, this.dk, this.mk);
    }
  }

  /** Delta x Delta p in units of hbar / 2. Never below 1 for a real state. */
  ratio(): number {
    return (2 * this.mx.sd * this.mk.sd);
  }
}

/** Unnormalised real envelope for the Gaussian, square and cat packets. */
export function baseShape(p: PacketParams, x: number): number {
  const s = p.sigma;
  switch (p.kind) {
    case 'gauss':
      return Math.exp(-(x * x) / (4 * s * s));
    case 'square': {
      const a = Math.sqrt(12) * s;
      const e = SQUARE_EDGE * a;
      return 0.5 * (Math.tanh((x + a / 2) / e) - Math.tanh((x - a / 2) / e));
    }
    case 'cat': {
      const h = p.sep / 2;
      return Math.exp(-((x - h) ** 2) / (4 * s * s)) + Math.exp(-((x + h) ** 2) / (4 * s * s));
    }
    default:
      return 0;
  }
}

/** The wave numbers and weights used in build mode: N waves with a Gaussian spread of k. */
export function buildWaveNumbers(p: PacketParams): { k: Float64Array; w: Float64Array } {
  const N = Math.max(1, Math.round(p.nWaves));
  const sk = 1 / (2 * p.sigma);
  const k = new Float64Array(N);
  const w = new Float64Array(N);
  const step = N > 1 ? (2 * WAVE_SPAN * sk) / (N - 1) : 0;
  for (let j = 0; j < N; j++) {
    const d = (j - (N - 1) / 2) * step;
    k[j] = p.k0 + d;
    w[j] = Math.exp(-(d * d) / (4 * sk * sk));
  }
  return { k, w };
}

// ---------------------------------------------------------------- analytic results

/** Rms width of a free Gaussian at time t (hbar = m = 1): sigma sqrt(1 + (t / 2 sigma^2)^2). */
export function gaussWidth(sigma: number, t: number): number {
  return sigma * Math.sqrt(1 + (t / (2 * sigma * sigma)) ** 2);
}

/** Delta p of a chirped Gaussian: sqrt(1/(4 sigma^2) + c^2 sigma^2). */
export function chirpedDp(sigma: number, c: number): number {
  return Math.sqrt(1 / (4 * sigma * sigma) + c * c * sigma * sigma);
}

/**
 * Free evolution: Delta x^2(t) = Delta x0^2 + 2 t C + t^2 Delta p^2, where C is the
 * position-momentum covariance. For a packet built here with chirp c, C = c Delta x0^2.
 */
export function spreadWidth(dx0: number, dp: number, cov: number, t: number): number {
  return Math.sqrt(Math.max(0, dx0 * dx0 + 2 * t * cov + t * t * dp * dp));
}

/**
 * Wigner function W(x, p) (hbar = 1) of the Gaussian or cat packet at time t.
 * Analytic. Chirp shears p -> p - c x, and free flight shears x -> x - p t.
 * Returns NaN for the other packet kinds.
 */
export function wigner(p: PacketParams, t: number, x: number, mom: number): number {
  const x0 = x - mom * t;
  const q = mom - p.k0 - p.chirp * x0;
  const s2 = p.sigma * p.sigma;
  const gp = Math.exp(-2 * s2 * q * q);
  if (p.kind === 'gauss') return (Math.exp(-(x0 * x0) / (2 * s2)) * gp) / Math.PI;
  if (p.kind === 'cat') {
    const a = p.sep / 2;
    const diag = Math.exp(-((x0 - a) ** 2) / (2 * s2)) + Math.exp(-((x0 + a) ** 2) / (2 * s2));
    const cross = 2 * Math.exp(-(x0 * x0) / (2 * s2)) * Math.cos(2 * a * q);
    const norm = 2 * (1 + Math.exp(-(a * a) / (2 * s2)));
    return ((diag + cross) * gp) / (Math.PI * norm);
  }
  return NaN;
}

/** True if the analytic Wigner function is available for this packet kind. */
export const hasWigner = (kind: PacketKind) => kind === 'gauss' || kind === 'cat';
