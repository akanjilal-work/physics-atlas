// Tides, tidal locking and the Roche limit. Pure math: no DOM, no Three.js.

// --- Physical constants (SI)
export const G = 6.674e-11;
export const M_EARTH = 5.972e24;
export const R_EARTH = 6.371e6; // mean radius
export const R_EARTH_EQ = 6.3781e6; // equatorial radius, used for Earth-radius distance units
export const M_MOON = 7.342e22;
export const M_SUN = 1.989e30;
export const D_MOON = 3.844e8; // mean Earth-Moon distance
export const AU = 1.496e11;
export const RHO_EARTH = 5514;
export const RHO_MOON = 3344;
export const RHO_SATURN = 687;
export const R_SATURN = 6.0268e7;
/** Earth's moment of inertia, 0.3307 M R². */
export const I_EARTH = 0.3307 * M_EARTH * R_EARTH * R_EARTH;
export const SIDEREAL_DAY = 86164.1;
export const SIDEREAL_YEAR = 365.256 * 86400;

/** Fluid-body Roche coefficient. */
export const ROCHE_FLUID = 2.44;
/** Rigid-sphere coefficient, 2^(1/3). */
export const ROCHE_RIGID = Math.cbrt(2);
/** Rigid sphere that also rotates synchronously: 3^(1/3). */
export const ROCHE_RIGID_SYNC = Math.cbrt(3);

// --- Tidal acceleration

/** Linearised tidal stretch along the line to the body: 2GMr/d³. */
export function tidalApprox(GM: number, r: number, d: number): number {
  return (2 * GM * r) / (d * d * d);
}

/** Exact difference in pull between a point r closer to the body and the centre. */
export function tidalExactNear(GM: number, r: number, d: number): number {
  return GM / ((d - r) * (d - r)) - GM / (d * d);
}

/** Exact difference on the far side (point r farther away): centre pull minus far pull. */
export function tidalExactFar(GM: number, r: number, d: number): number {
  return GM / (d * d) - GM / ((d + r) * (d + r));
}

/**
 * Exact tidal (difference) field at point p relative to the planet centre,
 * from a body at position b: a = GM[(b - p)/|b - p|³ - b/|b|³]. Writes into out.
 */
export function tidalField(GM: number, bx: number, by: number, bz: number, px: number, py: number, pz: number, out: Float64Array | number[]): void {
  const dx = bx - px;
  const dy = by - py;
  const dz = bz - pz;
  const r3 = Math.pow(dx * dx + dy * dy + dz * dz, 1.5);
  const b3 = Math.pow(bx * bx + by * by + bz * bz, 1.5);
  out[0] = GM * (dx / r3 - bx / b3);
  out[1] = GM * (dy / r3 - by / b3);
  out[2] = GM * (dz / r3 - bz / b3);
}

/** Raw pull of the body at point p (no subtraction). */
export function rawPull(GM: number, bx: number, by: number, bz: number, px: number, py: number, pz: number, out: Float64Array | number[]): void {
  const dx = bx - px;
  const dy = by - py;
  const dz = bz - pz;
  const r3 = Math.pow(dx * dx + dy * dy + dz * dz, 1.5);
  out[0] = (GM * dx) / r3;
  out[1] = (GM * dy) / r3;
  out[2] = (GM * dz) / r3;
}

/**
 * Equilibrium-tide scale K = (M/M_E)(R/d)³ R, in metres.
 * The height is h(ψ) = K (3cos²ψ − 1)/2, where ψ is the angle from the sub-body point.
 */
export function tideScale(mass: number, d: number): number {
  const q = R_EARTH / d;
  return (mass / M_EARTH) * q * q * q * R_EARTH;
}

export function tideHeight(cosPsi: number, K: number): number {
  return K * (1.5 * cosPsi * cosPsi - 0.5);
}

/** Sun-to-Moon tide ratio for a given Moon distance. */
export function sunMoonRatio(dMoon = D_MOON, dSun = AU): number {
  const q = dMoon / dSun;
  return (M_SUN / M_MOON) * q * q * q;
}

/**
 * Equilibrium tidal range on the equator (max minus min over longitude) with the
 * Moon and Sun both in the equatorial plane, separated by `sepDeg`.
 */
