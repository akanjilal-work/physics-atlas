// CMB physics: blackbody, background cosmology at recombination, a toy acoustic
// power spectrum, and random skies built from spherical harmonics.
// Pure math, no DOM. Distances in comoving Mpc, H in km/s/Mpc, temperatures in K.

/** CMB temperature today (Fixsen 2009), K. */
export const T0 = 2.7255;
/** Speed of light, km/s. */
export const C_KMS = 299792.458;
/** Wien displacement constant for B_λ, m·K. */
export const WIEN_B = 2.897771955e-3;
/** Planck constant, J·s. */
export const H_PLANCK = 6.62607015e-34;
/** Boltzmann constant, J/K. */
export const K_B = 1.380649e-23;
/** Speed of light, m/s. */
export const C_MS = 299792458;
/** Photon density today, ω_γ = Ω_γ h², for T0 = 2.7255 K. */
export const OMEGA_GAMMA_H2 = 2.4728e-5;
/** Photons plus three standard neutrinos (N_eff = 3.046). */
export const OMEGA_R_H2 = OMEGA_GAMMA_H2 * (1 + 0.2271 * 3.046);
/** Hubble parameter held fixed in this page (Planck 2018). */
export const H_FID = 0.674;
/** Seconds in a Julian year. */
const YEAR_S = 3.15576e7;
/** One megaparsec in km. */
const MPC_KM = 3.0856775814913673e19;

export interface CMBParams {
  /** Physical baryon density ω_b = Ω_b h². */
  wb: number;
  /** Physical cold dark matter density ω_c = Ω_c h². */
  wc: number;
  /** Curvature density Ω_k. Positive is open, negative is closed. */
  ok: number;
  /** Dimensionless Hubble parameter h. */
  h: number;
}

/** Planck 2018 best fit (TT,TE,EE+lowE+lensing), flat. */
export const PLANCK: CMBParams = { wb: 0.02237, wc: 0.12, ok: 0, h: H_FID };

// ------------------------------------------------------------ blackbody

/** Blackbody temperature at redshift z. Adiabatic expansion keeps the spectrum Planckian with T ∝ (1+z). */
export const tempAtZ = (z: number, t0 = T0) => t0 * (1 + z);

/** Wien peak of B_λ, in metres. */
export const wienLambda = (T: number) => WIEN_B / T;

/** Peak frequency of B_ν in Hz: ν = 2.821439 k T / h. */
export const wienNu = (T: number) => (2.821439372 * K_B * T) / H_PLANCK;

/** Planck spectral radiance per unit frequency, W m⁻² sr⁻¹ Hz⁻¹. */
export function planckNu(nu: number, T: number): number {
  const x = (H_PLANCK * nu) / (K_B * T);
  return ((2 * H_PLANCK * nu ** 3) / (C_MS * C_MS)) / Math.expm1(x);
}

/** Planck spectral radiance per unit wavelength, W m⁻² sr⁻¹ m⁻¹. */
export function planckLambda(lam: number, T: number): number {
  const x = (H_PLANCK * C_MS) / (lam * K_B * T);
  return ((2 * H_PLANCK * C_MS * C_MS) / lam ** 5) / Math.expm1(x);
}

// ------------------------------------------------------------ background

/** Hu & Sugiyama (1996) fit for the redshift of last scattering. */
export function zStar(wb: number, wm: number): number {
  const g1 = (0.0783 * wb ** -0.238) / (1 + 39.5 * wb ** 0.763);
  const g2 = 0.56 / (1 + 21.1 * wb ** 1.81);
  return 1048 * (1 + 0.00124 * wb ** -0.738) * (1 + g1 * wm ** g2);
}

/**
 * Sound horizon at the baryon drag epoch, from the fit of Aubourg et al. (2015), eq. 16,
 * calibrated on full Boltzmann codes. ω_ν = 0.00064 (one massive neutrino, 0.06 eV).
 */
export function rDragFit(wb: number, wcb: number, wnu = 0.00064): number {
  return (55.154 * Math.exp(-72.3 * (wnu + 0.0006) ** 2)) / (wcb ** 0.25351 * wb ** 0.12807);
}

