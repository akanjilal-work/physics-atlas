// Neutrino flavour oscillations. Pure math, no DOM.
// Units: mass splittings in eV^2, baselines in km, energies in GeV.
// Flavour index 0 = e, 1 = mu, 2 = tau. Mass index 0, 1, 2 = nu1, nu2, nu3.

/**
 * Oscillation phase constant: Delta = K * dm2[eV^2] * L[km] / E[GeV] equals dm2 L / (4 E hbar c).
 * 1e3 / (4 * 197.3269804) = 1.26693. Usually rounded to 1.27 or 1.267.
 */
export const HBARC_MEV_FM = 197.3269804;
export const K = 1e3 / (4 * HBARC_MEV_FM);

/** Fermi constant (GeV^-2, PDG) and Avogadro's number. */
export const G_F = 1.1663788e-5;
export const N_A = 6.02214076e23;
/** hbar c in eV cm. */
const HBARC_EV_CM = HBARC_MEV_FM * 1e-7;
/**
 * Matter potential coefficient: A = 2 sqrt2 G_F N_e E = A_COEF * Ye * rho[g/cm^3] * E[GeV] in eV^2.
 * Evaluates to about 1.526e-4.
 */
export const A_COEF = 2 * Math.SQRT2 * (G_F * 1e-18) * (N_A * HBARC_EV_CM ** 3) * 1e9;
export const YE = 0.5;

export const EARTH_DIAMETER_KM = 12742;
export const AU_KM = 1.495978707e8;

const DEG = Math.PI / 180;

export interface MixParams {
  /** Mixing angles in radians. */
  th12: number;
  th13: number;
  th23: number;
  /** Dirac CP phase in radians. */
  delta: number;
  /** m2^2 - m1^2 in eV^2 (positive by convention). */
  dm21: number;
  /** m3^2 - m1^2 in eV^2 (positive: normal ordering, negative: inverted). */
  dm31: number;
}

/**
 * NuFIT 6.0 (September 2024) best fits, IC19 without SK atmospheric data.
 * Esteban et al., JHEP 12 (2024) 216, arXiv:2410.05380, table 1.
 * Normal ordering: Delta m^2_3l = Delta m^2_31 = +2.534e-3.
 * Inverted ordering: Delta m^2_3l = Delta m^2_32 = -2.510e-3, so Delta m^2_31 = -2.510e-3 + 7.49e-5.
 */
export const NUFIT_NO: MixParams = { th12: 33.68 * DEG, th13: 8.52 * DEG, th23: 48.5 * DEG, delta: 177 * DEG, dm21: 7.49e-5, dm31: 2.534e-3 };
export const NUFIT_IO: MixParams = { th12: 33.68 * DEG, th13: 8.58 * DEG, th23: 48.6 * DEG, delta: 285 * DEG, dm21: 7.49e-5, dm31: -2.510e-3 + 7.49e-5 };

/** Two-flavour vacuum formula P(a -> b), a != b. */
export function p2(theta: number, dm2: number, L: number, E: number): number {
  const s2 = Math.sin(2 * theta);
  const s = Math.sin((K * dm2 * L) / E);
  return s2 * s2 * s * s;
}

/** Energy of the first oscillation maximum, where K dm2 L / E = pi / 2. */
export function firstMaxEnergy(dm2: number, L: number): number {
  return (2 * K * Math.abs(dm2) * L) / Math.PI;
}

/** Oscillation length in km: the distance over which the phase K dm2 L / E grows by pi. */
export function oscLength(dm2: number, E: number): number {
  return Math.abs(dm2) > 0 ? (Math.PI * E) / (K * Math.abs(dm2)) : Infinity;
}

/** Complex 3x3 matrix, row-major. */
export interface CMat {
  re: Float64Array;
  im: Float64Array;
}

export const cmat = (): CMat => ({ re: new Float64Array(9), im: new Float64Array(9) });

