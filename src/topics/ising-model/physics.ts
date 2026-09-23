// 2D Ising model on an L x L periodic square lattice. J = 1, k_B = 1.
// Pure module: no DOM, no Three.js. All hot loops use preallocated typed arrays.

/** Onsager's critical temperature, from sinh(2J/T_c) = 1. */
export const TC = 2 / Math.log(1 + Math.SQRT2);

/** Exact spontaneous magnetization per spin (Onsager, Yang 1952). Zero at and above T_c. */
export function onsagerM(T: number): number {
  if (T >= TC || T <= 0) return T <= 0 ? 1 : 0;
  const s = Math.sinh(2 / T);
  return Math.pow(1 - Math.pow(s, -4), 1 / 8);
}

/** Complete elliptic integral of the first kind K(k), via the arithmetic-geometric mean. */
export function ellipticK(k: number): number {
  let a = 1;
  let b = Math.sqrt(Math.max(0, 1 - k * k));
  if (b === 0) return Infinity;
  for (let i = 0; i < 40 && Math.abs(a - b) > 1e-15 * a; i++) {
    const an = (a + b) / 2;
    b = Math.sqrt(a * b);
    a = an;
  }
  return Math.PI / (2 * a);
}

/** Exact internal energy per spin at h = 0 in the infinite lattice (Onsager 1944). */
export function onsagerU(T: number): number {
  const K = 1 / T;
  const t2 = Math.tanh(2 * K);
  const pref = 2 * t2 * t2 - 1;
  const c = Math.cosh(2 * K);
  const k = (2 * Math.sinh(2 * K)) / (c * c);
  const ell = Math.abs(pref) < 1e-12 ? 0 : pref * ellipticK(Math.min(k, 1 - 1e-16));
  return -(1 / t2) * (1 + (2 / Math.PI) * ell);
}

/** Metropolis acceptance probability for an energy change dE at temperature T. */
export function acceptance(dE: number, T: number): number {
  return dE <= 0 ? 1 : Math.exp(-dE / T);
}

/** Wolff bond-activation probability p = 1 - exp(-2J/T). */
export function wolffP(T: number): number {
  return 1 - Math.exp(-2 / T);
}