/** H(a) in km/s/Mpc. Dark energy is a cosmological constant that closes the budget. */
export function hubbleA(p: CMBParams, a: number): number {
  const wm = p.wb + p.wc;
  const h2 = p.h * p.h;
  const wk = p.ok * h2;
  const wl = h2 - wm - OMEGA_R_H2 - wk;
  return 100 * Math.sqrt(OMEGA_R_H2 / a ** 4 + wm / a ** 3 + wk / (a * a) + wl);
}

/** Baryon loading R = 3ρ_b / 4ρ_γ at scale factor a. */
export const baryonLoading = (wb: number, a: number) => ((3 * wb) / (4 * OMEGA_GAMMA_H2)) * a;

/** Photon–baryon sound speed in units of c. */
export const soundSpeed = (wb: number, a: number) => 1 / Math.sqrt(3 * (1 + baryonLoading(wb, a)));

/** Simpson's rule in ln a from a0 to a1 of f(a) (f already includes the Jacobian a). */
function simpsonLog(f: (a: number) => number, a0: number, a1: number, n = 800): number {
  const l0 = Math.log(a0);
  const l1 = Math.log(a1);
  const hh = (l1 - l0) / n;
  let s = f(a0) + f(a1);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(Math.exp(l0 + i * hh));
  return (s * hh) / 3;
}

const A_MIN = 1e-9;

/** Comoving sound horizon r_s(a) = ∫ c_s dt / a, in Mpc. */
export function soundHorizon(p: CMBParams, a: number, n = 800): number {
  return simpsonLog((x) => (C_KMS * soundSpeed(p.wb, x)) / (x * hubbleA(p, x)), A_MIN, a, n);
}

/** Comoving particle horizon η(a) = ∫ c dt / a, in Mpc. */
export function horizon(p: CMBParams, a: number): number {
  return simpsonLog((x) => C_KMS / (x * hubbleA(p, x)), A_MIN, a);
}

/** Cosmic time at scale factor a, in years. */
export function ageAt(p: CMBParams, a: number): number {
  const mpcPerKms = simpsonLog((x) => 1 / hubbleA(p, x), A_MIN, a);
  return (mpcPerKms * MPC_KM) / YEAR_S;
}

/** Line-of-sight comoving distance to redshift z, in Mpc. */
export function comovingDistance(p: CMBParams, z: number): number {
  const a = 1 / (1 + z);
  return simpsonLog((x) => C_KMS / (x * hubbleA(p, x)), a, 1, 1200);
}

/** Transverse comoving distance D_M (the comoving angular diameter distance) to z, in Mpc. */
export function transverseDistance(p: CMBParams, z: number): number {
  const chi = comovingDistance(p, z);
  if (Math.abs(p.ok) < 1e-8) return chi;
  const dh = C_KMS / (100 * p.h);
  const s = Math.sqrt(Math.abs(p.ok));
  return p.ok > 0 ? (dh / s) * Math.sinh((s * chi) / dh) : (dh / s) * Math.sin((s * chi) / dh);
}

export interface Background {
  wm: number;
  Om: number;
  Ol: number;
  zStar: number;
  zDrag: number;
  zEq: number;
  /** Baryon loading at last scattering. */
  Rstar: number;
  /** Sound horizon at last scattering, Mpc. */
  rsStar: number;
  /** Sound horizon at the drag epoch (the BAO ruler), Mpc. */
  rsDrag: number;
  /** Transverse comoving distance to last scattering, Mpc. */
  DM: number;
  /** Acoustic scale ℓ_A = π D_M / r_s. */
  lA: number;
  /** Angular size of the sound horizon, θ* = r_s / D_M, radians. */
  thetaStar: number;
  /** Multipole of matter–radiation equality, k_eq D_M. */
  lEq: number;
  /** Silk damping multipole (rough scaling). */
  lD: number;
  /** Age of the universe at last scattering, years. */
  ageStar: number;
}

