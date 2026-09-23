// Neutron stars and pulsars: spin-down, compactness, beam geometry and a
// Tolman–Oppenheimer–Volkoff mass–radius solver for piecewise-polytrope EOS fits.
// Pure math. No DOM, no Three.js.

export const C = 2.99792458e8; // m/s
export const G = 6.6743e-11; // SI
export const M_SUN = 1.98892e30; // kg
export const YEAR = 3.15576e7; // s (Julian year)
/** Nuclear saturation density, n0 = 0.16 fm^-3 times the neutron mass, kg/m^3. */
export const RHO_NUC = 0.16e45 * 1.67493e-27;
/** Canonical moment of inertia, 1e45 g cm^2 in SI. */
export const I_NS = 1e38;

/** Characteristic (spin-down) age in seconds, τ = P / (2 Ṗ). */
export const charAge = (P: number, Pdot: number): number => P / (2 * Pdot);

/** Surface dipole field estimate in gauss, B ≈ 3.2e19 √(P Ṗ). */
export const bSurface = (P: number, Pdot: number): number => 3.2e19 * Math.sqrt(P * Pdot);

/** Light-cylinder radius in metres, c / (2π f) = c P / (2π). */
export const lightCylinder = (P: number): number => (C * P) / (2 * Math.PI);

/** Spin-down luminosity in watts, 4π² I Ṗ / P³. */
export const spinDownPower = (P: number, Pdot: number, I = I_NS): number => (4 * Math.PI * Math.PI * I * Pdot) / (P * P * P);

/** Equatorial surface speed as a fraction of c. */
export const surfaceSpeed = (P: number, R: number): number => (2 * Math.PI * R) / P / C;

export interface Compactness {
  rs: number; // Schwarzschild radius, m
  u: number; // rs / R = 2GM/(R c^2)
  redshiftFactor: number; // 1 - 2GM/(R c^2)
  gNewton: number; // GM/R^2, m/s^2
  gSurface: number; // GR proper surface gravity, m/s^2
  vEsc: number; // escape speed / c
  meanDensity: number; // kg/m^3
  densityRatio: number; // mean density / nuclear density
  sugarCubeTonnes: number; // mass of 1 cm^3 at mean density, tonnes
  zSurf: number; // gravitational redshift z
  visibleFraction: number; // fraction of the surface visible to a distant observer
  psiMax: number; // largest visible colatitude from the sub-observer point, rad
}

/**
 * Compactness numbers for a star of mass M (kg) and radius R (m).
 * Visible fraction uses Beloborodov's (2002) light-bending approximation
 * 1 - cos α = (1 - cos ψ)(1 - u), which gives cos ψ_max = -u / (1 - u).
 */
export function compactness(M: number, R: number): Compactness {
  const rs = (2 * G * M) / (C * C);
  const u = rs / R;
  const f = 1 - u;
  const gN = (G * M) / (R * R);
  const cosPsi = Math.max(-1, -u / f);
  const rho = M / ((4 / 3) * Math.PI * R ** 3);
  return {
    rs,
    u,
    redshiftFactor: f,
    gNewton: gN,
    gSurface: gN / Math.sqrt(f),
    vEsc: Math.sqrt(u),
    meanDensity: rho,
    densityRatio: rho / RHO_NUC,
    sugarCubeTonnes: (rho * 1e-6) / 1000,
    zSurf: 1 / Math.sqrt(f) - 1,
    visibleFraction: (1 - cosPsi) / 2,
    psiMax: Math.acos(cosPsi),
  };
}

// ---------------------------------------------------------------- beam geometry

/**
 * Empirical radio beam half-opening angle (outer cone, Rankin 1993): ρ ≈ 5.75° P^-1/2.
 * Capped at 60° because the fit is meaningless for millisecond periods.
 */
export function beamHalfAngle(P: number): number {
  return Math.min(60, 5.75 / Math.sqrt(P)) * (Math.PI / 180);
}

/**
 * Angle between the observer and a beam at rotation phase φ.
 * alpha: magnetic inclination from the spin axis. zeta: observer angle from the spin axis.
 * beam = +1 for the north magnetic pole, -1 for the south pole.
 * The north beam passes the observer's meridian at φ = 0, the south one at φ = π.
 */
export function beamAngle(alpha: number, zeta: number, phi: number, beam: 1 | -1): number {
  const c = beam * (Math.cos(alpha) * Math.cos(zeta) + Math.sin(alpha) * Math.sin(zeta) * Math.cos(phi));
  return Math.acos(Math.max(-1, Math.min(1, c)));
}

/** Closest approach of each beam to the observer (impact angle), rad. */
export function impact(alpha: number, zeta: number, beam: 1 | -1): number {
  return beam === 1 ? Math.abs(zeta - alpha) : Math.abs(Math.PI - alpha - zeta);
}

/** True when the beam of half-angle rho ever sweeps across the observer. */
export const beamSeen = (alpha: number, zeta: number, rho: number, beam: 1 | -1): boolean => impact(alpha, zeta, beam) < rho;

