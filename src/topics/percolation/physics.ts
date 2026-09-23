// Site and bond percolation on the square (2D) and simple cubic (3D) lattice.
// Pure module: no DOM, no Three.js.
//
// Layout: site i = x + L*y + L*L*z. The y axis is "vertical": row y = 0 is the
// top face, y = L - 1 the bottom face. Boundaries are open (no wrap).
// Bond b = i*dim + axis joins site i to its +axis neighbour.
//
// Every site (or bond) gets one uniform random number r when the sample is made.
// It is open when r < p. Sweeping p with the same numbers grows clusters smoothly
// (the "fill p slowly" picture, also the basis of the Newman-Ziff method).

export type Mode = 'site' | 'bond';
export type Dim = 2 | 3;

/** Best literature values. */
export const PC = {
  site2: 0.592746, // Newman & Ziff, PRL 85, 4104 (2000): 0.59274621(13)
  bond2: 0.5, // exact, Kesten (1980)
  site3: 0.3116077, // Wang, Zhou, Zhang, Garoni, Deng, PRE 87, 052107 (2013)
  bond3: 0.2488118, // same reference
};

export const BETA = { 2: 5 / 36, 3: 0.41 };
export const FRACTAL_D = { 2: 91 / 48, 3: 2.52 };

export function pcOf(dim: Dim, mode: Mode): number {
  if (dim === 2) return mode === 'site' ? PC.site2 : PC.bond2;
  return mode === 'site' ? PC.site3 : PC.bond3;
}

