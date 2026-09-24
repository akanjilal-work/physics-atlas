// Pure physics for direct dark matter searches: WIMP-nucleus kinematics,
// the Standard Halo Model rate, annual modulation, a toy xenon TPC background
// model and an axion haloscope resonance. No DOM, no Three.js.

/** Speed of light (km/s). */
export const C_KMS = 299792.458;
/** Atomic mass unit (GeV). */
export const AMU_GEV = 0.9314941;
/** Proton mass (GeV), used for the WIMP-nucleon reduced mass. */
export const M_P = 0.938272;
/** hbar c (GeV fm). */
export const HBARC_GEV_FM = 0.1973270;
/** Planck constant (eV s). */
export const H_EVS = 4.135667696e-15;
/** 1 GeV/c^2 in kg. */
export const GEV_KG = 1.78266192e-27;
export const SEC_PER_YEAR = 3.15576e7;
export const DAYS_PER_YEAR = 365.25;

/** Standard Halo Model numbers used throughout (Lewin and Smith 1996 conventions). */
export const SHM = {
  v0: 220, // km/s, most probable speed of the Maxwellian
  vesc: 544, // km/s, galactic escape speed cut
  vSun: 232, // km/s, Sun's speed through the halo (220 rotation + 12 peculiar)
  vOrb: 29.8, // km/s, Earth's orbital speed
  cosGamma: 0.49, // projection of the orbit onto the Sun's direction of motion
  tPeak: 152.5, // day of year of the peak (about June 2)
  rho0: 0.3, // GeV/cm^3, local dark matter density
};

/** Xenon target. */
export const XE_A = 131;
export const mNucleus = (A: number) => A * AMU_GEV;
export const reducedMass = (a: number, b: number) => (a * b) / (a + b);

// ------------------------------------------------------------------ kinematics

/**
 * Nuclear recoil energy in keV for an elastic WIMP-nucleus collision.
 * E_R = mu^2 v^2 (1 - cos theta) / m_N, theta the centre-of-mass scattering angle.
 */
export function recoilEnergyKeV(mChi: number, mN: number, vKms: number, cosTheta: number): number {
  const mu = reducedMass(mChi, mN);
  const b = vKms / C_KMS;
  return ((mu * mu * b * b * (1 - cosTheta)) / mN) * 1e6;
}

/** Head-on collision (theta = pi): E_max = 2 mu^2 v^2 / m_N, in keV. */
export const maxRecoilKeV = (mChi: number, mN: number, vKms: number) => recoilEnergyKeV(mChi, mN, vKms, -1);

/** Fraction of the WIMP's kinetic energy handed over in a head-on hit: 4 m M / (m + M)^2. */
export const transferFraction = (mChi: number, mN: number) => (4 * mChi * mN) / ((mChi + mN) * (mChi + mN));

/** Smallest WIMP speed (km/s) that can give recoil energy E (keV). */
export function vMin(EkeV: number, mChi: number, mN: number): number {
  const mu = reducedMass(mChi, mN);
  return Math.sqrt((mN * EkeV * 1e-6) / (2 * mu * mu)) * C_KMS;
}

// ------------------------------------------------------------------ halo and Earth

/** Earth's speed through the halo (km/s) on a given day of the year. */
export function earthSpeed(day: number): number {
  return SHM.vSun + SHM.vOrb * SHM.cosGamma * Math.cos((2 * Math.PI * (day - SHM.tPeak)) / DAYS_PER_YEAR);
}

/** Error function, Abramowitz and Stegun 7.1.26 refined by one series/continued-fraction switch. */
export function erf(x: number): number {
  const s = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  if (a < 2.5) {
    // Maclaurin series, converges fast here.
    let term = a;
    let sum = a;
    const a2 = a * a;
    for (let n = 1; n < 80; n++) {
      term *= -a2 / n;
      const add = term / (2 * n + 1);
      sum += add;
      if (Math.abs(add) < 1e-17 * Math.abs(sum)) break;
    }
    return (s * 2 * sum) / Math.sqrt(Math.PI);
  }
  // Continued fraction for erfc.
  let f = 0;
  for (let n = 60; n >= 1; n--) f = n / 2 / (a + f);
  const erfc = Math.exp(-a * a) / Math.sqrt(Math.PI) / (a + f);
  return s * (1 - erfc);
}

