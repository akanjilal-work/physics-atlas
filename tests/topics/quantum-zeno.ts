import { assert, close } from '../assert.ts';
import * as qz from '../../src/topics/quantum-zeno/physics.ts';

type Suite = () => string | void;

/** Independent check: evolve a spinor with the exact propagator exp(-i Omega t sigma_x / 2). */
function spinorP0(Omega: number, t: number): number {
  // U = cos(a) I - i sin(a) X, a = Omega t / 2, acting on |0> = (1, 0)
  const a = (Omega * t) / 2;
  const re0 = Math.cos(a);
  return re0 * re0;
}

export const suites: Record<string, Suite> = {
  'quantum-zeno: N = 1 gives the plain Rabi result cos^2(Omega T / 2)': () => {
    let worst = 0;
    for (const Om of [0.4, 1, 2.7]) {
      for (const T of [0.1, 0.9, Math.PI / Om, 3.3]) {
        const p = qz.zenoSurvival(Om, T, 1);
        worst = Math.max(worst, Math.abs(p - spinorP0(Om, T)), Math.abs(qz.survivalAt(Om, Infinity, T) - p));
      }
    }
    assert(worst < 1e-15, `N = 1 vs Rabi: ${worst}`);
    close(qz.survivalAtPi(1), 0, 1e-15, 'one measurement at the pi time finds |1>');
    close(qz.populationAfter(1, Math.PI, 1), 0, 1e-15, 'Markov population after one pi pulse');
    return `max |P - cos^2| = ${worst.toExponential(1)}`;
  },
  'quantum-zeno: survival cos^{2N}(pi/2N) rises to 1 as N grows, like exp(-pi^2 / 4N)': () => {
    let prev = -1;
    for (let N = 1; N <= 4096; N *= 2) {
      const p = qz.survivalAtPi(N);
      assert(p > prev, `not monotone at N = ${N}`);
      prev = p;
    }
    // Large-N expansion: ln P = 2N ln cos(x), x = pi/2N  ->  -pi^2/(4N) - pi^4/(96 N^3) + ...
    for (const N of [100, 1000, 1e5]) {
      const p = qz.survivalAtPi(N);
      close(p, Math.exp(-(Math.PI ** 2) / (4 * N) - Math.PI ** 4 / (96 * N ** 3)), 1e-9, `asymptotic form at N = ${N}`);
    }
    close(qz.survivalAtPi(1e7), 1, 1e-6, 'limit N -> infinity');
    // Known thresholds used by the challenges.
    assert(qz.firstMAbove(0.5) === 4, 'survival first exceeds 1/2 at N = 4');
    close(qz.survivalAtPi(4), Math.cos(Math.PI / 8) ** 8, 1e-15, 'N = 4 value');
    return `P(N=4) = ${qz.survivalAtPi(4).toFixed(4)}, first N above 0.9: ${qz.firstMAbove(0.9)}`;
  },
  'quantum-zeno: Monte Carlo quantum jumps agree with cos^{2N} within 4 sigma': () => {
    const rand = qz.mulberry32(2024);
    const M = 20000;
    let worstSig = 0;
    for (const [Om, T, N] of [[1, Math.PI, 2], [1, Math.PI, 4], [1, Math.PI, 16], [2, 1.3, 7], [0.7, 5, 30]] as const) {
      const tau = T / N;
      const p = qz.zenoSurvival(Om, tau, N);
      const sim = qz.simulateSurvival(Om, tau, N, M, rand);
      const sigma = Math.sqrt((p * (1 - p)) / M);
      const dev = Math.abs(sim - p) / sigma;
      worstSig = Math.max(worstSig, dev);
      assert(dev < 4, `N = ${N}: sim ${sim} vs ${p} (${dev.toFixed(2)} sigma)`);
    }
    // Population including returns follows the two-state Markov chain.
    const e = qz.makeEnsemble(M);
    const Om = 1, tau = 0.4, N = 9;
    let plus = 0;
    for (let k = 0; k < N; k++) {
      qz.rotateAll(e, Om * tau);
      plus = qz.measureAll(e, 0, rand);
    }
    const p0 = qz.populationAfter(Om, tau, N);
    const sig = Math.sqrt((p0 * (1 - p0)) / M);
    assert(Math.abs(plus / M - p0) < 4 * sig, `population ${plus / M} vs ${p0}`);
    return `${M} trajectories per case, worst ${worstSig.toFixed(2)} sigma`;
  },
  'quantum-zeno: Zeno dragging fidelity rises with measurement count and matches Monte Carlo': () => {
    let prev = -1;
    for (let N = 1; N <= 512; N++) {
      const f = qz.dragFidelityUniform(N);
      assert(f >= prev - 1e-15, `drag fidelity fell at N = ${N}`);
      prev = f;
    }
    close(qz.dragFidelityUniform(1), 0, 1e-15, 'one jump straight to the |1> axis')
    close(qz.dragFidelityUniform(2), 0.5, 1e-15, 'two 90 degree steps');
    close(qz.dragFidelityUniform(1e6), 1, 1e-5, 'slow-drag limit');
    const angles = qz.dragAngles(Math.PI / 10);
    assert(angles.length === 10 && Math.abs(angles[9] - Math.PI) < 1e-15, 'ten equal steps end on the |1> axis');
    close(qz.dragFidelity(angles), qz.dragFidelityUniform(10), 1e-14, 'general product vs uniform formula');
    const rand = qz.mulberry32(11);
    const M = 20000;
    for (const step of [Math.PI / 3, 0.37, 0.11]) {
      const a = qz.dragAngles(step);
      const f = qz.dragFidelity(a);
      const sim = qz.simulateDrag(a, M, rand);
      const sigma = Math.sqrt((f * (1 - f)) / M);
      assert(Math.abs(sim - f) < 4 * sigma, `step ${step}: sim ${sim} vs ${f}`);
    }
    return `F(5) = ${qz.dragFidelityUniform(5).toFixed(3)}, F(50) = ${qz.dragFidelityUniform(50).toFixed(3)}`;
  },
  'quantum-zeno: anti-Zeno toy model (Kofman-Kurizki overlap) closed form vs numerical integral': () => {
    let worst = 0;
    for (const [D, tau] of [[0, 0.3], [4, 0.5], [4, 3], [8, 0.2], [2, 10]] as const) {
      const a = qz.measuredRate(1, 1, D, tau);
      const b = qz.measuredRateNumeric(1, 1, D, tau);
      worst = Math.max(worst, Math.abs(a - b) / b);
    }
    assert(worst < 1e-6, `closed form vs integral: ${worst}`);
    // Long intervals recover the golden rule. Short intervals give Zeno slowdown, rate -> Gamma0 b tau / 2.
    close(qz.measuredRate(1, 1, 3, 1e6) / qz.goldenRate(1, 1, 3), 1, 1e-5, 'golden-rule limit');
    close(qz.measuredRate(1, 1, 3, 1e-5) / (1e-5 / 2), 1, 1e-4, 'short-time Zeno limit');
    // On resonance with the peak, measurement only slows decay. Detuned, it can speed it up.
    for (const tau of [0.1, 0.5, 1, 3, 10]) assert(qz.measuredRate(1, 1, 0, tau) < 1, `Zeno only on resonance, tau ${tau}`);
    const ratio = qz.measuredRate(1, 1, 4, 0.5) / qz.goldenRate(1, 1, 4);
    assert(ratio > 2, `anti-Zeno enhancement at Delta = 4b: ${ratio}`);
    return `max rel. error ${worst.toExponential(1)}, anti-Zeno boost x${ratio.toFixed(2)} at Delta = 4b`;
  },
};
