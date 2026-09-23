// Classical string shapes and the closed bosonic string spectrum on a circle.
// Units: alpha' = 1 unless passed explicitly. Pure module: no DOM, no Three.js.

// ---------------------------------------------------------------------------
// 1. Classical string modes
// ---------------------------------------------------------------------------

/**
 * One harmonic of a closed string. The transverse displacement is
 *   d(σ, t) = ampR · eR · cos(n(σ − t) + phiR) + ampL · eL · cos(n(σ + t) + phiL)
 * where eR and eL are unit vectors in the (radial, vertical) plane at angles polR and polL.
 * Right movers depend on σ − t, left movers on σ + t.
 */
export interface ClosedMode {
  n: number;
  ampR: number;
  ampL: number;
  phiR: number;
  phiL: number;
  polR: number;
  polL: number;
}

/** One standing-wave harmonic of an open string, polarised at angle pol in the (y, z) plane. */
export interface OpenMode {
  n: number;
  amp: number;
  phase: number;
  pol: number;
}

/** Fixed ends (Dirichlet, like a guitar string or an end stuck on a brane) or free ends (Neumann). */
export type Ends = 'fixed' | 'free';

/** Angular frequency of harmonic n. With the string length set to 2π and c = 1, ω = n. */
export const modeFrequency = (n: number): number => Math.abs(n);

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * Transverse displacement of a closed string at (σ, t), split into
 * a radial part (out[0]) and a vertical part (out[1]).
 */
export function closedDisplacement(sigma: number, t: number, modes: readonly ClosedMode[], out: Float64Array | number[]): void {
  let dr = 0;
  let dy = 0;
  for (let i = 0; i < modes.length; i++) {
    const m = modes[i];
    const cR = m.ampR * Math.cos(m.n * (sigma - t) + m.phiR);
    const cL = m.ampL * Math.cos(m.n * (sigma + t) + m.phiL);
    dr += cR * Math.cos(m.polR) + cL * Math.cos(m.polL);
    dy += cR * Math.sin(m.polR) + cL * Math.sin(m.polL);
  }
  out[0] = dr;
  out[1] = dy;
}

const tmp2 = [0, 0];

/**
 * 3D point on a closed string loop. The unstretched loop is a circle of radius r0 in the
 * xz-plane, parametrised by σ in [0, 2π). Displacements are radial and vertical.
 */
export function closedPoint(sigma: number, t: number, modes: readonly ClosedMode[], r0: number, out: Vec3Like): Vec3Like {
  closedDisplacement(sigma, t, modes, tmp2);
  const r = r0 + tmp2[0];
  out.x = r * Math.cos(sigma);
  out.y = tmp2[1];
  out.z = r * Math.sin(sigma);
  return out;
}

/** Transverse displacement of an open string at σ in [0, π]. out[0] = y, out[1] = z. */
export function openDisplacement(sigma: number, t: number, modes: readonly OpenMode[], ends: Ends, out: Float64Array | number[]): void {
  let dy = 0;
  let dz = 0;
  for (let i = 0; i < modes.length; i++) {
    const m = modes[i];
    const shape = ends === 'fixed' ? Math.sin(m.n * sigma) : Math.cos(m.n * sigma);
    const a = m.amp * shape * Math.cos(modeFrequency(m.n) * t + m.phase);
    dy += a * Math.cos(m.pol);
    dz += a * Math.sin(m.pol);
  }
  out[0] = dy;
  out[1] = dz;
}

/** 3D point on an open string stretched along x from −halfLen to +halfLen. */
export function openPoint(sigma: number, t: number, modes: readonly OpenMode[], ends: Ends, halfLen: number, out: Vec3Like): Vec3Like {
  openDisplacement(sigma, t, modes, ends, tmp2);
  out.x = -halfLen + (2 * halfLen * sigma) / Math.PI;
  out.y = tmp2[0];
  out.z = tmp2[1];
  return out;
}

const tmpV: Vec3Like = { x: 0, y: 0, z: 0 };

/**
 * Write `count` points of a closed loop into out (xyz triplets). Point k sits at σ = 2πk/count,
 * so the loop closes on itself without a duplicated vertex.
 */
export function writeClosedString(out: Float32Array, count: number, t: number, modes: readonly ClosedMode[], r0: number): void {
  for (let k = 0; k < count; k++) {
    closedPoint((2 * Math.PI * k) / count, t, modes, r0, tmpV);
    out[k * 3] = tmpV.x;
    out[k * 3 + 1] = tmpV.y;
    out[k * 3 + 2] = tmpV.z;
  }
}

/** Write `count` points of an open string (σ from 0 to π inclusive) into out. */
export function writeOpenString(out: Float32Array, count: number, t: number, modes: readonly OpenMode[], ends: Ends, halfLen: number): void {
  for (let k = 0; k < count; k++) {
    openPoint((Math.PI * k) / (count - 1), t, modes, ends, halfLen, tmpV);
    out[k * 3] = tmpV.x;
    out[k * 3 + 1] = tmpV.y;
    out[k * 3 + 2] = tmpV.z;
  }
}

/**
 * Mass squared at oscillator level k with no compact dimension. Exciting harmonic k once gives level k.
 * Exciting harmonics k1 and k2 once each gives level k1 + k2.
 * Closed: equal left and right levels N = Ñ = k, M² = (2/α')(2k − 2).
 * Open: N = k, M² = (1/α')(k − 1).
 * k = 1 gives zero: the massless graviton (closed) or photon-like vector (open).
 */
