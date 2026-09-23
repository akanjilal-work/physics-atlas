// Holography: pure math for the Poincaré disk, global AdS3, Ryu–Takayanagi and Bekenstein–Hawking.
// No DOM, no Three.js. Units: AdS radius R = 1 unless stated.

/** A point of the Poincaré disk as a complex number x + iy with x² + y² < 1. */
export interface C {
  x: number;
  y: number;
}

export const cx = (x: number, y: number): C => ({ x, y });
const abs2 = (z: C) => z.x * z.x + z.y * z.y;

// ---------------------------------------------------------------------------
// Poincaré disk
// ---------------------------------------------------------------------------

/**
 * Hyperbolic distance in the Poincaré disk with metric ds = 2|dz| / (1 − |z|²) (curvature −1):
 * d(z, w) = arcosh(1 + 2|z − w|² / ((1 − |z|²)(1 − |w|²))).
 */
export function poincareDistance(z: C, w: C): number {
  const dx = z.x - w.x;
  const dy = z.y - w.y;
  const arg = 1 + (2 * (dx * dx + dy * dy)) / ((1 - abs2(z)) * (1 - abs2(w)));
  return Math.acosh(Math.max(1, arg));
}

/** Euclidean disk radius r ↔ hyperbolic distance from the centre ρ: r = tanh(ρ/2). */
export const radiusToRho = (r: number): number => 2 * Math.atanh(Math.min(Math.abs(r), 1 - 1e-15));
export const rhoToRadius = (rho: number): number => Math.tanh(rho / 2);

/** Möbius translation that moves 0 to a: M_a(z) = (z + a) / (1 + ā z). An isometry of the disk. */
export function mobius(a: C, z: C, out: C = { x: 0, y: 0 }): C {
  const nx = z.x + a.x;
  const ny = z.y + a.y;
  // 1 + conj(a) z
  const dx = 1 + a.x * z.x + a.y * z.y;
  const dy = a.x * z.y - a.y * z.x;
  const d = dx * dx + dy * dy;
  out.x = (nx * dx + ny * dy) / d;
  out.y = (ny * dx - nx * dy) / d;
  return out;
}

/** A geodesic as a Euclidean circle (centre, radius), or a diameter (line through 0) when `line` is true. */
export interface Geodesic {
  line: boolean;
  cx: number;
  cy: number;
  r: number;
}

/**
 * The geodesic through two interior points a and b. It is the circle through a, b and the
 * inverse point a / |a|², which is automatically orthogonal to the unit circle.
 */
export function geodesicThrough(a: C, b: C): Geodesic {
  // Collinear with the origin → a diameter.
  const cross = a.x * b.y - a.y * b.x;
  const scale = Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y) + 1e-300;
  if (Math.abs(cross) < 1e-12 * Math.max(1e-12, scale) || abs2(a) < 1e-24 || abs2(b) < 1e-24) return { line: true, cx: 0, cy: 0, r: Infinity };
  // Circle through a, b orthogonal to the unit circle: |c|² = 1 + r², |a − c|² = r², |b − c|² = r²
  // ⇒ 2 a·c = |a|² + 1, 2 b·c = |b|² + 1.
  const ra = (abs2(a) + 1) / 2;
  const rb = (abs2(b) + 1) / 2;
  const det = a.x * b.y - a.y * b.x;
  const ccx = (ra * b.y - rb * a.y) / det;
  const ccy = (a.x * rb - b.x * ra) / det;
  const r = Math.sqrt(ccx * ccx + ccy * ccy - 1);
  return { line: false, cx: ccx, cy: ccy, r };
}

/** Reflect z in a geodesic: inversion in its circle, or mirror in its diameter through a. */
export function reflect(g: Geodesic, z: C, a: C, out: C = { x: 0, y: 0 }): C {
  if (g.line) {
    const n = Math.hypot(a.x, a.y) || 1;
    const ux = a.x / n;
    const uy = a.y / n;
    const d = z.x * ux + z.y * uy;
    out.x = 2 * d * ux - z.x;
    out.y = 2 * d * uy - z.y;
    return out;
  }
  const dx = z.x - g.cx;
  const dy = z.y - g.cy;
  const k = (g.r * g.r) / (dx * dx + dy * dy);
  out.x = g.cx + dx * k;
  out.y = g.cy + dy * k;
  return out;
}

/**
 * Write n points along the geodesic segment from a to b into out (x, y pairs).
 * Uses the Möbius map that sends a to 0, where the geodesic is a straight diameter.
 */
export function geodesicSegment(a: C, b: C, n: number, out: Float64Array | number[]): void {
  // w = M_{-a}(b) lies on a diameter through 0, then map t·w back with M_a.
  const na = { x: -a.x, y: -a.y };
  const w = mobius(na, b);
  const tmp: C = { x: 0, y: 0 };
  const res: C = { x: 0, y: 0 };
  for (let k = 0; k < n; k++) {
    const t = n === 1 ? 0 : k / (n - 1);
    tmp.x = w.x * t;
    tmp.y = w.y * t;
    mobius(a, tmp, res);
    out[2 * k] = res.x;
    out[2 * k + 1] = res.y;
  }
}

