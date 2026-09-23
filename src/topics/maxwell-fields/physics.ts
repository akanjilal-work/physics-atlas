// Maxwell's equations as field geometry. Pure math, SI units, no DOM.
// Fields: Coulomb (point charges), Biot–Savart (polygon loops, exact per straight segment),
// point magnetic dipole, and the symmetric charging-capacitor field.

export const EPS0 = 8.8541878128e-12; // F/m
export const MU0 = 1.25663706212e-6; // N/A²
export const K_E = 1 / (4 * Math.PI * EPS0);

export type Vec3Fn = (x: number, y: number, z: number, out: Float64Array) => void;

// ---------------------------------------------------------------------------
// Electrostatics
// ---------------------------------------------------------------------------

export interface PointCharge {
  x: number;
  y: number;
  z: number;
  /** Charge in coulombs. */
  q: number;
}

/** Coulomb field of a set of point charges (V/m). Adds nothing inside a tiny core to avoid NaN. */
export function coulombField(charges: PointCharge[], x: number, y: number, z: number, out: Float64Array): void {
  let ex = 0;
  let ey = 0;
  let ez = 0;
  for (let i = 0; i < charges.length; i++) {
    const c = charges[i];
    const dx = x - c.x;
    const dy = y - c.y;
    const dz = z - c.z;
    const r2 = dx * dx + dy * dy + dz * dz;
    if (r2 < 1e-14) continue;
    const f = (K_E * c.q) / (r2 * Math.sqrt(r2));
    ex += f * dx;
    ey += f * dy;
    ez += f * dz;
  }
  out[0] = ex;
  out[1] = ey;
  out[2] = ez;
}

// ---------------------------------------------------------------------------
// Closed surfaces and surface integration
// ---------------------------------------------------------------------------

export type Shape = 'sphere' | 'cube';

export interface Surface {
  shape: Shape;
  cx: number;
  cy: number;
  cz: number;
  /** Sphere radius, or cube half-edge. */
  size: number;
}

/** Negative inside, positive outside, zero on the surface. */
export function surfaceLevel(s: Surface, x: number, y: number, z: number): number {
  const dx = x - s.cx;
  const dy = y - s.cy;
  const dz = z - s.cz;
  if (s.shape === 'sphere') return Math.sqrt(dx * dx + dy * dy + dz * dz) - s.size;
  return Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) - s.size;
}

/** Gauss–Legendre nodes and weights on [-1, 1] (Newton iteration on P_n). */
export function gaussLegendre(n: number): { x: Float64Array; w: Float64Array } {
  const x = new Float64Array(n);
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let z = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5));
    let dp = 0;
    for (let it = 0; it < 100; it++) {
      let p0 = 1;
      let p1 = z;
      for (let k = 2; k <= n; k++) {
        const p2 = ((2 * k - 1) * z * p1 - (k - 1) * p0) / k;
        p0 = p1;
        p1 = p2;
      }
      dp = (n * (z * p1 - p0)) / (z * z - 1);
      const dz = p1 / dp;
      z -= dz;
      if (Math.abs(dz) < 1e-15) break;
    }
    x[i] = z;
    w[i] = 2 / ((1 - z * z) * dp * dp);
  }
  return { x, w };
}

/** Composite Gauss–Legendre rule on [a, b] with `panels` panels of `order` points each. */
export function compositeRule(a: number, b: number, panels: number, order: number): { x: Float64Array; w: Float64Array } {
  const g = gaussLegendre(order);
  const n = panels * order;
  const x = new Float64Array(n);
  const w = new Float64Array(n);
  const hw = (b - a) / panels / 2;
  for (let p = 0; p < panels; p++) {
    const mid = a + (2 * p + 1) * hw;
    for (let k = 0; k < order; k++) {
      x[p * order + k] = mid + hw * g.x[k];
      w[p * order + k] = hw * g.w[k];
    }
  }
  return { x, w };
}

export interface FluxResult {
  /** Net outward flux ∮ F·dA. */
  net: number;
  /** Outward part only, ∮ max(F·n, 0) dA. */
  out: number;
  /** Inward part only, as a positive number. */
  inn: number;
}

