// Pure physics for "Why Is There Matter?". No DOM, no Three.js.
//
// Part 1: a toy freeze-out model of particle/antiparticle annihilation in a
// cooling, expanding box. Yields Y (particles) and Yb (antiparticles) are per
// comoving volume, normalised so a massless species in equilibrium has Y = 1.
// The difference D = Y - Yb is conserved. The Boltzmann equation in x = m/T is
//   dYb/dx = -(lambda / x^2) * (Y*Yb - Yeq(x)^2),
// the standard Lee-Weinberg form for s-wave annihilation.
//
// Part 2: neutral kaon mixing with the effective Hamiltonian H = M - i Gamma/2,
// built from published PDG values.

// ---------------------------------------------------------------------------
// Part 1. Toy annihilation
// ---------------------------------------------------------------------------

/** Baryon-to-photon ratio from Planck 2018 and BBN (PDG): about 6.1e-10. */
export const ETA_OBSERVED = 6.1e-10;

/** Interpolated Maxwell-Boltzmann equilibrium yield: 1 when hot (x << 1), sqrt(pi/8) x^1.5 e^-x when cold. */
export function yEq(x: number): number {
  return (1 + Math.sqrt(Math.PI / 8) * Math.pow(x, 1.5)) * Math.exp(-x);
}

/** Equilibrium split for a conserved excess D: Y*Yb = Yeq^2, Y - Yb = D. Returns Yb. */
export function antiInEquilibrium(D: number, ye: number): number {
  const s = Math.sqrt(D * D + 4 * ye * ye);
  return D >= 0 ? (2 * ye * ye) / (D + s) : (-D + s) / 2; // stable form of (-D + s)/2
}

export interface ToyParams {
  /** Bias epsilon: the conserved excess D = Y - Yb as a fraction of the starting equilibrium yield. */
  bias: number;
  /** Annihilation strength lambda (large = annihilation much faster than expansion). */
  lambda: number;
  x0?: number;
  x1?: number;
  steps?: number;
}

export interface ToyHistory {
  x: Float64Array;
  Y: Float64Array;
  Yb: Float64Array;
  bias: number;
  /** Particles surviving at the end divided by particles at the start. */
  survivorFraction: number;
  /** Antiparticles surviving at the end divided by antiparticles at the start. */
  antiFraction: number;
}

/**
 * One backward (implicit) Euler step of dYb/dx = -(k/x^2)(Yb(Yb+D) - Yeq^2).
 * The implicit equation is a quadratic, solved exactly with a cancellation-free root.
 * Unconditionally stable and always positive, which matters because lambda can be 1e13.
 */
export function implicitStep(Yb: number, D: number, lambda: number, x1: number, h: number): number {
  const k = (lambda * h) / (x1 * x1);
  const ye = yEq(x1);
  const a = k;
  const b = 1 + k * D;
  const c = Yb + k * ye * ye;
  return (2 * c) / (b + Math.sqrt(b * b + 4 * a * c));
}

/** Integrate the toy model on a log grid in x. Steps are fixed, so the result is reproducible. */
export function toyHistory(p: ToyParams): ToyHistory {
  const x0 = p.x0 ?? 0.1;
  const x1 = p.x1 ?? 1000;
  const n = p.steps ?? 3000;
  // The bias is measured relative to the starting equilibrium yield, so survivors = bias when annihilation is complete.
  const D = Math.max(0, p.bias) * yEq(x0);
  const x = new Float64Array(n + 1);
  const Y = new Float64Array(n + 1);
  const Yb = new Float64Array(n + 1);
  const u0 = Math.log(x0);
  const du = (Math.log(x1) - u0) / n;
  x[0] = x0;
  Yb[0] = antiInEquilibrium(D, yEq(x0));
  Y[0] = Yb[0] + D;
  for (let i = 1; i <= n; i++) {
    x[i] = Math.exp(u0 + i * du);
    const h = x[i] - x[i - 1];
    Yb[i] = implicitStep(Yb[i - 1], D, p.lambda, x[i], h);
    Y[i] = Yb[i] + D;
  }
  return { x, Y, Yb, bias: D, survivorFraction: Y[n] / Y[0], antiFraction: Yb[n] / Yb[0] };
}

/**
 * Exact solution once pair creation has switched off (Yeq = 0):
 * dYb/ds = -Yb (Yb + D) with s = lambda (1/xa - 1/x). A Bernoulli equation.
 */
export function annihilationClosedForm(Yb0: number, D: number, lambda: number, xa: number, x: number): number {
  const s = lambda * (1 / xa - 1 / x);
  if (D === 0) return Yb0 / (1 + Yb0 * s);
  const e = Math.exp(-D * s);
  return (D * Yb0 * e) / (D + Yb0 * (1 - e));
}

/** Compressed log mapping from a yield to a number of visible sparks. Y = 1e-9 still shows about 1 %. */
export function visibleCount(Y: number, N: number, decades = 10): number {
  if (!(Y > 0)) return 0;
  const f = Math.min(1, Math.max(0, 1 + Math.log10(Y) / decades));
  return Math.round(N * f * f);
}

