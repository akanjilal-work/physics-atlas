// Ellis–Bronnikov (Morris–Thorne) wormhole: ds² = −dt² + dℓ² + (b0² + ℓ²) dΩ², with G = c = 1.
// Pure math. No DOM, no Three.js.

const HALF_PI = Math.PI / 2;

/** Areal radius r(ℓ) = √(b0² + ℓ²). */
export const areal = (l: number, b0: number): number => Math.sqrt(b0 * b0 + l * l);

/** Height of the embedding surface z(ℓ) = b0 asinh(ℓ/b0). */
export const embedZ = (l: number, b0: number): number => b0 * Math.asinh(l / b0);

/**
 * Carlson's symmetric elliptic integral R_F(x, y, z) by the duplication method.
 * Converges to about 1e-15 relative error in a handful of iterations.
 */
export function carlsonRF(x: number, y: number, z: number): number {
  for (let i = 0; i < 60; i++) {
    const sx = Math.sqrt(x);
    const sy = Math.sqrt(y);
    const sz = Math.sqrt(z);
    const lam = sx * (sy + sz) + sy * sz;
    x = 0.25 * (x + lam);
    y = 0.25 * (y + lam);
    z = 0.25 * (z + lam);
    const mu = (x + y + z) / 3;
    const dx = 1 - x / mu;
    const dy = 1 - y / mu;
    const dz = 1 - z / mu;
    if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) < 1e-4) {
      const e2 = dx * dy - dz * dz;
      const e3 = dx * dy * dz;
      return (1 - e2 / 10 + e3 / 14 + (e2 * e2) / 24 - (3 * e2 * e3) / 44) / Math.sqrt(mu);
    }
  }
  return 1 / Math.sqrt((x + y + z) / 3);
}

/** Incomplete elliptic integral of the first kind F(φ, k), for 0 ≤ φ ≤ π/2 and 0 ≤ k < 1. */
export function ellF(phi: number, k: number): number {
  const s = Math.sin(phi);
  const c = Math.cos(phi);
  return s * carlsonRF(c * c, 1 - k * k * s * s, 1);
}

/** Complete elliptic integral of the first kind K(k). */
export function ellK(k: number): number {
  return carlsonRF(0, 1 - k * k, 1);
}

/**
 * Total deflection of a ray that comes in from ℓ = +∞, turns back (b > b0) and leaves to ℓ = +∞.
 * The swept angle is 2K(b0/b), so α = 2K(b0/b) − π.
 */
export function deflection(b: number, b0: number): number {
  return 2 * ellK(Math.min(1 - 1e-16, b0 / b)) - Math.PI;
}

/** Far-field limit of the deflection: α ≈ π b0² / (4 b²). */
export const weakDeflection = (b: number, b0: number): number => (Math.PI * b0 * b0) / (4 * b * b);

/** Angle swept by a ray that crosses the throat from ℓ = +∞ to ℓ = −∞ (b < b0): 2(b/b0) K(b/b0). */
export function crossingSweep(b: number, b0: number): number {
  return 2 * (b / b0) * ellK(b / b0);
}

/** Turning point of a ray with b > b0: ℓ_t = √(b² − b0²). NaN when the ray crosses. */
export const turningPoint = (b: number, b0: number): number => (b > b0 ? Math.sqrt(b * b - b0 * b0) : NaN);

/**
 * Angle Φ swept between the camera (at |ℓ| = lc) and the far sky, for a ray received at angle θ from the
 * inward (toward the throat) direction. b = r_cam sin θ. Rays with θ < π/2 and b < b0 cross the throat
 * and end on the other universe's sky. All other rays end on the camera's own sky.
 */
export function skyAngle(theta: number, lc: number, b0: number): number {
  const R = areal(lc, b0);
  const b = R * Math.sin(theta);
  const inward = theta <= HALF_PI;
  if (b < b0) {
    const k = b / b0;
    const a = Math.sqrt(b0 * b0 - b * b);
    const K = ellK(k);
    const f = ellF(Math.atan2(lc, a), k);
    return (b / b0) * (inward ? K + f : K - f);
  }
  const k = Math.min(1 - 1e-16, b0 / b);
  const den = R * R - b0 * b0;
  const psi = den > 0 ? Math.asin(Math.min(1, Math.sqrt(Math.max(0, (R * R - b * b) / den)))) : 0;
  const K = ellK(k);
  const f = ellF(psi, k);
  return inward ? K + f : K - f;
}

/** Angular radius of the throat on the camera's sky: sin θ_t = b0 / r_cam. */
export const throatAngle = (lc: number, b0: number): number => Math.asin(Math.min(1, b0 / areal(lc, b0)));

export interface SkyLut {
  /** Row 0: crossing rays, θ ∈ [0, θ_t). Row 1: staying rays, θ ∈ (θ_t, π]. Sampled on √ spacing toward θ_t. */
  phi: Float32Array;
  n: number;
  thetaT: number;
}

