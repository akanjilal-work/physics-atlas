// Transit and radial-velocity physics for a planet on a circular orbit.
// Pure functions, SI units unless noted. No DOM, no Three.js.

export const G = 6.6743e-11;
export const AU = 1.495978707e11;
/** IAU nominal solar radius and GM values. */
export const R_SUN = 6.957e8;
export const M_SUN = 1.3271244e20 / G;
export const R_EARTH = 6.3781e6;
export const M_EARTH = 3.986004e14 / G;
export const R_JUP = 7.1492e7;
export const M_JUP = 1.2668653e17 / G;
export const DAY = 86400;
export const TAU = 2 * Math.PI;

export interface Star {
  name: string;
  /** Solar masses. */
  mass: number;
  /** Solar radii. */
  radius: number;
  /** Effective temperature, K. */
  teff: number;
  /** Quadratic limb-darkening coefficients (illustrative, optical band). */
  u1: number;
  u2: number;
  color: number;
}

/** Luminosity in solar units from R and Teff (Stefan–Boltzmann, Sun Teff 5772 K). */
export function luminosity(s: Star): number {
  return s.radius * s.radius * Math.pow(s.teff / 5772, 4);
}

/** Transit depth for a uniform disk: δ = (Rp/R★)². */
export function transitDepth(rp: number, rs: number): number {
  const k = rp / rs;
  return k * k;
}

/** Orbital period (s) from Kepler's third law. */
export function period(aM: number, mStarKg: number, mPlanetKg = 0): number {
  return TAU * Math.sqrt((aM * aM * aM) / (G * (mStarKg + mPlanetKg)));
}

/** Impact parameter b = a cos i / R★ for a circular orbit. */
export function impactParameter(aOverRs: number, incRad: number): number {
  return aOverRs * Math.cos(incRad);
}

/**
 * Total transit duration T14 (first to fourth contact), circular orbit
 * (Seager & Mallén-Ornelas 2003, Winn 2010). Returns 0 if no transit.
 * Pass inner = true for T23 (second to third contact), 0 for a grazing transit.
 */
export function transitDuration(P: number, aOverRs: number, k: number, incRad: number, inner = false): number {
  const b = impactParameter(aOverRs, incRad);
  const edge = inner ? 1 - k : 1 + k;
  const q = edge * edge - b * b;
  if (q <= 0 || edge <= 0) return 0;
  const arg = Math.sqrt(q) / (aOverRs * Math.sin(incRad));
  return (P / Math.PI) * Math.asin(Math.min(1, arg));
}

/**
 * Sky-projected centre separation z (in stellar radii) at orbital phase
 * angle θ (0 = mid-transit). Also returns whether the planet is in front.
 */
export function skySeparation(aOverRs: number, incRad: number, theta: number): number {
  const s = Math.sin(theta);
  const c = Math.cos(theta) * Math.cos(incRad);
  return aOverRs * Math.sqrt(s * s + c * c);
}

/** Quadratic limb-darkening law I(μ)/I(1). */
export function intensity(r: number, u1: number, u2: number): number {
  const mu = Math.sqrt(Math.max(0, 1 - r * r));
  const m = 1 - mu;
  return 1 - u1 * m - u2 * m * m;
}

/** Disk-integrated flux of the quadratic law divided by π I(1). */
export function diskFlux(u1: number, u2: number): number {
  return 1 - u1 / 3 - u2 / 6;
}

/**
 * Relative flux while a planet of radius p (stellar radii) sits at projected
 * distance z from the star's centre. Integrates the occulted intensity over
 * annuli of the stellar disk. Each annulus contributes I(r) times the arc of it
 * covered by the planet. Nodes cluster at the ends (cosine map), which tames the
 * square-root edges of the arc length.
 */
