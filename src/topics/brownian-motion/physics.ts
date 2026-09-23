// Brownian motion: pure math, no DOM.
//
// Two models live here.
// 1. Macro: the Langevin equation m dv = -γ v dt + sqrt(2 γ kT) dW for many
//    independent grains. It is integrated with the exact Ornstein-Uhlenbeck
//    propagator, so any step size gives the right statistics.
// 2. Micro: one heavy sphere in an ideal gas of point-like molecules, with
//    elastic hard-sphere collisions. Every kick is a real momentum exchange.

/** Boltzmann constant (J/K), exact in SI since 2019. */
export const KB = 1.380649e-23;
/** Avogadro constant (1/mol), exact in SI since 2019. */
export const NA = 6.02214076e23;
/** Gas constant R = k_B N_A (J/(mol K)). */
export const R_GAS = KB * NA;

// ---------------------------------------------------------------------------
// Random numbers

/** Seeded PRNG (mulberry32) with a cached Box-Muller normal. No allocation per draw. */
export class Rng {
  private s: number;
  private spare = 0;
  private hasSpare = false;
  constructor(seed = 1) {
    this.s = seed >>> 0;
  }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  normal(): number {
    if (this.hasSpare) {
      this.hasSpare = false;
      return this.spare;
    }
    let u = this.next();
    while (u <= 1e-300) u = this.next();
    const v = this.next();
    const r = Math.sqrt(-2 * Math.log(u));
    this.spare = r * Math.sin(2 * Math.PI * v);
    this.hasSpare = true;
    return r * Math.cos(2 * Math.PI * v);
  }
}

// ---------------------------------------------------------------------------
// Stokes-Einstein and friends (SI units)

/** Stokes drag coefficient γ = 6πηa for a sphere of radius a (m) in a fluid of viscosity η (Pa s). */
export function stokesGamma(eta: number, a: number): number {
  return 6 * Math.PI * eta * a;
}

/** Stokes-Einstein diffusion coefficient D = kT / (6πηa), in m²/s. */
export function stokesEinstein(T: number, eta: number, a: number): number {
  return (KB * T) / stokesGamma(eta, a);
}

/** Mass of a sphere of radius a (m) and density rho (kg/m³). */
export function sphereMass(a: number, rho: number): number {
  return (4 / 3) * Math.PI * a ** 3 * rho;
}

/** Velocity memory time τ = m/γ (s). */
export function memoryTime(a: number, rho: number, eta: number): number {
  return sphereMass(a, rho) / stokesGamma(eta, a);
}

/** Perrin-style estimate of Avogadro's number from a measured D: N_A = RT / (6πηa D). */
export function avogadroFromD(T: number, eta: number, a: number, D: number): number {
  return (R_GAS * T) / (stokesGamma(eta, a) * D);
}

/** u - 1 + e^{-u}, accurate for small u. */
export function ornsteinShape(u: number): number {
  if (u < 1e-4) return u * u * (0.5 - u / 6 + (u * u) / 24);
  return u + Math.expm1(-u);
}

/**
 * Ornstein's 3D mean squared displacement for a grain that starts with a thermal velocity:
 * <r²(t)> = 6 (kT/m) τ² (t/τ - 1 + e^{-t/τ}).
 * Ballistic 3(kT/m) t² for t << τ, diffusive 6Dt with D = (kT/m) τ for t >> τ.
 */
export function msdOrnstein(t: number, tau: number, kTm: number): number {
  return 6 * kTm * tau * tau * ornsteinShape(t / tau);
}

/** Logarithmic slope d ln<r²> / d ln t of Ornstein's formula. 2 when ballistic, 1 when diffusive. */
export function msdLogSlope(t: number, tau: number): number {
  const u = t / tau;
  return (u * -Math.expm1(-u)) / ornsteinShape(u);
}

// ---------------------------------------------------------------------------
// Exact Ornstein-Uhlenbeck propagator for the free Langevin equation

export interface OUCoeffs {
  /** Velocity decay e^{-h/τ}. */
  c: number;
  /** Mean drift of x per unit of v0: τ(1 - c). */
  drift: number;
  /** Standard deviation of the velocity noise. */
  sv: number;
  /** Position noise that is correlated with the velocity noise, per unit ξ1. */
  kx: number;
  /** Remaining independent position noise. */
  sr: number;
}

