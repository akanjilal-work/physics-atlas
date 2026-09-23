import { assert, close } from '../assert.ts';
import * as dp from '../../src/topics/double-pendulum/physics.ts';

type Suite = () => string | void;

export const suites: Record<string, Suite> = {
  'double pendulum: energy conserved over 20 s (RK4, h=1ms)': () => {
    const p = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81, damping: 0 };
    let s: dp.DPState = [2.1, 0, 2.1, 0];
    const e0 = dp.energy(s, p);
    for (let i = 0; i < 20000; i++) s = dp.rk4(s, p, 1e-3);
    const drift = Math.abs((dp.energy(s, p) - e0) / e0);
    assert(drift < 1e-6, `relative drift ${drift}`);
    return `drift ${drift.toExponential(1)}`;
  },
  'double pendulum: small-angle in-phase mode frequency matches sqrt((2-sqrt2) g/l)': () => {
    const p = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81, damping: 0 };
    const a = 0.01;
    let s: dp.DPState = [a, 0, a * Math.SQRT2, 0];
    let t = 0;
    let prev = s[0];
    const crossings: number[] = [];
    while (crossings.length < 5) {
      s = dp.rk4(s, p, 1e-4);
      t += 1e-4;
      if (prev > 0 && s[0] <= 0) crossings.push(t);
      prev = s[0];
    }
    const period = (crossings[4] - crossings[0]) / 4;
    const expected = (2 * Math.PI) / Math.sqrt((2 - Math.SQRT2) * 9.81);
    close(period, expected, 1e-3, 'period');
    return `T=${period.toFixed(4)} s`;
  },
  'double pendulum: chaotic divergence from 1e-6 nudge at 120°': () => {
    const p = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81, damping: 0 };
    const th = (120 * Math.PI) / 180;
    let a: dp.DPState = [th, 0, th, 0];
    let b: dp.DPState = [th, 0, th + 1e-6, 0];
    let t = 0;
    while (t < 30) {
      a = dp.rk4(a, p, 1e-3);
      b = dp.rk4(b, p, 1e-3);
      t += 1e-3;
      if (Math.abs(dp.wrap(a[2] - b[2])) > 1) break;
    }
    assert(t < 30, 'did not diverge within 30 s');
    return `diverged at t=${t.toFixed(1)} s`;
  },
};
