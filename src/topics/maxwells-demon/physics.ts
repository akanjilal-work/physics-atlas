// Hard-sphere gas in a box split by a wall with a trapdoor, plus a demon.
// Pure math: no DOM, no Three.js. Units: k_B = 1, particle mass m = 1.
//
// Dynamics are event-driven inside each fixed step h. Every pair collision
// and wall hit is found at its exact time and processed in time order, so the
// motion is exact up to round-off and time-reversible (useful for Loschmidt).

export const LX = 1; // box half-length along x (the wall sits at x = 0)
export const LY = 0.5;
export const LZ = 0.5;
export const SIGMA = 0.05; // sphere diameter
export const RAD = SIGMA / 2;
export const H_STEP = 0.01; // fixed outer step (time units)
export const BOX_VOLUME = 8 * LX * LY * LZ;

export type DemonMode = 'off' | 'sorter' | 'pressure';
export type Layout = 'halves' | 'species';
export type SpeedStart = 'maxwell' | 'equal' | 'xonly';

const MAX_CELLS = 64 * 32 * 32;

/** Event codes stored in evJ for non-pair events. */
const EV_NONE = -1;
const EV_WX = -2;
const EV_WY = -3;
const EV_WZ = -4;
const EV_PART = -5;

export interface Gas {
  n: number;
  x: Float64Array; y: Float64Array; z: Float64Array;
  vx: Float64Array; vy: Float64Array; vz: Float64Array;
  /** Species label (0 or 1) for the mixing demo. */
  tag: Uint8Array;
  t: number;
  /** Wall at x = 0 present? */
  partition: boolean;
  /** Half side of the square door. */
  door: number;
  demon: DemonMode;
  /** Sorter threshold: squared rms speed at the equilibrium temperature. */
  vth2: number;
  // Demon ledger and counters
  decisions: number;
  opens: number;
  collisions: number;
  /** Increments on every demon decision (for flashes). */
  doorSeq: number;
  lastOpen: boolean;
  lastY: number;
  lastZ: number;
  // Internals
  tl: Float64Array;
  evT: Float64Array;
  evJ: Int32Array;
  cellOf: Int32Array;
  next: Int32Array;
  head: Int32Array;
  /** Particles whose next event falls inside the current step. */
  pend: Int32Array;
  inPend: Uint8Array;
  npend: number;
  ncx: number; ncy: number; ncz: number;
}

export function createGas(maxN: number): Gas {
  const f = () => new Float64Array(maxN);
  return {
    n: 0, x: f(), y: f(), z: f(), vx: f(), vy: f(), vz: f(), tag: new Uint8Array(maxN), t: 0,
    partition: true, door: 0.15, demon: 'off', vth2: 3,
    decisions: 0, opens: 0, collisions: 0, doorSeq: 0, lastOpen: false, lastY: 0, lastZ: 0,
    tl: f(), evT: f(), evJ: new Int32Array(maxN), cellOf: new Int32Array(maxN), next: new Int32Array(maxN),
    head: new Int32Array(MAX_CELLS), pend: new Int32Array(maxN), inPend: new Uint8Array(maxN), npend: 0, ncx: 1, ncy: 1, ncz: 1,
  };
}

