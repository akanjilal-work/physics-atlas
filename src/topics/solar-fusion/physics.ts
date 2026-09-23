// Pure physics for the solar-fusion topic: pp-chain bookkeeping, the Coulomb
// barrier, the Gamow factor and peak, and thermally averaged reaction rates.
// No DOM, no Three.js.

/** Fine-structure constant (CODATA 2018). */
export const ALPHA = 1 / 137.035999084;
/** Boltzmann constant in keV per kelvin. */
export const KB_KEV = 8.617333262e-8;
/** e^2 / (4 pi eps0) in keV fm. */
export const E2_KEV_FM = 1439.964548;
/** Atomic mass unit in MeV. */
export const U_MEV = 931.49410242;
/** Electron mass in MeV. */
export const ME_MEV = 0.51099895;
/** Speed of light in cm/s. */
export const C_CM = 2.99792458e10;
/** Atomic masses in u (AME2020). */
export const MASS_U = {
  H1: 1.00782503223,
  H2: 2.01410177812,
  He3: 3.01602932265,
  He4: 4.00260325413,
  C12: 12,
  N14: 14.00307400443,
};

/** Q value in MeV from atomic masses. Using atomic masses counts electron-positron annihilation automatically. */
export const qFromMasses = (inU: number, outU: number): number => (inU - outU) * U_MEV;

/** Mean and maximum energy of pp neutrinos (MeV). Bahcall's standard spectrum. */
export const PP_NU_MEAN = 0.2668;

export interface ChainStep {
  eq: string;
  /** Total energy released in MeV, including annihilation of any positron. */
  Q: number;
  /** Part carried away by the neutrino (mean), MeV. */
  nu: number;
  /** Times the step runs per helium-4 made. */
  times: number;
}

/** The three reactions of the pp-I branch. */
export function ppIChain(): ChainStep[] {
  const { H1, H2, He3, He4 } = MASS_U;
  return [
    { eq: 'p + p → d + e⁺ + νₑ', Q: qFromMasses(2 * H1, H2), nu: PP_NU_MEAN, times: 2 },
    { eq: 'd + p → ³He + γ', Q: qFromMasses(H2 + H1, He3), nu: 0, times: 2 },
    { eq: '³He + ³He → ⁴He + 2p', Q: qFromMasses(2 * He3, He4 + 2 * H1), nu: 0, times: 1 },
  ];
}

/** Energy released when four hydrogen atoms become one helium-4 atom (MeV). */
export const qFourPToHe = (): number => qFromMasses(4 * MASS_U.H1, MASS_U.He4);

/** Kinetic energy released in p+p → d+e⁺+ν before the positron annihilates (MeV). */
export const qPPKinetic = (): number => qFromMasses(2 * MASS_U.H1, MASS_U.H2) - 2 * ME_MEV;

/** Mean energy of the two CNO-cycle neutrinos (13N and 15O decays), MeV. */
export const CNO_NU_MEAN = 0.7063 + 0.9964;

// ---------------------------------------------------------------------------
// Colliding pairs

export type PairId = 'pp' | 'pC12' | 'pN14';

export interface Pair {
  id: PairId;
  label: string;
  Z1: number;
  Z2: number;
  A1: number;
  A2: number;
  /** Nuclear masses in MeV. */
  m1: number;
  m2: number;
  /** Astrophysical S factor at low energy, keV barn. */
  S0: number;
}

const nuc = (atomicU: number, Z: number) => atomicU * U_MEV - Z * ME_MEV;
const MP = nuc(MASS_U.H1, 1);

export const PAIRS: Record<PairId, Pair> = {
  // S values: Adelberger et al., Rev. Mod. Phys. 83, 195 (2011), "Solar Fusion II".
  pp: { id: 'pp', label: 'p + p', Z1: 1, Z2: 1, A1: 1, A2: 1, m1: MP, m2: MP, S0: 4.01e-22 },
  // 12C(p,γ): NACRE-era value, about 1.3 to 1.5 keV b.
  pC12: { id: 'pC12', label: 'p + ¹²C', Z1: 1, Z2: 6, A1: 1, A2: 12, m1: MP, m2: nuc(MASS_U.C12, 6), S0: 1.4 },
  pN14: { id: 'pN14', label: 'p + ¹⁴N', Z1: 1, Z2: 7, A1: 1, A2: 14, m1: MP, m2: nuc(MASS_U.N14, 7), S0: 1.66 },
};

