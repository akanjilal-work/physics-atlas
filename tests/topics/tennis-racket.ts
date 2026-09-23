import { assert, close } from '../assert.ts';
import * as tr from '../../src/topics/tennis-racket/physics.ts';

type Suite = () => string | void;

const T_HANDLE = tr.massProps(tr.presetParts('thandle')).I;

/** Integrate from a fresh initial state, calling visit after every step. */
function run(I: tr.Inertia, axis: 0 | 1 | 2, Omega: number, eps: number, h: number, tEnd: number, visit: (s: tr.State, t: number) => void): tr.State {
  const s = tr.initialState(I, axis, Omega, eps, tr.newState());
  const integ = new tr.Integrator(I);
  const n = Math.round(tEnd / h);
  for (let k = 1; k <= n; k++) {
    integ.step(s, h);
    visit(s, k * h);
  }
  return s;
}

export const suites: Record<string, Suite> = {
  'tennis racket: E, |L| and world L conserved over 200 s through many flips (RK4, h=0.5ms)': () => {
    const I = T_HANDLE;
    const s0 = tr.initialState(I, 1, 6, 1e-2, tr.newState());
    const e0 = tr.energy(I, s0);
    const l0 = tr.angMomMag(I, s0);
    const L0 = tr.angMomWorld(I, s0, [0, 0, 0]);
    let flips = 0;
    let sign = 1;
    const s = run(I, 1, 6, 1e-2, 5e-4, 200, (st) => {
      const u = (I[1] * st[1]) / l0;
      if (sign > 0 && u < -0.5) { sign = -1; flips++; }
      if (sign < 0 && u > 0.5) { sign = 1; flips++; }
    });
    const dE = Math.abs(tr.energy(I, s) / e0 - 1);
    const dL = Math.abs(tr.angMomMag(I, s) / l0 - 1);
    const Lw = tr.angMomWorld(I, s, [0, 0, 0]);
    const dLw = Math.hypot(Lw[0] - L0[0], Lw[1] - L0[1], Lw[2] - L0[2]) / l0;
    assert(flips > 50, `expected many flips, got ${flips}`);
    assert(dE < 1e-6, `energy drift ${dE}`);
    assert(dL < 1e-6, `|L| drift ${dL}`);
    assert(dLw < 1e-6, `world L drift ${dLw}`);
    return `${flips} flips, dE ${dE.toExponential(1)}, d|L| ${dL.toExponential(1)}, dL_world ${dLw.toExponential(1)}`;
  },
  'tennis racket: axes 1 and 3 stay stable under a 1e-2 perturbation for 100 s': () => {
    const notes: string[] = [];
    for (const axis of [0, 2] as const) {
      let maxOff = 0;
      run(T_HANDLE, axis, 6, 1e-2, 1e-3, 100, (s) => {
        const off = Math.hypot(s[(axis + 1) % 3], s[(axis + 2) % 3]) / 6;
        if (off > maxOff) maxOff = off;
      });
      // The linear theory gives a bounded wobble of order a few times eps.
      assert(maxOff < 0.05, `axis ${axis + 1}: off-axis spin grew to ${maxOff}`);
      notes.push(`axis ${axis + 1} max off-axis ${maxOff.toExponential(1)}`);
    }
    return notes.join(', ');
  },
  'tennis racket: axis-2 perturbation grows at sigma = Omega sqrt((I2-I1)(I3-I2)/(I1 I3)) within 5%': () => {
    const I = T_HANDLE;
    const Omega = 6;
    const sig = tr.sigma(I, Omega);
    // Sample |w1| at two times in the linear phase (after the decaying mode has died out).
    const t1 = 4 / sig;
    const t2 = 12 / sig;
    let a1 = 0;
    let a2 = 0;
    const h = 1e-4;
    run(I, 1, Omega, 1e-9, h, t2 + h / 2, (s, t) => {
      const amp = Math.hypot(s[0] * Math.sqrt(I[0] / I[2]), s[2]); // weight so the mode ratio does not matter
      if (Math.abs(t - t1) < h / 2) a1 = amp;
      if (Math.abs(t - t2) < h / 2) a2 = amp;
    });
    assert(a2 / Omega < 1e-3, `left the linear phase: amplitude ${a2 / Omega}`);
    const measured = Math.log(a2 / a1) / (t2 - t1);
    close(measured / sig, 1, 0.05, 'measured/predicted growth rate');
    return `sigma ${sig.toFixed(4)} /s, measured ${measured.toFixed(4)} /s`;
  },
  'tennis racket: measured flip interval matches the elliptic-function period 2K(k)/p': () => {
    const I = T_HANDLE;
    const s0 = tr.initialState(I, 1, 6, 1e-2, tr.newState());
    const predicted = tr.flipInterval(I, s0);
    const l0 = tr.angMomMag(I, s0);
    const times: number[] = [];
    let sign = 1;
    run(I, 1, 6, 1e-2, 5e-4, 60, (s, t) => {
      const u = (I[1] * s[1]) / l0;
      if (sign > 0 && u < -0.5) { sign = -1; times.push(t); }
      if (sign < 0 && u > 0.5) { sign = 1; times.push(t); }
    });
    const n = times.length - 1;
    const measured = (times[n] - times[0]) / n;
    close(measured / predicted, 1, 1e-3, 'flip interval ratio');
    return `${n + 1} flips, predicted ${predicted.toFixed(4)} s, measured ${measured.toFixed(4)} s`;
  },
  'tennis racket: quaternion stays unit length and matches the L-alignment': () => {
    let worst = 0;
    run(T_HANDLE, 1, 8, 5e-2, 1e-3, 100, (s) => {
      worst = Math.max(worst, Math.abs(Math.hypot(s[3], s[4], s[5], s[6]) - 1));
    });
    assert(worst < 1e-12, `|q| - 1 reached ${worst}`);
    const s0 = tr.initialState(T_HANDLE, 0, 3, 0.2, tr.newState());
    const L = tr.angMomWorld(T_HANDLE, s0, [0, 0, 0]);
    const l = tr.angMomMag(T_HANDLE, s0);
    close(L[1] / l, 1, 1e-12, 'initial world L along +y');
    return `max | |q|-1 | ${worst.toExponential(1)}`;
  },
  'tennis racket: box inertia from shape (phone slab) matches textbook formulas': () => {
    const mp = tr.massProps(tr.presetParts('phone'));
    const [a, b, c] = [0.0715, 0.147, 0.0078];
    const m = 0.17;
    close(mp.I[0], (m * (a * a + c * c)) / 12, 1e-12, 'I1 (long axis)');
    close(mp.I[1], (m * (b * b + c * c)) / 12, 1e-12, 'I2 (width axis)');
    close(mp.I[2], (m * (a * a + b * b)) / 12, 1e-12, 'I3 (normal)');
    const box = tr.boxForInertia([1, 1.5, 2]);
    const back = tr.massProps([{ kind: 'box', m: 1, c: [0, 0, 0], size: box }]).I;
    close(back[1], 1.5, 1e-12, 'custom box round trip');
    return `I1:I2:I3 = 1 : ${(mp.I[1] / mp.I[0]).toFixed(2)} : ${(mp.I[2] / mp.I[0]).toFixed(2)}`;
  },
};