export function makeCoeffs(): OUCoeffs {
  return { c: 1, drift: 0, sv: 0, kx: 0, sr: 0 };
}

/**
 * Fill `out` with the exact one-step coefficients for step h, memory time τ and kT/m.
 * Over a step the pair (x, v) changes by a correlated Gaussian:
 *   Var v = (kT/m)(1 - c²),  Cov(x, v) = (kT/m) τ (1 - c)²,
 *   Var x = (kT/m) τ² (2u - 3 + 4c - c²),  u = h/τ.
 */
export function ouCoeffs(h: number, tau: number, kTm: number, out: OUCoeffs): OUCoeffs {
  const u = h / tau;
  const omc = -Math.expm1(-u); // 1 - c
  const c = 1 - omc;
  const varV = kTm * omc * (1 + c);
  const cov = kTm * tau * omc * omc;
  let resid: number;
  if (u < 1e-3) {
    resid = (kTm * tau * tau * u * u * u) / 6;
  } else {
    const varX = kTm * tau * tau * (2 * u - 3 + 4 * c - c * c);
    resid = varX - (varV > 0 ? (cov * cov) / varV : 0);
  }
  out.c = c;
  out.drift = tau * omc;
  out.sv = Math.sqrt(varV);
  out.kx = varV > 0 ? cov / out.sv : 0;
  out.sr = Math.sqrt(Math.max(0, resid));
  return out;
}

/** Advance n grains (positions and velocities packed xyz) by one exact OU step. */
export function langevinStep(pos: Float64Array, vel: Float64Array, n: number, k: OUCoeffs, rng: Rng): void {
  for (let j = 0; j < 3 * n; j++) {
    const v0 = vel[j];
    const x1 = rng.normal();
    const x2 = rng.normal();
    vel[j] = v0 * k.c + k.sv * x1;
    pos[j] += v0 * k.drift + k.kx * x1 + k.sr * x2;
  }
}

/** Fill velocities with a Maxwell-Boltzmann sample (variance kT/m per component). */
export function thermalVelocities(vel: Float64Array, n: number, kTm: number, rng: Rng): void {
  const s = Math.sqrt(kTm);
  for (let j = 0; j < 3 * n; j++) vel[j] = s * rng.normal();
}

/** Mean of |r|² over n grains (displacement from the origin). */
export function meanSq(pos: Float64Array, n: number): number {
  let s = 0;
  for (let j = 0; j < 3 * n; j++) s += pos[j] * pos[j];
  return s / n;
}

/** Least-squares slope of ln y against ln t for samples with tLo <= t <= tHi. Returns NaN with fewer than 4 points. */
export function logSlope(ts: Float64Array, ys: Float64Array, count: number, tLo: number, tHi: number): number {
  let n = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < count; i++) {
    const t = ts[i];
    if (t < tLo || t > tHi || ys[i] <= 0) continue;
    const x = Math.log(t);
    const y = Math.log(ys[i]);
    n++;
    sx += x;
    sy += y;
    sxx += x * x;
    sxy += x * y;
  }
  if (n < 4) return NaN;
  const den = n * sxx - sx * sx;
  return den > 0 ? (n * sxy - sx * sy) / den : NaN;
}

// ---------------------------------------------------------------------------
// Micro model: one heavy sphere in an ideal gas, elastic collisions, reflecting box.

export interface MicroSim {
  n: number;
  /** Half-width of the cubic box. */
  L: number;
  /** Grain radius and mass (molecule mass is 1). */
  R: number;
  M: number;
  /** Collision radius R + r for molecule radius r. */
  Rc: number;
  pos: Float64Array;
  vel: Float64Array;
  /** Grain position and velocity. */
  G: Float64Array;
  V: Float64Array;
  /** Ring buffer of recent kicks: unit normal xyz and impulse magnitude. */
  kickN: Float32Array;
  kickJ: Float32Array;
  kickHead: number;
  kickTotal: number;
}

export const KICK_SLOTS = 48;