/**
 * Full pulse width W (rad of rotation) for a beam that sweeps the observer.
 * From the spherical triangle: cos(W/2) = (cos ρ − cos α cos ζ) / (sin α sin ζ). Returns 0 if not seen.
 */
export function pulseWidth(alpha: number, zeta: number, rho: number, beam: 1 | -1 = 1): number {
  const a = beam === 1 ? alpha : Math.PI - alpha;
  if (!beamSeen(alpha, zeta, rho, beam)) return 0;
  const s = Math.sin(a) * Math.sin(zeta);
  if (s < 1e-12) return 2 * Math.PI; // observer on the spin axis inside the beam
  const c = (Math.cos(rho) - Math.cos(a) * Math.cos(zeta)) / s;
  if (c <= -1) return 2 * Math.PI;
  return 2 * Math.acos(Math.min(1, c));
}

/** Beam intensity seen by the observer, Gaussian in the beam angle, zero outside ρ. */
export function beamIntensity(alpha: number, zeta: number, rho: number, phi: number, beam: 1 | -1): number {
  const g = beamAngle(alpha, zeta, phi, beam);
  if (g >= rho) return 0;
  const x = g / rho;
  return Math.exp(-2.5 * x * x) - Math.exp(-2.5) * x * x;
}

// ---------------------------------------------------------------- equation of state + TOV

/** Crust fit shared by all Read et al. (2009) piecewise polytropes. K in units with p/c² in g/cm³. */
const CRUST: { K: number; G: number; rhoMax: number }[] = [
  { K: 6.8011e-9, G: 1.58425, rhoMax: 2.44034e7 },
  { K: 1.06186e-6, G: 1.28733, rhoMax: 3.78358e11 },
  { K: 5.32697e1, G: 0.62223, rhoMax: 2.6278e12 },
  { K: 3.99874e-8, G: 1.35692, rhoMax: NaN },
];

export interface EosFit {
  name: string;
  logP1: number; // log10 p at 10^14.7 g/cm^3, dyn/cm^2
  g1: number;
  g2: number;
  g3: number;
  /** Published values of the fit (Read et al. 2009, Table III). */
  mMax: number;
  r14: number;
}

export const EOS_FITS: EosFit[] = [
  { name: 'SLy', logP1: 34.384, g1: 3.005, g2: 2.988, g3: 2.851, mMax: 2.049, r14: 11.736 },
  { name: 'APR4', logP1: 34.269, g1: 2.83, g2: 3.445, g3: 3.348, mMax: 2.213, r14: 11.428 },
  { name: 'MPA1', logP1: 34.495, g1: 3.446, g2: 3.572, g3: 2.887, mMax: 2.461, r14: 12.473 },
];

interface Piece {
  K: number;
  G: number;
  a: number;
  rhoLo: number;
  pLo: number;
}

const C_CGS = 2.99792458e10;
const G_CGS = 6.6743e-8;
const MSUN_G = 1.98892e33;

/** Build the ordered polytrope pieces, with energy-density constants a_i for continuity. */
export function buildEos(fit: EosFit): Piece[] {
  const rho1 = 10 ** 14.7;
  const rho2 = 1e15;
  const p1 = 10 ** fit.logP1 / (C_CGS * C_CGS); // to g/cm^3
  const K1 = p1 / rho1 ** fit.g1;
  const K2 = p1 / rho1 ** fit.g2;
  const K3 = K2 * rho2 ** fit.g2 / rho2 ** fit.g3;
  const c3 = CRUST[3];
  const rhoJoin = (c3.K / K1) ** (1 / (fit.g1 - c3.G));
  const raw = [
    { K: CRUST[0].K, G: CRUST[0].G, rhoLo: 0 },
    { K: CRUST[1].K, G: CRUST[1].G, rhoLo: CRUST[0].rhoMax },
    { K: CRUST[2].K, G: CRUST[2].G, rhoLo: CRUST[1].rhoMax },
    { K: c3.K, G: c3.G, rhoLo: CRUST[2].rhoMax },
    { K: K1, G: fit.g1, rhoLo: rhoJoin },
    { K: K2, G: fit.g2, rhoLo: rho1 },
    { K: K3, G: fit.g3, rhoLo: rho2 },
  ];
  const out: Piece[] = [];
  let a = 0;
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    if (i > 0) {
      const q = raw[i - 1];
      const rho = r.rhoLo;
      // ε continuous: (1+a_prev) ρ + K_prev ρ^Γ_prev/(Γ_prev−1) = (1+a) ρ + K ρ^Γ/(Γ−1)
      const epsPrev = (1 + a) * rho + (q.K * rho ** q.G) / (q.G - 1);
      a = epsPrev / rho - 1 - (r.K * rho ** (r.G - 1)) / (r.G - 1);
    }
    out.push({ K: r.K, G: r.G, a, rhoLo: r.rhoLo, pLo: r.K * r.rhoLo ** r.G });
  }
  return out;
}

/** Energy density (g/cm^3) at pressure p (g/cm^3 units). */
export function epsOfP(eos: Piece[], p: number): number {
  let i = eos.length - 1;
  while (i > 0 && p < eos[i].pLo) i--;
  const e = eos[i];
  const rho = (p / e.K) ** (1 / e.G);
  return (1 + e.a) * rho + p / (e.G - 1);
}

