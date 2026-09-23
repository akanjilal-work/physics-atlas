// Quantum teleportation of one qubit with a 3-qubit simulator.
// Pure module: no DOM, no Three.js.
//
// Qubit order: qubit 1 is Alice's unknown state, qubit 2 is Alice's half of the
// Bell pair, qubit 3 is Bob's half. Basis index = 4*q1 + 2*q2 + q3.
// Complex numbers are stored as separate real and imaginary Float64Arrays.

export interface CMat {
  n: number;
  re: Float64Array;
  im: Float64Array;
}

export interface CVec {
  re: Float64Array;
  im: Float64Array;
}

export const DIM = 8;

export function cmat(n: number): CMat {
  return { n, re: new Float64Array(n * n), im: new Float64Array(n * n) };
}

export function cvec(n: number): CVec {
  return { re: new Float64Array(n), im: new Float64Array(n) };
}

function mat2(a: [number, number, number, number], b: [number, number, number, number] = [0, 0, 0, 0]): CMat {
  const m = cmat(2);
  m.re.set(a);
  m.im.set(b);
  return m;
}

const S = Math.SQRT1_2;
export const I2 = mat2([1, 0, 0, 1]);
export const X = mat2([0, 1, 1, 0]);
export const Y = mat2([0, 0, 0, 0], [0, -1, 1, 0]);
export const Z = mat2([1, 0, 0, -1]);
export const H = mat2([S, S, S, -S]);

/** Matrix product C = A B. */
export function mul(a: CMat, b: CMat, out = cmat(a.n)): CMat {
  const n = a.n;
  const re = new Float64Array(n * n);
  const im = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < n; k++) {
      const ar = a.re[i * n + k];
      const ai = a.im[i * n + k];
      if (ar === 0 && ai === 0) continue;
      for (let j = 0; j < n; j++) {
        const br = b.re[k * n + j];
        const bi = b.im[k * n + j];
        re[i * n + j] += ar * br - ai * bi;
        im[i * n + j] += ar * bi + ai * br;
      }
    }
  }
  out.re.set(re);
  out.im.set(im);
  return out;
}

/** Conjugate transpose. */
export function dagger(a: CMat): CMat {
  const n = a.n;
  const o = cmat(n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      o.re[j * n + i] = a.re[i * n + j];
      o.im[j * n + i] = -a.im[i * n + j];
    }
  }
  return o;
}

/** Kronecker product A ⊗ B. */
export function kron(a: CMat, b: CMat): CMat {
  const n = a.n * b.n;
  const o = cmat(n);
  for (let i = 0; i < a.n; i++) {
    for (let j = 0; j < a.n; j++) {
      const ar = a.re[i * a.n + j];
      const ai = a.im[i * a.n + j];
      for (let k = 0; k < b.n; k++) {
        for (let l = 0; l < b.n; l++) {
          const br = b.re[k * b.n + l];
          const bi = b.im[k * b.n + l];
          const idx = (i * b.n + k) * n + (j * b.n + l);
          o.re[idx] = ar * br - ai * bi;
          o.im[idx] = ar * bi + ai * br;
        }
      }
    }
  }
  return o;
}

/** Single-qubit gate g acting on qubit q (1, 2 or 3) of the 3-qubit register. */
export function onQubit(g: CMat, q: 1 | 2 | 3): CMat {
  const f = [I2, I2, I2];
  f[q - 1] = g;
  return kron(kron(f[0], f[1]), f[2]);
}

/** CNOT with control c and target t on the 3-qubit register. */
export function cnot(c: 1 | 2 | 3, t: 1 | 2 | 3): CMat {
  const o = cmat(DIM);
  const cb = 1 << (3 - c);
  const tb = 1 << (3 - t);
  for (let i = 0; i < DIM; i++) {
    const j = i & cb ? i ^ tb : i;
    o.re[j * DIM + i] = 1;
  }
  return o;
}

/** max |U†U − I|, zero for a unitary. */
export function unitarityError(u: CMat): number {
  const p = mul(dagger(u), u);
  let e = 0;
  for (let i = 0; i < u.n; i++) {
    for (let j = 0; j < u.n; j++) {
      e = Math.max(e, Math.abs(p.re[i * u.n + j] - (i === j ? 1 : 0)), Math.abs(p.im[i * u.n + j]));
    }
  }
  return e;
}

// ---------------------------------------------------------------- states

/** Amplitudes of |ψ⟩ = cos(θ/2)|0⟩ + e^{iφ} sin(θ/2)|1⟩. */
export function psiAmps(theta: number, phi: number): { ar: number; ai: number; br: number; bi: number } {
  const c = Math.cos(theta / 2);
  const s = Math.sin(theta / 2);
  return { ar: c, ai: 0, br: s * Math.cos(phi), bi: s * Math.sin(phi) };
}

/** Initial statevector |ψ⟩₁|0⟩₂|0⟩₃. */
export function initialVector(theta: number, phi: number): CVec {
  const v = cvec(DIM);
  const p = psiAmps(theta, phi);
  v.re[0] = p.ar;
  v.im[0] = p.ai;
  v.re[4] = p.br;
  v.im[4] = p.bi;
  return v;
}

