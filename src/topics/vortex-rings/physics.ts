// Vortex filaments in an ideal fluid. Each ring is a closed polyline carrying a
// circulation Gamma. Velocities come from the Biot-Savart law with a
// Rosenhead-Moore core: |r|^3 is replaced by (|r|^2 + delta^2)^(3/2).
// A plane wall is modelled with an image ring. Classical RK4 in time.
// Pure module: no DOM, no Three.js. Scaled units, fluid density = 1.

const INV4PI = 1 / (4 * Math.PI);

/**
 * Rosenhead-Moore smoothing length that reproduces Kelvin's thin-ring speed for a
 * core of uniform vorticity and radius a. The smoothed kernel gives
 * U = Gamma/(4 pi R) (ln(8R/delta) - 1), and Kelvin's solid core gives
 * U = Gamma/(4 pi R) (ln(8R/a) - 1/4). They agree when delta = a e^(-3/4).
 */
export function rmDelta(a: number): number {
  return a * Math.exp(-0.75);
}

/** Kelvin's speed of a thin ring with a uniform-vorticity core of radius a. */
export function kelvinSpeed(gamma: number, R: number, a: number): number {
  return (gamma / (4 * Math.PI * R)) * (Math.log((8 * R) / a) - 0.25);
}

/** Impulse of a circular ring of radius R (density 1): P = Gamma pi R^2. */
export function ringImpulse(gamma: number, R: number): number {
  return gamma * Math.PI * R * R;
}

/**
 * Exact velocity induced at p by a straight segment a -> b with circulation gamma
 * (no core). |u| = Gamma/(4 pi h) (cos th1 - cos th2), directed along dl x r.
 */
export function segmentVelocity(
  gamma: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  px: number, py: number, pz: number,
  out: Float64Array,
): void {
  const r1x = px - ax, r1y = py - ay, r1z = pz - az;
  const r2x = px - bx, r2y = py - by, r2z = pz - bz;
  const cx = r1y * r2z - r1z * r2y;
  const cy = r1z * r2x - r1x * r2z;
  const cz = r1x * r2y - r1y * r2x;
  const c2 = cx * cx + cy * cy + cz * cz;
  const r1 = Math.hypot(r1x, r1y, r1z);
  const r2 = Math.hypot(r2x, r2y, r2z);
  const lx = bx - ax, ly = by - ay, lz = bz - az;
  // (cos th1 - cos th2) |L| = L.(r1/|r1| - r2/|r2|)
  const k = (lx * (r1x / r1 - r2x / r2) + ly * (r1y / r1 - r2y / r2) + lz * (r1z / r1 - r2z / r2)) * gamma * INV4PI / c2;
  out[0] = k * cx;
  out[1] = k * cy;
  out[2] = k * cz;
}

/**
 * Midpoint-rule Biot-Savart sum for an open or closed polyline pts (xyz triples),
 * evaluated at p. With delta = 0 and fine pieces it converges to the exact line integral.
 */
export function polylineVelocity(
  gamma: number, pts: Float64Array, n: number, closed: boolean, delta: number,
  px: number, py: number, pz: number, out: Float64Array,
): void {
  let ux = 0, uy = 0, uz = 0;
  const d2 = delta * delta;
  const segs = closed ? n : n - 1;
  for (let j = 0; j < segs; j++) {
    const a = j * 3;
    const b = ((j + 1) % n) * 3;
    const lx = pts[b] - pts[a], ly = pts[b + 1] - pts[a + 1], lz = pts[b + 2] - pts[a + 2];
    const rx = px - 0.5 * (pts[a] + pts[b]);
    const ry = py - 0.5 * (pts[a + 1] + pts[b + 1]);
    const rz = pz - 0.5 * (pts[a + 2] + pts[b + 2]);
    const q = rx * rx + ry * ry + rz * rz + d2;
    const f = 1 / (q * Math.sqrt(q));
    ux += f * (ly * rz - lz * ry);
    uy += f * (lz * rx - lx * rz);
    uz += f * (lx * ry - ly * rx);
  }
  out[0] = ux * gamma * INV4PI;
  out[1] = uy * gamma * INV4PI;
  out[2] = uz * gamma * INV4PI;
}