export function pOfRho(eos: Piece[], rho: number): number {
  let i = eos.length - 1;
  while (i > 0 && rho < eos[i].rhoLo) i--;
  return eos[i].K * rho ** eos[i].G;
}

/**
 * Solve the TOV equations for central rest-mass density rhoC (g/cm^3).
 * Integrates in r with RK4 and a step that shrinks near the surface. Returns mass (M☉) and radius (km).
 */
export function tovStar(eos: Piece[], rhoC: number): { M: number; R: number } {
  const k = G_CGS / (C_CGS * C_CGS); // cm/g
  const pSurf = pOfRho(eos, 1e6);
  let r = 1; // cm
  let p = pOfRho(eos, rhoC);
  const e0 = epsOfP(eos, p);
  let m = (4 / 3) * Math.PI * r ** 3 * e0;
  const dp = (rr: number, pp: number, mm: number) => {
    if (pp <= 0) return 0;
    const e = epsOfP(eos, pp);
    return (-k * (e + pp) * (mm + 4 * Math.PI * rr ** 3 * pp)) / (rr * rr * (1 - (2 * k * mm) / rr));
  };
  const dm = (rr: number, pp: number) => (pp <= 0 ? 0 : 4 * Math.PI * rr * rr * epsOfP(eos, pp));
  for (let it = 0; it < 200000 && p > pSurf; it++) {
    // Step: at most 50 m, and at most 5% of the local pressure scale height.
    const d0 = dp(r, p, m);
    let h = 5000;
    if (d0 < 0) h = Math.min(h, (0.05 * p) / -d0);
    h = Math.max(h, 1);
    const k1p = d0;
    const k1m = dm(r, p);
    const k2p = dp(r + h / 2, p + (h / 2) * k1p, m + (h / 2) * k1m);
    const k2m = dm(r + h / 2, p + (h / 2) * k1p);
    const k3p = dp(r + h / 2, p + (h / 2) * k2p, m + (h / 2) * k2m);
    const k3m = dm(r + h / 2, p + (h / 2) * k2p);
    const k4p = dp(r + h, p + h * k3p, m + h * k3m);
    const k4m = dm(r + h, p + h * k3p);
    p += (h / 6) * (k1p + 2 * k2p + 2 * k3p + k4p);
    m += (h / 6) * (k1m + 2 * k2m + 2 * k3m + k4m);
    r += h;
  }
  return { M: m / MSUN_G, R: r / 1e5 };
}

export interface MRCurve {
  name: string;
  M: number[];
  R: number[];
  mMax: number;
  rAtMax: number;
}

/** Mass–radius sequence up to (and just past) the maximum mass. */
export function massRadius(fit: EosFit, n = 40): MRCurve {
  const eos = buildEos(fit);
  const M: number[] = [];
  const R: number[] = [];
  let mMax = 0;
  let rAtMax = 0;
  for (let i = 0; i < n; i++) {
    const lg = 14.35 + (i / (n - 1)) * (15.65 - 14.35);
    const s = tovStar(eos, 10 ** lg);
    M.push(s.M);
    R.push(s.R);
    if (s.M > mMax) {
      mMax = s.M;
      rAtMax = s.R;
    } else if (s.M < mMax - 0.02) break;
  }
  return { name: fit.name, M, R, mMax, rAtMax };
}

/** Radius at a given mass on the stable branch, by linear interpolation. */
export function radiusAt(curve: MRCurve, mass: number): number {
  for (let i = 1; i < curve.M.length; i++) {
    const a = curve.M[i - 1];
    const b = curve.M[i];
    if (b < a) break;
    if (mass >= a && mass <= b) return curve.R[i - 1] + ((mass - a) / (b - a)) * (curve.R[i] - curve.R[i - 1]);
  }
  return NaN;
}

// ---------------------------------------------------------------- presets

export interface Preset {
  id: string;
  label: string;
  P: number; // s
  Pdot: number; // s/s
  note: string;
}

/** ATNF catalogue values (Crab, Vela), Israel et al. 2016 (SGR 1935+2154), Hessels et al. 2006 (J1748−2446ad). */
export const PRESETS: Preset[] = [
  { id: 'crab', label: 'Crab', P: 0.0333924, Pdot: 4.2097e-13, note: 'Crab pulsar, PSR B0531+21. Born in the supernova of 1054.' },
  { id: 'vela', label: 'Vela', P: 0.0893284, Pdot: 1.25008e-13, note: 'Vela pulsar, PSR B0833−45. Famous for sudden spin-up glitches.' },
  { id: 'msp', label: 'J1748−2446ad', P: 1 / 716.36, Pdot: 1e-20, note: 'Fastest known spinner, 716 Hz, in the globular cluster Terzan 5. Its Ṗ is not cleanly measured, so 10⁻²⁰ is an assumed typical value.' },
  { id: 'magnetar', label: 'Magnetar', P: 3.245, Pdot: 1.43e-11, note: 'SGR 1935+2154, the magnetar that emitted a fast radio burst in April 2020.' },
];
