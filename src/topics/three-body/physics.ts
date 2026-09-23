// Newtonian three-body problem in 3D with G = 1, integrated with Yoshida's
// 4th-order symplectic scheme and a step size that adapts to the closest pair.
// Pure module: no DOM, no Three.js. No allocations inside the step loop.

export const G = 1;
export const N = 3;

/** Figure-eight period (Chenciner and Montgomery 2000, Simó). */
export const FIG8_PERIOD = 6.32591398;

export interface Sys {
  /** Masses, length 3. */
  m: Float64Array;
  /** Positions x0 y0 z0 x1 y1 z1 x2 y2 z2. */
  x: Float64Array;
  /** Velocities, same layout. */
  v: Float64Array;
  /** Accelerations (scratch). */
  a: Float64Array;
  t: number;
  /** Softening length squared (0 = exact point masses). */
  eps2: number;
}

export function createSys(): Sys {
  return { m: new Float64Array(3), x: new Float64Array(9), v: new Float64Array(9), a: new Float64Array(9), t: 0, eps2: 0 };
}

export function copySys(dst: Sys, src: Sys): void {
  dst.m.set(src.m);
  dst.x.set(src.x);
  dst.v.set(src.v);
  dst.t = src.t;
  dst.eps2 = src.eps2;
}

/** Gravitational accelerations into s.a. */
export function accel(s: Sys): void {
  const { x, a, m, eps2 } = s;
  a.fill(0);
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const dx = x[j * 3] - x[i * 3];
      const dy = x[j * 3 + 1] - x[i * 3 + 1];
      const dz = x[j * 3 + 2] - x[i * 3 + 2];
      const r2 = dx * dx + dy * dy + dz * dz + eps2;
      const inv = G / (r2 * Math.sqrt(r2));
      const fi = m[j] * inv;
      const fj = m[i] * inv;
      a[i * 3] += fi * dx;
      a[i * 3 + 1] += fi * dy;
      a[i * 3 + 2] += fi * dz;
      a[j * 3] -= fj * dx;
      a[j * 3 + 1] -= fj * dy;
      a[j * 3 + 2] -= fj * dz;
    }
  }
}

// Yoshida (1990) 4th-order coefficients.
const CBRT2 = Math.cbrt(2);
const W1 = 1 / (2 - CBRT2);
const W0 = -CBRT2 / (2 - CBRT2);
const C1 = W1 / 2;
const C2 = (W0 + W1) / 2;
const D1 = W1;
const D2 = W0;

function drift(s: Sys, h: number): void {
  const { x, v } = s;
  for (let k = 0; k < 9; k++) x[k] += h * v[k];
}
function kick(s: Sys, h: number): void {
  accel(s);
  const { v, a } = s;
  for (let k = 0; k < 9; k++) v[k] += h * a[k];
}

/** One Yoshida 4th-order step (drift-kick-drift composition, 3 force evaluations). */
export function yoshidaStep(s: Sys, h: number): void {
  drift(s, C1 * h);
  kick(s, D1 * h);
  drift(s, C2 * h);
  kick(s, D2 * h);
  drift(s, C2 * h);
  kick(s, D1 * h);
  drift(s, C1 * h);
  s.t += h;
}

/** Distance between bodies i and j. */
export function pairDist(s: Sys, i: number, j: number): number {
  const x = s.x;
  const dx = x[j * 3] - x[i * 3];
  const dy = x[j * 3 + 1] - x[i * 3 + 1];
  const dz = x[j * 3 + 2] - x[i * 3 + 2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function minPairDist(s: Sys): number {
  return Math.min(pairDist(s, 0, 1), pairDist(s, 0, 2), pairDist(s, 1, 2));
}

/**
 * Adaptive step: eta times the shortest pair timescale, where each pair's
 * timescale is the smaller of its free-fall time sqrt(r^3 / G(mi+mj)) and its
 * crossing time r / |v_rel|. Close encounters get small steps automatically.
 */
export function stepSize(s: Sys, eta: number, hmax: number): number {
  const { x, v, m } = s;
  let tau = Infinity;
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const dx = x[j * 3] - x[i * 3];
      const dy = x[j * 3 + 1] - x[i * 3 + 1];
      const dz = x[j * 3 + 2] - x[i * 3 + 2];
      const r2 = dx * dx + dy * dy + dz * dz + s.eps2;
      const r = Math.sqrt(r2);
      const mm = G * (m[i] + m[j]);
      if (mm > 0) tau = Math.min(tau, Math.sqrt((r2 * r) / mm));
      const ux = v[j * 3] - v[i * 3];
      const uy = v[j * 3 + 1] - v[i * 3 + 1];
      const uz = v[j * 3 + 2] - v[i * 3 + 2];
      const u2 = ux * ux + uy * uy + uz * uz;
      if (u2 > 0 && mm > 0) tau = Math.min(tau, r / Math.sqrt(u2));
    }
  }
  return Math.min(hmax, eta * tau);
}

