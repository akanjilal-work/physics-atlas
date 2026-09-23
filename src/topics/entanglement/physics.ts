// Bell tests with a spin singlet, compared with a local hidden-variable model.
// Pure module: no DOM, no Three.js.
//
// Convention: two spin-1/2 particles in the singlet state, each measured by a
// Stern-Gerlach analyzer turned by an angle about the common beam axis.
// Outcomes are +1 or -1. Quantum mechanics gives E(a,b) = -cos(a - b).

export type Model = 'quantum' | 'lhv';

export interface Settings {
  /** Alice's two analyzer angles (radians). */
  a: number;
  a2: number;
  /** Bob's two analyzer angles (radians). */
  b: number;
  b2: number;
}

/** Angles that maximise |S| for the singlet: |S| = 2√2. */
export const OPTIMAL: Settings = { a: 0, a2: Math.PI / 2, b: Math.PI / 4, b2: (3 * Math.PI) / 4 };

/** Small fast seeded PRNG returning uniform numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Wrap an angle into [-pi, pi). */
export function wrapPi(x: number): number {
  const t = (x + Math.PI) % (2 * Math.PI);
  return (t < 0 ? t + 2 * Math.PI : t) - Math.PI;
}

/** Singlet correlation <A B> for analyzer angles a and b. */
export function quantumE(a: number, b: number): number {
  return -Math.cos(a - b);
}

/**
 * Correlation of the local model A = sign cos(a - λ), B = -sign cos(b - λ)
 * with λ uniform on the circle. The signs differ on a fraction |Δ|/π of the circle.
 */
export function lhvE(a: number, b: number): number {
  const d = Math.abs(wrapPi(a - b));
  return -(1 - (2 * d) / Math.PI);
}

export function correlation(model: Model, a: number, b: number): number {
  return model === 'quantum' ? quantumE(a, b) : lhvE(a, b);
}

/** CHSH combination S = E(a,b) - E(a,b') + E(a',b) + E(a',b'). */
export function chsh(E: (x: number, y: number) => number, s: Settings): number {
  return E(s.a, s.b) - E(s.a, s.b2) + E(s.a2, s.b) + E(s.a2, s.b2);
}

/**
 * Joint outcome probabilities [P(++), P(+-), P(-+), P(--)] for one pair of settings.
 * Both models give marginals of exactly 1/2 on each side.
 */
export function jointProbs(model: Model, a: number, b: number, out: Float64Array | number[]): void {
  let same: number;
  if (model === 'quantum') {
    const s = Math.sin((a - b) / 2);
    same = s * s;
  } else {
    same = Math.abs(wrapPi(a - b)) / Math.PI;
  }
  out[0] = same / 2;
  out[3] = same / 2;
  out[1] = (1 - same) / 2;
  out[2] = (1 - same) / 2;
}

/**
 * Sample one detection event. Writes A and B (each +1 or -1) into out.
 * Quantum: draw from the joint singlet distribution. The code needs both
 * settings at once, which is exactly the resource a local model lacks.
 * LHV: each particle carries the shared hidden angle λ and answers alone.
 */
export function samplePair(model: Model, a: number, b: number, lambda: number, rnd: () => number, out: Int8Array | number[]): void {
  if (model === 'quantum') {
    const A = rnd() < 0.5 ? 1 : -1;
    const s = Math.sin((a - b) / 2);
    const same = rnd() < s * s;
    out[0] = A;
    out[1] = same ? A : -A;
  } else {
    out[0] = Math.cos(a - lambda) >= 0 ? 1 : -1;
    out[1] = Math.cos(b - lambda) >= 0 ? -1 : 1;
  }
}

/** Setting-pair index k: 0 = (a,b), 1 = (a,b'), 2 = (a',b), 3 = (a',b'). */
export const pairIndex = (alicePrimed: boolean, bobPrimed: boolean) => (alicePrimed ? 2 : 0) + (bobPrimed ? 1 : 0);
/** Sign of each term in S. */
export const CHSH_SIGN = [1, -1, 1, 1] as const;

