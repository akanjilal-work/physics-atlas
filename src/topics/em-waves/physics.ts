// Electromagnetic waves: plane waves and polarization, Malus's law, the
// oscillating (Hertzian) dipole, and the kinked field lines of a charge that
// suddenly stops. Pure math, no DOM. SI units unless a comment says otherwise.

/** CODATA 2022 vacuum permittivity (F/m). */
export const EPS0 = 8.8541878188e-12;
/** CODATA 2022 vacuum permeability (N/A²). */
export const MU0 = 1.25663706127e-6;
/** Exact speed of light (m/s), fixed by the SI definition of the metre. */
export const C = 299792458;

/** Maxwell's prediction: the wave speed that follows from ε0 and μ0. */
export function cFromConstants(eps0 = EPS0, mu0 = MU0): number {
  return 1 / Math.sqrt(mu0 * eps0);
}

// ---------------------------------------------------------------------------
// Plane waves and polarization
// Coordinates: the wave travels along +z. E lies in the x–y plane.
//   Ex = ax cos(kz − ωt)
//   Ey = ay cos(kz − ωt + δ)
//   B  = (1/c) ẑ × E
// ---------------------------------------------------------------------------

export interface Pol {
  /** Amplitude of Ex (V/m). */
  ax: number;
  /** Amplitude of Ey (V/m). */
  ay: number;
  /** Phase of Ey relative to Ex (rad). */
  delta: number;
}

/** Split a total amplitude E0 into (ax, ay) with ay/ax = ratio, keeping ax² + ay² = E0². */
export function polFromRatio(E0: number, ratio: number, delta: number): Pol {
  const n = Math.sqrt(1 + ratio * ratio);
  return { ax: E0 / n, ay: (E0 * ratio) / n, delta };
}

/** Electric field of the plane wave at (z, t). Writes [Ex, Ey, Ez] into out. */
export function planeE(p: Pol, k: number, omega: number, z: number, t: number, out: Float64Array | number[]): void {
  const ph = k * z - omega * t;
  out[0] = p.ax * Math.cos(ph);
  out[1] = p.ay * Math.cos(ph + p.delta);
  out[2] = 0;
}

/** Magnetic field of a plane wave travelling along +z, from its E field: B = ẑ × E / c. */
export function planeBFromE(E: ArrayLike<number>, out: Float64Array | number[], c = C): void {
  out[0] = -E[1] / c;
  out[1] = E[0] / c;
  out[2] = 0;
}

export function cross(a: ArrayLike<number>, b: ArrayLike<number>, out: Float64Array | number[]): void {
  const x = a[1] * b[2] - a[2] * b[1];
  const y = a[2] * b[0] - a[0] * b[2];
  const z = a[0] * b[1] - a[1] * b[0];
  out[0] = x;
  out[1] = y;
  out[2] = z;
}

export const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Poynting vector S = E × B / μ0 (W/m²). */
export function poynting(E: ArrayLike<number>, B: ArrayLike<number>, out: Float64Array | number[]): void {
  cross(E, B, out);
  out[0] /= MU0;
  out[1] /= MU0;
  out[2] /= MU0;
}

/** Time-averaged intensity of the plane wave, ⟨S⟩ = (ax² + ay²) / (2 μ0 c). */
export function meanIntensity(p: Pol): number {
  return (p.ax * p.ax + p.ay * p.ay) / (2 * MU0 * C);
}

/** Stokes parameters [S0, S1, S2, S3] in units of (V/m)². */
export function stokes(p: Pol): [number, number, number, number] {
  const { ax, ay, delta } = p;
  return [ax * ax + ay * ay, ax * ax - ay * ay, 2 * ax * ay * Math.cos(delta), 2 * ax * ay * Math.sin(delta)];
}

/** S3/S0: +1 or −1 for circular, 0 for linear. */
export function circularity(p: Pol): number {
  const s = stokes(p);
  return s[0] > 0 ? s[3] / s[0] : 0;
}

export type PolKind = 'linear' | 'circular' | 'elliptical';

export function polKind(p: Pol, tol = 0.02): PolKind {
  const v = Math.abs(circularity(p));
  if (v < tol) return 'linear';
  if (v > 1 - tol) return 'circular';
  return 'elliptical';
}

