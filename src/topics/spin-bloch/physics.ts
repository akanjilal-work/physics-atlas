// Spin-1/2 and the Bloch sphere. Pure math, no DOM.
// Units: hbar = 1. A Hamiltonian H = (1/2) w . sigma makes the Bloch vector
// precess as dr/dt = w x r (right-handed, at angular rate |w|).

/** 2x2 complex matrix [[a,b],[c,d]] stored as [aRe,aIm,bRe,bIm,cRe,cIm,dRe,dIm]. */
export type Mat2 = number[];
/** Spinor a|0> + b|1> stored as [aRe,aIm,bRe,bIm]. */
export type Spinor = number[];
export type Vec3 = [number, number, number] | Float64Array;

/** Proton gyromagnetic ratio over 2 pi, MHz per tesla (CODATA 2018: 42.577 478 518). */
export const GAMMA_P_MHZ_PER_T = 42.577478518;

const S = Math.SQRT1_2;

export const I2: Mat2 = [1, 0, 0, 0, 0, 0, 1, 0];
export const PAULI_X: Mat2 = [0, 0, 1, 0, 1, 0, 0, 0];
export const PAULI_Y: Mat2 = [0, 0, 0, -1, 0, 1, 0, 0];
export const PAULI_Z: Mat2 = [1, 0, 0, 0, 0, 0, -1, 0];
export const HADAMARD: Mat2 = [S, 0, S, 0, S, 0, -S, 0];
export const S_GATE: Mat2 = [1, 0, 0, 0, 0, 0, 0, 1];
export const T_GATE: Mat2 = [1, 0, 0, 0, 0, 0, S, S];

export function matMul(A: Mat2, B: Mat2): Mat2 {
  const out: Mat2 = new Array(8).fill(0);
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      let re = 0;
      let im = 0;
      for (let k = 0; k < 2; k++) {
        const a = (i * 2 + k) * 2;
        const b = (k * 2 + j) * 2;
        re += A[a] * B[b] - A[a + 1] * B[b + 1];
        im += A[a] * B[b + 1] + A[a + 1] * B[b];
      }
      out[(i * 2 + j) * 2] = re;
      out[(i * 2 + j) * 2 + 1] = im;
    }
  }
  return out;
}

export function dagger(A: Mat2): Mat2 {
  return [A[0], -A[1], A[4], -A[5], A[2], -A[3], A[6], -A[7]];
}

export function det(A: Mat2): [number, number] {
  const re = A[0] * A[6] - A[1] * A[7] - (A[2] * A[4] - A[3] * A[5]);
  const im = A[0] * A[7] + A[1] * A[6] - (A[2] * A[5] + A[3] * A[4]);
  return [re, im];
}

/** Largest entry of |A - B|. */
export function maxDiff(A: Mat2, B: Mat2): number {
  let m = 0;
  for (let k = 0; k < 8; k += 2) m = Math.max(m, Math.hypot(A[k] - B[k], A[k + 1] - B[k + 1]));
  return m;
}

/** Distance between A and B after removing the best global phase: min over chi of |A - e^{i chi} B|. */
export function diffUpToPhase(A: Mat2, B: Mat2): number {
  // Tr(B^dagger A) gives the optimal phase.
  const M = matMul(dagger(B), A);
  const tr = [M[0] + M[6], M[1] + M[7]];
  const n = Math.hypot(tr[0], tr[1]);
  if (n < 1e-15) return maxDiff(A, B);
  const c = tr[0] / n;
  const s = tr[1] / n;
  const Bp: Mat2 = [];
  for (let k = 0; k < 8; k += 2) {
    Bp.push(B[k] * c - B[k + 1] * s, B[k] * s + B[k + 1] * c);
  }
  return maxDiff(A, Bp);
}

/** SU(2) rotation about unit axis n by angle alpha: exp(-i alpha n.sigma / 2). */
export function rotationU(n: Vec3, alpha: number): Mat2 {
  const c = Math.cos(alpha / 2);
  const s = Math.sin(alpha / 2);
  const [nx, ny, nz] = [n[0], n[1], n[2]];
  // c I - i s (nx X + ny Y + nz Z)
  return [c, -s * nz, -s * ny, -s * nx, s * ny, -s * nx, c, s * nz];
}

export function applyU(U: Mat2, psi: Spinor): Spinor {
  const [ar, ai, br, bi] = psi;
  return [
    U[0] * ar - U[1] * ai + U[2] * br - U[3] * bi,
    U[0] * ai + U[1] * ar + U[2] * bi + U[3] * br,
    U[4] * ar - U[5] * ai + U[6] * br - U[7] * bi,
    U[4] * ai + U[5] * ar + U[6] * bi + U[7] * br,
  ];
}