// ---------------------------------------------------------------- random numbers

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(rng: () => number): number {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

// ---------------------------------------------------------------- setup

export interface InitOptions {
  n: number;
  /** Initial temperature (k_B T in units of m v^2). */
  T: number;
  seed: number;
  layout: Layout;
  speeds: SpeedStart;
}

/** Place n non-overlapping spheres, half on each side of x = 0, and give them velocities. */
export function initGas(g: Gas, o: InitOptions): void {
  const rng = mulberry32(o.seed);
  const n = o.n;
  g.n = n;
  const s2 = SIGMA * SIGMA * 1.0001;
  for (let i = 0; i < n; i++) {
    const left = i < n / 2;
    for (let tries = 0; ; tries++) {
      const x = left ? -LX + RAD + rng() * (LX - SIGMA) : RAD + rng() * (LX - SIGMA);
      const y = -LY + RAD + rng() * (2 * LY - SIGMA);
      const z = -LZ + RAD + rng() * (2 * LZ - SIGMA);
      let ok = true;
      for (let j = 0; j < i; j++) {
        const dx = g.x[j] - x;
        const dy = g.y[j] - y;
        const dz = g.z[j] - z;
        if (dx * dx + dy * dy + dz * dz < s2) { ok = false; break; }
      }
      if (ok || tries > 2000) {
        g.x[i] = x; g.y[i] = y; g.z[i] = z;
        break;
      }
    }
    g.tag[i] = o.layout === 'species' ? (left ? 0 : 1) : 0;
    if (o.speeds === 'maxwell') {
      g.vx[i] = gaussian(rng); g.vy[i] = gaussian(rng); g.vz[i] = gaussian(rng);
    } else if (o.speeds === 'equal') {
      // Random direction, same speed for everyone.
      const cz = 2 * rng() - 1;
      const ph = 2 * Math.PI * rng();
      const sz = Math.sqrt(1 - cz * cz);
      g.vx[i] = sz * Math.cos(ph); g.vy[i] = sz * Math.sin(ph); g.vz[i] = cz;
    } else {
      g.vx[i] = rng() < 0.5 ? -1 : 1; g.vy[i] = 0; g.vz[i] = 0;
    }
  }
  // Rescale so that the kinetic energy is exactly (3/2) n T.
  const k = kinetic(g);
  const f = Math.sqrt((1.5 * n * o.T) / k);
  for (let i = 0; i < n; i++) { g.vx[i] *= f; g.vy[i] *= f; g.vz[i] *= f; }
  g.t = 0;
  g.decisions = 0;
  g.opens = 0;
  g.collisions = 0;
  g.doorSeq = 0;
  g.vth2 = 3 * o.T;
}

// ---------------------------------------------------------------- measurements

export function kinetic(g: Gas): number {
  let k = 0;
  for (let i = 0; i < g.n; i++) k += g.vx[i] * g.vx[i] + g.vy[i] * g.vy[i] + g.vz[i] * g.vz[i];
  return 0.5 * k;
}

/** Temperature from mean kinetic energy: <KE> = (3/2) k T. */
export function temperatureOf(energy: number, count: number): number {
  return count > 0 ? (2 * energy) / (3 * count) : 0;
}

export interface HalfStats { nL: number; eL: number; nR: number; eR: number }

export function halfStats(g: Gas, out: HalfStats): HalfStats {
  let nL = 0, eL = 0, nR = 0, eR = 0;
  for (let i = 0; i < g.n; i++) {
    const e = 0.5 * (g.vx[i] * g.vx[i] + g.vy[i] * g.vy[i] + g.vz[i] * g.vz[i]);
    if (g.x[i] < 0) { nL++; eL += e; } else { nR++; eR += e; }
  }
  out.nL = nL; out.eL = eL; out.nR = nR; out.eR = eR;
  return out;
}

/** Ideal-gas entropy of n particles with energy e in volume v, dropping terms linear in n. */
function sIdeal(n: number, e: number, v: number): number {
  return n > 0 && e > 0 ? n * (Math.log(v / n) + 1.5 * Math.log(e / n)) : 0;
}

/**
 * Entropy deficit of the two-halves macrostate, in units of k_B.
 * S_eq(N, E, V) minus S(N_L, E_L, V/2) minus S(N_R, E_R, V/2). Always >= 0.
 * Constants per particle cancel because the total N is fixed.
 */
export function entropyDeficit(nL: number, eL: number, nR: number, eR: number): number {
  return sIdeal(nL + nR, eL + eR, 2) - sIdeal(nL, eL, 1) - sIdeal(nR, eR, 1);
}

/** Coarse-grained mixing entropy of the two species on an nx*ny*nz grid (units of k_B). */
export function mixingEntropy(g: Gas, nx = 4, ny = 2, nz = 2, work?: Int32Array): number {
  const cells = nx * ny * nz;
  const cnt = work && work.length >= 2 * cells ? work : new Int32Array(2 * cells);
  cnt.fill(0, 0, 2 * cells);
  for (let i = 0; i < g.n; i++) {
    const cx = Math.min(nx - 1, Math.max(0, Math.floor(((g.x[i] + LX) / (2 * LX)) * nx)));
    const cy = Math.min(ny - 1, Math.max(0, Math.floor(((g.y[i] + LY) / (2 * LY)) * ny)));
    const cz = Math.min(nz - 1, Math.max(0, Math.floor(((g.z[i] + LZ) / (2 * LZ)) * nz)));
    cnt[2 * ((cz * ny + cy) * nx + cx) + g.tag[i]]++;
  }
  let s = 0;
  for (let c = 0; c < cells; c++) {
    const a = cnt[2 * c];
    const b = cnt[2 * c + 1];
    const t = a + b;
    if (a > 0) s -= a * Math.log(a / t);
    if (b > 0) s -= b * Math.log(b / t);
  }
  return s;
}

/** Ideal mixing entropy of two species (units of k_B): -N sum x ln x. */
export function idealMixing(nA: number, nB: number): number {
  const n = nA + nB;
  let s = 0;
  if (nA > 0) s -= nA * Math.log(nA / n);
  if (nB > 0) s -= nB * Math.log(nB / n);
  return s;
}

export function lnFactorial(n: number): number {
  let s = 0;
  for (let k = 2; k <= n; k++) s += Math.log(k);
  return s;
}

/** Maxwell-Boltzmann speed density in 3D for m = k = 1. */
export function mbPdf(v: number, T: number): number {
  return 4 * Math.PI * v * v * Math.pow(2 * Math.PI * T, -1.5) * Math.exp((-v * v) / (2 * T));
}

/** Abramowitz and Stegun 7.1.26, absolute error below 1.5e-7. */
export function erf(x: number): number {
  const s = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}

/** Maxwell-Boltzmann speed CDF in 3D. */
export function mbCdf(v: number, T: number): number {
  const a = Math.sqrt(T);
  const u = v / a;
  return erf(u / Math.SQRT2) - Math.sqrt(2 / Math.PI) * u * Math.exp((-u * u) / 2);
}

/** Kolmogorov-Smirnov distance between samples and a CDF. Sorts a copy. */
export function ksDistance(samples: ArrayLike<number>, cdf: (v: number) => number): number {
  const s = Float64Array.from(samples).sort();
  const n = s.length;
  let d = 0;
  for (let i = 0; i < n; i++) {
    const f = cdf(s[i]);
    d = Math.max(d, Math.abs(f - i / n), Math.abs((i + 1) / n - f));
  }
  return d;
}

/** Binary Shannon entropy in bits. */
export function h2(p: number): number {
  if (p <= 0 || p >= 1) return 0;
  return -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
}

// ---------------------------------------------------------------- dynamics

function buildCells(g: Gas, h: number): void {
  let v2 = 0;
  for (let i = 0; i < g.n; i++) {
    const s = g.vx[i] * g.vx[i] + g.vy[i] * g.vy[i] + g.vz[i] * g.vz[i];
    if (s > v2) v2 = s;
  }
  // A pair can only meet within one step if it starts closer than sigma plus
  // twice the distance a particle can travel. One collision can raise a speed
  // by at most a factor of sqrt(2), so 3 vmax h covers both partners.
  const reach = SIGMA + 3 * Math.sqrt(v2) * h;
  g.ncx = Math.max(1, Math.min(64, Math.floor((2 * LX) / reach)));
  g.ncy = Math.max(1, Math.min(32, Math.floor((2 * LY) / reach)));
  g.ncz = Math.max(1, Math.min(32, Math.floor((2 * LZ) / reach)));
  const nc = g.ncx * g.ncy * g.ncz;
  g.head.fill(-1, 0, nc);
  for (let i = 0; i < g.n; i++) {
    const cx = Math.min(g.ncx - 1, Math.max(0, Math.floor(((g.x[i] + LX) / (2 * LX)) * g.ncx)));
    const cy = Math.min(g.ncy - 1, Math.max(0, Math.floor(((g.y[i] + LY) / (2 * LY)) * g.ncy)));
    const cz = Math.min(g.ncz - 1, Math.max(0, Math.floor(((g.z[i] + LZ) / (2 * LZ)) * g.ncz)));
    const c = (cz * g.ncy + cy) * g.ncx + cx;
    g.cellOf[i] = c;
    g.next[i] = g.head[c];
    g.head[c] = i;
  }
}

/** Find the earliest event for particle i at or after local time t. */
function computeEvent(g: Gas, i: number, t: number): void {
  const dti = t - g.tl[i];
  const xi = g.x[i] + g.vx[i] * dti;
  const yi = g.y[i] + g.vy[i] * dti;
  const zi = g.z[i] + g.vz[i] * dti;
  const vxi = g.vx[i], vyi = g.vy[i], vzi = g.vz[i];
  let best = Infinity;
  let bj = EV_NONE;

  // Box walls
  if (vxi > 0) { const w = (LX - RAD - xi) / vxi; if (w < best) { best = w; bj = EV_WX; } }
  else if (vxi < 0) { const w = (-LX + RAD - xi) / vxi; if (w < best) { best = w; bj = EV_WX; } }
  if (vyi > 0) { const w = (LY - RAD - yi) / vyi; if (w < best) { best = w; bj = EV_WY; } }
  else if (vyi < 0) { const w = (-LY + RAD - yi) / vyi; if (w < best) { best = w; bj = EV_WY; } }
  if (vzi > 0) { const w = (LZ - RAD - zi) / vzi; if (w < best) { best = w; bj = EV_WZ; } }
  else if (vzi < 0) { const w = (-LZ + RAD - zi) / vzi; if (w < best) { best = w; bj = EV_WZ; } }

  // Partition faces at x = -RAD and x = +RAD. A particle inside the doorway slab has no partition event.
  if (g.partition) {
    if (xi < -RAD - 1e-12 && vxi > 0) { const w = (-RAD - xi) / vxi; if (w < best) { best = w; bj = EV_PART; } }
    else if (xi > RAD + 1e-12 && vxi < 0) { const w = (RAD - xi) / vxi; if (w < best) { best = w; bj = EV_PART; } }
  }
  if (best < 0) best = 0;

  // Neighbour pairs
  const c = g.cellOf[i];
  const cx = c % g.ncx;
  const cy = Math.floor(c / g.ncx) % g.ncy;
  const cz = Math.floor(c / (g.ncx * g.ncy));
  const s2 = SIGMA * SIGMA;
  for (let az = Math.max(0, cz - 1); az <= Math.min(g.ncz - 1, cz + 1); az++) {
    for (let ay = Math.max(0, cy - 1); ay <= Math.min(g.ncy - 1, cy + 1); ay++) {
      for (let ax = Math.max(0, cx - 1); ax <= Math.min(g.ncx - 1, cx + 1); ax++) {
        for (let j = g.head[(az * g.ncy + ay) * g.ncx + ax]; j >= 0; j = g.next[j]) {
          if (j === i) continue;
          const dtj = t - g.tl[j];
          const dx = g.x[j] + g.vx[j] * dtj - xi;
          const dy = g.y[j] + g.vy[j] * dtj - yi;
          const dz = g.z[j] + g.vz[j] * dtj - zi;
          const ux = g.vx[j] - vxi;
          const uy = g.vy[j] - vyi;
          const uz = g.vz[j] - vzi;
          const b = dx * ux + dy * uy + dz * uz;
          if (b >= 0) continue; // separating
          const cc = dx * dx + dy * dy + dz * dz - s2;
          const u2 = ux * ux + uy * uy + uz * uz;
          const disc = b * b - u2 * cc;
          if (disc < 0) continue; // miss
          const tc = cc <= 0 ? 0 : cc / (-b + Math.sqrt(disc));
          if (tc < best) { best = tc; bj = j; }
        }
      }
    }
  }
  g.evT[i] = t + best;
  g.evJ[i] = bj;
}

function advanceTo(g: Gas, i: number, t: number): void {
  const d = t - g.tl[i];
  g.x[i] += g.vx[i] * d;
  g.y[i] += g.vy[i] * d;
  g.z[i] += g.vz[i] * d;
  g.tl[i] = t;
}

/** The demon's rule. Returns true if the door opens for particle i. */
function demonOpens(g: Gas, i: number): boolean {
  const goingRight = g.vx[i] > 0;
  if (g.demon === 'off') return true;
  if (g.demon === 'pressure') return goingRight;
  const v2 = g.vx[i] * g.vx[i] + g.vy[i] * g.vy[i] + g.vz[i] * g.vz[i];
  // Fast ones go right, slow ones go left.
  return goingRight ? v2 > g.vth2 : v2 < g.vth2;
}

function schedule(g: Gas, k: number, t: number, h: number): void {
  computeEvent(g, k, t);
  if (g.evT[k] < h && !g.inPend[k]) {
    g.inPend[k] = 1;
    g.pend[g.npend++] = k;
  }
}

/** Advance the whole gas by h with exact event-driven collisions. */
export function stepGas(g: Gas, h = H_STEP): void {
  const n = g.n;
  buildCells(g, h);
  g.tl.fill(0, 0, n);
  g.inPend.fill(0, 0, n);
  g.npend = 0;
  for (let i = 0; i < n; i++) schedule(g, i, 0, h);
  const s2 = SIGMA * SIGMA;
  for (let guard = 0; guard < 200000; guard++) {
    // Earliest pending event. Entries that moved past h are dropped.
    let i = -1;
    let tmin = h;
    let w = 0;
    for (let r = 0; r < g.npend; r++) {
      const k = g.pend[r];
      const tk = g.evT[k];
      if (tk >= h) { g.inPend[k] = 0; continue; }
      g.pend[w++] = k;
      if (tk < tmin) { tmin = tk; i = k; }
    }
    g.npend = w;
    if (i < 0) break;
    const j = g.evJ[i];
    advanceTo(g, i, tmin);
    if (j >= 0) {
      advanceTo(g, j, tmin);
      const dx = g.x[j] - g.x[i];
      const dy = g.y[j] - g.y[i];
      const dz = g.z[j] - g.z[i];
      const inv = 1 / Math.sqrt(Math.max(dx * dx + dy * dy + dz * dz, s2 * 1e-6));
      const nx = dx * inv, ny = dy * inv, nz = dz * inv;
      const dvn = (g.vx[j] - g.vx[i]) * nx + (g.vy[j] - g.vy[i]) * ny + (g.vz[j] - g.vz[i]) * nz;
      // Equal masses: swap the normal components of velocity.
      g.vx[i] += dvn * nx; g.vy[i] += dvn * ny; g.vz[i] += dvn * nz;
      g.vx[j] -= dvn * nx; g.vy[j] -= dvn * ny; g.vz[j] -= dvn * nz;
      g.collisions++;
    } else if (j === EV_WX) g.vx[i] = -g.vx[i];
    else if (j === EV_WY) g.vy[i] = -g.vy[i];
    else if (j === EV_WZ) g.vz[i] = -g.vz[i];
    else if (j === EV_PART) {
      const inDoor = Math.abs(g.y[i]) < g.door && Math.abs(g.z[i]) < g.door;
      let open = false;
      if (inDoor) {
        open = demonOpens(g, i);
        if (g.demon !== 'off') {
          g.decisions++;
          if (open) g.opens++;
          g.doorSeq++;
          g.lastOpen = open;
          g.lastY = g.y[i];
          g.lastZ = g.z[i];
        }
      }
      if (!open) g.vx[i] = -g.vx[i];
    }
    // Refresh the particles whose paths changed, and pending particles that were aiming at them.
    // A particle whose event lies beyond h is rescheduled at the next step anyway.
    const np = g.npend;
    for (let r = 0; r < np; r++) {
      const k = g.pend[r];
      const e = g.evJ[k];
      if (k !== i && k !== j && (e === i || (j >= 0 && e === j))) schedule(g, k, tmin, h);
    }
    schedule(g, i, tmin, h);
    if (j >= 0) schedule(g, j, tmin, h);
  }
  for (let i = 0; i < n; i++) advanceTo(g, i, h);
  g.t += h;
}

/**
 * Reverse every velocity. With noise > 0, each velocity is first turned by a
 * small random angle (relative size `noise`) and its speed is kept, so the
 * energy stays exactly the same.
 */
export function reverseVelocities(g: Gas, noise: number, rng: () => number): void {
  for (let i = 0; i < g.n; i++) {
    let vx = g.vx[i], vy = g.vy[i], vz = g.vz[i];
    if (noise > 0) {
      const s = Math.hypot(vx, vy, vz);
      const k = (noise * s) / Math.sqrt(3);
      vx += k * gaussian(rng); vy += k * gaussian(rng); vz += k * gaussian(rng);
      const f = s / Math.hypot(vx, vy, vz);
      vx *= f; vy *= f; vz *= f;
    }
    g.vx[i] = -vx; g.vy[i] = -vy; g.vz[i] = -vz;
  }
}

/** Smallest centre distance over all pairs, divided by sigma (O(n^2), for tests). */
export function minGap(g: Gas): number {
  let m = Infinity;
  for (let i = 0; i < g.n; i++) {
    for (let j = i + 1; j < g.n; j++) {
      const d = Math.hypot(g.x[i] - g.x[j], g.y[i] - g.y[j], g.z[i] - g.z[j]);
      if (d < m) m = d;
    }
  }
  return m / SIGMA;
}

/** KS distance of already-sorted speeds (first n entries) from the MB CDF at temperature T. No allocation. */
export function ksSortedMB(sorted: Float64Array, n: number, T: number): number {
  let d = 0;
  for (let i = 0; i < n; i++) {
    const f = mbCdf(sorted[i], T);
    const a = Math.abs(f - i / n);
    const b = Math.abs((i + 1) / n - f);
    if (a > d) d = a;
    if (b > d) d = b;
  }
  return d;
}
