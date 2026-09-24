import { assert, close } from '../assert.ts';
import * as sb from '../../src/topics/symmetry-breaking/physics.ts';

type Suite = () => string | void;

const base = (over: Partial<sb.HatParams> = {}): sb.HatParams => ({ mu2: 1.3, lambda: 0.7, T: 0, c: 1, ...over });

export const suites: Record<string, Suite> = {
  'symmetry breaking: minimum of V sits at |φ| = √(μ²/2λ), v = √(μ²/λ)': () => {
    const p = base();
    // brute-force search along the radius
    let best = 0;
    let vb = Infinity;
    for (let i = 0; i <= 200000; i++) {
      const r = (i / 200000) * 3;
      const v = sb.potentialT(p, r);
      if (v < vb) { vb = v; best = r; }
    }
    const expected = Math.sqrt(p.mu2 / (2 * p.lambda));
    close(best, expected, 2e-5, 'argmin |φ|');
    close(sb.phiMin(p), expected, 1e-12, 'phiMin');
    close(sb.vev(p), Math.sqrt(p.mu2 / p.lambda), 1e-12, 'vev');
    close(vb, -(p.mu2 * p.mu2) / (4 * p.lambda), 1e-9, 'depth −μ⁴/4λ');
    return `|φ|min=${best.toFixed(5)}, v=${sb.vev(p).toFixed(5)}`;
  },
  'symmetry breaking: radial curvature at the rim gives m_H² = 2μ²': () => {
    const p = base();
    const r0 = sb.phiMin(p);
    const a = 0.7;
    const c = sb.curvatures(p, r0 * Math.cos(a), r0 * Math.sin(a));
    close(c.radial, 2 * p.mu2, 1e-4, 'radial mass²');
    close(sb.modeMasses(p).radial, Math.sqrt(2 * p.mu2), 1e-12, 'modeMasses');
    return `m_r² = ${c.radial.toFixed(6)} (2μ² = ${(2 * p.mu2).toFixed(6)})`;
  },
  'symmetry breaking: Goldstone direction along the rim has zero curvature': () => {
    const p = base();
    const r0 = sb.phiMin(p);
    let worst = 0;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * 2 * Math.PI;
      const c = sb.curvatures(p, r0 * Math.cos(a), r0 * Math.sin(a));
      worst = Math.max(worst, Math.abs(c.angular));
    }
    assert(worst < 1e-5, `angular curvature ${worst}`);
    // The tangential force also vanishes everywhere (V depends only on |φ|).
    const g: [number, number] = [0, 0];
    sb.gradV(p, 0.3, 0.8, g);
    const tang = -0.8 * g[0] + 0.3 * g[1];
    close(tang, 0, 1e-12, 'tangential gradient');
    return `max |m_G²| = ${worst.toExponential(1)}`;
  },
  'symmetry breaking: ball oscillation frequency on the rim equals m_H = √(2μ²)': () => {
    const p = base();
    const r0 = sb.phiMin(p);
    const s = new Float64Array([r0 * 1.01, 0, 0, 0]);
    const h = 1e-3;
    const e0 = sb.hatEnergy(s, p);
    let prev = s[0] - r0;
    const cross: number[] = [];
    let t = 0;
    while (cross.length < 6) {
      sb.stepHat(s, p, 0, h);
      t += h;
      const d = s[0] - r0;
      if (prev < 0 && d >= 0) cross.push(t - (h * d) / (d - prev));
      prev = d;
    }
    const period = (cross[5] - cross[0]) / 5;
    const omega = (2 * Math.PI) / period;
    close(omega, Math.sqrt(2 * p.mu2), 2e-3, 'ω');
    const drift = Math.abs(sb.hatEnergy(s, p) - e0) / Math.abs(e0);
    assert(drift < 1e-9, `energy drift ${drift}`);
    return `ω = ${omega.toFixed(4)}, drift ${drift.toExponential(1)}`;
  },
  'symmetry breaking: T_c = √(μ²/c) from the finite-T potential': () => {
    const mu2 = 1.3;
    const c = 0.45;
    const Tc = sb.criticalT(mu2, c);
    close(Tc, Math.sqrt(mu2 / c), 1e-12, 'formula');
    const curv0 = (T: number) => sb.curvatures(base({ mu2, c, T }), 0, 0).radial;
    assert(curv0(Tc * 0.99) < 0, 'origin should be unstable just below T_c');
    assert(curv0(Tc * 1.01) > 0, 'origin should be stable just above T_c');
    assert(sb.phiMin(base({ mu2, c, T: Tc * 1.01 })) === 0, 'no ring above T_c');
    // Order parameter vanishes like (T_c − T)^(1/2) (mean-field β = 1/2).
    const r1 = sb.phiMin(base({ mu2, c, T: Tc * (1 - 1e-4) }));
    const r2 = sb.phiMin(base({ mu2, c, T: Tc * (1 - 4e-4) }));
    close(r2 / r1, 2, 1e-3, 'β = 1/2 scaling');
    // Above T_c both modes share mass² = cT² − μ².
    const m = sb.modeMasses(base({ mu2, c, T: 2 * Tc }));
    close(m.radial * m.radial, c * 4 * Tc * Tc - mu2, 1e-12, 'symmetric mass');
    close(m.goldstone, m.radial, 1e-12, 'degenerate');
    return `T_c = ${Tc.toFixed(4)}`;
  },
  'symmetry breaking: vortex counter on synthetic winding fields': () => {
    const L = 32;
    const th = new Float64Array(L * L);
    const fill = (f: (x: number, y: number) => number) => {
      for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) th[y * L + x] = sb.wrapAngle(f(x, y));
    };
    fill((x, y) => Math.atan2(y - 15.5, x - 15.5));
    let c = sb.countVortices(th, L, false);
    assert(c.plus === 1 && c.minus === 0, `single vortex: ${JSON.stringify(c)}`);
    fill((x, y) => -Math.atan2(y - 10.5, x - 20.5));
    c = sb.countVortices(th, L, false);
    assert(c.plus === 0 && c.minus === 1, `antivortex: ${JSON.stringify(c)}`);
    fill((x, y) => Math.atan2(y - 15.5, x - 8.5) - Math.atan2(y - 15.5, x - 22.5));
    c = sb.countVortices(th, L, false);
    assert(c.plus === 1 && c.minus === 1 && c.net === 0, `pair: ${JSON.stringify(c)}`);
    fill((x, y) => Math.atan2(y - 8.5, x - 8.5) + Math.atan2(y - 22.5, x - 20.5));
    c = sb.countVortices(th, L, false);
    assert(c.plus === 2 && c.minus === 0 && c.net === 2, `two vortices: ${JSON.stringify(c)}`);
    fill((x) => 0.3 * x);
    c = sb.countVortices(th, L, true);
    assert(c.plus === 0 && c.minus === 0, `smooth field: ${JSON.stringify(c)}`);
    // Random phases: a plaquette winds with probability exactly 1/3, net charge 0 on a torus.
    const big = new sb.XYLattice(256, 11);
    const r = sb.countVortices(big.theta, 256, true);
    const frac = (r.plus + r.minus) / (256 * 256);
    close(frac, 1 / 3, 0.01, 'random-phase vortex density');
    assert(r.net === 0, `net charge ${r.net}`);
    return `random density ${frac.toFixed(4)} (1/3)`;
  },
  'symmetry breaking: elastica buckles at P_c and its ends meet at P/P_c ≈ 2.18': () => {
    close(sb.loadForSlope(0), 1, 1e-12, 'Euler load');
    // Small-slope expansion P/P_c = 1 + α²/8
    const a = 0.02;
    close((sb.loadForSlope(a) - 1) / (a * a), 1 / 8, 1e-4, 'post-buckling slope');
    let lo = 0.5;
    let hi = 0.99;
    for (let i = 0; i < 60; i++) {
      const m = 0.5 * (lo + hi);
      const { K, E } = sb.ellipticKE(m);
      if (2 * E - K > 0) lo = m; else hi = m;
    }
    const alpha = 2 * Math.asin(lo);
    close(sb.elasticaShape(alpha).span, 0, 1e-9, 'span');
    const p = sb.loadForSlope(alpha);
    close(p, 2.1834, 2e-3, 'load when ends touch');
    close(sb.slopeForLoad(p), alpha, 1e-9, 'inverse');
    return `ends meet at α = ${((alpha * 180) / Math.PI).toFixed(1)}°, P/P_c = ${p.toFixed(4)}`;
  },
};
