// Quark-gluon plasma: pure physics for a heavy-ion collision toy model.
// Units: GeV for energy and temperature, fm for length, fm/c for time.
// No DOM, no Three.js.

export const HBARC = 0.1973269804; // GeV fm
export const KB_EV = 8.617333262e-5; // Boltzmann constant, eV/K
export const M_U = 0.93149410242; // atomic mass unit, GeV (mean bound-nucleon mass)
export const M_PI = 0.13957; // charged pion mass, GeV
export const TC = 0.155; // QCD crossover temperature at mu_B = 0 (lattice, about 155 MeV)
export const T_FO = 0.11; // kinetic freeze-out temperature used by the toy
export const TAU0 = 1.0; // fm/c, Bjorken's conventional start time
export const KSS = 1 / (4 * Math.PI); // Kovtun-Son-Starinets value of eta/s

export type Beam = 'rhic' | 'lhc';

export interface BeamSpec {
  label: string;
  nucleus: 'Au' | 'Pb';
  A: number;
  Z: number;
  /** Energy per nucleon in each beam, GeV. */
  eN: number;
  /** Transverse energy per unit rapidity in central collisions, GeV (approximate). */
  dEtdy: number;
}

/** LHC Pb beams reach Z/A of the 6.37 TeV proton-equivalent magnet setting. */
export const LHC_PROTON_EQUIV = 6370;

export const BEAMS: Record<Beam, BeamSpec> = {
  rhic: { label: 'RHIC Au+Au, 200 GeV', nucleus: 'Au', A: 197, Z: 79, eN: 100, dEtdy: 750 },
  lhc: { label: 'LHC Pb+Pb, 5.02 TeV', nucleus: 'Pb', A: 208, Z: 82, eN: (LHC_PROTON_EQUIV * 82) / 208, dEtdy: 2500 },
};

/** Lorentz factor of a nucleus whose nucleons each carry energy eN (GeV). */
export const lorentzGamma = (eN: number): number => eN / M_U;
/** Beam rapidity y = arccosh(gamma). */
export const beamRapidity = (gamma: number): number => Math.acosh(gamma);
/** Collider centre-of-mass energy per nucleon pair, GeV. */
export const sqrtSNN = (eN: number): number => 2 * eN;
/** Hard-sphere nuclear radius, fm. */
export const nuclearRadius = (A: number): number => 1.2 * Math.cbrt(A);
/** Temperature in MeV to kelvin. */
export const mevToKelvin = (mev: number): number => (mev * 1e6) / KB_EV;

// ---------------------------------------------------------------------------
// Collision geometry: two hard spheres of radius R, centres at x = -b/2 and x = +b/2.
// The reaction plane is x-z, so Psi_R = 0.

/** Thickness 2 sqrt(R^2 - r^2) of a hard sphere, fm. */
export function thickness(dx: number, y: number, R: number): number {
  const q = R * R - dx * dx - y * y;
  return q > 0 ? 2 * Math.sqrt(q) : 0;
}

/** Participant-like weight: T_A + T_B where both nuclei overlap, else 0. */
export function overlapWeight(x: number, y: number, b: number, R: number): number {
  const ta = thickness(x + b / 2, y, R);
  const tb = thickness(x - b / 2, y, R);
  return ta > 0 && tb > 0 ? ta + tb : 0;
}

export interface Overlap {
  /** Weighted <x^2> and <y^2>, fm^2. */
  sxx: number;
  syy: number;
  /** Participant eccentricity (<y^2> - <x^2>) / (<y^2> + <x^2>). */
  ecc: number;
  /** Overlap area, fm^2. */
  area: number;
  /** Fraction of the 2A nucleons that sit in the overlap. */
  npartFrac: number;
  /** Area-averaged weight, fm. */
  wbar: number;
}

/** Moments of the almond by midpoint integration on an n x n grid. */
export function overlap(b: number, R: number, n = 200): Overlap {
  const h = (2 * R) / n;
  let W = 0, Wxx = 0, Wyy = 0, cells = 0;
  for (let i = 0; i < n; i++) {
    const x = -R + (i + 0.5) * h;
    for (let j = 0; j < n; j++) {
      const y = -R + (j + 0.5) * h;
      const w = overlapWeight(x, y, b, R);
      if (w > 0) {
        W += w;
        Wxx += w * x * x;
        Wyy += w * y * y;
        cells++;
      }
    }
  }
  const area = cells * h * h;
  if (W === 0) return { sxx: 0, syy: 0, ecc: 0, area: 0, npartFrac: 0, wbar: 0 };
  const sxx = Wxx / W;
  const syy = Wyy / W;
  const vol = (4 / 3) * Math.PI * R * R * R;
  return { sxx, syy, ecc: (syy - sxx) / (syy + sxx), area, npartFrac: (W * h * h) / (2 * vol), wbar: (W * h * h) / area };
}

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

