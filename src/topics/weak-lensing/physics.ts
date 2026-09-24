// Weak gravitational lensing: cosmological distances, SIS and NFW lens profiles,
// Kaiser-Squires shear <-> convergence on a 2D FFT grid, galaxy ellipticities,
// mass reconstruction and the tangential shear profile. Pure math, no DOM.

// ---------------------------------------------------------------------------
// Constants and cosmology (flat LCDM)

/** Speed of light in km/s. */
export const C_KMS = 299792.458;
/** Newton's G in Mpc (km/s)^2 / M_sun. */
export const G_MPC = 4.30091e-9;
export const ARCMIN = Math.PI / (180 * 60);

export interface Cosmo {
  H0: number;
  Om: number;
}
export const COSMO: Cosmo = { H0: 70, Om: 0.3 };

export const E = (z: number, c: Cosmo = COSMO): number => Math.sqrt(c.Om * (1 + z) ** 3 + (1 - c.Om));

/** Comoving distance in Mpc, Simpson's rule. */
export function comoving(z: number, c: Cosmo = COSMO, n = 400): number {
  if (z <= 0) return 0;
  const h = z / n;
  let s = 1 / E(0, c) + 1 / E(z, c);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) / E(i * h, c);
  return ((C_KMS / c.H0) * s * h) / 3;
}

/** Angular diameter distance in Mpc. */
export const dA = (z: number, c: Cosmo = COSMO): number => comoving(z, c) / (1 + z);

/** Angular diameter distance from z1 to z2 (flat universe). */
export const dA12 = (z1: number, z2: number, c: Cosmo = COSMO): number => (comoving(z2, c) - comoving(z1, c)) / (1 + z2);

/** Critical density at redshift z in M_sun / Mpc^3. */
export const rhoCrit = (z: number, c: Cosmo = COSMO): number => (3 * (c.H0 * E(z, c)) ** 2) / (8 * Math.PI * G_MPC);

// ---------------------------------------------------------------------------
// Lens models

/** SIS Einstein radius in radians: theta_E = 4 pi (sigma_v / c)^2 D_ls / D_s. */
export const sisThetaE = (sigmaV: number, dlsOverDs: number): number => 4 * Math.PI * (sigmaV / C_KMS) ** 2 * dlsOverDs;

/** SIS convergence and tangential shear: both theta_E / (2 theta). */
export const sisKappa = (theta: number, thetaE: number): number => thetaE / (2 * theta);
export const sisGammaT = (theta: number, thetaE: number): number => thetaE / (2 * theta);

/** Velocity dispersion of an SIS whose mean density inside r200 is 200 rho_crit. */
export function sisSigmaFromM200(M200: number, z: number, c: Cosmo = COSMO): number {
  const H = c.H0 * E(z, c);
  // M200 = 2 sigma^2 r200 / G with r200 = sigma / (sqrt(50) H)
  return Math.cbrt((M200 * G_MPC * Math.sqrt(50) * H) / 2);
}

export const r200FromM200 = (M200: number, z: number, c: Cosmo = COSMO): number =>
  Math.cbrt((3 * M200) / (4 * Math.PI * 200 * rhoCrit(z, c)));

/** NFW projected profile F(x) with kappa = 2 kappa_s F(x) (Wright & Brainerd 2000). */
export function nfwF(x: number): number {
  if (Math.abs(x - 1) < 1e-4) return 1 / 3 - 0.4 * (x - 1);
  if (x < 1) {
    const s = Math.sqrt(1 - x * x);
    return (1 - (2 / s) * Math.atanh(Math.sqrt((1 - x) / (1 + x)))) / (x * x - 1);
  }
  const s = Math.sqrt(x * x - 1);
  return (1 - (2 / s) * Math.atan(Math.sqrt((x - 1) / (x + 1)))) / (x * x - 1);
}

