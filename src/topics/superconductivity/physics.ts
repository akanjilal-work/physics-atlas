// Superconductivity: pure math, no DOM, no Three.js.
// SI units unless a name says otherwise.

/** Exact SI constants (2019 redefinition). */
export const H_PLANCK = 6.62607015e-34; // J s
export const E_CHARGE = 1.602176634e-19; // C
export const K_B = 1.380649e-23; // J/K
export const MU0 = 1.25663706212e-6; // N/A^2
export const G = 9.81; // m/s^2

/** Magnetic flux quantum, h / 2e, in webers. The 2 is the charge of a Cooper pair. */
export const PHI0 = H_PLANCK / (2 * E_CHARGE);

/** Weak-coupling BCS ratio Δ(0) / (k_B T_c) = π e^{-γ}. */
export const EULER_GAMMA = 0.5772156649015329;
export const BCS_RATIO = Math.PI * Math.exp(-EULER_GAMMA); // 1.7639...

export type MaterialId = 'Hg' | 'Nb' | 'YBCO';

export interface Material {
  id: MaterialId;
  name: string;
  /** Critical temperature, K. */
  Tc: number;
  type: 1 | 2;
  /** Zero-temperature critical field in tesla: thermodynamic B_c for Type I, upper B_c2 for Type II. */
  Bc0: number;
  /** Zero-temperature London penetration depth, m (order of magnitude). */
  lambda0: number;
  /** Zero-temperature coherence length, m (order of magnitude). */
  xi0: number;
  /** Normal-state resistance shape: 'metal' (flat residual) or 'linear' (cuprate strange metal). */
  normal: 'metal' | 'linear';
}

export const MATERIALS: Record<MaterialId, Material> = {
  Hg: { id: 'Hg', name: 'Mercury', Tc: 4.15, type: 1, Bc0: 0.041, lambda0: 40e-9, xi0: 200e-9, normal: 'metal' },
  Nb: { id: 'Nb', name: 'Niobium', Tc: 9.3, type: 2, Bc0: 0.4, lambda0: 40e-9, xi0: 38e-9, normal: 'metal' },
  YBCO: { id: 'YBCO', name: 'YBa₂Cu₃O₇', Tc: 92, type: 2, Bc0: 100, lambda0: 150e-9, xi0: 1.5e-9, normal: 'linear' },
};

/** Empirical parabolic law B_c(T) = B_c(0)(1 - (T/Tc)^2), zero above Tc. */
export function criticalField(T: number, Bc0: number, Tc: number): number {
  if (T >= Tc) return 0;
  const r = T / Tc;
  return Bc0 * (1 - r * r);
}

/** Two-fluid (Gorter-Casimir) penetration depth λ(T) = λ0 / sqrt(1 - (T/Tc)^4). Infinite at and above Tc. */
export function londonLambda(T: number, lambda0: number, Tc: number): number {
  if (T >= Tc) return Infinity;
  const r = T / Tc;
  return lambda0 / Math.sqrt(1 - r * r * r * r);
}

/** London decay of a field applied parallel to a flat surface: B(x) = B0 e^{-x/λ}, x measured into the sample. */
export function londonField(x: number, B0: number, lambda: number): number {
  if (!Number.isFinite(lambda)) return B0;
  return B0 * Math.exp(-x / lambda);
}

/** London depth from superfluid electron density: λ = sqrt(m / (μ0 n_s e^2)). */
export function londonDepthFromDensity(ns: number): number {
  const me = 9.1093837015e-31;
  return Math.sqrt(me / (MU0 * ns * E_CHARGE * E_CHARGE));
}

/** BCS zero-temperature gap Δ(0) = 1.764 k_B Tc, in joules. */
export function bcsGap0(Tc: number): number {
  return BCS_RATIO * K_B * Tc;
}

/** Common interpolation of the BCS gap: Δ(T) ≈ Δ(0) tanh(1.74 sqrt(Tc/T - 1)). Joules. */
export function bcsGap(T: number, Tc: number): number {
  if (T >= Tc) return 0;
  if (T <= 0) return bcsGap0(Tc);
  return bcsGap0(Tc) * Math.tanh(1.74 * Math.sqrt(Tc / T - 1));
}

