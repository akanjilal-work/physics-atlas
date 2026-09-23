import { assert, close } from '../assert.ts';
import * as sb from '../../src/topics/spin-bloch/physics.ts';

type Suite = () => string | void;

const NAMES: sb.GateName[] = ['X', 'Y', 'Z', 'H', 'S', 'T', 'Rx', 'Ry', 'Rz'];

export const suites: Record<string, Suite> = {
  'spin-bloch: every gate is unitary (U^dagger U = I), rotations have det 1': () => {
    let worst = 0;
    for (const name of NAMES) {
      for (const a of [0.3, 1.1, Math.PI, 5.2]) {
        const g = sb.gate(name, a);
        const e = sb.maxDiff(sb.matMul(sb.dagger(g.U), g.U), sb.I2);
        worst = Math.max(worst, e);
        assert(e < 1e-14, `${name}(${a}) not unitary: ${e}`);
        const R = sb.rotationU(g.axis, g.angle);
        const [dr, di] = sb.det(R);
        close(dr, 1, 1e-14, `det Re of R for ${name}`);
        close(di, 0, 1e-14, `det Im of R for ${name}`);
        // The textbook matrix equals the SU(2) rotation up to a global phase.
        const ph = sb.diffUpToPhase(g.U, R);
        assert(ph < 1e-14, `${name} differs from its rotation by more than a phase: ${ph}`);
      }
    }
    return `worst |U^dag U - I| = ${worst.toExponential(1)}`;
  },
  'spin-bloch: pure states have |r| = 1, and U on the spinor = rotation of r': () => {
    const rand = sb.mulberry32(7);
    let worstLen = 0;
    let worstRot = 0;
    for (let i = 0; i < 500; i++) {
      const th = Math.acos(1 - 2 * rand());
      const ph = 2 * Math.PI * rand();
      const psi = sb.spinorFromAngles(th, ph);
      const r = sb.blochFromSpinor(psi);
      worstLen = Math.max(worstLen, Math.abs(Math.hypot(...r) - 1));
      const ang = sb.blochFromAngles(th, ph);
      for (let k = 0; k < 3; k++) close(r[k], ang[k], 1e-14, 'Bloch vector from spinor vs angles');
      const g = sb.gate(NAMES[i % NAMES.length], 6 * rand());
      const r2 = sb.blochFromSpinor(sb.applyU(g.U, psi));
      const rr = sb.rotateVec(r, g.axis, g.angle, [0, 0, 0]);
      for (let k = 0; k < 3; k++) worstRot = Math.max(worstRot, Math.abs(r2[k] - rr[k]));
    }
    assert(worstLen < 1e-14, `|r| - 1 = ${worstLen}`);
    assert(worstRot < 1e-13, `rotation mismatch ${worstRot}`);
    return `500 random states, max ||r|-1| = ${worstLen.toExponential(1)}`;
  },
  'spin-bloch: HZH = X (exactly, and up to phase for SU(2) forms)': () => {
    const HZH = sb.matMul(sb.HADAMARD, sb.matMul(sb.PAULI_Z, sb.HADAMARD));
    const e = sb.maxDiff(HZH, sb.PAULI_X);
    assert(e < 1e-15, `HZH - X = ${e}`);
    const h = sb.gate('H');
    const Rh = sb.rotationU(h.axis, h.angle);
    const Rz = sb.rotationU([0, 0, 1], Math.PI);
    const Rx = sb.rotationU([1, 0, 0], Math.PI);
    const e2 = sb.diffUpToPhase(sb.matMul(Rh, sb.matMul(Rz, Rh)), Rx);
    assert(e2 < 1e-15, `SU(2) HZH vs Rx(pi) up to phase: ${e2}`);
    const r = sb.blochFromSpinor(sb.applyU(HZH, [1, 0, 0, 0]));
    close(r[2], -1, 1e-15, 'HZH|0> should be |1>');
  },
  'spin-bloch: Rabi formula matches RK4 Schrodinger integration (lab frame, circular drive)': () => {
    // H = 1/2 [w0 Z + Omega (cos wt X + sin wt Y)]. Detuning Delta = w0 - w.
    const w0 = 20;
    const Om = 1.3;
    let worst = 0;
    for (const Delta of [0, 0.7, -1.9]) {
      const w = w0 - Delta;
      const wAt = (t: number): [number, number, number] => [Om * Math.cos(w * t), Om * Math.sin(w * t), w0];
      let psi: sb.Spinor = [1, 0, 0, 0];
      const h = 5e-4;
      let t = 0;
      for (let step = 1; step <= 16000; step++) {
        psi = sb.rk4Spinor(psi, wAt, t, h);
        t = step * h;
        if (step % 400 === 0) {
          const p1 = psi[2] * psi[2] + psi[3] * psi[3];
          const err = Math.abs(p1 - sb.rabiP1(Om, Delta, t));
          worst = Math.max(worst, err);
        }
      }
      const norm = psi.reduce((s, v) => s + v * v, 0);
      close(norm, 1, 1e-8, 'norm conserved');
    }
    assert(worst < 1e-6, `max |P1 - formula| = ${worst}`);
    return `3 detunings over 8 s, max error ${worst.toExponential(1)}`;
  },
  'spin-bloch: Bloch-equation Rabi (rotating frame) hits P1 = 1 at a pi pulse': () => {
    const Om = 1;
    const r = new Float64Array([0, 0, 1]);
    const p: sb.BlochParams = { w: [Om, 0, 0], eq: [0, 0, 1], g1: 0, g2: 0 };
    const T = Math.PI / Om;
    const n = 2000;
    for (let i = 0; i < n; i++) sb.rk4Bloch(r, p, T / n);
    close((1 - r[2]) / 2, 1, 1e-10, 'P1 after pi pulse');
    close(Math.hypot(r[0], r[1], r[2]), 1, 1e-10, '|r| stays 1');
  },
  'spin-bloch: Born rule P0 = cos^2(theta/2), and 1e5 samples agree within 4 sigma': () => {
    const rand = sb.mulberry32(42);
    for (const thDeg of [0, 30, 60, 90, 120, 150, 180]) {
      const th = (thDeg * Math.PI) / 180;
      const psi = sb.spinorFromAngles(th, 1.234);
      const p0 = psi[0] * psi[0] + psi[1] * psi[1];
      const r = sb.blochFromSpinor(psi);
      const pb = sb.probPlus(r, [0, 0, 1]);
      close(p0, Math.cos(th / 2) ** 2, 1e-15, `|a|^2 at ${thDeg}`);
      close(pb, Math.cos(th / 2) ** 2, 1e-15, `(1+z)/2 at ${thDeg}`);
      const N = 100000;
      const k = sb.measureBatch(r, [0, 0, 1], N, rand);
      const sigma = Math.sqrt(N * pb * (1 - pb));
      assert(Math.abs(k - N * pb) <= 4 * sigma + 1e-9, `sample ${k} vs ${N * pb} at ${thDeg} deg`);
    }
  },
  'spin-bloch: antipodal points are orthogonal states': () => {
    const rand = sb.mulberry32(3);
    let worst = 0;
    for (let i = 0; i < 200; i++) {
      const th = Math.PI * rand();
      const ph = 2 * Math.PI * rand();
      const a = sb.spinorFromAngles(th, ph);
      const b = sb.spinorFromAngles(Math.PI - th, ph + Math.PI);
      const re = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
      const im = a[0] * b[1] - a[1] * b[0] + a[2] * b[3] - a[3] * b[2];
      worst = Math.max(worst, Math.hypot(re, im));
    }
    assert(worst < 1e-15, `overlap ${worst}`);
  },
  'spin-bloch: T1/T2 Bloch equations match exponential decay and keep rho positive': () => {
    const T1 = 5;
    const T2 = 3;
    const r = new Float64Array([1, 0, 0]);
    const p: sb.BlochParams = { w: [0, 0, 2], eq: [0, 0, 1], g1: 1 / T1, g2: 1 / T2 };
    const h = 1e-3;
    let t = 0;
    let maxLen = 0;
    for (let i = 0; i < 8000; i++) {
      sb.rk4Bloch(r, p, h);
      t += h;
      maxLen = Math.max(maxLen, Math.hypot(r[0], r[1], r[2]));
    }
    close(Math.hypot(r[0], r[1]), Math.exp(-t / T2), 1e-9, 'transverse decay e^{-t/T2}');
    close(r[2], 1 - Math.exp(-t / T1), 1e-9, 'longitudinal recovery 1 - e^{-t/T1}');
    const perp = Math.hypot(r[0], r[1]);
    close(r[0] / perp, Math.cos(2 * t), 1e-8, 'precession phase (cos)');
    close(r[1] / perp, Math.sin(2 * t), 1e-8, 'precession phase (sin)');
    assert(maxLen <= 1 + 1e-12, `|r| exceeded 1: ${maxLen}`);
    const rho = sb.densityFromBloch(r);
    const back = sb.blochFromDensity(rho);
    for (let k = 0; k < 3; k++) close(back[k], r[k], 1e-15, 'rho round trip');
    const pur = sb.purity(r);
    assert(pur > 0.5 && pur < 1, `purity ${pur}`);
    return `purity after ${t.toFixed(0)} s: ${pur.toFixed(3)}`;
  },
};