export function equatorRange(dMoon: number, sepDeg: number, dSun = AU): number {
  const km = tideScale(M_MOON, dMoon);
  const ks = tideScale(M_SUN, dSun);
  const a = (sepDeg * Math.PI) / 180;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < 720; i++) {
    const l = (i / 720) * Math.PI * 2;
    const h = tideHeight(Math.cos(l), km) + tideHeight(Math.cos(l - a), ks);
    if (h < lo) lo = h;
    if (h > hi) hi = h;
  }
  return hi - lo;
}

// --- Roche limit

export function rocheFluid(rPrimary: number, rhoPrimary: number, rhoMoon: number): number {
  return ROCHE_FLUID * rPrimary * Math.cbrt(rhoPrimary / rhoMoon);
}

export function rocheRigid(rPrimary: number, rhoPrimary: number, rhoMoon: number): number {
  return ROCHE_RIGID * rPrimary * Math.cbrt(rhoPrimary / rhoMoon);
}

// --- Earth's day from angular momentum

const MU_RED = (M_EARTH * M_MOON) / (M_EARTH + M_MOON);
const GM_SUM = G * (M_EARTH + M_MOON);

/** Orbital angular momentum of the Earth-Moon pair on a circular orbit of radius a. */
export function orbitalL(a: number): number {
  return MU_RED * Math.sqrt(GM_SUM * a);
}

const L_TOTAL = I_EARTH * ((2 * Math.PI) / SIDEREAL_DAY) + orbitalL(D_MOON);

/** Earth's sidereal spin rate if the Moon sat at distance a, with total L conserved (solar torque ignored). */
export function earthSpin(a: number): number {
  return (L_TOTAL - orbitalL(a)) / I_EARTH;
}

/** Solar day in seconds for Moon distance a. */
export function solarDay(a: number): number {
  const pSid = (2 * Math.PI) / earthSpin(a);
  return 1 / (1 / pSid - 1 / SIDEREAL_YEAR);
}

/** Williams (2000): Earth-Moon distance 620 Myr ago, in equatorial Earth radii. */
export const A_620_RE = 58.16;
export const A_NOW_RE = D_MOON / R_EARTH_EQ;

/** Moon distance at geologic time T (Myr, negative = past), linear between 620 Ma and today. */
export function moonDistanceAt(tMyr: number): number {
  const u = (tMyr + 620) / 620;
  return (A_620_RE + (A_NOW_RE - A_620_RE) * u) * R_EARTH_EQ;
}

// --- Spin-orbit locking toy

export interface SpinState {
  /** Spin angle of the long axis. */
  theta: number;
  /** Spin rate. */
  omega: number;
  /** Orbital angle. */
  phi: number;
}

/**
 * One RK2 step of a triaxial moon on a circular orbit with mean motion n:
 *   θ'' = −(3/2) n² ε sin 2(θ − φ) − c (θ' − n)
 * The first term is the gravity-gradient torque on the long axis. The second is a
 * crude tidal-friction term that damps spin relative to the orbit.
 */
export function spinStep(s: SpinState, n: number, eps: number, c: number, h: number): void {
  const acc = (th: number, om: number, ph: number) => -1.5 * n * n * eps * Math.sin(2 * (th - ph)) - c * (om - n);
  const a1 = acc(s.theta, s.omega, s.phi);
  const thM = s.theta + 0.5 * h * s.omega;
  const omM = s.omega + 0.5 * h * a1;
  const phM = s.phi + 0.5 * h * n;
  const a2 = acc(thM, omM, phM);
  s.theta += h * omM;
  s.omega += h * a2;
  s.phi += h * n;
}

// --- Particle moon (toy)

/** Deterministic PRNG. */
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

/** Simulation units: G = 1, moon mass 1, moon radius about 1. */
export const PM = 216; // planet mass, so (M/m)^(1/3) = 6
export const MOON_R = 1;
/** Fluid Roche distance in simulation units: 2.44 a (M/m)^(1/3). */
export const DF_SIM = ROCHE_FLUID * MOON_R * Math.cbrt(PM);
/** Orbital period at the fluid Roche limit (independent of M). */
export const T_ROCHE = 2 * Math.PI * Math.sqrt((DF_SIM * DF_SIM * DF_SIM) / PM);

export type Body = 'rubble' | 'rigid';

export interface MoonParams {
  n: number;
  /** Contact radius of a particle. */
  s: number;
  /** Plummer softening of self-gravity. */
  eps: number;
  /** Contact stiffness (force per overlap). */
  k: number;
  /** Normal contact damping (force per relative speed). */
  c: number;
}

