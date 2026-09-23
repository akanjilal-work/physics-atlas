// Cosmic string physics: conical geometry, double images, the Kaiser–Stebbins step,
// and Kibble–Turok loops. Pure functions, no DOM, no Three.js.
// Units: G = c = 1, so Gμ is the dimensionless string tension Gμ/c².

export const TWO_PI = Math.PI * 2;
export const T_CMB = 2.7255; // K
/** Planck 2013 (XXV) 95% limit for Nambu–Goto strings. Abelian-Higgs strings: 3.2e-7. */
export const GMU_CMB = 1.5e-7;
export const GMU_CMB_AH = 3.2e-7;
export const ARCSEC = Math.PI / (180 * 3600);

/** Deficit angle Δ = 8πGμ/c² in radians. */
export const deficitAngle = (gmu: number): number => 8 * Math.PI * gmu;

/** Kaiser–Stebbins step δT/T ≈ 8πGμ γ v for a string moving at speed v (units of c) across the line of sight. */
export function ksStep(gmu: number, v: number): number {
  const g = 1 / Math.sqrt(1 - v * v);
  return 8 * Math.PI * gmu * g * v;
}

// ---------------------------------------------------------------------------
// Cut-and-glue cone.
// The paper is the flat plane minus a wedge of angle Δ centred on φ = π.
// Paper polar angle φ lives in (−(π − Δ/2), π − Δ/2]. The two edges are glued.

export interface Vec3 { x: number; y: number; z: number }

/** Fold factor c: 1 is flat paper, 2π/(2π − Δ) is the closed cone. s ∈ [0, 1] animates between them. */
export function foldFactor(delta: number, s: number): number {
  return 1 + s * (TWO_PI / (TWO_PI - delta) - 1);
}

/**
 * Map paper polar coords (r, φ) onto a cone with fold factor c (apex at origin, axis along −z).
 * Every c ≥ 1 is an isometry: the cone has sin β = 1/c and the angle is stretched by c,
 * so a circle of paper radius r keeps its length.
 */
export function coneEmbed(r: number, phi: number, c: number, out: Vec3): Vec3 {
  const sb = 1 / c;
  const cb = Math.sqrt(Math.max(0, 1 - sb * sb));
  const psi = phi * c;
  out.x = r * sb * Math.cos(psi);
  out.y = r * sb * Math.sin(psi);
  out.z = -r * cb;
  return out;
}

/** Bring any covering-plane angle into the paper range (−(π − Δ/2), π − Δ/2]. */
export function wrapPaper(theta: number, delta: number): number {
  const P = TWO_PI - delta;
  const hi = Math.PI - delta / 2;
  let a = theta;
  while (a > hi) a -= P;
  while (a <= -hi) a += P;
  return a;
}

/**
 * Source position on the paper. `s` is the source offset in units of Δ/2, measured on the paper
 * from the glued seam (which lies straight behind the string as seen by the observer).
 * s ≥ 0 sits on the upper sheet, s < 0 on the lower sheet. Double images occur for |s| < 1.
 */
export function sourceAngle(delta: number, s: number): number {
  const seam = Math.PI - delta / 2;
  const rho = (s * delta) / 2;
  return s >= 0 ? seam - rho : -seam - rho;
}

export interface Image {
  /** Copy index in the covering plane: the source is rotated by k(2π − Δ). */
  k: number;
  /** Arrival direction at the observer, measured from the direction to the string (radians, signed). */
  dir: number;
  /** Path length along the geodesic. */
  length: number;
  /** Covering-plane position of the source copy. */
  sx: number;
  sy: number;
}

/**
 * All straight-line paths from an observer at paper position (rO, 0) to a source at (rS, φS).
 * A copy of the source at covering angle φS + k(2π − Δ) is reachable by a straight line
 * only if it subtends less than π at the apex, so |φS + k(2π − Δ)| < π.
 */
export function images(delta: number, rO: number, rS: number, phiS: number): Image[] {
  const out: Image[] = [];
  const P = TWO_PI - delta;
  for (let k = -1; k <= 1; k++) {
    const th = phiS + k * P;
    if (Math.abs(th) >= Math.PI) continue;
    const sx = rS * Math.cos(th);
    const sy = rS * Math.sin(th);
    const dx = sx - rO;
    const dy = sy;
    // Direction to the string from the observer is −x. Measure arrival angle from it.
    const dir = Math.atan2(dy, -dx);
    out.push({ k, dir, length: Math.hypot(dx, dy), sx, sy });
  }
  return out;
}

