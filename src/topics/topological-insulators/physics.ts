// Topological band theory: the SSH chain, the Qi–Wu–Zhang Chern insulator,
// and small dense eigen solvers. Pure math, no DOM.

// ---------------------------------------------------------------------------
// Dense symmetric eigen solvers. Matrices are flat row-major Float64Arrays.
// Eigenvectors are stored column-wise: V[i * n + j] is component i of vector j.
// ---------------------------------------------------------------------------

export interface Eigen {
  n: number;
  values: Float64Array;
  vectors: Float64Array;
}

/** Cyclic Jacobi rotations. Slow but simple and very accurate. Used to cross-check. */
export function jacobiEigen(Ain: Float64Array, n: number, maxSweeps = 100): Eigen {
  const a = Float64Array.from(Ain);
  const V = new Float64Array(n * n);
  for (let i = 0; i < n; i++) V[i * n + i] = 1;
  let norm = 0;
  for (let i = 0; i < n * n; i++) norm += a[i] * a[i];
  norm = Math.sqrt(norm);
  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p * n + q] * a[p * n + q];
    if (Math.sqrt(off) <= 1e-17 * norm || off === 0) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p * n + q];
        if (Math.abs(apq) < 1e-300) continue;
        const theta = (a[q * n + q] - a[p * n + p]) / (2 * apq);
        const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k * n + p];
          const akq = a[k * n + q];
          a[k * n + p] = c * akp - s * akq;
          a[k * n + q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p * n + k];
          const aqk = a[q * n + k];
          a[p * n + k] = c * apk - s * aqk;
          a[q * n + k] = s * apk + c * aqk;
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
  // sort ascending
  const idx = Array.from({ length: n }, (_, i) => i).sort((i, j) => a[i * n + i] - a[j * n + j]);
  const values = new Float64Array(n);
  const vectors = new Float64Array(n * n);
  idx.forEach((src, dst) => {
    values[dst] = a[src * n + src];
    for (let k = 0; k < n; k++) vectors[k * n + dst] = V[k * n + src];
  });
  return { n, values, vectors };
}

const hyp = (a: number, b: number): number => {
  const x = Math.abs(a);
  const y = Math.abs(b);
  if (x > y) { const r = y / x; return x * Math.sqrt(1 + r * r); }
  if (y === 0) return 0;
  const r = x / y;
  return y * Math.sqrt(1 + r * r);
};

/**
 * Householder tridiagonalisation plus implicit QL (the EISPACK tred2/tql2 pair).
 * Holds its own workspace so repeated solves of the same size allocate nothing.
 */
export class SymEigen implements Eigen {
  readonly values: Float64Array;
  readonly vectors: Float64Array;
  private readonly e: Float64Array;
  readonly n: number;
  constructor(n: number) {
    this.n = n;
    this.values = new Float64Array(n);
    this.vectors = new Float64Array(n * n);
    this.e = new Float64Array(n);
  }

  solve(A: Float64Array): this {
    this.vectors.set(A.subarray(0, this.n * this.n));
    this.tred2();
    this.tql2();
    return this;
  }