/** h(x) with mean convergence inside x equal to 4 kappa_s h(x) / x^2. */
export function nfwH(x: number): number {
  if (Math.abs(x - 1) < 1e-6) return Math.log(0.5) + 1;
  if (x < 1) {
    const s = Math.sqrt(1 - x * x);
    return Math.log(x / 2) + (2 / s) * Math.atanh(Math.sqrt((1 - x) / (1 + x)));
  }
  const s = Math.sqrt(x * x - 1);
  return Math.log(x / 2) + (2 / s) * Math.atan(Math.sqrt((x - 1) / (x + 1)));
}

export type Profile = 'sis' | 'nfw';

export interface Lens {
  profile: Profile;
  /** Centre in arcmin. */
  x: number;
  y: number;
  /** M200 in solar masses. */
  M200: number;
  /** Derived: SIS Einstein radius in arcmin. */
  thetaE: number;
  /** Derived: SIS velocity dispersion km/s. */
  sigmaV: number;
  /** Derived: NFW scale radius in arcmin and kappa_s. */
  thetaS: number;
  kappaS: number;
  /** Derived: angular r200 in arcmin. */
  theta200: number;
}

export interface Geometry {
  zl: number;
  zs: number;
  Dl: number;
  Ds: number;
  Dls: number;
  /** Critical surface density in M_sun / pc^2. */
  sigmaCr: number;
}

export function geometry(zl: number, zs: number, c: Cosmo = COSMO): Geometry {
  const Dl = dA(zl, c);
  const Ds = dA(zs, c);
  const Dls = dA12(zl, zs, c);
  const scMpc = ((C_KMS * C_KMS) / (4 * Math.PI * G_MPC)) * (Ds / (Dl * Dls));
  return { zl, zs, Dl, Ds, Dls, sigmaCr: scMpc / 1e12 };
}

export const NFW_CONC = 4;

export function makeLens(profile: Profile, M200: number, x: number, y: number, geo: Geometry, conc = NFW_CONC): Lens {
  const sigmaV = sisSigmaFromM200(M200, geo.zl);
  const thetaE = sisThetaE(sigmaV, geo.Dls / geo.Ds) / ARCMIN;
  const r200 = r200FromM200(M200, geo.zl);
  const rs = r200 / conc;
  const mc = Math.log(1 + conc) - conc / (1 + conc);
  const rhoS = ((200 / 3) * rhoCrit(geo.zl) * conc ** 3) / mc;
  const kappaS = (rhoS * rs) / (geo.sigmaCr * 1e12);
  return { profile, x, y, M200, thetaE, sigmaV, thetaS: rs / geo.Dl / ARCMIN, kappaS, theta200: r200 / geo.Dl / ARCMIN };
}

/** Convergence at distance theta (arcmin) from the lens centre. */
export function lensKappa(L: Lens, theta: number): number {
  const t = Math.max(theta, 1e-4);
  if (L.profile === 'sis') return sisKappa(t, L.thetaE);
  return 2 * L.kappaS * nfwF(t / L.thetaS);
}

/** Mean convergence inside theta. */
export function lensMeanKappa(L: Lens, theta: number): number {
  const t = Math.max(theta, 1e-4);
  if (L.profile === 'sis') return L.thetaE / t;
  const x = t / L.thetaS;
  return (4 * L.kappaS * nfwH(x)) / (x * x);
}

/** Tangential shear gamma_t = mean kappa(<theta) - kappa(theta). */
export const lensGammaT = (L: Lens, theta: number): number => lensMeanKappa(L, theta) - lensKappa(L, theta);

/** Analytic complex shear of a set of lenses at (x, y): gamma = -gamma_t e^{2i phi}. */
export function analyticShear(lenses: Lens[], x: number, y: number, out: { g1: number; g2: number; k: number }): void {
  out.g1 = 0;
  out.g2 = 0;
  out.k = 0;
  for (const L of lenses) {
    const dx = x - L.x;
    const dy = y - L.y;
    const r = Math.hypot(dx, dy);
    const gt = lensGammaT(L, r);
    const c2 = r > 0 ? (dx * dx - dy * dy) / (r * r) : 1;
    const s2 = r > 0 ? (2 * dx * dy) / (r * r) : 0;
    out.g1 -= gt * c2;
    out.g2 -= gt * s2;
    out.k += lensKappa(L, r);
  }
}