export interface StepOpts {
  eta: number;
  hmax: number;
  /** Safety cap on steps per call. */
  maxSteps: number;
}

/**
 * eta = 0.002 keeps the Pythagorean run on its true path: with 0.01 the energy
 * error (4e-7) is already enough for chaos to change the outcome.
 */
export const DEFAULT_STEP: StepOpts = { eta: 0.002, hmax: 1e-3, maxSteps: 200000 };

/**
 * Advance until s.t reaches tEnd (or maxSteps is hit). The last step is
 * shortened so the run lands exactly on tEnd. Returns the number of steps.
 */
export function advanceTo(s: Sys, tEnd: number, o: StepOpts = DEFAULT_STEP): number {
  let n = 0;
  while (s.t < tEnd && n < o.maxSteps) {
    const h = Math.min(stepSize(s, o.eta, o.hmax), tEnd - s.t);
    yoshidaStep(s, h);
    n++;
  }
  if (tEnd - s.t < 1e-13) s.t = tEnd;
  return n;
}

// --- Conserved quantities -------------------------------------------------

export function energy(s: Sys): number {
  const { x, v, m, eps2 } = s;
  let T = 0;
  for (let i = 0; i < N; i++) {
    const k = i * 3;
    T += 0.5 * m[i] * (v[k] * v[k] + v[k + 1] * v[k + 1] + v[k + 2] * v[k + 2]);
  }
  let U = 0;
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const dx = x[j * 3] - x[i * 3];
      const dy = x[j * 3 + 1] - x[i * 3 + 1];
      const dz = x[j * 3 + 2] - x[i * 3 + 2];
      U -= (G * m[i] * m[j]) / Math.sqrt(dx * dx + dy * dy + dz * dz + eps2);
    }
  }
  return T + U;
}

/** Total linear momentum into out[0..2]. */
export function momentum(s: Sys, out: Float64Array | number[]): void {
  out[0] = out[1] = out[2] = 0;
  for (let i = 0; i < N; i++) {
    out[0] += s.m[i] * s.v[i * 3];
    out[1] += s.m[i] * s.v[i * 3 + 1];
    out[2] += s.m[i] * s.v[i * 3 + 2];
  }
}

/** Total angular momentum about the origin into out[0..2]. */
export function angularMomentum(s: Sys, out: Float64Array | number[]): void {
  out[0] = out[1] = out[2] = 0;
  const { x, v, m } = s;
  for (let i = 0; i < N; i++) {
    const k = i * 3;
    out[0] += m[i] * (x[k + 1] * v[k + 2] - x[k + 2] * v[k + 1]);
    out[1] += m[i] * (x[k + 2] * v[k] - x[k] * v[k + 2]);
    out[2] += m[i] * (x[k] * v[k + 1] - x[k + 1] * v[k]);
  }
}

/** Centre of mass into out[0..2]. */
export function centerOfMass(s: Sys, out: Float64Array | number[]): void {
  out[0] = out[1] = out[2] = 0;
  let M = 0;
  for (let i = 0; i < N; i++) {
    M += s.m[i];
    out[0] += s.m[i] * s.x[i * 3];
    out[1] += s.m[i] * s.x[i * 3 + 1];
    out[2] += s.m[i] * s.x[i * 3 + 2];
  }
  out[0] /= M;
  out[1] /= M;
  out[2] /= M;
}

/** Shift to the centre-of-mass frame: COM at the origin, zero total momentum. */
export function toComFrame(s: Sys): void {
  let M = 0;
  const c = [0, 0, 0];
  const p = [0, 0, 0];
  for (let i = 0; i < N; i++) {
    M += s.m[i];
    for (let d = 0; d < 3; d++) {
      c[d] += s.m[i] * s.x[i * 3 + d];
      p[d] += s.m[i] * s.v[i * 3 + d];
    }
  }
  for (let i = 0; i < N; i++) {
    for (let d = 0; d < 3; d++) {
      s.x[i * 3 + d] -= c[d] / M;
      s.v[i * 3 + d] -= p[d] / M;
    }
  }
}