export function applyVec(u: CMat, v: CVec): CVec {
  const n = u.n;
  const o = cvec(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    let m = 0;
    for (let j = 0; j < n; j++) {
      const ur = u.re[i * n + j];
      const ui = u.im[i * n + j];
      r += ur * v.re[j] - ui * v.im[j];
      m += ur * v.im[j] + ui * v.re[j];
    }
    o.re[i] = r;
    o.im[i] = m;
  }
  return o;
}

/** |v⟩⟨v| */
export function outer(v: CVec): CMat {
  const n = v.re.length;
  const o = cmat(n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      o.re[i * n + j] = v.re[i] * v.re[j] + v.im[i] * v.im[j];
      o.im[i * n + j] = v.im[i] * v.re[j] - v.re[i] * v.im[j];
    }
  }
  return o;
}

/** ρ → U ρ U† */
export function conj(u: CMat, rho: CMat): CMat {
  return mul(mul(u, rho), dagger(u));
}

export function trace(rho: CMat): number {
  let t = 0;
  for (let i = 0; i < rho.n; i++) t += rho.re[i * rho.n + i];
  return t;
}

/** Reduced 2×2 density matrix of qubit q (trace over the other two). */
export function reduced(rho: CMat, q: 1 | 2 | 3): CMat {
  const o = cmat(2);
  const bit = 3 - q;
  for (let i = 0; i < DIM; i++) {
    for (let j = 0; j < DIM; j++) {
      // Keep only entries where the traced-out bits agree.
      if ((i & ~(1 << bit)) !== (j & ~(1 << bit))) continue;
      const a = (i >> bit) & 1;
      const b = (j >> bit) & 1;
      o.re[a * 2 + b] += rho.re[i * DIM + j];
      o.im[a * 2 + b] += rho.im[i * DIM + j];
    }
  }
  return o;
}

/** Reduced density matrix of qubits 2 and 3 (trace over qubit 1). 4×4, index 2*q2 + q3. */
export function reduced23(rho: CMat): CMat {
  const o = cmat(4);
  for (let a = 0; a < 2; a++) {
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        o.re[i * 4 + j] += rho.re[(a * 4 + i) * DIM + a * 4 + j];
        o.im[i * 4 + j] += rho.im[(a * 4 + i) * DIM + a * 4 + j];
      }
    }
  }
  return o;
}

/** Reduced density matrix of qubit 1 (trace over 2 and 3). Used by the Werner channel. */
function reduced1(rho: CMat): CMat {
  return reduced(rho, 1);
}

/** Bloch vector (x, y, z) of a 2×2 density matrix: ρ = ½(I + r·σ). */
export function bloch(r2: CMat, out: Float64Array = new Float64Array(3)): Float64Array {
  out[0] = 2 * r2.re[1];
  out[1] = -2 * r2.im[1];
  out[2] = r2.re[0] - r2.re[3];
  return out;
}

/** Fidelity ⟨ψ|ρ|ψ⟩ of a qubit density matrix with the pure state (θ, φ). */
export function fidelity(r2: CMat, theta: number, phi: number): number {
  const p = psiAmps(theta, phi);
  // ⟨ψ|ρ|ψ⟩ = Σ conj(ψ_i) ρ_ij ψ_j
  const pr = [p.ar, p.br];
  const pi = [p.ai, p.bi];
  let f = 0;
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const rr = r2.re[i * 2 + j];
      const ri = r2.im[i * 2 + j];
      // conj(ψ_i) * ρ_ij * ψ_j, real part
      const tr = rr * pr[j] - ri * pi[j];
      const ti = rr * pi[j] + ri * pr[j];
      f += pr[i] * tr + pi[i] * ti;
    }
  }
  return f;
}

/**
 * Werner noise on the pair (qubits 2 and 3): ρ → (1 − λ) ρ + λ ρ₁ ⊗ I/4.
 * Applied right after the pair is made, when qubit 1 is still a product factor.
 * λ = 0 is a perfect Bell pair, λ = 1 is white noise.
 */
export function wernerNoise(rho: CMat, lambda: number): CMat {
  const r1 = reduced1(rho);
  const o = cmat(DIM);
  for (let i = 0; i < DIM; i++) {
    for (let j = 0; j < DIM; j++) {
      const k = i * DIM + j;
      let nr = 0;
      let ni = 0;
      if ((i & 3) === (j & 3)) {
        nr = r1.re[(i >> 2) * 2 + (j >> 2)] / 4;
        ni = r1.im[(i >> 2) * 2 + (j >> 2)] / 4;
      }
      o.re[k] = (1 - lambda) * rho.re[k] + lambda * nr;
      o.im[k] = (1 - lambda) * rho.im[k] + lambda * ni;
    }
  }
  return o;
}

/** Overlap ⟨Φ⁺|ρ₂₃|Φ⁺⟩ of the shared pair. Werner: 1 − 3λ/4. */
export function pairFidelity(rho: CMat): number {
  const p = reduced23(rho);
  // |Φ+⟩ = (|00⟩ + |11⟩)/√2 → ½(ρ00,00 + ρ00,11 + ρ11,00 + ρ11,11)
  return 0.5 * (p.re[0] + p.re[3] + p.re[12] + p.re[15]);
}