export interface Halo { v0: number; vesc: number; vE: number }

/**
 * Mean inverse speed eta(v_min) = integral of f(v)/v over v > v_min, in s/km,
 * for a Maxwellian truncated at v_esc and boosted by the Earth's speed.
 * Closed form from Savage, Freese and Gondolo (2006).
 */
export function eta(vmin: number, h: Halo): number {
  const { v0, vesc, vE } = h;
  const x = vmin / v0;
  const z = vesc / v0;
  const SQPI = Math.sqrt(Math.PI);
  if (vE < 1e-6) {
    // Earth at rest in the halo frame.
    const Nesc = erf(z) - (2 * z * Math.exp(-z * z)) / SQPI;
    if (x >= z) return 0;
    return ((2 / (SQPI * v0)) * (Math.exp(-x * x) - Math.exp(-z * z))) / Nesc;
  }
  const y = vE / v0;
  const Nesc = erf(z) - (2 * z * Math.exp(-z * z)) / SQPI;
  const ez = Math.exp(-z * z);
  const pre = 1 / (2 * Nesc * v0 * y);
  if (x < Math.abs(z - y)) {
    if (z > y) return pre * (erf(x + y) - erf(x - y) - (4 / SQPI) * y * ez);
    return 1 / (v0 * y);
  }
  if (x < y + z) return pre * (erf(z) - erf(x - y) - (2 / SQPI) * (z + y - x) * ez);
  return 0;
}

/** Helm nuclear form factor squared (Lewin and Smith parameters). */
export function helmF2(EkeV: number, A: number): number {
  if (EkeV <= 0) return 1;
  const mN = mNucleus(A);
  const q = Math.sqrt(2 * mN * EkeV * 1e-6) / HBARC_GEV_FM; // fm^-1
  const s = 0.9;
  const a = 0.52;
  const c = 1.23 * Math.cbrt(A) - 0.6;
  const rn = Math.sqrt(c * c + (7 / 3) * Math.PI * Math.PI * a * a - 5 * s * s);
  const qr = q * rn;
  if (qr < 1e-4) return Math.exp(-q * q * s * s);
  const j1 = Math.sin(qr) / (qr * qr) - Math.cos(qr) / qr;
  const F = ((3 * j1) / qr) * Math.exp(-(q * q * s * s) / 2);
  return F * F;
}

export interface RateParams {
  mChi: number; // GeV
  sigma: number; // WIMP-nucleon SI cross-section, cm^2
  A: number;
  halo: Halo;
  rho0?: number; // GeV/cm^3
  formFactor?: boolean;
}

/**
 * Differential spin-independent rate in events per tonne per year per keV:
 * dR/dE = rho0 sigma_n A^2 F^2(E) eta(v_min) / (2 m_chi mu_n^2).
 */
export function dRdE(EkeV: number, p: RateParams): number {
  const mN = mNucleus(p.A);
  const vm = vMin(EkeV, p.mChi, mN);
  const et = eta(vm, p.halo); // s/km
  if (et <= 0) return 0;
  const muN = reducedMass(p.mChi, M_P);
  const rho = p.rho0 ?? SHM.rho0;
  const F2 = p.formFactor === false ? 1 : helmF2(EkeV, p.A);
  const nChi = rho / p.mChi; // cm^-3
  const etaCm = et / 1e5; // s/cm
  const cCm = C_KMS * 1e5;
  // (cm^-3)(cm^2)(s/cm)(cm/s)^2 / GeV^2 -> per second, per GeV of target, per GeV of recoil
  const perGeVperGeVperS = (nChi * p.sigma * p.A * p.A * F2 * etaCm * cCm * cCm) / (2 * muN * muN);
  return perGeVperGeVperS * (1000 / GEV_KG) * 1e-6 * SEC_PER_YEAR; // per tonne, per keV, per year
}

