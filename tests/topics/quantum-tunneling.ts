import { assert, close } from '../assert.ts';
import * as qt from '../../src/topics/quantum-tunneling/physics.ts';

type Suite = () => string | void;

// Small deterministic PRNG so the FFT check is reproducible.
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const base: qt.SimParams = { kind: 'barrier', V0: 0, a: 1, x0: 0, k0: 0, sigma: 2, dt: 0.05, absorb: false };

export const suites: Record<string, Suite> = {
  'quantum tunneling: radix-2 FFT matches a naive DFT on random data': () => {
    const rnd = lcg(12345);
    let worst = 0;
    for (const n of [8, 64, 256]) {
      const re = new Float64Array(n);
      const im = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        re[i] = rnd() * 2 - 1;
        im[i] = rnd() * 2 - 1;
      }
      const [dr, di] = qt.dft(re, im);
      const fr = re.slice();
      const fi = im.slice();
      qt.fft(fr, fi);
      for (let k = 0; k < n; k++) worst = Math.max(worst, Math.abs(fr[k] - dr[k]), Math.abs(fi[k] - di[k]));
      qt.fft(fr, fi, true);
      for (let k = 0; k < n; k++) worst = Math.max(worst, Math.abs(fr[k] - re[k]), Math.abs(fi[k] - im[k]));
    }
    assert(worst < 1e-10, `max error ${worst}`);
    return `max error ${worst.toExponential(1)}`;
  },
  'quantum tunneling: norm conserved to 1e-10 in free evolution (no absorber)': () => {
    const sim = new qt.TunnelSim({ ...base, x0: -20, k0: 1.5, sigma: 3 });
    sim.step(2000);
    const o = sim.observe();
    const err = Math.abs(o.norm - 1);
    assert(err < 1e-10, `norm error ${err}`);
    return `|norm - 1| = ${err.toExponential(1)} after 2000 steps`;
  },
  'quantum tunneling: free packet width follows sigma*sqrt(1 + (t/(2 sigma^2))^2)': () => {
    const sigma = 2;
    const sim = new qt.TunnelSim({ ...base, x0: -10, k0: 1, sigma });
    let worst = 0;
    for (let k = 0; k < 5; k++) {
      sim.step(100);
      const [, w] = sim.moments();
      const expected = sigma * Math.sqrt(1 + (sim.t / (2 * sigma * sigma)) ** 2);
      worst = Math.max(worst, Math.abs(w / expected - 1));
    }
    assert(worst < 0.01, `relative width error ${worst}`);
    return `worst relative error ${(worst * 100).toFixed(3)} % up to t = ${sim.t.toFixed(0)}`;
  },
  'quantum tunneling: transfer matrix matches closed-form barrier T, and the thick-barrier limit': () => {
    for (const [E, V0, a] of [[0.3, 1, 1], [0.8, 2, 0.7], [1.7, 1, 2.2], [3, 2.5, 1]]) {
      close(qt.transferT(E, qt.segments('barrier', V0, a, 1e9)), qt.barrierT(E, V0, a), 1e-10, `T(E=${E})`);
    }
    // kappa a = 5: the approximation should be within 1 %
    const V0 = 1, E = 0.5, a = 5;
    const ratio = qt.thickBarrierT(E, V0, a) / qt.barrierT(E, V0, a);
    close(ratio, 1, 0.01, 'thick/exact');
    return `thick/exact = ${ratio.toFixed(5)} at kappa a = 5`;
  },
  'quantum tunneling: narrow-k packet on a barrier matches packet-averaged analytic T within 0.03': () => {
    const V0 = 1, a = 1.2, sigma = 10;
    const k0 = Math.sqrt(2 * 0.6 * V0);
    const sim = new qt.TunnelSim({ kind: 'barrier', V0, a, x0: -45, k0, sigma, dt: 0.05, absorb: true });
    sim.step(2400);
    const o = sim.observe();
    const pred = qt.packetT(k0, sigma, qt.segments('barrier', V0, a, 1e9));
    close(o.T, pred, 0.03, 'T');
    close(o.norm, 1, 1e-9, 'norm');
    close(o.Rout, 1 - pred, 0.03, 'R (outgoing)');
    return `T sim ${o.T.toFixed(4)}, analytic ${pred.toFixed(4)}, R ${o.Rout.toFixed(4)}`;
  },
  'quantum tunneling: resonant double barrier beats a single barrier': () => {
    const V0 = 1, a = 1.2, sigma = 10;
    const k0 = Math.sqrt(2 * 0.64 * V0);
    const sim = new qt.TunnelSim({ kind: 'double', V0, a, x0: -45, k0, sigma, dt: 0.05, absorb: true });
    sim.step(3200);
    const o = sim.observe();
    const pred = qt.packetT(k0, sigma, qt.segments('double', V0, a, 1e9));
    const single = qt.packetT(k0, sigma, qt.segments('barrier', V0, a, 1e9));
    close(o.T, pred, 0.04, 'T');
    assert(o.T > 0.5 && o.T > single + 0.15, `double ${o.T} vs single ${single}`);
    return `double T ${o.T.toFixed(3)} (analytic ${pred.toFixed(3)}), single barrier ${single.toFixed(3)}`;
  },
};
