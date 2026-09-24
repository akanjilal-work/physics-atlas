// Casimir forces between ideal conductors, plus the regularised mode sums
// that produce them. Pure functions, no DOM.
//
// SI units unless stated. The mode-sum helpers use hbar = c = 1.

export const HBAR = 1.054571817e-34; // J s (CODATA 2018)
export const C = 299792458; // m/s (exact)
export const HBARC = HBAR * C; // J m, about 3.1615e-26
export const ATM = 101325; // Pa

/** Ideal parallel plates: energy per area E/A = -pi^2 hbar c / (720 d^3), in J/m^2. */
export function plateEnergyPerArea(d: number): number {
  return (-(Math.PI ** 2) * HBARC) / (720 * d ** 3);
}

/** Ideal parallel plates: pressure P = -pi^2 hbar c / (240 d^4), in Pa. Negative = attractive. */
export function platePressure(d: number): number {
  return (-(Math.PI ** 2) * HBARC) / (240 * d ** 4);
}

/** Gap at which the ideal-plate pressure has magnitude p (Pa). */
export function gapForPressure(p: number): number {
  return ((Math.PI ** 2 * HBARC) / (240 * p)) ** 0.25;
}

/**
 * Sphere of radius R at closest distance d from a plate, in the proximity
 * force approximation: F = 2 pi R (E/A)(d) = -pi^3 hbar c R / (360 d^3), in N.
 * Valid for d << R.
 */
export function sphereForcePFA(R: number, d: number): number {
  return (-(Math.PI ** 3) * HBARC * R) / (360 * d ** 3);
}

/**
 * The same sphere force done the long way: slice the sphere into rings of
 * radius rho, treat each ring as a patch of plate at local gap
 * h(rho) = d + R - sqrt(R^2 - rho^2), and add up P(h) * 2 pi rho d rho over
 * the lower hemisphere. Uses the substitution rho = R sin(theta) and
 * Simpson's rule. Returns N.
 */
export function sphereForceByRings(R: number, d: number, n = 20000): number {
  // Integrate in u = h - d on the lower hemisphere: u in [0, R].
  // rho d rho = (R - u) du, since rho^2 = R^2 - (R - u)^2.
  // The integrand falls like 1/(d+u)^4, so use a log grid in (d + u).
  const a = Math.log(d);
  const b = Math.log(d + R);
  const N = n % 2 === 0 ? n : n + 1;
  const hstep = (b - a) / N;
  let s = 0;
  for (let i = 0; i <= N; i++) {
    const h = Math.exp(a + i * hstep); // local gap
    const u = h - d;
    const f = platePressure(h) * 2 * Math.PI * (R - u) * h; // dh = h d(ln h)
    const w = i === 0 || i === N ? 1 : i % 2 === 1 ? 4 : 2;
    s += w * f;
  }
  return (s * hstep) / 3;
}

/** Local log-log slope d ln|y| / d ln d of a function, by central difference. */
export function logSlope(f: (d: number) => number, d: number, eps = 1e-4): number {
  const up = Math.abs(f(d * Math.exp(eps)));
  const dn = Math.abs(f(d * Math.exp(-eps)));
  return (Math.log(up) - Math.log(dn)) / (2 * eps);
}

// ------------------------------------------------------------------ 1D toy model
// A massless scalar on a line, between two points a distance d apart, with
// Dirichlet conditions. Modes k_n = n pi / d, zero-point energy k_n / 2 each
// (hbar = c = 1). The raw sum diverges. Damp mode n by exp(-eps k_n).

/** Exponentially regularised 1D sum E(d, eps) = sum_n (k_n/2) exp(-eps k_n), closed form. */
export function modeSum1DExp(d: number, eps: number): number {
  const a = (eps * Math.PI) / d;
  // sum n x^n = x / (1 - x)^2 with x = e^-a. Use expm1 to keep precision.
  const x = Math.exp(-a);
  const om = -Math.expm1(-a);
  return (Math.PI / (2 * d)) * (x / (om * om));
}

