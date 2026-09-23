// Pure maths for the Calabi–Yau topic. No DOM, no Three.js.
//
// 1. Hanson's method (A. J. Hanson, 1994) for drawing the complex curve z1^n + z2^n = 1.
// 2. Topology: genus of Fermat curves, Euler characteristics from Chern classes of
//    complete intersections in (products of) projective spaces, Hodge numbers and the
//    "generations" count |χ|/2 of simple heterotic compactifications.

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Hanson's parametrization
// ---------------------------------------------------------------------------

/** Principal branch of w^p for complex w = re + i im, written into out[o], out[o+1]. */
function cpowInto(re: number, im: number, p: number, out: Float64Array, o: number): void {
  const r = Math.hypot(re, im);
  if (r === 0) {
    out[o] = 0;
    out[o + 1] = 0;
    return;
  }
  const th = Math.atan2(im, re);
  const rp = Math.pow(r, p);
  out[o] = rp * Math.cos(p * th);
  out[o + 1] = rp * Math.sin(p * th);
}

/**
 * One point of patch (k1, k2) of the curve z1^n + z2^n = 1, at ξ = x + iy.
 *   z1 = e^{2πi k1/n} cosh(ξ)^{2/n}
 *   z2 = e^{2πi k2/n} (−i sinh ξ)^{2/n}
 * Writes [Re z1, Im z1, Re z2, Im z2] into out at offset o.
 */
export function hansonPointInto(n: number, k1: number, k2: number, x: number, y: number, out: Float64Array, o = 0): void {
  const p = 2 / n;
  const chx = Math.cosh(x);
  const shx = Math.sinh(x);
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  // cosh(x + iy) = cosh x cos y + i sinh x sin y
  cpowInto(chx * cy, shx * sy, p, out, o);
  // −i sinh(x + iy) = −i (sinh x cos y + i cosh x sin y) = cosh x sin y − i sinh x cos y
  cpowInto(chx * sy, -shx * cy, p, out, o + 2);
  // Multiply by the roots of unity that label the patch.
  const a1 = (TAU * k1) / n;
  const a2 = (TAU * k2) / n;
  const c1 = Math.cos(a1);
  const s1 = Math.sin(a1);
  const c2 = Math.cos(a2);
  const s2 = Math.sin(a2);
  const r1 = out[o];
  const i1 = out[o + 1];
  const r2 = out[o + 2];
  const i2 = out[o + 3];
  out[o] = r1 * c1 - i1 * s1;
  out[o + 1] = r1 * s1 + i1 * c1;
  out[o + 2] = r2 * c2 - i2 * s2;
  out[o + 3] = r2 * s2 + i2 * c2;
}

export function hansonPoint(n: number, k1: number, k2: number, x: number, y: number): Float64Array {
  const out = new Float64Array(4);
  hansonPointInto(n, k1, k2, x, y, out, 0);
  return out;
}

/** Integer power of a complex number by repeated multiplication. Returns [re, im]. */
export function cpowInt(re: number, im: number, n: number): [number, number] {
  let ar = 1;
  let ai = 0;
  for (let i = 0; i < n; i++) {
    const t = ar * re - ai * im;
    ai = ar * im + ai * re;
    ar = t;
  }
  return [ar, ai];
}

/** |z1^n + z2^n − 1| for a point [Re z1, Im z1, Re z2, Im z2]. */
export function fermatResidual(n: number, z: ArrayLike<number>, o = 0): number {
  const [a, b] = cpowInt(z[o], z[o + 1], n);
  const [c, d] = cpowInt(z[o + 2], z[o + 3], n);
  return Math.hypot(a + c - 1, b + d);
}

/** Map a 4D point (z1, z2) to 3D: (Re z1, Re z2, cos α Im z1 + sin α Im z2). */
export function project(z: ArrayLike<number>, alpha: number, o = 0): [number, number, number] {
  return [z[o], z[o + 2], Math.cos(alpha) * z[o + 1] + Math.sin(alpha) * z[o + 3]];
}

