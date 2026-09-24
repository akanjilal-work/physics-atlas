// A scalar field on a periodic 2D lattice: a "mattress" of masses and springs.
// Units: hbar = c = 1. Lattice spacing a, N x N sites, box side L = N a.
//
// Hamiltonian for two fields A and B (the toy coupling is a spring between
// matching sites of the two mattresses):
//   H = a^2 sum_n [ 1/2 piA^2 + 1/2 m^2 phiA^2 + 1/2 sum_dir ((phiA(n+e) - phiA(n)) / a)^2
//                 + same for B + g/2 (phiA - phiB)^2 ]
// Equation of motion: phiA'' = lap(phiA) - m^2 phiA - g (phiA - phiB).
// Normal modes of one uncoupled field are plane waves with
//   omega_k^2 = m^2 + (4/a^2) [sin^2(kx a/2) + sin^2(ky a/2)].
// Pure module: no DOM, no Three.js.

export interface FieldParams {
  N: number;
  a: number;
  m: number;
  /** Toy coupling between field A and field B (spring constant per site). */
  g: number;
}

export interface TwoField {
  N: number;
  phiA: Float64Array;
  piA: Float64Array;
  phiB: Float64Array;
  piB: Float64Array;
  accA: Float64Array;
  accB: Float64Array;
  /** True when acc holds the acceleration of the current phi. */
  accValid: boolean;
}

export function makeTwoField(N: number): TwoField {
  const n = N * N;
  return {
    N,
    phiA: new Float64Array(n),
    piA: new Float64Array(n),
    phiB: new Float64Array(n),
    piB: new Float64Array(n),
    accA: new Float64Array(n),
    accB: new Float64Array(n),
    accValid: false,
  };
}

export function clearField(f: TwoField): void {
  f.phiA.fill(0);
  f.piA.fill(0);
  f.phiB.fill(0);
  f.piB.fill(0);
  f.accValid = false;
}

// ---------------------------------------------------------------------------
// Dispersion
// ---------------------------------------------------------------------------

/** Lattice dispersion omega(kx, ky). */
export function omegaLattice(kx: number, ky: number, m: number, a: number): number {
  const sx = Math.sin(0.5 * kx * a);
  const sy = Math.sin(0.5 * ky * a);
  return Math.sqrt(m * m + (4 / (a * a)) * (sx * sx + sy * sy));
}

/** Continuum Klein-Gordon dispersion omega = sqrt(m^2 + k^2) (hbar = c = 1). */
export function omegaContinuum(k: number, m: number): number {
  return Math.sqrt(m * m + k * k);
}

/** Group velocity d omega / d kx of the lattice dispersion, for a packet moving along x (ky = 0). */
export function groupVelocityLattice(kx: number, m: number, a: number): number {
  return Math.sin(kx * a) / (a * omegaLattice(kx, 0, m, a));
}

/** Continuum group velocity v = k / omega (in units of c). */
export function groupVelocityContinuum(k: number, m: number): number {
  return k / omegaContinuum(k, m);
}

/** Wavenumber of FFT index j on an N-site periodic lattice of spacing a. */
export function kOf(j: number, N: number, a: number): number {
  const jj = j < N / 2 ? j : j - N;
  return (2 * Math.PI * jj) / (N * a);
}

// ---------------------------------------------------------------------------
// Dynamics: velocity Verlet (symplectic, time reversible)
// ---------------------------------------------------------------------------

export function accel(f: TwoField, p: FieldParams): void {
  const N = f.N;
  const inv = 1 / (p.a * p.a);
  const m2 = p.m * p.m;
  const g = p.g;
  const { phiA, phiB, accA, accB } = f;
  for (let y = 0; y < N; y++) {
    const up = ((y + 1) % N) * N;
    const dn = ((y + N - 1) % N) * N;
    const row = y * N;
    for (let x = 0; x < N; x++) {
      const xr = x + 1 === N ? 0 : x + 1;
      const xl = x === 0 ? N - 1 : x - 1;
      const i = row + x;
      const a0 = phiA[i];
      const b0 = phiB[i];
      const lapA = (phiA[row + xr] + phiA[row + xl] + phiA[up + x] + phiA[dn + x] - 4 * a0) * inv;
      const lapB = (phiB[row + xr] + phiB[row + xl] + phiB[up + x] + phiB[dn + x] - 4 * b0) * inv;
      accA[i] = lapA - m2 * a0 - g * (a0 - b0);
      accB[i] = lapB - m2 * b0 - g * (b0 - a0);
    }
  }
  f.accValid = true;
}