// ---------------------------------------------------------------------------
// FFT (radix 2, in place) and Kaiser-Squires

function fft1(re: Float64Array, im: Float64Array, off: number, stride: number, n: number, inv: boolean, tr: Float64Array, ti: Float64Array): void {
  for (let i = 0; i < n; i++) {
    tr[i] = re[off + i * stride];
    ti[i] = im[off + i * stride];
  }
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = tr[i]; tr[i] = tr[j]; tr[j] = t;
      t = ti[i]; ti[i] = ti[j]; ti[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inv ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      const h = len >> 1;
      for (let k = 0; k < h; k++) {
        const a = i + k;
        const b = a + h;
        const xr = tr[b] * cr - ti[b] * ci;
        const xi = tr[b] * ci + ti[b] * cr;
        tr[b] = tr[a] - xr;
        ti[b] = ti[a] - xi;
        tr[a] += xr;
        ti[a] += xi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
  const s = inv ? 1 / n : 1;
  for (let i = 0; i < n; i++) {
    re[off + i * stride] = tr[i] * s;
    im[off + i * stride] = ti[i] * s;
  }
}

/** 2D FFT of an n x n complex field stored row-major (index = j * n + i). n must be a power of 2. */
export function fft2(re: Float64Array, im: Float64Array, n: number, inv = false): void {
  const tr = new Float64Array(n);
  const ti = new Float64Array(n);
  for (let j = 0; j < n; j++) fft1(re, im, j * n, 1, n, inv, tr, ti);
  for (let i = 0; i < n; i++) fft1(re, im, i, n, n, inv, tr, ti);
}

/** Signed integer frequency index for FFT bin i of n. */
const freq = (i: number, n: number) => (i <= n / 2 ? i : i - n);

/**
 * Forward Kaiser-Squires on a periodic n x n grid:
 * gamma_hat = (l1 + i l2)^2 / l^2 * kappa_hat. Optional Gaussian smoothing (sigma in pixels).
 */
export function ksForward(kappa: Float64Array, n: number): { g1: Float64Array; g2: Float64Array } {
  const re = Float64Array.from(kappa);
  const im = new Float64Array(n * n);
  fft2(re, im, n);
  for (let j = 0; j < n; j++) {
    const l2 = freq(j, n);
    for (let i = 0; i < n; i++) {
      const l1 = freq(i, n);
      const q = j * n + i;
      const ll = l1 * l1 + l2 * l2;
      if (ll === 0) {
        re[q] = 0;
        im[q] = 0;
        continue;
      }
      const dr = (l1 * l1 - l2 * l2) / ll;
      const di = (2 * l1 * l2) / ll;
      const a = re[q];
      const b = im[q];
      re[q] = dr * a - di * b;
      im[q] = dr * b + di * a;
    }
  }
  fft2(re, im, n, true);
  return { g1: re, g2: im };
}

/**
 * Inverse Kaiser-Squires: kappa_hat = conj(D) gamma_hat. Returns the E mode (real part) and
 * B mode (imaginary part). A Gaussian of sigma pixels smooths both when smoothPix > 0.
 */
export function ksInverse(g1: Float64Array, g2: Float64Array, n: number, smoothPix = 0): { kE: Float64Array; kB: Float64Array } {
  const re = Float64Array.from(g1);
  const im = Float64Array.from(g2);
  fft2(re, im, n);
  const w = (2 * Math.PI) / n;
  for (let j = 0; j < n; j++) {
    const l2 = freq(j, n);
    for (let i = 0; i < n; i++) {
      const l1 = freq(i, n);
      const q = j * n + i;
      const ll = l1 * l1 + l2 * l2;
      if (ll === 0) {
        re[q] = 0;
        im[q] = 0;
        continue;
      }
      const sm = smoothPix > 0 ? Math.exp(-0.5 * ll * w * w * smoothPix * smoothPix) : 1;
      const dr = ((l1 * l1 - l2 * l2) / ll) * sm;
      const di = ((-2 * l1 * l2) / ll) * sm;
      const a = re[q];
      const b = im[q];
      re[q] = dr * a - di * b;
      im[q] = dr * b + di * a;
    }
  }
  fft2(re, im, n, true);
  return { kE: re, kB: im };
}

/** Periodic Gaussian smoothing of a real n x n field (sigma in pixels). Also removes the mean. */
export function smoothField(f: Float64Array, n: number, smoothPix: number): Float64Array {
  const re = Float64Array.from(f);
  const im = new Float64Array(n * n);
  fft2(re, im, n);
  const w = (2 * Math.PI) / n;
  for (let j = 0; j < n; j++) {
    const l2 = freq(j, n);
    for (let i = 0; i < n; i++) {
      const l1 = freq(i, n);
      const q = j * n + i;
      const ll = l1 * l1 + l2 * l2;
      const sm = ll === 0 ? 0 : smoothPix > 0 ? Math.exp(-0.5 * ll * w * w * smoothPix * smoothPix) : 1;
      re[q] *= sm;
      im[q] *= sm;
    }
  }
  fft2(re, im, n, true);
  return re;
}

// ---------------------------------------------------------------------------
// The lensing field on a grid

export interface Field {
  /** Grid points per side over the field of view. */
  n: number;
  /** Side of the field in arcmin, centred on 0. */
  size: number;
  kappa: Float64Array;
  g1: Float64Array;
  g2: Float64Array;
}

/** Pixel-averaged convergence of a square pixel with lower-left corner (x0, y0). Pixels near a cusp get 16 x 16 sub-samples. */
export function pixelKappa(lenses: Lens[], x0: number, y0: number, pix: number): number {
  let total = 0;
  for (const L of lenses) {
    const S = Math.hypot(x0 + pix / 2 - L.x, y0 + pix / 2 - L.y) < 3 * pix ? 16 : 2;
    let s = 0;
    for (let sj = 0; sj < S; sj++) {
      for (let si = 0; si < S; si++) s += lensKappa(L, Math.hypot(x0 + ((si + 0.5) / S) * pix - L.x, y0 + ((sj + 0.5) / S) * pix - L.y));
    }
    total += s / (S * S);
  }
  return total;
}

/**
 * Convergence of all lenses sampled (pixel averaged sub-pixel average) on a 2n x 2n grid that covers twice
 * the field, then shear by Kaiser-Squires on that periodic grid. Mass outside the field still
 * shears galaxies inside it, so the outer ring matters. The central n x n block is returned.
 */
export function lensingField(lenses: Lens[], n: number, size: number): Field {
  const pix = size / n;
  const N = 2 * n;
  const o = n / 2;
  const big = new Float64Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      big[j * N + i] = pixelKappa(lenses, -size + i * pix, -size + j * pix, pix);
    }
  }
  const { g1: G1, g2: G2 } = ksForward(big, N);
  const kappa = new Float64Array(n * n);
  const g1 = new Float64Array(n * n);
  const g2 = new Float64Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const q = (j + o) * N + i + o;
      kappa[j * n + i] = big[q];
      g1[j * n + i] = G1[q];
      g2[j * n + i] = G2[q];
    }
  }
  return { n, size, kappa, g1, g2 };
}

