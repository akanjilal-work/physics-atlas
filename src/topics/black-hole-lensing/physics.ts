// Null geodesics (light rays) in Schwarzschild spacetime. Geometric units G = c = 1 with M = 1.
// The orbit equation for light, with u = 1/r, is  d²u/dφ² = −u + 3Mu².
// It has a first integral  (du/dφ)² + u² − 2Mu³ = 1/b²,  where b is the impact parameter.
// Pure module: no DOM, no Three.js.

export const M = 1;
export const R_HORIZON = 2 * M;
export const R_PHOTON = 3 * M;
/** Critical impact parameter 3√3 M. Rays with b below it are captured. */
export const B_CRIT = 3 * Math.sqrt(3) * M;
/** Default integration step in φ (radians). RK4 on a smooth ODE, so this is very accurate. */
export const H_PHI = 2e-3;
/** Give up after this much swept angle. Only rays within ~1e-15 of b_c get here. */
export const PHI_CAP = 60;

export type Fate = 'escaped' | 'captured' | 'orbiting';

/** Weak-field (first-order) deflection 4M/b, in radians. */
export const weakDeflection = (b: number, m = M) => (4 * m) / b;

/** Second-order weak-field deflection 4M/b + 15πM²/(4b²). */
export const weakDeflection2 = (b: number) => (4 * M) / b + (15 * Math.PI * M * M) / (4 * b * b);

/** Strong-deflection limit (Bozza 2002): α ≈ −ln(b/b_c − 1) + ln[216(7 − 4√3)] − π for b just above b_c. */
export const strongDeflection = (b: number) => -Math.log(b / B_CRIT - 1) + Math.log(216 * (7 - 4 * Math.sqrt(3))) - Math.PI;

/** The conserved quantity (du/dφ)² + u² − 2Mu³, equal to 1/b² along a light ray. */
export const invariant = (u: number, w: number) => w * w + u * u - 2 * M * u * u * u;

/** Closest approach r0 for impact parameter b > b_c: the largest root of r³ − b²r + 2Mb² = 0. */
export function closestApproach(b: number): number {
  if (b <= B_CRIT) return NaN;
  // Trigonometric form of the cubic's largest root.
  return (2 * b / Math.sqrt(3)) * Math.cos(Math.acos((-3 * Math.sqrt(3) * M) / b) / 3);
}

/** One RK4 step of u'' = −u + 3Mu² for the state (u, w = du/dφ). Writes into out[0], out[1]. */
export function rk4(u: number, w: number, h: number, out: Float64Array): void {
  const a1 = w;
  const b1 = -u + 3 * M * u * u;
  const u2 = u + 0.5 * h * a1;
  const a2 = w + 0.5 * h * b1;
  const b2 = -u2 + 3 * M * u2 * u2;
  const u3 = u + 0.5 * h * a2;
  const a3 = w + 0.5 * h * b2;
  const b3 = -u3 + 3 * M * u3 * u3;
  const u4 = u + h * a3;
  const a4 = w + h * b3;
  const b4 = -u4 + 3 * M * u4 * u4;
  out[0] = u + (h / 6) * (a1 + 2 * a2 + 2 * a3 + a4);
  out[1] = w + (h / 6) * (b1 + 2 * b2 + 2 * b3 + b4);
}

export interface SweepResult {
  fate: Fate;
  /** Total swept polar angle from the start point to infinity (escaped) or to the horizon (captured). */
  phi: number;
  /** Smallest radius reached. */
  rMin: number;
  /** Largest relative drift of the invariant (du/dφ)² + u² − 2Mu³ from 1/b². */
  drift: number;
}

const tmp = new Float64Array(2);

/**
 * Trace a ray inward from radius r0 (use Infinity for a ray from infinity) with impact parameter b.
 * Returns the swept polar angle until it escapes back to infinity or crosses the horizon.
 */
