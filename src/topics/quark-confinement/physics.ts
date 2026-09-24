// Pure physics for quark confinement: the Cornell potential, string breaking,
// one-loop running of alpha_s, and a charmonium spectrum by the shooting method.
// Units: energies in GeV, lengths in fm, string tension in GeV/fm.

/** hbar c in GeV fm (CODATA). */
export const HBARC = 0.1973269804;
/** Z boson mass in GeV (PDG). */
export const MZ = 91.1876;
/** World average alpha_s(M_Z) used as the anchor (PDG, rounded). */
export const ALPHA_S_MZ = 0.118;
/** 1 GeV in joules. */
export const GEV_J = 1.602176634e-10;
/** Standard gravity, m/s^2. */
export const G0 = 9.80665;

/** Measured masses in GeV (PDG). */
export const M_JPSI = 3.0969;
export const M_PSI2S = 3.6861;
/** Open-charm threshold 2 M(D0), GeV. Above it charmonium falls apart into D D-bar. */
export const M_DD = 2 * 1.86484;

/** Coefficient a = (4/3) alpha_s hbar c of the Coulomb-like term, GeV fm. */
export const coulombCoeff = (alphaS: number): number => (4 / 3) * alphaS * HBARC;

/** Cornell potential V(r) = -(4/3) alpha_s hbar c / r + sigma r, in GeV. */
export function cornell(r: number, alphaS: number, sigma: number): number {
  return -coulombCoeff(alphaS) / r + sigma * r;
}

/** Force -dV/dr magnitude in GeV/fm (attractive). */
export function cornellForce(r: number, alphaS: number, sigma: number): number {
  return coulombCoeff(alphaS) / (r * r) + sigma;
}

/**
 * Separation where V(r) reaches the pair-creation threshold eTh.
 * Solves sigma r^2 - eTh r - a = 0 and takes the positive root.
 */
export function breakingDistance(eTh: number, alphaS: number, sigma: number): number {
  const a = coulombCoeff(alphaS);
  return (eTh + Math.sqrt(eTh * eTh + 4 * sigma * a)) / (2 * sigma);
}

/** Separation where V(r) equals a target energy (same root as breakingDistance). */
export const separationForEnergy = breakingDistance;

/** String tension in GeV/fm expressed as a force in newtons. */
export const tensionNewtons = (sigma: number): number => (sigma * GEV_J) / 1e-15;

/** The same force as the weight of this many tonnes at Earth's surface. */
export const tensionTonnes = (sigma: number): number => tensionNewtons(sigma) / G0 / 1000;

/** GeV/fm to GeV^2 (sigma in natural units). */
export const tensionGeV2 = (sigma: number): number => sigma * HBARC;

// ---------------------------------------------------------------------------
// Running coupling
// ---------------------------------------------------------------------------

/** One-loop beta coefficient b0 = (33 - 2 nf) / (12 pi). */
export const beta0 = (nf: number): number => (33 - 2 * nf) / (12 * Math.PI);

/**
 * One-loop alpha_s(Q) with fixed nf flavours, anchored at alpha_s(M_Z).
 * alpha_s(Q) = alpha_s(M_Z) / (1 + b0 alpha_s(M_Z) ln(Q^2 / M_Z^2)).
 * Returns NaN at and below the Landau pole.
 */
export function alphaS(Q: number, nf = 5, aMZ = ALPHA_S_MZ): number {
  const den = 1 + beta0(nf) * aMZ * Math.log((Q * Q) / (MZ * MZ));
  return den > 0 ? aMZ / den : NaN;
}

/** Energy scale where the one-loop coupling blows up (GeV). */
export function landauPole(nf = 5, aMZ = ALPHA_S_MZ): number {
  return MZ * Math.exp(-1 / (2 * beta0(nf) * aMZ));
}

// ---------------------------------------------------------------------------
// Quarkonium: radial Schroedinger equation, l = 0, by shooting
// ---------------------------------------------------------------------------