/** Bilinear sample of a grid field at (x, y) arcmin. */
export function sample(f: Float64Array, n: number, size: number, x: number, y: number): number {
  const u = Math.min(n - 1.0001, Math.max(0, (x + size / 2) / (size / n) - 0.5));
  const v = Math.min(n - 1.0001, Math.max(0, (y + size / 2) / (size / n) - 0.5));
  const i = Math.floor(u);
  const j = Math.floor(v);
  const fu = u - i;
  const fv = v - j;
  const a = f[j * n + i];
  const b = f[j * n + i + 1];
  const c = f[(j + 1) * n + i];
  const d = f[(j + 1) * n + i + 1];
  return (a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + d * fu) * fv;
}

// ---------------------------------------------------------------------------
// Galaxy shapes

/** Reduced shear g = gamma / (1 - kappa). */
export const reducedShear = (g1: number, g2: number, k: number): [number, number] => [g1 / (1 - k), g2 / (1 - k)];

/**
 * Lensed complex ellipticity (epsilon = (a-b)/(a+b) convention, Seitz & Schneider 1997):
 * eps = (eps_s + g) / (1 + g* eps_s) for |g| <= 1, and (1 + g eps_s*) / (eps_s* + g*) otherwise.
 */
export function lensEllipticity(e1: number, e2: number, g1: number, g2: number, out: [number, number]): void {
  let nr: number, ni: number, dr: number, di: number;
  if (g1 * g1 + g2 * g2 <= 1) {
    nr = e1 + g1;
    ni = e2 + g2;
    dr = 1 + g1 * e1 + g2 * e2;
    di = g1 * e2 - g2 * e1;
  } else {
    nr = 1 + g1 * e1 + g2 * e2;
    ni = g2 * e1 - g1 * e2;
    dr = e1 + g1;
    di = -(e2 + g2);
  }
  const dd = dr * dr + di * di;
  out[0] = (nr * dr + ni * di) / dd;
  out[1] = (ni * dr - nr * di) / dd;
}

