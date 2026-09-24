// Particle-mesh (PM) N-body code in comoving coordinates on a periodic box.
// Pure math, no DOM. Units: lengths in mesh cells, time in 1/H0, so the
// equations of motion are
//   dx/da = p / (a^3 H),   dp/da = -grad(phi) / (a^2 H),   lap(phi) = (3/2) Om delta
// where p = a^2 dx/dt is the canonical comoving momentum and phi = a * Phi.

export const NG = 64;
export const NG3 = NG * NG * NG;
/** Box side in Mpc/h. */
export const BOX = 50;
export const Z_INIT = 50;
export const A_INIT = 1 / (1 + Z_INIT);
export const SIGMA8 = 0.8;
/** Critical density today in (M_sun/h) / (Mpc/h)^3. */
export const RHO_CRIT = 2.775e11;
/** BBKS shape parameter Gamma = Om h. */
export const GAMMA = 0.21;
/** Warm dark matter: thermal relic mass (keV). Deliberately light so the cutoff lands inside our resolution. */
export const WDM_KEV = 0.15;
/** Friends-of-friends linking length in units of the mean particle spacing. */
export const FOF_B = 0.2;
/** Minimum members for a group to count as a halo. */
export const FOF_MIN = 20;

export type Background = 'lcdm' | 'eds';
export interface Cosmo {
  Om: number;
  Ol: number;
}
export const COSMO: Record<Background, Cosmo> = {
  lcdm: { Om: 0.31, Ol: 0.69 },
  eds: { Om: 1, Ol: 0 },
};

// ------------------------------------------------------------ background

/** H(a)/H0 for matter + Lambda (+ curvature if they do not sum to 1). */
export function hubble(a: number, c: Cosmo): number {
  return Math.sqrt(c.Om / (a * a * a) + c.Ol + (1 - c.Om - c.Ol) / (a * a));
}

function simpson(f: (x: number) => number, x0: number, x1: number, n = 64): number {
  if (n % 2) n++;
  const h = (x1 - x0) / n;
  let s = f(x0) + f(x1);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(x0 + i * h);
  return (s * h) / 3;
}

/** Linear growth factor, normalised so that D -> a at early times (exact for matter + Lambda). */
export function growth(a: number, c: Cosmo): number {
  const I = simpson((x) => (x <= 0 ? 0 : 1 / Math.pow(x * hubble(x, c), 3)), 0, a, 800);
  return 2.5 * c.Om * hubble(a, c) * I;
}

/** Logarithmic growth rate f = dlnD/dlna. */
export function growthRate(a: number, c: Cosmo): number {
  const e = 1e-4;
  return (Math.log(growth(a * (1 + e), c)) - Math.log(growth(a * (1 - e), c))) / (2 * e);
}

/** Kick factor: integral of da / (a^2 H). */
export function kickFactor(a0: number, a1: number, c: Cosmo): number {
  return simpson((a) => 1 / (a * a * hubble(a, c)), a0, a1, 16);
}
/** Drift factor: integral of da / (a^3 H). */
export function driftFactor(a0: number, a1: number, c: Cosmo): number {
  return simpson((a) => 1 / (a * a * a * hubble(a, c)), a0, a1, 16);
}

/** Scale factors of the time steps: steps of 7% in a early on, capped at da = 0.03 later. */
export function stepSchedule(aInit = A_INIT, dlna = 0.07, daMax = 0.03): number[] {
  const out = [aInit];
  let a = aInit;
  while (a < 1 - 1e-9) {
    a = Math.min(1, a + Math.min(dlna * a, daMax));
    out.push(a);
  }
  return out;
}

// ------------------------------------------------------------ random numbers

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

// ------------------------------------------------------------ FFT