/** Hyperbolic length of a polyline given as x, y pairs, with ds = 2|dz|/(1 − |z|²). */
export function polylineLength(pts: ArrayLike<number>, n: number): number {
  let L = 0;
  for (let k = 0; k + 1 < n; k++) {
    const ax = pts[2 * k];
    const ay = pts[2 * k + 1];
    const bx = pts[2 * k + 2];
    const by = pts[2 * k + 3];
    L += poincareDistance({ x: ax, y: ay }, { x: bx, y: by });
  }
  return L;
}

// ---------------------------------------------------------------------------
// Boundary-anchored geodesics (the RT curve)
// ---------------------------------------------------------------------------

/**
 * The geodesic ending on the boundary at angles φ − α and φ + α (half-opening α ∈ (0, π)).
 * Its Euclidean circle has centre at distance 1/cos α along φ and radius |tan α|.
 * The point closest to the disk centre sits at signed radius tan(π/4 − α/2) along φ.
 */
export function boundaryGeodesic(phi: number, alpha: number): Geodesic {
  const c = Math.cos(alpha);
  if (Math.abs(c) < 1e-12) return { line: true, cx: 0, cy: 0, r: Infinity };
  return { line: false, cx: Math.cos(phi) / c, cy: Math.sin(phi) / c, r: Math.abs(Math.tan(alpha)) };
}

/** Signed Euclidean radius (along φ) of the deepest point of the boundary geodesic. */
export const turningRadius = (alpha: number): number => Math.tan(Math.PI / 4 - alpha / 2);

/** Hyperbolic distance from the disk centre to the geodesic: ρ* = 2 artanh|tan(π/4 − α/2)|. */
export const turningRho = (alpha: number): number => radiusToRho(Math.abs(turningRadius(alpha)));

/**
 * Point on the boundary geodesic, s ∈ [−1, 1] (s = ±1 are the endpoints e^{i(φ ± α)}).
 * The diameter through 0 perpendicular to φ is mapped by the Möbius translation to the turning point.
 */
export function boundaryGeodesicPoint(phi: number, alpha: number, s: number, out: C = { x: 0, y: 0 }): C {
  const r0 = turningRadius(alpha);
  const a = { x: r0 * Math.cos(phi), y: r0 * Math.sin(phi) };
  // i e^{iφ} = (−sin φ, cos φ)
  const z = { x: -s * Math.sin(phi), y: s * Math.cos(phi) };
  return mobius(a, z, out);
}

// ---------------------------------------------------------------------------
// Global AdS3 and Ryu–Takayanagi
// ---------------------------------------------------------------------------

/**
 * Global AdS3: ds² = R²(−cosh²ρ dt² + dρ² + sinh²ρ dφ²). Each constant-t slice is a hyperbolic
 * plane, drawn as a Poincaré disk with r = tanh(ρ/2). Stacking the slices along t gives the cylinder.
 * Map a bulk point (t, ρ, φ) to cylinder coordinates (radius in the unit disk, angle, height).
 */
export function adsToCylinder(t: number, rho: number, phi: number): [number, number, number] {
  return [rhoToRadius(rho), phi, t];
}

/**
 * Exact regulated geodesic length between two boundary points separated by angle Δφ = 2α,
 * both sitting on the cutoff surface ρ = ρc:
 * cosh(L/R) = 1 + 2 sinh²ρc sin²α.
 */
export function geodesicLength(alpha: number, rhoC: number): number {
  const s = Math.sinh(rhoC) * Math.sin(alpha);
  return Math.acosh(1 + 2 * s * s);
}

/** Brown–Henneaux central charge c = 3R / (2G). */
export const brownHenneaux = (R: number, G: number): number => (3 * R) / (2 * G);

/** Ryu–Takayanagi: S = Length(γ) / (4G). In AdS3 the "area" of a curve is its length. */
export const rtEntropy = (length: number, G: number): number => length / (4 * G);

/**
 * CFT2 entanglement entropy of an interval of length ℓ on a circle of circumference Lc with
 * UV cutoff ε (Calabrese–Cardy 2004): S = (c/3) log( (Lc / (π ε)) sin(π ℓ / Lc) ).
 * For ℓ ≪ Lc this is (c/3) log(ℓ/ε).
 */
export function cftEntropy(c: number, ell: number, Lc: number, eps: number): number {
  return (c / 3) * Math.log((Lc / (Math.PI * eps)) * Math.sin((Math.PI * ell) / Lc));
}

/**
 * The bulk cutoff that corresponds to a boundary cutoff ε on a circle of circumference Lc.
 * Matching the large-ρc form of geodesicLength to cftEntropy gives e^{ρc} = Lc / (π ε).
 */
export const rhoCutoff = (Lc: number, eps: number): number => Math.log(Lc / (Math.PI * eps));

// ---------------------------------------------------------------------------
// {p, q} hyperbolic tiling by reflections
// ---------------------------------------------------------------------------

