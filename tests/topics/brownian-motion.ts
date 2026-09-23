import { assert, close } from '../assert.ts';
import * as bm from '../../src/topics/brownian-motion/physics.ts';

type Suite = () => string | void;

/** Run an ensemble of n grains from the origin with thermal starts, using log-growing exact steps. */
function ensemble(n: number, tau: number, kTm: number, tEnd: number, seed: number, onSample?: (t: number, msd: number) => void) {
  const rng = new bm.Rng(seed);
  const pos = new Float64Array(3 * n);
  const vel = new Float64Array(3 * n);
  bm.thermalVelocities(vel, n, kTm, rng);
  const k = bm.makeCoeffs();
  let t = 0;
  let next = tau / 50;
  while (t < tEnd) {
    const h = Math.min(Math.max(tau / 50, 0.05 * t), tEnd - t);
    bm.ouCoeffs(h, tau, kTm, k);
    bm.langevinStep(pos, vel, n, k, rng);
    t += h;
    if (onSample && t >= next * (1 - 1e-12)) {
      onSample(t, bm.meanSq(pos, n));
      next *= 10 ** (1 / 20);
    }
  }
  return { pos, vel, t };
}

export const suites: Record<string, Suite> = {
  'brownian: Stokes-Einstein D for a 0.5 um bead in 20 C water is 0.429 um^2/s': () => {
    const D = bm.stokesEinstein(293.15, 1.002e-3, 0.5e-6);
    close(D * 1e12, 0.4286, 0.001, 'D (um^2/s)');
    const NAback = bm.avogadroFromD(293.15, 1.002e-3, 0.5e-6, D);
    close(NAback / bm.NA, 1, 1e-12, 'Perrin round trip');
    return `D=${(D * 1e12).toFixed(4)} um²/s`;
  },
  'brownian: seeded Langevin ensemble gives D = kT/gamma within 5%': () => {
    // kT = 1, gamma = 2, m = 1  ->  tau = 0.5, D = 0.5
    const kT = 1;
    const gamma = 2;
    const m = 1;
    const tau = m / gamma;
    const tEnd = 400 * tau;
    const { pos } = ensemble(4000, tau, kT / m, tEnd, 7);
    const msd = bm.meanSq(pos, 4000);
    const Dm = msd / (6 * (tEnd - tau * (1 - Math.exp(-tEnd / tau))));
    const D = kT / gamma;
    assert(Math.abs(Dm / D - 1) < 0.05, `D measured ${Dm}, expected ${D}`);
    return `D=${Dm.toFixed(4)} vs ${D} (${((Dm / D - 1) * 100).toFixed(1)}%)`;
  },
  'brownian: equipartition <v^2> = 3kT/m reached from rest': () => {
    const rng = new bm.Rng(11);
    const n = 5000;
    const pos = new Float64Array(3 * n);
    const vel = new Float64Array(3 * n); // start at rest, far from equilibrium
    const kTm = 2.5;
    const tau = 1.3;
    const k = bm.ouCoeffs(0.1 * tau, tau, kTm, bm.makeCoeffs());
    for (let i = 0; i < 300; i++) bm.langevinStep(pos, vel, n, k, rng);
    let v2 = 0;
    for (let j = 0; j < 3 * n; j++) v2 += vel[j] * vel[j];
    v2 /= n;
    const ratio = v2 / (3 * kTm);
    assert(Math.abs(ratio - 1) < 0.03, `<v²>/(3kT/m) = ${ratio}`);
    return `<v²>/(3kT/m) = ${ratio.toFixed(4)}`;
  },
  'brownian: MSD follows Ornstein and the slope 2 -> 1 crossover scales with m/gamma': () => {
    const u15 = (() => {
      // Solve msdLogSlope(u) = 1.5 by bisection.
      let lo = 0.01;
      let hi = 100;
      for (let i = 0; i < 80; i++) {
        const mid = Math.sqrt(lo * hi);
        if (bm.msdLogSlope(mid, 1) > 1.5) lo = mid;
        else hi = mid;
      }
      return Math.sqrt(lo * hi);
    })();
    const cross: number[] = [];
    let worst = 0;
    for (const [tau, seed] of [[1, 3], [4, 5]] as const) {
      const kTm = 1 / tau; // kT = 1, gamma = 1, m = tau
      const ts: number[] = [];
      const ys: number[] = [];
      ensemble(3000, tau, kTm, 1000 * tau, seed, (t, msd) => {
        ts.push(t);
        ys.push(msd);
        worst = Math.max(worst, Math.abs(msd / bm.msdOrnstein(t, tau, kTm) - 1));
      });
      // Local slope from a least-squares fit over a quarter decade either side.
      const T = Float64Array.from(ts);
      const Y = Float64Array.from(ys);
      let tc = NaN;
      for (let i = 0; i < ts.length; i++) {
        const s = bm.logSlope(T, Y, ts.length, ts[i] / 1.8, ts[i] * 1.8);
        if (s < 1.5) {
          tc = ts[i];
          break;
        }
      }
      cross.push(tc);
    }
    assert(worst < 0.08, `MSD deviates from Ornstein by ${worst}`);
    close(cross[0] / 1, u15, 0.2 * u15, 'crossover t/tau (tau=1)');
    close(cross[1] / 4, u15, 0.2 * u15, 'crossover t/tau (tau=4)');
    close(cross[1] / cross[0], 4, 0.6, 'crossover ratio');
    return `t½ = ${cross[0].toFixed(2)}τ and ${(cross[1] / 4).toFixed(2)}τ, theory ${u15.toFixed(2)}τ, worst MSD dev ${(worst * 100).toFixed(1)}%`;
  },
  'brownian: displacements are Gaussian with variance 2Dt per axis': () => {
    const n = 4000;
    const tau = 1;
    const kTm = 1;
    const tEnd = 50;
    const { pos } = ensemble(n, tau, kTm, tEnd, 21);
    const varTh = (bm.msdOrnstein(tEnd, tau, kTm) / 3);
    let m2 = 0;
    let m4 = 0;
    for (let j = 0; j < 3 * n; j++) {
      const x2 = pos[j] * pos[j];
      m2 += x2;
      m4 += x2 * x2;
    }
    m2 /= 3 * n;
    m4 /= 3 * n;
    const kurt = m4 / (m2 * m2) - 3;
    // Kolmogorov-Smirnov distance against the normal CDF.
    const z = Array.from(pos.subarray(0, 3 * n), (x) => x / Math.sqrt(varTh)).sort((a, b) => a - b);
    const erf = (x: number) => {
      const t = 1 / (1 + 0.3275911 * Math.abs(x));
      const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
      return x >= 0 ? y : -y;
    };
    let ks = 0;
    for (let i = 0; i < z.length; i++) {
      const F = 0.5 * (1 + erf(z[i] / Math.SQRT2));
      ks = Math.max(ks, Math.abs(F - i / z.length), Math.abs(F - (i + 1) / z.length));
    }
    const ksCrit = 1.63 / Math.sqrt(z.length); // 1% level
    assert(Math.abs(m2 / varTh - 1) < 0.05, `variance ratio ${m2 / varTh}`);
    assert(Math.abs(kurt) < 0.15, `excess kurtosis ${kurt}`);
    assert(ks < ksCrit, `KS ${ks} > ${ksCrit}`);
    return `var ratio ${(m2 / varTh).toFixed(3)}, kurtosis ${kurt.toFixed(3)}, KS ${ks.toFixed(4)}`;
  },
  'brownian: micro gas model conserves energy and shares it equally with the grain': () => {
    const rng = new bm.Rng(5);
    const s = bm.createMicro(600);
    const kT = 4;
    bm.initMicro(s, 600, kT, 1.2, 25, 0.1, rng);
    const e0 = bm.microGasKE(s) + bm.microGrainKE(s);
    const h = 1 / 240;
    let sumG = 0;
    let sumM = 0;
    let n = 0;
    for (let i = 0; i < 240 * 600; i++) {
      bm.microStep(s, h);
      if (i > 240 * 20 && i % 8 === 0) {
        sumG += bm.microGrainKE(s);
        sumM += bm.microGasKE(s) / s.n;
        n++;
      }
    }
    const e1 = bm.microGasKE(s) + bm.microGrainKE(s);
    close(e1 / e0, 1, 1e-9, 'energy');
    const ratio = sumG / sumM;
    assert(Math.abs(ratio - 1) < 0.2, `grain KE / molecule KE = ${ratio}`);
    return `KE ratio ${ratio.toFixed(3)}, ${s.kickTotal} kicks, energy drift ${(e1 / e0 - 1).toExponential(1)}`;
  },
};
