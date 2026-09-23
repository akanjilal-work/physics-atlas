// Ideal-gas heat-engine cycles: Carnot, Otto, Stirling and Diesel.
// Pure math, no DOM. SI units inside (Pa, m³, K, J, J/K).

export const R_GAS = 8.314462618; // J/(mol K)
/** Amount of gas in the cylinder. Chosen so the gas sits near 1 bar at 300 K and 1 litre. */
export const N_MOL = 0.04;
/** Largest cylinder volume (piston at the top): 1 litre. */
export const V_MAX = 1e-3;
/** Otto and Diesel: the gas after compression may reach at most this fraction of the way from Tc to Th. */
export const COMPRESS_FRAC = 0.85;
/** Carnot: the smallest isothermal volume ratio used when r is too small for the adiabats. */
export const MIN_ISO_RATIO = 1.5;

export type CycleId = 'carnot' | 'otto' | 'stirling' | 'diesel';
export type LegKind = 'isotherm' | 'adiabat' | 'isochore' | 'isobar';

export interface GasState {
  P: number;
  V: number;
  T: number;
  /** Entropy relative to the state (Tc, V_MAX). */
  S: number;
}

export interface Leg {
  kind: LegKind;
  a: GasState;
  b: GasState;
  /** Heat into the gas on this leg, engine direction. */
  Q: number;
  /** Work done by the gas on this leg, engine direction. */
  W: number;
  dU: number;
  dS: number;
  /** True when the heat goes to or from the Stirling regenerator, not a reservoir. */
  regen: boolean;
  name: string;
}

export interface CycleParams {
  cycle: CycleId;
  Th: number;
  Tc: number;
  /** Requested compression ratio V_max / V_min. */
  r: number;
  gamma: number;
  /** Stirling only: ideal regenerator stores the isochoric heat inside the engine. */
  regen?: boolean;
}

export interface Cycle {
  params: CycleParams;
  gamma: number;
  nR: number;
  nCv: number;
  legs: Leg[];
  /** Compression ratio actually used after the limits below. */
  rEff: number;
  /** True when r was lowered to the Otto or Diesel limit. */
  rCapped: boolean;
  /** True when r was raised to fit the Carnot adiabats. */
  rRaised: boolean;
  Vmin: number;
  Vmax: number;
  /** Heat taken from the hot side, engine direction (regenerator excluded). */
  Qin: number;
  /** Heat given to the cold side, engine direction (regenerator excluded). */
  Qout: number;
  /** Net work per cycle, sum of the leg works. */
  W: number;
  eta: number;
  etaCarnot: number;
  Tmax: number;
  Tmin: number;
}

/** Entropy of the gas relative to (Tc, V_MAX). */
export function entropy(T: number, V: number, Tc: number, nR: number, nCv: number): number {
  return nCv * Math.log(T / Tc) + nR * Math.log(V / V_MAX);
}

/** Largest compression ratio allowed for Otto and Diesel. */
export function rCap(Th: number, Tc: number, gamma: number): number {
  const T2 = Tc + COMPRESS_FRAC * (Th - Tc);
  return Math.pow(T2 / Tc, 1 / (gamma - 1));
}

/** Volume ratio across a Carnot adiabat between Th and Tc. */
export function adiabatRatio(Th: number, Tc: number, gamma: number): number {
  return Math.pow(Th / Tc, 1 / (gamma - 1));
}