/** In-place radix-2 complex FFT on an n x n x n cube stored as separate real and imaginary arrays. */
export class FFT3 {
  private readonly rev: Uint32Array;
  private readonly cs: Float64Array;
  private readonly sn: Float64Array;
  private readonly br: Float64Array;
  private readonly bi: Float64Array;
  readonly n: number;
  constructor(n: number) {
    this.n = n;
    if (n & (n - 1)) throw new Error('FFT size must be a power of two');
    const bits = Math.round(Math.log2(n));
    this.rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
    this.cs = new Float64Array(n / 2);
    this.sn = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      this.cs[i] = Math.cos((2 * Math.PI * i) / n);
      this.sn[i] = Math.sin((2 * Math.PI * i) / n);
    }
    this.br = new Float64Array(n);
    this.bi = new Float64Array(n);
  }

  /** 1D transform of the scratch buffers. sign = -1 forward, +1 inverse (unscaled). */
  private line(sign: number): void {
    const { n, br, bi, cs, sn } = this;
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1;
      const step = n / len;
      for (let i = 0; i < n; i += len) {
        for (let j = 0; j < half; j++) {
          const wr = cs[j * step];
          const wi = sign * sn[j * step];
          const a = i + j;
          const b = a + half;
          const xr = br[b] * wr - bi[b] * wi;
          const xi = br[b] * wi + bi[b] * wr;
          br[b] = br[a] - xr;
          bi[b] = bi[a] - xi;
          br[a] += xr;
          bi[a] += xi;
        }
      }
    }
  }

  private pass(re: Float64Array, im: Float64Array, stride: number, outerA: number, outerB: number, sign: number): void {
    const { n, rev, br, bi } = this;
    for (let u = 0; u < n; u++) {
      for (let v = 0; v < n; v++) {
        const off = u * outerA + v * outerB;
        for (let k = 0; k < n; k++) {
          const idx = off + k * stride;
          const r = rev[k];
          br[r] = re[idx];
          bi[r] = im[idx];
        }
        this.line(sign);
        for (let k = 0; k < n; k++) {
          const idx = off + k * stride;
          re[idx] = br[k];
          im[idx] = bi[k];
        }
      }
    }
  }

  /** Forward: X_k = sum x_j e^{-i k.x}. Inverse includes the 1/n^3 factor. */
  transform(re: Float64Array, im: Float64Array, inverse = false): void {
    const n = this.n;
    const sign = inverse ? 1 : -1;
    this.pass(re, im, 1, n * n, n, sign); // z lines
    this.pass(re, im, n, n * n, 1, sign); // y lines
    this.pass(re, im, n * n, n, 1, sign); // x lines
    if (inverse) {
      const s = 1 / (n * n * n);
      for (let i = 0; i < re.length; i++) {
        re[i] *= s;
        im[i] *= s;
      }
    }
  }
}

/** Signed integer frequency of index i on an n-point grid. */
export const freq = (i: number, n: number) => (i <= n / 2 ? i : i - n);

// ------------------------------------------------------------ mesh operations

/** Cloud-in-cell assignment of equal-mass particles onto a periodic ng^3 mesh (positions in cells). */
export function cicAssign(pos: ArrayLike<number>, n: number, mesh: Float64Array, ng: number, mass: number): void {
  mesh.fill(0);
  const ng2 = ng * ng;
  for (let p = 0; p < n; p++) {
    const x = pos[p * 3];
    const y = pos[p * 3 + 1];
    const z = pos[p * 3 + 2];
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fy = y - iy;
    const fz = z - iz;
    const x0 = ((ix % ng) + ng) % ng;
    const y0 = ((iy % ng) + ng) % ng;
    const z0 = ((iz % ng) + ng) % ng;
    const x1 = x0 + 1 === ng ? 0 : x0 + 1;
    const y1 = y0 + 1 === ng ? 0 : y0 + 1;
    const z1 = z0 + 1 === ng ? 0 : z0 + 1;
    const gx = 1 - fx;
    const gy = 1 - fy;
    const gz = 1 - fz;
    const X0 = x0 * ng2;
    const X1 = x1 * ng2;
    const Y0 = y0 * ng;
    const Y1 = y1 * ng;
    mesh[X0 + Y0 + z0] += mass * gx * gy * gz;
    mesh[X0 + Y0 + z1] += mass * gx * gy * fz;
    mesh[X0 + Y1 + z0] += mass * gx * fy * gz;
    mesh[X0 + Y1 + z1] += mass * gx * fy * fz;
    mesh[X1 + Y0 + z0] += mass * fx * gy * gz;
    mesh[X1 + Y0 + z1] += mass * fx * gy * fz;
    mesh[X1 + Y1 + z0] += mass * fx * fy * gz;
    mesh[X1 + Y1 + z1] += mass * fx * fy * fz;
  }
}

