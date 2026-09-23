// The twin paradox in flat spacetime, with c = 1. Time in years, distance in light-years.
// Earth sits at x = 0. The traveller leaves at event (0, 0) and returns at (T, 0).
// Pure module: no DOM, no Three.js.

/** 1 g in light-years per year squared: 9.80665 m/s² × (Julian year)² / (light-year). */
export const G_LY = (9.80665 * (365.25 * 86400) ** 2) / 9.4607304725808e15;

export type TripMode = 'instant' | 'accel';

export interface TripParams {
  mode: TripMode;
  /** Cruise speed as a fraction of c. In 'accel' mode it caps the speed when `coast` is on. */
  beta: number;
  /** Turnaround distance in light-years. */
  D: number;
  /** Proper acceleration in ly/yr² ('accel' mode only). */
  a: number;
  /** 'accel' mode: coast at β between burns. Off means accelerate halfway, then decelerate. */
  coast: boolean;
}

/** Kind of phase, for bookkeeping of where the age gap accrues. */
export type PhaseKind = 'cruise' | 'burn';

/**
 * One piece of the worldline. The rapidity varies linearly with proper time s in [0, dtau]:
 * η(s) = eta0 + alpha·s. alpha = 0 is inertial motion. alpha = ±a is hyperbolic motion.
 */
export interface Segment {
  t0: number;
  x0: number;
  tau0: number;
  eta0: number;
  alpha: number;
  dtau: number;
  kind: PhaseKind;
  /** End values, cached. */
  t1: number;
  x1: number;
  eta1: number;
}

export interface Trip {
  params: TripParams;
  segs: Segment[];
  /** Earth time at reunion. */
  T: number;
  /** Traveller proper time at reunion. */
  tau: number;
  /** Peak rapidity and speed actually reached. */
  etaPeak: number;
  betaPeak: number;
  /** Index range [first, last] of segments that form the turnaround. */
  turnFirst: number;
  turnLast: number;
}

/** A point on the worldline. Mutable so hot loops can reuse it. */
export interface WEvent {
  t: number;
  x: number;
  tau: number;
  eta: number;
  /** Proper acceleration at this point (0 when coasting). */
  alpha: number;
}

export const wevent = (): WEvent => ({ t: 0, x: 0, tau: 0, eta: 0, alpha: 0 });

export const gamma = (beta: number): number => 1 / Math.sqrt(1 - beta * beta);

/** Proper time on a clock that accelerates from rest at a, after Earth time t: τ = asinh(a t)/a. */
export function hyperbolicTau(a: number, t: number): number {
  return Math.asinh(a * t) / a;
}

/** Hyperbolic motion from rest at the origin: t = sinh(aτ)/a, x = (cosh(aτ) − 1)/a. */
export function hyperbolicEvent(a: number, tau: number): { t: number; x: number } {
  return { t: Math.sinh(a * tau) / a, x: (Math.cosh(a * tau) - 1) / a };
}

/** Received pulse rate over emitted rate, for a source receding at β. */
export function dopplerRecede(beta: number): number {
  return Math.sqrt((1 - beta) / (1 + beta));
}

/** Received pulse rate over emitted rate, for a source approaching at β. */
export function dopplerApproach(beta: number): number {
  return Math.sqrt((1 + beta) / (1 - beta));
}

function addSeg(segs: Segment[], eta0: number, alpha: number, dtau: number, kind: PhaseKind): void {
  if (!(dtau > 0)) return;
  const prev = segs[segs.length - 1];
  const t0 = prev ? prev.t1 : 0;
  const x0 = prev ? prev.x1 : 0;
  const tau0 = prev ? prev.tau0 + prev.dtau : 0;
  let t1: number;
  let x1: number;
  const eta1 = eta0 + alpha * dtau;
  if (alpha === 0) {
    t1 = t0 + Math.cosh(eta0) * dtau;
    x1 = x0 + Math.sinh(eta0) * dtau;
  } else {
    t1 = t0 + (Math.sinh(eta1) - Math.sinh(eta0)) / alpha;
    x1 = x0 + (Math.cosh(eta1) - Math.cosh(eta0)) / alpha;
  }
  segs.push({ t0, x0, tau0, eta0, alpha, dtau, kind, t1, x1, eta1 });
}

