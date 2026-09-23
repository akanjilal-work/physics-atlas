// Four-level laser rate equations. Pure math, no DOM.
//
//   dN/dt = R_p - N/tau - B N q
//   dq/dt = B N q - q/tau_c + beta N / tau
//
// N is the population inversion (atoms in the upper laser level, since the
// lower level of a four-level system empties almost at once). q is the number
// of photons in the lasing cavity mode. The small beta term is the share of
// spontaneous emission that lands in the mode and seeds lasing.
//
// Numbers are Nd:YAG-like: 1064 nm output, 808 nm diode pump, 230 us upper
// level lifetime. The cross-section and mode area are illustrative.

export const C = 299_792_458; // m/s
export const H_PLANCK = 6.62607015e-34; // J s

export interface LaserParams {
  /** Absorbed pump power (W). Every absorbed pump photon puts one atom in the upper level. */
  pumpW: number;
  /** Output coupler reflectivity (the other mirror is 100%). */
  R: number;
  /** Cavity length (m). */
  L: number;
  /** Other round-trip losses (scatter, absorption), as a fraction per round trip. */
  Li: number;
  /** Upper-level lifetime (s). */
  tau: number;
  /** Stimulated emission cross-section (m^2). */
  sigma: number;
  /** Mode area in the rod (m^2). */
  area: number;
  /** Laser and pump wavelengths (m). */
  lambdaL: number;
  lambdaP: number;
  /** Fraction of spontaneous emission that enters the lasing mode. */
  beta: number;
}

export const DEFAULTS: LaserParams = {
  pumpW: 3,
  R: 0.95,
  L: 0.3,
  Li: 0.02,
  tau: 230e-6,
  sigma: 2.8e-23,
  area: 1e-6,
  lambdaL: 1064e-9,
  lambdaP: 808e-9,
  beta: 1e-9,
};

/** Round-trip time 2L/c (s). */
export const roundTrip = (L: number): number => (2 * L) / C;

/** Longitudinal mode spacing c/2L (Hz). */
export const modeSpacing = (L: number): number => C / (2 * L);

/** Round-trip loss as a rate exponent: -ln R plus internal loss plus any extra (Q-switch) loss. */
export const roundTripLoss = (p: LaserParams, extra = 0): number => -Math.log(p.R) + p.Li + extra;

/** Photon lifetime in the cavity, tau_c = T_rt / loss (s). */
export const cavityLifetime = (p: LaserParams, extra = 0): number => roundTrip(p.L) / roundTripLoss(p, extra);

/** Stimulated emission coefficient B = sigma c / (A L) (per photon per second). */
export const coefB = (p: LaserParams): number => (p.sigma * C) / (p.area * p.L);

/** Threshold inversion: gain equals loss, B N tau_c = 1. */
export const thresholdN = (p: LaserParams): number => 1 / (coefB(p) * cavityLifetime(p));

/** Pump photon energy and laser photon energy (J). */
export const photonEnergy = (lambda: number): number => (H_PLANCK * C) / lambda;

/** Pump rate R_p (atoms per second) from absorbed pump power. */
export const pumpRate = (p: LaserParams): number => p.pumpW / photonEnergy(p.lambdaP);

/** Threshold pump rate N_th / tau (atoms per second). */
export const thresholdRate = (p: LaserParams): number => thresholdN(p) / p.tau;

/** Threshold absorbed pump power (W). */
export const thresholdPumpW = (p: LaserParams): number => thresholdRate(p) * photonEnergy(p.lambdaP);

/** Pump ratio r = R_p / R_th. */
export const pumpRatio = (p: LaserParams): number => pumpRate(p) / thresholdRate(p);

/** Output power leaving through the coupler for q photons in the cavity (W). */
export const outputPower = (p: LaserParams, q: number): number =>
  (photonEnergy(p.lambdaL) * q * -Math.log(p.R)) / roundTrip(p.L);

/** Analytic steady state with beta = 0. Below threshold q = 0 and N = R_p tau. */
export function steadyState(p: LaserParams): { N: number; q: number; P: number } {
  const Rp = pumpRate(p);
  const Rth = thresholdRate(p);
  if (Rp <= Rth) return { N: Rp * p.tau, q: 0, P: 0 };
  const q = cavityLifetime(p) * (Rp - Rth);
  return { N: thresholdN(p), q, P: outputPower(p, q) };
}

