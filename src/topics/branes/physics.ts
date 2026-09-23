// D-branes: stretched open strings, Chan–Paton sectors and gauge groups from brane positions.
// Units: alpha' = 1 unless passed explicitly. Pure module: no DOM, no Three.js.

// ---------------------------------------------------------------------------
// 1. Masses of open strings
// ---------------------------------------------------------------------------

/** String tension T = 1/(2π α'). */
export const tension = (alphaP = 1): number => 1 / (2 * Math.PI * alphaP);

/** Classical mass of a string stretched a distance y between two branes: M = T·|y| = |y|/(2π α'). */
export const stretchedMass = (y: number, alphaP = 1): number => tension(alphaP) * Math.abs(y);

/**
 * Full open bosonic string mass: M² = (y/(2π α'))² + (N − 1)/α'.
 * N is the oscillator level. N = 1 gives the vector (massless when y = 0), N = 0 the tachyon.
 */
export const openMass2 = (y: number, N: number, alphaP = 1): number => (y * tension(alphaP)) ** 2 + (N - 1) / alphaP;

/** N branes give N² oriented Chan–Paton sectors (i, j), with i and j each running over the branes. */
export const sectorCount = (n: number): number => n * n;

// ---------------------------------------------------------------------------
// 2. Clusters of coincident branes and the gauge group
// ---------------------------------------------------------------------------

export interface Cluster {
  /** Indices of the branes in this cluster, in the order they were given. */
  members: number[];
  /** Mean transverse position of the cluster. */
  y: number;
}

/**
 * Group branes whose positions coincide within eps. Branes are sorted by position and chained,
 * so a run of neighbours each within eps of the next forms one cluster. Clusters come out
 * ordered by position.
 */
export function clusterBranes(positions: readonly number[], eps = 1e-6): Cluster[] {
  const order = positions.map((_, i) => i).sort((a, b) => positions[a] - positions[b] || a - b);
  const out: Cluster[] = [];
  let cur: number[] = [];
  for (const i of order) {
    if (cur.length && positions[i] - positions[cur[cur.length - 1]] > eps) {
      out.push(finish(cur, positions));
      cur = [];
    }
    cur.push(i);
  }
  if (cur.length) out.push(finish(cur, positions));
  return out;
}

function finish(idx: number[], positions: readonly number[]): Cluster {
  const members = idx.slice().sort((a, b) => a - b);
  let y = 0;
  for (const i of members) y += positions[i];
  return { members, y: y / members.length };
}

/** Sizes k of each cluster, largest first. */
export const clusterSizes = (clusters: readonly Cluster[]): number[] => clusters.map((c) => c.members.length).sort((a, b) => b - a);

/** Gauge group of a set of clusters: a U(k) for each stack of k branes, largest first. e.g. 'U(2)×U(1)'. */
export function gaugeGroupOf(clusters: readonly Cluster[]): string {
  return clusterSizes(clusters).map((k) => `U(${k})`).join('×');
}

/** Gauge group for brane positions. [0, 0, 1] gives 'U(2)×U(1)'. */
export const gaugeGroup = (positions: readonly number[], eps = 1e-6): string => gaugeGroupOf(clusterBranes(positions, eps));

/** Number of massless vectors: the dimension of the gauge group, Σ k². */
export function masslessVectors(positions: readonly number[], eps = 1e-6): number {
  let s = 0;
  for (const k of clusterSizes(clusterBranes(positions, eps))) s += k * k;
  return s;
}

/** A family of stretched, W-boson-like strings between two clusters. */
export interface StretchedSector {
  /** Cluster indices (into clusterBranes output), a < b. */
  a: number;
  b: number;
  /** Separation between the two clusters. */
  y: number;
  /** Classical mass y/(2π α'). */
  M: number;
  /** Oriented strings in this family: k_a·k_b each way, so 2·k_a·k_b. */
  count: number;
}

