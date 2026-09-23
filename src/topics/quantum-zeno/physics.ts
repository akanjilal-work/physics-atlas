// Quantum Zeno effect: pure math, no DOM.
//
// A two-level system is driven on resonance at Rabi frequency Omega (rotating
// frame, H = (Omega/2) sigma_x). Every pure state it visits lies on one great
// circle of the Bloch sphere, so each state is stored as one angle beta:
//   Bloch vector r = (0, -sin beta, cos beta),  beta = 0 is |0>, beta = pi is |1>.
// Free evolution adds Omega * t to beta. A projective measurement along an axis
// in the same plane at angle alpha gives "+" with probability cos^2((beta-alpha)/2)
// and leaves the state at alpha (or alpha + pi for "-").

export const TWO_PI = Math.PI * 2;

/** Seeded uniform generator in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Plain Rabi flopping from |0>: probability to still read 0 after time t. */
export function rabiP0(Omega: number, t: number): number {
  const c = Math.cos((Omega * t) / 2);
  return c * c;
}

/** Probability that one interval tau of driving leaves the state in |0>. */
export function stayProb(Omega: number, tau: number): number {
  return rabiP0(Omega, tau);
}

/** Headline result: survival after N measurements spaced tau, P = cos^{2N}(Omega tau / 2). */
export function zenoSurvival(Omega: number, tau: number, N: number): number {
  return Math.pow(stayProb(Omega, tau), N);
}

/**
 * Survival at a time t that may fall between measurements: all k completed
 * measurements read 0, and a measurement made now would read 0 too.
 * tau <= 0 or non-finite means no measurements (plain Rabi).
 */
export function survivalAt(Omega: number, tau: number, t: number): number {
  if (!(tau > 0) || !Number.isFinite(tau)) return rabiP0(Omega, t);
  const k = Math.floor(t / tau + 1e-9);
  return Math.pow(stayProb(Omega, tau), k) * rabiP0(Omega, t - k * tau);
}

/** Survival at one pi-pulse time with m equally spaced measurements (m = 0: free Rabi, P = 0). */
export function survivalAtPi(m: number): number {
  if (m <= 0) return 0;
  return Math.pow(Math.cos(Math.PI / (2 * m)), 2 * m);
}

/** Smallest m with survivalAtPi(m) > p. */
export function firstMAbove(p: number, mMax = 10000): number {
  for (let m = 1; m <= mMax; m++) if (survivalAtPi(m) > p) return m;
  return -1;
}

/**
 * Population of |0> after N measurements, counting states that jumped away and
 * came back. Two-state Markov chain with flip probability s = sin^2(Omega tau/2):
 * P0 = 1/2 + 1/2 (1 - 2s)^N = 1/2 + 1/2 cos^N(Omega tau).
 */
export function populationAfter(Omega: number, tau: number, N: number): number {
  return 0.5 + 0.5 * Math.pow(Math.cos(Omega * tau), N);
}

/** Axis angles for Zeno dragging: measurement k is at min(pi, k * step), until pi is reached. */
export function dragAngles(step: number, out: number[] = []): number[] {
  out.length = 0;
  if (!(step > 0)) return out;
  const n = Math.ceil(Math.PI / step - 1e-9);
  for (let k = 1; k <= n; k++) out.push(Math.min(Math.PI, k * step));
  return out;
}

/**
 * Probability that a state starting on the first axis (angle 0) is found along
 * the final axis after measurements at the given angles. Each step of size d keeps
 * alignment with cos^2(d/2) and restores it from the opposite pole with sin^2(d/2),
 * so the aligned population obeys a_k = 1/2 + 1/2 prod cos(d_j).
 */
export function dragFidelity(angles: ArrayLike<number>, upto = angles.length): number {
  let prod = 1;
  let prev = 0;
  for (let k = 0; k < upto; k++) {
    prod *= Math.cos(angles[k] - prev);
    prev = angles[k];
  }
  return 0.5 + 0.5 * prod;
}

/** Dragging with N equal steps from |0> to |1>. */
export function dragFidelityUniform(N: number): number {
  return 0.5 + 0.5 * Math.pow(Math.cos(Math.PI / N), N);
}

/** Probability that every one of the dragging measurements reads "+" (the Zeno-freeze analogue). */
export function dragAllPlus(angles: ArrayLike<number>): number {
  let p = 1;
  let prev = 0;
  for (let k = 0; k < angles.length; k++) {
    const c = Math.cos((angles[k] - prev) / 2);
    p *= c * c;
    prev = angles[k];
  }
  return p;
}

// ---------------------------------------------------------------------------
// Ensemble of quantum-jump trajectories

export interface Ensemble {
  /** Current angle of each trajectory on the great circle. */
  beta: Float64Array;
  /** 1 once a trajectory has ever given the "-" (away) outcome. */
  failed: Uint8Array;
  /** Outcome of the last measurement: 1 for "+", 0 for "-". */
  plus: Uint8Array;
  /** Set when a measurement moved the state by a visible jump. The caller clears it. */
  jumped: Uint8Array;
  n: number;
}

export function makeEnsemble(n: number): Ensemble {
  return { beta: new Float64Array(n), failed: new Uint8Array(n), plus: new Uint8Array(n).fill(1), jumped: new Uint8Array(n), n };
}

export function resetEnsemble(e: Ensemble, beta0 = 0): void {
  e.beta.fill(beta0);
  e.failed.fill(0);
  e.plus.fill(1);
  e.jumped.fill(0);
}

