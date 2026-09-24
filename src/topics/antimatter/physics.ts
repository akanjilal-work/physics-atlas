// Antimatter: pair production, annihilation, cloud-chamber tracks, PET backprojection
// and a simplified ALPHA-g release model. Pure functions, no DOM.

/** Electron rest energy, MeV (CODATA 2018). */
export const ME_MEV = 0.51099895;
/** Speed of light, m/s. */
export const C = 299_792_458;
/** Para-positronium (singlet, decays to 2γ) lifetime in vacuum, ns. */
export const PARA_PS_NS = 0.1244;
/** Ortho-positronium (triplet, decays to 3γ) lifetime in vacuum, ns. */
export const ORTHO_PS_NS = 142.05;
/** Lead: radiation length (mm) and minimum ionisation loss (MeV per mm). PDG values. */
export const PB_X0_MM = 5.612;
export const PB_DEDX_MEV_PER_MM = 1.273;
/** One TNT kiloton in joules. */
export const KILOTON_J = 4.184e12;

// ---------------------------------------------------------------------------
// Pair production and annihilation
// ---------------------------------------------------------------------------

/**
 * Threshold photon energy for γ + target → target + e⁺ + e⁻, in MeV.
 * From s = (M + 2m)²: E = 2m(1 + m/M). A heavy nucleus gives 2m = 1.022 MeV.
 */
export function pairThresholdMeV(targetMassMeV = Infinity): number {
  return 2 * ME_MEV * (1 + ME_MEV / targetMassMeV);
}

/** Kinetic energies shared by the pair (nucleus recoil neglected). f is the positron share. */
export function splitPair(eGammaMeV: number, f: number): { tPlus: number; tMinus: number } {
  const avail = Math.max(0, eGammaMeV - 2 * ME_MEV);
  return { tPlus: f * avail, tMinus: (1 - f) * avail };
}

/**
 * Two-photon annihilation of a pair with total energy E and total momentum p (MeV, MeV/c)
 * along one axis, photons emitted along that axis. At rest this gives E/2 each, back to back.
 */
export function twoPhotonEnergies(totalE: number, totalP: number): [number, number] {
  return [(totalE + totalP) / 2, (totalE - totalP) / 2];
}

/** Rest energy of a mass in kg, J. */
export function restEnergyJ(massKg: number): number {
  return massKg * C * C;
}

/** Energy released when a mass of antimatter annihilates with an equal mass of matter, J. */
export function annihilationEnergyJ(antimatterKg: number): number {
  return 2 * restEnergyJ(antimatterKg);
}

// ---------------------------------------------------------------------------
// Charged tracks in a magnetic field
// ---------------------------------------------------------------------------

export function momentumMeV(kinetic: number, mass = ME_MEV): number {
  return Math.sqrt(kinetic * kinetic + 2 * kinetic * mass);
}

/** Radius of curvature r = p/(|q|B) for unit charge, metres. p in MeV/c, B in tesla. */
export function gyroRadiusM(pMeV: number, bTesla: number): number {
  return (pMeV * 1e6) / (C * Math.abs(bTesla));
}

/**
 * Signed curvature (1/m), positive = counter-clockwise seen from +z, for charge q (units of e)
 * moving in the xy-plane with B = Bz ẑ. F = q v × B turns a positive charge clockwise when Bz > 0.
 */
export function signedCurvature(q: number, pMeV: number, bz: number): number {
  return (-q * bz * C) / (pMeV * 1e6);
}

/** Kinetic energy after crossing a lead plate: mean radiative loss e^(−t/X0), then ionisation. */
export function plateExitKinetic(t: number, thicknessMm: number): number {
  const out = t * Math.exp(-thicknessMm / PB_X0_MM) - PB_DEDX_MEV_PER_MM * thicknessMm;
  return Math.max(0, out);
}

export interface TrackSpec {
  q: number; // +1 positron, −1 electron
  t0: number; // kinetic energy, MeV
  bz: number; // tesla
  x0: number; y0: number; // start, m
  dir0: number; // start direction, rad
  ds: number; // step, m
  /** Ionisation loss at β = 1, MeV per metre. Scales as 1/β². */
  lossPerM: number;
  /** Multiple-scattering strength: Highland angle for the gas, 0 to switch off. */
  scatterX0: number; // radiation length of the gas, m (Infinity = none)
  /** Chamber radius, m. The track stops at the wall. */
  rMax: number;
  /** Optional vertical lead plate at x = plateX, thickness in mm (0 = none). */
  plateX: number;
  plateMm: number;
  tMin: number;
}

export interface TrackResult {
  n: number;
  /** Kinetic energy just before and after the plate (NaN if it never crossed). */
  tBefore: number;
  tAfter: number;
}

