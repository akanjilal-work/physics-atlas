// Thermal history of a flat ΛCDM universe, plus the epoch table.
// Pure math, no DOM. Times in seconds, temperatures in MeV unless noted.

/** Boltzmann constant in eV per kelvin. */
export const K_B_EV = 8.617333262e-5;
/** Seconds in a Julian year. */
export const YEAR_S = 3.15576e7;
export const GYR_S = 1e9 * YEAR_S;
/** Megaparsec in km. */
export const MPC_KM = 3.0856775814913673e19;
/** Photon temperature today (Fixsen 2009), K. */
export const T0_K = 2.7255;
export const T0_MEV = T0_K * K_B_EV * 1e-6;
/** Planck time, s. */
export const PLANCK_TIME = 5.391247e-44;
/** Planck energy, GeV. */
export const PLANCK_GEV = 1.220890e19;
/** Reduced Planck constant in GeV s. */
export const HBAR_GEV_S = 6.582119569e-25;

/** Effective neutrino number. */
export const NEFF = 3.046;
/** g* today: photons plus three neutrino species at T_ν = (4/11)^(1/3) T. */
export const GSTAR0 = 2 + (7 / 8) * 2 * NEFF * Math.pow(4 / 11, 4 / 3);
/** g*s today, the entropy count. */
export const GSTARS0 = 2 + (7 / 8) * 2 * NEFF * (4 / 11);

export interface Cosmo {
  H0: number;
  Om: number;
  Ol: number;
  Or: number;
}

/** Radiation density today for T0 = 2.7255 K and N_eff = 3.046, as Ω_r h². */
export const OMEGA_R_H2 = 2.4728e-5 * (1 + 0.22711 * NEFF);

/** Planck 2018 (TT,TE,EE+lowE+lensing) flat ΛCDM. Ω_Λ closes the budget. */
export function planck2018(): Cosmo {
  const H0 = 67.4;
  const Om = 0.315;
  const Or = OMEGA_R_H2 / (H0 / 100) ** 2;
  return { H0, Om, Ol: 1 - Om - Or, Or };
}

/** H0 in 1/s. */
export const h0PerSecond = (H0: number) => H0 / MPC_KM;

// ------------------------------------------------------------ degrees of freedom

/** Smooth step: 1 well above Tc, 0 well below. Width w in ln T. */
const step = (T: number, Tc: number, w: number) => 0.5 * (1 + Math.tanh(Math.log(T / Tc) / w));

/**
 * Species that drop out of the plasma as it cools: [Δg*, T centre in MeV, width in ln T].
 * The Standard Model totals 106.75 above the top quark mass.
 * The QCD step is the crossover near 155 MeV (lattice QCD).
 */
const STEPS: [number, number, number][] = [
  [10.5, 40e3, 0.5], // top quark
  [10, 15e3, 0.5], // W, Z, Higgs
  [10.5, 1.5e3, 0.5], // bottom quark
  [14, 600, 0.5], // charm quark and tau
  [44.5, 160, 0.15], // gluons and light quarks confine into hadrons
  [6.5, 35, 0.5], // muons and pions
];
const E_STEP_G = 10.75 - GSTAR0;
const E_STEP_S = 10.75 - GSTARS0;
const E_TC = 0.17; // e± annihilation, about m_e / 3
const E_W = 0.5;

/** Effective relativistic degrees of freedom for energy density, g*(T). T in MeV. */
export function gStar(T: number): number {
  let g = GSTAR0 + E_STEP_G * step(T, E_TC, E_W);
  for (const [dg, tc, w] of STEPS) g += dg * step(T, tc, w);
  return g;
}

/** Degrees of freedom for entropy, g*s(T). Equal to g* until neutrinos decouple and e± annihilate. */
export function gStarS(T: number): number {
  let g = GSTARS0 + E_STEP_S * step(T, E_TC, E_W);
  for (const [dg, tc, w] of STEPS) g += dg * step(T, tc, w);
  return g;
}

// ------------------------------------------------------------ radiation-era closed form