export interface FluxOptions {
  /** Composite panels per direction (default 8). */
  panels?: number;
  /** Gauss points per panel (default 6). */
  order?: number;
  /** Azimuth samples for the sphere (default 96, trapezoid, spectrally accurate). */
  nPhi?: number;
}

const tmp = new Float64Array(3);

/** Net outward flux of a vector field through a closed sphere or cube, by numerical surface integration. */
export function surfaceFlux(F: Vec3Fn, s: Surface, opts: FluxOptions = {}): FluxResult {
  const panels = opts.panels ?? 8;
  const order = opts.order ?? 6;
  let net = 0;
  let out = 0;
  let inn = 0;
  const add = (fn: number, w: number) => {
    const v = fn * w;
    net += v;
    if (v > 0) out += v;
    else inn -= v;
  };
  if (s.shape === 'sphere') {
    const R = s.size;
    const u = compositeRule(-1, 1, panels, order);
    const nPhi = opts.nPhi ?? 96;
    const dphi = (2 * Math.PI) / nPhi;
    for (let i = 0; i < u.x.length; i++) {
      const ct = u.x[i];
      const st = Math.sqrt(Math.max(0, 1 - ct * ct));
      for (let j = 0; j < nPhi; j++) {
        const ph = (j + 0.5) * dphi;
        const nx = st * Math.cos(ph);
        const ny = ct;
        const nz = st * Math.sin(ph);
        F(s.cx + R * nx, s.cy + R * ny, s.cz + R * nz, tmp);
        add(tmp[0] * nx + tmp[1] * ny + tmp[2] * nz, R * R * u.w[i] * dphi);
      }
    }
  } else {
    const h = s.size;
    const r = compositeRule(-h, h, panels, order);
    const n = r.x.length;
    for (let axis = 0; axis < 3; axis++) {
      for (const sgn of [-1, 1]) {
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            const a = r.x[i];
            const b = r.x[j];
            let x = s.cx;
            let y = s.cy;
            let z = s.cz;
            if (axis === 0) { x += sgn * h; y += a; z += b; }
            else if (axis === 1) { y += sgn * h; x += a; z += b; }
            else { z += sgn * h; x += a; y += b; }
            F(x, y, z, tmp);
            add(sgn * tmp[axis], r.w[i] * r.w[j]);
          }
        }
      }
    }
  }
  return { net, out, inn };
}

/** Total charge strictly inside a surface, and how many charges are inside. */
export function enclosedCharge(charges: PointCharge[], s: Surface): { q: number; n: number; minGap: number } {
  let q = 0;
  let n = 0;
  let minGap = Infinity;
  for (const c of charges) {
    if (c.q === 0) continue;
    const lv = surfaceLevel(s, c.x, c.y, c.z);
    minGap = Math.min(minGap, Math.abs(lv));
    if (lv < 0) {
      q += c.q;
      n++;
    }
  }
  return { q, n, minGap };
}

// ---------------------------------------------------------------------------
// Magnetostatics: Biot–Savart for polygonal wire loops
// ---------------------------------------------------------------------------

export interface WireSet {
  /** Straight segments, 6 numbers each: ax, ay, az, bx, by, bz (current flows a → b). */
  seg: Float64Array;
  count: number;
  /** Current in amperes. */
  I: number;
}

/**
 * Circular loop discretized into n straight segments. Centre (cx, cy, cz), radius R, normal +y.
 * The current circulates so that B at the centre points along +y for I > 0.
 */
export function loopSegments(cx: number, cy: number, cz: number, R: number, n: number, into?: Float64Array, offset = 0): Float64Array {
  const seg = into ?? new Float64Array(n * 6);
  for (let k = 0; k < n; k++) {
    const a0 = (2 * Math.PI * k) / n;
    const a1 = (2 * Math.PI * (k + 1)) / n;
    const o = offset + k * 6;
    seg[o] = cx + R * Math.cos(a0);
    seg[o + 1] = cy;
    seg[o + 2] = cz - R * Math.sin(a0);
    seg[o + 3] = cx + R * Math.cos(a1);
    seg[o + 4] = cy;
    seg[o + 5] = cz - R * Math.sin(a1);
  }
  return seg;
}

