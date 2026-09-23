// Lattice Boltzmann method, D2Q9 lattice with the BGK collision operator.
// Pure module: no DOM, no Three.js. Lattice units throughout: one cell = 1, one step = 1.
// Kinematic viscosity nu = (tau - 1/2) / 3, speed of sound c_s = 1/sqrt(3).

/** D2Q9 velocity set: rest, 4 axis links, 4 diagonals. */
export const CX = new Int8Array([0, 1, 0, -1, 0, 1, -1, -1, 1]);
export const CY = new Int8Array([0, 0, 1, 0, -1, 1, 1, -1, -1]);
export const W = new Float64Array([4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36]);
/** Index of the opposite direction, for bounce-back. */
export const OPP = new Int8Array([0, 3, 4, 1, 2, 7, 8, 5, 6]);

export const tauFromNu = (nu: number) => 3 * nu + 0.5;
export const nuFromTau = (tau: number) => (tau - 0.5) / 3;
/** Reynolds number Re = U D / nu. */
export const reynolds = (U: number, D: number, nu: number) => (U * D) / nu;
/** Strouhal number St = f D / U. */
export const strouhal = (f: number, D: number, U: number) => (f * D) / U;
/** Williamson's (1988) empirical fit for a circular cylinder, 50 < Re < 180. */
export const williamsonSt = (Re: number) => 0.2175 - 5.1064 / Re;

/** Equilibrium distribution for direction i. */
export function feq(i: number, rho: number, ux: number, uy: number): number {
  const cu = 3 * (CX[i] * ux + CY[i] * uy);
  return W[i] * rho * (1 + cu + 0.5 * cu * cu - 1.5 * (ux * ux + uy * uy));
}

export type Boundary = 'tunnel' | 'periodic';

export interface LatticeOptions {
  nx: number;
  ny: number;
  /** tunnel: inflow at x = 0, far-field rows at the top and bottom, zero-gradient outflow at the right.
   *  periodic: wraps in both directions (walls come from the solid mask). */
  boundary?: Boundary;
  tau?: number;
  /** Inflow speed (tunnel) in cells per step. */
  u0?: number;
  /** Uniform body force along x (Guo forcing). */
  fx?: number;
}

export class Lattice {
  readonly nx: number;
  readonly ny: number;
  readonly n: number;
  readonly boundary: Boundary;
  f: Float32Array;
  private g: Float32Array;
  readonly solid: Uint8Array;
  readonly rho: Float64Array;
  readonly ux: Float64Array;
  readonly uy: Float64Array;
  tau: number;
  u0: number;
  fx: number;
  steps = 0;
  /** 1 where a fluid cell touches a solid cell (needs the bounce-back path). */
  private near: Uint8Array;
  private nearDirty = true;

  constructor(o: LatticeOptions) {
    this.nx = o.nx;
    this.ny = o.ny;
    this.n = o.nx * o.ny;
    this.boundary = o.boundary ?? 'tunnel';
    this.tau = o.tau ?? 0.6;
    this.u0 = o.u0 ?? 0.1;
    this.fx = o.fx ?? 0;
    this.f = new Float32Array(9 * this.n);
    this.g = new Float32Array(9 * this.n);
    this.solid = new Uint8Array(this.n);
    this.rho = new Float64Array(this.n);
    this.ux = new Float64Array(this.n);
    this.uy = new Float64Array(this.n);
    this.near = new Uint8Array(this.n);
    this.fill(1, this.boundary === 'tunnel' ? this.u0 : 0, 0);
  }

  /** Set every fluid cell to equilibrium at (rho, ux, uy). Solid cells get u = 0. */
  fill(rho: number, ux: number, uy: number): void {
    for (let k = 0; k < this.n; k++) {
      const s = this.solid[k];
      this.setCell(k, rho, s ? 0 : ux, s ? 0 : uy);
    }
  }

