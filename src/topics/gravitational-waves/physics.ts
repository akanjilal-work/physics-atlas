// Linearized gravitational waves and the leading-order (Newtonian quadrupole) binary chirp.
// SI units inside, masses in solar masses and distances in megaparsecs at the interface.
// Pure module: no DOM, no Three.js.

/** Speed of light (m/s). */
export const C = 299_792_458;
/** G M_sun (m^3/s^2), the IAU nominal solar mass parameter. */
export const GM_SUN = 1.3271244e20;
/** G M_sun / c^3 in seconds (about 4.93 microseconds). */
export const T_SUN = GM_SUN / (C * C * C);
/** G M_sun / c^2 in metres (about 1.48 km). */
export const L_SUN = GM_SUN / (C * C);
/** One megaparsec in metres. */
export const MPC = 3.0856775814913673e22;

/** Median source-frame parameters of GW150914 (LIGO, PRL 116, 061102, 2016). */
export const GW150914 = { m1: 36, m2: 29, dMpc: 410 };

/** Chirp mass M_c = (m1 m2)^{3/5} / (m1 + m2)^{1/5}. Same units as the inputs. */
export function chirpMass(m1: number, m2: number): number {
  return Math.pow(m1 * m2, 0.6) / Math.pow(m1 + m2, 0.2);
}

/** Symmetric mass ratio η = m1 m2 / (m1 + m2)^2, at most 1/4. */
export const symRatio = (m1: number, m2: number) => (m1 * m2) / ((m1 + m2) * (m1 + m2));

/** Time to coalescence τ (s) at gravitational-wave frequency f (Hz): τ = (5/256) (G M_c/c^3)^{-5/3} (π f)^{-8/3}. */
export function tauOfF(f: number, mc: number): number {
  const T = mc * T_SUN;
  return (5 / 256) * Math.pow(T, -5 / 3) * Math.pow(Math.PI * f, -8 / 3);
}

/** Gravitational-wave frequency (Hz) a time τ (s) before coalescence: f = (1/π) (5/256τ)^{3/8} (G M_c/c^3)^{-5/8}. */
export function fOfTau(tau: number, mc: number): number {
  const T = mc * T_SUN;
  return (1 / Math.PI) * Math.pow(5 / (256 * tau), 3 / 8) * Math.pow(T, -5 / 8);
}

/** Gravitational-wave phase at time τ before coalescence (radians), Φ = −2 (τ / 5T)^{5/8}, zero at τ = 0. */
export function phaseOfTau(tau: number, mc: number): number {
  const T = mc * T_SUN;
  return -2 * Math.pow(tau / (5 * T), 5 / 8);
}

/**
 * Strain amplitude for an optimally oriented (face-on) binary:
 * h = (4/D) (G M_c/c^2)^{5/3} (π f/c)^{2/3}.
 */
export function strainAmp(mc: number, f: number, dMpc: number): number {
  const lc = mc * L_SUN;
  return (4 / (dMpc * MPC)) * Math.pow(lc, 5 / 3) * Math.pow((Math.PI * f) / C, 2 / 3);
}

/** Gravitational-wave frequency at the innermost stable circular orbit of total mass M: f = c^3 / (6^{3/2} π G M). */
export const fISCO = (mTot: number) => 1 / (Math.pow(6, 1.5) * Math.PI * mTot * T_SUN);

/** Orbital separation (m) from Kepler's third law, with orbital angular frequency ω = π f. */
export function separation(mTot: number, f: number): number {
  const w = Math.PI * f;
  return Math.cbrt((GM_SUN * mTot) / (w * w));
}

/**
 * Rough remnant of a merger of two non-spinning holes, for the ringdown sketch only.
 * Spin: fit by Rezzolla et al. (2008), a ≈ 2√3 η − 3.871 η² + 4.028 η³.
 * Mass: about 5% radiated at equal masses, taken as M_f ≈ M (1 − 0.2 η).
 * Fundamental l = m = 2 mode: fits by Berti, Cardoso & Will (2006).
 */
export function remnant(m1: number, m2: number): { mf: number; af: number; fRing: number; tauDamp: number } {
  const eta = symRatio(m1, m2);
  const af = 2 * Math.sqrt(3) * eta - 3.871 * eta * eta + 4.028 * eta * eta * eta;
  const mf = (m1 + m2) * (1 - 0.2 * eta);
  const omegaM = 1.5251 - 1.1568 * Math.pow(1 - af, 0.1292);
  const Q = 0.7 + 1.4187 * Math.pow(1 - af, -0.499);
  const fRing = omegaM / (2 * Math.PI * mf * T_SUN);
  return { mf, af, fRing, tauDamp: Q / (Math.PI * fRing) };
}