/** A single loop of radius R at the origin, normal +y. */
export function currentLoop(R: number, I: number, n = 64): WireSet {
  return { seg: loopSegments(0, 0, 0, R, n), count: n, I };
}

/**
 * A bar magnet modelled by its equivalent surface current: a short solenoid of `turns`
 * coaxial loops (radius R, length L, axis y). North pole at +y for I > 0.
 */
export function barMagnet(R: number, L: number, turns: number, I: number, n = 40): WireSet {
  const seg = new Float64Array(turns * n * 6);
  for (let t = 0; t < turns; t++) {
    const y = -L / 2 + (L * (t + 0.5)) / turns;
    loopSegments(0, y, 0, R, n, seg, t * n * 6);
  }
  return { seg, count: turns * n, I };
}

/**
 * Biot–Savart field of the wire set. Each straight segment is integrated exactly:
 * B = μ0 I /(4π s) (cos α1 − cos α2) along û × r̂.
 */
export function biotSavart(w: WireSet, x: number, y: number, z: number, out: Float64Array): void {
  let bx = 0;
  let by = 0;
  let bz = 0;
  const s = w.seg;
  for (let k = 0; k < w.count; k++) {
    const o = k * 6;
    const ax = s[o];
    const ay = s[o + 1];
    const az = s[o + 2];
    let ux = s[o + 3] - ax;
    let uy = s[o + 4] - ay;
    let uz = s[o + 5] - az;
    const L = Math.sqrt(ux * ux + uy * uy + uz * uz);
    ux /= L;
    uy /= L;
    uz /= L;
    const r1x = x - ax;
    const r1y = y - ay;
    const r1z = z - az;
    const r2x = x - s[o + 3];
    const r2y = y - s[o + 4];
    const r2z = z - s[o + 5];
    const cx = uy * r1z - uz * r1y;
    const cy = uz * r1x - ux * r1z;
    const cz = ux * r1y - uy * r1x;
    const s2 = cx * cx + cy * cy + cz * cz;
    if (s2 < 1e-16) continue;
    const r1 = Math.sqrt(r1x * r1x + r1y * r1y + r1z * r1z);
    const r2 = Math.sqrt(r2x * r2x + r2y * r2y + r2z * r2z);
    const f = ((ux * r1x + uy * r1y + uz * r1z) / r1 - (ux * r2x + uy * r2y + uz * r2z) / r2) / s2;
    bx += f * cx;
    by += f * cy;
    bz += f * cz;
  }
  const k = (MU0 * w.I) / (4 * Math.PI);
  out[0] = k * bx;
  out[1] = k * by;
  out[2] = k * bz;
}

/** On-axis field of an ideal circular loop, μ0 I R² / (2 (R² + z²)^{3/2}). */
export function loopAxisField(I: number, R: number, z: number): number {
  return (MU0 * I * R * R) / (2 * Math.pow(R * R + z * z, 1.5));
}

/** Flux of a field through the flat disc of radius a at height y0, normal +y (polar Gauss–Legendre). */
export function discFluxY(F: Vec3Fn, a: number, y0: number, nr = 48, nphi = 64): number {
  const r = compositeRule(0, a, 8, nr / 8);
  let sum = 0;
  const dphi = (2 * Math.PI) / nphi;
  for (let i = 0; i < r.x.length; i++) {
    for (let j = 0; j < nphi; j++) {
      const ph = (j + 0.5) * dphi;
      F(r.x[i] * Math.cos(ph), y0, r.x[i] * Math.sin(ph), tmp);
      sum += tmp[1] * r.x[i] * r.w[i] * dphi;
    }
  }
  return sum;
}

// ---------------------------------------------------------------------------
// Faraday: a point dipole moving along the axis of a coil
// ---------------------------------------------------------------------------

