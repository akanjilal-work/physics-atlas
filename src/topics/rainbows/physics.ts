// Geometric optics of a spherical water drop. Pure math: no DOM, no Three.js.
//
// Conventions used everywhere in this module:
//   b  impact parameter in units of the drop radius, 0 <= b < 1
//   i  angle of incidence, sin i = b
//   r  angle of refraction, sin i = n sin r
//   k  number of internal reflections
//   D  total deviation, the angle the ray is turned through, measured from the
//      incoming direction:  D_k = k*180° + 2i - 2(k+1)r   (radians here)
//   θ  angle between the line of sight and the antisolar point, θ = acos(-cos D).
//      For k = 1 this is 180° - D. For k = 2 it is D - 180°.

export const DEG = Math.PI / 180;

// Daimon & Masumura (2007), Appl. Opt. 46, 3811. Distilled water at 20 °C,
// four-term Sellmeier fit, λ in micrometres.
const SA = [5.684027565e-1, 1.726177391e-1, 2.086189578e-2, 1.130748688e-1];
const SB = [5.101829712e-3, 1.821153936e-2, 2.620722293e-2, 1.069792721e1];

/** Refractive index of water at wavelength λ (nm). */
export function nWater(lambdaNm: number): number {
  const l2 = (lambdaNm / 1000) ** 2;
  let s = 1;
  for (let j = 0; j < 4; j++) s += (SA[j] * l2) / (l2 - SB[j]);
  return Math.sqrt(s);
}

/** Refraction angle r for incidence i (radians). */
export function refract(i: number, n: number): number {
  return Math.asin(Math.sin(i) / n);
}

/** Total deviation D (radians) for impact parameter b and k internal reflections. */
export function deviation(b: number, n: number, k: number): number {
  const i = Math.asin(b);
  const r = Math.asin(b / n);
  return k * Math.PI + 2 * i - 2 * (k + 1) * r;
}

/** Angle from the antisolar point (radians) for a ray turned through D. */
export function skyAngle(D: number): number {
  return Math.acos(Math.max(-1, Math.min(1, -Math.cos(D))));
}

export interface Descartes {
  /** incidence angle of the stationary ray (rad) */
  i: number;
  r: number;
  b: number;
  /** minimum deviation (rad) */
  D: number;
  /** bow radius from the antisolar point (rad) */
  theta: number;
}

/** Stationary (Descartes) ray from dD/di = 0: cos² i = (n² - 1) / (k(k + 2)). */
export function descartes(n: number, k: number): Descartes {
  const c = Math.sqrt((n * n - 1) / (k * (k + 2)));
  const i = Math.acos(c);
  const b = Math.sin(i);
  const r = Math.asin(b / n);
  const D = k * Math.PI + 2 * i - 2 * (k + 1) * r;
  return { i, r, b, D, theta: skyAngle(D) };
}

/** Numerical minimum of D(b) by golden-section search. Independent check of the closed form. */
export function minDeviationNumeric(n: number, k: number): { b: number; D: number } {
  let a = 0;
  let c = 0.999999;
  const g = (Math.sqrt(5) - 1) / 2;
  let x1 = c - g * (c - a);
  let x2 = a + g * (c - a);
  let f1 = deviation(x1, n, k);
  let f2 = deviation(x2, n, k);
  for (let it = 0; it < 200; it++) {
    if (f1 < f2) {
      c = x2;
      x2 = x1;
      f2 = f1;
      x1 = c - g * (c - a);
      f1 = deviation(x1, n, k);
    } else {
      a = x1;
      x1 = x2;
      f1 = f2;
      x2 = a + g * (c - a);
      f2 = deviation(x2, n, k);
    }
  }
  const b = (a + c) / 2;
  return { b, D: deviation(b, n, k) };
}

/** Fresnel power reflectances for light hitting water from air at incidence i. */
export function fresnel(i: number, n: number): { rs: number; rp: number } {
  const ci = Math.cos(i);
  const sr = Math.sin(i) / n;
  const cr = Math.sqrt(Math.max(0, 1 - sr * sr));
  const rs = (ci - n * cr) / (ci + n * cr);
  const rp = (n * ci - cr) / (n * ci + cr);
  return { rs: rs * rs, rp: rp * rp };
}