/** Standard PDG parametrisation of the PMNS matrix (rows = flavour, columns = mass). */
export function pmns(p: MixParams, out: CMat = cmat()): CMat {
  const c12 = Math.cos(p.th12), s12 = Math.sin(p.th12);
  const c13 = Math.cos(p.th13), s13 = Math.sin(p.th13);
  const c23 = Math.cos(p.th23), s23 = Math.sin(p.th23);
  const cd = Math.cos(p.delta), sd = Math.sin(p.delta);
  const { re, im } = out;
  // Row e
  re[0] = c12 * c13; im[0] = 0;
  re[1] = s12 * c13; im[1] = 0;
  re[2] = s13 * cd; im[2] = -s13 * sd;
  // Row mu
  re[3] = -s12 * c23 - c12 * s23 * s13 * cd; im[3] = -c12 * s23 * s13 * sd;
  re[4] = c12 * c23 - s12 * s23 * s13 * cd; im[4] = -s12 * s23 * s13 * sd;
  re[5] = s23 * c13; im[5] = 0;
  // Row tau
  re[6] = s12 * s23 - c12 * c23 * s13 * cd; im[6] = -c12 * c23 * s13 * sd;
  re[7] = -c12 * s23 - s12 * c23 * s13 * cd; im[7] = -s12 * c23 * s13 * sd;
  re[8] = c23 * c13; im[8] = 0;
  return out;
}

/** Max |(A A^dagger - I)_ij| and |(A^dagger A - I)_ij|. */
export function unitarityError(A: CMat): number {
  let worst = 0;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let r1 = 0, i1 = 0, r2 = 0, i2 = 0;
      for (let k = 0; k < 3; k++) {
        // (A A^dag)_ij = sum_k A_ik conj(A_jk)
        const ar = A.re[i * 3 + k], ai = A.im[i * 3 + k], br = A.re[j * 3 + k], bi = A.im[j * 3 + k];
        r1 += ar * br + ai * bi;
        i1 += ai * br - ar * bi;
        // (A^dag A)_ij = sum_k conj(A_ki) A_kj
        const cr = A.re[k * 3 + i], ci = A.im[k * 3 + i], dr = A.re[k * 3 + j], di = A.im[k * 3 + j];
        r2 += cr * dr + ci * di;
        i2 += cr * di - ci * dr;
      }
      const d = i === j ? 1 : 0;
      worst = Math.max(worst, Math.abs(r1 - d), Math.abs(i1), Math.abs(r2 - d), Math.abs(i2));
    }
  }
  return worst;
}

/**
 * Diagonalise a Hermitian 3x3 matrix with cyclic complex Jacobi rotations.
 * On return H is diagonal (eigenvalues on the diagonal) and V holds the eigenvectors as columns,
 * so that H_original = V diag(lambda) V^dagger. Handles degenerate eigenvalues.
 */
export function jacobiHermitian(H: CMat, V: CMat, lambda: Float64Array): void {
  V.re.fill(0);
  V.im.fill(0);
  V.re[0] = V.re[4] = V.re[8] = 1;
  const hr = H.re, hi = H.im, vr = V.re, vi = V.im;
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) off += Math.hypot(hr[p * 3 + q], hi[p * 3 + q]);
    let scale = 0;
    for (let p = 0; p < 3; p++) scale += Math.abs(hr[p * 4]);
    if (off <= 1e-17 * Math.max(scale, 1e-300) || off === 0) break;
    for (let p = 0; p < 2; p++) {
      for (let q = p + 1; q < 3; q++) {
        const r = Math.hypot(hr[p * 3 + q], hi[p * 3 + q]);
        if (r === 0) continue;
        const phi = Math.atan2(hi[p * 3 + q], hr[p * 3 + q]);
        const a = hr[p * 4], b = hr[q * 4];
        const th = 0.5 * Math.atan2(2 * r, a - b);
        const c = Math.cos(th), s = Math.sin(th);
        // J = D R with D = diag(1 at p, e^{-i phi} at q), R = [[c, -s], [s, c]] in the (p, q) block.
        // Columns of J: J_pp = c, J_qp = s e^{-i phi}, J_pq = -s, J_qq = c e^{-i phi}.
        const er = Math.cos(phi), ei = -Math.sin(phi);
        const Jpp_r = c, Jpp_i = 0;
        const Jqp_r = s * er, Jqp_i = s * ei;
        const Jpq_r = -s, Jpq_i = 0;
        const Jqq_r = c * er, Jqq_i = c * ei;
        // H <- H J (columns p, q)
        for (let k = 0; k < 3; k++) {
          const xr = hr[k * 3 + p], xi = hi[k * 3 + p], yr = hr[k * 3 + q], yi = hi[k * 3 + q];
          hr[k * 3 + p] = xr * Jpp_r - xi * Jpp_i + yr * Jqp_r - yi * Jqp_i;
          hi[k * 3 + p] = xr * Jpp_i + xi * Jpp_r + yr * Jqp_i + yi * Jqp_r;
          hr[k * 3 + q] = xr * Jpq_r - xi * Jpq_i + yr * Jqq_r - yi * Jqq_i;
          hi[k * 3 + q] = xr * Jpq_i + xi * Jpq_r + yr * Jqq_i + yi * Jqq_r;
          const ur = vr[k * 3 + p], ui = vi[k * 3 + p], wr = vr[k * 3 + q], wi = vi[k * 3 + q];
          vr[k * 3 + p] = ur * Jpp_r - ui * Jpp_i + wr * Jqp_r - wi * Jqp_i;
          vi[k * 3 + p] = ur * Jpp_i + ui * Jpp_r + wr * Jqp_i + wi * Jqp_r;
          vr[k * 3 + q] = ur * Jpq_r - ui * Jpq_i + wr * Jqq_r - wi * Jqq_i;
          vi[k * 3 + q] = ur * Jpq_i + ui * Jpq_r + wr * Jqq_i + wi * Jqq_r;
        }
        // H <- J^dagger H (rows p, q)
        for (let k = 0; k < 3; k++) {
          const xr = hr[p * 3 + k], xi = hi[p * 3 + k], yr = hr[q * 3 + k], yi = hi[q * 3 + k];
          // row p' = conj(Jpp) x + conj(Jqp) y ; row q' = conj(Jpq) x + conj(Jqq) y
          hr[p * 3 + k] = Jpp_r * xr + Jpp_i * xi + Jqp_r * yr + Jqp_i * yi;
          hi[p * 3 + k] = Jpp_r * xi - Jpp_i * xr + Jqp_r * yi - Jqp_i * yr;
          hr[q * 3 + k] = Jpq_r * xr + Jpq_i * xi + Jqq_r * yr + Jqq_i * yi;
          hi[q * 3 + k] = Jpq_r * xi - Jpq_i * xr + Jqq_r * yi - Jqq_i * yr;
        }
        hi[p * 4] = 0;
        hi[q * 4] = 0;
        hr[p * 3 + q] = hi[p * 3 + q] = hr[q * 3 + p] = hi[q * 3 + p] = 0;
      }
    }
  }
  for (let i = 0; i < 3; i++) lambda[i] = hr[i * 4];
}

