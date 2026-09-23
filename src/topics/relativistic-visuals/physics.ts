// Relativistic optics for a moving observer: aberration, Doppler factor, beaming,
// blackbody colours, and the retarded-time (Terrell-Penrose) image of moving objects.
// Pure math, no DOM. Units: c = 1.
//
// Angle convention: θ is measured from the direction of motion to the direction the
// light comes FROM (where the star appears). θ is in the star (rest) frame, θ′ in the
// observer's frame.

export const DEG = Math.PI / 180;

export function gamma(beta: number): number {
  return 1 / Math.sqrt(1 - beta * beta);
}

/** Relativistic aberration: rest-frame cos θ to observer-frame cos θ′. */
export function aberrateCos(cosT: number, beta: number): number {
  return (cosT + beta) / (1 + beta * cosT);
}

/** Inverse aberration: observer-frame cos θ′ back to rest-frame cos θ. */
export function deaberrateCos(cosTp: number, beta: number): number {
  return (cosTp - beta) / (1 - beta * cosTp);
}

/** Doppler factor D = ν_obs/ν_emit written with the observer-frame angle θ′. */
export function dopplerObs(cosTp: number, beta: number): number {
  return 1 / (gamma(beta) * (1 - beta * cosTp));
}

/** The same Doppler factor written with the rest-frame angle θ: D = γ(1 + β cos θ). */
export function dopplerSrc(cosT: number, beta: number): number {
  return gamma(beta) * (1 + beta * cosT);
}

/** Observer-frame cos θ′ where D = 1 (no colour shift). */
export function noShiftCos(beta: number): number {
  if (beta === 0) return 0;
  return (1 - Math.sqrt(1 - beta * beta)) / beta;
}

/** Fraction of an isotropic star field that appears inside the forward cone of half-angle α′. */
export function fractionInCone(alphaObs: number, beta: number): number {
  const c = deaberrateCos(Math.cos(alphaObs), beta);
  return (1 - c) / 2;
}

/** Half of all stars appear within this observer angle: the image of the rest-frame 90° circle. */
export function halfSkyAngle(beta: number): number {
  return Math.acos(beta);
}

/** Solid-angle ratio dΩ′/dΩ = d cos θ′ / d cos θ. Equals 1/D². */
export function solidAngleRatio(cosT: number, beta: number): number {
  const b = 1 + beta * cosT;
  return (1 - beta * beta) / (b * b);
}

/**
 * Beaming. Specific intensity obeys I_ν/ν³ = invariant, so I′_ν(ν′) = D³ I_ν(ν).
 * Integrated over frequency the surface brightness goes as D⁴.
 * A point-like star shrinks in solid angle by 1/D², so its flux goes as D².
 */
export const SURFACE_POWER = 4;
export const STAR_FLUX_POWER = 2;

/** Mean of D² over an isotropic sky: energy density boost of isotropic light, γ²(1 + β²/3). */
export function isotropicBoost(beta: number): number {
  const g = gamma(beta);
  return g * g * (1 + (beta * beta) / 3);
}

// --- Galilean comparison: light as particles moving at c through the stars' frame.

/** Classical aberration: apparent direction ∝ n + β f. */
export function classicalAberrateCos(cosT: number, beta: number): number {
  return (cosT + beta) / Math.sqrt(1 + 2 * beta * cosT + beta * beta);
}

/** Inverse classical aberration. */
export function classicalDeaberrateCos(cosTp: number, beta: number): number {
  const lam = beta * cosTp + Math.sqrt(beta * beta * cosTp * cosTp - beta * beta + 1);
  return lam * cosTp - beta;
}

/** Classical Doppler factor for an observer moving through the source frame. */
export function classicalDoppler(cosT: number, beta: number): number {
  return 1 + beta * cosT;
}

/** Observer-frame cos θ′ of zero shift in the Galilean picture (rest-frame θ = 90°). */
export function classicalNoShiftCos(beta: number): number {
  return beta / Math.sqrt(1 + beta * beta);
}

// --- Blackbody colour

/** CIE 1931 2° colour matching functions, multi-lobe Gaussian fit of Wyman, Sloan & Shirley (2013). */
export function cie(lambdaNm: number): [number, number, number] {
  const g = (x: number, mu: number, s1: number, s2: number) => {
    const t = (x - mu) / (x < mu ? s1 : s2);
    return Math.exp(-0.5 * t * t);
  };
  const L = lambdaNm;
  const x = 1.056 * g(L, 599.8, 37.9, 31.0) + 0.362 * g(L, 442.0, 16.0, 26.7) - 0.065 * g(L, 501.1, 20.4, 26.2);
  const y = 0.821 * g(L, 568.8, 46.9, 40.5) + 0.286 * g(L, 530.9, 16.3, 31.1);
  const z = 1.217 * g(L, 437.0, 11.8, 36.0) + 0.681 * g(L, 459.0, 26.0, 13.8);
  return [x, y, z];
}

const C2_NM_K = 1.438777e7; // second radiation constant hc/k in nm·K