/** Rejection-sample n points from the almond weight. Returns the number written. */
export function sampleOverlap(b: number, R: number, rng: () => number, n: number, xs: Float64Array, ys: Float64Array, ws: Float64Array): number {
  const xmax = Math.max(0, R - b / 2);
  if (xmax <= 0) return 0;
  const wmax = 4 * R;
  let k = 0;
  let guard = 0;
  while (k < n && guard < n * 400) {
    guard++;
    const x = (2 * rng() - 1) * xmax;
    const y = (2 * rng() - 1) * R;
    const w = overlapWeight(x, y, b, R);
    if (w > 0 && rng() * wmax < w) {
      xs[k] = x;
      ys[k] = y;
      ws[k] = w;
      k++;
    }
  }
  return k;
}

/** Eccentricity from sampled points (same definition as overlap().ecc). */
export function sampledEcc(xs: Float64Array, ys: Float64Array, n: number): number {
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i] * xs[i];
    sy += ys[i] * ys[i];
  }
  return (sy - sx) / (sy + sx);
}

// ---------------------------------------------------------------------------
// Energy density and equation of state.

/** Bjorken estimate: eps = (dE_T/dy) / (A_perp tau0), GeV/fm^3. */
export const bjorken = (dEtdy: number, areaFm2: number, tau0 = TAU0): number => dEtdy / (areaFm2 * tau0);

/** Stefan-Boltzmann degrees of freedom for gluons plus u, d, s quarks: 16 + (7/8)*36. */
export const G_SB = 16 + (7 / 8) * 2 * 2 * 3 * 3;
/** The toy EOS: about 80% of Stefan-Boltzmann above T_c (lattice-like), a hadron gas below. */
export const G_QGP = 0.8 * G_SB;
export const G_HAD = 12;
const DT_X = 0.012; // crossover width, GeV

export function gEff(T: number): number {
  return G_HAD + (G_QGP - G_HAD) * 0.5 * (1 + Math.tanh((T - TC) / DT_X));
}
/** Energy density of a massless gas with g degrees of freedom, GeV/fm^3. */
export const epsIdeal = (T: number, g: number): number => ((Math.PI * Math.PI) / 30) * g * T ** 4 / HBARC ** 3;
export const epsOfT = (T: number): number => epsIdeal(T, gEff(T));
/** Entropy density, fm^-3. */
export const sOfT = (T: number): number => ((2 * Math.PI * Math.PI) / 45) * gEff(T) * T ** 3 / HBARC ** 3;