/** Build the round trip for the given parameters. */
export function buildTrip(p: TripParams): Trip {
  const segs: Segment[] = [];
  let etaPeak: number;
  let turnFirst: number;
  let turnLast: number;
  if (p.mode === 'instant') {
    etaPeak = Math.atanh(p.beta);
    const dtau = p.D / Math.sinh(etaPeak);
    addSeg(segs, etaPeak, 0, dtau, 'cruise');
    addSeg(segs, -etaPeak, 0, dtau, 'cruise');
    turnFirst = 0;
    turnLast = 1;
  } else {
    const a = p.a;
    // Rapidity reached if we burn for half the distance, then decelerate.
    const etaHalf = Math.acosh(1 + (a * p.D) / 2);
    etaPeak = p.coast ? Math.min(Math.atanh(p.beta), etaHalf) : etaHalf;
    const burnTau = etaPeak / a;
    const burnDist = (Math.cosh(etaPeak) - 1) / a;
    const coastDist = Math.max(0, p.D - 2 * burnDist);
    const coastTau = coastDist > 1e-12 ? coastDist / Math.sinh(etaPeak) : 0;
    addSeg(segs, 0, a, burnTau, 'burn');
    addSeg(segs, etaPeak, 0, coastTau, 'cruise');
    turnFirst = segs.length;
    addSeg(segs, etaPeak, -a, burnTau, 'burn');
    addSeg(segs, 0, -a, burnTau, 'burn');
    turnLast = segs.length - 1;
    addSeg(segs, -etaPeak, 0, coastTau, 'cruise');
    addSeg(segs, -etaPeak, a, burnTau, 'burn');
  }
  const last = segs[segs.length - 1];
  return {
    params: { ...p },
    segs,
    T: last.t1,
    tau: last.tau0 + last.dtau,
    etaPeak,
    betaPeak: Math.tanh(etaPeak),
    turnFirst,
    turnLast,
  };
}

function fill(sg: Segment, s: number, out: WEvent): WEvent {
  const eta = sg.eta0 + sg.alpha * s;
  if (sg.alpha === 0) {
    out.t = sg.t0 + Math.cosh(sg.eta0) * s;
    out.x = sg.x0 + Math.sinh(sg.eta0) * s;
  } else {
    out.t = sg.t0 + (Math.sinh(eta) - Math.sinh(sg.eta0)) / sg.alpha;
    out.x = sg.x0 + (Math.cosh(eta) - Math.cosh(sg.eta0)) / sg.alpha;
  }
  out.tau = sg.tau0 + s;
  out.eta = eta;
  out.alpha = sg.alpha;
  return out;
}

/** Traveller event at proper time τ (clamped to the trip). */
export function eventAtTau(trip: Trip, tau: number, out: WEvent = wevent()): WEvent {
  const segs = trip.segs;
  const tt = Math.max(0, Math.min(trip.tau, tau));
  for (let i = 0; i < segs.length; i++) {
    const sg = segs[i];
    if (tt <= sg.tau0 + sg.dtau || i === segs.length - 1) return fill(sg, Math.min(sg.dtau, tt - sg.tau0), out);
  }
  return out;
}

/** Traveller event at Earth time t (clamped to the trip). Closed form on every segment. */
export function eventAtT(trip: Trip, t: number, out: WEvent = wevent()): WEvent {
  const segs = trip.segs;
  const tt = Math.max(0, Math.min(trip.T, t));
  for (let i = 0; i < segs.length; i++) {
    const sg = segs[i];
    if (tt <= sg.t1 || i === segs.length - 1) {
      let s: number;
      if (sg.alpha === 0) s = (tt - sg.t0) / Math.cosh(sg.eta0);
      else s = (Math.asinh(Math.sinh(sg.eta0) + sg.alpha * (tt - sg.t0)) - sg.eta0) / sg.alpha;
      return fill(sg, Math.max(0, Math.min(sg.dtau, s)), out);
    }
  }
  return out;
}