// ---------------------------------------------------------------------------
// Part 2. Neutral kaons (PDG values)
// ---------------------------------------------------------------------------

/** K_S mean life, ns (PDG: 0.8954e-10 s). */
export const TAU_S = 0.08954;
/** K_L mean life, ns (PDG: 5.116e-8 s). */
export const TAU_L = 51.16;
/** Mass difference m_L - m_S in units of hbar per ns (PDG: 0.5293e10 hbar/s). */
export const DELTA_M = 5.293;
/** |epsilon| (PDG: 2.228e-3). */
export const EPS_ABS = 2.228e-3;
/** Phase of epsilon, degrees (superweak phase, PDG about 43.5 degrees). */
export const EPS_PHASE_DEG = 43.52;
/** Measured K_L semileptonic charge asymmetry (PDG average). */
export const DELTA_L_MEASURED = 3.32e-3;
/** Branching fractions of K_L (PDG). */
export const BR_L_PIPI = 1.967e-3 + 0.864e-3;
export const BR_L_SEMI = 0.4055 + 0.2704;

export const GAMMA_S = 1 / TAU_S;
export const GAMMA_L = 1 / TAU_L;

export interface Kaon {
  /** epsilon, real and imaginary parts. */
  er: number;
  ei: number;
  /** p and q, complex, normalised so |p|^2 + |q|^2 = 1. */
  pr: number; pi: number; qr: number; qi: number;
  /** |q/p|^2 */
  qp2: number;
}

export function makeKaon(cpViolation: boolean): Kaon {
  const a = cpViolation ? EPS_ABS : 0;
  const ph = (EPS_PHASE_DEG * Math.PI) / 180;
  const er = a * Math.cos(ph);
  const ei = a * Math.sin(ph);
  const n = Math.sqrt(2 * (1 + er * er + ei * ei));
  const pr = (1 + er) / n, pi = ei / n, qr = (1 - er) / n, qi = -ei / n;
  const qp2 = (qr * qr + qi * qi) / (pr * pr + pi * pi);
  return { er, ei, pr, pi, qr, qi, qp2 };
}

export interface KaonProbs {
  /** Probability to find K0 at proper time t (ns), starting from pure K0. */
  pK0: number;
  /** Probability to find anti-K0. */
  pK0bar: number;
  /** Squared norm of the state (probability not yet decayed). */
  norm: number;
}

/** Closed-form evolution of a state that starts as pure K0. */
export function kaonProbs(k: Kaon, t: number, out: KaonProbs): KaonProbs {
  const es = Math.exp(-GAMMA_S * t);
  const el = Math.exp(-GAMMA_L * t);
  const cr = 2 * Math.exp(-0.5 * (GAMMA_S + GAMMA_L) * t) * Math.cos(DELTA_M * t);
  const gp = 0.25 * (es + el + cr);
  const gm = 0.25 * (es + el - cr);
  out.pK0 = gp;
  out.pK0bar = k.qp2 * gm;
  // Norm of g+ K0 + (q/p) g- K0bar. K0 and K0bar are orthogonal flavour states.
  out.norm = out.pK0 + out.pK0bar;
  return out;
}

/**
 * Time-dependent decay rates (per ns) for a beam that starts as pure K0.
 * pipi: CP-even two-pion final state, with eta = A(K_L)/A(K_S) = epsilon (no direct CP violation).
 * lplus / lminus: semileptonic decays to l+ (from K0) and l- (from K0bar), Delta S = Delta Q rule.
 * other: remaining K_L channels (mostly 3 pions), treated as incoherent.
 */
export interface KaonRates {
  pipi: number;
  pipiS: number;
  pipiL: number;
  lplus: number;
  lminus: number;
  other: number;
  total: number;
}

export function kaonRates(k: Kaon, t: number, out: KaonRates, tmp: KaonProbs = { pK0: 0, pK0bar: 0, norm: 0 }): KaonRates {
  const p2 = k.pr * k.pr + k.pi * k.pi;
  const es = Math.exp(-GAMMA_S * t);
  const el = Math.exp(-GAMMA_L * t);
  const e2 = k.er * k.er + k.ei * k.ei;
  // |e_S + eps e_L|^2 with e_X = exp(-i m_X t - Gamma_X t / 2); relative phase Delta m t.
  const cross = 2 * Math.exp(-0.5 * (GAMMA_S + GAMMA_L) * t) * (k.er * Math.cos(DELTA_M * t) + k.ei * Math.sin(DELTA_M * t));
  const pref = GAMMA_S / (4 * p2);
  out.pipiS = pref * es;
  out.pipiL = pref * e2 * el;
  out.pipi = pref * (es + e2 * el + cross);
  kaonProbs(k, t, tmp);
  const gl = BR_L_SEMI * GAMMA_L; // Gamma(K0 -> l+ nu pi-) summed over e and mu
  out.lplus = gl * tmp.pK0;
  out.lminus = gl * tmp.pK0bar;
  out.other = (GAMMA_L * (1 - BR_L_SEMI - BR_L_PIPI) * el) / (4 * p2);
  out.total = out.pipi + out.lplus + out.lminus + out.other;
  return out;
}