/** Masses of the stretched strings between every pair of distinct clusters, lightest first. */
export function stretchedSectors(positions: readonly number[], eps = 1e-6, alphaP = 1): StretchedSector[] {
  const cl = clusterBranes(positions, eps);
  const out: StretchedSector[] = [];
  for (let a = 0; a < cl.length; a++) {
    for (let b = a + 1; b < cl.length; b++) {
      const y = Math.abs(cl[b].y - cl[a].y);
      out.push({ a, b, y, M: stretchedMass(y, alphaP), count: 2 * cl[a].members.length * cl[b].members.length });
    }
  }
  return out.sort((p, q) => p.M - q.M);
}

/** Lightest stretched-string mass, or Infinity when every brane sits in one stack. */
export function lightestStretched(positions: readonly number[], eps = 1e-6, alphaP = 1): number {
  const s = stretchedSectors(positions, eps, alphaP);
  return s.length ? s[0].M : Infinity;
}

// ---------------------------------------------------------------------------
// 3. Classical shape of an open string between two branes
// ---------------------------------------------------------------------------

/** One harmonic of the open string. ax is along the transverse (Dirichlet) axis, ay and az lie along the brane. */
export interface OpenHarmonic {
  n: number;
  ax: number;
  ay: number;
  az: number;
  phase: number;
}

/**
 * An open string with ends on two branes that are perpendicular to x.
 * xa and xb are the brane positions, (yc, zc) is the centre of mass along the branes.
 */
export interface OpenStringSpec {
  xa: number;
  xb: number;
  yc: number;
  zc: number;
  modes: OpenHarmonic[];
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * Point on the string at σ in [0, π] and time t (string length π, c = 1, so harmonic n has ω = n).
 *
 * Transverse x is Dirichlet: X(0) = xa and X(π) = xb, with sin(nσ) oscillations that vanish at the ends.
 * Along the brane y and z are Neumann: ∂σY = ∂σZ = 0 at the ends, with cos(nσ) oscillations,
 * so the endpoints slide freely over the brane surface.
 */
export function openStringPoint(sigma: number, t: number, s: OpenStringSpec, out: Vec3Like): Vec3Like {
  let x = s.xa + ((s.xb - s.xa) * sigma) / Math.PI;
  let y = s.yc;
  let z = s.zc;
  for (let i = 0; i < s.modes.length; i++) {
    const m = s.modes[i];
    const w = m.n * t + m.phase;
    const c = Math.cos(w);
    x += m.ax * Math.sin(m.n * sigma) * c;
    const cs = Math.cos(m.n * sigma);
    y += m.ay * cs * c;
    z += m.az * cs * Math.sin(w);
  }
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

const tmp: Vec3Like = { x: 0, y: 0, z: 0 };

/** Write `count` points (σ from 0 to π inclusive) of an open string into out as xyz triplets. */
export function writeOpenString(out: Float32Array, count: number, t: number, s: OpenStringSpec): void {
  for (let k = 0; k < count; k++) {
    openStringPoint((Math.PI * k) / (count - 1), t, s, tmp);
    out[k * 3] = tmp.x;
    out[k * 3 + 1] = tmp.y;
    out[k * 3 + 2] = tmp.z;
  }
}

// ---------------------------------------------------------------------------
// 4. Brane world: how gravity would weaken with n extra dimensions (ADD)
// ---------------------------------------------------------------------------

/**
 * Relative strength of gravity between two masses at distance r when n extra dimensions
 * have size R. Far away (r ≫ R) it is Newton's 1/r². Close in (r ≪ R) the field lines spread
 * into 3 + n dimensions and the force goes as 1/r^(2+n). Matched at r = R, normalised to 1/r² far away.
 */
export function addForce(r: number, R: number, n: number): number {
  return r >= R ? 1 / (r * r) : (1 / (R * R)) * Math.pow(R / r, 2 + n);
}