  private tred2(): void {
    const n = this.n, V = this.vectors, d = this.values, e = this.e;
    for (let j = 0; j < n; j++) d[j] = V[(n - 1) * n + j];
    for (let i = n - 1; i > 0; i--) {
      let scale = 0;
      let h = 0;
      for (let k = 0; k < i; k++) scale += Math.abs(d[k]);
      if (scale === 0) {
        e[i] = d[i - 1];
        for (let j = 0; j < i; j++) {
          d[j] = V[(i - 1) * n + j];
          V[i * n + j] = 0;
          V[j * n + i] = 0;
        }
      } else {
        for (let k = 0; k < i; k++) { d[k] /= scale; h += d[k] * d[k]; }
        let f = d[i - 1];
        let g = Math.sqrt(h);
        if (f > 0) g = -g;
        e[i] = scale * g;
        h -= f * g;
        d[i - 1] = f - g;
        for (let j = 0; j < i; j++) e[j] = 0;
        for (let j = 0; j < i; j++) {
          f = d[j];
          V[j * n + i] = f;
          g = e[j] + V[j * n + j] * f;
          for (let k = j + 1; k <= i - 1; k++) {
            g += V[k * n + j] * d[k];
            e[k] += V[k * n + j] * f;
          }
          e[j] = g;
        }
        f = 0;
        for (let j = 0; j < i; j++) { e[j] /= h; f += e[j] * d[j]; }
        const hh = f / (h + h);
        for (let j = 0; j < i; j++) e[j] -= hh * d[j];
        for (let j = 0; j < i; j++) {
          f = d[j];
          g = e[j];
          for (let k = j; k <= i - 1; k++) V[k * n + j] -= f * e[k] + g * d[k];
          d[j] = V[(i - 1) * n + j];
          V[i * n + j] = 0;
        }
      }
      d[i] = h;
    }
    for (let i = 0; i < n - 1; i++) {
      V[(n - 1) * n + i] = V[i * n + i];
      V[i * n + i] = 1;
      const h = d[i + 1];
      if (h !== 0) {
        for (let k = 0; k <= i; k++) d[k] = V[k * n + i + 1] / h;
        for (let j = 0; j <= i; j++) {
          let g = 0;
          for (let k = 0; k <= i; k++) g += V[k * n + i + 1] * V[k * n + j];
          for (let k = 0; k <= i; k++) V[k * n + j] -= g * d[k];
        }
      }
      for (let k = 0; k <= i; k++) V[k * n + i + 1] = 0;
    }
    for (let j = 0; j < n; j++) { d[j] = V[(n - 1) * n + j]; V[(n - 1) * n + j] = 0; }
    V[(n - 1) * n + n - 1] = 1;
    e[0] = 0;
  }

  private tql2(): void {
    const n = this.n, V = this.vectors, d = this.values, e = this.e;
    for (let i = 1; i < n; i++) e[i - 1] = e[i];
    e[n - 1] = 0;
    let f = 0;
    let tst1 = 0;
    const eps = 2 ** -52;
    for (let l = 0; l < n; l++) {
      tst1 = Math.max(tst1, Math.abs(d[l]) + Math.abs(e[l]));
      let m = l;
      while (m < n) {
        if (Math.abs(e[m]) <= eps * tst1) break;
        m++;
      }
      if (m > l) {
        let iter = 0;
        do {
          iter++;
          let g = d[l];
          let p = (d[l + 1] - g) / (2 * e[l]);
          let r = hyp(p, 1);
          if (p < 0) r = -r;
          d[l] = e[l] / (p + r);
          d[l + 1] = e[l] * (p + r);
          const dl1 = d[l + 1];
          let h = g - d[l];
          for (let i = l + 2; i < n; i++) d[i] -= h;
          f += h;
          p = d[m];
          let c = 1, c2 = 1, c3 = 1;
          const el1 = e[l + 1];
          let s = 0, s2 = 0;
          for (let i = m - 1; i >= l; i--) {
            c3 = c2;
            c2 = c;
            s2 = s;
            g = c * e[i];
            h = c * p;
            r = hyp(p, e[i]);
            e[i + 1] = s * r;
            s = e[i] / r;
            c = p / r;
            p = c * d[i] - s * g;
            d[i + 1] = h + s * (c * g + s * d[i]);
            for (let k = 0; k < n; k++) {
              h = V[k * n + i + 1];
              V[k * n + i + 1] = s * V[k * n + i] + c * h;
              V[k * n + i] = c * V[k * n + i] - s * h;
            }
          }
          p = (-s * s2 * c3 * el1 * e[l]) / dl1;
          e[l] = s * p;
          d[l] = c * p;
        } while (Math.abs(e[l]) > eps * tst1 && iter < 60);
      }
      d[l] += f;
      e[l] = 0;
    }
    for (let i = 0; i < n - 1; i++) {
      let k = i;
      let p = d[i];
      for (let j = i + 1; j < n; j++) if (d[j] < p) { k = j; p = d[j]; }
      if (k !== i) {
        d[k] = d[i];
        d[i] = p;
        for (let j = 0; j < n; j++) {
          p = V[j * n + i];
          V[j * n + i] = V[j * n + k];
          V[j * n + k] = p;
        }
      }
    }
  }
}