  /** Put cell k at equilibrium with the given moments. */
  setCell(k: number, rho: number, ux: number, uy: number): void {
    const n = this.n;
    for (let i = 0; i < 9; i++) this.f[i * n + k] = feq(i, rho, ux, uy);
    this.rho[k] = rho;
    this.ux[k] = ux;
    this.uy[k] = uy;
  }

  /** Re-impose the inflow and far-field rows after a change of u0. */
  applyInflow(): void {
    if (this.boundary !== 'tunnel') return;
    const { nx, ny, u0 } = this;
    for (let x = 0; x < nx; x++) {
      this.setCell(x, 1, u0, 0);
      this.setCell((ny - 1) * nx + x, 1, u0, 0);
    }
    for (let y = 0; y < ny; y++) this.setCell(y * nx, 1, u0, 0);
  }

  setSolid(k: number, on: boolean): void {
    if (on === !!this.solid[k]) return;
    this.solid[k] = on ? 1 : 0;
    this.nearDirty = true;
    this.setCell(k, 1, 0, 0);
  }

  /** One fused stream + collide step (pull scheme, halfway bounce-back on solid cells). */
  step(): void {
    const { nx, ny, n, solid } = this;
    const f = this.f;
    const g = this.g;
    const rhoA = this.rho;
    const uxA = this.ux;
    const uyA = this.uy;
    const om = 1 / this.tau;
    const Fx = this.fx;
    const forcePre = 1 - 0.5 * om;
    const n2 = 2 * n, n3 = 3 * n, n4 = 4 * n, n5 = 5 * n, n6 = 6 * n, n7 = 7 * n, n8 = 8 * n;
    const periodic = this.boundary === 'periodic';

    if (!periodic) {
      if (this.nearDirty) this.updateNear();
      this.interior(om);
    } else for (let y = 0; y < ny; y++) {
      // Periodic wrap in both directions (slower general path, used for the test channels).
      const ym = y === 0 ? ny - 1 : y - 1;
      const yp = y === ny - 1 ? 0 : y + 1;
      for (let x = 0; x < nx; x++) {
        const k = y * nx + x;
        if (solid[k]) continue;
        const xm = x === 0 ? nx - 1 : x - 1;
        const xp = x === nx - 1 ? 0 : x + 1;
        // Source cell for direction i is the cell at x - c_i. A solid source means bounce-back.
        const kW = y * nx + xm;
        const kE = y * nx + xp;
        const kS = ym * nx + x;
        const kN = yp * nx + x;
        const kSW = ym * nx + xm;
        const kSE = ym * nx + xp;
        const kNE = yp * nx + xp;
        const kNW = yp * nx + xm;
        const f0 = f[k];
        const f1 = solid[kW] ? f[n3 + k] : f[n + kW];
        const f2 = solid[kS] ? f[n4 + k] : f[n2 + kS];
        const f3 = solid[kE] ? f[n + k] : f[n3 + kE];
        const f4 = solid[kN] ? f[n2 + k] : f[n4 + kN];
        const f5 = solid[kSW] ? f[n7 + k] : f[n5 + kSW];
        const f6 = solid[kSE] ? f[n8 + k] : f[n6 + kSE];
        const f7 = solid[kNE] ? f[n5 + k] : f[n7 + kNE];
        const f8 = solid[kNW] ? f[n6 + k] : f[n8 + kNW];

        const rho = f0 + f1 + f2 + f3 + f4 + f5 + f6 + f7 + f8;
        const ir = 1 / rho;
        let ux = (f1 - f3 + f5 - f6 - f7 + f8) * ir;
        const uy = (f2 - f4 + f5 + f6 - f7 - f8) * ir;
        if (Fx !== 0) ux += 0.5 * Fx * ir;
        rhoA[k] = rho;
        uxA[k] = ux;
        uyA[k] = uy;

        const usq = 1.5 * (ux * ux + uy * uy);
        const r4 = (4 / 9) * rho;
        const r1 = (1 / 9) * rho;
        const r36 = (1 / 36) * rho;
        const a = ux + uy;
        const b = -ux + uy;
        g[k] = f0 + om * (r4 * (1 - usq) - f0);
        g[n + k] = f1 + om * (r1 * (1 + 3 * ux + 4.5 * ux * ux - usq) - f1);
        g[n2 + k] = f2 + om * (r1 * (1 + 3 * uy + 4.5 * uy * uy - usq) - f2);
        g[n3 + k] = f3 + om * (r1 * (1 - 3 * ux + 4.5 * ux * ux - usq) - f3);
        g[n4 + k] = f4 + om * (r1 * (1 - 3 * uy + 4.5 * uy * uy - usq) - f4);
        g[n5 + k] = f5 + om * (r36 * (1 + 3 * a + 4.5 * a * a - usq) - f5);
        g[n6 + k] = f6 + om * (r36 * (1 + 3 * b + 4.5 * b * b - usq) - f6);
        g[n7 + k] = f7 + om * (r36 * (1 - 3 * a + 4.5 * a * a - usq) - f7);
        g[n8 + k] = f8 + om * (r36 * (1 - 3 * b + 4.5 * b * b - usq) - f8);
        if (Fx !== 0) {
          // Guo forcing term: (1 - 1/(2 tau)) w_i [3 (c_i - u) + 9 (c_i . u) c_i] . F
          for (let i = 0; i < 9; i++) {
            const c = CX[i];
            const cu = c * ux + CY[i] * uy;
            g[i * n + k] += forcePre * W[i] * (3 * (c - ux) + 9 * cu * c) * Fx;
          }
        }
      }
    }

    if (!periodic) {
      // Fixed equilibrium rows (inflow column, top and bottom far field) keep their values.
      for (let x = 0; x < nx; x++) {
        const kb = x;
        const kt = (ny - 1) * nx + x;
        for (let i = 0; i < 9; i++) {
          g[i * n + kb] = f[i * n + kb];
          g[i * n + kt] = f[i * n + kt];
        }
      }
      for (let y = 1; y < ny - 1; y++) {
        const kl = y * nx;
        const kr = y * nx + nx - 1;
        for (let i = 0; i < 9; i++) {
          g[i * n + kl] = f[i * n + kl];
          // Zero-gradient outflow: copy the column next to the exit.
          g[i * n + kr] = g[i * n + kr - 1];
        }
        rhoA[kr] = rhoA[kr - 1];
        uxA[kr] = uxA[kr - 1];
        uyA[kr] = uyA[kr - 1];
      }
    }
    this.f = g;
    this.g = f;
    this.steps++;
  }