export function harmonicMass2(k: number, closed: boolean, alpha = 1): number {
  return closed ? (2 / alpha) * (2 * k - 2) : (k - 1) / alpha;
}

// ---------------------------------------------------------------------------
// 2. Closed bosonic string on a circle of radius R
// ---------------------------------------------------------------------------

export interface StringState {
  n: number;
  w: number;
  N: number;
  Nt: number;
  M2: number;
}

/** M² = (n/R)² + (wR/α')² + (2/α')(N + Ñ − 2). */
export function massSquared(n: number, w: number, N: number, Nt: number, R: number, alpha = 1): number {
  const p = n / R;
  const q = (w * R) / alpha;
  return p * p + q * q + (2 / alpha) * (N + Nt - 2);
}

/** Level matching: N − Ñ = n·w. Only states that satisfy it exist. */
export const levelMatched = (n: number, w: number, N: number, Nt: number): boolean => N - Nt === n * w;

export type StateKind = 'tachyon' | 'momentum' | 'winding' | 'balanced' | 'oscillator';

/** Which piece of the mass formula dominates this state. */
export function stateKind(s: { n: number; w: number; M2: number }, R: number, alpha = 1): StateKind {
  if (s.M2 < -1e-9) return 'tachyon';
  const p = (s.n / R) ** 2;
  const q = ((s.w * R) / alpha) ** 2;
  if (p === 0 && q === 0) return 'oscillator';
  if (Math.abs(p - q) < 1e-9 * (p + q)) return 'balanced';
  return p > q ? 'momentum' : 'winding';
}

export interface SpectrumOptions {
  nMax?: number;
  wMax?: number;
  NMax?: number;
  /** Keep only states with M² at or below this. */
  M2Max?: number;
  alpha?: number;
  /** If false, include states that fail level matching (for testing the filter). */
  matchOnly?: boolean;
}

/** All states in the given quantum-number box, sorted by M² (then by n, w, N, Ñ). */
export function spectrum(R: number, opts: SpectrumOptions = {}): StringState[] {
  const { nMax = 4, wMax = 4, NMax = 3, M2Max = Infinity, alpha = 1, matchOnly = true } = opts;
  const out: StringState[] = [];
  for (let n = -nMax; n <= nMax; n++) {
    for (let w = -wMax; w <= wMax; w++) {
      for (let N = 0; N <= NMax; N++) {
        for (let Nt = 0; Nt <= NMax; Nt++) {
          if (matchOnly && !levelMatched(n, w, N, Nt)) continue;
          const M2 = massSquared(n, w, N, Nt, R, alpha);
          if (M2 <= M2Max + 1e-12) out.push({ n, w, N, Nt, M2 });
        }
      }
    }
  }
  out.sort((a, b) => a.M2 - b.M2 || a.n - b.n || a.w - b.w || a.N - b.N || a.Nt - b.Nt);
  return out;
}

export interface Level {
  M2: number;
  states: StringState[];
}

/** Group a sorted spectrum into distinct mass levels (degenerate states share a level). */
export function groupLevels(states: readonly StringState[], tol = 1e-9): Level[] {
  const levels: Level[] = [];
  for (const s of states) {
    const last = levels[levels.length - 1];
    if (last && Math.abs(last.M2 - s.M2) < tol) last.states.push(s);
    else levels.push({ M2: s.M2, states: [s] });
  }
  return levels;
}

// ---------------------------------------------------------------------------
// 3. T-duality
// ---------------------------------------------------------------------------

/** The T-dual description: R → α'/R with momentum and winding exchanged. */
export function tDual(s: { n: number; w: number; N: number; Nt: number }, R: number, alpha = 1) {
  return { n: s.w, w: s.n, N: s.N, Nt: s.Nt, R: alpha / R };
}

/** The self-dual radius R = √α', where extra massless states appear. */
export const selfDualRadius = (alpha = 1): number => Math.sqrt(alpha);

/** Massless states that carry momentum or winding. They exist only at the self-dual radius. */
export function extraMassless(R: number, alpha = 1, tol = 1e-9): StringState[] {
  return spectrum(R, { nMax: 3, wMax: 3, NMax: 2, alpha }).filter((s) => Math.abs(s.M2) < tol && (s.n !== 0 || s.w !== 0));
}

// ---------------------------------------------------------------------------
// 4. Kaluza–Klein tower
// ---------------------------------------------------------------------------

/** Spacing of the momentum (KK) ladder in mass: ΔM = 1/R. */
export const kkSpacing = (R: number): number => 1 / R;

/** Spacing of the winding ladder in mass: ΔM = R/α'. */
export const windingSpacing = (R: number, alpha = 1): number => R / alpha;

/** Masses of the first `count` KK modes of a massless field on a circle: M_n = |n|/R. */
export function kkTower(R: number, count: number): number[] {
  const out: number[] = [];
  for (let n = 0; n < count; n++) out.push(n / R);
  return out;
}

/** Map a slider value in [−1, 1] to R on a log scale between 1/rMax and rMax. Symmetric under R → 1/R. */
export const radiusFromLog = (u: number, rMax = 5): number => Math.pow(rMax, u);
