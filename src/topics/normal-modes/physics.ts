// Normal modes of a fixed-end mass-spring chain and of a square lattice drumhead.
// Pure math: no DOM, no Three.js. Units: mass m = 1, spring constant chosen so that
// sqrt(k/m) = omega0. Displacements are dimensionless.

/** Result of a symmetric eigen-decomposition. `vectors[k]` is the unit eigenvector for `values[k]`. */
export interface Eigen {
  values: Float64Array;
  vectors: Float64Array[];
  sweeps: number;
}

/**
 * Cyclic Jacobi eigenvalue algorithm for a real symmetric n×n matrix (row-major).
 * Repeated plane rotations zero the off-diagonal entries. Eigenvalues come back in
 * ascending order and each eigenvector is flipped so its first non-negligible entry is positive.
 */
export function jacobiEigen(matrix: ArrayLike<number>, n: number, tol = 1e-14, maxSweeps = 100): Eigen {
  const a = Float64Array.from(matrix as ArrayLike<number>);
  const v = new Float64Array(n * n);
  for (let i = 0; i < n; i++) v[i * n + i] = 1;
  let scale = 0;
  for (let i = 0; i < n * n; i++) scale += a[i] * a[i];
  scale = Math.sqrt(scale) || 1;
  let sweeps = 0;
  for (; sweeps < maxSweeps; sweeps++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p * n + q] * a[p * n + q];
    if (Math.sqrt(off) <= tol * scale) break;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p * n + q];
        if (Math.abs(apq) < 1e-300) continue;
        const app = a[p * n + p];
        const aqq = a[q * n + q];
        const theta = (aqq - app) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
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
          const vkp = v[k * n + p];
          const vkq = v[k * n + q];
          v[k * n + p] = c * vkp - s * vkq;
          v[k * n + q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => a[i * n + i] - a[j * n + j]);
  const values = new Float64Array(n);
  const vectors: Float64Array[] = [];
  order.forEach((col, k) => {
    values[k] = a[col * n + col];
    const vec = new Float64Array(n);
    for (let r = 0; r < n; r++) vec[r] = v[r * n + col];
    let lead = 0;
    for (let r = 0; r < n; r++) {
      if (Math.abs(vec[r]) > 1e-9) {
        lead = vec[r];
        break;
      }
    }
    if (lead < 0) for (let r = 0; r < n; r++) vec[r] = -vec[r];
    vectors.push(vec);
  });
  return { values, vectors, sweeps };
}

/** Stiffness matrix K/m (row-major) of N equal masses between fixed walls: omega0² · tridiag(−1, 2, −1). */
export function chainStiffness(N: number, omega0: number): Float64Array {
  const K = new Float64Array(N * N);
  const w2 = omega0 * omega0;
  for (let i = 0; i < N; i++) {
    K[i * N + i] = 2 * w2;
    if (i > 0) K[i * N + i - 1] = -w2;
    if (i < N - 1) K[i * N + i + 1] = -w2;
  }
  return K;
}

/** Analytic angular frequency of chain mode k (1-based): 2 ω0 sin(kπ / (2(N+1))). */
export function chainOmega(k: number, N: number, omega0: number): number {
  return 2 * omega0 * Math.sin((k * Math.PI) / (2 * (N + 1)));
}

/** Analytic normalised mode shape: sqrt(2/(N+1)) sin(j k π/(N+1)) for masses j = 1..N. */
export function chainShape(k: number, N: number): Float64Array {
  const out = new Float64Array(N);
  const c = Math.sqrt(2 / (N + 1));
  for (let j = 1; j <= N; j++) out[j - 1] = c * Math.sin((j * k * Math.PI) / (N + 1));
  return out;
}

/** Numerical normal modes of the chain from the Jacobi solver. */
export interface ChainModes {
  N: number;
  omega0: number;
  /** Angular frequency of mode k at index k−1. */
  omega: Float64Array;
  /** Unit mode shapes, shapes[k−1][j−1]. */
  shapes: Float64Array[];
}

export function chainModes(N: number, omega0: number): ChainModes {
  const e = jacobiEigen(chainStiffness(N, omega0), N);
  const omega = new Float64Array(N);
  for (let k = 0; k < N; k++) omega[k] = Math.sqrt(Math.max(0, e.values[k]));
  return { N, omega0, omega, shapes: e.vectors };
}

/** Project a displacement (or velocity) vector onto the modes: q_k = Σ_j φ_k[j] x_j. */
export function project(x: ArrayLike<number>, shapes: Float64Array[], out: Float64Array): Float64Array {
  const N = shapes.length;
  for (let k = 0; k < N; k++) {
    const s = shapes[k];
    let acc = 0;
    for (let j = 0; j < N; j++) acc += s[j] * x[j];
    out[k] = acc;
  }
  return out;
}