export function background(p: CMBParams): Background {
  const wm = p.wb + p.wc;
  const zs = zStar(p.wb, wm);
  const rsDrag = rDragFit(p.wb, wm);
  // Drag redshift: where our sound-horizon integral reaches the calibrated r_d.
  let lo = 1 / (1 + zs);
  let hi = 1 / 500;
  for (let i = 0; i < 40; i++) {
    const mid = 0.5 * (lo + hi);
    if (soundHorizon(p, mid, 300) < rsDrag) lo = mid;
    else hi = mid;
  }
  const zd = 1 / (0.5 * (lo + hi)) - 1;
  const zEq = wm / OMEGA_R_H2 - 1;
  const aS = 1 / (1 + zs);
  const rsStar = soundHorizon(p, aS);
  const DM = transverseDistance(p, zs);
  const aEq = 1 / (1 + zEq);
  // k_eq = a_eq H(a_eq) / c, in 1/Mpc.
  const kEq = (aEq * hubbleA(p, aEq)) / C_KMS;
  // Silk damping: the diffusion length grows like sqrt(η / n_e σ_T). The toy envelope scale is
  // tuned for Planck-like values, with a rough power-law scaling in ω_b and ω_m.
  const kD = 0.1088 * (p.wb / 0.02237) ** 0.24 * (wm / 0.14237) ** 0.12;
  return {
    wm,
    Om: wm / (p.h * p.h),
    Ol: 1 - wm / (p.h * p.h) - OMEGA_R_H2 / (p.h * p.h) - p.ok,
    zStar: zs,
    zDrag: zd,
    zEq,
    Rstar: baryonLoading(p.wb, aS),
    rsStar,
    rsDrag,
    DM,
    lA: (Math.PI * DM) / rsStar,
    thetaStar: rsStar / DM,
    lEq: kEq * DM,
    lD: kD * DM,
    ageStar: ageAt(p, aS),
  };
}

// ------------------------------------------------------------ toy spectrum

/**
 * Tuning constants of the toy spectrum, fitted by hand-run least squares to the
 * shape of the Planck best-fit spectrum. They are not physical constants.
 */
export const TOY = {
  /** Sachs–Wolfe plateau height, μK². */
  plateau: 1000,
  /** Multipole where the plateau hands over to the acoustic regime. */
  lSW: 38.3,
  /** Normalisation of the acoustic part, μK². */
  norm: 341.5,
  /** Radiation driving: extra oscillation amplitude for modes that enter before equality. */
  drive: 1.0825,
  /** Baryon loading of the oscillation amplitude, (1 + aR). */
  aR: 1.552,
  /** Weight of the baryon offset of the zero point, b R. */
  bR: 2.040 * 3,
  /** How fast the potentials (and so the baryon offset) decay past equality. */
  decay: 1.862,
  /** Phase shift of the peaks in units of π, standing in for driving and the potential decay. */
  phi: 0.2615,
  /** Peak spacing in units of ℓ_A (the real spectrum is not exactly periodic either). */
  spacing: 1.0152,
  /** Weight of the Doppler (velocity) term. */
  doppler: 0.968,
  /** Exponent of the damping envelope. */
  dampPow: 1.2676,
};

/**
 * Toy D_ℓ = ℓ(ℓ+1)C_ℓ/2π in μK², for ℓ = 0..lmax. Written into `out` if given.
 * A Sachs–Wolfe plateau plus an acoustic oscillator with baryon loading R,
 * radiation driving and Silk damping. It is a toy: it reproduces the peak
 * positions and the trends with parameters, not Planck-level detail.
 */
export function toySpectrum(p: CMBParams, lmax: number, bg = background(p), out?: Float64Array): Float64Array {
  const D = out ?? new Float64Array(lmax + 1);
  const R = bg.Rstar;
  const cs = Math.sqrt(1 / (1 + R));
  D[0] = 0;
  if (lmax >= 1) D[1] = 0;
  for (let l = 2; l <= lmax; l++) {
    const u = l / bg.lEq;
    const u2 = u * u;
    // Radiation driving: modes that entered before equality oscillate harder.
    const G = 1 + (TOY.drive * u2) / (1 + u2);
    // Potential wells shift the zero point of the oscillation by about R. They decay on small scales.
    const P = 1 / (1 + TOY.decay * u);
    const x = Math.PI * (l / (TOY.spacing * bg.lA) + TOY.phi);
    const amp = G * (1 + TOY.aR * R);
    const mono = amp * Math.cos(x) - TOY.bR * R * P;
    const dip = amp * cs * Math.sin(x);
    const damp = Math.exp(-2 * (l / bg.lD) ** TOY.dampPow);
    const W = 1 / (1 + (l / TOY.lSW) ** 2);
    D[l] = TOY.plateau * W + TOY.norm * (1 - W) * (mono * mono + TOY.doppler * dip * dip) * damp;
  }
  return D;
}

