// Quantum Hall effect: constants, Landau levels, and a broadened-level model of
// R_xy(B) and R_xx(B). Plus the classical electron dynamics used by the Hall-bar
// scene (cyclotron orbits, E x B drift in a disorder potential, skipping orbits).
// Pure math. No DOM, no Three.js.

// ---------------------------------------------------------------- constants (SI)

/** Planck constant, exact since the 2019 SI redefinition (J s). */
export const H_PLANCK = 6.62607015e-34;
/** Elementary charge, exact since the 2019 SI redefinition (C). */
export const E_CHARGE = 1.602176634e-19;
/** Boltzmann constant, exact since 2019 (J/K). */
export const K_B = 1.380649e-23;
export const HBAR = H_PLANCK / (2 * Math.PI);
/** Electron mass, CODATA 2022 (kg). */
export const M_E = 9.1093837139e-31;
/** Conduction-band effective mass of GaAs, in units of m_e. */
export const MSTAR_GAAS = 0.067;
/** von Klitzing constant h/e^2 (ohm). Exact under the 2019 SI. */
export const R_K = H_PLANCK / (E_CHARGE * E_CHARGE);
/** Conventional value adopted in 1990, before h and e were fixed. */
export const R_K90 = 25812.807;
/** k_B in meV per kelvin. */
export const KB_MEV = (K_B / E_CHARGE) * 1e3;

// ---------------------------------------------------------------- closed forms

/** Classical Hall resistance of a 2D sheet: R_xy = B / (n e). n in m^-2. */
export function classicalHall(B: number, n: number): number {
  return B / (n * E_CHARGE);
}

/** Cyclotron energy hbar e B / m* in joules. */
export function cyclotronEnergyJ(B: number, mstar = MSTAR_GAAS): number {
  return (HBAR * E_CHARGE * Math.abs(B)) / (mstar * M_E);
}

/** Cyclotron energy in meV. */
export function cyclotronMeV(B: number, mstar = MSTAR_GAAS): number {
  return (cyclotronEnergyJ(B, mstar) / E_CHARGE) * 1e3;
}

/** States per unit area in one (spin-resolved) Landau level: e|B|/h, in m^-2. */
export function degeneracy(B: number): number {
  return (E_CHARGE * Math.abs(B)) / H_PLANCK;
}

/** Filling factor nu = n h / (e |B|). */
export function fillingFactor(n: number, B: number): number {
  return (n * H_PLANCK) / (E_CHARGE * Math.abs(B));
}

/** Field at which a density n fills exactly nu levels. */
export function fieldForFilling(n: number, nu: number): number {
  return (n * H_PLANCK) / (E_CHARGE * nu);
}

/** Fermi energy at B = 0 for a spin-degenerate 2D gas, in meV. */
export function fermiEnergyMeV(n: number, mstar = MSTAR_GAAS): number {
  return ((Math.PI * HBAR * HBAR * n) / (mstar * M_E) / E_CHARGE) * 1e3;
}

// ---------------------------------------------------------------- special functions

/** Complementary error function (Numerical Recipes erfcc, fractional error < 1.2e-7). */
export function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z - 1.26551223 +
        t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 +
        t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? r : 2 - r;
}

/** Standard normal cumulative distribution. */
export function Phi(x: number): number {
  if (x > 9) return 1;
  if (x < -9) return 0;
  return 0.5 * erfc(-x / Math.SQRT2);
}

// ---------------------------------------------------------------- the level model

export interface QHParams {
  /** Sheet density, m^-2. */
  n: number;
  /** Disorder broadening of each level (Gaussian sigma), meV. */
  gamma: number;
  /** Temperature, K. */
  T: number;
  /** Effective mass ratio, m* in units of m_e. */
  mstar: number;
  /** Model spin splitting as a fraction of hbar omega_c. */
  spinFrac: number;
  /** Half-width of the band of extended states at each level centre, meV. */
  wExt: number;
}

export const DEFAULT_PARAMS: QHParams = { n: 2.5e15, gamma: 0.35, T: 0.3, mstar: MSTAR_GAAS, spinFrac: 0.3, wExt: 0.1 };

/** Below this |B| the model hands over to the classical Hall line. */
export const B_LOW = 0.25;

/** Energy of spin-resolved level j (meV). j = 2N + s, orbital index N, spin s. */
export function levelEnergy(j: number, hwc: number, spinFrac: number): number {
  const N = j >> 1;
  const s = j & 1;
  return hwc * (N + 0.5 + (s - 0.5) * spinFrac);
}