export function buildCycle(p: CycleParams): Cycle {
  const { Th, Tc, gamma } = p;
  const nR = N_MOL * R_GAS;
  const nCv = nR / (gamma - 1);
  const nCp = nCv + nR;
  const st = (T: number, V: number): GasState => ({ P: (nR * T) / V, V, T, S: entropy(T, V, Tc, nR, nCv) });
  const legs: Leg[] = [];
  const leg = (kind: LegKind, a: GasState, b: GasState, name: string, regen = false): void => {
    let Q = 0;
    let W = 0;
    const dU = nCv * (b.T - a.T);
    if (kind === 'isotherm') {
      W = nR * a.T * Math.log(b.V / a.V);
      Q = W;
    } else if (kind === 'adiabat') {
      W = -dU;
    } else if (kind === 'isochore') {
      Q = dU;
    } else {
      W = a.P * (b.V - a.V);
      Q = nCp * (b.T - a.T);
    }
    legs.push({ kind, a, b, Q, W, dU, dS: b.S - a.S, regen, name });
  };

  const Vmax = V_MAX;
  let r = p.r;
  let rCapped = false;
  let rRaised = false;

  if (p.cycle === 'carnot') {
    const rad = adiabatRatio(Th, Tc, gamma);
    if (r < rad * MIN_ISO_RATIO) {
      r = rad * MIN_ISO_RATIO;
      rRaised = true;
    }
    const riso = r / rad;
    const s1 = st(Tc, Vmax);
    const s2 = st(Tc, Vmax / riso);
    const s3 = st(Th, Vmax / r);
    const s4 = st(Th, (Vmax / r) * riso);
    leg('isotherm', s1, s2, 'isothermal compression at Tc');
    leg('adiabat', s2, s3, 'adiabatic compression');
    leg('isotherm', s3, s4, 'isothermal expansion at Th');
    leg('adiabat', s4, s1, 'adiabatic expansion');
  } else if (p.cycle === 'otto') {
    const cap = rCap(Th, Tc, gamma);
    if (r > cap) {
      r = cap;
      rCapped = true;
    }
    const Vmin = Vmax / r;
    const T2 = Tc * Math.pow(r, gamma - 1);
    const T4 = Th * Math.pow(r, 1 - gamma);
    const s1 = st(Tc, Vmax);
    const s2 = st(T2, Vmin);
    const s3 = st(Th, Vmin);
    const s4 = st(T4, Vmax);
    leg('adiabat', s1, s2, 'adiabatic compression');
    leg('isochore', s2, s3, 'heating at constant volume');
    leg('adiabat', s3, s4, 'adiabatic expansion');
    leg('isochore', s4, s1, 'cooling at constant volume');
  } else if (p.cycle === 'diesel') {
    const cap = rCap(Th, Tc, gamma);
    if (r > cap) {
      r = cap;
      rCapped = true;
    }
    const Vmin = Vmax / r;
    const T2 = Tc * Math.pow(r, gamma - 1);
    // Fuel burns while the piston moves out at constant pressure. Stop at Th, or at 95% of the stroke.
    const V3 = Math.min(Vmin * (Th / T2), 0.95 * Vmax);
    const T3 = T2 * (V3 / Vmin);
    const T4 = T3 * Math.pow(V3 / Vmax, gamma - 1);
    const s1 = st(Tc, Vmax);
    const s2 = st(T2, Vmin);
    const s3 = st(T3, V3);
    const s4 = st(T4, Vmax);
    leg('adiabat', s1, s2, 'adiabatic compression');
    leg('isobar', s2, s3, 'heating at constant pressure');
    leg('adiabat', s3, s4, 'adiabatic expansion');
    leg('isochore', s4, s1, 'cooling at constant volume');
  } else {
    const Vmin = Vmax / r;
    const rg = !!p.regen;
    const s1 = st(Tc, Vmax);
    const s2 = st(Tc, Vmin);
    const s3 = st(Th, Vmin);
    const s4 = st(Th, Vmax);
    leg('isotherm', s1, s2, 'isothermal compression at Tc');
    leg('isochore', s2, s3, rg ? 'heating from the regenerator' : 'heating at constant volume', rg);
    leg('isotherm', s3, s4, 'isothermal expansion at Th');
    leg('isochore', s4, s1, rg ? 'cooling into the regenerator' : 'cooling at constant volume', rg);
  }

  let Qin = 0;
  let Qout = 0;
  let W = 0;
  let Tmax = -Infinity;
  let Tmin = Infinity;
  for (const l of legs) {
    W += l.W;
    if (!l.regen) {
      if (l.Q > 0) Qin += l.Q;
      else Qout -= l.Q;
    }
    Tmax = Math.max(Tmax, l.a.T, l.b.T);
    Tmin = Math.min(Tmin, l.a.T, l.b.T);
  }
  return {
    params: p,
    gamma,
    nR,
    nCv,
    legs,
    rEff: r,
    rCapped,
    rRaised,
    Vmin: Vmax / r,
    Vmax,
    Qin,
    Qout,
    W,
    eta: W / Qin,
    etaCarnot: 1 - Tc / Th,
    Tmax,
    Tmin,
  };
}

/** Gas state a fraction u of the way along leg i (engine direction). Writes into out, no allocation. */
export function legPoint(c: Cycle, i: number, u: number, out: GasState): GasState {
  const l = c.legs[i];
  const { a, b } = l;
  let T: number;
  let V: number;
  switch (l.kind) {
    case 'isotherm':
      V = a.V + (b.V - a.V) * u;
      T = a.T;
      break;
    case 'adiabat':
      V = a.V + (b.V - a.V) * u;
      T = a.T * Math.pow(a.V / V, c.gamma - 1);
      break;
    case 'isochore':
      T = a.T + (b.T - a.T) * u;
      V = a.V;
      break;
    default:
      T = a.T + (b.T - a.T) * u;
      V = a.V * (T / a.T);
  }
  out.T = T;
  out.V = V;
  out.P = (c.nR * T) / V;
  out.S = entropy(T, V, c.params.Tc, c.nR, c.nCv);
  return out;
}

