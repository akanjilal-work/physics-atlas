import { assert, close } from '../assert.ts';
import * as qt from '../../src/topics/quantum-teleportation/physics.ts';

type Suite = () => string | void;

export const suites: Record<string, Suite> = {
  'teleportation: all gates are unitary (U†U = I)': () => {
    let worst = 0;
    for (const g of [qt.X, qt.Y, qt.Z, qt.H, qt.U.H2, qt.U.CNOT23, qt.U.CNOT12, qt.U.H1, qt.U.X3, qt.U.Z3, qt.cnot(3, 1)]) {
      worst = Math.max(worst, qt.unitarityError(g));
    }
    assert(worst < 1e-14, `unitarity error ${worst}`);
    return `max |U†U − I| = ${worst.toExponential(1)}`;
  },
  'teleportation: statevector protocol gives fidelity 1 for 200 random states and every outcome': () => {
    const rnd = qt.mulberry32(7);
    let worst = 0;
    let pErr = 0;
    for (let n = 0; n < 200; n++) {
      const [th, ph] = qt.randomAngles(rnd);
      // Pure statevector run, independent of the density-matrix code path.
      let v = qt.initialVector(th, ph);
      v = qt.applyVec(qt.U.H2, v);
      v = qt.applyVec(qt.U.CNOT23, v);
      v = qt.applyVec(qt.U.CNOT12, v);
      v = qt.applyVec(qt.U.H1, v);
      const a = qt.psiAmps(th, ph);
      for (let m1 = 0; m1 < 2; m1++) {
        for (let m2 = 0; m2 < 2; m2++) {
          const base = m1 * 4 + m2 * 2;
          let b0r = v.re[base], b0i = v.im[base], b1r = v.re[base + 1], b1i = v.im[base + 1];
          const p = b0r * b0r + b0i * b0i + b1r * b1r + b1i * b1i;
          pErr = Math.max(pErr, Math.abs(p - 0.25));
          if (m2) [b0r, b0i, b1r, b1i] = [b1r, b1i, b0r, b0i]; // X
          if (m1) { b1r = -b1r; b1i = -b1i; } // Z
          const nrm = Math.sqrt(p);
          // |⟨ψ|bob⟩|²
          const ore = (a.ar * b0r + a.ai * b0i + a.br * b1r + a.bi * b1i) / nrm;
          const oim = (a.ar * b0i - a.ai * b0r + a.br * b1i - a.bi * b1r) / nrm;
          worst = Math.max(worst, Math.abs(1 - (ore * ore + oim * oim)));
          // Density-matrix path must agree.
          worst = Math.max(worst, Math.abs(1 - qt.teleport(th, ph, 0, m1, m2).F));
        }
      }
    }
    assert(worst < 1e-12, `fidelity error ${worst}`);
    assert(pErr < 1e-12, `outcome probability error ${pErr}`);
    return `max |1 − F| = ${worst.toExponential(1)}, every P(m) = 1/4`;
  },
  'teleportation: Bob’s reduced state before correction is exactly I/2 (no signalling)': () => {
    const rnd = qt.mulberry32(11);
    let worst = 0;
    for (let n = 0; n < 50; n++) {
      const [th, ph] = qt.randomAngles(rnd);
      for (const lam of [0, 0.3, 0.9]) {
        for (let step = 2; step <= 4; step++) {
          const rb = qt.reduced(qt.protocolState(th, ph, lam, 0, 0, false, step), 3);
          worst = Math.max(worst, Math.abs(rb.re[0] - 0.5), Math.abs(rb.re[3] - 0.5), Math.abs(rb.re[1]), Math.abs(rb.im[1]));
        }
        // After Alice measures, averaged over her four outcomes (Bob has no bits yet).
        const pre = qt.protocolState(th, ph, lam, 0, 0, false, 4);
        const avg = qt.cmat(2);
        for (let k = 0; k < 4; k++) {
          const p = qt.outcomeProb(pre, k >> 1, k & 1);
          const rb = qt.reduced(qt.protocolState(th, ph, lam, k >> 1, k & 1, false, qt.STEP_SEND), 3);
          for (let i = 0; i < 4; i++) { avg.re[i] += p * rb.re[i]; avg.im[i] += p * rb.im[i]; }
        }
        worst = Math.max(worst, Math.abs(avg.re[0] - 0.5), Math.abs(avg.re[3] - 0.5), Math.hypot(avg.re[1], avg.im[1]));
      }
    }
    assert(worst < 1e-12, `max deviation from I/2: ${worst}`);
    return `max |ρ_B − I/2| = ${worst.toExponential(1)}`;
  },
  'teleportation: Werner pair gives F = (1 + 2 F_pair)/3 for every state and outcome': () => {
    const rnd = qt.mulberry32(3);
    let worst = 0;
    for (const lam of [0, 0.1, 0.4, 2 / 3, 1]) {
      const pre = qt.protocolState(0.3, 0.2, lam, 0, 0, false, 2);
      const Fp = qt.pairFidelity(pre);
      close(Fp, qt.wernerPairFidelity(lam), 1e-12, 'pair overlap');
      const want = qt.wernerTeleportFidelity(Fp);
      for (let n = 0; n < 20; n++) {
        const [th, ph] = qt.randomAngles(rnd);
        for (let k = 0; k < 4; k++) worst = Math.max(worst, Math.abs(qt.teleport(th, ph, lam, k >> 1, k & 1).F - want));
      }
    }
    close(qt.wernerTeleportFidelity(qt.wernerPairFidelity(2 / 3)), 2 / 3, 1e-12, 'classical limit at λ = 2/3');
    assert(worst < 1e-12, `max error ${worst}`);
    return `max error ${worst.toExponential(1)}, F = 2/3 at λ = 2/3 (F_pair = 1/2)`;
  },
  'teleportation: skipping the correction gives outcome-averaged F = 1/2 for any state': () => {
    const rnd = qt.mulberry32(5);
    let worst = 0;
    let tr = 0;
    for (let n = 0; n < 50; n++) {
      const [th, ph] = qt.randomAngles(rnd);
      worst = Math.max(worst, Math.abs(qt.averageFidelity(th, ph, 0, true) - 0.5));
      tr = Math.max(tr, Math.abs(qt.trace(qt.protocolState(th, ph, 0.5, 1, 1, false, 8)) - 1));
    }
    assert(worst < 1e-12, `error ${worst}`);
    assert(tr < 1e-12, `trace error ${tr}`);
    return `max |F̄ − 1/2| = ${worst.toExponential(1)}`;
  },
};
