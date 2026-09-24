import { assert, close } from '../assert.ts';
import * as la from '../../src/topics/least-action/physics.ts';

type Suite = () => string | void;

const N = 60;
const dt = la.T_FLIGHT / N;

function parabola(): Float64Array {
  const ys = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) ys[i] = la.classicalY(i * dt);
  return ys;
}

export const suites: Record<string, Suite> = {
  'least action: parabola has lower discrete action than 500 random perturbations with the same endpoints': () => {
    const base = parabola();
    const s0 = la.discreteAction(base, dt);
    const rnd = la.mulberry32(7);
    const trial = new Float64Array(N + 1);
    let minExcess = Infinity;
    for (let n = 0; n < 500; n++) {
      const amp = 0.001 + rnd() * 1.5;
      const k = 1 + Math.floor(rnd() * 8);
      const ph = rnd() < 0.5 ? 1 : -1;
      let kin = 0;
      for (let i = 0; i <= N; i++) trial[i] = base[i] + ph * amp * Math.sin((k * Math.PI * i) / N) + (i > 0 && i < N ? 0.02 * amp * (rnd() - 0.5) : 0);
      for (let i = 0; i < N; i++) {
        const dd = trial[i + 1] - base[i + 1] - (trial[i] - base[i]);
        kin += (0.5 * la.M * dd * dd) / dt;
      }
      const ex = la.discreteAction(trial, dt) - s0;
      assert(ex > 0, `perturbation ${n} lowered the action by ${-ex}`);
      // Linear potential: the excess is exactly the kinetic energy of the perturbation.
      close(ex, kin, 1e-9 * Math.max(1, kin), 'excess = (m/2) sum (d delta)^2 / dt');
      minExcess = Math.min(minExcess, ex);
    }
    close(s0, la.classicalAction(), 5e-3 * Math.abs(la.classicalAction()), 'discrete S of parabola vs m vx^2 T/2 - m g^2 T^3/24');
    return `S_cl = ${s0.toFixed(4)} J s (analytic ${la.classicalAction().toFixed(4)}), min excess ${minExcess.toExponential(1)}`;
  },

  'least action: gradient descent from a flat path converges to the analytic parabola': () => {
    const ys = new Float64Array(N + 1);
    const grad = new Float64Array(N + 1);
    const eta = la.safeStep(dt);
    let it = 0;
    let g = Infinity;
    while (it < 60000 && g > 1e-10) {
      g = la.descendStep(ys, dt, grad, eta);
      it++;
    }
    let err = 0;
    for (let i = 0; i <= N; i++) err = Math.max(err, Math.abs(ys[i] - la.classicalY(i * dt)));
    assert(err < 1e-8, `max node error ${err}`);
    return `${it} iterations, max error ${err.toExponential(1)} m`;
  },

  'least action: spline handles reproduce a parabola when placed on it': () => {
    const K = 7;
    const ks = new Float64Array(K);
    for (let i = 0; i < K; i++) ks[i] = la.classicalY((i / (K - 1)) * la.T_FLIGHT);
    const out = new Float64Array(N + 1);
    la.splineSample(ks, out, new Float64Array(3 * K));
    let err = 0;
    for (let i = 0; i <= N; i++) err = Math.max(err, Math.abs(out[i] - la.classicalY(i * dt)));
    // A natural spline has zero curvature at the ends, so it is not exact there. Small error only.
    assert(err < 0.05, `spline error ${err}`);
    return `max spline error ${err.toFixed(4)} m`;
  },

  "fermat: the least-time crossing obeys Snell's law n1 sin θ1 = n2 sin θ2": () => {
    const notes: string[] = [];
    for (const n2 of [1, 1.33, 1.5, 2.4]) {
      const g = { xa: -2.6, ya: 2.2, xb: 2.2, yb: -2.0, n1: 1, n2 };
      const x = la.fermatMinimum(g);
      const [t1, t2] = la.rayAngles(x, g);
      close(g.n1 * Math.sin(t1), g.n2 * Math.sin(t2), 1e-9, `Snell at n2=${n2}`);
      const tmin = la.travelTime(x, g);
      for (const dx of [-0.3, -0.01, 0.01, 0.3]) assert(la.travelTime(x + dx, g) > tmin, 'not a minimum');
      notes.push(`n=${n2}: θ1=${((t1 * 180) / Math.PI).toFixed(2)}°, θ2=${((t2 * 180) / Math.PI).toFixed(2)}°`);
    }
    // Equal indices: least time is the straight line.
    const g = { xa: -2, ya: 1, xb: 2, yb: -3, n1: 1.2, n2: 1.2 };
    close(la.fermatMinimum(g), -1, 1e-9, 'straight line when n1 = n2');
    return notes.join(', ');
  },

  'stationary phase: the surviving zone shrinks like sqrt(ħ) and far paths cancel (5 seeds)': () => {
    const n = 4000;
    const dSmax = 4;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    const hbars = [0.4, 0.2, 0.1, 0.05, 0.025, 0.0125];
    const slopes: number[] = [];
    let tailSmall = 0;
    let tailBig = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const e = la.makeEnsemble(n, seed, dSmax);
      // Every path's excess action must match its wiggle exactly.
      for (let j = 0; j < n; j += 97) close(la.wiggleAction(e.cy, e.cz, j * la.MODES, la.MODES), e.dS[j], 1e-9, 'wiggle action');
      const zs = hbars.map((h) => la.pathSumStats(e, h, re, im).zone);
      for (let i = 1; i < zs.length; i++) assert(zs[i] < zs[i - 1], `zone did not shrink: ${zs.join(', ')}`);
      // Least-squares slope of log zone vs log hbar.
      const xs = hbars.map(Math.log);
      const ys = zs.map(Math.log);
      const mx = xs.reduce((a, b) => a + b) / xs.length;
      const my = ys.reduce((a, b) => a + b) / ys.length;
      let num = 0;
      let den = 0;
      xs.forEach((x, i) => {
        num += (x - mx) * (ys[i] - my);
        den += (x - mx) ** 2;
      });
      slopes.push(num / den);
      tailSmall = Math.max(tailSmall, la.pathSumStats(e, 0.0125, re, im).tail);
      tailBig = Math.max(tailBig, la.pathSumStats(e, 2, re, im).tail);
    }
    for (const s of slopes) close(s, 0.5, 0.08, 'log-log slope of zone vs ħ');
    assert(tailSmall < 0.1, `far paths (ρ > 0.5) still give ${tailSmall} of the amplitude at small ħ`);
    assert(tailBig > 0.3, `far paths should matter at large ħ, got ${tailBig}`);
    return `slopes ${slopes.map((s) => s.toFixed(3)).join(', ')}; far share ${tailBig.toFixed(2)} → ${tailSmall.toFixed(3)}`;
  },

  'double slit: the two-slit path sum gives fringes spaced λL/d': () => {
    const g = { L1: 3, L2: 3, d: 0.8, w: 0.005, lambda: 0.01 };
    const sc = new Float64Array(2);
    const I0 = la.twoSlitIntensity(0, g, sc);
    const paraxial = (g.lambda * g.L2) / g.d;
    // Exact geometry: first bright fringe where the two slit-to-screen paths differ by one wavelength.
    const diff = (y: number) => Math.hypot(g.L2, y + g.d / 2) - Math.hypot(g.L2, y - g.d / 2);
    let lo = 0;
    let hi = 2 * paraxial;
    for (let i = 0; i < 100; i++) {
      const mid = (lo + hi) / 2;
      if (diff(mid) < g.lambda) lo = mid;
      else hi = mid;
    }
    const expected = lo;
    let best = 0;
    let yBest = 0;
    for (let y = 0.5 * expected; y < 1.5 * expected; y += expected / 4000) {
      const I = la.twoSlitIntensity(y, g, sc);
      if (I > best) {
        best = I;
        yBest = y;
      }
    }
    close(yBest, expected, 0.003 * expected, 'fringe position vs one-wavelength path difference');
    close(yBest, paraxial, 0.02 * paraxial, 'fringe spacing vs λL/d');
    const Idark = la.twoSlitIntensity(0.5 * expected, g, sc);
    assert(Idark < 0.01 * I0, `dark fringe not dark: ${Idark / I0}`);
    close(I0, 4 * la.twoSlitIncoherent(0, g, sc) / 2, 1e-6, 'bright centre is twice the no-interference value');
    return `spacing ${yBest.toFixed(5)} vs exact ${expected.toFixed(5)}, λL/d = ${paraxial.toFixed(5)}, dark/bright ${(Idark / I0).toExponential(1)}`;
  },
};