// ---------------------------------------------------------------- polygon correction

/**
 * A polygon with straight segments misses part of a curved filament's own pull.
 * Near a node the curve bends away from the chord by the sagitta, and the midpoint
 * rule samples the chord. For a node with spacing ds on a curve of curvature k, the
 * missing velocity is Gamma k / (8 pi) * Gp(ds / delta) along the binormal, where
 * Gp(rho) = int s^2/(s^2+1)^(3/2) ds - sum_m 2 rho^3 m(m+1) / (((m+1/2) rho)^2 + 1)^(3/2).
 * Gp -> 0 as ds / delta -> 0, so the correction vanishes for a fine polygon.
 */
export function polygonGap(rho: number, M = 6000): number {
  const L = M * rho;
  let sum = 0;
  for (let m = 0; m < M; m++) {
    const s = (m + 0.5) * rho;
    const q = s * s + 1;
    sum += (m * (m + 1)) / (q * Math.sqrt(q));
  }
  return 2 * (Math.asinh(L) - L / Math.sqrt(L * L + 1)) - 2 * rho * rho * rho * sum;
}

const GAP_LO = Math.log(0.05);
const GAP_HI = Math.log(200);
const GAP_N = 240;
const gapTable = new Float64Array(GAP_N + 1);
for (let i = 0; i <= GAP_N; i++) gapTable[i] = polygonGap(Math.exp(GAP_LO + ((GAP_HI - GAP_LO) * i) / GAP_N));

/** Table lookup of polygonGap, linear in ln(rho). */
export function polygonGapFast(rho: number): number {
  if (rho <= 0.05) return 0;
  const u = ((Math.log(rho) - GAP_LO) / (GAP_HI - GAP_LO)) * GAP_N;
  if (u >= GAP_N) return gapTable[GAP_N];
  const i = Math.floor(u);
  const f = u - i;
  return gapTable[i] * (1 - f) + gapTable[i + 1] * f;
}

export type Preset = 'single' | 'leapfrog' | 'collision' | 'wall';

export interface RingSpec {
  /** Radius. */
  R: number;
  /** Axial position of the ring centre. */
  z: number;
  /** Circulation. Positive moves the ring toward +z. */
  gamma: number;
}

/**
 * A set of closed vortex filaments with N points each, all sharing one core size.
 * Optional plane wall at z = wallZ, enforced by mirror-image rings of opposite circulation.
 */
export class VortexSystem {
  readonly N: number;
  readonly nr: number;
  readonly gamma: Float64Array;
  /** Positions, ring-major: ring k point j at 3(kN + j). */
  readonly pos: Float64Array;
  a: number;
  delta: number;
  wallZ: number | null;
  /** Add the polygon sagitta correction to each node's own velocity. */
  correct = true;
  t = 0;
  private k1: Float64Array;
  private k2: Float64Array;
  private k3: Float64Array;
  private k4: Float64Array;
  private tmp: Float64Array;
  private readonly v3 = new Float64Array(3);
  private curv: Float64Array;