/** Small fast seeded RNG (mulberry32). Returns floats in [0, 1). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Algorithm = 'metropolis' | 'wolff';

export class Ising {
  readonly L: number;
  readonly N: number;
  readonly s: Int8Array;
  /** Neighbour table: right, left, down, up for each site. */
  readonly nbr: Int32Array;
  T = 2.5;
  h = 0;
  /** Total energy H = -sum_<ij> s_i s_j - h sum_i s_i, kept incrementally. */
  E = 0;
  /** Total magnetization sum_i s_i, kept incrementally. */
  M = 0;
  /** Counters for the last sweep. */
  lastAccept = 0;
  lastClusterMean = 0;
  rand: () => number;
  private acc = new Float64Array(10);
  private pAdd = 0;
  private queue: Int32Array;
  private mark: Uint32Array;
  private gen = 0;
  private wolffSizeEst = 1;

  constructor(L: number, seed = 1) {
    this.L = L;
    this.N = L * L;
    this.s = new Int8Array(this.N);
    this.nbr = new Int32Array(this.N * 4);
    for (let y = 0; y < L; y++) {
      for (let x = 0; x < L; x++) {
        const i = y * L + x;
        this.nbr[i * 4] = y * L + ((x + 1) % L);
        this.nbr[i * 4 + 1] = y * L + ((x + L - 1) % L);
        this.nbr[i * 4 + 2] = ((y + 1) % L) * L + x;
        this.nbr[i * 4 + 3] = ((y + L - 1) % L) * L + x;
      }
    }
    this.queue = new Int32Array(this.N);
    this.mark = new Uint32Array(this.N);
    this.rand = makeRng(seed);
    this.randomize();
    this.setParams(this.T, this.h);
  }

  reseed(seed: number): void {
    this.rand = makeRng(seed);
  }

  setParams(T: number, h: number): void {
    this.T = T;
    this.h = h;
    // Table index: (s > 0 ? 5 : 0) + (nsum + 4) / 2. dE = 2 s (nsum + h).
    for (let si = 0; si < 2; si++) {
      const sv = si === 0 ? -1 : 1;
      for (let k = 0; k < 5; k++) {
        const nsum = 2 * k - 4;
        this.acc[si * 5 + k] = acceptance(2 * sv * (nsum + h), T);
      }
    }
    this.pAdd = wolffP(T);
    this.wolffSizeEst = 1;
    this.E = this.energyFull();
  }

  /** Infinite-temperature start: each spin up or down at random. */
  randomize(): void {
    for (let i = 0; i < this.N; i++) this.s[i] = this.rand() < 0.5 ? 1 : -1;
    this.recompute();
  }

  fill(v: 1 | -1): void {
    this.s.fill(v);
    this.recompute();
  }

  recompute(): void {
    this.E = this.energyFull();
    let m = 0;
    for (let i = 0; i < this.N; i++) m += this.s[i];
    this.M = m;
  }

  /** Full O(N) energy, counting each bond once (right and down neighbours). */
  energyFull(): number {
    const { s, nbr, N } = this;
    let bonds = 0;
    let m = 0;
    for (let i = 0; i < N; i++) {
      bonds += s[i] * (s[nbr[i * 4]] + s[nbr[i * 4 + 2]]);
      m += s[i];
    }
    return -bonds - this.h * m;
  }

  /** One Metropolis sweep: N single-spin attempts at random sites. Returns acceptance rate. */
  metropolisSweep(): number {
    const { s, nbr, N, acc, h } = this;
    const rand = this.rand;
    let accepted = 0;
    let dEsum = 0;
    let dM = 0;
    for (let n = 0; n < N; n++) {
      const i = (rand() * N) | 0;
      const b = i * 4;
      const nsum = s[nbr[b]] + s[nbr[b + 1]] + s[nbr[b + 2]] + s[nbr[b + 3]];
      const si = s[i];
      const a = acc[(si > 0 ? 5 : 0) + ((nsum + 4) >> 1)];
      if (a >= 1 || rand() < a) {
        s[i] = -si as 1 | -1;
        dEsum += 2 * si * (nsum + h);
        dM -= 2 * si;
        accepted++;
      }
    }
    this.E += dEsum;
    this.M += dM;
    this.lastAccept = accepted / N;
    return this.lastAccept;
  }

  /** Grow and (maybe) flip one Wolff cluster. Returns the cluster size if flipped, else 0. */
  wolffCluster(): number {
    const { s, nbr, queue, mark, N } = this;
    const rand = this.rand;
    const p = this.pAdd;
    if (++this.gen === 0xffffffff) {
      mark.fill(0);
      this.gen = 1;
    }
    const g = this.gen;
    const seed = (rand() * N) | 0;
    const s0 = s[seed];
    mark[seed] = g;
    queue[0] = seed;
    let head = 0;
    let tail = 1;
    while (head < tail) {
      const i = queue[head++];
      const b = i * 4;
      for (let k = 0; k < 4; k++) {
        const j = nbr[b + k];
        if (mark[j] !== g && s[j] === s0 && rand() < p) {
          mark[j] = g;
          queue[tail++] = j;
        }
      }
    }
    const n = tail;
    // With a field, accept the whole cluster flip with a Metropolis test on the Zeeman energy.
    const dEh = 2 * this.h * s0 * n;
    if (dEh > 0 && rand() >= Math.exp(-dEh / this.T)) return 0;
    // Bond energy change: every bond from the cluster to outside flips sign.
    let boundary = 0;
    for (let q = 0; q < n; q++) {
      const b = queue[q] * 4;
      for (let k = 0; k < 4; k++) {
        const j = nbr[b + k];
        if (mark[j] !== g) boundary += s[j];
      }
    }
    for (let q = 0; q < n; q++) s[queue[q]] = -s0 as 1 | -1;
    this.E += 2 * s0 * boundary + dEh;
    this.M -= 2 * s0 * n;
    return n;
  }

  /**
   * Wolff "sweep": a fixed number of cluster attempts, chosen so that about N spins flip.
   * The count comes from the previous sweep's mean cluster size. Stopping on a running
   * total instead would make the sampled states depend on the last cluster, which biases
   * averages on small lattices.
   */
  wolffSweep(): number {
    const attempts = Math.max(1, Math.ceil(this.N / Math.max(1, this.wolffSizeEst)));
    let flipped = 0;
    let clusters = 0;
    for (let a = 0; a < attempts; a++) {
      const n = this.wolffCluster();
      if (n > 0) {
        flipped += n;
        clusters++;
      }
    }
    this.lastClusterMean = clusters > 0 ? flipped / clusters : 0;
    if (clusters > 0) this.wolffSizeEst = 0.7 * this.wolffSizeEst + 0.3 * this.lastClusterMean;
    return this.lastClusterMean;
  }

  sweep(algo: Algorithm): void {
    if (algo === 'wolff') this.wolffSweep();
    else this.metropolisSweep();
  }
}

/**
 * Running measurement window over the last `cap` sweeps.
 * Keeps sums so means and fluctuations are O(1) to read.
 */
export class Stats {
  readonly cap: number;
  private e: Float64Array;
  private m: Float64Array;
  private head = 0;
  count = 0;
  private se = 0;
  private se2 = 0;
  private sm = 0;
  private sm2 = 0;
  private sam = 0;