export function defaultMoonParams(n = 300): MoonParams {
  const s = 0.1316 * Math.cbrt(300 / n);
  return { n, s, eps: s, k: 2.5, c: 0.04 };
}

export interface MoonSim {
  body: Body;
  p: MoonParams;
  n: number;
  x: Float64Array;
  y: Float64Array;
  z: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  vz: Float64Array;
  ax: Float64Array;
  ay: Float64Array;
  az: Float64Array;
  alive: Uint8Array;
  /** Orbit radius of the moon centre (sim units). */
  d: number;
  /** Mean motion. */
  nOrb: number;
  /** Planet radius (sim units). */
  rp: number;
  t: number;
  /** Rigid mode: count of grains that left the surface. */
  lost: number;
  lostFlag: Uint8Array;
}

/**
 * A self-gravitating ball of N particles, relaxed in isolation with heavy damping.
 * Returns interleaved xyz positions centred on the origin.
 */
export function relaxedBall(p: MoonParams, seed: number, steps = 1600): Float64Array {
  const rnd = mulberry32(seed);
  const n = p.n;
  const pos = new Float64Array(n * 3);
  const minSep = 1.7 * p.s;
  let placed = 0;
  let tries = 0;
  const R0 = 1.12;
  while (placed < n && tries < 200000) {
    tries++;
    const x = (rnd() * 2 - 1) * R0;
    const y = (rnd() * 2 - 1) * R0;
    const z = (rnd() * 2 - 1) * R0;
    if (x * x + y * y + z * z > R0 * R0) continue;
    let ok = true;
    for (let j = 0; j < placed; j++) {
      const dx = pos[j * 3] - x;
      const dy = pos[j * 3 + 1] - y;
      const dz = pos[j * 3 + 2] - z;
      if (dx * dx + dy * dy + dz * dz < minSep * minSep) { ok = false; break; }
    }
    if (!ok) continue;
    pos[placed * 3] = x;
    pos[placed * 3 + 1] = y;
    pos[placed * 3 + 2] = z;
    placed++;
  }
  const sim = makeSim(p, 'rubble', 1e9, 0);
  for (let i = 0; i < n; i++) {
    sim.x[i] = pos[i * 3];
    sim.y[i] = pos[i * 3 + 1];
    sim.z[i] = pos[i * 3 + 2];
  }
  const h = 0.01;
  selfForces(sim);
  for (let k = 0; k < steps; k++) {
    stepRubble(sim, h);
    const damp = k < steps * 0.8 ? 0.97 : 0.995;
    for (let i = 0; i < n; i++) {
      sim.vx[i] *= damp;
      sim.vy[i] *= damp;
      sim.vz[i] *= damp;
    }
  }
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) { cx += sim.x[i]; cy += sim.y[i]; cz += sim.z[i]; }
  cx /= n; cy /= n; cz /= n;
  for (let i = 0; i < n; i++) {
    pos[i * 3] = sim.x[i] - cx;
    pos[i * 3 + 1] = sim.y[i] - cy;
    pos[i * 3 + 2] = sim.z[i] - cz;
  }
  return pos;
}

function makeSim(p: MoonParams, body: Body, d: number, rp: number): MoonSim {
  const n = p.n;
  return {
    body, p, n, d, rp,
    nOrb: Math.sqrt(PM / (d * d * d)),
    x: new Float64Array(n), y: new Float64Array(n), z: new Float64Array(n),
    vx: new Float64Array(n), vy: new Float64Array(n), vz: new Float64Array(n),
    ax: new Float64Array(n), ay: new Float64Array(n), az: new Float64Array(n),
    alive: new Uint8Array(n).fill(1),
    t: 0, lost: 0, lostFlag: new Uint8Array(n),
  };
}

/** Rigid-mode grain parameters. */
export const GRAIN_R = 0.07;
const GRAIN_K = 600;
const GRAIN_CN = 25;
const GRAIN_CT = 4;

/**
 * Start a moon on a circular orbit of radius d (sim units) with synchronous spin.
 * Rubble: the relaxed ball `ball`. Rigid: grains resting on a solid sphere of radius 1.
 */