// Thermal kernel -df/dx sampled at x = kT u, u in [-13, 13], step 0.5. Weights sum to 1.
const KU: number[] = [];
const KW: number[] = [];
{
  let sum = 0;
  for (let u = -13; u <= 13 + 1e-9; u += 0.5) {
    const c = Math.cosh(u / 2);
    const w = 0.25 / (c * c);
    KU.push(u);
    KW.push(w);
    sum += w;
  }
  for (let i = 0; i < KW.length; i++) KW[i] /= sum;
}
// Gaussian weights for t in [-6, 6], step 0.25 (units of sigma). Weights sum to 1.
const GT: number[] = [];
const GW: number[] = [];
{
  let sum = 0;
  for (let t = -6; t <= 6 + 1e-9; t += 0.25) {
    const w = Math.exp(-0.5 * t * t);
    GT.push(t);
    GW.push(w);
    sum += w;
  }
  for (let i = 0; i < GW.length; i++) GW[i] /= sum;
}

function fermi(x: number, kT: number): number {
  const a = x / kT;
  if (a > 40) return 0;
  if (a < -40) return 1;
  return 1 / (1 + Math.exp(a));
}

/** Occupied fraction of one Gaussian level centred at E, broadening g, at chemical potential mu and kT (meV). */
export function levelOccupation(E: number, g: number, mu: number, kT: number): number {
  const d = mu - E;
  const cut = 9 * g + 14 * kT;
  if (d > cut) return 1;
  if (d < -cut) return 0;
  // Sommerfeld: the thermal correction is of order (kT/g)^2, negligible below kT = g/20.
  if (kT < 0.05 * g) return Phi(d / g);
  if (kT < g) {
    let s = 0;
    for (let k = 0; k < KU.length; k++) s += KW[k] * Phi((d + kT * KU[k]) / g);
    return s;
  }
  let s = 0;
  for (let k = 0; k < GT.length; k++) s += GW[k] * fermi(E + g * GT[k] - mu, kT);
  return s;
}

/** Clipped, normalised cumulative of the extended band [E - w, E + w]. */
function extCum(y: number, E: number, g: number, w: number, lo: number, Z: number): number {
  if (y <= E - w) return 0;
  if (y >= E + w) return 1;
  return (Phi((y - E) / g) - lo) / Z;
}

/** Occupied fraction of the extended states of one level. */
export function extendedOccupation(E: number, g: number, w: number, mu: number, kT: number): number {
  const d = mu - E;
  const cut = w + 14 * kT;
  if (d >= cut) return 1;
  if (d <= -cut) return 0;
  const lo = Phi(-w / g);
  const Z = Phi(w / g) - lo;
  if (kT <= 0) return extCum(mu, E, g, w, lo, Z);
  const scale = Math.min(w, g);
  if (kT < scale) {
    let s = 0;
    for (let k = 0; k < KU.length; k++) s += KW[k] * extCum(mu + kT * KU[k], E, g, w, lo, Z);
    return s;
  }
  // Simpson over the window with Gaussian weight times Fermi function.
  const M = 40;
  const h = (2 * w) / M;
  let s = 0;
  let norm = 0;
  for (let i = 0; i <= M; i++) {
    const e = E - w + i * h;
    const c = i === 0 || i === M ? 1 : i % 2 ? 4 : 2;
    const gw = c * Math.exp(-0.5 * ((e - E) / g) ** 2);
    s += gw * fermi(e - mu, kT);
    norm += gw;
  }
  return s / norm;
}

export interface QHResult {
  B: number;
  nu: number;
  /** Chemical potential, meV. */
  mu: number;
  hwc: number;
  /** Conductivities in units of e^2/h, signed with B for sxy. */
  sxy: number;
  sxx: number;
  /** Resistivities in ohm. Rxx is per square. */
  Rxy: number;
  Rxx: number;
  /** Relative error of the density solve. */
  resid: number;
  /** True when every extended state is either full or empty (sigma_xy exactly an integer). */
  insulating: boolean;
}

export function emptyResult(): QHResult {
  return { B: 0, nu: 0, mu: 0, hwc: 0, sxy: 0, sxx: 0, Rxy: 0, Rxx: 0, resid: 0, insulating: false };
}

/** Sum of level occupations (in units of one level) at chemical potential mu. */
function totalFilling(mu: number, hwc: number, p: QHParams, kT: number): number {
  let s = 0;
  const cut = 9 * p.gamma + 14 * kT;
  for (let j = 0; j < 4000; j++) {
    const E = levelEnergy(j, hwc, p.spinFrac);
    if (E - mu > cut) break;
    s += levelOccupation(E, p.gamma, mu, kT);
  }
  return s;
}