/** Largest |A v - λ v| over all eigenpairs: an accuracy check for either solver. */
export function eigenResidual(A: Float64Array, eg: Eigen): number {
  const n = eg.n;
  let worst = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += A[i * n + k] * eg.vectors[k * n + j];
      worst = Math.max(worst, Math.abs(s - eg.values[j] * eg.vectors[i * n + j]));
    }
  }
  return worst;
}

// ---------------------------------------------------------------------------
// Small seeded random numbers, so a disorder pattern is repeatable.
// ---------------------------------------------------------------------------

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

/** Fill out[] with uniform numbers in [-1, 1]. */
export function randomUnit(seed: number, out: Float64Array): Float64Array {
  const r = mulberry32(seed);
  for (let i = 0; i < out.length; i++) out[i] = 2 * r() - 1;
  return out;
}

// ---------------------------------------------------------------------------
// SSH chain. Cell n holds sites A_n, B_n. Intra-cell hopping v, inter-cell w.
// ---------------------------------------------------------------------------

/** Upper band energy |v + w e^{ik}| of the infinite chain. The lower band is its negative. */
export function sshEnergy(v: number, w: number, k: number): number {
  return Math.sqrt(Math.max(0, v * v + w * w + 2 * v * w * Math.cos(k)));
}

/** d(k) = (v + w cos k, w sin k). */
export function sshD(v: number, w: number, k: number): [number, number] {
  return [v + w * Math.cos(k), w * Math.sin(k)];
}

/** Bulk gap from a dense k scan: min over k of 2|d(k)|. Analytically 2|v - w|. */
export function sshGap(v: number, w: number, nk = 4001): number {
  let m = Infinity;
  for (let i = 0; i < nk; i++) {
    const k = -Math.PI + (2 * Math.PI * i) / (nk - 1);
    m = Math.min(m, 2 * sshEnergy(v, w, k));
  }
  return m;
}

/**
 * Winding number of d(k) around the origin, found by adding up the change in
 * arg d(k) around the Brillouin zone. Returns the raw (unrounded) value.
 */
export function sshWindingRaw(v: number, w: number, nk = 720): number {
  let total = 0;
  let [x, y] = sshD(v, w, -Math.PI);
  let prev = Math.atan2(y, x);
  for (let i = 1; i <= nk; i++) {
    [x, y] = sshD(v, w, -Math.PI + (2 * Math.PI * i) / nk);
    const a = Math.atan2(y, x);
    let da = a - prev;
    if (da > Math.PI) da -= 2 * Math.PI;
    if (da < -Math.PI) da += 2 * Math.PI;
    total += da;
    prev = a;
  }
  return total / (2 * Math.PI);
}

export const sshWinding = (v: number, w: number): number => Math.round(sshWindingRaw(v, w));

/**
 * Dense Hamiltonian of an open chain of N cells (2N sites, ending on intra-cell bonds).
 * Bond disorder multiplies each hopping by (1 + δ r), r in [-1, 1]. This keeps the
 * chiral (sublattice) symmetry that protects the zero modes.
 */
export function sshChainMatrix(N: number, v: number, w: number, delta = 0, noise?: Float64Array, out?: Float64Array): Float64Array {
  const n = 2 * N;
  const H = out && out.length >= n * n ? out : new Float64Array(n * n);
  H.fill(0, 0, n * n);
  for (let b = 0; b < n - 1; b++) {
    const t0 = b % 2 === 0 ? v : w;
    const t = t0 * (1 + delta * (noise ? noise[b % noise.length] : 0));
    H[b * n + b + 1] = t;
    H[(b + 1) * n + b] = t;
  }
  return H;
}