/**
 * Trace a charged track in the xy-plane. Writes (x, y, s) triples into out, where s is the
 * path length so far (m). Steps along exact circular arcs, losing energy between arcs.
 */
export function traceTrack(spec: TrackSpec, out: Float32Array, rng: () => number): TrackResult {
  const cap = Math.floor(out.length / 3);
  let x = spec.x0;
  let y = spec.y0;
  let th = spec.dir0;
  let t = spec.t0;
  let s = 0;
  let n = 0;
  let tBefore = NaN;
  let tAfter = NaN;
  let crossed = false;
  const push = () => {
    out[n * 3] = x;
    out[n * 3 + 1] = y;
    out[n * 3 + 2] = s;
    n++;
  };
  push();
  while (n < cap && t > spec.tMin) {
    const p = momentumMeV(t);
    const k = signedCurvature(spec.q, p, spec.bz);
    const dth = k * spec.ds;
    // Chord of an arc of length ds, taken at the mid-angle, is exact for a circle.
    const half = dth / 2;
    const chord = Math.abs(half) < 1e-9 ? spec.ds : (spec.ds * Math.sin(half)) / half;
    const nx = x + chord * Math.cos(th + half);
    const ny = y + chord * Math.sin(th + half);
    if (spec.plateMm > 0 && !crossed && (x - spec.plateX) * (nx - spec.plateX) < 0) {
      crossed = true;
      tBefore = t;
      t = plateExitKinetic(t, spec.plateMm);
      tAfter = t;
    }
    x = nx;
    y = ny;
    th += dth;
    s += spec.ds;
    const e = t + ME_MEV;
    const beta2 = (p * p) / (e * e);
    t -= (spec.lossPerM * spec.ds) / Math.max(0.05, beta2);
    if (Number.isFinite(spec.scatterX0) && t > 0) {
      const beta = Math.sqrt(beta2);
      const th0 = (13.6 / (beta * p)) * Math.sqrt(spec.ds / spec.scatterX0);
      th += th0 * gauss(rng);
    }
    push();
    if (x * x + y * y > spec.rMax * spec.rMax) break;
  }
  return { n, tBefore, tAfter };
}

// ---------------------------------------------------------------------------
// PET: lines of response and backprojection
// ---------------------------------------------------------------------------

/** Angle (rad, 0..2π) where the ray from (px, py) along phi meets the ring of radius R. */
export function ringHitAngle(px: number, py: number, phi: number, R: number): number {
  const dx = Math.cos(phi);
  const dy = Math.sin(phi);
  const b = px * dx + py * dy;
  const c = px * px + py * py - R * R;
  const t = -b + Math.sqrt(Math.max(0, b * b - c));
  const a = Math.atan2(py + t * dy, px + t * dx);
  return a < 0 ? a + 2 * Math.PI : a;
}

/** Index of the detector nearest to a ring angle, for N detectors starting at angle 0. */
export function detectorIndex(angle: number, N: number): number {
  const i = Math.round(angle / ((2 * Math.PI) / N)) % N;
  return i < 0 ? i + N : i;
}

/**
 * Add one line of response to an n×n image covering [−half, half]² (row 0 at y = −half).
 * Samples the chord every half pixel and adds the sampled length to the nearest pixel,
 * so each pixel collects the length of line that passes through it.
 */
export function backproject(img: Float32Array, n: number, half: number, x1: number, y1: number, x2: number, y2: number, w = 1): void {
  const pix = (2 * half) / n;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len === 0) return;
  // Clip the segment to the image square (Liang-Barsky).
  let t0 = 0;
  let t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  if (!clip(-dx, x1 + half) || !clip(dx, half - x1) || !clip(-dy, y1 + half) || !clip(dy, half - y1)) return;
  const step = pix / 2;
  const segLen = (t1 - t0) * len;
  const m = Math.max(1, Math.ceil(segLen / step));
  const ds = segLen / m;
  for (let k = 0; k < m; k++) {
    const u = t0 + ((k + 0.5) / m) * (t1 - t0);
    const i = Math.floor((x1 + u * dx + half) / pix);
    const j = Math.floor((y1 + u * dy + half) / pix);
    if (i >= 0 && i < n && j >= 0 && j < n) img[j * n + i] += w * ds;
  }
}

/** Position of the brightest pixel after a light 3×3 smoothing, in image coordinates. */
export function imagePeak(img: Float32Array, n: number, half: number): { x: number; y: number; v: number } {
  const pix = (2 * half) / n;
  let best = -Infinity;
  let bi = 0;
  let bj = 0;
  for (let j = 1; j < n - 1; j++) {
    for (let i = 1; i < n - 1; i++) {
      let s = 0;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) s += img[(j + b) * n + i + a] * (a === 0 && b === 0 ? 4 : a === 0 || b === 0 ? 2 : 1);
      if (s > best) { best = s; bi = i; bj = j; }
    }
  }
  return { x: -half + (bi + 0.5) * pix, y: -half + (bj + 0.5) * pix, v: best };
}