/** Local maxima of D_ℓ above ℓ = lmin, in order. */
export function findPeaks(D: ArrayLike<number>, lmin = 100, lmax = D.length - 2): number[] {
  const out: number[] = [];
  for (let l = Math.max(lmin, 2); l <= lmax; l++) {
    if (D[l] > D[l - 1] && D[l] >= D[l + 1]) out.push(l);
  }
  return out;
}

/** Local minima of D_ℓ above ℓ = lmin. */
export function findTroughs(D: ArrayLike<number>, lmin = 100, lmax = D.length - 2): number[] {
  const out: number[] = [];
  for (let l = Math.max(lmin, 2); l <= lmax; l++) {
    if (D[l] < D[l - 1] && D[l] <= D[l + 1]) out.push(l);
  }
  return out;
}

/** C_ℓ in μK² from D_ℓ. */
export const clFromDl = (Dl: number, l: number) => (l < 2 ? 0 : (2 * Math.PI * Dl) / (l * (l + 1)));

// ------------------------------------------------------------ random skies

/** Small fast seeded PRNG. */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal deviates by Box–Muller. */
export function gaussian(rng: () => number): () => number {
  let spare = NaN;
  return () => {
    if (!Number.isNaN(spare)) {
      const v = spare;
      spare = NaN;
      return v;
    }
    let u = 0;
    while (u <= 1e-12) u = rng();
    const v = rng();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
}

/** Index of (l, m) with 0 ≤ m ≤ l in packed triangular storage. */
export const lmIndex = (l: number, m: number) => (l * (l + 1)) / 2 + m;
export const lmSize = (lmax: number) => ((lmax + 1) * (lmax + 2)) / 2;

/**
 * Unit-variance complex Gaussian a_lm for a real sky (m ≥ 0 stored).
 * m = 0 is real with variance 1. For m > 0, Re and Im each have variance 1/2,
 * so ⟨|a_lm|²⟩ = 1 for every m. Scale by sqrt(C_ℓ) to give the sky a spectrum.
 */
export function unitAlm(seed: number, lmax: number): { re: Float64Array; im: Float64Array } {
  const g = gaussian(mulberry32(seed));
  const n = lmSize(lmax);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let l = 0; l <= lmax; l++) {
    re[lmIndex(l, 0)] = g();
    for (let m = 1; m <= l; m++) {
      re[lmIndex(l, m)] = g() * Math.SQRT1_2;
      im[lmIndex(l, m)] = g() * Math.SQRT1_2;
    }
  }
  return { re, im };
}

/** Recursion coefficients for the normalised associated Legendre functions (packed like a_lm). */
export function legendreCoeffs(lmax: number): { ca: Float64Array; cb: Float64Array } {
  const n = lmSize(lmax);
  const ca = new Float64Array(n);
  const cb = new Float64Array(n);
  for (let m = 0; m <= lmax; m++) {
    for (let l = m + 2; l <= lmax; l++) {
      const k = lmIndex(l, m);
      ca[k] = Math.sqrt((4 * l * l - 1) / (l * l - m * m));
      cb[k] = Math.sqrt(((l - 1) * (l - 1) - m * m) / (4 * (l - 1) * (l - 1) - 1));
    }
  }
  return { ca, cb };
}

/**
 * Normalised associated Legendre functions λ_lm(x) such that
 * Y_lm(θ, φ) = λ_lm(cos θ) e^{imφ}. Fills `out` (packed, size lmSize(lmax)).
 * Stable three-term recursion in l at fixed m.
 */
