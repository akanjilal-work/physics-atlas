// Kerr black hole in Boyer–Lindquist coordinates, units G = c = M = 1.
// Horizons, ergosphere, frame dragging, the Bardeen–Press–Teukolsky ISCO,
// equatorial timelike geodesics and a Penrose-process split.
// Pure module: no DOM, no Three.js.

export const M = 1;
/** Thorne (1974) limit on spin from accretion spin-up. */
export const A_THORNE = 0.998;

/** Δ = r² − 2Mr + a². It vanishes at the two horizons. */
export const delta = (r: number, a: number) => r * r - 2 * M * r + a * a;

/** Outer horizon r₊ = M + √(M² − a²). */
export const rPlus = (a: number) => M + Math.sqrt(Math.max(0, M * M - a * a));
/** Inner horizon r₋ = M − √(M² − a²). */
export const rMinus = (a: number) => M - Math.sqrt(Math.max(0, M * M - a * a));

/** Outer edge of the ergosphere r_E(θ) = M + √(M² − a² cos²θ). */
export function rErgo(a: number, theta: number): number {
  const c = Math.cos(theta);
  return M + Math.sqrt(Math.max(0, M * M - a * a * c * c));
}

/** A = (r² + a²)² − a²Δ sin²θ. */
export function bigA(r: number, a: number, theta = Math.PI / 2): number {
  const s = Math.sin(theta);
  const q = r * r + a * a;
  return q * q - a * a * delta(r, a) * s * s;
}

/** Frame-dragging angular velocity ω = −g_tφ/g_φφ = 2Mar / A. */
export function omegaDrag(r: number, a: number, theta = Math.PI / 2): number {
  return (2 * M * a * r) / bigA(r, a, theta);
}

/** Angular velocity of the outer horizon Ω_H = a / (r₊² + a²) = a / (2Mr₊). */
export const omegaHorizon = (a: number) => a / (2 * M * rPlus(a));

/**
 * Bardeen–Press–Teukolsky (1972) innermost stable circular orbit.
 * prograde = orbit in the same sense as the spin.
 */
export function rIsco(a: number, prograde: boolean): number {
  const z1 = 1 + Math.cbrt(1 - a * a) * (Math.cbrt(1 + a) + Math.cbrt(1 - a));
  const z2 = Math.sqrt(3 * a * a + z1 * z1);
  const root = Math.sqrt(Math.max(0, (3 - z1) * (3 + z1 + 2 * z2)));
  return M * (3 + z2 + (prograde ? -root : root));
}

/**
 * Specific energy and angular momentum of an equatorial circular geodesic (Bardeen et al. 1972).
 * Returns NaN when no timelike circular orbit exists at r.
 */
export function circular(r: number, a: number, prograde: boolean): { E: number; L: number } {
  const s = prograde ? 1 : -1;
  const sr = Math.sqrt(r);
  const d = r ** 0.75 * Math.sqrt(r * sr - 3 * M * sr + 2 * s * a * Math.sqrt(M));
  const E = (r * sr - 2 * M * sr + s * a * Math.sqrt(M)) / d;
  const L = (s * Math.sqrt(M) * (r * r - 2 * s * a * Math.sqrt(M) * sr + a * a)) / d;
  return { E, L };
}

/** Energy per unit mass at the ISCO. */
export const eIsco = (a: number, prograde = true) => circular(rIsco(a, prograde), a, prograde).E;

/** Radiative efficiency of a thin disc, 1 − E_ISCO (Novikov–Thorne, prograde). */
export const efficiency = (a: number, prograde = true) => 1 - eIsco(a, prograde);

/** Marginally bound prograde orbit r_mb = 2M − a + 2√(M(M − a)). A particle with E = 1 can turn around only outside it. */
export const rMarginallyBound = (a: number) => 2 * M - a + 2 * Math.sqrt(M * (M - a));

/** Upper bound on Penrose-process efficiency: a split right at r₊ into photons. ½(√(2M/r₊) − 1). */
export const penroseMaxEfficiency = (a: number) => 0.5 * (Math.sqrt((2 * M) / rPlus(a)) - 1);

// ---------------------------------------------------------------------------
// Equatorial timelike geodesics.
// With Σ = r² on the equator and P = E(r² + a²) − aL:
//   r⁴ ṙ² = R(r) = P² − Δ [r² + (L − aE)²]
//   r² φ̇ = −(aE − L) + aP/Δ
//   r² ṫ = −a(aE − L) + (r² + a²)P/Δ
// Dots are d/dτ. The radial equation is stepped in second-order form,
// r̈ = ½ d(R/r⁴)/dr, which passes smoothly through turning points.

