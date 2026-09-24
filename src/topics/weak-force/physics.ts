// Pure physics for the weak force page. No DOM, no Three.js.
// Units: GeV for particle masses and couplings, MeV for beta-decay energies, fm for lengths.

/** ħc in GeV·fm (CODATA 2018). */
export const HBARC_GEV_FM = 0.1973269804;
/** ħ in GeV·s (CODATA 2018). */
export const HBAR_GEV_S = 6.582119569e-25;
/** Fermi constant from the muon lifetime (MuLan), GeV⁻². */
export const G_F = 1.1663788e-5;
/** W boson mass, PDG 2024 world average, GeV. */
export const M_W = 80.3692;
/** Z boson mass, PDG, GeV. */
export const M_Z = 91.188;
/** Muon mass, GeV. */
export const M_MU = 0.1056583755;
/** Measured muon lifetime, s (MuLan). */
export const TAU_MU_MEASURED = 2.1969811e-6;
/** Fine-structure constant at zero momentum. */
export const ALPHA = 1 / 137.035999;

/** Electron, proton and neutron masses in MeV (CODATA 2018). */
export const ME_MEV = 0.51099895;
export const MP_MEV = 938.27208816;
export const MN_MEV = 939.56542052;
/** Neutron beta-decay Q-value: m_n - m_p - m_e (atomic binding neglected). About 0.782 MeV. */
export const Q_NEUTRON = MN_MEV - MP_MEV - ME_MEV;
/** Endpoint of the main Co-60 beta branch (to the 2.506 MeV level of Ni-60), MeV. */
export const Q_CO60 = 0.3179;

/** Range of a force carried by a boson of mass M (GeV): λ = ħ/(Mc) in fm. Infinite for a massless carrier. */
export function rangeFm(massGeV: number): number {
  return massGeV > 0 ? HBARC_GEV_FM / massGeV : Infinity;
}

/** Yukawa potential shape e^{-r/λ}/r (arbitrary units). λ = Infinity gives Coulomb. */
export function yukawa(r: number, lambda: number): number {
  return Number.isFinite(lambda) ? Math.exp(-r / lambda) / r : 1 / r;
}

/** Coulomb shape 1/r. */
export function coulomb(r: number): number {
  return 1 / r;
}

/** Weak SU(2) coupling from G_F and M_W, using G_F/√2 = g²/(8 M_W²). */
export function gFromFermi(gf: number, mW: number): number {
  return Math.sqrt(4 * Math.SQRT2 * gf * mW * mW);
}

/** Effective Fermi constant for coupling g and mediator mass M (GeV⁻²). Infinite for M = 0. */
export function fermiFromG(g: number, mW: number): number {
  return mW > 0 ? (Math.SQRT2 * g * g) / (8 * mW * mW) : Infinity;
}

/** Tree-level W mass from α, sin²θ_W and G_F: M_W² = πα / (√2 G_F sin²θ_W). */
export function mWTree(alpha: number, sin2w: number, gf: number): number {
  return Math.sqrt((Math.PI * alpha) / (Math.SQRT2 * gf * sin2w));
}

/** Muon decay width Γ = G_F² m_μ⁵ / (192 π³), in GeV. Optional electron-mass and O(α) QED corrections. */
export function muonWidth(gf: number, mMu: number, corrections = false): number {
  let w = (gf * gf * mMu ** 5) / (192 * Math.PI ** 3);
  if (corrections) {
    const x = (ME_MEV / 1000 / mMu) ** 2;
    const f = 1 - 8 * x + 8 * x ** 3 - x ** 4 - 12 * x * x * Math.log(x);
    const rad = 1 + (ALPHA / (2 * Math.PI)) * (25 / 4 - Math.PI ** 2);
    w *= f * rad;
  }
  return w;
}

/** Muon lifetime τ = ħ/Γ in seconds. */
export function muonLifetime(gf: number, mMu = M_MU, corrections = false): number {
  const w = muonWidth(gf, mMu, corrections);
  return w > 0 ? HBAR_GEV_S / w : Infinity;
}

/** Electron speed v/c for kinetic energy T (MeV). */
export function betaOf(T: number): number {
  const E = T + ME_MEV;
  return Math.sqrt(Math.max(0, E * E - ME_MEV * ME_MEV)) / E;
}

