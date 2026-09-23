import { assert, close } from '../assert.ts';
import { PC, Percolation, medianSpan, type Dim, type Mode } from '../../src/topics/percolation/physics.ts';

type Suite = () => string | void;

/** True when two labellings describe the same partition of the occupied sites. */
function samePartition(a: Int32Array, b: Int32Array): boolean {
  const ab = new Map<number, number>();
  const ba = new Map<number, number>();
  for (let i = 0; i < a.length; i++) {
    if ((a[i] < 0) !== (b[i] < 0)) return false;
    if (a[i] < 0) continue;
    const x = ab.get(a[i]);
    const y = ba.get(b[i]);
    if (x === undefined && y === undefined) {
      ab.set(a[i], b[i]);
      ba.set(b[i], a[i]);
    } else if (x !== b[i] || y !== a[i]) return false;
  }
  return true;
}

const CASES: [Dim, number, Mode][] = [[2, 40, 'site'], [2, 40, 'bond'], [3, 12, 'site'], [3, 12, 'bond']];

export const suites: Record<string, Suite> = {
  'percolation: union-find clusters equal brute-force BFS clusters (2D/3D, site/bond)': () => {
    let checks = 0;
    for (const [dim, L, mode] of CASES) {
      for (const seed of [1, 2, 3]) {
        const P = new Percolation(dim, L, mode, seed);
        for (const p of [0.1, 0.25, 0.3116, 0.45, 0.5, 0.5927, 0.7, 0.95]) {
          P.label(p);
          const bfs = P.bfsLabels(p);
          assert(samePartition(P.root, bfs), `${dim}D ${mode} L=${L} seed ${seed} p=${p}: partitions differ`);
          // Spanning flag against BFS: some BFS cluster touches both y = 0 and y = L-1.
          const top = new Set<number>();
          for (let i = 0; i < P.N; i++) if (bfs[i] >= 0 && P.coord(i, 1) === 0) top.add(bfs[i]);
          let span = false;
          for (let i = 0; i < P.N; i++) if (bfs[i] >= 0 && P.coord(i, 1) === L - 1 && top.has(bfs[i])) span = true;
          assert(span === P.stats.spanning, `${dim}D ${mode} p=${p}: spanning ${P.stats.spanning} vs BFS ${span}`);
          checks++;
        }
      }
    }
    return `${checks} labellings matched`;
  },
  'percolation: cluster sizes sum to the occupied count, and the swept P_inf curve matches direct labelling': () => {
    let worst = 0;
    for (const [dim, L, mode] of CASES) {
      const P = new Percolation(dim, L, mode, 17);
      const K = Percolation.CURVE_N;
      for (let k = 0; k < K; k += 8) {
        const p = k / (K - 1);
        const st = P.label(p);
        assert(st.sizeSum === st.occupied, `${dim}D ${mode} p=${p}: sum of sizes ${st.sizeSum} vs occupied ${st.occupied}`);
        if (mode === 'bond') assert(st.occupied === P.N, 'bond mode: every site belongs to a cluster');
        worst = Math.max(worst, Math.abs(st.Pinf - P.curve[k]));
      }
      // Spanning appears exactly at the recorded pSpan.
      assert(!P.label(P.pSpan).spanning, 'not spanning just below pSpan');
      assert(P.label(P.pSpan + 1e-6).spanning, 'spanning just above pSpan');
    }
    assert(worst < 1e-6, `curve mismatch (float32 storage) ${worst}`);
    const full = new Percolation(3, 10, 'site', 5).label(1.0001);
    close(full.Pinf, 1, 0, 'P_inf at p = 1');
  },
  'percolation: spanning probability crosses 1/2 near p_c (2D site 0.592746, 3D site 0.3116)': () => {
    const m2 = medianSpan(2, 64, 'site', 41, 100);
    close(m2, PC.site2, 0.015, '2D site median spanning point, L = 64');
    const m3 = medianSpan(3, 16, 'site', 41, 200);
    close(m3, PC.site3, 0.02, '3D site median spanning point, L = 16');
    assert(m3 < m2 - 0.2, 'p_c(3D) well below p_c(2D)');
    return `2D ${m2.toFixed(4)}, 3D ${m3.toFixed(4)}`;
  },
  'percolation: 2D bond spanning point sits at the exact threshold 1/2': () => {
    const m = medianSpan(2, 64, 'bond', 41, 300);
    close(m, PC.bond2, 0.012, '2D bond median spanning point, L = 64');
    return `median ${m.toFixed(4)}`;
  },
  'percolation: largest cluster at p_c is fractal, mass ~ L^(91/48) in 2D': () => {
    const Ls = [16, 32, 64, 128];
    const xs: number[] = [];
    const ys: number[] = [];
    for (const L of Ls) {
      let m = 0;
      const S = 80;
      for (let s = 0; s < S; s++) m += new Percolation(2, L, 'site', 1000 + 13 * s + L).label(PC.site2).largest;
      xs.push(Math.log(L));
      ys.push(Math.log(m / S));
    }
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b) / n;
    const my = ys.reduce((a, b) => a + b) / n;
    let sxy = 0;
    let sxx = 0;
    for (let k = 0; k < n; k++) {
      sxy += (xs[k] - mx) * (ys[k] - my);
      sxx += (xs[k] - mx) ** 2;
    }
    const D = sxy / sxx;
    close(D, 91 / 48, 0.08, 'fractal dimension');
    return `D = ${D.toFixed(3)} (exact 1.896)`;
  },
};