/** R(r) for specific energy E and angular momentum L. */
export function radialR(r: number, a: number, E: number, L: number): number {
  const P = E * (r * r + a * a) - a * L;
  const x = L - a * E;
  return P * P - delta(r, a) * (r * r + x * x);
}

/** dR/dr. */
export function radialRprime(r: number, a: number, E: number, L: number): number {
  const P = E * (r * r + a * a) - a * L;
  const x = L - a * E;
  return 4 * E * r * P - (2 * r - 2 * M) * (r * r + x * x) - 2 * r * delta(r, a);
}

/** dφ/dτ on the equator. */
export function phiDot(r: number, a: number, E: number, L: number): number {
  const P = E * (r * r + a * a) - a * L;
  return (-(a * E - L) + (a * P) / delta(r, a)) / (r * r);
}

/** dt/dτ on the equator. */
export function tDot(r: number, a: number, E: number, L: number): number {
  const P = E * (r * r + a * a) - a * L;
  return (-a * (a * E - L) + ((r * r + a * a) * P) / delta(r, a)) / (r * r);
}

/**
 * Energy of a particle momentarily at rest radially at r with angular momentum L:
 * the future-pointing root of R(r) = 0, i.e. A E² − 4arL E + (a²L² − Δ(r² + L²)) = 0.
 */
export function energyAtRest(r: number, a: number, L: number): number {
  const A = bigA(r, a);
  const B = 2 * M * a * r * L;
  const C = a * a * L * L - delta(r, a) * (r * r + L * L);
  return (B + Math.sqrt(Math.max(0, B * B - A * C))) / A;
}

/** Geodesic: specific constants of motion plus state [r, ṙ, φ, t, τ]. */
export interface Geodesic {
  a: number;
  E: number;
  L: number;
  s: Float64Array;
}

export function newGeodesic(): Geodesic {
  return { a: 0, E: 1, L: 0, s: new Float64Array(5) };
}

/** Start at radius r0 with zero radial velocity and angular momentum L. Returns E. */
export function dropFrom(g: Geodesic, a: number, r0: number, L: number): number {
  g.a = a;
  g.L = L;
  g.E = energyAtRest(r0, a, L);
  g.s.fill(0);
  g.s[0] = r0;
  return g.E;
}

/** Start at r0 with given E and L, moving in (sign −1) or out (+1) with ṙ from the radial equation. */
export function launch(g: Geodesic, a: number, r0: number, E: number, L: number, sign: number, phi0 = 0): void {
  g.a = a;
  g.E = E;
  g.L = L;
  g.s.fill(0);
  g.s[0] = r0;
  g.s[1] = (sign * Math.sqrt(Math.max(0, radialR(r0, a, E, L)))) / (r0 * r0);
  g.s[2] = phi0;
}

const k1 = new Float64Array(5);
const k2 = new Float64Array(5);
const k3 = new Float64Array(5);
const k4 = new Float64Array(5);
const tmp = new Float64Array(5);

function deriv(g: Geodesic, s: Float64Array, out: Float64Array): void {
  const r = s[0];
  const { a, E, L } = g;
  const R = radialR(r, a, E, L);
  const Rp = radialRprime(r, a, E, L);
  const r4 = r * r * r * r;
  out[0] = s[1];
  out[1] = 0.5 * (Rp / r4 - (4 * R) / (r4 * r));
  out[2] = phiDot(r, a, E, L);
  out[3] = tDot(r, a, E, L);
  out[4] = 1;
}