export function legendreRow(x: number, lmax: number, out: Float64Array, co = legendreCoeffs(lmax)): void {
  const { ca, cb } = co;
  const s = Math.sqrt(Math.max(0, 1 - x * x));
  let pmm = Math.sqrt(1 / (4 * Math.PI));
  for (let m = 0; m <= lmax; m++) {
    if (m > 0) pmm *= -s * Math.sqrt((2 * m + 1) / (2 * m));
    out[lmIndex(m, m)] = pmm;
    if (m === lmax) break;
    let pm1 = x * Math.sqrt(2 * m + 3) * pmm;
    out[lmIndex(m + 1, m)] = pm1;
    let pm2 = pmm;
    for (let l = m + 2; l <= lmax; l++) {
      const k = lmIndex(l, m);
      const pl = ca[k] * (x * pm1 - cb[k] * pm2);
      out[k] = pl;
      pm2 = pm1;
      pm1 = pl;
    }
  }
}

/** Workspace for sky synthesis, so repeated calls do not allocate. */
export interface SkyWork {
  lmax: number;
  nth: number;
  nph: number;
  leg: Float64Array;
  co: { ca: Float64Array; cb: Float64Array };
  sqcl: Float64Array;
  /** Per-m sums for the northern ring (n) and its mirror (s): even and odd parts. */
  nre: Float64Array;
  nim: Float64Array;
  sre: Float64Array;
  sim: Float64Array;
  cosm: Float64Array;
  sinm: Float64Array;
}

export function makeSkyWork(lmax: number, nth: number, nph: number): SkyWork {
  const cosm = new Float64Array((lmax + 1) * nph);
  const sinm = new Float64Array((lmax + 1) * nph);
  for (let m = 0; m <= lmax; m++) {
    for (let j = 0; j < nph; j++) {
      const ph = (2 * Math.PI * j) / nph;
      cosm[j * (lmax + 1) + m] = Math.cos(m * ph);
      sinm[j * (lmax + 1) + m] = Math.sin(m * ph);
    }
  }
  const z = () => new Float64Array(lmax + 1);
  return { lmax, nth, nph, leg: new Float64Array(lmSize(lmax)), co: legendreCoeffs(lmax), sqcl: z(), nre: z(), nim: z(), sre: z(), sim: z(), cosm, sinm };
}

/** Colatitude of ring i on the equiangular grid (ring centres). */
export const ringTheta = (i: number, nth: number) => (Math.PI * (i + 0.5)) / nth;

function ringOut(w: SkyWork, fre: Float64Array, fim: Float64Array, out: Float32Array, row: number): void {
  const { lmax, nph, cosm, sinm } = w;
  const L1 = lmax + 1;
  for (let j = 0; j < nph; j++) {
    const base = j * L1;
    let v = 0;
    for (let m = 1; m <= lmax; m++) v += fre[m] * cosm[base + m] - fim[m] * sinm[base + m];
    out[row + j] = fre[0] + 2 * v;
  }
}

/**
 * Synthesise T(θ, φ) = Σ a_lm Y_lm on an nth × nph equiangular grid, with
 * a_lm = unit_lm · sqrt(C_ℓ). Output is row-major (ring by ring from the north pole),
 * in the units of sqrt(C_ℓ). Uses the mirror symmetry λ_lm(−x) = (−1)^{l+m} λ_lm(x).
 */
export function synthesize(
  alm: { re: Float64Array; im: Float64Array },
  cl: ArrayLike<number>,
  w: SkyWork,
  out: Float32Array,
  lmin = 2,
): void {
  const { lmax, nth, nph, leg, co, sqcl, nre, nim, sre, sim } = w;
  for (let l = 0; l <= lmax; l++) sqcl[l] = l < lmin ? 0 : Math.sqrt(Math.max(0, cl[l]));
  const half = Math.ceil(nth / 2);
  for (let i = 0; i < half; i++) {
    legendreRow(Math.cos(ringTheta(i, nth)), lmax, leg, co);
    for (let m = 0; m <= lmax; m++) {
      let er = 0;
      let ei = 0;
      let or = 0;
      let oi = 0;
      for (let l = m; l <= lmax; l++) {
        const k = lmIndex(l, m);
        const amp = sqcl[l] * leg[k];
        if ((l + m) & 1) {
          or += alm.re[k] * amp;
          oi += alm.im[k] * amp;
        } else {
          er += alm.re[k] * amp;
          ei += alm.im[k] * amp;
        }
      }
      nre[m] = er + or;
      nim[m] = ei + oi;
      sre[m] = er - or;
      sim[m] = ei - oi;
    }
    ringOut(w, nre, nim, out, i * nph);
    const mirror = nth - 1 - i;
    if (mirror !== i) ringOut(w, sre, sim, out, mirror * nph);
  }
}