  constructor(rings: RingSpec[], N: number, a: number, wallZ: number | null = null) {
    this.N = N;
    this.nr = rings.length;
    this.gamma = new Float64Array(rings.map((r) => r.gamma));
    this.pos = new Float64Array(3 * N * this.nr);
    this.a = a;
    this.delta = rmDelta(a);
    this.wallZ = wallZ;
    const m = this.pos.length;
    this.k1 = new Float64Array(m);
    this.k2 = new Float64Array(m);
    this.k3 = new Float64Array(m);
    this.k4 = new Float64Array(m);
    this.tmp = new Float64Array(m);
    this.curv = new Float64Array(4 * N * this.nr);
    rings.forEach((r, k) => {
      for (let j = 0; j < N; j++) {
        const th = (2 * Math.PI * j) / N;
        const o = 3 * (k * N + j);
        // Counter-clockwise seen from +z: with gamma > 0 the ring moves toward +z.
        this.pos[o] = r.R * Math.cos(th);
        this.pos[o + 1] = r.R * Math.sin(th);
        this.pos[o + 2] = r.z;
      }
    });
  }

  /** Velocity at (x, y, z) induced by the filaments in state s, written into out. */
  velocityAt(s: Float64Array, x: number, y: number, z: number, out: Float64Array): void {
    const N = this.N;
    const d2 = this.delta * this.delta;
    const wall = this.wallZ;
    let ux = 0, uy = 0, uz = 0;
    for (let k = 0; k < this.nr; k++) {
      const g = this.gamma[k] * INV4PI;
      const base = 3 * k * N;
      let sx = 0, sy = 0, sz = 0, ix = 0, iy = 0, iz = 0;
      for (let j = 0; j < N; j++) {
        const a = base + 3 * j;
        const b = base + 3 * (j + 1 === N ? 0 : j + 1);
        const ax = s[a], ay = s[a + 1], az = s[a + 2];
        const bx = s[b], by = s[b + 1], bz = s[b + 2];
        const lx = bx - ax, ly = by - ay, lz = bz - az;
        const mx = 0.5 * (ax + bx), my = 0.5 * (ay + by), mz = 0.5 * (az + bz);
        let rx = x - mx, ry = y - my, rz = z - mz;
        let q = rx * rx + ry * ry + rz * rz + d2;
        let f = 1 / (q * Math.sqrt(q));
        sx += f * (ly * rz - lz * ry);
        sy += f * (lz * rx - lx * rz);
        sz += f * (lx * ry - ly * rx);
        if (wall !== null) {
          // Image: mirror in z = wall, same point order, opposite circulation.
          const mz2 = 2 * wall - mz;
          const lz2 = -lz;
          rz = z - mz2;
          q = rx * rx + ry * ry + rz * rz + d2;
          f = 1 / (q * Math.sqrt(q));
          ix += f * (ly * rz - lz2 * ry);
          iy += f * (lz2 * rx - lx * rz);
          iz += f * (lx * ry - ly * rx);
        }
      }
      ux += g * (sx - ix);
      uy += g * (sy - iy);
      uz += g * (sz - iz);
    }
    out[0] = ux;
    out[1] = uy;
    out[2] = uz;
  }

