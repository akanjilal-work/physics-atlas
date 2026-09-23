// Doppler effect for sound: pure math, no DOM.
// SI units: m, s, Hz. Velocities are measured relative to the still medium.
//
// Sign convention for the 1D formula f' = f (c + v_o)/(c − v_s):
//   v_o > 0 when the observer moves toward the source,
//   v_s > 0 when the source moves toward the observer.

export type Medium = 'air' | 'water';

/** Speed of sound: dry air at 20 °C, and fresh water near 20 °C (about 1480 m/s). */
export const MEDIA: Record<Medium, number> = { air: 343, water: 1480 };

/** Moving source, still observer. */
export const dopplerSource = (f: number, c: number, vs: number): number => (f * c) / (c - vs);

/** Moving observer, still source. */
export const dopplerObserver = (f: number, c: number, vo: number): number => (f * (c + vo)) / c;

/** Both moving along the line joining them. */
export const doppler = (f: number, c: number, vo: number, vs: number): number => (f * (c + vo)) / (c - vs);

/**
 * Angle-dependent form. cosO is the cosine of the angle between the observer velocity and the
 * direction from observer to source. cosS is the cosine of the angle between the source velocity
 * and the direction from source (at emission) to observer.
 */
export const dopplerAngle = (f: number, c: number, vo: number, vs: number, cosO: number, cosS: number): number =>
  (f * (c + vo * cosO)) / (c - vs * cosS);

/** Relativistic longitudinal Doppler for light, approaching at speed βc. Depends only on relative speed. */
export const relativisticDoppler = (f: number, beta: number): number => f * Math.sqrt((1 + beta) / (1 - beta));

/** Mach half-angle α with sin α = 1/M. NaN when subsonic. */
export const machAngle = (M: number): number => (M >= 1 ? Math.asin(1 / M) : NaN);

/** Mach number that gives a cone half-angle α. */
export const machForAngle = (alpha: number): number => 1 / Math.sin(alpha);

/**
 * Pass-by geometry in the medium frame. The source moves along the x axis, S(t) = (vs t, 0).
 * The listener moves along a parallel lane toward the oncoming source, L(t) = (−vo t, d).
 * Closest approach is at t = 0.
 */
export interface PassBy {
  c: number;
  vs: number;
  vo: number;
  d: number;
}

/**
 * Retarded-time solver. Finds every emission time te ≤ t with |L(t) − S(te)| = c (t − te).
 * Squaring gives a quadratic in te, solved in closed form with the numerically stable root formula.
 * Writes roots into out (most recent first) and returns how many there are: 1 when subsonic,
 * 0 or 2 when supersonic (0 before the Mach cone arrives).
 */
export function emissionTimes(p: PassBy, t: number, out: Float64Array): number {
  const { c, vs, vo, d } = p;
  const a = vs * vs - c * c;
  const b = 2 * t * (vo * vs + c * c);
  const k = (vo * vo - c * c) * t * t + d * d;
  let n = 0;
  const accept = (te: number) => {
    if (Number.isFinite(te) && te <= t + 1e-12 * Math.max(1, Math.abs(t))) out[n++] = te;
  };
  if (Math.abs(a) < 1e-9 * c * c) {
    if (b !== 0) accept(-k / b);
  } else {
    const D = b * b - 4 * a * k;
    if (D < 0) return 0;
    const sq = Math.sqrt(D);
    const q = -0.5 * (b + (b >= 0 ? sq : -sq));
    if (q === 0) {
      accept(0);
    } else {
      const r1 = q / a;
      const r2 = k / q;
      accept(r1);
      if (D > 0) accept(r2);
    }
  }
  if (n === 2 && out[1] > out[0]) {
    const tmp = out[0];
    out[0] = out[1];
    out[1] = tmp;
  }
  return n;
}

/**
 * Heard frequency ratio f'/f for sound received at t that was emitted at te.
 * f'/f = dte/dt = (c − n̂·v_L)/(c − n̂·v_S), with n̂ the unit vector from S(te) to L(t).
 * A negative value means the sound arrives time-reversed (supersonic approach).
 */
export function heardRatio(p: PassBy, t: number, te: number): number {
  const dx = -p.vo * t - p.vs * te;
  const dy = p.d;
  const R = Math.hypot(dx, dy);
  if (R === 0) return 1;
  const nx = dx / R;
  return (p.c - nx * -p.vo) / (p.c - nx * p.vs);
}

/** Cosine of the angle between the source velocity and the line from S(te) to L(t). +1 is head-on approach. */
export function emissionCos(p: PassBy, t: number, te: number): number {
  const dx = -p.vo * t - p.vs * te;
  const R = Math.hypot(dx, p.d);
  return R === 0 ? 0 : dx / R;
}

/** |‖L(t) − S(te)‖ − c(t − te)| / (c(t − te)): how exactly a root satisfies the light-cone condition. */
export function residual(p: PassBy, t: number, te: number): number {
  const R = Math.hypot(-p.vo * t - p.vs * te, p.d);
  const ct = p.c * (t - te);
  return ct > 0 ? Math.abs(R - ct) / ct : Math.abs(R - ct);
}

/**
 * Time the Mach cone sweeps the listener (discriminant of the quadratic vanishes, after closest
 * approach): t_b = d √(vs² − c²) / (c (vs + vo)). NaN when subsonic.
 */
export function boomTime(p: PassBy): number {
  if (p.vs <= p.c) return NaN;
  return (p.d * Math.sqrt(p.vs * p.vs - p.c * p.c)) / (p.c * (p.vs + p.vo));
}

/** Far-field pitch ratios for a straight pass-by: approach 1/(1−M), recede 1/(1+M). */
export function farRatios(M: number): { approach: number; recede: number } {
  return { approach: 1 / (1 - M), recede: 1 / (1 + M) };
}

/** Source Mach number from the measured approach/recede pitch ratio r = f_a/f_r: M = (r − 1)/(r + 1). */
export const machFromRatio = (r: number): number => (r - 1) / (r + 1);