export interface PathWeight {
  /** fraction of the incoming power that leaves along this path (unpolarized sunlight) */
  total: number;
  /** degree of polarization, (I_s - I_p)/(I_s + I_p). Positive means s (tangential to the bow). */
  pol: number;
}

/**
 * Power left in a ray after entering, reflecting k times inside and leaving.
 * Inside the drop the ray meets the surface at angle r, and Fresnel reflectance
 * there equals the external value at i, so each factor uses the same R.
 */
export function pathWeight(b: number, n: number, k: number): PathWeight {
  const { rs, rp } = fresnel(Math.asin(Math.min(b, 0.999999)), n);
  const s = (1 - rs) ** 2 * rs ** k;
  const p = (1 - rp) ** 2 * rp ** k;
  const tot = s + p;
  return { total: tot / 2, pol: tot > 0 ? (s - p) / tot : 0 };
}

/**
 * Trace a ray through a unit circle with vector Snell's law. Sunlight travels
 * along +x and meets the drop at height b. Writes the entry point, the k
 * internal reflection points and the exit point as (x, y) pairs into out,
 * followed by the exit direction. Returns the number of points written (k + 2).
 */
export function traceRay(b: number, n: number, k: number, out: Float64Array): number {
  let px = -Math.sqrt(1 - b * b);
  let py = b;
  out[0] = px;
  out[1] = py;
  // Refract in: incoming d = (1, 0), normal against the ray N = (px, py).
  let dx = 1;
  let dy = 0;
  let eta = 1 / n;
  let cosI = -(px * dx + py * dy);
  let k2 = 1 - eta * eta * (1 - cosI * cosI);
  let f = eta * cosI - Math.sqrt(k2);
  dx = eta * dx + f * px;
  dy = eta * dy + f * py;
  for (let j = 1; j <= k + 1; j++) {
    const s = -2 * (px * dx + py * dy);
    px += s * dx;
    py += s * dy;
    const len = Math.hypot(px, py);
    px /= len;
    py /= len;
    out[2 * j] = px;
    out[2 * j + 1] = py;
    if (j <= k) {
      const dn = dx * px + dy * py;
      dx -= 2 * dn * px;
      dy -= 2 * dn * py;
    }
  }
  // Refract out: normal against the ray is N = -(px, py).
  eta = n;
  cosI = px * dx + py * dy;
  k2 = 1 - eta * eta * (1 - cosI * cosI);
  if (k2 < 0) k2 = 0; // cannot happen for a sphere, kept for safety
  f = eta * cosI - Math.sqrt(k2);
  const ex = eta * dx - f * px;
  const ey = eta * dy - f * py;
  const el = Math.hypot(ex, ey);
  out[2 * (k + 2)] = ex / el;
  out[2 * (k + 2) + 1] = ey / el;
  return k + 2;
}

// ---------------------------------------------------------------- colour

function lobe(x: number, mu: number, s1: number, s2: number): number {
  const t = (x - mu) / (x < mu ? s1 : s2);
  return Math.exp(-0.5 * t * t);
}

/** CIE 1931 colour matching functions, multi-lobe fit of Wyman, Sloan & Shirley (2013). */
export function cie(l: number): [number, number, number] {
  const x = 1.056 * lobe(l, 599.8, 37.9, 31.0) + 0.362 * lobe(l, 442.0, 16.0, 26.7) - 0.065 * lobe(l, 501.1, 20.4, 26.2);
  const y = 0.821 * lobe(l, 568.8, 46.9, 40.5) + 0.286 * lobe(l, 530.9, 16.3, 31.1);
  const z = 1.217 * lobe(l, 437.0, 11.8, 36.0) + 0.681 * lobe(l, 459.0, 26.0, 13.8);
  return [x, y, z];
}