/**
 * Estimate C_ℓ from a map on the equiangular grid by direct quadrature,
 * a_lm = ∫ T Y*_lm dΩ, then Ĉ_ℓ = Σ_m |a_lm|² / (2ℓ+1). Used in the tests.
 */
export function analyze(map: Float32Array, w: SkyWork, lmaxOut: number): Float64Array {
  const { nth, nph, cosm, sinm } = w;
  const L1 = w.lmax + 1;
  const n = lmSize(lmaxOut);
  const are = new Float64Array(n);
  const aim = new Float64Array(n);
  const leg = new Float64Array(n);
  const dth = Math.PI / nth;
  const dph = (2 * Math.PI) / nph;
  for (let i = 0; i < nth; i++) {
    const th = ringTheta(i, nth);
    legendreRow(Math.cos(th), lmaxOut, leg);
    const wgt = Math.sin(th) * dth * dph;
    const row = i * nph;
    for (let m = 0; m <= lmaxOut; m++) {
      let cr = 0;
      let ci = 0;
      for (let j = 0; j < nph; j++) {
        const v = map[row + j];
        cr += v * cosm[j * L1 + m];
        ci -= v * sinm[j * L1 + m];
      }
      for (let l = m; l <= lmaxOut; l++) {
        const k = lmIndex(l, m);
        are[k] += cr * leg[k] * wgt;
        aim[k] += ci * leg[k] * wgt;
      }
    }
  }
  const cl = new Float64Array(lmaxOut + 1);
  for (let l = 0; l <= lmaxOut; l++) {
    let s = are[lmIndex(l, 0)] ** 2;
    for (let m = 1; m <= l; m++) s += 2 * (are[lmIndex(l, m)] ** 2 + aim[lmIndex(l, m)] ** 2);
    cl[l] = s / (2 * l + 1);
  }
  return cl;
}

// ------------------------------------------------------------ sound shell cartoon

export interface ShellTable {
  /** ln a samples. */
  lna: Float64Array;
  /** Sound horizon (shell radius) at each sample, Mpc. */
  rs: Float64Array;
  /** Particle horizon (photon front) at each sample, Mpc. */
  eta: Float64Array;
}

/** Tabulate r_s(a) and η(a) on a log grid between a0 and a1 for the shell animation. */
export function shellTable(p: CMBParams, a0: number, a1: number, n = 400): ShellTable {
  const lna = new Float64Array(n);
  const rs = new Float64Array(n);
  const eta = new Float64Array(n);
  let r = soundHorizon(p, a0);
  let e = horizon(p, a0);
  const l0 = Math.log(a0);
  const dl = (Math.log(a1) - l0) / (n - 1);
  lna[0] = l0;
  rs[0] = r;
  eta[0] = e;
  const fR = (a: number) => (C_KMS * soundSpeed(p.wb, a)) / (a * hubbleA(p, a));
  const fE = (a: number) => C_KMS / (a * hubbleA(p, a));
  for (let i = 1; i < n; i++) {
    const la = l0 + (i - 1) * dl;
    const aL = Math.exp(la);
    const aM = Math.exp(la + dl / 2);
    const aR = Math.exp(la + dl);
    r += (dl / 6) * (fR(aL) + 4 * fR(aM) + fR(aR));
    e += (dl / 6) * (fE(aL) + 4 * fE(aM) + fE(aR));
    lna[i] = la + dl;
    rs[i] = r;
    eta[i] = e;
  }
  return { lna, rs, eta };
}

/** Linear interpolation into a shell table at ln a. */
export function shellAt(t: ShellTable, lna: number, which: 'rs' | 'eta'): number {
  const arr = t[which];
  const n = t.lna.length;
  const u = ((lna - t.lna[0]) / (t.lna[n - 1] - t.lna[0])) * (n - 1);
  if (u <= 0) return arr[0];
  if (u >= n - 1) return arr[n - 1];
  const i = Math.floor(u);
  const f = u - i;
  return arr[i] * (1 - f) + arr[i + 1] * f;
}