/** Integrated rate (events / tonne / year) between two recoil energies, Simpson's rule. */
export function rateBetween(Elo: number, Ehi: number, p: RateParams, n = 200): number {
  const N = n % 2 ? n + 1 : n;
  const h = (Ehi - Elo) / N;
  let s = dRdE(Elo, p) + dRdE(Ehi, p);
  for (let i = 1; i < N; i++) s += (i % 2 ? 4 : 2) * dRdE(Elo + i * h, p);
  return (s * h) / 3;
}

/** Lewin and Smith total rate R0 (Earth at rest, no escape cut, F = 1), events / tonne / year. */
export function lewinSmithR0(mChi: number, sigma: number, A: number, v0 = SHM.v0, rho0 = SHM.rho0): number {
  const mN = mNucleus(A);
  const muN = reducedMass(mChi, M_P);
  const muA = reducedMass(mChi, mN);
  const sigmaA = sigma * A * A * (muA / muN) ** 2; // cm^2
  const nChi = rho0 / mChi;
  const perNucleusPerS = (2 / Math.sqrt(Math.PI)) * nChi * sigmaA * v0 * 1e5;
  return perNucleusPerS * (1000 / (mN * GEV_KG)) * SEC_PER_YEAR;
}

/** E0 r: the e-folding energy (keV) of the recoil spectrum for Earth at rest. */
export function spectrumScaleKeV(mChi: number, A: number, v0 = SHM.v0): number {
  const mN = mNucleus(A);
  const b = v0 / C_KMS;
  return 0.5 * mChi * b * b * transferFraction(mChi, mN) * 1e6;
}

/** Search window used on this page (nuclear-recoil keV). */
export const ROI = { lo: 5, hi: 50 };

/** Modulation amplitude (R_max - R_min)/(R_max + R_min) of the ROI rate over a year. */
export function modulationAmplitude(mChi: number, A = XE_A, lo = ROI.lo, hi = ROI.hi): number {
  const base = { mChi, sigma: 1e-46, A };
  const rMax = rateBetween(lo, hi, { ...base, halo: { v0: SHM.v0, vesc: SHM.vesc, vE: earthSpeed(SHM.tPeak) } });
  const rMin = rateBetween(lo, hi, { ...base, halo: { v0: SHM.v0, vesc: SHM.vesc, vE: earthSpeed(SHM.tPeak + DAYS_PER_YEAR / 2) } });
  return (rMax - rMin) / (rMax + rMin);
}

/**
 * Illustrative 90% CL upper limit: with zero events seen and no background,
 * a model predicting more than 2.3 events is excluded. sigma_lim = 2.3 sigma_ref / N(sigma_ref).
 */
export function toyLimit(mChi: number, exposureTY: number, A = XE_A): number {
  const ref = 1e-46;
  const r = rateBetween(ROI.lo, ROI.hi, { mChi, sigma: ref, A, halo: { v0: SHM.v0, vesc: SHM.vesc, vE: SHM.vSun } }, 80);
  const n = r * exposureTY;
  return n > 0 ? (2.3 * ref) / n : Infinity;
}

/**
 * Schematic neutrino fog for xenon: 8B solar neutrinos near 6 GeV,
 * atmospheric and supernova neutrinos above about 20 GeV. Shape only.
 */
export function fogSigma(mChi: number): number {
  const atm = 1.2e-49 * Math.pow(mChi / 30, 1) + 1.5e-49 * Math.pow(30 / mChi, 3);
  const b8 = 4e-45 * Math.exp(-(mChi - 6) / 1.4);
  return atm + (mChi < 6 ? 4e-45 * Math.pow(6 / mChi, 12) : b8);
}

// ------------------------------------------------------------------ toy TPC