export interface QuarkoniumParams {
  /** Coupling in the Coulomb term (a fitted constant here). */
  alphaS: number;
  /** String tension, GeV/fm. */
  sigma: number;
  /** Quark mass, GeV. */
  mq: number;
  /** Constant shift added to the potential, GeV. */
  c0: number;
}

/**
 * Parameters fitted to J/psi and psi(2S) with sigma fixed at 0.9 GeV/fm and no
 * spin-dependent forces. This is a fit, not a prediction.
 */
export const CHARM_FIT: QuarkoniumParams = { alphaS: 0.33, sigma: 0.9, mq: 1.34, c0: 0 };

const RMAX = 6; // fm
const NSTEP = 3000;

/**
 * Integrate u'' = k(r) u with Numerov from r = 0 (u = 0) to RMAX.
 * Returns the number of sign changes and the end value. Optionally fills u.
 */
function shoot(E: number, p: QuarkoniumParams, out?: Float64Array): { nodes: number; end: number } {
  const h = RMAX / NSTEP;
  const mu = p.mq / 2; // reduced mass, GeV
  const f = (2 * mu) / (HBARC * HBARC); // 1 / (GeV fm^2)
  const k = (r: number) => f * (cornell(r, p.alphaS, p.sigma) + p.c0 - E);
  let u0 = 0;
  let u1 = h;
  let k0 = 0; // k(0) is singular, but it only ever multiplies u(0) = 0
  let k1 = k(h);
  let nodes = 0;
  if (out) {
    out[0] = 0;
    out[1] = u1;
  }
  const h2 = (h * h) / 12;
  for (let i = 1; i < NSTEP; i++) {
    const r2 = (i + 1) * h;
    const k2 = k(r2);
    const u2 = (2 * u1 * (1 + 5 * h2 * k1) - u0 * (1 - h2 * k0)) / (1 - h2 * k2);
    if (u2 * u1 < 0) nodes++;
    if (out) out[i + 1] = u2;
    // Beyond the turning point the solution explodes. Stop early once it is huge.
    if (Math.abs(u2) > 1e12) {
      if (out) for (let j = i + 2; j <= NSTEP; j++) out[j] = u2;
      return { nodes, end: u2 };
    }
    u0 = u1;
    u1 = u2;
    k0 = k1;
    k1 = k2;
  }
  return { nodes, end: u1 };
}

/**
 * Energy eigenvalue (binding part, GeV) of the n-th s-wave state, n = 0, 1, 2...
 * Bisection on the node count, then on the sign of the tail.
 */
export function levelEnergy(n: number, p: QuarkoniumParams): number {
  let lo = -2;
  let hi = 4;
  for (let it = 0; it < 70; it++) {
    const mid = 0.5 * (lo + hi);
    const s = shoot(mid, p);
    // More than n nodes, or n nodes with the tail turning back: energy too high.
    const tooHigh = s.nodes > n || (s.nodes === n && sameSignAsLastLobe(s.end, n));
    if (tooHigh) hi = mid;
    else lo = mid;
  }
  return 0.5 * (lo + hi);
}

// With u'(0) > 0 the last lobe of an n-node state has sign (-1)^n. Below the eigenvalue the
// tail diverges with that sign. Above it (still n nodes) it diverges with the opposite sign.
function sameSignAsLastLobe(end: number, n: number): boolean {
  const lobe = n % 2 === 0 ? 1 : -1;
  return end * lobe < 0;
}

/** Bound-state mass M = 2 m_q + E_n (GeV). */
export function quarkoniumMass(n: number, p: QuarkoniumParams): number {
  return 2 * p.mq + levelEnergy(n, p);
}