export type GateName = 'X' | 'Y' | 'Z' | 'H' | 'S' | 'T' | 'Rx' | 'Ry' | 'Rz';

export interface GateSpec {
  /** Standard textbook matrix (for X, Y, Z, H, S, T) or the SU(2) rotation. */
  U: Mat2;
  /** Rotation axis on the Bloch sphere (unit vector). */
  axis: [number, number, number];
  /** Rotation angle about the axis (rad). */
  angle: number;
}

/** Every single-qubit gate is a rotation of the Bloch sphere. alpha is used by Rx, Ry, Rz. */
export function gate(name: GateName, alpha = Math.PI / 2): GateSpec {
  switch (name) {
    case 'X': return { U: PAULI_X, axis: [1, 0, 0], angle: Math.PI };
    case 'Y': return { U: PAULI_Y, axis: [0, 1, 0], angle: Math.PI };
    case 'Z': return { U: PAULI_Z, axis: [0, 0, 1], angle: Math.PI };
    case 'H': return { U: HADAMARD, axis: [S, 0, S], angle: Math.PI };
    case 'S': return { U: S_GATE, axis: [0, 0, 1], angle: Math.PI / 2 };
    case 'T': return { U: T_GATE, axis: [0, 0, 1], angle: Math.PI / 4 };
    case 'Rx': return { U: rotationU([1, 0, 0], alpha), axis: [1, 0, 0], angle: alpha };
    case 'Ry': return { U: rotationU([0, 1, 0], alpha), axis: [0, 1, 0], angle: alpha };
    case 'Rz': return { U: rotationU([0, 0, 1], alpha), axis: [0, 0, 1], angle: alpha };
  }
}

/** |psi> = cos(theta/2)|0> + e^{i phi} sin(theta/2)|1>. */
export function spinorFromAngles(theta: number, phi: number): Spinor {
  const s = Math.sin(theta / 2);
  return [Math.cos(theta / 2), 0, s * Math.cos(phi), s * Math.sin(phi)];
}

/** Bloch vector <sigma> of a (possibly unnormalised) spinor, divided by its norm. */
export function blochFromSpinor(psi: Spinor): [number, number, number] {
  const [ar, ai, br, bi] = psi;
  const n = ar * ar + ai * ai + br * br + bi * bi;
  // a* b
  const re = ar * br + ai * bi;
  const im = ar * bi - ai * br;
  return [(2 * re) / n, (2 * im) / n, (ar * ar + ai * ai - br * br - bi * bi) / n];
}

export function blochFromAngles(theta: number, phi: number, out: Vec3 = [0, 0, 0]): Vec3 {
  out[0] = Math.sin(theta) * Math.cos(phi);
  out[1] = Math.sin(theta) * Math.sin(phi);
  out[2] = Math.cos(theta);
  return out;
}

/** Polar and azimuth of the direction of r. phi in [0, 2 pi). */
export function anglesFromBloch(r: Vec3): [number, number] {
  const len = Math.hypot(r[0], r[1], r[2]);
  if (len < 1e-12) return [0, 0];
  const theta = Math.acos(Math.max(-1, Math.min(1, r[2] / len)));
  let phi = Math.atan2(r[1], r[0]);
  if (phi < 0) phi += 2 * Math.PI;
  return [theta, phi];
}

/** Rodrigues rotation of v about unit axis n by angle a, written into out (may alias v). */
export function rotateVec(v: Vec3, n: Vec3, a: number, out: Vec3): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const dot = n[0] * v[0] + n[1] * v[1] + n[2] * v[2];
  const cx = n[1] * v[2] - n[2] * v[1];
  const cy = n[2] * v[0] - n[0] * v[2];
  const cz = n[0] * v[1] - n[1] * v[0];
  const x = v[0] * c + cx * s + n[0] * dot * (1 - c);
  const y = v[1] * c + cy * s + n[1] * dot * (1 - c);
  const z = v[2] * c + cz * s + n[2] * dot * (1 - c);
  out[0] = x;
  out[1] = y;
  out[2] = z;
  return out;
}

/** Density matrix rho = (I + r.sigma)/2 as a Mat2. */
export function densityFromBloch(r: Vec3): Mat2 {
  return [(1 + r[2]) / 2, 0, r[0] / 2, -r[1] / 2, r[0] / 2, r[1] / 2, (1 - r[2]) / 2, 0];
}

/** Bloch vector of a density matrix: r_i = Tr(rho sigma_i). */
export function blochFromDensity(rho: Mat2): [number, number, number] {
  return [2 * rho[4], 2 * rho[5], rho[0] - rho[6]];
}

