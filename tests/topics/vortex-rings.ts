import { assert, close } from '../assert.ts';
import * as vr from '../../src/topics/vortex-rings/physics.ts';

type Suite = () => string | void;

/** Axial speed of a lone ring measured over a short run. */
function ringSpeed(gamma: number, R: number, a: number, N: number, correct: boolean): number {
  const s = vr.buildPreset('single', { gamma, R, a, sep: 1 }, N);
  s.correct = correct;
  const z0 = s.axialZ(0);
  const h = vr.stepSize(gamma, (2 * Math.PI * R) / N);
  const n = Math.max(4, Math.round(0.3 / (Math.abs(gamma) * h)));
  for (let i = 0; i < n; i++) s.step(h);
  return (s.axialZ(0) - z0) / s.t;
}

export const suites: Record<string, Suite> = {
  'vortex rings: fine filament matches Kelvin U = Γ/(4πR)(ln 8R/a − 1/4) within 5%': () => {
    // Plain Rosenhead-Moore sum, no polygon correction, 256 points.
    const notes: string[] = [];
    for (const a of [0.1, 0.2]) {
      const U = ringSpeed(1, 1, a, 256, false);
      const K = vr.kelvinSpeed(1, 1, a);
      const err = Math.abs(U / K - 1);
      assert(err < 0.05, `a=${a}: U=${U}, Kelvin ${K}, error ${err}`);
      notes.push(`a=${a}: ${(err * 100).toFixed(2)}%`);
    }
    return notes.join(', ');
  },
  'vortex rings: scene resolution (96 points, corrected) matches Kelvin within 1%': () => {
    const notes: string[] = [];
    for (const [R, a] of [[1, 0.03], [1, 0.1], [0.6, 0.15], [1.4, 0.25]]) {
      const U = ringSpeed(1, R, a, 96, true);
      const K = vr.kelvinSpeed(1, R, a);
      const err = Math.abs(U / K - 1);
      assert(err < 0.01, `R=${R} a=${a}: U=${U}, Kelvin ${K}`);
      notes.push(`${(err * 100).toFixed(2)}%`);
    }
    return notes.join(', ');
  },
  'vortex rings: ring speed is linear in Γ': () => {
    const u1 = ringSpeed(1, 1, 0.1, 96, true);
    for (const g of [0.5, 2, 3]) {
      const ug = ringSpeed(g, 1, 0.1, 96, true);
      close(ug / (g * u1), 1, 1e-4, `U(${g}Γ) / (${g} U(Γ))`);
    }
    // A reversed circulation reverses the motion.
    close(ringSpeed(-1, 1, 0.1, 96, true), -u1, 1e-9, 'U(−Γ)');
    return `U/Γ = ${u1.toFixed(4)}`;
  },
  'vortex rings: straight segment Biot–Savart sum matches the analytic segment formula': () => {
    // Segment from (-1,0,0) to (2,0,0), field point off to the side.
    const n = 4001;
    const pts = new Float64Array(3 * n);
    for (let i = 0; i < n; i++) pts[3 * i] = -1 + (3 * i) / (n - 1);
    const num = new Float64Array(3);
    const ana = new Float64Array(3);
    const notes: string[] = [];
    for (const [px, py, pz] of [[0.3, 0.5, 0], [-1.5, 0.2, 0.4], [2.5, -0.7, 0.1]]) {
      vr.polylineVelocity(1.7, pts, n, false, 0, px, py, pz, num);
      vr.segmentVelocity(1.7, -1, 0, 0, 2, 0, 0, px, py, pz, ana);
      const m = Math.hypot(ana[0], ana[1], ana[2]);
      const e = Math.hypot(num[0] - ana[0], num[1] - ana[1], num[2] - ana[2]) / m;
      assert(e < 1e-5, `relative error ${e} at (${px},${py},${pz})`);
      notes.push(e.toExponential(0));
    }
    // A very long segment tends to the infinite line, |u| = Γ/(2πh).
    vr.segmentVelocity(1, -1e5, 0, 0, 1e5, 0, 0, 0, 0.5, 0, ana);
    close(ana[2], 1 / (2 * Math.PI * 0.5), 1e-8, 'infinite line limit');
    return `errors ${notes.join(', ')}`;
  },
  'vortex rings: impulse Γπ(R₁² + R₂²) conserved while two rings leapfrog': () => {
    const s = vr.buildPreset('leapfrog', { gamma: 1, R: 1, a: 0.1, sep: 0.8 }, 64);
    const P0 = new Float64Array(3);
    const P = new Float64Array(3);
    s.impulse(P0);
    // Polygon impulse vs the circle formula (inscribed 64-gon area).
    const poly = (64 / 2) * Math.sin((2 * Math.PI) / 64);
    close(P0[2], 2 * poly, 1e-9, 'initial impulse');
    let order = Math.sign(s.axialZ(1) - s.axialZ(0));
    let passes = 0;
    let worst = 0;
    const h = 0.04;
    for (let i = 0; i < 25 / h; i++) {
      s.step(h);
      const o = Math.sign(s.axialZ(1) - s.axialZ(0));
      if (o !== order) {
        passes++;
        order = o;
      }
      s.impulse(P);
      worst = Math.max(worst, Math.abs(P[2] / P0[2] - 1));
    }
    assert(passes >= 4, `only ${passes} pass-throughs in 25 time units`);
    assert(worst < 2e-3, `impulse drift ${worst}`);
    assert(Math.abs(P[0]) + Math.abs(P[1]) < 1e-9, 'sideways impulse appeared');
    return `${passes} passes, max drift ${worst.toExponential(1)}`;
  },
  'vortex rings: wall image run equals half of a head-on collision': () => {
    const p = { gamma: 1, R: 1, a: 0.1, sep: 3 };
    const c = vr.buildPreset('collision', p, 64);
    const w = vr.buildPreset('wall', { ...p, sep: 1.5 }, 64);
    const h = 0.04;
    for (let i = 0; i < 125; i++) {
      c.step(h);
      w.step(h);
    }
    let d = 0;
    for (let i = 0; i < 3 * 64; i++) d = Math.max(d, Math.abs(c.pos[i] - w.pos[i]));
    assert(d < 1e-9, `max difference ${d}`);
    // By t = 5 the ring has slowed and grown as it meets its mirror image.
    const R = w.radius(0);
    assert(R > 1.25, `radius only ${R}`);
    assert(w.axialZ(0) < 0, 'ring crossed the wall');
    return `R(5) = ${R.toFixed(3)}, diff ${d.toExponential(0)}`;
  },
};