/** Cloud-in-cell interpolation of a periodic mesh field at a point (cells). */
export function cicSample(mesh: ArrayLike<number>, ng: number, x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const x0 = ((ix % ng) + ng) % ng;
  const y0 = ((iy % ng) + ng) % ng;
  const z0 = ((iz % ng) + ng) % ng;
  const x1 = (x0 + 1) % ng;
  const y1 = (y0 + 1) % ng;
  const z1 = (z0 + 1) % ng;
  const ng2 = ng * ng;
  return (
    mesh[x0 * ng2 + y0 * ng + z0] * (1 - fx) * (1 - fy) * (1 - fz) +
    mesh[x0 * ng2 + y0 * ng + z1] * (1 - fx) * (1 - fy) * fz +
    mesh[x0 * ng2 + y1 * ng + z0] * (1 - fx) * fy * (1 - fz) +
    mesh[x0 * ng2 + y1 * ng + z1] * (1 - fx) * fy * fz +
    mesh[x1 * ng2 + y0 * ng + z0] * fx * (1 - fy) * (1 - fz) +
    mesh[x1 * ng2 + y0 * ng + z1] * fx * (1 - fy) * fz +
    mesh[x1 * ng2 + y1 * ng + z0] * fx * fy * (1 - fz) +
    mesh[x1 * ng2 + y1 * ng + z1] * fx * fy * fz
  );
}

const sinc = (x: number) => (Math.abs(x) < 1e-8 ? 1 : Math.sin(x) / x);
/** Square of the CIC window W(k) = prod sinc^2(pi n_i / N), for integer frequencies. */
export function cicWindow2(kx: number, ky: number, kz: number, n: number): number {
  const w = sinc((Math.PI * kx) / n) * sinc((Math.PI * ky) / n) * sinc((Math.PI * kz) / n);
  return w ** 4;
}

/**
 * Solve lap(phi) = (3/2) Om delta spectrally (cell units). re holds delta on entry and phi on exit.
 * im is scratch. If pk is given, the binned |delta_k|^2 is accumulated into it before the solve.
 */
export function solvePoisson(fft: FFT3, re: Float64Array, im: Float64Array, Om: number, pk?: { sum: Float64Array; cnt: Float64Array }, deconv = false): void {
  const n = fft.n;
  im.fill(0);
  fft.transform(re, im, false);
  const tw = (2 * Math.PI) / n;
  const coef = -1.5 * Om;
  for (let i = 0; i < n; i++) {
    const kx = freq(i, n);
    for (let j = 0; j < n; j++) {
      const ky = freq(j, n);
      const base = (i * n + j) * n;
      for (let l = 0; l < n; l++) {
        const kz = freq(l, n);
        const idx = base + l;
        const n2 = kx * kx + ky * ky + kz * kz;
        if (n2 === 0) {
          re[idx] = 0;
          im[idx] = 0;
          continue;
        }
        if (pk) {
          const b = Math.round(Math.sqrt(n2));
          if (b < pk.sum.length) {
            pk.sum[b] += re[idx] * re[idx] + im[idx] * im[idx];
            pk.cnt[b] += 1;
          }
        }
        // Divide by the CIC window twice (assignment and interpolation) so forces are not smoothed twice.
        const w = deconv ? cicWindow2(kx, ky, kz, n) : 1;
        const g = coef / (n2 * tw * tw * w);
        re[idx] *= g;
        im[idx] *= g;
      }
    }
  }
  fft.transform(re, im, true);
}

// ------------------------------------------------------------ power spectrum

export type Shape = 'cdm' | 'power';
export interface Spectrum {
  /** Primordial slope n in P ~ k^n T^2(k). */
  slope: number;
  shape: Shape;
  warm: boolean;
}

/** BBKS (1986) CDM transfer function, k in h/Mpc. */
export function bbks(k: number, gamma = GAMMA): number {
  const q = k / gamma;
  if (q < 1e-8) return 1;
  return (Math.log(1 + 2.34 * q) / (2.34 * q)) * Math.pow(1 + 3.89 * q + (16.1 * q) ** 2 + (5.46 * q) ** 3 + (6.71 * q) ** 4, -0.25);
}