/** Tilt of the polarization ellipse's major axis from the x axis (rad), ½ atan2(S2, S1). */
export function ellipseTilt(p: Pol): number {
  const s = stokes(p);
  return 0.5 * Math.atan2(s[2], s[1]);
}

/**
 * Fraction of the intensity an ideal linear polarizer passes when its transmission
 * axis sits at angle theta from x. It is the time average of (E·p̂)² over ⟨|E|²⟩.
 * For linear light at angle ψ this reduces to Malus's law cos²(θ − ψ).
 */
export function polarizerTransmission(p: Pol, theta: number): number {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const num = p.ax * p.ax * c * c + p.ay * p.ay * s * s + 2 * p.ax * p.ay * c * s * Math.cos(p.delta);
  const den = p.ax * p.ax + p.ay * p.ay;
  return den > 0 ? num / den : 0;
}

/** Malus's law for linearly polarized light: I/I0 = cos²θ. */
export const malus = (theta: number) => Math.cos(theta) ** 2;

// ---------------------------------------------------------------------------
// Oscillating dipole p(t) = p0 cos(ωt) ẑ
// Field components are in units of p0 k³ / (4π ε0), with x = k r and φ = x − ωt.
// ---------------------------------------------------------------------------

/** Exact E field of the oscillating dipole. Writes [E_r, E_θ]. */
export function dipoleE(x: number, cosT: number, sinT: number, wt: number, out: Float64Array | number[]): void {
  const ph = x - wt;
  const c = Math.cos(ph);
  const s = Math.sin(ph);
  const near = c / (x * x * x) + s / (x * x);
  out[0] = 2 * cosT * near;
  out[1] = sinT * (near - c / x);
}

/**
 * Flux function of the dipole's E field. Field lines in any plane through the
 * dipole axis are its contours:
 *   E_r = ∂Q/∂θ / (r² sinθ),  E_θ = −∂Q/∂r / (r sinθ)  (with k = 1).
 * Q = sin²θ [ sin(kr − ωt) + cos(kr − ωt)/(kr) ].
 */
export function dipoleQ(x: number, sin2T: number, wt: number): number {
  const ph = x - wt;
  return sin2T * (Math.sin(ph) + Math.cos(ph) / x);
}

/** Time-averaged power per solid angle (W/sr): μ0 p0² ω⁴ sin²θ / (32 π² c). */
export function dipoleDPdOmega(p0: number, omega: number, theta: number): number {
  const s = Math.sin(theta);
  return (MU0 * p0 * p0 * omega ** 4 * s * s) / (32 * Math.PI * Math.PI * C);
}

/** Larmor formula, instantaneous power of a charge q with acceleration a (W). */
export function larmor(q: number, a: number): number {
  return (q * q * a * a) / (6 * Math.PI * EPS0 * C ** 3);
}

/** Time average of Larmor for p = q d0 cos ωt, where ⟨a²⟩ = ω⁴ d0² / 2. */
export function larmorDipoleMean(q: number, d0: number, omega: number): number {
  return (q * q * omega ** 4 * d0 * d0) / (12 * Math.PI * EPS0 * C ** 3);
}

/** Integrate a θ-only pattern over the whole sphere with Simpson's rule (n even). */
export function integrateSphere(f: (theta: number) => number, n = 200): number {
  const h = Math.PI / n;
  let s = 0;
  for (let i = 0; i <= n; i++) {
    const th = i * h;
    const w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2;
    s += w * f(th) * Math.sin(th);
  }
  return 2 * Math.PI * (h / 3) * s;
}

/** Radiation field of an accelerated charge far away: E = q a sinθ / (4π ε0 c² r). */
export function radiationE(q: number, a: number, r: number, theta: number): number {
  return (q * a * Math.sin(theta)) / (4 * Math.PI * EPS0 * C * C * r);
}

// ---------------------------------------------------------------------------
// Kinked field lines (J. J. Thomson, Purcell). Natural units: c = 1 by default.
// The charge moves along +x at speed v, starts braking at time tStop at x = 0,
// brakes uniformly for a time tau, and then sits at x = v·tau/2 for good.
// ---------------------------------------------------------------------------

