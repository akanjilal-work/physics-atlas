import { assert, close } from '../assert.ts';
import * as sl from '../../src/topics/string-landscape/physics.ts';

type Suite = () => string | void;

export const suites: Record<string, Suite> = {
  'string-landscape: thin-wall B = 27π²σ⁴/(2ε³) is the stationary point of B(R) and scales as σ⁴/ε³': () => {
    // Analytic value at σ = ε = 1.
    close(sl.thinWallB(1, 1), (27 * Math.PI * Math.PI) / 2, 1e-12, 'B(1,1)');
    // Scaling: doubling σ multiplies B by 16, doubling ε divides it by 8.
    for (const [s, e] of [[0.3, 0.9], [0.7, 0.2], [1.2, 1.5]]) {
      close(sl.thinWallB(2 * s, e) / sl.thinWallB(s, e), 16, 1e-12, 'σ⁴ scaling');
      close(sl.thinWallB(s, 2 * e) / sl.thinWallB(s, e), 1 / 8, 1e-12, 'ε⁻³ scaling');
    }
    // Independent check: maximise B(R) = -½π²εR⁴ + 2π²σR³ numerically (golden section).
    let worst = 0;
    for (const [s, e] of [[0.5, 0.9], [0.3, 0.4], [1, 2]]) {
      let a = 0;
      let b = (8 * s) / e;
      const g = (Math.sqrt(5) - 1) / 2;
      for (let i = 0; i < 200; i++) {
        const c = b - g * (b - a);
        const d = a + g * (b - a);
        if (sl.bubbleAction(c, s, e) > sl.bubbleAction(d, s, e)) b = d;
        else a = c;
      }
      const R = (a + b) / 2;
      close(R, sl.criticalRadius(s, e), 1e-6, 'R₀ = 3σ/ε');
      const rel = Math.abs(sl.bubbleAction(R, s, e) / sl.thinWallB(s, e) - 1);
      worst = Math.max(worst, rel);
      assert(rel < 1e-10, `B(R₀) mismatch ${rel}`);
    }
    return `max |B(R*)/B_formula − 1| = ${worst.toExponential(1)}`;
  },

  'string-landscape: every minimum found has zero gradient and a positive definite Hessian': () => {
    // A single well at the origin: the minimum must sit exactly at (0, 0) with V = v0 - A.
    const one: sl.Landscape = { wells: [{ cx: 0, cy: 0, A: 1.2, s: 0.6 }], v0: 0.75, bowl: 0.03, L: 5 };
    const m1 = sl.findMinima(one);
    assert(m1.length === 1, `single well gave ${m1.length} minima`);
    close(m1[0].x, 0, 1e-9, 'x');
    close(m1[0].y, 0, 1e-9, 'y');
    close(m1[0].V, 0.75 - 1.2, 1e-12, 'V');
    // Random landscapes: check with finite differences, independent of the analytic derivatives.
    let total = 0;
    let worstG = 0;
    const h = 1e-4;
    for (const seed of [1, 2, 3, 7, 42]) {
      for (const n of [6, 12, 20]) {
        const land = sl.makeLandscape(seed, n);
        const mins = sl.findMinima(land);
        assert(mins.length >= 3, `seed ${seed}: only ${mins.length} minima`);
        for (const m of mins) {
          const V = (x: number, y: number) => sl.potential(land, x, y);
          const gx = (V(m.x + h, m.y) - V(m.x - h, m.y)) / (2 * h);
          const gy = (V(m.x, m.y + h) - V(m.x, m.y - h)) / (2 * h);
          const hxx = (V(m.x + h, m.y) - 2 * V(m.x, m.y) + V(m.x - h, m.y)) / (h * h);
          const hyy = (V(m.x, m.y + h) - 2 * V(m.x, m.y) + V(m.x, m.y - h)) / (h * h);
          const hxy = (V(m.x + h, m.y + h) - V(m.x + h, m.y - h) - V(m.x - h, m.y + h) + V(m.x - h, m.y - h)) / (4 * h * h);
          const g = Math.hypot(gx, gy);
          worstG = Math.max(worstG, g);
          assert(g < 1e-7, `gradient ${g} at a claimed minimum`);
          assert(hxx > 0 && hxx * hyy - hxy * hxy > 0, 'Hessian not positive definite');
          // Every nearby point must be higher.
          for (let k = 0; k < 8; k++) {
            const a = (k * Math.PI) / 4;
            assert(V(m.x + 0.01 * Math.cos(a), m.y + 0.01 * Math.sin(a)) > m.V, 'a neighbour is lower');
          }
          total++;
        }
      }
    }
    return `${total} minima, max finite-difference |∇V| = ${worstG.toExponential(1)}`;
  },

  'string-landscape: flux Λ histogram (weighted k-enumeration) matches brute force exactly': () => {
    let checked = 0;
    for (const seed of [1, 5, 9]) {
      for (const scale of [0.3, 0.45, 0.8]) {
        const q = sl.makeCharges(seed, scale);
        for (let J = 1; J <= 6; J++) {
          const p: sl.FluxParams = { J, q, lam0: sl.LAMBDA0, N: sl.FLUX_N };
          const [lo, hi] = sl.histRange(p);
          const a = sl.histogramBrute(p, 48, lo, hi + 1e-9);
          const b = sl.histogramFast(p, 48, lo, hi + 1e-9);
          const sum = b.counts.reduce((s, c) => s + c, 0);
          assert(sum === sl.vacuumCount(p), `total ${sum} vs ${sl.vacuumCount(p)}`);
          for (let i = 0; i < 48; i++) assert(a.counts[i] === b.counts[i], `bin ${i}: ${a.counts[i]} vs ${b.counts[i]}`);
          let brute = 0;
          sl.forEachVacuum(p, (_i, _n, lam) => {
            if (Math.abs(lam) < sl.NEAR_ZERO) brute++;
          });
          assert(brute === sl.countNearZero(p, sl.NEAR_ZERO), 'near-zero count');
          checked++;
        }
      }
    }
    // A hand-countable case: J = 2, q = (1, 1), Λ₀ = -1, n ∈ {-2..2}. Λ = -1 + (n1² + n2²)/2.
    const p: sl.FluxParams = { J: 2, q: [1, 1], lam0: -1, N: 2 };
    // n1² + n2² = 2 exactly gives Λ = 0: (±1, ±1), four vacua.
    assert(sl.countNearZero(p, 1e-9) === 4, 'four exact zeros');
    return `${checked} (J, q) cases, all bins equal`;
  },

  'string-landscape: fraction of vacua with |Λ| < 0.1 grows with the number of fluxes J': () => {
    const q = sl.makeCharges(1, 0.45);
    const f: number[] = [];
    let prevMin = Infinity;
    for (let J = 1; J <= 7; J++) {
      const p: sl.FluxParams = { J, q, lam0: sl.LAMBDA0, N: sl.FLUX_N };
      f.push(sl.fractionNearZero(p, sl.NEAR_ZERO));
      let mn = Infinity;
      sl.forEachVacuum(p, (_i, _n, lam) => (mn = Math.min(mn, Math.abs(lam))));
      assert(mn <= prevMin + 1e-12, 'smallest |Λ| should not grow when a flux is added');
      prevMin = mn;
    }
    for (let J = 1; J < 7; J++) assert(f[J] >= f[J - 1], `fraction fell from J=${J} to J=${J + 1}`);
    assert(f[2] === 0 && f[6] > 0.05, 'few fluxes cannot reach zero, many can');
    return f.map((x, i) => `J=${i + 1}: ${(x * 100).toFixed(1)}%`).join(', ');
  },

  'string-landscape: bubble wall follows r² − t² = R₀² and approaches the speed of light': () => {
    const R0 = sl.criticalRadius(0.4, 0.6);
    close(R0, 2, 1e-12, 'R₀');
    for (const t of [0, 0.5, 3, 20]) {
      const r = sl.wallRadius(R0, t);
      close(r * r - t * t, R0 * R0, 1e-9, 'hyperbola');
      // Speed from a finite difference agrees with the closed form.
      const v = (sl.wallRadius(R0, t + 1e-6) - sl.wallRadius(R0, t - 1e-6)) / 2e-6;
      close(v, sl.wallSpeed(R0, t), 1e-6, 'speed');
    }
    assert(sl.wallSpeed(R0, 100 * R0) > 0.9999, 'late-time wall speed near c');
    assert(sl.wallSpeed(R0, 0) === 0, 'wall starts at rest');
    return `v(10 R₀) = ${sl.wallSpeed(R0, 10 * R0).toFixed(4)} c`;
  },
};