/**
 * A propagation system: flavour-to-eigenstate matrix U and wavenumbers k (rad/km).
 * Amplitude(a -> b, L) = sum_i U_bi conj(U_ai) exp(-i k_i L).
 */
export interface OscSystem {
  U: CMat;
  k: Float64Array;
}

export interface SystemOptions {
  antineutrino?: boolean;
  /** Constant matter density in g/cm^3. 0 means vacuum. */
  rho?: number;
  ye?: number;
}

/** Squared masses relative to m1 (eV^2). */
export function massSquares(p: MixParams, out = new Float64Array(3)): Float64Array {
  out[0] = 0;
  out[1] = p.dm21;
  out[2] = p.dm31;
  return out;
}

/** Build the propagation system for energy E (GeV). Vacuum uses PMNS directly. Matter diagonalises H. */
export function buildSystem(p: MixParams, E: number, opts: SystemOptions = {}, out?: OscSystem): OscSystem {
  const sys = out ?? { U: cmat(), k: new Float64Array(3) };
  const U = pmns(p, sys.U);
  if (opts.antineutrino) for (let i = 0; i < 9; i++) U.im[i] = -U.im[i];
  const m2 = massSquares(p);
  const rho = opts.rho ?? 0;
  if (rho <= 0) {
    for (let i = 0; i < 3; i++) sys.k[i] = (2 * K * m2[i]) / E;
    return sys;
  }
  // H (eV^2, i.e. 2E times the Hamiltonian) = U diag(m2) U^dagger +/- diag(A, 0, 0)
  const H = cmat();
  for (let a = 0; a < 3; a++) {
    for (let b = 0; b < 3; b++) {
      let r = 0, im = 0;
      for (let i = 0; i < 3; i++) {
        const ur = U.re[a * 3 + i], ui = U.im[a * 3 + i], vr = U.re[b * 3 + i], vi = U.im[b * 3 + i];
        r += m2[i] * (ur * vr + ui * vi);
        im += m2[i] * (ui * vr - ur * vi);
      }
      H.re[a * 3 + b] = r;
      H.im[a * 3 + b] = im;
    }
  }
  const A = A_COEF * (opts.ye ?? YE) * rho * E;
  H.re[0] += opts.antineutrino ? -A : A;
  const V = cmat();
  const lam = new Float64Array(3);
  jacobiHermitian(H, V, lam);
  // Label matter eigenstates by the vacuum mass state they overlap most (best of the 6 permutations).
  const ov = new Float64Array(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let r = 0, im = 0;
      for (let a = 0; a < 3; a++) {
        const ur = U.re[a * 3 + i], ui = U.im[a * 3 + i], vr = V.re[a * 3 + j], vi = V.im[a * 3 + j];
        r += ur * vr + ui * vi;
        im += ur * vi - ui * vr;
      }
      ov[i * 3 + j] = r * r + im * im;
    }
  }
  let best = PERMS[0], bestScore = -1;
  for (const pm of PERMS) {
    const sc = ov[pm[0]] + ov[3 + pm[1]] + ov[6 + pm[2]];
    if (sc > bestScore) { bestScore = sc; best = pm; }
  }
  for (let i = 0; i < 3; i++) {
    const j = best[i];
    for (let a = 0; a < 3; a++) {
      sys.U.re[a * 3 + i] = V.re[a * 3 + j];
      sys.U.im[a * 3 + i] = V.im[a * 3 + j];
    }
    sys.k[i] = (2 * K * lam[j]) / E;
  }
  return sys;
}