/** Small seeded PRNG. */
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

export function gaussPair(rnd: () => number): [number, number] {
  const u = Math.max(1e-12, rnd());
  const v = rnd();
  const r = Math.sqrt(-2 * Math.log(u));
  return [r * Math.cos(2 * Math.PI * v), r * Math.sin(2 * Math.PI * v)];
}

export interface Sources {
  max: number;
  x: Float64Array;
  y: Float64Array;
  /** Unit normal deviates; intrinsic ellipticity = sigma_e * (n1, n2). */
  n1: Float64Array;
  n2: Float64Array;
  /** Size factor for drawing. */
  size: Float64Array;
}

export function makeSources(max: number, fieldSize: number, seed: number): Sources {
  const rnd = mulberry32(seed);
  const s: Sources = { max, x: new Float64Array(max), y: new Float64Array(max), n1: new Float64Array(max), n2: new Float64Array(max), size: new Float64Array(max) };
  for (let i = 0; i < max; i++) {
    s.x[i] = (rnd() - 0.5) * fieldSize;
    s.y[i] = (rnd() - 0.5) * fieldSize;
    const [a, b] = gaussPair(rnd);
    s.n1[i] = a;
    s.n2[i] = b;
    s.size[i] = 0.6 + 0.8 * rnd();
  }
  return s;
}

/** Intrinsic ellipticity with shape noise sigmaE per component, capped at |e| = 0.9. */
export function intrinsic(s: Sources, i: number, sigmaE: number, out: [number, number]): void {
  let a = s.n1[i] * sigmaE;
  let b = s.n2[i] * sigmaE;
  const m = Math.hypot(a, b);
  if (m > 0.9) {
    a *= 0.9 / m;
    b *= 0.9 / m;
  }
  out[0] = a;
  out[1] = b;
}

// ---------------------------------------------------------------------------
// Tangential shear profile

export interface Profile1D {
  edges: Float64Array;
  mid: Float64Array;
  count: Int32Array;
  et: Float64Array;
  ex: Float64Array;
  err: Float64Array;
  model: Float64Array;
  /** Amplitude fit of the measured profile to the model, and its significance. */
  amp: number;
  snr: number;
}