// --- Diagnostics -----------------------------------------------------------

/** Position-space distance between two runs: sqrt(sum_i |r_i - r'_i|^2). */
export function separation(a: Sys, b: Sys): number {
  let s2 = 0;
  for (let k = 0; k < 9; k++) {
    const d = a.x[k] - b.x[k];
    s2 += d * d;
  }
  return Math.sqrt(s2);
}

/** How far the triangle is from its starting shape: max |side_k / side_k(0) - 1|. */
export function shapeDistortion(s: Sys, sides0: ArrayLike<number>): number {
  return Math.max(
    Math.abs(pairDist(s, 0, 1) / sides0[0] - 1),
    Math.abs(pairDist(s, 0, 2) / sides0[1] - 1),
    Math.abs(pairDist(s, 1, 2) / sides0[2] - 1),
  );
}

const ESC = new Float64Array(3);

/**
 * Two-body energy of body i relative to the centre of mass of the other two,
 * with the pair treated as one point. Positive means body i is on an escape path.
 * Writes [E, r, radial speed] into out and returns E.
 */
export function escapeEnergy(s: Sys, i: number, out: Float64Array | number[] = ESC): number {
  const j = (i + 1) % 3;
  const k = (i + 2) % 3;
  const { x, v, m } = s;
  const M = m[j] + m[k];
  let r2 = 0;
  let u2 = 0;
  let rv = 0;
  for (let d = 0; d < 3; d++) {
    const cx = M > 0 ? (m[j] * x[j * 3 + d] + m[k] * x[k * 3 + d]) / M : 0.5 * (x[j * 3 + d] + x[k * 3 + d]);
    const cv = M > 0 ? (m[j] * v[j * 3 + d] + m[k] * v[k * 3 + d]) / M : 0.5 * (v[j * 3 + d] + v[k * 3 + d]);
    const dx = x[i * 3 + d] - cx;
    const du = v[i * 3 + d] - cv;
    r2 += dx * dx;
    u2 += du * du;
    rv += dx * du;
  }
  const r = Math.sqrt(r2);
  const mu = M + m[i] > 0 ? (m[i] * M) / (m[i] + M) : 0;
  const E = 0.5 * mu * u2 - (G * m[i] * M) / r;
  out[0] = E;
  out[1] = r;
  out[2] = r > 0 ? rv / r : 0;
  return E;
}

/**
 * Index of an ejected body, or -1. A body counts as ejected when it is far
 * from the other two (beyond `far` and 3x the pair's own separation), moving
 * outward, and its two-body energy relative to the pair is positive.
 */
export function ejectedBody(s: Sys, far: number): number {
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % 3;
    const k = (i + 2) % 3;
    const E = escapeEnergy(s, i, ESC);
    if (E > 0 && ESC[2] > 0 && ESC[1] > far && ESC[1] > 3 * pairDist(s, j, k)) return i;
  }
  return -1;
}

// --- Presets ---------------------------------------------------------------

export type PresetId = 'figure8' | 'lagrange' | 'hierarchical' | 'pythagorean' | 'random';

/** Default masses for each preset. Body 1 sets the unit for the mass sliders. */
export const PRESET_MASSES: Record<PresetId, [number, number, number]> = {
  figure8: [1, 1, 1],
  lagrange: [1, 1, 1],
  hierarchical: [1, 0.02, 5e-4],
  pythagorean: [3, 4, 5],
  random: [1, 1, 1],
};

/** Small seeded PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function setBody(s: Sys, i: number, px: number, py: number, pz: number, vx: number, vy: number, vz: number): void {
  s.x[i * 3] = px;
  s.x[i * 3 + 1] = py;
  s.x[i * 3 + 2] = pz;
  s.v[i * 3] = vx;
  s.v[i * 3 + 1] = vy;
  s.v[i * 3 + 2] = vz;
}

/** Mean pair distance, the system's length scale. */
export function sizeScale(s: Sys): number {
  return (pairDist(s, 0, 1) + pairDist(s, 0, 2) + pairDist(s, 1, 2)) / 3;
}

/**
 * Fill s with a preset's initial conditions for masses m, in the COM frame.
 * `tilt` adds out-of-plane velocity (fraction of the system's speed scale).
 */