export function sweep(b: number, r0 = Infinity, h = H_PHI): SweepResult {
  let u = Number.isFinite(r0) ? 1 / r0 : 0;
  const inv = 1 / (b * b);
  let w = Math.sqrt(Math.max(0, inv - u * u + 2 * M * u * u * u));
  let phi = 0;
  let uMax = u;
  let drift = 0;
  const uH = 1 / R_HORIZON;
  while (phi < PHI_CAP) {
    rk4(u, w, h, tmp);
    const un = tmp[0];
    const wn = tmp[1];
    if (un <= 0 && wn < 0) {
      // Escaped: interpolate the crossing of u = 0 linearly (u'' ≈ 0 there, so this is very accurate).
      const f = u / (u - un);
      return { fate: 'escaped', phi: phi + f * h, rMin: 1 / uMax, drift };
    }
    if (un >= uH) {
      const f = (uH - u) / (un - u);
      return { fate: 'captured', phi: phi + f * h, rMin: R_HORIZON, drift };
    }
    u = un;
    w = wn;
    phi += h;
    if (u > uMax) uMax = u;
    const d = Math.abs(invariant(u, w) - inv) / inv;
    if (d > drift) drift = d;
  }
  return { fate: 'orbiting', phi, rMin: 1 / uMax, drift };
}

/** Deflection angle α(b) for a ray from infinity, in radians. NaN if the ray is captured or never leaves. */
export function deflection(b: number, h = H_PHI): number {
  const s = sweep(b, Infinity, h);
  return s.fate === 'escaped' ? s.phi - Math.PI : NaN;
}

/**
 * Impact parameter of a ray that reaches a static observer at radius D making angle θ
 * with the inward radial direction:  b = D sin θ / √(1 − 2M/D).
 */
export const impactFromAngle = (D: number, theta: number) => (D * Math.sin(theta)) / Math.sqrt(1 - (2 * M) / D);

/**
 * Lookup table of swept angle Δφ(b) for rays traced backward from a static observer at radius D.
 * Sample i has b = i · bMax / (n − 1). A captured ray stores −1.
 * For flat space Δφ = π − θ, so the deflection is Δφ − (π − θ).
 */
export interface SkyLut {
  D: number;
  bMax: number;
  n: number;
  phi: Float32Array;
}

export function buildSkyLut(D: number, bMax: number, n = 1024, h = 4e-3): SkyLut {
  const phi = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const b = (i * bMax) / (n - 1);
    if (b < 1e-9) {
      phi[i] = -1; // a radial ray falls straight in
      continue;
    }
    const s = sweep(b, D, h);
    phi[i] = s.fate === 'escaped' ? s.phi : -1;
  }
  return { D, bMax, n, phi };
}

/** Linear lookup in the table. Returns −1 for capture. */
export function lookupPhi(lut: SkyLut, b: number): number {
  if (b < B_CRIT) return -1;
  const x = Math.min(lut.n - 1, (b / lut.bMax) * (lut.n - 1));
  const i = Math.floor(x);
  const j = Math.min(lut.n - 1, i + 1);
  const a = lut.phi[i];
  const c = lut.phi[j];
  if (a < 0) return c; // straddles the capture edge: use the escaping neighbour
  return a + (c - a) * (x - i);
}

/**
 * Map a camera ray to the sky direction it came from.
 * Frame: the observer sits on the +z axis at radius lut.D and looks down −z at the hole.
 * dir is the (unit) viewing direction. Returns the unit direction on the celestial sphere,
 * as seen from the hole, or null when the ray ends on the horizon.
 */
export function skyDirection(dir: [number, number, number], lut: SkyLut): [number, number, number] | null {
  const [x, y, z] = dir;
  const len = Math.hypot(x, y, z);
  const cosT = -z / len;
  const sinT = Math.hypot(x, y) / len;
  const theta = Math.atan2(sinT, cosT);
  const b = impactFromAngle(lut.D, theta);
  const dphi = lookupPhi(lut, b);
  if (dphi < 0) return null;
  // In-plane unit vectors: e1 = observer position direction (+z), e2 = sideways part of dir.
  const s = Math.hypot(x, y);
  const e2x = s > 1e-12 ? x / s : 1;
  const e2y = s > 1e-12 ? y / s : 0;
  const c = Math.cos(dphi);
  const sn = Math.sin(dphi);
  return [sn * e2x, sn * e2y, c];
}