/** Reduced mass m_r c^2 in keV. */
export const reducedMassKeV = (p: Pair): number => ((p.m1 * p.m2) / (p.m1 + p.m2)) * 1000;

/** Gamow energy E_G = 2 m_r c^2 (pi alpha Z1 Z2)^2, in keV. */
export function gamowEnergy(p: Pair): number {
  const x = Math.PI * ALPHA * p.Z1 * p.Z2;
  return 2 * reducedMassKeV(p) * x * x;
}

/** Nuclear radius parameter in fm used for the touching distance. */
export const R0_FM = 1.3;

/** Distance where the strong force takes over: R = r0 (A1^(1/3) + A2^(1/3)), in fm. */
export const contactRadius = (p: Pair, r0 = R0_FM): number => r0 * (Math.cbrt(p.A1) + Math.cbrt(p.A2));

/** Coulomb potential in keV at separation r (fm). */
export const coulomb = (p: Pair, rFm: number): number => (p.Z1 * p.Z2 * E2_KEV_FM) / rFm;

/** Height of the Coulomb barrier at the touching distance, keV. */
export const barrierHeight = (p: Pair, r0 = R0_FM): number => coulomb(p, contactRadius(p, r0));

/** Classical turning point (fm) for relative energy E (keV). */
export const turningPoint = (p: Pair, EkeV: number): number => (p.Z1 * p.Z2 * E2_KEV_FM) / EkeV;

/** Thermal energy kT in keV at temperature T (kelvin). */
export const kTkeV = (TK: number): number => KB_KEV * TK;

/** Gamow tunneling factor P = exp(-sqrt(E_G / E)). */
export const tunnelFactor = (E: number, EG: number): number => Math.exp(-Math.sqrt(EG / E));

/** Maxwell-Boltzmann tail factor exp(-E/kT). */
export const mbFactor = (E: number, kT: number): number => Math.exp(-E / kT);

/** The Gamow-peak integrand exp(-E/kT - sqrt(E_G/E)). */
export const gamowIntegrand = (E: number, kT: number, EG: number): number => Math.exp(-E / kT - Math.sqrt(EG / E));

/** Location of the Gamow peak E0 = (E_G (kT)^2 / 4)^(1/3). */
export const gamowPeak = (EG: number, kT: number): number => Math.cbrt((EG * kT * kT) / 4);

/** 1/e full width of the Gaussian approximation to the Gamow peak, 4 sqrt(E0 kT / 3). */
export const gamowWidth = (EG: number, kT: number): number => 4 * Math.sqrt((gamowPeak(EG, kT) * kT) / 3);

/** Maximum of the integrand found numerically by golden-section search (for tests). */
export function gamowPeakNumeric(EG: number, kT: number): number {
  let a = kT * 1e-3;
  let b = kT * 200;
  const g = (Math.sqrt(5) - 1) / 2;
  const f = (E: number) => -E / kT - Math.sqrt(EG / E);
  let c = b - g * (b - a);
  let d = a + g * (b - a);
  for (let i = 0; i < 200; i++) {
    if (f(c) > f(d)) b = d;
    else a = c;
    c = b - g * (b - a);
    d = a + g * (b - a);
  }
  return (a + b) / 2;
}

/**
 * WKB exponent 2∫κ dr from the nuclear radius R out to the turning point, for a pure Coulomb
 * barrier cut off at R. Tends to sqrt(E_G/E) when R is much smaller than the turning point.
 */
export function wkbExponent(p: Pair, EkeV: number, r0 = R0_FM): number {
  const x = Math.min(1, contactRadius(p, r0) / turningPoint(p, EkeV));
  const shape = (2 / Math.PI) * (Math.acos(Math.sqrt(x)) - Math.sqrt(x * (1 - x)));
  return Math.sqrt(gamowEnergy(p) / EkeV) * shape;
}

/** Numerical WKB exponent by direct quadrature (for tests). */
export function wkbExponentNumeric(p: Pair, EkeV: number, r0 = R0_FM, n = 20000): number {
  const R = contactRadius(p, r0);
  const rt = turningPoint(p, EkeV);
  if (rt <= R) return 0;
  const mr = reducedMassKeV(p);
  const HBARC = 197326.9804; // keV fm
  // substitute r = R + (rt - R) sin^2(u) to tame the endpoint
  let s = 0;
  for (let i = 0; i < n; i++) {
    const u = ((i + 0.5) / n) * (Math.PI / 2);
    const r = R + (rt - R) * Math.sin(u) ** 2;
    const dr = (rt - R) * 2 * Math.sin(u) * Math.cos(u) * (Math.PI / 2 / n);
    const V = coulomb(p, r);
    s += (Math.sqrt(2 * mr * Math.max(0, V - EkeV)) / HBARC) * dr;
  }
  return 2 * s;
}

