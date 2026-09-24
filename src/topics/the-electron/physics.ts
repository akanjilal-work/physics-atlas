// The electron: constants, QED series for the anomaly, precession and
// Penning-trap frequencies. Pure functions, no DOM.
// Constants are CODATA 2018 unless noted.

export const C = 299792458; // m/s (exact)
export const H_PLANCK = 6.62607015e-34; // J s (exact)
export const HBAR = H_PLANCK / (2 * Math.PI);
export const E_CHARGE = 1.602176634e-19; // C (exact)
export const M_E = 9.1093837015e-31; // kg
export const ALPHA = 7.2973525693e-3; // CODATA 2018 fine-structure constant
export const MU_B = (E_CHARGE * HBAR) / (2 * M_E); // J/T, 9.2740100783e-24
export const U_KG = 1.6605390666e-27; // atomic mass unit, kg

/** Measured anomaly, Fan, Myers, Sukra, Gabrielse, PRL 130, 071801 (2023). */
export const AE_EXP = 0.00115965218059;
export const AE_EXP_SIGMA = 0.13e-12;
/** Measured g-factor magnitude, g = 2(1 + a_e). */
export const G_EXP = 2 * (1 + AE_EXP);

/** Two determinations of 1/alpha from atom recoil. */
export const INV_ALPHA_CS = 137.035999046; // Parker et al., Science 360, 191 (2018), ±0.000000027
export const INV_ALPHA_RB = 137.035999206; // Morel et al., Nature 588, 61 (2020), ±0.000000011
export type AlphaSource = 'cs' | 'rb';
export const invAlpha = (s: AlphaSource): number => (s === 'cs' ? INV_ALPHA_CS : INV_ALPHA_RB);

/**
 * Mass-independent QED coefficients A1^(2n) of (alpha/pi)^n.
 * 1: Schwinger 1948. 2: Petermann, Sommerfield 1957. 3: Laporta, Remiddi 1996.
 * 4: Laporta 2017. 5: Aoyama, Kinoshita, Nio 2019, 6.737(159). Volkov 2024 finds 5.891(61).
 */
export const QED_COEFFS = [0.5, -0.328478965579193, 1.181241456587, -1.912245764926, 6.737];

/** Small non-universal pieces, in units of 1e-12 (Aoyama, Kinoshita, Nio, Atoms 7, 28, 2019). */
export const A_MASS_DEP = 2.747572e-12; // muon and tau loops in QED
export const A_HADRONIC = 1.693e-12;
export const A_WEAK = 0.03053e-12;
export const A_OTHER = A_MASS_DEP + A_HADRONIC + A_WEAK;

/** Highest "order" on the slider: 0 = Dirac, 1..5 = loops, 6 = plus muon, tau, hadron and weak pieces. */
export const MAX_ORDER = 6;

/** One QED term: the n-loop contribution (n = 1..5). */
export function qedTerm(n: number, inverseAlpha: number): number {
  const x = 1 / (inverseAlpha * Math.PI);
  return QED_COEFFS[n - 1] * Math.pow(x, n);
}

/** Predicted anomaly including terms up to the given order. */
export function aePrediction(order: number, inverseAlpha: number): number {
  let a = 0;
  const top = Math.min(order, QED_COEFFS.length);
  for (let n = 1; n <= top; n++) a += qedTerm(n, inverseAlpha);
  if (order >= MAX_ORDER) a += A_OTHER;
  return a;
}

/** Schwinger term alpha / 2 pi. */
export const schwinger = (inverseAlpha = 1 / ALPHA): number => 1 / (2 * Math.PI * inverseAlpha);

/** Spin precession (Larmor) frequency in Hz: f = g mu_B B / h. */
export const spinFreq = (B: number, g = G_EXP): number => (g * MU_B * B) / H_PLANCK;
/** Angular spin precession frequency in rad/s: omega = g mu_B B / hbar. */
export const spinOmega = (B: number, g = G_EXP): number => (g * MU_B * B) / HBAR;
/** Free-space cyclotron frequency in Hz: eB / (2 pi m). */
export const cyclotronFreq = (B: number): number => (E_CHARGE * B) / (2 * Math.PI * M_E);
/** Anomaly frequency nu_a = nu_s - nu_c = a_e nu_c. */
export const anomalyFreq = (B: number): number => spinFreq(B) - cyclotronFreq(B);

/** Compton wavelength h / (m c). */
export const comptonWavelength = (): number => H_PLANCK / (M_E * C);
/** Reduced Compton wavelength hbar / (m c). */
export const reducedCompton = (): number => HBAR / (M_E * C);
/** Classical electron radius e^2 / (4 pi eps0 m c^2) = alpha hbar / (m c). */
export const classicalRadius = (): number => ALPHA * reducedCompton();
/** Bohr radius hbar / (m c alpha). */
export const bohrRadius = (): number => reducedCompton() / ALPHA;
/** Rest energy in MeV. */
export const restEnergyMeV = (): number => (M_E * C * C) / E_CHARGE / 1e6;

/**
 * Stern-Gerlach deflection of an atom carrying one unpaired electron spin.
 * Force mu_z dB/dz with |mu_z| ~ mu_B acts for time L / v: dz = mu_B G L^2 / (2 m v^2).
 */
export function sgDeflection(gradient: number, length: number, speed: number, massKg: number): number {
  return (MU_B * gradient * length * length) / (2 * massKg * speed * speed);
}

/** Penning-trap motion (scene units and scene frequencies). Writes position into out. */
export interface TrapMotion { rc: number; rm: number; az: number; wc: number; wm: number; wz: number }
export function trapPosition(m: TrapMotion, t: number, out: Float64Array): Float64Array {
  // Modified cyclotron (fast, small, one sense) plus magnetron (slow, large, same sense) plus axial.
  const pc = m.wc * t;
  const pm = m.wm * t;
  out[0] = m.rm * Math.cos(pm) + m.rc * Math.cos(pc);
  out[1] = m.rm * Math.sin(pm) + m.rc * Math.sin(pc);
  out[2] = m.az * Math.cos(m.wz * t);
  return out;
}

/** Invariance theorem of Brown and Gabrielse: nu_c^2 = nu_+^2 + nu_z^2 + nu_-^2. */
export function trapFrequencies(nuC: number, nuZ: number): { plus: number; minus: number } {
  const d = Math.sqrt(nuC * nuC - 2 * nuZ * nuZ);
  return { plus: (nuC + d) / 2, minus: (nuC - d) / 2 };
}
