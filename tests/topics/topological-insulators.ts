import { assert, close } from '../assert.ts';
import * as ti from '../../src/topics/topological-insulators/physics.ts';

type Suite = () => string | void;

export const suites: Record<string, Suite> = {
  'SSH: winding number is 1 for v < w and 0 for v > w': () => {
    for (const r of [0.05, 0.3, 0.6, 0.95]) {
      const nu = ti.sshWindingRaw(r, 1);
      close(nu, 1, 1e-9, `winding at v/w=${r}`);
    }
    for (const r of [1.05, 1.5, 3, 10]) {
      const nu = ti.sshWindingRaw(r, 1);
      close(nu, 0, 1e-9, `winding at v/w=${r}`);
    }
    return 'ν = 1 below v = w, 0 above';
  },
  'SSH: bulk gap equals 2|v - w| and closes at v = w (at k = π)': () => {
    for (const r of [0.2, 0.7, 1.3, 2]) close(ti.sshGap(r, 1), 2 * Math.abs(r - 1), 1e-6, `gap at v/w=${r}`);
    close(ti.sshGap(1, 1), 0, 1e-6, 'gap at v = w');
    close(ti.sshEnergy(1, 1, Math.PI), 0, 1e-12, 'E(π) at v = w');
    return `gap(v=w) = ${ti.sshGap(1, 1).toExponential(1)}`;
  },
  'SSH chain: two near-zero modes that shrink as (v/w)^N, none in the trivial phase': () => {
    const r = 0.5;
    const eps: number[] = [];
    for (let N = 6; N <= 14; N++) {
      const s = ti.sshChainSpectrum(ti.sshChainMatrix(N, r, 1), N);
      eps.push(s.edgeE);
      // the two levels closest to zero are a ± pair
      close(s.values[s.i0] + s.values[s.i1], 0, 1e-12, 'chiral ± pair');
      // every other level stays out in the bulk bands, |E| ≥ |v - w|
      for (let i = 0; i < 2 * N; i++) if (i !== s.i0 && i !== s.i1) assert(Math.abs(s.values[i]) > 0.49, `bulk level ${s.values[i]}`);
    }
    for (let i = 1; i < eps.length; i++) close(eps[i] / eps[i - 1], r, 0.01, `splitting ratio N=${6 + i}`);
    const triv = ti.sshChainSpectrum(ti.sshChainMatrix(14, 1.5, 1), 14);
    assert(triv.edgeE > 0.4, `trivial chain has a level near 0: ${triv.edgeE}`);
    return `ε(14) = ${eps[eps.length - 1].toExponential(2)}, ratio → v/w`;
  },
  'SSH chain: end-site weight of the edge state is 1 - (v/w)^2 (analytic zero mode)': () => {
    const N = 40;
    for (const r of [0.3, 0.6]) {
      const s = ti.sshChainSpectrum(ti.sshChainMatrix(N, r, 1), N);
      // density[] is the mean of the two modes, each split equally between both ends
      close(2 * s.density[0], 1 - r * r, 1e-6, `left end weight at v/w=${r}`);
      close(2 * s.density[2 * N - 1], 1 - r * r, 1e-6, `right end weight at v/w=${r}`);
      assert(s.density[1] < 1e-12, 'no weight on B sublattice at the left end');
    }
    return 'weight on A₁ = 1 - (v/w)², zero on B₁';
  },
  'SSH chain: bond disorder keeps the zero modes (chiral symmetry)': () => {
    const N = 30;
    const noise = ti.randomUnit(7, new Float64Array(2 * N));
    const s = ti.sshChainSpectrum(ti.sshChainMatrix(N, 0.5, 1, 0.4, noise), N);
    assert(s.edgeE < 1e-6, `edge energy ${s.edgeE}`);
    assert(s.edgeWeight > 0.8, `edge weight ${s.edgeWeight}`);
    return `|E| = ${s.edgeE.toExponential(1)}, edge weight ${s.edgeWeight.toFixed(3)}`;
  },
  'Eigen solvers: Jacobi and Householder-QL agree, residuals at machine precision': () => {
    const n = 24;
    const rnd = ti.randomUnit(3, new Float64Array(n * n));
    const A = new Float64Array(n * n);
    for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) { A[i * n + j] = rnd[i * n + j]; A[j * n + i] = rnd[i * n + j]; }
    const a = ti.jacobiEigen(A, n);
    const b = new ti.SymEigen(n).solve(A);
    let diff = 0;
    for (let i = 0; i < n; i++) diff = Math.max(diff, Math.abs(a.values[i] - b.values[i]));
    assert(diff < 1e-12, `eigenvalue mismatch ${diff}`);
    const ra = ti.eigenResidual(A, a);
    const rb = ti.eigenResidual(A, b);
    assert(ra < 1e-12 && rb < 1e-12, `residuals ${ra} ${rb}`);
    return `max Δλ ${diff.toExponential(1)}, residuals ${ra.toExponential(1)} / ${rb.toExponential(1)}`;
  },
  'QWZ: Fukui–Hatsugai Chern number is an integer, ±1 for 0 < |u| < 2 and 0 for |u| > 2': () => {
    const out: string[] = [];
    for (const u of [-3, -2.5, -1.5, -0.5, 0.5, 1, 1.5, 2.5, 3]) {
      const c = ti.chernFHS(u, 20);
      close(c, Math.round(c), 1e-9, `integer at u=${u}`);
      const expect = Math.abs(u) > 2 ? 0 : Math.sign(u);
      close(c, expect, 1e-9, `C at u=${u}`);
      out.push(`${u}:${Math.round(c)}`);
    }
    return out.join(' ');
  },
  'QWZ: Chern number matches the degree of the map k → d/|d| (solid angle / 4π)': () => {
    for (const u of [-1.2, 0.7, 2.6]) {
      const c = ti.chernFHS(u, 20);
      const deg = ti.qwzSkyrmion(u, 60);
      close(deg, Math.round(deg), 1e-6, `degree integer at u=${u}`);
      close(c, -deg, 1e-6, `C = -degree at u=${u}`);
    }
    return 'lower-band C = -deg(d̂)';
  },
  'QWZ ribbon: chiral edge modes cross the gap only in the Chern phase': () => {
    const R = new ti.QWZRibbon(16, 81);
    R.compute(1);
    const top = R.edgeSummary(ti.qwzGap(1));
    assert(top.nL > 5 && top.nR > 5, `edge states ${top.nL} ${top.nR}`);
    assert(top.velL === -top.velR && top.velL !== 0, 'opposite edges move in opposite directions');
    R.compute(3);
    const triv = R.edgeSummary(ti.qwzGap(3));
    assert(triv.nL === 0 && triv.nR === 0, `trivial phase has in-gap states ${triv.nL} ${triv.nR}`);
    return `u=1: ${top.nL}+${top.nR} in-gap edge points, u=3: none`;
  },
};
