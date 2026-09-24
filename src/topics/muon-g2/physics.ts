// Muon g-2: spin precession in a storage ring, time-dilated decay, the
// parity-violating "wiggle" in the decay-positron count, and a 5-parameter fit.
// Pure math. No DOM, no Three.js. SI units unless a name says otherwise.

// ---------------------------------------------------------------- constants (CODATA 2018 / PDG)

export const C_LIGHT = 299792458; // m/s
export const E_CHARGE = 1.602176634e-19; // C (exact)
export const M_MU_KG = 1.883531627e-28; // kg
export const M_MU_MEV = 105.6583755; // MeV/c^2
export const M_E_MEV = 0.51099895; // MeV/c^2
/** Muon lifetime at rest, seconds. */
export const TAU_MU = 2.1969811e-6;
/** e / m_mu in C/kg. */
export const E_OVER_M = E_CHARGE / M_MU_KG;

/** Fermilab E989 final (Runs 1 to 6), arXiv:2506.03069: 116 592 070.5(14.8) x 1e-11. */
export const A_MU_FNAL = 116592070.5e-11;
export const A_MU_FNAL_ERR = 14.8e-11;
/** World average (FNAL + BNL), same paper: 116 592 071.5(14.5) x 1e-11. */
export const A_MU_WORLD = 116592071.5e-11;
export const A_MU_WORLD_ERR = 14.5e-11;
/** 2025 Theory Initiative white paper (lattice HVP), arXiv:2505.21476: 116 592 033(62) x 1e-11. */
export const A_MU_SM_2025 = 116592033e-11;
export const A_MU_SM_2025_ERR = 62e-11;
/** 2020 white paper (data-driven HVP): 116 591 810(43) x 1e-11. */
export const A_MU_SM_2020 = 116591810e-11;
export const A_MU_SM_2020_ERR = 43e-11;
/** April 2021 experimental average (FNAL Run-1 + BNL): 116 592 061(41) x 1e-11. */
export const A_MU_EXP_2021 = 116592061e-11;
export const A_MU_EXP_2021_ERR = 41e-11;

/** Asymmetry of the positron count used in the demo (similar in size to the real experiment). */
export const ASYM = 0.4;

// ---------------------------------------------------------------- kinematics

/** Lorentz factor for momentum p in GeV/c. */
export function gammaFromP(pGeV: number): number {
  const x = (pGeV * 1000) / M_MU_MEV;
  return Math.sqrt(1 + x * x);
}

export function betaFromGamma(g: number): number {
  return Math.sqrt(1 - 1 / (g * g));
}

/** The magic Lorentz factor, where the electric-field term in the spin equation vanishes. */
export function magicGamma(a: number): number {
  return Math.sqrt(1 + 1 / a);
}

/** Magic momentum in GeV/c: p = m c beta gamma = m / sqrt(a). */
export function magicMomentum(a: number): number {
  return M_MU_MEV / Math.sqrt(a) / 1000;
}

/** Dilated lifetime in seconds. */
export function labLifetime(g: number): number {
  return g * TAU_MU;
}

/** Cyclotron angular frequency, rad/s. */
export function omegaC(B: number, g: number): number {
  return (E_OVER_M * B) / g;
}

/** Spin precession angular frequency in the lab (no electric field), rad/s. Thomas-BMT. */
export function omegaS(B: number, g: number, a: number): number {
  return (E_OVER_M * B) / g + a * E_OVER_M * B;
}

/** Anomalous precession, rad/s. Spin angle relative to momentum grows at this rate. */
export function omegaA(B: number, a: number): number {
  return a * E_OVER_M * B;
}

/** Coefficient of the beta x E term: a - 1/(gamma^2 - 1). Zero at the magic gamma. */
export function eFieldCoefficient(a: number, g: number): number {
  return a - 1 / (g * g - 1);
}

/**
 * Full horizontal anomalous precession with a radial electric field Er (V/m), rad/s:
 * omega_a = (e/m) [ a B - (a - 1/(gamma^2-1)) beta Er / c ].
 */
export function omegaAWithE(B: number, a: number, g: number, Er: number): number {
  return E_OVER_M * (a * B - eFieldCoefficient(a, g) * betaFromGamma(g) * (Er / C_LIGHT));
}

/** Orbit radius in metres for momentum p (GeV/c) in field B (T). */
export function orbitRadius(pGeV: number, B: number): number {
  return pGeV / (0.299792458 * B);
}

/** Heavy new-physics sensitivity ratio muon/electron: (m_mu/m_e)^2. */
export function massRatioSquared(): number {
  const r = M_MU_MEV / M_E_MEV;
  return r * r;
}

/** Tension in standard deviations between two values with independent errors. */
export function tension(x1: number, e1: number, x2: number, e2: number): number {
  return Math.abs(x1 - x2) / Math.hypot(e1, e2);
}

// ---------------------------------------------------------------- random numbers

/** Small seeded PRNG (mulberry32). Returns a function giving uniforms in [0, 1). */
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

// ---------------------------------------------------------------- wiggle plot