export function buildPreset(s: Sys, id: PresetId, m: ArrayLike<number>, tilt = 0, seed = 1): void {
  s.m[0] = m[0];
  s.m[1] = m[1];
  s.m[2] = m[2];
  s.t = 0;
  s.eps2 = 0;
  s.x.fill(0);
  s.v.fill(0);
  const M = m[0] + m[1] + m[2];
  switch (id) {
    case 'figure8': {
      // Chenciner and Montgomery (2000), initial data from Simó.
      const vx = -0.93240737;
      const vy = -0.86473146;
      setBody(s, 0, 0.97000436, -0.24308753, 0, -vx / 2, -vy / 2, 0);
      setBody(s, 1, -0.97000436, 0.24308753, 0, -vx / 2, -vy / 2, 0);
      setBody(s, 2, 0, 0, 0, vx, vy, 0);
      break;
    }
    case 'lagrange': {
      // Equilateral triangle of side a, rigidly rotating with w^2 = G M / a^3 about the COM.
      const R = 1;
      for (let i = 0; i < 3; i++) {
        const th = Math.PI / 2 + (i * 2 * Math.PI) / 3;
        setBody(s, i, R * Math.cos(th), R * Math.sin(th), 0, 0, 0, 0);
      }
      const c = [0, 0];
      for (let i = 0; i < 3; i++) {
        c[0] += (m[i] * s.x[i * 3]) / M;
        c[1] += (m[i] * s.x[i * 3 + 1]) / M;
      }
      const a = R * Math.sqrt(3);
      const w = Math.sqrt((G * M) / (a * a * a));
      for (let i = 0; i < 3; i++) {
        const rx = s.x[i * 3] - c[0];
        const ry = s.x[i * 3 + 1] - c[1];
        s.v[i * 3] = -w * ry;
        s.v[i * 3 + 1] = w * rx;
      }
      break;
    }
    case 'hierarchical': {
      // Star, planet at distance 1, moon at 0.07 from the planet (well inside the Hill sphere).
      const aP = 1;
      const aM = 0.07;
      const vP = Math.sqrt((G * M) / aP);
      const vM = Math.sqrt((G * (m[1] + m[2])) / aM);
      setBody(s, 0, 0, 0, 0, 0, 0, 0);
      const mp = m[1] + m[2];
      const fP = mp > 0 ? m[2] / mp : 0.5;
      const fM = mp > 0 ? m[1] / mp : 0.5;
      setBody(s, 1, aP - fP * aM, 0, 0, 0, vP - fP * vM, 0);
      setBody(s, 2, aP + fM * aM, 0, 0, 0, vP + fM * vM, 0);
      break;
    }
    case 'pythagorean': {
      // Burrau (1913): masses 3, 4, 5 at rest at the corners of a 3-4-5 triangle.
      setBody(s, 0, 1, 3, 0, 0, 0, 0);
      setBody(s, 1, -2, -1, 0, 0, 0, 0);
      setBody(s, 2, 1, -1, 0, 0, 0, 0);
      break;
    }
    case 'random': {
      // Draw until no body starts on an escape path, so the chaos has time to show.
      const r = rng(seed);
      for (let attempt = 0; attempt < 64; attempt++) {
        for (let i = 0; i < 3; i++) {
          const ang = r() * 2 * Math.PI;
          const rad = 0.4 + 0.8 * r();
          const va = r() * 2 * Math.PI;
          const vs = 0.2 + 0.5 * r();
          setBody(s, i, rad * Math.cos(ang), rad * Math.sin(ang), 0, vs * Math.cos(va), vs * Math.sin(va), 0);
        }
        toComFrame(s);
        // Rescale speeds so kinetic energy is 30% of |potential|: bound overall, but not tightly.
        let T = 0;
        for (let i = 0; i < 3; i++) T += 0.5 * m[i] * (s.v[i * 3] ** 2 + s.v[i * 3 + 1] ** 2);
        const U = T - energy(s);
        const k = T > 0 ? Math.sqrt((0.3 * U) / T) : 0;
        for (let q = 0; q < 9; q++) s.v[q] *= k;
        if (minPairDist(s) > 0.5 && escapeEnergy(s, 0) < 0 && escapeEnergy(s, 1) < 0 && escapeEnergy(s, 2) < 0) break;
      }
      break;
    }
  }
  toComFrame(s);
  if (tilt !== 0) {
    const vchar = Math.sqrt((G * M) / sizeScale(s));
    const c = [1, -1, 0.35];
    for (let i = 0; i < 3; i++) s.v[i * 3 + 2] += tilt * vchar * c[i];
    toComFrame(s);
  }
}

/** Shift body i by delta along x (the ghost's nudge). */
export function nudge(s: Sys, i: number, delta: number): void {
  s.x[i * 3] += delta;
}