/**
 * Deform a point of a ring of free test masses (transverse-traceless gauge):
 * δx = ½(h₊ x + h× y), δy = ½(h× x − h₊ y). Writes into out.
 */
export function deform(x: number, y: number, hp: number, hx: number, out: [number, number]): [number, number] {
  out[0] = x + 0.5 * (hp * x + hx * y);
  out[1] = y + 0.5 * (hx * x - hp * y);
  return out;
}

/** Shoelace area of a closed polygon given as flat [x0, y0, x1, y1, ...]. */
export function polygonArea(xy: ArrayLike<number>): number {
  const n = xy.length / 2;
  let a = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += xy[2 * i] * xy[2 * j + 1] - xy[2 * j] * xy[2 * i + 1];
  }
  return 0.5 * a;
}

/** Everything the scene needs to replay one chirp, computed once per parameter change. */
export interface ChirpPlan {
  m1: number;
  m2: number;
  dMpc: number;
  mc: number;
  mTot: number;
  /** Time to coalescence at the start of the replay (s). */
  tauStart: number;
  /** Time to coalescence when f reaches f_ISCO (s). */
  tauIsco: number;
  /** Time to coalescence when the chirp sketch hands over to the ringdown (s). */
  tauEnd: number;
  fStart: number;
  fIsco: number;
  fEnd: number;
  /** Elapsed time (s from the start) of ISCO, of the ringdown start, and of the end of the replay. */
  tIsco: number;
  tEnd: number;
  tStop: number;
  phaseStart: number;
  phaseEnd: number;
  hEnd: number;
  ring: ReturnType<typeof remnant>;
}

/** Number of gravitational-wave cycles between two times before coalescence. */
export const cyclesBetween = (tauA: number, tauB: number, mc: number) => (phaseOfTau(tauB, mc) - phaseOfTau(tauA, mc)) / (2 * Math.PI);

/**
 * Plan the replay: the last `cycles` gravitational-wave cycles before ISCO, the leading-order chirp
 * continued past ISCO up to 2/3 of the ringdown frequency (a sketch), then a damped ringdown.
 */
export function planChirp(m1: number, m2: number, dMpc: number, cycles = 20): ChirpPlan {
  const mc = chirpMass(m1, m2);
  const mTot = m1 + m2;
  const T = mc * T_SUN;
  const ring = remnant(m1, m2);
  const fIsco = fISCO(mTot);
  const tauIsco = tauOfF(fIsco, mc);
  const x = Math.pow(tauIsco / (5 * T), 5 / 8) + Math.PI * cycles;
  const tauStart = 5 * T * Math.pow(x, 8 / 5);
  const fEnd = Math.max(fIsco * 1.05, (2 / 3) * ring.fRing);
  const tauEnd = tauOfF(fEnd, mc);
  const phaseStart = phaseOfTau(tauStart, mc);
  const tEnd = tauStart - tauEnd;
  return {
    m1, m2, dMpc, mc, mTot, tauStart, tauIsco, tauEnd,
    fStart: fOfTau(tauStart, mc), fIsco, fEnd,
    tIsco: tauStart - tauIsco,
    tEnd,
    tStop: tEnd + 8 * ring.tauDamp,
    phaseStart,
    phaseEnd: phaseOfTau(tauEnd, mc) - phaseStart,
    hEnd: strainAmp(mc, fEnd, dMpc),
    ring,
  };
}

export interface WaveSample {
  /** Strain envelope (dimensionless). */
  h: number;
  /** Gravitational-wave phase since the start (rad). Twice the orbital angle. */
  phase: number;
  /** Instantaneous gravitational-wave frequency (Hz). */
  f: number;
  /** 0 inspiral (valid), 1 past ISCO (sketch), 2 ringdown (sketch), 3 quiet. */
  stage: number;
}

/** Waveform at elapsed time t (s) since the start of the plan. Negative t extends the inspiral backwards. */
export function sampleWave(p: ChirpPlan, t: number, out: WaveSample): WaveSample {
  if (t < p.tEnd) {
    const tau = p.tauStart - t;
    const f = fOfTau(tau, p.mc);
    out.f = f;
    out.h = strainAmp(p.mc, f, p.dMpc);
    out.phase = phaseOfTau(tau, p.mc) - p.phaseStart;
    out.stage = t < p.tIsco ? 0 : 1;
    return out;
  }
  const dt = t - p.tEnd;
  out.f = p.ring.fRing;
  out.phase = p.phaseEnd + 2 * Math.PI * p.ring.fRing * dt;
  if (t < p.tStop) {
    out.h = p.hEnd * Math.exp(-dt / p.ring.tauDamp);
    out.stage = 2;
  } else {
    out.h = 0;
    out.stage = 3;
  }
  return out;
}
