// Scalar wave optics for one, two or N slits. Pure module: no DOM, no Three.js.
//
// Geometry: the slits lie in the plane x = 0 and are long along the direction
// out of the page, so the problem reduces to a 2D slice. Slit centres sit on the
// y axis. The screen is the line x = L. Every length is in metres.

export const H_PLANCK = 6.62607015e-34; // J s (exact, SI 2019)
export const E_CHARGE = 1.602176634e-19; // C (exact)
export const M_ELECTRON = 9.1093837015e-31; // kg (CODATA 2018)
export const C_LIGHT = 299792458; // m/s (exact)

export interface SlitParams {
  /** Wavelength (m). */
  lambda: number;
  /** Centre-to-centre slit separation (m). */
  d: number;
  /** Width of each slit (m). */
  a: number;
  /** Slit-to-screen distance (m). */
  L: number;
}

export function sinc(x: number): number {
  return Math.abs(x) < 1e-8 ? 1 - (x * x) / 6 : Math.sin(x) / x;
}

/** Centres of n equally spaced slits with separation d, symmetric about y = 0. */
export function slitCenters(n: number, d: number): number[] {
  const out: number[] = [];
  for (let j = 0; j < n; j++) out.push((j - (n - 1) / 2) * d);
  return out;
}

/** Predicted fringe spacing λL/d (small-angle). */
export function fringeSpacing(lambda: number, L: number, d: number): number {
  return (lambda * L) / d;
}

/** Fraunhofer two-slit pattern I0 cos²(π d y / λL) sinc²(π a y / λL). */
export function fraunhofer(y: number, p: SlitParams, I0 = 1): number {
  const u = (Math.PI * y) / (p.lambda * p.L);
  const c = Math.cos(u * p.d);
  const s = sinc(u * p.a);
  return I0 * c * c * s * s;
}

/** Fraunhofer N-slit grating, normalised so I(0) = I0. */
export function fraunhoferN(y: number, p: SlitParams, n: number, I0 = 1): number {
  const u = (Math.PI * y) / (p.lambda * p.L);
  const s = sinc(u * p.a);
  const al = u * p.d;
  const sa = Math.sin(al);
  const grating = Math.abs(sa) < 1e-9 ? 1 : Math.sin(n * al) / (n * sa);
  return I0 * s * s * grating * grating;
}

/**
 * Fraunhofer prediction for two slits with partial coherence V and either or
 * both slits open. Normalised so that both slits open with V = 1 gives I0 at y = 0.
 */
export function fraunhoferPartial(y: number, p: SlitParams, V: number, left: boolean, right: boolean, I0 = 1): number {
  const u = (Math.PI * y) / (p.lambda * p.L);
  const s = sinc(u * p.a);
  const env = (I0 / 4) * s * s; // one slit alone
  const n = (left ? 1 : 0) + (right ? 1 : 0);
  if (n < 2) return n * env;
  return 2 * env * (1 + V * Math.cos(2 * u * p.d));
}

/** Two-beam interference with coherence V in [0, 1]: I1 + I2 + 2V√(I1 I2) cos Δφ. */
export function partialInterference(I1: number, I2: number, V: number, dphi: number): number {
  return I1 + I2 + 2 * V * Math.sqrt(I1 * I2) * Math.cos(dphi);
}

/**
 * Huygens sum for one slit of width a centred at yc, observed at (x, y).
 * nSrc point sources sit at the midpoints of equal sub-strips of the slit.
 * Each contributes a 2D cylindrical wavelet e^{ikr}/√r with the obliquity
 * factor (1 + cos θ)/2, using the exact (Fresnel-accurate) path length
 * r = √(x² + (y − y_s)²). The sum is divided by nSrc. Result goes into out[0..1].
 */
export function slitAmplitude(x: number, y: number, yc: number, a: number, k: number, nSrc: number, out: Float64Array | Float32Array, rMin = 0): void {
  let re = 0;
  let im = 0;
  const step = a / nSrc;
  const y0 = yc - a / 2 + step / 2;
  for (let j = 0; j < nSrc; j++) {
    const dy = y - (y0 + j * step);
    let r = Math.sqrt(x * x + dy * dy);
    if (r < rMin) r = rMin;
    const w = (0.5 * (1 + x / r)) / Math.sqrt(r);
    const ph = k * r;
    re += w * Math.cos(ph);
    im += w * Math.sin(ph);
  }
  out[0] = re / nSrc;
  out[1] = im / nSrc;
}

export interface HuygensOptions {
  /** Number of slits (default 2). */
  n?: number;
  /** Which slits are open. Defaults to all. */
  open?: boolean[];
  /** Sources per slit (default 32). */
  nSrc?: number;
  /** Coherence between different slits, 1 = fully coherent (default 1). */
  V?: number;
}

const _amp = new Float64Array(2);

/**
 * Screen intensity from the Huygens sum. With V < 1 the cross terms between
 * slits are scaled by V: I = Σ|ψ_j|² + V Σ_{j≠k} ψ_j ψ_k*. For V = 1 this is |Σψ_j|².
 */
export function huygensIntensity(y: number, p: SlitParams, opts: HuygensOptions = {}, scratch?: Float64Array): number {
  const n = opts.n ?? 2;
  const nSrc = opts.nSrc ?? 32;
  const V = opts.V ?? 1;
  const k = (2 * Math.PI) / p.lambda;
  const buf = scratch && scratch.length >= 2 * n ? scratch : new Float64Array(2 * n);
  let incoh = 0;
  let sr = 0;
  let si = 0;
  for (let j = 0; j < n; j++) {
    if (opts.open && !opts.open[j]) {
      buf[2 * j] = 0;
      buf[2 * j + 1] = 0;
      continue;
    }
    slitAmplitude(p.L, y, (j - (n - 1) / 2) * p.d, p.a, k, nSrc, _amp);
    buf[2 * j] = _amp[0];
    buf[2 * j + 1] = _amp[1];
    incoh += _amp[0] * _amp[0] + _amp[1] * _amp[1];
    sr += _amp[0];
    si += _amp[1];
  }
  const coh = sr * sr + si * si;
  // coh = incoh + cross terms, so the V-weighted mix is:
  return incoh + V * (coh - incoh);
}