/** The divergent bulk piece d / (2 pi eps^2). It is proportional to d, so it is the same energy per length inside and outside. */
export function bulk1D(d: number, eps: number): number {
  return d / (2 * Math.PI * eps * eps);
}

/** Finite, d-dependent part of the 1D sum with an exponential cutoff. Tends to -pi/(24 d). */
export function casimir1DExp(d: number, eps: number): number {
  return modeSum1DExp(d, eps) - bulk1D(d, eps);
}

/**
 * Same finite part with a Gaussian cutoff exp(-(eps k_n)^2), summed term by term.
 * The bulk piece is now int_0^inf (k/2) e^{-(eps k)^2} dn = d / (4 pi eps^2).
 */
export function casimir1DGauss(d: number, eps: number): number {
  const kstep = Math.PI / d;
  const nmax = Math.ceil(12 / (eps * kstep));
  let s = 0;
  for (let n = 1; n <= nmax; n++) {
    const k = n * kstep;
    s += 0.5 * k * Math.exp(-((eps * k) ** 2));
  }
  return s - d / (4 * Math.PI * eps * eps);
}

/** Exact 1D Casimir energy -pi/(24 d), from zeta(-1) = -1/12, in hbar = c = 1 units. */
export const casimir1DExact = (d: number) => -Math.PI / (24 * d);

// ------------------------------------------------------------------ 3D plates, cutoff version
// Electromagnetic field between ideal plates (hbar = c = 1). Modes have
// transverse wavevector q and k_z = n pi / d. Two polarisations for n >= 1,
// one for n = 0. With an exp(-eps w) cutoff, the energy per area in mode
// family n is  f(n) = (1/2pi) int_{kappa n}^inf w^2 e^{-eps w} dw.

function fFamily(kn: number, eps: number): number {
  // int_a^inf w^2 e^{-eps w} dw = e^{-eps a} (a^2/eps + 2a/eps^2 + 2/eps^3)
  return (Math.exp(-eps * kn) * (kn * kn / eps + (2 * kn) / (eps * eps) + 2 / eps ** 3)) / (2 * Math.PI);
}

/**
 * Cutoff-regularised EM energy per area between plates, minus the same
 * volume of free space: [f(0)/2 + sum_{n>=1} f(n)] - int_0^inf f(n) dn.
 * Tends to -pi^2/(720 d^3) as eps -> 0.
 */
export function casimir3DExp(d: number, eps: number): number {
  const kap = Math.PI / d;
  const a = eps * kap;
  const x = Math.exp(-a);
  const om = -Math.expm1(-a);
  // closed-form sums over n >= 0 of x^n, n x^n, n^2 x^n
  const s0 = 1 / om;
  const s1 = x / (om * om);
  const s2 = (x * (1 + x)) / om ** 3;
  const full = (kap * kap * s2 / eps + (2 * kap * s1) / (eps * eps) + (2 * s0) / eps ** 3) / (2 * Math.PI);
  const sum = full - fFamily(0, eps) / 2;
  const integral = 6 / (2 * Math.PI * kap * eps ** 4);
  return sum - integral;
}

// ------------------------------------------------------------------ experiments
export interface Experiment {
  id: string;
  label: string;
  R: number; // m
  dMin: number; // m
  dMax: number; // m
}

/** Lamoreaux 1997: torsion pendulum, gold-coated lens of radius 11.3 cm, 0.6 to 6 um. */
export const LAMOREAUX: Experiment = { id: 'lamoreaux', label: 'Lamoreaux 1997', R: 0.113, dMin: 0.6e-6, dMax: 6e-6 };
/** Mohideen and Roy 1998: AFM, metal-coated sphere of 196 um diameter, 0.1 to 0.9 um. */
export const MOHIDEEN: Experiment = { id: 'mohideen', label: 'Mohideen & Roy 1998', R: 98e-6, dMin: 0.1e-6, dMax: 0.9e-6 };
