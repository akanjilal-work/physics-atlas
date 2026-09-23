import { assert, close } from '../assert.ts';
import * as nm from '../../src/topics/normal-modes/physics.ts';

type Suite = () => string | void;

const W0 = 4;

export const suites: Record<string, Suite> = {
  'normal modes: Jacobi eigenvalues match ω_k = 2ω0 sin(kπ/2(N+1)) for N = 2..12': () => {
    let worst = 0;
    for (let N = 2; N <= 12; N++) {
      const m = nm.chainModes(N, W0);
      for (let k = 1; k <= N; k++) worst = Math.max(worst, Math.abs(m.omega[k - 1] - nm.chainOmega(k, N, W0)));
    }
    assert(worst < 1e-10, `max |ω_num − ω_exact| = ${worst}`);
    return `max error ${worst.toExponential(1)}`;
  },
  'normal modes: Jacobi shapes are orthonormal and equal sqrt(2/(N+1)) sin(jkπ/(N+1))': () => {
    let orth = 0;
    let shape = 0;
    for (let N = 2; N <= 12; N++) {
      const m = nm.chainModes(N, W0);
      for (let a = 0; a < N; a++) {
        for (let b = 0; b < N; b++) {
          let dot = 0;
          for (let j = 0; j < N; j++) dot += m.shapes[a][j] * m.shapes[b][j];
          orth = Math.max(orth, Math.abs(dot - (a === b ? 1 : 0)));
        }
        const ex = nm.chainShape(a + 1, N);
        for (let j = 0; j < N; j++) shape = Math.max(shape, Math.abs(m.shapes[a][j] - ex[j]));
      }
    }
    assert(orth < 1e-12, `orthonormality error ${orth}`);
    assert(shape < 1e-9, `shape error ${shape}`);
    return `|ΦᵀΦ − I| ${orth.toExponential(1)}, shape error ${shape.toExponential(1)}`;
  },
  'normal modes: projection then reconstruction recovers every pluck shape': () => {
    let worst = 0;
    for (let N = 2; N <= 12; N++) {
      const m = nm.chainModes(N, W0);
      const x = new Float64Array(N);
      const q = new Float64Array(N);
      const y = new Float64Array(N);
      for (const pre of ['centre', 'quarter', 'single', 'bump', 'random'] as nm.PluckPreset[]) {
        nm.presetShape(pre, N, 1, x, 7 + N);
        nm.project(x, m.shapes, q);
        nm.reconstruct(q, m.shapes, y);
        for (let j = 0; j < N; j++) worst = Math.max(worst, Math.abs(x[j] - y[j]));
        // Parseval: Σ q_k² = Σ x_j² because the modes are orthonormal.
        let sx = 0;
        let sq = 0;
        for (let j = 0; j < N; j++) {
          sx += x[j] * x[j];
          sq += q[j] * q[j];
        }
        close(sq, sx, 1e-12, `Parseval N=${N} ${pre}`);
      }
    }
    assert(worst < 1e-12, `reconstruction error ${worst}`);
    return `max error ${worst.toExponential(1)}`;
  },
  'normal modes: each mode energy is conserved without damping (Verlet, 60 s pluck)': () => {
    const N = 9;
    const p: nm.ChainParams = { N, omega0: W0, gamma: 0, beta: 0 };
    const modes = nm.chainModes(N, W0);
    const x = nm.trianglePluck(N, 2, 1, new Float64Array(N));
    const v = new Float64Array(N);
    const acc = nm.chainAccel(x, p, new Float64Array(N));
    const q = new Float64Array(N);
    const pp = new Float64Array(N);
    const E0 = nm.modeEnergies(x, v, modes, q, pp, new Float64Array(N)).slice();
    const total = E0.reduce((s, e) => s + e, 0);
    close(total, nm.chainEnergy(x, v, p), 1e-12, 'Σ E_k equals total energy');
    const E = new Float64Array(N);
    let worst = 0;
    const h = 1 / 1200;
    for (let i = 0; i < 60 * 1200; i++) {
      nm.chainStep(x, v, acc, p, h);
      if (i % 600 === 0) {
        nm.modeEnergies(x, v, modes, q, pp, E);
        for (let k = 0; k < N; k++) worst = Math.max(worst, Math.abs(E[k] - E0[k]) / total);
      }
    }
    assert(worst < 2e-3, `worst mode-energy change ${worst} of total`);
    return `worst change ${worst.toExponential(1)} of total`;
  },
  'normal modes: a pure mode oscillates at ω_k (period from zero crossings)': () => {
    const N = 7;
    const k = 3;
    const p: nm.ChainParams = { N, omega0: W0, gamma: 0, beta: 0 };
    const x = nm.chainShape(k, N);
    const v = new Float64Array(N);
    const acc = nm.chainAccel(x, p, new Float64Array(N));
    const h = 1e-4;
    let t = 0;
    let prev = x[0];
    const cross: number[] = [];
    while (cross.length < 6) {
      nm.chainStep(x, v, acc, p, h);
      t += h;
      if (prev > 0 && x[0] <= 0) cross.push(t - (h * x[0]) / (x[0] - prev));
      prev = x[0];
    }
    const T = (cross[5] - cross[0]) / 5;
    const Tex = (2 * Math.PI) / nm.chainOmega(k, N, W0);
    close(T, Tex, 1e-5 * Tex, 'period');
    return `T = ${T.toFixed(5)} s vs ${Tex.toFixed(5)} s`;
  },
  'normal modes: damped pure mode follows the exact damped-oscillator solution': () => {
    const N = 5;
    const gamma = 0.3;
    const p: nm.ChainParams = { N, omega0: W0, gamma, beta: 0 };
    const x = nm.chainShape(1, N);
    const v = new Float64Array(N);
    const acc = nm.chainAccel(x, p, new Float64Array(N));
    const E0 = nm.chainEnergy(x, v, p);
    const h = 1e-4;
    const w1 = nm.chainOmega(1, N, W0);
    // Exact damped mode: q = e^(−γt/2)(cos ω_d t + (γ/2ω_d) sin ω_d t).
    const T = 5;
    for (let i = 0; i < T / h; i++) nm.chainStep(x, v, acc, p, h);
    const wd = Math.sqrt(w1 * w1 - (gamma * gamma) / 4);
    const qEx = Math.exp((-gamma * T) / 2) * (Math.cos(wd * T) + (gamma / (2 * wd)) * Math.sin(wd * T));
    const shape = nm.chainShape(1, N);
    let q = 0;
    for (let j = 0; j < N; j++) q += shape[j] * x[j];
    close(q, qEx, 1e-4, 'damped modal coordinate');
    const E = nm.chainEnergy(x, v, p);
    assert(E < E0 * Math.exp(-gamma * T) * 1.5 && E > E0 * Math.exp(-gamma * T) * 0.5, `energy ${E} vs ~${E0 * Math.exp(-gamma * T)}`);
    return `q(5 s) = ${q.toFixed(5)} vs ${qEx.toFixed(5)}`;
  },
  'normal modes: FPU-β chain conserves total energy but leaks energy out of mode 1': () => {
    const N = 12;
    const p: nm.ChainParams = { N, omega0: W0, gamma: 0, beta: 2 };
    const modes = nm.chainModes(N, W0);
    const x = nm.chainShape(1, N);
    for (let j = 0; j < N; j++) x[j] *= 3;
    const v = new Float64Array(N);
    const acc = nm.chainAccel(x, p, new Float64Array(N));
    const E0 = nm.chainEnergy(x, v, p);
    const h = 1 / 1200;
    for (let i = 0; i < 120 * 1200; i++) nm.chainStep(x, v, acc, p, h);
    const drift = Math.abs(nm.chainEnergy(x, v, p) - E0) / E0;
    const E = nm.modeEnergies(x, v, modes, new Float64Array(N), new Float64Array(N), new Float64Array(N));
    const sum = E.reduce((s, e) => s + e, 0);
    const other = 1 - E[0] / sum;
    assert(drift < 1e-4, `total energy drift ${drift}`);
    assert(other > 0.01, `only ${other} left mode 1`);
    return `drift ${drift.toExponential(1)}, ${(other * 100).toFixed(1)} % outside mode 1`;
  },
  'normal modes: 2D Jacobi drum eigenvalues match the lattice formula ω_mn': () => {
    const M = 5;
    const e = nm.jacobiEigen(nm.drumStiffness(M, W0), M * M);
    const ex: number[] = [];
    for (let m = 1; m <= M; m++) for (let n = 1; n <= M; n++) ex.push(nm.drumOmega(m, n, M, W0));
    ex.sort((a, b) => a - b);
    let worst = 0;
    for (let i = 0; i < M * M; i++) worst = Math.max(worst, Math.abs(Math.sqrt(e.values[i]) - ex[i]));
    assert(worst < 1e-9, `drum eigen error ${worst}`);
    return `25 modes, max error ${worst.toExponential(1)}, ${e.sweeps} sweeps`;
  },
  'normal modes: pure drum mode (m,n) has m·n nodal domains': () => {
    for (const [m, n] of [[1, 1], [1, 2], [2, 2], [3, 1], [2, 3], [3, 3]]) {
      const d = nm.nodalDomains(m, n, 0);
      assert(d === m * n, `(${m},${n}) gave ${d} domains`);
    }
    const diag = nm.nodalDomains(1, 2, Math.PI / 4);
    assert(diag === 2, `(1,2)+(2,1) should split along a diagonal into 2 domains, got ${diag}`);
    return 'ok';
  },
};