/** Probability of Alice's outcome (m1, m2). */
export function outcomeProb(rho: CMat, m1: number, m2: number): number {
  const base = m1 * 4 + m2 * 2;
  return rho.re[base * DIM + base] + rho.re[(base + 1) * DIM + base + 1];
}

/** Project qubits 1 and 2 onto |m1 m2⟩ and renormalise. */
export function project(rho: CMat, m1: number, m2: number): CMat {
  const o = cmat(DIM);
  const p = outcomeProb(rho, m1, m2);
  const base = m1 * 4 + m2 * 2;
  for (let a = 0; a < 2; a++) {
    for (let b = 0; b < 2; b++) {
      const k = (base + a) * DIM + base + b;
      o.re[k] = rho.re[k] / p;
      o.im[k] = rho.im[k] / p;
    }
  }
  return o;
}

/** Non-selective measurement: keep all four outcomes, drop coherence between them. */
export function dephase12(rho: CMat): CMat {
  const o = cmat(DIM);
  for (let i = 0; i < DIM; i++) {
    for (let j = 0; j < DIM; j++) {
      if (i >> 1 !== j >> 1) continue;
      o.re[i * DIM + j] = rho.re[i * DIM + j];
      o.im[i * DIM + j] = rho.im[i * DIM + j];
    }
  }
  return o;
}

// ---------------------------------------------------------------- protocol

export const U = {
  H2: onQubit(H, 2),
  CNOT23: cnot(2, 3),
  CNOT12: cnot(1, 2),
  H1: onQubit(H, 1),
  X3: onQubit(X, 3),
  Z3: onQubit(Z, 3),
};

export const STEP_NAMES = ['prepare', 'H₂', 'CNOT₂₃', 'CNOT₁₂', 'H₁', 'measure', 'send bits', 'X^m₂', 'Z^m₁'] as const;
export const N_STEPS = STEP_NAMES.length;
export const STEP_MEASURE = 5;
export const STEP_SEND = 6;

/**
 * Density matrix after `step` steps of the protocol (0 = just prepared).
 * `lambda` is the Werner noise on the pair, (m1, m2) the measurement outcome.
 * If `forget` is true, Bob skips his correction.
 */
export function protocolState(theta: number, phi: number, lambda: number, m1: number, m2: number, forget: boolean, step: number): CMat {
  let rho = outer(initialVector(theta, phi));
  if (step >= 1) rho = conj(U.H2, rho);
  if (step >= 2) rho = wernerNoise(conj(U.CNOT23, rho), lambda);
  if (step >= 3) rho = conj(U.CNOT12, rho);
  if (step >= 4) rho = conj(U.H1, rho);
  if (step >= STEP_MEASURE) rho = project(rho, m1, m2);
  if (step >= 7 && !forget && m2 === 1) rho = conj(U.X3, rho);
  if (step >= 8 && !forget && m1 === 1) rho = conj(U.Z3, rho);
  return rho;
}

/** Bob's final state for a given outcome, and its fidelity with |ψ⟩. */
export function teleport(theta: number, phi: number, lambda: number, m1: number, m2: number, forget = false): { bob: CMat; F: number; p: number } {
  const pre = protocolState(theta, phi, lambda, 0, 0, false, 4);
  const p = outcomeProb(pre, m1, m2);
  const bob = reduced(protocolState(theta, phi, lambda, m1, m2, forget, N_STEPS - 1), 3);
  return { bob, F: fidelity(bob, theta, phi), p };
}

/** Outcome-averaged fidelity for one input state. */
export function averageFidelity(theta: number, phi: number, lambda: number, forget = false): number {
  let f = 0;
  for (let m1 = 0; m1 < 2; m1++) {
    for (let m2 = 0; m2 < 2; m2++) {
      const t = teleport(theta, phi, lambda, m1, m2, forget);
      f += t.p * t.F;
    }
  }
  return f;
}

/** Predicted teleportation fidelity for a Werner pair of singlet overlap F_pair: (1 + 2 F_pair)/3. */
export function wernerTeleportFidelity(Fpair: number): number {
  return (1 + 2 * Fpair) / 3;
}

/** Werner pair overlap with |Φ⁺⟩ for noise λ. */
export function wernerPairFidelity(lambda: number): number {
  return 1 - (3 * lambda) / 4;
}

/** Uniform random point on the Bloch sphere, returned as (θ, φ). */
export function randomAngles(rnd: () => number = Math.random): [number, number] {
  const z = 2 * rnd() - 1;
  return [Math.acos(z), 2 * Math.PI * rnd()];
}

/** Small seeded PRNG in [0, 1). */
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

/** Draw an outcome from the four probabilities of a post-H₁ state. */
export function sampleOutcome(rho: CMat, u: number): [number, number] {
  let acc = 0;
  for (let k = 0; k < 4; k++) {
    acc += outcomeProb(rho, k >> 1, k & 1);
    if (u < acc) return [k >> 1, k & 1];
  }
  return [1, 1];
}