export function launchMoon(p: MoonParams, body: Body, ball: Float64Array, d: number, rp: number, seed = 7): MoonSim {
  const sim = makeSim(p, body, d, rp);
  const n = sim.n;
  const w = sim.nOrb;
  if (body === 'rubble') {
    for (let i = 0; i < n; i++) {
      const lx = ball[i * 3];
      const ly = ball[i * 3 + 1];
      const lz = ball[i * 3 + 2];
      sim.x[i] = d + lx;
      sim.y[i] = ly;
      sim.z[i] = lz;
      // Rigid rotation at rate w about z through the planet: v = w ẑ × r.
      sim.vx[i] = -w * ly;
      sim.vy[i] = w * (d + lx);
      sim.vz[i] = 0;
    }
  } else {
    const rnd = mulberry32(seed);
    const rr = MOON_R + GRAIN_R * 0.95;
    for (let i = 0; i < n; i++) {
      // Even spread by the golden-angle spiral, with a small random jitter.
      const u = 1 - (2 * (i + 0.5)) / n;
      const ph = i * 2.399963 + rnd() * 0.2;
      const q = Math.sqrt(1 - u * u);
      const lx = rr * q * Math.cos(ph);
      const ly = rr * q * Math.sin(ph);
      const lz = rr * u;
      sim.x[i] = d + lx;
      sim.y[i] = ly;
      sim.z[i] = lz;
      sim.vx[i] = -w * ly;
      sim.vy[i] = w * (d + lx);
      sim.vz[i] = 0;
    }
  }
  if (body === 'rubble') selfForces(sim);
  else rigidForces(sim);
  return sim;
}

/** Self-gravity, contacts and planet gravity for the rubble pile. */
function selfForces(sim: MoonSim): void {
  const { n, x, y, z, vx, vy, vz, ax, ay, az, alive, p } = sim;
  const mu = 1 / n;
  const eps2 = p.eps * p.eps;
  const s2 = 4 * p.s * p.s;
  const twoS = 2 * p.s;
  const kmu = p.k / mu;
  const cmu = p.c / mu;
  const M = sim.d > 1e8 ? 0 : PM;
  for (let i = 0; i < n; i++) {
    if (!alive[i]) { ax[i] = ay[i] = az[i] = 0; continue; }
    const r2 = x[i] * x[i] + y[i] * y[i] + z[i] * z[i];
    const f = M > 0 ? -M / (r2 * Math.sqrt(r2)) : 0;
    ax[i] = f * x[i];
    ay[i] = f * y[i];
    az[i] = f * z[i];
  }
  for (let i = 0; i < n; i++) {
    if (!alive[i]) continue;
    const xi = x[i], yi = y[i], zi = z[i];
    let axi = 0, ayi = 0, azi = 0;
    for (let j = i + 1; j < n; j++) {
      if (!alive[j]) continue;
      const dx = x[j] - xi;
      const dy = y[j] - yi;
      const dz = z[j] - zi;
      const r2 = dx * dx + dy * dy + dz * dz;
      const q = r2 + eps2;
      const g = mu / (q * Math.sqrt(q));
      let fx = g * dx, fy = g * dy, fz = g * dz;
      if (r2 < s2) {
        const r = Math.sqrt(r2) || 1e-9;
        const nx = dx / r, ny = dy / r, nz = dz / r;
        const vn = (vx[j] - vx[i]) * nx + (vy[j] - vy[i]) * ny + (vz[j] - vz[i]) * nz;
        const fc = cmu * vn - kmu * (twoS - r);
        fx += fc * nx;
        fy += fc * ny;
        fz += fc * nz;
      }
      axi += fx; ayi += fy; azi += fz;
      ax[j] -= fx; ay[j] -= fy; az[j] -= fz;
    }
    ax[i] += axi; ay[i] += ayi; az[i] += azi;
  }
}

