import { assert, close } from '../assert.ts';
import * as md from '../../src/topics/maxwells-demon/physics.ts';

type Suite = () => string | void;

const run = (g: md.Gas, time: number) => {
  const steps = Math.round(time / md.H_STEP);
  for (let s = 0; s < steps; s++) md.stepGas(g);
};

export const suites: Record<string, Suite> = {
  'maxwells demon: elastic collisions conserve energy, spheres never overlap': () => {
    const g = md.createGas(600);
    md.initGas(g, { n: 600, T: 1, seed: 11, layout: 'halves', speeds: 'maxwell' });
    g.demon = 'off';
    g.door = 0.2;
    const e0 = md.kinetic(g);
    run(g, 3);
    const drift = Math.abs(md.kinetic(g) - e0) / e0;
    const gap = md.minGap(g);
    assert(g.collisions > 2000, `only ${g.collisions} collisions`);
    assert(drift < 1e-12, `energy drift ${drift}`);
    assert(gap > 1 - 1e-9, `overlap: min distance ${gap} sigma`);
    return `${g.collisions} collisions, drift ${drift.toExponential(1)}, min gap ${gap.toFixed(4)} σ`;
  },

  'maxwells demon: Maxwell-Boltzmann speeds emerge from equal speeds (KS test, 1% level)': () => {
    const n = 800;
    const g = md.createGas(n);
    md.initGas(g, { n, T: 1, seed: 5, layout: 'halves', speeds: 'equal' });
    g.partition = false;
    const speeds = new Float64Array(n);
    const sample = () => { for (let i = 0; i < n; i++) speeds[i] = Math.hypot(g.vx[i], g.vy[i], g.vz[i]); };
    const T = md.temperatureOf(md.kinetic(g), n);
    sample();
    const d0 = md.ksDistance(speeds, (v) => md.mbCdf(v, T));
    run(g, 4);
    sample();
    const d1 = md.ksDistance(speeds, (v) => md.mbCdf(v, T));
    const crit = 1.63 / Math.sqrt(n);
    assert(d0 > 0.3, `start should be far from MB, D=${d0}`);
    assert(d1 < crit, `KS distance ${d1} above 1% critical value ${crit}`);
    // The CDF itself: F(v_mp) for v_mp = sqrt(2T) is erf(1) - 2 e^{-1}/sqrt(pi).
    close(md.mbCdf(Math.SQRT2, 1), 0.8427007929 - (2 * Math.exp(-1)) / Math.sqrt(Math.PI), 2e-7, 'MB CDF at most probable speed');
    return `D: ${d0.toFixed(3)} at start, ${d1.toFixed(4)} after 4 time units (critical ${crit.toFixed(4)})`;
  },

  'maxwells demon: equipartition, each axis gets kT/2 after starting with x-motion only': () => {
    const n = 600;
    const g = md.createGas(n);
    md.initGas(g, { n, T: 1.5, seed: 8, layout: 'halves', speeds: 'xonly' });
    g.partition = false;
    run(g, 3);
    // Average 10 snapshots to beat down sampling noise.
    let sx = 0, sy = 0, sz = 0;
    for (let k = 0; k < 10; k++) {
      run(g, 0.5);
      for (let i = 0; i < n; i++) { sx += g.vx[i] ** 2; sy += g.vy[i] ** 2; sz += g.vz[i] ** 2; }
    }
    sx /= 10; sy /= 10; sz /= 10;
    const T = md.temperatureOf(md.kinetic(g), n);
    // <m v_x^2> = kT for each axis, so <KE> = (3/2) kT.
    const tol = 0.04 * T;
    close(sx / n, T, tol, '<vx^2>');
    close(sy / n, T, tol, '<vy^2>');
    close(sz / n, T, tol, '<vz^2>');
    close(md.kinetic(g) / n, 1.5 * T, 1e-12, 'mean KE');
    return `<vx²>, <vy²>, <vz²> = ${(sx / n).toFixed(3)}, ${(sy / n).toFixed(3)}, ${(sz / n).toFixed(3)} vs kT = ${T.toFixed(3)}`;
  },

  'maxwells demon: mixing entropy equals ln W = ln C(N, N/2) -> N ln 2': () => {
    // Boltzmann count of ways to arrange N/2 of each colour vs the Gibbs formula.
    const N = 2000;
    const lnW = md.lnFactorial(N) - 2 * md.lnFactorial(N / 2);
    const gibbs = md.idealMixing(N / 2, N / 2);
    close(gibbs, N * Math.LN2, 1e-9, 'ideal mixing entropy');
    // Stirling with the next correction: ln C(N, N/2) = N ln2 - (1/2) ln(pi N / 2).
    close(lnW, gibbs - 0.5 * Math.log((Math.PI * N) / 2), 1e-3, 'ln W with Stirling correction');
    // Coarse-grained estimator: 0 when separated, N ln 2 when every cell is 50/50.
    const g = md.createGas(400);
    md.initGas(g, { n: 400, T: 1, seed: 2, layout: 'species', speeds: 'maxwell' });
    const s0 = md.mixingEntropy(g);
    const cells = new Int32Array(32);
    // Relabel colours alternately within each cell, so every cell is as close to 50/50 as possible.
    const seen = new Int32Array(16);
    for (let i = 0; i < g.n; i++) {
      const cx = Math.min(3, Math.floor(((g.x[i] + md.LX) / (2 * md.LX)) * 4));
      const cy = Math.min(1, Math.floor(((g.y[i] + md.LY) / (2 * md.LY)) * 2));
      const cz = Math.min(1, Math.floor(((g.z[i] + md.LZ) / (2 * md.LZ)) * 2));
      const c = (cz * 2 + cy) * 4 + cx;
      g.tag[i] = seen[c]++ % 2;
    }
    let even = true;
    for (let c = 0; c < 16; c++) if (seen[c] % 2) even = false;
    const s1 = md.mixingEntropy(g, 4, 2, 2, cells);
    assert(s0 === 0, `separated state should have zero mixing entropy, got ${s0}`);
    if (even) close(s1, g.n * Math.LN2, 1e-9, 'balanced cells');
    else assert(s1 > 0.99 * g.n * Math.LN2 && s1 <= g.n * Math.LN2 + 1e-9, `nearly balanced cells gave ${s1}`);
    return `ln W = ${lnW.toFixed(2)}, N ln2 = ${gibbs.toFixed(2)}, cells: ${s0} -> ${(s1 / (g.n * Math.LN2)).toFixed(4)} N ln2`;
  },

  'maxwells demon: perfect velocity reversal retraces the run and unmixes the gases': () => {
    const n = 400;
    const g = md.createGas(n);
    md.initGas(g, { n, T: 1, seed: 3, layout: 'species', speeds: 'maxwell' });
    g.partition = false;
    const x0 = Float64Array.from(g.x.subarray(0, n));
    const vx0 = Float64Array.from(g.vx.subarray(0, n));
    run(g, 0.8);
    const mixed = md.mixingEntropy(g) / (n * Math.LN2);
    md.reverseVelocities(g, 0, md.mulberry32(1));
    run(g, 0.8);
    let dx = 0, dv = 0;
    for (let i = 0; i < n; i++) {
      dx = Math.max(dx, Math.abs(g.x[i] - x0[i]));
      dv = Math.max(dv, Math.abs(-g.vx[i] - vx0[i]));
    }
    const back = md.mixingEntropy(g) / (n * Math.LN2);
    assert(mixed > 0.6, `gas did not mix (${mixed})`);
    // Round-off (1e-16) is amplified by chaos at every collision, so allow a little slack.
    assert(dx < 1e-5 && dv < 1e-4, `return error x ${dx}, v ${dv}`);
    assert(back === 0, `not unmixed: ${back}`);
    // With noise 1e-3 the same experiment fails to unmix.
    const h = md.createGas(n);
    md.initGas(h, { n, T: 1, seed: 3, layout: 'species', speeds: 'maxwell' });
    h.partition = false;
    run(h, 0.8);
    md.reverseVelocities(h, 1e-3, md.mulberry32(1));
    run(h, 0.8);
    const noisy = md.mixingEntropy(h) / (n * Math.LN2);
    assert(noisy > 0.3, `noisy reversal unmixed anyway (${noisy})`);
    return `mixed ${mixed.toFixed(2)} -> back ${back}, max error x ${dx.toExponential(1)}, v ${dv.toExponential(1)}. With 1e-3 noise: ${noisy.toFixed(2)}`;
  },

  'maxwells demon: Einstein fluctuations, mean entropy deficit is 1 k_B and P(>s) = e^-s': () => {
    // Equilibrium macrostates of the two halves (N_L, E_L) fluctuate. Einstein: P ∝ e^{ΔS/k}.
    // Two fluctuating variables give a deficit distributed as chi-square(2)/2, i.e. exponential(1).
    const rng = md.mulberry32(9);
    const N = 400;
    const M = 4000;
    let sum = 0;
    let over = 0;
    for (let m = 0; m < M; m++) {
      let nL = 0, eL = 0, nR = 0, eR = 0;
      for (let i = 0; i < N; i++) {
        const e = 0.5 * (md.gaussian(rng) ** 2 + md.gaussian(rng) ** 2 + md.gaussian(rng) ** 2);
        if (rng() < 0.5) { nL++; eL += e; } else { nR++; eR += e; }
      }
      const d = md.entropyDeficit(nL, eL, nR, eR);
      assert(d >= -1e-9, 'deficit must be non-negative');
      sum += d;
      if (d > 2) over++;
    }
    close(sum / M, 1, 0.06, 'mean deficit');
    close(over / M, Math.exp(-2), 0.015, 'P(deficit > 2)');
    return `mean ${(sum / M).toFixed(3)} k_B, P(>2) ${(over / M).toFixed(3)} vs e^-2 = ${Math.exp(-2).toFixed(3)}`;
  },

  'maxwells demon: sorter heats the right side, and the ledger obeys drop <= k ln2 × bits': () => {
    const n = 400;
    const g = md.createGas(n);
    md.initGas(g, { n, T: 1, seed: 2, layout: 'halves', speeds: 'maxwell' });
    g.demon = 'sorter';
    g.door = 0.15;
    const hs = { nL: 0, eL: 0, nR: 0, eR: 0 };
    let worst = Infinity;
    for (let k = 0; k < 20; k++) {
      run(g, 1);
      md.halfStats(g, hs);
      const drop = md.entropyDeficit(hs.nL, hs.eL, hs.nR, hs.eR);
      const info = g.decisions * md.h2(g.opens / Math.max(1, g.decisions));
      // 3 k_B allows for ordinary equilibrium fluctuations (95% level, see Einstein test).
      worst = Math.min(worst, Math.LN2 * info + 3 - drop);
    }
    const TL = md.temperatureOf(hs.eL, hs.nL);
    const TR = md.temperatureOf(hs.eR, hs.nR);
    const drop = md.entropyDeficit(hs.nL, hs.eL, hs.nR, hs.eR);
    assert(TR > 1.2 * TL, `sorter too weak: T_L ${TL}, T_R ${TR}`);
    assert(worst > 0, 'ledger violated');
    assert(drop < Math.LN2 * g.decisions, 'drop exceeds k ln2 per raw bit');
    return `T_L ${TL.toFixed(2)}, T_R ${TR.toFixed(2)}, drop ${drop.toFixed(1)} k_B vs k ln2 × ${g.decisions} bits = ${(Math.LN2 * g.decisions).toFixed(0)} k_B`;
  },
};
