// Line icons for atlas tiles, one per topic. Each draws the physics it stands
// for on a 48×48 grid and inherits the domain accent through currentColor.

const f = (n: number) => +n.toFixed(2);
const dot = (x: number, y: number, r = 2.6) => `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor" stroke="none"/>`;
const poly = (pts: [number, number][], close = false) =>
  `<path d="M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}${close ? 'Z' : ''}"/>`;

/** Closed curve r(θ) around (cx, cy). */
function polar(cx: number, cy: number, r: (t: number) => number, n = 120): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * 2 * Math.PI;
    pts.push([cx + r(t) * Math.cos(t), cy + r(t) * Math.sin(t)]);
  }
  return poly(pts, true);
}

/** Hypotrochoid, the spirograph curve used for the Calabi–Yau tile. */
function hypotrochoid(cx: number, cy: number, R: number, r: number, d: number, scale: number): string {
  const pts: [number, number][] = [];
  const turns = r / gcd(R, r);
  const n = 360 * turns;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * 2 * Math.PI * turns;
    const x = (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t);
    const y = (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t);
    pts.push([cx + x * scale, cy + y * scale]);
  }
  return poly(pts, true);
}
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/** Hyperbolic geodesic in a Poincaré disk: a circular arc meeting the rim at right angles. */
function geodesic(cx: number, cy: number, R: number, a1: number, a2: number): string {
  const rad = (d: number) => (d * Math.PI) / 180;
  const half = rad(a2 - a1) / 2;
  const x1 = cx + R * Math.cos(rad(a1)), y1 = cy - R * Math.sin(rad(a1));
  const x2 = cx + R * Math.cos(rad(a2)), y2 = cy - R * Math.sin(rad(a2));
  return `<path d="M${f(x1)} ${f(y1)}A${f(R * Math.tan(half))} ${f(R * Math.tan(half))} 0 0 1 ${f(x2)} ${f(y2)}"/>`;
}

/** 3×3 lattice of spins for the Ising tile. */
function spins(): string {
  const up = [true, true, false, true, true, false, true, false, false];
  return up
    .map((u, i) => {
      const x = 10 + (i % 3) * 14, y = 10 + Math.floor(i / 3) * 14;
      return u ? `<path d="M${x} ${y + 5}V${y - 5}M${x - 3.5} ${y - 1.5}L${x} ${y - 5}L${x + 3.5} ${y - 1.5}"/>`
               : `<path d="M${x} ${y - 5}V${y + 5}M${x - 3.5} ${y + 1.5}L${x} ${y + 5}L${x + 3.5} ${y + 1.5}"/>`;
    })
    .join('');
}