/** Dimensions of the toy xenon TPC (roughly LZ-sized). */
export const TPC = {
  R: 72.8, // cm
  H: 145.6, // cm
  rho: 2.9, // g/cm^3 liquid xenon
  lambda: 3, // cm, attenuation of wall background (toy)
  bWall: 100, // wall-background density at the wall, events / tonne / year (after ER rejection, in ROI)
  bUniform: 0.1, // uniform internal background, events / tonne / year
};

/** Mass (tonnes) inside a fiducial cut of depth d (cm) from every wall. */
export function fiducialMass(d: number): number {
  const r = Math.max(0, TPC.R - d);
  const h = Math.max(0, TPC.H - 2 * d);
  return (TPC.rho * Math.PI * r * r * h) / 1e6;
}

export const activeMass = () => fiducialMass(0);

/** Distance (cm) from the nearest wall for a point at radius r and height z (z from bottom). */
export const wallDistance = (r: number, z: number) => Math.min(TPC.R - r, z, TPC.H - z);

/**
 * Expected wall background inside the fiducial volume, events per tonne-year
 * of *active* running (i.e. per year, scaled by 1 / active mass).
 * Integrates bWall exp(-dist/lambda) over the fiducial volume.
 */
export function wallBackgroundPerYear(d: number, nr = 120, nz = 240): number {
  const r1 = Math.max(0, TPC.R - d);
  const z0 = d;
  const z1 = TPC.H - d;
  if (r1 <= 0 || z1 <= z0) return 0;
  let sum = 0;
  const dr = r1 / nr;
  const dz = (z1 - z0) / nz;
  for (let i = 0; i < nr; i++) {
    const r = (i + 0.5) * dr;
    for (let j = 0; j < nz; j++) {
      const z = z0 + (j + 0.5) * dz;
      sum += Math.exp(-wallDistance(r, z) / TPC.lambda) * 2 * Math.PI * r;
    }
  }
  const tonnesWeighted = (sum * dr * dz * TPC.rho) / 1e6;
  return TPC.bWall * tonnesWeighted;
}

export interface Budget {
  mFid: number;
  years: number;
  exposureFid: number;
  signal: number;
  bgWall: number;
  bgUniform: number;
}

/** Signal and background for an active-mass exposure and a fiducial cut depth. */
export function budget(exposureActive: number, d: number, ratePerTY: number): Budget {
  const years = exposureActive / activeMass();
  const mFid = fiducialMass(d);
  return {
    mFid,
    years,
    exposureFid: mFid * years,
    signal: ratePerTY * mFid * years,
    bgWall: wallBackgroundPerYear(d) * years,
    bgUniform: TPC.bUniform * mFid * years,
  };
}

/**
 * Sample a background event depth: distance from the wall is exponential
 * with scale lambda. Returns cm, given a uniform random u in (0,1).
 */
export const sampleWallDepth = (u: number) => -TPC.lambda * Math.log(1 - u);

// ------------------------------------------------------------------ axion haloscope

/** Photon frequency (MHz) matching axion mass m (micro-eV): f = m c^2 / h. */
export const axionFreqMHz = (m_ueV: number) => (m_ueV * 1e-6) / H_EVS / 1e6;
export const axionMassUeV = (fMHz: number) => fMHz * 1e6 * H_EVS * 1e6;

/** Cavity power response: Lorentzian of loaded quality factor Q centred on the cavity frequency. */
export function cavityResponse(fCavity: number, fAxion: number, Q: number): number {
  const x = (2 * Q * (fAxion - fCavity)) / fCavity;
  return 1 / (1 + x * x);
}

/** Scan window used in the toy haloscope (MHz). */
export const SCAN = { fLo: 640, fHi: 1000, bin: 0.5, Qvis: 400, snrK: 16 };

// ------------------------------------------------------------------ random numbers

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gauss(rng: () => number): number {
  const u = Math.max(1e-12, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Day of year (1 = Jan 1) to a short date string. */
export function dateLabel(day: number): string {
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const L = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let d = Math.floor(((day - 1) % 365 + 365) % 365);
  for (let i = 0; i < 12; i++) {
    if (d < L[i]) return `${d + 1} ${M[i]}`;
    d -= L[i];
  }
  return '31 Dec';
}