export interface ChainSpectrum {
  /** Sorted eigenvalues. */
  values: Float64Array;
  /** Smallest |E|. */
  edgeE: number;
  /** Indices of the two eigenvalues closest to zero. */
  i0: number;
  i1: number;
  /** Mean density of those two states on each site (sums to 1). */
  density: Float64Array;
  /** Fraction of that density on the outer two cells at each end. */
  edgeWeight: number;
  /** Fraction of that density on the A sublattice in the left half. */
  leftA: number;
}

/** Diagonalise the finite chain and extract the two states nearest E = 0. */
export function sshChainSpectrum(H: Float64Array, N: number, solver?: SymEigen): ChainSpectrum {
  const n = 2 * N;
  const eg = (solver && solver.n === n ? solver : new SymEigen(n)).solve(H);
  const d = eg.values;
  // chiral symmetry makes the spectrum ±symmetric: the two middle levels are closest to 0
  let i0 = 0;
  let best = Infinity;
  for (let i = 0; i < n; i++) if (Math.abs(d[i]) < best) { best = Math.abs(d[i]); i0 = i; }
  let i1 = -1;
  best = Infinity;
  for (let i = 0; i < n; i++) if (i !== i0 && Math.abs(d[i]) < best) { best = Math.abs(d[i]); i1 = i; }
  const density = new Float64Array(n);
  for (let s = 0; s < n; s++) {
    const a = eg.vectors[s * n + i0];
    const b = eg.vectors[s * n + i1];
    density[s] = 0.5 * (a * a + b * b);
  }
  let edge = 0;
  let leftA = 0;
  const m = Math.min(2, Math.floor(N / 2));
  for (let s = 0; s < n; s++) {
    if (s < 2 * m || s >= n - 2 * m) edge += density[s];
    if (s < N && s % 2 === 0) leftA += density[s];
  }
  return {
    values: Float64Array.from(d),
    edgeE: Math.min(Math.abs(d[i0]), Math.abs(d[i1])),
    i0,
    i1,
    density,
    edgeWeight: edge,
    leftA,
  };
}

// ---------------------------------------------------------------------------
// Qi–Wu–Zhang model: H(k) = sin kx σx + sin ky σy + (u + cos kx + cos ky) σz
// ---------------------------------------------------------------------------

export function qwzD(kx: number, ky: number, u: number, out: Float64Array | number[]): void {
  out[0] = Math.sin(kx);
  out[1] = Math.sin(ky);
  out[2] = u + Math.cos(kx) + Math.cos(ky);
}

/** Bulk gap 2 min|d(k)| from a grid that contains the four high-symmetry points. */
export function qwzGap(u: number, n = 64): number {
  let m = Infinity;
  const d = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      qwzD(-Math.PI + (2 * Math.PI * i) / n, -Math.PI + (2 * Math.PI * j) / n, u, d);
      m = Math.min(m, Math.hypot(d[0], d[1], d[2]));
    }
  }
  return 2 * m;
}

/**
 * Chern number of the lower QWZ band by the Fukui–Hatsugai–Suzuki lattice method.
 * Returns the raw sum of plaquette Berry fluxes divided by 2π. For a gapped model it
 * is an exact integer (to rounding error) even on a coarse grid.
 */