/** Fill a 2-row lookup table of Φ(θ). Index i on each row maps to t = i/(n−1), |θ − θ_t| = t² × range. */
export function fillSkyLut(out: Float32Array, n: number, lc: number, b0: number): number {
  const tt = throatAngle(lc, b0);
  const eps = 1e-7;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const s = Math.max(eps, t * t);
    out[i] = skyAngle(tt * (1 - s), lc, b0);
    out[n + i] = skyAngle(tt + (Math.PI - tt) * s, lc, b0);
  }
  return tt;
}

// --- Null geodesics in the equatorial plane, integrated as second-order ODEs with RK4.
// Coordinates (ℓ, φ). The affine parameter equals t because g_tt = −1 (E = 1).
// ℓ'' = ℓ φ'²,  φ'' = −2 ℓ ℓ' φ' / r².
// Nothing in the integrator imposes b = r² φ' or the null condition. Both are checks.

export type Ray = [l: number, phi: number, dl: number, dphi: number];

function deriv(s: Ray, b0: number, out: number[]): void {
  const [l, , dl, dp] = s;
  const r2 = b0 * b0 + l * l;
  out[0] = dl;
  out[1] = dp;
  out[2] = l * dp * dp;
  out[3] = (-2 * l * dl * dp) / r2;
}

const k1 = [0, 0, 0, 0];
const k2 = [0, 0, 0, 0];
const k3 = [0, 0, 0, 0];
const k4 = [0, 0, 0, 0];
const tmp: Ray = [0, 0, 0, 0];

/** One RK4 step of size h. Updates s in place. */
export function rk4(s: Ray, b0: number, h: number): void {
  deriv(s, b0, k1);
  for (let i = 0; i < 4; i++) tmp[i] = s[i] + 0.5 * h * k1[i];
  deriv(tmp, b0, k2);
  for (let i = 0; i < 4; i++) tmp[i] = s[i] + 0.5 * h * k2[i];
  deriv(tmp, b0, k3);
  for (let i = 0; i < 4; i++) tmp[i] = s[i] + h * k3[i];
  deriv(tmp, b0, k4);
  for (let i = 0; i < 4; i++) s[i] += (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
}

/** Start a unit-energy ray at ℓ0 with impact parameter b, heading toward the throat (or away if outward). */
export function launch(l0: number, b: number, b0: number, outward = false): Ray {
  const r2 = b0 * b0 + l0 * l0;
  const toward = l0 >= 0 ? -1 : 1;
  const radial = Math.sqrt(Math.max(0, 1 - (b * b) / r2));
  return [l0, 0, (outward ? -toward : toward) * radial, b / r2];
}

/** Impact parameter from the state: b = r² φ' / t' with t' = 1. */
export const impactOf = (s: Ray, b0: number): number => (b0 * b0 + s[0] * s[0]) * s[3];

/** Null condition residual: −1 + ℓ'² + r² φ'². Zero for light. */
export const nullResidual = (s: Ray, b0: number): number => -1 + s[2] * s[2] + (b0 * b0 + s[0] * s[0]) * s[3] * s[3];

export interface TraceResult {
  crossed: boolean;
  sweep: number;
  lMin: number;
  bDrift: number;
  nullDrift: number;
}

/** Trace a ray from ℓ0 inward until |ℓ| exceeds lOut. */
export function trace(l0: number, b: number, b0: number, lOut: number, h = 1e-3, maxSteps = 5e6): TraceResult {
  const s = launch(l0, b, b0);
  let lMin = Math.abs(l0);
  let bDrift = 0;
  let nullDrift = 0;
  const side = Math.sign(l0) || 1;
  for (let i = 0; i < maxSteps; i++) {
    rk4(s, b0, h);
    lMin = Math.min(lMin, Math.abs(s[0]));
    bDrift = Math.max(bDrift, Math.abs(impactOf(s, b0) - b));
    nullDrift = Math.max(nullDrift, Math.abs(nullResidual(s, b0)));
    if (Math.abs(s[0]) > lOut) break;
  }
  return { crossed: Math.sign(s[0]) !== side, sweep: s[1], lMin, bDrift, nullDrift };
}

/**
 * Orthonormal-frame Einstein tensor for ds² = −dt² + dℓ² + r(ℓ)² dΩ², from finite differences of r(ℓ).
 * Returns ρ = G_t̂t̂/8π and the radial pressure p = G_ℓ̂ℓ̂/8π.
 */
export function stressFromShape(r: (l: number) => number, l: number, h = 1e-4): { rho: number; pr: number } {
  const r0 = r(l);
  const rp = (r(l + h) - r(l - h)) / (2 * h);
  const rpp = (r(l + h) - 2 * r0 + r(l - h)) / (h * h);
  const Gtt = (1 - rp * rp - 2 * r0 * rpp) / (r0 * r0);
  const Gll = (rp * rp - 1) / (r0 * r0);
  return { rho: Gtt / (8 * Math.PI), pr: Gll / (8 * Math.PI) };
}

/** Exact null-energy combination for the Ellis wormhole: ρ + p_r = −b0² / (4π r⁴). */
export const necExact = (l: number, b0: number): number => -(b0 * b0) / (4 * Math.PI * Math.pow(b0 * b0 + l * l, 2));