/** Fill out[i] with huygensIntensity(ys[i]). */
export function huygensPattern(ys: ArrayLike<number>, p: SlitParams, opts: HuygensOptions, out: Float64Array): Float64Array {
  const scratch = new Float64Array(2 * (opts.n ?? 2));
  for (let i = 0; i < ys.length; i++) out[i] = huygensIntensity(ys[i], p, opts, scratch);
  return out;
}

// --- de Broglie wavelengths

/** λ = h / p. */
export function deBroglie(momentum: number): number {
  return H_PLANCK / momentum;
}

/**
 * Electron wavelength after acceleration through `volts`.
 * Non-relativistic: p = √(2 m e U). Relativistic: p = √(2 m e U (1 + eU / 2mc²)).
 * At 50 kV the relativistic correction shortens λ by about 2.4 %.
 */
export function electronWavelength(volts: number, relativistic = false): number {
  const eU = E_CHARGE * volts;
  let p2 = 2 * M_ELECTRON * eU;
  if (relativistic) p2 *= 1 + eU / (2 * M_ELECTRON * C_LIGHT * C_LIGHT);
  return deBroglie(Math.sqrt(p2));
}

/** Photon wavelength from its energy in electronvolts: λ = hc / E. */
export function photonWavelength(energyEV: number): number {
  return (H_PLANCK * C_LIGHT) / (energyEV * E_CHARGE);
}

/** Photon momentum from wavelength: p = h / λ. */
export function photonMomentum(lambda: number): number {
  return H_PLANCK / lambda;
}

// --- Sampling hits

/**
 * Draws positions from a non-negative density sampled on a uniform grid, by
 * inverse CDF. The density is treated as piecewise linear, so the CDF uses the
 * trapezoid rule and the inverse interpolates linearly within a cell.
 */
export class InverseCdfSampler {
  readonly ys: Float64Array;
  readonly cdf: Float64Array;
  readonly n: number;
  total = 0;

  constructor(n: number) {
    this.n = n;
    this.ys = new Float64Array(n);
    this.cdf = new Float64Array(n);
  }

  build(ys: ArrayLike<number>, density: ArrayLike<number>): void {
    const n = this.n;
    this.cdf[0] = 0;
    this.ys[0] = ys[0];
    for (let i = 1; i < n; i++) {
      this.ys[i] = ys[i];
      this.cdf[i] = this.cdf[i - 1] + 0.5 * (density[i] + density[i - 1]) * (ys[i] - ys[i - 1]);
    }
    this.total = this.cdf[n - 1];
  }

  /** Probability mass between y0 and y1 (as a fraction of the total). */
  mass(y0: number, y1: number): number {
    return (this.cdfAt(y1) - this.cdfAt(y0)) / this.total;
  }

  cdfAt(y: number): number {
    const n = this.n;
    const lo = this.ys[0];
    const hi = this.ys[n - 1];
    if (y <= lo) return 0;
    if (y >= hi) return this.total;
    const f = ((y - lo) / (hi - lo)) * (n - 1);
    const i = Math.min(n - 2, Math.floor(f));
    const t = f - i;
    return this.cdf[i] + t * (this.cdf[i + 1] - this.cdf[i]);
  }

  /** Map a uniform u in [0, 1) to a position. */
  sample(u: number): number {
    const target = u * this.total;
    let lo = 0;
    let hi = this.n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cdf[mid] <= target) lo = mid;
      else hi = mid;
    }
    const c0 = this.cdf[lo];
    const c1 = this.cdf[hi];
    const t = c1 > c0 ? (target - c0) / (c1 - c0) : 0.5;
    return this.ys[lo] + t * (this.ys[hi] - this.ys[lo]);
  }
}

/** Small fast seeded PRNG, uniform in [0, 1). */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bin index of y in nb equal bins over [lo, hi), or -1 when outside. */
export function binIndex(y: number, lo: number, hi: number, nb: number): number {
  if (y < lo || y >= hi) return -1;
  return Math.min(nb - 1, Math.floor(((y - lo) / (hi - lo)) * nb));
}

/**
 * Fringe visibility from a histogram. For I(y) = A(y)[1 + V cos(2πy/s)] with a
 * slowly varying envelope A, the Fourier component of the counts at the fringe
 * frequency is V/2 of the total. So V ≈ 2 |Σ n_i e^{2πi y_i/s}| / Σ n_i.
 * Finite bins blur the fringes by sinc(π w / s), which is divided out.
 * Returns 0 for an empty histogram.
 */
export function measureVisibility(counts: ArrayLike<number>, lo: number, hi: number, spacing: number): number {
  const nb = counts.length;
  const w = (hi - lo) / nb;
  const q = (2 * Math.PI) / spacing;
  let c = 0;
  let s = 0;
  let tot = 0;
  for (let i = 0; i < nb; i++) {
    const n = counts[i];
    if (!n) continue;
    const y = lo + (i + 0.5) * w;
    c += n * Math.cos(q * y);
    s += n * Math.sin(q * y);
    tot += n;
  }
  if (tot === 0) return 0;
  const blur = sinc((Math.PI * w) / spacing);
  return Math.min(1, (2 * Math.hypot(c, s)) / tot / Math.max(0.2, blur));
}
