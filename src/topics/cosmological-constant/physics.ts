// Vacuum energy of free quantum fields with a momentum cutoff, compared with
// the measured dark-energy density. Pure functions, no DOM.
//
// Units: energies in eV, lengths in metres, energy densities in J/m^3.
// Natural-unit formulas (hbar = c = 1) are converted with hbar*c in eV*m.

export const HBAR = 1.054571817e-34; // J s (CODATA 2018, exact from h)
export const C = 299792458; // m/s (exact)
export const G = 6.6743e-11; // m^3 kg^-1 s^-2 (CODATA 2018)
export const EV = 1.602176634e-19; // J (exact)
export const MPC = 3.0856775814913673e22; // m
export const HBARC = (HBAR * C) / EV; // eV m, about 1.97327e-7

/** Planck energy sqrt(hbar c^5 / G), in eV. About 1.22e28 eV = 1.22e19 GeV. */
export const E_PLANCK = Math.sqrt((HBAR * C ** 5) / G) / EV;
/** Reduced Planck energy sqrt(hbar c^5 / 8 pi G), in eV. About 2.44e27 eV. */
export const E_PLANCK_RED = E_PLANCK / Math.sqrt(8 * Math.PI);
/** Planck energy density c^7 / (hbar G^2), in J/m^3. */
export const RHO_PLANCK = C ** 7 / (HBAR * G * G);

/** Convert an energy density given in eV^4 (natural units) to J/m^3. */
export const eV4ToJm3 = (x: number) => (x / HBARC ** 3) * EV;
/** Convert J/m^3 to eV^4. */
export const Jm3ToEV4 = (x: number) => (x / EV) * HBARC ** 3;

/**
 * Zero-point energy density of ONE massless real scalar degree of freedom,
 * with modes summed up to |k| = kmax = Ecut / (hbar c):
 *   rho = int d^3k/(2pi)^3 * hbar c k / 2 = hbar c kmax^4 / (16 pi^2)
 * Returned in J/m^3.
 */
export function rhoCutoff(ecutEV: number): number {
  return eV4ToJm3(ecutEV ** 4 / (16 * Math.PI * Math.PI));
}

/** Cutoff wavenumber in 1/m for a cutoff energy in eV. */
export const kOfE = (eEV: number) => eEV / HBARC;

/** Number of field modes per cubic metre with |k| below kmax: kmax^3 / (6 pi^2). */
export function modesPerM3(ecutEV: number): number {
  const k = kOfE(ecutEV);
  return (k * k * k) / (6 * Math.PI * Math.PI);
}

/** Critical density times c^2, in J/m^3, for a Hubble constant in km/s/Mpc. */
export function rhoCritical(h0: number): number {
  const H = (h0 * 1e3) / MPC;
  return ((3 * H * H) / (8 * Math.PI * G)) * C * C;
}

/** Dark-energy density Omega_L * rho_crit c^2, in J/m^3. */
export function rhoLambda(omegaL: number, h0: number): number {
  return omegaL * rhoCritical(h0);
}

/** Planck 2018 (TT,TE,EE+lowE+lensing): Omega_L = 0.6847, H0 = 67.36 km/s/Mpc. */
export const OMEGA_L = 0.6847;
export const H0 = 67.36;
export const RHO_OBS = rhoLambda(OMEGA_L, H0);

/** The energy scale E with rho = E^4 in natural units, in eV. */
export function energyScale(rhoJm3: number): number {
  return Math.pow(Jm3ToEV4(rhoJm3), 0.25);
}

/** Cutoff for one scalar degree of freedom whose zero-point sum equals rho. */
export function matchingCutoff(rhoJm3: number): number {
  return Math.pow(16 * Math.PI * Math.PI, 0.25) * energyScale(rhoJm3);
}

/**
 * Stable remainder J(L, m) = I(L, m) - L^4/4 - m^2 L^2/4, where
 *   I(L, m) = int_0^L k^2 sqrt(k^2 + m^2) dk
 *           = L (2L^2 + m^2) s / 8 - (m^4/8) asinh(L/m),   s = sqrt(L^2 + m^2).
 * The polynomial part is subtracted analytically to avoid cancellation.
 */
export function remainderJ(L: number, m: number): number {
  if (m <= 0) return 0;
  const s = Math.sqrt(L * L + m * m);
  const m4 = m ** 4;
  const poly = (L * s * m4) / (2 * L * L + m * m + 2 * L * s) / 8;
  return poly - (m4 / 8) * Math.asinh(L / m);
}