  constructor(cap = 400) {
    this.cap = cap;
    this.e = new Float64Array(cap);
    this.m = new Float64Array(cap);
  }

  reset(): void {
    this.head = 0;
    this.count = 0;
    this.se = this.se2 = this.sm = this.sm2 = this.sam = 0;
  }

  /** Add one sample of energy and magnetization per spin. */
  add(e: number, m: number): void {
    if (this.count === this.cap) {
      const oe = this.e[this.head];
      const om = this.m[this.head];
      this.se -= oe;
      this.se2 -= oe * oe;
      this.sm -= om;
      this.sm2 -= om * om;
      this.sam -= Math.abs(om);
    } else this.count++;
    this.e[this.head] = e;
    this.m[this.head] = m;
    this.se += e;
    this.se2 += e * e;
    this.sm += m;
    this.sm2 += m * m;
    this.sam += Math.abs(m);
    this.head = (this.head + 1) % this.cap;
  }

  get meanE(): number { return this.count ? this.se / this.count : 0; }
  get meanM(): number { return this.count ? this.sm / this.count : 0; }
  get meanAbsM(): number { return this.count ? this.sam / this.count : 0; }

  /** Specific heat per spin C = N (<e^2> - <e>^2) / T^2. */
  heatCapacity(N: number, T: number): number {
    if (this.count < 2) return 0;
    const me = this.se / this.count;
    return (N * Math.max(0, this.se2 / this.count - me * me)) / (T * T);
  }

  /** Susceptibility per spin chi = N (<m^2> - <|m|>^2) / T. Uses |m| so a finite lattice gives a peak at T_c. */
  susceptibility(N: number, T: number, useAbs = true): number {
    if (this.count < 2) return 0;
    const mm = useAbs ? this.sam / this.count : this.sm / this.count;
    return (N * Math.max(0, this.sm2 / this.count - mm * mm)) / T;
  }
}

export interface DomainStats {
  /** Number of connected like-spin domains. */
  count: number;
  /** Size of the largest domain, in sites. */
  largest: number;
  /** Size of the second-largest domain. */
  second: number;
  /** Number of distinct octaves (1, 2-3, 4-7, ...) in which domain sizes occur. */
  octaves: number;
}

/**
 * Geometric domains: connected clusters of equal spins (nearest neighbours, periodic).
 * `labels` and `queue` are scratch buffers of length N.
 */
export function domainStats(s: Int8Array, nbr: Int32Array, labels: Int32Array, queue: Int32Array, out: DomainStats): DomainStats {
  const N = s.length;
  labels.fill(0, 0, N);
  let count = 0;
  let largest = 0;
  let second = 0;
  let octMask = 0;
  for (let start = 0; start < N; start++) {
    if (labels[start] !== 0) continue;
    count++;
    const v = s[start];
    labels[start] = count;
    queue[0] = start;
    let head = 0;
    let tail = 1;
    while (head < tail) {
      const i = queue[head++];
      const b = i * 4;
      for (let k = 0; k < 4; k++) {
        const j = nbr[b + k];
        if (labels[j] === 0 && s[j] === v) {
          labels[j] = count;
          queue[tail++] = j;
        }
      }
    }
    const size = tail;
    if (size > largest) {
      second = largest;
      largest = size;
    } else if (size > second) second = size;
    octMask |= 1 << Math.min(30, 31 - Math.clz32(size));
  }
  let oct = 0;
  for (let m = octMask; m; m &= m - 1) oct++;
  out.count = count;
  out.largest = largest;
  out.second = second;
  out.octaves = oct;
  return out;
}

/** Exact Boltzmann averages of E and M^2 for a tiny periodic lattice, by enumerating all 2^N states. */
export function exactSmall(L: number, T: number, h: number): { meanE: number; meanM2: number; meanM: number; Z: number } {
  const lat = new Ising(L, 1);
  lat.setParams(T, h);
  const N = L * L;
  let Z = 0;
  let sE = 0;
  let sM = 0;
  let sM2 = 0;
  // Energies relative to the ground state keep the weights finite.
  const E0 = -2 * N - Math.abs(h) * N;
  for (let c = 0; c < 1 << N; c++) {
    for (let i = 0; i < N; i++) lat.s[i] = (c >> i) & 1 ? 1 : -1;
    const E = lat.energyFull();
    let M = 0;
    for (let i = 0; i < N; i++) M += lat.s[i];
    const w = Math.exp(-(E - E0) / T);
    Z += w;
    sE += w * E;
    sM += w * M;
    sM2 += w * M * M;
  }
  return { meanE: sE / Z, meanM: sM / Z, meanM2: sM2 / Z, Z };
}