const PERMS: [number, number, number][] = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];

const sinc = (x: number): number => (Math.abs(x) < 1e-8 ? 1 : Math.sin(x) / x);

/**
 * Flavour probabilities for a neutrino born as flavour a, after distance L (km).
 * If dL > 0 the result is averaged uniformly over [L - dL/2, L + dL/2], done exactly term by term.
 */
export function probs(sys: OscSystem, a: number, L: number, dL = 0, out = new Float64Array(3)): Float64Array {
  const { re, im } = sys.U;
  const k = sys.k;
  for (let b = 0; b < 3; b++) {
    // c_i = U_bi conj(U_ai)
    const c0r = re[b * 3] * re[a * 3] + im[b * 3] * im[a * 3];
    const c0i = im[b * 3] * re[a * 3] - re[b * 3] * im[a * 3];
    const c1r = re[b * 3 + 1] * re[a * 3 + 1] + im[b * 3 + 1] * im[a * 3 + 1];
    const c1i = im[b * 3 + 1] * re[a * 3 + 1] - re[b * 3 + 1] * im[a * 3 + 1];
    const c2r = re[b * 3 + 2] * re[a * 3 + 2] + im[b * 3 + 2] * im[a * 3 + 2];
    const c2i = im[b * 3 + 2] * re[a * 3 + 2] - re[b * 3 + 2] * im[a * 3 + 2];
    let P = c0r * c0r + c0i * c0i + c1r * c1r + c1i * c1i + c2r * c2r + c2i * c2i;
    P += cross(c0r, c0i, c1r, c1i, k[0] - k[1], L, dL);
    P += cross(c0r, c0i, c2r, c2i, k[0] - k[2], L, dL);
    P += cross(c1r, c1i, c2r, c2i, k[1] - k[2], L, dL);
    out[b] = P;
  }
  return out;
}

/** 2 Re[c_i conj(c_j) e^{-i dk L}], averaged over a window dL. */
function cross(ar: number, ai: number, br: number, bi: number, dk: number, L: number, dL: number): number {
  const xr = ar * br + ai * bi;
  const xi = ai * br - ar * bi;
  const ph = dk * L;
  const v = 2 * (xr * Math.cos(ph) + xi * Math.sin(ph));
  return dL > 0 ? v * sinc((dk * dL) / 2) : v;
}

/** Long-distance average of the survival probability for flavour a (all oscillating terms averaged away). */
export function averagedProbs(sys: OscSystem, a: number, out = new Float64Array(3)): Float64Array {
  const { re, im } = sys.U;
  for (let b = 0; b < 3; b++) {
    let P = 0;
    for (let i = 0; i < 3; i++) {
      const ub = re[b * 3 + i] ** 2 + im[b * 3 + i] ** 2;
      const ua = re[a * 3 + i] ** 2 + im[a * 3 + i] ** 2;
      P += ub * ua;
    }
    out[b] = P;
  }
  return out;
}

/** Chord length through a sphere of radius R for a straight line between two surface points at central angle alpha. */
export function chordLength(alpha: number, R = EARTH_DIAMETER_KM / 2): number {
  return 2 * R * Math.sin(alpha / 2);
}

/** Central angle subtended by a surface-to-surface chord of length L (clamped to a diameter). */
export function chordAngle(L: number, R = EARTH_DIAMETER_KM / 2): number {
  return 2 * Math.asin(Math.min(1, L / (2 * R)));
}