/** Viel et al. (2005) WDM cutoff scale alpha (Mpc/h) for a thermal relic of mass m keV, with Om_x = 0.26, h = 0.68. */
export function wdmAlpha(mKeV: number): number {
  return 0.049 * Math.pow(mKeV, -1.11) * Math.pow(0.26 / 0.25, 0.11) * Math.pow(0.68 / 0.7, 1.22);
}
/** WDM / CDM transfer ratio T(k) = [1 + (alpha k)^(2 nu)]^(-5/nu), nu = 1.12. */
export function wdmTransfer(k: number, alpha: number): number {
  const nu = 1.12;
  return Math.pow(1 + Math.pow(alpha * k, 2 * nu), -5 / nu);
}
/** Half-mode wavenumber, where the WDM power ratio T^2 falls to 1/2. */
export function halfModeK(alpha: number): number {
  const nu = 1.12;
  return Math.pow(Math.pow(0.5, -nu / 10) - 1, 1 / (2 * nu)) / alpha;
}

/** Unnormalised linear P(k) shape (CDM part only). k in h/Mpc. */
export function pShape(k: number, s: Spectrum): number {
  const t = s.shape === 'cdm' ? bbks(k) : 1;
  return Math.pow(k, s.slope) * t * t;
}

export function tophat(x: number): number {
  if (x < 1e-4) return 1;
  return (3 * (Math.sin(x) - x * Math.cos(x))) / (x * x * x);
}

/** Largest |n| component kept in the initial conditions for np^3 particles. */
export const nMax = (np: number) => np / 2 - 1;

/** sigma_8 of the shape P(k) using only the modes represented in the box. */
export function boxSigma8(s: Spectrum, np: number): number {
  const m = nMax(np);
  let sum = 0;
  const kf = (2 * Math.PI) / BOX;
  for (let i = -m; i <= m; i++)
    for (let j = -m; j <= m; j++)
      for (let l = -m; l <= m; l++) {
        const n2 = i * i + j * j + l * l;
        if (!n2) continue;
        const k = kf * Math.sqrt(n2);
        const w = tophat(8 * k);
        sum += pShape(k, s) * w * w;
      }
  return Math.sqrt(sum / BOX ** 3);
}

// ------------------------------------------------------------ initial conditions

export interface IC {
  x: Float64Array;
  p: Float64Array;
  /** Rms of the linear displacement today, in cells. */
  sRms: number;
}

/**
 * Zel'dovich initial conditions at a = aInit. x = q + D S, p = a^2 H f D S, with div S = -delta_0 (linear density today).
 * The white noise lives on the 64^3 mesh, so the same seed gives the same large-scale structure at every particle count.
 */
