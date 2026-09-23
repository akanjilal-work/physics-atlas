import { assert, close } from '../assert.ts';
import * as en from '../../src/topics/entanglement/physics.ts';

type Suite = () => string | void;

const DEG = Math.PI / 180;

export const suites: Record<string, Suite> = {
  'entanglement: analytic CHSH at optimal angles is 2√2 and no grid point beats Tsirelson': () => {
    const S = en.chsh(en.quantumE, en.OPTIMAL);
    close(Math.abs(S), 2 * Math.SQRT2, 1e-12, '|S| at optimal angles');
    let best = 0;
    for (let a = 0; a < 360; a += 15)
      for (let a2 = 0; a2 < 360; a2 += 15)
        for (let b = 0; b < 360; b += 7.5)
          for (let b2 = 0; b2 < 360; b2 += 7.5) {
            const v = Math.abs(en.chsh(en.quantumE, { a: a * DEG, a2: a2 * DEG, b: b * DEG, b2: b2 * DEG }));
            if (v > best) best = v;
          }
    assert(best <= 2 * Math.SQRT2 + 1e-12, `grid max ${best} exceeds 2√2`);
    close(best, 2 * Math.SQRT2, 1e-12, 'grid max reaches 2√2');
    return `|S| = ${Math.abs(S).toFixed(6)}, grid max ${best.toFixed(6)}`;
  },
  'entanglement: local hidden-variable S never exceeds 2 (grid) and hits 2 at optimal angles': () => {
    let best = 0;
    for (let a = 0; a < 360; a += 15)
      for (let a2 = 0; a2 < 360; a2 += 15)
        for (let b = 0; b < 360; b += 7.5)
          for (let b2 = 0; b2 < 360; b2 += 7.5) {
            const v = Math.abs(en.chsh(en.lhvE, { a: a * DEG, a2: a2 * DEG, b: b * DEG, b2: b2 * DEG }));
            if (v > best) best = v;
          }
    assert(best <= 2 + 1e-12, `LHV grid max ${best}`);
    close(Math.abs(en.chsh(en.lhvE, en.OPTIMAL)), 2, 1e-12, 'LHV |S| at optimal angles');
    // The closed form lhvE must match the sampled model it describes.
    const rnd = en.mulberry32(7);
    const out = [0, 0];
    let worst = 0;
    for (const d of [0, 30, 45, 90, 135, 180]) {
      const n = 40000;
      let sum = 0;
      for (let i = 0; i < n; i++) {
        en.samplePair('lhv', 0, d * DEG, 2 * Math.PI * rnd(), rnd, out);
        sum += out[0] * out[1];
      }
      const e = sum / n;
      const ana = en.lhvE(0, d * DEG);
      const sig = Math.sqrt(Math.max(1e-6, 1 - ana * ana) / n);
      worst = Math.max(worst, Math.abs(e - ana) / sig);
      assert(Math.abs(e - ana) < 4 * sig + 1e-9, `LHV Δ=${d}°: sampled ${e}, analytic ${ana}`);
    }
    return `grid max ${best.toFixed(6)}, sampled vs closed form within ${worst.toFixed(1)}σ`;
  },
  'entanglement: sampled singlet correlations converge to -cos(a-b)': () => {
    const rnd = en.mulberry32(2022);
    const out = [0, 0];
    let worst = 0;
    for (const [a, b] of [[0, 0], [0, 45], [30, 90], [0, 90], [10, 160], [0, 180], [200, 20]]) {
      const n = 60000;
      let sum = 0;
      for (let i = 0; i < n; i++) {
        en.samplePair('quantum', a * DEG, b * DEG, 0, rnd, out);
        sum += out[0] * out[1];
      }
      const e = sum / n;
      const ana = -Math.cos((a - b) * DEG);
      const sig = Math.sqrt(Math.max(1e-6, 1 - ana * ana) / n);
      worst = Math.max(worst, Math.abs(e - ana) / sig);
      assert(Math.abs(e - ana) < 4 * sig + 1e-9, `(${a}°, ${b}°): sampled ${e}, expected ${ana}`);
    }
    // Full randomised Bell test: sampled S lands within 4σ of -2√2.
    const t = new en.Tally();
    en.runExperiment('quantum', en.OPTIMAL, 200000, rnd, t);
    const S = t.S();
    const sS = t.sigmaS();
    assert(Math.abs(S + 2 * Math.SQRT2) < 4 * sS, `S = ${S} ± ${sS}`);
    return `worst ${worst.toFixed(1)}σ, S = ${S.toFixed(3)} ± ${sS.toFixed(3)}`;
  },
  'entanglement: marginals are 1/2 for every setting (no signalling)': () => {
    const p = new Float64Array(4);
    for (const model of ['quantum', 'lhv'] as const) {
      for (let d = -180; d <= 180; d += 5) {
        en.jointProbs(model, 0, d * DEG, p);
        close(p[0] + p[1] + p[2] + p[3], 1, 1e-12, 'normalisation');
        close(p[0] + p[1], 0.5, 1e-12, `${model} P(A=+) at Δ=${d}°`);
        close(p[0] + p[2], 0.5, 1e-12, `${model} P(B=+) at Δ=${d}°`);
        close(p[0] - p[1] - p[2] + p[3], en.correlation(model, 0, d * DEG), 1e-12, `${model} E from joint probs`);
      }
    }
    // Sampled: Alice's P(+) given each of Bob's settings stays at 1/2.
    const rnd = en.mulberry32(91);
    const worst: number[] = [];
    for (const model of ['quantum', 'lhv'] as const) {
      const t = new en.Tally();
      en.runExperiment(model, { a: 0, a2: 20 * DEG, b: 10 * DEG, b2: 100 * DEG }, 80000, rnd, t);
      for (const bp of [false, true]) {
        const n = t.countBob(bp);
        const pa = t.pAliceUpGivenBob(bp);
        const sig = 0.5 / Math.sqrt(n);
        worst.push(Math.abs(pa - 0.5) / sig);
        assert(Math.abs(pa - 0.5) < 4 * sig, `${model}: P(A=+|bob ${bp ? "b'" : 'b'}) = ${pa}`);
      }
      assert(Math.abs(t.pBobUp() - 0.5) < 4 * 0.5 / Math.sqrt(t.n), `${model}: P(B=+) = ${t.pBobUp()}`);
    }
    return `worst conditional marginal ${Math.max(...worst).toFixed(1)}σ from 0.5`;
  },
  'entanglement: tally error bar matches the scatter of repeated runs': () => {
    const rnd = en.mulberry32(1982);
    const runs = 400;
    const n = 2000;
    const vals: number[] = [];
    let sigSum = 0;
    for (let r = 0; r < runs; r++) {
      const t = new en.Tally();
      en.runExperiment('quantum', en.OPTIMAL, n, rnd, t);
      vals.push(t.S());
      sigSum += t.sigmaS();
    }
    const mean = vals.reduce((x, y) => x + y, 0) / runs;
    const sd = Math.sqrt(vals.reduce((x, y) => x + (y - mean) ** 2, 0) / (runs - 1));
    const sig = sigSum / runs;
    // Expected spread: σ_E² = (1 - 1/2)/(n/4) per term, so σ_S = sqrt(8/n) ≈ 0.063 at n = 2000.
    close(sig, Math.sqrt(8 / n), 0.004, 'mean reported σ_S');
    assert(Math.abs(sd / sig - 1) < 0.15, `scatter ${sd} vs reported ${sig}`);
    close(mean, -2 * Math.SQRT2, 4 * sd / Math.sqrt(runs), 'mean S');
    return `scatter ${sd.toFixed(4)}, reported σ ${sig.toFixed(4)}`;
  },
};