export function chernFHS(u: number, N = 24): number {
  const ar = new Float64Array(N * N), ai = new Float64Array(N * N);
  const br = new Float64Array(N * N), bi = new Float64Array(N * N);
  const d = [0, 0, 0];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      qwzD((2 * Math.PI * i) / N, (2 * Math.PI * j) / N, u, d);
      const [dx, dy, dz] = d;
      const D = Math.hypot(dx, dy, dz);
      // eigenvector of eigenvalue -D. Two gauges, keep the one with larger norm.
      // gauge 1: (-(dx - i dy), dz + D)   gauge 2: (D - dz, -(dx + i dy))
      let xr: number, xi: number, yr: number, yi: number;
      if (dz + D > D - dz) { xr = -dx; xi = dy; yr = dz + D; yi = 0; }
      else { xr = D - dz; xi = 0; yr = -dx; yi = -dy; }
      const nn = Math.hypot(xr, xi, yr, yi) || 1;
      const q = i * N + j;
      ar[q] = xr / nn; ai[q] = xi / nn; br[q] = yr / nn; bi[q] = yi / nn;
    }
  }
  // <p|q> = conj(p)·q
  const link = (p: number, q: number, out: number[]) => {
    const re = ar[p] * ar[q] + ai[p] * ai[q] + br[p] * br[q] + bi[p] * bi[q];
    const im = ar[p] * ai[q] - ai[p] * ar[q] + br[p] * bi[q] - bi[p] * br[q];
    const m = Math.hypot(re, im) || 1;
    out[0] = re / m;
    out[1] = im / m;
  };
  const u1 = [0, 0], u2 = [0, 0], u3 = [0, 0], u4 = [0, 0];
  let total = 0;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const p00 = i * N + j;
      const p10 = ((i + 1) % N) * N + j;
      const p11 = ((i + 1) % N) * N + ((j + 1) % N);
      const p01 = i * N + ((j + 1) % N);
      link(p00, p10, u1); // U_x(k)
      link(p10, p11, u2); // U_y(k + x)
      link(p01, p11, u3); // U_x(k + y)
      link(p00, p01, u4); // U_y(k)
      // F = arg( U1 U2 conj(U3) conj(U4) )
      let re = u1[0] * u2[0] - u1[1] * u2[1];
      let im = u1[0] * u2[1] + u1[1] * u2[0];
      let r2 = re * u3[0] + im * u3[1];
      let i2 = im * u3[0] - re * u3[1];
      re = r2 * u4[0] + i2 * u4[1];
      im = i2 * u4[0] - r2 * u4[1];
      total += Math.atan2(im, re);
    }
  }
  return total / (2 * Math.PI);
}

/**
 * Independent check: the degree of the map k -> d/|d| from the torus to the sphere,
 * as a sum of signed solid angles of grid triangles, divided by 4π.
 */
export function qwzSkyrmion(u: number, N = 48): number {
  const pts = new Float64Array(N * N * 3);
  const d = [0, 0, 0];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      qwzD((2 * Math.PI * i) / N, (2 * Math.PI * j) / N, u, d);
      const m = Math.hypot(d[0], d[1], d[2]);
      const q = 3 * (i * N + j);
      pts[q] = d[0] / m; pts[q + 1] = d[1] / m; pts[q + 2] = d[2] / m;
    }
  }
  const tri = (a: number, b: number, c: number) => {
    const ax = pts[3 * a], ay = pts[3 * a + 1], az = pts[3 * a + 2];
    const bx = pts[3 * b], by = pts[3 * b + 1], bz = pts[3 * b + 2];
    const cx = pts[3 * c], cy = pts[3 * c + 1], cz = pts[3 * c + 2];
    const triple = ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
    const den = 1 + ax * bx + ay * by + az * bz + bx * cx + by * cy + bz * cz + cx * ax + cy * ay + cz * az;
    return 2 * Math.atan2(triple, den);
  };
  let total = 0;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const p00 = i * N + j;
      const p10 = ((i + 1) % N) * N + j;
      const p11 = ((i + 1) % N) * N + ((j + 1) % N);
      const p01 = i * N + ((j + 1) % N);
      total += tri(p00, p10, p11) + tri(p00, p11, p01);
    }
  }
  return total / (4 * Math.PI);
}

/**
 * QWZ ribbon: periodic along x (momentum kx), W rows along y with open edges.
 * In the orbital basis the inter-row hopping T = (σz - iσy)/2 is real, so the
 * whole Hamiltonian is a real symmetric 2W × 2W matrix.
 */
export class QWZRibbon {
  readonly n: number;
  /** energies[ik * n + s], ascending in s */
  readonly energies: Float64Array;
  /** weight on the first 3 rows (left edge, y = 0) */
  readonly wL: Float64Array;
  /** weight on the last 3 rows (right edge, y = W - 1) */
  readonly wR: Float64Array;
  /** mean row position, 0..1 */
  readonly pos: Float64Array;
  readonly kx: Float64Array;
  private readonly H: Float64Array;
  private readonly solver: SymEigen;