  private updateNear(): void {
    const { nx, ny, solid, near } = this;
    near.fill(0);
    for (let y = 1; y < ny - 1; y++) {
      for (let x = 1; x < nx - 1; x++) {
        const k = y * nx + x;
        if (solid[k]) continue;
        for (let i = 1; i < 9; i++) {
          if (solid[k - CX[i] - CY[i] * nx]) {
            near[k] = 1;
            break;
          }
        }
      }
    }
    this.nearDirty = false;
  }

  /** Tunnel interior: fused pull-stream and BGK collision without forcing. */
  private interior(om: number): void {
    const { nx, ny, n, solid, near } = this;
    const f = this.f;
    const g = this.g;
    const rhoA = this.rho;
    const uxA = this.ux;
    const uyA = this.uy;
    const n2 = 2 * n, n3 = 3 * n, n4 = 4 * n, n5 = 5 * n, n6 = 6 * n, n7 = 7 * n, n8 = 8 * n;
    for (let y = 1; y < ny - 1; y++) {
      const row = y * nx;
      for (let k = row + 1; k < row + nx - 1; k++) {
        let f0: number, f1: number, f2: number, f3: number, f4: number, f5: number, f6: number, f7: number, f8: number;
        if (near[k] === 0) {
          if (solid[k] !== 0) continue;
          f0 = f[k];
          f1 = f[n + k - 1];
          f2 = f[n2 + k - nx];
          f3 = f[n3 + k + 1];
          f4 = f[n4 + k + nx];
          f5 = f[n5 + k - nx - 1];
          f6 = f[n6 + k - nx + 1];
          f7 = f[n7 + k + nx + 1];
          f8 = f[n8 + k + nx - 1];
        } else {
          f0 = f[k];
          f1 = solid[k - 1] ? f[n3 + k] : f[n + k - 1];
          f2 = solid[k - nx] ? f[n4 + k] : f[n2 + k - nx];
          f3 = solid[k + 1] ? f[n + k] : f[n3 + k + 1];
          f4 = solid[k + nx] ? f[n2 + k] : f[n4 + k + nx];
          f5 = solid[k - nx - 1] ? f[n7 + k] : f[n5 + k - nx - 1];
          f6 = solid[k - nx + 1] ? f[n8 + k] : f[n6 + k - nx + 1];
          f7 = solid[k + nx + 1] ? f[n5 + k] : f[n7 + k + nx + 1];
          f8 = solid[k + nx - 1] ? f[n6 + k] : f[n8 + k + nx - 1];
        }
        const rho = f0 + f1 + f2 + f3 + f4 + f5 + f6 + f7 + f8;
        const ir = 1 / rho;
        const ux = (f1 - f3 + f5 - f6 - f7 + f8) * ir;
        const uy = (f2 - f4 + f5 + f6 - f7 - f8) * ir;
        rhoA[k] = rho;
        uxA[k] = ux;
        uyA[k] = uy;
        const usq = 1 - 1.5 * (ux * ux + uy * uy);
        const r1 = om * (1 / 9) * rho;
        const r36 = om * (1 / 36) * rho;
        const a = ux + uy;
        const b = uy - ux;
        const ux3 = 3 * ux, uy3 = 3 * uy, a3 = 3 * a, b3 = 3 * b;
        const uxx = 4.5 * ux * ux + usq, uyy = 4.5 * uy * uy + usq, aa = 4.5 * a * a + usq, bb = 4.5 * b * b + usq;
        const keep = 1 - om;
        g[k] = keep * f0 + om * (4 / 9) * rho * usq;
        g[n + k] = keep * f1 + r1 * (uxx + ux3);
        g[n2 + k] = keep * f2 + r1 * (uyy + uy3);
        g[n3 + k] = keep * f3 + r1 * (uxx - ux3);
        g[n4 + k] = keep * f4 + r1 * (uyy - uy3);
        g[n5 + k] = keep * f5 + r36 * (aa + a3);
        g[n6 + k] = keep * f6 + r36 * (bb + b3);
        g[n7 + k] = keep * f7 + r36 * (aa - a3);
        g[n8 + k] = keep * f8 + r36 * (bb - b3);
      }
    }
  }

