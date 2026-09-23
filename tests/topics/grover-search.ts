import { assert, close } from '../assert.ts';
import * as g from '../../src/topics/grover-search/physics.ts';

type Suite = () => string | void;

function prepared(n: number): Float64Array {
  return g.hadamardAll(g.zeroState(n));
}

export const suites: Record<string, Suite> = {
  'grover: H^n on |0..0> gives the uniform state 1/sqrt(N), and H^n H^n = I': () => {
    for (let n = g.MIN_QUBITS; n <= g.MAX_QUBITS; n++) {
      const psi = prepared(n);
      const a = 1 / Math.sqrt(psi.length);
      for (let i = 0; i < psi.length; i++) close(psi[i], a, 1e-12, `n=${n} amp ${i}`);
      g.hadamardAll(psi);
      close(psi[0], 1, 1e-12, `n=${n} back to |0>`);
      for (let i = 1; i < psi.length; i++) close(psi[i], 0, 1e-12, `n=${n} residual ${i}`);
    }
    return 'n = 2..10';
  },
  'grover: inversion about the mean equals H^n (2|0><0| - I) H^n': () => {
    const rnd = g.mulberry32(7);
    for (const n of [2, 5, 8]) {
      const a = new Float64Array(1 << n).map(() => rnd() - 0.5);
      const b = a.slice();
      g.diffuse(a);
      g.diffuseByGates(b);
      for (let i = 0; i < a.length; i++) close(a[i], b[i], 1e-12, `n=${n} i=${i}`);
    }
  },
  'grover: oracle + diffusion preserve the norm over 60 iterations': () => {
    let worst = 0;
    for (const [n, M] of [[3, 1], [6, 2], [10, 1], [10, 7]]) {
      const N = 1 << n;
      const marks = g.spreadMarks(N, M, 3);
      const psi = prepared(n);
      for (let k = 0; k < 60; k++) {
        g.oracle(psi, marks);
        worst = Math.max(worst, Math.abs(g.norm2(psi) - 1));
        g.diffuse(psi);
        worst = Math.max(worst, Math.abs(g.norm2(psi) - 1));
      }
    }
    assert(worst < 1e-12, `norm drift ${worst}`);
    return `max |‖ψ‖² − 1| = ${worst.toExponential(1)}`;
  },
  'grover: statevector P_k matches sin²((2k+1)θ) for many n, M, k': () => {
    let worst = 0;
    for (const [n, M] of [[2, 1], [4, 1], [4, 4], [6, 1], [6, 3], [8, 1], [8, 4], [10, 1], [10, 5]]) {
      const N = 1 << n;
      const marks = g.spreadMarks(N, M, 1);
      let count = 0;
      for (let i = 0; i < N; i++) count += marks[i];
      assert(count === M, `spreadMarks placed ${count}, wanted ${M}`);
      const psi = prepared(n);
      const xy = new Float64Array(2);
      for (let k = 0; k <= 40; k++) {
        worst = Math.max(worst, Math.abs(g.successProb(psi, marks) - g.analyticP(k, N, M)));
        // Geometric picture: the state sits at angle (2k+1)θ from |r> in the Grover plane.
        const ang = g.planeCoords(psi, marks, xy);
        const expect = Math.atan2(Math.sin((2 * k + 1) * g.theta(N, M)), Math.cos((2 * k + 1) * g.theta(N, M)));
        close(ang, expect, 1e-9, `angle n=${n} M=${M} k=${k}`);
        g.groverIteration(psi, marks);
      }
    }
    assert(worst < 1e-12, `max deviation ${worst}`);
    return `max |ΔP| = ${worst.toExponential(1)}`;
  },
  'grover: optimal k is 1 (P = 1) for N=4, 3 for N=16, 12 for N=256': () => {
    assert(g.optimalK(4, 1) === 1, `N=4 gave ${g.optimalK(4, 1)}`);
    const psi = prepared(2);
    const marks = g.spreadMarks(4, 1, 2);
    g.groverIteration(psi, marks);
    close(g.successProb(psi, marks), 1, 1e-12, 'N=4 after one iteration');
    assert(g.optimalK(16, 1) === 3, `N=16 gave ${g.optimalK(16, 1)}`);
    assert(g.optimalK(256, 1) === 12, `N=256 gave ${g.optimalK(256, 1)}`);
    assert(g.optimalK(64, 4) === 3, `N=64, M=4 gave ${g.optimalK(64, 4)}`);
    // optimalK must be the argmax of sin²((2k+1)θ) over the first rotation (larger k can wrap round).
    for (let n = 2; n <= 10; n++) {
      const N = 1 << n;
      for (let M = 1; M <= N / 2; M *= 2) {
        const ko = g.optimalK(N, M);
        for (let k = 0; k <= 2 * ko; k++) assert(g.analyticP(k, N, M) <= g.analyticP(ko, N, M) + 1e-12, `N=${N} M=${M} k=${k} beats ${ko}`);
      }
    }
    return `P(N=256, k=12) = ${g.analyticP(12, 256, 1).toFixed(4)}`;
  },
  'grover: classical expected queries (N+1)/(M+1) from exact combinatorics': () => {
    // P(first marked item is draw j) = C(N-j, M-1) / C(N, M).
    for (const [N, M] of [[16, 1], [64, 4], [256, 1], [100, 7]]) {
      let logCNM = 0;
      for (let i = 0; i < M; i++) logCNM += Math.log(N - i) - Math.log(i + 1);
      let E = 0;
      for (let j = 1; j <= N - M + 1; j++) {
        let lc = 0;
        for (let i = 0; i < M - 1; i++) lc += Math.log(N - j - i) - Math.log(i + 1);
        E += j * Math.exp(lc - logCNM);
      }
      close(E, g.classicalExpected(N, M), 1e-9, `N=${N} M=${M}`);
    }
  },
  'grover: sampled success rate matches P (N=16, k=3, 20000 shots)': () => {
    const psi = prepared(4);
    const marks = g.spreadMarks(16, 1, 5);
    for (let k = 0; k < 3; k++) g.groverIteration(psi, marks);
    const P = g.successProb(psi, marks);
    const rnd = g.mulberry32(42);
    let hits = 0;
    const shots = 20000;
    for (let s = 0; s < shots; s++) if (marks[g.sample(psi, rnd())]) hits++;
    const sigma = Math.sqrt((P * (1 - P)) / shots);
    close(hits / shots, P, 5 * sigma, 'hit rate');
    return `rate ${(hits / shots).toFixed(4)} vs P ${P.toFixed(4)}`;
  },
};
