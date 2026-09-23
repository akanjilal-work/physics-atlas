// Ideal Bose gas in a 3D harmonic trap. Pure math, no DOM.
// SI units unless a name says otherwise. Temperatures in kelvin.

export const H = 6.62607015e-34;
export const HBAR = H / (2 * Math.PI);
export const KB = 1.380649e-23;
export const AMU = 1.66053906660e-27;
export const A0 = 5.29177210903e-11;

export const ZETA3 = 1.2020569031595942;
export const ZETA2 = Math.PI ** 2 / 6;
export const ZETA32 = 2.6123753486854883;

export type SpeciesId = 'rb87' | 'na23';
export interface Species {
  id: SpeciesId;
  label: string;
  /** Atomic mass in kg. */
  m: number;
  /** s-wave scattering length in m (approximate, used only for the condensate shape). */
  a: number;
}

export const SPECIES: Record<SpeciesId, Species> = {
  rb87: { id: 'rb87', label: '⁸⁷Rb', m: 86.909180527 * AMU, a: 100 * A0 },
  na23: { id: 'na23', label: '²³Na', m: 22.9897692820 * AMU, a: 54 * A0 },
};

// ---------------------------------------------------------------- polylogarithms

// zeta(nu - k) for the expansions near x = 1 (checked against the functional equation).
const Z_HALF = [2.6123753486854883, -1.4603545088095868, -0.2078862249773547, -0.02548520188983307, 0.008516928777850328,
  0.00444101133547943, -0.003091669247215839, -0.002671458019899235, 0.002746767939536874, 0.003269039572600228];
// zeta(n) for n = 3, 2, 1(unused), 0, -1, ..., -7
const Z_INT: Record<number, number> = { 3: ZETA3, 2: ZETA2, 0: -0.5, [-1]: -1 / 12, [-2]: 0, [-3]: 1 / 120, [-4]: 0, [-5]: -1 / 252, [-6]: 0, [-7]: 1 / 240, [-8]: 0 };

/**
 * Bose function g_nu(x) = sum_k x^k / k^nu for 0 <= x <= 1, nu in {1.5, 2, 3}.
 * Direct series for x < 0.75, otherwise the expansion in w = -ln x.
 */
export function g(nu: 1.5 | 2 | 3, x: number): number {
  if (x <= 0) return 0;
  if (x < 0.75) {
    let s = 0;
    let p = x;
    for (let k = 1; k < 200; k++) {
      const t = p / (nu === 2 ? k * k : nu === 3 ? k * k * k : k * Math.sqrt(k));
      s += t;
      if (t < 1e-17) break;
      p *= x;
    }
    return s;
  }
  const w = Math.max(0, -Math.log(Math.min(1, x)));
  if (nu === 1.5) {
    let s = -2 * Math.sqrt(Math.PI) * Math.sqrt(w);
    let term = 1;
    for (let k = 0; k < Z_HALF.length; k++) {
      s += Z_HALF[k] * term;
      term *= -w / (k + 1);
    }
    return s;
  }
  // integer order n
  const n = nu;
  let s = 0;
  let term = 1; // (-w)^k / k!
  for (let k = 0; k <= 10; k++) {
    if (k === n - 1) {
      const Hn = n === 2 ? 1 : 1.5;
      if (w > 0) s += term * (Hn - Math.log(w));
    } else {
      s += (Z_INT[n - k] ?? 0) * term;
    }
    term *= -w / (k + 1);
  }
  return s;
}

// ---------------------------------------------------------------- thermodynamics (large-N limit)

/** Geometric mean trap frequency (rad/s) from the axial frequency and elongation k = w_perp / w_z. */
export function trapFreqs(nuBarHz: number, k: number): { wbar: number; wperp: number; wz: number } {
  const wbar = 2 * Math.PI * nuBarHz;
  return { wbar, wperp: wbar * Math.cbrt(k), wz: wbar / Math.cbrt(k * k) };
}

/** Critical temperature of the ideal gas in a harmonic trap, k_B T_c = hbar wbar (N / zeta(3))^(1/3). */
export function criticalT(N: number, wbar: number): number {
  return ((HBAR * wbar) / KB) * Math.cbrt(N / ZETA3);
}