  /** Total mass of fluid cells. */
  mass(): number {
    let m = 0;
    for (let k = 0; k < this.n; k++) {
      if (this.solid[k]) continue;
      for (let i = 0; i < 9; i++) m += this.f[i * this.n + k];
    }
    return m;
  }

  /** Vorticity dv/dx - du/dy by central differences, written into out. */
  vorticity(out: Float32Array): void {
    const { nx, ny, ux, uy, solid } = this;
    for (let y = 1; y < ny - 1; y++) {
      for (let x = 1; x < nx - 1; x++) {
        const k = y * nx + x;
        out[k] = solid[k] ? 0 : 0.5 * (uy[k + 1] - uy[k - 1] - ux[k + nx] + ux[k - nx]);
      }
    }
  }

  /** Largest speed in the fluid, used to detect numerical blow-up. */
  maxSpeed(): number {
    let m = 0;
    const { ux, uy } = this;
    for (let k = 0; k < this.n; k++) {
      const s = ux[k] * ux[k] + uy[k] * uy[k];
      if (s > m || s !== s) m = s !== s ? Infinity : s;
    }
    return Math.sqrt(m);
  }
}

// ---------------------------------------------------------------------------
// Obstacles

export type ObstacleKind = 'cylinder' | 'square' | 'airfoil' | 'custom';

