// Compact U(1) lattice gauge theory on an open n x n square lattice, plus the
// Aharonov–Bohm two-path interference pattern. Pure math, no DOM.
//
// Conventions
//   site field      psi_x = rho_x e^{i theta_x}   (the scene uses rho = 1)
//   link variable   U_{x -> x+mu} = e^{i A}       (one real angle A per oriented edge)
//   covariant diff  D = psi_j - U_ij psi_i
//   gauge transform psi_x -> e^{i alpha_x} psi_x,  A_ij -> A_ij + alpha_j - alpha_i
//                   so U_ij -> e^{i alpha_j} U_ij e^{-i alpha_i} and D -> e^{i alpha_j} D.
//   plaquette       U_p = U(x,x+e1) U(x+e1,x+e1+e2) U(x+e1+e2,x+e2) U(x+e2,x) = e^{iF}

export const H_PLANCK = 6.62607015e-34; // J s (exact, SI 2019)
export const E_CHARGE = 1.602176634e-19; // C (exact, SI 2019)
export const HBAR = H_PLANCK / (2 * Math.PI);
/** The Aharonov–Bohm period for a single electron, h/e (Wb). */
export const FLUX_QUANTUM_E = H_PLANCK / E_CHARGE;

export const TAU = 2 * Math.PI;

/** Wrap an angle into (-pi, pi]. */
export function wrap(a: number): number {
  let x = a % TAU;
  if (x <= -Math.PI) x += TAU;
  else if (x > Math.PI) x -= TAU;
  return x;
}

export interface Lattice {
  n: number;
  /** Site phases theta, index i + j*n. */
  theta: Float64Array;
  /** Horizontal links (i,j)->(i+1,j), index i + j*(n-1). */
  ah: Float64Array;
  /** Vertical links (i,j)->(i,j+1), index i + j*n. */
  av: Float64Array;
}

export const hIdx = (n: number, i: number, j: number): number => i + j * (n - 1);
export const vIdx = (n: number, i: number, j: number): number => i + j * n;
export const sIdx = (n: number, i: number, j: number): number => i + j * n;
export const pIdx = (n: number, i: number, j: number): number => i + j * (n - 1);

export function createLattice(n: number): Lattice {
  return { n, theta: new Float64Array(n * n), ah: new Float64Array((n - 1) * n), av: new Float64Array(n * (n - 1)) };
}

export function cloneLattice(L: Lattice): Lattice {
  return { n: L.n, theta: L.theta.slice(), ah: L.ah.slice(), av: L.av.slice() };
}

/** Plaquette angle F = A1 + A2 - A3 - A4 around the square with lower-left corner (i,j). Not wrapped. */
export function plaquetteAngle(L: Lattice, i: number, j: number): number {
  const n = L.n;
  return L.ah[hIdx(n, i, j)] + L.av[vIdx(n, i + 1, j)] - L.ah[hIdx(n, i, j + 1)] - L.av[vIdx(n, i, j)];
}

const PQ = new Float64Array(4);
const ZZ = new Float64Array(2);

/**
 * Plaquette as an ordered product of four complex link variables, written into out[0..1].
 * This is the gauge-invariant object. Its angle is the flux through the square.
 */
export function plaquetteComplex(L: Lattice, i: number, j: number, out: Float64Array | number[]): void {
  const n = L.n;
  PQ[0] = L.ah[hIdx(n, i, j)];
  PQ[1] = L.av[vIdx(n, i + 1, j)];
  PQ[2] = -L.ah[hIdx(n, i, j + 1)];
  PQ[3] = -L.av[vIdx(n, i, j)];
  let re = 1;
  let im = 0;
  for (let k = 0; k < 4; k++) {
    const c = Math.cos(PQ[k]);
    const s = Math.sin(PQ[k]);
    const r2 = re * c - im * s;
    im = re * s + im * c;
    re = r2;
  }
  out[0] = re;
  out[1] = im;
}

/** Wrapped flux through every plaquette, into out (length (n-1)^2). */
export function fluxes(L: Lattice, out: Float64Array): Float64Array {
  const m = L.n - 1;
  for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) out[pIdx(L.n, i, j)] = wrap(plaquetteAngle(L, i, j));
  return out;
}

/**
 * Build links that realise a given plaquette flux pattern F (length (n-1)^2),
 * in the axial gauge: horizontal links zero, vertical links sum the flux to their left.
 */
export function setFluxPattern(L: Lattice, F: ArrayLike<number>): void {
  const n = L.n;
  L.ah.fill(0);
  for (let j = 0; j < n - 1; j++) {
    let acc = 0;
    L.av[vIdx(n, 0, j)] = 0;
    for (let i = 1; i < n; i++) {
      acc += F[pIdx(n, i - 1, j)];
      L.av[vIdx(n, i, j)] = wrap(acc);
    }
  }
}

/** Uniform flux phi per plaquette, or all of Phi in the central plaquette ("tube"). */
export function fluxPattern(n: number, kind: 'uniform' | 'tube', phi: number): Float64Array {
  const m = n - 1;
  const F = new Float64Array(m * m);
  if (kind === 'uniform') F.fill(phi);
  else F[pIdx(n, Math.floor(m / 2), Math.floor(m / 2))] = phi;
  return F;
}