/** Angular separation of the two images, or 0 if there is only one. */
export function imageSeparation(delta: number, rO: number, rS: number, phiS: number): number {
  const im = images(delta, rO, rS, phiS);
  if (im.length < 2) return 0;
  return Math.abs(im[0].dir - im[1].dir);
}

/** Exact separation for a source straight behind the string (on the seam). */
export function seamSeparation(delta: number, rO: number, rS: number): number {
  return 2 * Math.atan2(rS * Math.sin(delta / 2), rO + rS * Math.cos(delta / 2));
}

/**
 * Small-angle sky mapping for a straight string across the line of sight.
 * A source at true angle x from the string (in the symmetric-cut frame) has images at x ± h,
 * where h = (Δ/2)(D_ls/D_s). Only images landing on their own side of the string exist.
 * Returns the number of images written to out[0..1] (right image first).
 */
export function skyImages(x: number, h: number, out: number[]): number {
  let n = 0;
  if (x + h > 0) out[n++] = x + h;
  if (x - h < 0) out[n++] = x - h;
  return n;
}

// ---------------------------------------------------------------------------
// Kibble–Turok loops. x(σ, t) = ½[a(σ − t) + b(σ + t)] with |a′| = |b′| = 1 (conformal gauge, c = 1).

export interface LoopParams {
  /** Invariant loop length (energy / μ). */
  L: number;
  /** Shape parameter α ∈ [0, 1]. */
  alpha: number;
  /** Tilt φ of the b-circle. */
  phi: number;
}

export function aPos(u: number, p: LoopParams, out: Vec3): Vec3 {
  const k = TWO_PI / p.L;
  const A = 1 / k;
  const q = Math.sqrt(Math.max(0, p.alpha * (1 - p.alpha)));
  const s1 = Math.sin(k * u);
  const c1 = Math.cos(k * u);
  const s3 = Math.sin(3 * k * u);
  const c3 = Math.cos(3 * k * u);
  out.x = A * ((1 - p.alpha) * s1 + (p.alpha / 3) * s3);
  out.y = A * (-(1 - p.alpha) * c1 - (p.alpha / 3) * c3);
  out.z = A * (-2 * q * c1);
  return out;
}

export function aPrime(u: number, p: LoopParams, out: Vec3): Vec3 {
  const k = TWO_PI / p.L;
  const q = Math.sqrt(Math.max(0, p.alpha * (1 - p.alpha)));
  out.x = (1 - p.alpha) * Math.cos(k * u) + p.alpha * Math.cos(3 * k * u);
  out.y = (1 - p.alpha) * Math.sin(k * u) + p.alpha * Math.sin(3 * k * u);
  out.z = 2 * q * Math.sin(k * u);
  return out;
}

function aSecond(u: number, p: LoopParams, out: Vec3): Vec3 {
  const k = TWO_PI / p.L;
  const q = Math.sqrt(Math.max(0, p.alpha * (1 - p.alpha)));
  out.x = k * (-(1 - p.alpha) * Math.sin(k * u) - 3 * p.alpha * Math.sin(3 * k * u));
  out.y = k * ((1 - p.alpha) * Math.cos(k * u) + 3 * p.alpha * Math.cos(3 * k * u));
  out.z = k * 2 * q * Math.cos(k * u);
  return out;
}

export function bPos(v: number, p: LoopParams, out: Vec3): Vec3 {
  const k = TWO_PI / p.L;
  const A = 1 / k;
  out.x = A * Math.sin(k * v);
  out.y = -A * Math.cos(p.phi) * Math.cos(k * v);
  out.z = -A * Math.sin(p.phi) * Math.cos(k * v);
  return out;
}

export function bPrime(v: number, p: LoopParams, out: Vec3): Vec3 {
  const k = TWO_PI / p.L;
  out.x = Math.cos(k * v);
  out.y = Math.cos(p.phi) * Math.sin(k * v);
  out.z = Math.sin(p.phi) * Math.sin(k * v);
  return out;
}

function bSecond(v: number, p: LoopParams, out: Vec3): Vec3 {
  const k = TWO_PI / p.L;
  out.x = -k * Math.sin(k * v);
  out.y = k * Math.cos(p.phi) * Math.cos(k * v);
  out.z = k * Math.sin(p.phi) * Math.cos(k * v);
  return out;
}

const tA: Vec3 = { x: 0, y: 0, z: 0 };
const tB: Vec3 = { x: 0, y: 0, z: 0 };