/**
 * Earth time that the traveller calls "now" at the event (t, x) with rapidity η.
 * The traveller's line of simultaneity has slope dt/dx = β = tanh η, so it meets x = 0 at t − βx.
 */
export function earthTimeSimultaneous(t: number, x: number, eta: number): number {
  return t - Math.tanh(eta) * x;
}

/**
 * Proper time at which the traveller receives a light pulse that left Earth at time tE.
 * The pulse moves along t − x = tE. On the worldline u = t − x rises monotonically.
 * Returns NaN if the pulse arrives after reunion.
 */
export function travellerReceives(trip: Trip, tE: number): number {
  for (const sg of trip.segs) {
    const u0 = sg.t0 - sg.x0;
    const u1 = sg.t1 - sg.x1;
    if (tE > u1 + 1e-12) continue;
    const du = tE - u0;
    let s: number;
    if (sg.alpha === 0) s = du * Math.exp(sg.eta0);
    else s = (-Math.log(Math.exp(-sg.eta0) - sg.alpha * du) - sg.eta0) / sg.alpha;
    return sg.tau0 + Math.max(0, Math.min(sg.dtau, s));
  }
  return NaN;
}

/** Earth time at which a pulse emitted by the traveller at proper time τ reaches Earth: t + x. */
export function earthReceives(trip: Trip, tau: number, tmp: WEvent = wevent()): number {
  eventAtTau(trip, tau, tmp);
  return tmp.t + tmp.x;
}

export interface PulseTable {
  /** Earth pulse k (k = 1..n) leaves at t = k. recvTau[k−1] is the traveller's proper time on arrival. */
  earthRecvTau: Float64Array;
  /** Earth-frame time of the same arrivals. */
  earthRecvT: Float64Array;
  /** Traveller pulse k leaves at τ = k. Emission event (t, x) and Earth arrival time. */
  travEmitT: Float64Array;
  travEmitX: Float64Array;
  travRecvT: Float64Array;
}

/** Birthday signals: each twin sends one pulse per year of their own proper time. */
export function pulseTable(trip: Trip): PulseTable {
  const nE = Math.floor(trip.T + 1e-9);
  const nT = Math.floor(trip.tau + 1e-9);
  const earthRecvTau = new Float64Array(nE);
  const earthRecvT = new Float64Array(nE);
  const ev = wevent();
  for (let k = 1; k <= nE; k++) {
    const tau = travellerReceives(trip, k);
    const r = Number.isNaN(tau) ? trip.tau : tau;
    earthRecvTau[k - 1] = r;
    eventAtTau(trip, r, ev);
    earthRecvT[k - 1] = ev.t;
  }
  const travEmitT = new Float64Array(nT);
  const travEmitX = new Float64Array(nT);
  const travRecvT = new Float64Array(nT);
  for (let k = 1; k <= nT; k++) {
    eventAtTau(trip, k, ev);
    travEmitT[k - 1] = ev.t;
    travEmitX[k - 1] = ev.x;
    travRecvT[k - 1] = ev.t + ev.x;
  }
  return { earthRecvTau, earthRecvT, travEmitT, travEmitX, travRecvT };
}

/** Number of sorted values ≤ v among the first n entries. */
export function countUpTo(arr: Float64Array, v: number, n = arr.length): number {
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (arr[m] <= v + 1e-9) lo = m + 1;
    else hi = m;
  }
  return lo;
}

/** Velocity dx/dt at Earth time t. */
export function velocityAtT(trip: Trip, t: number, tmp: WEvent = wevent()): number {
  return Math.tanh(eventAtT(trip, t, tmp).eta);
}