// ------------------------------------------------------------------ levitation

/** Dipole moment of a uniformly magnetised block: m = B_r V / μ0 (A m^2). */
export function magnetMoment(Br: number, volume: number): number {
  return (Br * volume) / MU0;
}

/**
 * Repulsive force on a vertical dipole m at height z above a perfect diamagnetic plane.
 * The boundary condition B_normal = 0 is met by an anti-parallel image dipole at -z.
 * Two coaxial anti-parallel dipoles a distance 2z apart repel with F = 3 μ0 m^2 / (2π (2z)^4).
 */
export function imageForce(m: number, z: number): number {
  return (3 * MU0 * m * m) / (32 * Math.PI * z ** 4);
}

/** Interaction energy of the dipole with its induced image: U = μ0 m^2 / (32 π z^3). F = -dU/dz. */
export function imageEnergy(m: number, z: number): number {
  return (MU0 * m * m) / (32 * Math.PI * z ** 3);
}

/** Height where the image force balances the weight M g. */
export function levitationHeight(m: number, M: number, g = G): number {
  return Math.pow((3 * MU0 * m * m) / (32 * Math.PI * M * g), 0.25);
}

/**
 * Largest field at the superconductor's surface (all tangential). Real dipole plus image doubles
 * the tangential part, which peaks at radius z/2: B = 2 * 3 (1/2) / 1.25^{5/2} * μ0 m / (4π z^3).
 */
export function surfaceFieldMax(m: number, z: number): number {
  const k = (2 * 3 * 0.5) / Math.pow(1.25, 2.5); // 1.7173
  return (k * MU0 * m) / (4 * Math.PI * z ** 3);
}

export interface MagnetState {
  z: number; // centre height above the surface, m
  v: number; // vertical velocity, m/s
}

export interface MagnetParams {
  m: number; // dipole moment, A m^2
  M: number; // mass, kg
  zRest: number; // centre height when resting on the surface, m
  /** Fraction of the ideal Meissner image that is present (0 normal, 1 full expulsion). */
  s: number;
  /** Linear damping rate, 1/s (eddy currents and air, lumped). */
  damp: number;
  /** Flux-pinning spring (N/m), 0 when not pinned. Qualitative model. */
  kPin: number;
  zPin: number;
  /** Extra damping while pinned, 1/s. */
  dampPin: number;
}

/** Net upward force on the magnet (without contact force). */
export function magnetForce(z: number, v: number, p: MagnetParams): number {
  let F = p.s * imageForce(p.m, z) - p.M * G - p.M * p.damp * v;
  if (p.kPin > 0) F += -p.kPin * (z - p.zPin) - p.M * p.dampPin * v;
  return F;
}

/** One semi-implicit (symplectic) Euler step with an inelastic floor. */
export function stepMagnet(st: MagnetState, p: MagnetParams, h: number): void {
  const a = magnetForce(st.z, st.v, p) / p.M;
  st.v += a * h;
  st.z += st.v * h;
  if (st.z < p.zRest) {
    st.z = p.zRest;
    st.v = st.v < 0 ? -0.25 * st.v : st.v;
    if (Math.abs(st.v) < 0.02) st.v = 0;
  }
}

// ------------------------------------------------------------------ field lines

/**
 * Field of a vertical dipole at height ym (unit strength) plus an image dipole of strength -s at -ym,
 * in the meridional plane (rho, y). Writes [B_rho, B_y] into out.
 */
export function meridianField(rho: number, y: number, ym: number, s: number, out: Float64Array): void {
  let dy = y - ym;
  let r2 = rho * rho + dy * dy;
  let r5 = r2 * r2 * Math.sqrt(r2);
  let br = (3 * rho * dy) / r5;
  let by = (3 * dy * dy - r2) / r5;
  if (s !== 0) {
    dy = y + ym;
    r2 = rho * rho + dy * dy;
    r5 = r2 * r2 * Math.sqrt(r2);
    br -= (s * 3 * rho * dy) / r5;
    by -= (s * (3 * dy * dy - r2)) / r5;
  }
  out[0] = br;
  out[1] = by;
}