export function settingAngles(s: Settings, k: number): [number, number] {
  return [k < 2 ? s.a : s.a2, k % 2 === 0 ? s.b : s.b2];
}

/** Running coincidence counts for the four CHSH setting pairs. */
export class Tally {
  /** counts[4k + o], o = 0:(+,+) 1:(+,-) 2:(-,+) 3:(-,-). */
  readonly c = new Float64Array(16);
  n = 0;

  reset(): void {
    this.c.fill(0);
    this.n = 0;
  }

  add(k: number, A: number, B: number): void {
    const o = (A > 0 ? 0 : 2) + (B > 0 ? 0 : 1);
    this.c[4 * k + o]++;
    this.n++;
  }

  count(k: number): number {
    const c = this.c;
    return c[4 * k] + c[4 * k + 1] + c[4 * k + 2] + c[4 * k + 3];
  }

  /** Measured correlation for setting pair k (0 when empty). */
  E(k: number): number {
    const n = this.count(k);
    if (n === 0) return 0;
    const c = this.c;
    return (c[4 * k] - c[4 * k + 1] - c[4 * k + 2] + c[4 * k + 3]) / n;
  }

  /** Standard error of E: the product AB is ±1, so its variance is 1 - E². */
  sigmaE(k: number): number {
    const n = this.count(k);
    if (n < 2) return 1;
    const e = this.E(k);
    return Math.sqrt(Math.max(0, 1 - e * e) / n);
  }

  /** Fraction of pairs in k with equal outcomes. */
  pSame(k: number): number {
    const n = this.count(k);
    return n === 0 ? 0 : (this.c[4 * k] + this.c[4 * k + 3]) / n;
  }

  S(): number {
    let s = 0;
    for (let k = 0; k < 4; k++) s += CHSH_SIGN[k] * this.E(k);
    return s;
  }

  sigmaS(): number {
    let v = 0;
    for (let k = 0; k < 4; k++) v += this.sigmaE(k) ** 2;
    return Math.sqrt(v);
  }

  /** P(A = +) over the pairs where Bob used b (bobPrimed = false) or b'. */
  pAliceUpGivenBob(bobPrimed: boolean): number {
    const k0 = bobPrimed ? 1 : 0;
    const k1 = k0 + 2;
    const c = this.c;
    const n = this.count(k0) + this.count(k1);
    return n === 0 ? 0.5 : (c[4 * k0] + c[4 * k0 + 1] + c[4 * k1] + c[4 * k1 + 1]) / n;
  }

  countBob(bobPrimed: boolean): number {
    const k0 = bobPrimed ? 1 : 0;
    return this.count(k0) + this.count(k0 + 2);
  }

  /** Overall P(A = +). */
  pAliceUp(): number {
    if (this.n === 0) return 0.5;
    let up = 0;
    for (let k = 0; k < 4; k++) up += this.c[4 * k] + this.c[4 * k + 1];
    return up / this.n;
  }

  /** Overall P(B = +). */
  pBobUp(): number {
    if (this.n === 0) return 0.5;
    let up = 0;
    for (let k = 0; k < 4; k++) up += this.c[4 * k] + this.c[4 * k + 2];
    return up / this.n;
  }
}

/**
 * Run n pairs of a Bell test: each side picks one of its two settings at random,
 * then outcomes are drawn from the model. Adds into the tally.
 */
export function runExperiment(model: Model, s: Settings, n: number, rnd: () => number, tally: Tally): void {
  const out = [0, 0];
  for (let i = 0; i < n; i++) {
    const k = pairIndex(rnd() < 0.5, rnd() < 0.5);
    const [x, y] = settingAngles(s, k);
    samplePair(model, x, y, 2 * Math.PI * rnd(), rnd, out);
    tally.add(k, out[0], out[1]);
  }
}