/**
 * Prefactor of the radiation-era law T = C g*^(-1/4) (t / 1 s)^(-1/2) MeV.
 * From H = 1/(2t) and H² = (8πG/3)(π²/30) g* T⁴: C = (45/(16π³))^(1/4) (M_Pl ħ / 1 s)^(1/2). About 1.55.
 */
export const RAD_PREFACTOR_MEV = Math.pow(45 / (16 * Math.PI ** 3), 0.25) * Math.sqrt(PLANCK_GEV * HBAR_GEV_S) * 1e3;

/** Headline law: T in MeV at time t (s) for a fixed g*. */
export const radiationT = (tSec: number, gs: number) => RAD_PREFACTOR_MEV * Math.pow(gs, -0.25) / Math.sqrt(tSec);

/** Inverse: time (s) at which the radiation-era plasma has temperature T (MeV). */
export const radiationTime = (TMeV: number, gs: number) => (RAD_PREFACTOR_MEV / TMeV) ** 2 / Math.sqrt(gs);

// ------------------------------------------------------------ full thermal history

export interface Thermal {
  cosmo: Cosmo;
  /** Samples ordered by increasing time. */
  lnT: Float64Array; // photon temperature, MeV
  lnA: Float64Array; // scale factor
  lnTime: Float64Array; // cosmic time, s
  n: number;
}

/**
 * Builds t(T) and a(T) from the Friedmann equation with a temperature-dependent g*.
 *   a(T) = (T0/T) (g*s0 / g*s(T))^(1/3)       (entropy conservation)
 *   H²   = H0² [ Ω_m a⁻³ + Ω_Λ + Ω_r (g*(T)/g*0)(T/T0)⁴ ]
 *   t    = ∫ d ln a / H
 * The integral starts at T = 10²² MeV where the universe is pure radiation and t = 1/(2H).
 * Each step integrates 1/H exactly as a local power law in a, so the result is accurate
 * to better than 10⁻⁴ with a few thousand samples.
 */
export function buildThermal(c: Cosmo = planck2018(), opts: { THi?: number; aMax?: number; n?: number } = {}): Thermal {
  const THi = opts.THi ?? 1e22;
  const aMax = opts.aMax ?? 1e5;
  const n = opts.n ?? 6000;
  const TLo = T0_MEV / aMax;
  const H0 = h0PerSecond(c.H0);
  const lnT = new Float64Array(n);
  const lnA = new Float64Array(n);
  const lnTime = new Float64Array(n);
  const aOf = (T: number) => (T0_MEV / T) * Math.cbrt(GSTARS0 / gStarS(T));
  const invH = (T: number, a: number) => {
    const r = c.Or * (gStar(T) / GSTAR0) * (T / T0_MEV) ** 4;
    return 1 / (H0 * Math.sqrt(c.Om / (a * a * a) + c.Ol + r));
  };
  const l0 = Math.log(THi);
  const l1 = Math.log(TLo);
  let prevA = 0;
  let prevF = 0;
  let t = 0;
  for (let i = 0; i < n; i++) {
    const T = Math.exp(l0 + ((l1 - l0) * i) / (n - 1));
    const a = aOf(T);
    const f = invH(T, a);
    if (i === 0) {
      t = 0.5 * f;
    } else {
      const dx = Math.log(a / prevA);
      const r = f / prevF;
      t += Math.abs(r - 1) < 1e-9 ? prevF * dx : ((f - prevF) * dx) / Math.log(r);
    }
    lnT[i] = Math.log(T);
    lnA[i] = Math.log(a);
    lnTime[i] = Math.log(t);
    prevA = a;
    prevF = f;
  }
  return { cosmo: c, lnT, lnA, lnTime, n };
}

function interp(xs: Float64Array, ys: Float64Array, n: number, x: number, increasing: boolean): number {
  // Binary search on a monotonic array.
  let lo = 0;
  let hi = n - 1;
  const inc = increasing;
  if (inc ? x <= xs[0] : x >= xs[0]) return ys[0] + ((ys[1] - ys[0]) * (x - xs[0])) / (xs[1] - xs[0]);
  if (inc ? x >= xs[n - 1] : x <= xs[n - 1]) return ys[n - 2] + ((ys[n - 1] - ys[n - 2]) * (x - xs[n - 2])) / (xs[n - 1] - xs[n - 2]);
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (inc ? xs[m] <= x : xs[m] >= x) lo = m;
    else hi = m;
  }
  const f = (x - xs[lo]) / (xs[hi] - xs[lo]);
  return ys[lo] + f * (ys[hi] - ys[lo]);
}