/** Expected count shape N(t) = N0 e^{-t/tau} (1 + A cos(w t + phi)). */
export function wiggle(t: number, N0: number, tau: number, A: number, w: number, phi: number): number {
  return N0 * Math.exp(-t / tau) * (1 + A * Math.cos(w * t + phi));
}

/**
 * Simulate n muon decays and add the accepted (high-energy) positrons to hist.
 * Times in microseconds. tau = dilated lifetime, w = omega_a in rad/us.
 * A positron is counted with probability (1 + A cos(w t + phi)) / 2.
 * Returns the number counted. No allocation.
 */
export function sampleDecays(
  rand: () => number, n: number, hist: Float64Array, binW: number,
  tau: number, A: number, w: number, phi: number,
): number {
  const tMax = hist.length * binW;
  let got = 0;
  for (let k = 0; k < n; k++) {
    const t = -tau * Math.log(1 - rand());
    if (t >= tMax) continue;
    if (rand() * 2 > 1 + A * Math.cos(w * t + phi)) continue;
    hist[Math.floor(t / binW)] += 1;
    got++;
  }
  return got;
}

export interface WiggleFit {
  ok: boolean;
  N0: number;
  tau: number;
  A: number;
  omega: number;
  phi: number;
  /** One-sigma statistical error on omega from the fit covariance. */
  sigmaOmega: number;
  chi2ndf: number;
  counts: number;
}

const FAIL: WiggleFit = { ok: false, N0: 0, tau: 0, A: 0, omega: 0, phi: 0, sigmaOmega: 0, chi2ndf: 0, counts: 0 };

/** Solve the n x n system M x = v in place (Gaussian elimination, partial pivoting). */
function solve(M: Float64Array, v: Float64Array, n: number): boolean {
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r * n + c]) > Math.abs(M[piv * n + c])) piv = r;
    if (Math.abs(M[piv * n + c]) < 1e-300) return false;
    if (piv !== c) {
      for (let k = 0; k < n; k++) { const tmp = M[c * n + k]; M[c * n + k] = M[piv * n + k]; M[piv * n + k] = tmp; }
      const tv = v[c]; v[c] = v[piv]; v[piv] = tv;
    }
    for (let r = c + 1; r < n; r++) {
      const f = M[r * n + c] / M[c * n + c];
      if (f === 0) continue;
      for (let k = c; k < n; k++) M[r * n + k] -= f * M[c * n + k];
      v[r] -= f * v[c];
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    let s = v[r];
    for (let k = r + 1; k < n; k++) s -= M[r * n + k] * v[k];
    v[r] = s / M[r * n + r];
  }
  return true;
}

/**
 * Fit N(t) = N0 e^{-t/tau} (1 + A cos(w t + phi)) to a histogram with bins of width binW (us).
 * 1. lifetime from a weighted log-linear fit, 2. frequency from a weighted periodogram
 * of the residual ratio, 3. Levenberg-Marquardt on all five parameters with Pearson weights.
 */