/** Purity Tr(rho^2) = (1 + |r|^2)/2. Equals 1 for pure states, 1/2 for the fully mixed state. */
export const purity = (r: Vec3): number => (1 + r[0] * r[0] + r[1] * r[1] + r[2] * r[2]) / 2;

/** Born rule: probability of the + outcome along unit axis n, P = (1 + r.n)/2. */
export const probPlus = (r: Vec3, n: Vec3): number => Math.max(0, Math.min(1, (1 + r[0] * n[0] + r[1] * n[1] + r[2] * n[2]) / 2));

/** Rabi formula from |0>: P1(t) = Omega^2/(Omega^2+Delta^2) sin^2(sqrt(Omega^2+Delta^2) t / 2). */
export function rabiP1(omega: number, delta: number, t: number): number {
  const W2 = omega * omega + delta * delta;
  if (W2 === 0) return 0;
  const s = Math.sin((Math.sqrt(W2) * t) / 2);
  return ((omega * omega) / W2) * s * s;
}

/** Parameters of the Bloch equations. */
export interface BlochParams {
  /** Precession vector w (rad/s). dr/dt = w x r. */
  w: Vec3;
  /** Equilibrium direction (unit). T1 relaxes the component along it toward +1. */
  eq: Vec3;
  /** 1/T1 and 1/T2 (0 disables). Physical states need T2 <= 2 T1. */
  g1: number;
  g2: number;
}

/** Bloch equations: dr/dt = w x r - r_perp/T2 - (r_par - 1) e/T1. */
export function blochDeriv(r: Vec3, p: BlochParams, out: Vec3): Vec3 {
  const w = p.w;
  const e = p.eq;
  const par = r[0] * e[0] + r[1] * e[1] + r[2] * e[2];
  const px = r[0] - par * e[0];
  const py = r[1] - par * e[1];
  const pz = r[2] - par * e[2];
  out[0] = w[1] * r[2] - w[2] * r[1] - p.g2 * px - p.g1 * (par - 1) * e[0];
  out[1] = w[2] * r[0] - w[0] * r[2] - p.g2 * py - p.g1 * (par - 1) * e[1];
  out[2] = w[0] * r[1] - w[1] * r[0] - p.g2 * pz - p.g1 * (par - 1) * e[2];
  return out;
}

const k1 = new Float64Array(3);
const k2 = new Float64Array(3);
const k3 = new Float64Array(3);
const k4 = new Float64Array(3);
const tmp = new Float64Array(3);

/** One RK4 step of the Bloch equations, in place. No allocations. */
export function rk4Bloch(r: Vec3, p: BlochParams, h: number): void {
  blochDeriv(r, p, k1);
  for (let i = 0; i < 3; i++) tmp[i] = r[i] + 0.5 * h * k1[i];
  blochDeriv(tmp, p, k2);
  for (let i = 0; i < 3; i++) tmp[i] = r[i] + 0.5 * h * k2[i];
  blochDeriv(tmp, p, k3);
  for (let i = 0; i < 3; i++) tmp[i] = r[i] + h * k3[i];
  blochDeriv(tmp, p, k4);
  for (let i = 0; i < 3; i++) r[i] += (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
}

/** One RK4 step of i dpsi/dt = H(t) psi with H(t) = (1/2) w(t).sigma. Used to check the Rabi formula. */
export function rk4Spinor(psi: Spinor, wAt: (t: number) => [number, number, number], t: number, h: number): Spinor {
  const f = (s: Spinor, tt: number): Spinor => {
    const [wx, wy, wz] = wAt(tt);
    // H = 1/2 [[wz, wx - i wy], [wx + i wy, -wz]]
    const Hm: Mat2 = [wz / 2, 0, wx / 2, -wy / 2, wx / 2, wy / 2, -wz / 2, 0];
    const hp = applyU(Hm, s);
    // -i * hp
    return [hp[1], -hp[0], hp[3], -hp[2]];
  };
  const add = (a: Spinor, b: Spinor, c: number): Spinor => a.map((v, i) => v + c * b[i]);
  const a1 = f(psi, t);
  const a2 = f(add(psi, a1, h / 2), t + h / 2);
  const a3 = f(add(psi, a2, h / 2), t + h / 2);
  const a4 = f(add(psi, a3, h), t + h);
  return psi.map((v, i) => v + (h / 6) * (a1[i] + 2 * a2[i] + 2 * a3[i] + a4[i]));
}

/** Seeded PRNG for reproducible measurement batches. */
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

/** Measure N fresh copies of the same state along n. Returns the number of + outcomes. */
export function measureBatch(r: Vec3, n: Vec3, N: number, rand: () => number): number {
  const p = probPlus(r, n);
  let k = 0;
  for (let i = 0; i < N; i++) if (rand() < p) k++;
  return k;
}