/**
 * Bin tangential and cross ellipticity around (cx, cy). eps holds measured ellipticities,
 * gTrue the noise-free reduced shear at each galaxy (the model), use a 0/1 mask.
 */
export function tangentialProfile(
  cx: number, cy: number, count: number, x: Float64Array, y: Float64Array,
  e1: Float64Array, e2: Float64Array, t1: Float64Array, t2: Float64Array, use: Uint8Array,
  sigmaE: number, rMin = 0.4, rMax = 8, nb = 8,
): Profile1D {
  const edges = new Float64Array(nb + 1);
  for (let b = 0; b <= nb; b++) edges[b] = rMin * (rMax / rMin) ** (b / nb);
  const mid = new Float64Array(nb);
  const cnt = new Int32Array(nb);
  const et = new Float64Array(nb);
  const ex = new Float64Array(nb);
  const err = new Float64Array(nb);
  const model = new Float64Array(nb);
  const lr = Math.log(rMax / rMin);
  for (let i = 0; i < count; i++) {
    if (!use[i]) continue;
    const dx = x[i] - cx;
    const dy = y[i] - cy;
    const r = Math.hypot(dx, dy);
    if (r < rMin || r >= rMax) continue;
    const b = Math.floor((Math.log(r / rMin) / lr) * nb);
    const c2 = (dx * dx - dy * dy) / (r * r);
    const s2 = (2 * dx * dy) / (r * r);
    cnt[b]++;
    et[b] += -(e1[i] * c2 + e2[i] * s2);
    ex[b] += e1[i] * s2 - e2[i] * c2;
    model[b] += -(t1[i] * c2 + t2[i] * s2);
  }
  const sig = Math.sqrt(sigmaE * sigmaE + 1e-6);
  let num = 0;
  let den = 0;
  for (let b = 0; b < nb; b++) {
    mid[b] = Math.sqrt(edges[b] * edges[b + 1]);
    if (cnt[b] > 0) {
      et[b] /= cnt[b];
      ex[b] /= cnt[b];
      model[b] /= cnt[b];
      err[b] = sig / Math.sqrt(cnt[b]);
      num += (model[b] * et[b]) / (err[b] * err[b]);
      den += (model[b] * model[b]) / (err[b] * err[b]);
    } else {
      err[b] = Infinity;
    }
  }
  const amp = den > 0 ? num / den : 0;
  const snr = den > 0 ? amp * Math.sqrt(den) : 0;
  return { edges, mid, count: cnt, et, ex, err, model, amp, snr };
}

// ---------------------------------------------------------------------------
// Mass reconstruction

export interface Recon {
  n: number;
  kE: Float64Array;
  kB: Float64Array;
  counts: Int32Array;
}

/**
 * Average ellipticities in an n x n grid of cells over the field, then invert with Kaiser-Squires
 * on a zero-padded 2n grid. Empty cells contribute zero. Returns mean-free E and B maps.
 */
export function reconstruct(
  count: number, x: Float64Array, y: Float64Array, e1: Float64Array, e2: Float64Array, use: Uint8Array,
  n: number, size: number, smoothArcmin: number,
): Recon {
  const s1 = new Float64Array(n * n);
  const s2 = new Float64Array(n * n);
  const counts = new Int32Array(n * n);
  const pix = size / n;
  for (let k = 0; k < count; k++) {
    if (!use[k]) continue;
    const i = Math.min(n - 1, Math.max(0, Math.floor((x[k] + size / 2) / pix)));
    const j = Math.min(n - 1, Math.max(0, Math.floor((y[k] + size / 2) / pix)));
    const q = j * n + i;
    s1[q] += e1[k];
    s2[q] += e2[k];
    counts[q]++;
  }
  const N = 2 * n;
  const o = n / 2;
  const G1 = new Float64Array(N * N);
  const G2 = new Float64Array(N * N);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const q = j * n + i;
      if (counts[q] === 0) continue;
      G1[(j + o) * N + i + o] = s1[q] / counts[q];
      G2[(j + o) * N + i + o] = s2[q] / counts[q];
    }
  }
  const { kE: KE, kB: KB } = ksInverse(G1, G2, N, smoothArcmin / pix);
  const kE = new Float64Array(n * n);
  const kB = new Float64Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      kE[j * n + i] = KE[(j + o) * N + i + o];
      kB[j * n + i] = KB[(j + o) * N + i + o];
    }
  }
  removeMean(kE);
  removeMean(kB);
  return { n, kE, kB, counts };
}

