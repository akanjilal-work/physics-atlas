// Double pendulum equations of motion (point masses on massless rigid rods),
// integrated with classical RK4. Pure module: no DOM, no Three.js.

export interface DPParams {
  m1: number;
  m2: number;
  l1: number;
  l2: number;
  g: number;
  /** Linear damping coefficient on each joint (0 = ideal). */
  damping: number;
}

/** State vector: [theta1, omega1, theta2, omega2] in radians and rad/s. */
export type DPState = [number, number, number, number];

export function derivatives(s: DPState, p: DPParams): DPState {
  const [t1, w1, t2, w2] = s;
  const { m1, m2, l1, l2, g, damping } = p;
  const d = t1 - t2;
  const den = 2 * m1 + m2 - m2 * Math.cos(2 * t1 - 2 * t2);
  const a1 =
    (-g * (2 * m1 + m2) * Math.sin(t1) -
      m2 * g * Math.sin(t1 - 2 * t2) -
      2 * Math.sin(d) * m2 * (w2 * w2 * l2 + w1 * w1 * l1 * Math.cos(d))) /
    (l1 * den);
  const a2 =
    (2 * Math.sin(d) * (w1 * w1 * l1 * (m1 + m2) + g * (m1 + m2) * Math.cos(t1) + w2 * w2 * l2 * m2 * Math.cos(d))) /
    (l2 * den);
  return [w1, a1 - damping * w1, w2, a2 - damping * w2];
}

export function rk4(s: DPState, p: DPParams, h: number): DPState {
  const k1 = derivatives(s, p);
  const s2: DPState = [s[0] + (h / 2) * k1[0], s[1] + (h / 2) * k1[1], s[2] + (h / 2) * k1[2], s[3] + (h / 2) * k1[3]];
  const k2 = derivatives(s2, p);
  const s3: DPState = [s[0] + (h / 2) * k2[0], s[1] + (h / 2) * k2[1], s[2] + (h / 2) * k2[2], s[3] + (h / 2) * k2[3]];
  const k3 = derivatives(s3, p);
  const s4: DPState = [s[0] + h * k3[0], s[1] + h * k3[1], s[2] + h * k3[2], s[3] + h * k3[3]];
  const k4 = derivatives(s4, p);
  return [
    s[0] + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
    s[1] + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
    s[2] + (h / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]),
    s[3] + (h / 6) * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]),
  ];
}

/** Total mechanical energy, with the pivot as the zero of potential. */
export function energy(s: DPState, p: DPParams): number {
  const [t1, w1, t2, w2] = s;
  const { m1, m2, l1, l2, g } = p;
  const v1sq = l1 * l1 * w1 * w1;
  const v2sq = v1sq + l2 * l2 * w2 * w2 + 2 * l1 * l2 * w1 * w2 * Math.cos(t1 - t2);
  const T = 0.5 * m1 * v1sq + 0.5 * m2 * v2sq;
  const V = -(m1 + m2) * g * l1 * Math.cos(t1) - m2 * g * l2 * Math.cos(t2);
  return T + V;
}

/** Bob positions in the pendulum plane (x right, y up). */
export function positions(s: DPState, p: DPParams): [number, number, number, number] {
  const x1 = p.l1 * Math.sin(s[0]);
  const y1 = -p.l1 * Math.cos(s[0]);
  const x2 = x1 + p.l2 * Math.sin(s[2]);
  const y2 = y1 - p.l2 * Math.cos(s[2]);
  return [x1, y1, x2, y2];
}

/** Wrap an angle into (-pi, pi]. */
export const wrap = (a: number) => {
  const t = (a + Math.PI) % (2 * Math.PI);
  return (t < 0 ? t + 2 * Math.PI : t) - Math.PI;
};

/** Phase-space distance between two states, using wrapped angle differences. */
export function separation(a: DPState, b: DPState): number {
  const d0 = wrap(a[0] - b[0]);
  const d2 = wrap(a[2] - b[2]);
  const d1 = (a[1] - b[1]) * 0.1;
  const d3 = (a[3] - b[3]) * 0.1;
  return Math.sqrt(d0 * d0 + d1 * d1 + d2 * d2 + d3 * d3);
}
