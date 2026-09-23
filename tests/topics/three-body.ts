import { assert, close } from '../assert.ts';
import * as tb from '../../src/topics/three-body/physics.ts';

type Suite = () => string | void;

const vec = () => new Float64Array(3);
const norm = (a: Float64Array) => Math.hypot(a[0], a[1], a[2]);

export const suites: Record<string, Suite> = {
  'three-body: two-body Kepler orbit (e = 0.5) period matches 2π sqrt(a³/GM) within 1e-4': () => {
    // Bodies 1 and 2 form a Kepler pair. Body 3 is massless and far away, so it does not act on them.
    const s = tb.createSys();
    const m1 = 1;
    const m2 = 0.5;
    const M = m1 + m2;
    const a = 1;
    const e = 0.5;
    const rp = a * (1 - e);
    const vp = Math.sqrt(((1 + e) / (1 - e)) * (tb.G * M) / a);
    s.m.set([m1, m2, 0]);
    // Relative orbit starts at pericentre on +x, moving +y. Split by mass about the COM.
    s.x.set([(-m2 / M) * rp, 0, 0, (m1 / M) * rp, 0, 0, 1000, 0, 0]);
    s.v.set([0, (-m2 / M) * vp, 0, 0, (m1 / M) * vp, 0, 0, 0, 0]);
    const expected = 2 * Math.PI * Math.sqrt((a * a * a) / (tb.G * M));
    const o = { eta: 0.002, hmax: 1e-3, maxSteps: 1 };
    let prevY = 0;
    let prevT = 0;
    let period = NaN;
    let passedHalf = false;
    while (s.t < 2 * expected) {
      prevY = s.x[4] - s.x[1];
      prevT = s.t;
      tb.advanceTo(s, s.t + 1, o);
      const y = s.x[4] - s.x[1];
      if (s.t > expected / 2) passedHalf = true;
      if (passedHalf && prevY < 0 && y >= 0) {
        period = prevT + ((s.t - prevT) * -prevY) / (y - prevY);
        break;
      }
    }
    close(period, expected, 1e-4 * expected, 'period');
    return `T=${period.toFixed(6)} vs ${expected.toFixed(6)} (rel ${(Math.abs(period - expected) / expected).toExponential(1)})`;
  },

  'three-body: figure-eight conserves energy and momentum over 10 periods': () => {
    const s = tb.createSys();
    tb.buildPreset(s, 'figure8', [1, 1, 1]);
    const e0 = tb.energy(s);
    const L0 = vec();
    tb.angularMomentum(s, L0);
    tb.advanceTo(s, 10 * tb.FIG8_PERIOD);
    const dE = Math.abs((tb.energy(s) - e0) / e0);
    const P = vec();
    tb.momentum(s, P);
    const L = vec();
    tb.angularMomentum(s, L);
    const dL = Math.hypot(L[0] - L0[0], L[1] - L0[1], L[2] - L0[2]);
    assert(dE < 1e-8, `energy drift ${dE}`);
    assert(norm(P) < 1e-12, `momentum ${norm(P)}`);
    assert(dL < 1e-10, `angular momentum change ${dL}`);
    return `dE/E ${dE.toExponential(1)}, |P| ${norm(P).toExponential(1)}, dL ${dL.toExponential(1)}`;
  },

  'three-body: figure-eight returns within 1e-3 of its start after one period': () => {
    const s = tb.createSys();
    tb.buildPreset(s, 'figure8', [1, 1, 1]);
    const x0 = s.x.slice();
    tb.advanceTo(s, tb.FIG8_PERIOD);
    let worst = 0;
    for (let i = 0; i < 3; i++) {
      const d = Math.hypot(s.x[i * 3] - x0[i * 3], s.x[i * 3 + 1] - x0[i * 3 + 1], s.x[i * 3 + 2] - x0[i * 3 + 2]);
      worst = Math.max(worst, d);
    }
    assert(worst < 1e-3, `max position error ${worst}`);
    return `max |Δr| = ${worst.toExponential(1)}`;
  },

  'three-body: centre of mass stays fixed through the Pythagorean close encounters': () => {
    const s = tb.createSys();
    tb.buildPreset(s, 'pythagorean', [3, 4, 5]);
    const c = vec();
    tb.centerOfMass(s, c);
    const c0 = norm(c);
    const e0 = tb.energy(s);
    let rmin = Infinity;
    while (s.t < 20) {
      tb.advanceTo(s, s.t + 0.01);
      rmin = Math.min(rmin, tb.minPairDist(s));
    }
    tb.centerOfMass(s, c);
    assert(c0 < 1e-15, `initial COM ${c0}`);
    assert(norm(c) < 1e-10, `COM moved to ${norm(c)}`);
    const dE = Math.abs((tb.energy(s) - e0) / e0);
    assert(dE < 1e-6, `energy drift through encounters ${dE}`);
    return `|COM| ${norm(c).toExponential(1)}, closest approach ${rmin.toExponential(1)}, dE/E ${dE.toExponential(1)}`;
  },

  'three-body: Lagrange triangle rotates rigidly at ω² = GM/a³ for one turn': () => {
    const s = tb.createSys();
    tb.buildPreset(s, 'lagrange', [1, 1, 1]);
    const sides = [tb.pairDist(s, 0, 1), tb.pairDist(s, 0, 2), tb.pairDist(s, 1, 2)];
    const a = sides[0];
    const T = 2 * Math.PI * Math.sqrt((a * a * a) / (tb.G * 3));
    const x0 = s.x.slice();
    tb.advanceTo(s, T);
    const dist = tb.shapeDistortion(s, sides);
    let worst = 0;
    for (let k = 0; k < 9; k++) worst = Math.max(worst, Math.abs(s.x[k] - x0[k]));
    assert(dist < 1e-6 && worst < 1e-6, `distortion ${dist}, return error ${worst}`);
    return `shape error ${dist.toExponential(1)}, return error ${worst.toExponential(1)}`;
  },

  'three-body: Pythagorean problem ends with the lightest body ejected': () => {
    const s = tb.createSys();
    tb.buildPreset(s, 'pythagorean', [3, 4, 5]);
    const far = 4 * tb.sizeScale(s);
    let ej = -1;
    while (s.t < 100 && ej < 0) {
      tb.advanceTo(s, s.t + 0.05);
      ej = tb.ejectedBody(s, far);
    }
    // Known outcome: the mass-3 body leaves and the 4-5 pair forms a binary (Szebehely and Peters 1967).
    assert(ej === 0, `ejected body ${ej} at t=${s.t}`);
    return `body of mass 3 ejected, detected at t=${s.t.toFixed(1)}`;
  },
};