/**
 * Sample the closed loop: perLeg points per leg, each point [P, V, T, S].
 * The last point of each leg is the first of the next, so it is skipped.
 */
export function sampleLoop(c: Cycle, perLeg: number): Float64Array {
  const n = c.legs.length * perLeg;
  const out = new Float64Array(n * 4);
  const g: GasState = { P: 0, V: 0, T: 0, S: 0 };
  let k = 0;
  for (let i = 0; i < c.legs.length; i++) {
    for (let j = 0; j < perLeg; j++) {
      legPoint(c, i, j / perLeg, g);
      out[k++] = g.P;
      out[k++] = g.V;
      out[k++] = g.T;
      out[k++] = g.S;
    }
  }
  return out;
}

/** Signed loop integral of P dV (trapezoid rule around the closed loop). Clockwise in P-V is positive. */
export function loopAreaPV(samples: Float64Array): number {
  const n = samples.length / 4;
  let a = 0;
  for (let k = 0; k < n; k++) {
    const i = k * 4;
    const j = ((k + 1) % n) * 4;
    a += 0.5 * (samples[i] + samples[j]) * (samples[j + 1] - samples[i + 1]);
  }
  return a;
}

/** Signed loop integral of T dS. Equals the net heat, and so the work, for a reversible cycle. */
export function loopAreaTS(samples: Float64Array): number {
  const n = samples.length / 4;
  let a = 0;
  for (let k = 0; k < n; k++) {
    const i = k * 4;
    const j = ((k + 1) % n) * 4;
    a += 0.5 * (samples[i + 2] + samples[j + 2]) * (samples[j + 3] - samples[i + 3]);
  }
  return a;
}

/** Sum of the gas entropy changes over all legs. Zero for any closed cycle. */
export function gasEntropyChange(c: Cycle): number {
  let s = 0;
  for (const l of c.legs) s += l.dS;
  return s;
}

/**
 * Entropy made in the whole world per cycle (gas plus reservoirs).
 * Engine: heat comes in from a reservoir at Th and goes out to one at Tc.
 * Fridge: the cycle runs backwards. Each reservoir must be at least as hot as the gas it gives heat to,
 * and no hotter than the gas it takes heat from, so the reservoir temperatures are the gas extremes on each leg.
 */
export function entropyGenerated(c: Cycle, fridge: boolean): number {
  const { Th, Tc } = c.params;
  let s = 0;
  for (const l of c.legs) {
    if (l.regen || l.Q === 0) continue;
    if (!fridge) {
      s -= l.Q / (l.Q > 0 ? Th : Tc);
    } else {
      const q = -l.Q; // heat into the gas when running backwards
      const Tres = q > 0 ? Math.max(l.a.T, l.b.T) : Math.min(l.a.T, l.b.T);
      s -= q / Tres;
    }
  }
  return s;
}

/** Coefficient of performance of the reversed cycle as a refrigerator: heat pulled from the cold side per joule of work. */
export function copFridge(c: Cycle): number {
  return c.Qout / c.W;
}

/** Coefficient of performance of the reversed cycle as a heat pump: heat delivered to the hot side per joule of work. */
export function copHeatPump(c: Cycle): number {
  return c.Qin / c.W;
}

export const carnotEta = (Th: number, Tc: number): number => 1 - Tc / Th;
export const carnotCopFridge = (Th: number, Tc: number): number => Tc / (Th - Tc);
export const carnotCopHeatPump = (Th: number, Tc: number): number => Th / (Th - Tc);
export const ottoEta = (r: number, gamma: number): number => 1 - Math.pow(r, 1 - gamma);
/** Air-standard Diesel efficiency with compression ratio r and cutoff ratio rc = V3 / V2. */
export const dieselEta = (r: number, rc: number, gamma: number): number =>
  1 - (Math.pow(rc, gamma) - 1) / (gamma * Math.pow(r, gamma - 1) * (rc - 1));
/** Curzon-Ahlborn (also Chambadal and Novikov) efficiency at maximum power. */
export const curzonAhlbornEta = (Th: number, Tc: number): number => 1 - Math.sqrt(Tc / Th);

/**
 * Power of an endoreversible engine (Novikov model). Heat leaks in from the hot reservoir through a
 * conductance K to the working gas at Ti, then a reversible engine runs between Ti and Tc.
 */
export function endoreversiblePower(Th: number, Tc: number, Ti: number, K = 1): number {
  return K * (Th - Ti) * (1 - Tc / Ti);
}