/** True convergence averaged into n x n cells from a finer grid, smoothed like the reconstruction. */
export function truthMap(field: Field, n: number, smoothArcmin: number): Float64Array {
  const f = field.n / n;
  const cells = new Float64Array(n * n);
  for (let j = 0; j < field.n; j++) {
    for (let i = 0; i < field.n; i++) cells[Math.floor(j / f) * n + Math.floor(i / f)] += field.kappa[j * field.n + i] / (f * f);
  }
  const N = 2 * n;
  const o = n / 2;
  const pad = new Float64Array(N * N);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) pad[(j + o) * N + i + o] = cells[j * n + i];
  const sm = smoothField(pad, N, smoothArcmin / (field.size / n));
  const out = new Float64Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) out[j * n + i] = sm[(j + o) * N + i + o];
  removeMean(out);
  return out;
}

export function removeMean(a: Float64Array): void {
  let m = 0;
  for (let i = 0; i < a.length; i++) m += a[i];
  m /= a.length;
  for (let i = 0; i < a.length; i++) a[i] -= m;
}

export function rms(a: Float64Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return Math.sqrt(s / a.length);
}

/** Pearson correlation of two equal-length arrays. */
export function correlation(a: Float64Array, b: Float64Array): number {
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < a.length; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= a.length;
  mb /= b.length;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < a.length; i++) {
    const u = a[i] - ma;
    const v = b[i] - mb;
    sab += u * v;
    saa += u * u;
    sbb += v * v;
  }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
}

// ---------------------------------------------------------------------------
// Whole observation: lens every source, flag strong-lensing ones, reconstruct.

export interface Observation {
  count: number;
  /** Observed (lensed) ellipticities. */
  e1: Float64Array;
  e2: Float64Array;
  /** Noise-free reduced shear at each source. */
  t1: Float64Array;
  t2: Float64Array;
  /** Local convergence at each source. */
  k: Float64Array;
  /** 1 if the source is in the weak regime and used. */
  use: Uint8Array;
}

/** Convergence above which a source counts as strongly lensed and is masked. */
export const KAPPA_MASK = 0.5;

export function observe(field: Field, src: Sources, count: number, sigmaE: number, obs?: Observation): Observation {
  const o: Observation = obs && obs.e1.length >= count ? obs : {
    count, e1: new Float64Array(src.max), e2: new Float64Array(src.max), t1: new Float64Array(src.max),
    t2: new Float64Array(src.max), k: new Float64Array(src.max), use: new Uint8Array(src.max),
  };
  o.count = count;
  const es: [number, number] = [0, 0];
  const el: [number, number] = [0, 0];
  for (let i = 0; i < count; i++) {
    const x = src.x[i];
    const y = src.y[i];
    const k = sample(field.kappa, field.n, field.size, x, y);
    const g1 = sample(field.g1, field.n, field.size, x, y) / (1 - k);
    const g2 = sample(field.g2, field.n, field.size, x, y) / (1 - k);
    o.k[i] = k;
    o.t1[i] = g1;
    o.t2[i] = g2;
    intrinsic(src, i, sigmaE, es);
    lensEllipticity(es[0], es[1], g1, g2, el);
    o.e1[i] = el[0];
    o.e2[i] = el[1];
    o.use[i] = k < KAPPA_MASK && g1 * g1 + g2 * g2 < 1 ? 1 : 0;
  }
  return o;
}