/**
 * The model. Each spin-resolved Landau level is a Gaussian of width gamma holding e|B|/h
 * states per area. Only the states within wExt of the centre are extended. The density n
 * fixes the chemical potential. Then sigma_xy = (e^2/h) * sum of filled extended fractions F,
 * and sigma_xx = (e^2/h) * sum of 2 F (1 - F). That form peaks at e^2/2h mid-transition, the same
 * peak as the semicircle law, and vanishes when every extended state is full or empty.
 */
export function solveQH(B: number, p: QHParams, out: QHResult = emptyResult()): QHResult {
  const sign = B < 0 ? -1 : 1;
  const Bm = Math.max(Math.abs(B), B_LOW);
  const hwc = cyclotronMeV(Bm, p.mstar);
  const nu = fillingFactor(p.n, Bm);
  const kT = KB_MEV * Math.max(0, p.T);
  // Bracket and bisect for mu.
  let lo = -10 * p.gamma - 50 * kT;
  let hi = levelEnergy(Math.ceil(nu) + 1, hwc, p.spinFrac) + 10 * p.gamma + 50 * kT;
  while (totalFilling(hi, hwc, p, kT) < nu) hi += hwc + 5 * p.gamma;
  for (let it = 0; it < 44; it++) {
    const mid = 0.5 * (lo + hi);
    if (totalFilling(mid, hwc, p, kT) < nu) lo = mid;
    else hi = mid;
  }
  const mu = 0.5 * (lo + hi);
  const resid = Math.abs(totalFilling(mu, hwc, p, kT) - nu) / nu;
  let sxy = 0;
  let sxx = 0;
  const cut = p.wExt + 14 * kT;
  for (let j = 0; j < 4000; j++) {
    const E = levelEnergy(j, hwc, p.spinFrac);
    if (E - mu > cut) break;
    const F = extendedOccupation(E, p.gamma, p.wExt, mu, kT);
    sxy += F;
    sxx += 2 * F * (1 - F);
  }
  const den = sxx * sxx + sxy * sxy;
  out.B = B;
  out.nu = fillingFactor(p.n, B);
  out.mu = mu;
  out.hwc = cyclotronMeV(B, p.mstar);
  out.sxy = sign * sxy;
  out.sxx = sxx;
  out.resid = resid;
  out.insulating = den < 1e-24;
  if (out.insulating) {
    out.Rxy = NaN;
    out.Rxx = Infinity;
  } else {
    out.Rxy = (sign * R_K * sxy) / den;
    out.Rxx = (R_K * sxx) / den;
  }
  if (Math.abs(B) < B_LOW) out.Rxy = classicalHall(B, p.n);
  return out;
}

/** Sweep |B| from b0 to b1 (N samples). Fills Rxy, Rxx (ohm) and mu (meV). */
export function sweep(p: QHParams, b0: number, b1: number, N: number, Rxy: Float64Array, Rxx: Float64Array, mu: Float64Array): void {
  const r = emptyResult();
  for (let i = 0; i < N; i++) {
    const B = b0 + ((b1 - b0) * i) / (N - 1);
    solveQH(B, p, r);
    Rxy[i] = r.Rxy;
    Rxx[i] = r.Rxx;
    mu[i] = r.mu;
  }
}

/** If (Rxy, Rxx) sit on a plateau, return its integer index, else 0. */
export function plateauIndex(Rxy: number, Rxx: number, tol = 1e-4): number {
  if (!Number.isFinite(Rxy) || Rxy === 0 || !(Rxx < tol * R_K)) return 0;
  const v = Math.round(R_K / Math.abs(Rxy));
  if (v < 1) return 0;
  return Math.abs((Math.abs(Rxy) * v) / R_K - 1) < tol ? v : 0;
}

/** Relative departure of R_xy from h/(2 e^2) at the exact centre of the nu = 2 plateau. */
export function nu2Deviation(p: QHParams): number {
  const r = solveQH(fieldForFilling(p.n, 2), p);
  if (!Number.isFinite(r.Rxy)) return 1;
  return Math.abs(r.Rxy / (R_K / 2) - 1);
}

// ---------------------------------------------------------------- scene dynamics

/** A smooth random disorder potential on a grid, with its gradient, for the Hall bar. */
export interface Disorder {
  nx: number;
  nz: number;
  x0: number;
  z0: number;
  dx: number;
  dz: number;
  V: Float32Array;
  gx: Float32Array;
  gz: Float32Array;
}