/** Free Rabi rotation of every trajectory by angle Omega * dt. */
export function rotateAll(e: Ensemble, angle: number): void {
  const b = e.beta;
  for (let i = 0; i < e.n; i++) {
    let x = b[i] + angle;
    if (x >= TWO_PI) x -= TWO_PI * Math.floor(x / TWO_PI);
    b[i] = x;
  }
}

/** Projective measurement along the in-plane axis at angle alpha. Returns the number of "+" results. */
export function measureAll(e: Ensemble, alpha: number, rand: () => number): number {
  let k = 0;
  const b = e.beta;
  for (let i = 0; i < e.n; i++) {
    const c = Math.cos((b[i] - alpha) / 2);
    const plus = rand() < c * c;
    const nb = plus ? alpha : alpha + Math.PI;
    if (Math.abs(Math.sin((nb - b[i]) / 2)) > 0.2) e.jumped[i] = 1;
    b[i] = nb;
    e.plus[i] = plus ? 1 : 0;
    if (plus) k++;
    else e.failed[i] = 1;
  }
  return k;
}

/**
 * Anti-Zeno toy: each surviving trajectory decays (jumps to beta = pi) with
 * probability q during one interval. Returns the number still undecayed.
 */
export function decayAll(e: Ensemble, q: number, rand: () => number): number {
  let k = 0;
  for (let i = 0; i < e.n; i++) {
    if (e.failed[i]) continue;
    if (rand() < q) {
      e.failed[i] = 1;
      e.plus[i] = 0;
      e.beta[i] = Math.PI;
      e.jumped[i] = 1;
    } else k++;
  }
  return k;
}

/** Fraction of trajectories that have never failed. */
export function survivorFraction(e: Ensemble): number {
  let s = 0;
  for (let i = 0; i < e.n; i++) if (!e.failed[i]) s++;
  return s / e.n;
}

/** Monte Carlo estimate of Zeno survival: M trajectories, N measurements spaced tau. */
export function simulateSurvival(Omega: number, tau: number, N: number, M: number, rand: () => number): number {
  const e = makeEnsemble(M);
  for (let k = 0; k < N; k++) {
    rotateAll(e, Omega * tau);
    measureAll(e, 0, rand);
  }
  return survivorFraction(e);
}

/** Monte Carlo estimate of dragging fidelity: fraction found along the last axis. */
export function simulateDrag(angles: ArrayLike<number>, M: number, rand: () => number): number {
  const e = makeEnsemble(M);
  let k = 0;
  for (let j = 0; j < angles.length; j++) k = measureAll(e, angles[j], rand);
  return angles.length ? k / M : 1;
}

// ---------------------------------------------------------------------------
// Anti-Zeno toy model (Kofman and Kurizki, Nature 405, 546, 2000).
// An excited level at frequency w_a decays into a continuum whose coupling
// spectrum is a Lorentzian of half-width b centred at w_0, detuned by
// Delta = w_a - w_0. With golden-rule rate Gamma0 on the peak:
//   G(w) = (Gamma0 / 2 pi) b^2 / ((w - w0)^2 + b^2)
// Measurements every tau broaden the level by the filter
//   F_tau(x) = (tau / 2 pi) sinc^2(x tau / 2)
// and the effective decay rate is the overlap Gamma(tau) = 2 pi Int G(w) F_tau(w - w_a) dw.

/** Golden-rule (unmeasured, long-time) decay rate at detuning Delta. */
export function goldenRate(Gamma0: number, b: number, Delta: number): number {
  return (Gamma0 * b * b) / (Delta * Delta + b * b);
}

/**
 * Closed form of the overlap integral for the Lorentzian continuum.
 * With z = b - i Delta: Gamma(tau) = Gamma0 b Re[ 1/z - (1 - e^{-z tau}) / (z^2 tau) ].
 */
export function measuredRate(Gamma0: number, b: number, Delta: number, tau: number): number {
  if (!(tau > 0)) return 0;
  if (!Number.isFinite(tau)) return goldenRate(Gamma0, b, Delta);
  // complex helpers written out: z = (b, -Delta)
  const zr = b, zi = -Delta;
  const zz = zr * zr + zi * zi;
  // Re(1/z)
  const invR = zr / zz;
  // z^2
  const z2r = zr * zr - zi * zi, z2i = 2 * zr * zi;
  // 1 - e^{-z tau}
  const ex = Math.exp(-zr * tau);
  const er = 1 - ex * Math.cos(zi * tau);
  const ei = ex * Math.sin(zi * tau);
  // (er + i ei) / (z2 * tau), real part only
  const d = (z2r * z2r + z2i * z2i) * tau;
  const qr = (er * z2r + ei * z2i) / d;
  return Gamma0 * b * (invR - qr);
}

/** Direct numerical overlap integral, for testing the closed form. */
export function measuredRateNumeric(Gamma0: number, b: number, Delta: number, tau: number, steps = 400000): number {
  // x = w - w_a. G(w) = (Gamma0/2pi) L(x + Delta).
  // Substitute x = S tan(u) to cover the whole real line.
  const S = Math.max(b, Math.abs(Delta), 1 / tau);
  let sum = 0;
  const h = Math.PI / steps;
  for (let k = 0; k < steps; k++) {
    const u = -Math.PI / 2 + (k + 0.5) * h;
    const x = S * Math.tan(u);
    const jac = S / (Math.cos(u) * Math.cos(u));
    const y = x + Delta;
    const G = (Gamma0 / TWO_PI) * (b * b) / (y * y + b * b);
    const a = (x * tau) / 2;
    const sinc = Math.abs(a) < 1e-8 ? 1 : Math.sin(a) / a;
    const F = (tau / TWO_PI) * sinc * sinc;
    sum += G * F * jac;
  }
  return TWO_PI * sum * h;
}