/** Critical temperature in a uniform box of density n: k_B T_c = (2 pi hbar^2 / m)(n / zeta(3/2))^(2/3). */
export function criticalTBox(n: number, m: number): number {
  return ((2 * Math.PI * HBAR * HBAR) / (m * KB)) * Math.pow(n / ZETA32, 2 / 3);
}

/** Condensate fraction, harmonic trap, thermodynamic limit. */
export const fractionHarmonic = (t: number): number => (t >= 1 ? 0 : 1 - t * t * t);
/** Condensate fraction, uniform box, thermodynamic limit. */
export const fractionBox = (t: number): number => (t >= 1 ? 0 : 1 - Math.pow(t, 1.5));

/**
 * Leading finite-size correction for a harmonic trap (Grossmann and Holthaus, Ketterle and van Druten, 1996):
 * N0/N = 1 - t^3 - (3 zeta(2) / (2 zeta(3)^(2/3))) (w_mean / wbar) t^2 N^(-1/3).
 */
export function fractionFiniteN(t: number, N: number, wMeanOverWbar: number): number {
  const c = (3 * ZETA2) / (2 * Math.pow(ZETA3, 2 / 3));
  return Math.max(0, 1 - t ** 3 - c * wMeanOverWbar * t * t * Math.pow(N, -1 / 3));
}

/** Thermal de Broglie wavelength lambda = h / sqrt(2 pi m k_B T). */
export function deBroglie(m: number, T: number): number {
  return H / Math.sqrt(2 * Math.PI * m * KB * T);
}

export interface Thermo {
  t: number; // T / Tc
  Tc: number;
  /** Fugacity of the thermal cloud (1 at and below Tc). */
  z: number;
  f0: number; // N0 / N
  N0: number;
  Nth: number;
  /** Peak phase-space density of the thermal cloud, g_3/2(z). */
  psd: number;
}

/** Semiclassical ideal-gas state. Above Tc solves g_3(z) = N (hbar wbar / k T)^3 for z. */
export function thermo(N: number, T: number, wbar: number): Thermo {
  const Tc = criticalT(N, wbar);
  const t = T / Tc;
  const q = N * Math.pow((HBAR * wbar) / (KB * T), 3);
  let z = 1;
  if (q < ZETA3) {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 60; i++) {
      const mid = 0.5 * (lo + hi);
      if (g(3, mid) < q) lo = mid;
      else hi = mid;
    }
    z = 0.5 * (lo + hi);
  }
  const f0 = fractionHarmonic(t);
  return { t, Tc, z, f0, N0: f0 * N, Nth: (1 - f0) * N, psd: g(1.5, z) };
}

// ---------------------------------------------------------------- exact level sum at finite N

/**
 * Bose-Einstein occupation summed over the actual trap levels of an axially symmetric trap with
 * w_perp = k w_z, k integer. Energies are E_m = m hbar w_z above the ground state, and level m has
 * degeneracy sum_{j=0}^{floor(m/k)} (j + 1). Low levels are kept exactly. Higher ones are grouped into
 * bins about 1% wide, which changes the sums by far less than the finite-N effects being shown.
 */
export class LevelSum {
  readonly E: Float64Array;
  readonly G: Float64Array;
  readonly count: number;
  readonly k: number;

  constructor(k: number, mMax: number) {
    this.k = k;
    const deg = (m: number) => {
      const j = Math.floor(m / k);
      return ((j + 1) * (j + 2)) / 2;
    };
    const E: number[] = [];
    const G: number[] = [];
    const EXACT = 400;
    let m = 1;
    while (m <= mMax) {
      const w = m < EXACT ? 1 : Math.max(1, Math.floor(m * 0.01));
      let gs = 0;
      let es = 0;
      for (let i = m; i < m + w; i++) {
        const d = deg(i);
        gs += d;
        es += d * i;
      }
      E.push(es / gs);
      G.push(gs);
      m += w;
    }
    this.E = Float64Array.from(E);
    this.G = Float64Array.from(G);
    this.count = E.length;
  }

  /** Excited-state population for x = -mu / kT > 0 and b = hbar w_z / kT. */
  excited(x: number, b: number): number {
    let s = 0;
    const { E, G } = this;
    for (let j = 0; j < this.count; j++) {
      const u = x + b * E[j];
      if (u > 40) break;
      s += G[j] / Math.expm1(u);
    }
    return s;
  }