const fb = new Float64Array(2);
function dirAt(rho: number, y: number, ym: number, s: number, out: Float64Array): void {
  meridianField(rho, y, ym, s, fb);
  const n = Math.hypot(fb[0], fb[1]) || 1;
  out[0] = fb[0] / n;
  out[1] = fb[1] / n;
}

const k1 = new Float64Array(2);
const k2 = new Float64Array(2);
const k3 = new Float64Array(2);
const k4 = new Float64Array(2);

/**
 * Trace one field line in the meridional plane, starting on a sphere of radius r0 around the dipole
 * at polar angle theta0 from the north pole, and following B (RK4 on unit tangent, fixed arc step ds).
 * Writes (rho, y) pairs into out and returns the point count. Units are arbitrary (scene cm).
 */
export function traceLine(ym: number, s: number, theta0: number, r0: number, ds: number, out: Float32Array, maxPts: number): number {
  let rho = r0 * Math.sin(theta0);
  let y = ym + r0 * Math.cos(theta0);
  let n = 0;
  out[n * 2] = rho;
  out[n * 2 + 1] = y;
  n++;
  for (let i = 1; i < maxPts; i++) {
    dirAt(rho, y, ym, s, k1);
    dirAt(rho + 0.5 * ds * k1[0], y + 0.5 * ds * k1[1], ym, s, k2);
    dirAt(rho + 0.5 * ds * k2[0], y + 0.5 * ds * k2[1], ym, s, k3);
    dirAt(rho + ds * k3[0], y + ds * k3[1], ym, s, k4);
    rho += (ds / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    y += (ds / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    if (rho < 0) rho = 0;
    out[n * 2] = rho;
    out[n * 2 + 1] = y;
    n++;
    const d = Math.hypot(rho, y - ym);
    if (i > 8 && d < r0 * 0.98) break;
    if (d > 18 || y < -9) break;
  }
  return n;
}

// ------------------------------------------------------------------ vortex lattice

/** Triangular Abrikosov lattice spacing: each cell of area (√3/2) a^2 carries one Φ0. */
export function vortexSpacing(B: number): number {
  return Math.sqrt((2 * PHI0) / (Math.sqrt(3) * B));
}

/**
 * Fill out with (x, y) sites of a triangular lattice of spacing a inside |x|,|y| <= half,
 * shifted by (ox, oy). Returns the count (capped at cap).
 */
export function triangularLattice(a: number, half: number, ox: number, oy: number, out: Float32Array, cap: number): number {
  const dy = (a * Math.sqrt(3)) / 2;
  const rows = Math.ceil(half / dy) + 2;
  const cols = Math.ceil(half / a) + 2;
  let n = 0;
  for (let j = -rows; j <= rows; j++) {
    const y = j * dy + oy;
    if (Math.abs(y) > half) continue;
    const shift = (j & 1) * 0.5 * a;
    for (let i = -cols; i <= cols; i++) {
      const x = i * a + shift + ox;
      if (Math.abs(x) > half) continue;
      if (n >= cap) return n;
      out[n * 2] = x;
      out[n * 2 + 1] = y;
      n++;
    }
  }
  return n;
}

// ------------------------------------------------------------------ resistance curve

/** Schematic R(T) normalised to 1 at 1.5 Tc. Sharp drop to zero at Tc, width set per material. */
export function resistanceShape(T: number, mat: Material): number {
  const r = T / mat.Tc;
  const normal = mat.normal === 'linear' ? 0.08 + 0.92 * (r / 1.5) : 1 + 0.02 * ((r / 1.5) ** 3 - 1);
  const w = mat.normal === 'linear' ? 0.012 : 0.004;
  const step = 0.5 * (1 + Math.tanh((r - 1 - 2 * w) / w));
  return normal * step;
}