/** Rebuild a displacement from modal amplitudes: x_j = Σ_k q_k φ_k[j]. */
export function reconstruct(q: ArrayLike<number>, shapes: Float64Array[], out: Float64Array): Float64Array {
  const N = shapes.length;
  out.fill(0, 0, N);
  for (let k = 0; k < N; k++) {
    const s = shapes[k];
    const qk = q[k];
    for (let j = 0; j < N; j++) out[j] += qk * s[j];
  }
  return out;
}

/**
 * Energy in each mode, E_k = ½(p_k² + ω_k² q_k²), with q and p the projections of x and v.
 * Scratch arrays q and p must have length ≥ N.
 */
export function modeEnergies(x: ArrayLike<number>, v: ArrayLike<number>, modes: ChainModes, q: Float64Array, p: Float64Array, out: Float64Array): Float64Array {
  project(x, modes.shapes, q);
  project(v, modes.shapes, p);
  for (let k = 0; k < modes.N; k++) {
    const w = modes.omega[k];
    out[k] = 0.5 * (p[k] * p[k] + w * w * q[k] * q[k]);
  }
  return out;
}

export interface ChainParams {
  N: number;
  omega0: number;
  /** Velocity damping rate γ (1/s): a_j gets −γ v_j. */
  gamma: number;
  /** FPU-β quartic spring coefficient. Zero gives the linear chain. */
  beta: number;
}

/** Accelerations of every mass. Bonds run from the left wall (x=0) through the masses to the right wall. */
export function chainAccel(x: Float64Array, p: ChainParams, out: Float64Array): Float64Array {
  const N = p.N;
  const w2 = p.omega0 * p.omega0;
  const b = p.beta;
  let dl = x[0]; // stretch of the bond to the left of mass 0
  let fl = dl + b * dl * dl * dl;
  for (let j = 0; j < N; j++) {
    const dr = (j + 1 < N ? x[j + 1] : 0) - x[j];
    const fr = dr + b * dr * dr * dr;
    out[j] = w2 * (fr - fl);
    fl = fr;
  }
  return out;
}

/** Total energy: kinetic plus spring energy ω0² Σ (½ d² + ¼ β d⁴) over all N+1 bonds. */
export function chainEnergy(x: Float64Array, v: Float64Array, p: ChainParams): number {
  const N = p.N;
  let ke = 0;
  for (let j = 0; j < N; j++) ke += 0.5 * v[j] * v[j];
  let pe = 0;
  for (let j = 0; j <= N; j++) {
    const d = (j < N ? x[j] : 0) - (j > 0 ? x[j - 1] : 0);
    pe += 0.5 * d * d + 0.25 * p.beta * d * d * d * d;
  }
  return ke + p.omega0 * p.omega0 * pe;
}

/**
 * One step of velocity Verlet, with damping applied as an exact factor e^(−γh/2) around each
 * half kick (Strang splitting). Without damping it is symplectic, so energy does not drift.
 * `acc` must hold the acceleration at the current x on entry and holds the new one on exit.
 */
export function chainStep(x: Float64Array, v: Float64Array, acc: Float64Array, p: ChainParams, h: number): void {
  const N = p.N;
  const d = p.gamma > 0 ? Math.exp(-0.5 * p.gamma * h) : 1;
  for (let j = 0; j < N; j++) {
    v[j] = v[j] * d + 0.5 * h * acc[j];
    x[j] += h * v[j];
  }
  chainAccel(x, p, acc);
  for (let j = 0; j < N; j++) v[j] = (v[j] + 0.5 * h * acc[j]) * d;
}

// ---------------------------------------------------------------------------
// Pluck shapes
// ---------------------------------------------------------------------------

export type PluckPreset = 'centre' | 'quarter' | 'single' | 'bump' | 'random';

/** Triangle with its peak (height amp) at mass index `at` (0-based), falling linearly to the walls. */
export function trianglePluck(N: number, at: number, amp: number, out: Float64Array): Float64Array {
  const pos = at + 1; // wall at 0 and N+1
  for (let j = 1; j <= N; j++) out[j - 1] = j <= pos ? (amp * j) / pos : (amp * (N + 1 - j)) / (N + 1 - pos);
  return out;
}