/** One velocity-Verlet step of size h for both fields. */
export function step(f: TwoField, p: FieldParams, h: number): void {
  if (!f.accValid) accel(f, p);
  const n = f.N * f.N;
  const hh = 0.5 * h;
  const { phiA, piA, phiB, piB, accA, accB } = f;
  for (let i = 0; i < n; i++) {
    piA[i] += hh * accA[i];
    piB[i] += hh * accB[i];
    phiA[i] += h * piA[i];
    phiB[i] += h * piB[i];
  }
  accel(f, p);
  for (let i = 0; i < n; i++) {
    piA[i] += hh * accA[i];
    piB[i] += hh * accB[i];
  }
}

/** Total lattice energy of both fields including the coupling. */
export function energy(f: TwoField, p: FieldParams): number {
  const N = f.N;
  const inv = 1 / (p.a * p.a);
  const m2 = p.m * p.m;
  const { phiA, piA, phiB, piB } = f;
  let e = 0;
  for (let y = 0; y < N; y++) {
    const up = ((y + 1) % N) * N;
    const row = y * N;
    for (let x = 0; x < N; x++) {
      const xr = x + 1 === N ? 0 : x + 1;
      const i = row + x;
      const a0 = phiA[i];
      const b0 = phiB[i];
      const dax = phiA[row + xr] - a0;
      const day = phiA[up + x] - a0;
      const dbx = phiB[row + xr] - b0;
      const dby = phiB[up + x] - b0;
      const d = a0 - b0;
      e += 0.5 * (piA[i] * piA[i] + piB[i] * piB[i]) + 0.5 * m2 * (a0 * a0 + b0 * b0) + 0.5 * inv * (dax * dax + day * day + dbx * dbx + dby * dby) + 0.5 * p.g * d * d;
    }
  }
  return e * p.a * p.a;
}

/** Energy per field (coupling energy split equally). Returns [EA, EB]. */
export function fieldEnergies(f: TwoField, p: FieldParams, out: Float64Array): Float64Array {
  const N = f.N;
  const inv = 1 / (p.a * p.a);
  const m2 = p.m * p.m;
  const { phiA, piA, phiB, piB } = f;
  let ea = 0;
  let eb = 0;
  for (let y = 0; y < N; y++) {
    const up = ((y + 1) % N) * N;
    const row = y * N;
    for (let x = 0; x < N; x++) {
      const xr = x + 1 === N ? 0 : x + 1;
      const i = row + x;
      const a0 = phiA[i];
      const b0 = phiB[i];
      const dax = phiA[row + xr] - a0;
      const day = phiA[up + x] - a0;
      const dbx = phiB[row + xr] - b0;
      const dby = phiB[up + x] - b0;
      const c = 0.25 * p.g * (a0 - b0) * (a0 - b0);
      ea += 0.5 * piA[i] * piA[i] + 0.5 * m2 * a0 * a0 + 0.5 * inv * (dax * dax + day * day) + c;
      eb += 0.5 * piB[i] * piB[i] + 0.5 * m2 * b0 * b0 + 0.5 * inv * (dbx * dbx + dby * dby) + c;
    }
  }
  out[0] = ea * p.a * p.a;
  out[1] = eb * p.a * p.a;
  return out;
}

/** Energy density of both fields at each site (kinetic + mass + forward-gradient terms). */
export function energyDensity(f: TwoField, p: FieldParams, out: Float64Array): void {
  const N = f.N;
  const inv = 1 / (p.a * p.a);
  const m2 = p.m * p.m;
  const { phiA, piA, phiB, piB } = f;
  for (let y = 0; y < N; y++) {
    const up = ((y + 1) % N) * N;
    const row = y * N;
    for (let x = 0; x < N; x++) {
      const xr = x + 1 === N ? 0 : x + 1;
      const i = row + x;
      const a0 = phiA[i];
      const b0 = phiB[i];
      const dax = phiA[row + xr] - a0;
      const day = phiA[up + x] - a0;
      const dbx = phiB[row + xr] - b0;
      const dby = phiB[up + x] - b0;
      out[i] = 0.5 * (piA[i] * piA[i] + piB[i] * piB[i]) + 0.5 * m2 * (a0 * a0 + b0 * b0) + 0.5 * inv * (dax * dax + day * day + dbx * dbx + dby * dby);
    }
  }
}