  /** Solve N0 + N_ex = N. Returns the condensate fraction N0/N. */
  fraction(N: number, b: number): number {
    let lo = Math.log(1e-14);
    let hi = Math.log(60);
    for (let i = 0; i < 64; i++) {
      const mid = 0.5 * (lo + hi);
      const x = Math.exp(mid);
      const tot = 1 / Math.expm1(x) + this.excited(x, b);
      if (tot > N) lo = mid;
      else hi = mid;
    }
    const x = Math.exp(0.5 * (lo + hi));
    return 1 / Math.expm1(x) / N;
  }

  /** Levels needed so that E_max * b_min exceeds 40. */
  static levelsFor(bMin: number): number {
    return Math.ceil(40 / bMin) + 2;
  }
}

// ---------------------------------------------------------------- thermal energy sampling

/**
 * Inverse CDF of a thermal atom's energy (in units of kT) in a 3D harmonic trap. Phase-space density of
 * states grows as E^2, so P(E) is proportional to E^2 / (e^E / z - 1). Fills out[i] = E at quantile (i + 0.5)/n.
 */
export function energyQuantiles(z: number, out: Float64Array): void {
  const n = out.length;
  const NB = 2400;
  const EMAX = 40;
  const dE = EMAX / NB;
  const cdf = new Float64Array(NB + 1);
  for (let i = 1; i <= NB; i++) {
    const e = (i - 0.5) * dE;
    cdf[i] = cdf[i - 1] + (e * e) / (Math.exp(e) / z - 1);
  }
  const tot = cdf[NB];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const target = ((i + 0.5) / n) * tot;
    while (j < NB && cdf[j + 1] < target) j++;
    const f = (target - cdf[j]) / Math.max(1e-300, cdf[j + 1] - cdf[j]);
    out[i] = (j + f) * dE;
  }
}

// ---------------------------------------------------------------- condensate shape

/** Thomas-Fermi chemical potential mu = (hbar wbar / 2)(15 N0 a / abar)^(2/5). */
export function tfMu(N0: number, sp: Species, wbar: number): number {
  const abar = Math.sqrt(HBAR / (sp.m * wbar));
  return 0.5 * HBAR * wbar * Math.pow((15 * N0 * sp.a) / abar, 0.4);
}

/** Oscillator length sqrt(hbar / m w). */
export const oscLength = (m: number, w: number): number => Math.sqrt(HBAR / (m * w));

/**
 * Castin-Dum scaling factors for a Thomas-Fermi condensate released from a cigar trap.
 * Integrates b_perp'' = 1/(b_perp^3 b_z), b_z'' = eps^2/(b_perp^2 b_z^2) in tau = w_perp t, eps = w_z / w_perp.
 * Returns tables sampled every dtau.
 */
export function castinDum(eps: number, tauMax: number, dtau: number): { bp: Float64Array; bz: Float64Array; dtau: number } {
  const n = Math.ceil(tauMax / dtau) + 1;
  const bp = new Float64Array(n);
  const bz = new Float64Array(n);
  let y = [1, 0, 1, 0]; // bp, bp', bz, bz'
  const f = (s: number[]) => [s[1], 1 / (s[0] ** 3 * s[2]), s[3], (eps * eps) / (s[0] ** 2 * s[2] ** 2)];
  const sub = 8;
  const h = dtau / sub;
  bp[0] = 1;
  bz[0] = 1;
  for (let i = 1; i < n; i++) {
    for (let k = 0; k < sub; k++) {
      const k1 = f(y);
      const k2 = f(y.map((v, j) => v + 0.5 * h * k1[j]));
      const k3 = f(y.map((v, j) => v + 0.5 * h * k2[j]));
      const k4 = f(y.map((v, j) => v + h * k3[j]));
      y = y.map((v, j) => v + (h / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
    }
    bp[i] = y[0];
    bz[i] = y[2];
  }
  return { bp, bz, dtau };
}

/** Error function (Abramowitz and Stegun 7.1.26, |error| < 1.5e-7). */
export function erf(x: number): number {
  const s = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}
