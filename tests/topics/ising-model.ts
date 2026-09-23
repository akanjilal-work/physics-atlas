import { assert, close } from '../assert.ts';
import { Ising, Stats, TC, acceptance, exactSmall, onsagerM, onsagerU } from '../../src/topics/ising-model/physics.ts';

type Suite = () => string | void;

export const suites: Record<string, Suite> = {
  'ising: Onsager T_c solves sinh(2/T_c) = 1, u(T_c) = -sqrt2, M(2) = 0.9113': () => {
    close(Math.sinh(2 / TC), 1, 1e-12, 'sinh(2/Tc)');
    close(TC, 2.269185314, 1e-8, 'Tc');
    close(onsagerU(TC), -Math.SQRT2, 1e-9, 'u(Tc)');
    close(onsagerM(2.0), 0.911319, 1e-5, 'M(2)');
    assert(onsagerM(TC) === 0 && onsagerM(3) === 0, 'M vanishes at and above Tc');
    // Low-T series in x = e^{-2/T}: M = 1 - 2x^4 - 8x^6 - 34x^8 (Domb). Checked at T = 0.8.
    const x = Math.exp(-2 / 0.8);
    close(onsagerM(0.8), 1 - 2 * x ** 4 - 8 * x ** 6 - 34 * x ** 8, 1e-8, 'M low-T series');
    // Energy from ln Z / N = 2K + x^4 + 2x^6 + (9/2)x^8: u = -2 + 8x^4 + 24x^6 + 72x^8.
    close(onsagerU(0.8), -2 + 8 * x ** 4 + 24 * x ** 6 + 72 * x ** 8, 5e-8, 'u low-T series');
  },
  'ising: incremental energy and magnetization equal full recomputation (Metropolis + Wolff, h != 0)': () => {
    const lat = new Ising(24, 11);
    let worst = 0;
    const cases: [number, number][] = [[1.6, 0.3], [TC, -0.2], [3.5, 0.7], [2.0, 0]];
    for (const [T, h] of cases) {
      lat.setParams(T, h);
      for (let k = 0; k < 150; k++) {
        lat.metropolisSweep();
        lat.wolffSweep();
        const Ef = lat.energyFull();
        worst = Math.max(worst, Math.abs(Ef - lat.E));
        let M = 0;
        for (let i = 0; i < lat.N; i++) M += lat.s[i];
        assert(M === lat.M, `M incremental ${lat.M} vs full ${M}`);
      }
    }
    assert(worst < 1e-8, `energy mismatch ${worst}`);
    return `max |dE| ${worst.toExponential(1)}`;
  },
  'ising: detailed balance, acceptance ratio A(a->b)/A(b->a) = exp(-dE/T)': () => {
    let worst = 0;
    for (const T of [0.7, 1.5, TC, 4]) {
      for (const h of [0, 0.35, -1.2]) {
        for (const s of [-1, 1]) {
          for (const nsum of [-4, -2, 0, 2, 4]) {
            const dE = 2 * s * (nsum + h);
            const ratio = acceptance(dE, T) / acceptance(-dE, T);
            worst = Math.max(worst, Math.abs(ratio / Math.exp(-dE / T) - 1));
          }
        }
      }
    }
    assert(worst < 1e-12, `ratio error ${worst}`);
    return `max rel err ${worst.toExponential(1)}`;
  },
  'ising: sampling a 3x3 lattice reproduces exact enumeration of all 512 states': () => {
    const L = 3;
    const T = 2.5;
    const h = 0.3;
    const ex = exactSmall(L, T, h);
    const notes: string[] = [];
    for (const algo of ['metropolis', 'wolff'] as const) {
      const lat = new Ising(L, 5);
      lat.setParams(T, h);
      let sE = 0;
      let sM2 = 0;
      const n = 200000;
      // Wolff: a fixed count of 3 cluster attempts per sample, so sampling times never depend on the state.
      const step = () => {
        if (algo === 'metropolis') lat.metropolisSweep();
        else for (let c = 0; c < 3; c++) lat.wolffCluster();
      };
      for (let k = 0; k < 500; k++) step();
      for (let k = 0; k < n; k++) {
        step();
        sE += lat.E;
        sM2 += lat.M * lat.M;
      }
      const mE = sE / n;
      const mM2 = sM2 / n;
      close(mE, ex.meanE, 0.02 * Math.abs(ex.meanE), `${algo} <E>`);
      close(mM2, ex.meanM2, 0.02 * ex.meanM2, `${algo} <M^2>`);
      notes.push(`${algo} <E> ${mE.toFixed(3)}`);
    }
    return `exact <E> ${ex.meanE.toFixed(3)}, ${notes.join(', ')}`;
  },
  'ising: low T orders (T = 1.5, |m| near Onsager 0.9865)': () => {
    const lat = new Ising(32, 21);
    lat.setParams(1.5, 0);
    for (let k = 0; k < 200; k++) lat.wolffSweep();
    const st = new Stats(300);
    for (let k = 0; k < 300; k++) {
      lat.metropolisSweep();
      st.add(lat.E / lat.N, lat.M / lat.N);
    }
    assert(st.meanAbsM > 0.97, `|m| = ${st.meanAbsM}`);
    return `|m| ${st.meanAbsM.toFixed(4)} vs ${onsagerM(1.5).toFixed(4)}`;
  },
  'ising: high T disorders (T = 5, <m> ~ 0) and energy matches Onsager u(3)': () => {
    const lat = new Ising(64, 4);
    lat.setParams(5, 0);
    const st = new Stats(500);
    for (let k = 0; k < 100; k++) lat.metropolisSweep();
    for (let k = 0; k < 500; k++) {
      lat.metropolisSweep();
      st.add(lat.E / lat.N, lat.M / lat.N);
    }
    assert(Math.abs(st.meanM) < 0.02 && st.meanAbsM < 0.05, `m ${st.meanM}, |m| ${st.meanAbsM}`);
    lat.setParams(3, 0);
    st.reset();
    for (let k = 0; k < 200; k++) lat.metropolisSweep();
    for (let k = 0; k < 500; k++) {
      lat.metropolisSweep();
      st.add(lat.E / lat.N, lat.M / lat.N);
    }
    close(st.meanE, onsagerU(3), 0.01, 'u(3)');
    return `<m>(5) ${st.meanM.toFixed(4)}, u(3) ${st.meanE.toFixed(4)} vs ${onsagerU(3).toFixed(4)}`;
  },
  'ising: measured |m| at T = 2.0 on L = 64 matches Onsager within 3%': () => {
    const lat = new Ising(64, 2024);
    lat.setParams(2.0, 0);
    for (let k = 0; k < 150; k++) lat.wolffSweep();
    for (let k = 0; k < 200; k++) lat.metropolisSweep();
    const st = new Stats(1000);
    for (let k = 0; k < 1000; k++) {
      lat.metropolisSweep();
      st.add(lat.E / lat.N, lat.M / lat.N);
    }
    const exact = onsagerM(2.0);
    const rel = Math.abs(st.meanAbsM - exact) / exact;
    assert(rel < 0.03, `|m| ${st.meanAbsM} vs ${exact}`);
    close(st.meanE, onsagerU(2.0), 0.02, 'u(2)');
    return `|m| ${st.meanAbsM.toFixed(4)} vs ${exact.toFixed(4)} (${(rel * 100).toFixed(2)}%)`;
  },
};