/** XYZ to linear sRGB (D65). */
export function xyzToRgb(x: number, y: number, z: number): [number, number, number] {
  return [3.2406 * x - 1.5372 * y - 0.4986 * z, -0.9689 * x + 1.8758 * y + 0.0415 * z, 0.0557 * x - 0.204 * y + 1.057 * z];
}

/** A saturated display colour (gamma-encoded, 0..1) for a single wavelength. */
export function spectralColor(l: number): [number, number, number] {
  const [x, y, z] = cie(l);
  let [r, g, b] = xyzToRgb(x, y, z);
  const m = Math.min(r, g, b);
  if (m < 0) {
    r -= m;
    g -= m;
    b -= m;
  }
  const mx = Math.max(r, g, b, 1e-6);
  const enc = (v: number) => Math.pow(Math.max(0, v / mx), 1 / 2.2);
  return [enc(r), enc(g), enc(b)];
}

// ---------------------------------------------------------------- sky radiance

export interface SkyLutOptions {
  /** bins over θ = 0 .. thetaMax */
  bins: number;
  thetaMax: number;
  fresnel: boolean;
  /** b samples per wavelength per order */
  samples: number;
  /** angular radius of the Sun (rad). The bow is smeared by the Sun's disk. */
  sunRadius: number;
  /** wavelength step (nm) across 400..700 */
  lambdaStep?: number;
}

/**
 * Linear-RGB radiance of rainbow light versus angle θ from the antisolar point,
 * for orders k = 1 and 2 and a flat (white) sun spectrum from 400 to 700 nm.
 * Each drop is lit uniformly, so a ray at height b carries weight b db (an annulus).
 * The per-bin power is divided by the solid angle sin θ dθ, then smeared by the Sun's disk.
 * Returns interleaved RGB, bins * 3 values, normalised so the brightest bin is 1.
 */
export function skyLut(o: SkyLutOptions): Float32Array {
  const { bins, thetaMax } = o;
  const dth = thetaMax / bins;
  const raw = new Float64Array(bins * 3);
  const spec = new Float64Array(bins);
  const step = o.lambdaStep ?? 5;
  for (let l = 400; l <= 700; l += step) {
    const n = nWater(l);
    const [cx, cy, cz] = cie(l);
    const [cr, cg, cb] = xyzToRgb(cx, cy, cz);
    for (let k = 1; k <= 2; k++) {
      spec.fill(0);
      for (let s = 0; s < o.samples; s++) {
        const b = (s + 0.5) / o.samples;
        const th = skyAngle(deviation(b, n, k));
        const bin = Math.floor(th / dth);
        if (bin < 0 || bin >= bins) continue;
        const w = o.fresnel ? pathWeight(b, n, k).total : 0.04;
        spec[bin] += b * w;
      }
      for (let j = 0; j < bins; j++) {
        const sa = Math.sin((j + 0.5) * dth);
        const v = spec[j] / Math.max(sa, 1e-3);
        raw[j * 3] += v * cr;
        raw[j * 3 + 1] += v * cg;
        raw[j * 3 + 2] += v * cb;
      }
    }
  }
  // Smear with the Sun's disk: a 1D semicircle kernel of radius sunRadius.
  const kr = Math.max(1, Math.round(o.sunRadius / dth));
  const ker: number[] = [];
  let ks = 0;
  for (let q = -kr; q <= kr; q++) {
    const u = q / kr;
    const w = Math.sqrt(Math.max(0, 1 - u * u)) + 1e-3;
    ker.push(w);
    ks += w;
  }
  const out = new Float32Array(bins * 3);
  let mx = 0;
  for (let j = 0; j < bins; j++) {
    for (let c = 0; c < 3; c++) {
      let acc = 0;
      for (let q = -kr; q <= kr; q++) {
        const jj = Math.min(bins - 1, Math.max(0, j + q));
        acc += ker[q + kr] * raw[jj * 3 + c];
      }
      const v = Math.max(0, acc / ks);
      out[j * 3 + c] = v;
      if (v > mx) mx = v;
    }
  }
  for (let j = 0; j < out.length; j++) out[j] /= mx || 1;
  return out;
}