/** Planck spectral radiance B_λ up to a constant factor. */
export function planck(lambdaNm: number, T: number): number {
  const l5 = Math.pow(lambdaNm / 1000, 5);
  return 1 / (l5 * Math.expm1(C2_NM_K / (lambdaNm * T)));
}

/** CIE XYZ of a blackbody at temperature T (arbitrary overall scale). */
export function blackbodyXYZ(T: number): [number, number, number] {
  let X = 0;
  let Y = 0;
  let Z = 0;
  for (let l = 380; l <= 780; l += 2) {
    const p = planck(l, T);
    const [x, y, z] = cie(l);
    X += p * x;
    Y += p * y;
    Z += p * z;
  }
  return [X, Y, Z];
}

/** Chromaticity (x, y) of a blackbody. */
export function blackbodyXY(T: number): [number, number] {
  const [X, Y, Z] = blackbodyXYZ(T);
  const s = X + Y + Z;
  return [X / s, Y / s];
}

/** Linear sRGB colour of a blackbody, scaled so the largest channel is 1. */
export function blackbodyRGB(T: number): [number, number, number] {
  const [X, Y, Z] = blackbodyXYZ(T);
  let r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
  let g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
  let b = 0.0557 * X - 0.204 * Y + 1.057 * Z;
  r = Math.max(0, r);
  g = Math.max(0, g);
  b = Math.max(0, b);
  const m = Math.max(r, g, b) || 1;
  return [r / m, g / m, b / m];
}

export const LUT_TMIN = 600;
export const LUT_TMAX = 600000;

/** RGBA float table of blackbody colours on a log-temperature axis from LUT_TMIN to LUT_TMAX. */
export function buildBlackbodyLut(n: number): Float32Array {
  const out = new Float32Array(n * 4);
  const a = Math.log(LUT_TMIN);
  const b = Math.log(LUT_TMAX);
  for (let i = 0; i < n; i++) {
    const T = Math.exp(a + ((b - a) * i) / (n - 1));
    const [r, g, bl] = blackbodyRGB(T);
    out[4 * i] = r;
    out[4 * i + 1] = g;
    out[4 * i + 2] = bl;
    out[4 * i + 3] = 1;
  }
  return out;
}

// --- Star field

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface StarField {
  n: number;
  /** Unit directions in the rest frame, xyz interleaved. */
  dir: Float32Array;
  /** Surface temperatures in kelvin. */
  temp: Float32Array;
  /** Relative flux at rest. */
  lum: Float32Array;
}

/** Isotropic star field with a spread of temperatures and a steep bright-star tail. */
export function makeStars(n: number, seed = 7): StarField {
  const r = rng(seed);
  const dir = new Float32Array(n * 3);
  const temp = new Float32Array(n);
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const z = 2 * r() - 1;
    const ph = 2 * Math.PI * r();
    const s = Math.sqrt(1 - z * z);
    dir[3 * i] = s * Math.cos(ph);
    dir[3 * i + 1] = s * Math.sin(ph);
    dir[3 * i + 2] = z;
    const u = r();
    temp[i] = u < 0.12 ? 12000 + 18000 * r() : 3200 + 6500 * Math.pow(r(), 1.5);
    lum[i] = 0.05 + 0.9 * Math.pow(r(), 10);
  }
  return { n, dir, temp, lum };
}

// --- Terrell-Penrose: what a stationary camera sees of a moving object

/**
 * A point moves as A + β t x̂ (lab frame). The camera sits at C and records light at time tObs.
 * Returns the emission time t_e < tObs with |A + β t_e x̂ − C| = tObs − t_e.
 */
export function emissionTime(ax: number, ay: number, az: number, cx: number, cy: number, cz: number, beta: number, tObs: number): number {
  const rx = ax - cx;
  const ry = ay - cy;
  const rz = az - cz;
  const R2 = rx * rx + ry * ry + rz * rz;
  const k = 1 - beta * beta;
  const h = tObs + beta * rx;
  const disc = h * h - k * (tObs * tObs - R2);
  return (h - Math.sqrt(Math.max(0, disc))) / k;
}

/** Where the camera sees the point: its lab position at the emission time. */
export function apparentPoint(ax: number, ay: number, az: number, cx: number, cy: number, cz: number, beta: number, tObs: number): [number, number, number] {
  const te = emissionTime(ax, ay, az, cx, cy, cz, beta, tObs);
  return [ax + beta * te, ay, az];
}

/**
 * Apparent (Terrell) rotation of a small object moving along +x, seen at lab angle θ from
 * the motion direction. In the object's own frame the light left at θ_obj with
 * cos θ_obj = (cos θ + β)/(1 + β cos θ), so the image is the object turned by θ − θ_obj.
 */
export function terrellRotation(cosLab: number, beta: number): number {
  const c = Math.max(-1, Math.min(1, cosLab));
  return Math.acos(c) - Math.acos(Math.max(-1, Math.min(1, aberrateCos(c, beta))));
}