/** Non-relativistic Fermi function for β⁻ emission from a daughter of charge Z. Z = 0 gives F = 1. */
export function fermiFunction(Z: number, T: number): number {
  if (Z === 0) return 1;
  const b = betaOf(T);
  if (b <= 0) return 0;
  const x = (2 * Math.PI * Z * ALPHA) / b;
  return x / (1 - Math.exp(-x));
}

/** Allowed beta spectrum N(T) ∝ p E (Q - T)² F(Z, E). Zero outside 0 < T < Q. T and Q in MeV. */
export function betaSpectrum(T: number, Q: number, Z = 0): number {
  if (T <= 0 || T >= Q) return 0;
  const E = T + ME_MEV;
  const p = Math.sqrt(E * E - ME_MEV * ME_MEV);
  return p * E * (Q - T) ** 2 * fermiFunction(Z, T);
}

export interface SpectrumTable {
  Q: number;
  Z: number;
  /** Kinetic-energy grid, n+1 points from 0 to Q. */
  T: Float64Array;
  /** Cumulative distribution on the grid, 0 to 1. */
  cdf: Float64Array;
  /** Peak value of N(T) on the grid, for plotting. */
  peak: number;
  /** Normalisation ∫N dT, for plotting. */
  norm: number;
  /** Mean kinetic energy, MeV. */
  meanT: number;
  /** Mean electron speed v/c. */
  meanBeta: number;
}

/** Tabulate the spectrum and its CDF with the trapezoid rule. */
export function buildSpectrum(Q: number, Z = 0, n = 2000): SpectrumTable {
  const T = new Float64Array(n + 1);
  const cdf = new Float64Array(n + 1);
  let prev = 0;
  let acc = 0;
  let accT = 0;
  let accB = 0;
  let peak = 0;
  for (let i = 0; i <= n; i++) {
    const t = (Q * i) / n;
    T[i] = t;
    const f = betaSpectrum(t, Q, Z);
    peak = Math.max(peak, f);
    if (i > 0) {
      const h = Q / n;
      const tm = t - h / 2;
      const fm = betaSpectrum(tm, Q, Z);
      // Simpson on each cell keeps the tail accurate.
      const cell = (h / 6) * (prev + 4 * fm + f);
      acc += cell;
      accT += (h / 6) * ((t - h) * prev + 4 * tm * fm + t * f);
      accB += (h / 6) * (betaOf(t - h) * prev + 4 * betaOf(tm) * fm + betaOf(t) * f);
    }
    cdf[i] = acc;
    prev = f;
  }
  for (let i = 0; i <= n; i++) cdf[i] /= acc;
  return { Q, Z, T, cdf, peak, norm: acc, meanT: accT / acc, meanBeta: accB / acc };
}

/** Draw a kinetic energy from the table given a uniform u in [0, 1). */
export function sampleT(tab: SpectrumTable, u: number): number {
  const c = tab.cdf;
  let lo = 0;
  let hi = c.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (c[mid] <= u) lo = mid;
    else hi = mid;
  }
  const span = c[hi] - c[lo];
  const f = span > 0 ? (u - c[lo]) / span : 0;
  return tab.T[lo] + f * (tab.T[hi] - tab.T[lo]);
}

/**
 * Sample cos θ from W(θ) ∝ 1 + a cos θ, with |a| ≤ 1, given uniform u.
 * For polarised nuclei a = A P v/c. Co-60 has A = -1.
 */
export function sampleCosTheta(a: number, u: number): number {
  if (Math.abs(a) < 1e-9) return 2 * u - 1;
  // CDF: (c + 1)/2 + a (c² - 1)/4 = u
  const disc = 0.25 - a * (0.5 - a / 4 - u);
  return (-0.5 + Math.sqrt(Math.max(0, disc))) / (a / 2);
}

/** Expected up-down asymmetry (N↑ - N↓)/(N↑ + N↓) for W ∝ 1 + a cos θ. */
export function hemisphereAsymmetry(a: number): number {
  return a / 2;
}

/** Height of the Yukawa or Coulomb well used by the 3D surface (clamped near r = 0). */
export function surfaceHeight(r: number, rMin: number, lambda: number): number {
  const rr = Math.max(r, rMin);
  return rMin * yukawa(rr, lambda);
}