export function zeldovich(np: number, spec: Spectrum, seed: number, c: Cosmo, fft: FFT3, aInit = A_INIT): IC {
  const n = fft.n;
  const N3 = n * n * n;
  const re = new Float64Array(N3);
  const im = new Float64Array(N3);
  const rnd = mulberry32(seed * 9973 + 17);
  for (let i = 0; i < N3; i += 2) {
    const u1 = Math.max(1e-12, rnd());
    const u2 = rnd();
    const r = Math.sqrt(-2 * Math.log(u1));
    re[i] = r * Math.cos(2 * Math.PI * u2);
    if (i + 1 < N3) re[i + 1] = r * Math.sin(2 * Math.PI * u2);
  }
  fft.transform(re, im, false);
  const A = SIGMA8 / boxSigma8(spec, np);
  const alpha = wdmAlpha(WDM_KEV);
  const m = nMax(np);
  const kf = (2 * Math.PI) / BOX;
  const tw = (2 * Math.PI) / n;
  const dk = new Float64Array(N3 * 2); // delta_k (re, im)
  for (let i = 0; i < n; i++) {
    const a = freq(i, n);
    for (let j = 0; j < n; j++) {
      const b = freq(j, n);
      for (let l = 0; l < n; l++) {
        const cc = freq(l, n);
        const idx = (i * n + j) * n + l;
        const n2 = a * a + b * b + cc * cc;
        if (!n2 || Math.abs(a) > m || Math.abs(b) > m || Math.abs(cc) > m) continue;
        const k = kf * Math.sqrt(n2);
        let amp = A * Math.sqrt((pShape(k, spec) * N3) / BOX ** 3);
        if (spec.warm) amp *= wdmTransfer(k, alpha);
        dk[idx * 2] = re[idx] * amp;
        dk[idx * 2 + 1] = im[idx] * amp;
      }
    }
  }
  const s = n / np; // lattice spacing in cells
  const off = 0.25 * s; // lattice offset. For s = 2 it puts particles midway between mesh points.
  const npart = np * np * np;
  const S = new Float64Array(npart * 3);
  for (let comp = 0; comp < 3; comp++) {
    for (let i = 0; i < n; i++) {
      const a = freq(i, n);
      for (let j = 0; j < n; j++) {
        const b = freq(j, n);
        for (let l = 0; l < n; l++) {
          const cc = freq(l, n);
          const idx = (i * n + j) * n + l;
          const n2 = a * a + b * b + cc * cc;
          if (!n2) {
            re[idx] = im[idx] = 0;
            continue;
          }
          const kc = (comp === 0 ? a : comp === 1 ? b : cc) * tw;
          const k2 = n2 * tw * tw;
          // S_k = i k delta_k / k^2, then shift by the lattice offset: times e^{i k . off}
          const dr = dk[idx * 2];
          const di = dk[idx * 2 + 1];
          const sr = (-kc * di) / k2;
          const si = (kc * dr) / k2;
          const ph = (a + b + cc) * tw * off;
          const cp = Math.cos(ph);
          const sp = Math.sin(ph);
          re[idx] = sr * cp - si * sp;
          im[idx] = sr * sp + si * cp;
        }
      }
    }
    fft.transform(re, im, true);
    for (let i = 0; i < np; i++)
      for (let j = 0; j < np; j++)
        for (let l = 0; l < np; l++) {
          const pi = (i * np + j) * np + l;
          S[pi * 3 + comp] = re[((i * s) * n + j * s) * n + l * s];
        }
  }
  const D = growth(aInit, c) / growth(1, c);
  const f = growthRate(aInit, c);
  const vf = aInit * aInit * hubble(aInit, c) * f * D;
  const x = new Float64Array(npart * 3);
  const p = new Float64Array(npart * 3);
  let ss = 0;
  for (let i = 0; i < np; i++)
    for (let j = 0; j < np; j++)
      for (let l = 0; l < np; l++) {
        const pi = (i * np + j) * np + l;
        const q = [i * s + off, j * s + off, l * s + off];
        for (let c3 = 0; c3 < 3; c3++) {
          const d = S[pi * 3 + c3];
          ss += d * d;
          x[pi * 3 + c3] = wrapCoord(q[c3] + D * d, n);
          p[pi * 3 + c3] = vf * d;
        }
      }
  return { x, p, sRms: Math.sqrt(ss / npart) };
}

export const wrapCoord = (v: number, L: number) => {
  v %= L;
  return v < 0 ? v + L : v;
};

// ------------------------------------------------------------ friends of friends

export interface Halos {
  count: number;
  /** Centres in the same units as the input positions. */
  centres: Float32Array;
  sizes: Int32Array;
}