export function occultedFlux(z: number, p: number, u1: number, u2: number, n = 256): number {
  if (p <= 0 || z >= 1 + p) return 1;
  const lo = Math.max(0, z - p);
  const hi = Math.min(1, z + p);
  if (hi <= lo) return 1;
  const half = (hi - lo) / 2;
  let sum = 0;
  for (let j = 0; j < n; j++) {
    const t = ((j + 0.5) / n) * Math.PI;
    const r = lo + half * (1 - Math.cos(t));
    const drdt = half * Math.sin(t);
    let arc: number;
    if (p >= r + z) arc = TAU;
    else if (z >= r + p || r >= z + p || r <= 0) arc = 0;
    else {
      const c = (r * r + z * z - p * p) / (2 * r * z);
      arc = 2 * Math.acos(Math.max(-1, Math.min(1, c)));
    }
    sum += intensity(r, u1, u2) * arc * r * drdt;
  }
  sum *= Math.PI / n;
  return 1 - sum / (Math.PI * diskFlux(u1, u2));
}

/** Exact area of overlap between the unit disk and a disk of radius p at distance z, over π (uniform-disk depth). */
export function uniformOverlap(z: number, p: number): number {
  if (z >= 1 + p) return 0;
  if (z <= Math.abs(1 - p)) return p <= 1 ? p * p : 1;
  const k0 = Math.acos((p * p + z * z - 1) / (2 * p * z));
  const k1 = Math.acos((1 - p * p + z * z) / (2 * z));
  const tri = Math.sqrt(Math.max(0, (4 * z * z - (1 + z * z - p * p) ** 2) / 4));
  return (p * p * k0 + k1 - tri) / Math.PI;
}

/**
 * Radial-velocity semi-amplitude of the star (m/s), exact two-body form:
 * K = (2πG/P)^{1/3} Mp sin i / ((M★ + Mp)^{2/3} √(1 − e²)).
 * With Mp ≪ M★ this is the usual (2πG/P)^{1/3} Mp sin i / (M★^{2/3} √(1 − e²)).
 */
export function rvSemiAmplitude(P: number, mPlanet: number, mStar: number, incRad = Math.PI / 2, e = 0, exact = true): number {
  const mTot = exact ? mStar + mPlanet : mStar;
  return (Math.cbrt((TAU * G) / P) * mPlanet * Math.sin(incRad)) / (Math.pow(mTot, 2 / 3) * Math.sqrt(1 - e * e));
}

/**
 * Approximate habitable-zone edges (AU): runaway greenhouse (inner) and
 * maximum greenhouse (outer), from the fits of Kopparapu et al. (2013, 2014).
 * Teff is clamped to the 2600 to 7200 K range of the fit.
 */
export function habitableZone(lum: number, teff: number): [number, number] {
  const T = Math.max(2600, Math.min(7200, teff)) - 5780;
  const seff = (s0: number, a: number, b: number, c: number, d: number) => s0 + a * T + b * T * T + c * T ** 3 + d * T ** 4;
  const sIn = seff(1.0385, 1.2456e-4, 1.4612e-8, -7.6345e-12, -1.7511e-15);
  const sOut = seff(0.3507, 5.9578e-5, 1.6707e-9, -3.0058e-12, -5.1925e-16);
  return [Math.sqrt(lum / sIn), Math.sqrt(lum / sOut)];
}

/**
 * Rough planet mass (Earth masses) from radius (Earth radii), after the
 * broken power law of Chen & Kipping (2017). Giant-planet masses are not set
 * by radius, so above ~11 R⊕ this simply returns about one Jupiter mass.
 */
export function massFromRadius(r: number): number {
  if (r < 1.23) return Math.pow(r, 3.58);
  const mNep = (x: number) => 2 * Math.pow(x / 1.213, 1.698);
  if (r < 10) return mNep(r);
  const u = Math.min(1, (r - 10) / 1.2);
  return Math.exp(Math.log(mNep(10)) * (1 - u) + Math.log(317.8) * u);
}

/** Standard normal deviate (Box–Muller) from a uniform generator. */
export function gauss(rand: () => number): number {
  const u = Math.max(1e-12, rand());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rand());
}

/**
 * Matched-filter signal-to-noise of one transit: √(Σ (1 − F)² Δt / (σ₃₀² · 30 min)),
 * where σ₃₀ is the photometric noise per 30-minute sample.
 * `deficit` holds 1 − F sampled every `dt` seconds.
 */
export function transitSNR(deficit: ArrayLike<number>, n: number, dt: number, sigma30: number): number {
  let s = 0;
  for (let i = 0; i < n; i++) s += deficit[i] * deficit[i];
  return Math.sqrt((s * dt) / (1800 * sigma30 * sigma30));
}