/** Field of a point magnetic dipole m (A·m²) pointing along +x, located at (px, 0, 0). */
export function dipoleFieldX(m: number, px: number, x: number, y: number, z: number, out: Float64Array): void {
  const dx = x - px;
  const r2 = dx * dx + y * y + z * z;
  if (r2 < 1e-12) {
    out[0] = out[1] = out[2] = 0;
    return;
  }
  const r = Math.sqrt(r2);
  const k = (MU0 * m) / (4 * Math.PI * r2 * r2 * r);
  // B = μ0/(4π r^3) (3 (m·r̂) r̂ − m), with m = m x̂
  out[0] = k * (3 * dx * dx - r2);
  out[1] = k * 3 * dx * y;
  out[2] = k * 3 * dx * z;
}

/**
 * Flux of a point dipole through one circular turn of radius R, when the dipole sits on the
 * turn's axis at signed distance z. Exact: Φ = ∮A·dl = μ0 m R² / (2 (R² + z²)^{3/2}).
 */
export function dipoleTurnFlux(m: number, R: number, z: number): number {
  return (MU0 * m * R * R) / (2 * Math.pow(R * R + z * z, 1.5));
}

/** dΦ/dz for one turn. */
export function dipoleTurnFluxDz(m: number, R: number, z: number): number {
  return (-3 * MU0 * m * R * R * z) / (2 * Math.pow(R * R + z * z, 2.5));
}

export interface CoilParams {
  /** Magnet moment in A·m², signed: positive means north pole toward +x. */
  m: number;
  /** Coil radius (m). */
  R: number;
  /** Number of turns. */
  N: number;
  /** Coil length (m), centred on x = 0. */
  L: number;
}

export function turnX(p: CoilParams, k: number): number {
  return p.N === 1 ? 0 : -p.L / 2 + (p.L * (k + 0.5)) / p.N;
}

/** Total flux linkage N·Φ (sum over turns) with the magnet centre at xm. */
export function coilLinkage(p: CoilParams, xm: number): number {
  let s = 0;
  for (let k = 0; k < p.N; k++) s += dipoleTurnFlux(p.m, p.R, xm - turnX(p, k));
  return s;
}

/** EMF = −d(NΦ)/dt = −Σ dΦ/dz · v, for a magnet at xm moving with velocity v along x. */
export function coilEmf(p: CoilParams, xm: number, v: number): number {
  let s = 0;
  for (let k = 0; k < p.N; k++) s += dipoleTurnFluxDz(p.m, p.R, xm - turnX(p, k));
  return -s * v;
}

// ---------------------------------------------------------------------------
// Ampère–Maxwell: a straight wire charging a parallel-plate capacitor
// ---------------------------------------------------------------------------

export interface CapParams {
  /** Current in the wire (A), flowing along +x. */
  I: number;
  /** Plate radius (m). */
  a: number;
  /** Plate gap (m), centred on x = 0. */
  d: number;
}

export function inGap(p: CapParams, x: number): boolean {
  return Math.abs(x) < p.d / 2;
}

/**
 * Azimuthal B around the x axis. Along the wire: μ0 I/(2π s). In the gap the displacement current
 * density I/(π a²) is uniform over the plates (no fringing): μ0 I s/(2π a²) for s < a.
 */
export function capB(p: CapParams, x: number, y: number, z: number, out: Float64Array): void {
  const s2 = y * y + z * z;
  if (s2 < 1e-12) {
    out[0] = out[1] = out[2] = 0;
    return;
  }
  const s = Math.sqrt(s2);
  let b: number;
  if (inGap(p, x) && s < p.a) b = (MU0 * p.I * s) / (2 * Math.PI * p.a * p.a);
  else b = (MU0 * p.I) / (2 * Math.PI * s);
  out[0] = 0;
  out[1] = (-b * z) / s;
  out[2] = (b * y) / s;
}

/** Numerical line integral ∮ B·dl around the circle of radius r centred on the axis at x0. */
export function circulation(F: Vec3Fn, x0: number, r: number, n = 256): number {
  let sum = 0;
  const dph = (2 * Math.PI) / n;
  for (let k = 0; k < n; k++) {
    const ph = (k + 0.5) * dph;
    const y = r * Math.cos(ph);
    const z = r * Math.sin(ph);
    F(x0, y, z, tmp);
    // tangent for right-handed circulation about +x: (0, −sin, cos)
    sum += (-tmp[1] * Math.sin(ph) + tmp[2] * Math.cos(ph)) * r * dph;
  }
  return sum;
}