/** Friends-of-friends groups with at least minN members, largest first. Periodic box of side L. */
export function fof(pos: ArrayLike<number>, n: number, L: number, link: number, minN: number): Halos {
  const nc = Math.max(1, Math.min(128, Math.floor(L / link)));
  const cs = L / nc;
  const head = new Int32Array(nc * nc * nc).fill(-1);
  const next = new Int32Array(n);
  const cellOf = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const cx = Math.min(nc - 1, Math.floor(pos[i * 3] / cs));
    const cy = Math.min(nc - 1, Math.floor(pos[i * 3 + 1] / cs));
    const cz = Math.min(nc - 1, Math.floor(pos[i * 3 + 2] / cs));
    const c = (cx * nc + cy) * nc + cz;
    cellOf[i] = c;
    next[i] = head[c];
    head[c] = i;
  }
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const l2 = link * link;
  const half = L / 2;
  const span = nc < 3 ? 0 : 1;
  for (let i = 0; i < n; i++) {
    const c = cellOf[i];
    const cx = Math.floor(c / (nc * nc));
    const cy = Math.floor(c / nc) % nc;
    const cz = c % nc;
    const xi = pos[i * 3];
    const yi = pos[i * 3 + 1];
    const zi = pos[i * 3 + 2];
    for (let dx = -span; dx <= span; dx++)
      for (let dy = -span; dy <= span; dy++)
        for (let dz = -span; dz <= span; dz++) {
          const ox = (cx + dx + nc) % nc;
          const oy = (cy + dy + nc) % nc;
          const oz = (cz + dz + nc) % nc;
          for (let j = head[(ox * nc + oy) * nc + oz]; j >= 0; j = next[j]) {
            if (j <= i) continue;
            let ddx = Math.abs(pos[j * 3] - xi);
            let ddy = Math.abs(pos[j * 3 + 1] - yi);
            let ddz = Math.abs(pos[j * 3 + 2] - zi);
            if (ddx > half) ddx = L - ddx;
            if (ddy > half) ddy = L - ddy;
            if (ddz > half) ddz = L - ddz;
            if (ddx * ddx + ddy * ddy + ddz * ddz <= l2) {
              const ri = find(i);
              const rj = find(j);
              if (ri !== rj) parent[rj] = ri;
            }
          }
        }
  }
  const size = new Int32Array(n);
  for (let i = 0; i < n; i++) size[find(i)]++;
  const roots: number[] = [];
  for (let i = 0; i < n; i++) if (parent[i] === i && size[i] >= minN) roots.push(i);
  roots.sort((a, b) => size[b] - size[a]);
  const slot = new Int32Array(n).fill(-1);
  roots.forEach((r, k) => (slot[r] = k));
  const acc = new Float64Array(roots.length * 3);
  for (let i = 0; i < n; i++) {
    const k = slot[find(i)];
    if (k < 0) continue;
    const r = roots[k];
    for (let d = 0; d < 3; d++) {
      let dd = pos[i * 3 + d] - pos[r * 3 + d];
      if (dd > half) dd -= L;
      else if (dd < -half) dd += L;
      acc[k * 3 + d] += dd;
    }
  }
  const centres = new Float32Array(roots.length * 3);
  const sizes = new Int32Array(roots.length);
  roots.forEach((r, k) => {
    sizes[k] = size[r];
    for (let d = 0; d < 3; d++) centres[k * 3 + d] = wrapCoord(pos[r * 3 + d] + acc[k * 3 + d] / size[r], L);
  });
  return { count: roots.length, centres, sizes };
}

// ------------------------------------------------------------ the simulation

export interface SimOptions {
  np: number;
  seed: number;
  spec: Spectrum;
  bg: Background;
  /** Optional ready-made initial state (used by the tests). */
  ic?: { x: Float64Array; p: Float64Array };
  /** Optional custom step schedule. */
  steps?: number[];
}

interface Snap {
  a: number;
  pos: Uint16Array;
}

const Q = 65536 / NG;

export class PMSim {
  readonly np: number;
  readonly n: number;
  readonly cosmo: Cosmo;
  readonly steps: number[];
  /** Index into steps of the current state. */
  i = 0;
  readonly x: Float64Array;
  readonly p: Float64Array;
  private readonly acc: Float64Array;
  private readonly fft = new FFT3(NG);
  private readonly re = new Float64Array(NG3);
  private readonly im = new Float64Array(NG3);
  private readonly gx = new Float32Array(NG3);
  private readonly gy = new Float32Array(NG3);
  private readonly gz = new Float32Array(NG3);
  private readonly pkSum = new Float64Array(NG / 2 + 1);
  private readonly pkCnt = new Float64Array(NG / 2 + 1);
  private readonly snaps: Snap[] = [];
  private readonly snapEvery: number;
  /** Binned mesh power spectrum at every computed step, (Mpc/h)^3. */
  readonly pk: Float32Array[] = [];
  /** Rms density contrast on the mesh at every computed step. */
  readonly sigma: number[] = [];
  /** Milliseconds spent on the last step. */
  lastMs = 0;
  readonly massPerParticle: number;
  readonly opts: SimOptions;

  constructor(opts: SimOptions) {
    this.opts = opts;
    this.np = opts.np;
    this.n = opts.np ** 3;
    this.cosmo = COSMO[opts.bg];
    this.steps = opts.steps ?? stepSchedule();
    const ic = opts.ic ?? zeldovich(opts.np, opts.spec, opts.seed, this.cosmo, this.fft, this.steps[0]);
    this.x = ic.x;
    this.p = ic.p;
    this.acc = new Float64Array(this.n * 3);
    this.snapEvery = opts.np >= 64 ? 2 : 1;
    this.massPerParticle = RHO_CRIT * this.cosmo.Om * (BOX / opts.np) ** 3;
    this.forces();
    this.snap();
  }