export interface KinkParams {
  /** v / c */
  beta: number;
  /** Time at which braking starts. */
  tStop: number;
  /** Duration of the braking. */
  tau: number;
  /** Speed of light in scene units per unit time. */
  c: number;
}

export const gamma = (beta: number) => 1 / Math.sqrt(1 - beta * beta);

/** Position of the charge along x at time t. */
export function chargeX(k: KinkParams, t: number): number {
  const v = k.beta * k.c;
  const s = t - k.tStop;
  if (s <= 0) return v * s;
  if (s < k.tau) return v * s - (v * s * s) / (2 * k.tau);
  return (v * k.tau) / 2;
}

/**
 * Direction of a field line of a uniformly moving charge. A line that leaves the
 * charge at angle psi0 in its rest frame sits at psi in the lab, with
 * tan psi = γ tan psi0 (the pattern is squashed along the motion).
 */
export function movingLineAngle(psi0: number, beta: number): number {
  return Math.atan2(gamma(beta) * Math.sin(psi0), Math.cos(psi0));
}

/** Distance s > 0 along unit ray (ux, uy) from (px, py) to the circle of radius R about the origin. */
function rayCircle(px: number, py: number, ux: number, uy: number, R: number): number {
  const b = px * ux + py * uy;
  const cc = px * px + py * py - R * R;
  return -b + Math.sqrt(Math.max(0, b * b - cc));
}

/**
 * One field line of the kink construction in the x–y plane. Writes up to 4 points
 * (x, y pairs) into out and returns the number of points.
 *  - Before braking: a straight line from the present position.
 *  - After braking: a radial line from the rest position inside the inner sphere,
 *    a straight "kink" across the shell, and outside the outer sphere a line that
 *    points back to where the charge would be had it kept going.
 * Flux matching (Gauss's law) pairs inner and outer segments with the same psi0.
 * The shape inside the shell is drawn straight, which is exact only as tau → 0.
 */
export function kinkLine(k: KinkParams, t: number, psi0: number, rMax: number, out: Float64Array | number[]): number {
  const psi = movingLineAngle(psi0, k.beta);
  const ux = Math.cos(psi);
  const uy = Math.sin(psi);
  const s = t - k.tStop;
  if (s <= 0) {
    const x = chargeX(k, t);
    out[0] = x;
    out[1] = 0;
    const L = rayCircle(x, 0, ux, uy, rMax);
    out[2] = x + L * ux;
    out[3] = L * uy;
    return 2;
  }
  const v = k.beta * k.c;
  const xExt = v * s;
  const R2 = k.c * s;
  const sOut = rayCircle(xExt, 0, ux, uy, R2);
  const ox = xExt + sOut * ux;
  const oy = sOut * uy;
  let n = 0;
  const xq = chargeX(k, t);
  out[n++] = xq;
  out[n++] = 0;
  const R1 = k.c * (s - k.tau);
  if (R1 > 0) {
    out[n++] = xq + R1 * Math.cos(psi0);
    out[n++] = R1 * Math.sin(psi0);
  }
  out[n++] = ox;
  out[n++] = oy;
  if (R2 < rMax) {
    const L = rayCircle(ox, oy, ux, uy, rMax);
    out[n++] = ox + L * ux;
    out[n++] = oy + L * uy;
  }
  return n / 2;
}

/** Purcell's result for the kink: E_⊥ / E_r = a r sinθ / c² with a = v / tau. */
export function kinkFieldRatio(k: KinkParams, r: number, theta: number): number {
  const a = (k.beta * k.c) / k.tau;
  return (a * r * Math.sin(theta)) / (k.c * k.c);
}

/** Which region a point at distance r from the stop point is in, at time t. */
export function kinkRegion(k: KinkParams, t: number, r: number): 'moving' | 'static' | 'kink' | 'old' {
  const s = t - k.tStop;
  if (s <= 0) return 'moving';
  if (r < k.c * (s - k.tau)) return 'static';
  if (r <= k.c * s) return 'kink';
  return 'old';
}