/** Circumradius of a regular {p,q} polygon: cosh R = cot(π/p) cot(π/q). Requires (p−2)(q−2) > 4. */
export function tileCircumRho(p: number, q: number): number {
  return Math.acosh(1 / (Math.tan(Math.PI / p) * Math.tan(Math.PI / q)));
}

/** Inradius: cosh r = cos(π/q) / sin(π/p). */
export function tileInRho(p: number, q: number): number {
  return Math.acosh(Math.cos(Math.PI / q) / Math.sin(Math.PI / p));
}

export interface Tile {
  center: C;
  verts: C[];
  /** Hyperbolic midpoints of edges: mids[k] lies between verts[k] and verts[k+1]. */
  mids: C[];
  /** Number of reflections from the central tile, mod 2 (orientation). */
  parity: number;
  depth: number;
}

/**
 * Build the {p,q} tiling by breadth-first reflection of the central polygon across its edges.
 * Stops at tiles whose centre lies beyond maxRadius (Euclidean) or when maxTiles is reached.
 */
export function buildTiling(p: number, q: number, maxRadius: number, maxTiles = 4000): Tile[] {
  const rv = rhoToRadius(tileCircumRho(p, q));
  const rm = rhoToRadius(tileInRho(p, q));
  const verts: C[] = [];
  const mids: C[] = [];
  for (let k = 0; k < p; k++) {
    const a = (2 * Math.PI * k) / p + Math.PI / 2;
    verts.push({ x: rv * Math.cos(a), y: rv * Math.sin(a) });
    const b = a + Math.PI / p;
    mids.push({ x: rm * Math.cos(b), y: rm * Math.sin(b) });
  }
  const first: Tile = { center: { x: 0, y: 0 }, verts, mids, parity: 0, depth: 0 };
  const tiles: Tile[] = [first];
  const seen = new Set<string>([key(first.center)]);
  let head = 0;
  while (head < tiles.length && tiles.length < maxTiles) {
    const t = tiles[head++];
    for (let k = 0; k < p; k++) {
      const a = t.verts[k];
      const b = t.verts[(k + 1) % p];
      const g = geodesicThrough(a, b);
      const c = reflect(g, t.center, a);
      if (Math.hypot(c.x, c.y) > maxRadius) continue;
      const kk = key(c);
      if (seen.has(kk)) continue;
      seen.add(kk);
      tiles.push({
        center: c,
        verts: t.verts.map((v) => reflect(g, v, a)),
        mids: t.mids.map((v) => reflect(g, v, a)),
        parity: t.parity ^ 1,
        depth: t.depth + 1,
      });
      if (tiles.length >= maxTiles) break;
    }
  }
  return tiles;
}

function key(c: C): string {
  return `${Math.round(c.x * 1e6)},${Math.round(c.y * 1e6)}`;
}

/** Interior angle of the polygon at a vertex, from the tangents of its two geodesic edges. */
export function vertexAngle(prev: C, v: C, next: C): number {
  const t1 = geodesicTangent(v, prev);
  const t2 = geodesicTangent(v, next);
  return Math.acos(Math.max(-1, Math.min(1, t1.x * t2.x + t1.y * t2.y)));
}

/** Unit tangent at a of the geodesic from a toward b. */
export function geodesicTangent(a: C, b: C): C {
  // Flatten with the Möbius map that sends a to 0, step a tiny way along the diameter, map back.
  const w = mobius({ x: -a.x, y: -a.y }, b);
  const n = Math.hypot(w.x, w.y);
  const h = 1e-6;
  const p1 = mobius(a, { x: (w.x / n) * h, y: (w.y / n) * h });
  const dx = p1.x - a.x;
  const dy = p1.y - a.y;
  const m = Math.hypot(dx, dy);
  return { x: dx / m, y: dy / m };
}

// ---------------------------------------------------------------------------
// Bekenstein–Hawking entropy
// ---------------------------------------------------------------------------

export const G_SI = 6.6743e-11; // m³ kg⁻¹ s⁻²
export const C_SI = 299792458; // m/s
export const HBAR = 1.054571817e-34; // J s
export const M_SUN = 1.98847e30; // kg (IAU nominal GM☉ / G)

/** Planck length squared l_P² = G ħ / c³ (m²). */
export const planckArea = (): number => (G_SI * HBAR) / C_SI ** 3;

/** Schwarzschild radius r_s = 2GM/c² (m). */
export const schwarzschildRadius = (M: number): number => (2 * G_SI * M) / (C_SI * C_SI);

/** Horizon area A = 4π r_s² (m²). */
export const horizonArea = (M: number): number => 4 * Math.PI * schwarzschildRadius(M) ** 2;

/** Bekenstein–Hawking entropy S / k_B = A / (4 l_P²) = 4π G M² / (ħ c). */
export const bhEntropy = (M: number): number => horizonArea(M) / (4 * planckArea());

/** Same entropy in bits: S / (k_B ln 2). */
export const bhBits = (M: number): number => bhEntropy(M) / Math.LN2;