export function fitWiggle(hist: Float64Array, binW: number): WiggleFit {
  const n = hist.length;
  let total = 0;
  let last = 0;
  for (let i = 0; i < n; i++) { total += hist[i]; if (hist[i] > 0) last = i; }
  if (total < 400 || last < 20) return { ...FAIL, counts: total };

  // 1. log-linear fit for N0 and tau (the wiggle averages out over many periods).
  let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i <= last; i++) {
    const c = hist[i];
    if (c < 4) continue;
    const t = (i + 0.5) * binW;
    const y = Math.log(c);
    sw += c; sx += c * t; sy += c * y; sxx += c * t * t; sxy += c * t * y;
  }
  const den = sw * sxx - sx * sx;
  if (sw === 0 || den <= 0) return { ...FAIL, counts: total };
  const slope = (sw * sxy - sx * sy) / den;
  if (!(slope < 0)) return { ...FAIL, counts: total };
  let tau = -1 / slope;
  let N0 = Math.exp((sy - slope * sx) / sw);

  // 2. periodogram of r = c / model - 1, weighted by the model (Poisson variance of r is 1/model).
  const T = (last + 1) * binW;
  const wMin = (2 * Math.PI) / T;
  const wMax = Math.PI / binW;
  const dW = (2 * Math.PI) / (T * 6);
  let bestW = 0, bestS = -Infinity;
  for (let w = wMin; w <= wMax; w += dW) {
    let cc = 0, ss = 0, cs = 0, rc = 0, rs = 0;
    for (let i = 0; i <= last; i++) {
      const t = (i + 0.5) * binW;
      const m = N0 * Math.exp(-t / tau);
      if (m <= 0) continue;
      const r = hist[i] / m - 1;
      const co = Math.cos(w * t), si = Math.sin(w * t);
      cc += m * co * co; ss += m * si * si; cs += m * co * si; rc += m * r * co; rs += m * r * si;
    }
    const d = cc * ss - cs * cs;
    if (d <= 0) continue;
    const a = (rc * ss - rs * cs) / d;
    const b = (rs * cc - rc * cs) / d;
    const score = a * rc + b * rs;
    if (score > bestS) { bestS = score; bestW = w; }
  }
  if (bestW === 0) return { ...FAIL, counts: total };
  // amplitude and phase at the best frequency
  let cc = 0, ss = 0, cs = 0, rc = 0, rs = 0;
  for (let i = 0; i <= last; i++) {
    const t = (i + 0.5) * binW;
    const m = N0 * Math.exp(-t / tau);
    const r = hist[i] / m - 1;
    const co = Math.cos(bestW * t), si = Math.sin(bestW * t);
    cc += m * co * co; ss += m * si * si; cs += m * co * si; rc += m * r * co; rs += m * r * si;
  }
  const d0 = cc * ss - cs * cs;
  const ca = (rc * ss - rs * cs) / d0;
  const sb = (rs * cc - rc * cs) / d0;
  // A cos(wt + phi) = A cos phi cos wt - A sin phi sin wt
  let A = Math.hypot(ca, sb);
  let phi = Math.atan2(-sb, ca);
  let w = bestW;

  // 3. Levenberg-Marquardt, p = [N0, tau, A, w, phi]
  const P = 5;
  const JTJ = new Float64Array(P * P);
  const JTr = new Float64Array(P);
  const Mm = new Float64Array(P * P);
  const step = new Float64Array(P);
  const J = new Float64Array(P);
  const chi2 = (N0_: number, tau_: number, A_: number, w_: number, phi_: number) => {
    let s = 0;
    for (let i = 0; i <= last; i++) {
      const t = (i + 0.5) * binW;
      const m = wiggle(t, N0_, tau_, A_, w_, phi_);
      const r = hist[i] - m;
      s += (r * r) / Math.max(m, 1);
    }
    return s;
  };
  let lambda = 1e-3;
  let cur = chi2(N0, tau, A, w, phi);
  const buildNormal = () => {
    JTJ.fill(0); JTr.fill(0);
    for (let i = 0; i <= last; i++) {
      const t = (i + 0.5) * binW;
      const e = Math.exp(-t / tau);
      const cw = Math.cos(w * t + phi), sw_ = Math.sin(w * t + phi);
      const m = N0 * e * (1 + A * cw);
      const wt = 1 / Math.max(m, 1);
      J[0] = e * (1 + A * cw);
      J[1] = (m * t) / (tau * tau);
      J[2] = N0 * e * cw;
      J[3] = -N0 * e * A * sw_ * t;
      J[4] = -N0 * e * A * sw_;
      const r = hist[i] - m;
      for (let a = 0; a < P; a++) {
        JTr[a] += wt * J[a] * r;
        for (let b = 0; b < P; b++) JTJ[a * P + b] += wt * J[a] * J[b];
      }
    }
  };
  for (let it = 0; it < 40; it++) {
    buildNormal();
    let improved = false;
    for (let tries = 0; tries < 8; tries++) {
      Mm.set(JTJ);
      for (let a = 0; a < P; a++) Mm[a * P + a] *= 1 + lambda;
      step.set(JTr);
      if (!solve(Mm, step, P)) { lambda *= 10; continue; }
      const nN0 = N0 + step[0], nTau = tau + step[1], nA = A + step[2], nW = w + step[3], nPhi = phi + step[4];
      if (!(nN0 > 0 && nTau > 0)) { lambda *= 10; continue; }
      const c2 = chi2(nN0, nTau, nA, nW, nPhi);
      if (c2 < cur) {
        const rel = (cur - c2) / cur;
        N0 = nN0; tau = nTau; A = nA; w = nW; phi = nPhi; cur = c2;
        lambda = Math.max(1e-9, lambda / 10);
        improved = true;
        if (rel < 1e-10) it = 1000;
        break;
      }
      lambda *= 10;
    }
    if (!improved) break;
  }
  if (A < 0) { A = -A; phi += Math.PI; }
  phi = Math.atan2(Math.sin(phi), Math.cos(phi));

  // covariance of omega from the inverse of J^T W J at the minimum
  buildNormal();
  Mm.set(JTJ);
  step.fill(0);
  step[3] = 1;
  const okCov = solve(Mm, step, P);
  const ndf = Math.max(1, last + 1 - P);
  const chi2ndf = cur / ndf;
  const sigmaOmega = okCov && step[3] > 0 ? Math.sqrt(step[3] * Math.max(1, chi2ndf)) : Infinity;
  return { ok: Number.isFinite(w) && w > 0 && A > 0.02, N0, tau, A, omega: w, phi, sigmaOmega, chi2ndf, counts: total };
}

/**
 * Number of wiggle periods that stand above Poisson noise: the wiggle amplitude A N(t)
 * exceeds 3 sqrt(N(t)) per bin, i.e. N(t) A^2 > 9, up to time tEnd.
 */
export function visibleOscillations(f: WiggleFit, tEnd: number): number {
  if (!f.ok) return 0;
  const need = 9 / (f.A * f.A);
  if (f.N0 <= need) return 0;
  const tVis = Math.min(tEnd, f.tau * Math.log(f.N0 / need));
  return (f.omega * tVis) / (2 * Math.PI);
}