/** Apply psi_x -> e^{i alpha_x} psi_x and A_ij -> A_ij + alpha_j - alpha_i. */
export function gaugeTransform(L: Lattice, alpha: ArrayLike<number>, wrapLinks = true): void {
  const n = L.n;
  for (let k = 0; k < n * n; k++) L.theta[k] = wrap(L.theta[k] + alpha[k]);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n - 1; i++) {
      const h = hIdx(n, i, j);
      const v = L.ah[h] + alpha[sIdx(n, i + 1, j)] - alpha[sIdx(n, i, j)];
      L.ah[h] = wrapLinks ? wrap(v) : v;
    }
  }
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n; i++) {
      const k = vIdx(n, i, j);
      const v = L.av[k] + alpha[sIdx(n, i, j + 1)] - alpha[sIdx(n, i, j)];
      L.av[k] = wrapLinks ? wrap(v) : v;
    }
  }
}

/** Covariant difference D = psi_j - e^{iA} psi_i for complex psi given as (re, im). Writes out[0..1]. */
export function covDiff(reI: number, imI: number, reJ: number, imJ: number, A: number, out: Float64Array | number[]): void {
  const c = Math.cos(A);
  const s = Math.sin(A);
  out[0] = reJ - (c * reI - s * imI);
  out[1] = imJ - (s * reI + c * imI);
}

/**
 * Gradient ("hopping") energy of unit-modulus sites, with an extra global rotation beta.
 * Covariant: sum over links of |psi_j - U_ij psi_i|^2 = 2 - 2 cos(theta_j - theta_i - A).
 * Naive (links removed): sum of |psi_j - psi_i|^2 = 2 - 2 cos(theta_j - theta_i).
 */
export function linkEnergy(L: Lattice, covariant: boolean, beta = 0): number {
  const n = L.n;
  const k = covariant ? 1 : 0;
  let E = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n - 1; i++) {
      const d = L.theta[sIdx(n, i + 1, j)] + beta - (L.theta[sIdx(n, i, j)] + beta) - k * L.ah[hIdx(n, i, j)];
      E += 2 - 2 * Math.cos(d);
    }
  }
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n; i++) {
      const d = L.theta[sIdx(n, i, j + 1)] + beta - (L.theta[sIdx(n, i, j)] + beta) - k * L.av[vIdx(n, i, j)];
      E += 2 - 2 * Math.cos(d);
    }
  }
  return E;
}

/** Wilson-style field energy: sum over plaquettes of (1 - cos F). Zero when there is no flux. */
export function plaquetteEnergy(L: Lattice): number {
  const m = L.n - 1;
  let E = 0;
  for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) E += 1 - Math.cos(plaquetteAngle(L, i, j));
  return E;
}

/** Largest |U_p - U_p(ref)| over all plaquettes, where ref holds interleaved (re, im). */
export function maxPlaquetteDrift(L: Lattice, ref: Float64Array): number {
  const m = L.n - 1;
  const z = ZZ;
  let worst = 0;
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < m; i++) {
      plaquetteComplex(L, i, j, z);
      const p = pIdx(L.n, i, j) * 2;
      worst = Math.max(worst, Math.hypot(z[0] - ref[p], z[1] - ref[p + 1]));
    }
  }
  return worst;
}

export function plaquetteSnapshot(L: Lattice, out?: Float64Array): Float64Array {
  const m = L.n - 1;
  const o = out ?? new Float64Array(m * m * 2);
  const z = [0, 0];
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < m; i++) {
      plaquetteComplex(L, i, j, z);
      const p = pIdx(L.n, i, j) * 2;
      o[p] = z[0];
      o[p + 1] = z[1];
    }
  }
  return o;
}

// ---------------------------------------------------------------------------
// Aharonov–Bohm
// ---------------------------------------------------------------------------

/** Extra phase between the two paths from enclosed flux Phi (Wb): (e/hbar) Phi. */
export function abPhase(Phi: number, charge = E_CHARGE): number {
  return (charge / HBAR) * Phi;
}

export interface ABParams {
  /** Fringe spacing on the screen, lambda L / d (scene units). */
  spacing: number;
  /** Single-slit envelope scale, lambda L / a (scene units). First zero at this distance. */
  envelope: number;
}

const sinc = (x: number) => (Math.abs(x) < 1e-9 ? 1 : Math.sin(x) / x);

/**
 * Two-slit intensity at screen position y with enclosed flux f = Phi/Phi0 (Phi0 = h/e).
 * The path difference gives 2 pi y / spacing, the vector potential adds 2 pi f.
 * The single-slit envelope does not depend on f, because B is zero along both paths.
 */
export function abIntensity(y: number, f: number, p: ABParams): number {
  const c = Math.cos(Math.PI * (y / p.spacing + f));
  const e = sinc((Math.PI * y) / p.envelope);
  return c * c * e * e;
}

/** Position of the central bright fringe, shifted by -f fringe spacings (folded into (-s/2, s/2]). */
export function fringeShift(f: number, p: ABParams): number {
  let u = -f % 1;
  if (u <= -0.5) u += 1;
  else if (u > 0.5) u -= 1;
  return u * p.spacing;
}

/** Magnetic field of an ideal long solenoid of radius R carrying flux Phi, at distance r. */
export function solenoidB(r: number, R: number, Phi: number): number {
  return r < R ? Phi / (Math.PI * R * R) : 0;
}

/** Azimuthal vector potential of the same solenoid (symmetric gauge). Nonzero outside. */
export function solenoidA(r: number, R: number, Phi: number): number {
  if (r <= 0) return 0;
  return r < R ? (Phi * r) / (2 * Math.PI * R * R) : Phi / (2 * Math.PI * r);
}