  /** Velocities of every filament point for state s. */
  private rhs(s: Float64Array, out: Float64Array): void {
    const v = this.v3;
    const m = s.length;
    for (let i = 0; i < m; i += 3) {
      this.velocityAt(s, s[i], s[i + 1], s[i + 2], v);
      out[i] = v[0];
      out[i + 1] = v[1];
      out[i + 2] = v[2];
    }
    if (!this.correct) return;
    // Local curvature data per node: unit tangent t, curvature vector k n, spacing ds.
    const N = this.N;
    const cv = this.curv;
    for (let k = 0; k < this.nr; k++) {
      const base = 3 * k * N;
      for (let j = 0; j < N; j++) {
        const o = base + 3 * j;
        const p = base + 3 * (j === 0 ? N - 1 : j - 1);
        const q = base + 3 * (j + 1 === N ? 0 : j + 1);
        const ax = s[o] - s[p], ay = s[o + 1] - s[p + 1], az = s[o + 2] - s[p + 2];
        const bx = s[q] - s[o], by = s[q + 1] - s[o + 1], bz = s[q + 2] - s[o + 2];
        const la = Math.sqrt(ax * ax + ay * ay + az * az);
        const lb = Math.sqrt(bx * bx + by * by + bz * bz);
        const ds = 0.5 * (la + lb);
        const cx = (bx / lb - ax / la) / ds, cy = (by / lb - ay / la) / ds, cz = (bz / lb - az / la) / ds;
        let tx = ax + bx, ty = ay + by, tz = az + bz;
        const tl = 1 / Math.sqrt(tx * tx + ty * ty + tz * tz);
        tx *= tl; ty *= tl; tz *= tl;
        // b k = t x (k n), and the spacing.
        const c4 = 4 * (k * N + j);
        cv[c4] = ty * cz - tz * cy;
        cv[c4 + 1] = tz * cx - tx * cz;
        cv[c4 + 2] = tx * cy - ty * cx;
        cv[c4 + 3] = ds;
      }
    }
    const d2 = this.delta * this.delta;
    const inv = 1 / this.delta;
    const wall = this.wallZ;
    for (let k = 0; k < this.nr; k++) {
      for (let j = 0; j < N; j++) {
        const o = 3 * (k * N + j);
        const x = s[o], y = s[o + 1], z = s[o + 2];
        // Own filament.
        const c4 = 4 * (k * N + j);
        let f = (this.gamma[k] / (8 * Math.PI)) * polygonGapFast(cv[c4 + 3] * inv);
        let ux = f * cv[c4], uy = f * cv[c4 + 1], uz = f * cv[c4 + 2];
        // Other rings and images are resolved just as coarsely, which matters only
        // when they come within a few segment lengths. All rings share one angular
        // grid, so the matching node j stands in for the nearest point.
        for (let kk = 0; kk < this.nr; kk++) {
          const oo = 3 * (kk * N + j);
          const cc = 4 * (kk * N + j);
          const g8 = this.gamma[kk] / (8 * Math.PI);
          if (kk !== k) {
            const dx = x - s[oo], dy = y - s[oo + 1], dz = z - s[oo + 2];
            const r = Math.sqrt(dx * dx + dy * dy + dz * dz + d2);
            f = g8 * polygonGapFast(cv[cc + 3] / r);
            ux += f * cv[cc];
            uy += f * cv[cc + 1];
            uz += f * cv[cc + 2];
          }
          if (wall !== null) {
            // Image: z mirrored, circulation reversed, so -Gamma (-M b) = Gamma M b.
            const dx = x - s[oo], dy = y - s[oo + 1], dz = z - (2 * wall - s[oo + 2]);
            const r = Math.sqrt(dx * dx + dy * dy + dz * dz + d2);
            f = g8 * polygonGapFast(cv[cc + 3] / r);
            ux += f * cv[cc];
            uy += f * cv[cc + 1];
            uz -= f * cv[cc + 2];
          }
        }
        out[o] += ux;
        out[o + 1] += uy;
        out[o + 2] += uz;
      }
    }
  }

  /** One classical RK4 step of size h. */
  step(h: number): void {
    const s = this.pos, t = this.tmp, m = s.length;
    this.rhs(s, this.k1);
    for (let i = 0; i < m; i++) t[i] = s[i] + 0.5 * h * this.k1[i];
    this.rhs(t, this.k2);
    for (let i = 0; i < m; i++) t[i] = s[i] + 0.5 * h * this.k2[i];
    this.rhs(t, this.k3);
    for (let i = 0; i < m; i++) t[i] = s[i] + h * this.k3[i];
    this.rhs(t, this.k4);
    const h6 = h / 6;
    for (let i = 0; i < m; i++) s[i] += h6 * (this.k1[i] + 2 * this.k2[i] + 2 * this.k3[i] + this.k4[i]);
    this.t += h;
  }

