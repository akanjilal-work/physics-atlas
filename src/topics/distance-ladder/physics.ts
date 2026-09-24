// The cosmic distance ladder: pure functions, no DOM.
//
// Units: distances in parsecs unless named otherwise, magnitudes in mag,
// velocities in km/s, H0 in km/s/Mpc, times in days or seconds as named.

/** Speed of light, m/s (exact). */
export const C_MS = 299_792_458;
/** Speed of light, km/s. */
export const C_KMS = C_MS / 1000;
/** Astronomical unit, m (exact, IAU 2012). */
export const AU_M = 149_597_870_700;
/** Parsec in AU: the distance at which 1 AU subtends 1 arcsecond, 648000/π. */
export const PC_AU = 648_000 / Math.PI;
/** Parsec in metres. */
export const PC_M = PC_AU * AU_M;
/** Venus semi-major axis in AU. */
export const A_VENUS = 0.723_332;

// ------------------------------------------------------------ rung 1: radar
/** Round-trip radar echo time (s) to a planet at inferior conjunction, circular orbits. */
export function radarEchoTime(aPlanetAU: number, auM = AU_M): number {
  return (2 * (1 - aPlanetAU) * auM) / C_MS;
}

/**
 * Invert the echo: Kepler's third law fixes the orbit sizes in AU, radar fixes
 * one distance in metres, and together they give the AU in metres.
 */
export function auFromEcho(echoSeconds: number, aPlanetAU: number): number {
  return (C_MS * echoSeconds) / (2 * (1 - aPlanetAU));
}

// ------------------------------------------------------------ rung 2: parallax
/** d [pc] = 1 / p [arcsec]. */
export function parallaxDistancePc(pArcsec: number): number {
  return 1 / pArcsec;
}

/** Parallax in arcseconds for a distance in parsecs (small-angle). */
export function parallaxArcsec(dPc: number): number {
  return 1 / dPc;
}

/** Exact parallax angle (radians) for a 1 AU baseline at distance d (pc), no small-angle approximation. */
export function parallaxExactRad(dPc: number): number {
  return Math.atan(1 / (dPc * PC_AU));
}

/** First-order fractional distance error from a parallax error: σ_d/d ≈ σ_p/p. */
export function parallaxFracError(pMas: number, sigmaMas: number): number {
  return sigmaMas / pMas;
}

/** Gaia (E)DR3 parallax precision for bright stars, G < 15 (Lindegren et al. 2021): 0.02 to 0.03 mas. */
export const GAIA_SIGMA_BRIGHT_MAS = 0.025;

// ------------------------------------------------------------ distance modulus
/** μ = m − M = 5 log10(d / 10 pc). */
export function distanceModulus(dPc: number): number {
  return 5 * Math.log10(dPc / 10);
}

/** Inverse: d = 10^(μ/5 + 1) pc. */
export function distanceFromModulus(mu: number): number {
  return Math.pow(10, mu / 5 + 1);
}

/** Factor by which a distance changes when its modulus changes by dm magnitudes: 10^(0.2 dm). */
export function distanceFactor(dm: number): number {
  return Math.pow(10, 0.2 * dm);
}

// ------------------------------------------------------------ rung 3: Cepheids
/**
 * Galactic V-band Leavitt law from HST FGS parallaxes of 10 Cepheids
 * (Benedict et al. 2007, AJ 133, 1810): M_V = −2.43 (log P − 1) − 4.05.
 */
export const PL_SLOPE = -2.43;
export const PL_ZERO = -4.05;
export function leavittMV(periodDays: number): number {
  return PL_SLOPE * (Math.log10(periodDays) - 1) + PL_ZERO;
}

/**
 * Schematic Cepheid light curve: magnitude offset from the mean at phase φ ∈ [0,1).
 * Phase 0 is maximum light. Fast rise (15% of the cycle), slow decline, the classic
 * saw-tooth shape. Peak-to-peak amplitude `amp` mag, normalised to zero mean.
 */