/** Photon temperature (MeV) at time t (s). Extrapolates the radiation law before the table starts. */
export const tempAt = (th: Thermal, tSec: number) => Math.exp(interp(th.lnTime, th.lnT, th.n, Math.log(tSec), true));
/** Scale factor at time t (s), normalised to 1 today. */
export const scaleAt = (th: Thermal, tSec: number) => Math.exp(interp(th.lnTime, th.lnA, th.n, Math.log(tSec), true));
/** Time (s) when the scale factor was a. */
export const timeAtScale = (th: Thermal, a: number) => Math.exp(interp(th.lnA, th.lnTime, th.n, Math.log(a), true));
/** Time (s) at redshift z. */
export const timeAtZ = (th: Thermal, z: number) => timeAtScale(th, 1 / (1 + z));
/** Time (s) when the photon temperature was T (MeV). */
export const timeAtTemp = (th: Thermal, TMeV: number) => Math.exp(interp(th.lnT, th.lnTime, th.n, Math.log(TMeV), false));
/** Redshift at time t. Negative in the future. */
export const redshiftAt = (th: Thermal, tSec: number) => 1 / scaleAt(th, tSec) - 1;

/** Age today in s, from the table (a = 1). */
export const ageToday = (th: Thermal) => timeAtScale(th, 1);

/**
 * Independent check of the late-time age: t(z) = ∫_z^∞ dz' / ((1+z') H(z')) with constant Ω_r.
 * Uses Simpson's rule in the variable u = √a, which removes the endpoint singularity.
 */
export function ageAtZ(c: Cosmo, z: number, n = 4000): number {
  const H0 = h0PerSecond(c.H0);
  const aEnd = 1 / (1 + z);
  const f = (u: number) => {
    if (u === 0) return 0;
    const a = u * u;
    return (2 * u * a) / Math.sqrt(c.Or + c.Om * a + c.Ol * a * a * a * a);
  };
  const hi = Math.sqrt(aEnd);
  const h = hi / n;
  let s = f(0) + f(hi);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(i * h);
  return (s * h) / 3 / H0;
}

/** Redshift of matter-radiation equality for constant Ω_r: 1 + z = Ω_m / Ω_r. */
export const zEquality = (c: Cosmo) => c.Om / c.Or - 1;

// ------------------------------------------------------------ units and colours

export const mevToKelvin = (TMeV: number) => (TMeV * 1e6) / K_B_EV;
export const kelvinToMeV = (TK: number) => TK * K_B_EV * 1e-6;

const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
export const sup = (n: number) => String(n).split('').map((ch) => SUP[ch] ?? ch).join('');

/** Scientific notation with a unicode exponent, e.g. 3.2 × 10⁻¹². */
export function sci(x: number, digits = 1): string {
  if (!Number.isFinite(x)) return '…';
  if (x === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(x)));
  if (e >= -2 && e < 4) return x.toFixed(Math.max(0, digits - e));
  const m = x / 10 ** e;
  const ms = m.toFixed(digits);
  if (ms === '1' || ms === '1.0' || ms === '1.00') return `10${sup(e)}`;
  return `${ms} × 10${sup(e)}`;
}