export interface ObstacleGeom {
  /** Centre in cells. */
  cx: number;
  cy: number;
  /** Reference size: cylinder diameter, square side, airfoil chord. */
  size: number;
  /** Airfoil angle of attack in radians (nose up). */
  aoa: number;
}

/** NACA 4-digit symmetric half-thickness at chord fraction t, for thickness ratio th. */
export function nacaHalfThickness(t: number, th: number): number {
  if (t < 0 || t > 1) return -1;
  return 5 * th * (0.2969 * Math.sqrt(t) - 0.126 * t - 0.3516 * t * t + 0.2843 * t * t * t - 0.1036 * t * t * t * t);
}

/** Is the point (px, py) inside the obstacle? Chord of the airfoil runs from cx - size/2 to cx + size/2 before rotation. */
export function insideObstacle(kind: ObstacleKind, g: ObstacleGeom, px: number, py: number): boolean {
  const dx = px - g.cx;
  const dy = py - g.cy;
  if (kind === 'cylinder') return dx * dx + dy * dy <= (g.size / 2) * (g.size / 2);
  if (kind === 'square') return Math.abs(dx) <= g.size / 2 && Math.abs(dy) <= g.size / 2;
  if (kind === 'airfoil') {
    // Rotate into the airfoil frame. Positive aoa tilts the nose up (toward +y).
    const c = Math.cos(g.aoa);
    const s = Math.sin(g.aoa);
    const xr = dx * c + dy * s;
    const yr = -dx * s + dy * c;
    const t = xr / g.size + 0.5;
    const h = nacaHalfThickness(t, 0.12) * g.size;
    return h >= 0 && Math.abs(yr) <= h;
  }
  return false;
}

/** Mark the obstacle's cells solid (cell centres at integer coordinates). Clears previous solids first. */
export function buildObstacle(lat: Lattice, kind: ObstacleKind, g: ObstacleGeom): void {
  const { nx, ny } = lat;
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const k = y * nx + x;
      const inside = y > 0 && y < ny - 1 && x > 0 && x < nx - 1 && insideObstacle(kind, g, x, y);
      lat.setSolid(k, inside);
    }
  }
}

export interface Extent {
  count: number;
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
}