  readonly W: number;
  readonly nk: number;
  constructor(W: number, nk: number) {
    this.W = W;
    this.nk = nk;
    this.n = 2 * W;
    this.energies = new Float64Array(nk * this.n);
    this.wL = new Float64Array(nk * this.n);
    this.wR = new Float64Array(nk * this.n);
    this.pos = new Float64Array(nk * this.n);
    this.kx = new Float64Array(nk);
    for (let i = 0; i < nk; i++) this.kx[i] = -Math.PI + (2 * Math.PI * i) / (nk - 1);
    this.H = new Float64Array(this.n * this.n);
    this.solver = new SymEigen(this.n);
  }

  /** Fill H for one kx. onsite[y] is an optional scalar potential per row. */
  matrix(kx: number, u: number, onsite?: Float64Array): Float64Array {
    const { n, W, H } = this;
    H.fill(0);
    const mz = u + Math.cos(kx);
    const sx = Math.sin(kx);
    for (let y = 0; y < W; y++) {
      const a = 2 * y, b = a + 1;
      const V = onsite ? onsite[y] : 0;
      H[a * n + a] = mz + V;
      H[b * n + b] = -mz + V;
      H[a * n + b] = sx;
      H[b * n + a] = sx;
      if (y < W - 1) {
        const c = a + 2, e = a + 3;
        // block H[y, y+1] = T = [[1/2, -1/2], [1/2, -1/2]], block H[y+1, y] = Tᵀ
        H[a * n + c] = 0.5; H[a * n + e] = -0.5;
        H[b * n + c] = 0.5; H[b * n + e] = -0.5;
        H[c * n + a] = 0.5; H[e * n + a] = -0.5;
        H[c * n + b] = 0.5; H[e * n + b] = -0.5;
      }
    }
    return H;
  }

  compute(u: number, onsite?: Float64Array): this {
    const { n, W, nk } = this;
    const edgeRows = 3;
    for (let ik = 0; ik < nk; ik++) {
      const eg = this.solver.solve(this.matrix(this.kx[ik], u, onsite));
      for (let s = 0; s < n; s++) {
        let l = 0, r = 0, m = 0;
        for (let y = 0; y < W; y++) {
          const p = eg.vectors[2 * y * n + s] ** 2 + eg.vectors[(2 * y + 1) * n + s] ** 2;
          if (y < edgeRows) l += p;
          if (y >= W - edgeRows) r += p;
          m += p * y;
        }
        const q = ik * n + s;
        this.energies[q] = eg.values[s];
        this.wL[q] = l;
        this.wR[q] = r;
        this.pos[q] = m / (W - 1);
      }
    }
    return this;
  }

  /**
   * Edge states inside the bulk gap: count of kx points with an in-gap state on each
   * edge, and the sign of each edge's group velocity dE/dkx (+1, -1, or 0 if none).
   */
  edgeSummary(gap: number): { nL: number; nR: number; velL: number; velR: number } {
    const { n, nk } = this;
    const lim = 0.4 * gap;
    let nL = 0, nR = 0, dL = 0, dR = 0;
    let prevL = NaN, prevR = NaN;
    for (let ik = 0; ik < nk; ik++) {
      let eL = NaN, eR = NaN;
      for (let s = 0; s < n; s++) {
        const q = ik * n + s;
        const E = this.energies[q];
        if (Math.abs(E) > lim) continue;
        if (this.wL[q] > 0.5 && !(Math.abs(E) >= Math.abs(eL))) eL = E;
        if (this.wR[q] > 0.5 && !(Math.abs(E) >= Math.abs(eR))) eR = E;
      }
      if (!Number.isNaN(eL)) { nL++; if (!Number.isNaN(prevL)) dL += eL - prevL; }
      if (!Number.isNaN(eR)) { nR++; if (!Number.isNaN(prevR)) dR += eR - prevR; }
      prevL = eL;
      prevR = eR;
    }
    return { nL, nR, velL: nL > 1 ? Math.sign(dL) : 0, velR: nR > 1 ? Math.sign(dR) : 0 };
  }
}