  /**
   * Smallest distance between a node and the matching node of another ring or of an
   * image, divided by the local node spacing. Below about 1 the polygon can no longer
   * resolve the two cores and the model should stop. Infinity for a lone ring.
   */
  closeness(): number {
    const N = this.N, s = this.pos, wall = this.wallZ;
    let best = Infinity;
    for (let k = 0; k < this.nr; k++) {
      for (let j = 0; j < N; j++) {
        const o = 3 * (k * N + j);
        const q = 3 * (k * N + (j + 1 === N ? 0 : j + 1));
        const ds = Math.hypot(s[q] - s[o], s[q + 1] - s[o + 1], s[q + 2] - s[o + 2]);
        for (let kk = k + 1; kk < this.nr; kk++) {
          const oo = 3 * (kk * N + j);
          const d = Math.hypot(s[o] - s[oo], s[o + 1] - s[oo + 1], s[o + 2] - s[oo + 2]);
          if (d / ds < best) best = d / ds;
        }
        if (wall !== null) {
          const d = 2 * Math.abs(wall - s[o + 2]);
          if (d / ds < best) best = d / ds;
        }
      }
    }
    return best;
  }

  /** Centroid of ring k. */
  centroid(k: number, out: Float64Array): void {
    let x = 0, y = 0, z = 0;
    const N = this.N, s = this.pos;
    for (let j = 0; j < N; j++) {
      const o = 3 * (k * N + j);
      x += s[o];
      y += s[o + 1];
      z += s[o + 2];
    }
    out[0] = x / N;
    out[1] = y / N;
    out[2] = z / N;
  }

  /** Mean distance of ring k's points from its centroid. */
  radius(k: number): number {
    const c = this.v3;
    this.centroid(k, c);
    const N = this.N, s = this.pos;
    let r = 0;
    for (let j = 0; j < N; j++) {
      const o = 3 * (k * N + j);
      r += Math.hypot(s[o] - c[0], s[o + 1] - c[1], s[o + 2] - c[2]);
    }
    return r / N;
  }

  /** Axial position (mean z) of ring k. */
  axialZ(k: number): number {
    const N = this.N, s = this.pos;
    let z = 0;
    for (let j = 0; j < N; j++) z += s[3 * (k * N + j) + 2];
    return z / N;
  }

  /**
   * Total hydrodynamic impulse P = (1/2) sum_k Gamma_k oint x x dl, density 1.
   * Conserved exactly by Biot-Savart flow when there is no wall.
   */
  impulse(out: Float64Array): void {
    const N = this.N, s = this.pos;
    let px = 0, py = 0, pz = 0;
    for (let k = 0; k < this.nr; k++) {
      let sx = 0, sy = 0, sz = 0;
      for (let j = 0; j < N; j++) {
        const a = 3 * (k * N + j);
        const b = 3 * (k * N + (j + 1 === N ? 0 : j + 1));
        const lx = s[b] - s[a], ly = s[b + 1] - s[a + 1], lz = s[b + 2] - s[a + 2];
        const mx = 0.5 * (s[a] + s[b]), my = 0.5 * (s[a + 1] + s[b + 1]), mz = 0.5 * (s[a + 2] + s[b + 2]);
        sx += my * lz - mz * ly;
        sy += mz * lx - mx * lz;
        sz += mx * ly - my * lx;
      }
      const g = 0.5 * this.gamma[k];
      px += g * sx;
      py += g * sy;
      pz += g * sz;
    }
    out[0] = px;
    out[1] = py;
    out[2] = pz;
  }