/** Bounding box of the solid cells. The transverse size D = ymax - ymin + 1. */
export function solidExtent(lat: Lattice, out: Extent): Extent {
  out.count = 0;
  out.xmin = Infinity;
  out.xmax = -Infinity;
  out.ymin = Infinity;
  out.ymax = -Infinity;
  const { nx, ny, solid } = lat;
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      if (!solid[y * nx + x]) continue;
      out.count++;
      if (x < out.xmin) out.xmin = x;
      if (x > out.xmax) out.xmax = x;
      if (y < out.ymin) out.ymin = y;
      if (y > out.ymax) out.ymax = y;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Signal analysis

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Add small random velocity noise to fluid cells so the symmetric wake can break. */
export function perturb(lat: Lattice, amp: number, seed: number): void {
  const r = rng(seed);
  for (let y = 1; y < lat.ny - 1; y++) {
    for (let x = 1; x < lat.nx - 1; x++) {
      const k = y * lat.nx + x;
      if (lat.solid[k]) continue;
      lat.setCell(k, 1, lat.u0 * (1 + amp * (r() - 0.5)), lat.u0 * amp * (r() - 0.5));
    }
  }
}

/**
 * Power spectrum of a real signal sampled every dt steps, evaluated at nf frequencies
 * from fmin to fmax (cycles per step) with the Goertzel recurrence. The mean is removed
 * and a Hann window applied. Writes powers into out and returns the interpolated peak frequency.
 */
export function spectrum(sig: ArrayLike<number>, start: number, len: number, cap: number, dt: number, fmin: number, fmax: number, nf: number, out: Float32Array): number {
  let mean = 0;
  for (let j = 0; j < len; j++) mean += sig[(start + j) % cap];
  mean /= len;
  let best = 0;
  let bestP = -1;
  for (let q = 0; q < nf; q++) {
    const fr = fmin + ((fmax - fmin) * q) / (nf - 1);
    const w = 2 * Math.PI * fr * dt;
    const coeff = 2 * Math.cos(w);
    let s1 = 0;
    let s2 = 0;
    for (let j = 0; j < len; j++) {
      const win = 0.5 - 0.5 * Math.cos((2 * Math.PI * j) / (len - 1));
      const s0 = (sig[(start + j) % cap] - mean) * win + coeff * s1 - s2;
      s2 = s1;
      s1 = s0;
    }
    const p = s1 * s1 + s2 * s2 - coeff * s1 * s2;
    out[q] = p;
    if (p > bestP) {
      bestP = p;
      best = q;
    }
  }
  // Parabolic interpolation of the peak on the log power.
  let off = 0;
  if (best > 0 && best < nf - 1) {
    const a = Math.log(out[best - 1] + 1e-30);
    const b = Math.log(out[best] + 1e-30);
    const c = Math.log(out[best + 1] + 1e-30);
    const den = a - 2 * b + c;
    if (den < 0) off = (0.5 * (a - c)) / den;
  }
  return fmin + ((fmax - fmin) * (best + off)) / (nf - 1);
}

/** Root-mean-square of the mean-removed signal. */
export function rms(sig: ArrayLike<number>, start: number, len: number, cap: number): number {
  let m = 0;
  for (let j = 0; j < len; j++) m += sig[(start + j) % cap];
  m /= len;
  let v = 0;
  for (let j = 0; j < len; j++) {
    const d = sig[(start + j) % cap] - m;
    v += d * d;
  }
  return Math.sqrt(v / Math.max(1, len));
}

// ---------------------------------------------------------------------------
// Tracer particles

/** Bilinear velocity at (px, py). Returns false inside a solid cell or outside the grid. */
export function sampleVelocity(lat: Lattice, px: number, py: number, out: { u: number; v: number }): boolean {
  const { nx, ny } = lat;
  if (px < 0 || py < 0 || px >= nx - 1 || py >= ny - 1) return false;
  const x = px | 0;
  const y = py | 0;
  const fx = px - x;
  const fy = py - y;
  const k = y * nx + x;
  if (lat.solid[Math.round(py) * nx + Math.round(px)]) return false;
  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;
  const ux = lat.ux;
  const uy = lat.uy;
  out.u = w00 * ux[k] + w10 * ux[k + 1] + w01 * ux[k + nx] + w11 * ux[k + nx + 1];
  out.v = w00 * uy[k] + w10 * uy[k + 1] + w01 * uy[k + nx] + w11 * uy[k + nx + 1];
  return true;
}

const tmpA = { u: 0, v: 0 };
const tmpB = { u: 0, v: 0 };
/** Advect particles by `steps` lattice steps with the midpoint rule. Dead particles get alive[j] = 0. */
export function advect(lat: Lattice, px: Float32Array, py: Float32Array, alive: Uint8Array, count: number, steps: number): void {
  for (let j = 0; j < count; j++) {
    if (!alive[j]) continue;
    const x = px[j];
    const y = py[j];
    if (!sampleVelocity(lat, x, y, tmpA)) {
      alive[j] = 0;
      continue;
    }
    const hx = x + 0.5 * steps * tmpA.u;
    const hy = y + 0.5 * steps * tmpA.v;
    if (!sampleVelocity(lat, hx, hy, tmpB)) {
      alive[j] = 0;
      continue;
    }
    px[j] = x + steps * tmpB.u;
    py[j] = y + steps * tmpB.v;
    if (px[j] >= lat.nx - 2 || py[j] <= 0.5 || py[j] >= lat.ny - 1.5) alive[j] = 0;
  }
}