  get a(): number {
    return this.steps[this.i];
  }
  get done(): boolean {
    return this.i >= this.steps.length - 1;
  }
  /** Scale factor of the newest stored snapshot. */
  get frontier(): number {
    return this.snaps[this.snaps.length - 1].a;
  }

  private snap(): void {
    const pos = new Uint16Array(this.n * 3);
    for (let k = 0; k < pos.length; k++) pos[k] = Math.round(this.x[k] * Q) & 0xffff;
    this.snaps.push({ a: this.a, pos });
  }

  /** Mass assignment, Poisson solve, finite-difference gradient and CIC force interpolation. */
  private forces(): void {
    const { re, im, gx, gy, gz, x, acc, n } = this;
    cicAssign(x, n, re, NG, NG3 / n);
    let s2 = 0;
    for (let k = 0; k < NG3; k++) {
      re[k] -= 1;
      s2 += re[k] * re[k];
    }
    this.sigma.push(Math.sqrt(s2 / NG3));
    this.pkSum.fill(0);
    this.pkCnt.fill(0);
    solvePoisson(this.fft, re, im, this.cosmo.Om, { sum: this.pkSum, cnt: this.pkCnt });
    const pk = new Float32Array(NG / 2 + 1);
    const norm = BOX ** 3 / (NG3 * NG3);
    for (let b = 1; b <= NG / 2; b++) pk[b] = this.pkCnt[b] ? (this.pkSum[b] / this.pkCnt[b]) * norm : 0;
    this.pk.push(pk);
    const ng2 = NG * NG;
    const M = NG - 1;
    // Fourth-order central differences: g = -(8(f+1 - f-1) - (f+2 - f-2)) / 12
    for (let i = 0; i < NG; i++) {
      const ip = ((i + 1) & M) * ng2;
      const im1 = ((i - 1) & M) * ng2;
      const ip2 = ((i + 2) & M) * ng2;
      const im2 = ((i - 2) & M) * ng2;
      const i0 = i * ng2;
      for (let j = 0; j < NG; j++) {
        const jp = ((j + 1) & M) * NG;
        const jm = ((j - 1) & M) * NG;
        const jp2 = ((j + 2) & M) * NG;
        const jm2 = ((j - 2) & M) * NG;
        const j0 = j * NG;
        for (let l = 0; l < NG; l++) {
          const lp = (l + 1) & M;
          const lm = (l - 1) & M;
          const lp2 = (l + 2) & M;
          const lm2 = (l - 2) & M;
          const idx = i0 + j0 + l;
          gx[idx] = -(8 * (re[ip + j0 + l] - re[im1 + j0 + l]) - (re[ip2 + j0 + l] - re[im2 + j0 + l])) / 12;
          gy[idx] = -(8 * (re[i0 + jp + l] - re[i0 + jm + l]) - (re[i0 + jp2 + l] - re[i0 + jm2 + l])) / 12;
          gz[idx] = -(8 * (re[i0 + j0 + lp] - re[i0 + j0 + lm]) - (re[i0 + j0 + lp2] - re[i0 + j0 + lm2])) / 12;
        }
      }
    }
    for (let q = 0; q < n; q++) {
      const px = x[q * 3];
      const py = x[q * 3 + 1];
      const pz = x[q * 3 + 2];
      const ix = Math.floor(px);
      const iy = Math.floor(py);
      const iz = Math.floor(pz);
      const fx = px - ix;
      const fy = py - iy;
      const fz = pz - iz;
      const x0 = ix & (NG - 1);
      const y0 = iy & (NG - 1);
      const z0 = iz & (NG - 1);
      const x1 = (x0 + 1) & (NG - 1);
      const y1 = (y0 + 1) & (NG - 1);
      const z1 = (z0 + 1) & (NG - 1);
      const w000 = (1 - fx) * (1 - fy) * (1 - fz);
      const w001 = (1 - fx) * (1 - fy) * fz;
      const w010 = (1 - fx) * fy * (1 - fz);
      const w011 = (1 - fx) * fy * fz;
      const w100 = fx * (1 - fy) * (1 - fz);
      const w101 = fx * (1 - fy) * fz;
      const w110 = fx * fy * (1 - fz);
      const w111 = fx * fy * fz;
      const c000 = x0 * ng2 + y0 * NG + z0;
      const c001 = x0 * ng2 + y0 * NG + z1;
      const c010 = x0 * ng2 + y1 * NG + z0;
      const c011 = x0 * ng2 + y1 * NG + z1;
      const c100 = x1 * ng2 + y0 * NG + z0;
      const c101 = x1 * ng2 + y0 * NG + z1;
      const c110 = x1 * ng2 + y1 * NG + z0;
      const c111 = x1 * ng2 + y1 * NG + z1;
      acc[q * 3] = w000 * gx[c000] + w001 * gx[c001] + w010 * gx[c010] + w011 * gx[c011] + w100 * gx[c100] + w101 * gx[c101] + w110 * gx[c110] + w111 * gx[c111];
      acc[q * 3 + 1] = w000 * gy[c000] + w001 * gy[c001] + w010 * gy[c010] + w011 * gy[c011] + w100 * gy[c100] + w101 * gy[c101] + w110 * gy[c110] + w111 * gy[c111];
      acc[q * 3 + 2] = w000 * gz[c000] + w001 * gz[c001] + w010 * gz[c010] + w011 * gz[c011] + w100 * gz[c100] + w101 * gz[c101] + w110 * gz[c110] + w111 * gz[c111];
    }
  }