/** Slope efficiency dP_out/dP_pump above threshold: quantum defect times output-coupling share. */
export const slopeEfficiency = (p: LaserParams): number =>
  (p.lambdaP / p.lambdaL) * (-Math.log(p.R) / roundTripLoss(p));

/**
 * Linearised relaxation oscillations about the lasing steady state.
 * delta'' + gamma delta' + omega0^2 delta = 0 with gamma = r/tau, omega0^2 = (r-1)/(tau tau_c).
 */
export function relaxation(p: LaserParams): { omega0: number; gamma: number; omegaR: number; fR: number } {
  const r = pumpRatio(p);
  const tc = cavityLifetime(p);
  const omega0 = r > 1 ? Math.sqrt((r - 1) / (p.tau * tc)) : 0;
  const gamma = r / p.tau;
  const w2 = omega0 * omega0 - (gamma * gamma) / 4;
  const omegaR = w2 > 0 ? Math.sqrt(w2) : 0;
  return { omega0, gamma, omegaR, fR: omegaR / (2 * Math.PI) };
}

/**
 * Peak photon number of a Q-switched pulse from initial inversion Ni.
 * From dq/dN = -1 + N_th/N (pump and spontaneous decay neglected during the pulse).
 */
export const qSwitchPeak = (Ni: number, Nth: number): number => (Ni > Nth ? Ni - Nth - Nth * Math.log(Ni / Nth) : 0);

/** Longitudinal mode frequencies nearest a centre frequency: nu_m = m c / 2L. */
export function modeFrequencies(L: number, centreHz: number, count: number): { m: number; nu: number }[] {
  const d = modeSpacing(L);
  const m0 = Math.round(centreHz / d) - Math.floor(count / 2);
  const out: { m: number; nu: number }[] = [];
  for (let i = 0; i < count; i++) out.push({ m: m0 + i, nu: (m0 + i) * d });
  return out;
}

/** Precomputed coefficients for fast stepping. Refresh with `coeffs()` when parameters change. */
export interface Coeffs {
  Rp: number;
  invTau: number;
  B: number;
  /** 1/tau_c for the open cavity. */
  invTc: number;
  betaOverTau: number;
  /** Largest allowed step (s). */
  hmax: number;
}

export function coeffs(p: LaserParams, extraLoss = 0): Coeffs {
  const tcOpen = cavityLifetime(p);
  return {
    Rp: pumpRate(p),
    invTau: 1 / p.tau,
    B: coefB(p),
    invTc: 1 / cavityLifetime(p, extraLoss),
    betaOverTau: p.beta / p.tau,
    hmax: tcOpen / 5,
  };
}

/**
 * One Strang-split step. Each half is solved exactly with the other variable frozen,
 * so the scheme stays stable when a Q-switch makes the cavity loss enormous.
 * State s = [N, q, qmax]. Returns nothing, updates s in place.
 */
export function step(s: Float64Array, c: Coeffs, h: number): void {
  // Half step for N: dN/dt = Rp - a N
  let a = c.invTau + c.B * s[1];
  let Neq = c.Rp / a;
  s[0] = Neq + (s[0] - Neq) * Math.exp(-a * h * 0.5);
  // Full step for q: dq/dt = S - k q
  const k = c.invTc - c.B * s[0];
  const S = c.betaOverTau * s[0];
  if (Math.abs(k * h) < 1e-9) s[1] += (S - k * s[1]) * h;
  else {
    const qe = S / k;
    s[1] = qe + (s[1] - qe) * Math.exp(-k * h);
  }
  if (s[1] < 0) s[1] = 0;
  // Half step for N
  a = c.invTau + c.B * s[1];
  Neq = c.Rp / a;
  s[0] = Neq + (s[0] - Neq) * Math.exp(-a * h * 0.5);
  if (s[1] > s[2]) s[2] = s[1];
}

/** Advance by T seconds with adaptive substeps. Returns the number of steps taken. s[2] keeps the running max of q. */
export function advance(s: Float64Array, c: Coeffs, T: number): number {
  let left = T;
  let n = 0;
  while (left > 0) {
    const grow = c.B * s[0] - c.invTc;
    const rate = (grow > 0 ? grow : 0) + c.B * s[1] + c.invTau;
    let h = Math.min(c.hmax, 0.05 / rate, left);
    if (h < 1e-15) h = left;
    step(s, c, h);
    left -= h;
    n++;
  }
  return n;
}