export function cepheidDeltaMag(phase: number, amp = 0.8): number {
  let f = phase - Math.floor(phase);
  const rise = 0.15;
  // brightness shape b in [0,1], 1 at maximum
  let b: number;
  if (f < 1 - rise) {
    const u = f / (1 - rise);
    b = 1 - u; // linear-ish decline, softened below
    b = 0.5 * (b + b * b);
  } else {
    const u = (f - (1 - rise)) / rise;
    b = 0.5 - 0.5 * Math.cos(Math.PI * u);
  }
  f = b;
  // mean of 0.5*(x + x²) over the decline part and of the cosine ramp, used to centre
  const mean = (1 - rise) * (0.5 * (0.5 + 1 / 3)) + rise * 0.5;
  return -amp * (f - mean);
}

// ------------------------------------------------------------ rung 4: SNe Ia
/** Peak absolute magnitude of a standardised type Ia supernova (B band, approx.). */
export const M_SN_IA = -19.3;

/**
 * Schematic SN Ia light curve: flux relative to peak, t in days from peak.
 * Rises over about 18 days, then declines by about 1.2 mag in 15 days.
 */
export function snFlux(tDays: number): number {
  if (tDays < -19) return 0;
  if (tDays < 0) {
    const u = (tDays + 19) / 19;
    return u * u * (3 - 2 * u);
  }
  return 0.75 * Math.exp(-((tDays / 12) ** 2)) + 0.25 * Math.exp(-tDays / 40);
}

// ------------------------------------------------------------ rung 5: Hubble flow
/**
 * Error propagation up the ladder. A zero-point error δ in the Cepheid absolute
 * magnitude (M_used = M_true + δ) shrinks every Cepheid distance by 10^(−0.2δ).
 * The SN Ia calibration inherits it (M_SN,used = M_SN,true + δ), so every
 * Hubble-flow distance shrinks by the same factor and H0 = v/d grows by 10^(0.2δ).
 */
export function h0WithOffset(h0True: number, offsetMag: number): number {
  return h0True * distanceFactor(offsetMag);
}

/** The offset (mag) that would move h0From to h0To. */
export function offsetForH0(h0From: number, h0To: number): number {
  return 5 * Math.log10(h0To / h0From);
}

/** Least-squares slope of v = H d through the origin. d in Mpc, v in km/s. */
export function fitH0(dMpc: ArrayLike<number>, vKms: ArrayLike<number>): number {
  let sdv = 0;
  let sdd = 0;
  for (let i = 0; i < dMpc.length; i++) {
    sdv += dMpc[i] * vKms[i];
    sdd += dMpc[i] * dMpc[i];
  }
  return sdv / sdd;
}

/** Tension between two Gaussian measurements, in σ. */
export function tensionSigma(a: number, sa: number, b: number, sb: number): number {
  return Math.abs(a - b) / Math.hypot(sa, sb);
}

/** Deterministic PRNG (mulberry32) so the simulated data are reproducible. */
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

/** Standard normal from a uniform generator (Box–Muller). */
export function gauss(r: () => number): number {
  const u = Math.max(1e-12, r());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

export interface HubbleSN {
  /** True distance, Mpc. */
  dTrue: number;
  /** Observed recession velocity, km/s (includes peculiar velocity). */
  v: number;
  /** Observed peak apparent magnitude (includes intrinsic scatter). */
  m: number;
}

/** A simulated Hubble-flow SN Ia sample with ~0.12 mag scatter and 250 km/s peculiar velocities. */
export function simulateHubbleSNe(h0True: number, n = 36, seed = 7): HubbleSN[] {
  const r = rng(seed);
  const out: HubbleSN[] = [];
  for (let i = 0; i < n; i++) {
    const dTrue = 40 + 560 * Math.pow(r(), 0.7);
    const v = h0True * dTrue + 250 * gauss(r);
    const m = M_SN_IA + distanceModulus(dTrue * 1e6) + 0.12 * gauss(r);
    out.push({ dTrue, v, m });
  }
  return out;
}

/** Published H0 values (km/s/Mpc). */
export const H0_SHOES = { value: 73.04, sigma: 1.04, label: 'SH0ES Cepheid + SN Ia (Riess et al. 2022)' };
export const H0_PLANCK = { value: 67.36, sigma: 0.54, label: 'Planck 2018 CMB + ΛCDM' };
/** CCHP HST+JWST TRGB: 70.39 ± 1.22 (stat) ± 1.33 (sys) ± 0.70 (SN), combined in quadrature. */
export const H0_TRGB = { value: 70.39, sigma: Math.hypot(1.22, 1.33, 0.7), label: 'CCHP TRGB + SN Ia, HST + JWST (Freedman et al. 2025)' };