export function createMicro(maxN: number): MicroSim {
  return {
    n: 0, L: 6, R: 1, M: 20, Rc: 1.1,
    pos: new Float64Array(3 * maxN), vel: new Float64Array(3 * maxN),
    G: new Float64Array(3), V: new Float64Array(3),
    kickN: new Float32Array(3 * KICK_SLOTS), kickJ: new Float32Array(KICK_SLOTS), kickHead: 0, kickTotal: 0,
  };
}

/** Place n molecules uniformly outside the grain with thermal velocities (kT in units where m = 1). */
export function initMicro(s: MicroSim, n: number, kT: number, R: number, M: number, rMol: number, rng: Rng): void {
  s.n = n;
  s.R = R;
  s.M = M;
  s.Rc = R + rMol;
  s.G.fill(0);
  const sg = Math.sqrt(kT / M);
  for (let k = 0; k < 3; k++) s.V[k] = sg * rng.normal();
  const sm = Math.sqrt(kT);
  const lim = s.L - rMol;
  const keep = (s.Rc + 0.15) ** 2;
  for (let i = 0; i < n; i++) {
    let x = 0;
    let y = 0;
    let z = 0;
    do {
      x = (2 * rng.next() - 1) * lim;
      y = (2 * rng.next() - 1) * lim;
      z = (2 * rng.next() - 1) * lim;
    } while (x * x + y * y + z * z < keep);
    s.pos[3 * i] = x;
    s.pos[3 * i + 1] = y;
    s.pos[3 * i + 2] = z;
    for (let k = 0; k < 3; k++) s.vel[3 * i + k] = sm * rng.normal();
  }
  s.kickJ.fill(0);
  s.kickHead = 0;
  s.kickTotal = 0;
}

/** One time step: free flight, wall reflections, then elastic grain-molecule collisions. */
export function microStep(s: MicroSim, h: number): void {
  const { pos, vel, G, V, n } = s;
  const L = s.L;
  for (let j = 0; j < 3 * n; j++) {
    let x = pos[j] + vel[j] * h;
    if (x > L) {
      x = 2 * L - x;
      vel[j] = -vel[j];
    } else if (x < -L) {
      x = -2 * L - x;
      vel[j] = -vel[j];
    }
    pos[j] = x;
  }
  const LG = L - s.R;
  for (let k = 0; k < 3; k++) {
    let x = G[k] + V[k] * h;
    if (x > LG) {
      x = 2 * LG - x;
      V[k] = -V[k];
    } else if (x < -LG) {
      x = -2 * LG - x;
      V[k] = -V[k];
    }
    G[k] = x;
  }
  const Rc2 = s.Rc * s.Rc;
  const M = s.M;
  const mu2 = (2 * M) / (1 + M); // 2 m M / (m + M) with m = 1
  for (let i = 0; i < n; i++) {
    const b = 3 * i;
    const dx = pos[b] - G[0];
    const dy = pos[b + 1] - G[1];
    const dz = pos[b + 2] - G[2];
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= Rc2) continue;
    const dvn = (vel[b] - V[0]) * dx + (vel[b + 1] - V[1]) * dy + (vel[b + 2] - V[2]) * dz;
    if (dvn >= 0) continue;
    const d = Math.sqrt(d2);
    const nx = dx / d;
    const ny = dy / d;
    const nz = dz / d;
    const J = mu2 * (dvn / d); // negative: impulse on the molecule along n
    vel[b] -= J * nx;
    vel[b + 1] -= J * ny;
    vel[b + 2] -= J * nz;
    V[0] += (J / M) * nx;
    V[1] += (J / M) * ny;
    V[2] += (J / M) * nz;
    const kslot = s.kickHead;
    s.kickN[3 * kslot] = nx;
    s.kickN[3 * kslot + 1] = ny;
    s.kickN[3 * kslot + 2] = nz;
    s.kickJ[kslot] = -J;
    s.kickHead = (kslot + 1) % KICK_SLOTS;
    s.kickTotal++;
  }
}

/** Total molecular kinetic energy (m = 1). */
export function microGasKE(s: MicroSim): number {
  let e = 0;
  for (let j = 0; j < 3 * s.n; j++) e += s.vel[j] * s.vel[j];
  return 0.5 * e;
}

/** Grain kinetic energy. */
export function microGrainKE(s: MicroSim): number {
  return 0.5 * s.M * (s.V[0] ** 2 + s.V[1] ** 2 + s.V[2] ** 2);
}