/** Position of the string point σ at time t. */
export function loopPoint(sigma: number, t: number, p: LoopParams, out: Vec3): Vec3 {
  aPos(sigma - t, p, tA);
  bPos(sigma + t, p, tB);
  out.x = 0.5 * (tA.x + tB.x);
  out.y = 0.5 * (tA.y + tB.y);
  out.z = 0.5 * (tA.z + tB.z);
  return out;
}

/** Velocity ∂x/∂t = ½[b′(σ + t) − a′(σ − t)]. Its length reaches 1 (light speed) only at a cusp. */
export function loopVelocity(sigma: number, t: number, p: LoopParams, out: Vec3): Vec3 {
  aPrime(sigma - t, p, tA);
  bPrime(sigma + t, p, tB);
  out.x = 0.5 * (tB.x - tA.x);
  out.y = 0.5 * (tB.y - tA.y);
  out.z = 0.5 * (tB.z - tA.z);
  return out;
}

export interface Cusp {
  /** Time within one period [0, L/2). */
  t: number;
  sigma: number;
  /** Residual |a′ + b′| after refinement. */
  residual: number;
}

/**
 * Cusps are where a′(u) = −b′(v) on the unit sphere. Coarse grid search, then Gauss–Newton.
 * Each solution (u, v) gives one cusp per period at t = (v − u)/2, σ = (u + v)/2.
 */
export function findCusps(p: LoopParams, grid = 240): Cusp[] {
  const L = p.L;
  const N = grid;
  const f = new Float64Array(N * N);
  const pa: Vec3 = { x: 0, y: 0, z: 0 };
  const pb: Vec3 = { x: 0, y: 0, z: 0 };
  const A: Vec3[] = [];
  const B: Vec3[] = [];
  for (let i = 0; i < N; i++) {
    A.push({ ...aPrime((i / N) * L, p, pa) });
    B.push({ ...bPrime((i / N) * L, p, pb) });
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const dx = A[i].x + B[j].x;
      const dy = A[i].y + B[j].y;
      const dz = A[i].z + B[j].z;
      f[i * N + j] = dx * dx + dy * dy + dz * dz;
    }
  }
  const cand: [number, number][] = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const v = f[i * N + j];
      if (v > 0.1) continue;
      let isMin = true;
      for (let di = -1; di <= 1 && isMin; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          if (!di && !dj) continue;
          const w = f[((i + di + N) % N) * N + ((j + dj + N) % N)];
          if (w < v) { isMin = false; break; }
        }
      }
      if (isMin) cand.push([(i / N) * L, (j / N) * L]);
    }
  }
  const out: Cusp[] = [];
  const da: Vec3 = { x: 0, y: 0, z: 0 };
  const db: Vec3 = { x: 0, y: 0, z: 0 };
  for (let [u, v] of cand) {
    let res = 1;
    for (let it = 0; it < 40; it++) {
      aPrime(u, p, pa);
      bPrime(v, p, pb);
      const F = [pa.x + pb.x, pa.y + pb.y, pa.z + pb.z];
      res = Math.hypot(F[0], F[1], F[2]);
      if (res < 1e-13) break;
      aSecond(u, p, da);
      bSecond(v, p, db);
      const J1 = [da.x, da.y, da.z];
      const J2 = [db.x, db.y, db.z];
      // Normal equations (JᵀJ) δ = −JᵀF
      const a11 = J1[0] * J1[0] + J1[1] * J1[1] + J1[2] * J1[2];
      const a12 = J1[0] * J2[0] + J1[1] * J2[1] + J1[2] * J2[2];
      const a22 = J2[0] * J2[0] + J2[1] * J2[1] + J2[2] * J2[2];
      const g1 = J1[0] * F[0] + J1[1] * F[1] + J1[2] * F[2];
      const g2 = J2[0] * F[0] + J2[1] * F[1] + J2[2] * F[2];
      const det = a11 * a22 - a12 * a12;
      if (Math.abs(det) < 1e-18) break;
      u -= (a22 * g1 - a12 * g2) / det;
      v -= (a11 * g2 - a12 * g1) / det;
    }
    if (res > 1e-8) continue;
    const half = L / 2;
    let t = (v - u) / 2;
    let sigma = (u + v) / 2;
    const n = Math.floor(t / half);
    t -= n * half;
    sigma += n * half;
    sigma = ((sigma % L) + L) % L;
    if (out.some((c) => Math.abs(c.t - t) < 1e-6 * L && Math.abs(c.sigma - sigma) < 1e-6 * L)) continue;
    out.push({ t, sigma, residual: res });
  }
  out.sort((x, y) => x.t - y.t);
  return out;
}