/** Exact I(L, m) in eV^4 (natural units). */
export function integralI(L: number, m: number): number {
  return (L ** 4) / 4 + (m * m * L * L) / 4 + remainderJ(L, m);
}

/** Zero-point energy density of one real dof of mass m with cutoff L, in J/m^3. */
export function rhoMassive(L: number, m: number): number {
  return eV4ToJm3(integralI(L, m) / (4 * Math.PI * Math.PI));
}

/**
 * A chiral multiplet with F-term supersymmetry breaking at scale M:
 * two real scalars with m^2 = 2M^2 and 0, one Weyl fermion (2 dof) with m^2 = M^2.
 * Degrees of freedom match (2 = 2) and the supertrace of M^2 vanishes,
 * so the L^4 and L^2 pieces cancel exactly. Returns the signed residue
 * (bosons minus fermions) per boson-fermion pair, in eV^4.
 */
export function susyResidueEV4(L: number, M: number): number {
  if (M <= 0) return 0;
  const sum = remainderJ(L, Math.SQRT2 * M) + remainderJ(L, 0) - 2 * remainderJ(L, M);
  return sum / (4 * Math.PI * Math.PI) / 2;
}

/** Large-L asymptote of the pair residue: (M^4/16 - (M^4/4) ln(L/M)) / (8 pi^2). */
export function susyResidueAsymptoticEV4(L: number, M: number): number {
  return (M ** 4 / 16 - (M ** 4 / 4) * Math.log(L / M)) / (4 * Math.PI * Math.PI) / 2;
}

/**
 * Vacuum energy magnitude of the model shown in the scene, in J/m^3.
 * Without cancellation: one massless bosonic dof, rho = kmax^4 / 16 pi^2.
 * With cancellation: if the cutoff is below the breaking scale the partners are
 * too heavy to take part and nothing cancels. Above it, the residue is the
 * magnitude of the supersymmetric pair sum.
 */
export function rhoModel(ecutEV: number, cancel: boolean, msusyEV: number): number {
  if (!cancel || ecutEV <= msusyEV) return rhoCutoff(ecutEV);
  return eV4ToJm3(Math.abs(susyResidueEV4(ecutEV, msusyEV)));
}

/**
 * Brute-force mode counter: standing waves in a cube of side L have
 * k = (pi/L)(nx, ny, nz) with n >= 1. Sum hbar c k / 2 over every mode with
 * |k| <= kmax and divide by the volume. Works in units where L = pi so k = |n|.
 * Returns the ratio to the continuum value kmax^4 / (16 pi^2) (per unit volume).
 */
export function latticeRatio(nmax: number): number {
  let sum = 0;
  const n2 = nmax * nmax;
  for (let x = 1; x <= nmax; x++) {
    for (let y = 1; y <= nmax; y++) {
      const xy = x * x + y * y;
      if (xy > n2) break;
      for (let z = 1; z <= nmax; z++) {
        const r2 = xy + z * z;
        if (r2 > n2) break;
        sum += Math.sqrt(r2) / 2;
      }
    }
  }
  // Volume L^3 = pi^3 in these units.
  const rho = sum / Math.PI ** 3;
  const continuum = nmax ** 4 / (16 * Math.PI * Math.PI);
  return rho / continuum;
}

/** Equation of state of a cosmological constant: p = w rho with w = -1. */
export const W_VACUUM = -1;

/**
 * Energy density of a component with equation of state w as the universe
 * expands by scale factor a (a = 1 today): rho(a) = rho0 a^{-3(1+w)}.
 */
export const rhoOfA = (rho0: number, w: number, a: number) => rho0 * Math.pow(a, -3 * (1 + w));

export interface Landmark {
  label: string;
  eEV: number;
  speculative?: boolean;
}

/** Reference cutoff scales, in eV. */
export const LANDMARKS: Landmark[] = [
  { label: 'electron 0.511 MeV', eEV: 0.51099895e6 },
  { label: 'QCD ~0.2 GeV', eEV: 0.2e9 },
  { label: 'electroweak 246 GeV', eEV: 246.22e9 },
  { label: 'GUT? ~10¹⁶ GeV', eEV: 1e25, speculative: true },
  { label: 'Planck 1.22×10¹⁹ GeV', eEV: E_PLANCK },
];

/** log10 of the ratio of the model vacuum energy to the observed value. */
export function logRatio(ecutEV: number, cancel = false, msusyEV = 1e12): number {
  return Math.log10(rhoModel(ecutEV, cancel, msusyEV) / RHO_OBS);
}