export interface HansonGrid {
  n: number;
  /** Half-width of the x range: x ∈ [−a, a]. */
  a: number;
  /** Grid cells along x and along y. */
  nx: number;
  ny: number;
  patches: number;
  vertsPerPatch: number;
  vertexCount: number;
  /** 4 doubles per vertex: Re z1, Im z1, Re z2, Im z2. */
  z: Float64Array;
  /** Patch id k1·n + k2 for each vertex. */
  patch: Uint16Array;
  /** Grid parameters (x/a in [−1,1], y/(π/2) in [0,1]) for each vertex, for colouring. */
  uv: Float32Array;
  /** Triangle indices, patch by patch. Each patch uses indicesPerPatch entries. */
  index: Uint32Array;
  indicesPerPatch: number;
  /** Line-segment indices for a sparse wireframe, patch by patch. */
  lineIndex: Uint32Array;
  lineIndicesPerPatch: number;
}

/**
 * Sample every patch (k1, k2) ∈ {0..n−1}² on a grid over x ∈ [−a, a], y ∈ [0, π/2].
 * `lineEvery` controls the wireframe density (every k-th grid line).
 */
export function buildHansonGrid(n: number, a: number, nx: number, ny: number, lineEvery = 3): HansonGrid {
  const patches = n * n;
  const vpp = (nx + 1) * (ny + 1);
  const V = patches * vpp;
  const z = new Float64Array(V * 4);
  const patch = new Uint16Array(V);
  const uv = new Float32Array(V * 2);
  const ipp = nx * ny * 6;
  const index = new Uint32Array(patches * ipp);

  // Wireframe: lines of constant y (every lineEvery rows) and constant x (every lineEvery cols), plus borders.
  const rows: number[] = [];
  for (let j = 0; j <= ny; j++) if (j % lineEvery === 0 || j === ny) rows.push(j);
  const cols: number[] = [];
  for (let i = 0; i <= nx; i++) if (i % lineEvery === 0 || i === nx) cols.push(i);
  const lpp = (rows.length * nx + cols.length * ny) * 2;
  const lineIndex = new Uint32Array(patches * lpp);

  let ii = 0;
  let li = 0;
  for (let k1 = 0; k1 < n; k1++) {
    for (let k2 = 0; k2 < n; k2++) {
      const pid = k1 * n + k2;
      const base = pid * vpp;
      for (let j = 0; j <= ny; j++) {
        const y = (j / ny) * (Math.PI / 2);
        for (let i = 0; i <= nx; i++) {
          const x = -a + (2 * a * i) / nx;
          const v = base + j * (nx + 1) + i;
          hansonPointInto(n, k1, k2, x, y, z, v * 4);
          patch[v] = pid;
          uv[v * 2] = x / a;
          uv[v * 2 + 1] = j / ny;
        }
      }
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const v00 = base + j * (nx + 1) + i;
          const v10 = v00 + 1;
          const v01 = v00 + nx + 1;
          const v11 = v01 + 1;
          index[ii++] = v00;
          index[ii++] = v10;
          index[ii++] = v01;
          index[ii++] = v10;
          index[ii++] = v11;
          index[ii++] = v01;
        }
      }
      for (const j of rows) {
        for (let i = 0; i < nx; i++) {
          lineIndex[li++] = base + j * (nx + 1) + i;
          lineIndex[li++] = base + j * (nx + 1) + i + 1;
        }
      }
      for (const i of cols) {
        for (let j = 0; j < ny; j++) {
          lineIndex[li++] = base + j * (nx + 1) + i;
          lineIndex[li++] = base + (j + 1) * (nx + 1) + i;
        }
      }
    }
  }
  return {
    n, a, nx, ny, patches, vertsPerPatch: vpp, vertexCount: V,
    z, patch, uv, index, indicesPerPatch: ipp, lineIndex, lineIndicesPerPatch: lpp,
  };
}