/**
 * Path table u(b, φ) for rays traced backward from the observer, used to find where a ray crosses
 * the disk plane. Row j holds b = j · bMax / (nb − 1), column k holds φ = k · phiMax / (np − 1).
 * After the ray escapes the ODE is continued past u = 0 (u goes negative). After capture u is set to 1.
 */
export interface PathLut {
  nb: number;
  np: number;
  bMax: number;
  phiMax: number;
  u: Float32Array;
}

export function buildPathLut(D: number, bMax: number, nb = 192, np = 256, phiMax = 3 * Math.PI, sub = 8): PathLut {
  const out = new Float32Array(nb * np);
  const dphi = phiMax / (np - 1);
  const h = dphi / sub;
  const st = new Float64Array(2);
  for (let j = 0; j < nb; j++) {
    const b = Math.max(1e-6, (j * bMax) / (nb - 1));
    let u = 1 / D;
    let w = Math.sqrt(Math.max(0, 1 / (b * b) - u * u + 2 * M * u * u * u));
    let captured = false;
    out[j * np] = u;
    for (let k = 1; k < np; k++) {
      for (let s = 0; s < sub && !captured; s++) {
        rk4(u, w, h, st);
        u = st[0];
        w = st[1];
        if (u >= 1 / R_HORIZON) captured = true;
        if (u < -1) u = -1;
      }
      out[j * np + k] = captured ? 1 : u;
    }
  }
  return { nb, np, bMax, phiMax, u: out };
}

/**
 * Sample a ray for drawing. The ray starts at x = −x0 with height b, heading in +x.
 * Points are written into out as (x, y) pairs in units of M. Returns the number of points written.
 * The ray stops at the horizon, at radius rOut after passing the hole, or when out is full.
 */
export function tracePath(b: number, x0: number, rOut: number, out: Float32Array, maxPts: number, minStep = 0.1, h = 4e-3): { n: number; fate: Fate } {
  const sgn = b < 0 ? -1 : 1;
  const ab = Math.max(1e-6, Math.abs(b));
  const r0 = Math.hypot(x0, ab);
  const phi0 = Math.atan2(ab, -x0); // polar angle of the start point, measured from +x
  let u = 1 / r0;
  let w = Math.sqrt(Math.max(0, 1 / (ab * ab) - u * u + 2 * M * u * u * u));
  let psi = 0; // swept angle; the polar angle is phi0 − psi
  let n = 0;
  let lx = -x0;
  let ly = ab;
  out[0] = lx;
  out[1] = sgn * ly;
  n = 1;
  const st = new Float64Array(2);
  const uOut = 1 / rOut;
  let fate: Fate = 'orbiting';
  while (n < maxPts && psi < PHI_CAP) {
    rk4(u, w, h, st);
    u = st[0];
    w = st[1];
    psi += h;
    let done = false;
    if (u >= 1 / R_HORIZON) {
      u = 1 / R_HORIZON;
      fate = 'captured';
      done = true;
    } else if (w < 0 && u <= uOut) {
      fate = 'escaped';
      done = true;
    }
    const r = 1 / u;
    const a = phi0 - psi;
    const px = r * Math.cos(a);
    const py = r * Math.sin(a);
    if (done || Math.hypot(px - lx, py - ly) >= minStep) {
      out[2 * n] = px;
      out[2 * n + 1] = sgn * py;
      n++;
      lx = px;
      ly = py;
    }
    if (done) break;
  }
  return { n, fate };
}

/** Sun's light deflection at the solar limb in arcseconds, from the full geodesic equation. */
export function sunLimbDeflectionArcsec(): number {
  const GM = 1.32712440018e20; // m³/s², IAU nominal solar value
  const c = 299792458;
  const R = 6.957e8; // nominal solar radius, m
  const mLen = GM / (c * c); // ≈ 1476.6 m
  const b = R / mLen; // limb impact parameter in units of M
  return (deflection(b, 1e-3) * 180 * 3600) / Math.PI;
}