function simpsonStep(f: (x: number) => number, a: number, fa: number, b: number, fb: number, m: number, fm: number, whole: number, eps: number, depth: number): number {
  const lm = (a + m) / 2;
  const rm = (m + b) / 2;
  const flm = f(lm);
  const frm = f(rm);
  const left = ((m - a) / 6) * (fa + 4 * flm + fm);
  const right = ((b - m) / 6) * (fm + 4 * frm + fb);
  const diff = left + right - whole;
  if (depth <= 0 || Math.abs(diff) <= 15 * eps) return left + right + diff / 15;
  return simpsonStep(f, a, fa, m, fm, lm, flm, left, eps / 2, depth - 1) + simpsonStep(f, m, fm, b, fb, rm, frm, right, eps / 2, depth - 1);
}

/** Adaptive Simpson quadrature of f on [a, b] to absolute tolerance eps. */
export function adaptiveSimpson(f: (x: number) => number, a: number, b: number, eps: number, maxDepth = 40): number {
  const m = (a + b) / 2;
  const fa = f(a);
  const fb = f(b);
  const fm = f(m);
  return simpsonStep(f, a, fa, b, fb, m, fm, ((b - a) / 6) * (fa + 4 * fm + fb), eps, maxDepth);
}

/**
 * The headline equation done numerically: τ = ∫ sqrt(1 − v(t)²) dt, using only the speed profile v(t).
 * Adaptive Simpson per smooth phase. sqrt(1 − v²) is evaluated as 1/cosh η, which is the same number
 * but keeps full precision when v is within 10⁻⁹ of c.
 */
export function integrateProperTime(trip: Trip, relTol = 1e-11): number {
  const ev = wevent();
  let tau = 0;
  for (const sg of trip.segs) {
    const span = sg.t1 - sg.t0;
    if (!(span > 0)) continue;
    // Stay a hair inside the ends so the segment lookup never lands on a neighbour.
    const lo = sg.t0 + span * 1e-13;
    const hi = sg.t1 - span * 1e-13;
    const f = (t: number) => 1 / Math.cosh(eventAtT(trip, t, ev).eta);
    tau += adaptiveSimpson(f, lo, hi, relTol * Math.max(1, span)) + (span - (hi - lo)) * f((lo + hi) / 2);
  }
  return tau;
}

export interface GapSplit {
  /** Age gap (Earth − traveller) accrued while coasting. */
  cruise: number;
  /** Age gap accrued while the engine burns. */
  burn: number;
}

/** Split the final age gap by phase. Each phase contributes Δt − Δτ. */
export function gapSplit(trip: Trip): GapSplit {
  let cruise = 0;
  let burn = 0;
  for (const sg of trip.segs) {
    const g = sg.t1 - sg.t0 - sg.dtau;
    if (sg.kind === 'cruise') cruise += g;
    else burn += g;
  }
  return { cruise, burn };
}

/**
 * Earth times the traveller calls "now" just before and just after the turnaround.
 * The difference is the stretch of Earth history the traveller's "now" sweeps across.
 */
export function turnaroundSweep(trip: Trip): { before: number; after: number } {
  const a = trip.segs[trip.turnFirst];
  const b = trip.segs[trip.turnLast];
  if (trip.params.mode === 'instant') {
    return { before: earthTimeSimultaneous(a.t1, a.x1, a.eta0), after: earthTimeSimultaneous(b.t0, b.x0, b.eta0) };
  }
  return { before: earthTimeSimultaneous(a.t0, a.x0, a.eta0), after: earthTimeSimultaneous(b.t1, b.x1, b.eta1) };
}

/**
 * Sample the worldline uniformly in proper time into `out` as (t, x) pairs.
 * n points. For the instant turnaround with odd n, the corner is sampled exactly.
 */
export function sampleWorldline(trip: Trip, n: number, out: Float64Array, tmp: WEvent = wevent()): Float64Array {
  for (let i = 0; i < n; i++) {
    eventAtTau(trip, (trip.tau * i) / (n - 1), tmp);
    out[i * 2] = tmp.t;
    out[i * 2 + 1] = tmp.x;
  }
  return out;
}

/** 1, 2, 5, 10, 20, 50 … the smallest such step ≥ x (and ≥ 1). */
export function niceStep(x: number): number {
  if (x <= 1) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  for (const m of [1, 2, 5, 10]) if (m * p >= x - 1e-9) return m * p;
  return 10 * p;
}