/** Grains on a solid synchronous sphere: planet + sphere gravity + surface contact. */
function rigidForces(sim: MoonSim): void {
  const { n, x, y, z, vx, vy, vz, ax, ay, az, alive } = sim;
  const w = sim.nOrb;
  const ph = w * sim.t;
  const cx = sim.d * Math.cos(ph);
  const cy = sim.d * Math.sin(ph);
  const vcx = -w * cy;
  const vcy = w * cx;
  const rc = MOON_R + GRAIN_R;
  for (let i = 0; i < n; i++) {
    if (!alive[i]) { ax[i] = ay[i] = az[i] = 0; continue; }
    const r2 = x[i] * x[i] + y[i] * y[i] + z[i] * z[i];
    const f = -PM / (r2 * Math.sqrt(r2));
    let gx = f * x[i], gy = f * y[i], gz = f * z[i];
    const dx = x[i] - cx, dy = y[i] - cy, dz = z[i];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
    const gs = dist > MOON_R ? -1 / (dist * dist * dist) : -1 / (MOON_R * MOON_R * MOON_R);
    gx += gs * dx; gy += gs * dy; gz += gs * dz;
    if (dist < rc) {
      const nx = dx / dist, ny = dy / dist, nz = dz / dist;
      // Surface velocity of the synchronously spinning sphere: V_c + w ẑ × (x − c).
      const rvx = vx[i] - (vcx - w * dy);
      const rvy = vy[i] - (vcy + w * dx);
      const rvz = vz[i];
      const vn = rvx * nx + rvy * ny + rvz * nz;
      const fn = GRAIN_K * (rc - dist) - GRAIN_CN * vn;
      gx += fn * nx - GRAIN_CT * (rvx - vn * nx);
      gy += fn * ny - GRAIN_CT * (rvy - vn * ny);
      gz += fn * nz - GRAIN_CT * (rvz - vn * nz);
    }
    ax[i] = gx; ay[i] = gy; az[i] = gz;
    if (!sim.lostFlag[i] && dist > 1.6 * MOON_R) {
      sim.lostFlag[i] = 1;
      sim.lost++;
    }
  }
}
function stepRubble(sim: MoonSim, h: number): void {
  const { n, x, y, z, vx, vy, vz, ax, ay, az, alive } = sim;
  const hh = 0.5 * h;
  for (let i = 0; i < n; i++) {
    if (!alive[i]) continue;
    vx[i] += hh * ax[i]; vy[i] += hh * ay[i]; vz[i] += hh * az[i];
    x[i] += h * vx[i]; y[i] += h * vy[i]; z[i] += h * vz[i];
  }
  sim.t += h;
  if (sim.body === 'rubble') selfForces(sim);
  else rigidForces(sim);
  for (let i = 0; i < n; i++) {
    if (!alive[i]) continue;
    vx[i] += hh * ax[i]; vy[i] += hh * ay[i]; vz[i] += hh * az[i];
    if (sim.rp > 0) {
      const r2 = x[i] * x[i] + y[i] * y[i] + z[i] * z[i];
      if (r2 < sim.rp * sim.rp) {
        alive[i] = 0;
        if (sim.body === 'rigid' && !sim.lostFlag[i]) { sim.lostFlag[i] = 1; sim.lost++; }
      }
    }
  }
}

/** Fixed step for the particle moon. */
export const MOON_H = 0.01;

/** Advance by `steps` fixed leapfrog steps (kick-drift-kick, forces use the half-step velocity). */
export function stepMoon(sim: MoonSim, steps: number, h = MOON_H): void {
  for (let k = 0; k < steps; k++) stepRubble(sim, h);
}

/** Orbits completed since launch. */
export function orbitsDone(sim: MoonSim): number {
  return (sim.t * sim.nOrb) / (2 * Math.PI);
}

/**
 * Largest friends-of-friends group as a fraction of all particles.
 * `parent` is scratch space of length n.
 */
export function largestClump(sim: MoonSim, parent: Int32Array, link = 2.6): number {
  const { n, x, y, z, alive } = sim;
  const L2 = (link * sim.p.s) * (link * sim.p.s);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  for (let i = 0; i < n; i++) {
    if (!alive[i]) continue;
    for (let j = i + 1; j < n; j++) {
      if (!alive[j]) continue;
      const dx = x[j] - x[i], dy = y[j] - y[i], dz = z[j] - z[i];
      if (dx * dx + dy * dy + dz * dz < L2) {
        const a = find(i), b = find(j);
        if (a !== b) parent[a] = b;
      }
    }
  }
  // Count group sizes in place, reusing a second pass.
  let best = 0;
  const counts = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    if (!alive[i]) continue;
    const r = find(i);
    const c = (counts.get(r) ?? 0) + 1;
    counts.set(r, c);
    if (c > best) best = c;
  }
  return best / n;
}

/** Planet radius in sim units for a moon/planet density ratio (planet with the same Roche scaling). */
export function planetRadiusSim(rhoMoonOverPlanet: number): number {
  return (DF_SIM / ROCHE_FLUID) * Math.cbrt(rhoMoonOverPlanet);
}