/** One RK4 step of proper time h. Mutates g.s, no allocation. */
export function step(g: Geodesic, h: number): void {
  const s = g.s;
  deriv(g, s, k1);
  for (let i = 0; i < 5; i++) tmp[i] = s[i] + 0.5 * h * k1[i];
  deriv(g, tmp, k2);
  for (let i = 0; i < 5; i++) tmp[i] = s[i] + 0.5 * h * k2[i];
  deriv(g, tmp, k3);
  for (let i = 0; i < 5; i++) tmp[i] = s[i] + h * k3[i];
  deriv(g, tmp, k4);
  for (let i = 0; i < 5; i++) s[i] += (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
}

/** Proper-time step that shrinks near the hole: a fixed fraction of the local dynamical time. */
export const stepSize = (r: number, a: number, frac = 0.004) => frac * Math.max(0.05, Math.min(r ** 1.5, 60)) * Math.max(0.15, Math.min(1, (r - rPlus(a)) * 4));

/** Normalised violation of the radial constraint, |r⁴ṙ² − R| / (r⁴(1 + ṙ²)). Stays near zero for an accurate step. */
export function constraint(g: Geodesic): number {
  const r = g.s[0];
  const r4 = r * r * r * r;
  return Math.abs(r4 * g.s[1] * g.s[1] - radialR(r, g.a, g.E, g.L)) / (r4 * (1 + g.s[1] * g.s[1]));
}

// ---------------------------------------------------------------------------
// Penrose process. Local physics uses the ZAMO frame on the equator:
//   lapse α = √(Δ r² / A),  ϖ = √(A) / r,
//   L = ϖ p_φ̂,  E = α ε + ω L,  ṙ = p_r̂ √Δ / (μ r).

export interface Fragment {
  mu: number;
  /** Total energy and angular momentum (not per unit mass). */
  E: number;
  L: number;
  /** dr/dτ of the fragment. */
  rdot: number;
}

export interface PenroseSplit {
  a: number;
  r: number;
  /** Parent: mass 1, from rest at infinity (E0 = 1). */
  L0: number;
  frag1: Fragment;
  frag2: Fragment;
  /** (E2 − E0) / E0. */
  gain: number;
}

/** Prograde L of an E = 1, mass 1 particle whose turning point is r (larger root of R(r) = 0 in L). */
export function lTurning(r: number, a: number, E = 1): number {
  // R(r) = 0 as a quadratic in L:  cL L² + bL L + c0 = 0
  const D = delta(r, a);
  const q = r * r + a * a;
  const cL = a * a - D;
  const bL = -2 * a * E * q + 2 * a * E * D;
  const c0 = E * E * q * q - D * (r * r + a * a * E * E);
  // cL = 2r − r² is positive inside the ergosphere. Check both roots.
  const disc = bL * bL - 4 * cL * c0;
  if (disc < 0) return NaN;
  const s = Math.sqrt(disc);
  const l1 = (-bL + s) / (2 * cL);
  const l2 = (-bL - s) / (2 * cL);
  // Keep the root that is future pointing (E = α ε + ω L with ε > 0) and prograde.
  let best = NaN;
  for (const l of [l1, l2]) {
    if (!(l > 0)) continue;
    const eps = (E - omegaDrag(r, a) * l) / Math.sqrt((D * r * r) / bigA(r, a));
    if (eps > 0 && !(l < best)) best = l;
  }
  return best;
}

/** True when a particle with (E, L) coming in from far away reaches r before turning (R > 0 everywhere outside). */
export function reachable(r: number, a: number, E: number, L: number, rOut = 40): boolean {
  const n = 400;
  for (let i = 1; i <= n; i++) {
    const rr = r + ((rOut - r) * i) / n;
    if (radialR(rr, a, E, L) <= 0) return false;
  }
  return true;
}

/**
 * Split a mass-1 parent (E0 = 1, turning point at r) into two fragments of rest mass mu.
 * In the parent rest frame they fly apart back to back, fragment 2 at angle psi from the
 * prograde direction toward +r, fragment 1 the opposite way.
 */
export function penroseSplit(a: number, r: number, mu = 0.2, psi = 0.35): PenroseSplit {
  const L0 = lTurning(r, a, 1);
  const A = bigA(r, a);
  const D = delta(r, a);
  const alpha = Math.sqrt((D * r * r) / A);
  const w = Math.sqrt(A) / r;
  const om = omegaDrag(r, a);
  // Parent in the ZAMO frame: purely tangential motion.
  const pphi0 = L0 / w;
  const eps0 = (1 - om * L0) / alpha;
  const v = pphi0 / eps0;
  const gam = eps0; // mass 1
  const eStar = 0.5;
  const pStar = Math.sqrt(Math.max(0, 0.25 - mu * mu));
  const mk = (sgn: number): Fragment => {
    const pp = sgn * pStar * Math.cos(psi);
    const pr = sgn * pStar * Math.sin(psi);
    const eps = gam * (eStar + v * pp);
    const pphi = gam * (pp + v * eStar);
    const L = w * pphi;
    const E = alpha * eps + om * L;
    return { mu, E, L, rdot: (pr * Math.sqrt(D)) / (mu * r) };
  };
  const frag1 = mk(-1);
  const frag2 = mk(1);
  return { a, r, L0, frag1, frag2, gain: frag2.E - 1 };
}

/**
 * Pick a split radius for the demo: inside the ergosphere, comfortably outside the
 * marginally bound orbit so an E = 1 parent can reach it. Returns NaN when the spin is too low.
 */
export function penroseRadius(a: number): number {
  const rmb = rMarginallyBound(a);
  if (!(rmb < 1.97)) return NaN;
  for (let f = 0.1; f <= 0.9; f += 0.05) {
    const r = rmb + f * (2 - rmb);
    const L = lTurning(r, a, 1);
    if (Number.isFinite(L) && reachable(r * 1.0005, a, 1, L)) return r;
  }
  return NaN;
}
