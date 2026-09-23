// Hawking radiation from a Schwarzschild black hole, in SI units.
// Simple model: the horizon radiates as a perfect blackbody of area 4π r_s²,
// photons only, greybody factors ignored. Pure module: no DOM, no Three.js.

export const HBAR = 1.054571817e-34; // J s
export const C = 2.99792458e8; // m/s
export const G = 6.6743e-11; // m³ kg⁻¹ s⁻²
export const KB = 1.380649e-23; // J/K
export const SIGMA = (Math.PI ** 2 * KB ** 4) / (60 * HBAR ** 3 * C ** 2); // Stefan–Boltzmann
export const WIEN_B = 2.897771955e-3; // m K
export const YEAR = 3.15576e7; // Julian year, s
export const T_CMB = 2.725; // K
export const AGE_UNIVERSE_YR = 1.3787e10; // Planck 2018

export const M_SUN = 1.98847e30; // kg
export const M_EARTH = 5.9722e24; // kg
export const M_MOON = 7.342e22; // kg
/** A large mountain, order of magnitude only. */
export const M_MOUNTAIN = 1e12; // kg
/** Carr, Kohri, Sendouda & Yokoyama (2010): PBHs finishing now, all Standard Model species emitted. */
export const M_PBH_TODAY_FULL = 5.1e11; // kg

/** Schwarzschild radius r_s = 2GM/c². */
export const schwarzschildRadius = (M: number) => (2 * G * M) / (C * C);
/** Horizon area 4π r_s². */
export const horizonArea = (M: number) => 4 * Math.PI * schwarzschildRadius(M) ** 2;

/** Hawking temperature T_H = ħc³ / (8πGMk_B), in kelvin. */
export const hawkingT = (M: number) => (HBAR * C ** 3) / (8 * Math.PI * G * M * KB);
/** Mass whose Hawking temperature equals T. */
export const massForTemperature = (T: number) => (HBAR * C ** 3) / (8 * Math.PI * G * KB * T);

/** Photon-only blackbody power P = ħc⁶ / (15360 π G² M²), in watts. Equals σ A T_H⁴. */
export const power = (M: number) => (HBAR * C ** 6) / (15360 * Math.PI * G * G * M * M);

/** Net power in a bath at temperature Tenv, in the same blackbody model: σA(T_H⁴ − Tenv⁴). Negative means the hole grows. */
export const netPower = (M: number, Tenv: number) => SIGMA * horizonArea(M) * (hawkingT(M) ** 4 - Tenv ** 4);

/** K in dM/dt = −K/M². */
export const K_LOSS = (HBAR * C ** 4) / (15360 * Math.PI * G * G);
/** Mass loss rate dM/dt (kg/s). */
export const dMdt = (M: number) => -K_LOSS / (M * M);

/** Photon-only evaporation time t = 5120 π G² M³ / (ħ c⁴), in seconds. */
export const lifetime = (M: number) => (5120 * Math.PI * G * G * M ** 3) / (HBAR * C ** 4);
/** Mass whose remaining photon-only lifetime is tau seconds. */
export const massForLifetime = (tau: number) => Math.cbrt((tau * HBAR * C ** 4) / (5120 * Math.PI * G * G));

/** Bekenstein–Hawking entropy in units of k_B: S/k = A c³ / (4Għ). */
export const entropy = (M: number) => (horizonArea(M) * C ** 3) / (4 * G * HBAR);

/** Heat capacity C = dE/dT with E = Mc². It is negative: C = −8πGM²k_B/(ħc). */
export const heatCapacity = (M: number) => (-8 * Math.PI * G * M * M * KB) / (HBAR * C);

/** Approximate photon emission rate, P divided by the mean blackbody photon energy 2.701 k_B T. */
export const photonRate = (M: number) => power(M) / (2.701 * KB * hawkingT(M));

/** Wien peak wavelength in metres. */
export const wienPeak = (T: number) => WIEN_B / T;

export type Band = 'radio / microwave' | 'infrared' | 'visible' | 'ultraviolet' | 'X-ray' | 'gamma ray';
/** Band containing the Wien peak wavelength. */
export function band(T: number): Band {
  const l = wienPeak(T);
  if (l > 1e-3) return 'radio / microwave';
  if (l > 7e-7) return 'infrared';
  if (l > 3.8e-7) return 'visible';
  if (l > 1e-8) return 'ultraviolet';
  if (l > 1e-11) return 'X-ray';
  return 'gamma ray';
}

/**
 * Simplest Page-time estimate: the radiation has gained as much entropy as the hole has lost
 * once S_BH has halved, so M = M₀/√2. With M³ falling linearly in time, that is at
 * t/τ = 1 − 2^(−3/2) ≈ 0.646.
 */
export const PAGE_FRACTION_SIMPLE = 1 - Math.pow(2, -1.5);

/** One RK4 step of dM/dt = −K/M². */
export function rk4Mass(M: number, h: number): number {
  const k1 = dMdt(M);
  const k2 = dMdt(M + 0.5 * h * k1);
  const k3 = dMdt(M + 0.5 * h * k2);
  const k4 = dMdt(M + h * k3);
  return M + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
}

/**
 * Integrate the mass forward by dt seconds with RK4 substeps no longer than frac of the
 * remaining lifetime. Returns the new mass. Needs dt < lifetime(M).
 */
export function evolveMass(M: number, dt: number, frac = 0.02): number {
  let done = 0;
  let m = M;
  let guard = 0;
  while (done < dt && guard++ < 20000) {
    const h = Math.min(dt - done, frac * lifetime(m));
    if (!(h > 0) || !(m > 0)) break;
    m = rk4Mass(m, h);
    done += h;
  }
  return m;
}