/**
 * Currents through the flat disc bounded by that circle.
 * Conduction current only where the disc cuts the wire. Displacement current ε0 dΦ_E/dt only in the gap,
 * where E = Q/(ε0 π a²) is uniform over the plates, so I_d = I · min(r, a)²/a².
 */
export function enclosedCurrents(p: CapParams, x0: number, r: number): { Ic: number; Id: number } {
  if (!inGap(p, x0)) return { Ic: p.I, Id: 0 };
  const f = Math.min(r, p.a) / p.a;
  return { Ic: 0, Id: p.I * f * f };
}

/** Uniform field between the plates for charge Q (V/m). */
export function gapField(p: CapParams, Q: number): number {
  return Q / (EPS0 * Math.PI * p.a * p.a);
}

// ---------------------------------------------------------------------------
// Field-line tracing (shared by the views)
// ---------------------------------------------------------------------------

export interface TraceOptions {
  /** Step length as a function of position. */
  step: (x: number, y: number, z: number) => number;
  /** Return true to stop at this point. */
  stop: (x: number, y: number, z: number, travelled: number) => boolean;
  maxSteps: number;
}

const traceTmp = new Float64Array(3);

/**
 * Trace a field line with a normalized midpoint (RK2) step, writing xyz into out from `offset` (in floats).
 * dir = +1 follows the field, −1 runs against it. Returns the number of points written.
 */
export function traceLine(F: Vec3Fn, x0: number, y0: number, z0: number, dir: number, opt: TraceOptions, out: Float32Array, offset: number, maxPts: number): number {
  let x = x0;
  let y = y0;
  let z = z0;
  let n = 0;
  let travelled = 0;
  const lim = Math.min(maxPts, opt.maxSteps + 1);
  const b = traceTmp;
  while (n < lim) {
    out[offset + n * 3] = x;
    out[offset + n * 3 + 1] = y;
    out[offset + n * 3 + 2] = z;
    n++;
    if (n > 1 && opt.stop(x, y, z, travelled)) break;
    const h = opt.step(x, y, z);
    F(x, y, z, b);
    let m = Math.hypot(b[0], b[1], b[2]);
    if (m === 0 || !Number.isFinite(m)) break;
    const mx = x + (0.5 * h * dir * b[0]) / m;
    const my = y + (0.5 * h * dir * b[1]) / m;
    const mz = z + (0.5 * h * dir * b[2]) / m;
    F(mx, my, mz, b);
    m = Math.hypot(b[0], b[1], b[2]);
    if (m === 0 || !Number.isFinite(m)) break;
    x += (h * dir * b[0]) / m;
    y += (h * dir * b[1]) / m;
    z += (h * dir * b[2]) / m;
    travelled += h;
  }
  return n;
}

/** Evenly spread unit vectors (Fibonacci sphere). */
export function fibonacciDirs(n: number): Float64Array {
  const d = new Float64Array(n * 3);
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const yy = n === 1 ? 0 : 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - yy * yy);
    const th = ga * i + 0.3;
    d[i * 3] = r * Math.cos(th);
    d[i * 3 + 1] = yy;
    d[i * 3 + 2] = r * Math.sin(th);
  }
  return d;
}

/**
 * Signed count of crossings of a polyline through a closed surface.
 * +1 for each crossing from inside to outside along the polyline, −1 for outside to inside.
 */
export function signedCrossings(s: Surface, pts: Float32Array, offset: number, n: number): number {
  let c = 0;
  let prev = surfaceLevel(s, pts[offset], pts[offset + 1], pts[offset + 2]);
  for (let i = 1; i < n; i++) {
    const o = offset + i * 3;
    const lv = surfaceLevel(s, pts[o], pts[o + 1], pts[o + 2]);
    if (prev < 0 && lv >= 0) c++;
    else if (prev >= 0 && lv < 0) c--;
    prev = lv;
  }
  return c;
}