/** Human-readable duration since the Big Bang. */
export function formatTime(tSec: number): string {
  const yr = tSec / YEAR_S;
  if (tSec < 1e-3) {
    if (tSec >= 1e-6) return `${(tSec * 1e6).toPrecision(2)} μs`;
    return `${sci(tSec)} s`;
  }
  if (tSec < 120) return `${tSec < 1 ? tSec.toPrecision(2) : tSec.toFixed(tSec < 10 ? 1 : 0)} s`;
  if (tSec < 3 * 3600) return `${(tSec / 60).toFixed(tSec < 600 ? 1 : 0)} min`;
  if (tSec < 3 * 86400) return `${(tSec / 3600).toFixed(0)} h`;
  if (yr < 1) return `${(tSec / 86400).toFixed(0)} days`;
  if (yr < 1e4) return `${yr.toPrecision(3)} yr`;
  if (yr < 1e6) return `${(yr / 1e3).toPrecision(3)} kyr`;
  if (yr < 1e9) return `${(yr / 1e6).toPrecision(3)} Myr`;
  return `${(yr / 1e9).toPrecision(3)} Gyr`;
}

/** Energy kT with a sensible unit. Input in MeV. */
export function formatEnergy(EMeV: number): string {
  const eV = EMeV * 1e6;
  if (eV >= 1e12) return `${sci(eV / 1e9)} GeV`;
  if (eV >= 1e9) return `${(eV / 1e9).toPrecision(3)} GeV`;
  if (eV >= 1e6) return `${(eV / 1e6).toPrecision(3)} MeV`;
  if (eV >= 1e3) return `${(eV / 1e3).toPrecision(3)} keV`;
  if (eV >= 1) return `${eV.toPrecision(3)} eV`;
  if (eV >= 1e-3) return `${(eV * 1e3).toPrecision(3)} meV`;
  return `${sci(eV)} eV`;
}

export function formatKelvin(TK: number): string {
  if (TK >= 1e5) return `${sci(TK)} K`;
  if (TK >= 100) return `${Math.round(TK).toLocaleString('en-US')} K`;
  return `${TK.toPrecision(3)} K`;
}

