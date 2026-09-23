import { assert, close } from '../assert.ts';
import * as sl from '../../src/topics/solitons/physics.ts';

type Suite = () => string | void;

const L = sl.GRID_L;

function maxErr(s: sl.KdV, f: (x: number) => number): number {
  let e = 0;
  for (let j = 0; j < s.n; j++) e = Math.max(e, Math.abs(s.u[j] - f(s.x[j])));
  return e;
}

export const suites: Record<string, Suite> = {
  'solitons: real FFT pair matches the complex FFT': () => {
    const n = 64;
    const x = new Float64Array(n);
    for (let j = 0; j < n; j++) x[j] = Math.sin(0.3 * j * j) + 0.2 * Math.cos(1.7 * j);
    const re = x.slice();
    const im = new Float64Array(n);
    sl.fft(re, im);
    const R = new Float64Array(n / 2 + 1);
    const I = new Float64Array(n / 2 + 1);
    sl.rfft(x, R, I);
    let e = 0;
    for (let k = 0; k <= n / 2; k++) e = Math.max(e, Math.abs(R[k] - re[k]), Math.abs(I[k] - im[k]));
    const back = new Float64Array(n);
    sl.irfft(R, I, back);
    for (let j = 0; j < n; j++) e = Math.max(e, Math.abs(back[j] - x[j]));
    assert(e < 1e-12, `max error ${e}`);
    return `max error ${e.toExponential(1)}`;
  },
  'solitons: exact one-soliton (A=1.5) stays within 1% after 1.5 laps (t=50)': () => {
    const A = 1.5;
    const s = new sl.KdV();
    s.setSolitons([{ A, x0: -20 }]);
    s.step(Math.round(50 / s.dt));
    s.sync();
    const e = maxErr(s, (x) => sl.periodicSoliton(x, s.t, A, -20, L)) / A;
    assert(e < 0.01, `relative error ${e}`);
    return `max error ${(e * 100).toFixed(3)}% of A`;
  },
  'solitons: mass, energy and the cubic invariant are conserved through a collision': () => {
    const s = new sl.KdV();
    s.setSolitons([{ A: 1.2, x0: -35 }, { A: 0.3, x0: -15 }]);
    const m0 = s.mass();
    const e0 = s.energy();
    const h0 = s.hamiltonian();
    // Analytic values for well-separated solitons: mass 2 sqrt(2A), energy (2/3)(2A)^{3/2}.
    const mA = 2 * Math.sqrt(2.4) + 2 * Math.sqrt(0.6);
    const eA = (2 / 3) * (2.4 ** 1.5 + 0.6 ** 1.5);
    close(m0, mA, 1e-6 * mA, 'initial mass');
    close(e0, eA, 1e-6 * eA, 'initial energy');
    s.step(Math.round(25 / s.dt)); // collision at t = 20/1.8 = 11.1
    s.sync();
    const dm = Math.abs(s.mass() / m0 - 1);
    const de = Math.abs(s.energy() / e0 - 1);
    const dh = Math.abs(s.hamiltonian() / h0 - 1);
    assert(dm < 1e-10 && de < 1e-5 && dh < 1e-5, `drifts ${dm} ${de} ${dh}`);
    return `mass ${dm.toExponential(1)}, energy ${de.toExponential(1)}, cubic ${dh.toExponential(1)}`;
  },
  'solitons: crest speed equals twice the peak height': () => {
    const out = new Float64Array(4);
    const res: string[] = [];
    for (const A of [0.3, 0.8, 1.4]) {
      const s = new sl.KdV();
      s.setSolitons([{ A, x0: 0 }]);
      const T = 10;
      s.step(Math.round(T / s.dt));
      s.sync();
      s.peaks(0.05, 5, out);
      const c = sl.wrap(out[0] - 0, L) / s.t;
      close(c, 2 * A, 2e-3 * 2 * A, `speed at A=${A}`);
      close(out[1], A, 2e-3 * A, `height at A=${A}`);
      res.push(`A=${A}: c=${c.toFixed(4)}`);
    }
    return res.join(', ');
  },
  'solitons: two-soliton phase shifts match 2/k ln((k1+k2)/(k1-k2))': () => {
    const res: string[] = [];
    for (const [A1, A2] of [[1.2, 0.3], [0.9, 0.5]]) {
      const x1 = -30, x2 = -10;
      const s = new sl.KdV();
      s.setSolitons([{ A: A1, x0: x1 }, { A: A2, x0: x2 }]);
      const tc = (x2 - x1) / (2 * A1 - 2 * A2);
      // Run until they are ~30 units apart again.
      s.step(Math.round((tc + 30 / (2 * A1 - 2 * A2)) / s.dt));
      s.sync();
      const out = new Float64Array(4);
      const n = s.peaks(0.1, 10, out);
      assert(n === 2, 'expected two separated peaks');
      const [d1, d2] = sl.phaseShifts(A1, A2);
      const m1 = sl.wrap(out[0] - (x1 + 2 * A1 * s.t), L);
      const m2 = sl.wrap(out[2] - (x2 + 2 * A2 * s.t), L);
      close(m1, d1, 0.02 * Math.abs(d1), `shift of taller (A=${A1})`);
      close(m2, d2, 0.02 * Math.abs(d2), `shift of smaller (A=${A2})`);
      close(out[1], A1, 0.01 * A1, 'taller height after');
      close(out[3], A2, 0.01 * A2, 'smaller height after');
      res.push(`(${A1},${A2}): ${m1.toFixed(3)}/${d1.toFixed(3)}, ${m2.toFixed(3)}/${d2.toFixed(3)}`);
    }
    return res.join('  ');
  },
  'solitons: solver reproduces the exact Hirota two-soliton at mid-collision': () => {
    const s = new sl.KdV();
    const u0 = new Float64Array(s.n);
    const T0 = 15;
    for (let j = 0; j < s.n; j++) u0[j] = sl.twoSoliton(s.x[j], -T0, 1.2, 0, 0.4, 0);
    s.setField(u0);
    s.step(Math.round(T0 / s.dt));
    s.sync();
    const e = maxErr(s, (x) => sl.twoSoliton(x, 0, 1.2, 0, 0.4, 0)) / 1.2;
    assert(e < 1e-3, `relative error ${e}`);
    return `max error ${e.toExponential(1)} of A1`;
  },
  'solitons: linear mode follows exp(i k^3 t) and a pulse disperses': () => {
    const s = new sl.KdV();
    s.linear = true;
    const k = (2 * Math.PI * 5) / L;
    const u0 = new Float64Array(s.n);
    for (let j = 0; j < s.n; j++) u0[j] = Math.cos(k * s.x[j]);
    s.setField(u0);
    s.step(1000);
    s.sync();
    // u_t + u_xxx = 0 gives cos(k x + k^3 t).
    const e = maxErr(s, (x) => Math.cos(k * x + k ** 3 * s.t));
    assert(e < 1e-9, `mode error ${e}`);
    const p = new sl.KdV();
    p.linear = true;
    p.setSolitons([{ A: 1.2, x0: 0 }]);
    const m0 = p.mass();
    const e0 = p.energy();
    p.step(Math.round(10 / p.dt));
    p.sync();
    const ratio = p.maxU() / 1.2;
    assert(ratio < 0.5, `peak ratio ${ratio}`);
    close(p.mass(), m0, 1e-9, 'linear mass');
    close(p.energy(), e0, 1e-9 * e0, 'linear energy');
    return `mode error ${e.toExponential(1)}, pulse peak after t=10: ${(ratio * 100).toFixed(0)}%`;
  },
};