/** ∫ exp(-E/kT - sqrt(E_G/E)) dE in keV, by Simpson's rule around the peak. */
export function gamowIntegral(EG: number, kT: number, n = 400): number {
  const E0 = gamowPeak(EG, kT);
  const w = gamowWidth(EG, kT);
  const a = Math.max(E0 * 1e-3, E0 - 4 * w);
  const b = E0 + 8 * w;
  const h = (b - a) / n;
  let s = gamowIntegrand(a, kT, EG) + gamowIntegrand(b, kT, EG);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * gamowIntegrand(a + i * h, kT, EG);
  return (s * h) / 3;
}

/**
 * Thermally averaged cross section times speed, <σv> in cm^3/s, for a constant S factor:
 * <σv> = sqrt(8 / (π μ)) (kT)^(-3/2) S ∫ exp(-E/kT - sqrt(E_G/E)) dE.
 * No electron screening.
 */
export function sigmaV(p: Pair, TK: number): number {
  const kT = kTkeV(TK);
  const EG = gamowEnergy(p);
  const mr = reducedMassKeV(p);
  const pref = C_CM * Math.sqrt(8 / (Math.PI * mr)) * Math.pow(kT, -1.5);
  return pref * p.S0 * 1e-24 * gamowIntegral(EG, kT);
}

/** Solar-core composition used for the rate comparison. */
export const CORE = {
  /** Central density, g/cm^3 (standard solar model, about 150). */
  rho: 150,
  /** Hydrogen mass fraction at the centre today (about 0.34). */
  X: 0.34,
  /** Nitrogen-14 mass fraction (assumed). In the core, CN cycling has turned most carbon into nitrogen. */
  XN14: 0.005,
};

const M_U_G = 1.66053906660e-24;
const MEV_ERG = 1.602176634e-6;
const YEAR_S = 3.15576e7;

export const numberDensity = (massFrac: number, A: number, rho = CORE.rho): number => (rho * massFrac) / (A * M_U_G);

/** Mean time for one proton to fuse with another at the given temperature, in years. */
export function protonLifetimeYears(TK: number): number {
  const np = numberDensity(CORE.X, MASS_U.H1);
  return 1 / (np * sigmaV(PAIRS.pp, TK)) / YEAR_S;
}

/**
 * Heating rates in erg/g/s for the pp chain (each p+p reaction leads to half a helium-4)
 * and the CNO cycle (rate set by the slowest step, 14N + p).
 */
export function heatingRates(TK: number): { pp: number; cno: number } {
  const np = numberDensity(CORE.X, MASS_U.H1);
  const nN = numberDensity(CORE.XN14, MASS_U.N14);
  const qpp = qFourPToHe() - 2 * PP_NU_MEAN;
  const qcno = qFourPToHe() - CNO_NU_MEAN;
  const rpp = 0.5 * np * np * sigmaV(PAIRS.pp, TK);
  const rcno = np * nN * sigmaV(PAIRS.pN14, TK);
  return { pp: (rpp * (qpp / 2) * MEV_ERG) / CORE.rho, cno: (rcno * qcno * MEV_ERG) / CORE.rho };
}

/** Local power-law index d ln ε / d ln T for each process. */
export function tempExponents(TK: number): { pp: number; cno: number } {
  const h = 0.01;
  const a = heatingRates(TK * (1 - h));
  const b = heatingRates(TK * (1 + h));
  const d = Math.log((1 + h) / (1 - h));
  return { pp: Math.log(b.pp / a.pp) / d, cno: Math.log(b.cno / a.cno) / d };
}

/** Analytic steepness from the Gamow peak: ν ≈ τ/3 - 2/3, with τ = 3 E0 / kT. */
export const gamowSteepness = (EG: number, kT: number): number => gamowPeak(EG, kT) / kT - 2 / 3;

/** Solar neutrino flux at 1 AU (cm^-2 s^-1) implied by a luminosity in watts. */
export function neutrinoFlux(Lw = 3.828e26, AUcm = 1.495978707e13): number {
  const heatPerHe = (qFourPToHe() - 2 * PP_NU_MEAN) * MEV_ERG * 1e-7; // J
  const nuPerS = (2 * Lw) / heatPerHe;
  return nuPerS / (4 * Math.PI * AUcm * AUcm);
}