/** Fill `out` with one of the preset starting shapes, peak magnitude amp. `seed` drives the random preset. */
export function presetShape(preset: PluckPreset, N: number, amp: number, out: Float64Array, seed = 1): Float64Array {
  out.fill(0, 0, N);
  if (preset === 'centre') return trianglePluck(N, Math.floor((N - 1) / 2), amp, out);
  if (preset === 'quarter') return trianglePluck(N, Math.max(0, Math.round((N + 1) / 4) - 1), amp, out);
  if (preset === 'single') {
    out[Math.floor((N - 1) / 2)] = amp;
    return out;
  }
  if (preset === 'bump') {
    const c = (N + 1) * 0.3;
    const w = Math.max(0.8, (N + 1) * 0.08);
    for (let j = 1; j <= N; j++) out[j - 1] = amp * Math.exp(-((j - c) ** 2) / (2 * w * w));
    return out;
  }
  let s = seed >>> 0 || 1;
  let peak = 0;
  for (let j = 0; j < N; j++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    out[j] = s / 4294967296 - 0.5;
    peak = Math.max(peak, Math.abs(out[j]));
  }
  for (let j = 0; j < N; j++) out[j] *= amp / (peak || 1);
  return out;
}

// ---------------------------------------------------------------------------
// Square drumhead: an M×M lattice of masses with fixed edges
// ---------------------------------------------------------------------------

/** Lattice mode frequency: ω_mn = 2 ω0 sqrt(sin²(mπ/(2(M+1))) + sin²(nπ/(2(M+1)))). */
export function drumOmega(m: number, n: number, M: number, omega0: number): number {
  const a = Math.sin((m * Math.PI) / (2 * (M + 1)));
  const b = Math.sin((n * Math.PI) / (2 * (M + 1)));
  return 2 * omega0 * Math.sqrt(a * a + b * b);
}

/** Continuum membrane ratio ω_mn / ω_11 = sqrt((m² + n²)/2). */
export function drumRatioContinuum(m: number, n: number): number {
  return Math.sqrt((m * m + n * n) / 2);
}

/** 2D lattice stiffness (row-major, size M²×M²) for the drum, index = i·M + j. */
export function drumStiffness(M: number, omega0: number): Float64Array {
  const S = M * M;
  const K = new Float64Array(S * S);
  const w2 = omega0 * omega0;
  for (let i = 0; i < M; i++) {
    for (let j = 0; j < M; j++) {
      const r = i * M + j;
      K[r * S + r] = 4 * w2;
      if (i > 0) K[r * S + r - M] = -w2;
      if (i < M - 1) K[r * S + r + M] = -w2;
      if (j > 0) K[r * S + r - 1] = -w2;
      if (j < M - 1) K[r * S + r + 1] = -w2;
    }
  }
  return K;
}

/**
 * Static drum shape at fractional coordinates u, v in [0, 1]:
 * Φ = cos θ · sin(mπu) sin(nπv) + sin θ · sin(nπu) sin(mπv).
 * On lattice points u = i/(M+1) this is exactly the lattice eigenvector. When θ ≠ 0 it mixes
 * the (m,n) and (n,m) modes, which share one frequency, so the sum is still a standing wave.
 */
export function drumShape(u: number, v: number, m: number, n: number, theta: number): number {
  const a = Math.sin(m * Math.PI * u) * Math.sin(n * Math.PI * v);
  if (theta === 0 || m === n) return a;
  const b = Math.sin(n * Math.PI * u) * Math.sin(m * Math.PI * v);
  return Math.cos(theta) * a + Math.sin(theta) * b;
}

/**
 * Count nodal domains (connected regions of one sign) of the drum shape on a res×res grid of
 * interior samples. Samples with |Φ| below a small threshold count as nodal and separate regions.
 */
export function nodalDomains(m: number, n: number, theta: number, res = 97): number {
  const val = new Float64Array(res * res);
  let peak = 0;
  for (let i = 0; i < res; i++) {
    for (let j = 0; j < res; j++) {
      const f = drumShape((i + 0.5) / res, (j + 0.5) / res, m, n, theta);
      val[i * res + j] = f;
      peak = Math.max(peak, Math.abs(f));
    }
  }
  const eps = 1e-3 * peak;
  const seen = new Uint8Array(res * res);
  const stack: number[] = [];
  let count = 0;
  const minSize = Math.max(4, Math.floor((res * res) / 2000));
  for (let s = 0; s < res * res; s++) {
    if (seen[s] || Math.abs(val[s]) <= eps) continue;
    const sign = Math.sign(val[s]);
    let size = 0;
    stack.push(s);
    seen[s] = 1;
    while (stack.length) {
      const c = stack.pop()!;
      size++;
      const i = Math.floor(c / res);
      const j = c % res;
      const nb = [i > 0 ? c - res : -1, i < res - 1 ? c + res : -1, j > 0 ? c - 1 : -1, j < res - 1 ? c + 1 : -1];
      for (const d of nb) {
        if (d < 0 || seen[d]) continue;
        if (Math.sign(val[d]) !== sign || Math.abs(val[d]) <= eps) continue;
        seen[d] = 1;
        stack.push(d);
      }
    }
    if (size >= minSize) count++;
  }
  return count;
}