/** Write projected 3D positions for every vertex into pos (length 3·vertexCount), scaled by s. In place. */
export function projectGridInto(g: HansonGrid, alpha: number, pos: Float32Array, s = 1): void {
  const ca = Math.cos(alpha) * s;
  const sa = Math.sin(alpha) * s;
  const z = g.z;
  for (let v = 0, o = 0, q = 0; v < g.vertexCount; v++, o += 4, q += 3) {
    pos[q] = z[o] * s;
    pos[q + 1] = z[o + 2] * s;
    pos[q + 2] = ca * z[o + 1] + sa * z[o + 3];
  }
}

/** Smooth normals from grid neighbours (central differences in x and y). In place, no allocation. */
export function gridNormalsInto(g: HansonGrid, pos: Float32Array, nrm: Float32Array): void {
  const { nx, ny, vertsPerPatch: vpp, patches } = g;
  const W = nx + 1;
  for (let p = 0; p < patches; p++) {
    const base = p * vpp;
    for (let j = 0; j <= ny; j++) {
      const j0 = j > 0 ? j - 1 : j;
      const j1 = j < ny ? j + 1 : j;
      for (let i = 0; i <= nx; i++) {
        const i0 = i > 0 ? i - 1 : i;
        const i1 = i < nx ? i + 1 : i;
        const a = (base + j * W + i0) * 3;
        const b = (base + j * W + i1) * 3;
        const c = (base + j0 * W + i) * 3;
        const d = (base + j1 * W + i) * 3;
        const ux = pos[b] - pos[a];
        const uy = pos[b + 1] - pos[a + 1];
        const uz = pos[b + 2] - pos[a + 2];
        const vx = pos[d] - pos[c];
        const vy = pos[d + 1] - pos[c + 1];
        const vz = pos[d + 2] - pos[c + 2];
        let x = uy * vz - uz * vy;
        let y = uz * vx - ux * vz;
        let z = ux * vy - uy * vx;
        const l = Math.hypot(x, y, z);
        const q = (base + j * W + i) * 3;
        if (l > 1e-12) {
          x /= l;
          y /= l;
          z /= l;
        } else {
          x = 0;
          y = 0;
          z = 1;
        }
        nrm[q] = x;
        nrm[q + 1] = y;
        nrm[q + 2] = z;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Topology of the curve
// ---------------------------------------------------------------------------

/** Genus of the smooth projective Fermat curve x^n + y^n = z^n in CP². */
export const fermatGenus = (n: number): number => ((n - 1) * (n - 2)) / 2;

/** Euler characteristic χ = 2 − 2g of the compactified curve. */
export const curveEuler = (n: number): number => 2 - 2 * fermatGenus(n);

/** Points added at infinity when the affine curve z1^n + z2^n = 1 is compactified. */
export const pointsAtInfinity = (n: number): number => n;

/** Everyday name of the compact surface for small genus. */
export function surfaceName(g: number): string {
  if (g === 0) return 'sphere';
  if (g === 1) return 'torus';
  return `${g}-holed torus`;
}

// ---------------------------------------------------------------------------
// Chern classes of complete intersections in products of projective spaces
// ---------------------------------------------------------------------------

/**
 * A complete intersection in CP^{m_1} × … × CP^{m_k}.
 * `dims` = [m_1, …, m_k]. Each equation is given by its multidegree, one entry per factor.
 */
export interface CompleteIntersection {
  dims: number[];
  equations: number[][];
}

/** Dense truncated polynomial in H_1..H_k with H_i^{m_i + 1} = 0 (the cohomology ring of the ambient space). */
class Ring {
  readonly size: number;
  readonly stride: number[];
  readonly dims: number[];
  constructor(dims: number[]) {
    this.dims = dims;
    this.stride = [];
    let s = 1;
    for (const m of dims) {
      this.stride.push(s);
      s *= m + 1;
    }
    this.size = s;
  }
  exps(idx: number): number[] {
    return this.dims.map((m, i) => Math.floor(idx / this.stride[i]) % (m + 1));
  }
  zero(): Float64Array {
    return new Float64Array(this.size);
  }
  one(): Float64Array {
    const r = this.zero();
    r[0] = 1;
    return r;
  }
  /** 1 + Σ c_i H_i */
  onePlusLinear(c: number[]): Float64Array {
    const r = this.one();
    c.forEach((ci, i) => (r[this.stride[i]] += ci));
    return r;
  }
  linear(c: number[]): Float64Array {
    const r = this.zero();
    c.forEach((ci, i) => (r[this.stride[i]] += ci));
    return r;
  }
  mul(a: Float64Array, b: Float64Array): Float64Array {
    const r = this.zero();
    for (let i = 0; i < this.size; i++) {
      if (a[i] === 0) continue;
      const ei = this.exps(i);
      for (let j = 0; j < this.size; j++) {
        if (b[j] === 0) continue;
        const ej = this.exps(j);
        let k = 0;
        let ok = true;
        for (let t = 0; t < this.dims.length; t++) {
          const e = ei[t] + ej[t];
          if (e > this.dims[t]) {
            ok = false;
            break;
          }
          k += e * this.stride[t];
        }
        if (ok) r[k] += a[i] * b[j];
      }
    }
    return r;
  }
  /** (1 + L)^{-1} = Σ (−L)^j. Terminates because L is nilpotent in this ring. */
  invOnePlus(L: Float64Array): Float64Array {
    let r = this.one();
    let term = this.one();
    const neg = L.map((x) => -x);
    const D = this.dims.reduce((s, m) => s + m, 0);
    for (let j = 1; j <= D; j++) {
      term = this.mul(term, neg);
      for (let i = 0; i < this.size; i++) r[i] += term[i];
    }
    return r;
  }
  degree(idx: number): number {
    return this.exps(idx).reduce((s, e) => s + e, 0);
  }
}

export interface ChernResult {
  /** Complex dimension of the intersection. */
  dim: number;
  /** First Chern class, as coefficients of H_1..H_k. All zero means Calabi–Yau (c1 = 0). */
  c1: number[];
  /** Euler characteristic ∫_X c_top(X). */
  euler: number;
}

/**
 * Total Chern class by adjunction:
 *   c(X) = Π_i (1 + H_i)^{m_i + 1} / Π_eq (1 + L_eq),  L_eq = Σ_i d_{eq,i} H_i.
 * Then χ(X) = ∫_ambient c_dim(X) · Π_eq L_eq, the coefficient of Π H_i^{m_i}.
 */
export function chernData(ci: CompleteIntersection): ChernResult {
  const R = new Ring(ci.dims);
  const k = ci.dims.length;
  let c = R.one();
  ci.dims.forEach((m, i) => {
    const unit = Array.from({ length: k }, (_, t) => (t === i ? 1 : 0));
    const f = R.onePlusLinear(unit);
    for (let p = 0; p < m + 1; p++) c = R.mul(c, f);
  });
  for (const eq of ci.equations) c = R.mul(c, R.invOnePlus(R.linear(eq)));
  const dim = ci.dims.reduce((s, m) => s + m, 0) - ci.equations.length;
  const c1 = ci.dims.map((_, i) => c[R.stride[i]]);
  let top = R.zero();
  for (let i = 0; i < R.size; i++) if (R.degree(i) === dim) top[i] = c[i];
  for (const eq of ci.equations) top = R.mul(top, R.linear(eq));
  const topIdx = ci.dims.reduce((s, m, i) => s + m * R.stride[i], 0);
  return { dim, c1, euler: Math.round(top[topIdx]) };
}

/** Euler characteristic of a degree-d hypersurface in CP^m. The quintic is (m, d) = (4, 5). */
export const hypersurfaceEuler = (m: number, d: number): number => chernData({ dims: [m], equations: [[d]] }).euler;

const binom = (n: number, k: number): number => {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
};

/**
 * Complex structure moduli h^{2,1} of a Calabi–Yau complete intersection of k equations of equal degree d in CP^m,
 * counted naively: coefficients of the equations, minus coordinate changes GL(m+1), minus mixing of the
 * equations GL(k), plus 1 because the overall scale was subtracted twice.
 * Quintic: 126 − 25 = 101. Two cubics in CP⁵: 112 − 36 − 4 + 1 = 73.
 */
export const ciComplexModuli = (m: number, d: number, k = 1): number => k * binom(d + m, m) - (m + 1) ** 2 - k * k + 1;

// ---------------------------------------------------------------------------
// A small table of Calabi–Yau threefolds
// ---------------------------------------------------------------------------

export interface CY3 {
  id: string;
  name: string;
  short: string;
  h11: number;
  h21: number;
  /** Where it lives, if it is a complete intersection we can check with Chern classes. */
  ambient?: CompleteIntersection;
  /** Order of a freely acting group we quotient by (χ divides by it). */
  quotient?: number;
  note: string;
}

/** χ = 2(h11 − h21) for a Calabi–Yau threefold. */
export const eulerCY3 = (h11: number, h21: number): number => 2 * (h11 - h21);

/** Net generations in the simplest heterotic E8 × E8 construction (standard embedding): |χ|/2. */
export const generations = (chi: number): number => Math.abs(chi) / 2;

export function mirror(m: CY3): CY3 {
  return { ...m, id: `mirror-${m.id}`, name: `Mirror of ${m.name}`, short: `Mirror ${m.short}`, h11: m.h21, h21: m.h11, ambient: undefined };
}

const QUINTIC: CY3 = {
  id: 'quintic', name: 'Quintic in CP⁴', short: 'Quintic', h11: 1, h21: 101,
  ambient: { dims: [4], equations: [[5]] },
  note: 'z₁⁵ + … + z₅⁵ = 0 and its deformations. The first example physicists studied.',
};
const TY_COVER: CY3 = {
  id: 'ty-cover', name: 'Tian–Yau cover in CP³ × CP³', short: 'TY cover', h11: 14, h21: 23,
  ambient: { dims: [3, 3], equations: [[3, 0], [0, 3], [1, 1]] },
  note: 'Three equations in CP³ × CP³. It has a free Z₃ symmetry.',
};

export const MANIFOLDS: CY3[] = [
  QUINTIC,
  mirror(QUINTIC),
  {
    id: 'bicubic', name: 'Bicubic in CP² × CP²', short: 'Bicubic', h11: 2, h21: 83,
    ambient: { dims: [2, 2], equations: [[3, 3]] },
    note: 'One equation of degree 3 in each factor.',
  },
  {
    id: 'cubics', name: 'Two cubics in CP⁵', short: 'Two cubics', h11: 1, h21: 73,
    ambient: { dims: [5], equations: [[3], [3]] },
    note: 'The intersection of two cubic equations.',
  },
  TY_COVER,
  {
    id: 'tian-yau', name: 'Tian–Yau manifold (cover / Z₃)', short: 'Tian–Yau', h11: 6, h21: 9,
    quotient: 3,
    note: 'Dividing the cover by a free Z₃ divides χ by 3. The first three-generation example (1986).',
  },
];

export function manifoldById(id: string): CY3 {
  return MANIFOLDS.find((m) => m.id === id) ?? QUINTIC;
}

/**
 * Hodge diamond h^{p,q} of a Calabi–Yau threefold with full SU(3) holonomy, as rows from top to bottom.
 */
export function hodgeDiamond(h11: number, h21: number): number[][] {
  return [[1], [0, 0], [0, h11, 0], [1, h21, h21, 1], [0, h11, 0], [0, 0], [1]];
}

/** χ from the diamond: Σ (−1)^{p+q} h^{p,q}. */
export function eulerFromDiamond(d: number[][]): number {
  let chi = 0;
  d.forEach((row, r) => row.forEach((h) => (chi += (r % 2 === 0 ? 1 : -1) * h)));
  return chi;
}