/** Tanner Helland's fit to blackbody colour (sRGB 0..1). Clamped to 1000..40 000 K, and fades to black below 1000 K. */
export function blackbodyRGB(TK: number, out: [number, number, number]): [number, number, number] {
  const T = Math.min(40000, Math.max(1000, TK)) / 100;
  let r: number;
  let g: number;
  let b: number;
  if (T <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(T) - 161.1195681661;
    b = T <= 19 ? 0 : 138.5177312231 * Math.log(T - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(T - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(T - 60, -0.0755148492);
    b = 255;
  }
  const cl = (x: number) => Math.min(1, Math.max(0, x / 255));
  // Below about 1000 K almost no visible light: a thermal glow dims and reddens toward black.
  const dim = TK >= 1000 ? 1 : Math.max(0, (TK - 500) / 500);
  out[0] = cl(r) * dim;
  out[1] = cl(g) * dim * dim;
  out[2] = cl(b) * dim * dim;
  return out;
}

// ------------------------------------------------------------ epochs

export type Confidence = 'observed' | 'tested' | 'theory' | 'speculative';

export interface Epoch {
  id: string;
  name: string;
  /** Representative time for the station (s). */
  t: number;
  /** Range shown on the card (s). */
  t0: number;
  t1: number;
  /** Human time text. */
  when: string;
  /** Typical photon temperature in K, or null where no thermal temperature applies. */
  TK: number | null;
  /** Typical energy scale in eV. */
  EeV: number;
  /** Energy text for the card. */
  energy: string;
  /** Typical redshift, or null where it is not a useful label. */
  z: number | null;
  line: string;
  how: string;
  confidence: Confidence;
  /** Atlas hash link. */
  link: string;
  linkTitle: string;
  visual: string;
}

const Y = YEAR_S;
const G = GYR_S;

/**
 * The epoch table. Temperatures, times and redshifts come from the model above and are
 * cross-checked in tests/topics/cosmic-timeline.ts. Speculative eras carry scale estimates only.
 */
export const EPOCHS: Epoch[] = [
  {
    id: 'planck', name: 'Planck era', t: PLANCK_TIME, t0: 0, t1: PLANCK_TIME, when: 'before 5.4 × 10⁻⁴⁴ s',
    TK: null, EeV: PLANCK_GEV * 1e9, energy: 'Planck energy, 1.2 × 10¹⁹ GeV', z: null,
    line: 'Gravity itself should be quantum here. No tested theory describes it.',
    how: 'Nothing observed. Dimensional analysis with G, ħ and c sets the scale.',
    confidence: 'speculative', link: '#/t/vibrating-strings', linkTitle: 'Strings & Extra Dimensions', visual: 'foam',
  },
  {
    id: 'gut', name: 'Grand unification', t: 1e-39, t0: PLANCK_TIME, t1: 1e-36, when: '10⁻⁴³ to 10⁻³⁶ s',
    TK: null, EeV: 1e25, energy: 'about 10¹⁶ GeV', z: null,
    line: 'The strong, weak and electromagnetic forces might merge into one.',
    how: 'Extrapolation only. The three force strengths come close near 10¹⁵ to 10¹⁶ GeV. Proton decay, the key test, has never been seen.',
    confidence: 'speculative', link: '#/t/gauge-symmetry', linkTitle: 'Gauge Symmetry', visual: 'gut',
  },
  {
    id: 'inflation', name: 'Inflation', t: 1e-34, t0: 1e-36, t1: 1e-32, when: 'roughly 10⁻³⁶ to 10⁻³² s',
    TK: null, EeV: 1e25, energy: 'below about 1.4 × 10¹⁶ GeV (B-mode limit)', z: null,
    line: 'Space grows by a factor of at least e⁶⁰, then the inflaton decays and reheats everything.',
    how: 'Indirect. The CMB is flat, uniform, and has nearly scale-invariant ripples (nₛ ≈ 0.965). The timing and energy are model guesses.',
    confidence: 'speculative', link: '#/t/cosmic-inflation', linkTitle: 'Cosmic Inflation', visual: 'inflate',
  },
  {
    id: 'electroweak', name: 'Electroweak symmetry breaking', t: 1e-11, t0: 1e-12, t1: 1e-10, when: 'about 10⁻¹¹ s',
    TK: 1.8e15, EeV: 1.5e11, energy: 'about 150 to 160 GeV', z: 2e15,
    line: 'The Higgs field settles, W and Z bosons gain mass, and the weak force becomes weak.',
    how: 'Standard Model physics tested at the LHC. Lattice studies show a smooth crossover near 160 GeV.',
    confidence: 'tested', link: '#/t/symmetry-breaking', linkTitle: 'Spontaneous Symmetry Breaking', visual: 'higgs',
  },
  {
    id: 'qgp', name: 'Quark–gluon plasma', t: 1e-8, t0: 1e-11, t1: 1e-5, when: '10⁻¹¹ to 10⁻⁵ s',
    TK: 6e13, EeV: 5e9, energy: 'about 5 GeV', z: 6e13,
    line: 'Quarks and gluons roam free in a hot soup. No protons exist yet.',
    how: 'Heavy-ion collisions at RHIC and the LHC recreate this state for about 10⁻²³ s.',
    confidence: 'tested', link: '#/t/quark-gluon-plasma', linkTitle: 'Quark–Gluon Plasma', visual: 'soup',
  },
  {
    id: 'qcd', name: 'QCD transition', t: 2e-5, t0: 1e-5, t1: 5e-5, when: 'about 10 to 50 μs',
    TK: 1.8e12, EeV: 1.55e8, energy: 'about 155 MeV', z: 1.3e12,
    line: 'Quarks become confined inside protons, neutrons and pions.',
    how: 'Lattice QCD finds a smooth crossover at about 156 MeV. Heavy-ion data agree.',
    confidence: 'tested', link: '#/t/quark-confinement', linkTitle: 'Quarks & Colour Confinement', visual: 'hadrons',
  },
  {
    id: 'neutrino', name: 'Neutrino decoupling', t: 0.5, t0: 0.1, t1: 2, when: 'about 0.1 to 2 s',
    TK: 1.4e10, EeV: 1.2e6, energy: 'about 1 MeV', z: 7e9,
    line: 'Neutrinos stop interacting and stream freely ever since. Neutrons and protons stop converting soon after.',
    how: 'The CMB and BBN both measure the neutrino energy: N_eff ≈ 3, as expected. The neutrino background itself is not yet detected.',
    confidence: 'theory', link: '#/t/neutrino-oscillations', linkTitle: 'Neutrino Oscillations', visual: 'streaks',
  },
  {
    id: 'annihilation', name: 'e⁺e⁻ annihilation', t: 10, t0: 1, t1: 100, when: 'about 1 to 100 s',
    TK: 3.2e9, EeV: 2.8e5, energy: 'kT falls from about 0.9 to 0.1 MeV', z: 1.6e9,
    line: 'Electrons and positrons annihilate. Their energy heats the photons, not the neutrinos.',
    how: 'Thermodynamics predicts T_ν/T_γ = (4/11)^(1/3). It sets the photon-to-baryon ratio that BBN and the CMB both confirm.',
    confidence: 'theory', link: '#/t/antimatter', linkTitle: 'Antimatter', visual: 'pairs',
  },
  {
    id: 'bbn', name: 'Big Bang nucleosynthesis', t: 200, t0: 180, t1: 1200, when: 'about 3 to 20 min',
    TK: 9.3e8, EeV: 8e4, energy: 'about 80 keV', z: 3.5e8,
    line: 'Protons and neutrons fuse into deuterium, helium and a trace of lithium.',
    how: 'Measured primordial abundances: helium is about 24.5% of the mass, D/H is about 2.5 × 10⁻⁵. Lithium-7 is off by about a factor of 3.',
    confidence: 'observed', link: '#/t/big-bang-nucleosynthesis', linkTitle: 'The First Three Minutes', visual: 'nuclei',
  },
  {
    id: 'equality', name: 'Matter–radiation equality', t: 5.1e4 * Y, t0: 4e4 * Y, t1: 6e4 * Y, when: 'about 50,000 yr',
    TK: 9300, EeV: 0.8, energy: 'about 0.8 eV', z: 3400,
    line: 'Matter starts to outweigh radiation. Dark matter clumps can now grow.',
    how: 'The heights of the CMB peaks fix z_eq = 3387 ± 21 (Planck 2018).',
    confidence: 'observed', link: '#/t/cosmic-expansion', linkTitle: 'The Expanding Universe', visual: 'balance',
  },
  {
    id: 'recombination', name: 'Recombination and the CMB', t: 3.71e5 * Y, t0: 2.5e5 * Y, t1: 5e5 * Y, when: 'about 380,000 yr',
    TK: 2970, EeV: 0.26, energy: 'about 0.26 eV', z: 1090,
    line: 'Electrons join nuclei to make neutral atoms. Light breaks free and becomes the CMB.',
    how: 'We see it directly: a 2.7255 K blackbody with ripples of 1 part in 100,000 (COBE, WMAP, Planck).',
    confidence: 'observed', link: '#/t/cmb-acoustic-peaks', linkTitle: 'The Cosmic Microwave Background', visual: 'cmb',
  },
  {
    id: 'darkages', name: 'Dark ages', t: 1.6e7 * Y, t0: 3.8e5 * Y, t1: 1e8 * Y, when: '380,000 yr to about 100 Myr',
    TK: 280, EeV: 0.024, energy: 'about 0.02 eV', z: 100,
    line: 'No stars yet. Gas cools while dark matter gathers into a web of halos.',
    how: 'Theory and simulations. The 21 cm hydrogen line could map this era. It has not been detected yet.',
    confidence: 'theory', link: '#/t/dark-matter', linkTitle: 'Dark Matter', visual: 'web',
  },
  {
    id: 'firststars', name: 'First stars', t: 1.5e8 * Y, t0: 1e8 * Y, t1: 2e8 * Y, when: 'about 100 to 200 Myr',
    TK: 64, EeV: 0.0055, energy: 'CMB at about 6 meV', z: 22,
    line: 'Gas collapses in small halos and the first massive stars ignite.',
    how: 'Simulations. No first-generation star has been seen. JWST sees galaxies by about 300 Myr, at z ≈ 14.',
    confidence: 'theory', link: '#/t/stellar-evolution', linkTitle: 'Lives of Stars', visual: 'star',
  },
  {
    id: 'reionization', name: 'Reionization', t: 6.69e8 * Y, t0: 4.7e8 * Y, t1: 9.3e8 * Y, when: 'z ≈ 10 to 6 (about 0.5 to 0.9 Gyr)',
    TK: 24, EeV: 0.002, energy: 'starlight at 13.6 eV ionizes hydrogen', z: 7.7,
    line: 'Ultraviolet light from stars and galaxies strips hydrogen of its electrons again.',
    how: 'Quasar spectra show neutral gas only above z ≈ 6. The CMB optical depth puts the midpoint near z ≈ 7.7.',
    confidence: 'observed', link: '#/t/hydrogen-orbitals', linkTitle: 'Hydrogen Orbitals', visual: 'bubbles',
  },
  {
    id: 'galaxies', name: 'Galaxies grow', t: 3.3 * G, t0: 1 * G, t1: 6 * G, when: 'peak near z ≈ 2 (about 3.3 Gyr)',
    TK: 8.2, EeV: 7e-4, energy: 'CMB at about 0.7 meV', z: 2,
    line: 'Galaxies merge and form stars fastest around “cosmic noon”.',
    how: 'Deep galaxy surveys with Hubble, JWST and radio telescopes trace the star-formation rate over time.',
    confidence: 'observed', link: '#/t/cosmic-web', linkTitle: 'The Cosmic Web', visual: 'galaxy',
  },
  {
    id: 'acceleration', name: 'Expansion speeds up', t: 7.7 * G, t0: 7 * G, t1: 8.5 * G, when: 'about 7.7 Gyr (z ≈ 0.63)',
    TK: 4.4, EeV: 3.8e-4, energy: 'CMB at about 0.4 meV', z: 0.63,
    line: 'Dark energy starts to beat the pull of matter, and the expansion accelerates.',
    how: 'Type Ia supernovae (1998), confirmed by baryon acoustic oscillations and the CMB.',
    confidence: 'observed', link: '#/t/dark-energy', linkTitle: 'Dark Energy', visual: 'spread',
  },
  {
    id: 'sun', name: 'Sun and Earth form', t: 9.22 * G, t0: 9.2 * G, t1: 9.25 * G, when: 'about 9.2 Gyr (4.57 Gyr ago)',
    TK: 3.9, EeV: 3.3e-4, energy: 'CMB at about 0.3 meV', z: 0.42,
    line: 'A gas cloud in the Milky Way collapses into the Sun and its planets.',
    how: 'Radioactive dating of the oldest meteorite grains gives 4.567 Gyr.',
    confidence: 'observed', link: '#/t/solar-fusion', linkTitle: 'Fusion in the Sun', visual: 'sun',
  },
  {
    id: 'today', name: 'Today', t: 13.79 * G, t0: 13.7 * G, t1: 13.85 * G, when: '13.8 Gyr',
    TK: T0_K, EeV: T0_K * K_B_EV, energy: 'CMB at 0.23 meV', z: 0,
    line: 'The CMB is at 2.7255 K. Dark energy makes up about 69% of the total.',
    how: 'The CMB fit gives an age of 13.79 ± 0.02 Gyr. The oldest stars are consistent with it.',
    confidence: 'observed', link: '#/t/distance-ladder', linkTitle: 'The Cosmic Distance Ladder', visual: 'today',
  },
  {
    id: 'future', name: 'The far future', t: 100 * G, t0: 20 * G, t1: 1e3 * G, when: '100 Gyr and beyond',
    TK: 0.019, EeV: 1.6e-6, energy: 'CMB near 0.02 K', z: null,
    line: 'If dark energy stays constant, other galaxies fade from view and the cosmos grows cold.',
    how: 'Extrapolation of ΛCDM. It depends on whether dark energy truly stays constant.',
    confidence: 'speculative', link: '#/t/fate-of-universe', linkTitle: 'The Fate of the Universe', visual: 'fade',
  },
];

/** Scrubber range in log10 seconds. */
export const LOG_T_MIN = -44;
export const LOG_T_MAX = 18.8;

/** Inflation window used by the scene (s). The hot-model T(t) does not apply before its end. */
export const INFLATION_END = 1e-32;
