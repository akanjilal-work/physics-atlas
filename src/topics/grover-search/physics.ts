// Grover search on an n-qubit statevector. Pure math, no DOM.
// Grover's circuit only ever produces real amplitudes (H, phase flips by -1,
// and the reflection 2|s><s| - I are all real), so a Float64Array suffices.

export const MIN_QUBITS = 2;
export const MAX_QUBITS = 10;

/** The basis state |0...0> for n qubits. */
export function zeroState(n: number, out?: Float64Array): Float64Array {
  const N = 1 << n;
  const psi = out && out.length === N ? out : new Float64Array(N);
  psi.fill(0);
  psi[0] = 1;
  return psi;
}

/** Apply H to every qubit in place (fast Walsh-Hadamard transform, normalised). */
export function hadamardAll(psi: Float64Array): Float64Array {
  const N = psi.length;
  for (let h = 1; h < N; h <<= 1) {
    for (let i = 0; i < N; i += h << 1) {
      for (let j = i; j < i + h; j++) {
        const a = psi[j];
        const b = psi[j + h];
        psi[j] = (a + b) * Math.SQRT1_2;
        psi[j + h] = (a - b) * Math.SQRT1_2;
      }
    }
  }
  return psi;
}

/** Oracle: phase flip (multiply by -1) every marked basis state, in place. */
export function oracle(psi: Float64Array, marked: Uint8Array): Float64Array {
  for (let i = 0; i < psi.length; i++) if (marked[i]) psi[i] = -psi[i];
  return psi;
}

export function mean(psi: Float64Array): number {
  let s = 0;
  for (let i = 0; i < psi.length; i++) s += psi[i];
  return s / psi.length;
}

/** Diffusion 2|s><s| - I: inversion about the mean, a_i -> 2<a> - a_i, in place. */
export function diffuse(psi: Float64Array): Float64Array {
  const m2 = 2 * mean(psi);
  for (let i = 0; i < psi.length; i++) psi[i] = m2 - psi[i];
  return psi;
}

/** The same diffusion built from gates: H^n (2|0><0| - I) H^n. Used to cross-check. */
export function diffuseByGates(psi: Float64Array): Float64Array {
  hadamardAll(psi);
  for (let i = 1; i < psi.length; i++) psi[i] = -psi[i];
  hadamardAll(psi);
  return psi;
}

/** One Grover iteration G = D O. */
export function groverIteration(psi: Float64Array, marked: Uint8Array): Float64Array {
  return diffuse(oracle(psi, marked));
}

export function norm2(psi: Float64Array): number {
  let s = 0;
  for (let i = 0; i < psi.length; i++) s += psi[i] * psi[i];
  return s;
}

/** Probability that a measurement returns a marked item. */
export function successProb(psi: Float64Array, marked: Uint8Array): number {
  let s = 0;
  for (let i = 0; i < psi.length; i++) if (marked[i]) s += psi[i] * psi[i];
  return s;
}

/** Half-angle θ with sin θ = sqrt(M/N). */
export function theta(N: number, M: number): number {
  return Math.asin(Math.sqrt(Math.min(1, Math.max(0, M / N))));
}

/** Analytic success probability after k iterations: sin²((2k+1)θ). */
export function analyticP(k: number, N: number, M: number): number {
  const s = Math.sin((2 * k + 1) * theta(N, M));
  return s * s;
}

/** Integer k that brings (2k+1)θ closest to π/2, i.e. maximises sin²((2k+1)θ). */
export function optimalK(N: number, M: number): number {
  if (M <= 0) return 0;
  return Math.max(0, Math.round(Math.PI / (4 * theta(N, M)) - 0.5));
}

/** Expected classical queries to find one of M marked items among N, sampling without replacement. */
export function classicalExpected(N: number, M: number): number {
  return (N + 1) / (M + 1);
}

/**
 * Coordinates of psi in the Grover plane:
 * w = component along |w> = (1/√M) Σ_marked |x>,
 * r = component along |r> = (1/√(N-M)) Σ_unmarked |x>.
 * Returns the angle atan2(w, r) measured from |r> toward |w>, and writes [r, w] into out.
 */
export function planeCoords(psi: Float64Array, marked: Uint8Array, out: Float64Array): number {
  let sw = 0;
  let sr = 0;
  let M = 0;
  for (let i = 0; i < psi.length; i++) {
    if (marked[i]) { sw += psi[i]; M++; } else sr += psi[i];
  }
  const U = psi.length - M;
  out[0] = U > 0 ? sr / Math.sqrt(U) : 0;
  out[1] = M > 0 ? sw / Math.sqrt(M) : 0;
  return Math.atan2(out[1], out[0]);
}

/** Pick an outcome with probability psi[i]², given a uniform random u in [0, 1). */
export function sample(psi: Float64Array, u: number): number {
  let c = 0;
  for (let i = 0; i < psi.length; i++) {
    c += psi[i] * psi[i];
    if (u < c) return i;
  }
  return psi.length - 1;
}

/** Small deterministic PRNG (mulberry32) for reproducible sampling in tests. */
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

/** M marked items spread evenly through the list, starting at `first`. */
export function spreadMarks(N: number, M: number, first: number, out?: Uint8Array): Uint8Array {
  const marks = out && out.length === N ? out : new Uint8Array(N);
  marks.fill(0);
  const step = Math.max(1, Math.floor(N / M));
  for (let j = 0; j < Math.min(M, N); j++) {
    let idx = (first + j * step) % N;
    while (marks[idx]) idx = (idx + 1) % N;
    marks[idx] = 1;
  }
  return marks;
}
