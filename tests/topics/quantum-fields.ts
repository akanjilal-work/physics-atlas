import { assert, close } from '../assert.ts';
import * as qf from '../../src/topics/quantum-fields/physics.ts';

type Suite = () => string | void;

export const suites: Record<string, Suite> = {
  'quantum fields: lattice dispersion matches numerical normal modes (8x8, Jacobi)': () => {
    const N = 8;
    const a = 0.5;
    const m = 0.7;
    const n = N * N;
    const ev = qf.symmetricEigenvalues(qf.dynamicalMatrix(N, a, m), n);
    const num = Array.from(ev).sort((x, y) => x - y);
    const ana: number[] = [];
    for (let jy = 0; jy < N; jy++) for (let jx = 0; jx < N; jx++) ana.push(qf.omegaLattice(qf.kOf(jx, N, a), qf.kOf(jy, N, a), m, a) ** 2);
    ana.sort((x, y) => x - y);
    let worst = 0;
    for (let i = 0; i < n; i++) worst = Math.max(worst, Math.abs(num[i] - ana[i]));
    assert(worst < 1e-9, `max |omega^2 difference| ${worst}`);
    // Continuum limit: small k a recovers Klein-Gordon omega^2 = m^2 + k^2
    const w = qf.omegaLattice(0.3, 0.4, 1.2, 1e-3);
    close(w, Math.sqrt(1.44 + 0.25), 1e-6, 'continuum limit');
    return `64 modes, max error ${worst.toExponential(1)}`;
  },
  'quantum fields: simulated packet speed matches group velocity d omega/dk': () => {
    const N = 128;
    const a = 24 / N;
    const out: string[] = [];
    for (const [m, k0] of [[1, 1.5], [0, 1.5], [2, 1]]) {
      const p = { N, a, m, g: 0 };
      const f = qf.makeTwoField(N);
      const s = qf.makeScratch(N);
      qf.addPacket(f, p, -6, 0, k0, 2, 1, 1, s, new Float64Array(N * N), new Float64Array(N * N), 2.4);
      const e = new Float64Array(N * N);
      qf.energyDensity(f, p, e);
      let c = qf.centroidX(e, N, a, -6);
      const c0 = c;
      const vg = qf.groupVelocityLattice(k0, m, a);
      const h = 0.04;
      let t = 0;
      while (t < 8 / vg) {
        qf.step(f, p, h);
        t += h;
        qf.energyDensity(f, p, e);
        c = qf.centroidX(e, N, a, c);
      }
      const v = (c - c0) / t;
      assert(Math.abs(v / vg - 1) < 0.03, `m=${m} k=${k0}: measured ${v}, group velocity ${vg}`);
      out.push(`m=${m}: ${v.toFixed(3)} vs ${vg.toFixed(3)}`);
    }
    // Massless and long-wavelength: v -> c
    close(qf.groupVelocityLattice(0.2, 0, 0.05), 1, 1e-3, 'massless v');
    return out.join(', ');
  },
  'quantum fields: velocity Verlet conserves energy (coupled fields, 3000 steps)': () => {
    const N = 64;
    const a = 0.25;
    const p = { N, a, m: 0.8, g: 0.3 };
    const f = qf.makeTwoField(N);
    const s = qf.makeScratch(N);
    qf.addPacket(f, p, 0, 0, 2, 1.5, 1, 1, s, new Float64Array(N * N), new Float64Array(N * N));
    qf.addPluck(f, p, 3, 3, 0.6, 0.4);
    const e0 = qf.energy(f, p);
    let worst = 0;
    for (let i = 0; i < 3000; i++) {
      qf.step(f, p, 0.04);
      if (i % 100 === 0) worst = Math.max(worst, Math.abs(qf.energy(f, p) / e0 - 1));
    }
    const drift = Math.abs(qf.energy(f, p) / e0 - 1);
    worst = Math.max(worst, drift);
    assert(worst < 2e-3, `relative energy error ${worst}`);
    return `max relative error ${worst.toExponential(1)}, final ${drift.toExponential(1)}`;
  },
  'quantum fields: ground-state variance per mode is hbar/2omega (and <p^2> = hbar omega/2)': () => {
    const N = 16;
    const a = 0.5;
    const p = { N, a, m: 0.9, g: 0 };
    const f = qf.makeTwoField(N);
    const s = qf.makeScratch(N);
    const tmp = [0, 1, 2, 3].map(() => new Float64Array(N * N));
    const r = qf.rng(7);
    const modes: [number, number][] = [[1, 0], [0, 3], [2, 5], [4, 4], [7, 1], [3, 6]];
    const sumQ = new Float64Array(modes.length);
    const sumP = new Float64Array(modes.length);
    const S = 3000;
    for (let k = 0; k < S; k++) {
      qf.sampleVacuum(f, p, 1, r, s, tmp);
      modes.forEach(([jx, jy], i) => {
        const q = qf.cosModeCoord(f.phiA, N, a, jx, jy);
        const pp = qf.cosModeCoord(f.piA, N, a, jx, jy);
        sumQ[i] += q * q;
        sumP[i] += pp * pp;
      });
    }
    let worst = 0;
    modes.forEach(([jx, jy], i) => {
      const w = qf.omegaLattice(qf.kOf(jx, N, a), qf.kOf(jy, N, a), p.m, a);
      const rq = sumQ[i] / S / (1 / (2 * w));
      const rp = sumP[i] / S / (w / 2);
      worst = Math.max(worst, Math.abs(rq - 1), Math.abs(rp - 1));
    });
    // statistical error for a variance from 3000 samples: sqrt(2/3000) ~ 2.6 %
    assert(worst < 0.1, `worst variance ratio error ${worst}`);
    return `6 modes x 3000 samples, worst deviation ${(worst * 100).toFixed(1)}%`;
  },
  'quantum fields: toy coupling transfers a mode fully at t = pi/(omega_D - omega_S)': () => {
    const N = 32;
    const a = 0.5;
    const p = { N, a, m: 1, g: 0.2 };
    const f = qf.makeTwoField(N);
    const jx = 3;
    const k = qf.kOf(jx, N, a);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) f.phiA[y * N + x] = Math.cos(k * qf.siteX(x, N, a));
    const wS = qf.omegaLattice(k, 0, 1, a);
    const wD = qf.omegaLattice(k, 0, Math.sqrt(1 + 2 * p.g), a);
    const T = Math.PI / (wD - wS);
    const h = 0.01;
    const steps = Math.round(T / h);
    const e = new Float64Array(2);
    for (let i = 0; i < steps; i++) qf.step(f, p, h);
    qf.fieldEnergies(f, p, e);
    const fracB = e[1] / (e[0] + e[1]);
    assert(fracB > 0.95, `fraction in B ${fracB}`);
    return `T=${T.toFixed(2)}, fraction in field B ${fracB.toFixed(3)}`;
  },
  'quantum fields: a launched packet carries exactly one quantum, energy ~ hbar omega_k': () => {
    const N = 64;
    const a = 0.25;
    const p = { N, a, m: 1, g: 0 };
    const f = qf.makeTwoField(N);
    const s = qf.makeScratch(N);
    qf.addPacket(f, p, 0, 0, 1.5, 2.5, 1, 1, s, new Float64Array(N * N), new Float64Array(N * N));
    const nq = qf.modeQuanta(f.phiA, f.piA, p, 1, s);
    close(nq, 1, 1e-9, 'quanta');
    const E = qf.energy(f, p);
    const w = qf.omegaLattice(1.5, 0, 1, a);
    close(E / w, 1, 0.05, 'E / hbar omega (packet has a spread of k, so E is the average hbar omega)');
    return `N=${nq.toFixed(6)}, E/hbar omega_k0 = ${(E / w).toFixed(4)}`;
  },
};