const ICONS: Record<string, string> = {
  // Classical
  'double-pendulum':
    `<path d="M14 5h20"/><path d="M24 5 15 21"/>${dot(15, 22, 3)}<path d="M15 22 31 32"/>${dot(32, 33, 3.4)}` +
    `<path d="M6 42c4-5 8 2 12-2s6-6 10-1 8 3 10-2 4-3 6 0" opacity=".45"/>`,
  'tennis-racket':
    `<ellipse cx="19" cy="18" rx="9" ry="12" transform="rotate(-35 19 18)"/><path d="M13 15l11 7M15 11l9 6M13 20l8 5" opacity=".45"/>` +
    `<path d="M26 27 38 42"/><path d="M34 6c6 2 9 7 8 13"/><path d="M39 17l3 3 2-4"/>`,
  'three-body':
    `<path d="M24 24c-4-6-8-9-12-9s-8 4-8 9 4 9 8 9 8-3 12-9 8-9 12-9 8 4 8 9-4 9-8 9-8-3-12-9z" opacity=".5"/>` +
    `${dot(12, 15, 3)}${dot(24, 24, 3)}${dot(36, 33, 3)}`,
  'lagrange-points':
    `<circle cx="24" cy="24" r="14" stroke-dasharray="2 3" opacity=".6"/>${dot(24, 24, 4)}${dot(38, 24, 2.2)}` +
    [[33, 24], [44, 24], [8, 24], [31, 11.9], [31, 36.1]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.7"/>`).join(''),
  'normal-modes':
    `<path d="M4 24c5-13 15-13 20 0s15 13 20 0"/><path d="M4 24c5 13 15 13 20 0s15-13 20 0" opacity=".45"/>` +
    `${dot(4, 24, 2.2)}${dot(24, 24, 2.2)}${dot(44, 24, 2.2)}`,
  gyroscope:
    `<path d="M4 44h16M12 44V21"/><path d="M12 20h26"/><ellipse cx="32" cy="20" rx="4" ry="12"/>${dot(12, 20, 2.2)}` +
    `<path d="M4 9c4-3 12-4 16-2" stroke-dasharray="2 3"/><path d="M17 5l3 2-3 2.5"/>`,
  'foucault-pendulum':
    `<path d="M16 4h16M24 4v26"/>${dot(24, 31, 3)}<ellipse cx="24" cy="40" rx="17" ry="5" opacity=".45"/>` +
    `<path d="M9 40h30M12 37.5l24 5M12 42.5l24-5" opacity=".7"/>`,
  // Electromagnetism & light
  'em-waves':
    `<path d="M4 24h40M40 21l4 3-4 3"/><path d="M4 24c3-11 7-11 10 0s7 11 10 0 7-11 10 0 3 5 6 5"/>` +
    `<path d="M4 24c3 4 7 6 10 0s7-6 10 0 7 6 10 0" opacity=".45"/>`,
  'magnetic-fields':
    `<circle cx="24" cy="24" r="12"/><path d="M33 14l3 3.5-4.5 1"/>${dot(12, 24, 3)}` +
    [[7, 7], [41, 7], [7, 41], [41, 41]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.2" opacity=".6"/><path d="M${x - 2} ${y - 2}l4 4M${x + 2} ${y - 2}l-4 4" opacity=".6"/>`).join(''),
  rainbows:
    `<path d="M4 36a20 20 0 0 1 40 0"/><path d="M10 36a14 14 0 0 1 28 0" opacity=".7"/><path d="M16 36a8 8 0 0 1 16 0" opacity=".45"/>` +
    `<path d="M24 38c-2 3-3 4.5-3 6a3 3 0 0 0 6 0c0-1.5-1-3-3-6z"/>`,
  // Thermo & statistical
  'ising-model': spins(),
  'maxwells-demon':
    `<rect x="4" y="9" width="40" height="30" rx="3"/><path d="M24 9v10M24 29v10"/><path d="M24 19l5-3" opacity=".6"/>` +
    `${dot(11, 16, 2)}${dot(15, 31, 2)}${dot(33, 15, 2)}${dot(38, 30, 2)}${dot(31, 26, 2)}` +
    `<path d="M11 16l-4 3M15 31l-4-3M33 15l5 2M38 30l3-4M31 26l-4 4" opacity=".5"/>`,
  'brownian-motion':
    `<path d="M5 41l5-6 3 4 4-9 5 3 2-7 6 2-2-8 7-2" opacity=".6"/>${dot(35, 16, 5)}` +
    `${dot(8, 10, 1.4)}${dot(16, 20, 1.4)}${dot(42, 34, 1.4)}${dot(30, 42, 1.4)}${dot(44, 8, 1.4)}`,
  // Relativity
  'special-relativity':
    `<path d="M8 8 40 40M40 8 8 40"/><ellipse cx="24" cy="8" rx="16" ry="3.5"/><ellipse cx="24" cy="40" rx="16" ry="3.5" opacity=".45"/>` +
    `<path d="M21 44c1-8 5-12 3-20s-1-12 3-20" stroke-width="2.6"/>`,
  'curved-spacetime':
    `<ellipse cx="24" cy="14" rx="20" ry="6"/><ellipse cx="24" cy="22" rx="11" ry="3.3" opacity=".7"/><ellipse cx="24" cy="28" rx="5" ry="1.5" opacity=".5"/>` +
    `<path d="M4 14c6 4 12 8 16 14 1.5 3 1.5 8 4 12M44 14c-6 4-12 8-16 14-1.5 3-1.5 8-4 12" opacity=".6"/>${dot(38, 24, 2.6)}`,
  'twin-paradox':
    `<path d="M16 42V6"/><path d="M16 42 34 24 16 6" stroke-dasharray="3 2.5"/>${dot(16, 42, 3)}${dot(16, 6, 3)}${dot(34, 24, 2.4)}`,
  'black-hole-lensing':
    `${dot(24, 24, 6.5)}<circle cx="24" cy="24" r="10" opacity=".45"/>` +
    `<path d="M3 10c12 0 15 5 21 5s9-5 21-5"/><path d="M3 38c12 0 15-5 21-5s9 5 21 5"/>`,
  'gravitational-waves':
    `<ellipse cx="24" cy="24" rx="7" ry="2.6" stroke-dasharray="2 2" opacity=".6"/>${dot(17, 24, 2.8)}${dot(31, 24, 2.8)}` +
    `<path d="M11 16a12 12 0 0 0 0 16M37 16a12 12 0 0 1 0 16"/><path d="M7.5 10a20 20 0 0 0 0 28M40.5 10a20 20 0 0 1 0 28" opacity=".5"/>`,
  'kerr-black-hole':
    `<path d="M24 3v8M24 37v8" stroke-dasharray="2 2.5" opacity=".6"/>${dot(24, 24, 6.5)}<ellipse cx="24" cy="24" rx="14" ry="8.5"/>` +
    `<path d="M11 10c8-5 18-5 26 0"/><path d="M34 7l3 3-4 1.5"/>`,
  'cosmic-expansion':
    `<path d="M4 24c10 0 13-4 18-10s12-9 22-9M4 24c10 0 13 4 18 10s12 9 22 9"/><ellipse cx="41" cy="24" rx="3" ry="18" opacity=".6"/>` +
    `${dot(4, 24, 2.4)}${dot(20, 22, 1.5)}${dot(28, 28, 1.5)}${dot(32, 17, 1.5)}${dot(34, 32, 1.5)}`,
  // Quantum
  'quantum-tunneling':
    `<rect x="20" y="8" width="8" height="34" rx="1" fill="currentColor" fill-opacity=".15"/>` +
    `<path d="M2 26c2-12 6-12 8 0s6 12 8 0l2-4c3-3 6-2 8 0"/><path d="M28 25c2-4 4-4 5 0s3 4 5 0 3-4 5 0" opacity=".8"/>`,
  'hydrogen-orbitals':
    `<path d="M24 24c-7-5-8-18 0-20 8 2 7 15 0 20zM24 24c-7 5-8 18 0 20 8-2 7-15 0-20z"/>` +
    `<path d="M24 24c-5-7-18-8-20 0 2 8 15 7 20 0zM24 24c5-7 18-8 20 0-2 8-15 7-20 0z" opacity=".4"/>${dot(24, 24, 2.2)}`,
  'double-slit':
    `<path d="M14 4v14M14 22v4M14 30v14" stroke-width="2.6"/>` +
    `<path d="M18 13a8 8 0 0 1 0 14M21 8a14 14 0 0 1 0 24M18 21a8 8 0 0 1 0 14M21 16a14 14 0 0 1 0 24" opacity=".55"/>` +
    `<path d="M44 6v36"/>` + [[10, 1], [17, .5], [24, 1], [31, .5], [38, 1]].map(([y, o]) => `<path d="M38 ${y}h6" stroke-width="3" opacity="${o}"/>`).join(''),
  'spin-bloch':
    `<circle cx="24" cy="24" r="18"/><ellipse cx="24" cy="24" rx="18" ry="5.5" opacity=".45"/><path d="M24 4v40" stroke-dasharray="2 2.5" opacity=".45"/>` +
    `<path d="M24 24 34 11"/><path d="M29.5 11.5 34 11l-.5 4.5"/>${dot(24, 24, 2)}`,
  entanglement:
    `<circle cx="9" cy="24" r="5"/><circle cx="39" cy="24" r="5"/><path d="M14 24c2.5-4 5-4 7.5 0s5 4 7.5 0 2.5-2 4-1" stroke-dasharray="2 2" opacity=".6"/>` +
    `<path d="M9 12v-8M6 7l3-3 3 3M39 36v8M36 41l3 3 3-3"/>`,
  uncertainty:
    `<path d="M2 40h44" opacity=".45"/><path d="M11 40c6 0 9-30 13-30s7 30 13 30"/><path d="M2 40c10 0 14-13 22-13s12 13 22 13" stroke-dasharray="3 2.5" opacity=".7"/>`,
  'quantum-oscillator':
    `<path d="M8 6q16 64 32 0"/>` +
    [[34, 5.7], [26, 9.8], [18, 12.6], [10, 15]].map(([y, dx]) => `<path d="M${f(24 - dx)} ${y}H${f(24 + dx)}" opacity=".55"/>`).join('') +
    `<path d="M17 34c3 0 4-6 7-6s4 6 7 6"/>`,
  'grover-search':
    `<path d="M4 42h40" opacity=".45"/>` +
    [[8, 36], [14, 36], [20, 36], [32, 36], [38, 36]].map(([x, y]) => `<path d="M${x} 42V${y}" stroke-width="3.5" opacity=".55"/>`).join('') +
    `<path d="M26 42V8" stroke-width="3.5"/><path d="M22 5l4-3 4 3" opacity=".7"/>`,
  // String theory
  'vibrating-strings': polar(24, 24, (t) => 14 + 3.2 * Math.sin(5 * t)),
  'calabi-yau': hypotrochoid(24, 24, 7, 3, 5, 2.4),
  branes:
    `<path d="M5 13l11-6v28l-11 6z"/><path d="M32 13l11-6v28l-11 6z"/>` +
    `<path d="M13 17c5-8 17-8 22 0" stroke-width="2.4"/><path d="M11 29c4 5 3 8-1 7" stroke-width="2.4"/><path d="M13 27c6 6 16 6 21 0" stroke-width="2.4" opacity=".55"/>`,
  holography:
    `<circle cx="24" cy="24" r="19"/>` +
    [[90, 210], [210, 330], [330, 450], [30, 150], [150, 270], [270, 390]].map(([a, b], i) =>
      geodesic(24, 24, 19, a, b).replace('/>', i < 3 ? '/>' : ' opacity=".45"/>')).join(''),
  'cosmic-strings':
    `<path d="M3 34c6-10 9 6 15-4s8-10 13-3 5 7 9-2 4-6 5-5"/><ellipse cx="32" cy="12" rx="4.5" ry="3" transform="rotate(-20 32 12)"/>` +
    `${dot(8, 10, 1.3)}${dot(16, 16, 1.3)}${dot(42, 40, 1.3)}${dot(22, 42, 1.3)}`,
};

/** Inline SVG for a topic tile. Decorative: the tile title carries the name. */
export function topicIcon(id: string, cls = 'tile-icon'): string {
  const body = ICONS[id] ?? dot(24, 24, 6);
  return `<svg class="${cls}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