// ---------------------------------------------------------------------------
// ALPHA-g style release: a simplified 1D vertical model
// ---------------------------------------------------------------------------

export interface TrapParams {
  /** Mirror barrier height at full current (energy units, mass = 1). */
  depth: number;
  /** Mirror width in units of the half-length. */
  width: number;
  /** Gravitational potential slope for a = 1 g (energy per unit length). Exaggerated. */
  tilt: number;
  /** Antimatter gravitational acceleration in units of g (+1 = falls down). */
  ag: number;
  /** Mirror imbalance, expressed as an extra acceleration in units of g. */
  bias: number;
}

/** Potential energy at height z (mirrors at z = ±1) with mirror current fraction s. */
export function trapPotential(z: number, s: number, p: TrapParams): number {
  const a = (z - 1) / p.width;
  const b = (z + 1) / p.width;
  return p.depth * s * (Math.exp(-a * a) + Math.exp(-b * b)) + p.tilt * (p.ag + p.bias) * z;
}

function trapForce(z: number, s: number, p: TrapParams): number {
  const a = (z - 1) / p.width;
  const b = (z + 1) / p.width;
  const w = p.width;
  return p.depth * s * ((2 * a * Math.exp(-a * a)) / w + (2 * b * Math.exp(-b * b)) / w) - p.tilt * (p.ag + p.bias);
}

/** Status codes for the atom arrays. */
export const TRAPPED = 1;
export const LOST_UP = 2;
export const LOST_DOWN = 3;

/** Fill positions and velocities with a trapped population at full current (seeded). */
export function loadTrap(z: Float64Array, v: Float64Array, st: Uint8Array, p: TrapParams, rng: () => number): void {
  for (let i = 0; i < z.length; i++) {
    // Energy spread below the barrier, positions in the flat middle.
    const e = p.depth * (0.08 + 0.8 * rng());
    let zz = 0;
    let ke = 0;
    for (let k = 0; k < 20; k++) {
      zz = -0.85 + 1.7 * rng();
      ke = e - trapPotential(zz, 1, p);
      if (ke > 0) break;
    }
    z[i] = zz;
    v[i] = (rng() < 0.5 ? -1 : 1) * Math.sqrt(2 * Math.max(0, ke));
    st[i] = TRAPPED;
  }
}

/**
 * Advance every trapped atom by one velocity-Verlet step h with mirror fraction s.
 * Atoms that pass a mirror (|z| > 1) are marked lost. Returns [lostUp, lostDown] this step in out.
 */
export function trapStep(z: Float64Array, v: Float64Array, st: Uint8Array, p: TrapParams, s0: number, s1: number, h: number, out: Int32Array): void {
  out[0] = 0;
  out[1] = 0;
  for (let i = 0; i < z.length; i++) {
    if (st[i] !== TRAPPED) continue;
    const a0 = trapForce(z[i], s0, p);
    const vh = v[i] + 0.5 * h * a0;
    z[i] += h * vh;
    v[i] = vh + 0.5 * h * trapForce(z[i], s1, p);
    if (z[i] > 1) { st[i] = LOST_UP; out[0]++; }
    else if (z[i] < -1) { st[i] = LOST_DOWN; out[1]++; }
  }
}

/** Mirror current fraction for a linear ramp to zero over rampTime, starting at t = 0. */
export function rampFraction(t: number, rampTime: number): number {
  return t <= 0 ? 1 : Math.max(0, 1 - t / rampTime);
}

/** Run a whole release and return the fraction of atoms lost downward (used in tests). */
export function simulateRelease(p: TrapParams, nAtoms: number, rampTime: number, seed: number, h = 0.002): { up: number; down: number } {
  const rng = mulberry32(seed);
  const z = new Float64Array(nAtoms);
  const v = new Float64Array(nAtoms);
  const st = new Uint8Array(nAtoms);
  loadTrap(z, v, st, p, rng);
  const out = new Int32Array(2);
  let up = 0;
  let down = 0;
  let t = 0;
  const tEnd = rampTime + 5;
  while (t < tEnd && up + down < nAtoms) {
    trapStep(z, v, st, p, rampFraction(t, rampTime), rampFraction(t + h, rampTime), h, out);
    up += out[0];
    down += out[1];
    t += h;
  }
  return { up, down };
}

// ---------------------------------------------------------------------------
// Random numbers
// ---------------------------------------------------------------------------

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

export function gauss(rng: () => number): number {
  const u = Math.max(1e-12, rng());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}