/** Small deterministic RNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sum of Gaussian bumps of random sign, sampled on a grid covering [-L/2, L/2] x [-W/2, W/2]. */
export function makeDisorder(L: number, W: number, count: number, amp: number, width: number, seed: number, nx = 160, nz = 64): Disorder {
  const r = rng(seed);
  const cx: number[] = [];
  const cz: number[] = [];
  const ca: number[] = [];
  for (let i = 0; i < count; i++) {
    cx.push((r() - 0.5) * L);
    cz.push((r() - 0.5) * W);
    ca.push((r() < 0.5 ? -1 : 1) * amp * (0.6 + 0.4 * r()));
  }
  const d: Disorder = {
    nx, nz, x0: -L / 2, z0: -W / 2, dx: L / (nx - 1), dz: W / (nz - 1),
    V: new Float32Array(nx * nz), gx: new Float32Array(nx * nz), gz: new Float32Array(nx * nz),
  };
  const s2 = 2 * width * width;
  for (let k = 0; k < nz; k++) {
    const z = d.z0 + k * d.dz;
    for (let i = 0; i < nx; i++) {
      const x = d.x0 + i * d.dx;
      let v = 0, gx = 0, gz = 0;
      for (let m = 0; m < count; m++) {
        // periodic in x so the potential wraps with the electrons
        let ddx = x - cx[m];
        if (ddx > L / 2) ddx -= L;
        if (ddx < -L / 2) ddx += L;
        const ddz = z - cz[m];
        const e = ca[m] * Math.exp(-(ddx * ddx + ddz * ddz) / s2);
        v += e;
        gx += (-2 * ddx / s2) * e;
        gz += (-2 * ddz / s2) * e;
      }
      const o = k * nx + i;
      d.V[o] = v;
      d.gx[o] = gx;
      d.gz[o] = gz;
    }
  }
  return d;
}

/** Bilinear sample of the gradient into out[0..1]. */
export function sampleGrad(d: Disorder, x: number, z: number, out: Float64Array): void {
  let fx = (x - d.x0) / d.dx;
  let fz = (z - d.z0) / d.dz;
  fx = Math.max(0, Math.min(d.nx - 1.001, fx));
  fz = Math.max(0, Math.min(d.nz - 1.001, fz));
  const i = fx | 0, k = fz | 0;
  const a = fx - i, b = fz - k;
  const o = k * d.nx + i;
  const w00 = (1 - a) * (1 - b), w10 = a * (1 - b), w01 = (1 - a) * b, w11 = a * b;
  out[0] = w00 * d.gx[o] + w10 * d.gx[o + 1] + w01 * d.gx[o + d.nx] + w11 * d.gx[o + d.nx + 1];
  out[1] = w00 * d.gz[o] + w10 * d.gz[o + 1] + w01 * d.gz[o + d.nx] + w11 * d.gz[o + d.nx + 1];
}

/**
 * Electrons in the (x, z) plane: s = [x, z, vx, vz] per electron, packed.
 * Velocity turns at signed rate omega: d(vx + i vz)/dt = -i omega (vx + i vz), plus force -grad V.
 * Hard walls at z = +-W/2 reflect vz (skipping orbits). x wraps periodically over length L.
 * Returns a bitmask per electron in wallHit (1 = touched a wall this call).
 */
export function stepElectrons(
  s: Float64Array, count: number, h: number, steps: number, omega: number,
  L: number, W: number, d: Disorder | null, wallHit: Uint8Array, g: Float64Array,
): void {
  const c = Math.cos(omega * h);
  const sn = Math.sin(omega * h);
  const zt = W / 2;
  for (let i = 0; i < count; i++) {
    const o = i * 4;
    let x = s[o], z = s[o + 1], vx = s[o + 2], vz = s[o + 3];
    let hit = 0;
    for (let k = 0; k < steps; k++) {
      // Boris-style: half kick, exact rotation, half kick, drift
      if (d) {
        sampleGrad(d, x, z, g);
        vx -= 0.5 * h * g[0];
        vz -= 0.5 * h * g[1];
      }
      const rx = c * vx + sn * vz;
      const rz = -sn * vx + c * vz;
      vx = rx;
      vz = rz;
      if (d) {
        sampleGrad(d, x, z, g);
        vx -= 0.5 * h * g[0];
        vz -= 0.5 * h * g[1];
      }
      x += h * vx;
      z += h * vz;
      if (z > zt) { z = 2 * zt - z; vz = -vz; hit = 1; }
      else if (z < -zt) { z = -2 * zt - z; vz = -vz; hit = 1; }
      if (x > L / 2) x -= L;
      else if (x < -L / 2) x += L;
    }
    s[o] = x; s[o + 1] = z; s[o + 2] = vx; s[o + 3] = vz;
    wallHit[i] = hit;
  }
}

/**
 * Drift direction (+1 = +x, -1 = -x) of skipping orbits along a wall, for the rotation
 * convention of stepElectrons. top = true for the wall at z = +W/2.
 */
export function skipDirection(omega: number, top: boolean): number {
  if (omega === 0) return 0;
  const s = omega > 0 ? 1 : -1;
  return top ? -s : s;
}