/** mulberry32: small, fast, seedable. */
export function rng(seed: number): () => number {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Weighted union-find with path halving and top/bottom contact flags per root. */
export class UnionFind {
  parent: Int32Array;
  size: Int32Array;
  flags: Uint8Array; // bit 1: touches top face, bit 2: touches bottom face
  constructor(n: number) {
    this.parent = new Int32Array(n);
    this.size = new Int32Array(n);
    this.flags = new Uint8Array(n);
  }
  make(i: number, f: number): void {
    this.parent[i] = i;
    this.size[i] = 1;
    this.flags[i] = f;
  }
  find(i: number): number {
    const p = this.parent;
    while (p[i] !== i) {
      p[i] = p[p[i]];
      i = p[i];
    }
    return i;
  }
  /** Returns the new root. */
  union(a: number, b: number): number {
    let ra = this.find(a);
    let rb = this.find(b);
    if (ra === rb) return ra;
    if (this.size[ra] < this.size[rb]) {
      const t = ra;
      ra = rb;
      rb = t;
    }
    this.parent[rb] = ra;
    this.size[ra] += this.size[rb];
    this.flags[ra] |= this.flags[rb];
    return ra;
  }
}

export interface ClusterStats {
  p: number;
  /** Occupied sites (site mode) or all sites (bond mode). */
  occupied: number;
  /** Open bonds (bond mode) or open sites (site mode). */
  openElems: number;
  clusters: number;
  largest: number;
  largestRoot: number;
  /** Largest cluster fraction |C_max| / N. */
  Pinf: number;
  /** Mean finite-cluster size, sum s^2 / sum s over all clusters except the largest. */
  meanSize: number;
  spanning: boolean;
  /** Number of sites in spanning clusters. */
  spanSites: number;
  /** Sum of all cluster sizes (must equal occupied). */
  sizeSum: number;
}

export class Percolation {
  readonly N: number;
  readonly L2: number;
  readonly nb: number;
  readonly rs: Float32Array; // site numbers
  readonly rb: Float32Array; // bond numbers (2 = boundary, never open)
  readonly uf: UnionFind;
  /** Root of each site after label(), or -1 when empty. */
  readonly root: Int32Array;
  /** 1 when the site's cluster spans top to bottom (after label()). */
  readonly spanMark: Uint8Array;
  /** P_inf(p) for this sample on a grid of CURVE_N points, p = k/(CURVE_N-1). */
  readonly curve: Float32Array;
  /** Smallest p at which this sample spans (exact, from the sweep). */
  pSpan = 1;
  readonly stats: ClusterStats;

  static readonly CURVE_N = 201;
  readonly dim: Dim;
  readonly L: number;
  readonly mode: Mode;
  readonly seed: number;

  constructor(dim: Dim, L: number, mode: Mode, seed: number) {
    this.dim = dim;
    this.L = L;
    this.mode = mode;
    this.seed = seed;
    const N = dim === 2 ? L * L : L * L * L;
    this.N = N;
    this.L2 = L * L;
    this.nb = N * dim;
    const r = rng(seed);
    this.rs = new Float32Array(N);
    for (let i = 0; i < N; i++) this.rs[i] = r();
    this.rb = new Float32Array(this.nb);
    for (let i = 0; i < N; i++) {
      for (let a = 0; a < dim; a++) this.rb[i * dim + a] = this.coord(i, a) < L - 1 ? r() : 2;
    }
    this.uf = new UnionFind(N);
    this.root = new Int32Array(N);
    this.spanMark = new Uint8Array(N);
    this.curve = new Float32Array(Percolation.CURVE_N);
    this.stats = {
      p: 0, occupied: 0, openElems: 0, clusters: 0, largest: 0, largestRoot: -1, Pinf: 0,
      meanSize: 0, spanning: false, spanSites: 0, sizeSum: 0,
    };
    this.sweepCurve();
  }

  /** Coordinate of site i along axis a (0 = x, 1 = y vertical, 2 = z). */
  coord(i: number, a: number): number {
    const L = this.L;
    if (a === 0) return i % L;
    if (a === 1) return Math.floor(i / L) % L;
    return Math.floor(i / this.L2);
  }

  private stride(a: number): number {
    return a === 0 ? 1 : a === 1 ? this.L : this.L2;
  }

  private faceFlag(i: number): number {
    const y = Math.floor(i / this.L) % this.L;
    return (y === 0 ? 1 : 0) | (y === this.L - 1 ? 2 : 0);
  }

  /**
   * Newman-Ziff style pass: open elements in order of their random number,
   * record P_inf on a fixed p grid and the exact spanning point.
   */
  private sweepCurve(): void {
    const { uf, N, dim } = this;
    const bond = this.mode === 'bond';
    const keys = bond ? this.rb : this.rs;
    const M = keys.length;
    const order = new Int32Array(M);
    for (let k = 0; k < M; k++) order[k] = k;
    order.sort((a, b) => keys[a] - keys[b]);
    const occ = new Uint8Array(N);
    let largest = 0;
    if (bond) {
      for (let i = 0; i < N; i++) uf.make(i, this.faceFlag(i));
      largest = N > 0 ? 1 : 0;
      for (let i = 0; i < N; i++) if (uf.flags[i] === 3) this.pSpan = 0; // L = 1
    }
    const K = Percolation.CURVE_N;
    let j = 0;
    let spanned = this.pSpan === 0;
    for (let k = 0; k < M; k++) {
      const e = order[k];
      const r = keys[e];
      if (r > 1) break;
      while (j < K && j / (K - 1) < r) this.curve[j++] = largest / N;
      let rt: number;
      if (bond) {
        const i = (e / dim) | 0;
        const a = e - i * dim;
        rt = uf.union(i, i + this.stride(a));
      } else {
        uf.make(e, this.faceFlag(e));
        occ[e] = 1;
        rt = e;
        for (let a = 0; a < dim; a++) {
          const s = this.stride(a);
          const c = this.coord(e, a);
          if (c > 0 && occ[e - s]) rt = uf.union(rt, e - s);
          if (c < this.L - 1 && occ[e + s]) rt = uf.union(rt, e + s);
        }
      }
      if (uf.size[rt] > largest) largest = uf.size[rt];
      if (!spanned && uf.flags[rt] === 3) {
        spanned = true;
        this.pSpan = r;
      }
    }
    while (j < K) this.curve[j++] = largest / N;
  }

  /** Full cluster labelling at occupation probability p. Allocation free. */
  label(p: number): ClusterStats {
    const { uf, N, dim, rs, rb, root, L } = this;
    const bond = this.mode === 'bond';
    let open = 0;
    for (let i = 0; i < N; i++) {
      if (bond || rs[i] < p) uf.make(i, this.faceFlag(i));
      else uf.parent[i] = -1;
      if (!bond && rs[i] < p) open++;
    }
    for (let i = 0; i < N; i++) {
      if (uf.parent[i] < 0) continue;
      for (let a = 0; a < dim; a++) {
        if (this.coord(i, a) === L - 1) continue;
        const j = i + this.stride(a);
        if (bond) {
          if (rb[i * dim + a] < p) {
            uf.union(i, j);
            open++;
          }
        } else if (uf.parent[j] >= 0) uf.union(i, j);
      }
    }
    const st = this.stats;
    let occupied = 0;
    let clusters = 0;
    let largest = 0;
    let largestRoot = -1;
    let spanSites = 0;
    for (let i = 0; i < N; i++) {
      if (uf.parent[i] < 0) {
        root[i] = -1;
        this.spanMark[i] = 0;
        continue;
      }
      const r = uf.find(i);
      root[i] = r;
      occupied++;
      const span = uf.flags[r] === 3 ? 1 : 0;
      this.spanMark[i] = span;
      spanSites += span;
      if (r === i) {
        clusters++;
        if (uf.size[i] > largest) {
          largest = uf.size[i];
          largestRoot = i;
        }
      }
    }
    let s1 = 0;
    let s2 = 0;
    let sizeSum = 0;
    for (let i = 0; i < N; i++) {
      if (root[i] !== i) continue;
      const s = uf.size[i];
      sizeSum += s;
      if (i === largestRoot) continue;
      s1 += s;
      s2 += s * s;
    }
    st.p = p;
    st.occupied = occupied;
    st.openElems = open;
    st.clusters = clusters;
    st.largest = largest;
    st.largestRoot = largestRoot;
    st.Pinf = largest / N;
    st.meanSize = s1 > 0 ? s2 / s1 : 0;
    st.spanning = spanSites > 0;
    st.spanSites = spanSites;
    st.sizeSum = sizeSum;
    return st;
  }

  /** Size of the cluster containing site i (after label()). 0 when empty. */
  clusterSize(i: number): number {
    const r = this.root[i];
    return r < 0 ? 0 : this.uf.size[r];
  }

  /** Reference labelling by breadth-first search (for tests). Returns cluster id per site, -1 if empty. */
  bfsLabels(p: number): Int32Array {
    const { N, dim, L, rs, rb } = this;
    const bond = this.mode === 'bond';
    const lab = new Int32Array(N).fill(-2);
    const q = new Int32Array(N);
    let next = 0;
    for (let s = 0; s < N; s++) {
      if (!bond && !(rs[s] < p)) {
        lab[s] = -1;
        continue;
      }
      if (lab[s] !== -2) continue;
      let head = 0;
      let tail = 0;
      q[tail++] = s;
      lab[s] = next;
      while (head < tail) {
        const i = q[head++];
        for (let a = 0; a < dim; a++) {
          const st = this.stride(a);
          const c = this.coord(i, a);
          // +a neighbour
          if (c < L - 1) {
            const j = i + st;
            const ok = bond ? rb[i * dim + a] < p : rs[j] < p;
            if (ok && lab[j] === -2) {
              lab[j] = next;
              q[tail++] = j;
            }
          }
          if (c > 0) {
            const j = i - st;
            const ok = bond ? rb[j * dim + a] < p : rs[j] < p;
            if (ok && lab[j] === -2) {
              lab[j] = next;
              q[tail++] = j;
            }
          }
        }
      }
      next++;
    }
    return lab;
  }
}

/** Median of the per-sample spanning point over `samples` seeds. */
export function medianSpan(dim: Dim, L: number, mode: Mode, samples: number, seed0 = 1): number {
  const v: number[] = [];
  for (let s = 0; s < samples; s++) v.push(new Percolation(dim, L, mode, seed0 + s).pSpan);
  v.sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : 0.5 * (v[m - 1] + v[m]);
}