function invert(f: (T: number) => number, target: number): number {
  let lo = 0, hi = 2;
  if (target <= 0) return 0;
  for (let i = 0; i < 48; i++) {
    const mid = 0.5 * (lo + hi);
    if (f(mid) < target) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}
export const tempFromEps = (eps: number): number => invert(epsOfT, eps);
export const tempFromS = (s: number): number => invert(sOfT, s);

/** Squared speed of sound: 1/3 for a conformal plasma, softer near the crossover. */
export const cs2Of = (T: number): number => 1 / 3 - 0.2 * Math.exp(-(((T - TC) / 0.025) ** 2));

// ---------------------------------------------------------------------------
// Fireball: a self-similar anisotropic expansion. Rx, Ry are the rms widths.
// In relativistic Euler flow the push is grad(p)/(e+p). For a Gaussian profile
// that is c_s^2/(1+c_s^2)/R at the rms radius. The toy scales each axis by
// R_mean/R_i on top of that, which mimics the steeper edges of the hard-sphere
// almond. Shear viscosity relaxes the difference between the two expansion
// velocities. Longitudinal expansion follows Bjorken (volume grows like tau).

/** Gain on the viscous term. Smooth profiles have milder gradients than real
 *  lumpy initial states, so the bare Navier-Stokes estimate is scaled up. */
export const VISC_GAIN = 6;

export interface FireballParams {
  beam: Beam;
  b: number;
  etaS: number;
}

export interface Fireball {
  p: FireballParams;
  R: number;
  geo: Overlap;
  eps0: number;
  T0: number;
  S: number; // entropy per unit rapidity, in units of s * tau * Rx * Ry
  tau: number;
  Rx0: number;
  Ry0: number;
  Rx: number;
  Ry: number;
  Ux: number;
  Uy: number;
  T: number;
}

export function createFireball(p: FireballParams, geo?: Overlap): Fireball {
  const spec = BEAMS[p.beam];
  const R = nuclearRadius(spec.A);
  const g = geo ?? overlap(p.b, R);
  const eps0 = g.area > 0 ? bjorken(spec.dEtdy * g.npartFrac, g.area) : 0;
  const T0 = tempFromEps(eps0);
  const Rx0 = Math.sqrt(Math.max(g.sxx, 1e-6));
  const Ry0 = Math.sqrt(Math.max(g.syy, 1e-6));
  return { p, R, geo: g, eps0, T0, S: sOfT(T0) * TAU0 * Rx0 * Ry0, tau: TAU0, Rx0, Ry0, Rx: Rx0, Ry: Ry0, Ux: 0, Uy: 0, T: T0 };
}

const deriv = (f: Fireball, Rx: number, Ry: number, Ux: number, Uy: number, tau: number, out: Float64Array): void => {
  const T = tempFromS(f.S / (tau * Rx * Ry));
  const c2 = cs2Of(T);
  const a = c2 / (1 + c2);
  const vx = Ux / Math.sqrt(1 + Ux * Ux);
  const vy = Uy / Math.sqrt(1 + Uy * Uy);
  const lv = T > 0 ? (VISC_GAIN * f.p.etaS * HBARC) / T : 0; // eta/(e+p) = (eta/s)/T, in fm
  const Rb2 = Rx * Ry;
  const Rb = Math.sqrt(Rb2);
  out[0] = vx;
  out[1] = vy;
  out[2] = (a * Rb) / (Rx * Rx) - (lv * (vx - vy)) / Rb2;
  out[3] = (a * Rb) / (Ry * Ry) - (lv * (vy - vx)) / Rb2;
};

const k1 = new Float64Array(4);
const k2 = new Float64Array(4);

/** Advance by h fm/c with midpoint RK2. */
export function stepFireball(f: Fireball, h: number): void {
  deriv(f, f.Rx, f.Ry, f.Ux, f.Uy, f.tau, k1);
  deriv(f, f.Rx + 0.5 * h * k1[0], f.Ry + 0.5 * h * k1[1], f.Ux + 0.5 * h * k1[2], f.Uy + 0.5 * h * k1[3], f.tau + 0.5 * h, k2);
  f.Rx += h * k2[0];
  f.Ry += h * k2[1];
  f.Ux += h * k2[2];
  f.Uy += h * k2[3];
  f.tau += h;
  f.T = tempFromS(f.S / (f.tau * f.Rx * f.Ry));
}

/** Local temperature of a fluid cell whose area-normalised weight is w (eps scales with w). */
export const localT = (f: Fireball, wNorm: number): number => (wNorm > 0 ? f.T * Math.pow(wNorm, 0.25) : 0);

/** Temperature at a transverse point (x, y) of the expanded fireball. */
export function tempAt(f: Fireball, x: number, y: number): number {
  const x0 = (x * f.Rx0) / f.Rx;
  const y0 = (y * f.Ry0) / f.Ry;
  const w = overlapWeight(x0, y0, f.p.b, f.R);
  return w > 0 && f.geo.wbar > 0 ? localT(f, w / f.geo.wbar) : 0;
}

/** Flow velocity of a cell that started at (x0, y0). Writes vx, vy into out. */
export function cellVelocity(f: Fireball, x0: number, y0: number, out: Float64Array): void {
  const ux = (x0 / f.Rx0) * f.Ux;
  const uy = (y0 / f.Ry0) * f.Uy;
  const g = Math.sqrt(1 + ux * ux + uy * uy);
  out[0] = ux / g;
  out[1] = uy / g;
}

// ---------------------------------------------------------------------------
// Hadron emission and v2.

/**
 * Sample one pion from a thermal source at temperature T moving with transverse
 * velocity (vx, vy). The rest-frame momentum is massless-Boltzmann distributed
 * (p^2 e^{-p/T}). Writes px, py, pz, E into out (GeV).
 */
export function sampleHadron(vx: number, vy: number, T: number, rng: () => number, out: Float64Array): void {
  const p = -T * Math.log((rng() + 1e-12) * (rng() + 1e-12) * (rng() + 1e-12));
  const cz = 2 * rng() - 1;
  const sz = Math.sqrt(1 - cz * cz);
  const ph = 2 * Math.PI * rng();
  let px = p * sz * Math.cos(ph);
  let py = p * sz * Math.sin(ph);
  const pz = p * cz;
  const E = Math.sqrt(p * p + M_PI * M_PI);
  const v2 = vx * vx + vy * vy;
  let Eb = E;
  if (v2 > 1e-12) {
    const v = Math.sqrt(v2);
    const nx = vx / v, ny = vy / v;
    const g = 1 / Math.sqrt(1 - v2);
    const par = px * nx + py * ny;
    const parB = g * (par + v * E);
    Eb = g * (E + v * par);
    px += (parB - par) * nx;
    py += (parB - par) * ny;
  }
  out[0] = px;
  out[1] = py;
  out[2] = pz;
  out[3] = Eb;
}

export interface FlowAcc {
  n: number;
  c2: number;
  s2: number;
  hist: Float64Array;
}
export const newAcc = (bins = 36): FlowAcc => ({ n: 0, c2: 0, s2: 0, hist: new Float64Array(bins) });
export function clearAcc(a: FlowAcc): void {
  a.n = a.c2 = a.s2 = 0;
  a.hist.fill(0);
}
export function addPhi(a: FlowAcc, phi: number): void {
  a.n++;
  a.c2 += Math.cos(2 * phi);
  a.s2 += Math.sin(2 * phi);
  let u = phi / (2 * Math.PI);
  u -= Math.floor(u);
  a.hist[Math.min(a.hist.length - 1, Math.floor(u * a.hist.length))]++;
}
/** v2 relative to the true reaction plane (Psi_R = 0). */
export const v2Of = (a: FlowAcc): number => (a.n > 0 ? a.c2 / a.n : 0);
/** Statistical error of <cos 2phi>, about 1/sqrt(2N). */
export const v2Err = (a: FlowAcc): number => (a.n > 1 ? Math.sqrt(Math.max(0, 0.5 - v2Of(a) ** 2) / a.n) : 1);
/** Event-plane fit: magnitude and angle of the second harmonic. */
export function fitSecondHarmonic(phis: ArrayLike<number>): { v2: number; psi: number } {
  let c = 0, s = 0;
  for (let i = 0; i < phis.length; i++) {
    c += Math.cos(2 * phis[i]);
    s += Math.sin(2 * phis[i]);
  }
  c /= phis.length;
  s /= phis.length;
  return { v2: Math.hypot(c, s), psi: 0.5 * Math.atan2(s, c) };
}
/** Draw phi from dN/dphi proportional to 1 + 2 v2 cos 2(phi - psi) by rejection. */
export function samplePhi(v2: number, psi: number, rng: () => number): number {
  const top = 1 + 2 * Math.abs(v2);
  for (;;) {
    const phi = 2 * Math.PI * rng();
    if (rng() * top < 1 + 2 * v2 * Math.cos(2 * (phi - psi))) return phi;
  }
}

// ---------------------------------------------------------------------------
// Jet quenching, qualitative. A parton loses energy at a rate that grows with
// the time spent in the medium, so the total loss grows like L^2 (the BDMPS
// scaling for radiative loss in a static medium) and like T^3.

export const JET_K = 40; // GeV^-2 fm^-2, sets the overall size of the loss

export interface Jet {
  x: number;
  y: number;
  dx: number;
  dy: number;
  E: number;
  E0: number;
  /** Path length travelled inside hot matter, fm. */
  L: number;
}

/** Move a jet by h fm at the speed of light through matter at temperature T (GeV). */
export function jetStep(j: Jet, h: number, T: number): void {
  if (T > TC * 0.9 && j.E > 0) {
    j.L += h;
    j.E = Math.max(0, j.E - JET_K * T ** 3 * j.L * h * 2);
  }
  j.x += j.dx * h;
  j.y += j.dy * h;
}

// ---------------------------------------------------------------------------
// Phase diagram helpers.

/** Chemical freeze-out baryon chemical potential vs sqrt(s_NN) (Cleymans et al. 2006), GeV. */
export const muBFreeze = (sqrtS: number): number => 1.308 / (1 + 0.273 * sqrtS);
/** Chemical freeze-out temperature vs mu_B, GeV. The curvature is from Cleymans et al.,
 *  the mu_B = 0 value is the 156.5 MeV found by Andronic et al. (2018) at the LHC. */
export const tFreeze = (mu: number): number => 0.1565 - 0.139 * mu * mu - 0.053 * mu ** 4;
/** Lattice crossover line T_c(mu_B) = T_c (1 - kappa2 (mu_B/T_c)^2), valid at small mu_B. */
export const KAPPA2 = 0.015;
export const tcOfMu = (mu: number): number => TC * (1 - KAPPA2 * (mu / TC) ** 2);