  /** One kick-drift-kick leapfrog step in the scale factor. */
  advance(): void {
    if (this.done) return;
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const a0 = this.steps[this.i];
    const a1 = this.steps[this.i + 1];
    const am = 0.5 * (a0 + a1);
    const c = this.cosmo;
    const { x, p, acc } = this;
    const k1 = kickFactor(a0, am, c);
    const dr = driftFactor(a0, a1, c);
    const k2 = kickFactor(am, a1, c);
    const len = this.n * 3;
    for (let k = 0; k < len; k++) {
      p[k] += acc[k] * k1;
      let v = x[k] + p[k] * dr;
      if (v < 0 || v >= NG) v = wrapCoord(v, NG);
      x[k] = v;
    }
    this.i++;
    this.forces();
    for (let k = 0; k < len; k++) p[k] += acc[k] * k2;
    if (this.i % this.snapEvery === 0 || this.done) this.snap();
    this.lastMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  }

  /** Positions (cells) at scale factor a, interpolated between stored snapshots. */
  positionsAt(a: number, out: Float32Array): number {
    const sn = this.snaps;
    let j = 0;
    while (j < sn.length - 1 && sn[j + 1].a <= a) j++;
    const A = sn[j];
    if (j === sn.length - 1 || a <= A.a) {
      for (let k = 0; k < out.length; k++) out[k] = A.pos[k] / Q;
      return A.a;
    }
    const B = sn[j + 1];
    const w = (a - A.a) / (B.a - A.a);
    const half = NG / 2;
    for (let k = 0; k < out.length; k++) {
      const xa = A.pos[k] / Q;
      let d = B.pos[k] / Q - xa;
      if (d > half) d -= NG;
      else if (d < -half) d += NG;
      let v = xa + w * d;
      if (v < 0) v += NG;
      else if (v >= NG) v -= NG;
      out[k] = v;
    }
    return a;
  }

  /** Index of the newest computed step with scale factor <= a. */
  stepAt(a: number): number {
    let j = 0;
    while (j < this.i && this.steps[j + 1] <= a + 1e-12) j++;
    return j;
  }
}

/** Wavenumber (h/Mpc) of power-spectrum bin b. */
export const binK = (b: number) => (2 * Math.PI * b) / BOX;

/** Measured growth over linear theory: sqrt(P_low(a)/P_low(a_i)) / (D(a)/D(a_i)), from the two lowest-k bins. */
export function growthCheck(sim: PMSim, step: number): number {
  const p0 = sim.pk[0][1] + sim.pk[0][2];
  const p1 = sim.pk[step][1] + sim.pk[step][2];
  const a = sim.steps[step];
  return Math.sqrt(p1 / p0) / (growth(a, sim.cosmo) / growth(sim.steps[0], sim.cosmo));
}