  /**
   * Advance passive tracers (xyz triples in tr) by h with classical RK4, with the
   * filaments frozen. RK4 keeps tracers circling a core from spiralling in or out.
   * Tracers that cross the wall are mirrored back.
   */
  advect(tr: Float32Array, count: number, h: number): void {
    const v = this.v3, s = this.pos, wall = this.wallZ;
    const h2 = 0.5 * h, h6 = h / 6;
    for (let i = 0; i < count; i++) {
      const o = 3 * i;
      const x = tr[o], y = tr[o + 1], z = tr[o + 2];
      this.velocityAt(s, x, y, z, v);
      let sx = v[0], sy = v[1], sz = v[2];
      this.velocityAt(s, x + h2 * v[0], y + h2 * v[1], z + h2 * v[2], v);
      sx += 2 * v[0]; sy += 2 * v[1]; sz += 2 * v[2];
      this.velocityAt(s, x + h2 * v[0], y + h2 * v[1], z + h2 * v[2], v);
      sx += 2 * v[0]; sy += 2 * v[1]; sz += 2 * v[2];
      this.velocityAt(s, x + h * v[0], y + h * v[1], z + h * v[2], v);
      tr[o] = x + h6 * (sx + v[0]);
      tr[o + 1] = y + h6 * (sy + v[1]);
      let nz = z + h6 * (sz + v[2]);
      if (wall !== null && nz > wall) nz = 2 * wall - nz;
      tr[o + 2] = nz;
    }
  }
}

/**
 * A lighter copy of a system for moving smoke: every stride-th node only.
 * The core is widened to a third of the coarse spacing so the flow near the
 * filament stays smooth. Only the tracers use it. The rings themselves always
 * move with the full-resolution system.
 */
export function coarseCopy(sys: VortexSystem, stride: number): VortexSystem {
  const n = Math.floor(sys.N / stride);
  const specs = Array.from(sys.gamma, (g) => ({ R: 1, z: 0, gamma: g }));
  const c = new VortexSystem(specs, n, sys.a, sys.wallZ);
  syncCoarse(c, sys, stride);
  return c;
}

/** Copy the current node positions of sys into its coarse copy. */
export function syncCoarse(c: VortexSystem, sys: VortexSystem, stride: number): void {
  const n = c.N;
  for (let k = 0; k < sys.nr; k++) {
    for (let j = 0; j < n; j++) {
      const o = 3 * (k * n + j);
      const q = 3 * (k * sys.N + j * stride);
      c.pos[o] = sys.pos[q];
      c.pos[o + 1] = sys.pos[q + 1];
      c.pos[o + 2] = sys.pos[q + 2];
    }
  }
  let ds = 0;
  for (let k = 0; k < c.nr; k++) {
    const o = 3 * k * n;
    ds = Math.max(ds, Math.hypot(c.pos[o + 3] - c.pos[o], c.pos[o + 4] - c.pos[o + 1], c.pos[o + 5] - c.pos[o + 2]));
  }
  c.delta = Math.max(sys.delta, ds / 3);
}

export interface PresetParams {
  gamma: number;
  R: number;
  a: number;
  /** Separation between the two rings (or ring to wall distance, in the wall preset). */
  sep: number;
}

/** Build the filament system for a preset. N points per ring. */
export function buildPreset(preset: Preset, p: PresetParams, N: number): VortexSystem {
  switch (preset) {
    case 'single':
      return new VortexSystem([{ R: p.R, z: 0, gamma: p.gamma }], N, p.a);
    case 'leapfrog':
      return new VortexSystem([
        { R: p.R, z: 0, gamma: p.gamma },
        { R: p.R, z: p.sep, gamma: p.gamma },
      ], N, p.a);
    case 'collision':
      return new VortexSystem([
        { R: p.R, z: -p.sep / 2, gamma: p.gamma },
        { R: p.R, z: p.sep / 2, gamma: -p.gamma },
      ], N, p.a);
    case 'wall':
      return new VortexSystem([{ R: p.R, z: -p.sep, gamma: p.gamma }], N, p.a, 0);
  }
}

/**
 * RK4 step for filaments with node spacing ds. The stiffest motion is a kink one
 * segment long, which turns at a rate of about Gamma / ds^2, so h scales as ds^2 / Gamma.
 */
export function stepSize(gamma: number, ds: number): number {
  return Math.min(0.05, (8 * ds * ds) / Math.max(0.1, Math.abs(gamma)));
}