/** Branching fraction K_L -> pi pi implied by the model: |eps|^2 Gamma_S / Gamma_L. */
export function brLpipiModel(k: Kaon): number {
  return ((k.er * k.er + k.ei * k.ei) * GAMMA_S) / GAMMA_L;
}

/** K_L semileptonic charge asymmetry: (|p|^2 - |q|^2)/(|p|^2 + |q|^2) = 2 Re(eps)/(1 + |eps|^2). */
export function deltaL(k: Kaon): number {
  const p2 = k.pr * k.pr + k.pi * k.pi;
  const q2 = k.qr * k.qr + k.qi * k.qi;
  return (p2 - q2) / (p2 + q2);
}

/** Effective Hamiltonian in the (K0, K0bar) basis, as [re, im] pairs: H11, H12, H21, H22. */
export function kaonHamiltonian(k: Kaon): Float64Array {
  // Eigenvalues lambda_S,L = m_S,L - i Gamma/2, with m_S = 0 and m_L = Delta m.
  const sr = 0, si = -GAMMA_S / 2, lr = DELTA_M, li = -GAMMA_L / 2;
  const hr = (sr + lr) / 2, hi = (si + li) / 2;
  const dr = (sr - lr) / 2, di = (si - li) / 2;
  // p/q and q/p
  const qq = k.qr * k.qr + k.qi * k.qi;
  const pqr = (k.pr * k.qr + k.pi * k.qi) / qq, pqi = (k.pi * k.qr - k.pr * k.qi) / qq;
  const pp = k.pr * k.pr + k.pi * k.pi;
  const qpr = (k.qr * k.pr + k.qi * k.pi) / pp, qpi = (k.qi * k.pr - k.qr * k.pi) / pp;
  return new Float64Array([
    hr, hi,
    pqr * dr - pqi * di, pqr * di + pqi * dr,
    qpr * dr - qpi * di, qpr * di + qpi * dr,
    hr, hi,
  ]);
}

/** RK4 step of i d psi/dt = H psi. psi = [aRe, aIm, bRe, bIm]. Used to cross-check the closed form. */
export function schrodingerStep(H: Float64Array, psi: Float64Array, h: number): void {
  const f = (s: Float64Array, o: Float64Array) => {
    // -i H s
    const ar = H[0] * s[0] - H[1] * s[1] + H[2] * s[2] - H[3] * s[3];
    const ai = H[0] * s[1] + H[1] * s[0] + H[2] * s[3] + H[3] * s[2];
    const br = H[4] * s[0] - H[5] * s[1] + H[6] * s[2] - H[7] * s[3];
    const bi = H[4] * s[1] + H[5] * s[0] + H[6] * s[3] + H[7] * s[2];
    o[0] = ai; o[1] = -ar; o[2] = bi; o[3] = -br;
  };
  const k1 = new Float64Array(4), k2 = new Float64Array(4), k3 = new Float64Array(4), k4 = new Float64Array(4), s = new Float64Array(4);
  f(psi, k1);
  for (let i = 0; i < 4; i++) s[i] = psi[i] + 0.5 * h * k1[i];
  f(s, k2);
  for (let i = 0; i < 4; i++) s[i] = psi[i] + 0.5 * h * k2[i];
  f(s, k3);
  for (let i = 0; i < 4; i++) s[i] = psi[i] + h * k3[i];
  f(s, k4);
  for (let i = 0; i < 4; i++) psi[i] += (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
}

/** Cumulative decay-time table for sampling decay times on a log grid from tMin to tMax (ns). */
export interface DecayTable { t: Float64Array; cdf: Float64Array }

export function decayTable(k: Kaon, tMin: number, tMax: number, n: number): DecayTable {
  const t = new Float64Array(n + 1);
  const cdf = new Float64Array(n + 1);
  const r: KaonRates = { pipi: 0, pipiS: 0, pipiL: 0, lplus: 0, lminus: 0, other: 0, total: 0 };
  const l0 = Math.log(tMin), l1 = Math.log(tMax);
  let prev = 0;
  let prevT = 0;
  for (let i = 0; i <= n; i++) {
    t[i] = i === 0 ? 0 : Math.exp(l0 + ((i - 1) / (n - 1)) * (l1 - l0));
    const rate = kaonRates(k, t[i], r).total;
    cdf[i] = i === 0 ? 0 : cdf[i - 1] + 0.5 * (rate + prev) * (t[i] - prevT);
    prev = rate;
    prevT = t[i];
  }
  return { t, cdf };
}

/** Invert the table: u in [0, cdf_max) maps to a decay time. Returns -1 when the kaon survives past tMax. */
export function sampleDecay(tab: DecayTable, u: number): number {
  const c = tab.cdf;
  if (u >= c[c.length - 1]) return -1;
  let lo = 0, hi = c.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (c[m] <= u) lo = m;
    else hi = m;
  }
  const f = (u - c[lo]) / Math.max(1e-300, c[hi] - c[lo]);
  return tab.t[lo] + f * (tab.t[hi] - tab.t[lo]);
}