/** Site coordinate x_i (centred box: -L/2 .. L/2). */
export const siteX = (i: number, N: number, a: number) => (i - N / 2) * a;

/**
 * Energy-weighted x centroid on the periodic box, unwrapped around a previous
 * estimate so a packet can be tracked around the ring. Two refinement passes.
 */
export function centroidX(e: Float64Array, N: number, a: number, prev: number): number {
  const L = N * a;
  let c = prev;
  for (let pass = 0; pass < 2; pass++) {
    let sw = 0;
    let sx = 0;
    for (let x = 0; x < N; x++) {
      let col = 0;
      for (let y = 0; y < N; y++) col += e[y * N + x];
      let d = siteX(x, N, a) - c;
      d -= L * Math.round(d / L);
      sw += col;
      sx += col * d;
    }
    if (sw <= 0) return prev;
    c += sx / sw;
  }
  return c;
}

// ---------------------------------------------------------------------------
// FFT (radix 2, in place, unnormalised). sign = -1 forward, +1 inverse.
// ---------------------------------------------------------------------------

export function fft1(re: Float64Array, im: Float64Array, n: number, sign: number, off = 0, stride = 1): void {
  // bit reversal
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const ii = off + i * stride;
      const jj = off + j * stride;
      let t = re[ii];
      re[ii] = re[jj];
      re[jj] = t;
      t = im[ii];
      im[ii] = im[jj];
      im[jj] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (sign * 2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k++) {
        const u = off + (i + k) * stride;
        const v = off + (i + k + half) * stride;
        const vr = re[v] * cr - im[v] * ci;
        const vi = re[v] * ci + im[v] * cr;
        re[v] = re[u] - vr;
        im[v] = im[u] - vi;
        re[u] += vr;
        im[u] += vi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/** 2D FFT of an N x N complex array stored row-major (index y*N + x). */
export function fft2(re: Float64Array, im: Float64Array, N: number, sign: number): void {
  for (let y = 0; y < N; y++) fft1(re, im, N, sign, y * N, 1);
  for (let x = 0; x < N; x++) fft1(re, im, N, sign, x, N);
}

export interface Scratch {
  re: Float64Array;
  im: Float64Array;
  re2: Float64Array;
  im2: Float64Array;
}

export function makeScratch(N: number): Scratch {
  const n = N * N;
  return { re: new Float64Array(n), im: new Float64Array(n), re2: new Float64Array(n), im2: new Float64Array(n) };
}

// ---------------------------------------------------------------------------
// Mode analysis: occupation numbers n_k = E_k / (hbar omega_k)
// ---------------------------------------------------------------------------

/**
 * Mode energies of one real field (phi, pi) using the uncoupled lattice
 * dispersion. Adds quanta into histogram bins over |k| (bin width dk, last bin
 * is overflow). Returns the total number of quanta sum_k E_k / (hbar omega_k).
 */
export function modeQuanta(
  phi: Float64Array,
  pi: Float64Array,
  p: FieldParams,
  hbar: number,
  s: Scratch,
  bins?: Float64Array,
  dk = 0.2,
): number {
  const N = p.N;
  const n = N * N;
  s.re.set(phi);
  s.im.fill(0);
  s.re2.set(pi);
  s.im2.fill(0);
  fft2(s.re, s.im, N, -1);
  fft2(s.re2, s.im2, N, -1);
  const norm = (p.a * p.a) / n; // |q_k|^2 = (a/N)^2 |F_k|^2
  let total = 0;
  for (let jy = 0; jy < N; jy++) {
    const ky = kOf(jy, N, p.a);
    for (let jx = 0; jx < N; jx++) {
      const kx = kOf(jx, N, p.a);
      const w = omegaLattice(kx, ky, p.m, p.a);
      if (w < 1e-9) continue;
      const i = jy * N + jx;
      const q2 = (s.re[i] * s.re[i] + s.im[i] * s.im[i]) * norm;
      const p2 = (s.re2[i] * s.re2[i] + s.im2[i] * s.im2[i]) * norm;
      const nq = (0.5 * p2 + 0.5 * w * w * q2) / (hbar * w);
      total += nq;
      if (bins) {
        const b = Math.min(bins.length - 1, Math.floor(Math.hypot(kx, ky) / dk));
        bins[b] += nq;
      }
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Wave packets
// ---------------------------------------------------------------------------

/**
 * Add a right-moving Gaussian wave packet to field A holding `quanta` quanta
 * (in the coherent-state sense, sum_k E_k / hbar omega_k). Built in Fourier
 * space from positive-frequency modes only, so it moves purely along +x.
 * Returns the peak amplitude of phi.
 */
export function addPacket(
  f: TwoField,
  p: FieldParams,
  x0: number,
  y0: number,
  k0: number,
  sigma: number,
  quanta: number,
  hbar: number,
  s: Scratch,
  tmpPhi: Float64Array,
  tmpPi: Float64Array,
  sigmaY = sigma,
): number {
  const N = p.N;
  const L = N * p.a;
  for (let y = 0; y < N; y++) {
    let dy = siteX(y, N, p.a) - y0;
    dy -= L * Math.round(dy / L);
    for (let x = 0; x < N; x++) {
      let dx = siteX(x, N, p.a) - x0;
      dx -= L * Math.round(dx / L);
      const env = Math.exp(-0.5 * ((dx * dx) / (sigma * sigma) + (dy * dy) / (sigmaY * sigmaY)));
      const i = y * N + x;
      s.re[i] = env * Math.cos(k0 * dx);
      s.im[i] = env * Math.sin(k0 * dx);
    }
  }
  fft2(s.re, s.im, N, -1);
  // pi = Re ifft(-i omega C) ; keep the phi spectrum in (re, im)
  for (let jy = 0; jy < N; jy++) {
    const ky = kOf(jy, N, p.a);
    for (let jx = 0; jx < N; jx++) {
      const kx = kOf(jx, N, p.a);
      const w = omegaLattice(kx, ky, p.m, p.a);
      const i = jy * N + jx;
      s.re2[i] = w * s.im[i];
      s.im2[i] = -w * s.re[i];
    }
  }
  fft2(s.re, s.im, N, 1);
  fft2(s.re2, s.im2, N, 1);
  const n = N * N;
  for (let i = 0; i < n; i++) {
    tmpPhi[i] = s.re[i] / n;
    tmpPi[i] = s.re2[i] / n;
  }
  const q = modeQuanta(tmpPhi, tmpPi, p, hbar, s);
  const scale = q > 0 ? Math.sqrt(quanta / q) : 0;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const v = tmpPhi[i] * scale;
    f.phiA[i] += v;
    f.piA[i] += tmpPi[i] * scale;
    peak = Math.max(peak, Math.abs(v));
  }
  f.accValid = false;
  return peak;
}

/** Add a Gaussian bump (at rest) to field A: a pluck. */
export function addPluck(f: TwoField, p: FieldParams, x0: number, y0: number, width: number, amp: number): void {
  const N = p.N;
  const L = N * p.a;
  for (let y = 0; y < N; y++) {
    let dy = siteX(y, N, p.a) - y0;
    dy -= L * Math.round(dy / L);
    for (let x = 0; x < N; x++) {
      let dx = siteX(x, N, p.a) - x0;
      dx -= L * Math.round(dx / L);
      f.phiA[y * N + x] += amp * Math.exp(-0.5 * (dx * dx + dy * dy) / (width * width));
    }
  }
  f.accValid = false;
}

// ---------------------------------------------------------------------------
// Vacuum: every mode in its ground state
// ---------------------------------------------------------------------------

/** Small fast seeded PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal sample by Box-Muller. */
export function gauss(r: () => number): number {
  const u = Math.max(1e-12, r());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

/**
 * Fill out (phi, pi) with one sample of the ground state of a real lattice field
 * whose mode frequencies are omega(kx, ky). Every mode gets <q^2> = hbar / 2 omega
 * and <p^2> = hbar omega / 2. A zero-frequency mode (m = 0, k = 0) is left empty.
 */
function sampleGround(
  outPhi: Float64Array,
  outPi: Float64Array,
  N: number,
  a: number,
  omega: (kx: number, ky: number) => number,
  hbar: number,
  r: () => number,
  s: Scratch,
  kMax: number,
): void {
  const inv2 = Math.SQRT1_2;
  for (let jy = 0; jy < N; jy++) {
    const ky = kOf(jy, N, a);
    for (let jx = 0; jx < N; jx++) {
      const kx = kOf(jx, N, a);
      const w = omega(kx, ky);
      const i = jy * N + jx;
      if (w < 1e-9 || kx * kx + ky * ky > kMax * kMax) {
        s.re[i] = s.im[i] = s.re2[i] = s.im2[i] = 0;
        continue;
      }
      const sq = Math.sqrt(hbar / (2 * w));
      const sp = Math.sqrt((hbar * w) / 2);
      s.re[i] = sq * gauss(r) * inv2;
      s.im[i] = sq * gauss(r) * inv2;
      s.re2[i] = sp * gauss(r) * inv2;
      s.im2[i] = sp * gauss(r) * inv2;
    }
  }
  fft2(s.re, s.im, N, 1);
  fft2(s.re2, s.im2, N, 1);
  // phi = sqrt(2) Re Z, Z = (1 / sqrt(A)) sum_k s_k xi_k e^{ikx}, sqrt(A) = N a
  const c = Math.SQRT2 / (N * a);
  const n = N * N;
  for (let i = 0; i < n; i++) {
    outPhi[i] = c * s.re[i];
    outPi[i] = c * s.re2[i];
  }
}

/**
 * One sample of the exact ground state of the two coupled fields. The coupled
 * normal modes are S = (A + B)/sqrt2 with omega^2 = m^2 + K^2 and
 * D = (A - B)/sqrt2 with omega^2 = m^2 + K^2 + 2g.
 * Modes with |k| > kMax are left in their mean position (a display cutoff).
 */
export function sampleVacuum(f: TwoField, p: FieldParams, hbar: number, r: () => number, s: Scratch, tmp: Float64Array[], kMax = Infinity): void {
  const [sPhi, sPi, dPhi, dPi] = tmp;
  sampleGround(sPhi, sPi, p.N, p.a, (kx, ky) => omegaLattice(kx, ky, p.m, p.a), hbar, r, s, kMax);
  const mD = Math.sqrt(p.m * p.m + 2 * p.g);
  sampleGround(dPhi, dPi, p.N, p.a, (kx, ky) => omegaLattice(kx, ky, mD, p.a), hbar, r, s, kMax);
  const n = p.N * p.N;
  const h = Math.SQRT1_2;
  for (let i = 0; i < n; i++) {
    f.phiA[i] = h * (sPhi[i] + dPhi[i]);
    f.phiB[i] = h * (sPhi[i] - dPhi[i]);
    f.piA[i] = h * (sPi[i] + dPi[i]);
    f.piB[i] = h * (sPi[i] - dPi[i]);
  }
  f.accValid = false;
}

/** Real cosine-mode coordinate q_c = sqrt(2/A) a^2 sum_n phi_n cos(k . x_n). */
export function cosModeCoord(phi: Float64Array, N: number, a: number, jx: number, jy: number): number {
  const kx = kOf(jx, N, a);
  const ky = kOf(jy, N, a);
  let sum = 0;
  for (let y = 0; y < N; y++) {
    const yy = siteX(y, N, a);
    for (let x = 0; x < N; x++) sum += phi[y * N + x] * Math.cos(kx * siteX(x, N, a) + ky * yy);
  }
  return Math.sqrt(2) * a * a * sum / (N * a);
}

/** Dynamical matrix D (n x n, row-major) with phi'' = -D phi for one field of an N x N periodic lattice. */
export function dynamicalMatrix(N: number, a: number, m: number): Float64Array {
  const n = N * N;
  const D = new Float64Array(n * n);
  const inv = 1 / (a * a);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      D[i * n + i] += m * m + 4 * inv;
      const nb = [y * N + ((x + 1) % N), y * N + ((x + N - 1) % N), ((y + 1) % N) * N + x, ((y + N - 1) % N) * N + x];
      for (const j of nb) D[i * n + j] -= inv;
    }
  }
  return D;
}

/** Eigenvalues of a real symmetric matrix by cyclic Jacobi rotations. Destroys A. */
export function symmetricEigenvalues(A: Float64Array, n: number, sweeps = 60): Float64Array {
  for (let sweep = 0; sweep < sweeps; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p * n + q] * A[p * n + q];
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = A[p * n + q];
        if (Math.abs(apq) < 1e-15) continue;
        const app = A[p * n + p];
        const aqq = A[q * n + q];
        const theta = (aqq - app) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
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
      }
    }
  }
  const ev = new Float64Array(n);
  for (let i = 0; i < n; i++) ev[i] = A[i * n + i];
  return ev;
}