/** Normalised radial function u(r) of level n sampled on `count` points in [0, rMax]. */
export function radialWave(n: number, p: QuarkoniumParams, count: number, rMax: number): Float64Array {
  const E = levelEnergy(n, p);
  const full = new Float64Array(NSTEP + 1);
  shoot(E, p, full);
  const h = RMAX / NSTEP;
  // Cut the diverging tail at the last minimum of |u| beyond the classical turning point.
  let cut = NSTEP;
  let best = Infinity;
  let passedTurn = false;
  for (let i = 1; i <= NSTEP; i++) {
    const r = i * h;
    if (!passedTurn && cornell(r, p.alphaS, p.sigma) + p.c0 > E) passedTurn = true;
    if (passedTurn) {
      const a = Math.abs(full[i]);
      if (a < best) {
        best = a;
        cut = i;
      } else if (a > 10 * best + 1e-30) break;
    }
  }
  for (let i = cut; i <= NSTEP; i++) full[i] = 0;
  let norm = 0;
  for (let i = 0; i <= NSTEP; i++) norm += full[i] * full[i] * h;
  norm = Math.sqrt(norm) || 1;
  const out = new Float64Array(count);
  for (let j = 0; j < count; j++) {
    const r = (j / (count - 1)) * rMax;
    const x = r / h;
    const i = Math.min(NSTEP - 1, Math.floor(x));
    const t = x - i;
    out[j] = ((1 - t) * full[i] + t * full[i + 1]) / norm;
  }
  return out;
}

/** Root-mean-square radius of level n, fm. */
export function rmsRadius(n: number, p: QuarkoniumParams): number {
  const N = 1200;
  const rMax = 4;
  const u = radialWave(n, p, N, rMax);
  const h = rMax / (N - 1);
  let s = 0;
  let w = 0;
  for (let i = 0; i < N; i++) {
    const r = i * h;
    s += r * r * u[i] * u[i];
    w += u[i] * u[i];
  }
  return Math.sqrt(s / w);
}

// ---------------------------------------------------------------------------
// Field lines for the comparison view
// ---------------------------------------------------------------------------

/**
 * Trace one electric field line of a 2D slice through a dipole: +q at (-d/2, 0), -q at (d/2, 0).
 * Starts on a small circle of radius r0 around +q at angle theta. Writes (x, y) pairs into out
 * and returns the number of points. Stops at -q or beyond radius rMax.
 */
export function traceDipoleLine(d: number, theta: number, out: Float32Array, maxPts: number, step: number, r0: number, rMax: number): number {
  const xp = -d / 2;
  const xm = d / 2;
  let x = xp + r0 * Math.cos(theta);
  let y = r0 * Math.sin(theta);
  let n = 0;
  const field = (px: number, py: number, o: number[]) => {
    const ax = px - xp;
    const bx = px - xm;
    const ra3 = Math.pow(ax * ax + py * py, 1.5);
    const rb3 = Math.pow(bx * bx + py * py, 1.5);
    const ex = ax / ra3 - bx / rb3;
    const ey = py / ra3 - py / rb3;
    const m = Math.hypot(ex, ey) || 1;
    o[0] = ex / m;
    o[1] = ey / m;
  };
  const k1 = [0, 0];
  const k2 = [0, 0];
  for (; n < maxPts; n++) {
    out[2 * n] = x;
    out[2 * n + 1] = y;
    if (Math.hypot(x - xm, y) < r0 * 0.9 || Math.hypot(x, y) > rMax) {
      n++;
      break;
    }
    field(x, y, k1);
    field(x + 0.5 * step * k1[0], y + 0.5 * step * k1[1], k2);
    x += step * k2[0];
    y += step * k2[1];
  }
  return n;
}

/**
 * Transverse radius of a flux-tube line at position x in [-L/2, L/2], for a line whose
 * radius deep inside the tube is rho. Near each quark the lines converge onto the quark.
 * At small L the tube has not formed, and lines bulge like a dipole field.
 */
export function tubeProfile(x: number, L: number, rho: number, heal: number): number {
  const d = Math.max(0, L / 2 - Math.abs(x));
  return rho * (1 - Math.exp(-d / heal));
}
